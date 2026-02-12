import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get stores with their metrics
    const { data: storesData, error } = await supabase
      .from('stores')
      .select(`
        id,
        store_name,
        is_active,
        health_score,
        current_active_listings,
        total_revenue,
        total_orders
      `)
      .eq('is_active', true)
      .order('total_revenue', { ascending: false })
      .limit(10)

    if (error) {
      throw error
    }

    // Get today's orders by store
    const { data: todayOrders } = await supabase
      .from('orders')
      .select('store_id, total_amount')
      .gte('order_date', today.toISOString())

    const ordersByStore = (todayOrders || []).reduce((acc, order) => {
      if (!acc[order.store_id]) {
        acc[order.store_id] = { revenue: 0, count: 0 }
      }
      acc[order.store_id].revenue += order.total_amount || 0
      acc[order.store_id].count++
      return acc
    }, {} as Record<string, { revenue: number; count: number }>)

    const stores = (storesData || []).map(store => {
      const todayStats = ordersByStore[store.id] || { revenue: 0, count: 0 }
      const trend = todayStats.revenue > 0 ? 'up' : 'stable'

      return {
        id: store.id,
        name: store.store_name,
        revenue: todayStats.revenue,
        orders: todayStats.count,
        activeListings: store.current_active_listings || 0,
        healthScore: store.health_score || 0,
        trend
      }
    })

    return NextResponse.json({
      success: true,
      stores
    })
  } catch (error) {
    console.error('[Dashboard Stores] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch stores'
    }, { status: 500 })
  }
}
