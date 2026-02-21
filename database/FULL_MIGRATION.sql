-- ============================================================================
-- OTTO Research Labs - Full Database Migration
-- Generated for Supabase project: sctfyrbpjxhivtjqizws
-- ============================================================================
--
-- INSTRUCTIONS:
-- 1. Go to: https://supabase.com/dashboard/project/sctfyrbpjxhivtjqizws/sql/new
-- 2. Copy this entire file and paste into the SQL Editor
-- 3. Click "Run" to execute all migrations
--
-- This migration is idempotent - it can be run multiple times safely
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- PART 1: CORE ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE listing_status AS ENUM ('draft', 'active', 'paused', 'ended', 'pruned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE sku_status AS ENUM ('draft', 'ready', 'distributed', 'exhausted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE enforcement_action_type AS ENUM ('prune', 'escalate', 'replenish', 'pause', 'resume');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE export_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE store_maturity AS ENUM ('new', 'establishing', 'growing', 'mature', 'seasoned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE listing_job_type AS ENUM ('managed_onboarding', 'self_service_onboarding', 'managed_replenishment', 'self_service_topup', 'bulk_import', 'escalation', 'pruning');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PART 2: CORE TABLES
-- ============================================================================

-- Store tiers
CREATE TABLE IF NOT EXISTS store_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tier_name TEXT NOT NULL UNIQUE,
    subscription_type TEXT NOT NULL,
    target_monthly_profit DECIMAL(10,2) NOT NULL,
    min_active_listings INTEGER NOT NULL,
    days_to_floor INTEGER NOT NULL DEFAULT 45,
    fee_free_listings INTEGER NOT NULL,
    subscription_listing_limit INTEGER NOT NULL,
    max_total_listings INTEGER NOT NULL,
    overage_fee DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    overage_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default tiers
INSERT INTO store_tiers (tier_name, subscription_type, target_monthly_profit, min_active_listings, days_to_floor, fee_free_listings, subscription_listing_limit, max_total_listings, overage_fee, overage_enabled) VALUES
    ('Bronze', 'Premium', 3000.00, 5000, 45, 10000, 10000, 10000, 0.30, false),
    ('Silver', 'Anchor', 5000.00, 10000, 60, 25000, 25000, 25000, 0.05, false),
    ('Gold', 'Anchor', 8000.00, 15000, 75, 25000, 25000, 30000, 0.05, true),
    ('Platinum', 'Anchor', 10000.00, 20000, 90, 25000, 25000, 40000, 0.05, true)
ON CONFLICT (tier_name) DO NOTHING;

-- Store maturity tiers
CREATE TABLE IF NOT EXISTS store_maturity_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    maturity_level store_maturity NOT NULL UNIQUE,
    min_days INTEGER NOT NULL,
    max_days INTEGER,
    velocity_multiplier DECIMAL(3,2) NOT NULL,
    daily_cap INTEGER NOT NULL,
    monthly_cap INTEGER NOT NULL,
    profit_target_percentage DECIMAL(3,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO store_maturity_tiers (maturity_level, min_days, max_days, velocity_multiplier, daily_cap, monthly_cap, profit_target_percentage) VALUES
    ('new', 0, 14, 0.40, 150, 2000, 0.30),
    ('establishing', 15, 30, 0.60, 200, 4000, 0.50),
    ('growing', 31, 60, 0.80, 250, 6000, 0.70),
    ('mature', 61, 90, 0.95, 300, 8000, 0.85),
    ('seasoned', 91, NULL, 1.00, 500, 10000, 1.00)
ON CONFLICT (maturity_level) DO NOTHING;

-- Stores
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_name TEXT NOT NULL,
    ebay_username TEXT NOT NULL UNIQUE,
    tier_id UUID NOT NULL REFERENCES store_tiers(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    ebay_registration_date DATE,
    onboarding_date DATE NOT NULL DEFAULT CURRENT_DATE,
    current_active_listings INTEGER NOT NULL DEFAULT 0,
    current_soft_ceiling INTEGER,
    client_id UUID,
    notes TEXT,
    maturity store_maturity NOT NULL DEFAULT 'new',
    maturity_updated_at TIMESTAMPTZ DEFAULT NOW(),
    calculated_soft_ceiling INTEGER,
    ceiling_last_calculated TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure client_id column exists for pre-existing tables (before creating index)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS client_id UUID;

CREATE INDEX IF NOT EXISTS idx_stores_tier ON stores(tier_id);
CREATE INDEX IF NOT EXISTS idx_stores_active ON stores(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_stores_client ON stores(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stores_maturity ON stores(maturity);

-- Add extra columns to stores (for later migrations)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS health_status VARCHAR(20) DEFAULT 'good';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS health_data JSONB DEFAULT '{}';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS fleet_group_id UUID;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS max_listings INTEGER DEFAULT 10000;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ramp_up_day INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ramp_up_started_at TIMESTAMPTZ;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS auto_optimize_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS last_rotation_at TIMESTAMPTZ;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS rotation_count INTEGER DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ebay_connected BOOLEAN DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ebay_connected_at TIMESTAMPTZ;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ebay_seller_id TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS default_payment_policy_id TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS default_return_policy_id TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS default_fulfillment_policy_id TEXT;

-- Store AutoDS config
CREATE TABLE IF NOT EXISTS store_autods_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    autods_store_id TEXT,
    google_sheet_id TEXT,
    sheet_tab_name TEXT DEFAULT 'Import',
    markup_percentage DECIMAL(5,2) NOT NULL DEFAULT 30.00,
    handling_time_days INTEGER NOT NULL DEFAULT 3,
    last_sync_at TIMESTAMPTZ,
    sync_status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id)
);

-- Store listing budget
CREATE TABLE IF NOT EXISTS store_listing_budget (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    budget_date DATE NOT NULL DEFAULT CURRENT_DATE,
    daily_target INTEGER NOT NULL DEFAULT 0,
    listings_added INTEGER NOT NULL DEFAULT 0,
    listings_removed INTEGER NOT NULL DEFAULT 0,
    eod_active_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id, budget_date)
);

CREATE INDEX IF NOT EXISTS idx_store_listing_budget_date ON store_listing_budget(budget_date);

-- Raw products (Layer 0)
CREATE TABLE IF NOT EXISTS raw_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asin TEXT NOT NULL,
    amazon_url TEXT,
    keepa_data JSONB NOT NULL DEFAULT '{}',
    title TEXT,
    brand TEXT,
    category TEXT,
    amazon_price DECIMAL(10,2),
    sales_rank INTEGER,
    review_count INTEGER,
    rating DECIMAL(3,2),
    is_processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ,
    source TEXT DEFAULT 'keepa',
    source_batch_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(asin)
);

CREATE INDEX IF NOT EXISTS idx_raw_products_unprocessed ON raw_products(is_processed) WHERE is_processed = false;
CREATE INDEX IF NOT EXISTS idx_raw_products_category ON raw_products(category);
CREATE INDEX IF NOT EXISTS idx_raw_products_created ON raw_products(created_at);

-- Normalized products (Layer 1)
CREATE TABLE IF NOT EXISTS normalized_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_product_id UUID NOT NULL REFERENCES raw_products(id) ON DELETE CASCADE,
    normalized_title TEXT NOT NULL,
    normalized_category TEXT NOT NULL,
    normalized_subcategory TEXT,
    use_case TEXT,
    target_demographic TEXT,
    key_features JSONB DEFAULT '[]',
    cost_price DECIMAL(10,2) NOT NULL,
    suggested_sell_price DECIMAL(10,2),
    suggested_price_band TEXT,
    listing_quality_score DECIMAL(3,2),
    demand_confidence DECIMAL(3,2),
    ai_model TEXT DEFAULT 'claude-3-sonnet',
    ai_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(raw_product_id)
);

CREATE INDEX IF NOT EXISTS idx_normalized_category ON normalized_products(normalized_category);
CREATE INDEX IF NOT EXISTS idx_normalized_subcategory ON normalized_products(normalized_subcategory);

-- Patterns (Layer 2)
CREATE TABLE IF NOT EXISTS patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL,
    subcategory TEXT,
    use_case TEXT,
    price_band TEXT NOT NULL,
    total_skus INTEGER NOT NULL DEFAULT 0,
    total_sales INTEGER NOT NULL DEFAULT 0,
    total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_profit DECIMAL(12,2) NOT NULL DEFAULT 0,
    avg_days_to_sale DECIMAL(6,2),
    return_rate DECIMAL(5,4) DEFAULT 0,
    pattern_score DECIMAL(5,2) DEFAULT 0,
    is_validated BOOLEAN NOT NULL DEFAULT false,
    validation_date TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pattern_fingerprint ON patterns(category, COALESCE(subcategory, ''), COALESCE(use_case, ''), price_band);
CREATE INDEX IF NOT EXISTS idx_patterns_active ON patterns(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_patterns_validated ON patterns(is_validated) WHERE is_validated = true;
CREATE INDEX IF NOT EXISTS idx_patterns_score ON patterns(pattern_score DESC);

-- SKUs (Layer 3)
CREATE TABLE IF NOT EXISTS skus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    normalized_product_id UUID NOT NULL REFERENCES normalized_products(id),
    pattern_id UUID REFERENCES patterns(id),
    sku_code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    bullet_points JSONB DEFAULT '[]',
    cost_price DECIMAL(10,2) NOT NULL,
    sell_price DECIMAL(10,2) NOT NULL,
    expected_profit DECIMAL(10,2) GENERATED ALWAYS AS (sell_price - cost_price - (sell_price * 0.13)) STORED,
    status sku_status NOT NULL DEFAULT 'draft',
    max_store_count INTEGER NOT NULL DEFAULT 3,
    current_store_count INTEGER NOT NULL DEFAULT 0,
    total_sales INTEGER NOT NULL DEFAULT 0,
    total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_profit DECIMAL(12,2) NOT NULL DEFAULT 0,
    avg_days_to_sale DECIMAL(6,2),
    user_id UUID,
    validation_status TEXT DEFAULT 'pending',
    amazon_url TEXT,
    amazon_asin TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skus_status ON skus(status);
CREATE INDEX IF NOT EXISTS idx_skus_pattern ON skus(pattern_id);
CREATE INDEX IF NOT EXISTS idx_skus_available ON skus(status, current_store_count) WHERE status = 'ready' AND current_store_count < 3;
CREATE INDEX IF NOT EXISTS idx_skus_user ON skus(user_id);
CREATE INDEX IF NOT EXISTS idx_skus_validation ON skus(validation_status);

-- Store SKU assignments (Layer 4)
CREATE TABLE IF NOT EXISTS store_sku_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    ebay_listing_id TEXT,
    listing_url TEXT,
    listing_status listing_status NOT NULL DEFAULT 'draft',
    listed_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0,
    profit DECIMAL(10,2) DEFAULT 0,
    current_price DECIMAL(10,2),
    last_sale_at TIMESTAMPTZ,
    autods_draft_id TEXT,
    autods_listing_id TEXT,
    markup_percentage DECIMAL(5,2) DEFAULT 30.00,
    published_at TIMESTAMPTZ,
    publish_error TEXT,
    ebay_offer_id TEXT,
    ebay_inventory_item_id TEXT,
    ebay_category_id TEXT,
    listing_source TEXT DEFAULT 'autods',
    rotated_at TIMESTAMPTZ,
    rotated_from_store_id UUID,
    rebalanced_at TIMESTAMPTZ,
    assignment_source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id, sku_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_store ON store_sku_assignments(store_id);
CREATE INDEX IF NOT EXISTS idx_assignments_sku ON store_sku_assignments(sku_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON store_sku_assignments(listing_status);
CREATE INDEX IF NOT EXISTS idx_assignments_prune_candidates ON store_sku_assignments(last_sale_at, listed_at) WHERE listing_status = 'active';
CREATE INDEX IF NOT EXISTS idx_assignments_autods_draft ON store_sku_assignments(autods_draft_id) WHERE autods_draft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_autods_listing ON store_sku_assignments(autods_listing_id) WHERE autods_listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_ebay_offer ON store_sku_assignments(ebay_offer_id) WHERE ebay_offer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_rotated ON store_sku_assignments(rotated_at) WHERE rotated_at IS NOT NULL;

-- ============================================================================
-- PART 3: USERS & AUTH (Required early for foreign keys)
-- ============================================================================

-- Users table (links to Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    company VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_step INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}',
    notification_preferences JSONB DEFAULT '{"email_orders": true, "email_alerts": true, "email_reports": false}',
    timezone VARCHAR(50) DEFAULT 'UTC',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboarding_completed);

-- User subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    tier_id VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(20) NOT NULL DEFAULT 'incomplete' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired')),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);

-- User usage tracking
CREATE TABLE IF NOT EXISTS user_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    stores_count INTEGER DEFAULT 0,
    listings_count INTEGER DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    api_calls_count INTEGER DEFAULT 0,
    keepa_lookups_count INTEGER DEFAULT 0,
    stores_limit INTEGER,
    listings_limit INTEGER,
    orders_limit INTEGER,
    api_calls_limit INTEGER,
    keepa_lookups_limit INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_period ON user_usage(user_id, period_start DESC);

-- API keys
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    prefix VARCHAR(10) NOT NULL,
    permissions TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix);

-- User audit log
CREATE TABLE IF NOT EXISTS user_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON user_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON user_audit_log(action, created_at DESC);

-- Profit goals (needed for later migrations)
CREATE TABLE IF NOT EXISTS profit_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    target_monthly_profit DECIMAL(12,2) NOT NULL,
    current_month_profit DECIMAL(12,2) DEFAULT 0,
    goal_period_start DATE NOT NULL,
    goal_period_end DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profit_goals_user ON profit_goals(user_id);

-- Add foreign key from stores to users
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_user_id_fkey;
DO $$ BEGIN
    ALTER TABLE stores ADD CONSTRAINT stores_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_stores_user ON stores(user_id);

-- ============================================================================
-- PART 4: ORDERS & SALES
-- ============================================================================

-- Orders table (comprehensive)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
    assignment_id UUID REFERENCES store_sku_assignments(id) ON DELETE SET NULL,
    external_order_id VARCHAR(100),
    platform VARCHAR(20) NOT NULL DEFAULT 'ebay',
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'returned', 'canceled')),
    sale_price DECIMAL(10, 2) NOT NULL,
    source_cost DECIMAL(10, 2),
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    ebay_fees DECIMAL(10, 2) DEFAULT 0,
    payment_processing_fee DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10,2),
    profit DECIMAL(10,2),
    gross_profit DECIMAL(10, 2) GENERATED ALWAYS AS (
        sale_price - COALESCE(source_cost, 0) - COALESCE(shipping_cost, 0) -
        COALESCE(ebay_fees, 0) - COALESCE(payment_processing_fee, 0)
    ) STORED,
    buyer_username VARCHAR(100),
    buyer_feedback_score INTEGER,
    order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_date TIMESTAMPTZ,
    shipped_date TIMESTAMPTZ,
    delivered_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_sku ON orders(sku_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external ON orders(store_id, external_order_id) WHERE external_order_id IS NOT NULL;

-- Sales table (legacy compatibility)
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    sku_id UUID NOT NULL REFERENCES skus(id),
    ebay_order_id TEXT NOT NULL UNIQUE,
    ebay_order_date TIMESTAMPTZ NOT NULL,
    sale_price DECIMAL(10,2) NOT NULL,
    ebay_fees DECIMAL(10,2) NOT NULL DEFAULT 0,
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    product_cost DECIMAL(10,2) NOT NULL,
    profit DECIMAL(10,2) GENERATED ALWAYS AS (sale_price - ebay_fees - shipping_cost - product_cost) STORED,
    buyer_username TEXT,
    shipping_address_state TEXT,
    shipping_address_country TEXT DEFAULT 'US',
    is_returned BOOLEAN NOT NULL DEFAULT false,
    returned_at TIMESTAMPTZ,
    return_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_assignment ON sales(assignment_id);
CREATE INDEX IF NOT EXISTS idx_sales_store ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_sku ON sales(sku_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(ebay_order_date);
CREATE INDEX IF NOT EXISTS idx_sales_returned ON sales(is_returned) WHERE is_returned = true;

-- ============================================================================
-- PART 5: ADDITIONAL CORE TABLES
-- ============================================================================

-- Distribution queue
CREATE TABLE IF NOT EXISTS distribution_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 0,
    status job_status NOT NULL DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    assignment_id UUID REFERENCES store_sku_assignments(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(sku_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_distribution_queue_pending ON distribution_queue(priority DESC, created_at) WHERE status = 'pending';

-- Export batches
CREATE TABLE IF NOT EXISTS export_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    batch_number INTEGER NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    status export_status NOT NULL DEFAULT 'pending',
    sheet_id TEXT,
    sheet_url TEXT,
    exported_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_batches_pending ON export_batches(store_id, status) WHERE status = 'pending';

-- Export queue
CREATE TABLE IF NOT EXISTS export_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES export_batches(id),
    status export_status NOT NULL DEFAULT 'pending',
    export_data JSONB NOT NULL,
    exported_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(assignment_id)
);

CREATE INDEX IF NOT EXISTS idx_export_queue_pending ON export_queue(status) WHERE status = 'pending';

-- Enforcement actions
CREATE TABLE IF NOT EXISTS enforcement_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES store_sku_assignments(id),
    sku_id UUID REFERENCES skus(id),
    store_id UUID REFERENCES stores(id),
    action_type enforcement_action_type NOT NULL,
    reason TEXT NOT NULL,
    state_before JSONB,
    state_after JSONB,
    initiated_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enforcement_assignment ON enforcement_actions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_enforcement_store ON enforcement_actions(store_id);
CREATE INDEX IF NOT EXISTS idx_enforcement_type ON enforcement_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_enforcement_date ON enforcement_actions(created_at);

-- System events
CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    event_source TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'info',
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_status ON system_events(status);
CREATE INDEX IF NOT EXISTS idx_system_events_date ON system_events(created_at);

-- Listing jobs
CREATE TABLE IF NOT EXISTS listing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    job_type listing_job_type NOT NULL,
    job_name TEXT NOT NULL,
    target_listing_count INTEGER NOT NULL,
    completed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    status job_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    config JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_jobs_store ON listing_jobs(store_id);
CREATE INDEX IF NOT EXISTS idx_listing_jobs_status ON listing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_listing_jobs_pending ON listing_jobs(priority DESC, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_listing_jobs_processing ON listing_jobs(started_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_listing_jobs_user ON listing_jobs(user_id);

-- Listing job logs
CREATE TABLE IF NOT EXISTS listing_job_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES listing_jobs(id) ON DELETE CASCADE,
    log_level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    sku_id UUID REFERENCES skus(id),
    assignment_id UUID REFERENCES store_sku_assignments(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_job_logs_job ON listing_job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_listing_job_logs_level ON listing_job_logs(log_level);

-- ============================================================================
-- PART 6: NOTIFICATIONS & ALERTS
-- ============================================================================

-- Notifications
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type TEXT,
    rule_type VARCHAR(50),
    conditions JSONB DEFAULT '[]',
    condition JSONB,
    channels TEXT[],
    notify_channels TEXT[],
    priority TEXT DEFAULT 'normal',
    severity VARCHAR(20) CHECK (severity IS NULL OR severity IN ('critical', 'warning', 'info')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN DEFAULT TRUE,
    cooldown_minutes INTEGER DEFAULT 60,
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
-- PART 7: EBAY INTEGRATION
-- ============================================================================

-- eBay tokens
CREATE TABLE IF NOT EXISTS ebay_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    ebay_username TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS idx_ebay_tokens_store ON ebay_tokens(store_id);
CREATE INDEX IF NOT EXISTS idx_ebay_tokens_expires ON ebay_tokens(expires_at);

-- eBay orders
CREATE TABLE IF NOT EXISTS ebay_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    ebay_order_id TEXT NOT NULL UNIQUE,
    legacy_order_id TEXT,
    order_status TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    buyer_username TEXT,
    total_amount DECIMAL(10,2) NOT NULL,
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    marketplace_fee DECIMAL(10,2),
    order_date TIMESTAMPTZ NOT NULL,
    line_items JSONB DEFAULT '[]',
    shipping_address JSONB,
    tracking_number TEXT,
    shipping_carrier TEXT,
    shipped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebay_orders_store ON ebay_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_ebay_orders_status ON ebay_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_ebay_orders_date ON ebay_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_ebay_orders_payment ON ebay_orders(payment_status);

-- eBay policies
CREATE TABLE IF NOT EXISTS ebay_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    policy_type TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    policy_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(store_id, policy_type, policy_id)
);

CREATE INDEX IF NOT EXISTS idx_ebay_policies_store ON ebay_policies(store_id);
CREATE INDEX IF NOT EXISTS idx_ebay_policies_type ON ebay_policies(policy_type);

-- Compliance checks
CREATE TABLE IF NOT EXISTS compliance_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID REFERENCES skus(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    check_type TEXT NOT NULL,
    status TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_sku ON compliance_checks(sku_id);
CREATE INDEX IF NOT EXISTS idx_compliance_store ON compliance_checks(store_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_checks(status) WHERE status != 'passed';

-- API rate limits
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_name TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    requests_made INTEGER DEFAULT 0,
    requests_limit INTEGER NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_duration_seconds INTEGER NOT NULL DEFAULT 60,
    last_request_at TIMESTAMPTZ,
    UNIQUE(api_name, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_api ON api_rate_limits(api_name);

-- ============================================================================
-- PART 8: PRICING & REPRICING
-- ============================================================================

-- Pricing rules
CREATE TABLE IF NOT EXISTS pricing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    pattern_id UUID REFERENCES patterns(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL DEFAULT 'percentage',
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
-- PART 9: PRUNING & RESEARCH
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
    recommended_action TEXT DEFAULT 'prune',
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

-- Research jobs
CREATE TABLE IF NOT EXISTS research_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type TEXT NOT NULL DEFAULT 'keepa_bestsellers',
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

-- Prune events
CREATE TABLE IF NOT EXISTS prune_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES store_sku_assignments(id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason VARCHAR(50) NOT NULL,
    reason_details TEXT,
    days_active INTEGER,
    total_views INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    final_price DECIMAL(10, 2),
    pruned_by VARCHAR(20) DEFAULT 'system',
    pruned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prune_store ON prune_events(store_id, pruned_at DESC);
CREATE INDEX IF NOT EXISTS idx_prune_reason ON prune_events(reason, pruned_at DESC);
CREATE INDEX IF NOT EXISTS idx_prune_date ON prune_events(pruned_at DESC);

-- ============================================================================
-- PART 10: SESSIONS & MONITORING
-- ============================================================================

-- AutoDS sessions
CREATE TABLE IF NOT EXISTS autods_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255),
    session_id VARCHAR(100),
    cookies JSONB NOT NULL DEFAULT '[]',
    local_storage JSONB DEFAULT '{}',
    user_agent TEXT,
    is_valid BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    last_used TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autods_sessions_email ON autods_sessions(email);
CREATE INDEX IF NOT EXISTS idx_autods_sessions_valid ON autods_sessions(is_valid, expires_at);

-- ZIK sessions
CREATE TABLE IF NOT EXISTS zik_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    session_id VARCHAR(100),
    cookies JSONB NOT NULL DEFAULT '[]',
    local_storage JSONB DEFAULT '{}',
    session_storage JSONB DEFAULT '{}',
    user_agent TEXT,
    is_valid BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zik_sessions_email ON zik_sessions(email);
CREATE INDEX IF NOT EXISTS idx_zik_sessions_valid ON zik_sessions(is_valid, expires_at);

-- Scraper health checks
CREATE TABLE IF NOT EXISTS scraper_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    health_score INTEGER NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
    duration_ms INTEGER,
    total_selectors INTEGER NOT NULL DEFAULT 0,
    working_selectors INTEGER NOT NULL DEFAULT 0,
    broken_selectors INTEGER NOT NULL DEFAULT 0,
    platforms JSONB NOT NULL DEFAULT '[]',
    browser_pool JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraper_health_timestamp ON scraper_health_checks(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_health_score ON scraper_health_checks(health_score);

-- Scraper selector failures
CREATE TABLE IF NOT EXISTS scraper_selector_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL,
    selector_name VARCHAR(100) NOT NULL,
    selector_value TEXT NOT NULL,
    first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    failure_count INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'failing',
    resolved_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(platform, selector_name)
);

CREATE INDEX IF NOT EXISTS idx_selector_failures_platform ON scraper_selector_failures(platform, status);
CREATE INDEX IF NOT EXISTS idx_selector_failures_status ON scraper_selector_failures(status, last_failed_at DESC);

-- Scraper errors
CREATE TABLE IF NOT EXISTS scraper_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL,
    operation VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    error_code VARCHAR(50),
    url TEXT,
    selector TEXT,
    screenshot_path TEXT,
    request_data JSONB,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraper_errors_platform ON scraper_errors(platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_errors_operation ON scraper_errors(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_errors_created ON scraper_errors(created_at DESC);

-- Scraper metrics
CREATE TABLE IF NOT EXISTS scraper_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL,
    metric_date DATE NOT NULL,
    total_operations INTEGER NOT NULL DEFAULT 0,
    successful_operations INTEGER NOT NULL DEFAULT 0,
    failed_operations INTEGER NOT NULL DEFAULT 0,
    avg_response_time_ms INTEGER,
    max_response_time_ms INTEGER,
    min_response_time_ms INTEGER,
    logins_attempted INTEGER DEFAULT 0,
    logins_successful INTEGER DEFAULT 0,
    listings_fetched INTEGER DEFAULT 0,
    prices_updated INTEGER DEFAULT 0,
    products_uploaded INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(platform, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_scraper_metrics_platform_date ON scraper_metrics(platform, metric_date DESC);

-- ============================================================================
-- PART 11: MULTI-STORE MANAGEMENT
-- ============================================================================

-- Store groups
CREATE TABLE IF NOT EXISTS store_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    autods_account_id VARCHAR(255),
    user_id VARCHAR(255) NOT NULL,
    store_ids UUID[] DEFAULT '{}',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_groups_user ON store_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_store_groups_autods ON store_groups(autods_account_id);

-- Add foreign key from stores to store_groups
DO $$ BEGIN
    ALTER TABLE stores ADD CONSTRAINT stores_fleet_group_id_fkey FOREIGN KEY (fleet_group_id) REFERENCES store_groups(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_stores_fleet_group ON stores(fleet_group_id) WHERE fleet_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stores_ramp_up ON stores(ramp_up_day, ramp_up_started_at) WHERE ramp_up_day > 0 AND ramp_up_day < 45;

-- Fleet alerts
CREATE TABLE IF NOT EXISTS fleet_alerts (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    type VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    store_ids UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_alerts_user ON fleet_alerts(user_id, acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_alerts_severity ON fleet_alerts(severity, created_at DESC) WHERE NOT acknowledged;
CREATE INDEX IF NOT EXISTS idx_fleet_alerts_type ON fleet_alerts(type, created_at DESC);

-- Rebalance history
CREATE TABLE IF NOT EXISTS rebalance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    pre_imbalance_score INTEGER NOT NULL,
    post_imbalance_score INTEGER NOT NULL,
    moves_executed INTEGER NOT NULL,
    moves_failed INTEGER DEFAULT 0,
    move_details JSONB NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rebalance_group ON rebalance_history(group_id, executed_at DESC);

-- Rotation history
CREATE TABLE IF NOT EXISTS rotation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    strategy VARCHAR(50) NOT NULL,
    skus_rotated INTEGER NOT NULL,
    skus_failed INTEGER DEFAULT 0,
    rotation_details JSONB NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rotation_group ON rotation_history(group_id, executed_at DESC);

-- Fleet metrics snapshots
CREATE TABLE IF NOT EXISTS fleet_metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    snapshot_date DATE NOT NULL,
    total_stores INTEGER NOT NULL,
    active_stores INTEGER NOT NULL,
    paused_stores INTEGER DEFAULT 0,
    disabled_stores INTEGER DEFAULT 0,
    health_excellent INTEGER DEFAULT 0,
    health_good INTEGER DEFAULT 0,
    health_fair INTEGER DEFAULT 0,
    health_poor INTEGER DEFAULT 0,
    health_critical INTEGER DEFAULT 0,
    total_listings INTEGER NOT NULL,
    total_orders INTEGER NOT NULL,
    total_revenue DECIMAL(12, 2) NOT NULL,
    total_profit DECIMAL(12, 2) NOT NULL,
    avg_health_score INTEGER,
    avg_defect_rate DECIMAL(5, 2),
    avg_late_shipment_rate DECIMAL(5, 2),
    avg_feedback_score DECIMAL(5, 2),
    capacity_utilization DECIMAL(5, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_fleet_snapshots_group_date ON fleet_metrics_snapshots(group_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_snapshots_user_date ON fleet_metrics_snapshots(user_id, snapshot_date DESC);

-- Bulk operation logs
CREATE TABLE IF NOT EXISTS bulk_operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    group_id UUID REFERENCES store_groups(id) ON DELETE SET NULL,
    operation_type VARCHAR(100) NOT NULL,
    target_count INTEGER NOT NULL,
    successful_count INTEGER NOT NULL,
    failed_count INTEGER DEFAULT 0,
    parameters JSONB,
    results JSONB,
    error_messages TEXT[],
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_ops_user ON bulk_operation_logs(user_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_ops_type ON bulk_operation_logs(operation_type, executed_at DESC);

-- Managed service progress
CREATE TABLE IF NOT EXISTS managed_service_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES store_groups(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    ramp_up_day INTEGER NOT NULL,
    date DATE NOT NULL,
    listings_added INTEGER DEFAULT 0,
    total_listings INTEGER NOT NULL,
    orders_count INTEGER DEFAULT 0,
    revenue DECIMAL(12, 2) DEFAULT 0,
    profit DECIMAL(12, 2) DEFAULT 0,
    health_score INTEGER,
    defect_rate DECIMAL(5, 2),
    late_shipment_rate DECIMAL(5, 2),
    target_listings INTEGER,
    target_revenue DECIMAL(12, 2),
    on_track BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, date)
);

CREATE INDEX IF NOT EXISTS idx_managed_progress_store ON managed_service_progress(store_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_managed_progress_group ON managed_service_progress(group_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_managed_progress_ramp ON managed_service_progress(ramp_up_day, on_track);

-- ============================================================================
-- PART 12: ADMIN DASHBOARD
-- ============================================================================

-- Admin action logs
CREATE TABLE IF NOT EXISTS admin_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    details JSONB DEFAULT '{}',
    result VARCHAR(20) NOT NULL,
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_action_logs(admin_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_action_logs(action, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON admin_action_logs(target_type, target_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_result ON admin_action_logs(result, executed_at DESC) WHERE result != 'success';

-- Admin sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    ip_address VARCHAR(45),
    user_agent TEXT,
    actions_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON admin_sessions(is_active, started_at DESC) WHERE is_active = TRUE;

-- System settings
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(255)
);

INSERT INTO system_settings (key, value, description, category) VALUES
('ramp_up_schedule', '{"day1_listings": 50, "day45_target_profit": 3000}', 'Ramp-up schedule configuration', 'ramp_up'),
('compliance_thresholds', '{"max_defect_rate": 2.0, "max_late_shipment": 7.0, "min_feedback": 95.0}', 'eBay compliance thresholds', 'compliance'),
('automation_defaults', '{"auto_listing": true, "auto_repricing": true, "auto_pruning": true}', 'Default automation settings for new stores', 'automation'),
('alert_settings', '{"email_critical": true, "email_warning": false, "slack_enabled": false}', 'Alert notification settings', 'notifications'),
('managed_service_config', '{"target_profit_per_store": 3000, "ramp_up_days": 45, "min_health_score": 50}', 'Managed service configuration', 'managed_service')
ON CONFLICT (key) DO NOTHING;

-- Daily snapshots
CREATE TABLE IF NOT EXISTS daily_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    snapshot_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(255),
    metrics JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_date, snapshot_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON daily_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_type ON daily_snapshots(snapshot_type, snapshot_date DESC);

-- Scheduled tasks
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_name VARCHAR(255) NOT NULL UNIQUE,
    task_type VARCHAR(50) NOT NULL,
    schedule VARCHAR(100) NOT NULL,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO scheduled_tasks (task_name, task_type, schedule, is_active, config) VALUES
('fleet_health_check', 'health_check', '0 */4 * * *', TRUE, '{"include_all_stores": true}'),
('daily_snapshot', 'snapshot', '0 0 * * *', TRUE, '{"snapshot_types": ["fleet", "financial"]}'),
('sku_rotation', 'rotation', '0 2 * * 0', TRUE, '{"strategy": "performance", "max_rotations": 500}'),
('fleet_rebalance', 'rebalance', '0 3 * * 1', TRUE, '{"threshold_percent": 20}'),
('stale_listing_prune', 'prune', '0 4 * * *', TRUE, '{"days_without_sales": 14}'),
('ramp_up_advance', 'ramp_up', '0 0 * * *', TRUE, '{"auto_advance": true}')
ON CONFLICT (task_name) DO NOTHING;

-- Metrics cache
CREATE TABLE IF NOT EXISTS metrics_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    cache_value JSONB NOT NULL,
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    computation_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_metrics_cache_expiry ON metrics_cache(expires_at) WHERE expires_at > NOW();

-- ============================================================================
-- PART 13: ADDITIONAL TABLES
-- ============================================================================

-- Listing performance
CREATE TABLE IF NOT EXISTS listing_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    views INTEGER DEFAULT 0,
    watchers INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0,
    revenue DECIMAL(10, 2) DEFAULT 0,
    click_through_rate DECIMAL(5, 4) GENERATED ALWAYS AS (
        CASE WHEN impressions > 0 THEN clicks::DECIMAL / impressions ELSE 0 END
    ) STORED,
    conversion_rate DECIMAL(5, 4) GENERATED ALWAYS AS (
        CASE WHEN clicks > 0 THEN sales::DECIMAL / clicks ELSE 0 END
    ) STORED,
    listing_status VARCHAR(20),
    current_price DECIMAL(10, 2),
    quantity_available INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assignment_id, date)
);

CREATE INDEX IF NOT EXISTS idx_listing_perf_assignment ON listing_performance(assignment_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_listing_perf_store ON listing_performance(store_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_listing_perf_date ON listing_performance(date DESC);

-- Store daily metrics
CREATE TABLE IF NOT EXISTS store_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    active_listings INTEGER DEFAULT 0,
    total_inventory_value DECIMAL(12, 2) DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    units_sold INTEGER DEFAULT 0,
    gross_revenue DECIMAL(12, 2) DEFAULT 0,
    net_revenue DECIMAL(12, 2) DEFAULT 0,
    total_cost DECIMAL(12, 2) DEFAULT 0,
    gross_profit DECIMAL(12, 2) DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    total_impressions INTEGER DEFAULT 0,
    sell_through_rate DECIMAL(5, 4) DEFAULT 0,
    avg_days_to_sell INTEGER,
    listings_pruned INTEGER DEFAULT 0,
    listings_added INTEGER DEFAULT 0,
    net_listing_change INTEGER GENERATED ALWAYS AS (listings_added - listings_pruned) STORED,
    defect_rate DECIMAL(5, 4),
    late_shipment_rate DECIMAL(5, 4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, date)
);

CREATE INDEX IF NOT EXISTS idx_store_metrics_store ON store_daily_metrics(store_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_store_metrics_user ON store_daily_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_store_metrics_date ON store_daily_metrics(date DESC);

-- User profit summary
CREATE TABLE IF NOT EXISTS user_profit_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    gross_revenue DECIMAL(12, 2) DEFAULT 0,
    net_revenue DECIMAL(12, 2) DEFAULT 0,
    product_cost DECIMAL(12, 2) DEFAULT 0,
    shipping_cost DECIMAL(12, 2) DEFAULT 0,
    platform_fees DECIMAL(12, 2) DEFAULT 0,
    subscription_cost DECIMAL(12, 2) DEFAULT 0,
    gross_profit DECIMAL(12, 2) DEFAULT 0,
    net_profit DECIMAL(12, 2) GENERATED ALWAYS AS (
        gross_revenue - COALESCE(product_cost, 0) - COALESCE(shipping_cost, 0) -
        COALESCE(platform_fees, 0) - COALESCE(subscription_cost, 0)
    ) STORED,
    total_orders INTEGER DEFAULT 0,
    total_units INTEGER DEFAULT 0,
    avg_order_value DECIMAL(10, 2),
    avg_profit_per_order DECIMAL(10, 2),
    sell_through_rate DECIMAL(5, 4),
    prune_rate DECIMAL(5, 4),
    return_rate DECIMAL(5, 4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_profit_summary_user ON user_profit_summary(user_id, period_start DESC);

-- System logs
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_type TEXT NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_type ON system_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON system_logs(source);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);

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

-- ============================================================================
-- PART 14: CORE FUNCTIONS
-- ============================================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$ BEGIN
    CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_store_autods_config_updated_at BEFORE UPDATE ON store_autods_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_raw_products_updated_at BEFORE UPDATE ON raw_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_normalized_products_updated_at BEFORE UPDATE ON normalized_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_patterns_updated_at BEFORE UPDATE ON patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_skus_updated_at BEFORE UPDATE ON skus FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_store_sku_assignments_updated_at BEFORE UPDATE ON store_sku_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_listing_jobs_updated_at BEFORE UPDATE ON listing_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_ebay_tokens_updated_at BEFORE UPDATE ON ebay_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_ebay_orders_updated_at BEFORE UPDATE ON ebay_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_ebay_policies_updated_at BEFORE UPDATE ON ebay_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PART 15: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_autods_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Admin policies (allow all for service role)
DROP POLICY IF EXISTS admin_all_stores ON stores;
CREATE POLICY admin_all_stores ON stores FOR ALL USING (true);

DROP POLICY IF EXISTS admin_all_autods_config ON store_autods_config;
CREATE POLICY admin_all_autods_config ON store_autods_config FOR ALL USING (true);

DROP POLICY IF EXISTS admin_all_sales ON sales;
CREATE POLICY admin_all_sales ON sales FOR ALL USING (true);

-- User policies
DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own ON users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS subscriptions_select_own ON user_subscriptions;
CREATE POLICY subscriptions_select_own ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS usage_select_own ON user_usage;
CREATE POLICY usage_select_own ON user_usage FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS api_keys_select_own ON api_keys;
CREATE POLICY api_keys_select_own ON api_keys FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS api_keys_insert_own ON api_keys;
CREATE POLICY api_keys_insert_own ON api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS api_keys_delete_own ON api_keys;
CREATE POLICY api_keys_delete_own ON api_keys FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 16: MATERIALIZED VIEW
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_store_health;
CREATE MATERIALIZED VIEW mv_store_health AS
SELECT
    s.id AS store_id, s.store_name, s.ebay_username, t.tier_name, s.maturity, s.is_active, s.current_active_listings,
    t.min_active_listings AS tier_floor, t.max_total_listings AS tier_ceiling, t.target_monthly_profit AS tier_profit_target,
    m.velocity_multiplier, ROUND(t.min_active_listings * m.velocity_multiplier) AS effective_floor,
    LEAST(m.monthly_cap, ROUND(t.max_total_listings * m.velocity_multiplier)) AS effective_ceiling, m.daily_cap,
    ROUND(t.target_monthly_profit * m.profit_target_percentage, 2) AS effective_profit_target,
    ROUND((s.current_active_listings::DECIMAL / NULLIF(ROUND(t.min_active_listings * m.velocity_multiplier), 0)) * 100, 1) AS floor_percentage,
    COALESCE((SELECT SUM(profit) FROM sales WHERE store_id = s.id AND ebay_order_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS mtd_profit,
    COALESCE((SELECT COUNT(*) FROM sales WHERE store_id = s.id AND ebay_order_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS mtd_sales,
    s.onboarding_date, (CURRENT_DATE - s.onboarding_date) AS days_active,
    GREATEST(0, t.days_to_floor - (CURRENT_DATE - s.onboarding_date)) AS days_to_floor_remaining
FROM stores s
JOIN store_tiers t ON s.tier_id = t.id
JOIN store_maturity_tiers m ON s.maturity = m.maturity_level
WHERE s.is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_store_health_id ON mv_store_health(store_id);

CREATE OR REPLACE FUNCTION refresh_store_health() RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_store_health;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run this query after migration to verify tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- Count tables (should be ~60+)
-- SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';

SELECT 'Migration completed successfully!' AS status;
