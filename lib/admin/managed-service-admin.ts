// OTTO Research Labs - Managed Service Admin Module
// Comprehensive management for 75+ stores with $3k/store profit target
// Tracks 30-45 day ramp-up, automation, and profitability

import { createClient } from '@supabase/supabase-js'
import { calculateStoreHealth, StoreHealthScore } from '../stores/health-scoring'
import { getFleetOverview } from '../stores/multi-store-manager'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TYPES
// ============================================================================

export interface ManagedServiceMetrics {
  // Financial Summary
  financial: {
    totalRevenue30Days: number
    totalProfit30Days: number
    avgProfitPerStore: number
    projectedMonthlyProfit: number
    storesAtProfitTarget: number
    storesBelowTarget: number
    targetProfitPerStore: number
    revenueGrowthRate: number
    profitMargin: number
  }

  // Ramp-Up Tracking
  rampUp: {
    storesInRampUp: number
    avgRampUpDay: number
    storesCompletedRampUp: number
    onTrackStores: number
    behindScheduleStores: number
    rampUpSuccessRate: number
  }

  // Operational Metrics
  operations: {
    totalListings: number
    activeListings: number
    pendingListings: number
    totalOrders: number
    avgOrderValue: number
    returnRate: number
    listingsAddedToday: number
    ordersProcessedToday: number
  }

  // Compliance Status
  compliance: {
    storesAboveThreshold: number
    avgDefectRate: number
    avgLateShipmentRate: number
    avgFeedbackScore: number
    policyViolations: number
    accountsAtRisk: number
  }

  // Automation Status
  automation: {
    autoListingsEnabled: number
    autoRepricingEnabled: number
    autoPruningEnabled: number
    autoOptimizationEnabled: number
    pendingJobsCount: number
    failedJobsCount: number
  }
}

export interface StoreRampUpProgress {
  storeId: string
  storeName: string
  rampUpDay: number
  startedAt: string
  status: 'on_track' | 'ahead' | 'behind' | 'paused' | 'completed'

  // Current metrics
  currentListings: number
  currentRevenue30Days: number
  currentProfit30Days: number
  currentHealthScore: number

  // Targets for current day
  targetListings: number
  targetRevenue: number
  targetProfit: number

  // Progress percentages
  listingProgress: number  // % of target listings
  revenueProgress: number  // % of target revenue
  profitProgress: number   // % of target profit

  // Projections
  projectedProfitAtDay45: number
  daysToReachTarget: number

  // Issues
  blockers: string[]
}

export interface AdminActionLog {
  id: string
  adminId: string
  action: string
  targetType: 'store' | 'group' | 'fleet' | 'sku' | 'system'
  targetId: string
  details: Record<string, any>
  result: 'success' | 'failed' | 'partial'
  error?: string
  executedAt: string
}

// ============================================================================
// RAMP-UP TARGETS (30-45 day schedule)
// ============================================================================

