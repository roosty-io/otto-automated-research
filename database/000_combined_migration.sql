-- PPME Combined Database Migration
-- Run this single file in Supabase SQL Editor to deploy the entire schema
--
-- This combines migrations:
-- - 001_schema.sql (Core tables)
-- - 002_store_maturity.sql (Maturity system)
-- - 004_dynamic_ceiling.sql (Fee-aware ceilings)
-- - 005_listing_jobs.sql (Job queue)
--
-- IMPORTANT: Run this in a fresh database or ensure tables don't exist

-- ============================================================================
-- MIGRATION 001: CORE SCHEMA
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ENUMS
CREATE TYPE listing_status AS ENUM ('draft', 'active', 'paused', 'ended', 'pruned');
CREATE TYPE sku_status AS ENUM ('draft', 'ready', 'distributed', 'exhausted');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE enforcement_action_type AS ENUM ('prune', 'escalate', 'replenish', 'pause', 'resume');
CREATE TYPE export_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- STORE TIERS
CREATE TABLE store_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tier_name TEXT NOT NULL UNIQUE,
    subscription_type TEXT NOT NULL,
    target_monthly_profit DECIMAL(10,2) NOT NULL,
    min_active_listings INTEGER NOT NULL,
    days_to_floor INTEGER NOT NULL DEFAULT 45,
    fee_free_listings INTEGER NOT NULL,
    subscription_listing_limit INTEGER NOT NULL,
    max_total_listings INTEGER NOT NULL,
    overage_fee DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    overage_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO store_tiers (tier_name, subscription_type, target_monthly_profit, min_active_listings, days_to_floor, fee_free_listings, subscription_listing_limit, max_total_listings, overage_fee, overage_enabled) VALUES
    ('Bronze', 'Premium', 3000.00, 5000, 45, 10000, 10000, 10000, 0.30, false),
    ('Silver', 'Anchor', 5000.00, 10000, 60, 25000, 25000, 25000, 0.05, false),
    ('Gold', 'Anchor', 8000.00, 15000, 75, 25000, 25000, 30000, 0.05, true),
    ('Platinum', 'Anchor', 10000.00, 20000, 90, 25000, 25000, 40000, 0.05, true);

-- STORES
CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_name TEXT NOT NULL,
    ebay_username TEXT NOT NULL UNIQUE,
    tier_id UUID NOT NULL REFERENCES store_tiers(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    ebay_registration_date DATE,
    onboarding_date DATE NOT NULL DEFAULT CURRENT_DATE,
    current_active_listings INTEGER NOT NULL DEFAULT 0,
    current_soft_ceiling INTEGER,
    client_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stores_tier ON stores(tier_id);
CREATE INDEX idx_stores_active ON stores(is_active) WHERE is_active = true;
CREATE INDEX idx_stores_client ON stores(client_id) WHERE client_id IS NOT NULL;

-- STORE AUTODS CONFIG
CREATE TABLE store_autods_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    autods_store_id TEXT,
    google_sheet_id TEXT,
    sheet_tab_name TEXT DEFAULT 'Import',
    markup_percentage DECIMAL(5,2) NOT NULL DEFAULT 30.00,
    handling_time_days INTEGER NOT NULL DEFAULT 3,
    last_sync_at TIMESTAMPTZ,
    sync_status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id)
);

-- STORE LISTING BUDGET
CREATE TABLE store_listing_budget (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    budget_date DATE NOT NULL DEFAULT CURRENT_DATE,
    daily_target INTEGER NOT NULL DEFAULT 0,
    listings_added INTEGER NOT NULL DEFAULT 0,
    listings_removed INTEGER NOT NULL DEFAULT 0,
    eod_active_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id, budget_date)
);

CREATE INDEX idx_store_listing_budget_date ON store_listing_budget(budget_date);

-- RAW PRODUCTS (Layer 0)
CREATE TABLE raw_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asin TEXT NOT NULL,
    amazon_url TEXT,
    keepa_data JSONB NOT NULL DEFAULT '{}',
    title TEXT,
    brand TEXT,
    category TEXT,
    amazon_price DECIMAL(10,2),
    sales_rank INTEGER,
    review_count INTEGER,
    rating DECIMAL(3,2),
    is_processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ,
    source TEXT DEFAULT 'keepa',
    source_batch_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(asin)
);

