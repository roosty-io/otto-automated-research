// Supabase Edge Function: process-jobs
// This function processes pending listing jobs from the queue
// Scheduled to run via cron or triggered manually

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ListingJob {
  id: string
  store_id: string
  job_type: string
  job_name: string
  target_listing_count: number
  completed_count: number
  failed_count: number
  status: string
  priority: number
  config: Record<string, unknown>
  retry_count: number
  max_retries: number
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch pending jobs ordered by priority and creation time
    const { data: jobs, error: fetchError } = await supabase
      .from('listing_jobs')
      .select('*')
      .eq('status', 'pending')
      .or('scheduled_for.is.null,scheduled_for.lte.now()')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5)

    if (fetchError) {
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`)
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending jobs to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: { jobId: string; status: string; message: string }[] = []

    for (const job of jobs as ListingJob[]) {
      try {
        // Mark job as processing
        await supabase
          .from('listing_jobs')
          .update({
            status: 'processing',
            started_at: new Date().toISOString()
          })
          .eq('id', job.id)

        // Process based on job type
        const result = await processJob(supabase, job)

        // Update job with results
        await supabase
          .from('listing_jobs')
          .update({
            status: result.success ? 'completed' : 'failed',
            completed_count: result.completedCount,
            failed_count: result.failedCount,
            completed_at: new Date().toISOString(),
            last_error: result.error || null,
            results: result.data || {},
          })
          .eq('id', job.id)

        results.push({
          jobId: job.id,
          status: result.success ? 'completed' : 'failed',
          message: result.message,
        })

      } catch (jobError) {
        // Handle job-level errors
        const errorMessage = jobError instanceof Error ? jobError.message : 'Unknown error'

        // Check if we should retry
        if (job.retry_count < job.max_retries) {
          await supabase
            .from('listing_jobs')
            .update({
              status: 'pending',
              retry_count: job.retry_count + 1,
              last_error: errorMessage,
            })
            .eq('id', job.id)

          results.push({
            jobId: job.id,
            status: 'retry_scheduled',
            message: `Retry ${job.retry_count + 1}/${job.max_retries}: ${errorMessage}`,
          })
        } else {
          await supabase
            .from('listing_jobs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              last_error: `Max retries exceeded: ${errorMessage}`,
            })
            .eq('id', job.id)

          results.push({
            jobId: job.id,
            status: 'failed',
            message: `Max retries exceeded: ${errorMessage}`,
          })
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} jobs`,
        processed: results.length,
        results
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

async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: ListingJob
): Promise<{
  success: boolean
  message: string
  completedCount: number
  failedCount: number
  error?: string
  data?: Record<string, unknown>
}> {
  // Get store information
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('*, store_tiers(*)')
    .eq('id', job.store_id)
    .single()

  if (storeError || !store) {
    throw new Error(`Store not found: ${job.store_id}`)
  }

  switch (job.job_type) {
    case 'managed_onboarding':
    case 'self_service_onboarding':
      return await processOnboardingJob(supabase, job, store)

    case 'managed_replenishment':
    case 'self_service_topup':
      return await processReplenishmentJob(supabase, job, store)

    case 'bulk_import':
      return await processBulkImportJob(supabase, job, store)

    case 'pruning':
      return await processPruningJob(supabase, job, store)

    case 'escalation':
      return await processEscalationJob(supabase, job, store)

    default:
      return {
        success: false,
        message: `Unknown job type: ${job.job_type}`,
        completedCount: 0,
        failedCount: 0,
        error: `Unknown job type: ${job.job_type}`,
      }
  }
}

// Placeholder implementations - these would integrate with eBay API in production

async function processOnboardingJob(
  supabase: ReturnType<typeof createClient>,
  job: ListingJob,
  store: Record<string, unknown>
): Promise<{
  success: boolean
  message: string
  completedCount: number
  failedCount: number
  data?: Record<string, unknown>
}> {
  // TODO: Implement actual eBay listing creation
  // For now, simulate processing
  const targetCount = job.target_listing_count
  const simulatedSuccess = Math.floor(targetCount * 0.95) // 95% success rate
  const simulatedFailed = targetCount - simulatedSuccess

  // Update store's active listing count
  await supabase
    .from('stores')
    .update({
      current_active_listings: (store.current_active_listings as number) + simulatedSuccess,
    })
    .eq('id', job.store_id)

  return {
    success: true,
    message: `Onboarding complete: ${simulatedSuccess} listings created`,
    completedCount: simulatedSuccess,
    failedCount: simulatedFailed,
    data: {
      listings_created: simulatedSuccess,
      listings_failed: simulatedFailed,
    },
  }
}

