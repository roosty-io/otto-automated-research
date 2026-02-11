/**
 * Listing Queue Processor
 *
 * Automated processing of the listing job queue:
 * - Process jobs in priority order
 * - Respect rate limits per store
 * - Handle concurrent processing
 * - Coordinate with Puppeteer for eBay automation
 */

import { supabase } from '@/lib/supabase'
import {
  ListingJob,
  getProcessableJobs,
  startJob,
  completeJob,
  failJob,
  getJobStats,
} from './job-manager'

export interface ProcessorConfig {
  maxConcurrent: number
  jobsPerStore: number
  processingInterval: number // ms between batches
  storeDelay: number // ms delay between jobs for same store
  dryRun: boolean
}

export interface ProcessingResult {
  jobId: string
  success: boolean
  duration: number
  error?: string
  result?: {
    ebayItemId?: string
    listingUrl?: string
    actualPrice?: number
  }
}

export interface BatchResult {
  processed: number
  succeeded: number
  failed: number
  results: ProcessingResult[]
  duration: number
}

const DEFAULT_CONFIG: ProcessorConfig = {
  maxConcurrent: 5,
  jobsPerStore: 2,
  processingInterval: 5000,
  storeDelay: 3000,
  dryRun: false,
}

// Track active jobs per store to prevent overloading
const activeJobsPerStore: Map<string, number> = new Map()

/**
 * Process a single batch of jobs
 */
export async function processBatch(
  config: Partial<ProcessorConfig> = {}
): Promise<BatchResult> {
  const startTime = Date.now()
  const cfg = { ...DEFAULT_CONFIG, ...config }

  const results: ProcessingResult[] = []

  // Get jobs ready for processing
  const jobs = await getProcessableJobs({
    limit: cfg.maxConcurrent * 2, // Fetch extra to account for store limits
  })

  if (jobs.length === 0) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      duration: Date.now() - startTime,
    }
  }

  // Filter jobs based on per-store limits
  const eligibleJobs: ListingJob[] = []
  for (const job of jobs) {
    const currentActive = activeJobsPerStore.get(job.storeId) || 0
    if (currentActive < cfg.jobsPerStore && eligibleJobs.length < cfg.maxConcurrent) {
      eligibleJobs.push(job)
      activeJobsPerStore.set(job.storeId, currentActive + 1)
    }
  }

  // Process jobs concurrently
  const processingPromises = eligibleJobs.map((job) =>
    processJob(job, cfg).finally(() => {
      // Decrement active count when done
      const current = activeJobsPerStore.get(job.storeId) || 1
      activeJobsPerStore.set(job.storeId, Math.max(0, current - 1))
    })
  )

  const processedResults = await Promise.all(processingPromises)
  results.push(...processedResults)

  const succeeded = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  return {
    processed: results.length,
    succeeded,
    failed,
    results,
    duration: Date.now() - startTime,
  }
}

/**
 * Process a single job
 */
