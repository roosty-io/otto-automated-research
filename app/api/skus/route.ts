import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const patternId = searchParams.get('pattern_id')
  const status = searchParams.get('status')
  const available = searchParams.get('available')

  let query = supabase
    .from('skus')
    .select('*, patterns(*)')
    .order('created_at', { ascending: false })

  if (patternId) {
    query = query.eq('pattern_id', patternId)
  }
  if (status) {
    query = query.eq('status', status)
  }
  if (available === 'true') {
    // SKUs that can still be assigned (less than 3 stores)
    query = query.lt('current_store_count', 3).eq('status', 'ready')
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
      pattern_id,
      sku_code,
      title,
      description,
      bullet_points,
      cost_price,
      sell_price,
      status = 'draft',
    } = body

    if (!sku_code || !title || !cost_price || !sell_price) {
      return NextResponse.json(
        { error: 'sku_code, title, cost_price, and sell_price are required' },
        { status: 400 }
      )
    }

    // Check if SKU code already exists
    const { data: existing } = await supabase
      .from('skus')
      .select('id')
      .eq('sku_code', sku_code)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'A SKU with this code already exists' },
        { status: 400 }
      )
    }

    // We need a normalized_product_id - create a placeholder or require it
    // For now, let's create a minimal raw_product and normalized_product
    const { data: rawProduct, error: rawError } = await supabase
      .from('raw_products')
      .insert({
        asin: `MANUAL-${sku_code}`,
        title: title,
        is_processed: true,
        processed_at: new Date().toISOString(),
        source: 'manual',
      })
      .select()
      .single()

    if (rawError) {
      return NextResponse.json({ error: rawError.message }, { status: 500 })
    }

    const { data: normalizedProduct, error: normError } = await supabase
      .from('normalized_products')
      .insert({
        raw_product_id: rawProduct.id,
        normalized_title: title,
        normalized_category: 'Manual Entry',
        cost_price: cost_price,
        suggested_sell_price: sell_price,
      })
      .select()
      .single()

    if (normError) {
      return NextResponse.json({ error: normError.message }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('skus')
      .insert({
        normalized_product_id: normalizedProduct.id,
        pattern_id: pattern_id || null,
        sku_code,
        title,
        description: description || null,
        bullet_points: bullet_points || [],
        cost_price,
        sell_price,
        status,
      })
      .select('*, patterns(*)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update pattern SKU count if pattern_id provided
    if (pattern_id) {
      await supabase.rpc('increment_pattern_sku_count', { p_pattern_id: pattern_id })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Error creating SKU:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
