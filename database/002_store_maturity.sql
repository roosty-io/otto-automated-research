-- PPME Database Schema - Migration 002
-- Store Maturity System

-- =============================================================================
-- STORE MATURITY ENUM
-- =============================================================================

CREATE TYPE store_maturity AS ENUM ('new', 'establishing', 'growing', 'mature', 'seasoned');

-- =============================================================================
-- STORE MATURITY TIERS
-- =============================================================================

CREATE TABLE store_maturity_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    maturity_level store_maturity NOT NULL UNIQUE,
    min_days INTEGER NOT NULL,
    max_days INTEGER, -- NULL for seasoned (unlimited)
    velocity_multiplier DECIMAL(3,2) NOT NULL, -- 0.40 = 40%
    daily_cap INTEGER NOT NULL,
    monthly_cap INTEGER NOT NULL,
    profit_target_percentage DECIMAL(3,2) NOT NULL, -- 0.30 = 30% of tier target
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert maturity tier configuration
INSERT INTO store_maturity_tiers (maturity_level, min_days, max_days, velocity_multiplier, daily_cap, monthly_cap, profit_target_percentage) VALUES
    ('new', 0, 14, 0.40, 150, 2000, 0.30),
    ('establishing', 15, 30, 0.60, 200, 4000, 0.50),
    ('growing', 31, 60, 0.80, 250, 6000, 0.70),
    ('mature', 61, 90, 0.95, 300, 8000, 0.85),
    ('seasoned', 91, NULL, 1.00, 500, 10000, 1.00);

-- =============================================================================
-- ADD MATURITY COLUMNS TO STORES
-- =============================================================================

ALTER TABLE stores
    ADD COLUMN maturity store_maturity NOT NULL DEFAULT 'new',
    ADD COLUMN maturity_updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX idx_stores_maturity ON stores(maturity);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Calculate effective limits based on store maturity
CREATE OR REPLACE FUNCTION calculate_store_effective_limits(p_store_id UUID)
RETURNS TABLE (
    effective_floor INTEGER,
    effective_ceiling INTEGER,
    daily_cap INTEGER,
    monthly_cap INTEGER,
    velocity_multiplier DECIMAL(3,2),
    profit_target DECIMAL(10,2)
) AS $$
DECLARE
    v_tier RECORD;
    v_maturity RECORD;
    v_store RECORD;
BEGIN
    -- Get store info
    SELECT s.*, t.*
    INTO v_store
    FROM stores s
    JOIN store_tiers t ON s.tier_id = t.id
    WHERE s.id = p_store_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found: %', p_store_id;
    END IF;

    -- Get maturity tier
    SELECT * INTO v_maturity
    FROM store_maturity_tiers
    WHERE maturity_level = v_store.maturity;

    -- Calculate effective limits
    effective_floor := ROUND(v_store.min_active_listings * v_maturity.velocity_multiplier);
    effective_ceiling := LEAST(
        v_maturity.monthly_cap,
        ROUND(v_store.max_total_listings * v_maturity.velocity_multiplier)
    );
    daily_cap := v_maturity.daily_cap;
    monthly_cap := v_maturity.monthly_cap;
    velocity_multiplier := v_maturity.velocity_multiplier;
    profit_target := ROUND(v_store.target_monthly_profit * v_maturity.profit_target_percentage, 2);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update store maturity based on days active
