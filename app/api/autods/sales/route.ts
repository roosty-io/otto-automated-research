/**
 * AutoDS Sales API
 *
 * GET /api/autods/sales - Get sales analytics and orders
 * POST /api/autods/sales - Sync sales data
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  syncSalesData,
  getSalesAnalytics,
  getRecentOrders,
  getTopSellingProducts,
  getSalesByDateRange,
} from '@/lib/automation/autods'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId') || undefined
    const type = searchParams.get('type') || 'analytics'
    const daysBack = parseInt(searchParams.get('daysBack') || '30')
    const limit = parseInt(searchParams.get('limit') || '20')
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    // Get analytics overview
    if (type === 'analytics') {
      const analytics = await getSalesAnalytics(storeId, daysBack)
      return NextResponse.json({
        success: true,
        analytics,
      })
    }

    // Get recent orders
    if (type === 'orders') {
      const orders = await getRecentOrders(storeId, limit)
      return NextResponse.json({
        success: true,
        orders,
      })
    }

    // Get top selling products
    if (type === 'top-sellers') {
      const products = await getTopSellingProducts(storeId, limit)
      return NextResponse.json({
        success: true,
        products,
      })
    }

    // Get sales by date range
    if (type === 'date-range' && startDate && endDate) {
      const sales = await getSalesByDateRange(
        new Date(startDate),
        new Date(endDate),
        storeId
      )
      return NextResponse.json({
        success: true,
        sales,
      })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid type parameter' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API] AutoDS sales get error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get sales data' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeId, options } = body

    const result = await syncSalesData(storeId, options)

    return NextResponse.json({
      success: result.success,
      synced: result.synced,
      errors: result.errors,
      error: result.error,
    })
  } catch (error) {
    console.error('[API] AutoDS sales sync error:', error)
    return NextResponse.json(
      { success: false, error: 'Sync failed' },
      { status: 500 }
    )
  }
}
