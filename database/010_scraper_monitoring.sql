-- Scraper Monitoring & Health Checks Migration
-- Run AFTER 009_users_auth.sql
-- Tracks scraper health and selector failures over time

-- ============================================================================
-- SCRAPER HEALTH CHECKS TABLE
-- ============================================================================
-- Stores periodic health check results for monitoring

CREATE TABLE IF NOT EXISTS scraper_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Overall health
    health_score INTEGER NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
    duration_ms INTEGER,

    -- Selector stats
    total_selectors INTEGER NOT NULL DEFAULT 0,
    working_selectors INTEGER NOT NULL DEFAULT 0,
    broken_selectors INTEGER NOT NULL DEFAULT 0,

    -- Detailed results (JSON)
    platforms JSONB NOT NULL DEFAULT '[]',
    browser_pool JSONB,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for querying health history
CREATE INDEX IF NOT EXISTS idx_scraper_health_timestamp ON scraper_health_checks(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_health_score ON scraper_health_checks(health_score);

-- ============================================================================
-- SCRAPER SELECTOR FAILURES TABLE
-- ============================================================================
-- Tracks individual selector failures for alerting and debugging

CREATE TABLE IF NOT EXISTS scraper_selector_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('autods', 'zik', 'ebay', 'amazon', 'other')),
    selector_name VARCHAR(100) NOT NULL,
    selector_value TEXT NOT NULL,

    -- Failure tracking
    first_failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    failure_count INTEGER NOT NULL DEFAULT 1,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'failing' CHECK (status IN ('failing', 'resolved', 'acknowledged')),
    resolved_at TIMESTAMP WITH TIME ZONE,

    -- Notes
    notes TEXT,

    -- Unique constraint per selector
    UNIQUE(platform, selector_name)
);

CREATE INDEX IF NOT EXISTS idx_selector_failures_platform ON scraper_selector_failures(platform, status);
CREATE INDEX IF NOT EXISTS idx_selector_failures_status ON scraper_selector_failures(status, last_failed_at DESC);

-- ============================================================================
-- SCRAPER ERRORS TABLE
-- ============================================================================
-- Detailed error logging for debugging scraper issues

