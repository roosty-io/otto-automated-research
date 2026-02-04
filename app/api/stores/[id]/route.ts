import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {

    const { data, error } = await supabase
      .from('stores')
      .select('*, store_tiers(*)')
      .eq('id', params.id)
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch store' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const { store_name, ebay_username, tier_id, ebay_registration_date, notes, is_active } = body

    // Validate required fields
    if (!store_name || !ebay_username || !tier_id) {
      return NextResponse.json(
        { error: 'store_name, ebay_username, and tier_id are required' },
        { status: 400 }
      )
    }

    // Check if ebay_username is taken by another store
    const { data: existing } = await supabase
      .from('stores')
      .select('id')
      .eq('ebay_username', ebay_username)
      .neq('id', params.id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Another store with this eBay username already exists' },
        { status: 400 }
      )
    }

    // Update the store
    const { data, error } = await supabase
      .from('stores')
      .update({
        store_name,
        ebay_username,
        tier_id,
        ebay_registration_date: ebay_registration_date || null,
        notes: notes || null,
        is_active: is_active ?? true,
      })
      .eq('id', params.id)
      .select('*, store_tiers(*)')
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error updating store:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update store' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if store exists
    const { data: store } = await supabase
      .from('stores')
      .select('id, store_name')
      .eq('id', params.id)
      .single()

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // Delete the store (cascades will handle related records)
    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true, message: `Store "${store.store_name}" deleted` })
  } catch (error: any) {
    console.error('Error deleting store:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete store' },
      { status: 500 }
    )
  }
}