CREATE INDEX idx_raw_products_unprocessed ON raw_products(is_processed) WHERE is_processed = false;
CREATE INDEX idx_raw_products_category ON raw_products(category);
CREATE INDEX idx_raw_products_created ON raw_products(created_at);

-- NORMALIZED PRODUCTS (Layer 1)
CREATE TABLE normalized_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_product_id UUID NOT NULL REFERENCES raw_products(id) ON DELETE CASCADE,
    normalized_title TEXT NOT NULL,
    normalized_category TEXT NOT NULL,
    normalized_subcategory TEXT,
    use_case TEXT,
    target_demographic TEXT,
    key_features JSONB DEFAULT '[]',
    cost_price DECIMAL(10,2) NOT NULL,
    suggested_sell_price DECIMAL(10,2),
    suggested_price_band TEXT,
    listing_quality_score DECIMAL(3,2),
    demand_confidence DECIMAL(3,2),
    ai_model TEXT DEFAULT 'claude-3-sonnet',
    ai_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(raw_product_id)
);

CREATE INDEX idx_normalized_category ON normalized_products(normalized_category);
CREATE INDEX idx_normalized_subcategory ON normalized_products(normalized_subcategory);

-- PATTERNS (Layer 2)
CREATE TABLE patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL,
    subcategory TEXT,
    use_case TEXT,
    price_band TEXT NOT NULL,
    total_skus INTEGER NOT NULL DEFAULT 0,
    total_sales INTEGER NOT NULL DEFAULT 0,
    total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_profit DECIMAL(12,2) NOT NULL DEFAULT 0,
    avg_days_to_sale DECIMAL(6,2),
    return_rate DECIMAL(5,4) DEFAULT 0,
    pattern_score DECIMAL(5,2) DEFAULT 0,
    is_validated BOOLEAN NOT NULL DEFAULT false,
    validation_date TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_pattern_fingerprint ON patterns(category, COALESCE(subcategory, ''), COALESCE(use_case, ''), price_band);
CREATE INDEX idx_patterns_active ON patterns(is_active) WHERE is_active = true;
CREATE INDEX idx_patterns_validated ON patterns(is_validated) WHERE is_validated = true;
CREATE INDEX idx_patterns_score ON patterns(pattern_score DESC);

-- SKUS (Layer 3)
CREATE TABLE skus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    normalized_product_id UUID NOT NULL REFERENCES normalized_products(id),
    pattern_id UUID REFERENCES patterns(id),
    sku_code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    bullet_points JSONB DEFAULT '[]',
    cost_price DECIMAL(10,2) NOT NULL,
    sell_price DECIMAL(10,2) NOT NULL,
    expected_profit DECIMAL(10,2) GENERATED ALWAYS AS (sell_price - cost_price - (sell_price * 0.13)) STORED,
    status sku_status NOT NULL DEFAULT 'draft',
    max_store_count INTEGER NOT NULL DEFAULT 3,
    current_store_count INTEGER NOT NULL DEFAULT 0,
    total_sales INTEGER NOT NULL DEFAULT 0,
    total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_profit DECIMAL(12,2) NOT NULL DEFAULT 0,
    avg_days_to_sale DECIMAL(6,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skus_status ON skus(status);
CREATE INDEX idx_skus_pattern ON skus(pattern_id);
CREATE INDEX idx_skus_available ON skus(status, current_store_count) WHERE status = 'ready' AND current_store_count < 3;

-- STORE SKU ASSIGNMENTS (Layer 4)
CREATE TABLE store_sku_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    ebay_listing_id TEXT,
    listing_url TEXT,
    listing_status listing_status NOT NULL DEFAULT 'draft',
    listed_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0,
    profit DECIMAL(10,2) DEFAULT 0,
    last_sale_at TIMESTAMPTZ,
    days_without_sale INTEGER GENERATED ALWAYS AS (
        CASE
            WHEN last_sale_at IS NULL AND listed_at IS NOT NULL THEN EXTRACT(DAY FROM NOW() - listed_at)::INTEGER
            WHEN last_sale_at IS NOT NULL THEN EXTRACT(DAY FROM NOW() - last_sale_at)::INTEGER
            ELSE NULL
        END
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id, sku_id)
);

