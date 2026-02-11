import { NextRequest, NextResponse } from 'next/server'
import {
  getListings,
  getStatusSummary,
  getPerformanceMetrics,
  updateListingStatus,
  bulkUpdateStatus,
  getListingsNeedingAttention,
  getStatusHistory,
} from '@/lib/listing'

/**
 * GET /api/listing/status
 *
 * Get listing status information
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'listings'
    const storeId = searchParams.get('storeId') || undefined
    const assignmentId = searchParams.get('assignmentId') || undefined

    switch (type) {
      case 'listings': {
        // Get listings with filters
        const status = searchParams.get('status')
        const search = searchParams.get('search') || undefined
        const sortBy = searchParams.get('sortBy') as any || 'listed_at'
        const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' || 'desc'
        const limit = searchParams.get('limit')
          ? parseInt(searchParams.get('limit')!)
          : 50
        const offset = searchParams.get('offset')
          ? parseInt(searchParams.get('offset')!)
          : 0

        const statuses = status ? status.split(',') as any[] : undefined

        const result = await getListings({
          storeId,
          status: statuses,
          search,
          sortBy,
          sortOrder,
          limit,
          offset,
        })

        return NextResponse.json({
          success: true,
          ...result,
        })
      }

      case 'summary': {
        // Get status summary
        const summary = await getStatusSummary(storeId)

        return NextResponse.json({
          success: true,
          summary,
        })
      }

      case 'metrics': {
        // Get performance metrics
        const daysBack = searchParams.get('daysBack')
          ? parseInt(searchParams.get('daysBack')!)
          : 30

        const metrics = await getPerformanceMetrics({ storeId, daysBack })

        return NextResponse.json({
          success: true,
          metrics,
        })
      }

      case 'attention': {
        // Get listings needing attention
        const attention = await getListingsNeedingAttention(storeId)

        return NextResponse.json({
          success: true,
          attention,
          totals: {
            stale: attention.stale.length,
            underperforming: attention.underperforming.length,
            errors: attention.errors.length,
            outOfStock: attention.outOfStock.length,
          },
        })
      }

      case 'history': {
        // Get status history for a listing
        if (!assignmentId) {
          return NextResponse.json(
            { error: 'assignmentId is required for history' },
            { status: 400 }
          )
        }

        const history = await getStatusHistory(assignmentId)

        return NextResponse.json({
          success: true,
          history,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Listing Status] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/listing/status
 *
 * Update listing statuses
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action = 'update' } = body

    switch (action) {
      case 'update': {
        // Update single listing status
        const { assignmentId, status, reason, note } = body

        if (!assignmentId || !status) {
          return NextResponse.json(
            { error: 'assignmentId and status are required' },
            { status: 400 }
          )
        }

        const validStatuses = ['draft', 'active', 'paused', 'out_of_stock', 'ended', 'pruned', 'error']
        if (!validStatuses.includes(status)) {
          return NextResponse.json(
            { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
            { status: 400 }
          )
        }

        const result = await updateListingStatus(assignmentId, status, { reason, note })

        return NextResponse.json({
          success: result.success,
          error: result.error,
        })
      }

      case 'bulk_update': {
        // Update multiple listings
        const { assignmentIds, status, reason } = body

        if (!assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
          return NextResponse.json(
            { error: 'assignmentIds array is required' },
            { status: 400 }
          )
        }

        if (!status) {
          return NextResponse.json(
            { error: 'status is required' },
            { status: 400 }
          )
        }

        const result = await bulkUpdateStatus(assignmentIds, status, reason)

        return NextResponse.json({
          success: result.success,
          updated: result.updated,
          failed: result.failed,
        })
      }

      case 'pause': {
        // Pause listing(s)
        const { assignmentIds } = body

        if (!assignmentIds || !Array.isArray(assignmentIds)) {
          return NextResponse.json(
            { error: 'assignmentIds array is required' },
            { status: 400 }
          )
        }

        const result = await bulkUpdateStatus(assignmentIds, 'paused', 'Manual pause')

        return NextResponse.json({
          success: result.success,
          paused: result.updated,
          failed: result.failed,
        })
      }

      case 'activate': {
        // Activate listing(s)
        const { assignmentIds } = body

        if (!assignmentIds || !Array.isArray(assignmentIds)) {
          return NextResponse.json(
            { error: 'assignmentIds array is required' },
            { status: 400 }
          )
        }

        const result = await bulkUpdateStatus(assignmentIds, 'active', 'Manual activation')

        return NextResponse.json({
          success: result.success,
          activated: result.updated,
          failed: result.failed,
        })
      }

      case 'end': {
        // End listing(s)
        const { assignmentIds, reason = 'Manual end' } = body

        if (!assignmentIds || !Array.isArray(assignmentIds)) {
          return NextResponse.json(
            { error: 'assignmentIds array is required' },
            { status: 400 }
          )
        }

        const result = await bulkUpdateStatus(assignmentIds, 'ended', reason)

        return NextResponse.json({
          success: result.success,
          ended: result.updated,
          failed: result.failed,
        })
      }

      case 'prune': {
        // Prune underperforming listings
        const { assignmentIds, reason = 'Pruned for underperformance' } = body

        if (!assignmentIds || !Array.isArray(assignmentIds)) {
          return NextResponse.json(
            { error: 'assignmentIds array is required' },
            { status: 400 }
          )
        }

        const result = await bulkUpdateStatus(assignmentIds, 'pruned', reason)

        return NextResponse.json({
          success: result.success,
          pruned: result.updated,
          failed: result.failed,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Listing Status] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
