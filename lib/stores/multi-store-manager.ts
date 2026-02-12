// OTTO Research Labs - Multi-Store Management System
// Designed for managing 75+ stores under a single managed service account
// Optimized for fleet-wide operations, cross-store analytics, and intelligent load balancing

import { createClient } from '@supabase/supabase-js'
import { calculateStoreHealth, StoreHealthScore, createAllocationPlan } from './health-scoring'
import { batchInsert, batchUpdateByIds } from '../database/batch-operations'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TYPES
// ============================================================================

export interface StoreGroup {
  id: string
  name: string
  description: string
  autodsAccountId: string  // Shared AutoDS account
  userId: string           // Owner (managed service admin)
  storeIds: string[]
  settings: StoreGroupSettings
  createdAt: string
  updatedAt: string
}

export interface StoreGroupSettings {
  // Inventory Settings
  maxSkusPerStore: number
  minSkusPerStore: number
  skuRotationEnabled: boolean
  rotationFrequencyDays: number

  // Listing Settings
  maxListingsPerDay: number
  staggerListings: boolean
  staggerIntervalMinutes: number

  // Health Settings
  minHealthScore: number
  autoDisableUnhealthyStores: boolean
  healthCheckFrequencyHours: number

  // Load Balancing
  loadBalancingStrategy: 'even' | 'weighted' | 'capacity' | 'performance'
  rebalanceEnabled: boolean
  rebalanceThresholdPercent: number

  // Compliance
  maxDefectRate: number
  maxLateShipmentRate: number
  complianceCheckEnabled: boolean
}

export interface FleetOverview {
  totalStores: number
  activeStores: number
  pausedStores: number
  disabledStores: number
  healthDistribution: {
    excellent: number
    good: number
    fair: number
    poor: number
    critical: number
  }
  metrics: FleetMetrics
  alerts: FleetAlert[]
}

export interface FleetMetrics {
  totalListings: number
  totalOrders30Days: number
  totalRevenue30Days: number
  totalProfit30Days: number
  avgHealthScore: number
  avgDefectRate: number
  avgLateShipmentRate: number
  avgFeedbackScore: number
  capacityUtilization: number
  topPerformers: Array<{ storeId: string; storeName: string; revenue: number }>
  underperformers: Array<{ storeId: string; storeName: string; issues: string[] }>
}

export interface FleetAlert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  type: string
  message: string
  storeIds: string[]
  createdAt: string
  acknowledged: boolean
}

export interface BulkOperationResult {
  operation: string
  totalStores: number
  successful: number
  failed: number
  results: Array<{
    storeId: string
    success: boolean
    error?: string
  }>
  executedAt: string
}

export interface SkuDistributionPlan {
  skuId: string
  skuTitle: string
  targetStores: Array<{
    storeId: string
    storeName: string
    priority: number
    healthScore: number
    existingListings: number
    projectedUtilization: number
  }>
  unassignedCount: number
}

// ============================================================================
// STORE GROUP MANAGEMENT
// ============================================================================

