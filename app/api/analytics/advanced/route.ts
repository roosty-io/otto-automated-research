import { NextRequest, NextResponse } from 'next/server'
import {
  getProfitMetrics,
  getPerformanceMetrics,
  getTrendData,
  getStoreRankings,
  getTopSKUs,
  getRevenueForecast,
  getCategoryPerformance,
} from '@/lib/analytics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/advanced
 *
 * Get advanced analytics data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'profit'
    const storeId = searchParams.get('storeId') || undefined
    const period = (searchParams.get('period') || 'month') as any

    switch (type) {
      case 'profit': {
        const metrics = await getProfitMetrics({ storeId, period })
        return NextResponse.json({
          success: true,
          metrics,
        })
      }

      case 'performance': {
        const metrics = await getPerformanceMetrics({ storeId, period })
        return NextResponse.json({
          success: true,
          metrics,
        })
      }

      case 'trends': {
        const granularity = (searchParams.get('granularity') || 'day') as any
        const trends = await getTrendData({ storeId, period, granularity })
        return NextResponse.json({
          success: true,
          trends,
        })
      }

      case 'store-rankings': {
        const sortBy = (searchParams.get('sortBy') || 'revenue') as any
        const limit = parseInt(searchParams.get('limit') || '10')
        const rankings = await getStoreRankings({ period, sortBy, limit })
        return NextResponse.json({
          success: true,
          rankings,
        })
      }

      case 'top-skus': {
        const sortBy = (searchParams.get('sortBy') || 'revenue') as any
        const limit = parseInt(searchParams.get('limit') || '20')
        const skus = await getTopSKUs({ storeId, period, sortBy, limit })
        return NextResponse.json({
          success: true,
          skus,
        })
      }

      case 'forecast': {
        const forecastDays = parseInt(searchParams.get('forecastDays') || '30')
        const forecast = await getRevenueForecast({ storeId, forecastDays })
        return NextResponse.json({
          success: true,
          forecast,
        })
      }

      case 'categories': {
        const categories = await getCategoryPerformance({ storeId, period })
        return NextResponse.json({
          success: true,
          categories,
        })
      }

      case 'dashboard': {
        // Get all key metrics for dashboard
        const [profit, performance, rankings, topSkus, forecast] = await Promise.all([
          getProfitMetrics({ storeId, period }),
          getPerformanceMetrics({ storeId, period }),
          getStoreRankings({ period, limit: 5 }),
          getTopSKUs({ storeId, period, limit: 5 }),
          getRevenueForecast({ storeId, forecastDays: 30 }),
        ])

        return NextResponse.json({
          success: true,
          dashboard: {
            profit,
            performance,
            rankings,
            topSkus,
            forecast,
          },
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Analytics API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
