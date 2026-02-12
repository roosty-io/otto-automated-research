/**
 * Enhanced Analytics Service
 *
 * Provides comprehensive analytics and reporting:
 * - Profit tracking and margin analysis
 * - Performance metrics and trends
 * - Store comparison and ranking
 * - SKU performance analysis
 * - Revenue forecasting
 */

import { supabase } from '@/lib/supabase'

export interface ProfitMetrics {
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
  avgOrderValue: number
  totalOrders: number
  returnRate: number
  refundAmount: number
}

export interface PerformanceMetrics {
  totalListings: number
  activeListings: number
  totalViews: number
  totalWatchers: number
  conversionRate: number
  sellThroughRate: number
  avgDaysToSell: number
  inventoryTurnover: number
}

export interface TrendData {
  date: string
  revenue: number
  profit: number
  orders: number
  listings: number
}

export interface StoreRanking {
  storeId: string
  storeName: string
  revenue: number
  profit: number
  margin: number
  orders: number
  rank: number
  trend: 'up' | 'down' | 'stable'
}

export interface SKUPerformance {
  skuId: string
  sku: string
  title: string
  revenue: number
  profit: number
  margin: number
  unitsSold: number
  avgPrice: number
  views: number
  conversionRate: number
  rank: number
}

export interface AnalyticsTimeRange {
  startDate: Date
  endDate: Date
  previousStartDate: Date
  previousEndDate: Date
}

/**
 * Calculate time range for analytics
 */
export function getTimeRange(period: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom', customRange?: { start: Date; end: Date }): AnalyticsTimeRange {
  const now = new Date()
  let startDate: Date
  let endDate = new Date(now)

  switch (period) {
    case 'day':
      startDate = new Date(now)
      startDate.setHours(0, 0, 0, 0)
      break
    case 'week':
      startDate = new Date(now)
      startDate.setDate(now.getDate() - 7)
      break
    case 'month':
      startDate = new Date(now)
      startDate.setMonth(now.getMonth() - 1)
      break
    case 'quarter':
      startDate = new Date(now)
      startDate.setMonth(now.getMonth() - 3)
      break
    case 'year':
      startDate = new Date(now)
      startDate.setFullYear(now.getFullYear() - 1)
      break
    case 'custom':
      if (customRange) {
        startDate = customRange.start
        endDate = customRange.end
      } else {
        startDate = new Date(now)
        startDate.setMonth(now.getMonth() - 1)
      }
      break
    default:
      startDate = new Date(now)
      startDate.setMonth(now.getMonth() - 1)
  }

  // Calculate previous period for comparison
  const periodLength = endDate.getTime() - startDate.getTime()
  const previousEndDate = new Date(startDate.getTime() - 1)
  const previousStartDate = new Date(previousEndDate.getTime() - periodLength)

  return { startDate, endDate, previousStartDate, previousEndDate }
}

/**
 * Get profit metrics for a time period
 */
export async function getProfitMetrics(options: {
  storeId?: string
  period?: 'day' | 'week' | 'month' | 'quarter' | 'year'
} = {}): Promise<ProfitMetrics & { change: Partial<ProfitMetrics> }> {
  const { storeId, period = 'month' } = options
  const { startDate, endDate, previousStartDate, previousEndDate } = getTimeRange(period)

  // Get current period sales
  let currentQuery = supabase
    .from('sales_records')
    .select('*')
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())

  if (storeId) {
    currentQuery = currentQuery.eq('store_id', storeId)
  }

  const { data: currentSales } = await currentQuery

  // Get previous period sales for comparison
  let previousQuery = supabase
    .from('sales_records')
    .select('*')
    .gte('sale_date', previousStartDate.toISOString())
    .lte('sale_date', previousEndDate.toISOString())

  if (storeId) {
    previousQuery = previousQuery.eq('store_id', storeId)
  }

  const { data: previousSales } = await previousQuery

  const currentMetrics = calculateProfitMetrics(currentSales || [])
  const previousMetrics = calculateProfitMetrics(previousSales || [])

  // Calculate change percentages
  const change: Partial<ProfitMetrics> = {
    totalRevenue: calculateChange(currentMetrics.totalRevenue, previousMetrics.totalRevenue),
    grossProfit: calculateChange(currentMetrics.grossProfit, previousMetrics.grossProfit),
    totalOrders: calculateChange(currentMetrics.totalOrders, previousMetrics.totalOrders),
    grossMargin: currentMetrics.grossMargin - previousMetrics.grossMargin,
  }

  return { ...currentMetrics, change }
}

