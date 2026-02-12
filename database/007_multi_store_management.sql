-- Multi-Store Management Migration
-- Run AFTER 006_subscription_tiers.sql
-- Supports management of 75+ stores under unified fleet control

-- ============================================================================
-- STORE GROUPS
-- ============================================================================
-- Groups of stores managed together (e.g., all 75 managed service stores)

CREATE TABLE IF NOT EXISTS store_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    autods_account_id VARCHAR(255),  -- Shared AutoDS account
    user_id VARCHAR(255) NOT NULL,   -- Owner/admin
    store_ids UUID[] DEFAULT '{}',   -- Array of store IDs in group
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_store_groups_user
    ON store_groups(user_id);

-- Index for AutoDS account lookups
CREATE INDEX IF NOT EXISTS idx_store_groups_autods
    ON store_groups(autods_account_id);

-- ============================================================================
-- FLEET ALERTS
-- ============================================================================
-- Alerts for fleet-wide monitoring

CREATE TABLE IF NOT EXISTS fleet_alerts (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    type VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    store_ids UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for alert queries
CREATE INDEX IF NOT EXISTS idx_fleet_alerts_user
    ON fleet_alerts(user_id, acknowledged, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_alerts_severity
    ON fleet_alerts(severity, created_at DESC)
    WHERE NOT acknowledged;

CREATE INDEX IF NOT EXISTS idx_fleet_alerts_type
    ON fleet_alerts(type, created_at DESC);

-- ============================================================================
-- REBALANCE HISTORY
-- ============================================================================
-- Track rebalancing operations

CREATE TABLE IF NOT EXISTS rebalance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    pre_imbalance_score INTEGER NOT NULL,
    post_imbalance_score INTEGER NOT NULL,
    moves_executed INTEGER NOT NULL,
    moves_failed INTEGER DEFAULT 0,
    move_details JSONB NOT NULL,  -- Array of {skuId, fromStoreId, toStoreId}
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for rebalance history
CREATE INDEX IF NOT EXISTS idx_rebalance_group
    ON rebalance_history(group_id, executed_at DESC);

-- ============================================================================
-- SKU ROTATION HISTORY
-- ============================================================================
-- Track SKU rotations

CREATE TABLE IF NOT EXISTS rotation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    strategy VARCHAR(50) NOT NULL,  -- 'performance', 'age', 'random'
    skus_rotated INTEGER NOT NULL,
    skus_failed INTEGER DEFAULT 0,
    rotation_details JSONB NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for rotation history
CREATE INDEX IF NOT EXISTS idx_rotation_group
    ON rotation_history(group_id, executed_at DESC);

-- ============================================================================
-- FLEET METRICS SNAPSHOTS
-- ============================================================================
-- Historical fleet metrics for trend analysis

CREATE TABLE IF NOT EXISTS fleet_metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    snapshot_date DATE NOT NULL,

    -- Store counts
    total_stores INTEGER NOT NULL,
    active_stores INTEGER NOT NULL,
    paused_stores INTEGER DEFAULT 0,
    disabled_stores INTEGER DEFAULT 0,

    -- Health distribution
    health_excellent INTEGER DEFAULT 0,
    health_good INTEGER DEFAULT 0,
    health_fair INTEGER DEFAULT 0,
    health_poor INTEGER DEFAULT 0,
    health_critical INTEGER DEFAULT 0,

    -- Performance metrics
    total_listings INTEGER NOT NULL,
    total_orders INTEGER NOT NULL,
    total_revenue DECIMAL(12, 2) NOT NULL,
    total_profit DECIMAL(12, 2) NOT NULL,
    avg_health_score INTEGER,
    avg_defect_rate DECIMAL(5, 2),
    avg_late_shipment_rate DECIMAL(5, 2),
    avg_feedback_score DECIMAL(5, 2),
    capacity_utilization DECIMAL(5, 2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(group_id, snapshot_date)
);

-- Index for trend queries
CREATE INDEX IF NOT EXISTS idx_fleet_snapshots_group_date
    ON fleet_metrics_snapshots(group_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_snapshots_user_date
    ON fleet_metrics_snapshots(user_id, snapshot_date DESC);

-- ============================================================================
-- BULK OPERATION LOGS
-- ============================================================================
-- Track all bulk operations for audit

CREATE TABLE IF NOT EXISTS bulk_operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    group_id UUID REFERENCES store_groups(id) ON DELETE SET NULL,
    operation_type VARCHAR(100) NOT NULL,
    target_count INTEGER NOT NULL,
    successful_count INTEGER NOT NULL,
    failed_count INTEGER DEFAULT 0,
    parameters JSONB,  -- Operation parameters
    results JSONB,     -- Detailed results
    error_messages TEXT[],
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for operation logs
CREATE INDEX IF NOT EXISTS idx_bulk_ops_user
    ON bulk_operation_logs(user_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_bulk_ops_type
    ON bulk_operation_logs(operation_type, executed_at DESC);

-- ============================================================================
-- ADD COLUMNS TO STORES TABLE
-- ============================================================================
-- Additional fields for fleet management

ALTER TABLE stores ADD COLUMN IF NOT EXISTS fleet_group_id UUID REFERENCES store_groups(id);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS max_listings INTEGER DEFAULT 10000;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ramp_up_day INTEGER DEFAULT 0;  -- Day in 45-day ramp-up
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ramp_up_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS auto_optimize_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS last_rotation_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS rotation_count INTEGER DEFAULT 0;

-- Index for fleet group lookups
CREATE INDEX IF NOT EXISTS idx_stores_fleet_group
    ON stores(fleet_group_id)
    WHERE fleet_group_id IS NOT NULL;

-- Index for ramp-up tracking
CREATE INDEX IF NOT EXISTS idx_stores_ramp_up
    ON stores(ramp_up_day, ramp_up_started_at)
    WHERE ramp_up_day > 0 AND ramp_up_day < 45;

-- ============================================================================
-- ADD COLUMNS TO STORE_SKU_ASSIGNMENTS
-- ============================================================================
-- Track rotation and rebalancing

ALTER TABLE store_sku_assignments ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE store_sku_assignments ADD COLUMN IF NOT EXISTS rotated_from_store_id UUID;
ALTER TABLE store_sku_assignments ADD COLUMN IF NOT EXISTS rebalanced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE store_sku_assignments ADD COLUMN IF NOT EXISTS assignment_source VARCHAR(50) DEFAULT 'manual';
    -- 'manual', 'auto_assign', 'rotation', 'rebalance'

-- Index for tracking rotations
CREATE INDEX IF NOT EXISTS idx_assignments_rotated
    ON store_sku_assignments(rotated_at)
    WHERE rotated_at IS NOT NULL;

-- ============================================================================
-- MANAGED SERVICE TRACKING
-- ============================================================================
-- Track managed service account progress toward $3k/store goal

CREATE TABLE IF NOT EXISTS managed_service_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,

    -- 45-day ramp-up tracking
    ramp_up_day INTEGER NOT NULL,
    date DATE NOT NULL,

    -- Daily metrics
    listings_added INTEGER DEFAULT 0,
    total_listings INTEGER NOT NULL,
    orders_count INTEGER DEFAULT 0,
    revenue DECIMAL(12, 2) DEFAULT 0,
    profit DECIMAL(12, 2) DEFAULT 0,

    -- Health snapshot
    health_score INTEGER,
    defect_rate DECIMAL(5, 2),
    late_shipment_rate DECIMAL(5, 2),

    -- Targets vs actual
    target_listings INTEGER,
    target_revenue DECIMAL(12, 2),
    on_track BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(store_id, date)
);

-- Index for progress queries
CREATE INDEX IF NOT EXISTS idx_managed_progress_store
    ON managed_service_progress(store_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_managed_progress_group
    ON managed_service_progress(group_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_managed_progress_ramp
    ON managed_service_progress(ramp_up_day, on_track);

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- Fleet summary view
CREATE OR REPLACE VIEW fleet_summary AS
SELECT
    sg.id AS group_id,
    sg.name AS group_name,
    sg.user_id,
    COALESCE(array_length(sg.store_ids, 1), 0) AS store_count,
    COUNT(DISTINCT s.id) FILTER (WHERE s.is_active) AS active_stores,
    COUNT(DISTINCT s.id) FILTER (WHERE NOT s.is_active) AS inactive_stores,
    AVG(s.health_score) AS avg_health_score,
    COUNT(DISTINCT ssa.id) AS total_listings,
    COUNT(DISTINCT o.id) AS total_orders_30d,
    COALESCE(SUM(o.total_amount), 0) AS total_revenue_30d,
    COALESCE(SUM(o.profit), 0) AS total_profit_30d
FROM store_groups sg
LEFT JOIN stores s ON s.id = ANY(sg.store_ids)
LEFT JOIN store_sku_assignments ssa ON ssa.store_id = s.id AND ssa.listing_status = 'active'
LEFT JOIN orders o ON o.store_id = s.id AND o.order_date >= NOW() - INTERVAL '30 days'
GROUP BY sg.id, sg.name, sg.user_id;

-- Store health ranking view
CREATE OR REPLACE VIEW store_health_ranking AS
SELECT
    s.id AS store_id,
    s.store_name,
    s.user_id,
    s.fleet_group_id,
    s.health_score,
    s.health_status,
    RANK() OVER (PARTITION BY s.fleet_group_id ORDER BY s.health_score DESC) AS health_rank,
    COUNT(DISTINCT ssa.id) AS listing_count,
    COUNT(DISTINCT o.id) AS order_count_30d,
    COALESCE(SUM(o.profit), 0) AS profit_30d
FROM stores s
LEFT JOIN store_sku_assignments ssa ON ssa.store_id = s.id AND ssa.listing_status = 'active'
LEFT JOIN orders o ON o.store_id = s.id AND o.order_date >= NOW() - INTERVAL '30 days'
WHERE s.is_active = TRUE
GROUP BY s.id, s.store_name, s.user_id, s.fleet_group_id, s.health_score, s.health_status;

-- ============================================================================
-- FUNCTIONS FOR FLEET OPERATIONS
-- ============================================================================

-- Function to get stores needing attention
CREATE OR REPLACE FUNCTION get_stores_needing_attention(p_user_id VARCHAR)
RETURNS TABLE (
    store_id UUID,
    store_name VARCHAR,
    health_score INTEGER,
    issues TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.store_name,
        s.health_score,
        ARRAY_REMOVE(ARRAY[
            CASE WHEN (s.health_data->>'factors'->>'defectRate')::DECIMAL > 2
                 THEN 'High defect rate' END,
            CASE WHEN (s.health_data->>'factors'->>'lateShipmentRate')::DECIMAL > 7
                 THEN 'High late shipment rate' END,
            CASE WHEN (s.health_data->>'factors'->>'feedbackScore')::DECIMAL < 95
                 THEN 'Low feedback score' END,
            CASE WHEN s.health_score < 50
                 THEN 'Critical health score' END
        ], NULL)
    FROM stores s
    WHERE s.user_id = p_user_id
      AND s.is_active = TRUE
      AND (s.health_score < 60
           OR (s.health_data->>'factors'->>'defectRate')::DECIMAL > 2
           OR (s.health_data->>'factors'->>'lateShipmentRate')::DECIMAL > 7)
    ORDER BY s.health_score ASC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate fleet capacity
CREATE OR REPLACE FUNCTION calculate_fleet_capacity(p_group_id UUID)
RETURNS TABLE (
    total_capacity INTEGER,
    used_capacity INTEGER,
    available_capacity INTEGER,
    utilization_percent DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(s.max_listings), 0)::INTEGER AS total_capacity,
        COALESCE(COUNT(DISTINCT ssa.id), 0)::INTEGER AS used_capacity,
        (COALESCE(SUM(s.max_listings), 0) - COALESCE(COUNT(DISTINCT ssa.id), 0))::INTEGER AS available_capacity,
        CASE
            WHEN SUM(s.max_listings) > 0
            THEN ROUND((COUNT(DISTINCT ssa.id)::DECIMAL / SUM(s.max_listings)) * 100, 2)
            ELSE 0
        END AS utilization_percent
    FROM store_groups sg
    JOIN stores s ON s.id = ANY(sg.store_ids)
    LEFT JOIN store_sku_assignments ssa ON ssa.store_id = s.id AND ssa.listing_status = 'active'
    WHERE sg.id = p_group_id
      AND s.is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update fleet metrics snapshot daily
CREATE OR REPLACE FUNCTION auto_snapshot_fleet_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert daily snapshot if not exists
    INSERT INTO fleet_metrics_snapshots (
        group_id, user_id, snapshot_date,
        total_stores, active_stores, paused_stores, disabled_stores,
        health_excellent, health_good, health_fair, health_poor, health_critical,
        total_listings, total_orders, total_revenue, total_profit,
        avg_health_score, capacity_utilization
    )
    SELECT
        NEW.id,
        NEW.user_id,
        CURRENT_DATE,
        COALESCE(array_length(NEW.store_ids, 1), 0),
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ON CONFLICT (group_id, snapshot_date) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_fleet_metrics
    AFTER INSERT OR UPDATE ON store_groups
    FOR EACH ROW
    EXECUTE FUNCTION auto_snapshot_fleet_metrics();

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

ANALYZE store_groups;
ANALYZE fleet_alerts;
ANALYZE rebalance_history;
ANALYZE rotation_history;
ANALYZE fleet_metrics_snapshots;
ANALYZE bulk_operation_logs;
ANALYZE managed_service_progress;
