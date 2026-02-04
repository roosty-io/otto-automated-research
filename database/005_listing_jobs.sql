-- PPME Database Schema - Migration 005
-- Listing Jobs Queue System

-- =============================================================================
-- JOB TYPE ENUM
-- =============================================================================

CREATE TYPE listing_job_type AS ENUM (
    'managed_onboarding',     -- Full managed service onboarding
    'self_service_onboarding', -- Client self-service onboarding
    'managed_replenishment',   -- Managed ongoing listing replenishment
    'self_service_topup',      -- Client requested top-up
    'bulk_import',             -- Bulk SKU import
    'escalation',              -- Winner escalation to more stores
    'pruning'                  -- Loser pruning
);

-- =============================================================================
-- LISTING JOBS TABLE
-- =============================================================================

CREATE TABLE listing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Job info
    job_type listing_job_type NOT NULL,
    job_name TEXT NOT NULL,

    -- Targets
    target_listing_count INTEGER NOT NULL,
    completed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,

    -- Status
    status job_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0, -- Higher = process first

    -- Scheduling
    scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Error tracking
    last_error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,

    -- Metadata
    config JSONB DEFAULT '{}', -- Job-specific configuration
    results JSONB DEFAULT '{}', -- Job results/stats

    -- Audit
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listing_jobs_store ON listing_jobs(store_id);
CREATE INDEX idx_listing_jobs_status ON listing_jobs(status);
CREATE INDEX idx_listing_jobs_pending ON listing_jobs(priority DESC, scheduled_for)
    WHERE status = 'pending';
CREATE INDEX idx_listing_jobs_processing ON listing_jobs(started_at)
    WHERE status = 'processing';

-- =============================================================================
-- JOB LOGS TABLE
-- =============================================================================