function calculateProfitMetrics(sales: any[]): ProfitMetrics {
  if (sales.length === 0) {
    return {
      totalRevenue: 0,
      totalCost: 0,
      grossProfit: 0,
      grossMargin: 0,
      netProfit: 0,
      netMargin: 0,
      avgOrderValue: 0,
      totalOrders: 0,
      returnRate: 0,
      refundAmount: 0,
    }
  }

  const totalRevenue = sales.reduce((sum, s) => sum + (s.sale_price || 0), 0)
  const totalCost = sales.reduce((sum, s) => sum + (s.cost_price || 0), 0)
  const refundAmount = sales
    .filter(s => s.status === 'refunded')
    .reduce((sum, s) => sum + (s.sale_price || 0), 0)
  const returns = sales.filter(s => s.status === 'returned' || s.status === 'refunded').length

  // Estimate fees (eBay ~13%, PayPal ~3%)
  const estimatedFees = totalRevenue * 0.16

  const grossProfit = totalRevenue - totalCost
  const netProfit = grossProfit - estimatedFees - refundAmount

  return {
    totalRevenue,
    totalCost,
    grossProfit,
    grossMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    netProfit,
    netMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
    avgOrderValue: sales.length > 0 ? totalRevenue / sales.length : 0,
    totalOrders: sales.length,
    returnRate: sales.length > 0 ? (returns / sales.length) * 100 : 0,
    refundAmount,
  }
}

function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

/**
 * Get performance metrics
 */
export async function getPerformanceMetrics(options: {
  storeId?: string
  period?: 'day' | 'week' | 'month' | 'quarter' | 'year'
} = {}): Promise<PerformanceMetrics> {
  const { storeId, period = 'month' } = options
  const { startDate, endDate } = getTimeRange(period)

  // Get listing stats
  let listingQuery = supabase
    .from('store_sku_assignments')
    .select('*')

  if (storeId) {
    listingQuery = listingQuery.eq('store_id', storeId)
  }

  const { data: listings } = await listingQuery

  // Get sales for sell-through calculation
  let salesQuery = supabase
    .from('sales_records')
    .select('*')
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())

  if (storeId) {
    salesQuery = salesQuery.eq('store_id', storeId)
  }

  const { data: sales } = await salesQuery

  const allListings = listings || []
  const activeListings = allListings.filter(l => l.listing_status === 'active')
  const salesData = sales || []

  const totalViews = allListings.reduce((sum, l) => sum + (l.views || 0), 0)
  const totalWatchers = allListings.reduce((sum, l) => sum + (l.watchers || 0), 0)

  // Calculate days to sell for sold items
  const soldItems = allListings.filter(l => l.last_sale_at && l.listed_at)
  const avgDaysToSell = soldItems.length > 0
    ? soldItems.reduce((sum, l) => {
        const listed = new Date(l.listed_at)
        const sold = new Date(l.last_sale_at)
        return sum + (sold.getTime() - listed.getTime()) / (1000 * 60 * 60 * 24)
      }, 0) / soldItems.length
    : 0

  return {
    totalListings: allListings.length,
    activeListings: activeListings.length,
    totalViews,
    totalWatchers,
    conversionRate: totalViews > 0 ? (salesData.length / totalViews) * 100 : 0,
    sellThroughRate: allListings.length > 0 ? (salesData.length / allListings.length) * 100 : 0,
    avgDaysToSell: Math.round(avgDaysToSell * 10) / 10,
    inventoryTurnover: activeListings.length > 0 ? salesData.length / activeListings.length : 0,
  }
}