CREATE INDEX idx_assignments_store ON store_sku_assignments(store_id);
CREATE INDEX idx_assignments_sku ON store_sku_assignments(sku_id);
CREATE INDEX idx_assignments_status ON store_sku_assignments(listing_status);
CREATE INDEX idx_assignments_prune_candidates ON store_sku_assignments(days_without_sale) WHERE listing_status = 'active' AND days_without_sale >= 14;

-- DISTRIBUTION QUEUE
CREATE TABLE distribution_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 0,
    status job_status NOT NULL DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    assignment_id UUID REFERENCES store_sku_assignments(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(sku_id, store_id)
);

CREATE INDEX idx_distribution_queue_pending ON distribution_queue(priority DESC, created_at) WHERE status = 'pending';

-- EXPORT BATCHES
CREATE TABLE export_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    batch_number INTEGER NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    status export_status NOT NULL DEFAULT 'pending',
    sheet_id TEXT,
    sheet_url TEXT,
    exported_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_export_batches_pending ON export_batches(store_id, status) WHERE status = 'pending';

-- EXPORT QUEUE
CREATE TABLE export_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES export_batches(id),
    status export_status NOT NULL DEFAULT 'pending',
    export_data JSONB NOT NULL,
    exported_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(assignment_id)
);

CREATE INDEX idx_export_queue_pending ON export_queue(status) WHERE status = 'pending';

-- SALES
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    sku_id UUID NOT NULL REFERENCES skus(id),
    ebay_order_id TEXT NOT NULL UNIQUE,
    ebay_order_date TIMESTAMPTZ NOT NULL,
    sale_price DECIMAL(10,2) NOT NULL,
    ebay_fees DECIMAL(10,2) NOT NULL DEFAULT 0,
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    product_cost DECIMAL(10,2) NOT NULL,
    profit DECIMAL(10,2) GENERATED ALWAYS AS (sale_price - ebay_fees - shipping_cost - product_cost) STORED,
    buyer_username TEXT,
    shipping_address_state TEXT,
    shipping_address_country TEXT DEFAULT 'US',
    is_returned BOOLEAN NOT NULL DEFAULT false,
    returned_at TIMESTAMPTZ,
    return_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_assignment ON sales(assignment_id);
CREATE INDEX idx_sales_store ON sales(store_id);
CREATE INDEX idx_sales_sku ON sales(sku_id);
CREATE INDEX idx_sales_date ON sales(ebay_order_date);
CREATE INDEX idx_sales_returned ON sales(is_returned) WHERE is_returned = true;

-- ENFORCEMENT ACTIONS
CREATE TABLE enforcement_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES store_sku_assignments(id),
    sku_id UUID REFERENCES skus(id),
    store_id UUID REFERENCES stores(id),
    action_type enforcement_action_type NOT NULL,
    reason TEXT NOT NULL,
    state_before JSONB,
    state_after JSONB,
    initiated_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_enforcement_assignment ON enforcement_actions(assignment_id);
CREATE INDEX idx_enforcement_store ON enforcement_actions(store_id);
CREATE INDEX idx_enforcement_type ON enforcement_actions(action_type);
CREATE INDEX idx_enforcement_date ON enforcement_actions(created_at);

-- SYSTEM EVENTS
CREATE TABLE system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    event_source TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'info',
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_events_type ON system_events(event_type);
CREATE INDEX idx_system_events_status ON system_events(status);
CREATE INDEX idx_system_events_date ON system_events(created_at);

-- ============================================================================
-- CORE TRIGGERS
-- ============================================================================

-- Max 3 stores per SKU trigger
CREATE OR REPLACE FUNCTION check_max_stores_per_sku()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
BEGIN
    SELECT current_store_count INTO current_count FROM skus WHERE id = NEW.sku_id;
    IF current_count >= 3 THEN
        RAISE EXCEPTION 'SKU % already assigned to maximum 3 stores', NEW.sku_id;
    END IF;
    UPDATE skus SET current_store_count = current_store_count + 1, updated_at = NOW() WHERE id = NEW.sku_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_max_stores BEFORE INSERT ON store_sku_assignments FOR EACH ROW EXECUTE FUNCTION check_max_stores_per_sku();

-- Decrement store count
CREATE OR REPLACE FUNCTION decrement_store_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE skus SET current_store_count = GREATEST(0, current_store_count - 1), updated_at = NOW() WHERE id = OLD.sku_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_decrement_store_count BEFORE DELETE ON store_sku_assignments FOR EACH ROW EXECUTE FUNCTION decrement_store_count();

