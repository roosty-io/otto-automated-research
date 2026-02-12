// OTTO Research Labs - Managed Service Admin API
// Admin endpoints for managing the 75+ store proof of concept

import { NextRequest, NextResponse } from 'next/server'
import {
  getManagedServiceMetrics,
  getStoreRampUpProgress,
  getAllStoreRampUpProgress,
  startStoreRampUp,
  advanceRampUpDay,
  pauseStoreRampUp,
  bulkStartRampUp,
  getFinancialProjection
} from '@/lib/admin/managed-service-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'metrics'
    const userId = searchParams.get('userId') || 'managed-service-admin'
    const groupId = searchParams.get('groupId') || undefined
    const storeId = searchParams.get('storeId')

    // Admin auth check would go here in production
    // const isAdmin = await verifyAdminAccess(request)
    // if (!isAdmin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    if (action === 'metrics') {
      const metrics = await getManagedServiceMetrics(userId, groupId)
      return NextResponse.json({
        success: true,
        metrics
      })
    }

    if (action === 'store-progress') {
      if (!storeId) {
        return NextResponse.json({
          success: false,
          error: 'storeId required'
        }, { status: 400 })
      }

      const progress = await getStoreRampUpProgress(storeId)
      return NextResponse.json({
        success: !!progress,
        progress
      })
    }

    if (action === 'all-progress') {
      const progress = await getAllStoreRampUpProgress(userId, groupId)
      return NextResponse.json({
        success: true,
        stores: progress,
        summary: {
          total: progress.length,
          onTrack: progress.filter(p => p.status === 'on_track' || p.status === 'ahead').length,
          behind: progress.filter(p => p.status === 'behind').length,
          completed: progress.filter(p => p.status === 'completed').length
        }
      })
    }

    if (action === 'financial-projection') {
      const projection = await getFinancialProjection(userId, groupId)
      return NextResponse.json({
        success: true,
        projection
      })
    }

    if (action === 'dashboard') {
      // Combined dashboard data
      const [metrics, progress, projection] = await Promise.all([
        getManagedServiceMetrics(userId, groupId),
        getAllStoreRampUpProgress(userId, groupId),
        getFinancialProjection(userId, groupId)
      ])

      return NextResponse.json({
        success: true,
        metrics,
        rampUpProgress: {
          stores: progress,
          summary: {
            total: progress.length,
            onTrack: progress.filter(p => p.status === 'on_track' || p.status === 'ahead').length,
            behind: progress.filter(p => p.status === 'behind').length,
            completed: progress.filter(p => p.status === 'completed').length
          }
        },
        projection
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Admin Managed API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      action,
      adminId = 'admin-user',
      storeId,
      storeIds,
      groupId,
      reason
    } = body

    // Admin auth check would go here in production

    if (action === 'start-ramp-up') {
      if (!storeId) {
        return NextResponse.json({
          success: false,
          error: 'storeId required'
        }, { status: 400 })
      }

      const result = await startStoreRampUp(storeId, adminId)
      return NextResponse.json(result)
    }

    if (action === 'advance-day') {
      if (!storeId) {
        return NextResponse.json({
          success: false,
          error: 'storeId required'
        }, { status: 400 })
      }

      const result = await advanceRampUpDay(storeId, adminId)
      return NextResponse.json(result)
    }

    if (action === 'pause-store') {
      if (!storeId) {
        return NextResponse.json({
          success: false,
          error: 'storeId required'
        }, { status: 400 })
      }

      const result = await pauseStoreRampUp(storeId, adminId, reason || 'Admin paused')
      return NextResponse.json(result)
    }

    if (action === 'bulk-start-ramp-up') {
      if (!storeIds?.length) {
        return NextResponse.json({
          success: false,
          error: 'storeIds required'
        }, { status: 400 })
      }

      const result = await bulkStartRampUp(storeIds, adminId)
      return NextResponse.json({
        success: result.failed === 0,
        ...result
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Admin Managed API] POST Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
