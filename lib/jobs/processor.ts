/**
 * Background Job Processor
 *
 * Processes automation jobs from the queue (automation_jobs table).
 * Handles research, uploads, syncs, and other async tasks.
 */

import { supabase } from '@/lib/supabase'
import { rateLimiter } from '@/lib/automation'

export type JobType =
  | 'zik_research'
  | 'keepa_lookup'
  | 'autods_upload'
  | 'autods_publish'
  | 'autods_sync'
  | 'price_update'
  | 'listing_end'
  | 'normalize_products'
  | 'generate_skus'

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface Job {
  id: string
  job_type: JobType
  status: JobStatus
  priority: number
  payload: Record<string, any>
  result?: Record<string, any>
  error_message?: string
  attempts: number
  max_attempts: number
  created_at: string
  started_at?: string
  completed_at?: string
  scheduled_for: string
  locked_until?: string
  locked_by?: string
}

export interface JobResult {
  success: boolean
  data?: any
  error?: string
}

// Job handlers registry
type JobHandler = (job: Job) => Promise<JobResult>
const jobHandlers: Map<JobType, JobHandler> = new Map()

/**
 * Register a job handler
 */
export function registerJobHandler(type: JobType, handler: JobHandler): void {
  jobHandlers.set(type, handler)
}

/**
 * Create a new job
 */
export async function createJob(
  type: JobType,
  payload: Record<string, any>,
  options: {
    priority?: number
    scheduledFor?: Date
    maxAttempts?: number
  } = {}
): Promise<Job | null> {
  const { priority = 0, scheduledFor = new Date(), maxAttempts = 3 } = options

  const { data, error } = await supabase
    .from('automation_jobs')
    .insert({
      job_type: type,
      status: 'pending',
      priority,
      payload,
      max_attempts: maxAttempts,
      scheduled_for: scheduledFor.toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[JobProcessor] Error creating job:', error)
    return null
  }

  return data as Job
}

/**
 * Get next pending job (with locking)
 */
export async function getNextJob(
  workerId: string,
  types?: JobType[]
): Promise<Job | null> {
  const lockDuration = 5 * 60 * 1000 // 5 minutes
  const lockUntil = new Date(Date.now() + lockDuration).toISOString()
  const now = new Date().toISOString()

  // Build query
  let query = supabase
    .from('automation_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)

  if (types && types.length > 0) {
    query = query.in('job_type', types)
  }

  const { data: jobs } = await query

  if (!jobs || jobs.length === 0) {
    return null
  }

  const job = jobs[0]

  // Try to lock the job
  const { data: locked, error } = await supabase
    .from('automation_jobs')
    .update({
      status: 'processing',
      locked_until: lockUntil,
      locked_by: workerId,
      started_at: now,
      attempts: job.attempts + 1,
    })
    .eq('id', job.id)
    .eq('status', 'pending') // Ensure no one else grabbed it
    .select()
    .single()

  if (error || !locked) {
    // Someone else got it, try again
    return null
  }

  return locked as Job
}

/**
 * Complete a job successfully
 */
export async function completeJob(
  jobId: string,
  result: Record<string, any>
): Promise<void> {
  await supabase
    .from('automation_jobs')
    .update({
      status: 'completed',
      result,
      completed_at: new Date().toISOString(),
      locked_until: null,
      locked_by: null,
    })
    .eq('id', jobId)
}

/**
 * Fail a job
 */
export async function failJob(
  jobId: string,
  error: string,
  retry: boolean = true
): Promise<void> {
  // Get current job state
  const { data: job } = await supabase
    .from('automation_jobs')
    .select('attempts, max_attempts')
    .eq('id', jobId)
    .single()

  const shouldRetry = retry && job && job.attempts < job.max_attempts

  await supabase
    .from('automation_jobs')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      error_message: error,
      completed_at: shouldRetry ? null : new Date().toISOString(),
      locked_until: null,
      locked_by: null,
      // Add delay before retry
      scheduled_for: shouldRetry
        ? new Date(Date.now() + Math.pow(2, job!.attempts) * 1000).toISOString()
        : undefined,
    })
    .eq('id', jobId)
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<void> {
  await supabase
    .from('automation_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      locked_until: null,
      locked_by: null,
    })
    .eq('id', jobId)
}

/**
 * Process a single job
 */
export async function processJob(job: Job): Promise<JobResult> {
  const handler = jobHandlers.get(job.job_type)

  if (!handler) {
    return {
      success: false,
      error: `No handler registered for job type: ${job.job_type}`,
    }
  }

  try {
    return await handler(job)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Process jobs in a loop
 */
export async function processJobs(
  workerId: string,
  options: {
    types?: JobType[]
    maxJobs?: number
    pollInterval?: number
  } = {}
): Promise<{ processed: number; failed: number }> {
  const { types, maxJobs = 10, pollInterval = 1000 } = options
  let processed = 0
  let failed = 0

  while (processed + failed < maxJobs) {
    const job = await getNextJob(workerId, types)

    if (!job) {
      // No more jobs, wait and check again
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
      continue
    }

    console.log(`[JobProcessor] Processing job ${job.id} (${job.job_type})`)

    const result = await processJob(job)

    if (result.success) {
      await completeJob(job.id, result.data || {})
      processed++
      console.log(`[JobProcessor] Job ${job.id} completed`)
    } else {
      await failJob(job.id, result.error || 'Unknown error')
      failed++
      console.log(`[JobProcessor] Job ${job.id} failed: ${result.error}`)
    }
  }

  return { processed, failed }
}

/**
 * Get job statistics
 */
export async function getJobStats(): Promise<{
  pending: number
  processing: number
  completed: number
  failed: number
  byType: Record<string, number>
}> {
  const { data: stats } = await supabase
    .from('automation_jobs')
    .select('status, job_type')

  if (!stats) {
    return { pending: 0, processing: 0, completed: 0, failed: 0, byType: {} }
  }

  const result = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    byType: {} as Record<string, number>,
  }

  for (const job of stats) {
    result[job.status as keyof typeof result]++
    result.byType[job.job_type] = (result.byType[job.job_type] || 0) + 1
  }

  return result
}

/**
 * Clean up old completed/failed jobs
 */
export async function cleanupOldJobs(olderThanDays: number = 7): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)

  const { data, error } = await supabase
    .from('automation_jobs')
    .delete()
    .in('status', ['completed', 'failed', 'cancelled'])
    .lt('completed_at', cutoff.toISOString())
    .select('id')

  if (error) {
    console.error('[JobProcessor] Cleanup error:', error)
    return 0
  }

  return data?.length || 0
}

// Export job creation helpers
export const jobs = {
  create: createJob,
  getNext: getNextJob,
  complete: completeJob,
  fail: failJob,
  cancel: cancelJob,
  process: processJobs,
  stats: getJobStats,
  cleanup: cleanupOldJobs,
  registerHandler: registerJobHandler,
}
