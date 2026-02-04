-- PPME Database Schema - Migration 004
-- Dynamic Ceiling Management (Fee-Aware)

-- =============================================================================
-- ADD CEILING TRACKING TO STORES
-- =============================================================================

ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS calculated_soft_ceiling INTEGER,
    ADD COLUMN IF NOT EXISTS ceiling_last_calculated TIMESTAMPTZ;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Calculate store soft ceiling based on maturity and velocity
CREATE OR REPLACE FUNCTION calculate_store_soft_ceiling(p_store_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_store RECORD;
    v_tier RECORD;
    v_maturity RECORD;
    v_days_active INTEGER;
    v_velocity_factor DECIMAL(5,4);
    v_soft_ceiling INTEGER;
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

    v_days_active := CURRENT_DATE - v_store.onboarding_date;

    -- Calculate velocity-based ceiling
    -- Start at fee_free_listings * velocity_multiplier
    -- Scale up toward max_total_listings based on performance

    IF v_store.overage_enabled THEN
        -- Can go above fee_free limit
        v_soft_ceiling := LEAST(
            ROUND(v_store.max_total_listings * v_maturity.velocity_multiplier),
            v_maturity.monthly_cap
        );
    ELSE
        -- Capped at fee_free limit
        v_soft_ceiling := LEAST(
            ROUND(v_store.subscription_listing_limit * v_maturity.velocity_multiplier),
            v_maturity.monthly_cap
        );
    END IF;

    -- Update the store's calculated ceiling
    UPDATE stores
    SET calculated_soft_ceiling = v_soft_ceiling,
        ceiling_last_calculated = NOW(),
        current_soft_ceiling = v_soft_ceiling
    WHERE id = p_store_id;

    RETURN v_soft_ceiling;
END;
$$ LANGUAGE plpgsql;

-- Get available listing slots for a store
CREATE OR REPLACE FUNCTION get_available_listing_slots(p_store_id UUID)
RETURNS TABLE (
    available_slots INTEGER,
    current_active INTEGER,
    soft_ceiling INTEGER,
    hard_ceiling INTEGER,
    at_soft_ceiling BOOLEAN,
    at_hard_ceiling BOOLEAN,
    overage_cost_per_listing DECIMAL(4,2)
) AS $$
DECLARE
    v_store RECORD;
    v_tier RECORD;
    v_maturity RECORD;
    v_soft_ceiling INTEGER;
BEGIN
    -- Get store with tier info
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

    -- Calculate soft ceiling if not cached
    IF v_store.calculated_soft_ceiling IS NULL
       OR v_store.ceiling_last_calculated < NOW() - INTERVAL '1 hour' THEN
        v_soft_ceiling := calculate_store_soft_ceiling(p_store_id);
    ELSE
        v_soft_ceiling := v_store.calculated_soft_ceiling;
    END IF;

    -- Set return values
    current_active := v_store.current_active_listings;
    soft_ceiling := v_soft_ceiling;
    hard_ceiling := v_store.max_total_listings;

    -- Calculate available slots
    IF v_store.current_active_listings >= v_store.max_total_listings THEN
        available_slots := 0;
        at_hard_ceiling := true;
        at_soft_ceiling := true;
    ELSIF v_store.current_active_listings >= v_soft_ceiling THEN
        IF v_store.overage_enabled THEN
            available_slots := v_store.max_total_listings - v_store.current_active_listings;
            at_soft_ceiling := true;
            at_hard_ceiling := false;
        ELSE
            available_slots := 0;
            at_soft_ceiling := true;
            at_hard_ceiling := true;
        END IF;
    ELSE
        available_slots := v_soft_ceiling - v_store.current_active_listings;
        at_soft_ceiling := false;
        at_hard_ceiling := false;
    END IF;

    -- Set overage cost
    IF v_store.overage_enabled AND v_store.current_active_listings >= v_store.subscription_listing_limit THEN
        overage_cost_per_listing := v_store.overage_fee;
    ELSE
        overage_cost_per_listing := 0.00;
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update all store ceilings (batch operation)
CREATE OR REPLACE FUNCTION update_all_store_ceilings()
RETURNS INTEGER AS $$
DECLARE
    v_store RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_store IN
        SELECT id FROM stores WHERE is_active = true
    LOOP
        PERFORM calculate_store_soft_ceiling(v_store.id);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VIEW: Store Capacity Dashboard
-- =============================================================================

CREATE OR REPLACE VIEW v_store_capacity AS
SELECT
    s.id AS store_id,
    s.store_name,
    s.ebay_username,
    t.tier_name,
    s.maturity,
    s.current_active_listings,
    s.calculated_soft_ceiling AS soft_ceiling,
    t.subscription_listing_limit AS fee_free_ceiling,
    t.max_total_listings AS hard_ceiling,
    t.overage_enabled,
    t.overage_fee,
    CASE
        WHEN s.current_active_listings >= t.max_total_listings THEN 'at_hard_ceiling'
        WHEN s.current_active_listings >= COALESCE(s.calculated_soft_ceiling, t.subscription_listing_limit) THEN 'at_soft_ceiling'
        WHEN s.current_active_listings >= t.subscription_listing_limit THEN 'in_overage'
        ELSE 'normal'
    END AS capacity_status,
    GREATEST(0, COALESCE(s.calculated_soft_ceiling, t.subscription_listing_limit) - s.current_active_listings) AS available_free_slots,
    CASE
        WHEN t.overage_enabled THEN GREATEST(0, t.max_total_listings - s.current_active_listings)
        ELSE GREATEST(0, t.subscription_listing_limit - s.current_active_listings)
    END AS total_available_slots,
    CASE
        WHEN s.current_active_listings > t.subscription_listing_limit
        THEN (s.current_active_listings - t.subscription_listing_limit) * t.overage_fee
        ELSE 0
    END AS current_monthly_overage_cost
FROM stores s
JOIN store_tiers t ON s.tier_id = t.id
WHERE s.is_active = true;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION calculate_store_soft_ceiling IS 'Calculates the velocity-adjusted soft ceiling for a store based on maturity and tier';
COMMENT ON FUNCTION get_available_listing_slots IS 'Returns available listing capacity for a store with overage cost info';
COMMENT ON VIEW v_store_capacity IS 'Dashboard view showing store capacity status and overage costs';
