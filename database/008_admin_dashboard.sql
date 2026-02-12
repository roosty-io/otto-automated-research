-- Admin Dashboard Migration
-- Run AFTER 007_multi_store_management.sql
-- Supports managed service admin operations and audit logging

-- ============================================================================
-- ADMIN ACTION LOGS
-- ============================================================================
-- Comprehensive audit trail of all admin actions

CREATE TABLE IF NOT EXISTS admin_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('store', 'group', 'fleet', 'sku', 'system')),
    target_id VARCHAR(255) NOT NULL,
    details JSONB DEFAULT '{}',
    result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failed', 'partial')),
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin
    ON admin_action_logs(admin_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_logs_action
    ON admin_action_logs(action, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_logs_target
    ON admin_action_logs(target_type, target_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_logs_result
    ON admin_action_logs(result, executed_at DESC)
    WHERE result != 'success';

-- ============================================================================
-- ADMIN SESSIONS
-- ============================================================================
-- Track admin login sessions

CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    actions_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin
    ON admin_sessions(admin_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_active
    ON admin_sessions(is_active, started_at DESC)
    WHERE is_active = TRUE;

-- ============================================================================
-- SYSTEM SETTINGS
-- ============================================================================
-- Configurable system settings for managed service

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(255)
);

-- Insert default settings
INSERT INTO system_settings (key, value, description, category) VALUES
('ramp_up_schedule', '{"day1_listings": 50, "day45_target_profit": 3000}', 'Ramp-up schedule configuration', 'ramp_up'),
('compliance_thresholds', '{"max_defect_rate": 2.0, "max_late_shipment": 7.0, "min_feedback": 95.0}', 'eBay compliance thresholds', 'compliance'),
('automation_defaults', '{"auto_listing": true, "auto_repricing": true, "auto_pruning": true}', 'Default automation settings for new stores', 'automation'),
('alert_settings', '{"email_critical": true, "email_warning": false, "slack_enabled": false}', 'Alert notification settings', 'notifications'),
('managed_service_config', '{"target_profit_per_store": 3000, "ramp_up_days": 45, "min_health_score": 50}', 'Managed service configuration', 'managed_service')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- DAILY SNAPSHOTS
-- ============================================================================
-- Comprehensive daily snapshots for trend analysis

CREATE TABLE IF NOT EXISTS daily_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    snapshot_type VARCHAR(50) NOT NULL,  -- 'fleet', 'store', 'financial'
    target_id VARCHAR(255),  -- Store/group ID if applicable
    metrics JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(snapshot_date, snapshot_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date
    ON daily_snapshots(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_type
    ON daily_snapshots(snapshot_type, snapshot_date DESC);

-- ============================================================================
-- ALERT RULES
-- ============================================================================
-- Configurable alert rules for automated monitoring

CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL,  -- 'threshold', 'change', 'pattern'
    condition JSONB NOT NULL,  -- e.g., {"metric": "defect_rate", "operator": ">", "value": 2.0}
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    is_active BOOLEAN DEFAULT TRUE,
    notify_channels TEXT[],  -- ['email', 'slack', 'dashboard']
    cooldown_minutes INTEGER DEFAULT 60,  -- Prevent alert spam
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default alert rules
INSERT INTO alert_rules (name, description, rule_type, condition, severity, notify_channels) VALUES
('High Defect Rate', 'Alert when defect rate exceeds eBay threshold', 'threshold',
 '{"metric": "defect_rate", "operator": ">", "value": 2.0}', 'critical', ARRAY['email', 'dashboard']),
('High Late Shipment', 'Alert when late shipment rate is too high', 'threshold',
 '{"metric": "late_shipment_rate", "operator": ">", "value": 7.0}', 'warning', ARRAY['dashboard']),
('Low Feedback Score', 'Alert when feedback drops below threshold', 'threshold',
 '{"metric": "feedback_score", "operator": "<", "value": 95.0}', 'warning', ARRAY['dashboard']),
('Ramp-Up Behind Schedule', 'Alert when store falls behind ramp-up schedule', 'pattern',
 '{"pattern": "ramp_up_behind", "days_threshold": 3}', 'warning', ARRAY['email', 'dashboard']),
('No Sales Activity', 'Alert when store has no sales for extended period', 'threshold',
 '{"metric": "days_without_sale", "operator": ">", "value": 5}', 'warning', ARRAY['dashboard'])
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SCHEDULED TASKS
-- ============================================================================
-- Track scheduled automated tasks

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_name VARCHAR(255) NOT NULL UNIQUE,
    task_type VARCHAR(50) NOT NULL,  -- 'health_check', 'snapshot', 'rotation', 'rebalance', 'prune'
    schedule VARCHAR(100) NOT NULL,  -- Cron expression
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default scheduled tasks
INSERT INTO scheduled_tasks (task_name, task_type, schedule, is_active, config) VALUES
('fleet_health_check', 'health_check', '0 */4 * * *', TRUE, '{"include_all_stores": true}'),
('daily_snapshot', 'snapshot', '0 0 * * *', TRUE, '{"snapshot_types": ["fleet", "financial"]}'),
('sku_rotation', 'rotation', '0 2 * * 0', TRUE, '{"strategy": "performance", "max_rotations": 500}'),
('fleet_rebalance', 'rebalance', '0 3 * * 1', TRUE, '{"threshold_percent": 20}'),
('stale_listing_prune', 'prune', '0 4 * * *', TRUE, '{"days_without_sales": 14}'),
('ramp_up_advance', 'ramp_up', '0 0 * * *', TRUE, '{"auto_advance": true}')
ON CONFLICT (task_name) DO NOTHING;

-- ============================================================================
-- PERFORMANCE METRICS CACHE
-- ============================================================================
-- Cache expensive calculations for dashboard performance

CREATE TABLE IF NOT EXISTS metrics_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    cache_value JSONB NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    computation_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_metrics_cache_expiry
    ON metrics_cache(expires_at)
    WHERE expires_at > NOW();

-- ============================================================================
-- VIEWS FOR ADMIN DASHBOARD
-- ============================================================================

-- Admin activity summary
CREATE OR REPLACE VIEW admin_activity_summary AS
SELECT
    admin_id,
    DATE(executed_at) AS activity_date,
    COUNT(*) AS total_actions,
    COUNT(*) FILTER (WHERE result = 'success') AS successful_actions,
    COUNT(*) FILTER (WHERE result = 'failed') AS failed_actions,
    COUNT(DISTINCT target_type) AS target_types_touched,
    array_agg(DISTINCT action) AS actions_performed
FROM admin_action_logs
WHERE executed_at > NOW() - INTERVAL '30 days'
GROUP BY admin_id, DATE(executed_at)
ORDER BY activity_date DESC, admin_id;

-- Ramp-up progress overview
CREATE OR REPLACE VIEW ramp_up_overview AS
SELECT
    s.id AS store_id,
    s.store_name,
    s.ramp_up_day,
    s.ramp_up_started_at,
    s.health_score,
    COUNT(DISTINCT ssa.id) FILTER (WHERE ssa.listing_status = 'active') AS active_listings,
    COUNT(DISTINCT o.id) AS orders_30d,
    COALESCE(SUM(o.profit), 0) AS profit_30d,
    CASE
        WHEN s.ramp_up_day >= 45 THEN 'completed'
        WHEN s.health_score >= 70 AND
             COUNT(DISTINCT ssa.id) FILTER (WHERE ssa.listing_status = 'active') >= s.ramp_up_day * 30 THEN 'on_track'
        ELSE 'behind'
    END AS status
FROM stores s
LEFT JOIN store_sku_assignments ssa ON ssa.store_id = s.id
LEFT JOIN orders o ON o.store_id = s.id AND o.order_date > NOW() - INTERVAL '30 days'
WHERE s.ramp_up_day IS NOT NULL AND s.ramp_up_day > 0
GROUP BY s.id, s.store_name, s.ramp_up_day, s.ramp_up_started_at, s.health_score
ORDER BY s.ramp_up_day DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to advance all stores' ramp-up day
CREATE OR REPLACE FUNCTION advance_ramp_up_days()
RETURNS TABLE (
    stores_advanced INTEGER,
    stores_completed INTEGER
) AS $$
DECLARE
    v_advanced INTEGER := 0;
    v_completed INTEGER := 0;
BEGIN
    -- Advance stores that haven't completed ramp-up
    UPDATE stores
    SET ramp_up_day = ramp_up_day + 1
    WHERE ramp_up_day IS NOT NULL
      AND ramp_up_day > 0
      AND ramp_up_day < 45
      AND is_active = TRUE;

    GET DIAGNOSTICS v_advanced = ROW_COUNT;

    -- Count newly completed stores
    SELECT COUNT(*) INTO v_completed
    FROM stores
    WHERE ramp_up_day = 45
      AND is_active = TRUE;

    RETURN QUERY SELECT v_advanced, v_completed;
END;
$$ LANGUAGE plpgsql;

-- Function to create daily snapshot
CREATE OR REPLACE FUNCTION create_daily_snapshot()
RETURNS VOID AS $$
BEGIN
    -- Fleet snapshot
    INSERT INTO daily_snapshots (snapshot_date, snapshot_type, target_id, metrics)
    SELECT
        CURRENT_DATE,
        'fleet',
        NULL,
        jsonb_build_object(
            'total_stores', COUNT(DISTINCT s.id),
            'active_stores', COUNT(DISTINCT s.id) FILTER (WHERE s.is_active),
            'total_listings', COUNT(DISTINCT ssa.id),
            'total_orders', COUNT(DISTINCT o.id) FILTER (WHERE o.order_date > NOW() - INTERVAL '24 hours'),
            'total_revenue', COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_date > NOW() - INTERVAL '24 hours'), 0),
            'total_profit', COALESCE(SUM(o.profit) FILTER (WHERE o.order_date > NOW() - INTERVAL '24 hours'), 0),
            'avg_health_score', AVG(s.health_score)
        )
    FROM stores s
    LEFT JOIN store_sku_assignments ssa ON ssa.store_id = s.id AND ssa.listing_status = 'active'
    LEFT JOIN orders o ON o.store_id = s.id
    ON CONFLICT (snapshot_date, snapshot_type, target_id) DO UPDATE
    SET metrics = EXCLUDED.metrics, created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CLEANUP OLD DATA
-- ============================================================================

-- Function to clean up old logs and snapshots
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE (
    logs_deleted INTEGER,
    snapshots_deleted INTEGER,
    cache_cleared INTEGER
) AS $$
DECLARE
    v_logs INTEGER := 0;
    v_snapshots INTEGER := 0;
    v_cache INTEGER := 0;
BEGIN
    -- Delete admin logs older than 90 days
    DELETE FROM admin_action_logs
    WHERE executed_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS v_logs = ROW_COUNT;

    -- Delete snapshots older than 365 days
    DELETE FROM daily_snapshots
    WHERE snapshot_date < CURRENT_DATE - 365;
    GET DIAGNOSTICS v_snapshots = ROW_COUNT;

    -- Clear expired cache entries
    DELETE FROM metrics_cache
    WHERE expires_at < NOW();
    GET DIAGNOSTICS v_cache = ROW_COUNT;

    RETURN QUERY SELECT v_logs, v_snapshots, v_cache;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

ANALYZE admin_action_logs;
ANALYZE admin_sessions;
ANALYZE system_settings;
ANALYZE daily_snapshots;
ANALYZE alert_rules;
ANALYZE scheduled_tasks;
ANALYZE metrics_cache;
