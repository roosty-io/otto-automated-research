/**
 * AutoDS Sales Data Sync Service
 *
 * Syncs sales and order data from AutoDS:
 * - Fetch orders from AutoDS dashboard
 * - Extract profit, revenue, and fees
 * - Sync to our sales_records table
 * - Calculate analytics
 */

import { getAuthenticatedPage, navigateToOrders, goToNextPage, waitForPageLoad, isOnLoginPage } from './navigation'
import { supabase } from '@/lib/supabase'
import type { Page } from 'puppeteer'

export interface AutoDSOrder {
  id: string
  ebayOrderId?: string
  productTitle: string
  productId?: string
  buyerName?: string
  salePrice: number
  itemCost: number
  shippingCost?: number
  ebayFees?: number
  profit: number
  quantity: number
  orderDate: string
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
  trackingNumber?: string
}

export interface SalesSyncResult {
  success: boolean
  ordersFound: number
  newOrders: number
  updatedOrders: number
  errors: number
  totalRevenue: number
  totalProfit: number
}

export interface SalesAnalytics {
  totalOrders: number
  totalRevenue: number
  totalProfit: number
  totalCost: number
  avgOrderValue: number
  avgProfit: number
  profitMargin: number
  ordersToday: number
  revenueToday: number
}

/**
 * Sync sales data from AutoDS
 */
export async function syncSalesData(
  storeId?: string,
  options: {
    daysBack?: number
    limit?: number
  } = {}
): Promise<SalesSyncResult> {
  const { daysBack = 30, limit = 500 } = options

  const result: SalesSyncResult = {
    success: false,
    ordersFound: 0,
    newOrders: 0,
    updatedOrders: 0,
    errors: 0,
    totalRevenue: 0,
    totalProfit: 0,
  }

  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { ...result, success: false }
  }

  const { page, release } = authenticated

  try {
    console.log(`[AutoDS Sales] Starting sales sync (last ${daysBack} days)...`)

    // Navigate to orders page
    const navSuccess = await navigateToOrders(page, storeId)
    if (!navSuccess) {
      return { ...result, success: false }
    }

    // Set date filter if possible
    await setDateFilter(page, daysBack)

    // Extract orders from all pages
    const allOrders: AutoDSOrder[] = []
    let hasMorePages = true
    let pageNum = 1
    const maxPages = Math.ceil(limit / 50)

    while (hasMorePages && pageNum <= maxPages && allOrders.length < limit) {
      const pageOrders = await extractOrdersFromPage(page)
      allOrders.push(...pageOrders)

      hasMorePages = await goToNextPage(page)
      pageNum++
    }

    result.ordersFound = allOrders.length
    console.log(`[AutoDS Sales] Found ${allOrders.length} orders`)

    // Sync each order to database
    for (const order of allOrders) {
      try {
        const syncResult = await syncOrderToDatabase(order, storeId)

        if (syncResult.isNew) {
          result.newOrders++
        } else if (syncResult.updated) {
          result.updatedOrders++
        }

        result.totalRevenue += order.salePrice * order.quantity
        result.totalProfit += order.profit * order.quantity
      } catch (error) {
        result.errors++
        console.error(`[AutoDS Sales] Error syncing order ${order.id}:`, error)
      }
    }

    result.success = true
    console.log(`[AutoDS Sales] Sync complete: ${result.newOrders} new, ${result.updatedOrders} updated`)

    return result
  } catch (error) {
    console.error('[AutoDS Sales] Sync error:', error)
    return { ...result, success: false }
  } finally {
    await release()
  }
}

/**
 * Get sales analytics
 */
export async function getSalesAnalytics(
  storeId?: string,
  daysBack: number = 30
): Promise<SalesAnalytics> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let query = supabase
    .from('sales_records')
    .select('*')
    .gte('sale_date', startDate.toISOString())

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: sales, error } = await query

  if (error || !sales) {
    return {
      totalOrders: 0,
      totalRevenue: 0,
      totalProfit: 0,
      totalCost: 0,
      avgOrderValue: 0,
      avgProfit: 0,
      profitMargin: 0,
      ordersToday: 0,
      revenueToday: 0,
    }
  }

  const totalOrders = sales.length
  const totalRevenue = sales.reduce((sum, s) => sum + (s.sale_price || 0) * (s.quantity || 1), 0)
  const totalCost = sales.reduce((sum, s) => sum + (s.cost_price || 0) * (s.quantity || 1), 0)
  const totalProfit = sales.reduce((sum, s) => sum + (s.profit || 0) * (s.quantity || 1), 0)

  const todaySales = sales.filter(s => new Date(s.sale_date) >= today)
  const ordersToday = todaySales.length
  const revenueToday = todaySales.reduce((sum, s) => sum + (s.sale_price || 0) * (s.quantity || 1), 0)

  return {
    totalOrders,
    totalRevenue,
    totalProfit,
    totalCost,
    avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    avgProfit: totalOrders > 0 ? totalProfit / totalOrders : 0,
    profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    ordersToday,
    revenueToday,
  }
}

