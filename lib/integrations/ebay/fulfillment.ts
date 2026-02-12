/**
 * eBay Fulfillment API
 *
 * Manages orders and shipping:
 * - Get orders
 * - Update shipping status
 * - Handle refunds
 */

import { EbayClient, getEbayClient } from './client'

export interface EbayOrder {
  orderId: string
  legacyOrderId: string
  creationDate: string
  lastModifiedDate: string
  orderFulfillmentStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FULFILLED'
  orderPaymentStatus: 'PENDING' | 'FAILED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'FULLY_REFUNDED'
  sellerId: string
  buyer: {
    username: string
    taxAddress?: {
      city: string
      stateOrProvince: string
      postalCode: string
      countryCode: string
    }
  }
  pricingSummary: {
    priceSubtotal: { value: string; currency: string }
    deliveryCost: { value: string; currency: string }
    total: { value: string; currency: string }
  }
  fulfillmentStartInstructions: Array<{
    fulfillmentInstructionsType: string
    shippingStep: {
      shipTo: {
        fullName: string
        contactAddress: {
          addressLine1: string
          addressLine2?: string
          city: string
          stateOrProvince: string
          postalCode: string
          countryCode: string
        }
        primaryPhone?: { phoneNumber: string }
        email?: string
      }
      shippingServiceCode: string
    }
  }>
  lineItems: Array<{
    lineItemId: string
    legacyItemId: string
    sku: string
    title: string
    quantity: number
    lineItemCost: { value: string; currency: string }
    lineItemFulfillmentStatus: string
    deliveryCost: { value: string; currency: string }
  }>
  salesRecordReference?: string
  totalFeeBasisAmount?: { value: string; currency: string }
  totalMarketplaceFee?: { value: string; currency: string }
}

export interface ShipmentInfo {
  orderId: string
  lineItemIds: string[]
  shippingCarrierCode: string
  trackingNumber: string
  shippedDate?: string
}

export interface OrderSearchParams {
  filter?: string
  limit?: number
  offset?: number
  orderIds?: string[]
}

export class EbayFulfillmentManager {
  private client: EbayClient

  constructor(storeId: string) {
    this.client = getEbayClient(storeId)
  }

  /**
   * Get orders with optional filtering
   */
  async getOrders(params: OrderSearchParams = {}): Promise<{
    orders: EbayOrder[]
    total: number
    hasMore: boolean
  }> {
    const { filter, limit = 50, offset = 0, orderIds } = params

    const queryParams: Record<string, string> = {
      limit: limit.toString(),
      offset: offset.toString(),
    }

    if (filter) {
      queryParams.filter = filter
    }

    if (orderIds && orderIds.length > 0) {
      queryParams.orderIds = orderIds.join(',')
    }

    const response = await this.client.get<{
      orders: EbayOrder[]
      total: number
      next?: string
    }>('/sell/fulfillment/v1/order', queryParams)

    if (!response.success) {
      return { orders: [], total: 0, hasMore: false }
    }

    return {
      orders: response.data?.orders || [],
      total: response.data?.total || 0,
      hasMore: !!response.data?.next,
    }
  }

  /**
   * Get orders from the last N days
   */
  async getRecentOrders(days: number = 7): Promise<EbayOrder[]> {
    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - days)
    const filter = `creationdate:[${dateFrom.toISOString()}]`