const RAMP_UP_SCHEDULE = {
  // Days 1-7: Foundation
  1: { listings: 50, dailyOrders: 0, cumulativeRevenue: 0 },
  2: { listings: 100, dailyOrders: 0, cumulativeRevenue: 0 },
  3: { listings: 150, dailyOrders: 1, cumulativeRevenue: 30 },
  4: { listings: 200, dailyOrders: 1, cumulativeRevenue: 60 },
  5: { listings: 250, dailyOrders: 2, cumulativeRevenue: 120 },
  6: { listings: 300, dailyOrders: 3, cumulativeRevenue: 200 },
  7: { listings: 350, dailyOrders: 4, cumulativeRevenue: 300 },

  // Days 8-14: Growth
  8: { listings: 400, dailyOrders: 5, cumulativeRevenue: 450 },
  9: { listings: 450, dailyOrders: 6, cumulativeRevenue: 620 },
  10: { listings: 500, dailyOrders: 7, cumulativeRevenue: 820 },
  11: { listings: 550, dailyOrders: 8, cumulativeRevenue: 1050 },
  12: { listings: 600, dailyOrders: 9, cumulativeRevenue: 1300 },
  13: { listings: 650, dailyOrders: 10, cumulativeRevenue: 1580 },
  14: { listings: 700, dailyOrders: 12, cumulativeRevenue: 1900 },

  // Days 15-21: Acceleration
  15: { listings: 750, dailyOrders: 14, cumulativeRevenue: 2300 },
  16: { listings: 800, dailyOrders: 16, cumulativeRevenue: 2750 },
  17: { listings: 850, dailyOrders: 18, cumulativeRevenue: 3250 },
  18: { listings: 900, dailyOrders: 20, cumulativeRevenue: 3800 },
  19: { listings: 950, dailyOrders: 22, cumulativeRevenue: 4400 },
  20: { listings: 1000, dailyOrders: 24, cumulativeRevenue: 5050 },
  21: { listings: 1050, dailyOrders: 26, cumulativeRevenue: 5750 },

  // Days 22-30: Optimization
  22: { listings: 1100, dailyOrders: 28, cumulativeRevenue: 6500 },
  23: { listings: 1150, dailyOrders: 30, cumulativeRevenue: 7300 },
  24: { listings: 1200, dailyOrders: 32, cumulativeRevenue: 8150 },
  25: { listings: 1250, dailyOrders: 34, cumulativeRevenue: 9050 },
  26: { listings: 1300, dailyOrders: 36, cumulativeRevenue: 10000 },
  27: { listings: 1350, dailyOrders: 38, cumulativeRevenue: 11000 },
  28: { listings: 1400, dailyOrders: 40, cumulativeRevenue: 12050 },
  29: { listings: 1450, dailyOrders: 42, cumulativeRevenue: 13150 },
  30: { listings: 1500, dailyOrders: 44, cumulativeRevenue: 14300 },

  // Days 31-45: Target Achievement
  35: { listings: 1500, dailyOrders: 50, cumulativeRevenue: 18000 },
  40: { listings: 1500, dailyOrders: 55, cumulativeRevenue: 22000 },
  45: { listings: 1500, dailyOrders: 60, cumulativeRevenue: 26000 }  // ~$3k profit at 12% margin
} as Record<number, { listings: number; dailyOrders: number; cumulativeRevenue: number }>

// Helper to interpolate targets for any day
function getTargetsForDay(day: number): { listings: number; dailyOrders: number; cumulativeRevenue: number } {
  if (RAMP_UP_SCHEDULE[day]) {
    return RAMP_UP_SCHEDULE[day]
  }

  // Find surrounding days and interpolate
  const days = Object.keys(RAMP_UP_SCHEDULE).map(Number).sort((a, b) => a - b)
  const lower = days.filter(d => d < day).pop() || 1
  const upper = days.find(d => d > day) || 45

  const lowerTarget = RAMP_UP_SCHEDULE[lower]
  const upperTarget = RAMP_UP_SCHEDULE[upper]

  const ratio = (day - lower) / (upper - lower)

  return {
    listings: Math.round(lowerTarget.listings + (upperTarget.listings - lowerTarget.listings) * ratio),
    dailyOrders: Math.round(lowerTarget.dailyOrders + (upperTarget.dailyOrders - lowerTarget.dailyOrders) * ratio),
    cumulativeRevenue: Math.round(lowerTarget.cumulativeRevenue + (upperTarget.cumulativeRevenue - lowerTarget.cumulativeRevenue) * ratio)
  }
}

// ============================================================================
// CORE METRICS
// ============================================================================