/**
 * Get trend data for charts
 */
export async function getTrendData(options: {
  storeId?: string
  period?: 'week' | 'month' | 'quarter' | 'year'
  granularity?: 'day' | 'week' | 'month'
} = {}): Promise<TrendData[]> {
  const { storeId, period = 'month', granularity = 'day' } = options
  const { startDate, endDate } = getTimeRange(period)

  // Get sales data
  let query = supabase
    .from('sales_records')
    .select('sale_date, sale_price, cost_price')
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())
    .order('sale_date', { ascending: true })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: sales } = await query

  // Get listing counts by date
  let listingQuery = supabase
    .from('store_sku_assignments')
    .select('listed_at')
    .gte('listed_at', startDate.toISOString())
    .lte('listed_at', endDate.toISOString())

  if (storeId) {
    listingQuery = listingQuery.eq('store_id', storeId)
  }

  const { data: listings } = await listingQuery

  // Group by date
  const grouped = new Map<string, TrendData>()

  // Initialize dates
  const current = new Date(startDate)
  while (current <= endDate) {
    const key = formatDateKey(current, granularity)
    if (!grouped.has(key)) {
      grouped.set(key, {
        date: key,
        revenue: 0,
        profit: 0,
        orders: 0,
        listings: 0,
      })
    }

    if (granularity === 'day') {
      current.setDate(current.getDate() + 1)
    } else if (granularity === 'week') {
      current.setDate(current.getDate() + 7)
    } else {
      current.setMonth(current.getMonth() + 1)
    }
  }

  // Add sales data
  for (const sale of sales || []) {
    const key = formatDateKey(new Date(sale.sale_date), granularity)
    const entry = grouped.get(key)
    if (entry) {
      entry.revenue += sale.sale_price || 0
      entry.profit += (sale.sale_price || 0) - (sale.cost_price || 0)
      entry.orders += 1
    }
  }

  // Add listing data
  for (const listing of listings || []) {
    const key = formatDateKey(new Date(listing.listed_at), granularity)
    const entry = grouped.get(key)
    if (entry) {
      entry.listings += 1
    }
  }

  return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function formatDateKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }
  return date.toISOString().split('T')[0]
}

/**
 * Get store rankings
 */
export async function getStoreRankings(options: {
  period?: 'week' | 'month' | 'quarter' | 'year'
  sortBy?: 'revenue' | 'profit' | 'orders' | 'margin'
  limit?: number
} = {}): Promise<StoreRanking[]> {
  const { period = 'month', sortBy = 'revenue', limit = 10 } = options
  const { startDate, endDate, previousStartDate, previousEndDate } = getTimeRange(period)

  // Get all stores
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name')

  if (!stores || stores.length === 0) {
    return []
  }

  // Get current period sales by store
  const { data: currentSales } = await supabase
    .from('sales_records')
    .select('store_id, sale_price, cost_price')
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())

  // Get previous period sales by store
  const { data: previousSales } = await supabase
    .from('sales_records')
    .select('store_id, sale_price, cost_price')
    .gte('sale_date', previousStartDate.toISOString())
    .lte('sale_date', previousEndDate.toISOString())

  // Calculate metrics per store
  const rankings: StoreRanking[] = stores.map(store => {
    const current = (currentSales || []).filter(s => s.store_id === store.id)
    const previous = (previousSales || []).filter(s => s.store_id === store.id)

    const revenue = current.reduce((sum, s) => sum + (s.sale_price || 0), 0)
    const cost = current.reduce((sum, s) => sum + (s.cost_price || 0), 0)
    const profit = revenue - cost

    const prevRevenue = previous.reduce((sum, s) => sum + (s.sale_price || 0), 0)

    let trend: 'up' | 'down' | 'stable' = 'stable'
    if (revenue > prevRevenue * 1.05) trend = 'up'
    else if (revenue < prevRevenue * 0.95) trend = 'down'

    return {
      storeId: store.id,
      storeName: store.name,
      revenue,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      orders: current.length,
      rank: 0,
      trend,
    }
  })

  // Sort and rank
  rankings.sort((a, b) => {
    switch (sortBy) {
      case 'profit': return b.profit - a.profit
      case 'orders': return b.orders - a.orders
      case 'margin': return b.margin - a.margin
      default: return b.revenue - a.revenue
    }
  })

  rankings.forEach((r, i) => { r.rank = i + 1 })

  return rankings.slice(0, limit)
}

