import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('store_id')
  const skuId = searchParams.get('sku_id')
  const status = searchParams.get('status')

  let query = supabase
    .from('store_sku_assignments')
    .select('*, stores(store_name, ebay_username), skus(sku_code, title, sell_price, cost_price)')
    .order('created_at', { ascending: false })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }
  if (skuId) {
    query = query.eq('sku_id', skuId)
  }
  if (status) {
    query = query.eq('listing_status', status)
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
    const { store_id, sku_id, listing_status = 'draft' } = body

    if (!store_id || !sku_id) {
      return NextResponse.json(
        { error: 'store_id and sku_id are required' },
        { status: 400 }
      )
    }

    // Check if assignment already exists
    const { data: existing } = await supabase
      .from('store_sku_assignments')
      .select('id')
      .eq('store_id', store_id)
      .eq('sku_id', sku_id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'This SKU is already assigned to this store' },
        { status: 400 }
      )
    }

    // Check SKU store count (trigger will also check, but let's provide a better error)
    const { data: sku } = await supabase
      .from('skus')
      .select('current_store_count, max_store_count, sku_code')
      .eq('id', sku_id)
      .single()

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }

    if (sku.current_store_count >= sku.max_store_count) {
      return NextResponse.json(
        { error: `SKU ${sku.sku_code} is already assigned to maximum ${sku.max_store_count} stores` },
        { status: 400 }
      )
    }

    // Create the assignment (trigger will increment SKU store count)
    const { data, error } = await supabase
      .from('store_sku_assignments')
      .insert({
        store_id,
        sku_id,
        listing_status,
        listed_at: listing_status === 'active' ? new Date().toISOString() : null,
      })
      .select('*, stores(store_name, ebay_username), skus(sku_code, title, sell_price)')
      .single()

    if (error) {
      // Check if it's the max stores trigger
      if (error.message.includes('maximum 3 stores')) {
        return NextResponse.json(
          { error: 'This SKU is already assigned to the maximum number of stores (3)' },
          { status: 400 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Error creating assignment:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
