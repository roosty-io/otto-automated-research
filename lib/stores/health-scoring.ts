// OTTO Research Labs - Store Health Scoring System
// Intelligent store capacity and health assessment for optimal allocation

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TYPES
// ============================================================================

export interface StoreHealthScore {
  storeId: string
  storeName: string
  overallScore: number  // 0-100
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  components: {
    accountHealth: number
    salesPerformance: number
    listingQuality: number
    capacityUtilization: number
    complianceScore: number
    growthPotential: number
  }
  factors: StoreHealthFactors
  recommendations: string[]
  allocationCapacity: {
    maxNewListings: number
    optimalDailyAdditions: number
    riskLevel: 'low' | 'medium' | 'high'
  }
  lastCalculated: string
}

export interface StoreHealthFactors {
  // Account Metrics
  accountAge: number  // days
  feedbackScore: number  // 0-100
  feedbackCount: number
  defectRate: number  // percentage
  lateShipmentRate: number  // percentage
  casesOpenRate: number  // percentage

  // Store Metrics
  storeSubscriptionLevel: string
  currentListings: number
  maxListings: number
  utilizationPercent: number

  // Performance Metrics
  salesLast30Days: number
  ordersLast30Days: number
  returnRate: number
  conversionRate: number
  avgDaysToShip: number

  // Compliance
  policyViolations: number
  veroWarnings: number
  accountRestrictions: string[]

  // Growth
  listingGrowthRate: number  // % change month over month
  salesGrowthRate: number
  newCategories: number
}

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const SCORE_WEIGHTS = {
  accountHealth: 0.25,      // 25% - Account standing is critical
  salesPerformance: 0.20,   // 20% - Sales velocity matters
  listingQuality: 0.15,     // 15% - Quality affects visibility
  capacityUtilization: 0.15, // 15% - Room to grow
  complianceScore: 0.15,    // 15% - Staying compliant
  growthPotential: 0.10     // 10% - Future opportunity
}

// Thresholds for eBay account health
const EBAY_THRESHOLDS = {
  defectRate: { excellent: 0.5, good: 1.0, fair: 2.0 },
  lateShipmentRate: { excellent: 3.0, good: 5.0, fair: 7.0 },
  casesOpenRate: { excellent: 0.3, good: 0.5, fair: 1.0 },
  feedbackScore: { excellent: 99.5, good: 98.0, fair: 95.0 }
}

// ============================================================================
// HEALTH CALCULATION
// ============================================================================

export async function calculateStoreHealth(storeId: string): Promise<StoreHealthScore | null> {
  // Fetch all store data
  const { data: store, error } = await supabase
    .from('stores')
    .select(`
      *,
      store_tiers(tier_name, max_total_listings, listing_allowance),
      store_sku_assignments(id, listing_status, created_at),
      orders(id, total_amount, order_date, status)
    `)
    .eq('id', storeId)
    .single()

  if (error || !store) {
    console.error('[HealthScore] Failed to fetch store:', error)
    return null
  }

  const factors = extractFactors(store)
  const components = calculateComponents(factors)
  const overallScore = calculateOverallScore(components)
  const healthStatus = getHealthStatus(overallScore)
  const recommendations = generateRecommendations(factors, components)
  const allocationCapacity = calculateAllocationCapacity(factors, overallScore)

  const result: StoreHealthScore = {
    storeId,
    storeName: store.store_name,
    overallScore,
    healthStatus,
    components,
    factors,
    recommendations,
    allocationCapacity,
    lastCalculated: new Date().toISOString()
  }

  // Cache the score
  await cacheHealthScore(storeId, result)

  return result
}