/**
 * Get recent orders
 */
export async function getRecentOrders(
  storeId?: string,
  limit: number = 20
): Promise<AutoDSOrder[]> {
  let query = supabase
    .from('sales_records')
    .select('*')
    .order('sale_date', { ascending: false })
    .limit(limit)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error || !data) {
    return []
  }

  return data.map(s => ({
    id: s.id,
    ebayOrderId: s.ebay_order_id,
    productTitle: s.product_title || 'Unknown',
    productId: s.sku_id,
    salePrice: s.sale_price,
    itemCost: s.cost_price,
    shippingCost: s.shipping_cost,
    ebayFees: s.ebay_fees,
    profit: s.profit,
    quantity: s.quantity || 1,
    orderDate: s.sale_date,
    status: s.status || 'delivered',
  }))
}

/**
 * Get top selling products
 */
export async function getTopSellingProducts(
  storeId?: string,
  limit: number = 10,
  daysBack: number = 30
): Promise<Array<{
  skuId: string
  sku: string
  title: string
  unitsSold: number
  revenue: number
  profit: number
}>> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  // Get sales grouped by SKU
  let query = supabase
    .from('sales_records')
    .select('sku_id, product_title, sale_price, cost_price, profit, quantity')
    .gte('sale_date', startDate.toISOString())

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: sales, error } = await query

  if (error || !sales) {
    return []
  }

  // Aggregate by SKU
  const skuMap = new Map<string, {
    skuId: string
    title: string
    unitsSold: number
    revenue: number
    profit: number
  }>()

  for (const sale of sales) {
    const key = sale.sku_id
    const existing = skuMap.get(key)

    if (existing) {
      existing.unitsSold += sale.quantity || 1
      existing.revenue += (sale.sale_price || 0) * (sale.quantity || 1)
      existing.profit += (sale.profit || 0) * (sale.quantity || 1)
    } else {
      skuMap.set(key, {
        skuId: sale.sku_id,
        title: sale.product_title || 'Unknown',
        unitsSold: sale.quantity || 1,
        revenue: (sale.sale_price || 0) * (sale.quantity || 1),
        profit: (sale.profit || 0) * (sale.quantity || 1),
      })
    }
  }

  // Sort by units sold and return top
  const sorted = Array.from(skuMap.values())
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, limit)

  // Get SKU codes
  const skuIds = sorted.map(s => s.skuId).filter(Boolean)
  const { data: skus } = await supabase
    .from('skus')
    .select('id, sku')
    .in('id', skuIds)

  const skuCodeMap = new Map(skus?.map(s => [s.id, s.sku]) || [])

  return sorted.map(s => ({
    ...s,
    sku: skuCodeMap.get(s.skuId) || 'Unknown',
  }))
}

// --- Helper functions ---

async function extractOrdersFromPage(page: Page): Promise<AutoDSOrder[]> {
  return page.evaluate(() => {
    const orders: Array<{
      id: string
      ebayOrderId?: string
      productTitle: string
      productId?: string
      salePrice: number
      itemCost: number
      shippingCost?: number
      profit: number
      quantity: number
      orderDate: string
      status: string
    }> = []

    const rows = document.querySelectorAll(
      'tr[data-order-id], [class*="order-row"], .order-item, .orders-table tr'
    )

    rows.forEach(row => {
      const id = row.getAttribute('data-order-id') || row.getAttribute('data-id') || `order_${Date.now()}`
      const ebayId = row.querySelector('[class*="ebay-id"], .order-number')?.textContent?.trim()
      const titleEl = row.querySelector('[class*="title"], .product-title, td:nth-child(2)')
      const priceEl = row.querySelector('[class*="sale-price"], [class*="price"]')
      const costEl = row.querySelector('[class*="cost"], [class*="source-price"]')
      const profitEl = row.querySelector('[class*="profit"]')
      const qtyEl = row.querySelector('[class*="quantity"], [class*="qty"]')
      const dateEl = row.querySelector('[class*="date"], .order-date, time')
      const statusEl = row.querySelector('[class*="status"]')

      const parsePrice = (el: Element | null) => parseFloat(el?.textContent?.replace(/[^0-9.-]/g, '') || '0')
      const parseQty = (el: Element | null) => parseInt(el?.textContent?.replace(/\D/g, '') || '1')

      const salePrice = parsePrice(priceEl)
      const itemCost = parsePrice(costEl)

      orders.push({
        id,
        ebayOrderId: ebayId || undefined,
        productTitle: titleEl?.textContent?.trim() || 'Unknown',
        salePrice,
        itemCost,
        profit: profitEl ? parsePrice(profitEl) : salePrice - itemCost,
        quantity: parseQty(qtyEl),
        orderDate: dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || new Date().toISOString(),
        status: statusEl?.textContent?.toLowerCase()?.trim() || 'delivered',
      })
    })

    return orders
  }) as Promise<AutoDSOrder[]>
}