-- Update store listing count
CREATE OR REPLACE FUNCTION update_store_listing_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.listing_status = 'active' THEN
        UPDATE stores SET current_active_listings = current_active_listings + 1, updated_at = NOW() WHERE id = NEW.store_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.listing_status != 'active' AND NEW.listing_status = 'active' THEN
            UPDATE stores SET current_active_listings = current_active_listings + 1, updated_at = NOW() WHERE id = NEW.store_id;
        ELSIF OLD.listing_status = 'active' AND NEW.listing_status != 'active' THEN
            UPDATE stores SET current_active_listings = GREATEST(0, current_active_listings - 1), updated_at = NOW() WHERE id = NEW.store_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.listing_status = 'active' THEN
        UPDATE stores SET current_active_listings = GREATEST(0, current_active_listings - 1), updated_at = NOW() WHERE id = OLD.store_id;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_store_listing_count AFTER INSERT OR UPDATE OR DELETE ON store_sku_assignments FOR EACH ROW EXECUTE FUNCTION update_store_listing_count();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_store_autods_config_updated_at BEFORE UPDATE ON store_autods_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_store_listing_budget_updated_at BEFORE UPDATE ON store_listing_budget FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_raw_products_updated_at BEFORE UPDATE ON raw_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_normalized_products_updated_at BEFORE UPDATE ON normalized_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_patterns_updated_at BEFORE UPDATE ON patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_skus_updated_at BEFORE UPDATE ON skus FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_store_sku_assignments_updated_at BEFORE UPDATE ON store_sku_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- MIGRATION 002: STORE MATURITY
-- ============================================================================

CREATE TYPE store_maturity AS ENUM ('new', 'establishing', 'growing', 'mature', 'seasoned');

