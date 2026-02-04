import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Job processor - picks up pending jobs and executes them
// Creates SKU assignments for stores based on job type

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return processJobs()
}

export async function POST() {
  return processJobs()
}

async function processJobs() {
  try {
    // Get pending jobs ordered by priority and creation time
    const { data: jobs, error: jobsError } = await supabase
      .from('listing_jobs')
      .select('*, stores(id, store_name, ebay_username, current_active_listings, tier_id, store_tiers(max_total_listings))')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5)

    if (jobsError) {
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`)
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending jobs',
        jobsProcessed: 0,
      })
    }

    const results: {
      jobId: string
      jobName: string
      status: string
      assigned: number
      errors: string[]
    }[] = []

    for (const job of jobs) {
      // Mark job as processing
      await supabase
        .from('listing_jobs')
        .update({ status: 'processing', started_at: new Date().toISOString() })
        .eq('id', job.id)

      const jobResult = {
        jobId: job.id,
        jobName: job.job_name,
        status: 'completed',
        assigned: 0,
        errors: [] as string[],
      }

      try {
        const store = job.stores
        if (!store) {
          throw new Error('Store not found')
        }

        const maxListings = store.store_tiers?.max_total_listings || 10000
        const availableSlots = maxListings - store.current_active_listings
        const targetCount = Math.min(job.target_listing_count, availableSlots)

        if (targetCount <= 0) {
          throw new Error('Store at capacity, no slots available')
        }

        // Get available SKUs (ready status, under 3 stores, not already assigned to this store)
        const { data: existingAssignments } = await supabase
          .from('store_sku_assignments')
          .select('sku_id')
          .eq('store_id', store.id)

        const assignedSkuIds = existingAssignments?.map(a => a.sku_id) || []

        let skuQuery = supabase
          .from('skus')
          .select('id, sku_code, title, sell_price')
          .eq('status', 'ready')
          .lt('current_store_count', 3)
          .limit(targetCount)

        if (assignedSkuIds.length > 0) {
          skuQuery = skuQuery.not('id', 'in', `(${assignedSkuIds.join(',')})`)
        }

        const { data: availableSkus, error: skuError } = await skuQuery

        if (skuError) {
          throw new Error(`Failed to fetch SKUs: ${skuError.message}`)
        }

        if (!availableSkus || availableSkus.length === 0) {
          throw new Error('No available SKUs for assignment')
        }

        // Create assignments
        for (const sku of availableSkus) {
          try {
            const { error: assignError } = await supabase
              .from('store_sku_assignments')
              .insert({
                store_id: store.id,
                sku_id: sku.id,
                listing_status: 'active',
                listed_at: new Date().toISOString(),
              })

            if (assignError) {
              jobResult.errors.push(`SKU ${sku.sku_code}: ${assignError.message}`)
            } else {
              jobResult.assigned++
            }
          } catch (err) {
            jobResult.errors.push(`SKU ${sku.sku_code}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        }

        // Update job with results
        const finalStatus = jobResult.assigned >= job.target_listing_count ? 'completed' :
                          jobResult.assigned > 0 ? 'completed' : 'failed'

        await supabase
          .from('listing_jobs')
          .update({
            status: finalStatus,
            completed_at: new Date().toISOString(),
            completed_count: jobResult.assigned,
            failed_count: jobResult.errors.length,
            results: {
              assigned: jobResult.assigned,
              target: job.target_listing_count,
              errors: jobResult.errors.slice(0, 10),
            },
          })
          .eq('id', job.id)

        jobResult.status = finalStatus

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        jobResult.status = 'failed'
        jobResult.errors.push(errorMessage)

        await supabase
          .from('listing_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            last_error: errorMessage,
            results: { error: errorMessage },
          })
          .eq('id', job.id)
      }

      results.push(jobResult)
    }

    const completedCount = results.filter(r => r.status === 'completed').length
    const totalAssigned = results.reduce((sum, r) => sum + r.assigned, 0)

    return NextResponse.json({
      success: true,
      message: `Processed ${jobs.length} jobs, ${completedCount} completed, ${totalAssigned} SKUs assigned`,
      jobsProcessed: jobs.length,
      jobsCompleted: completedCount,
      totalAssigned,
      results,
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