CREATE OR REPLACE FUNCTION update_store_maturity(p_store_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    v_store RECORD;
    v_new_maturity store_maturity;
    v_days_active INTEGER;
    v_updated_count INTEGER := 0;
BEGIN
    FOR v_store IN
        SELECT id, onboarding_date, maturity
        FROM stores
        WHERE is_active = true
          AND (p_store_id IS NULL OR id = p_store_id)
    LOOP
        v_days_active := CURRENT_DATE - v_store.onboarding_date;

        -- Determine new maturity level
        SELECT maturity_level INTO v_new_maturity
        FROM store_maturity_tiers
        WHERE v_days_active >= min_days
          AND (max_days IS NULL OR v_days_active <= max_days)
        ORDER BY min_days DESC
        LIMIT 1;

        -- Update if changed
        IF v_new_maturity IS NOT NULL AND v_new_maturity != v_store.maturity THEN
            UPDATE stores
            SET maturity = v_new_maturity,
                maturity_updated_at = NOW(),
                updated_at = NOW()
            WHERE id = v_store.id;

            v_updated_count := v_updated_count + 1;

            -- Log the maturity change
            INSERT INTO system_events (event_type, event_source, context, status)
            VALUES (
                'store_maturity_change',
                'scheduler',
                jsonb_build_object(
                    'store_id', v_store.id,
                    'old_maturity', v_store.maturity,
                    'new_maturity', v_new_maturity,
                    'days_active', v_days_active
                ),
                'success'
            );
        END IF;
    END LOOP;

    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Calculate daily listing target for a store
CREATE OR REPLACE FUNCTION calculate_daily_listing_target(p_store_id UUID)
RETURNS TABLE (
    target_listings INTEGER,
    current_active INTEGER,
    gap_to_floor INTEGER,
    days_remaining INTEGER,
    daily_target INTEGER,
    max_daily_cap INTEGER,
    adjusted_target INTEGER
) AS $$
DECLARE
    v_store RECORD;
    v_tier RECORD;
    v_maturity RECORD;
    v_effective_floor INTEGER;
    v_days_to_floor INTEGER;
BEGIN
    -- Get store with tier info
    SELECT s.*, t.min_active_listings, t.days_to_floor, t.max_total_listings
    INTO v_store
    FROM stores s
    JOIN store_tiers t ON s.tier_id = t.id
    WHERE s.id = p_store_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found: %', p_store_id;
    END IF;

    -- Get maturity tier
    SELECT * INTO v_maturity
    FROM store_maturity_tiers
    WHERE maturity_level = v_store.maturity;

    -- Calculate effective floor based on maturity
    v_effective_floor := ROUND(v_store.min_active_listings * v_maturity.velocity_multiplier);

    -- Calculate days remaining to reach floor
    v_days_to_floor := GREATEST(1, v_store.days_to_floor - (CURRENT_DATE - v_store.onboarding_date));

    -- Set return values
    target_listings := v_effective_floor;
    current_active := v_store.current_active_listings;
    gap_to_floor := GREATEST(0, v_effective_floor - v_store.current_active_listings);
    days_remaining := v_days_to_floor;

    -- Calculate daily target to reach floor
    IF gap_to_floor > 0 AND v_days_to_floor > 0 THEN
        daily_target := CEIL(gap_to_floor::DECIMAL / v_days_to_floor);
    ELSE
        daily_target := 0;
    END IF;

    max_daily_cap := v_maturity.daily_cap;

    -- Adjust target to respect daily cap
    adjusted_target := LEAST(daily_target, v_maturity.daily_cap);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- UPDATE MATERIALIZED VIEW
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_store_health;

CREATE MATERIALIZED VIEW mv_store_health AS
SELECT
    s.id AS store_id,
    s.store_name,
    s.ebay_username,
    t.tier_name,
    s.maturity,
    s.is_active,
    s.current_active_listings,
    t.min_active_listings AS tier_floor,
    t.max_total_listings AS tier_ceiling,
    t.target_monthly_profit AS tier_profit_target,
    m.velocity_multiplier,
    ROUND(t.min_active_listings * m.velocity_multiplier) AS effective_floor,
    LEAST(m.monthly_cap, ROUND(t.max_total_listings * m.velocity_multiplier)) AS effective_ceiling,
    m.daily_cap,
    ROUND(t.target_monthly_profit * m.profit_target_percentage, 2) AS effective_profit_target,
    ROUND((s.current_active_listings::DECIMAL / NULLIF(ROUND(t.min_active_listings * m.velocity_multiplier), 0)) * 100, 1) AS floor_percentage,
    COALESCE(
        (SELECT SUM(profit) FROM sales WHERE store_id = s.id AND ebay_order_date >= DATE_TRUNC('month', CURRENT_DATE)),
        0
    ) AS mtd_profit,
    COALESCE(
        (SELECT COUNT(*) FROM sales WHERE store_id = s.id AND ebay_order_date >= DATE_TRUNC('month', CURRENT_DATE)),
        0
    ) AS mtd_sales,
    s.onboarding_date,
    (CURRENT_DATE - s.onboarding_date) AS days_active,
    GREATEST(0, t.days_to_floor - (CURRENT_DATE - s.onboarding_date)) AS days_to_floor_remaining
FROM stores s
JOIN store_tiers t ON s.tier_id = t.id
JOIN store_maturity_tiers m ON s.maturity = m.maturity_level
WHERE s.is_active = true;

CREATE UNIQUE INDEX idx_mv_store_health_id ON mv_store_health(store_id);

-- =============================================================================
-- SCHEDULED MATURITY UPDATE
-- =============================================================================

-- This would typically be called by a cron job or edge function daily
COMMENT ON FUNCTION update_store_maturity IS 'Updates store maturity levels based on days since onboarding. Should be called daily.';
