// OTTO Research Labs - Store Health Scoring System
// Intelligent store capacity and health assessment for optimal allocation
// Enhanced with eBay Cassini algorithm optimization factors

import { createClient } from '@supabase/supabase-js'
import { CASSINI_THRESHOLDS } from '../research/cassini-optimizer'

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
    cassiniReadiness: number  // New: Cassini algorithm optimization readiness
  }
  factors: StoreHealthFactors
  cassiniStatus: CassiniStoreStatus  // New: Cassini-specific status
  recommendations: string[]
  allocationCapacity: {
    maxNewListings: number
    optimalDailyAdditions: number
    riskLevel: 'low' | 'medium' | 'high'
  }
  lastCalculated: string
}

// Cassini-specific store status for algorithm optimization
export interface CassiniStoreStatus {
  isTopRated: boolean
  topRatedPlusEligible: boolean
  projectedVisibility: 'high' | 'medium' | 'low' | 'suppressed'
  visibilityBoosts: string[]
  visibilityPenalties: string[]
  shippingScore: number  // 0-100 based on handling time and delivery
  sellerMetricsScore: number  // 0-100 based on defect/late rates
  avgListingCassiniScore: number  // Average Cassini score of active listings
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

  // Cassini-Specific Metrics (NEW)
  handlingTimeDays: number  // Listed handling time (0-3 days ideal)
  avgActualHandlingDays: number  // Actual time to ship
  trackingUploadRate: number  // % of orders with tracking uploaded on time
  onTimeDeliveryRate: number  // % of orders delivered on time
  responseTimeHours: number  // Avg response time to buyer messages
  isTopRatedSeller: boolean  // Top Rated Seller status
  hasFreReturns: boolean  // Offers free returns (Cassini boost)
  avgItemSpecificsCount: number  // Average item specifics per listing
  avgTitleLength: number  // Average title length (80 chars optimal)

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
  accountHealth: 0.20,      // 20% - Account standing (Cassini critical)
  salesPerformance: 0.15,   // 15% - Sales velocity (Cassini signal)
  listingQuality: 0.15,     // 15% - Quality affects visibility
  capacityUtilization: 0.10, // 10% - Room to grow
  complianceScore: 0.10,    // 10% - Staying compliant
  growthPotential: 0.10,    // 10% - Future opportunity
  cassiniReadiness: 0.20    // 20% - Cassini algorithm optimization (NEW)
}

// Thresholds for eBay account health - aligned with Cassini requirements
// These directly affect Cassini visibility and Top Rated status
const EBAY_THRESHOLDS = {
  // Defect rate: Items Not As Described + Cancellations
  defectRate: {
    topRated: 0.5,    // Required for Top Rated Seller
    excellent: 0.5,
    good: 1.0,
    fair: 2.0,        // eBay "Above Standard" threshold
    belowStandard: 2.0
  },
  // Late shipment rate: Ship by handling time + 1 day
  lateShipmentRate: {
    topRated: 3.0,    // Required for Top Rated Seller
    excellent: 3.0,
    good: 5.0,
    fair: 7.0,        // eBay "Above Standard" threshold
    belowStandard: 7.0
  },
  // Cases closed without seller resolution
  casesOpenRate: {
    topRated: 0.3,    // Required for Top Rated Seller
    excellent: 0.3,
    good: 0.5,
    fair: 1.0
  },
  // Positive feedback percentage
  feedbackScore: {
    excellent: 99.5,  // Cassini strong signal
    good: 98.0,       // Top Rated minimum
    fair: 95.0,
    poor: 90.0
  },
  // Handling time (Cassini prefers fast)
  handlingTime: {
    excellent: 0,     // Same-day handling
    good: 1,          // Next-day handling
    fair: 2,
    poor: 3
  },
  // Response time to buyers (affects experience)
  responseTimeHours: {
    excellent: 4,
    good: 12,
    fair: 24,
    poor: 48
  }
}

// ============================================================================
// HEALTH CALCULATION
// ============================================================================

