import { NextRequest, NextResponse } from 'next/server'
import {
  getUserSubscription,
  hasFeature,
  getLimit,
  getDailyUsage,
  getProfitTargetStatus,
  canPerformAction,
  setUserOverride,
  SUBSCRIPTION_TIERS
} from '@/lib/subscription/tiers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'status'
    const userId = searchParams.get('userId') || 'default-user'

    if (action === 'status') {
      const subscription = await getUserSubscription(userId)
      const usage = await getDailyUsage(userId)

      return NextResponse.json({
        success: true,
        subscription,
        usage,
        limits: subscription?.tier.limits
      })
    }

    if (action === 'profit-target') {
      const status = await getProfitTargetStatus(userId)
      return NextResponse.json({
        success: true,
        status
      })
    }

    if (action === 'tiers') {
      // Return all available tiers (exclude managed_service for public)
      const publicTiers = Object.values(SUBSCRIPTION_TIERS)
        .filter(t => t.id !== 'managed_service')
        .map(t => ({
          id: t.id,
          name: t.name,
          monthlyPrice: t.monthlyPrice,
          targetProfit: t.targetProfit,
          profitMultiplier: t.profitMultiplier,
          features: t.features,
          limits: t.limits
        }))

      return NextResponse.json({
        success: true,
        tiers: publicTiers
      })
    }

    if (action === 'check-feature') {
      const feature = searchParams.get('feature')
      if (!feature) {
        return NextResponse.json({
          success: false,
          error: 'Feature name required'
        }, { status: 400 })
      }

      const hasAccess = await hasFeature(userId, feature as any)
      return NextResponse.json({
        success: true,
        feature,
        hasAccess
      })
    }

    if (action === 'check-limit') {
      const limitType = searchParams.get('limit')
      if (!limitType) {
        return NextResponse.json({
          success: false,
          error: 'Limit type required'
        }, { status: 400 })
      }

      const limit = await getLimit(userId, limitType as any)
      const usage = await getDailyUsage(userId)

      const usageMap: Record<string, number> = {
        maxDailyListings: usage.listingsCreated,
        maxDailyOrders: usage.ordersProcessed,
        maxResearchQueries: usage.researchQueries,
        maxApiCalls: usage.apiCalls
      }

      return NextResponse.json({
        success: true,
        limit,
        currentUsage: usageMap[limitType] || 0,
        remaining: Math.max(0, limit - (usageMap[limitType] || 0))
      })
    }

    if (action === 'can-perform') {
      const actionType = searchParams.get('actionType')
      const count = parseInt(searchParams.get('count') || '1')

      if (!actionType) {
        return NextResponse.json({
          success: false,
          error: 'Action type required'
        }, { status: 400 })
      }

      const result = await canPerformAction(userId, actionType as any, count)
      return NextResponse.json({
        success: true,
        ...result
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Subscription API] Error:', error)
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

    if (action === 'set-override') {
      // Admin only - set feature/limit overrides
      const { overrides } = data

      if (!overrides || typeof overrides !== 'object') {
        return NextResponse.json({
          success: false,
          error: 'Overrides object required'
        }, { status: 400 })
      }

      const success = await setUserOverride(userId, overrides)
      return NextResponse.json({
        success,
        message: success ? 'Overrides applied' : 'Failed to apply overrides'
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Subscription API] POST Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
