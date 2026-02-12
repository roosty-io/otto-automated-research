import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Admin Metrics API
 *
 * GET /api/admin/metrics
 * Returns aggregated metrics for the validation dashboard
 *
 * Query params:
 * - period: '24h' | '7d' | '30d' (default: '24h')
 * - type: 'overview' | 'scrapers' | 'stores' | 'listings' | 'profit'
 */

interface OverviewMetrics {
  totalStores: number
  activeListings: number
  totalSales: number
  totalProfit: number
  period: string
}

interface ScraperMetrics {
  healthScore: number
  healthTrend: Array<{ hour: string; score: number }>
  recentErrors: number
  failingSelectors: number
  lastCheck: string | null
}

interface StoreMetrics {
  stores: Array<{
    id: string
    name: string
    listingsCount: number
    activeCount: number
    salesCount: number
    healthScore: number
  }>
  totalStores: number
}

interface ListingMetrics {
  total: number
  active: number
  ended: number
  outOfStock: number
  byStore: Record<string, number>
  recentlyAdded: number
  recentlyEnded: number
}

interface ProfitMetrics {
  totalRevenue: number
  totalCost: number
  totalProfit: number
  avgMargin: number
  byDay: Array<{ date: string; revenue: number; profit: number }>
  topProducts: Array<{ title: string; profit: number; sales: number }>
}

async function getOverviewMetrics(periodDays: number): Promise<OverviewMetrics> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - periodDays)

  // Get store count
  const { count: storeCount } = await supabase
    .from('stores')
    .select('*', { count: 'exact', head: true })

  // Get active listing count
  const { count: listingCount } = await supabase
    .from('store_sku_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('listing_status', 'active')

  // Get sales in period
  const { data: salesData } = await supabase
    .from('store_sku_assignments')
    .select('sales, current_price')
    .gte('last_synced', startDate.toISOString())

  const totalSales = salesData?.reduce((sum, item) => sum + (item.sales || 0), 0) || 0
  // Rough profit estimate (actual would need cost data)
  const totalProfit = totalSales * 8 // Assume $8 avg profit per sale

  return {
    totalStores: storeCount || 0,
    activeListings: listingCount || 0,
    totalSales,
    totalProfit,
    period: `${periodDays}d`,
  }
}

async function getScraperMetrics(): Promise<ScraperMetrics> {
  // Get latest health check
  const { data: latestHealth } = await supabase
    .from('scraper_health_checks')
    .select('health_score, timestamp')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  // Get health trend (last 24 hours, hourly)
  const { data: healthTrend } = await supabase
    .from('scraper_health_checks')
    .select('health_score, timestamp')
    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: true })

  // Get recent error count
  const { count: errorCount } = await supabase
    .from('scraper_errors')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  // Get failing selector count
  const { count: failingCount } = await supabase
    .from('scraper_selector_failures')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failing')

  return {
    healthScore: latestHealth?.health_score || 0,
    healthTrend: (healthTrend || []).map((h) => ({
      hour: h.timestamp,
      score: h.health_score,
    })),
    recentErrors: errorCount || 0,
    failingSelectors: failingCount || 0,
    lastCheck: latestHealth?.timestamp || null,
  }
}