CREATE TABLE IF NOT EXISTS scraper_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL,
    operation VARCHAR(100) NOT NULL, -- e.g., 'login', 'fetch_listings', 'update_price'

    -- Error details
    error_message TEXT NOT NULL,
    error_stack TEXT,
    error_code VARCHAR(50),

    -- Context
    url TEXT,
    selector TEXT,
    screenshot_path TEXT,
    request_data JSONB,

    -- User/Store context (nullable)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scraper_errors_platform ON scraper_errors(platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_errors_operation ON scraper_errors(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_errors_created ON scraper_errors(created_at DESC);

-- Partition by month for better performance (optional, for high-volume)
-- This is a comment for future implementation if error volume becomes high

-- ============================================================================
-- SCRAPER METRICS TABLE
-- ============================================================================
-- Aggregated metrics for dashboard display

CREATE TABLE IF NOT EXISTS scraper_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL,
    metric_date DATE NOT NULL,

    -- Success/failure counts
    total_operations INTEGER NOT NULL DEFAULT 0,
    successful_operations INTEGER NOT NULL DEFAULT 0,
    failed_operations INTEGER NOT NULL DEFAULT 0,

    -- Timing metrics
    avg_response_time_ms INTEGER,
    max_response_time_ms INTEGER,
    min_response_time_ms INTEGER,

    -- Specific operation counts
    logins_attempted INTEGER DEFAULT 0,
    logins_successful INTEGER DEFAULT 0,
    listings_fetched INTEGER DEFAULT 0,
    prices_updated INTEGER DEFAULT 0,
    products_uploaded INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(platform, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_scraper_metrics_platform_date ON scraper_metrics(platform, metric_date DESC);

-- ============================================================================
-- AUTODS SESSIONS TABLE
-- ============================================================================
-- Stores AutoDS browser sessions for reuse
-- Referenced in auth.ts but table may not exist yet

CREATE TABLE IF NOT EXISTS autods_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    session_id VARCHAR(100),

    -- Session data
    cookies JSONB NOT NULL DEFAULT '[]',
    local_storage JSONB DEFAULT '{}',
    user_agent TEXT,

    -- Status
    is_valid BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autods_sessions_email ON autods_sessions(email);
CREATE INDEX IF NOT EXISTS idx_autods_sessions_valid ON autods_sessions(is_valid, expires_at);

-- ============================================================================
-- ZIK SESSIONS TABLE
-- ============================================================================
-- Stores ZIK Analytics browser sessions for reuse

CREATE TABLE IF NOT EXISTS zik_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    session_id VARCHAR(100),

    -- Session data
    cookies JSONB NOT NULL DEFAULT '[]',
    local_storage JSONB DEFAULT '{}',
    session_storage JSONB DEFAULT '{}',
    user_agent TEXT,

    -- Status
    is_valid BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zik_sessions_email ON zik_sessions(email);
CREATE INDEX IF NOT EXISTS idx_zik_sessions_valid ON zik_sessions(is_valid, expires_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to log scraper errors
CREATE OR REPLACE FUNCTION log_scraper_error(
    p_platform VARCHAR,
    p_operation VARCHAR,
    p_error_message TEXT,
    p_error_stack TEXT DEFAULT NULL,
    p_error_code VARCHAR DEFAULT NULL,
    p_url TEXT DEFAULT NULL,
    p_selector TEXT DEFAULT NULL,
    p_screenshot_path TEXT DEFAULT NULL,
    p_request_data JSONB DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_store_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_error_id UUID;
BEGIN
    INSERT INTO scraper_errors (
        platform, operation, error_message, error_stack, error_code,
        url, selector, screenshot_path, request_data, user_id, store_id
    ) VALUES (
        p_platform, p_operation, p_error_message, p_error_stack, p_error_code,
        p_url, p_selector, p_screenshot_path, p_request_data, p_user_id, p_store_id
    ) RETURNING id INTO v_error_id;

    RETURN v_error_id;
END;
$$ LANGUAGE plpgsql;

-- Function to track selector failure
CREATE OR REPLACE FUNCTION track_selector_failure(
    p_platform VARCHAR,
    p_selector_name VARCHAR,
    p_selector_value TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO scraper_selector_failures (
        platform, selector_name, selector_value, first_failed_at, last_failed_at, failure_count
    ) VALUES (
        p_platform, p_selector_name, p_selector_value, NOW(), NOW(), 1
    )
    ON CONFLICT (platform, selector_name) DO UPDATE SET
        last_failed_at = NOW(),
        failure_count = scraper_selector_failures.failure_count + 1,
        status = 'failing';
END;
$$ LANGUAGE plpgsql;

-- Function to mark selector as resolved
CREATE OR REPLACE FUNCTION resolve_selector_failure(
    p_platform VARCHAR,
    p_selector_name VARCHAR
)
RETURNS VOID AS $$
BEGIN
    UPDATE scraper_selector_failures
    SET status = 'resolved', resolved_at = NOW()
    WHERE platform = p_platform AND selector_name = p_selector_name;
END;
$$ LANGUAGE plpgsql;

-- Function to increment daily metrics
CREATE OR REPLACE FUNCTION increment_scraper_metric(
    p_platform VARCHAR,
    p_metric_name VARCHAR,
    p_increment INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO scraper_metrics (platform, metric_date, total_operations)
    VALUES (p_platform, CURRENT_DATE, 0)
    ON CONFLICT (platform, metric_date) DO NOTHING;

    EXECUTE format(
        'UPDATE scraper_metrics SET %I = COALESCE(%I, 0) + $1, updated_at = NOW() WHERE platform = $2 AND metric_date = $3',
        p_metric_name, p_metric_name
    ) USING p_increment, p_platform, CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent health trend
CREATE OR REPLACE FUNCTION get_scraper_health_trend(
    p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
    hour TIMESTAMP WITH TIME ZONE,
    avg_health_score NUMERIC,
    checks_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        date_trunc('hour', timestamp) AS hour,
        AVG(health_score)::NUMERIC AS avg_health_score,
        COUNT(*) AS checks_count
    FROM scraper_health_checks
    WHERE timestamp > NOW() - (p_hours || ' hours')::INTERVAL
    GROUP BY date_trunc('hour', timestamp)
    ORDER BY hour DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CLEANUP POLICY
-- ============================================================================
-- Keep health checks for 30 days, errors for 7 days

-- Create a function to clean up old records
CREATE OR REPLACE FUNCTION cleanup_scraper_monitoring()
RETURNS VOID AS $$
BEGIN
    -- Delete health checks older than 30 days
    DELETE FROM scraper_health_checks
    WHERE created_at < NOW() - INTERVAL '30 days';

    -- Delete errors older than 7 days
    DELETE FROM scraper_errors
    WHERE created_at < NOW() - INTERVAL '7 days';

    -- Delete resolved selector failures older than 14 days
    DELETE FROM scraper_selector_failures
    WHERE status = 'resolved' AND resolved_at < NOW() - INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

ANALYZE scraper_health_checks;
ANALYZE scraper_selector_failures;
ANALYZE scraper_errors;
ANALYZE scraper_metrics;
ANALYZE autods_sessions;
ANALYZE zik_sessions;
