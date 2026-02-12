-- Performance Indexes Migration
-- Run AFTER 003_scheduler.sql
-- Adds indexes for high-traffic queries to support 10,000+ users

-- ============================================================================
-- LISTING JOBS - High frequency job queue queries
-- ============================================================================

-- Jobs are frequently queried by status + priority + created_at
CREATE INDEX IF NOT EXISTS idx_listing_jobs_queue
    ON listing_jobs(status, priority DESC, created_at ASC)
    WHERE status IN ('pending', 'processing');

-- Jobs by store for dashboard
CREATE INDEX IF NOT EXISTS idx_listing_jobs_store
    ON listing_jobs(store_id, status, created_at DESC);

-- ============================================================================
-- STORE SKU ASSIGNMENTS - Most queried table
-- ============================================================================

-- Composite index for store listing lookups
CREATE INDEX IF NOT EXISTS idx_assignments_store_status
    ON store_sku_assignments(store_id, listing_status);

-- SKU availability check (for job processor)
CREATE INDEX IF NOT EXISTS idx_assignments_sku
    ON store_sku_assignments(sku_id);

-- Unique constraint for preventing duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_unique
    ON store_sku_assignments(store_id, sku_id);

-- Listings needing sync (for cron jobs)
CREATE INDEX IF NOT EXISTS idx_assignments_sync
    ON store_sku_assignments(listing_status, updated_at)
    WHERE listing_status IN ('pending', 'draft');

-- ============================================================================
-- SKUS - Product catalog queries
-- ============================================================================

-- SKU availability for assignment (used by job processor)
CREATE INDEX IF NOT EXISTS idx_skus_available
    ON skus(status, current_store_count)
    WHERE status = 'ready' AND current_store_count < 3;

-- SKU search and filtering
CREATE INDEX IF NOT EXISTS idx_skus_status
    ON skus(status, created_at DESC);

-- Price-based queries for repricing
CREATE INDEX IF NOT EXISTS idx_skus_pricing
    ON skus(amazon_price, ebay_price)
    WHERE status = 'ready';

-- ============================================================================
-- ORDERS - Revenue and analytics queries
-- ============================================================================

-- Orders by date (dashboard metrics)
CREATE INDEX IF NOT EXISTS idx_orders_date
    ON orders(order_date DESC);

-- Orders by store and date (store dashboard)
CREATE INDEX IF NOT EXISTS idx_orders_store_date
    ON orders(store_id, order_date DESC);

-- Orders by status (fulfillment workflows)
CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status, order_date DESC);

-- ============================================================================
-- COMPLIANCE CHECKS - Audit trail queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_compliance_sku
    ON compliance_checks(sku_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_store
    ON compliance_checks(store_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_status
    ON compliance_checks(status, checked_at DESC);

-- ============================================================================
-- JOB EXECUTIONS - Scheduler monitoring
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_executions_job_date
    ON job_executions(job_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_executions_status_date
    ON job_executions(status, started_at DESC);

-- ============================================================================
-- SYSTEM LOGS - Error tracking and audit
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_logs_type_date
    ON system_logs(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_logs_action_date
    ON system_logs(action, created_at DESC);

-- ============================================================================
-- PRICE CHANGE LOG - Analytics
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_price_changes_date
    ON price_change_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_changes_sku
    ON price_change_log(sku_id, created_at DESC);

-- ============================================================================
-- PRUNING LOG - Analytics
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pruning_date
    ON pruning_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pruning_store
    ON pruning_log(store_id, created_at DESC);

-- ============================================================================
-- AUTOMATION RATE LIMITS - Rate limiting queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
    ON automation_rate_limits(service, action, window_start DESC);

-- ============================================================================
-- STORES - Dashboard queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_stores_active
    ON stores(is_active, health_score DESC)
    WHERE is_active = true;

-- ============================================================================
-- EBAY TOKENS - OAuth lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ebay_tokens_store
    ON ebay_tokens(store_id, expires_at);

-- ============================================================================
-- NOTIFICATIONS - User notification queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id, read, created_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_store
    ON notifications(store_id, created_at DESC)
    WHERE store_id IS NOT NULL;

-- ============================================================================
-- PARTIAL INDEXES FOR COMMON FILTERS
-- ============================================================================

-- Active stores only (most common filter)
CREATE INDEX IF NOT EXISTS idx_stores_active_only
    ON stores(id)
    WHERE is_active = true;

-- Pending jobs only
CREATE INDEX IF NOT EXISTS idx_jobs_pending_only
    ON listing_jobs(created_at)
    WHERE status = 'pending';

-- Recent errors (last 24 hours)
CREATE INDEX IF NOT EXISTS idx_logs_recent_errors
    ON system_logs(created_at DESC)
    WHERE type = 'error' AND created_at > NOW() - INTERVAL '24 hours';

-- ============================================================================
-- ANALYZE TABLES (update statistics for query planner)
-- ============================================================================

ANALYZE listing_jobs;
ANALYZE store_sku_assignments;
ANALYZE skus;
ANALYZE orders;
ANALYZE stores;
ANALYZE compliance_checks;
ANALYZE job_executions;
ANALYZE system_logs;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run to verify indexes:
-- SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;