export async function createStoreGroup(
  name: string,
  autodsAccountId: string,
  userId: string,
  settings?: Partial<StoreGroupSettings>
): Promise<StoreGroup | null> {
  const defaultSettings: StoreGroupSettings = {
    maxSkusPerStore: 1000,
    minSkusPerStore: 100,
    skuRotationEnabled: true,
    rotationFrequencyDays: 14,
    maxListingsPerDay: 50,
    staggerListings: true,
    staggerIntervalMinutes: 5,
    minHealthScore: 50,
    autoDisableUnhealthyStores: true,
    healthCheckFrequencyHours: 6,
    loadBalancingStrategy: 'weighted',
    rebalanceEnabled: true,
    rebalanceThresholdPercent: 20,
    maxDefectRate: 2.0,
    maxLateShipmentRate: 7.0,
    complianceCheckEnabled: true,
    ...settings
  }

  const { data, error } = await supabase
    .from('store_groups')
    .insert({
      name,
      autods_account_id: autodsAccountId,
      user_id: userId,
      settings: defaultSettings,
      store_ids: []
    })
    .select()
    .single()

  if (error) {
    console.error('[MultiStore] Failed to create group:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    autodsAccountId: data.autods_account_id,
    userId: data.user_id,
    storeIds: data.store_ids || [],
    settings: data.settings,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}

export async function addStoresToGroup(
  groupId: string,
  storeIds: string[]
): Promise<boolean> {
  const { data: group, error: fetchError } = await supabase
    .from('store_groups')
    .select('store_ids')
    .eq('id', groupId)
    .single()

  if (fetchError || !group) return false

  const existingIds = group.store_ids || []
  const newIds = [...new Set([...existingIds, ...storeIds])]

  const { error } = await supabase
    .from('store_groups')
    .update({ store_ids: newIds, updated_at: new Date().toISOString() })
    .eq('id', groupId)

  return !error
}

export async function removeStoresFromGroup(
  groupId: string,
  storeIds: string[]
): Promise<boolean> {
  const { data: group, error: fetchError } = await supabase
    .from('store_groups')
    .select('store_ids')
    .eq('id', groupId)
    .single()

  if (fetchError || !group) return false

  const existingIds = group.store_ids || []
  const newIds = existingIds.filter((id: string) => !storeIds.includes(id))

  const { error } = await supabase
    .from('store_groups')
    .update({ store_ids: newIds, updated_at: new Date().toISOString() })
    .eq('id', groupId)

  return !error
}

export async function updateGroupSettings(
  groupId: string,
  settings: Partial<StoreGroupSettings>
): Promise<boolean> {
  const { data: group, error: fetchError } = await supabase
    .from('store_groups')
    .select('settings')
    .eq('id', groupId)
    .single()

  if (fetchError || !group) return false

  const newSettings = { ...group.settings, ...settings }

  const { error } = await supabase
    .from('store_groups')
    .update({ settings: newSettings, updated_at: new Date().toISOString() })
    .eq('id', groupId)

  return !error
}

// ============================================================================
// FLEET OVERVIEW
// ============================================================================

export async function getFleetOverview(
  userId: string,
  groupId?: string
): Promise<FleetOverview> {
  let storeQuery = supabase
    .from('stores')
    .select(`
      id, store_name, is_active, status, health_score, health_status, health_data,
      store_sku_assignments(id, listing_status),
      orders(id, total_amount, profit, order_date)
    `)
    .eq('user_id', userId)

  // If groupId provided, filter to group's stores
  if (groupId) {
    const { data: group } = await supabase
      .from('store_groups')
      .select('store_ids')
      .eq('id', groupId)
      .single()

    if (group?.store_ids?.length > 0) {
      storeQuery = storeQuery.in('id', group.store_ids)
    }
  }

  const { data: stores, error } = await storeQuery

  if (error || !stores) {
    console.error('[MultiStore] Failed to fetch stores:', error)
    return {
      totalStores: 0,
      activeStores: 0,
      pausedStores: 0,
      disabledStores: 0,
      healthDistribution: { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 },
      metrics: {
        totalListings: 0,
        totalOrders30Days: 0,
        totalRevenue30Days: 0,
        totalProfit30Days: 0,
        avgHealthScore: 0,
        avgDefectRate: 0,
        avgLateShipmentRate: 0,
        avgFeedbackScore: 0,
        capacityUtilization: 0,
        topPerformers: [],
        underperformers: []
      },
      alerts: []
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Calculate metrics
  let totalListings = 0
  let totalOrders = 0
  let totalRevenue = 0
  let totalProfit = 0
  let totalHealthScore = 0
  let healthScoreCount = 0
  let totalDefectRate = 0
  let totalLateShipmentRate = 0
  let totalFeedbackScore = 0

  const healthDistribution = { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 }
  const storePerformance: Array<{ storeId: string; storeName: string; revenue: number; issues: string[] }> = []

  for (const store of stores) {
    // Listings
    const activeListings = store.store_sku_assignments?.filter(
      (a: any) => a.listing_status === 'active'
    ).length || 0
    totalListings += activeListings

    // Orders and revenue (last 30 days)
    const recentOrders = store.orders?.filter(
      (o: any) => new Date(o.order_date) >= thirtyDaysAgo
    ) || []
    totalOrders += recentOrders.length
    const storeRevenue = recentOrders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0)
    totalRevenue += storeRevenue
    totalProfit += recentOrders.reduce((sum: number, o: any) => sum + (o.profit || 0), 0)

    // Health distribution
    if (store.health_status) {
      healthDistribution[store.health_status as keyof typeof healthDistribution]++
    }

    // Aggregate health metrics
    if (store.health_score) {
      totalHealthScore += store.health_score
      healthScoreCount++
    }

    const healthData = store.health_data as StoreHealthScore | null
    if (healthData?.factors) {
      totalDefectRate += healthData.factors.defectRate
      totalLateShipmentRate += healthData.factors.lateShipmentRate
      totalFeedbackScore += healthData.factors.feedbackScore
    }

    // Track performance for top/under performers
    const issues: string[] = []
    if (healthData?.factors) {
      if (healthData.factors.defectRate > 2) issues.push('High defect rate')
      if (healthData.factors.lateShipmentRate > 7) issues.push('High late shipment rate')
      if (healthData.factors.feedbackScore < 95) issues.push('Low feedback score')
    }

    storePerformance.push({
      storeId: store.id,
      storeName: store.store_name,
      revenue: storeRevenue,
      issues
    })
  }

  // Sort for top performers and underperformers
  const topPerformers = storePerformance
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(s => ({ storeId: s.storeId, storeName: s.storeName, revenue: s.revenue }))

  const underperformers = storePerformance
    .filter(s => s.issues.length > 0)
    .sort((a, b) => b.issues.length - a.issues.length)
    .slice(0, 10)
    .map(s => ({ storeId: s.storeId, storeName: s.storeName, issues: s.issues }))

  // Get alerts
  const alerts = await getFleetAlerts(userId, groupId)

  return {
    totalStores: stores.length,
    activeStores: stores.filter(s => s.is_active && s.status !== 'paused').length,
    pausedStores: stores.filter(s => s.status === 'paused').length,
    disabledStores: stores.filter(s => !s.is_active).length,
    healthDistribution,
    metrics: {
      totalListings,
      totalOrders30Days: totalOrders,
      totalRevenue30Days: Math.round(totalRevenue * 100) / 100,
      totalProfit30Days: Math.round(totalProfit * 100) / 100,
      avgHealthScore: healthScoreCount > 0 ? Math.round(totalHealthScore / healthScoreCount) : 0,
      avgDefectRate: stores.length > 0 ? Math.round((totalDefectRate / stores.length) * 100) / 100 : 0,
      avgLateShipmentRate: stores.length > 0 ? Math.round((totalLateShipmentRate / stores.length) * 100) / 100 : 0,
      avgFeedbackScore: stores.length > 0 ? Math.round((totalFeedbackScore / stores.length) * 10) / 10 : 0,
      capacityUtilization: 0, // Calculate from max listings
      topPerformers,
      underperformers
    },
    alerts
  }
}

async function getFleetAlerts(userId: string, groupId?: string): Promise<FleetAlert[]> {
  const { data: alerts } = await supabase
    .from('fleet_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('acknowledged', false)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!alerts) return []

  return alerts.map(a => ({
    id: a.id,
    severity: a.severity,
    type: a.type,
    message: a.message,
    storeIds: a.store_ids || [],
    createdAt: a.created_at,
    acknowledged: a.acknowledged
  }))
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export async function bulkUpdateStoreStatus(
  storeIds: string[],
  status: 'active' | 'paused' | 'disabled'
): Promise<BulkOperationResult> {
  const results: BulkOperationResult['results'] = []
  let successful = 0
  let failed = 0

  // Process in batches of 25
  const BATCH_SIZE = 25
  for (let i = 0; i < storeIds.length; i += BATCH_SIZE) {
    const batch = storeIds.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('stores')
      .update({
        is_active: status !== 'disabled',
        status: status,
        updated_at: new Date().toISOString()
      })
      .in('id', batch)

    for (const storeId of batch) {
      if (error) {
        results.push({ storeId, success: false, error: error.message })
        failed++
      } else {
        results.push({ storeId, success: true })
        successful++
      }
    }
  }

  return {
    operation: 'bulkUpdateStoreStatus',
    totalStores: storeIds.length,
    successful,
    failed,
    results,
    executedAt: new Date().toISOString()
  }
}

export async function bulkRecalculateHealth(
  storeIds: string[]
): Promise<BulkOperationResult> {
  const results: BulkOperationResult['results'] = []
  let successful = 0
  let failed = 0

  // Process in parallel batches of 10
  const BATCH_SIZE = 10
  for (let i = 0; i < storeIds.length; i += BATCH_SIZE) {
    const batch = storeIds.slice(i, i + BATCH_SIZE)

    const healthResults = await Promise.all(
      batch.map(async (storeId) => {
        try {
          const health = await calculateStoreHealth(storeId)
          return { storeId, health }
        } catch (err) {
          return { storeId, error: err instanceof Error ? err.message : 'Unknown error' }
        }
      })
    )

    for (const result of healthResults) {
      if ('error' in result) {
        results.push({ storeId: result.storeId, success: false, error: result.error })
        failed++
      } else {
        results.push({ storeId: result.storeId, success: true })
        successful++
      }
    }
  }

  return {
    operation: 'bulkRecalculateHealth',
    totalStores: storeIds.length,
    successful,
    failed,
    results,
    executedAt: new Date().toISOString()
  }
}

export async function bulkAssignSkus(
  skuIds: string[],
  groupId: string,
  strategy: 'even' | 'weighted' | 'capacity' = 'weighted'
): Promise<BulkOperationResult> {
  const results: BulkOperationResult['results'] = []

  // Get group and its stores
  const { data: group } = await supabase
    .from('store_groups')
    .select('store_ids, settings')
    .eq('id', groupId)
    .single()

  if (!group || !group.store_ids?.length) {
    return {
      operation: 'bulkAssignSkus',
      totalStores: 0,
      successful: 0,
      failed: skuIds.length,
      results: skuIds.map(skuId => ({
        storeId: 'none',
        success: false,
        error: 'No stores in group'
      })),
      executedAt: new Date().toISOString()
    }
  }

  // Get health scores for all stores
  const { data: stores } = await supabase
    .from('stores')
    .select('id, store_name, health_score, health_data, store_sku_assignments(id)')
    .in('id', group.store_ids)
    .eq('is_active', true)

  if (!stores || stores.length === 0) {
    return {
      operation: 'bulkAssignSkus',
      totalStores: 0,
      successful: 0,
      failed: skuIds.length,
      results: [],
      executedAt: new Date().toISOString()
    }
  }

  // Create allocation plan based on strategy
  const assignments: Array<{ sku_id: string; store_id: string; listing_status: string }> = []

  if (strategy === 'even') {
    // Distribute evenly
    let storeIndex = 0
    for (const skuId of skuIds) {
      assignments.push({
        sku_id: skuId,
        store_id: stores[storeIndex % stores.length].id,
        listing_status: 'pending'
      })
      storeIndex++
    }
  } else if (strategy === 'weighted' || strategy === 'capacity') {
    // Sort by health score and allocate more to healthier stores
    const sortedStores = [...stores].sort((a, b) =>
      (b.health_score || 0) - (a.health_score || 0)
    )

    // Calculate weights
    const totalHealth = sortedStores.reduce((sum, s) => sum + (s.health_score || 50), 0)
    const storeAllocations = sortedStores.map(store => {
      const weight = (store.health_score || 50) / totalHealth
      return {
        store,
        targetCount: Math.floor(skuIds.length * weight)
      }
    })

    // Assign SKUs
    let skuIndex = 0
    for (const { store, targetCount } of storeAllocations) {
      for (let i = 0; i < targetCount && skuIndex < skuIds.length; i++) {
        assignments.push({
          sku_id: skuIds[skuIndex],
          store_id: store.id,
          listing_status: 'pending'
        })
        skuIndex++
      }
    }

    // Distribute remaining SKUs
    let storeIdx = 0
    while (skuIndex < skuIds.length) {
      assignments.push({
        sku_id: skuIds[skuIndex],
        store_id: sortedStores[storeIdx % sortedStores.length].id,
        listing_status: 'pending'
      })
      skuIndex++
      storeIdx++
    }
  }

  // Batch insert assignments
  try {
    await batchInsert('store_sku_assignments', assignments, {
      chunkSize: 100,
      onConflict: 'store_id,sku_id',
      ignoreDuplicates: true
    })

    // Count per store
    const storesAffected = new Set(assignments.map(a => a.store_id))

    return {
      operation: 'bulkAssignSkus',
      totalStores: storesAffected.size,
      successful: assignments.length,
      failed: 0,
      results: Array.from(storesAffected).map(storeId => ({
        storeId,
        success: true
      })),
      executedAt: new Date().toISOString()
    }
  } catch (err) {
    return {
      operation: 'bulkAssignSkus',
      totalStores: 0,
      successful: 0,
      failed: skuIds.length,
      results: [{
        storeId: 'batch',
        success: false,
        error: err instanceof Error ? err.message : 'Batch insert failed'
      }],
      executedAt: new Date().toISOString()
    }
  }
}

export async function bulkPruneListings(
  storeIds: string[],
  daysWithoutSales: number = 14
): Promise<BulkOperationResult> {
  const results: BulkOperationResult['results'] = []
  let successful = 0
  let failed = 0
  let totalPruned = 0

  const cutoffDate = new Date(Date.now() - daysWithoutSales * 24 * 60 * 60 * 1000)

  for (const storeId of storeIds) {
    try {
      // Find listings without sales
      const { data: assignments } = await supabase
        .from('store_sku_assignments')
        .select(`
          id, sku_id, created_at,
          orders(id)
        `)
        .eq('store_id', storeId)
        .eq('listing_status', 'active')
        .lt('created_at', cutoffDate.toISOString())

      if (!assignments) {
        results.push({ storeId, success: true })
        successful++
        continue
      }

      // Filter to those without orders
      const toPrune = assignments.filter(a =>
        !a.orders || a.orders.length === 0
      )

      if (toPrune.length > 0) {
        // Mark as pruned
        await supabase
          .from('store_sku_assignments')
          .update({ listing_status: 'ended', pruned_at: new Date().toISOString() })
          .in('id', toPrune.map(p => p.id))

        totalPruned += toPrune.length
      }

      results.push({ storeId, success: true })
      successful++
    } catch (err) {
      results.push({
        storeId,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
      failed++
    }
  }

  return {
    operation: `bulkPruneListings (${totalPruned} pruned)`,
    totalStores: storeIds.length,
    successful,
    failed,
    results,
    executedAt: new Date().toISOString()
  }
}

// ============================================================================
// LOAD BALANCING & REBALANCING
// ============================================================================

export interface RebalancePlan {
  currentDistribution: Array<{
    storeId: string
    storeName: string
    listingCount: number
    healthScore: number
    utilizationPercent: number
  }>
  recommendedMoves: Array<{
    skuId: string
    fromStoreId: string
    toStoreId: string
    reason: string
  }>
  projectedDistribution: Array<{
    storeId: string
    listingCount: number
    utilizationPercent: number
  }>
  imbalanceScore: number
  projectedImbalanceScore: number
}

export async function analyzeFleetBalance(
  groupId: string
): Promise<RebalancePlan | null> {
  const { data: group } = await supabase
    .from('store_groups')
    .select('store_ids, settings')
    .eq('id', groupId)
    .single()

  if (!group || !group.store_ids?.length) return null

  // Get store data
  const { data: stores } = await supabase
    .from('stores')
    .select(`
      id, store_name, health_score, max_listings,
      store_sku_assignments(id, sku_id, listing_status)
    `)
    .in('id', group.store_ids)
    .eq('is_active', true)

  if (!stores || stores.length === 0) return null

  // Calculate current distribution
  const currentDistribution = stores.map(store => {
    const activeListings = store.store_sku_assignments?.filter(
      (a: any) => a.listing_status === 'active'
    ).length || 0
    const maxListings = store.max_listings || 1000

    return {
      storeId: store.id,
      storeName: store.store_name,
      listingCount: activeListings,
      healthScore: store.health_score || 50,
      utilizationPercent: Math.round((activeListings / maxListings) * 100)
    }
  })

  // Calculate imbalance score (standard deviation of utilization)
  const avgUtilization = currentDistribution.reduce((sum, s) => sum + s.utilizationPercent, 0) / currentDistribution.length
  const variance = currentDistribution.reduce((sum, s) =>
    sum + Math.pow(s.utilizationPercent - avgUtilization, 2), 0
  ) / currentDistribution.length
  const imbalanceScore = Math.round(Math.sqrt(variance))

  // Generate recommended moves if imbalance is significant
  const recommendedMoves: RebalancePlan['recommendedMoves'] = []
  const threshold = group.settings?.rebalanceThresholdPercent || 20

  if (imbalanceScore > threshold) {
    // Sort stores by utilization
    const sorted = [...currentDistribution].sort((a, b) =>
      b.utilizationPercent - a.utilizationPercent
    )

    const overloaded = sorted.filter(s => s.utilizationPercent > avgUtilization + 15)
    const underloaded = sorted.filter(s => s.utilizationPercent < avgUtilization - 15)

    // For each overloaded store, recommend moving some SKUs to underloaded
    for (const overStore of overloaded) {
      const moveCount = Math.floor((overStore.utilizationPercent - avgUtilization) / 5)

      // Get SKUs from this store (oldest first for rotation)
      const { data: skus } = await supabase
        .from('store_sku_assignments')
        .select('sku_id')
        .eq('store_id', overStore.storeId)
        .eq('listing_status', 'active')
        .order('created_at', { ascending: true })
        .limit(moveCount)

      if (skus) {
        let underIdx = 0
        for (const sku of skus) {
          if (underloaded[underIdx]) {
            recommendedMoves.push({
              skuId: sku.sku_id,
              fromStoreId: overStore.storeId,
              toStoreId: underloaded[underIdx].storeId,
              reason: `Rebalance: ${overStore.storeName} (${overStore.utilizationPercent}%) → ${underloaded[underIdx].storeName} (${underloaded[underIdx].utilizationPercent}%)`
            })
            underIdx = (underIdx + 1) % underloaded.length
          }
        }
      }
    }
  }

  // Calculate projected distribution after moves
  const projectedDistribution = currentDistribution.map(store => {
    const movesOut = recommendedMoves.filter(m => m.fromStoreId === store.storeId).length
    const movesIn = recommendedMoves.filter(m => m.toStoreId === store.storeId).length
    const newCount = store.listingCount - movesOut + movesIn
    const maxListings = 1000 // Default

    return {
      storeId: store.storeId,
      listingCount: newCount,
      utilizationPercent: Math.round((newCount / maxListings) * 100)
    }
  })

  // Calculate projected imbalance
  const projectedAvg = projectedDistribution.reduce((sum, s) => sum + s.utilizationPercent, 0) / projectedDistribution.length
  const projectedVariance = projectedDistribution.reduce((sum, s) =>
    sum + Math.pow(s.utilizationPercent - projectedAvg, 2), 0
  ) / projectedDistribution.length
  const projectedImbalanceScore = Math.round(Math.sqrt(projectedVariance))

  return {
    currentDistribution,
    recommendedMoves,
    projectedDistribution,
    imbalanceScore,
    projectedImbalanceScore
  }
}

export async function executeRebalance(
  plan: RebalancePlan
): Promise<BulkOperationResult> {
  const results: BulkOperationResult['results'] = []
  let successful = 0
  let failed = 0

  for (const move of plan.recommendedMoves) {
    try {
      // End listing on source store
      await supabase
        .from('store_sku_assignments')
        .update({ listing_status: 'rebalanced' })
        .eq('store_id', move.fromStoreId)
        .eq('sku_id', move.skuId)

      // Create assignment on target store
      await supabase
        .from('store_sku_assignments')
        .upsert({
          store_id: move.toStoreId,
          sku_id: move.skuId,
          listing_status: 'pending',
          created_at: new Date().toISOString()
        }, {
          onConflict: 'store_id,sku_id'
        })

      results.push({ storeId: move.toStoreId, success: true })
      successful++
    } catch (err) {
      results.push({
        storeId: move.toStoreId,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
      failed++
    }
  }

  return {
    operation: 'executeRebalance',
    totalStores: new Set([...plan.recommendedMoves.map(m => m.fromStoreId), ...plan.recommendedMoves.map(m => m.toStoreId)]).size,
    successful,
    failed,
    results,
    executedAt: new Date().toISOString()
  }
}

// ============================================================================
// FLEET HEALTH MONITORING
// ============================================================================

export async function runFleetHealthCheck(
  userId: string,
  groupId?: string
): Promise<{
  totalChecked: number
  alerts: FleetAlert[]
  summary: {
    healthy: number
    warning: number
    critical: number
    disabled: number
  }
}> {
  let storeQuery = supabase
    .from('stores')
    .select('id, store_name, health_score, health_data, is_active')
    .eq('user_id', userId)

  if (groupId) {
    const { data: group } = await supabase
      .from('store_groups')
      .select('store_ids, settings')
      .eq('id', groupId)
      .single()

    if (group?.store_ids?.length) {
      storeQuery = storeQuery.in('id', group.store_ids)
    }
  }

  const { data: stores } = await storeQuery

  if (!stores) {
    return {
      totalChecked: 0,
      alerts: [],
      summary: { healthy: 0, warning: 0, critical: 0, disabled: 0 }
    }
  }

  const alerts: FleetAlert[] = []
  const summary = { healthy: 0, warning: 0, critical: 0, disabled: 0 }

  // Check each store
  for (const store of stores) {
    if (!store.is_active) {
      summary.disabled++
      continue
    }

    const health = store.health_data as StoreHealthScore | null
    const factors = health?.factors

    // Classify health
    if (store.health_score >= 70) {
      summary.healthy++
    } else if (store.health_score >= 50) {
      summary.warning++
    } else {
      summary.critical++
    }

    // Generate alerts for issues
    if (factors) {
      if (factors.defectRate > 2.0) {
        alerts.push({
          id: `alert-defect-${store.id}`,
          severity: factors.defectRate > 4.0 ? 'critical' : 'warning',
          type: 'high_defect_rate',
          message: `${store.store_name}: Defect rate ${factors.defectRate}% exceeds threshold`,
          storeIds: [store.id],
          createdAt: new Date().toISOString(),
          acknowledged: false
        })
      }

      if (factors.lateShipmentRate > 7.0) {
        alerts.push({
          id: `alert-late-${store.id}`,
          severity: factors.lateShipmentRate > 10.0 ? 'critical' : 'warning',
          type: 'high_late_shipment',
          message: `${store.store_name}: Late shipment rate ${factors.lateShipmentRate}% exceeds threshold`,
          storeIds: [store.id],
          createdAt: new Date().toISOString(),
          acknowledged: false
        })
      }

      if (factors.feedbackScore < 95) {
        alerts.push({
          id: `alert-feedback-${store.id}`,
          severity: factors.feedbackScore < 90 ? 'critical' : 'warning',
          type: 'low_feedback_score',
          message: `${store.store_name}: Feedback score ${factors.feedbackScore}% needs attention`,
          storeIds: [store.id],
          createdAt: new Date().toISOString(),
          acknowledged: false
        })
      }

      if (factors.policyViolations > 0) {
        alerts.push({
          id: `alert-policy-${store.id}`,
          severity: 'critical',
          type: 'policy_violation',
          message: `${store.store_name}: Has ${factors.policyViolations} policy violation(s)`,
          storeIds: [store.id],
          createdAt: new Date().toISOString(),
          acknowledged: false
        })
      }
    }
  }

  // Store alerts in database
  if (alerts.length > 0) {
    await supabase
      .from('fleet_alerts')
      .upsert(
        alerts.map(a => ({
          id: a.id,
          user_id: userId,
          severity: a.severity,
          type: a.type,
          message: a.message,
          store_ids: a.storeIds,
          created_at: a.createdAt,
          acknowledged: false
        })),
        { onConflict: 'id' }
      )
  }

  return {
    totalChecked: stores.length,
    alerts,
    summary
  }
}

// ============================================================================
// SKU ROTATION
// ============================================================================

export async function rotateSkus(
  groupId: string,
  rotationStrategy: 'performance' | 'age' | 'random' = 'performance'
): Promise<BulkOperationResult> {
  const { data: group } = await supabase
    .from('store_groups')
    .select('store_ids, settings')
    .eq('id', groupId)
    .single()

  if (!group || !group.store_ids?.length) {
    return {
      operation: 'rotateSkus',
      totalStores: 0,
      successful: 0,
      failed: 0,
      results: [],
      executedAt: new Date().toISOString()
    }
  }

  const rotationDays = group.settings?.rotationFrequencyDays || 14
  const cutoffDate = new Date(Date.now() - rotationDays * 24 * 60 * 60 * 1000)

  // Get all assignments older than rotation period
  const { data: oldAssignments } = await supabase
    .from('store_sku_assignments')
    .select(`
      id, sku_id, store_id, created_at,
      orders(id)
    `)
    .in('store_id', group.store_ids)
    .eq('listing_status', 'active')
    .lt('created_at', cutoffDate.toISOString())

  if (!oldAssignments || oldAssignments.length === 0) {
    return {
      operation: 'rotateSkus',
      totalStores: 0,
      successful: 0,
      failed: 0,
      results: [],
      executedAt: new Date().toISOString()
    }
  }

  // Determine which SKUs to rotate based on strategy
  let toRotate = oldAssignments

  if (rotationStrategy === 'performance') {
    // Only rotate poor performers (no sales)
    toRotate = oldAssignments.filter(a => !a.orders || a.orders.length === 0)
  } else if (rotationStrategy === 'random') {
    // Rotate 25% randomly
    const shuffled = [...oldAssignments].sort(() => Math.random() - 0.5)
    toRotate = shuffled.slice(0, Math.floor(shuffled.length * 0.25))
  }

  // Execute rotation
  const rotations: Array<{ oldAssignmentId: string; skuId: string; oldStoreId: string; newStoreId: string }> = []

  // Get healthy stores to rotate to
  const { data: healthyStores } = await supabase
    .from('stores')
    .select('id, health_score')
    .in('id', group.store_ids)
    .eq('is_active', true)
    .gte('health_score', 60)
    .order('health_score', { ascending: false })

  if (!healthyStores || healthyStores.length < 2) {
    return {
      operation: 'rotateSkus',
      totalStores: 0,
      successful: 0,
      failed: 0,
      results: [{ storeId: 'none', success: false, error: 'Not enough healthy stores for rotation' }],
      executedAt: new Date().toISOString()
    }
  }

  // Assign each SKU to a different store
  for (const assignment of toRotate) {
    const eligibleStores = healthyStores.filter(s => s.id !== assignment.store_id)
    if (eligibleStores.length > 0) {
      const newStore = eligibleStores[Math.floor(Math.random() * eligibleStores.length)]
      rotations.push({
        oldAssignmentId: assignment.id,
        skuId: assignment.sku_id,
        oldStoreId: assignment.store_id,
        newStoreId: newStore.id
      })
    }
  }

  // Execute in batches
  let successful = 0
  let failed = 0
  const results: BulkOperationResult['results'] = []

  for (const rotation of rotations) {
    try {
      // End old assignment
      await supabase
        .from('store_sku_assignments')
        .update({ listing_status: 'rotated' })
        .eq('id', rotation.oldAssignmentId)

      // Create new assignment
      await supabase
        .from('store_sku_assignments')
        .insert({
          store_id: rotation.newStoreId,
          sku_id: rotation.skuId,
          listing_status: 'pending'
        })

      successful++
    } catch (err) {
      failed++
      results.push({
        storeId: rotation.newStoreId,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }

  const affectedStores = new Set([...rotations.map(r => r.oldStoreId), ...rotations.map(r => r.newStoreId)])

  return {
    operation: `rotateSkus (${rotations.length} rotated)`,
    totalStores: affectedStores.size,
    successful,
    failed,
    results,
    executedAt: new Date().toISOString()
  }
}

// ============================================================================
// MANAGED SERVICE OPERATIONS
// ============================================================================

export async function initializeManagedServiceAccount(
  userId: string,
  accountName: string,
  targetStoreCount: number = 75
): Promise<{
  groupId: string
  storesNeeded: number
  initializedStores: number
  settings: StoreGroupSettings
} | null> {
  // Create managed service group with optimized settings
  const settings: StoreGroupSettings = {
    maxSkusPerStore: 1500,
    minSkusPerStore: 200,
    skuRotationEnabled: true,
    rotationFrequencyDays: 14,
    maxListingsPerDay: 75,  // Conservative for managed service
    staggerListings: true,
    staggerIntervalMinutes: 3,
    minHealthScore: 55,
    autoDisableUnhealthyStores: true,
    healthCheckFrequencyHours: 4,
    loadBalancingStrategy: 'weighted',
    rebalanceEnabled: true,
    rebalanceThresholdPercent: 15,
    maxDefectRate: 1.5,  // Stricter for managed
    maxLateShipmentRate: 5.0,
    complianceCheckEnabled: true
  }

  const group = await createStoreGroup(
    accountName,
    `autods-${accountName.toLowerCase().replace(/\s+/g, '-')}`,
    userId,
    settings
  )

  if (!group) return null

  // Count existing stores
  const { count } = await supabase
    .from('stores')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  return {
    groupId: group.id,
    storesNeeded: targetStoreCount - (count || 0),
    initializedStores: count || 0,
    settings
  }
}

export async function getManagedServiceDashboard(
  userId: string,
  groupId: string
): Promise<{
  overview: FleetOverview
  rampUpProgress: {
    targetProfitPerStore: number
    currentAvgProfit: number
    storesAtTarget: number
    daysToTarget: number
    trajectory: 'on_track' | 'ahead' | 'behind'
  }
  recommendations: string[]
}> {
  const overview = await getFleetOverview(userId, groupId)

  // Calculate ramp-up progress
  const targetProfitPerStore = 3000  // $3k per store goal
  const currentAvgProfit = overview.totalStores > 0
    ? overview.metrics.totalProfit30Days / overview.totalStores
    : 0

  // Calculate how many stores are at or above target
  const storesAtTarget = Math.floor(currentAvgProfit / targetProfitPerStore * overview.totalStores)

  // Estimate days to target based on current trajectory
  const daysToTarget = currentAvgProfit > 0
    ? Math.ceil((targetProfitPerStore - currentAvgProfit) / (currentAvgProfit / 30))
    : 45

  // Determine trajectory
  let trajectory: 'on_track' | 'ahead' | 'behind'
  if (daysToTarget <= 30) {
    trajectory = 'ahead'
  } else if (daysToTarget <= 45) {
    trajectory = 'on_track'
  } else {
    trajectory = 'behind'
  }

  // Generate recommendations
  const recommendations: string[] = []

  if (overview.metrics.avgHealthScore < 70) {
    recommendations.push('Fleet health needs attention. Focus on improving defect and late shipment rates.')
  }

  if (overview.metrics.capacityUtilization < 50) {
    recommendations.push('Stores have room for more listings. Increase listing pace to maximize capacity.')
  }

  if (overview.metrics.underperformers.length > overview.totalStores * 0.2) {
    recommendations.push('More than 20% of stores are underperforming. Consider pausing lowest performers.')
  }

  if (trajectory === 'behind') {
    recommendations.push('Current trajectory is behind target. Review pricing strategy and SKU selection.')
  }

  if (overview.alerts.filter(a => a.severity === 'critical').length > 0) {
    recommendations.push('Critical alerts require immediate attention to prevent account restrictions.')
  }

  return {
    overview,
    rampUpProgress: {
      targetProfitPerStore,
      currentAvgProfit: Math.round(currentAvgProfit * 100) / 100,
      storesAtTarget,
      daysToTarget,
      trajectory
    },
    recommendations
  }
}