function extractFactors(store: any): StoreHealthFactors {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const assignments = store.store_sku_assignments || []
  const orders = (store.orders || []).filter((o: any) =>
    new Date(o.order_date) >= thirtyDaysAgo && o.status !== 'CANCELLED'
  )

  const activeListings = assignments.filter((a: any) => a.listing_status === 'active').length
  const maxListings = store.store_tiers?.max_total_listings || 10000

  // Calculate sales metrics
  const salesLast30Days = orders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0)
  const ordersLast30Days = orders.length
  const returnedOrders = orders.filter((o: any) => o.status === 'RETURNED').length
  const returnRate = ordersLast30Days > 0 ? (returnedOrders / ordersLast30Days) * 100 : 0

  // Estimate conversion rate (would need view data in production)
  const estimatedViews = activeListings * 10  // Rough estimate
  const conversionRate = estimatedViews > 0 ? (ordersLast30Days / estimatedViews) * 100 : 0

  // Calculate growth rates
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  const oldListings = assignments.filter((a: any) =>
    new Date(a.created_at) < thirtyDaysAgo && new Date(a.created_at) >= sixtyDaysAgo
  ).length
  const newListings = assignments.filter((a: any) =>
    new Date(a.created_at) >= thirtyDaysAgo
  ).length
  const listingGrowthRate = oldListings > 0 ? ((newListings - oldListings) / oldListings) * 100 : 0

  return {
    // Account Metrics (use stored values or defaults)
    accountAge: store.account_age_days || 180,
    feedbackScore: store.feedback_score || 98,
    feedbackCount: store.feedback_count || 100,
    defectRate: store.defect_rate || 0.5,
    lateShipmentRate: store.late_shipment_rate || 3.0,
    casesOpenRate: store.cases_open_rate || 0.3,

    // Store Metrics
    storeSubscriptionLevel: store.store_tiers?.tier_name || 'basic',
    currentListings: activeListings,
    maxListings,
    utilizationPercent: (activeListings / maxListings) * 100,

    // Performance Metrics
    salesLast30Days,
    ordersLast30Days,
    returnRate,
    conversionRate,
    avgDaysToShip: store.avg_days_to_ship || 1.5,

    // Compliance
    policyViolations: store.policy_violations || 0,
    veroWarnings: store.vero_warnings || 0,
    accountRestrictions: store.account_restrictions || [],

    // Growth
    listingGrowthRate,
    salesGrowthRate: 0,  // Would calculate from historical data
    newCategories: 0
  }
}

function calculateComponents(factors: StoreHealthFactors): StoreHealthScore['components'] {
  return {
    accountHealth: calculateAccountHealth(factors),
    salesPerformance: calculateSalesPerformance(factors),
    listingQuality: calculateListingQuality(factors),
    capacityUtilization: calculateCapacityScore(factors),
    complianceScore: calculateComplianceScore(factors),
    growthPotential: calculateGrowthPotential(factors)
  }
}

function calculateAccountHealth(factors: StoreHealthFactors): number {
  let score = 100

  // Account age bonus (max 10 points)
  const ageBonus = Math.min(10, factors.accountAge / 36.5)  // 1 year = 10 points
  score = score - 10 + ageBonus

  // Feedback score (critical)
  if (factors.feedbackScore >= EBAY_THRESHOLDS.feedbackScore.excellent) {
    score -= 0
  } else if (factors.feedbackScore >= EBAY_THRESHOLDS.feedbackScore.good) {
    score -= 10
  } else if (factors.feedbackScore >= EBAY_THRESHOLDS.feedbackScore.fair) {
    score -= 25
  } else {
    score -= 40
  }

  // Defect rate
  if (factors.defectRate <= EBAY_THRESHOLDS.defectRate.excellent) {
    score -= 0
  } else if (factors.defectRate <= EBAY_THRESHOLDS.defectRate.good) {
    score -= 10
  } else if (factors.defectRate <= EBAY_THRESHOLDS.defectRate.fair) {
    score -= 20
  } else {
    score -= 35
  }

  // Late shipment rate
  if (factors.lateShipmentRate <= EBAY_THRESHOLDS.lateShipmentRate.excellent) {
    score -= 0
  } else if (factors.lateShipmentRate <= EBAY_THRESHOLDS.lateShipmentRate.good) {
    score -= 5
  } else if (factors.lateShipmentRate <= EBAY_THRESHOLDS.lateShipmentRate.fair) {
    score -= 15
  } else {
    score -= 25
  }

  return Math.max(0, Math.min(100, score))
}