/**
 * Get top performing SKUs
 */
export async function getTopSKUs(options: {
  storeId?: string
  period?: 'week' | 'month' | 'quarter' | 'year'
  sortBy?: 'revenue' | 'profit' | 'units' | 'conversion'
  limit?: number
} = {}): Promise<SKUPerformance[]> {
  const { storeId, period = 'month', sortBy = 'revenue', limit = 20 } = options
  const { startDate, endDate } = getTimeRange(period)

  // Get sales data
  let salesQuery = supabase
    .from('sales_records')
    .select('sku_id, sale_price, cost_price, quantity')
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())

  if (storeId) {
    salesQuery = salesQuery.eq('store_id', storeId)
  }

  const { data: sales } = await salesQuery

  // Get SKU details
  const { data: skus } = await supabase
    .from('skus')
    .select('id, sku, title')

  // Get listing views
  let viewsQuery = supabase
    .from('store_sku_assignments')
    .select('sku_id, views')

  if (storeId) {
    viewsQuery = viewsQuery.eq('store_id', storeId)
  }

  const { data: listings } = await viewsQuery

  // Aggregate by SKU
  const skuMap = new Map<string, SKUPerformance>()

  for (const sale of sales || []) {
    const existing = skuMap.get(sale.sku_id)
    const revenue = (sale.sale_price || 0) * (sale.quantity || 1)
    const cost = (sale.cost_price || 0) * (sale.quantity || 1)
    const units = sale.quantity || 1

    if (existing) {
      existing.revenue += revenue
      existing.profit += revenue - cost
      existing.unitsSold += units
    } else {
      const skuInfo = skus?.find(s => s.id === sale.sku_id)
      skuMap.set(sale.sku_id, {
        skuId: sale.sku_id,
        sku: skuInfo?.sku || 'Unknown',
        title: skuInfo?.title || 'Unknown',
        revenue,
        profit: revenue - cost,
        margin: 0,
        unitsSold: units,
        avgPrice: 0,
        views: 0,
        conversionRate: 0,
        rank: 0,
      })
    }
  }

  // Add views and calculate derived metrics
  for (const listing of listings || []) {
    const perf = skuMap.get(listing.sku_id)
    if (perf) {
      perf.views += listing.views || 0
    }
  }

  const results = Array.from(skuMap.values())

  for (const perf of results) {
    perf.margin = perf.revenue > 0 ? (perf.profit / perf.revenue) * 100 : 0
    perf.avgPrice = perf.unitsSold > 0 ? perf.revenue / perf.unitsSold : 0
    perf.conversionRate = perf.views > 0 ? (perf.unitsSold / perf.views) * 100 : 0
  }

  // Sort
  results.sort((a, b) => {
    switch (sortBy) {
      case 'profit': return b.profit - a.profit
      case 'units': return b.unitsSold - a.unitsSold
      case 'conversion': return b.conversionRate - a.conversionRate
      default: return b.revenue - a.revenue
    }
  })

  results.forEach((r, i) => { r.rank = i + 1 })

  return results.slice(0, limit)
}

/**
 * Get revenue forecast
 */
