// Supabase Edge Function: auto-replenishment
// This function checks stores below floor and creates replenishment jobs
// Should be run daily via cron or triggered by store health changes

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Store {
  id: string
  store_name: string
  ebay_username: string
  current_active_listings: number
  is_active: boolean
  maturity: string
  tier_id: string
}

interface StoreTier {
  id: string
  tier_name: string
  min_active_listings: number
  max_total_listings: number
  days_to_floor: number
}

interface MaturityTier {
  maturity_level: string
  velocity_multiplier: number
  daily_cap: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body for options
    let options = { dryRun: false, minFloorPercentage: 90 }
    try {
      const body = await req.json()
      options = { ...options, ...body }
    } catch {
      // Use defaults if no body
    }

    // Fetch all active stores with their tiers
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('*, store_tiers(*)')
      .eq('is_active', true)

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`)
    }

    // Fetch maturity tiers for velocity calculations
    const { data: maturityTiers, error: maturityError } = await supabase
      .from('store_maturity_tiers')
      .select('*')

    if (maturityError) {
      throw new Error(`Failed to fetch maturity tiers: ${maturityError.message}`)
    }

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

    for (const store of stores as (Store & { store_tiers: StoreTier })[]) {
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
      const maturityTier = maturityTiers?.find((m: MaturityTier) => m.maturity_level === store.maturity)
      const velocityMultiplier = maturityTier?.velocity_multiplier || 1.0
      const dailyCap = maturityTier?.daily_cap || 100

      // Determine if replenishment is needed
      if (floorPercentage < options.minFloorPercentage) {
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

        if (options.dryRun) {
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

    return new Response(
      JSON.stringify({
        message: options.dryRun
          ? `Dry run: ${storesNeedingAttention} stores need replenishment`
          : `Created ${jobsCreated} replenishment jobs`,
        dryRun: options.dryRun,
        storesProcessed: stores?.length || 0,
        jobsCreated,
        storesNeedingAttention,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