function calculateSalesPerformance(factors: StoreHealthFactors): number {
  let score = 50  // Start at middle

  // Sales volume relative to listings
  const salesPerListing = factors.currentListings > 0
    ? factors.salesLast30Days / factors.currentListings
    : 0

  if (salesPerListing >= 50) {
    score += 40
  } else if (salesPerListing >= 30) {
    score += 30
  } else if (salesPerListing >= 15) {
    score += 20
  } else if (salesPerListing >= 5) {
    score += 10
  }

  // Order count bonus
  if (factors.ordersLast30Days >= 100) {
    score += 10
  } else if (factors.ordersLast30Days >= 50) {
    score += 5
  }

  // Return rate penalty
  score -= factors.returnRate * 2

  return Math.max(0, Math.min(100, score))
}

function calculateListingQuality(factors: StoreHealthFactors): number {
  let score = 70  // Default to good

  // Conversion rate indicator
  if (factors.conversionRate >= 3) {
    score += 20
  } else if (factors.conversionRate >= 2) {
    score += 10
  } else if (factors.conversionRate < 1) {
    score -= 20
  }

  // Return rate as quality indicator
  if (factors.returnRate <= 2) {
    score += 10
  } else if (factors.returnRate > 5) {
    score -= 20
  }

  return Math.max(0, Math.min(100, score))
}

function calculateCapacityScore(factors: StoreHealthFactors): number {
  // Higher score = more room to grow
  const utilization = factors.utilizationPercent

  if (utilization <= 50) {
    return 100  // Plenty of room
  } else if (utilization <= 70) {
    return 80
  } else if (utilization <= 85) {
    return 60
  } else if (utilization <= 95) {
    return 40
  } else {
    return 20  // Nearly full
  }
}

function calculateComplianceScore(factors: StoreHealthFactors): number {
  let score = 100

  // Policy violations are serious
  score -= factors.policyViolations * 15

  // VeRO warnings
  score -= factors.veroWarnings * 10

  // Account restrictions
  score -= factors.accountRestrictions.length * 20

  return Math.max(0, Math.min(100, score))
}

function calculateGrowthPotential(factors: StoreHealthFactors): number {
  let score = 50

  // Listing growth rate
  if (factors.listingGrowthRate > 20) {
    score += 25
  } else if (factors.listingGrowthRate > 10) {
    score += 15
  } else if (factors.listingGrowthRate > 0) {
    score += 5
  } else if (factors.listingGrowthRate < -10) {
    score -= 20
  }

  // Room to grow in subscription
  const roomToGrow = 100 - factors.utilizationPercent
  score += roomToGrow * 0.25

  return Math.max(0, Math.min(100, score))
}

function calculateOverallScore(components: StoreHealthScore['components']): number {
  return Math.round(
    components.accountHealth * SCORE_WEIGHTS.accountHealth +
    components.salesPerformance * SCORE_WEIGHTS.salesPerformance +
    components.listingQuality * SCORE_WEIGHTS.listingQuality +
    components.capacityUtilization * SCORE_WEIGHTS.capacityUtilization +
    components.complianceScore * SCORE_WEIGHTS.complianceScore +
    components.growthPotential * SCORE_WEIGHTS.growthPotential
  )
}

function getHealthStatus(score: number): StoreHealthScore['healthStatus'] {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 55) return 'fair'
  if (score >= 40) return 'poor'
  return 'critical'
}