export async function getRevenueForecast(options: {
  storeId?: string
  forecastDays?: number
} = {}): Promise<{
  projected: number
  confidence: 'high' | 'medium' | 'low'
  dailyAverage: number
  trend: number
  forecastData: Array<{ date: string; projected: number; lower: number; upper: number }>
}> {
  const { storeId, forecastDays = 30 } = options

  // Get last 90 days of sales for forecasting
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 90)

  let query = supabase
    .from('sales_records')
    .select('sale_date, sale_price')
    .gte('sale_date', startDate.toISOString())
    .order('sale_date', { ascending: true })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: sales } = await query

  if (!sales || sales.length < 7) {
    return {
      projected: 0,
      confidence: 'low',
      dailyAverage: 0,
      trend: 0,
      forecastData: [],
    }
  }

  // Calculate daily revenue
  const dailyRevenue = new Map<string, number>()
  for (const sale of sales) {
    const date = sale.sale_date.split('T')[0]
    dailyRevenue.set(date, (dailyRevenue.get(date) || 0) + (sale.sale_price || 0))
  }

  const values = Array.from(dailyRevenue.values())
  const dailyAverage = values.reduce((a, b) => a + b, 0) / values.length

  // Simple linear trend
  const recentAvg = values.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, values.length)
  const olderAvg = values.slice(0, 14).reduce((a, b) => a + b, 0) / Math.min(14, values.length)
  const trend = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0

  // Generate forecast
  const forecastData: Array<{ date: string; projected: number; lower: number; upper: number }> = []
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + Math.pow(v - dailyAverage, 2), 0) / values.length
  )

  for (let i = 1; i <= forecastDays; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)
    const projected = dailyAverage * (1 + (trend / 100) * (i / 30))

    forecastData.push({
      date: date.toISOString().split('T')[0],
      projected: Math.round(projected * 100) / 100,
      lower: Math.round(Math.max(0, projected - stdDev) * 100) / 100,
      upper: Math.round((projected + stdDev) * 100) / 100,
    })
  }

  const projected = forecastData.reduce((sum, d) => sum + d.projected, 0)

  // Determine confidence based on data quality
  let confidence: 'high' | 'medium' | 'low' = 'medium'
  if (values.length >= 60 && stdDev / dailyAverage < 0.3) {
    confidence = 'high'
  } else if (values.length < 30 || stdDev / dailyAverage > 0.6) {
    confidence = 'low'
  }

  return {
    projected: Math.round(projected * 100) / 100,
    confidence,
    dailyAverage: Math.round(dailyAverage * 100) / 100,
    trend: Math.round(trend * 10) / 10,
    forecastData,
  }
}

/**
 * Get category performance breakdown
 */
export async function getCategoryPerformance(options: {
  storeId?: string
  period?: 'week' | 'month' | 'quarter' | 'year'
} = {}): Promise<Array<{
  category: string
  revenue: number
  profit: number
  units: number
  percentage: number
}>> {
  const { storeId, period = 'month' } = options
  const { startDate, endDate } = getTimeRange(period)

  // Get sales with SKU category info
  let query = supabase
    .from('sales_records')
    .select(`
      sale_price,
      cost_price,
      quantity,
      skus!inner(category)
    `)
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: sales } = await query

  // Group by category
  const categories = new Map<string, { revenue: number; profit: number; units: number }>()
  let totalRevenue = 0

  for (const sale of sales || []) {
    const category = (sale.skus as any)?.category || 'Uncategorized'
    const revenue = (sale.sale_price || 0) * (sale.quantity || 1)
    const profit = revenue - ((sale.cost_price || 0) * (sale.quantity || 1))

    totalRevenue += revenue

    const existing = categories.get(category)
    if (existing) {
      existing.revenue += revenue
      existing.profit += profit
      existing.units += sale.quantity || 1
    } else {
      categories.set(category, {
        revenue,
        profit,
        units: sale.quantity || 1,
      })
    }
  }

  return Array.from(categories.entries())
    .map(([category, data]) => ({
      category,
      ...data,
      percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}