export async function calculateStoreHealth(storeId: string): Promise<StoreHealthScore | null> {
  // Fetch all store data including Cassini-relevant metrics
  const { data: store, error } = await supabase
    .from('stores')
    .select(`
      *,
      store_tiers(tier_name, max_total_listings, listing_allowance),
      store_sku_assignments(id, listing_status, created_at),
      orders(id, total_amount, order_date, status),
      listings(id, cassini_score, status)
    `)
    .eq('id', storeId)
    .single()

  if (error || !store) {
    console.error('[HealthScore] Failed to fetch store:', error)
    return null
  }

  const factors = extractFactors(store)
  const cassiniStatus = calculateCassiniStatus(factors, store)
  const components = calculateComponents(factors, cassiniStatus)
  const overallScore = calculateOverallScore(components)
  const healthStatus = getHealthStatus(overallScore)
  const recommendations = generateRecommendations(factors, components, cassiniStatus)
  const allocationCapacity = calculateAllocationCapacity(factors, overallScore, cassiniStatus)

  const result: StoreHealthScore = {
    storeId,
    storeName: store.store_name,
    overallScore,
    healthStatus,
    components,
    factors,
    cassiniStatus,
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

    // Cassini-Specific Metrics
    handlingTimeDays: store.handling_time_days ?? 1,  // Default 1-day handling
    avgActualHandlingDays: store.avg_actual_handling_days || 1.2,
    trackingUploadRate: store.tracking_upload_rate || 95,
    onTimeDeliveryRate: store.on_time_delivery_rate || 92,
    responseTimeHours: store.response_time_hours || 12,
    isTopRatedSeller: store.is_top_rated_seller || false,
    hasFreReturns: store.has_free_returns || false,
    avgItemSpecificsCount: store.avg_item_specifics_count || 6,
    avgTitleLength: store.avg_title_length || 65,

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

// ============================================================================
// CASSINI STATUS CALCULATION
// ============================================================================

function calculateCassiniStatus(factors: StoreHealthFactors, store: any): CassiniStoreStatus {
  const boosts: string[] = []
  const penalties: string[] = []

  // Check Top Rated Seller eligibility
  const meetsTopRatedDefect = factors.defectRate <= EBAY_THRESHOLDS.defectRate.topRated
  const meetsTopRatedLateShip = factors.lateShipmentRate <= EBAY_THRESHOLDS.lateShipmentRate.topRated
  const meetsTopRatedCases = factors.casesOpenRate <= EBAY_THRESHOLDS.casesOpenRate.topRated
  const meetsTopRatedFeedback = factors.feedbackScore >= EBAY_THRESHOLDS.feedbackScore.good

  const isTopRated = factors.isTopRatedSeller ||
    (meetsTopRatedDefect && meetsTopRatedLateShip && meetsTopRatedCases && meetsTopRatedFeedback)

  // Top Rated Plus eligibility (1-day handling + free returns)
  const topRatedPlusEligible = isTopRated &&
    factors.handlingTimeDays <= 1 &&
    factors.hasFreReturns

  // Calculate shipping score (critical for Cassini)
  let shippingScore = 50

  // Handling time scoring
  if (factors.handlingTimeDays === 0) {
    shippingScore += 30  // Same-day shipping
    boosts.push('Same-day handling (+30%)')
  } else if (factors.handlingTimeDays === 1) {
    shippingScore += 25
    boosts.push('1-day handling (+25%)')
  } else if (factors.handlingTimeDays === 2) {
    shippingScore += 10
  } else {
    shippingScore -= 10
    penalties.push('Slow handling time (>2 days)')
  }

  // On-time delivery
  if (factors.onTimeDeliveryRate >= 98) {
    shippingScore += 15
    boosts.push('Excellent on-time delivery')
  } else if (factors.onTimeDeliveryRate >= 95) {
    shippingScore += 10
  } else if (factors.onTimeDeliveryRate < 90) {
    shippingScore -= 15
    penalties.push('Low on-time delivery rate')
  }

  // Tracking upload rate
  if (factors.trackingUploadRate >= 99) {
    shippingScore += 5
  } else if (factors.trackingUploadRate < 95) {
    shippingScore -= 10
    penalties.push('Low tracking upload rate')
  }

  // Calculate seller metrics score (Cassini heavily weights this)
  let sellerMetricsScore = 50

  // Defect rate (most critical)
  if (factors.defectRate <= 0.5) {
    sellerMetricsScore += 25
    boosts.push('Excellent defect rate (<0.5%)')
  } else if (factors.defectRate <= 1.0) {
    sellerMetricsScore += 15
  } else if (factors.defectRate > 2.0) {
    sellerMetricsScore -= 30
    penalties.push('High defect rate - Cassini suppression risk')
  }

  // Late shipment rate
  if (factors.lateShipmentRate <= 3.0) {
    sellerMetricsScore += 20
  } else if (factors.lateShipmentRate > 7.0) {
    sellerMetricsScore -= 25
    penalties.push('High late shipment rate - visibility reduction')
  }

  // Feedback score
  if (factors.feedbackScore >= 99.5) {
    sellerMetricsScore += 10
    boosts.push('Top feedback score')
  } else if (factors.feedbackScore < 95) {
    sellerMetricsScore -= 15
    penalties.push('Low feedback score')
  }

  // Response time bonus
  if (factors.responseTimeHours <= 4) {
    sellerMetricsScore += 5
    boosts.push('Fast response time')
  }

  // Top Rated boost
  if (isTopRated) {
    boosts.push('Top Rated Seller (+15% visibility)')
  }
  if (topRatedPlusEligible) {
    boosts.push('Top Rated Plus eligible (+20% visibility)')
  }

  // Free returns boost
  if (factors.hasFreReturns) {
    boosts.push('Free returns (+8% visibility)')
  }

  // Calculate average listing Cassini score
  const listings = store.listings || []
  const activeListings = listings.filter((l: any) => l.status === 'active' && l.cassini_score)
  const avgListingCassiniScore = activeListings.length > 0
    ? activeListings.reduce((sum: number, l: any) => sum + (l.cassini_score || 50), 0) / activeListings.length
    : 50

  // Determine projected visibility
  const combinedScore = (shippingScore + sellerMetricsScore) / 2
  let projectedVisibility: CassiniStoreStatus['projectedVisibility']

  if (penalties.some(p => p.includes('suppression'))) {
    projectedVisibility = 'suppressed'
  } else if (combinedScore >= 80 && isTopRated) {
    projectedVisibility = 'high'
  } else if (combinedScore >= 65) {
    projectedVisibility = 'medium'
  } else if (combinedScore >= 45) {
    projectedVisibility = 'low'
  } else {
    projectedVisibility = 'suppressed'
  }

  return {
    isTopRated,
    topRatedPlusEligible,
    projectedVisibility,
    visibilityBoosts: boosts,
    visibilityPenalties: penalties,
    shippingScore: Math.max(0, Math.min(100, shippingScore)),
    sellerMetricsScore: Math.max(0, Math.min(100, sellerMetricsScore)),
    avgListingCassiniScore: Math.round(avgListingCassiniScore)
  }
}

function calculateComponents(
  factors: StoreHealthFactors,
  cassiniStatus: CassiniStoreStatus
): StoreHealthScore['components'] {
  return {
    accountHealth: calculateAccountHealth(factors),
    salesPerformance: calculateSalesPerformance(factors),
    listingQuality: calculateListingQuality(factors, cassiniStatus),
    capacityUtilization: calculateCapacityScore(factors),
    complianceScore: calculateComplianceScore(factors),
    growthPotential: calculateGrowthPotential(factors),
    cassiniReadiness: calculateCassiniReadiness(factors, cassiniStatus)
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

function calculateListingQuality(
  factors: StoreHealthFactors,
  cassiniStatus: CassiniStoreStatus
): number {
  let score = 50  // Start at middle

  // Conversion rate indicator (Cassini signal)
  if (factors.conversionRate >= 3) {
    score += 20
  } else if (factors.conversionRate >= 2) {
    score += 10
  } else if (factors.conversionRate < 1) {
    score -= 15
  }

  // Return rate as quality indicator
  if (factors.returnRate <= 2) {
    score += 10
  } else if (factors.returnRate > 5) {
    score -= 15
  }

  // Title length optimization (Cassini prefers 75-80 chars)
  if (factors.avgTitleLength >= 75 && factors.avgTitleLength <= 80) {
    score += 10
  } else if (factors.avgTitleLength >= 60) {
    score += 5
  } else if (factors.avgTitleLength < 40) {
    score -= 10
  }

  // Item specifics completeness (Cassini uses for filtering)
  if (factors.avgItemSpecificsCount >= 10) {
    score += 10
  } else if (factors.avgItemSpecificsCount >= 6) {
    score += 5
  } else if (factors.avgItemSpecificsCount < 3) {
    score -= 10
  }

  // Average Cassini score of listings
  if (cassiniStatus.avgListingCassiniScore >= 80) {
    score += 10
  } else if (cassiniStatus.avgListingCassiniScore >= 60) {
    score += 5
  } else if (cassiniStatus.avgListingCassiniScore < 40) {
    score -= 10
  }

  return Math.max(0, Math.min(100, score))
}

// NEW: Calculate Cassini algorithm readiness
function calculateCassiniReadiness(
  factors: StoreHealthFactors,
  cassiniStatus: CassiniStoreStatus
): number {
  let score = 0

  // Shipping score (40% of Cassini readiness)
  score += cassiniStatus.shippingScore * 0.4

  // Seller metrics score (40% of Cassini readiness)
  score += cassiniStatus.sellerMetricsScore * 0.4

  // Top Rated status bonus (10%)
  if (cassiniStatus.isTopRated) {
    score += 10
  }
  if (cassiniStatus.topRatedPlusEligible) {
    score += 5  // Additional bonus
  }

  // Returns policy (5%)
  if (factors.hasFreReturns) {
    score += 5
  }

  // Response time (5%)
  if (factors.responseTimeHours <= 4) {
    score += 5
  } else if (factors.responseTimeHours <= 12) {
    score += 3
  }

  return Math.max(0, Math.min(100, Math.round(score)))
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
  components: StoreHealthScore['components'],
  cassiniStatus: CassiniStoreStatus
): string[] {
  const recommendations: string[] = []

  // CASSINI-SPECIFIC RECOMMENDATIONS (highest priority)
  if (cassiniStatus.projectedVisibility === 'suppressed') {
    recommendations.push('CRITICAL: Store at risk of Cassini suppression - fix seller metrics immediately')
  }

  // Top Rated pathway
  if (!cassiniStatus.isTopRated && components.cassiniReadiness >= 60) {
    const missing: string[] = []
    if (factors.defectRate > 0.5) missing.push('defect rate ≤0.5%')
    if (factors.lateShipmentRate > 3.0) missing.push('late shipment ≤3%')
    if (factors.casesOpenRate > 0.3) missing.push('cases rate ≤0.3%')
    if (missing.length > 0) {
      recommendations.push(`Path to Top Rated (+15% visibility): Achieve ${missing.join(', ')}`)
    }
  }

  // Top Rated Plus pathway
  if (cassiniStatus.isTopRated && !cassiniStatus.topRatedPlusEligible) {
    const missing: string[] = []
    if (factors.handlingTimeDays > 1) missing.push('1-day handling')
    if (!factors.hasFreReturns) missing.push('free returns')
    if (missing.length > 0) {
      recommendations.push(`Upgrade to Top Rated Plus (+20% visibility): Enable ${missing.join(' and ')}`)
    }
  }

  // Shipping time optimization (Cassini critical)
  if (factors.handlingTimeDays > 1) {
    recommendations.push('Reduce handling time to 1 day or same-day for Cassini visibility boost')
  }

  // Account health recommendations (affects Cassini)
  if (components.accountHealth < 70) {
    if (factors.defectRate > EBAY_THRESHOLDS.defectRate.good) {
      recommendations.push('Reduce defect rate - directly impacts Cassini visibility and buyer trust')
    }
    if (factors.lateShipmentRate > EBAY_THRESHOLDS.lateShipmentRate.good) {
      recommendations.push('Reduce late shipments by using faster suppliers or adding handling time buffer')
    }
    if (factors.feedbackScore < EBAY_THRESHOLDS.feedbackScore.good) {
      recommendations.push('Improve feedback score - target 98%+ for better Cassini positioning')
    }
  }

  // Listing quality (Cassini signals)
  if (factors.avgTitleLength < 70) {
    recommendations.push('Optimize titles to 75-80 characters with relevant keywords for Cassini')
  }
  if (factors.avgItemSpecificsCount < 8) {
    recommendations.push('Add more item specifics (8-12 recommended) for Cassini filter visibility')
  }

  // Response time (buyer experience)
  if (factors.responseTimeHours > 12) {
    recommendations.push('Improve response time to <12 hours for better buyer experience')
  }

  // Sales recommendations
  if (components.salesPerformance < 60) {
    recommendations.push('Review pricing strategy - Cassini favors competitive pricing')
    if (factors.ordersLast30Days < 20) {
      recommendations.push('Increase listing count to build sales velocity (Cassini signal)')
    }
  }

  // Capacity recommendations
  if (factors.utilizationPercent > 85) {
    recommendations.push('Consider upgrading eBay store subscription for more listing capacity')
  } else if (factors.utilizationPercent < 30) {
    recommendations.push('Store has significant capacity - add listings to maximize Cassini momentum')
  }

  // Compliance recommendations
  if (components.complianceScore < 80) {
    if (factors.policyViolations > 0) {
      recommendations.push('Address policy violations immediately - causes Cassini penalties')
    }
    if (factors.veroWarnings > 0) {
      recommendations.push('Remove VeRO listings - violations severely impact Cassini visibility')
    }
  }

  // Return positive if all good
  if (recommendations.length === 0) {
    if (cassiniStatus.projectedVisibility === 'high') {
      recommendations.push('Excellent Cassini optimization - maintain current practices for maximum visibility')
    } else {
      recommendations.push('Store performing well - focus on sales velocity for Cassini momentum')
    }
  }

  return recommendations.slice(0, 6)  // Max 6 recommendations (increased for Cassini)
}

function calculateAllocationCapacity(
  factors: StoreHealthFactors,
  overallScore: number,
  cassiniStatus: CassiniStoreStatus
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

  // CASSINI ADJUSTMENTS
  // Top Rated stores can handle more listings (better visibility = better conversion)
  if (cassiniStatus.isTopRated) {
    maxNewListings = Math.floor(maxNewListings * 1.2)
    optimalDaily = Math.floor(optimalDaily * 1.2)
  }

  // Top Rated Plus gets even more capacity
  if (cassiniStatus.topRatedPlusEligible) {
    maxNewListings = Math.floor(maxNewListings * 1.1)
    optimalDaily = Math.floor(optimalDaily * 1.1)
  }

  // Suppressed stores should slow down to fix metrics
  if (cassiniStatus.projectedVisibility === 'suppressed') {
    maxNewListings = Math.floor(maxNewListings * 0.25)
    optimalDaily = Math.floor(optimalDaily * 0.25)
    riskLevel = 'high'
  } else if (cassiniStatus.projectedVisibility === 'low') {
    maxNewListings = Math.floor(maxNewListings * 0.5)
    optimalDaily = Math.floor(optimalDaily * 0.5)
  }

  // High shipping risk should reduce allocation
  if (cassiniStatus.shippingScore < 50) {
    maxNewListings = Math.floor(maxNewListings * 0.7)
    optimalDaily = Math.floor(optimalDaily * 0.7)
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
      health_calculated_at: score.lastCalculated,
      // Cassini-specific fields for quick access
      cassini_visibility: score.cassiniStatus.projectedVisibility,
      cassini_shipping_score: score.cassiniStatus.shippingScore,
      cassini_readiness: score.components.cassiniReadiness,
      is_top_rated_seller: score.cassiniStatus.isTopRated
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