function generateRecommendations(
  factors: StoreHealthFactors,
  components: StoreHealthScore['components']
): string[] {
  const recommendations: string[] = []

  // Account health recommendations
  if (components.accountHealth < 70) {
    if (factors.defectRate > EBAY_THRESHOLDS.defectRate.good) {
      recommendations.push('Reduce defect rate by improving item descriptions and handling cases promptly')
    }
    if (factors.lateShipmentRate > EBAY_THRESHOLDS.lateShipmentRate.good) {
      recommendations.push('Improve shipping speed - consider using faster suppliers or adjusting handling time')
    }
    if (factors.feedbackScore < EBAY_THRESHOLDS.feedbackScore.good) {
      recommendations.push('Focus on customer service to improve feedback score')
    }
  }

  // Sales recommendations
  if (components.salesPerformance < 60) {
    recommendations.push('Review pricing strategy - consider repricing rules to stay competitive')
    if (factors.ordersLast30Days < 20) {
      recommendations.push('Add more listings to increase visibility and sales opportunities')
    }
  }

  // Capacity recommendations
  if (factors.utilizationPercent > 85) {
    recommendations.push('Consider upgrading eBay store subscription for more listing capacity')
  } else if (factors.utilizationPercent < 30) {
    recommendations.push('Store has significant capacity - increase listing count to maximize potential')
  }

  // Compliance recommendations
  if (components.complianceScore < 80) {
    if (factors.policyViolations > 0) {
      recommendations.push('Address policy violations immediately to avoid account restrictions')
    }
    if (factors.veroWarnings > 0) {
      recommendations.push('Review VeRO warnings and remove any infringing listings')
    }
  }

  // Return empty if all good
  if (recommendations.length === 0) {
    recommendations.push('Store is performing well - maintain current practices')
  }

  return recommendations.slice(0, 5)  // Max 5 recommendations
}

function calculateAllocationCapacity(
  factors: StoreHealthFactors,
  overallScore: number
): StoreHealthScore['allocationCapacity'] {
  const availableSlots = factors.maxListings - factors.currentListings

  // Base max on health score
  let maxNewListings: number
  let optimalDaily: number
  let riskLevel: 'low' | 'medium' | 'high'

  if (overallScore >= 85) {
    // Excellent health - can add aggressively
    maxNewListings = Math.min(availableSlots, 500)
    optimalDaily = Math.min(50, availableSlots / 10)
    riskLevel = 'low'
  } else if (overallScore >= 70) {
    // Good health - moderate pace
    maxNewListings = Math.min(availableSlots, 300)
    optimalDaily = Math.min(30, availableSlots / 15)
    riskLevel = 'low'
  } else if (overallScore >= 55) {
    // Fair health - cautious approach
    maxNewListings = Math.min(availableSlots, 150)
    optimalDaily = Math.min(15, availableSlots / 20)
    riskLevel = 'medium'
  } else if (overallScore >= 40) {
    // Poor health - minimal additions
    maxNewListings = Math.min(availableSlots, 50)
    optimalDaily = Math.min(5, availableSlots / 30)
    riskLevel = 'high'
  } else {
    // Critical - no new listings
    maxNewListings = 0
    optimalDaily = 0
    riskLevel = 'high'
  }

  // Adjust for account age (new accounts should grow slower)
  if (factors.accountAge < 90) {
    maxNewListings = Math.floor(maxNewListings * 0.5)
    optimalDaily = Math.floor(optimalDaily * 0.5)
  } else if (factors.accountAge < 180) {
    maxNewListings = Math.floor(maxNewListings * 0.75)
    optimalDaily = Math.floor(optimalDaily * 0.75)
  }

  return {
    maxNewListings: Math.max(0, maxNewListings),
    optimalDailyAdditions: Math.max(0, Math.round(optimalDaily)),
    riskLevel
  }
}

async function cacheHealthScore(storeId: string, score: StoreHealthScore): Promise<void> {
  await supabase
    .from('stores')
    .update({
      health_score: score.overallScore,
      health_status: score.healthStatus,
      health_data: score,
      health_calculated_at: score.lastCalculated
    })
    .eq('id', storeId)
}

// ============================================================================
// SMART ALLOCATION
// ============================================================================

export interface AllocationPlan {
  totalAvailableListings: number
  stores: Array<{
    storeId: string
    storeName: string
    healthScore: number
    allocationCount: number
    priority: number
    reason: string
  }>
  unallocated: number
}

/**
 * Create smart allocation plan for distributing SKUs across stores
 */