export async function getManagedServiceMetrics(
  userId: string,
  groupId?: string
): Promise<ManagedServiceMetrics> {
  // Get fleet overview
  const fleet = await getFleetOverview(userId, groupId)

  // Get store details for ramp-up tracking
  let storeQuery = supabase
    .from('stores')
    .select(`
      id, store_name, is_active, health_score, health_data,
      ramp_up_day, ramp_up_started_at, auto_optimize_enabled,
      store_sku_assignments(id, listing_status),
      orders(id, total_amount, profit, order_date, status)
    `)
    .eq('user_id', userId)

  if (groupId) {
    const { data: group } = await supabase
      .from('store_groups')
      .select('store_ids')
      .eq('id', groupId)
      .single()

    if (group?.store_ids?.length) {
      storeQuery = storeQuery.in('id', group.store_ids)
    }
  }

  const { data: stores } = await storeQuery

  if (!stores) {
    return getEmptyMetrics()
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Calculate metrics
  let totalRevenue = 0
  let totalProfit = 0
  let storesAtTarget = 0
  let storesBelowTarget = 0
  let storesInRampUp = 0
  let totalRampUpDays = 0
  let storesCompleted = 0
  let onTrack = 0
  let behind = 0
  let totalListings = 0
  let activeListings = 0
  let pendingListings = 0
  let totalOrders = 0
  let totalOrderValue = 0
  let returns = 0
  let listingsToday = 0
  let ordersToday = 0
  let autoOptEnabled = 0
  let totalDefectRate = 0
  let totalLateShipment = 0
  let totalFeedback = 0
  let violations = 0
  let atRisk = 0

  const TARGET_PROFIT = 3000

  for (const store of stores) {
    const assignments = store.store_sku_assignments || []
    const orders = store.orders || []

    // Listings
    const active = assignments.filter((a: any) => a.listing_status === 'active').length
    const pending = assignments.filter((a: any) => a.listing_status === 'pending').length
    totalListings += assignments.length
    activeListings += active
    pendingListings += pending

    // Orders and revenue
    const recentOrders = orders.filter((o: any) =>
      new Date(o.order_date) >= thirtyDaysAgo && o.status !== 'CANCELLED'
    )
    const storeRevenue = recentOrders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0)
    const storeProfit = recentOrders.reduce((sum: number, o: any) => sum + (o.profit || 0), 0)
    totalRevenue += storeRevenue
    totalProfit += storeProfit
    totalOrders += recentOrders.length
    totalOrderValue += storeRevenue
    returns += recentOrders.filter((o: any) => o.status === 'RETURNED').length

    // Today's activity
    const todayOrders = orders.filter((o: any) =>
      new Date(o.order_date) >= today
    ).length
    ordersToday += todayOrders

    const todayListings = assignments.filter((a: any) =>
      new Date(a.created_at) >= today
    ).length
    listingsToday += todayListings

    // Profit target check
    if (storeProfit >= TARGET_PROFIT) {
      storesAtTarget++
    } else {
      storesBelowTarget++
    }

    // Ramp-up tracking
    if (store.ramp_up_day && store.ramp_up_day > 0 && store.ramp_up_day < 45) {
      storesInRampUp++
      totalRampUpDays += store.ramp_up_day

      const targets = getTargetsForDay(store.ramp_up_day)
      if (active >= targets.listings * 0.9) {
        onTrack++
      } else {
        behind++
      }
    } else if (store.ramp_up_day >= 45) {
      storesCompleted++
    }

    // Automation
    if (store.auto_optimize_enabled) {
      autoOptEnabled++
    }

    // Health data
    const health = store.health_data as StoreHealthScore | null
    if (health?.factors) {
      totalDefectRate += health.factors.defectRate || 0
      totalLateShipment += health.factors.lateShipmentRate || 0
      totalFeedback += health.factors.feedbackScore || 0
      violations += health.factors.policyViolations || 0

      if (health.factors.defectRate > 2 || health.factors.lateShipmentRate > 7 || health.factors.feedbackScore < 95) {
        atRisk++
      }
    }
  }

  const storeCount = stores.length || 1
  const avgProfit = totalProfit / storeCount
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  // Get job stats
  const { count: pendingJobs } = await supabase
    .from('listing_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { count: failedJobs } = await supabase
    .from('listing_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')

  return {
    financial: {
      totalRevenue30Days: Math.round(totalRevenue * 100) / 100,
      totalProfit30Days: Math.round(totalProfit * 100) / 100,
      avgProfitPerStore: Math.round(avgProfit * 100) / 100,
      projectedMonthlyProfit: Math.round(avgProfit * storeCount * 100) / 100,
      storesAtProfitTarget: storesAtTarget,
      storesBelowTarget,
      targetProfitPerStore: TARGET_PROFIT,
      revenueGrowthRate: 0, // Would need historical data
      profitMargin: Math.round(profitMargin * 100) / 100
    },
    rampUp: {
      storesInRampUp,
      avgRampUpDay: storesInRampUp > 0 ? Math.round(totalRampUpDays / storesInRampUp) : 0,
      storesCompletedRampUp: storesCompleted,
      onTrackStores: onTrack,
      behindScheduleStores: behind,
      rampUpSuccessRate: (storesCompleted + storesInRampUp) > 0
        ? Math.round((storesCompleted / (storesCompleted + storesInRampUp)) * 100)
        : 0
    },
    operations: {
      totalListings,
      activeListings,
      pendingListings,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? Math.round((totalOrderValue / totalOrders) * 100) / 100 : 0,
      returnRate: totalOrders > 0 ? Math.round((returns / totalOrders) * 10000) / 100 : 0,
      listingsAddedToday: listingsToday,
      ordersProcessedToday: ordersToday
    },
    compliance: {
      storesAboveThreshold: storeCount - atRisk,
      avgDefectRate: Math.round((totalDefectRate / storeCount) * 100) / 100,
      avgLateShipmentRate: Math.round((totalLateShipment / storeCount) * 100) / 100,
      avgFeedbackScore: Math.round((totalFeedback / storeCount) * 10) / 10,
      policyViolations: violations,
      accountsAtRisk: atRisk
    },
    automation: {
      autoListingsEnabled: storeCount, // Assuming all managed stores have auto
      autoRepricingEnabled: storeCount,
      autoPruningEnabled: storeCount,
      autoOptimizationEnabled: autoOptEnabled,
      pendingJobsCount: pendingJobs || 0,
      failedJobsCount: failedJobs || 0
    }
  }
}

function getEmptyMetrics(): ManagedServiceMetrics {
  return {
    financial: {
      totalRevenue30Days: 0,
      totalProfit30Days: 0,
      avgProfitPerStore: 0,
      projectedMonthlyProfit: 0,
      storesAtProfitTarget: 0,
      storesBelowTarget: 0,
      targetProfitPerStore: 3000,
      revenueGrowthRate: 0,
      profitMargin: 0
    },
    rampUp: {
      storesInRampUp: 0,
      avgRampUpDay: 0,
      storesCompletedRampUp: 0,
      onTrackStores: 0,
      behindScheduleStores: 0,
      rampUpSuccessRate: 0
    },
    operations: {
      totalListings: 0,
      activeListings: 0,
      pendingListings: 0,
      totalOrders: 0,
      avgOrderValue: 0,
      returnRate: 0,
      listingsAddedToday: 0,
      ordersProcessedToday: 0
    },
    compliance: {
      storesAboveThreshold: 0,
      avgDefectRate: 0,
      avgLateShipmentRate: 0,
      avgFeedbackScore: 0,
      policyViolations: 0,
      accountsAtRisk: 0
    },
    automation: {
      autoListingsEnabled: 0,
      autoRepricingEnabled: 0,
      autoPruningEnabled: 0,
      autoOptimizationEnabled: 0,
      pendingJobsCount: 0,
      failedJobsCount: 0
    }
  }
}

// ============================================================================
// STORE RAMP-UP TRACKING
// ============================================================================

export async function getStoreRampUpProgress(storeId: string): Promise<StoreRampUpProgress | null> {
  const { data: store, error } = await supabase
    .from('stores')
    .select(`
      id, store_name, ramp_up_day, ramp_up_started_at, health_score, health_data,
      store_sku_assignments(id, listing_status, created_at),
      orders(id, total_amount, profit, order_date, status)
    `)
    .eq('id', storeId)
    .single()

  if (error || !store) return null

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const assignments = store.store_sku_assignments || []
  const orders = store.orders || []

  const activeListings = assignments.filter((a: any) => a.listing_status === 'active').length
  const recentOrders = orders.filter((o: any) =>
    new Date(o.order_date) >= thirtyDaysAgo && o.status !== 'CANCELLED'
  )
  const revenue = recentOrders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0)
  const profit = recentOrders.reduce((sum: number, o: any) => sum + (o.profit || 0), 0)

  const day = store.ramp_up_day || 1
  const targets = getTargetsForDay(day)

  // Calculate progress percentages
  const listingProgress = targets.listings > 0 ? Math.round((activeListings / targets.listings) * 100) : 0
  const revenueProgress = targets.cumulativeRevenue > 0 ? Math.round((revenue / targets.cumulativeRevenue) * 100) : 0
  const targetProfit = targets.cumulativeRevenue * 0.12 // 12% margin target
  const profitProgress = targetProfit > 0 ? Math.round((profit / targetProfit) * 100) : 0

  // Determine status
  let status: StoreRampUpProgress['status']
  if (day >= 45) {
    status = 'completed'
  } else if (listingProgress >= 110 && revenueProgress >= 110) {
    status = 'ahead'
  } else if (listingProgress >= 85 && revenueProgress >= 75) {
    status = 'on_track'
  } else {
    status = 'behind'
  }

  // Calculate blockers
  const blockers: string[] = []
  const health = store.health_data as StoreHealthScore | null

  if (listingProgress < 80) {
    blockers.push('Listing velocity below target')
  }
  if (health?.factors?.defectRate && health.factors.defectRate > 2) {
    blockers.push('High defect rate affecting account health')
  }
  if (health?.factors?.lateShipmentRate && health.factors.lateShipmentRate > 7) {
    blockers.push('Late shipment rate impacting seller status')
  }
  if (recentOrders.length === 0 && day > 3) {
    blockers.push('No sales activity - check listing quality')
  }

  // Project profit at day 45
  const dailyProfitRate = day > 1 ? profit / day : 0
  const projectedDay45Profit = dailyProfitRate * 45

  // Days to reach $3k target
  const daysToTarget = dailyProfitRate > 0
    ? Math.ceil((3000 - profit) / dailyProfitRate)
    : 999

  return {
    storeId: store.id,
    storeName: store.store_name,
    rampUpDay: day,
    startedAt: store.ramp_up_started_at || new Date().toISOString(),
    status,
    currentListings: activeListings,
    currentRevenue30Days: Math.round(revenue * 100) / 100,
    currentProfit30Days: Math.round(profit * 100) / 100,
    currentHealthScore: store.health_score || 0,
    targetListings: targets.listings,
    targetRevenue: targets.cumulativeRevenue,
    targetProfit: Math.round(targetProfit * 100) / 100,
    listingProgress,
    revenueProgress,
    profitProgress,
    projectedProfitAtDay45: Math.round(projectedDay45Profit * 100) / 100,
    daysToReachTarget: Math.min(daysToTarget, 999),
    blockers
  }
}