CREATE TABLE store_maturity_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    maturity_level store_maturity NOT NULL UNIQUE,
    min_days INTEGER NOT NULL,
    max_days INTEGER,
    velocity_multiplier DECIMAL(3,2) NOT NULL,
    daily_cap INTEGER NOT NULL,
    monthly_cap INTEGER NOT NULL,
    profit_target_percentage DECIMAL(3,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO store_maturity_tiers (maturity_level, min_days, max_days, velocity_multiplier, daily_cap, monthly_cap, profit_target_percentage) VALUES
    ('new', 0, 14, 0.40, 150, 2000, 0.30),
    ('establishing', 15, 30, 0.60, 200, 4000, 0.50),
    ('growing', 31, 60, 0.80, 250, 6000, 0.70),
    ('mature', 61, 90, 0.95, 300, 8000, 0.85),
    ('seasoned', 91, NULL, 1.00, 500, 10000, 1.00);

ALTER TABLE stores
    ADD COLUMN maturity store_maturity NOT NULL DEFAULT 'new',
    ADD COLUMN maturity_updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX idx_stores_maturity ON stores(maturity);

-- Calculate effective limits
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
    v_store RECORD;
    v_maturity RECORD;
BEGIN
    SELECT s.*, t.* INTO v_store FROM stores s JOIN store_tiers t ON s.tier_id = t.id WHERE s.id = p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Store not found: %', p_store_id; END IF;
    SELECT * INTO v_maturity FROM store_maturity_tiers WHERE maturity_level = v_store.maturity;
    effective_floor := ROUND(v_store.min_active_listings * v_maturity.velocity_multiplier);
    effective_ceiling := LEAST(v_maturity.monthly_cap, ROUND(v_store.max_total_listings * v_maturity.velocity_multiplier));
    daily_cap := v_maturity.daily_cap;
    monthly_cap := v_maturity.monthly_cap;
    velocity_multiplier := v_maturity.velocity_multiplier;
    profit_target := ROUND(v_store.target_monthly_profit * v_maturity.profit_target_percentage, 2);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update store maturity
CREATE OR REPLACE FUNCTION update_store_maturity(p_store_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    v_store RECORD;
    v_new_maturity store_maturity;
    v_days_active INTEGER;
    v_updated_count INTEGER := 0;
BEGIN
    FOR v_store IN SELECT id, onboarding_date, maturity FROM stores WHERE is_active = true AND (p_store_id IS NULL OR id = p_store_id) LOOP
        v_days_active := CURRENT_DATE - v_store.onboarding_date;
        SELECT maturity_level INTO v_new_maturity FROM store_maturity_tiers WHERE v_days_active >= min_days AND (max_days IS NULL OR v_days_active <= max_days) ORDER BY min_days DESC LIMIT 1;
        IF v_new_maturity IS NOT NULL AND v_new_maturity != v_store.maturity THEN
            UPDATE stores SET maturity = v_new_maturity, maturity_updated_at = NOW(), updated_at = NOW() WHERE id = v_store.id;
            v_updated_count := v_updated_count + 1;
            INSERT INTO system_events (event_type, event_source, context, status) VALUES ('store_maturity_change', 'scheduler', jsonb_build_object('store_id', v_store.id, 'old_maturity', v_store.maturity, 'new_maturity', v_new_maturity, 'days_active', v_days_active), 'success');
        END IF;
    END LOOP;
    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Calculate daily listing target
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
    v_maturity RECORD;
    v_effective_floor INTEGER;
    v_days_to_floor INTEGER;
BEGIN
    SELECT s.*, t.min_active_listings, t.days_to_floor, t.max_total_listings INTO v_store FROM stores s JOIN store_tiers t ON s.tier_id = t.id WHERE s.id = p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Store not found: %', p_store_id; END IF;
    SELECT * INTO v_maturity FROM store_maturity_tiers WHERE maturity_level = v_store.maturity;
    v_effective_floor := ROUND(v_store.min_active_listings * v_maturity.velocity_multiplier);
    v_days_to_floor := GREATEST(1, v_store.days_to_floor - (CURRENT_DATE - v_store.onboarding_date));
    target_listings := v_effective_floor;
    current_active := v_store.current_active_listings;
    gap_to_floor := GREATEST(0, v_effective_floor - v_store.current_active_listings);
    days_remaining := v_days_to_floor;
    IF gap_to_floor > 0 AND v_days_to_floor > 0 THEN daily_target := CEIL(gap_to_floor::DECIMAL / v_days_to_floor); ELSE daily_target := 0; END IF;
    max_daily_cap := v_maturity.daily_cap;
    adjusted_target := LEAST(daily_target, v_maturity.daily_cap);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- MIGRATION 004: DYNAMIC CEILING
-- ============================================================================

ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS calculated_soft_ceiling INTEGER,
    ADD COLUMN IF NOT EXISTS ceiling_last_calculated TIMESTAMPTZ;

-- Calculate store soft ceiling
CREATE OR REPLACE FUNCTION calculate_store_soft_ceiling(p_store_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_store RECORD;
    v_maturity RECORD;
    v_soft_ceiling INTEGER;
BEGIN
    SELECT s.*, t.* INTO v_store FROM stores s JOIN store_tiers t ON s.tier_id = t.id WHERE s.id = p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Store not found: %', p_store_id; END IF;
    SELECT * INTO v_maturity FROM store_maturity_tiers WHERE maturity_level = v_store.maturity;
    IF v_store.overage_enabled THEN
        v_soft_ceiling := LEAST(ROUND(v_store.max_total_listings * v_maturity.velocity_multiplier), v_maturity.monthly_cap);
    ELSE
        v_soft_ceiling := LEAST(ROUND(v_store.subscription_listing_limit * v_maturity.velocity_multiplier), v_maturity.monthly_cap);
    END IF;
    UPDATE stores SET calculated_soft_ceiling = v_soft_ceiling, ceiling_last_calculated = NOW(), current_soft_ceiling = v_soft_ceiling WHERE id = p_store_id;
    RETURN v_soft_ceiling;
END;
$$ LANGUAGE plpgsql;

-- Get available listing slots
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
    v_maturity RECORD;
    v_soft_ceiling INTEGER;
BEGIN
    SELECT s.*, t.* INTO v_store FROM stores s JOIN store_tiers t ON s.tier_id = t.id WHERE s.id = p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Store not found: %', p_store_id; END IF;
    SELECT * INTO v_maturity FROM store_maturity_tiers WHERE maturity_level = v_store.maturity;
    IF v_store.calculated_soft_ceiling IS NULL OR v_store.ceiling_last_calculated < NOW() - INTERVAL '1 hour' THEN
        v_soft_ceiling := calculate_store_soft_ceiling(p_store_id);
    ELSE
        v_soft_ceiling := v_store.calculated_soft_ceiling;
    END IF;
    current_active := v_store.current_active_listings;
    soft_ceiling := v_soft_ceiling;
    hard_ceiling := v_store.max_total_listings;
    IF v_store.current_active_listings >= v_store.max_total_listings THEN
        available_slots := 0; at_hard_ceiling := true; at_soft_ceiling := true;
    ELSIF v_store.current_active_listings >= v_soft_ceiling THEN
        IF v_store.overage_enabled THEN
            available_slots := v_store.max_total_listings - v_store.current_active_listings; at_soft_ceiling := true; at_hard_ceiling := false;
        ELSE
            available_slots := 0; at_soft_ceiling := true; at_hard_ceiling := true;
        END IF;
    ELSE
        available_slots := v_soft_ceiling - v_store.current_active_listings; at_soft_ceiling := false; at_hard_ceiling := false;
    END IF;
    IF v_store.overage_enabled AND v_store.current_active_listings >= v_store.subscription_listing_limit THEN
        overage_cost_per_listing := v_store.overage_fee;
    ELSE
        overage_cost_per_listing := 0.00;
    END IF;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update all store ceilings
CREATE OR REPLACE FUNCTION update_all_store_ceilings()
RETURNS INTEGER AS $$
DECLARE
    v_store RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_store IN SELECT id FROM stores WHERE is_active = true LOOP
        PERFORM calculate_store_soft_ceiling(v_store.id);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Store capacity view
CREATE OR REPLACE VIEW v_store_capacity AS
SELECT
    s.id AS store_id, s.store_name, s.ebay_username, t.tier_name, s.maturity, s.current_active_listings,
    s.calculated_soft_ceiling AS soft_ceiling, t.subscription_listing_limit AS fee_free_ceiling,
    t.max_total_listings AS hard_ceiling, t.overage_enabled, t.overage_fee,
    CASE
        WHEN s.current_active_listings >= t.max_total_listings THEN 'at_hard_ceiling'
        WHEN s.current_active_listings >= COALESCE(s.calculated_soft_ceiling, t.subscription_listing_limit) THEN 'at_soft_ceiling'
        WHEN s.current_active_listings >= t.subscription_listing_limit THEN 'in_overage'
        ELSE 'normal'
    END AS capacity_status,
    GREATEST(0, COALESCE(s.calculated_soft_ceiling, t.subscription_listing_limit) - s.current_active_listings) AS available_free_slots,
    CASE WHEN t.overage_enabled THEN GREATEST(0, t.max_total_listings - s.current_active_listings)
         ELSE GREATEST(0, t.subscription_listing_limit - s.current_active_listings) END AS total_available_slots,
    CASE WHEN s.current_active_listings > t.subscription_listing_limit
         THEN (s.current_active_listings - t.subscription_listing_limit) * t.overage_fee ELSE 0 END AS current_monthly_overage_cost
FROM stores s JOIN store_tiers t ON s.tier_id = t.id WHERE s.is_active = true;

-- ============================================================================
-- MIGRATION 005: LISTING JOBS
-- ============================================================================

CREATE TYPE listing_job_type AS ENUM ('managed_onboarding', 'self_service_onboarding', 'managed_replenishment', 'self_service_topup', 'bulk_import', 'escalation', 'pruning');

CREATE TABLE listing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    job_type listing_job_type NOT NULL,
    job_name TEXT NOT NULL,
    target_listing_count INTEGER NOT NULL,
    completed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    status job_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    config JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listing_jobs_store ON listing_jobs(store_id);
CREATE INDEX idx_listing_jobs_status ON listing_jobs(status);
CREATE INDEX idx_listing_jobs_pending ON listing_jobs(priority DESC, scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_listing_jobs_processing ON listing_jobs(started_at) WHERE status = 'processing';

CREATE TABLE listing_job_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES listing_jobs(id) ON DELETE CASCADE,
    log_level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    sku_id UUID REFERENCES skus(id),
    assignment_id UUID REFERENCES store_sku_assignments(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listing_job_logs_job ON listing_job_logs(job_id);
CREATE INDEX idx_listing_job_logs_level ON listing_job_logs(log_level);

-- Create onboarding job
CREATE OR REPLACE FUNCTION create_onboarding_job(p_store_id UUID, p_target_count INTEGER DEFAULT NULL, p_priority INTEGER DEFAULT 5, p_created_by TEXT DEFAULT 'admin')
RETURNS UUID AS $$
DECLARE
    v_store RECORD; v_maturity RECORD; v_target INTEGER; v_job_id UUID;
BEGIN
    SELECT s.*, t.* INTO v_store FROM stores s JOIN store_tiers t ON s.tier_id = t.id WHERE s.id = p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Store not found: %', p_store_id; END IF;
    SELECT * INTO v_maturity FROM store_maturity_tiers WHERE maturity_level = v_store.maturity;
    IF p_target_count IS NULL THEN v_target := ROUND(v_store.min_active_listings * v_maturity.velocity_multiplier); ELSE v_target := p_target_count; END IF;
    INSERT INTO listing_jobs (store_id, job_type, job_name, target_listing_count, priority, created_by, config)
    VALUES (p_store_id, 'managed_onboarding', 'Onboarding: ' || v_store.store_name, v_target, p_priority, p_created_by,
            jsonb_build_object('tier', v_store.tier_name, 'maturity', v_store.maturity::TEXT, 'effective_floor', v_target, 'days_to_floor', v_store.days_to_floor))
    RETURNING id INTO v_job_id;
    INSERT INTO listing_job_logs (job_id, log_level, message, details) VALUES (v_job_id, 'info', 'Onboarding job created', jsonb_build_object('target_count', v_target, 'store', v_store.store_name));
    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Create managed listing job
CREATE OR REPLACE FUNCTION create_managed_listing_job(p_store_id UUID, p_listing_count INTEGER, p_job_type listing_job_type DEFAULT 'managed_replenishment', p_priority INTEGER DEFAULT 3, p_scheduled_for TIMESTAMPTZ DEFAULT NULL, p_created_by TEXT DEFAULT 'admin')
RETURNS UUID AS $$
DECLARE
    v_store RECORD; v_available_slots INTEGER; v_job_id UUID;
BEGIN
    SELECT s.store_name, s.ebay_username INTO v_store FROM stores s WHERE s.id = p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Store not found: %', p_store_id; END IF;
    SELECT available_slots INTO v_available_slots FROM get_available_listing_slots(p_store_id);
    IF p_listing_count > v_available_slots THEN RAISE WARNING 'Requested % listings but only % slots available', p_listing_count, v_available_slots; END IF;
    INSERT INTO listing_jobs (store_id, job_type, job_name, target_listing_count, priority, scheduled_for, created_by)
    VALUES (p_store_id, p_job_type, p_job_type::TEXT || ': ' || v_store.store_name || ' (' || p_listing_count || ' listings)', LEAST(p_listing_count, v_available_slots), p_priority, COALESCE(p_scheduled_for, NOW()), p_created_by)
    RETURNING id INTO v_job_id;
    INSERT INTO listing_job_logs (job_id, log_level, message, details) VALUES (v_job_id, 'info', 'Listing job created', jsonb_build_object('requested_count', p_listing_count, 'approved_count', LEAST(p_listing_count, v_available_slots), 'available_slots', v_available_slots));
    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Get job batch size
CREATE OR REPLACE FUNCTION get_job_batch_size(p_job_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_job RECORD; v_remaining INTEGER; v_store RECORD; v_batch_size INTEGER;
BEGIN
    SELECT * INTO v_job FROM listing_jobs WHERE id = p_job_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Job not found: %', p_job_id; END IF;
    v_remaining := v_job.target_listing_count - v_job.completed_count;
    SELECT s.*, m.daily_cap INTO v_store FROM stores s JOIN store_maturity_tiers m ON s.maturity = m.maturity_level WHERE s.id = v_job.store_id;
    v_batch_size := LEAST(v_remaining, v_store.daily_cap, 100);
    RETURN v_batch_size;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get active jobs
CREATE OR REPLACE FUNCTION get_active_jobs(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (job_id UUID, store_id UUID, store_name TEXT, job_type listing_job_type, job_name TEXT, target_count INTEGER, completed_count INTEGER, remaining_count INTEGER, batch_size INTEGER, priority INTEGER, status job_status) AS $$
BEGIN
    RETURN QUERY
    SELECT j.id AS job_id, j.store_id, s.store_name, j.job_type, j.job_name, j.target_listing_count AS target_count, j.completed_count, (j.target_listing_count - j.completed_count) AS remaining_count, get_job_batch_size(j.id) AS batch_size, j.priority, j.status
    FROM listing_jobs j JOIN stores s ON j.store_id = s.id
    WHERE j.status IN ('pending', 'processing') AND (j.scheduled_for IS NULL OR j.scheduled_for <= NOW())
    ORDER BY j.status DESC, j.priority DESC, j.created_at ASC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Jobs dashboard view
CREATE OR REPLACE VIEW v_listing_jobs_dashboard AS
SELECT j.id, j.store_id, s.store_name, s.ebay_username, t.tier_name, j.job_type, j.job_name, j.target_listing_count, j.completed_count, j.failed_count,
       (j.target_listing_count - j.completed_count) AS remaining, ROUND((j.completed_count::DECIMAL / NULLIF(j.target_listing_count, 0)) * 100, 1) AS progress_pct,
       j.status, j.priority, j.scheduled_for, j.started_at, j.completed_at,
       CASE WHEN j.completed_at IS NOT NULL AND j.started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (j.completed_at - j.started_at))::INTEGER
            WHEN j.started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - j.started_at))::INTEGER ELSE NULL END AS duration_seconds,
       j.last_error, j.retry_count, j.created_by, j.created_at, j.updated_at
FROM listing_jobs j JOIN stores s ON j.store_id = s.id JOIN store_tiers t ON s.tier_id = t.id
ORDER BY CASE j.status WHEN 'processing' THEN 1 WHEN 'pending' THEN 2 WHEN 'completed' THEN 3 WHEN 'failed' THEN 4 WHEN 'cancelled' THEN 5 END, j.priority DESC, j.created_at DESC;

-- Job completion trigger
CREATE OR REPLACE FUNCTION check_job_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed_count >= NEW.target_listing_count AND NEW.status = 'processing' THEN
        NEW.status := 'completed'; NEW.completed_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_job_completion BEFORE UPDATE ON listing_jobs FOR EACH ROW EXECUTE FUNCTION check_job_completion();
CREATE TRIGGER trg_listing_jobs_updated_at BEFORE UPDATE ON listing_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- MATERIALIZED VIEW: STORE HEALTH
-- ============================================================================

CREATE MATERIALIZED VIEW mv_store_health AS
SELECT
    s.id AS store_id, s.store_name, s.ebay_username, t.tier_name, s.maturity, s.is_active, s.current_active_listings,
    t.min_active_listings AS tier_floor, t.max_total_listings AS tier_ceiling, t.target_monthly_profit AS tier_profit_target,
    m.velocity_multiplier, ROUND(t.min_active_listings * m.velocity_multiplier) AS effective_floor,
    LEAST(m.monthly_cap, ROUND(t.max_total_listings * m.velocity_multiplier)) AS effective_ceiling, m.daily_cap,
    ROUND(t.target_monthly_profit * m.profit_target_percentage, 2) AS effective_profit_target,
    ROUND((s.current_active_listings::DECIMAL / NULLIF(ROUND(t.min_active_listings * m.velocity_multiplier), 0)) * 100, 1) AS floor_percentage,
    COALESCE((SELECT SUM(profit) FROM sales WHERE store_id = s.id AND ebay_order_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS mtd_profit,
    COALESCE((SELECT COUNT(*) FROM sales WHERE store_id = s.id AND ebay_order_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS mtd_sales,
    s.onboarding_date, (CURRENT_DATE - s.onboarding_date) AS days_active,
    GREATEST(0, t.days_to_floor - (CURRENT_DATE - s.onboarding_date)) AS days_to_floor_remaining
FROM stores s
JOIN store_tiers t ON s.tier_id = t.id
JOIN store_maturity_tiers m ON s.maturity = m.maturity_level
WHERE s.is_active = true;

CREATE UNIQUE INDEX idx_mv_store_health_id ON mv_store_health(store_id);

CREATE OR REPLACE FUNCTION refresh_store_health() RETURNS void AS $$ BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY mv_store_health; END; $$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_autods_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_stores ON stores FOR ALL USING (true);
CREATE POLICY admin_all_autods_config ON store_autods_config FOR ALL USING (true);
CREATE POLICY admin_all_sales ON sales FOR ALL USING (true);

-- ============================================================================
-- VERIFICATION QUERY (Run after migration)
-- ============================================================================
-- SELECT tier_name, target_monthly_profit, min_active_listings, subscription_listing_limit, max_total_listings FROM store_tiers ORDER BY target_monthly_profit;
