import { NextRequest, NextResponse } from 'next/server'
import { runPruningBatch, getPruningStats } from '@/lib/pruning'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/auto-prune
 *
 * Automated pruning cron job
 * Should be called on a schedule (e.g., daily)
 *
 * This endpoint:
 * 1. Evaluates all active listings against pruning rules
 * 2. Executes prune/pause/review actions
 * 3. Logs results for analytics
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Get auth header for cron job protection
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // In production, validate the cron secret
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Auto-Prune Cron] Starting automated pruning run...')

    // Run pruning for all stores
    // Set dryRun to false for actual execution
    const dryRun = process.env.PRUNE_DRY_RUN === 'true'

    const result = await runPruningBatch({
      dryRun,
      maxListings: 5000, // Process up to 5000 listings per run
      minDaysListed: 7, // Only consider listings at least 7 days old
    })

    console.log(`[Auto-Prune Cron] Completed in ${result.duration}ms`)
    console.log(`[Auto-Prune Cron] Evaluated: ${result.totalEvaluated}, Matched: ${result.totalMatched}`)
    console.log(`[Auto-Prune Cron] Actions - Pruned: ${result.actionsTaken.prune}, Paused: ${result.actionsTaken.pause}, Reviewed: ${result.actionsTaken.review}`)

    if (result.errors.length > 0) {
      console.error('[Auto-Prune Cron] Errors:', result.errors)
    }

    // Get updated stats
    const stats = await getPruningStats({ daysBack: 1 })

    return NextResponse.json({
      success: true,
      dryRun,
      result: {
        totalEvaluated: result.totalEvaluated,
        totalMatched: result.totalMatched,
        actionsTaken: result.actionsTaken,
        errorsCount: result.errors.length,
        duration: result.duration,
      },
      todayStats: stats,
      executionTime: Date.now() - startTime,
    })
  } catch (error) {
    console.error('[Auto-Prune Cron] Fatal error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