    const { orders } = await this.getOrders({ filter, limit: 200 })
    return orders
  }

  /**
   * Get a single order by ID
   */
  async getOrder(orderId: string): Promise<EbayOrder | null> {
    const response = await this.client.get<EbayOrder>(
      `/sell/fulfillment/v1/order/${orderId}`
    )

    return response.success ? response.data! : null
  }

  /**
   * Get orders awaiting shipment
   */
  async getAwaitingShipment(): Promise<EbayOrder[]> {
    const filter = 'orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}'
    const { orders } = await this.getOrders({ filter, limit: 200 })
    return orders
  }

  /**
   * Mark order as shipped
   */
  async shipOrder(shipment: ShipmentInfo): Promise<boolean> {
    const response = await this.client.post<void>(
      `/sell/fulfillment/v1/order/${shipment.orderId}/shipping_fulfillment`,
      {
        lineItems: shipment.lineItemIds.map(id => ({ lineItemId: id, quantity: 1 })),
        shippingCarrierCode: shipment.shippingCarrierCode,
        trackingNumber: shipment.trackingNumber,
        shippedDate: shipment.shippedDate || new Date().toISOString(),
      }
    )

    return response.success
  }

  /**
   * Get shipping fulfillments for an order
   */
  async getShippingFulfillments(orderId: string): Promise<Array<{
    fulfillmentId: string
    shipmentTrackingNumber: string
    shippingCarrierCode: string
    shippedDate: string
  }>> {
    const response = await this.client.get<{
      fulfillments: Array<{
        fulfillmentId: string
        shipmentTrackingNumber: string
        shippingCarrierCode: string
        shippedDate: string
      }>
    }>(`/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`)

    return response.success ? response.data?.fulfillments || [] : []
  }

  /**
   * Issue a refund
   */
  async issueRefund(
    orderId: string,
    reasonForRefund: string,
    amount: { value: string; currency: string },
    comment?: string
  ): Promise<{ refundId?: string; success: boolean; error?: string }> {
    const response = await this.client.post<{ refundId: string }>(
      `/sell/fulfillment/v1/order/${orderId}/issue_refund`,
      {
        reasonForRefund,
        orderLevelRefundAmount: amount,
        comment,
      }
    )

    if (!response.success) {
      return {
        success: false,
        error: response.errors?.[0]?.message || 'Failed to issue refund',
      }
    }

    return {
      success: true,
      refundId: response.data?.refundId,
    }
  }

  /**
   * Sync orders to database
   */
  async syncOrdersToDatabase(days: number = 30): Promise<{
    synced: number
    errors: number
  }> {
    const { supabase } = await import('@/lib/supabase')
    const orders = await this.getRecentOrders(days)

    let synced = 0
    let errors = 0

    for (const order of orders) {
      try {
        // Extract key order data
        const orderData = {
          ebay_order_id: order.orderId,
          legacy_order_id: order.legacyOrderId,
          order_status: order.orderFulfillmentStatus,
          payment_status: order.orderPaymentStatus,
          buyer_username: order.buyer.username,
          total_amount: parseFloat(order.pricingSummary.total.value),
          shipping_cost: parseFloat(order.pricingSummary.deliveryCost.value),
          marketplace_fee: order.totalMarketplaceFee
            ? parseFloat(order.totalMarketplaceFee.value)
            : null,
          order_date: order.creationDate,
          line_items: order.lineItems.map(item => ({
            lineItemId: item.lineItemId,
            sku: item.sku,
            title: item.title,
            quantity: item.quantity,
            price: parseFloat(item.lineItemCost.value),
          })),
          shipping_address: order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo,
          updated_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('ebay_orders')
          .upsert(orderData, { onConflict: 'ebay_order_id' })

        if (error) {
          console.error('[eBay Fulfillment] Order sync error:', error)
          errors++
        } else {
          synced++
        }
      } catch (error) {
        console.error('[eBay Fulfillment] Order processing error:', error)
        errors++
      }
    }

    return { synced, errors }
  }
}

/**
 * Get fulfillment manager for a store
 */
export function getFulfillmentManager(storeId: string): EbayFulfillmentManager {
  return new EbayFulfillmentManager(storeId)
}

/**
 * Common shipping carrier codes
 */
export const SHIPPING_CARRIERS = {
  USPS: 'USPS',
  UPS: 'UPS',
  FEDEX: 'FedEx',
  DHL: 'DHL',
  AMAZON_LOGISTICS: 'Amazon Shipping',
  ONTRAC: 'OnTrac',
  LASERSHIP: 'LaserShip',
} as const