export async function getAllStoreRampUpProgress(
  userId: string,
  groupId?: string
): Promise<StoreRampUpProgress[]> {
  let query = supabase
    .from('stores')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('ramp_up_day', { ascending: false })

  if (groupId) {
    const { data: group } = await supabase
      .from('store_groups')
      .select('store_ids')
      .eq('id', groupId)
      .single()

    if (group?.store_ids?.length) {
      query = query.in('id', group.store_ids)
    }
  }

  const { data: stores } = await query

  if (!stores) return []

  const progress = await Promise.all(
    stores.map(s => getStoreRampUpProgress(s.id))
  )

  return progress.filter((p): p is StoreRampUpProgress => p !== null)
}

// ============================================================================
// ADMIN ACTIONS
// ============================================================================

export async function startStoreRampUp(
  storeId: string,
  adminId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from('stores')
      .update({
        ramp_up_day: 1,
        ramp_up_started_at: new Date().toISOString(),
        auto_optimize_enabled: true
      })
      .eq('id', storeId)

    if (error) throw error

    // Log action
    await logAdminAction(adminId, 'start_ramp_up', 'store', storeId, {}, 'success')

    return { success: true, message: 'Ramp-up started' }
  } catch (err) {
    await logAdminAction(adminId, 'start_ramp_up', 'store', storeId, {},
      'failed', err instanceof Error ? err.message : 'Unknown error')
    return { success: false, message: err instanceof Error ? err.message : 'Failed to start ramp-up' }
  }
}

