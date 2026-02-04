-- PPME Database Schema - Migration 001
-- Core Tables for Product Pattern Manufacturing Engine

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE listing_status AS ENUM ('draft', 'active', 'paused', 'ended', 'pruned');
CREATE TYPE sku_status AS ENUM ('draft', 'ready', 'distributed', 'exhausted');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE enforcement_action_type AS ENUM ('prune', 'escalate', 'replenish', 'pause', 'resume');
CREATE TYPE export_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- =============================================================================
-- STORE TIERS
-- =============================================================================

CREATE TABLE store_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tier_name TEXT NOT NULL UNIQUE,
    subscription_type TEXT NOT NULL, -- 'Premium' or 'Anchor'
    target_monthly_profit DECIMAL(10,2) NOT NULL,
    min_active_listings INTEGER NOT NULL, -- Floor
    days_to_floor INTEGER NOT NULL DEFAULT 45,
    fee_free_listings INTEGER NOT NULL,
    subscription_listing_limit INTEGER NOT NULL, -- Fee-free ceiling
    max_total_listings INTEGER NOT NULL, -- Hard max
    overage_fee DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    overage_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default tiers
INSERT INTO store_tiers (tier_name, subscription_type, target_monthly_profit, min_active_listings, days_to_floor, fee_free_listings, subscription_listing_limit, max_total_listings, overage_fee, overage_enabled) VALUES
    ('Bronze', 'Premium', 3000.00, 5000, 45, 10000, 10000, 10000, 0.30, false),
    ('Silver', 'Anchor', 5000.00, 10000, 60, 25000, 25000, 25000, 0.05, false),
    ('Gold', 'Anchor', 8000.00, 15000, 75, 25000, 25000, 30000, 0.05, true),
    ('Platinum', 'Anchor', 10000.00, 20000, 90, 25000, 25000, 40000, 0.05, true);

-- =============================================================================
-- STORES
-- =============================================================================

CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_name TEXT NOT NULL,
    ebay_username TEXT NOT NULL UNIQUE,
    tier_id UUID NOT NULL REFERENCES store_tiers(id),
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Store dates
    ebay_registration_date DATE,
    onboarding_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Current metrics (denormalized for performance)
    current_active_listings INTEGER NOT NULL DEFAULT 0,
    current_soft_ceiling INTEGER,

    -- Client info
    client_id UUID, -- For future client portal

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stores_tier ON stores(tier_id);
CREATE INDEX idx_stores_active ON stores(is_active) WHERE is_active = true;
CREATE INDEX idx_stores_client ON stores(client_id) WHERE client_id IS NOT NULL;

-- =============================================================================
-- STORE AUTODS CONFIG
-- =============================================================================

CREATE TABLE store_autods_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    autods_store_id TEXT, -- AutoDS internal ID
    google_sheet_id TEXT, -- Store-specific sheet
    sheet_tab_name TEXT DEFAULT 'Import',

    -- AutoDS settings
    markup_percentage DECIMAL(5,2) NOT NULL DEFAULT 30.00,
    handling_time_days INTEGER NOT NULL DEFAULT 3,

    -- Sync status
    last_sync_at TIMESTAMPTZ,
    sync_status TEXT DEFAULT 'pending',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(store_id)
);

-- =============================================================================
-- STORE LISTING BUDGET (Daily tracking)
-- =============================================================================

CREATE TABLE store_listing_budget (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    budget_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Daily limits
    daily_target INTEGER NOT NULL DEFAULT 0,
    listings_added INTEGER NOT NULL DEFAULT 0,
    listings_removed INTEGER NOT NULL DEFAULT 0,

    -- End of day snapshot
    eod_active_count INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(store_id, budget_date)
);

CREATE INDEX idx_store_listing_budget_date ON store_listing_budget(budget_date);

-- =============================================================================
-- RAW PRODUCTS (Layer 0 - Ingested from Keepa)
-- =============================================================================

CREATE TABLE raw_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Amazon identifiers
    asin TEXT NOT NULL,
    amazon_url TEXT,

    -- Raw data from Keepa
    keepa_data JSONB NOT NULL DEFAULT '{}',

    -- Basic extracted fields
    title TEXT,
    brand TEXT,
    category TEXT,
    amazon_price DECIMAL(10,2),
    sales_rank INTEGER,
    review_count INTEGER,
    rating DECIMAL(3,2),

    -- Processing status
    is_processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ,

    -- Source tracking
    source TEXT DEFAULT 'keepa',
    source_batch_id TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(asin)
);

CREATE INDEX idx_raw_products_unprocessed ON raw_products(is_processed) WHERE is_processed = false;
CREATE INDEX idx_raw_products_category ON raw_products(category);
CREATE INDEX idx_raw_products_created ON raw_products(created_at);

