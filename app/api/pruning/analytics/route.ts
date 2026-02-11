import { NextRequest, NextResponse } from 'next/server'
import {
  getPruningMetrics,
  getRulePerformance,
  getPruningTrends,
  getPruningImpact,
  generatePruningReport,
} from '@/lib/pruning'

export const dynamic = 'force-dynamic'

/**
 * GET /api/pruning/analytics
 *
 * Get pruning analytics and reports
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'metrics'
    const storeId = searchParams.get('storeId') || undefined
    const daysBack = searchParams.get('daysBack')
      ? parseInt(searchParams.get('daysBack')!)
      : 30

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    switch (type) {
      case 'metrics': {
        const metrics = await getPruningMetrics({
          storeId,
          startDate,
          endDate,
        })

        return NextResponse.json({
          success: true,
          metrics,
        })
      }

      case 'rules': {
        const rulePerformance = await getRulePerformance({
          storeId,
          daysBack,
        })

        return NextResponse.json({
          success: true,
          rulePerformance,
        })
      }

      case 'trends': {
        const trends = await getPruningTrends({
          storeId,
          daysBack,
        })

        return NextResponse.json({
          success: true,
          trends,
        })
      }

      case 'impact': {
        const impact = await getPruningImpact({
          storeId,
          daysBack,
        })

        return NextResponse.json({
          success: true,
          impact,
        })
      }

      case 'report': {
        const report = await generatePruningReport({
          storeId,
          startDate,
          endDate,
        })

        return NextResponse.json({
          success: true,
          report,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Pruning Analytics] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