async function processJob(
  job: ListingJob,
  config: ProcessorConfig
): Promise<ProcessingResult> {
  const startTime = Date.now()

  // Try to start the job (atomic update)
  const started = await startJob(job.id)
  if (!started.success) {
    return {
      jobId: job.id,
      success: false,
      duration: Date.now() - startTime,
      error: started.error || 'Failed to start job',
    }
  }

  try {
    // Get full job details including SKU and store info
    const jobDetails = await getJobDetails(job.id)

    if (!jobDetails) {
      throw new Error('Failed to fetch job details')
    }

    if (config.dryRun) {
      // Simulate processing
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const result = {
        ebayItemId: `DRY_RUN_${Date.now()}`,
        listingUrl: `https://www.ebay.com/itm/dry-run-${job.skuId}`,
        actualPrice: jobDetails.sku?.sellPrice || 0,
      }

      await completeJob(job.id, result)

      return {
        jobId: job.id,
        success: true,
        duration: Date.now() - startTime,
        result,
      }
    }

    // Execute the actual job based on type
    let result: ProcessingResult['result']

    switch (job.jobType) {
      case 'create_listing':
        result = await executeCreateListing(jobDetails)
        break
      case 'update_listing':
        result = await executeUpdateListing(jobDetails)
        break
      case 'end_listing':
        result = await executeEndListing(jobDetails)
        break
      case 'relist':
        result = await executeRelist(jobDetails)
        break
      case 'revise_price':
        result = await executeRevisePrice(jobDetails)
        break
      case 'revise_quantity':
        result = await executeReviseQuantity(jobDetails)
        break
      default:
        throw new Error(`Unknown job type: ${job.jobType}`)
    }

    await completeJob(job.id, result)

    return {
      jobId: job.id,
      success: true,
      duration: Date.now() - startTime,
      result,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    const failResult = await failJob(job.id, errorMessage)

    return {
      jobId: job.id,
      success: false,
      duration: Date.now() - startTime,
      error: errorMessage + (failResult.shouldRetry ? ' (will retry)' : ''),
    }
  }
}

/**
 * Get detailed job info including store and SKU data
 */
async function getJobDetails(jobId: string): Promise<{
  job: ListingJob
  store: {
    id: string
    name: string
    credentials?: Record<string, any>
  }
  sku: {
    id: string
    code: string
    title: string
    description?: string
    sellPrice: number
    costPrice: number
    images?: string[]
    category?: string
    condition?: string
    specifics?: Record<string, string>
  }
  assignment: {
    id: string
    ebayItemId?: string
    listingStatus: string
  }
} | null> {
  const { data, error } = await supabase
    .from('listing_jobs')
    .select(`
      *,
      stores (
        id,
        store_name,
        ebay_credentials,
        is_active
      ),
      skus (
        id,
        sku_code,
        title,
        listing_title,
        listing_description,
        sell_price,
        cost_price,
        images,
        ebay_category_id,
        condition,
        item_specifics
      ),
      store_sku_assignments (
        id,
        ebay_item_id,
        listing_status
      )
    `)
    .eq('id', jobId)
    .single()

  if (error || !data) {
    return null
  }

  const row = data as any

  return {
    job: {
      id: row.id,
      assignmentId: row.assignment_id,
      storeId: row.store_id,
      skuId: row.sku_id,
      jobType: row.job_type,
      status: row.status,
      priority: row.priority,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      scheduledFor: row.scheduled_for,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      result: row.result,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    store: {
      id: row.stores.id,
      name: row.stores.store_name,
      credentials: row.stores.ebay_credentials,
    },
    sku: {
      id: row.skus.id,
      code: row.skus.sku_code,
      title: row.skus.listing_title || row.skus.title,
      description: row.skus.listing_description,
      sellPrice: row.skus.sell_price,
      costPrice: row.skus.cost_price,
      images: row.skus.images,
      category: row.skus.ebay_category_id,
      condition: row.skus.condition,
      specifics: row.skus.item_specifics,
    },
    assignment: {
      id: row.store_sku_assignments?.id,
      ebayItemId: row.store_sku_assignments?.ebay_item_id,
      listingStatus: row.store_sku_assignments?.listing_status,
    },
  }
}

/**
 * Execute create listing job
 * This would integrate with Puppeteer/eBay API
 */
async function executeCreateListing(details: NonNullable<Awaited<ReturnType<typeof getJobDetails>>>): Promise<ProcessingResult['result']> {
  // TODO: Integrate with actual eBay listing automation
  // For now, simulate the listing creation

  console.log(`[ListingQueue] Creating listing for SKU ${details.sku.code} on store ${details.store.name}`)

  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000))

  // In production, this would:
  // 1. Use Puppeteer to navigate to eBay
  // 2. Fill out the listing form
  // 3. Submit and capture the item ID
  // OR use eBay Trading API if available

  // For now, return simulated result
  const simulatedItemId = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`

  return {
    ebayItemId: simulatedItemId,
    listingUrl: `https://www.ebay.com/itm/${simulatedItemId}`,
    actualPrice: details.sku.sellPrice,
  }
}

/**
 * Execute update listing job
 */
async function executeUpdateListing(details: NonNullable<Awaited<ReturnType<typeof getJobDetails>>>): Promise<ProcessingResult['result']> {
  console.log(`[ListingQueue] Updating listing ${details.assignment.ebayItemId} for SKU ${details.sku.code}`)

  await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 2000))

  return {
    ebayItemId: details.assignment.ebayItemId,
    actualPrice: details.sku.sellPrice,
  }
}

