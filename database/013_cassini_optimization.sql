-- Cassini Optimization & Scale Architecture Migration
-- Run AFTER 012_research_validation.sql
-- Tables for Cassini algorithm optimization, validation pipeline metrics,
-- product circulation, and listing optimization at scale (150k+ products/month)

-- ============================================================================
-- UPDATE MAX STORE COUNT DEFAULT
-- ============================================================================
-- Increase max users per product from 3 to 6 for scale efficiency

ALTER TABLE skus
ALTER COLUMN max_store_count SET DEFAULT 6;

-- Update existing default-3 products to allow 6
UPDATE skus
SET max_store_count = 6
WHERE max_store_count = 3;

-- ============================================================================
-- CASSINI SCORES TABLE
-- ============================================================================
-- Stores Cassini algorithm optimization scores for listings

CREATE TABLE IF NOT EXISTS cassini_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,

    -- Overall score
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),

    -- Score breakdown (JSONB)
    breakdown JSONB NOT NULL DEFAULT '{}',
    -- Structure: { titleOptimization: {...}, sellerMetrics: {...}, shippingProfile: {...}, ... }

    -- Boosts and penalties
    boosts JSONB DEFAULT '[]',
    -- Structure: [{ type: 'top_rated', multiplier: 1.15, expiresAt: ... }]
    penalties JSONB DEFAULT '[]',
    -- Structure: [{ type: 'defects', severity: 'moderate', impact: 25, reason: '...' }]

    -- Recommendations
    recommendations TEXT[] DEFAULT '{}',

    -- Projected visibility
    projected_visibility VARCHAR(20) NOT NULL
        CHECK (projected_visibility IN ('high', 'medium', 'low', 'suppressed')),

    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(listing_id)
);

