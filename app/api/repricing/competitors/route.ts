import { NextRequest, NextResponse } from 'next/server'
import {
  runCompetitorMonitoring,
  getCompetitorAnalysis,
  getMonitoringStats,
  getPriceAlerts,
  scheduleMonitoring,
} from '@/lib/repricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/repricing/competitors
 *
 * Get competitor analysis, monitoring stats, or price alerts
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'stats'
    const storeId = searchParams.get('storeId') || undefined
    const assignmentId = searchParams.get('assignmentId') || undefined

    switch (type) {
      case 'analysis': {
        if (!assignmentId) {
          return NextResponse.json(
            { error: 'assignmentId is required for analysis' },
            { status: 400 }
          )
        }

        const analysis = await getCompetitorAnalysis(assignmentId)

        if (!analysis) {
          return NextResponse.json(
            { error: 'No analysis found for this assignment' },
            { status: 404 }
          )
        }

        return NextResponse.json({
          success: true,
          analysis,
        })
      }

      case 'stats': {
        const daysBack = searchParams.get('daysBack')
          ? parseInt(searchParams.get('daysBack')!)
          : 7

        const stats = await getMonitoringStats({ storeId, daysBack })
        return NextResponse.json({
          success: true,
          stats,
        })
      }

      case 'alerts': {
        const limit = searchParams.get('limit')
          ? parseInt(searchParams.get('limit')!)
          : 50

        const alerts = await getPriceAlerts({ storeId, limit })
        return NextResponse.json({
          success: true,
          alerts,
          total: alerts.length,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Competitor Monitor API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/repricing/competitors
 *
 * Run competitor monitoring or schedule a check
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'run-monitoring': {
        const { storeId, maxListings = 500 } = body

        const result = await runCompetitorMonitoring({
          storeId,
          maxListings,
        })

        return NextResponse.json({
          success: true,
          result,
        })
      }

      case 'schedule': {
        const { assignmentId, priority = 'normal' } = body

        if (!assignmentId) {
          return NextResponse.json(
            { error: 'assignmentId is required' },
            { status: 400 }
          )
        }

        await scheduleMonitoring(assignmentId, priority)

        return NextResponse.json({
          success: true,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Competitor Monitor API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
