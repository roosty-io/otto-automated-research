import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('listing_jobs')
    .select('*, stores(store_name, ebay_username)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      store_id,
      job_type,
      job_name,
      target_listing_count,
      priority = 5,
      scheduled_for,
      config = {},
    } = body

    // Validate required fields
    if (!store_id || !job_type || !job_name || !target_listing_count) {
      return NextResponse.json(
        { error: 'store_id, job_type, job_name, and target_listing_count are required' },
        { status: 400 }
      )
    }

    // Validate job type
    const validJobTypes = [
      'managed_onboarding',
      'self_service_onboarding',
      'managed_replenishment',
      'self_service_topup',
      'bulk_import',
      'escalation',
      'pruning',
    ]
    if (!validJobTypes.includes(job_type)) {
      return NextResponse.json(
        { error: `Invalid job_type. Must be one of: ${validJobTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify store exists
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, store_name, is_active')
      .eq('id', store_id)
      .single()

    if (storeError || !store) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      )
    }

    // Create the job
    const { data, error } = await supabase
      .from('listing_jobs')
      .insert({
        store_id,
        job_type,
        job_name,
        target_listing_count,
        priority,
        scheduled_for: scheduled_for || null,
        config,
        results: {},
        max_retries: 3,
        created_by: 'admin-dashboard',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating job:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Error parsing request:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