CREATE INDEX IF NOT EXISTS idx_cassini_scores_listing ON cassini_scores(listing_id);
CREATE INDEX IF NOT EXISTS idx_cassini_scores_overall ON cassini_scores(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_cassini_scores_visibility ON cassini_scores(projected_visibility, overall_score DESC);

-- ============================================================================
-- UPDATE SUPPLIER VALIDATIONS FOR ENHANCED SHIPPING
-- ============================================================================
-- Add shipping validation and Cassini impact columns

ALTER TABLE supplier_validations
ADD COLUMN IF NOT EXISTS shipping_validation JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS cassini_impact JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(20) DEFAULT 'unknown';

-- Update index to include fulfillment type
CREATE INDEX IF NOT EXISTS idx_supplier_validations_fulfillment
ON supplier_validations(fulfillment_type, overall_score DESC);

-- ============================================================================
-- VALIDATION EVENTS TABLE (Pipeline Metrics)
-- ============================================================================
-- Tracks individual validation events for pipeline measurement

CREATE TABLE IF NOT EXISTS validation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    asin VARCHAR(20),

    -- Event details
    stage VARCHAR(50) NOT NULL
        CHECK (stage IN ('discovery', 'supplier_validation', 'cassini_validation',
                         'competition_analysis', 'risk_assessment', 'final_approval')),
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('started', 'passed', 'failed', 'skipped')),

    -- Scoring
    score INTEGER CHECK (score >= 0 AND score <= 100),

    -- Performance
    duration_ms INTEGER,

    -- Failure details
    failure_reason TEXT,

    -- Additional metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_events_product ON validation_events(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_events_stage ON validation_events(stage, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_events_created ON validation_events(created_at DESC);

-- Partition by month for scale (optional, for very high volume)
-- CREATE TABLE validation_events_2026_01 PARTITION OF validation_events
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- ============================================================================
-- VALIDATION BATCH EVENTS TABLE
-- ============================================================================
-- Aggregated metrics per batch operation

CREATE TABLE IF NOT EXISTS validation_batch_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL,
    stage VARCHAR(50) NOT NULL,

    -- Metrics
    processed INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    avg_duration_ms INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_batch_events_batch ON validation_batch_events(batch_id, created_at DESC);

-- ============================================================================
-- PIPELINE RUNS TABLE
-- ============================================================================
-- Tracks complete pipeline execution runs

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

    -- Metrics
    total_products INTEGER NOT NULL DEFAULT 0,
    processed INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    avg_score DECIMAL(5, 2) DEFAULT 0,
    throughput_per_minute DECIMAL(10, 2) DEFAULT 0,

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_completed ON pipeline_runs(completed_at DESC)
    WHERE status = 'completed';

-- ============================================================================
-- UPDATE SKUS FOR PRODUCT CIRCULATION
-- ============================================================================
-- Add lifecycle and health tracking columns

ALTER TABLE skus
ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 50 CHECK (health_score >= 0 AND health_score <= 100),
ADD COLUMN IF NOT EXISTS validation_score INTEGER CHECK (validation_score >= 0 AND validation_score <= 100),
ADD COLUMN IF NOT EXISTS cassini_score INTEGER CHECK (cassini_score >= 0 AND cassini_score <= 100),
ADD COLUMN IF NOT EXISTS estimated_profit_margin DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS inventory_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS pruned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS recycled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_sale_at TIMESTAMP WITH TIME ZONE;

-- Add status options for product circulation
ALTER TABLE skus
DROP CONSTRAINT IF EXISTS skus_status_check;

ALTER TABLE skus
ADD CONSTRAINT skus_status_check
    CHECK (status IS NULL OR status IN (
        'draft', 'pending', 'ready', 'active',
        'underperforming', 'paused', 'pruned', 'recycled',
        'error', 'validating'
    ));

CREATE INDEX IF NOT EXISTS idx_skus_health ON skus(health_score DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_skus_last_sale ON skus(last_sale_at DESC NULLS LAST) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_skus_status ON skus(status, created_at DESC);

-- ============================================================================
-- OPTIMIZATION HISTORY TABLE
-- ============================================================================
-- Tracks all listing optimizations for analytics

CREATE TABLE IF NOT EXISTS optimization_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,

    -- Optimization details
    optimization_type VARCHAR(30) NOT NULL
        CHECK (optimization_type IN ('price', 'title', 'description', 'photos', 'item_specifics', 'shipping')),

    -- Values
    previous_value JSONB NOT NULL,
    new_value JSONB NOT NULL,

    -- Expected impact
    expected_impact JSONB DEFAULT '{}',
    -- Structure: { profitChange: 50, conversionChange: 5, visibilityChange: 10 }

    -- Confidence and application
    confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
    auto_applied BOOLEAN DEFAULT false,

    -- Actual results (filled in later for analytics)
    actual_impact JSONB DEFAULT '{}',
    measured_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_optimization_history_listing ON optimization_history(listing_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_optimization_history_type ON optimization_history(optimization_type, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_optimization_history_auto ON optimization_history(auto_applied, applied_at DESC);

-- ============================================================================
-- UPDATE LISTINGS FOR OPTIMIZATION TRACKING
-- ============================================================================

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS cassini_score INTEGER CHECK (cassini_score >= 0 AND cassini_score <= 100),
ADD COLUMN IF NOT EXISTS last_price_update TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS previous_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS last_title_update TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS previous_title TEXT,
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_position INTEGER;

CREATE INDEX IF NOT EXISTS idx_listings_cassini ON listings(cassini_score DESC) WHERE status = 'active';

-- ============================================================================
-- UPDATE STORE_SKU_ASSIGNMENTS FOR CIRCULATION
-- ============================================================================

ALTER TABLE store_sku_assignments
ADD COLUMN IF NOT EXISTS replaced_sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- ADD COMPETITOR PRICES TO COMPETITION ANALYSES
-- ============================================================================

ALTER TABLE competition_analyses
ADD COLUMN IF NOT EXISTS competitor_prices JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS asin VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_competition_analyses_asin ON competition_analyses(asin, analyzed_at DESC);

-- ============================================================================
-- SCALE METRICS VIEW
-- ============================================================================
-- Aggregated view for scale target tracking

CREATE OR REPLACE VIEW v_scale_metrics AS
SELECT
    (SELECT COUNT(*) FROM skus WHERE status = 'ready') AS products_ready,
    (SELECT COUNT(*) FROM skus WHERE status = 'active') AS products_active,
    (SELECT COUNT(*) FROM skus WHERE status = 'pruned' AND pruned_at >= NOW() - INTERVAL '24 hours') AS pruned_24h,
    (SELECT COUNT(*) FROM skus WHERE created_at >= NOW() - INTERVAL '24 hours') AS discovered_24h,
    (SELECT COUNT(*) FROM skus WHERE activated_at >= NOW() - INTERVAL '24 hours') AS activated_24h,
    (SELECT AVG(health_score) FROM skus WHERE status = 'active') AS avg_health_score,
    (SELECT AVG(max_store_count) FROM skus WHERE status IN ('ready', 'active')) AS avg_max_stores,
    (SELECT AVG(current_store_count) FROM skus WHERE status IN ('ready', 'active')) AS avg_current_stores,
    (SELECT COUNT(*) FROM users WHERE status = 'active') AS active_users,
    (SELECT COUNT(*) FROM stores WHERE is_active = true) AS active_stores,
    6 AS users_per_product, -- Current max
    150000 AS target_monthly_products,
    25000 AS target_unique_products;

-- ============================================================================
-- PIPELINE HEALTH VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_pipeline_health AS
WITH recent_events AS (
    SELECT
        stage,
        status,
        score,
        duration_ms,
        created_at
    FROM validation_events
    WHERE created_at >= NOW() - INTERVAL '24 hours'
)
SELECT
    stage,
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE status = 'passed') AS passed,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'passed') / NULLIF(COUNT(*), 0), 2) AS pass_rate,
    ROUND(AVG(score), 2) AS avg_score,
    ROUND(AVG(duration_ms), 2) AS avg_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_duration_ms
FROM recent_events
GROUP BY stage
ORDER BY
    CASE stage
        WHEN 'discovery' THEN 1
        WHEN 'supplier_validation' THEN 2
        WHEN 'cassini_validation' THEN 3
        WHEN 'competition_analysis' THEN 4
        WHEN 'risk_assessment' THEN 5
        WHEN 'final_approval' THEN 6
        ELSE 99
    END;

-- ============================================================================
-- PRODUCT CIRCULATION VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_product_circulation AS
SELECT
    s.id AS sku_id,
    s.sku_code,
    s.title,
    s.status,
    s.health_score,
    s.current_store_count,
    s.max_store_count,
    s.max_store_count - s.current_store_count AS available_slots,
    s.last_sale_at,
    EXTRACT(DAY FROM NOW() - COALESCE(s.last_sale_at, s.created_at)) AS days_since_last_sale,
    s.estimated_profit_margin,
    s.cassini_score,
    CASE
        WHEN s.health_score >= 70 THEN 'healthy'
        WHEN s.health_score >= 40 THEN 'at_risk'
        ELSE 'critical'
    END AS health_status,
    CASE
        WHEN s.health_score < 30 AND EXTRACT(DAY FROM NOW() - COALESCE(s.last_sale_at, s.created_at)) > 21 THEN 'prune'
        WHEN s.health_score < 50 THEN 'warn'
        ELSE 'monitor'
    END AS recommended_action
FROM skus s
WHERE s.status IN ('active', 'underperforming')
ORDER BY s.health_score ASC, s.last_sale_at ASC NULLS FIRST;

-- ============================================================================
-- FUNCTIONS FOR CIRCULATION
-- ============================================================================

-- Function to update product health scores
CREATE OR REPLACE FUNCTION update_product_health_scores()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER := 0;
    product RECORD;
BEGIN
    FOR product IN
        SELECT
            s.id,
            s.last_sale_at,
            s.current_store_count,
            s.estimated_profit_margin,
            (SELECT COUNT(*) FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             WHERE oi.sku_id = s.id
             AND o.order_date >= NOW() - INTERVAL '30 days') AS recent_sales
        FROM skus s
        WHERE s.status IN ('active', 'underperforming')
    LOOP
        DECLARE
            new_score INTEGER := 50;
            days_without_sale INTEGER;
        BEGIN
            -- Calculate days without sale
            days_without_sale := EXTRACT(DAY FROM NOW() - COALESCE(product.last_sale_at, NOW() - INTERVAL '999 days'));

            -- Recent sales boost
            IF days_without_sale = 0 THEN
                new_score := new_score + 25;
            ELSIF days_without_sale <= 3 THEN
                new_score := new_score + 20;
            ELSIF days_without_sale <= 7 THEN
                new_score := new_score + 10;
            ELSIF days_without_sale <= 14 THEN
                new_score := new_score + 0;
            ELSIF days_without_sale <= 21 THEN
                new_score := new_score - 15;
            ELSE
                new_score := new_score - 30;
            END IF;

            -- Total sales history
            IF product.recent_sales >= 10 THEN
                new_score := new_score + 15;
            ELSIF product.recent_sales >= 5 THEN
                new_score := new_score + 10;
            ELSIF product.recent_sales >= 1 THEN
                new_score := new_score + 5;
            END IF;

            -- Profit margin
            IF product.estimated_profit_margin >= 25 THEN
                new_score := new_score + 10;
            ELSIF product.estimated_profit_margin >= 15 THEN
                new_score := new_score + 5;
            ELSIF product.estimated_profit_margin < 10 THEN
                new_score := new_score - 10;
            END IF;

            -- Active assignments indicate demand
            IF product.current_store_count >= 4 THEN
                new_score := new_score + 5;
            ELSIF product.current_store_count = 0 THEN
                new_score := new_score - 10;
            END IF;

            -- Clamp score
            new_score := GREATEST(0, LEAST(100, new_score));

            -- Update
            UPDATE skus
            SET health_score = new_score,
                status = CASE
                    WHEN new_score < 30 THEN 'underperforming'
                    WHEN status = 'underperforming' AND new_score >= 50 THEN 'active'
                    ELSE status
                END
            WHERE id = product.id;

            updated_count := updated_count + 1;
        END;
    END LOOP;

    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCHEDULED JOBS (Requires pg_cron extension)
-- ============================================================================
-- These are examples - actual scheduling depends on infrastructure

-- Example: Update health scores daily
-- SELECT cron.schedule('update-health-scores', '0 2 * * *', 'SELECT update_product_health_scores()');

-- ============================================================================
-- ANALYZE NEW TABLES
-- ============================================================================

ANALYZE cassini_scores;
ANALYZE validation_events;
ANALYZE validation_batch_events;
ANALYZE pipeline_runs;
ANALYZE optimization_history;
