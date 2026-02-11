import { NextRequest, NextResponse } from 'next/server'
import { runRepricingBatch, runCompetitorMonitoring, getRepricingStats } from '@/lib/repricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/auto-reprice
 *
 * Automated repricing cron job
 * Should be called on a schedule (e.g., every 6 hours)
 *
 * This endpoint:
 * 1. Updates competitor prices for active listings
 * 2. Evaluates all listings against repricing rules
 * 3. Applies price changes (or queues for review)
 * 4. Logs results for analytics
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

    console.log('[Auto-Reprice Cron] Starting automated repricing run...')

    // Step 1: Update competitor prices
    console.log('[Auto-Reprice Cron] Step 1: Updating competitor prices...')
    const monitoringResult = await runCompetitorMonitoring({
      maxListings: 2000,
      prioritizeActive: true,
      minDaysSinceCheck: 1,
    })

    console.log(
      `[Auto-Reprice Cron] Competitor monitoring complete: ${monitoringResult.totalChecked} checked, ${monitoringResult.totalUpdated} updated`
    )

    // Step 2: Run repricing batch
    console.log('[Auto-Reprice Cron] Step 2: Running repricing evaluation...')

    // Check if dry run mode
    const dryRun = process.env.REPRICE_DRY_RUN === 'true'

    const repricingResult = await runRepricingBatch({
      dryRun,
      maxListings: 5000,
      autoApplyThreshold: 5, // Auto-apply if price change is within 5%
    })

    console.log(`[Auto-Reprice Cron] Repricing complete in ${repricingResult.duration}ms`)
    console.log(
      `[Auto-Reprice Cron] Evaluated: ${repricingResult.totalEvaluated}, Changed: ${repricingResult.totalChanged}`
    )
    console.log(
      `[Auto-Reprice Cron] Applied: ${repricingResult.totalApplied}, Pending: ${repricingResult.totalPending}`
    )

    if (repricingResult.errors.length > 0) {
      console.error('[Auto-Reprice Cron] Errors:', repricingResult.errors.slice(0, 10))
    }

    // Get updated stats
    const stats = await getRepricingStats({ daysBack: 1 })

    return NextResponse.json({
      success: true,
      dryRun,
      monitoring: {
        totalChecked: monitoringResult.totalChecked,
        totalUpdated: monitoringResult.totalUpdated,
        priceChangesDetected: monitoringResult.priceChangesDetected,
        errorsCount: monitoringResult.totalErrors,
        duration: monitoringResult.duration,
      },
      repricing: {
        totalEvaluated: repricingResult.totalEvaluated,
        totalChanged: repricingResult.totalChanged,
        totalApplied: repricingResult.totalApplied,
        totalPending: repricingResult.totalPending,
        totalSkipped: repricingResult.totalSkipped,
        errorsCount: repricingResult.errors.length,
        duration: repricingResult.duration,
      },
      todayStats: stats,
      executionTime: Date.now() - startTime,
    })
  } catch (error) {
    console.error('[Auto-Reprice Cron] Fatal error:', error)

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
