import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Auto-replenishment cron job
// Checks stores below floor and creates replenishment jobs
// Can be triggered via Vercel Cron or external service

export async function GET(request: NextRequest) {
  // Check for authorization (simple API key check)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return runAutoReplenishment(false)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const dryRun = body.dryRun === true
    return runAutoReplenishment(dryRun)
  } catch {
    return runAutoReplenishment(false)
  }
}

async function runAutoReplenishment(dryRun: boolean) {
  const minFloorPercentage = 90

  try {
    // Fetch all active stores with their tiers
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('*, store_tiers(*)')
      .eq('is_active', true)

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`)
    }

    // Fetch maturity tiers for velocity calculations
    const { data: maturityTiers } = await supabase
      .from('store_maturity_tiers')
      .select('*')

    // Check for existing pending/processing replenishment jobs
    const { data: existingJobs } = await supabase
      .from('listing_jobs')
      .select('store_id')
      .in('job_type', ['managed_replenishment', 'self_service_topup', 'escalation'])
      .in('status', ['pending', 'processing'])

    const storesWithPendingJobs = new Set(existingJobs?.map(j => j.store_id) || [])

    const results: {
      storeId: string
      storeName: string
      action: string
      jobId?: string
      details?: Record<string, unknown>
    }[] = []

    for (const store of stores || []) {
      const tier = store.store_tiers
      if (!tier) {
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          action: 'skipped - no tier assigned',
        })
        continue
      }

      // Skip if store already has a pending replenishment job
      if (storesWithPendingJobs.has(store.id)) {
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          action: 'skipped - has pending job',
        })
        continue
      }

      // Calculate floor percentage
      const floorPercentage = (store.current_active_listings / tier.min_active_listings) * 100

      // Get maturity velocity multiplier
      const maturityTier = maturityTiers?.find((m: any) => m.maturity_level === store.maturity)
      const velocityMultiplier = maturityTier?.velocity_multiplier || 1.0
      const dailyCap = maturityTier?.daily_cap || 100

      // Determine if replenishment is needed
      if (floorPercentage < minFloorPercentage) {
        // Calculate target: get back to floor + 10% buffer
        const targetListings = Math.ceil(tier.min_active_listings * 1.1) - store.current_active_listings
        const adjustedTarget = Math.min(targetListings, tier.max_total_listings - store.current_active_listings)

        // Determine job type based on how far below floor
        let jobType = 'managed_replenishment'
        let priority = 5

        if (floorPercentage < 50) {
          jobType = 'escalation'
          priority = 9
        } else if (floorPercentage < 75) {
          priority = 7
        }

        const jobName = `Auto-replenishment: ${store.store_name} (${Math.round(floorPercentage)}% of floor)`

        if (dryRun) {
          results.push({
            storeId: store.id,
            storeName: store.store_name,
            action: `would create ${jobType} job`,
            details: {
              floorPercentage: Math.round(floorPercentage),
              targetListings: adjustedTarget,
              priority,
              currentListings: store.current_active_listings,
              floor: tier.min_active_listings,
            },
          })
        } else {
          // Create the replenishment job
          const { data: job, error: jobError } = await supabase
            .from('listing_jobs')
            .insert({
              store_id: store.id,
              job_type: jobType,
              job_name: jobName,
              target_listing_count: adjustedTarget,
              priority,
              config: {
                auto_generated: true,
                floor_percentage: Math.round(floorPercentage),
                velocity_multiplier: velocityMultiplier,
                daily_cap: dailyCap,
              },
              results: {},
              max_retries: 3,
              created_by: 'auto-replenishment',
            })
            .select()
            .single()

          if (jobError) {
            results.push({
              storeId: store.id,
              storeName: store.store_name,
              action: `error creating job: ${jobError.message}`,
            })
          } else {
            results.push({
              storeId: store.id,
              storeName: store.store_name,
              action: `created ${jobType} job`,
              jobId: job.id,
              details: {
                floorPercentage: Math.round(floorPercentage),
                targetListings: adjustedTarget,
                priority,
              },
            })
          }
        }
      } else {
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          action: `healthy (${Math.round(floorPercentage)}% of floor)`,
        })
      }
    }

    // Count jobs created
    const jobsCreated = results.filter(r => r.action.includes('created')).length
    const storesNeedingAttention = results.filter(r =>
      r.action.includes('would create') || r.action.includes('created')
    ).length

    return NextResponse.json({
      success: true,
      message: dryRun
        ? `Dry run: ${storesNeedingAttention} stores need replenishment`
        : `Created ${jobsCreated} replenishment jobs`,
      dryRun,
      storesProcessed: stores?.length || 0,
      jobsCreated,
      storesNeedingAttention,
      results,
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
