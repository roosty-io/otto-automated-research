// OTTO Research Labs - Centralized Job Scheduler
// Manages scheduled jobs, retries, and job monitoring

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TYPES
// ============================================================================

export interface ScheduledJob {
  id: string
  name: string
  description: string
  endpoint: string
  schedule: string  // Cron expression
  enabled: boolean
  lastRun?: string
  lastStatus?: 'success' | 'failed' | 'running'
  lastDuration?: number
  lastError?: string
  nextRun?: string
  retryCount: number
  maxRetries: number
  timeout: number  // in milliseconds
  config?: Record<string, unknown>
}

export interface JobExecution {
  id: string
  jobId: string
  jobName: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'success' | 'failed' | 'timeout' | 'retrying'
  duration?: number
  result?: Record<string, unknown>
  error?: string
  retryAttempt: number
}

export interface JobStats {
  totalRuns: number
  successCount: number
  failedCount: number
  averageDuration: number
  successRate: number
  lastWeekRuns: Array<{
    date: string
    runs: number
    successes: number
    failures: number
  }>
}

// ============================================================================
// JOB DEFINITIONS
// ============================================================================

export const SCHEDULED_JOBS: Omit<ScheduledJob, 'lastRun' | 'lastStatus' | 'nextRun'>[] = [
  {
    id: 'process-jobs',
    name: 'Process Listing Jobs',
    description: 'Process pending listing jobs and assign SKUs to stores',
    endpoint: '/api/cron/process-jobs',
    schedule: '*/15 * * * *',  // Every 15 minutes
    enabled: true,
    retryCount: 0,
    maxRetries: 3,
    timeout: 120000
  },
  {
    id: 'process-research',
    name: 'Process Research Queue',
    description: 'Process research queue items and validate products',
    endpoint: '/api/cron/process-research',
    schedule: '*/30 * * * *',  // Every 30 minutes
    enabled: true,
    retryCount: 0,
    maxRetries: 3,
    timeout: 300000
  },
  {
    id: 'auto-reprice',
    name: 'Auto Repricing',
    description: 'Update competitor prices and apply repricing rules',
    endpoint: '/api/cron/auto-reprice',
    schedule: '0 */6 * * *',  // Every 6 hours
    enabled: true,
    retryCount: 0,
    maxRetries: 2,
    timeout: 600000
  },
  {
    id: 'autods-sync',
    name: 'AutoDS Sync',
    description: 'Sync listings and sales data from AutoDS',
    endpoint: '/api/cron/autods-sync',
    schedule: '0 * * * *',  // Every hour
    enabled: true,
    retryCount: 0,
    maxRetries: 3,
    timeout: 300000
  },
  {
    id: 'auto-prune',
    name: 'Auto Prune',
    description: 'Remove underperforming listings based on rules',
    endpoint: '/api/cron/auto-prune',
    schedule: '0 2 * * *',  // Daily at 2 AM
    enabled: true,
    retryCount: 0,
    maxRetries: 2,
    timeout: 600000
  },
  {
    id: 'auto-replenishment',
    name: 'Auto Replenishment',
    description: 'Add new listings to stores to meet targets',
    endpoint: '/api/cron/auto-replenishment',
    schedule: '0 4 * * *',  // Daily at 4 AM
    enabled: true,
    retryCount: 0,
    maxRetries: 2,
    timeout: 600000
  },
  {
    id: 'publish-drafts',
    name: 'Publish Drafts',
    description: 'Publish draft listings that are ready',
    endpoint: '/api/cron/publish-drafts',
    schedule: '*/30 * * * *',  // Every 30 minutes
    enabled: true,
    retryCount: 0,
    maxRetries: 3,
    timeout: 300000
  },
  {
    id: 'update-store-health',
    name: 'Update Store Health',
    description: 'Update store health metrics and analytics',
    endpoint: '/api/cron/update-store-health',
    schedule: '0 */3 * * *',  // Every 3 hours
    enabled: true,
    retryCount: 0,
    maxRetries: 3,
    timeout: 180000
  },
  {
    id: 'ebay-orders-sync',
    name: 'eBay Orders Sync',
    description: 'Sync orders from eBay API',
    endpoint: '/api/ebay/orders?action=sync',
    schedule: '*/20 * * * *',  // Every 20 minutes
    enabled: true,
    retryCount: 0,
    maxRetries: 3,
    timeout: 180000
  }
]

