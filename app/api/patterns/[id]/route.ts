import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('patterns')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { category, subcategory, use_case, price_band, is_active, is_validated } = body

    const updateData: Record<string, unknown> = {}
    if (category !== undefined) updateData.category = category
    if (subcategory !== undefined) updateData.subcategory = subcategory || null
    if (use_case !== undefined) updateData.use_case = use_case || null
    if (price_band !== undefined) updateData.price_band = price_band
    if (is_active !== undefined) updateData.is_active = is_active
    if (is_validated !== undefined) {
      updateData.is_validated = is_validated
      if (is_validated) {
        updateData.validation_date = new Date().toISOString()
      }
    }

    const { data, error } = await supabase
      .from('patterns')
      .update(updateData)
      .eq('id', params.id)
      .select()
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
  // Check if pattern has SKUs
  const { count } = await supabase
    .from('skus')
    .select('*', { count: 'exact', head: true })
    .eq('pattern_id', params.id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete pattern with ${count} associated SKUs` },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('patterns')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