-- =============================================================================
-- NORMALIZED PRODUCTS (Layer 1 - AI-cleaned by Claude)
-- =============================================================================

CREATE TABLE normalized_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_product_id UUID NOT NULL REFERENCES raw_products(id) ON DELETE CASCADE,

    -- Normalized fields (from Claude)
    normalized_title TEXT NOT NULL,
    normalized_category TEXT NOT NULL,
    normalized_subcategory TEXT,
    use_case TEXT,
    target_demographic TEXT,
    key_features JSONB DEFAULT '[]',

    -- Price analysis
    cost_price DECIMAL(10,2) NOT NULL, -- Amazon price at normalization
    suggested_sell_price DECIMAL(10,2),
    suggested_price_band TEXT, -- 'budget', 'mid', 'premium'

    -- Quality scores from AI
    listing_quality_score DECIMAL(3,2), -- 0-1 scale
    demand_confidence DECIMAL(3,2), -- 0-1 scale

    -- Processing metadata
    ai_model TEXT DEFAULT 'claude-3-sonnet',
    ai_response JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(raw_product_id)
);

CREATE INDEX idx_normalized_category ON normalized_products(normalized_category);
CREATE INDEX idx_normalized_subcategory ON normalized_products(normalized_subcategory);

-- =============================================================================
-- PATTERNS (Layer 2 - Learned profit patterns)
-- =============================================================================

CREATE TABLE patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Pattern fingerprint (unique combination)
    category TEXT NOT NULL,
    subcategory TEXT,
    use_case TEXT,
    price_band TEXT NOT NULL, -- 'budget', 'mid', 'premium'

    -- Aggregated metrics
    total_skus INTEGER NOT NULL DEFAULT 0,
    total_sales INTEGER NOT NULL DEFAULT 0,
    total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_profit DECIMAL(12,2) NOT NULL DEFAULT 0,
    avg_days_to_sale DECIMAL(6,2),
    return_rate DECIMAL(5,4) DEFAULT 0,

    -- Pattern scoring
    pattern_score DECIMAL(5,2) DEFAULT 0, -- Calculated score
    is_validated BOOLEAN NOT NULL DEFAULT false, -- Has enough data
    validation_date TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique fingerprint constraint
CREATE UNIQUE INDEX idx_pattern_fingerprint ON patterns(
    category,
    COALESCE(subcategory, ''),
    COALESCE(use_case, ''),
    price_band
);

CREATE INDEX idx_patterns_active ON patterns(is_active) WHERE is_active = true;
CREATE INDEX idx_patterns_validated ON patterns(is_validated) WHERE is_validated = true;
CREATE INDEX idx_patterns_score ON patterns(pattern_score DESC);

-- =============================================================================
-- SKUS (Layer 3 - Manufactured SKUs)
-- =============================================================================

CREATE TABLE skus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- References
    normalized_product_id UUID NOT NULL REFERENCES normalized_products(id),
    pattern_id UUID REFERENCES patterns(id),

    -- SKU identifier
    sku_code TEXT NOT NULL UNIQUE,

    -- Listing content
    title TEXT NOT NULL,
    description TEXT,
    bullet_points JSONB DEFAULT '[]',

    -- Pricing
    cost_price DECIMAL(10,2) NOT NULL,
    sell_price DECIMAL(10,2) NOT NULL,
    expected_profit DECIMAL(10,2) GENERATED ALWAYS AS (sell_price - cost_price - (sell_price * 0.13)) STORED, -- ~13% eBay fees

    -- Distribution tracking
    status sku_status NOT NULL DEFAULT 'draft',
    max_store_count INTEGER NOT NULL DEFAULT 3, -- Max 3 stores per SKU
    current_store_count INTEGER NOT NULL DEFAULT 0,

    -- Performance (aggregated from sales)
    total_sales INTEGER NOT NULL DEFAULT 0,
    total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_profit DECIMAL(12,2) NOT NULL DEFAULT 0,
    avg_days_to_sale DECIMAL(6,2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skus_status ON skus(status);
CREATE INDEX idx_skus_pattern ON skus(pattern_id);
CREATE INDEX idx_skus_available ON skus(status, current_store_count)
    WHERE status = 'ready' AND current_store_count < 3;

-- =============================================================================
-- STORE SKU ASSIGNMENTS (Layer 4 - Distribution)
-- =============================================================================

CREATE TABLE store_sku_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,

    -- eBay listing info
    ebay_listing_id TEXT,
    listing_url TEXT,
    listing_status listing_status NOT NULL DEFAULT 'draft',

    -- Dates
    listed_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Performance for this store
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0,
    profit DECIMAL(10,2) DEFAULT 0,

    -- Last activity
    last_sale_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(store_id, sku_id)
);

