import { NextResponse } from 'next/server'

/**
 * Test endpoint for verifying pipeline integration
 *
 * GET /api/test/pipeline - Run basic pipeline integration tests
 */
export async function GET() {
  const results: {
    test: string
    status: 'pass' | 'fail' | 'skip'
    message?: string
    duration?: number
  }[] = []

  // Test 1: Import checks
  const startImports = Date.now()
  try {
    const { startResearchPipeline, getPipelineStatus } = await import('@/lib/pipeline')
    const { createJob, getJobStats } = await import('@/lib/jobs')
    const { rateLimiter } = await import('@/lib/automation/rate-limiter')

    results.push({
      test: 'Module imports',
      status: 'pass',
      message: 'All pipeline modules loaded successfully',
      duration: Date.now() - startImports,
    })
  } catch (error) {
    results.push({
      test: 'Module imports',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startImports,
    })
    // Can't continue if imports fail
    return NextResponse.json({ success: false, results })
  }

  // Test 2: Rate limiter functionality
  const startRateLimit = Date.now()
  try {
    const { rateLimiter } = await import('@/lib/automation/rate-limiter')
    const status = await rateLimiter.check('zik', 'search')

    results.push({
      test: 'Rate limiter',
      status: 'pass',
      message: `ZIK search limit: ${status.remaining} remaining, resets at ${status.resetAt.toISOString()}`,
      duration: Date.now() - startRateLimit,
    })
  } catch (error) {
    results.push({
      test: 'Rate limiter',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startRateLimit,
    })
  }

  // Test 3: Job queue functionality
  const startJobQueue = Date.now()
  try {
    const { getJobStats } = await import('@/lib/jobs')
    const stats = await getJobStats()

    results.push({
      test: 'Job queue',
      status: 'pass',
      message: `Queue stats: ${stats.pending} pending, ${stats.processing} processing, ${stats.completed} completed`,
      duration: Date.now() - startJobQueue,
    })
  } catch (error) {
    results.push({
      test: 'Job queue',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startJobQueue,
    })
  }

  // Test 4: Pipeline stats
  const startPipelineStats = Date.now()
  try {
    const { getPipelineStats } = await import('@/lib/pipeline')
    const stats = await getPipelineStats()

    results.push({
      test: 'Pipeline stats',
      status: 'pass',
      message: `Pipelines: ${stats.total} total, ${stats.running} running, ${stats.completed} completed`,
      duration: Date.now() - startPipelineStats,
    })
  } catch (error) {
    results.push({
      test: 'Pipeline stats',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startPipelineStats,
    })
  }

  // Test 5: Keepa client initialization
  const startKeepa = Date.now()
  try {
    const { getKeepaClient } = await import('@/lib/integrations/keepa')
    const keepa = getKeepaClient()

    results.push({
      test: 'Keepa client',
      status: process.env.KEEPA_API_KEY ? 'pass' : 'skip',
      message: process.env.KEEPA_API_KEY
        ? 'Keepa client initialized'
        : 'KEEPA_API_KEY not configured',
      duration: Date.now() - startKeepa,
    })
  } catch (error) {
    results.push({
      test: 'Keepa client',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startKeepa,
    })
  }

  // Test 6: ZIK modules loaded
  const startZik = Date.now()
  try {
    const { searchZikProducts } = await import('@/lib/automation/zik')

    results.push({
      test: 'ZIK automation',
      status: 'pass',
      message: 'ZIK automation modules loaded (credentials needed for live test)',
      duration: Date.now() - startZik,
    })
  } catch (error) {
    results.push({
      test: 'ZIK automation',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startZik,
    })
  }

  // Summary
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length
  const skipped = results.filter((r) => r.status === 'skip').length

  return NextResponse.json({
    success: failed === 0,
    summary: { passed, failed, skipped, total: results.length },
    results,
    totalDuration: results.reduce((sum, r) => sum + (r.duration || 0), 0),
  })
}
