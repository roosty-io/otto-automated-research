-- Research & Validation System Migration
-- Run AFTER 011_profit_tracking.sql
-- Tables for robust product research and validation

-- ============================================================================
-- SUPPLIER VALIDATIONS TABLE
-- ============================================================================
-- Stores Keepa-based supplier validation results

CREATE TABLE IF NOT EXISTS supplier_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asin VARCHAR(20) NOT NULL UNIQUE,

    -- Validation result
    is_valid BOOLEAN NOT NULL DEFAULT false,
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),

    -- Detailed checks (JSONB)
    checks JSONB NOT NULL DEFAULT '{}',
    -- Structure: { priceStability: {...}, stockAvailability: {...}, ... }

    -- Supplier data snapshot
    supplier_data JSONB NOT NULL DEFAULT '{}',
    -- Structure: { currentPrice, avgPrice30d, priceVolatility, inStock, isFBA, ... }

    -- Recommendations
    recommendations TEXT[] DEFAULT '{}',
    blockers TEXT[] DEFAULT '{}',
    warnings TEXT[] DEFAULT '{}',

    -- Metadata
    validated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_validations_valid ON supplier_validations(is_valid, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_validations_updated ON supplier_validations(validated_at DESC);

-- ============================================================================
-- COMPETITION ANALYSES TABLE
-- ============================================================================
-- Stores eBay competition analysis results

CREATE TABLE IF NOT EXISTS competition_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id VARCHAR(100) NOT NULL,
    product_title TEXT NOT NULL,

    -- Competition metrics
    total_competitors INTEGER NOT NULL DEFAULT 0,
    competition_level VARCHAR(20) NOT NULL
        CHECK (competition_level IN ('none', 'low', 'medium', 'high', 'saturated')),

    -- Price analysis
    lowest_price DECIMAL(10, 2),
    highest_price DECIMAL(10, 2),
    average_price DECIMAL(10, 2),
    median_price DECIMAL(10, 2),
    price_spread DECIMAL(5, 2), -- % difference

    -- Our position (if applicable)
    our_position INTEGER,

    -- Recommendations
    pricing_recommendation VARCHAR(20)
        CHECK (pricing_recommendation IN ('hold', 'lower', 'raise', 'delist')),
    suggested_price DECIMAL(10, 2),
    reasoning TEXT,

    -- Top competitors (JSONB array)
    top_competitors JSONB DEFAULT '[]',

    -- Metadata
    analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_product ON competition_analyses(product_id, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_competition_level ON competition_analyses(competition_level, analyzed_at DESC);

-- ============================================================================
-- COMPETITION ALERTS TABLE
-- ============================================================================
-- Stores competition-related alerts

CREATE TABLE IF NOT EXISTS competition_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id VARCHAR(100) NOT NULL,

    type VARCHAR(30) NOT NULL
        CHECK (type IN ('price_undercut', 'new_competitor', 'competitor_exit', 'price_war', 'market_saturation')),
    severity VARCHAR(10) NOT NULL
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',

    -- Status
    is_read BOOLEAN DEFAULT false,
    is_acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_alerts_unread ON competition_alerts(is_read, created_at DESC) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_competition_alerts_product ON competition_alerts(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competition_alerts_severity ON competition_alerts(severity, created_at DESC);

-- ============================================================================
-- PRODUCT RISK ASSESSMENTS TABLE
-- ============================================================================
-- Stores risk assessment results for products

CREATE TABLE IF NOT EXISTS product_risk_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id VARCHAR(100) NOT NULL UNIQUE,
    title TEXT NOT NULL,

    -- Overall risk
    overall_risk_score INTEGER NOT NULL CHECK (overall_risk_score >= 0 AND overall_risk_score <= 100),
    risk_level VARCHAR(10) NOT NULL
        CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

    -- Detailed risks (JSONB)
    risks JSONB NOT NULL DEFAULT '{}',
    -- Structure: { policyCompliance: {...}, brandRestriction: {...}, ... }

    -- Issues
    blockers JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    mitigations TEXT[] DEFAULT '{}',

    -- Metadata
    assessed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_level ON product_risk_assessments(risk_level, overall_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_score ON product_risk_assessments(overall_risk_score DESC);

-- ============================================================================
-- SKU WAITLIST TABLE
-- ============================================================================
-- Manages waitlist for products at capacity

CREATE TABLE IF NOT EXISTS sku_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Position and priority
    position INTEGER NOT NULL,
    priority INTEGER DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),

    -- Status
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,

    UNIQUE(sku_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_sku ON sku_waitlist(sku_id, priority DESC, position ASC);
CREATE INDEX IF NOT EXISTS idx_waitlist_user ON sku_waitlist(user_id, requested_at DESC);

-- ============================================================================
-- SKU ASSIGNMENT EVENTS TABLE
-- ============================================================================
-- Audit log for product assignments

CREATE TABLE IF NOT EXISTS sku_assignment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Event details
    action VARCHAR(20) NOT NULL
        CHECK (action IN ('assigned', 'released', 'expired', 'transferred')),
    slot_number INTEGER,
    reason VARCHAR(50),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_events_sku ON sku_assignment_events(sku_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_events_user ON sku_assignment_events(user_id, created_at DESC);

-- ============================================================================
-- ADD COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add columns to store_sku_assignments for uniqueness enforcement
ALTER TABLE store_sku_assignments
ADD COLUMN IF NOT EXISTS slot_number INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMP WITH TIME ZONE;

-- Add columns to skus for better tracking
ALTER TABLE skus
ADD COLUMN IF NOT EXISTS max_store_count INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS current_store_count INTEGER DEFAULT 0;

-- Add ebay_item_id to raw_products if not exists
ALTER TABLE raw_products
ADD COLUMN IF NOT EXISTS ebay_item_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS ebay_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS sold_count INTEGER,
ADD COLUMN IF NOT EXISTS watch_count INTEGER,
ADD COLUMN IF NOT EXISTS seller_id VARCHAR(100);

-- Create unique index on ebay_item_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_products_ebay_item
ON raw_products(ebay_item_id) WHERE ebay_item_id IS NOT NULL;

-- ============================================================================
-- RESEARCH BATCH TABLE
-- ============================================================================
-- Tracks batch research operations

CREATE TABLE IF NOT EXISTS research_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Query details
    query JSONB NOT NULL,
    sources TEXT[] DEFAULT '{}',

    -- Results
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    products_found INTEGER DEFAULT 0,
    products_validated INTEGER DEFAULT 0,
    products_approved INTEGER DEFAULT 0,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,

    -- Errors
    errors TEXT[] DEFAULT '{}',
    warnings TEXT[] DEFAULT '{}',

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_batches_user ON research_batches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_batches_status ON research_batches(status, created_at DESC);

-- ============================================================================
-- VALIDATION RULES TABLE
-- ============================================================================
-- Configurable validation rules

CREATE TABLE IF NOT EXISTS validation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL
        CHECK (category IN ('supplier', 'competition', 'risk', 'pricing', 'policy')),

    -- Rule configuration
    is_enabled BOOLEAN DEFAULT true,
    is_blocker BOOLEAN DEFAULT false, -- If true, failing this rule blocks the product
    severity VARCHAR(10) DEFAULT 'medium'
        CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),

    -- Thresholds
    threshold_value DECIMAL(10, 4),
    threshold_operator VARCHAR(10)
        CHECK (threshold_operator IN ('gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'contains', 'not_contains')),

    -- Description
    description TEXT,
    failure_message TEXT,
    mitigation_suggestion TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default validation rules
INSERT INTO validation_rules (name, category, is_enabled, is_blocker, severity, threshold_value, threshold_operator, description, failure_message, mitigation_suggestion)
VALUES
    ('min_profit_margin', 'pricing', true, true, 'high', 15, 'gte', 'Minimum profit margin percentage', 'Profit margin below minimum threshold', 'Find cheaper supplier or raise price'),
    ('max_price_volatility', 'supplier', true, false, 'medium', 30, 'lte', 'Maximum supplier price volatility', 'Supplier price too volatile', 'Set up price monitoring alerts'),
    ('min_stock_confidence', 'supplier', true, true, 'high', 50, 'gte', 'Minimum stock confidence score', 'Low supplier stock confidence', 'Verify stock or find backup supplier'),
    ('max_competitors', 'competition', true, false, 'medium', 50, 'lte', 'Maximum number of competitors', 'Too many competitors in market', 'Consider niche variations'),
    ('max_risk_score', 'risk', true, true, 'critical', 75, 'lte', 'Maximum overall risk score', 'Product risk too high', 'Review risk factors and mitigate'),
    ('min_sales_rank', 'supplier', true, false, 'low', 500000, 'lte', 'Maximum acceptable Amazon sales rank', 'Low demand product', 'Ensure adequate margin buffer')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for product validation summary
CREATE OR REPLACE VIEW v_product_validation_summary AS
SELECT
    rp.id AS raw_product_id,
    rp.asin,
    rp.ebay_item_id,
    rp.title,
    rp.ebay_price,
    rp.amazon_price,
    sv.is_valid AS supplier_valid,
    sv.overall_score AS supplier_score,
    pra.risk_level,
    pra.overall_risk_score AS risk_score,
    ca.competition_level,
    ca.total_competitors,
    CASE
        WHEN sv.is_valid = false THEN 'supplier_failed'
        WHEN pra.risk_level IN ('high', 'critical') THEN 'high_risk'
        WHEN ca.competition_level = 'saturated' THEN 'saturated'
        WHEN sv.is_valid = true AND pra.risk_level IN ('low', 'medium') THEN 'approved'
        ELSE 'pending'
    END AS validation_status,
    rp.created_at
FROM raw_products rp
LEFT JOIN supplier_validations sv ON sv.asin = rp.asin
LEFT JOIN product_risk_assessments pra ON pra.product_id = rp.id::TEXT
LEFT JOIN LATERAL (
    SELECT * FROM competition_analyses ca2
    WHERE ca2.product_id = rp.id::TEXT
    ORDER BY ca2.analyzed_at DESC
    LIMIT 1
) ca ON true
WHERE rp.is_processed = false
ORDER BY
    CASE WHEN sv.is_valid = true THEN 0 ELSE 1 END,
    sv.overall_score DESC NULLS LAST,
    pra.overall_risk_score ASC NULLS LAST;

-- View for uniqueness distribution
CREATE OR REPLACE VIEW v_sku_distribution AS
SELECT
    s.id AS sku_id,
    s.sku_code,
    s.title,
    s.max_store_count,
    s.current_store_count,
    s.max_store_count - s.current_store_count AS available_slots,
    CASE
        WHEN s.current_store_count = 0 THEN 'unassigned'
        WHEN s.current_store_count >= s.max_store_count THEN 'fully_distributed'
        ELSE 'partially_distributed'
    END AS distribution_status,
    (
        SELECT COUNT(DISTINCT w.user_id)
        FROM sku_waitlist w
        WHERE w.sku_id = s.id
    ) AS waitlist_count
FROM skus s
WHERE s.status = 'ready'
ORDER BY s.current_store_count DESC, s.created_at DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to check if product passes all validation rules
CREATE OR REPLACE FUNCTION check_product_validation(
    p_product_id UUID
)
RETURNS TABLE (
    rule_name VARCHAR,
    passed BOOLEAN,
    severity VARCHAR,
    message TEXT
) AS $$
BEGIN
    -- This is a placeholder - actual implementation would
    -- evaluate rules against product data
    RETURN QUERY
    SELECT
        vr.name,
        true AS passed,
        vr.severity,
        vr.description AS message
    FROM validation_rules vr
    WHERE vr.is_enabled = true
    LIMIT 0; -- Placeholder return
END;
$$ LANGUAGE plpgsql;

-- Function to process waitlist when slot becomes available
CREATE OR REPLACE FUNCTION process_sku_waitlist(
    p_sku_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_next_entry RECORD;
    v_availability RECORD;
BEGIN
    -- Check if slot available
    SELECT max_store_count, current_store_count
    INTO v_availability
    FROM skus
    WHERE id = p_sku_id;

    IF v_availability.current_store_count >= v_availability.max_store_count THEN
        RETURN NULL; -- No slots available
    END IF;

    -- Get next in waitlist
    SELECT *
    INTO v_next_entry
    FROM sku_waitlist
    WHERE sku_id = p_sku_id
    ORDER BY priority DESC, position ASC
    LIMIT 1;

    IF v_next_entry IS NULL THEN
        RETURN NULL; -- No one waiting
    END IF;

    -- Remove from waitlist
    DELETE FROM sku_waitlist WHERE id = v_next_entry.id;

    RETURN v_next_entry.user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to process waitlist when assignment is released
CREATE OR REPLACE FUNCTION trigger_process_waitlist()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.listing_status IN ('ended', 'pruned') AND OLD.listing_status NOT IN ('ended', 'pruned') THEN
        -- Decrement store count
        UPDATE skus
        SET current_store_count = GREATEST(0, current_store_count - 1)
        WHERE id = NEW.sku_id;

        -- Try to process waitlist
        PERFORM process_sku_waitlist(NEW.sku_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_process_waitlist
    AFTER UPDATE OF listing_status ON store_sku_assignments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_process_waitlist();

-- ============================================================================
-- ANALYZE
-- ============================================================================

ANALYZE supplier_validations;
ANALYZE competition_analyses;
ANALYZE competition_alerts;
ANALYZE product_risk_assessments;
ANALYZE sku_waitlist;
ANALYZE sku_assignment_events;
ANALYZE research_batches;
ANALYZE validation_rules;
