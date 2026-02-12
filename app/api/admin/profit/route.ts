import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Profit Tracking API
 *
 * GET /api/admin/profit
 * Returns profit metrics and sell-through/prune data
 *
 * Query params:
 * - period: '7d' | '30d' | '90d' (default: '30d')
 * - storeId: Filter by specific store (optional)
 * - type: 'summary' | 'daily' | 'stores' | 'prunes' (default: 'summary')
 */

interface ProfitSummary {
  totalRevenue: number
  totalCost: number
  totalProfit: number
  profitMargin: number
  totalOrders: number
  avgOrderProfit: number
  sellThroughRate: number
  pruneRate: number
  activeListings: number
  period: string
}

interface DailyProfit {
  date: string
  orders: number
  revenue: number
  cost: number
  profit: number
  activeListings: number
  pruned: number
  added: number
}

interface StoreProfitSummary {
  storeId: string
  storeName: string
  orders: number
  revenue: number
  profit: number
  profitMargin: number
  sellThroughRate: number
  pruneRate: number
  activeListings: number
}

interface PruneAnalysis {
  totalPruned: number
  byReason: Record<string, number>
  avgDaysBeforePrune: number
  avgViewsBeforePrune: number
  prunesByDay: Array<{ date: string; count: number }>
}

function getPeriodDays(period: string): number {
  switch (period) {
    case '7d': return 7
    case '90d': return 90
    default: return 30
  }
}

async function getProfitSummary(periodDays: number, storeId?: string): Promise<ProfitSummary> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - periodDays)
  const startDateStr = startDate.toISOString()

  // Build query base
  let ordersQuery = supabase
    .from('orders')
    .select('sale_price, source_cost, gross_profit')
    .gte('order_date', startDateStr)
    .not('status', 'in', '("canceled","returned")')

  if (storeId) {
    ordersQuery = ordersQuery.eq('store_id', storeId)
  }

  const { data: orders } = await ordersQuery

  // Get active listings count
  let listingsQuery = supabase
    .from('store_sku_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('listing_status', 'active')

  if (storeId) {
    listingsQuery = listingsQuery.eq('store_id', storeId)
  }

  const { count: activeListings } = await listingsQuery

  // Get prune count
  let pruneQuery = supabase
    .from('prune_events')
    .select('id', { count: 'exact', head: true })
    .gte('pruned_at', startDateStr)

  if (storeId) {
    pruneQuery = pruneQuery.eq('store_id', storeId)
  }

  const { count: pruneCount } = await pruneQuery

  // Calculate metrics
  const totalRevenue = orders?.reduce((sum, o) => sum + (o.sale_price || 0), 0) || 0
  const totalCost = orders?.reduce((sum, o) => sum + (o.source_cost || 0), 0) || 0
  const totalProfit = orders?.reduce((sum, o) => sum + (o.gross_profit || 0), 0) || 0
  const totalOrders = orders?.length || 0

  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const avgOrderProfit = totalOrders > 0 ? totalProfit / totalOrders : 0
  const sellThroughRate = activeListings && activeListings > 0
    ? (totalOrders / activeListings) * 100 / periodDays * 30 // Normalized to monthly
    : 0
  const pruneRate = activeListings && activeListings > 0
    ? ((pruneCount || 0) / activeListings) * 100 / periodDays * 30 // Normalized to monthly
    : 0

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    profitMargin: Math.round(profitMargin * 10) / 10,
    totalOrders,
    avgOrderProfit: Math.round(avgOrderProfit * 100) / 100,
    sellThroughRate: Math.round(sellThroughRate * 10) / 10,
    pruneRate: Math.round(pruneRate * 10) / 10,
    activeListings: activeListings || 0,
    period: `${periodDays}d`,
  }
}