export async function advanceRampUpDay(
  storeId: string,
  adminId: string
): Promise<{ success: boolean; newDay: number }> {
  try {
    const { data: store } = await supabase
      .from('stores')
      .select('ramp_up_day')
      .eq('id', storeId)
      .single()

    const newDay = Math.min((store?.ramp_up_day || 0) + 1, 45)

    await supabase
      .from('stores')
      .update({ ramp_up_day: newDay })
      .eq('id', storeId)

    await logAdminAction(adminId, 'advance_ramp_up', 'store', storeId, { newDay }, 'success')

    return { success: true, newDay }
  } catch (err) {
    return { success: false, newDay: 0 }
  }
}

export async function pauseStoreRampUp(
  storeId: string,
  adminId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  try {
    await supabase
      .from('stores')
      .update({
        status: 'paused',
        auto_optimize_enabled: false
      })
      .eq('id', storeId)

    await logAdminAction(adminId, 'pause_ramp_up', 'store', storeId, { reason }, 'success')

    return { success: true, message: 'Store paused' }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to pause' }
  }
}

export async function bulkStartRampUp(
  storeIds: string[],
  adminId: string
): Promise<{ successful: number; failed: number }> {
  let successful = 0
  let failed = 0

  for (const storeId of storeIds) {
    const result = await startStoreRampUp(storeId, adminId)
    if (result.success) {
      successful++
    } else {
      failed++
    }
  }

  return { successful, failed }
}

