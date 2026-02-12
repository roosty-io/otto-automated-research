-- Profit Tracking & Performance Metrics Migration
-- Run AFTER 010_scraper_monitoring.sql
-- Tracks sell-through, prune rates, and profit metrics for validation

-- ============================================================================
-- ORDERS TABLE
-- ============================================================================
-- Tracks actual sales/orders for profit calculation

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
    assignment_id UUID REFERENCES store_sku_assignments(id) ON DELETE SET NULL,

    -- Order details
    external_order_id VARCHAR(100), -- eBay/AutoDS order ID
    platform VARCHAR(20) NOT NULL DEFAULT 'ebay',
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'returned', 'canceled')),

    -- Financials
    sale_price DECIMAL(10, 2) NOT NULL,
    source_cost DECIMAL(10, 2), -- Cost from supplier
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    ebay_fees DECIMAL(10, 2) DEFAULT 0,
    payment_processing_fee DECIMAL(10, 2) DEFAULT 0,
    gross_profit DECIMAL(10, 2) GENERATED ALWAYS AS (
        sale_price - COALESCE(source_cost, 0) - COALESCE(shipping_cost, 0) -
        COALESCE(ebay_fees, 0) - COALESCE(payment_processing_fee, 0)
    ) STORED,

    -- Buyer info (for returns/issues tracking)
    buyer_username VARCHAR(100),
    buyer_feedback_score INTEGER,

    -- Timestamps
    order_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    paid_date TIMESTAMP WITH TIME ZONE,
    shipped_date TIMESTAMP WITH TIME ZONE,
    delivered_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_sku ON orders(sku_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external ON orders(store_id, external_order_id);

-- ============================================================================
-- LISTING PERFORMANCE TABLE
-- ============================================================================
-- Daily snapshots of listing performance for sell-through calculation

CREATE TABLE IF NOT EXISTS listing_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES store_sku_assignments(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,

    -- Date of snapshot
    date DATE NOT NULL,

    -- Metrics
    views INTEGER DEFAULT 0,
    watchers INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0,
    revenue DECIMAL(10, 2) DEFAULT 0,

    -- Calculated rates
    click_through_rate DECIMAL(5, 4) GENERATED ALWAYS AS (
        CASE WHEN impressions > 0 THEN clicks::DECIMAL / impressions ELSE 0 END
    ) STORED,
    conversion_rate DECIMAL(5, 4) GENERATED ALWAYS AS (
        CASE WHEN clicks > 0 THEN sales::DECIMAL / clicks ELSE 0 END
    ) STORED,

    -- Listing state at time of snapshot
    listing_status VARCHAR(20),
    current_price DECIMAL(10, 2),
    quantity_available INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(assignment_id, date)
);

CREATE INDEX IF NOT EXISTS idx_listing_perf_assignment ON listing_performance(assignment_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_listing_perf_store ON listing_performance(store_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_listing_perf_date ON listing_performance(date DESC);

-- ============================================================================
-- PRUNE EVENTS TABLE
-- ============================================================================
-- Tracks when and why listings are pruned (ended/removed)

CREATE TABLE IF NOT EXISTS prune_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES store_sku_assignments(id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Prune reason
    reason VARCHAR(50) NOT NULL
        CHECK (reason IN (
            'no_sales', 'low_views', 'policy_violation', 'supplier_oos',
            'price_increase', 'margin_too_low', 'manual', 'competitor_undercut',
            'seasonal', 'category_restriction', 'account_health', 'other'
        )),
    reason_details TEXT,

    -- Listing state at prune time
    days_active INTEGER,
    total_views INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    final_price DECIMAL(10, 2),

    -- Method
    pruned_by VARCHAR(20) DEFAULT 'system' CHECK (pruned_by IN ('system', 'manual', 'otto_pilot')),

    pruned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prune_store ON prune_events(store_id, pruned_at DESC);
CREATE INDEX IF NOT EXISTS idx_prune_reason ON prune_events(reason, pruned_at DESC);
CREATE INDEX IF NOT EXISTS idx_prune_date ON prune_events(pruned_at DESC);

-- ============================================================================
-- STORE DAILY METRICS TABLE
-- ============================================================================
-- Aggregated daily metrics per store for trending/reporting

CREATE TABLE IF NOT EXISTS store_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    date DATE NOT NULL,

    -- Inventory metrics
    active_listings INTEGER DEFAULT 0,
    total_inventory_value DECIMAL(12, 2) DEFAULT 0,

    -- Sales metrics
    orders_count INTEGER DEFAULT 0,
    units_sold INTEGER DEFAULT 0,
    gross_revenue DECIMAL(12, 2) DEFAULT 0,
    net_revenue DECIMAL(12, 2) DEFAULT 0, -- After fees
    total_cost DECIMAL(12, 2) DEFAULT 0,
    gross_profit DECIMAL(12, 2) DEFAULT 0,

    -- Performance metrics
    total_views INTEGER DEFAULT 0,
    total_impressions INTEGER DEFAULT 0,
    sell_through_rate DECIMAL(5, 4) DEFAULT 0, -- Sales / Active listings
    avg_days_to_sell INTEGER,

    -- Prune metrics
    listings_pruned INTEGER DEFAULT 0,
    listings_added INTEGER DEFAULT 0,
    net_listing_change INTEGER GENERATED ALWAYS AS (listings_added - listings_pruned) STORED,

    -- Account health (if tracked)
    defect_rate DECIMAL(5, 4),
    late_shipment_rate DECIMAL(5, 4),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(store_id, date)
);

CREATE INDEX IF NOT EXISTS idx_store_metrics_store ON store_daily_metrics(store_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_store_metrics_user ON store_daily_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_store_metrics_date ON store_daily_metrics(date DESC);

-- ============================================================================
-- USER PROFIT SUMMARY TABLE
-- ============================================================================
-- Aggregated profit data per user for billing tier validation

CREATE TABLE IF NOT EXISTS user_profit_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Revenue
    gross_revenue DECIMAL(12, 2) DEFAULT 0,
    net_revenue DECIMAL(12, 2) DEFAULT 0,

    -- Costs
    product_cost DECIMAL(12, 2) DEFAULT 0,
    shipping_cost DECIMAL(12, 2) DEFAULT 0,
    platform_fees DECIMAL(12, 2) DEFAULT 0,
    subscription_cost DECIMAL(12, 2) DEFAULT 0,

    -- Profit
    gross_profit DECIMAL(12, 2) DEFAULT 0,
    net_profit DECIMAL(12, 2) GENERATED ALWAYS AS (
        gross_revenue - COALESCE(product_cost, 0) - COALESCE(shipping_cost, 0) -
        COALESCE(platform_fees, 0) - COALESCE(subscription_cost, 0)
    ) STORED,

    -- Volume
    total_orders INTEGER DEFAULT 0,
    total_units INTEGER DEFAULT 0,
    avg_order_value DECIMAL(10, 2),
    avg_profit_per_order DECIMAL(10, 2),

    -- Performance
    sell_through_rate DECIMAL(5, 4),
    prune_rate DECIMAL(5, 4),
    return_rate DECIMAL(5, 4),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_profit_summary_user ON user_profit_summary(user_id, period_start DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to calculate sell-through rate for a store
CREATE OR REPLACE FUNCTION calculate_sell_through_rate(
    p_store_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS DECIMAL AS $$
DECLARE
    v_avg_active_listings DECIMAL;
    v_total_sales INTEGER;
    v_sell_through DECIMAL;
BEGIN
    -- Get average active listings over period
    SELECT AVG(active_listings)
    INTO v_avg_active_listings
    FROM store_daily_metrics
    WHERE store_id = p_store_id
      AND date >= CURRENT_DATE - p_days;

    -- Get total sales over period
    SELECT COUNT(*)
    INTO v_total_sales
    FROM orders
    WHERE store_id = p_store_id
      AND order_date >= CURRENT_DATE - p_days
      AND status NOT IN ('canceled', 'returned');

    -- Calculate sell-through rate (sales / avg listings)
    IF v_avg_active_listings > 0 THEN
        v_sell_through := v_total_sales::DECIMAL / v_avg_active_listings;
    ELSE
        v_sell_through := 0;
    END IF;

    RETURN ROUND(v_sell_through, 4);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate prune rate for a store
CREATE OR REPLACE FUNCTION calculate_prune_rate(
    p_store_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS DECIMAL AS $$
DECLARE
    v_avg_active_listings DECIMAL;
    v_pruned_count INTEGER;
    v_prune_rate DECIMAL;
BEGIN
    -- Get average active listings over period
    SELECT AVG(active_listings)
    INTO v_avg_active_listings
    FROM store_daily_metrics
    WHERE store_id = p_store_id
      AND date >= CURRENT_DATE - p_days;

    -- Get prune count over period
    SELECT COUNT(*)
    INTO v_pruned_count
    FROM prune_events
    WHERE store_id = p_store_id
      AND pruned_at >= CURRENT_DATE - p_days;

    -- Calculate prune rate
    IF v_avg_active_listings > 0 THEN
        v_prune_rate := v_pruned_count::DECIMAL / v_avg_active_listings;
    ELSE
        v_prune_rate := 0;
    END IF;

    RETURN ROUND(v_prune_rate, 4);
END;
$$ LANGUAGE plpgsql;

-- Function to record daily store metrics
CREATE OR REPLACE FUNCTION record_store_daily_metrics(
    p_store_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_active_listings INTEGER;
    v_inventory_value DECIMAL;
    v_orders_count INTEGER;
    v_gross_revenue DECIMAL;
    v_total_cost DECIMAL;
    v_views INTEGER;
    v_pruned INTEGER;
    v_added INTEGER;
BEGIN
    -- Get user_id from store
    SELECT user_id INTO v_user_id FROM stores WHERE id = p_store_id;

    -- Count active listings
    SELECT COUNT(*), COALESCE(SUM(current_price), 0)
    INTO v_active_listings, v_inventory_value
    FROM store_sku_assignments
    WHERE store_id = p_store_id AND listing_status = 'active';

    -- Get orders for the day
    SELECT COUNT(*), COALESCE(SUM(sale_price), 0), COALESCE(SUM(source_cost), 0)
    INTO v_orders_count, v_gross_revenue, v_total_cost
    FROM orders
    WHERE store_id = p_store_id
      AND order_date::DATE = p_date
      AND status NOT IN ('canceled', 'returned');

    -- Get views (would need to sum from listing_performance)
    SELECT COALESCE(SUM(views), 0)
    INTO v_views
    FROM listing_performance
    WHERE store_id = p_store_id AND date = p_date;

    -- Count pruned and added
    SELECT COUNT(*) INTO v_pruned
    FROM prune_events
    WHERE store_id = p_store_id AND pruned_at::DATE = p_date;

    SELECT COUNT(*) INTO v_added
    FROM store_sku_assignments
    WHERE store_id = p_store_id AND created_at::DATE = p_date;

    -- Insert or update metrics
    INSERT INTO store_daily_metrics (
        store_id, user_id, date, active_listings, total_inventory_value,
        orders_count, gross_revenue, total_cost, gross_profit,
        total_views, listings_pruned, listings_added
    ) VALUES (
        p_store_id, v_user_id, p_date, v_active_listings, v_inventory_value,
        v_orders_count, v_gross_revenue, v_total_cost, v_gross_revenue - v_total_cost,
        v_views, v_pruned, v_added
    )
    ON CONFLICT (store_id, date) DO UPDATE SET
        active_listings = EXCLUDED.active_listings,
        total_inventory_value = EXCLUDED.total_inventory_value,
        orders_count = EXCLUDED.orders_count,
        gross_revenue = EXCLUDED.gross_revenue,
        total_cost = EXCLUDED.total_cost,
        gross_profit = EXCLUDED.gross_profit,
        total_views = EXCLUDED.total_views,
        listings_pruned = EXCLUDED.listings_pruned,
        listings_added = EXCLUDED.listings_added,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to log a prune event
CREATE OR REPLACE FUNCTION log_prune_event(
    p_assignment_id UUID,
    p_reason VARCHAR,
    p_reason_details TEXT DEFAULT NULL,
    p_pruned_by VARCHAR DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
    v_prune_id UUID;
    v_store_id UUID;
    v_sku_id UUID;
    v_user_id UUID;
    v_days_active INTEGER;
    v_total_views INTEGER;
    v_total_sales INTEGER;
    v_final_price DECIMAL;
BEGIN
    -- Get assignment details
    SELECT
        ssa.store_id, ssa.sku_id, s.user_id,
        EXTRACT(DAY FROM NOW() - ssa.created_at)::INTEGER,
        COALESCE(ssa.views, 0), COALESCE(ssa.sales, 0), ssa.current_price
    INTO v_store_id, v_sku_id, v_user_id, v_days_active, v_total_views, v_total_sales, v_final_price
    FROM store_sku_assignments ssa
    JOIN stores s ON s.id = ssa.store_id
    WHERE ssa.id = p_assignment_id;

    -- Insert prune event
    INSERT INTO prune_events (
        assignment_id, store_id, sku_id, user_id,
        reason, reason_details, pruned_by,
        days_active, total_views, total_sales, final_price
    ) VALUES (
        p_assignment_id, v_store_id, v_sku_id, v_user_id,
        p_reason, p_reason_details, p_pruned_by,
        v_days_active, v_total_views, v_total_sales, v_final_price
    ) RETURNING id INTO v_prune_id;

    RETURN v_prune_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for store profit summary
CREATE OR REPLACE VIEW v_store_profit_summary AS
SELECT
    s.id AS store_id,
    s.name AS store_name,
    s.user_id,
    COUNT(DISTINCT o.id) AS total_orders,
    SUM(o.sale_price) AS total_revenue,
    SUM(COALESCE(o.source_cost, 0)) AS total_cost,
    SUM(o.gross_profit) AS total_profit,
    CASE
        WHEN SUM(o.sale_price) > 0
        THEN ROUND((SUM(o.gross_profit) / SUM(o.sale_price)) * 100, 2)
        ELSE 0
    END AS profit_margin_pct,
    calculate_sell_through_rate(s.id, 30) AS sell_through_30d,
    calculate_prune_rate(s.id, 30) AS prune_rate_30d
FROM stores s
LEFT JOIN orders o ON o.store_id = s.id AND o.status NOT IN ('canceled', 'returned')
GROUP BY s.id, s.name, s.user_id;

-- View for daily profit report
CREATE OR REPLACE VIEW v_daily_profit_report AS
SELECT
    date,
    SUM(orders_count) AS total_orders,
    SUM(gross_revenue) AS total_revenue,
    SUM(total_cost) AS total_cost,
    SUM(gross_profit) AS total_profit,
    SUM(active_listings) AS total_active_listings,
    SUM(listings_pruned) AS total_pruned,
    SUM(listings_added) AS total_added,
    CASE
        WHEN SUM(gross_revenue) > 0
        THEN ROUND((SUM(gross_profit) / SUM(gross_revenue)) * 100, 2)
        ELSE 0
    END AS profit_margin_pct
FROM store_daily_metrics
GROUP BY date
ORDER BY date DESC;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to auto-log prune when listing status changes to 'ended'
CREATE OR REPLACE FUNCTION trigger_log_prune()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.listing_status = 'ended' AND (OLD.listing_status IS NULL OR OLD.listing_status != 'ended') THEN
        -- Auto-determine reason based on performance
        DECLARE
            v_reason VARCHAR(50);
        BEGIN
            IF NEW.sales = 0 AND NEW.views < 100 THEN
                v_reason := 'low_views';
            ELSIF NEW.sales = 0 THEN
                v_reason := 'no_sales';
            ELSE
                v_reason := 'manual';
            END IF;

            PERFORM log_prune_event(NEW.id, v_reason, 'Auto-logged on status change', 'system');
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_auto_log_prune
    AFTER UPDATE OF listing_status ON store_sku_assignments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_log_prune();

-- ============================================================================
-- ANALYZE
-- ============================================================================

ANALYZE orders;
ANALYZE listing_performance;
ANALYZE prune_events;
ANALYZE store_daily_metrics;
ANALYZE user_profit_summary;
