// OTTO Research Labs - Fleet Management API
// Endpoints for managing 75+ stores as a unified fleet

import { NextRequest, NextResponse } from 'next/server'
import {
  createStoreGroup,
  addStoresToGroup,
  removeStoresFromGroup,
  updateGroupSettings,
  getFleetOverview,
  bulkUpdateStoreStatus,
  bulkRecalculateHealth,
  bulkAssignSkus,
  bulkPruneListings,
  analyzeFleetBalance,
  executeRebalance,
  runFleetHealthCheck,
  rotateSkus,
  initializeManagedServiceAccount,
  getManagedServiceDashboard
} from '@/lib/stores/multi-store-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'overview'
    const userId = searchParams.get('userId') || 'managed-service-admin'
    const groupId = searchParams.get('groupId') || undefined

    if (action === 'overview') {
      const overview = await getFleetOverview(userId, groupId)
      return NextResponse.json({
        success: true,
        overview
      })
    }

    if (action === 'balance-analysis') {
      if (!groupId) {
        return NextResponse.json({
          success: false,
          error: 'groupId required for balance analysis'
        }, { status: 400 })
      }

      const plan = await analyzeFleetBalance(groupId)
      return NextResponse.json({
        success: true,
        plan
      })
    }

    if (action === 'health-check') {
      const result = await runFleetHealthCheck(userId, groupId)
      return NextResponse.json({
        success: true,
        result
      })
    }

    if (action === 'managed-dashboard') {
      if (!groupId) {
        return NextResponse.json({
          success: false,
          error: 'groupId required for managed dashboard'
        }, { status: 400 })
      }

      const dashboard = await getManagedServiceDashboard(userId, groupId)
      return NextResponse.json({
        success: true,
        dashboard
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Fleet API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, userId = 'managed-service-admin', ...data } = body

    // Store Group Management
    if (action === 'create-group') {
      const { name, autodsAccountId, settings } = data

      if (!name || !autodsAccountId) {
        return NextResponse.json({
          success: false,
          error: 'name and autodsAccountId required'
        }, { status: 400 })
      }

      const group = await createStoreGroup(name, autodsAccountId, userId, settings)
      return NextResponse.json({
        success: !!group,
        group
      })
    }

    if (action === 'add-stores') {
      const { groupId, storeIds } = data

      if (!groupId || !storeIds?.length) {
        return NextResponse.json({
          success: false,
          error: 'groupId and storeIds required'
        }, { status: 400 })
      }

      const success = await addStoresToGroup(groupId, storeIds)
      return NextResponse.json({ success })
    }

    if (action === 'remove-stores') {
      const { groupId, storeIds } = data

      if (!groupId || !storeIds?.length) {
        return NextResponse.json({
          success: false,
          error: 'groupId and storeIds required'
        }, { status: 400 })
      }

      const success = await removeStoresFromGroup(groupId, storeIds)
      return NextResponse.json({ success })
    }

    if (action === 'update-group-settings') {
      const { groupId, settings } = data

      if (!groupId || !settings) {
        return NextResponse.json({
          success: false,
          error: 'groupId and settings required'
        }, { status: 400 })
      }

      const success = await updateGroupSettings(groupId, settings)
      return NextResponse.json({ success })
    }

    // Bulk Operations
    if (action === 'bulk-status') {
      const { storeIds, status } = data

      if (!storeIds?.length || !status) {
        return NextResponse.json({
          success: false,
          error: 'storeIds and status required'
        }, { status: 400 })
      }

      if (!['active', 'paused', 'disabled'].includes(status)) {
        return NextResponse.json({
          success: false,
          error: 'status must be active, paused, or disabled'
        }, { status: 400 })
      }

      const result = await bulkUpdateStoreStatus(storeIds, status)
      return NextResponse.json({
        success: result.failed === 0,
        result
      })
    }

    if (action === 'bulk-health') {
      const { storeIds } = data

      if (!storeIds?.length) {
        return NextResponse.json({
          success: false,
          error: 'storeIds required'
        }, { status: 400 })
      }

      const result = await bulkRecalculateHealth(storeIds)
      return NextResponse.json({
        success: result.failed === 0,
        result
      })
    }

    if (action === 'bulk-assign-skus') {
      const { skuIds, groupId, strategy } = data

      if (!skuIds?.length || !groupId) {
        return NextResponse.json({
          success: false,
          error: 'skuIds and groupId required'
        }, { status: 400 })
      }

      const result = await bulkAssignSkus(skuIds, groupId, strategy || 'weighted')
      return NextResponse.json({
        success: result.failed === 0,
        result
      })
    }

    if (action === 'bulk-prune') {
      const { storeIds, daysWithoutSales } = data

      if (!storeIds?.length) {
        return NextResponse.json({
          success: false,
          error: 'storeIds required'
        }, { status: 400 })
      }

      const result = await bulkPruneListings(storeIds, daysWithoutSales || 14)
      return NextResponse.json({
        success: result.failed === 0,
        result
      })
    }

    // Load Balancing
    if (action === 'execute-rebalance') {
      const { plan } = data

      if (!plan) {
        return NextResponse.json({
          success: false,
          error: 'plan required'
        }, { status: 400 })
      }

      const result = await executeRebalance(plan)
      return NextResponse.json({
        success: result.failed === 0,
        result
      })
    }

    // SKU Rotation
    if (action === 'rotate-skus') {
      const { groupId, strategy } = data

      if (!groupId) {
        return NextResponse.json({
          success: false,
          error: 'groupId required'
        }, { status: 400 })
      }

      const result = await rotateSkus(groupId, strategy || 'performance')
      return NextResponse.json({
        success: result.failed === 0,
        result
      })
    }

    // Managed Service Setup
    if (action === 'init-managed-service') {
      const { accountName, targetStoreCount } = data

      if (!accountName) {
        return NextResponse.json({
          success: false,
          error: 'accountName required'
        }, { status: 400 })
      }

      const result = await initializeManagedServiceAccount(
        userId,
        accountName,
        targetStoreCount || 75
      )

      return NextResponse.json({
        success: !!result,
        result
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Fleet API] POST Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