CREATE INDEX idx_assignments_store ON store_sku_assignments(store_id);
CREATE INDEX idx_assignments_sku ON store_sku_assignments(sku_id);
CREATE INDEX idx_assignments_status ON store_sku_assignments(listing_status);
CREATE INDEX idx_assignments_prune_candidates ON store_sku_assignments(last_sale_at, listed_at)
    WHERE listing_status = 'active';

-- =============================================================================
-- DISTRIBUTION QUEUE
-- =============================================================================

CREATE TABLE distribution_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Priority (higher = process first)
    priority INTEGER NOT NULL DEFAULT 0,

    -- Processing status
    status job_status NOT NULL DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    error_message TEXT,

    -- Reference to created assignment
    assignment_id UUID REFERENCES store_sku_assignments(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(sku_id, store_id)
);

CREATE INDEX idx_distribution_queue_pending ON distribution_queue(priority DESC, created_at)
    WHERE status = 'pending';

-- =============================================================================
-- EXPORT QUEUE (To Google Sheets)
-- =============================================================================

CREATE TABLE export_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Batch info
    batch_number INTEGER NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,

    -- Status
    status export_status NOT NULL DEFAULT 'pending',

    -- Google Sheets
    sheet_id TEXT,
    sheet_url TEXT,

    -- Processing
    exported_at TIMESTAMPTZ,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_export_batches_pending ON export_batches(store_id, status)
    WHERE status = 'pending';

CREATE TABLE export_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES export_batches(id),

    -- Status
    status export_status NOT NULL DEFAULT 'pending',

    -- Export data snapshot
    export_data JSONB NOT NULL,

    -- Processing
    exported_at TIMESTAMPTZ,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(assignment_id)
);

CREATE INDEX idx_export_queue_pending ON export_queue(status) WHERE status = 'pending';

-- =============================================================================
-- SALES
-- =============================================================================

CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    sku_id UUID NOT NULL REFERENCES skus(id),

    -- eBay order info
    ebay_order_id TEXT NOT NULL UNIQUE,
    ebay_order_date TIMESTAMPTZ NOT NULL,

    -- Financials
    sale_price DECIMAL(10,2) NOT NULL,
    ebay_fees DECIMAL(10,2) NOT NULL DEFAULT 0,
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    product_cost DECIMAL(10,2) NOT NULL,
    profit DECIMAL(10,2) GENERATED ALWAYS AS (sale_price - ebay_fees - shipping_cost - product_cost) STORED,

    -- Buyer info
    buyer_username TEXT,
    shipping_address_state TEXT,
    shipping_address_country TEXT DEFAULT 'US',

    -- Status
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

-- =============================================================================
-- ENFORCEMENT ACTIONS (Audit Log)
-- =============================================================================

CREATE TABLE enforcement_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Target
    assignment_id UUID REFERENCES store_sku_assignments(id),
    sku_id UUID REFERENCES skus(id),
    store_id UUID REFERENCES stores(id),

    -- Action
    action_type enforcement_action_type NOT NULL,
    reason TEXT NOT NULL,

    -- Before/after state
    state_before JSONB,
    state_after JSONB,

    -- Who/what initiated
    initiated_by TEXT NOT NULL DEFAULT 'system', -- 'system', 'admin', 'scheduler'

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_enforcement_assignment ON enforcement_actions(assignment_id);
CREATE INDEX idx_enforcement_store ON enforcement_actions(store_id);
CREATE INDEX idx_enforcement_type ON enforcement_actions(action_type);
CREATE INDEX idx_enforcement_date ON enforcement_actions(created_at);

-- =============================================================================
-- SYSTEM EVENTS (Job/Event Logging)
-- =============================================================================

CREATE TABLE system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Event info
    event_type TEXT NOT NULL,
    event_source TEXT NOT NULL, -- 'edge_function', 'scheduler', 'admin', etc.

    -- Context
    context JSONB DEFAULT '{}',

    -- Status
    status TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error', 'success'
    error_message TEXT,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_events_type ON system_events(event_type);
CREATE INDEX idx_system_events_status ON system_events(status);
CREATE INDEX idx_system_events_date ON system_events(created_at);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger to enforce max 3 stores per SKU
CREATE OR REPLACE FUNCTION check_max_stores_per_sku()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
BEGIN
    SELECT current_store_count INTO current_count
    FROM skus WHERE id = NEW.sku_id;

    IF current_count >= 3 THEN
        RAISE EXCEPTION 'SKU % already assigned to maximum 3 stores', NEW.sku_id;
    END IF;

    -- Increment store count
    UPDATE skus
    SET current_store_count = current_store_count + 1,
        updated_at = NOW()
    WHERE id = NEW.sku_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_max_stores
    BEFORE INSERT ON store_sku_assignments
    FOR EACH ROW
    EXECUTE FUNCTION check_max_stores_per_sku();

