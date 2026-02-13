-- Quick Setup Migration for Pipeline Testing
-- Run this in Supabase SQL Editor to set up minimal required tables
--
-- This creates only the tables needed for the research pipeline test:
-- - automation_jobs (with expanded job types)
-- - automation_rate_limits
-- - research_pipelines
-- - pipeline_config
-- - raw_products
-- - test_runs

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- AUTOMATION JOBS QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    )),
    priority INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    locked_until TIMESTAMPTZ,
    locked_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_pending
    ON automation_jobs(job_type, priority DESC, scheduled_for) WHERE status = 'pending';

-- ============================================================================
-- RATE LIMITING
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service TEXT NOT NULL,
    action TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INTEGER NOT NULL DEFAULT 0,
    max_requests INTEGER NOT NULL,
    window_seconds INTEGER NOT NULL,
    UNIQUE(service, action, window_start)
);

-- ============================================================================
-- RESEARCH PIPELINES
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_pipelines (
    id SERIAL PRIMARY KEY,
    pipeline_id VARCHAR(64) UNIQUE NOT NULL,
    stage VARCHAR(30) NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    products_found INTEGER NOT NULL DEFAULT 0,
    products_sourced INTEGER NOT NULL DEFAULT 0,
    products_normalized INTEGER NOT NULL DEFAULT 0,
    skus_generated INTEGER NOT NULL DEFAULT 0,
    errors JSONB DEFAULT '[]',
    job_ids TEXT[] DEFAULT '{}',
    cassini_metrics JSONB DEFAULT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    user_id UUID,
    session_id VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_pipelines_stage ON research_pipelines(stage);
CREATE INDEX IF NOT EXISTS idx_pipelines_started ON research_pipelines(started_at DESC);

-- ============================================================================
-- PIPELINE CONFIG
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_config (
    id SERIAL PRIMARY KEY,
    pipeline_id VARCHAR(64) UNIQUE NOT NULL,
    auto_source BOOLEAN NOT NULL DEFAULT false,
    auto_normalize BOOLEAN NOT NULL DEFAULT false,
    auto_generate_skus BOOLEAN NOT NULL DEFAULT false,
    search_params JSONB,
    cassini_enabled BOOLEAN NOT NULL DEFAULT true,
    cassini_min_score INTEGER DEFAULT 50,
    cassini_prioritize BOOLEAN DEFAULT true,
    cassini_optimize_titles BOOLEAN DEFAULT true,
    cassini_target_trp BOOLEAN DEFAULT false,
    store_id UUID,
    test_mode BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- RAW PRODUCTS (from ZIK/Keepa research)
-- ============================================================================

CREATE TABLE IF NOT EXISTS raw_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'zik',
    external_id TEXT,
    title TEXT NOT NULL,
    price DECIMAL(10,2),
    sold_count INTEGER DEFAULT 0,
    seller_count INTEGER DEFAULT 0,
    category TEXT,
    image_url TEXT,
    product_url TEXT,
    asin TEXT,
    amazon_price DECIMAL(10,2),
    keepa_data JSONB,
    raw_data JSONB NOT NULL DEFAULT '{}',
    pipeline_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_products_pipeline ON raw_products(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_raw_products_source ON raw_products(source);
CREATE INDEX IF NOT EXISTS idx_raw_products_asin ON raw_products(asin) WHERE asin IS NOT NULL;

-- ============================================================================
-- STORES (minimal for test)
-- ============================================================================

CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_name TEXT NOT NULL,
    ebay_username TEXT UNIQUE,
    tier_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    current_active_listings INTEGER DEFAULT 0,
    onboarding_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TEST RUNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS test_runs (
    id SERIAL PRIMARY KEY,
    test_id VARCHAR(64) UNIQUE NOT NULL,
    pipeline_id VARCHAR(64) NOT NULL,
    store_id UUID,
    config JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'running', 'completed', 'failed')),
    results JSONB,
    errors JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_test_runs_pipeline ON test_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE automation_jobs IS 'Queue for automation tasks (research, uploads, syncs)';
COMMENT ON TABLE research_pipelines IS 'Tracks research pipeline execution';
COMMENT ON TABLE raw_products IS 'Products discovered through research (ZIK, Keepa)';
COMMENT ON TABLE test_runs IS 'Tracks test executions of the research pipeline';

-- Done!
SELECT 'Migration complete! Tables created for pipeline testing.' as status;