/**
 * Execute end listing job
 */
async function executeEndListing(details: NonNullable<Awaited<ReturnType<typeof getJobDetails>>>): Promise<ProcessingResult['result']> {
  console.log(`[ListingQueue] Ending listing ${details.assignment.ebayItemId}`)

  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1500))

  // Update assignment status
  await supabase
    .from('store_sku_assignments')
    .update({
      listing_status: 'ended',
      ended_at: new Date().toISOString(),
    })
    .eq('id', details.assignment.id)

  // Decrement store listing count
  await supabase.rpc('decrement_store_listing_count', { store_id: details.store.id })

  return {
    ebayItemId: details.assignment.ebayItemId,
  }
}

/**
 * Execute relist job
 */
async function executeRelist(details: NonNullable<Awaited<ReturnType<typeof getJobDetails>>>): Promise<ProcessingResult['result']> {
  console.log(`[ListingQueue] Relisting SKU ${details.sku.code} on store ${details.store.name}`)

  await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000))

  const newItemId = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`

  return {
    ebayItemId: newItemId,
    listingUrl: `https://www.ebay.com/itm/${newItemId}`,
    actualPrice: details.sku.sellPrice,
  }
}

/**
 * Execute price revision job
 */
async function executeRevisePrice(details: NonNullable<Awaited<ReturnType<typeof getJobDetails>>>): Promise<ProcessingResult['result']> {
  console.log(`[ListingQueue] Revising price for ${details.assignment.ebayItemId} to ${details.sku.sellPrice}`)

  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1500))

  // Update assignment with new price
  await supabase
    .from('store_sku_assignments')
    .update({ actual_price: details.sku.sellPrice })
    .eq('id', details.assignment.id)

  return {
    ebayItemId: details.assignment.ebayItemId,
    actualPrice: details.sku.sellPrice,
  }
}

/**
 * Execute quantity revision job
 */
async function executeReviseQuantity(details: NonNullable<Awaited<ReturnType<typeof getJobDetails>>>): Promise<ProcessingResult['result']> {
  console.log(`[ListingQueue] Revising quantity for ${details.assignment.ebayItemId}`)

  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1500))

  return {
    ebayItemId: details.assignment.ebayItemId,
  }
}

/**
 * Get processor status
 */
export async function getProcessorStatus(): Promise<{
  isHealthy: boolean
  activeJobs: number
  queueDepth: number
  jobStats: Awaited<ReturnType<typeof getJobStats>>
  storeActivity: Record<string, number>
}> {
  const stats = await getJobStats()

  // Get queue depth (pending + queued)
  const { count: queueDepth } = await supabase
    .from('listing_jobs')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'queued'])

  const storeActivity: Record<string, number> = {}
  activeJobsPerStore.forEach((count, storeId) => {
    if (count > 0) {
      storeActivity[storeId] = count
    }
  })

  return {
    isHealthy: stats.failed < stats.completed * 0.1, // Healthy if < 10% failure rate
    activeJobs: stats.processing,
    queueDepth: queueDepth || 0,
    jobStats: stats,
    storeActivity,
  }
}

/**
 * Start continuous processing loop
 */
export function startProcessor(
  config: Partial<ProcessorConfig> = {},
  onBatchComplete?: (result: BatchResult) => void
): { stop: () => void } {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  let isRunning = true

  const processLoop = async () => {
    while (isRunning) {
      try {
        const result = await processBatch(cfg)

        if (onBatchComplete) {
          onBatchComplete(result)
        }

        // Log summary
        if (result.processed > 0) {
          console.log(
            `[ListingQueue] Batch complete: ${result.succeeded}/${result.processed} succeeded in ${result.duration}ms`
          )
        }
      } catch (error) {
        console.error('[ListingQueue] Batch processing error:', error)
      }

      // Wait before next batch
      await new Promise((resolve) => setTimeout(resolve, cfg.processingInterval))
    }
  }

  // Start the loop
  processLoop()

  return {
    stop: () => {
      isRunning = false
    },
  }
}
