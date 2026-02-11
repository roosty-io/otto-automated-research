/**
 * Listing Job Manager
 *
 * Manages listing jobs for eBay automation:
 * - Create listing jobs from SKU assignments
 * - Track job progress and status
 * - Handle retries and failures
 * - Coordinate with Puppeteer automation
 */

import { supabase } from '@/lib/supabase'

export type ListingJobStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ListingJobType =
  | 'create_listing'
  | 'update_listing'
  | 'end_listing'
  | 'relist'
  | 'revise_price'
  | 'revise_quantity'

export interface ListingJob {
  id: string
  assignmentId: string
  storeId: string
  skuId: string
  jobType: ListingJobType
  status: ListingJobStatus
  priority: number
  attempts: number
  maxAttempts: number
  lastError?: string
  scheduledFor?: string
  startedAt?: string
  completedAt?: string
  result?: {
    ebayListingId?: string
    ebayItemId?: string
    listingUrl?: string
    actualPrice?: number
  }
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface CreateJobInput {
  assignmentId: string
  storeId: string
  skuId: string
  jobType: ListingJobType
  priority?: number
  scheduledFor?: Date
  metadata?: Record<string, any>
}

export interface JobFilter {
  status?: ListingJobStatus | ListingJobStatus[]
  storeId?: string
  jobType?: ListingJobType
  minPriority?: number
  scheduledBefore?: Date
  limit?: number
}

/**
 * Create a new listing job
 */
export async function createListingJob(input: CreateJobInput): Promise<{
  success: boolean
  job?: ListingJob
  error?: string
}> {
  try {
    // Check if a similar pending job already exists
    const { data: existing } = await supabase
      .from('listing_jobs')
      .select('id')
      .eq('assignment_id', input.assignmentId)
      .eq('job_type', input.jobType)
      .in('status', ['pending', 'queued', 'processing'])
      .single()

    if (existing) {
      return {
        success: false,
        error: 'A similar job is already pending or in progress',
      }
    }

    const { data: job, error } = await supabase
      .from('listing_jobs')
      .insert({
        assignment_id: input.assignmentId,
        store_id: input.storeId,
        sku_id: input.skuId,
        job_type: input.jobType,
        status: 'pending',
        priority: input.priority || 0,
        attempts: 0,
        max_attempts: 3,
        scheduled_for: input.scheduledFor?.toISOString(),
        metadata: input.metadata,
      })
      .select()
      .single()

    if (error || !job) {
      return { success: false, error: error?.message || 'Failed to create job' }
    }

    return {
      success: true,
      job: mapJobFromDb(job),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Create multiple listing jobs in bulk
 */
export async function createBulkListingJobs(
  inputs: CreateJobInput[]
): Promise<{
  success: boolean
  created: number
  failed: number
  errors: string[]
}> {
  const errors: string[] = []
  let created = 0
  let failed = 0

  // Process in batches
  const batchSize = 50
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize)

    const jobRecords = batch.map((input) => ({
      assignment_id: input.assignmentId,
      store_id: input.storeId,
      sku_id: input.skuId,
      job_type: input.jobType,
      status: 'pending',
      priority: input.priority || 0,
      attempts: 0,
      max_attempts: 3,
      scheduled_for: input.scheduledFor?.toISOString(),
      metadata: input.metadata,
    }))

    const { data, error } = await supabase
      .from('listing_jobs')
      .insert(jobRecords)
      .select('id')

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`)
      failed += batch.length
    } else {
      created += data?.length || 0
      failed += batch.length - (data?.length || 0)
    }
  }

  return {
    success: failed === 0,
    created,
    failed,
    errors,
  }
}

/**
 * Get jobs ready for processing
 */
export async function getProcessableJobs(
  filter: JobFilter = {}
): Promise<ListingJob[]> {
  const now = new Date().toISOString()

  let query = supabase
    .from('listing_jobs')
    .select(`
      *,
      stores (store_name, is_active),
      skus (sku_code, title, sell_price)
    `)
    .in('status', ['pending', 'queued'])
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })

  if (filter.storeId) {
    query = query.eq('store_id', filter.storeId)
  }

  if (filter.jobType) {
    query = query.eq('job_type', filter.jobType)
  }

  if (filter.minPriority !== undefined) {
    query = query.gte('priority', filter.minPriority)
  }

  if (filter.limit) {
    query = query.limit(filter.limit)
  }

  const { data: jobs, error } = await query

  if (error || !jobs) {
    console.error('Error fetching processable jobs:', error)
    return []
  }

  // Filter out jobs for inactive stores
  return (jobs as any[])
    .filter((job) => job.stores?.is_active !== false)
    .map(mapJobFromDb)
}

/**
 * Get a single job by ID
 */
export async function getJob(jobId: string): Promise<ListingJob | null> {
  const { data: job, error } = await supabase
    .from('listing_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error || !job) {
    return null
  }

  return mapJobFromDb(job)
}

/**
 * Update job status
 */
export async function updateJobStatus(
  jobId: string,
  status: ListingJobStatus,
  updates?: {
    result?: ListingJob['result']
    lastError?: string
    incrementAttempts?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const updateData: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'processing') {
    updateData.started_at = new Date().toISOString()
  }

  if (status === 'completed' || status === 'failed') {
    updateData.completed_at = new Date().toISOString()
  }

  if (updates?.result) {
    updateData.result = updates.result
  }

  if (updates?.lastError) {
    updateData.last_error = updates.lastError
  }

  const { error } = await supabase
    .from('listing_jobs')
    .update(updateData)
    .eq('id', jobId)

  if (updates?.incrementAttempts) {
    await supabase.rpc('increment_job_attempts', { job_id: jobId })
  }

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Mark job as started (processing)
 */
export async function startJob(jobId: string): Promise<{ success: boolean; error?: string }> {
  // Use atomic update to prevent race conditions
  const { data, error } = await supabase
    .from('listing_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['pending', 'queued'])
    .select('id')
    .single()

  if (error || !data) {
    return {
      success: false,
      error: error?.message || 'Job already being processed or completed',
    }
  }

  return { success: true }
}

/**
 * Complete a job successfully
 */
export async function completeJob(
  jobId: string,
  result: ListingJob['result']
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('listing_jobs')
    .update({
      status: 'completed',
      result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (error) {
    return { success: false, error: error.message }
  }

  // Update the assignment if it's a create_listing job
  const job = await getJob(jobId)
  if (job && job.jobType === 'create_listing' && result?.ebayItemId) {
    await supabase
      .from('store_sku_assignments')
      .update({
        listing_status: 'active',
        ebay_item_id: result.ebayItemId,
        ebay_listing_url: result.listingUrl,
        listed_at: new Date().toISOString(),
        actual_price: result.actualPrice,
      })
      .eq('id', job.assignmentId)

    // Update store listing count
    await supabase.rpc('increment_store_listing_count', { store_id: job.storeId })
  }

  return { success: true }
}

/**
 * Fail a job
 */
export async function failJob(
  jobId: string,
  error: string
): Promise<{ success: boolean; shouldRetry: boolean }> {
  const job = await getJob(jobId)

  if (!job) {
    return { success: false, shouldRetry: false }
  }

  const newAttempts = job.attempts + 1
  const shouldRetry = newAttempts < job.maxAttempts

  const { error: updateError } = await supabase
    .from('listing_jobs')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      attempts: newAttempts,
      last_error: error,
      completed_at: shouldRetry ? null : new Date().toISOString(),
      // Add exponential backoff for retries
      scheduled_for: shouldRetry
        ? new Date(Date.now() + Math.pow(2, newAttempts) * 60000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (updateError) {
    console.error('Error failing job:', updateError)
    return { success: false, shouldRetry: false }
  }

  return { success: true, shouldRetry }
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('listing_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['pending', 'queued'])

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Get job statistics
 */
export async function getJobStats(storeId?: string): Promise<{
  pending: number
  queued: number
  processing: number
  completed: number
  failed: number
  cancelled: number
  avgProcessingTime: number
  successRate: number
}> {
  let query = supabase.from('listing_jobs').select('status, started_at, completed_at')

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: jobs } = await query

  if (!jobs) {
    return {
      pending: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      avgProcessingTime: 0,
      successRate: 0,
    }
  }

  const stats = {
    pending: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  }

  let totalProcessingTime = 0
  let processedCount = 0

  for (const job of jobs as any[]) {
    stats[job.status as keyof typeof stats]++

    if (job.started_at && job.completed_at) {
      const processingTime =
        new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
      totalProcessingTime += processingTime
      processedCount++
    }
  }

  const finishedJobs = stats.completed + stats.failed
  const successRate = finishedJobs > 0 ? (stats.completed / finishedJobs) * 100 : 0
  const avgProcessingTime = processedCount > 0 ? totalProcessingTime / processedCount : 0

  return {
    ...stats,
    avgProcessingTime: Math.round(avgProcessingTime / 1000), // in seconds
    successRate: Math.round(successRate * 10) / 10,
  }
}

/**
 * Get jobs for a specific store
 */
export async function getStoreJobs(
  storeId: string,
  options: { status?: ListingJobStatus[]; limit?: number; offset?: number } = {}
): Promise<{ jobs: ListingJob[]; total: number }> {
  const { status, limit = 50, offset = 0 } = options

  let query = supabase
    .from('listing_jobs')
    .select('*, skus(sku_code, title)', { count: 'exact' })
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status.length > 0) {
    query = query.in('status', status)
  }

  const { data: jobs, error, count } = await query

  if (error || !jobs) {
    return { jobs: [], total: 0 }
  }

  return {
    jobs: (jobs as any[]).map(mapJobFromDb),
    total: count || 0,
  }
}

/**
 * Clean up old completed/cancelled jobs
 */
export async function cleanupOldJobs(daysOld: number = 30): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  const { data, error } = await supabase
    .from('listing_jobs')
    .delete()
    .in('status', ['completed', 'cancelled'])
    .lt('completed_at', cutoffDate.toISOString())
    .select('id')

  if (error) {
    console.error('Error cleaning up old jobs:', error)
    return 0
  }

  return data?.length || 0
}

// Helper to map database row to ListingJob interface
function mapJobFromDb(row: any): ListingJob {
  return {
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
  }
}
