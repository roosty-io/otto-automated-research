-- Profit Tracking Migration
-- Run AFTER 004_performance_indexes.sql
-- Adds profit goals, ROI tracking, and cost data

-- ============================================================================
-- PROFIT GOALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS profit_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    target_monthly_profit DECIMAL(12,2) NOT NULL,
    target_monthly_revenue DECIMAL(12,2),
    target_profit_margin DECIMAL(5,2),
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'missed', 'paused')),
    achieved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profit_goals_user ON profit_goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_profit_goals_store ON profit_goals(store_id) WHERE store_id IS NOT NULL;

-- ============================================================================
-- ENHANCE ORDERS TABLE WITH COST DATA
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS item_cost DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ebay_fees DECIMAL(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS net_profit DECIMAL(12,2);

-- ============================================================================
-- ORDER ITEMS (for detailed profit tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL,
    unit_cost DECIMAL(12,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku_id) WHERE sku_id IS NOT NULL;

-- ============================================================================
-- USER SUBSCRIPTION INFO (for ROI calculation)
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_fee DECIMAL(12,2) DEFAULT 500.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'standard';

-- ============================================================================
-- PROFIT SNAPSHOTS (daily aggregation for fast queries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS profit_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    fees DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_profit DECIMAL(12,2) NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0,
    units_sold INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, store_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_profit_snapshots_user_date
    ON profit_snapshots(user_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_profit_snapshots_store_date
    ON profit_snapshots(store_id, snapshot_date DESC) WHERE store_id IS NOT NULL;

-- ============================================================================
-- FUNCTION: Calculate order profit
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_order_profit()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate fees (12.99% FVF + 2.9% + $0.30 payment)
    NEW.ebay_fees := COALESCE(NEW.total_amount, 0) * 0.1599 + 0.30;

    -- Calculate net profit if cost data available
    IF NEW.item_cost IS NOT NULL THEN
        NEW.net_profit := NEW.total_amount - COALESCE(NEW.item_cost, 0)
                         - COALESCE(NEW.shipping_cost, 0) - NEW.ebay_fees;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate profit on order insert/update
DROP TRIGGER IF EXISTS trg_calculate_order_profit ON orders;
CREATE TRIGGER trg_calculate_order_profit
    BEFORE INSERT OR UPDATE OF total_amount, item_cost, shipping_cost ON orders
    FOR EACH ROW EXECUTE FUNCTION calculate_order_profit();

-- ============================================================================
-- FUNCTION: Update daily profit snapshot
-- ============================================================================

CREATE OR REPLACE FUNCTION update_profit_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Get user_id from store
    SELECT user_id INTO v_user_id FROM stores WHERE id = NEW.store_id;

    IF v_user_id IS NOT NULL THEN
        INSERT INTO profit_snapshots (user_id, store_id, snapshot_date, revenue, cost, fees, net_profit, order_count)
        VALUES (
            v_user_id,
            NEW.store_id,
            DATE(NEW.order_date),
            COALESCE(NEW.total_amount, 0),
            COALESCE(NEW.item_cost, 0),
            COALESCE(NEW.ebay_fees, 0),
            COALESCE(NEW.net_profit, 0),
            1
        )
        ON CONFLICT (user_id, store_id, snapshot_date)
        DO UPDATE SET
            revenue = profit_snapshots.revenue + EXCLUDED.revenue,
            cost = profit_snapshots.cost + EXCLUDED.cost,
            fees = profit_snapshots.fees + EXCLUDED.fees,
            net_profit = profit_snapshots.net_profit + EXCLUDED.net_profit,
            order_count = profit_snapshots.order_count + 1;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update snapshot on new orders
DROP TRIGGER IF EXISTS trg_update_profit_snapshot ON orders;
CREATE TRIGGER trg_update_profit_snapshot
    AFTER INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION update_profit_snapshot();

-- ============================================================================
-- VIEW: Monthly profit summary
-- ============================================================================

CREATE OR REPLACE VIEW v_monthly_profit AS
SELECT
    user_id,
    store_id,
    DATE_TRUNC('month', snapshot_date) AS month,
    SUM(revenue) AS total_revenue,
    SUM(cost) AS total_cost,
    SUM(fees) AS total_fees,
    SUM(net_profit) AS total_profit,
    SUM(order_count) AS total_orders,
    CASE WHEN SUM(revenue) > 0
         THEN (SUM(net_profit) / SUM(revenue)) * 100
         ELSE 0
    END AS profit_margin
FROM profit_snapshots
GROUP BY user_id, store_id, DATE_TRUNC('month', snapshot_date);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS trg_profit_goals_updated_at
    BEFORE UPDATE ON profit_goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run to verify:
-- SELECT * FROM profit_goals LIMIT 5;
-- SELECT * FROM v_monthly_profit WHERE user_id = 'your-user-id';
