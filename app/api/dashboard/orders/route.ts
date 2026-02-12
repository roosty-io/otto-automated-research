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
    const limit = parseInt(searchParams.get('limit') || '10')

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        buyer_username,
        total_amount,
        status,
        order_date,
        stores(store_name)
      `)
      .order('order_date', { ascending: false })
      .limit(limit)

    if (error) {
      throw error
    }

    const formattedOrders = (orders || []).map(order => ({
      id: order.id,
      buyerUsername: order.buyer_username || 'Unknown',
      totalAmount: order.total_amount || 0,
      status: order.status || 'UNKNOWN',
      storeName: (order.stores as any)?.store_name || 'Unknown',
      orderDate: order.order_date
    }))

    return NextResponse.json({
      success: true,
      orders: formattedOrders
    })
  } catch (error) {
    console.error('[Dashboard Orders] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch orders'
    }, { status: 500 })
  }
}