// ============================================================================
// JOB EXECUTOR
// ============================================================================

export async function executeJob(
  job: ScheduledJob,
  options: {
    isRetry?: boolean
    retryAttempt?: number
    force?: boolean
  } = {}
): Promise<JobExecution> {
  const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const startedAt = new Date().toISOString()
  const retryAttempt = options.retryAttempt || 0

  // Log job start
  const execution: JobExecution = {
    id: executionId,
    jobId: job.id,
    jobName: job.name,
    startedAt,
    status: 'running',
    retryAttempt
  }

  await logJobExecution(execution)

  try {
    console.log(`[Scheduler] Starting job: ${job.name} (attempt ${retryAttempt + 1})`)

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const cronSecret = process.env.CRON_SECRET

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), job.timeout)

    const response = await fetch(`${baseUrl}${job.endpoint}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'X-Job-Id': job.id,
        'X-Execution-Id': executionId,
        'X-Retry-Attempt': String(retryAttempt)
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    const completedAt = new Date().toISOString()
    const duration = Date.now() - new Date(startedAt).getTime()

    let result: Record<string, unknown> = {}
    try {
      result = await response.json()
    } catch {
      result = { status: response.status, statusText: response.statusText }
    }

    if (response.ok) {
      execution.status = 'success'
      execution.completedAt = completedAt
      execution.duration = duration
      execution.result = result

      await updateJobStatus(job.id, {
        lastRun: startedAt,
        lastStatus: 'success',
        lastDuration: duration,
        lastError: undefined
      })

      console.log(`[Scheduler] Job completed: ${job.name} (${duration}ms)`)
    } else {
      throw new Error(`HTTP ${response.status}: ${result.error || response.statusText}`)
    }
  } catch (error) {
    const completedAt = new Date().toISOString()
    const duration = Date.now() - new Date(startedAt).getTime()
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Check if it's a timeout
    const isTimeout = error instanceof Error && error.name === 'AbortError'

    execution.status = isTimeout ? 'timeout' : 'failed'
    execution.completedAt = completedAt
    execution.duration = duration
    execution.error = isTimeout ? 'Job execution timed out' : errorMessage

    await updateJobStatus(job.id, {
      lastRun: startedAt,
      lastStatus: 'failed',
      lastDuration: duration,
      lastError: execution.error
    })

    console.error(`[Scheduler] Job failed: ${job.name} - ${execution.error}`)

    // Handle retry
    if (retryAttempt < job.maxRetries) {
      execution.status = 'retrying'
      console.log(`[Scheduler] Scheduling retry ${retryAttempt + 1}/${job.maxRetries} for job: ${job.name}`)

      // Exponential backoff: 30s, 60s, 120s
      const retryDelay = Math.min(30000 * Math.pow(2, retryAttempt), 120000)
      setTimeout(() => {
        executeJob(job, {
          isRetry: true,
          retryAttempt: retryAttempt + 1
        })
      }, retryDelay)
    }
  }

  await logJobExecution(execution)
  return execution
}

// ============================================================================
// JOB ORCHESTRATOR
// ============================================================================

export async function runScheduledJobs(options: {
  jobIds?: string[]
  force?: boolean
} = {}): Promise<{
  executed: string[]
  skipped: string[]
  errors: Array<{ jobId: string; error: string }>
}> {
  const { jobIds, force = false } = options
  const results = {
    executed: [] as string[],
    skipped: [] as string[],
    errors: [] as Array<{ jobId: string; error: string }>
  }

  // Get current job statuses
  const jobStatuses = await getJobStatuses()

  for (const jobDef of SCHEDULED_JOBS) {
    // Skip if specific jobs requested and this isn't one
    if (jobIds && !jobIds.includes(jobDef.id)) {
      continue
    }

    // Skip disabled jobs
    if (!jobDef.enabled && !force) {
      results.skipped.push(jobDef.id)
      continue
    }

    const status = jobStatuses[jobDef.id]

    // Skip if job is currently running
    if (status?.lastStatus === 'running') {
      results.skipped.push(jobDef.id)
      continue
    }

    // Check if job should run based on schedule
    if (!force && !shouldJobRun(jobDef.schedule, status?.lastRun)) {
      results.skipped.push(jobDef.id)
      continue
    }

    try {
      const job: ScheduledJob = {
        ...jobDef,
        lastRun: status?.lastRun,
        lastStatus: status?.lastStatus
      }

      await executeJob(job)
      results.executed.push(jobDef.id)
    } catch (error) {
      results.errors.push({
        jobId: jobDef.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return results
}

export async function runSingleJob(jobId: string, force: boolean = false): Promise<JobExecution | null> {
  const jobDef = SCHEDULED_JOBS.find(j => j.id === jobId)
  if (!jobDef) {
    throw new Error(`Job not found: ${jobId}`)
  }

  const jobStatuses = await getJobStatuses()
  const status = jobStatuses[jobId]

  const job: ScheduledJob = {
    ...jobDef,
    lastRun: status?.lastRun,
    lastStatus: status?.lastStatus
  }

  return executeJob(job, { force })
}

// ============================================================================
// SCHEDULE HELPERS
// ============================================================================

function shouldJobRun(schedule: string, lastRun?: string): boolean {
  if (!lastRun) return true

  const now = new Date()
  const last = new Date(lastRun)

  // Parse cron expression (simplified for common patterns)
  const parts = schedule.split(' ')
  const minute = parts[0]
  const hour = parts[1]

  // Every N minutes pattern: */N * * * *
  if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2))
    const minutesSinceLastRun = (now.getTime() - last.getTime()) / 60000
    return minutesSinceLastRun >= interval
  }

  // Every hour pattern: 0 * * * *
  if (minute === '0' && hour === '*') {
    const hoursSinceLastRun = (now.getTime() - last.getTime()) / 3600000
    return hoursSinceLastRun >= 1
  }

  // Every N hours pattern: 0 */N * * *
  if (minute === '0' && hour.startsWith('*/')) {
    const interval = parseInt(hour.slice(2))
    const hoursSinceLastRun = (now.getTime() - last.getTime()) / 3600000
    return hoursSinceLastRun >= interval
  }

  // Daily pattern: 0 H * * *
  if (minute === '0' && !hour.includes('*') && !hour.includes('/')) {
    const hoursSinceLastRun = (now.getTime() - last.getTime()) / 3600000
    return hoursSinceLastRun >= 24
  }

  // Default: run if more than 5 minutes since last run
  const minutesSinceLastRun = (now.getTime() - last.getTime()) / 60000
  return minutesSinceLastRun >= 5
}

export function getNextRunTime(schedule: string): Date {
  const now = new Date()
  const parts = schedule.split(' ')
  const minute = parts[0]
  const hour = parts[1]

  // Every N minutes
  if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2))
    const nextMinute = Math.ceil(now.getMinutes() / interval) * interval
    const next = new Date(now)
    next.setMinutes(nextMinute, 0, 0)
    if (next <= now) next.setMinutes(next.getMinutes() + interval)
    return next
  }

  // Every hour
  if (minute === '0' && hour === '*') {
    const next = new Date(now)
    next.setHours(next.getHours() + 1, 0, 0, 0)
    return next
  }

  // Every N hours
  if (minute === '0' && hour.startsWith('*/')) {
    const interval = parseInt(hour.slice(2))
    const nextHour = Math.ceil(now.getHours() / interval) * interval
    const next = new Date(now)
    next.setHours(nextHour, 0, 0, 0)
    if (next <= now) next.setHours(next.getHours() + interval)
    return next
  }

  // Specific hour daily
  if (minute === '0' && !hour.includes('*')) {
    const targetHour = parseInt(hour)
    const next = new Date(now)
    next.setHours(targetHour, 0, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    return next
  }

  // Default: next 5 minutes
  const next = new Date(now)
  next.setMinutes(now.getMinutes() + 5, 0, 0)
  return next
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function logJobExecution(execution: JobExecution): Promise<void> {
  try {
    await supabase.from('job_executions').upsert({
      id: execution.id,
      job_id: execution.jobId,
      job_name: execution.jobName,
      started_at: execution.startedAt,
      completed_at: execution.completedAt,
      status: execution.status,
      duration: execution.duration,
      result: execution.result,
      error: execution.error,
      retry_attempt: execution.retryAttempt
    }, { onConflict: 'id' })
  } catch (error) {
    console.error('[Scheduler] Failed to log execution:', error)
  }
}

async function updateJobStatus(
  jobId: string,
  status: Partial<ScheduledJob>
): Promise<void> {
  try {
    await supabase.from('scheduled_jobs').upsert({
      id: jobId,
      last_run: status.lastRun,
      last_status: status.lastStatus,
      last_duration: status.lastDuration,
      last_error: status.lastError
    }, { onConflict: 'id' })
  } catch (error) {
    console.error('[Scheduler] Failed to update job status:', error)
  }
}

async function getJobStatuses(): Promise<Record<string, Partial<ScheduledJob>>> {
  try {
    const { data } = await supabase
      .from('scheduled_jobs')
      .select('id, last_run, last_status, last_duration, last_error')

    const statuses: Record<string, Partial<ScheduledJob>> = {}
    for (const row of data || []) {
      statuses[row.id] = {
        lastRun: row.last_run,
        lastStatus: row.last_status,
        lastDuration: row.last_duration,
        lastError: row.last_error
      }
    }
    return statuses
  } catch {
    return {}
  }
}

export async function getJobStats(jobId?: string, days: number = 7): Promise<JobStats | Record<string, JobStats>> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  let query = supabase
    .from('job_executions')
    .select('*')
    .gte('started_at', startDate.toISOString())

  if (jobId) {
    query = query.eq('job_id', jobId)
  }

  const { data } = await query

  if (!data || data.length === 0) {
    const emptyStats: JobStats = {
      totalRuns: 0,
      successCount: 0,
      failedCount: 0,
      averageDuration: 0,
      successRate: 0,
      lastWeekRuns: []
    }
    return jobId ? emptyStats : {}
  }

  const calculateStats = (executions: typeof data): JobStats => {
    const totalRuns = executions.length
    const successCount = executions.filter(e => e.status === 'success').length
    const failedCount = executions.filter(e => ['failed', 'timeout'].includes(e.status)).length
    const durations = executions.filter(e => e.duration).map(e => e.duration!)
    const averageDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0

    // Group by day
    const byDay: Record<string, { runs: number; successes: number; failures: number }> = {}
    for (const exec of executions) {
      const day = exec.started_at.split('T')[0]
      if (!byDay[day]) {
        byDay[day] = { runs: 0, successes: 0, failures: 0 }
      }
      byDay[day].runs++
      if (exec.status === 'success') byDay[day].successes++
      if (['failed', 'timeout'].includes(exec.status)) byDay[day].failures++
    }

    return {
      totalRuns,
      successCount,
      failedCount,
      averageDuration,
      successRate: totalRuns > 0 ? (successCount / totalRuns) * 100 : 0,
      lastWeekRuns: Object.entries(byDay)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, stats]) => ({ date, ...stats }))
    }
  }

  if (jobId) {
    return calculateStats(data)
  }

  // Group by job
  const byJob: Record<string, typeof data> = {}
  for (const exec of data) {
    if (!byJob[exec.job_id]) {
      byJob[exec.job_id] = []
    }
    byJob[exec.job_id].push(exec)
  }

  const result: Record<string, JobStats> = {}
  for (const [id, executions] of Object.entries(byJob)) {
    result[id] = calculateStats(executions)
  }

  return result
}

// ============================================================================
// EXPORTS
// ============================================================================

export { SCHEDULED_JOBS as jobs }