async function getStoreMetrics(): Promise<StoreMetrics> {
  const { data: stores } = await supabase
    .from('stores')
    .select(`
      id,
      name,
      store_sku_assignments (
        id,
        listing_status,
        sales
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const storeMetrics = (stores || []).map((store: any) => {
    const assignments = store.store_sku_assignments || []
    const activeCount = assignments.filter((a: any) => a.listing_status === 'active').length
    const salesCount = assignments.reduce((sum: number, a: any) => sum + (a.sales || 0), 0)

    return {
      id: store.id,
      name: store.name,
      listingsCount: assignments.length,
      activeCount,
      salesCount,
      healthScore: assignments.length > 0 ? Math.round((activeCount / assignments.length) * 100) : 0,
    }
  })

  return {
    stores: storeMetrics,
    totalStores: storeMetrics.length,
  }
}

async function getListingMetrics(): Promise<ListingMetrics> {
  // Get listing counts by status
  const { data: listings } = await supabase
    .from('store_sku_assignments')
    .select('listing_status, store_id')

  const total = listings?.length || 0
  const active = listings?.filter((l) => l.listing_status === 'active').length || 0
  const ended = listings?.filter((l) => l.listing_status === 'ended').length || 0
  const outOfStock = listings?.filter((l) => l.listing_status === 'out_of_stock').length || 0

  // Group by store
  const byStore: Record<string, number> = {}
  listings?.forEach((l) => {
    byStore[l.store_id] = (byStore[l.store_id] || 0) + 1
  })

  // Get recently added (last 7 days)
  const { count: recentlyAdded } = await supabase
    .from('store_sku_assignments')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  // Get recently ended (last 7 days)
  const { count: recentlyEnded } = await supabase
    .from('store_sku_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('listing_status', 'ended')
    .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  return {
    total,
    active,
    ended,
    outOfStock,
    byStore,
    recentlyAdded: recentlyAdded || 0,
    recentlyEnded: recentlyEnded || 0,
  }
}

async function getProfitMetrics(periodDays: number): Promise<ProfitMetrics> {
  // This would normally pull from an orders/sales table
  // For now, return estimated data based on listings

  const { data: listings } = await supabase
    .from('store_sku_assignments')
    .select('current_price, sales, sku:skus(source_price)')
    .gt('sales', 0)
    .limit(1000)

  let totalRevenue = 0
  let totalCost = 0

  listings?.forEach((listing: any) => {
    const revenue = (listing.current_price || 0) * (listing.sales || 0)
    const cost = ((listing.sku?.source_price || 0) * 1.2) * (listing.sales || 0) // 20% markup from source
    totalRevenue += revenue
    totalCost += cost
  })

  const totalProfit = totalRevenue - totalCost
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  // Generate daily breakdown (mock data for now)
  const byDay = []
  for (let i = periodDays - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    byDay.push({
      date: date.toISOString().split('T')[0],
      revenue: Math.round(totalRevenue / periodDays * (0.8 + Math.random() * 0.4)),
      profit: Math.round(totalProfit / periodDays * (0.8 + Math.random() * 0.4)),
    })
  }

  // Top products (mock for now)
  const topProducts = (listings || [])
    .filter((l: any) => l.sales > 0)
    .sort((a: any, b: any) => (b.sales || 0) - (a.sales || 0))
    .slice(0, 10)
    .map((l: any) => ({
      title: `Product ${l.id?.substring(0, 8) || 'Unknown'}`,
      profit: Math.round((l.current_price - (l.sku?.source_price || 0) * 1.2) * (l.sales || 0)),
      sales: l.sales || 0,
    }))

  return {
    totalRevenue: Math.round(totalRevenue),
    totalCost: Math.round(totalCost),
    totalProfit: Math.round(totalProfit),
    avgMargin: Math.round(avgMargin * 10) / 10,
    byDay,
    topProducts,
  }
}

export async function GET(request: Request) {
  try {
    // Require admin authentication
    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    // Check admin role (optional - remove if all users should access)
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    // For now, allow all authenticated users (during validation phase)
    // if (profile?.role !== 'admin') {
    //   return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    // }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '24h'
    const type = searchParams.get('type') || 'overview'

    // Convert period to days
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 1

    let metrics: unknown

    switch (type) {
      case 'scrapers':
        metrics = await getScraperMetrics()
        break
      case 'stores':
        metrics = await getStoreMetrics()
        break
      case 'listings':
        metrics = await getListingMetrics()
        break
      case 'profit':
        metrics = await getProfitMetrics(periodDays)
        break
      case 'overview':
      default:
        metrics = await getOverviewMetrics(periodDays)
        break
    }

    return NextResponse.json({
      success: true,
      type,
      period,
      metrics,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Admin Metrics] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