-- Trigger to decrement store count on assignment deletion
CREATE OR REPLACE FUNCTION decrement_store_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE skus
    SET current_store_count = GREATEST(0, current_store_count - 1),
        updated_at = NOW()
    WHERE id = OLD.sku_id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_decrement_store_count
    BEFORE DELETE ON store_sku_assignments
    FOR EACH ROW
    EXECUTE FUNCTION decrement_store_count();

-- Trigger to update store active listing count
CREATE OR REPLACE FUNCTION update_store_listing_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.listing_status = 'active' THEN
        UPDATE stores
        SET current_active_listings = current_active_listings + 1,
            updated_at = NOW()
        WHERE id = NEW.store_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.listing_status != 'active' AND NEW.listing_status = 'active' THEN
            UPDATE stores
            SET current_active_listings = current_active_listings + 1,
                updated_at = NOW()
            WHERE id = NEW.store_id;
        ELSIF OLD.listing_status = 'active' AND NEW.listing_status != 'active' THEN
            UPDATE stores
            SET current_active_listings = GREATEST(0, current_active_listings - 1),
                updated_at = NOW()
            WHERE id = NEW.store_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.listing_status = 'active' THEN
        UPDATE stores
        SET current_active_listings = GREATEST(0, current_active_listings - 1),
            updated_at = NOW()
        WHERE id = OLD.store_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_store_listing_count
    AFTER INSERT OR UPDATE OR DELETE ON store_sku_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_store_listing_count();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_store_autods_config_updated_at BEFORE UPDATE ON store_autods_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_store_listing_budget_updated_at BEFORE UPDATE ON store_listing_budget FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_raw_products_updated_at BEFORE UPDATE ON raw_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_normalized_products_updated_at BEFORE UPDATE ON normalized_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_patterns_updated_at BEFORE UPDATE ON patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_skus_updated_at BEFORE UPDATE ON skus FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_store_sku_assignments_updated_at BEFORE UPDATE ON store_sku_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- MATERIALIZED VIEW: Store Health Dashboard
-- =============================================================================

CREATE MATERIALIZED VIEW mv_store_health AS
SELECT
    s.id AS store_id,
    s.store_name,
    s.ebay_username,
    t.tier_name,
    s.is_active,
    s.current_active_listings,
    t.min_active_listings AS floor,
    t.max_total_listings AS ceiling,
    t.target_monthly_profit,
    ROUND((s.current_active_listings::DECIMAL / NULLIF(t.min_active_listings, 0)) * 100, 1) AS floor_percentage,
    COALESCE(
        (SELECT SUM(profit) FROM sales WHERE store_id = s.id AND ebay_order_date >= DATE_TRUNC('month', CURRENT_DATE)),
        0
    ) AS mtd_profit,
    COALESCE(
        (SELECT COUNT(*) FROM sales WHERE store_id = s.id AND ebay_order_date >= DATE_TRUNC('month', CURRENT_DATE)),
        0
    ) AS mtd_sales,
    s.onboarding_date,
    (CURRENT_DATE - s.onboarding_date) AS days_active
FROM stores s
JOIN store_tiers t ON s.tier_id = t.id
WHERE s.is_active = true;

CREATE UNIQUE INDEX idx_mv_store_health_id ON mv_store_health(store_id);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_store_health()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_store_health;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- ROW LEVEL SECURITY (Prepared for Supabase Auth)
-- =============================================================================

-- Enable RLS on sensitive tables
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_autods_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Admin policy (will be refined with actual auth)
CREATE POLICY admin_all_stores ON stores FOR ALL USING (true);
CREATE POLICY admin_all_autods_config ON store_autods_config FOR ALL USING (true);
CREATE POLICY admin_all_sales ON sales FOR ALL USING (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE store_tiers IS 'Tier configuration with eBay subscription limits and pricing';
COMMENT ON TABLE stores IS 'Individual eBay stores managed by the system';
COMMENT ON TABLE raw_products IS 'Layer 0: Raw product data ingested from Keepa API';
COMMENT ON TABLE normalized_products IS 'Layer 1: AI-normalized products processed by Claude';
COMMENT ON TABLE patterns IS 'Layer 2: Learned profit patterns from sales data';
COMMENT ON TABLE skus IS 'Layer 3: Manufactured SKUs ready for distribution';
COMMENT ON TABLE store_sku_assignments IS 'Layer 4: SKU distribution to specific stores';
COMMENT ON COLUMN skus.max_store_count IS 'Maximum number of stores this SKU can be assigned to (default 3)';
COMMENT ON TRIGGER trg_check_max_stores ON store_sku_assignments IS 'Enforces max 3 stores per SKU rule';
