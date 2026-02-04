import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('skus')
    .select('*, patterns(*), store_sku_assignments(*, stores(store_name, ebay_username))')
    .eq('id', params.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const {
      pattern_id,
      title,
      description,
      bullet_points,
      cost_price,
      sell_price,
      status,
    } = body

    const updateData: Record<string, unknown> = {}
    if (pattern_id !== undefined) updateData.pattern_id = pattern_id || null
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description || null
    if (bullet_points !== undefined) updateData.bullet_points = bullet_points
    if (cost_price !== undefined) updateData.cost_price = cost_price
    if (sell_price !== undefined) updateData.sell_price = sell_price
    if (status !== undefined) updateData.status = status

    const { data, error } = await supabase
      .from('skus')
      .update(updateData)
      .eq('id', params.id)
      .select('*, patterns(*)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Check if SKU has active assignments
  const { count } = await supabase
    .from('store_sku_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('sku_id', params.id)
    .eq('listing_status', 'active')

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete SKU with ${count} active listings` },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('skus')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
