import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('stores')
      .select('*, store_tiers(*)')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stores' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await request.json()

    const { store_name, ebay_username, tier_id, ebay_registration_date, notes } = body

    // Validate required fields
    if (!store_name || !ebay_username || !tier_id) {
      return NextResponse.json(
        { error: 'store_name, ebay_username, and tier_id are required' },
        { status: 400 }
      )
    }

    // Check if ebay_username already exists
    const { data: existing } = await supabase
      .from('stores')
      .select('id')
      .eq('ebay_username', ebay_username)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'A store with this eBay username already exists' },
        { status: 400 }
      )
    }

    // Create the store
    const { data, error } = await supabase
      .from('stores')
      .insert({
        store_name,
        ebay_username,
        tier_id,
        ebay_registration_date: ebay_registration_date || null,
        notes: notes || null,
        is_active: true,
        onboarding_date: new Date().toISOString().split('T')[0],
      })
      .select('*, store_tiers(*)')
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('Error creating store:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create store' },
      { status: 500 }
    )
  }
}
