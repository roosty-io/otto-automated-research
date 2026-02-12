-- Extended Features Migration
-- Run this AFTER 000_combined_migration.sql
-- Adds: Notifications, Repricing, Pruning, AutoDS sync tables

-- ============================================================================
-- NOTIFICATIONS SYSTEM
-- ============================================================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'],
    data JSONB DEFAULT '{}',
    user_id UUID,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    read BOOLEAN NOT NULL DEFAULT false,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_store ON notifications(store_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    email TEXT,
    webhook_url TEXT,
    enabled_types TEXT[] DEFAULT ARRAY['price_alert', 'low_stock', 'order_received', 'error'],
    enabled_channels TEXT[] DEFAULT ARRAY['in_app', 'email'],
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    daily_digest BOOLEAN DEFAULT false,
    instant_alerts BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alert rules
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]',
    channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'],
    priority TEXT NOT NULL DEFAULT 'normal',
    enabled BOOLEAN NOT NULL DEFAULT true,
    cooldown_minutes INTEGER NOT NULL DEFAULT 60,
    last_triggered TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_type ON alert_rules(type);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled) WHERE enabled = true;

-- Webhook logs
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    status TEXT NOT NULL,
    status_code INTEGER,
    payload JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_notification ON webhook_logs(notification_id);

-- ============================================================================
-- REPRICING SYSTEM
-- ============================================================================

-- Pricing rules
CREATE TABLE IF NOT EXISTS pricing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    pattern_id UUID REFERENCES patterns(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL DEFAULT 'percentage', -- percentage, fixed, dynamic
    min_price DECIMAL(10,2),
    max_price DECIMAL(10,2),
    min_margin_percentage DECIMAL(5,2) DEFAULT 15.00,
    target_margin_percentage DECIMAL(5,2) DEFAULT 30.00,
    undercut_percentage DECIMAL(5,2) DEFAULT 2.00,
    price_floor DECIMAL(10,2),
    price_ceiling DECIMAL(10,2),
    enabled BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0,
    conditions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_store ON pricing_rules(store_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_pattern ON pricing_rules(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_sku ON pricing_rules(sku_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_enabled ON pricing_rules(enabled) WHERE enabled = true;

-- Competitor prices
CREATE TABLE IF NOT EXISTS competitor_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    competitor_name TEXT NOT NULL,
    competitor_url TEXT,
    competitor_price DECIMAL(10,2) NOT NULL,
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (competitor_price + COALESCE(shipping_cost, 0)) STORED,
    condition TEXT DEFAULT 'new',
    is_prime BOOLEAN DEFAULT false,
    seller_rating DECIMAL(3,2),
    last_checked TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_prices_sku ON competitor_prices(sku_id);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_checked ON competitor_prices(last_checked);
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_prices_unique ON competitor_prices(sku_id, competitor_name, competitor_url);

-- Price history
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id) ON DELETE CASCADE,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    change_reason TEXT,
    rule_id UUID REFERENCES pricing_rules(id) ON DELETE SET NULL,
    competitor_price DECIMAL(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_assignment ON price_history(assignment_id);
CREATE INDEX IF NOT EXISTS idx_price_history_created ON price_history(created_at DESC);

-- ============================================================================
-- PRUNING SYSTEM
-- ============================================================================

-- Pruning candidates
CREATE TABLE IF NOT EXISTS pruning_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    score DECIMAL(5,2) NOT NULL DEFAULT 0,
    days_since_sale INTEGER,
    days_since_listed INTEGER,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr DECIMAL(5,4) DEFAULT 0,
    recommended_action TEXT DEFAULT 'prune', -- prune, reprice, keep
    reviewed BOOLEAN NOT NULL DEFAULT false,
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    action_taken TEXT,
    action_taken_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(assignment_id)
);

CREATE INDEX IF NOT EXISTS idx_pruning_candidates_store ON pruning_candidates(store_id);
CREATE INDEX IF NOT EXISTS idx_pruning_candidates_unreviewed ON pruning_candidates(reviewed) WHERE reviewed = false;
CREATE INDEX IF NOT EXISTS idx_pruning_candidates_score ON pruning_candidates(score DESC);

-- ============================================================================
-- RESEARCH & DISCOVERY
-- ============================================================================

-- Research jobs
CREATE TABLE IF NOT EXISTS research_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type TEXT NOT NULL DEFAULT 'keepa_bestsellers', -- keepa_bestsellers, zik_search, manual_import
    job_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    config JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    products_found INTEGER DEFAULT 0,
    products_validated INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_jobs(status);
CREATE INDEX IF NOT EXISTS idx_research_jobs_type ON research_jobs(job_type);

-- ============================================================================
-- AUTODS SYNC
-- ============================================================================

-- Add AutoDS columns to store_sku_assignments if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'store_sku_assignments' AND column_name = 'autods_draft_id') THEN
        ALTER TABLE store_sku_assignments ADD COLUMN autods_draft_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'store_sku_assignments' AND column_name = 'autods_listing_id') THEN
        ALTER TABLE store_sku_assignments ADD COLUMN autods_listing_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'store_sku_assignments' AND column_name = 'markup_percentage') THEN
        ALTER TABLE store_sku_assignments ADD COLUMN markup_percentage DECIMAL(5,2) DEFAULT 30.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'store_sku_assignments' AND column_name = 'published_at') THEN
        ALTER TABLE store_sku_assignments ADD COLUMN published_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'store_sku_assignments' AND column_name = 'publish_error') THEN
        ALTER TABLE store_sku_assignments ADD COLUMN publish_error TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignments_autods_draft ON store_sku_assignments(autods_draft_id) WHERE autods_draft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_autods_listing ON store_sku_assignments(autods_listing_id) WHERE autods_listing_id IS NOT NULL;

-- AutoDS sessions
CREATE TABLE IF NOT EXISTS autods_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cookies JSONB NOT NULL,
    local_storage JSONB DEFAULT '{}',
    user_agent TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autods_sessions_valid ON autods_sessions(is_valid) WHERE is_valid = true;

-- Add validation_status to skus if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'skus' AND column_name = 'validation_status') THEN
        ALTER TABLE skus ADD COLUMN validation_status TEXT DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'skus' AND column_name = 'amazon_url') THEN
        ALTER TABLE skus ADD COLUMN amazon_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'skus' AND column_name = 'amazon_asin') THEN
        ALTER TABLE skus ADD COLUMN amazon_asin TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skus_validation ON skus(validation_status);

-- ============================================================================
-- SYSTEM LOGGING
-- ============================================================================

-- System logs for cron jobs
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_type TEXT NOT NULL, -- cron, error, info, warning
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_type ON system_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON system_logs(source);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);

-- Cleanup old logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    DELETE FROM webhook_logs WHERE created_at < NOW() - INTERVAL '30 days';
    DELETE FROM price_history WHERE created_at < NOW() - INTERVAL '90 days';

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- API CACHING
-- ============================================================================

-- API cache
CREATE TABLE IF NOT EXISTS api_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key TEXT NOT NULL UNIQUE,
    cache_value JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_cache_key ON api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);

-- Cleanup expired cache
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM api_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS trg_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_alert_rules_updated_at
    BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_pricing_rules_updated_at
    BEFORE UPDATE ON pricing_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_competitor_prices_updated_at
    BEFORE UPDATE ON competitor_prices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_pruning_candidates_updated_at
    BEFORE UPDATE ON pruning_candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_research_jobs_updated_at
    BEFORE UPDATE ON research_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run after migration to verify tables exist:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