async function logAdminAction(
  adminId: string,
  action: string,
  targetType: AdminActionLog['targetType'],
  targetId: string,
  details: Record<string, any>,
  result: AdminActionLog['result'],
  error?: string
): Promise<void> {
  await supabase
    .from('admin_action_logs')
    .insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      result,
      error_message: error
    })
}

// ============================================================================
// FINANCIAL PROJECTIONS
// ============================================================================

export interface FinancialProjection {
  currentMonthProfit: number
  projectedEndOfMonthProfit: number
  projectedQuarterlyProfit: number
  projectedAnnualProfit: number
  breakEvenDate: string | null
  revenueByWeek: Array<{ week: string; revenue: number; profit: number }>
  profitByStore: Array<{ storeId: string; storeName: string; profit: number; percentOfTotal: number }>
}

export async function getFinancialProjection(
  userId: string,
  groupId?: string
): Promise<FinancialProjection> {
  const metrics = await getManagedServiceMetrics(userId, groupId)

  const currentProfit = metrics.financial.totalProfit30Days
  const storeCount = metrics.financial.storesAtProfitTarget + metrics.financial.storesBelowTarget

  // Project based on current trajectory
  const daysIntoMonth = new Date().getDate()
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dailyRate = daysIntoMonth > 0 ? currentProfit / daysIntoMonth : 0

  const projectedEOM = dailyRate * daysInMonth
  const projectedQuarterly = projectedEOM * 3
  const projectedAnnual = projectedEOM * 12

  // Get profit by store
  let storeQuery = supabase
    .from('stores')
    .select(`
      id, store_name,
      orders(profit, order_date)
    `)
    .eq('user_id', userId)

  if (groupId) {
    const { data: group } = await supabase
      .from('store_groups')
      .select('store_ids')
      .eq('id', groupId)
      .single()

    if (group?.store_ids?.length) {
      storeQuery = storeQuery.in('id', group.store_ids)
    }
  }

  const { data: stores } = await storeQuery
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const profitByStore = (stores || []).map(store => {
    const storeProfit = (store.orders || [])
      .filter((o: any) => new Date(o.order_date) >= thirtyDaysAgo)
      .reduce((sum: number, o: any) => sum + (o.profit || 0), 0)

    return {
      storeId: store.id,
      storeName: store.store_name,
      profit: Math.round(storeProfit * 100) / 100,
      percentOfTotal: currentProfit > 0 ? Math.round((storeProfit / currentProfit) * 10000) / 100 : 0
    }
  }).sort((a, b) => b.profit - a.profit)

  return {
    currentMonthProfit: Math.round(currentProfit * 100) / 100,
    projectedEndOfMonthProfit: Math.round(projectedEOM * 100) / 100,
    projectedQuarterlyProfit: Math.round(projectedQuarterly * 100) / 100,
    projectedAnnualProfit: Math.round(projectedAnnual * 100) / 100,
    breakEvenDate: null, // Would need cost data
    revenueByWeek: [], // Would need historical data
    profitByStore
  }
}