export async function createAllocationPlan(
  skuCount: number,
  userId?: string
): Promise<AllocationPlan> {
  // Get all active stores with health scores
  let query = supabase
    .from('stores')
    .select('id, store_name, health_score, health_data, is_active')
    .eq('is_active', true)
    .order('health_score', { ascending: false })

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: stores } = await query

  if (!stores || stores.length === 0) {
    return {
      totalAvailableListings: 0,
      stores: [],
      unallocated: skuCount
    }
  }

  // Calculate health scores if not cached
  const storesWithHealth = await Promise.all(
    stores.map(async (store) => {
      let health = store.health_data as StoreHealthScore | null

      // Recalculate if stale (older than 24 hours)
      if (!health || !health.lastCalculated ||
          Date.now() - new Date(health.lastCalculated).getTime() > 24 * 60 * 60 * 1000) {
        health = await calculateStoreHealth(store.id)
      }

      return {
        ...store,
        health
      }
    })
  )

  // Filter stores that can accept listings
  const eligibleStores = storesWithHealth
    .filter(s => s.health && s.health.allocationCapacity.maxNewListings > 0)
    .sort((a, b) => (b.health?.overallScore || 0) - (a.health?.overallScore || 0))

  // Allocate SKUs based on health and capacity
  let remaining = skuCount
  const allocations: AllocationPlan['stores'] = []

  for (const store of eligibleStores) {
    if (remaining <= 0) break

    const health = store.health!
    const capacity = health.allocationCapacity.maxNewListings

    // Weight allocation by health score
    const healthWeight = health.overallScore / 100
    const baseAllocation = Math.ceil(skuCount * healthWeight / eligibleStores.length)
    const allocation = Math.min(remaining, capacity, baseAllocation)

    if (allocation > 0) {
      allocations.push({
        storeId: store.id,
        storeName: store.store_name,
        healthScore: health.overallScore,
        allocationCount: allocation,
        priority: allocations.length + 1,
        reason: `${health.healthStatus} health, ${health.allocationCapacity.riskLevel} risk`
      })

      remaining -= allocation
    }
  }

  return {
    totalAvailableListings: eligibleStores.reduce((sum, s) =>
      sum + (s.health?.allocationCapacity.maxNewListings || 0), 0
    ),
    stores: allocations,
    unallocated: remaining
  }
}

/**
 * Get stores ranked by allocation priority
 */
export async function getStoresByPriority(userId?: string): Promise<StoreHealthScore[]> {
  let query = supabase
    .from('stores')
    .select('id')
    .eq('is_active', true)
    .order('health_score', { ascending: false })

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: stores } = await query

  if (!stores) return []

  const healthScores = await Promise.all(
    stores.map(s => calculateStoreHealth(s.id))
  )

  return healthScores
    .filter((h): h is StoreHealthScore => h !== null)
    .sort((a, b) => b.overallScore - a.overallScore)
}

// ============================================================================
// BATCH HEALTH CALCULATION (for managed service)
// ============================================================================

export async function calculateHealthForAllStores(
  userId?: string
): Promise<{
  calculated: number
  failed: number
  avgScore: number
  healthDistribution: Record<StoreHealthScore['healthStatus'], number>
}> {
  let query = supabase
    .from('stores')
    .select('id')
    .eq('is_active', true)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: stores } = await query

  if (!stores) {
    return { calculated: 0, failed: 0, avgScore: 0, healthDistribution: { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 } }
  }

  let calculated = 0
  let failed = 0
  let totalScore = 0
  const distribution: Record<StoreHealthScore['healthStatus'], number> = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    critical: 0
  }

  // Process in batches of 10
  for (let i = 0; i < stores.length; i += 10) {
    const batch = stores.slice(i, i + 10)
    const results = await Promise.all(
      batch.map(s => calculateStoreHealth(s.id))
    )

    for (const result of results) {
      if (result) {
        calculated++
        totalScore += result.overallScore
        distribution[result.healthStatus]++
      } else {
        failed++
      }
    }
  }

  return {
    calculated,
    failed,
    avgScore: calculated > 0 ? Math.round(totalScore / calculated) : 0,
    healthDistribution: distribution
  }
}