async function getDailyProfit(periodDays: number, storeId?: string): Promise<DailyProfit[]> {
  let query = supabase
    .from('store_daily_metrics')
    .select('date, orders_count, gross_revenue, total_cost, gross_profit, active_listings, listings_pruned, listings_added')
    .gte('date', new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('date', { ascending: true })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data } = await query

  // Aggregate by date if no store filter
  if (!storeId && data) {
    const byDate: Record<string, DailyProfit> = {}

    data.forEach((row) => {
      if (!byDate[row.date]) {
        byDate[row.date] = {
          date: row.date,
          orders: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          activeListings: 0,
          pruned: 0,
          added: 0,
        }
      }

      byDate[row.date].orders += row.orders_count || 0
      byDate[row.date].revenue += row.gross_revenue || 0
      byDate[row.date].cost += row.total_cost || 0
      byDate[row.date].profit += row.gross_profit || 0
      byDate[row.date].activeListings += row.active_listings || 0
      byDate[row.date].pruned += row.listings_pruned || 0
      byDate[row.date].added += row.listings_added || 0
    })

    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  }

  return (data || []).map((row) => ({
    date: row.date,
    orders: row.orders_count || 0,
    revenue: row.gross_revenue || 0,
    cost: row.total_cost || 0,
    profit: row.gross_profit || 0,
    activeListings: row.active_listings || 0,
    pruned: row.listings_pruned || 0,
    added: row.listings_added || 0,
  }))
}

async function getStoreProfits(periodDays: number): Promise<StoreProfitSummary[]> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - periodDays)

  // Get stores with their metrics
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name')

  if (!stores) return []

  const results: StoreProfitSummary[] = []

  for (const store of stores) {
    // Get orders
    const { data: orders } = await supabase
      .from('orders')
      .select('sale_price, gross_profit')
      .eq('store_id', store.id)
      .gte('order_date', startDate.toISOString())
      .not('status', 'in', '("canceled","returned")')

    // Get active listings
    const { count: activeListings } = await supabase
      .from('store_sku_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('listing_status', 'active')

    // Get prune count
    const { count: pruneCount } = await supabase
      .from('prune_events')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .gte('pruned_at', startDate.toISOString())

    const revenue = orders?.reduce((sum, o) => sum + (o.sale_price || 0), 0) || 0
    const profit = orders?.reduce((sum, o) => sum + (o.gross_profit || 0), 0) || 0
    const orderCount = orders?.length || 0

    results.push({
      storeId: store.id,
      storeName: store.name,
      orders: orderCount,
      revenue: Math.round(revenue * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      profitMargin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
      sellThroughRate: activeListings && activeListings > 0
        ? Math.round((orderCount / activeListings) * 1000) / 10
        : 0,
      pruneRate: activeListings && activeListings > 0
        ? Math.round(((pruneCount || 0) / activeListings) * 1000) / 10
        : 0,
      activeListings: activeListings || 0,
    })
  }

  return results.sort((a, b) => b.profit - a.profit)
}

async function getPruneAnalysis(periodDays: number): Promise<PruneAnalysis> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - periodDays)

  const { data: prunes } = await supabase
    .from('prune_events')
    .select('reason, days_active, total_views, pruned_at')
    .gte('pruned_at', startDate.toISOString())

  if (!prunes || prunes.length === 0) {
    return {
      totalPruned: 0,
      byReason: {},
      avgDaysBeforePrune: 0,
      avgViewsBeforePrune: 0,
      prunesByDay: [],
    }
  }

  // Count by reason
  const byReason: Record<string, number> = {}
  prunes.forEach((p) => {
    byReason[p.reason] = (byReason[p.reason] || 0) + 1
  })

  // Calculate averages
  const totalDays = prunes.reduce((sum, p) => sum + (p.days_active || 0), 0)
  const totalViews = prunes.reduce((sum, p) => sum + (p.total_views || 0), 0)

  // Group by day
  const byDay: Record<string, number> = {}
  prunes.forEach((p) => {
    const date = p.pruned_at.split('T')[0]
    byDay[date] = (byDay[date] || 0) + 1
  })

  const prunesByDay = Object.entries(byDay)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalPruned: prunes.length,
    byReason,
    avgDaysBeforePrune: Math.round(totalDays / prunes.length),
    avgViewsBeforePrune: Math.round(totalViews / prunes.length),
    prunesByDay,
  }
}

export async function GET(request: Request) {
  try {
    // Require authentication
    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '30d'
    const storeId = searchParams.get('storeId') || undefined
    const type = searchParams.get('type') || 'summary'

    const periodDays = getPeriodDays(period)

    let data: unknown

    switch (type) {
      case 'daily':
        data = await getDailyProfit(periodDays, storeId)
        break
      case 'stores':
        data = await getStoreProfits(periodDays)
        break
      case 'prunes':
        data = await getPruneAnalysis(periodDays)
        break
      case 'summary':
      default:
        data = await getProfitSummary(periodDays, storeId)
        break
    }

    return NextResponse.json({
      success: true,
      type,
      period,
      storeId,
      data,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Profit API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
