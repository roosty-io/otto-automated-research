import { NextResponse } from 'next/server'
import { processJobs, getJobStats, cleanupOldJobs, type JobType } from '@/lib/jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

// Job types to process in this cron
const RESEARCH_JOB_TYPES: JobType[] = [
  'zik_research',
  'keepa_research',  // API-based research (no browser required)
  'keepa_lookup',
  'normalize_products',
  'generate_skus',
]

/**
 * GET /api/cron/process-research
 *
 * Process pending research jobs.
 * Called by Vercel cron or manually.
 */
export async function GET(request: Request) {
  // Verify cron secret if configured
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const workerId = `cron-${Date.now()}`

  try {
    console.log('[ProcessResearch] Starting job processing...')

    // Get initial stats
    const statsBefore = await getJobStats()

    // Process jobs
    const { processed, failed } = await processJobs(workerId, {
      types: RESEARCH_JOB_TYPES,
      maxJobs: 20,
      pollInterval: 500,
    })

    // Cleanup old jobs (older than 7 days)
    const cleaned = await cleanupOldJobs(7)

    // Get final stats
    const statsAfter = await getJobStats()

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      processed,
      failed,
      cleaned,
      stats: {
        before: statsBefore,
        after: statsAfter,
      },
    })
  } catch (error) {
    console.error('[ProcessResearch] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${Date.now() - startTime}ms`,
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cron/process-research
 *
 * Manually trigger job processing with options.
 *
 * Body:
 * {
 *   types?: JobType[],
 *   maxJobs?: number
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { types = RESEARCH_JOB_TYPES, maxJobs = 10 } = body

    const workerId = `manual-${Date.now()}`
    const startTime = Date.now()

    const { processed, failed } = await processJobs(workerId, {
      types,
      maxJobs,
      pollInterval: 500,
    })

    return NextResponse.json({
      success: true,
      duration: `${Date.now() - startTime}ms`,
      processed,
      failed,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
