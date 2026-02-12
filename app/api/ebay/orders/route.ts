/**
 * eBay Orders API
 *
 * GET /api/ebay/orders?storeId=xxx - Get orders
 * POST /api/ebay/orders/ship - Mark order as shipped
 * POST /api/ebay/orders/sync - Sync orders to database
 */

import { NextRequest, NextResponse } from 'next/server'
import { getFulfillmentManager, type ShipmentInfo } from '@/lib/integrations/ebay'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('storeId')
  const days = parseInt(searchParams.get('days') || '7')
  const status = searchParams.get('status') // 'awaiting' for unshipped

  if (!storeId) {
    return NextResponse.json(
      { success: false, error: 'storeId is required' },
      { status: 400 }
    )
  }

  try {
    const manager = getFulfillmentManager(storeId)

    let orders
    if (status === 'awaiting') {
      orders = await manager.getAwaitingShipment()
    } else {
      orders = await manager.getRecentOrders(days)
    }

    return NextResponse.json({
      success: true,
      orders,
      count: orders.length,
    })
  } catch (error) {
    console.error('[eBay Orders] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get orders' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, storeId, ...data } = body

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId is required' },
        { status: 400 }
      )
    }

    const manager = getFulfillmentManager(storeId)

    switch (action) {
      case 'ship': {
        const { orderId, lineItemIds, trackingNumber, carrier } = data

        if (!orderId || !trackingNumber || !carrier) {
          return NextResponse.json(
            { success: false, error: 'orderId, trackingNumber, and carrier are required' },
            { status: 400 }
          )
        }

        // If no line items specified, get all line items from order
        let itemIds = lineItemIds
        if (!itemIds || itemIds.length === 0) {
          const order = await manager.getOrder(orderId)
          if (!order) {
            return NextResponse.json(
              { success: false, error: 'Order not found' },
              { status: 404 }
            )
          }
          itemIds = order.lineItems.map(item => item.lineItemId)
        }

        const shipment: ShipmentInfo = {
          orderId,
          lineItemIds: itemIds,
          trackingNumber,
          shippingCarrierCode: carrier,
        }

        const success = await manager.shipOrder(shipment)

        return NextResponse.json({
          success,
          message: success ? 'Order marked as shipped' : 'Failed to mark as shipped',
        })
      }

      case 'sync': {
        const days = data.days || 30
        const result = await manager.syncOrdersToDatabase(days)

        return NextResponse.json({
          success: true,
          synced: result.synced,
          errors: result.errors,
        })
      }

      case 'refund': {
        const { orderId, amount, currency, reason, comment } = data

        if (!orderId || !amount || !reason) {
          return NextResponse.json(
            { success: false, error: 'orderId, amount, and reason are required' },
            { status: 400 }
          )
        }

        const result = await manager.issueRefund(
          orderId,
          reason,
          { value: amount.toString(), currency: currency || 'USD' },
          comment
        )

        return NextResponse.json(result)
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[eBay Orders] Action error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process order action' },
      { status: 500 }
    )
  }
}
