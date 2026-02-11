import { NextResponse } from 'next/server'
import { getSystemHealth, getActivityLogs } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/health
 *
 * Get system health metrics and activity logs
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'health'

    switch (type) {
      case 'health': {
        const health = await getSystemHealth()
        return NextResponse.json({
          success: true,
          health,
          timestamp: new Date().toISOString(),
        })
      }

      case 'activity': {
        const limit = parseInt(searchParams.get('limit') || '100')
        const activityType = searchParams.get('activityType') || undefined

        const logs = await getActivityLogs({ limit, type: activityType })
        return NextResponse.json({
          success: true,
          logs,
          total: logs.length,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Admin Health API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        health: {
          database: { connected: false, latency: -1 },
          tables: { total: 0, totalRows: 0, totalSize: 'N/A' },
          recentActivity: {
            skusAdded24h: 0,
            storesAdded24h: 0,
            jobsProcessed24h: 0,
            priceChanges24h: 0,
          },
        },
      },
      { status: 500 }
    )
  }
}
