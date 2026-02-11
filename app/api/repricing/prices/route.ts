import { NextRequest, NextResponse } from 'next/server'
import {
  getPriceHistory,
  setManualPrice,
  rollbackPriceChange,
  getPendingPriceChanges,
  applyPendingPriceChange,
  rejectPendingPriceChange,
} from '@/lib/repricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/repricing/prices
 *
 * Get price history or pending price changes
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'history'
    const assignmentId = searchParams.get('assignmentId') || undefined
    const storeId = searchParams.get('storeId') || undefined

    switch (type) {
      case 'history': {
        if (!assignmentId) {
          return NextResponse.json(
            { error: 'assignmentId is required for history' },
            { status: 400 }
          )
        }

        const limit = searchParams.get('limit')
          ? parseInt(searchParams.get('limit')!)
          : 50

        const history = await getPriceHistory(assignmentId, limit)
        return NextResponse.json({
          success: true,
          history,
          total: history.length,
        })
      }

      case 'pending': {
        const limit = searchParams.get('limit')
          ? parseInt(searchParams.get('limit')!)
          : 50

        const pending = await getPendingPriceChanges({ storeId, limit })
        return NextResponse.json({
          success: true,
          pending,
          total: pending.length,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Repricing Prices API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/repricing/prices
 *
 * Set manual price, rollback, or handle pending changes
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'set-price': {
        const { assignmentId, price, reason } = body

        if (!assignmentId) {
          return NextResponse.json(
            { error: 'assignmentId is required' },
            { status: 400 }
          )
        }

        if (typeof price !== 'number' || price <= 0) {
          return NextResponse.json(
            { error: 'price must be a positive number' },
            { status: 400 }
          )
        }

        const result = await setManualPrice(assignmentId, price, reason)
        return NextResponse.json({
          success: result.success,
          error: result.error,
        })
      }

      case 'rollback': {
        const { assignmentId, priceLogId } = body

        if (!assignmentId) {
          return NextResponse.json(
            { error: 'assignmentId is required' },
            { status: 400 }
          )
        }

        const result = await rollbackPriceChange(assignmentId, priceLogId)
        return NextResponse.json({
          success: result.success,
          error: result.error,
        })
      }

      case 'approve-pending': {
        const { changeId } = body

        if (!changeId) {
          return NextResponse.json(
            { error: 'changeId is required' },
            { status: 400 }
          )
        }

        const result = await applyPendingPriceChange(changeId)
        return NextResponse.json({
          success: result.success,
          error: result.error,
        })
      }

      case 'reject-pending': {
        const { changeId, reason } = body

        if (!changeId) {
          return NextResponse.json(
            { error: 'changeId is required' },
            { status: 400 }
          )
        }

        const result = await rejectPendingPriceChange(changeId, reason)
        return NextResponse.json({
          success: result.success,
          error: result.error,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Repricing Prices API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