CREATE TABLE listing_job_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES listing_jobs(id) ON DELETE CASCADE,

    -- Log entry
    log_level TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error', 'success'
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',

    -- Related entities
    sku_id UUID REFERENCES skus(id),
    assignment_id UUID REFERENCES store_sku_assignments(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listing_job_logs_job ON listing_job_logs(job_id);
CREATE INDEX idx_listing_job_logs_level ON listing_job_logs(log_level);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Create a managed onboarding job for a new store
CREATE OR REPLACE FUNCTION create_onboarding_job(
    p_store_id UUID,
    p_target_count INTEGER DEFAULT NULL,
    p_priority INTEGER DEFAULT 5,
    p_created_by TEXT DEFAULT 'admin'
)
RETURNS UUID AS $$
DECLARE
    v_store RECORD;
    v_tier RECORD;
    v_maturity RECORD;
    v_target INTEGER;
    v_job_id UUID;
BEGIN
    -- Get store info
    SELECT s.*, t.*
    INTO v_store
    FROM stores s
    JOIN store_tiers t ON s.tier_id = t.id
    WHERE s.id = p_store_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found: %', p_store_id;
    END IF;

    -- Get maturity tier
    SELECT * INTO v_maturity
    FROM store_maturity_tiers
    WHERE maturity_level = v_store.maturity;

    -- Calculate target if not provided
    IF p_target_count IS NULL THEN
        v_target := ROUND(v_store.min_active_listings * v_maturity.velocity_multiplier);
    ELSE
        v_target := p_target_count;
    END IF;

    -- Create the job
    INSERT INTO listing_jobs (
        store_id,
        job_type,
        job_name,
        target_listing_count,
        priority,
        created_by,
        config
    ) VALUES (
        p_store_id,
        'managed_onboarding',
        'Onboarding: ' || v_store.store_name,
        v_target,
        p_priority,
        p_created_by,
        jsonb_build_object(
            'tier', v_store.tier_name,
            'maturity', v_store.maturity::TEXT,
            'effective_floor', v_target,
            'days_to_floor', v_store.days_to_floor
        )
    )
    RETURNING id INTO v_job_id;

    -- Log job creation
    INSERT INTO listing_job_logs (job_id, log_level, message, details)
    VALUES (
        v_job_id,
        'info',
        'Onboarding job created',
        jsonb_build_object(
            'target_count', v_target,
            'store', v_store.store_name
        )
    );

    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Create a managed listing replenishment job
CREATE OR REPLACE FUNCTION create_managed_listing_job(
    p_store_id UUID,
    p_listing_count INTEGER,
    p_job_type listing_job_type DEFAULT 'managed_replenishment',
    p_priority INTEGER DEFAULT 3,
    p_scheduled_for TIMESTAMPTZ DEFAULT NULL,
    p_created_by TEXT DEFAULT 'admin'
)
RETURNS UUID AS $$
DECLARE
    v_store RECORD;
    v_available_slots INTEGER;
    v_job_id UUID;
BEGIN
    -- Get store info
    SELECT s.store_name, s.ebay_username
    INTO v_store
    FROM stores s
    WHERE s.id = p_store_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found: %', p_store_id;
    END IF;

    -- Check available slots
    SELECT available_slots INTO v_available_slots
    FROM get_available_listing_slots(p_store_id);

    IF p_listing_count > v_available_slots THEN
        RAISE WARNING 'Requested % listings but only % slots available', p_listing_count, v_available_slots;
    END IF;

    -- Create the job
    INSERT INTO listing_jobs (
        store_id,
        job_type,
        job_name,
        target_listing_count,
        priority,
        scheduled_for,
        created_by
    ) VALUES (
        p_store_id,
        p_job_type,
        p_job_type::TEXT || ': ' || v_store.store_name || ' (' || p_listing_count || ' listings)',
        LEAST(p_listing_count, v_available_slots),
        p_priority,
        COALESCE(p_scheduled_for, NOW()),
        p_created_by
    )
    RETURNING id INTO v_job_id;

    -- Log job creation
    INSERT INTO listing_job_logs (job_id, log_level, message, details)
    VALUES (
        v_job_id,
        'info',
        'Listing job created',
        jsonb_build_object(
            'requested_count', p_listing_count,
            'approved_count', LEAST(p_listing_count, v_available_slots),
            'available_slots', v_available_slots
        )
    );

    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Create a self-service onboarding job (client initiated)
CREATE OR REPLACE FUNCTION create_self_service_onboarding(
    p_store_id UUID,
    p_listing_count INTEGER,
    p_client_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
BEGIN
    RETURN create_managed_listing_job(
        p_store_id,
        p_listing_count,
        'self_service_onboarding',
        2, -- Lower priority than managed
        NOW(),
        COALESCE(p_client_id::TEXT, 'client')
    );
END;
$$ LANGUAGE plpgsql;

-- Get batch size for job processing
CREATE OR REPLACE FUNCTION get_job_batch_size(p_job_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_job RECORD;
    v_remaining INTEGER;
    v_store RECORD;
    v_maturity RECORD;
    v_batch_size INTEGER;
BEGIN
    -- Get job info
    SELECT * INTO v_job FROM listing_jobs WHERE id = p_job_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job not found: %', p_job_id;
    END IF;

    v_remaining := v_job.target_listing_count - v_job.completed_count;

    -- Get store and maturity info
    SELECT s.*, m.daily_cap
    INTO v_store
    FROM stores s
    JOIN store_maturity_tiers m ON s.maturity = m.maturity_level
    WHERE s.id = v_job.store_id;

    -- Batch size is minimum of:
    -- 1. Remaining count
    -- 2. Daily cap
    -- 3. 100 (max batch for API safety)
    v_batch_size := LEAST(v_remaining, v_store.daily_cap, 100);

    RETURN v_batch_size;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get active jobs for processing
CREATE OR REPLACE FUNCTION get_active_jobs(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    job_id UUID,
    store_id UUID,
    store_name TEXT,
    job_type listing_job_type,
    job_name TEXT,
    target_count INTEGER,
    completed_count INTEGER,
    remaining_count INTEGER,
    batch_size INTEGER,
    priority INTEGER,
    status job_status
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.id AS job_id,
        j.store_id,
        s.store_name,
        j.job_type,
        j.job_name,
        j.target_listing_count AS target_count,
        j.completed_count,
        (j.target_listing_count - j.completed_count) AS remaining_count,
        get_job_batch_size(j.id) AS batch_size,
        j.priority,
        j.status
    FROM listing_jobs j
    JOIN stores s ON j.store_id = s.id
    WHERE j.status IN ('pending', 'processing')
      AND (j.scheduled_for IS NULL OR j.scheduled_for <= NOW())
    ORDER BY
        j.status DESC, -- processing first
        j.priority DESC,
        j.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW v_listing_jobs_dashboard AS
SELECT
    j.id,
    j.store_id,
    s.store_name,
    s.ebay_username,
    t.tier_name,
    j.job_type,
    j.job_name,
    j.target_listing_count,
    j.completed_count,
    j.failed_count,
    (j.target_listing_count - j.completed_count) AS remaining,
    ROUND((j.completed_count::DECIMAL / NULLIF(j.target_listing_count, 0)) * 100, 1) AS progress_pct,
    j.status,
    j.priority,
    j.scheduled_for,
    j.started_at,
    j.completed_at,
    CASE
        WHEN j.completed_at IS NOT NULL AND j.started_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (j.completed_at - j.started_at))::INTEGER
        WHEN j.started_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (NOW() - j.started_at))::INTEGER
        ELSE NULL
    END AS duration_seconds,
    j.last_error,
    j.retry_count,
    j.created_by,
    j.created_at,
    j.updated_at
FROM listing_jobs j
JOIN stores s ON j.store_id = s.id
JOIN store_tiers t ON s.tier_id = t.id
ORDER BY
    CASE j.status
        WHEN 'processing' THEN 1
        WHEN 'pending' THEN 2
        WHEN 'completed' THEN 3
        WHEN 'failed' THEN 4
        WHEN 'cancelled' THEN 5
    END,
    j.priority DESC,
    j.created_at DESC;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update job status when all listings completed
CREATE OR REPLACE FUNCTION check_job_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed_count >= NEW.target_listing_count AND NEW.status = 'processing' THEN
        NEW.status := 'completed';
        NEW.completed_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_job_completion
    BEFORE UPDATE ON listing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION check_job_completion();

-- Apply updated_at trigger
CREATE TRIGGER trg_listing_jobs_updated_at
    BEFORE UPDATE ON listing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE listing_jobs IS 'Job queue for listing operations (onboarding, replenishment, etc.)';
COMMENT ON TABLE listing_job_logs IS 'Detailed logs for job execution';
COMMENT ON FUNCTION create_onboarding_job IS 'Creates a managed onboarding job for a new store';
COMMENT ON FUNCTION create_managed_listing_job IS 'Creates a listing job with specified count';
COMMENT ON FUNCTION get_active_jobs IS 'Returns jobs ready for processing with batch sizes';
COMMENT ON VIEW v_listing_jobs_dashboard IS 'Dashboard view for monitoring all listing jobs';
