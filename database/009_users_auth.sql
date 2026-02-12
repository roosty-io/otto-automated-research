-- Users & Authentication Migration
-- Run AFTER 008_admin_dashboard.sql
-- Integrates with Supabase Auth for user management

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Extended profile data for authenticated users
-- Links to Supabase auth.users via id

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    company VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),

    -- Onboarding tracking
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_step INTEGER DEFAULT 0,

    -- Settings
    settings JSONB DEFAULT '{}',
    notification_preferences JSONB DEFAULT '{
      "email_orders": true,
      "email_alerts": true,
      "email_reports": false
    }',

    -- Metadata
    timezone VARCHAR(50) DEFAULT 'UTC',
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboarding_completed);

-- ============================================================================
-- USER SUBSCRIPTIONS TABLE
-- ============================================================================
-- Manages Stripe subscriptions for billing

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    tier_id VARCHAR(50) NOT NULL DEFAULT 'free',

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'incomplete'
        CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired')),

    -- Stripe IDs
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    stripe_price_id VARCHAR(255),

    -- Billing period
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,

    -- Cancellation
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMP WITH TIME ZONE,

    -- Trial
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON user_subscriptions(tier_id);

-- ============================================================================
-- USER USAGE TRACKING
-- ============================================================================
-- Tracks feature usage for tier limits

CREATE TABLE IF NOT EXISTS user_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Usage counts
    stores_count INTEGER DEFAULT 0,
    listings_count INTEGER DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    api_calls_count INTEGER DEFAULT 0,
    keepa_lookups_count INTEGER DEFAULT 0,

    -- Limits (from tier)
    stores_limit INTEGER,
    listings_limit INTEGER,
    orders_limit INTEGER,
    api_calls_limit INTEGER,
    keepa_lookups_limit INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_period ON user_usage(user_id, period_start DESC);

-- ============================================================================
-- API KEYS
-- ============================================================================
-- Manage API keys for programmatic access

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,  -- Store hash, not plain key
    prefix VARCHAR(10) NOT NULL,      -- For identification (otto_xxxx)
    permissions TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(key_hash)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
-- Track important user actions for security

CREATE TABLE IF NOT EXISTS user_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON user_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON user_audit_log(action, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Ensure users can only access their own data

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own profile
CREATE POLICY users_select_own ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_update_own ON users
    FOR UPDATE USING (auth.uid() = id);

-- Users can read their own subscription
CREATE POLICY subscriptions_select_own ON user_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can read their own usage
CREATE POLICY usage_select_own ON user_usage
    FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own API keys
CREATE POLICY api_keys_select_own ON api_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY api_keys_insert_own ON api_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY api_keys_delete_own ON api_keys
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_user_limit(
    p_user_id UUID,
    p_limit_type VARCHAR,
    p_increment INTEGER DEFAULT 1
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current INTEGER;
    v_limit INTEGER;
BEGIN
    -- Get current usage and limit
    SELECT
        CASE p_limit_type
            WHEN 'stores' THEN stores_count
            WHEN 'listings' THEN listings_count
            WHEN 'orders' THEN orders_count
            WHEN 'api_calls' THEN api_calls_count
            WHEN 'keepa_lookups' THEN keepa_lookups_count
        END,
        CASE p_limit_type
            WHEN 'stores' THEN stores_limit
            WHEN 'listings' THEN listings_limit
            WHEN 'orders' THEN orders_limit
            WHEN 'api_calls' THEN api_calls_limit
            WHEN 'keepa_lookups' THEN keepa_lookups_limit
        END
    INTO v_current, v_limit
    FROM user_usage
    WHERE user_id = p_user_id
      AND period_start <= CURRENT_DATE
      AND period_end >= CURRENT_DATE;

    -- No limit set = unlimited
    IF v_limit IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Check if within limit
    RETURN (COALESCE(v_current, 0) + p_increment) <= v_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to increment usage
CREATE OR REPLACE FUNCTION increment_usage(
    p_user_id UUID,
    p_limit_type VARCHAR,
    p_increment INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    UPDATE user_usage
    SET
        stores_count = CASE WHEN p_limit_type = 'stores' THEN stores_count + p_increment ELSE stores_count END,
        listings_count = CASE WHEN p_limit_type = 'listings' THEN listings_count + p_increment ELSE listings_count END,
        orders_count = CASE WHEN p_limit_type = 'orders' THEN orders_count + p_increment ELSE orders_count END,
        api_calls_count = CASE WHEN p_limit_type = 'api_calls' THEN api_calls_count + p_increment ELSE api_calls_count END,
        keepa_lookups_count = CASE WHEN p_limit_type = 'keepa_lookups' THEN keepa_lookups_count + p_increment ELSE keepa_lookups_count END,
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND period_start <= CURRENT_DATE
      AND period_end >= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ADD user_id TO EXISTING TABLES
-- ============================================================================

ALTER TABLE stores ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE skus ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE listing_jobs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE profit_goals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Indexes for user filtering
CREATE INDEX IF NOT EXISTS idx_stores_user ON stores(user_id);
CREATE INDEX IF NOT EXISTS idx_skus_user ON skus(user_id);
CREATE INDEX IF NOT EXISTS idx_listing_jobs_user ON listing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_profit_goals_user ON profit_goals(user_id);

-- ============================================================================
-- ANALYZE
-- ============================================================================

ANALYZE users;
ANALYZE user_subscriptions;
ANALYZE user_usage;
ANALYZE api_keys;
ANALYZE user_audit_log;
