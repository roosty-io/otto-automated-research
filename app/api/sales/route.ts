import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('store_id')
  const skuId = searchParams.get('sku_id')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  let query = supabase
    .from('sales')
    .select('*, stores(store_name, ebay_username), skus(sku_code, title), store_sku_assignments(listing_status)')
    .order('ebay_order_date', { ascending: false })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }
  if (skuId) {
    query = query.eq('sku_id', skuId)
  }
  if (startDate) {
    query = query.gte('ebay_order_date', startDate)
  }
  if (endDate) {
    query = query.lte('ebay_order_date', endDate)
  }

  const { data, error } = await query.limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      assignment_id,
      ebay_order_id,
      ebay_order_date,
      sale_price,
      ebay_fees,
      shipping_cost = 0,
      product_cost,
      buyer_username,
      shipping_address_state,
      shipping_address_country = 'US',
    } = body

    if (!assignment_id || !ebay_order_id || !ebay_order_date || !sale_price || !product_cost) {
      return NextResponse.json(
        { error: 'assignment_id, ebay_order_id, ebay_order_date, sale_price, and product_cost are required' },
        { status: 400 }
      )
    }

    // Get assignment details
    const { data: assignment, error: assignmentError } = await supabase
      .from('store_sku_assignments')
      .select('store_id, sku_id')
      .eq('id', assignment_id)
      .single()

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    // Check for duplicate order ID
    const { data: existing } = await supabase
      .from('sales')
      .select('id')
      .eq('ebay_order_id', ebay_order_id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'A sale with this eBay order ID already exists' },
        { status: 400 }
      )
    }

    // Create the sale
    const { data, error } = await supabase
      .from('sales')
      .insert({
        assignment_id,
        store_id: assignment.store_id,
        sku_id: assignment.sku_id,
        ebay_order_id,
        ebay_order_date,
        sale_price,
        ebay_fees: ebay_fees || sale_price * 0.13,
        shipping_cost,
        product_cost,
        buyer_username: buyer_username || null,
        shipping_address_state: shipping_address_state || null,
        shipping_address_country,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update assignment stats
    await supabase.rpc('update_assignment_stats', { p_assignment_id: assignment_id })

    // Update SKU stats
    await supabase.rpc('update_sku_stats', { p_sku_id: assignment.sku_id })

    // Update pattern stats if SKU has a pattern
    const { data: sku } = await supabase
      .from('skus')
      .select('pattern_id')
      .eq('id', assignment.sku_id)
      .single()

    if (sku?.pattern_id) {
      await supabase.rpc('update_pattern_stats', { p_pattern_id: sku.pattern_id })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Error recording sale:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
