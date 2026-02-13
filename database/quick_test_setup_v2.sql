-- Quick Setup Migration v2 - Handles partial state
-- Run this in Supabase SQL Editor

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DROP EXISTING (in reverse dependency order)
-- ============================================================================
DROP TABLE IF EXISTS test_runs CASCADE;
DROP TABLE IF EXISTS pipeline_config CASCADE;
DROP TABLE IF EXISTS raw_products CASCADE;
DROP TABLE IF EXISTS research_pipelines CASCADE;
DROP TABLE IF EXISTS automation_rate_limits CASCADE;
DROP TABLE IF EXISTS automation_jobs CASCADE;
DROP TABLE IF EXISTS stores CASCADE;

-- ============================================================================
-- STORES (no dependencies)
-- ============================================================================
CREATE TABLE stores (
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
-- AUTOMATION JOBS (no dependencies)
-- ============================================================================
CREATE TABLE automation_jobs (
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

CREATE INDEX idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX idx_automation_jobs_pending ON automation_jobs(job_type, priority DESC, scheduled_for)
    WHERE status = 'pending';

-- ============================================================================
-- RATE LIMITING (no dependencies)
-- ============================================================================
CREATE TABLE automation_rate_limits (
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
-- RESEARCH PIPELINES (no dependencies)
-- ============================================================================
CREATE TABLE research_pipelines (
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

CREATE INDEX idx_pipelines_stage ON research_pipelines(stage);
CREATE INDEX idx_pipelines_started ON research_pipelines(started_at DESC);

-- ============================================================================
-- PIPELINE CONFIG (depends on research_pipelines)
-- ============================================================================
CREATE TABLE pipeline_config (
    id SERIAL PRIMARY KEY,
    pipeline_id VARCHAR(64) UNIQUE NOT NULL REFERENCES research_pipelines(pipeline_id) ON DELETE CASCADE,
    auto_source BOOLEAN NOT NULL DEFAULT false,
    auto_normalize BOOLEAN NOT NULL DEFAULT false,
    auto_generate_skus BOOLEAN NOT NULL DEFAULT false,
    search_params JSONB,
    cassini_enabled BOOLEAN NOT NULL DEFAULT true,
    cassini_min_score INTEGER DEFAULT 50,
    cassini_prioritize BOOLEAN DEFAULT true,
    cassini_optimize_titles BOOLEAN DEFAULT true,
    cassini_target_trp BOOLEAN DEFAULT false,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    test_mode BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- RAW PRODUCTS (depends on research_pipelines)
-- ============================================================================
CREATE TABLE raw_products (
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
    pipeline_id VARCHAR(64) REFERENCES research_pipelines(pipeline_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_raw_products_pipeline ON raw_products(pipeline_id);
CREATE INDEX idx_raw_products_source ON raw_products(source);
CREATE INDEX idx_raw_products_asin ON raw_products(asin) WHERE asin IS NOT NULL;

-- ============================================================================
-- TEST RUNS (depends on research_pipelines, stores)
-- ============================================================================
CREATE TABLE test_runs (
    id SERIAL PRIMARY KEY,
    test_id VARCHAR(64) UNIQUE NOT NULL,
    pipeline_id VARCHAR(64) NOT NULL REFERENCES research_pipelines(pipeline_id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    config JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'running', 'completed', 'failed')),
    results JSONB,
    errors JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_test_runs_pipeline ON test_runs(pipeline_id);
CREATE INDEX idx_test_runs_status ON test_runs(status);

-- ============================================================================
-- DONE
-- ============================================================================
SELECT 'Migration complete! All tables created.' as status;
