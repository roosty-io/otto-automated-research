import { NextRequest, NextResponse } from 'next/server'
import {
  assignSkuToStore,
  bulkAssignSkus,
  getEligibleStores,
  getAvailableSkus,
  removeAssignment,
} from '@/lib/listing'

/**
 * POST /api/listing/assign
 *
 * Assign SKU(s) to store(s)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action = 'assign' } = body

    switch (action) {
      case 'assign': {
        // Single SKU assignment
        const { skuId, storeId, priority, autoList } = body

        if (!skuId || !storeId) {
          return NextResponse.json(
            { error: 'skuId and storeId are required' },
            { status: 400 }
          )
        }

        const result = await assignSkuToStore(skuId, storeId, { priority, autoList })

        return NextResponse.json({
          success: result.success,
          assignment: result.success
            ? { id: result.assignmentId, skuId, storeId }
            : undefined,
          error: result.error,
        })
      }

      case 'bulk': {
        // Bulk assignment
        const {
          skuIds,
          storeIds,
          maxPerStore,
          maxPerSku,
          strategy,
        } = body

        const result = await bulkAssignSkus({
          skuIds,
          storeIds,
          maxPerStore,
          maxPerSku,
          strategy,
        })

        return NextResponse.json({
          success: result.success,
          assigned: result.assigned.length,
          failed: result.failed.length,
          totalProcessed: result.totalProcessed,
          details: {
            assigned: result.assigned,
            failed: result.failed,
          },
        })
      }

      case 'remove': {
        // Remove assignment
        const { assignmentId } = body

        if (!assignmentId) {
          return NextResponse.json(
            { error: 'assignmentId is required' },
            { status: 400 }
          )
        }

        const result = await removeAssignment(assignmentId)

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
    console.error('[Listing Assign] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/listing/assign
 *
 * Get eligible stores and available SKUs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'both'
    const tierId = searchParams.get('tierId') || undefined
    const minSlots = searchParams.get('minSlots')
      ? parseInt(searchParams.get('minSlots')!)
      : undefined
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 100

    const response: {
      success: boolean
      stores?: Awaited<ReturnType<typeof getEligibleStores>>
      skus?: Awaited<ReturnType<typeof getAvailableSkus>>
    } = {
      success: true,
    }

    if (type === 'stores' || type === 'both') {
      response.stores = await getEligibleStores({
        tierId,
        minAvailableSlots: minSlots,
      })
    }

    if (type === 'skus' || type === 'both') {
      response.skus = await getAvailableSkus({ limit })
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Listing Assign] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