async function processReplenishmentJob(
  supabase: ReturnType<typeof createClient>,
  job: ListingJob,
  store: Record<string, unknown>
): Promise<{
  success: boolean
  message: string
  completedCount: number
  failedCount: number
  data?: Record<string, unknown>
}> {
  // TODO: Implement actual replenishment logic
  const targetCount = job.target_listing_count
  const simulatedSuccess = Math.floor(targetCount * 0.98)
  const simulatedFailed = targetCount - simulatedSuccess

  await supabase
    .from('stores')
    .update({
      current_active_listings: (store.current_active_listings as number) + simulatedSuccess,
    })
    .eq('id', job.store_id)

  return {
    success: true,
    message: `Replenishment complete: ${simulatedSuccess} listings added`,
    completedCount: simulatedSuccess,
    failedCount: simulatedFailed,
    data: {
      listings_added: simulatedSuccess,
    },
  }
}

async function processBulkImportJob(
  supabase: ReturnType<typeof createClient>,
  job: ListingJob,
  store: Record<string, unknown>
): Promise<{
  success: boolean
  message: string
  completedCount: number
  failedCount: number
  data?: Record<string, unknown>
}> {
  // TODO: Implement bulk import from CSV/feed
  const targetCount = job.target_listing_count
  const simulatedSuccess = Math.floor(targetCount * 0.90)
  const simulatedFailed = targetCount - simulatedSuccess

  await supabase
    .from('stores')
    .update({
      current_active_listings: (store.current_active_listings as number) + simulatedSuccess,
    })
    .eq('id', job.store_id)

  return {
    success: true,
    message: `Bulk import complete: ${simulatedSuccess} listings imported`,
    completedCount: simulatedSuccess,
    failedCount: simulatedFailed,
    data: {
      listings_imported: simulatedSuccess,
      validation_errors: simulatedFailed,
    },
  }
}

async function processPruningJob(
  supabase: ReturnType<typeof createClient>,
  job: ListingJob,
  store: Record<string, unknown>
): Promise<{
  success: boolean
  message: string
  completedCount: number
  failedCount: number
  data?: Record<string, unknown>
}> {
  // TODO: Implement listing pruning logic
  // Remove listings that haven't sold in X days
  const targetCount = job.target_listing_count
  const simulatedPruned = targetCount

  await supabase
    .from('stores')
    .update({
      current_active_listings: Math.max(0, (store.current_active_listings as number) - simulatedPruned),
    })
    .eq('id', job.store_id)

  return {
    success: true,
    message: `Pruning complete: ${simulatedPruned} stale listings removed`,
    completedCount: simulatedPruned,
    failedCount: 0,
    data: {
      listings_pruned: simulatedPruned,
    },
  }
}

async function processEscalationJob(
  supabase: ReturnType<typeof createClient>,
  job: ListingJob,
  store: Record<string, unknown>
): Promise<{
  success: boolean
  message: string
  completedCount: number
  failedCount: number
  data?: Record<string, unknown>
}> {
  // TODO: Implement escalation logic for underperforming stores
  const targetCount = job.target_listing_count
  const simulatedSuccess = Math.floor(targetCount * 0.92)
  const simulatedFailed = targetCount - simulatedSuccess

  await supabase
    .from('stores')
    .update({
      current_active_listings: (store.current_active_listings as number) + simulatedSuccess,
    })
    .eq('id', job.store_id)

  return {
    success: true,
    message: `Escalation complete: ${simulatedSuccess} priority listings created`,
    completedCount: simulatedSuccess,
    failedCount: simulatedFailed,
    data: {
      escalation_listings: simulatedSuccess,
    },
  }
}
