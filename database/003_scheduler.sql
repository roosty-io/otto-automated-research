-- Scheduler Migration
-- Run AFTER 002_ebay_integration.sql
-- Adds: Job scheduling, execution tracking, system monitoring

-- ============================================================================
-- SCHEDULED JOBS STATUS
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY,
    last_run TIMESTAMPTZ,
    last_status TEXT,  -- success, failed, running
    last_duration INTEGER,  -- milliseconds
    last_error TEXT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- JOB EXECUTIONS LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_executions (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    job_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL,  -- running, success, failed, timeout, retrying
    duration INTEGER,  -- milliseconds
    result JSONB,
    error TEXT,
    retry_attempt INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_executions_job ON job_executions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
CREATE INDEX IF NOT EXISTS idx_job_executions_started ON job_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_executions_job_date ON job_executions(job_id, started_at DESC);

-- ============================================================================
-- SYSTEM LOGS (ENHANCED)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,  -- cron, error, audit, security
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_type ON system_logs(type);
CREATE INDEX IF NOT EXISTS idx_system_logs_action ON system_logs(action);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_user ON system_logs(user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- SYSTEM METRICS (FOR MONITORING)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name TEXT NOT NULL,
    metric_value DECIMAL(20,4) NOT NULL,
    unit TEXT,  -- count, ms, percentage, etc.
    tags JSONB DEFAULT '{}',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded ON system_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_name_date ON system_metrics(metric_name, recorded_at DESC);

-- Partition hint: In production, consider partitioning by month
-- CREATE TABLE system_metrics_y2024m01 PARTITION OF system_metrics FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

-- Function to clean up old job executions (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_job_executions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM job_executions
    WHERE started_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old system logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_system_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM system_logs
    WHERE created_at < NOW() - INTERVAL '90 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old metrics (keep last 7 days for detailed, aggregate older)
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM system_metrics
    WHERE recorded_at < NOW() - INTERVAL '7 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Job health overview
CREATE OR REPLACE VIEW v_job_health AS
SELECT
    sj.id AS job_id,
    sj.last_run,
    sj.last_status,
    sj.last_duration,
    sj.last_error,
    COUNT(je.id) FILTER (WHERE je.started_at > NOW() - INTERVAL '24 hours') AS runs_24h,
    COUNT(je.id) FILTER (WHERE je.started_at > NOW() - INTERVAL '24 hours' AND je.status = 'success') AS success_24h,
    COUNT(je.id) FILTER (WHERE je.started_at > NOW() - INTERVAL '24 hours' AND je.status IN ('failed', 'timeout')) AS failed_24h,
    ROUND(AVG(je.duration) FILTER (WHERE je.started_at > NOW() - INTERVAL '24 hours'), 0) AS avg_duration_24h
FROM scheduled_jobs sj
LEFT JOIN job_executions je ON sj.id = je.job_id
GROUP BY sj.id, sj.last_run, sj.last_status, sj.last_duration, sj.last_error;

-- System health metrics
CREATE OR REPLACE VIEW v_system_health AS
SELECT
    (SELECT COUNT(*) FROM stores WHERE is_active = true) AS active_stores,
    (SELECT COUNT(*) FROM skus WHERE status = 'ready') AS ready_skus,
    (SELECT COUNT(*) FROM store_sku_assignments WHERE listing_status = 'active') AS active_listings,
    (SELECT COUNT(*) FROM listing_jobs WHERE status = 'pending') AS pending_jobs,
    (SELECT COUNT(*) FROM listing_jobs WHERE status = 'processing') AS processing_jobs,
    (SELECT COUNT(*) FROM job_executions WHERE status = 'running') AS running_cron_jobs,
    (SELECT COUNT(*) FROM job_executions WHERE started_at > NOW() - INTERVAL '1 hour' AND status = 'failed') AS failed_jobs_1h,
    (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE order_date > NOW() - INTERVAL '24 hours') AS revenue_24h,
    (SELECT COUNT(*) FROM orders WHERE order_date > NOW() - INTERVAL '24 hours') AS orders_24h;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS trg_scheduled_jobs_updated_at
    BEFORE UPDATE ON scheduled_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run to verify:
-- SELECT * FROM v_job_health;
-- SELECT * FROM v_system_health;
