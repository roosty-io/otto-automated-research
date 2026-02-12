import { NextRequest, NextResponse } from 'next/server'
import {
  getProfitMetrics,
  getProfitProjection,
  getProfitBreakdown,
  getROIMetrics,
  createProfitGoal,
  checkProfitAlerts
} from '@/lib/analytics/profit-tracker'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'metrics'
    const userId = searchParams.get('userId')
    const storeId = searchParams.get('storeId')
    const period = searchParams.get('period') as any || 'month'

    // TODO: Get userId from auth token in production
    const effectiveUserId = userId || 'default-user'

    if (action === 'metrics') {
      const metrics = await getProfitMetrics(effectiveUserId, period, storeId || undefined)
      return NextResponse.json({
        success: true,
        metrics
      })
    }

    if (action === 'projection') {
      const projection = await getProfitProjection(effectiveUserId)
      return NextResponse.json({
        success: true,
        projection
      })
    }

    if (action === 'breakdown') {
      const breakdown = await getProfitBreakdown(effectiveUserId, period)
      return NextResponse.json({
        success: true,
        breakdown
      })
    }

    if (action === 'roi') {
      const roi = await getROIMetrics(effectiveUserId)
      return NextResponse.json({
        success: true,
        roi
      })
    }

    if (action === 'alerts') {
      const alerts = await checkProfitAlerts(effectiveUserId)
      return NextResponse.json({
        success: true,
        alerts
      })
    }

    if (action === 'dashboard') {
      // Get all data for profit dashboard in one call
      const [metrics, projection, breakdown, roi, alerts] = await Promise.all([
        getProfitMetrics(effectiveUserId, 'month'),
        getProfitProjection(effectiveUserId),
        getProfitBreakdown(effectiveUserId, 'month'),
        getROIMetrics(effectiveUserId),
        checkProfitAlerts(effectiveUserId)
      ])

      return NextResponse.json({
        success: true,
        metrics,
        projection,
        breakdown,
        roi,
        alerts
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Profit API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, userId = 'default-user', ...data } = body

    if (action === 'create-goal') {
      if (!data.targetMonthlyProfit) {
        return NextResponse.json({
          success: false,
          error: 'targetMonthlyProfit is required'
        }, { status: 400 })
      }

      const goal = await createProfitGoal(userId, {
        targetMonthlyProfit: data.targetMonthlyProfit,
        targetMonthlyRevenue: data.targetMonthlyRevenue,
        targetProfitMargin: data.targetProfitMargin,
        storeId: data.storeId
      })

      if (!goal) {
        return NextResponse.json({
          success: false,
          error: 'Failed to create goal'
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        goal
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Profit API] POST Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
