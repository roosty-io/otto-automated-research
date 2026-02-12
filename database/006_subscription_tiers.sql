-- Subscription & Usage Tracking Migration
-- Run AFTER 005_profit_tracking.sql
-- Adds subscription tiers, usage limits, and tracking

-- ============================================================================
-- USER SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_id TEXT NOT NULL DEFAULT 'starter',
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('active', 'trial', 'past_due', 'cancelled', 'paused')),
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    overrides JSONB,  -- Admin feature/limit overrides
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON user_subscriptions(tier_id);

-- ============================================================================
-- USAGE TRACKING (Daily)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    listings_created INTEGER NOT NULL DEFAULT 0,
    orders_processed INTEGER NOT NULL DEFAULT 0,
    research_queries INTEGER NOT NULL DEFAULT 0,
    api_calls INTEGER NOT NULL DEFAULT 0,
    keepa_lookups INTEGER NOT NULL DEFAULT 0,
    storage_used_mb DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_tracking(user_id, date DESC);

-- ============================================================================
-- USAGE HISTORY (Monthly aggregates for billing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month DATE NOT NULL,  -- First day of month
    tier_id TEXT NOT NULL,
    total_listings_created INTEGER NOT NULL DEFAULT 0,
    total_orders_processed INTEGER NOT NULL DEFAULT 0,
    total_research_queries INTEGER NOT NULL DEFAULT 0,
    total_api_calls INTEGER NOT NULL DEFAULT 0,
    peak_storage_mb DECIMAL(12,2) DEFAULT 0,
    revenue_generated DECIMAL(12,2) DEFAULT 0,
    profit_generated DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_usage_history_user ON usage_history(user_id, month DESC);

-- ============================================================================
-- FUNCTION: Increment usage counter atomically
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_usage(
    p_user_id UUID,
    p_date DATE,
    p_field TEXT,
    p_amount INTEGER DEFAULT 1
)
RETURNS INTEGER AS $$
DECLARE
    v_new_value INTEGER;
BEGIN
    -- Insert or update usage record
    INSERT INTO usage_tracking (user_id, date, listings_created, orders_processed, research_queries, api_calls, keepa_lookups)
    VALUES (p_user_id, p_date, 0, 0, 0, 0, 0)
    ON CONFLICT (user_id, date) DO NOTHING;

    -- Update the specific field and return new value
    EXECUTE format('
        UPDATE usage_tracking
        SET %I = %I + $1, updated_at = NOW()
        WHERE user_id = $2 AND date = $3
        RETURNING %I', p_field, p_field, p_field)
    INTO v_new_value
    USING p_amount, p_user_id, p_date;

    RETURN v_new_value;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Aggregate monthly usage
-- ============================================================================

CREATE OR REPLACE FUNCTION aggregate_monthly_usage()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_last_month DATE := DATE_TRUNC('month', NOW() - INTERVAL '1 month')::DATE;
BEGIN
    INSERT INTO usage_history (user_id, month, tier_id, total_listings_created, total_orders_processed, total_research_queries, total_api_calls)
    SELECT
        ut.user_id,
        DATE_TRUNC('month', ut.date)::DATE,
        COALESCE(us.tier_id, 'starter'),
        SUM(ut.listings_created),
        SUM(ut.orders_processed),
        SUM(ut.research_queries),
        SUM(ut.api_calls)
    FROM usage_tracking ut
    LEFT JOIN user_subscriptions us ON ut.user_id = us.user_id
    WHERE DATE_TRUNC('month', ut.date) = v_last_month
    GROUP BY ut.user_id, DATE_TRUNC('month', ut.date), us.tier_id
    ON CONFLICT (user_id, month) DO UPDATE SET
        total_listings_created = EXCLUDED.total_listings_created,
        total_orders_processed = EXCLUDED.total_orders_processed,
        total_research_queries = EXCLUDED.total_research_queries,
        total_api_calls = EXCLUDED.total_api_calls;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STORE TIERS (for eBay store subscription levels)
-- ============================================================================

ALTER TABLE store_tiers ADD COLUMN IF NOT EXISTS monthly_fee DECIMAL(8,2);
ALTER TABLE store_tiers ADD COLUMN IF NOT EXISTS listing_allowance INTEGER;

-- Update existing tiers with eBay pricing
UPDATE store_tiers SET monthly_fee = 0, listing_allowance = 250 WHERE tier_name = 'starter' OR tier_name = 'Starter';
UPDATE store_tiers SET monthly_fee = 7.95, listing_allowance = 1000 WHERE tier_name = 'basic' OR tier_name = 'Basic';
UPDATE store_tiers SET monthly_fee = 27.95, listing_allowance = 2500 WHERE tier_name = 'premium' OR tier_name = 'Premium';
UPDATE store_tiers SET monthly_fee = 74.95, listing_allowance = 10000 WHERE tier_name = 'anchor' OR tier_name = 'Anchor';
UPDATE store_tiers SET monthly_fee = 349.95, listing_allowance = 100000 WHERE tier_name = 'enterprise' OR tier_name = 'Enterprise';

-- ============================================================================
-- VIEW: User subscription status with usage
-- ============================================================================

CREATE OR REPLACE VIEW v_user_subscription_status AS
SELECT
    us.user_id,
    us.tier_id,
    us.status,
    us.trial_ends_at,
    us.current_period_end,
    ut.listings_created AS today_listings,
    ut.orders_processed AS today_orders,
    ut.research_queries AS today_queries,
    CASE us.tier_id
        WHEN 'starter' THEN 50
        WHEN 'growth' THEN 150
        WHEN 'professional' THEN 400
        WHEN 'enterprise' THEN 2000
        WHEN 'managed_service' THEN 10000
        ELSE 50
    END AS daily_listing_limit,
    us.overrides
FROM user_subscriptions us
LEFT JOIN usage_tracking ut ON us.user_id = ut.user_id AND ut.date = CURRENT_DATE;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER trg_user_subscriptions_updated_at
    BEFORE UPDATE ON user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_usage_tracking_updated_at
    BEFORE UPDATE ON usage_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- DEFAULT SUBSCRIPTION FOR NEW USERS
-- ============================================================================

CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_subscriptions (user_id, tier_id, status, trial_ends_at)
    VALUES (NEW.id, 'starter', 'trial', NOW() + INTERVAL '14 days')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_default_subscription ON users;
CREATE TRIGGER trg_create_default_subscription
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_default_subscription();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run to verify:
-- SELECT * FROM v_user_subscription_status LIMIT 5;
-- SELECT increment_usage('user-id-here'::UUID, CURRENT_DATE, 'listings_created', 1);
