import { NextRequest, NextResponse } from 'next/server'
import { getRateLimitStats, getStoreSize } from '@/lib/middleware/rate-limiter'
import { getCacheStats, getCacheKeys } from '@/lib/middleware/cache'

export const dynamic = 'force-dynamic'

/**
 * GET /api/system/status
 *
 * Get system status including rate limits and cache stats
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all'

    switch (type) {
      case 'rate-limits': {
        const stats = getRateLimitStats()
        return NextResponse.json({
          success: true,
          rateLimits: {
            ...stats,
            storeSize: getStoreSize(),
          },
        })
      }

      case 'cache': {
        const stats = getCacheStats()
        const keys = getCacheKeys()
        return NextResponse.json({
          success: true,
          cache: {
            ...stats,
            keys: keys.slice(0, 100), // Limit keys returned
            totalKeys: keys.length,
          },
        })
      }

      case 'all':
      default: {
        const rateLimitStats = getRateLimitStats()
        const cacheStats = getCacheStats()

        // System metrics
        const systemMetrics = {
          uptime: process.uptime ? Math.floor(process.uptime()) : 0,
          memoryUsage: process.memoryUsage ? {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          } : null,
          nodeVersion: process.version || 'unknown',
          platform: process.platform || 'unknown',
        }

        return NextResponse.json({
          success: true,
          timestamp: new Date().toISOString(),
          system: systemMetrics,
          rateLimits: {
            ...rateLimitStats,
            storeSize: getStoreSize(),
          },
          cache: cacheStats,
        })
      }
    }
  } catch (error) {
    console.error('[System Status API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/system/status
 *
 * Manage system cache and rate limits
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    // Import dynamically to avoid circular dependencies
    const { cacheClear, cacheInvalidatePattern, cacheInvalidateByTags, resetCacheStats } =
      await import('@/lib/middleware/cache')
    const { resetAllLimits, cleanupExpiredEntries } =
      await import('@/lib/middleware/rate-limiter')

    switch (action) {
      case 'clear-cache': {
        cacheClear()
        return NextResponse.json({
          success: true,
          message: 'Cache cleared',
        })
      }

      case 'invalidate-pattern': {
        const { pattern } = body
        if (!pattern) {
          return NextResponse.json(
            { error: 'pattern is required' },
            { status: 400 }
          )
        }
        const count = cacheInvalidatePattern(pattern)
        return NextResponse.json({
          success: true,
          invalidated: count,
        })
      }

      case 'invalidate-tags': {
        const { tags } = body
        if (!tags || !Array.isArray(tags)) {
          return NextResponse.json(
            { error: 'tags array is required' },
            { status: 400 }
          )
        }
        const count = cacheInvalidateByTags(tags)
        return NextResponse.json({
          success: true,
          invalidated: count,
        })
      }

      case 'reset-cache-stats': {
        resetCacheStats()
        return NextResponse.json({
          success: true,
          message: 'Cache stats reset',
        })
      }

      case 'reset-rate-limits': {
        resetAllLimits()
        return NextResponse.json({
          success: true,
          message: 'Rate limits reset',
        })
      }

      case 'cleanup-rate-limits': {
        const cleaned = cleanupExpiredEntries()
        return NextResponse.json({
          success: true,
          cleaned,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[System Status API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
