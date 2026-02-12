-- eBay Integration Migration
-- Run this AFTER 001_extended_features.sql
-- Adds: eBay OAuth tokens, orders sync, policies

-- ============================================================================
-- EBAY TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ebay_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    ebay_username TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS idx_ebay_tokens_store ON ebay_tokens(store_id);
CREATE INDEX IF NOT EXISTS idx_ebay_tokens_expires ON ebay_tokens(expires_at);

-- ============================================================================
-- EBAY ORDERS (synced from eBay)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ebay_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    ebay_order_id TEXT NOT NULL UNIQUE,
    legacy_order_id TEXT,
    order_status TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    buyer_username TEXT,
    total_amount DECIMAL(10,2) NOT NULL,
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    marketplace_fee DECIMAL(10,2),
    order_date TIMESTAMPTZ NOT NULL,
    line_items JSONB DEFAULT '[]',
    shipping_address JSONB,
    tracking_number TEXT,
    shipping_carrier TEXT,
    shipped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebay_orders_store ON ebay_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_ebay_orders_status ON ebay_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_ebay_orders_date ON ebay_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_ebay_orders_payment ON ebay_orders(payment_status);

-- ============================================================================
-- EBAY BUSINESS POLICIES (cached from eBay)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ebay_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    policy_type TEXT NOT NULL, -- payment, return, fulfillment
    policy_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    policy_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id, policy_type, policy_id)
);

CREATE INDEX IF NOT EXISTS idx_ebay_policies_store ON ebay_policies(store_id);
CREATE INDEX IF NOT EXISTS idx_ebay_policies_type ON ebay_policies(policy_type);

-- ============================================================================
-- ADD EBAY COLUMNS TO STORES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'stores' AND column_name = 'ebay_connected') THEN
        ALTER TABLE stores ADD COLUMN ebay_connected BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'stores' AND column_name = 'ebay_connected_at') THEN
        ALTER TABLE stores ADD COLUMN ebay_connected_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'stores' AND column_name = 'ebay_seller_id') THEN
        ALTER TABLE stores ADD COLUMN ebay_seller_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'stores' AND column_name = 'default_payment_policy_id') THEN
        ALTER TABLE stores ADD COLUMN default_payment_policy_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'stores' AND column_name = 'default_return_policy_id') THEN
        ALTER TABLE stores ADD COLUMN default_return_policy_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'stores' AND column_name = 'default_fulfillment_policy_id') THEN
        ALTER TABLE stores ADD COLUMN default_fulfillment_policy_id TEXT;
    END IF;
END $$;

-- ============================================================================
-- EBAY LISTING SYNC
-- ============================================================================

-- Add eBay-specific columns to store_sku_assignments
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'store_sku_assignments' AND column_name = 'ebay_offer_id') THEN
        ALTER TABLE store_sku_assignments ADD COLUMN ebay_offer_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'store_sku_assignments' AND column_name = 'ebay_inventory_item_id') THEN
        ALTER TABLE store_sku_assignments ADD COLUMN ebay_inventory_item_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'store_sku_assignments' AND column_name = 'ebay_category_id') THEN
        ALTER TABLE store_sku_assignments ADD COLUMN ebay_category_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'store_sku_assignments' AND column_name = 'listing_source') THEN
        ALTER TABLE store_sku_assignments ADD COLUMN listing_source TEXT DEFAULT 'autods'; -- autods, ebay_api, manual
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignments_ebay_offer ON store_sku_assignments(ebay_offer_id) WHERE ebay_offer_id IS NOT NULL;

-- ============================================================================
-- COMPLIANCE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID REFERENCES skus(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    check_type TEXT NOT NULL, -- vero, restricted_category, word_blacklist, price_gouging
    status TEXT NOT NULL, -- passed, failed, warning
    details JSONB DEFAULT '{}',
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_sku ON compliance_checks(sku_id);
CREATE INDEX IF NOT EXISTS idx_compliance_store ON compliance_checks(store_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_checks(status) WHERE status != 'passed';

-- ============================================================================
-- RATE LIMITING TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_name TEXT NOT NULL, -- ebay, keepa, autods, zik
    endpoint TEXT NOT NULL,
    requests_made INTEGER DEFAULT 0,
    requests_limit INTEGER NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_duration_seconds INTEGER NOT NULL DEFAULT 60,
    last_request_at TIMESTAMPTZ,
    UNIQUE(api_name, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_api ON api_rate_limits(api_name);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update triggers for new tables
CREATE OR REPLACE FUNCTION update_ebay_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trg_ebay_tokens_updated_at
    BEFORE UPDATE ON ebay_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_ebay_orders_updated_at
    BEFORE UPDATE ON ebay_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_ebay_policies_updated_at
    BEFORE UPDATE ON ebay_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- eBay order summary view
CREATE OR REPLACE VIEW v_ebay_order_summary AS
SELECT
    s.id AS store_id,
    s.store_name,
    COUNT(o.id) AS total_orders,
    COUNT(o.id) FILTER (WHERE o.order_status = 'NOT_STARTED') AS awaiting_shipment,
    COUNT(o.id) FILTER (WHERE o.order_status = 'FULFILLED') AS shipped,
    SUM(o.total_amount) AS total_revenue,
    SUM(o.marketplace_fee) AS total_fees,
    SUM(o.total_amount - COALESCE(o.marketplace_fee, 0)) AS net_revenue,
    MAX(o.order_date) AS last_order_date
FROM stores s
LEFT JOIN ebay_orders o ON s.id = o.store_id
WHERE s.is_active = true
GROUP BY s.id, s.store_name;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run to verify:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'ebay%';