async function setDateFilter(page: Page, daysBack: number): Promise<void> {
  try {
    // Look for date filter
    const dateFilter = await page.$('[class*="date-filter"], [class*="date-range"], .filter-date')

    if (dateFilter) {
      await dateFilter.click()
      await page.waitForSelector('[class*="date-picker"], [class*="calendar"]', { timeout: 3000 })

      // Try to select preset if available
      const presetSelector = daysBack <= 7 ? 'Last 7 days' :
                            daysBack <= 30 ? 'Last 30 days' :
                            daysBack <= 90 ? 'Last 90 days' : 'All time'

      const presetBtn = await page.$(`button:has-text("${presetSelector}"), [class*="preset"]:has-text("${presetSelector}")`)
      if (presetBtn) {
        await presetBtn.click()
        await waitForPageLoad(page)
      }
    }
  } catch {
    // Date filter not found or failed, continue without filter
  }
}

async function syncOrderToDatabase(
  order: AutoDSOrder,
  storeId?: string
): Promise<{ isNew: boolean; updated: boolean }> {
  // Check if order already exists
  const { data: existing } = await supabase
    .from('sales_records')
    .select('id, status')
    .eq('autods_order_id', order.id)
    .single()

  const saleData = {
    autods_order_id: order.id,
    ebay_order_id: order.ebayOrderId,
    store_id: storeId,
    product_title: order.productTitle,
    sale_price: order.salePrice,
    cost_price: order.itemCost,
    shipping_cost: order.shippingCost,
    ebay_fees: order.ebayFees,
    profit: order.profit,
    quantity: order.quantity,
    sale_date: new Date(order.orderDate).toISOString(),
    status: order.status,
    tracking_number: order.trackingNumber,
  }

  if (existing) {
    // Update if status changed
    if (existing.status !== order.status) {
      await supabase
        .from('sales_records')
        .update(saleData)
        .eq('id', existing.id)

      return { isNew: false, updated: true }
    }
    return { isNew: false, updated: false }
  }

  // Insert new order
  await supabase.from('sales_records').insert(saleData)

  // Update last sale date on assignment
  if (order.productId) {
    await supabase
      .from('store_sku_assignments')
      .update({
        last_sale_at: new Date(order.orderDate).toISOString(),
        sales: supabase.rpc('increment', { row_id: order.productId, amount: order.quantity }),
      })
      .eq('id', order.productId)
  }

  return { isNew: true, updated: false }
}

/**
 * Schedule daily sales sync
 */
export async function scheduleDailySalesSync(): Promise<void> {
  console.log('[AutoDS Sales] Daily sync would be scheduled here')
  // In production, this would be called by a cron job
  // /api/cron/sync-sales
}

/**
 * Get sales by date range
 */
export async function getSalesByDateRange(
  startDate: Date,
  endDate: Date,
  storeId?: string
): Promise<AutoDSOrder[]> {
  let query = supabase
    .from('sales_records')
    .select('*')
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())
    .order('sale_date', { ascending: false })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error || !data) {
    return []
  }

  return data.map(s => ({
    id: s.id,
    ebayOrderId: s.ebay_order_id,
    productTitle: s.product_title,
    productId: s.sku_id,
    salePrice: s.sale_price,
    itemCost: s.cost_price,
    shippingCost: s.shipping_cost,
    ebayFees: s.ebay_fees,
    profit: s.profit,
    quantity: s.quantity || 1,
    orderDate: s.sale_date,
    status: s.status || 'delivered',
    trackingNumber: s.tracking_number,
  }))
}
