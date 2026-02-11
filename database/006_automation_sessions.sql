-- Migration: Add automation_sessions table for Puppeteer session persistence
-- This stores cookies and session data for ZIK, AutoDS, and other services

-- Create automation_sessions table
CREATE TABLE IF NOT EXISTS automation_sessions (
    id TEXT PRIMARY KEY,
    service TEXT NOT NULL CHECK (service IN ('zik', 'autods', 'ebay', 'amazon')),
    cookies TEXT NOT NULL, -- JSON serialized cookies
    local_storage TEXT, -- JSON serialized localStorage
    session_storage TEXT, -- JSON serialized sessionStorage
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    metadata TEXT -- JSON for additional data
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_sessions_service
    ON automation_sessions(service);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_valid
    ON automation_sessions(service, is_valid)
    WHERE is_valid = TRUE;
CREATE INDEX IF NOT EXISTS idx_automation_sessions_expires
    ON automation_sessions(expires_at)
    WHERE expires_at IS NOT NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_automation_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_automation_sessions_updated_at ON automation_sessions;
CREATE TRIGGER trigger_automation_sessions_updated_at
    BEFORE UPDATE ON automation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_automation_sessions_updated_at();

-- Comment on table
COMMENT ON TABLE automation_sessions IS 'Stores browser session data for Puppeteer automation (ZIK, AutoDS, etc)';
COMMENT ON COLUMN automation_sessions.service IS 'Service identifier: zik, autods, ebay, amazon';
COMMENT ON COLUMN automation_sessions.cookies IS 'JSON serialized browser cookies';
COMMENT ON COLUMN automation_sessions.is_valid IS 'Whether session is still valid/usable';

-- Add automation job queue table for async task processing
CREATE TABLE IF NOT EXISTS automation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL CHECK (job_type IN (
        'zik_research',
        'keepa_lookup',
        'autods_upload',
        'autods_publish',
        'autods_sync',
        'price_update',
        'listing_end'
    )),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'processing',
        'completed',
        'failed',
        'cancelled'
    )),
    priority INTEGER NOT NULL DEFAULT 0, -- Higher = more urgent
    payload JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(), -- For delayed jobs
    locked_until TIMESTAMPTZ, -- For job locking
    locked_by TEXT -- Worker identifier
);

-- Create indexes for job queue
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status
    ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_pending
    ON automation_jobs(job_type, priority DESC, scheduled_for)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_jobs_locked
    ON automation_jobs(locked_until)
    WHERE locked_until IS NOT NULL;

-- Comment on table
COMMENT ON TABLE automation_jobs IS 'Queue for automation tasks (research, uploads, syncs)';

-- Add rate limiting table
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

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
    ON automation_rate_limits(service, action, window_start);

COMMENT ON TABLE automation_rate_limits IS 'Track API/scraping rate limits per service';
