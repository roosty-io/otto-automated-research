import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || 'today'

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() - 7)
    const lastWeekStart = new Date(weekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)

    // Get revenue data
    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, order_date, status')
      .gte('order_date', lastMonthStart.toISOString())

    const ordersData = orders || []

    const revenueToday = ordersData
      .filter(o => new Date(o.order_date) >= today)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0)

    const revenueYesterday = ordersData
      .filter(o => {
        const d = new Date(o.order_date)
        return d >= yesterday && d < today
      })
      .reduce((sum, o) => sum + (o.total_amount || 0), 0)

    const revenueThisWeek = ordersData
      .filter(o => new Date(o.order_date) >= weekStart)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0)

    const revenueLastWeek = ordersData
      .filter(o => {
        const d = new Date(o.order_date)
        return d >= lastWeekStart && d < weekStart
      })
      .reduce((sum, o) => sum + (o.total_amount || 0), 0)

    const revenueThisMonth = ordersData
      .filter(o => new Date(o.order_date) >= monthStart)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0)

    const revenueLastMonth = ordersData
      .filter(o => {
        const d = new Date(o.order_date)
        return d >= lastMonthStart && d < monthStart
      })
      .reduce((sum, o) => sum + (o.total_amount || 0), 0)

    // Calculate trend
    const revenueTrend = revenueYesterday > 0
      ? ((revenueToday - revenueYesterday) / revenueYesterday) * 100
      : revenueToday > 0 ? 100 : 0

    // Orders metrics
    const ordersToday = ordersData.filter(o => new Date(o.order_date) >= today).length
    const ordersPending = ordersData.filter(o => o.status === 'NOT_STARTED').length
    const ordersShipped = ordersData.filter(o => o.status === 'FULFILLED').length
    const ordersThisWeek = ordersData.filter(o => new Date(o.order_date) >= weekStart).length

    const ordersLastWeek = ordersData.filter(o => {
      const d = new Date(o.order_date)
      return d >= lastWeekStart && d < weekStart
    }).length

    const ordersTrend = ordersLastWeek > 0
      ? ((ordersThisWeek - ordersLastWeek) / ordersLastWeek) * 100
      : ordersThisWeek > 0 ? 100 : 0

    // Listings metrics
    const { count: activeListings } = await supabase
      .from('store_sku_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('listing_status', 'active')

    const { count: draftListings } = await supabase
      .from('store_sku_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('listing_status', 'draft')

    const { count: endedListings } = await supabase
      .from('store_sku_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('listing_status', 'ended')

    const { count: newListingsToday } = await supabase
      .from('store_sku_assignments')
      .select('*', { count: 'exact', head: true })
      .gte('listed_at', today.toISOString())

    // Store metrics
    const { data: storesData } = await supabase
      .from('stores')
      .select('id, is_active, health_score')

    const activeStores = storesData?.filter(s => s.is_active).length || 0
    const totalStores = storesData?.length || 0
    const healthyStores = storesData?.filter(s => (s.health_score || 0) >= 80).length || 0
    const warningStores = storesData?.filter(s => (s.health_score || 0) < 80 && (s.health_score || 0) >= 50).length || 0

    // Performance metrics (calculated)
    const totalViews = 10000  // Placeholder - would come from analytics
    const conversionRate = totalViews > 0 ? (ordersThisWeek / totalViews) * 100 : 0
    const avgOrderValue = ordersThisWeek > 0 ? revenueThisWeek / ordersThisWeek : 0
    const sellThroughRate = (activeListings || 0) > 0 ? (ordersThisWeek / (activeListings || 1)) * 100 : 0
    const profitMargin = revenueThisWeek > 0 ? 25 : 0  // Placeholder - would calculate from cost data

    const metrics = {
      revenue: {
        today: revenueToday,
        yesterday: revenueYesterday,
        thisWeek: revenueThisWeek,
        lastWeek: revenueLastWeek,
        thisMonth: revenueThisMonth,
        lastMonth: revenueLastMonth,
        trend: revenueTrend
      },
      orders: {
        today: ordersToday,
        pending: ordersPending,
        shipped: ordersShipped,
        thisWeek: ordersThisWeek,
        trend: ordersTrend
      },
      listings: {
        active: activeListings || 0,
        draft: draftListings || 0,
        ended: endedListings || 0,
        total: (activeListings || 0) + (draftListings || 0) + (endedListings || 0),
        newToday: newListingsToday || 0
      },
      stores: {
        active: activeStores,
        total: totalStores,
        healthyCount: healthyStores,
        warningCount: warningStores
      },
      performance: {
        conversionRate,
        avgOrderValue,
        sellThroughRate,
        profitMargin
      }
    }

    return NextResponse.json({
      success: true,
      metrics,
      range,
      generatedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Dashboard Metrics] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch metrics'
    }, { status: 500 })
  }
}
