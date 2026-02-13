/**
 * eBay Cassini Algorithm Optimization System
 *
 * Cassini is eBay's search algorithm that determines listing visibility.
 * This system optimizes listings and validates products/suppliers against
 * Cassini ranking factors to maximize search visibility and conversions.
 *
 * Key Cassini Ranking Factors (2026):
 * 1. Title & Keywords - 80-char titles with relevant search terms
 * 2. Item Specifics - Complete category-specific attributes
 * 3. Click-Through Rate (CTR) - High CTR signals relevance
 * 4. Conversion Rate - Sales velocity matters significantly
 * 5. Seller Performance Metrics - Top-rated sellers get boosts
 * 6. Shipping Speed - Fast handling/shipping preferred
 * 7. Returns Policy - 30-day returns recommended
 * 8. New Listing Boost - 24-48 hour visibility boost for new listings
 * 9. Mobile Optimization - Mobile-first experience
 * 10. Sales Velocity - Consistent sales momentum
 */

import { supabase } from '../supabase'

// =============================================================================
// TYPES
// =============================================================================

export interface CassiniScore {
  overall: number // 0-100
  breakdown: {
    titleOptimization: CassiniCheck
    itemSpecifics: CassiniCheck
    sellerMetrics: CassiniCheck
    shippingProfile: CassiniCheck
    returnPolicy: CassiniCheck
    priceCompetitiveness: CassiniCheck
    listingQuality: CassiniCheck
    performanceHistory: CassiniCheck
  }
  boosts: CassiniBoost[]
  penalties: CassiniPenalty[]
  recommendations: string[]
  projectedVisibility: 'high' | 'medium' | 'low' | 'suppressed'
}

export interface CassiniCheck {
  score: number // 0-100
  weight: number // Factor weight in overall score
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  details: string
  improvements?: string[]
}

export interface CassiniBoost {
  type: 'top_rated' | 'fast_shipping' | 'free_returns' | 'new_listing' | 'promoted' | 'trending'
  multiplier: number // 1.0 = no boost, 1.2 = 20% boost
  expiresAt?: string
}

export interface CassiniPenalty {
  type: 'defects' | 'late_shipments' | 'low_feedback' | 'policy_violation' | 'keyword_stuffing'
  severity: 'minor' | 'moderate' | 'severe'
  impact: number // Percentage reduction in visibility
  reason: string
}

// Seller metrics thresholds for Cassini visibility
export interface SellerMetricsThresholds {
  // eBay Performance Standards
  defectRate: {
    topRated: number // ≤0.5%
    aboveStandard: number // ≤2.0%
    belowStandard: number // >2.0%
  }
  lateShipmentRate: {
    topRated: number // ≤3.0%
    aboveStandard: number // ≤7.0%
    belowStandard: number // >7.0%
  }
  casesClosedWithoutResolution: {
    topRated: number // ≤0.3%
    aboveStandard: number // ≤0.5%
  }
  feedbackScore: {
    excellent: number // ≥99.5%
    good: number // ≥98.0%
    acceptable: number // ≥95.0%
  }
  // Response time (affects buyer experience)
  responseTimeHours: {
    excellent: number // ≤4 hours
    good: number // ≤12 hours
    acceptable: number // ≤24 hours
  }
}

export const CASSINI_THRESHOLDS: SellerMetricsThresholds = {
  defectRate: {
    topRated: 0.5,
    aboveStandard: 2.0,
    belowStandard: 2.0,
  },
  lateShipmentRate: {
    topRated: 3.0,
    aboveStandard: 7.0,
    belowStandard: 7.0,
  },
  casesClosedWithoutResolution: {
    topRated: 0.3,
    aboveStandard: 0.5,
  },
  feedbackScore: {
    excellent: 99.5,
    good: 98.0,
    acceptable: 95.0,
  },
  responseTimeHours: {
    excellent: 4,
    good: 12,
    acceptable: 24,
  },
}

// Shipping requirements for Cassini optimization
export interface ShippingRequirements {
  maxHandlingDays: number // Maximum handling time in days
  maxDeliveryDays: number // Maximum total delivery time
  requireTracking: boolean
  freeShippingThreshold?: number // Price threshold for free shipping
}

export const CASSINI_SHIPPING_REQUIREMENTS: ShippingRequirements = {
  maxHandlingDays: 1, // Same-day or next-day handling preferred
  maxDeliveryDays: 5, // 5-day delivery maximum for good standing
  requireTracking: true,
  freeShippingThreshold: 35, // Free shipping over $35 recommended
}

// =============================================================================
// SCORING WEIGHTS
// =============================================================================

const CASSINI_WEIGHTS = {
  titleOptimization: 0.15, // Keywords in title
  itemSpecifics: 0.12, // Complete item attributes
  sellerMetrics: 0.20, // Account health (critical)
  shippingProfile: 0.15, // Fast, reliable shipping
  returnPolicy: 0.08, // Buyer-friendly returns
  priceCompetitiveness: 0.12, // Market positioning
  listingQuality: 0.10, // Photos, descriptions
  performanceHistory: 0.08, // Sales velocity, CTR
}

// =============================================================================
// CASSINI SCORING ENGINE
// =============================================================================

export interface ListingData {
  title: string
  description: string
  price: number
  category: string
  itemSpecifics: Record<string, string>
  photos: number
  handlingDays: number
  shippingCost: number
  freeShipping: boolean
  returnDays: number
  freeReturns: boolean
}

export interface SellerData {
  feedbackScore: number
  feedbackCount: number
  defectRate: number
  lateShipmentRate: number
  casesRate: number
  avgResponseHours: number
  accountAgeDays: number
  isTopRated: boolean
  totalSales30d: number
  conversionRate: number
  avgDaysToShip: number
}

export interface MarketData {
  avgPrice: number
  minPrice: number
  maxPrice: number
  competitorCount: number
  avgSellThrough: number
}

export async function calculateCassiniScore(
  listing: ListingData,
  seller: SellerData,
  market: MarketData
): Promise<CassiniScore> {
  const breakdown = {
    titleOptimization: scoreTitleOptimization(listing),
    itemSpecifics: scoreItemSpecifics(listing),
    sellerMetrics: scoreSellerMetrics(seller),
    shippingProfile: scoreShippingProfile(listing, seller),
    returnPolicy: scoreReturnPolicy(listing),
    priceCompetitiveness: scorePriceCompetitiveness(listing, market),
    listingQuality: scoreListingQuality(listing),
    performanceHistory: scorePerformanceHistory(seller),
  }

  // Calculate weighted overall score
  const overall = Math.round(
    Object.entries(breakdown).reduce((sum, [key, check]) => {
      return sum + check.score * CASSINI_WEIGHTS[key as keyof typeof CASSINI_WEIGHTS]
    }, 0)
  )

  // Collect boosts
  const boosts = collectBoosts(seller, listing)

  // Collect penalties
  const penalties = collectPenalties(seller, listing)

  // Calculate final visibility projection
  let adjustedScore = overall

  for (const boost of boosts) {
    adjustedScore *= boost.multiplier
  }

  for (const penalty of penalties) {
    adjustedScore *= 1 - penalty.impact / 100
  }

  const projectedVisibility = getVisibilityLevel(adjustedScore)

  // Generate recommendations
  const recommendations = generateCassiniRecommendations(breakdown, penalties)

  return {
    overall,
    breakdown,
    boosts,
    penalties,
    recommendations,
    projectedVisibility,
  }
}

// =============================================================================
// INDIVIDUAL SCORING FUNCTIONS
// =============================================================================

function scoreTitleOptimization(listing: ListingData): CassiniCheck {
  const title = listing.title
  const titleLength = title.length

  let score = 50
  const improvements: string[] = []

  // Length optimization (80 chars ideal)
  if (titleLength >= 75 && titleLength <= 80) {
    score += 25
  } else if (titleLength >= 60) {
    score += 15
    improvements.push('Expand title to use full 80 characters')
  } else {
    score += 5
    improvements.push('Title too short - add relevant keywords')
  }

  // Check for spammy patterns (Cassini penalizes)
  const spamPatterns = /\bL@@K\b|\bWOW\b|\bAMAZING\b|\bMUST SEE\b|\!{2,}/i
  if (spamPatterns.test(title)) {
    score -= 20
    improvements.push('Remove spammy keywords (L@@K, WOW, etc.) - Cassini penalizes these')
  }

  // Check for special characters (should be minimal)
  const specialChars = (title.match(/[!@#$%^&*()+=\[\]{}|\\:";'<>?,./]/g) || []).length
  if (specialChars > 3) {
    score -= 10
    improvements.push('Reduce special characters in title')
  }

  // Check for brand name presence (usually positive)
  // This is a heuristic - first word often brand
  const words = title.split(' ')
  if (words.length >= 3 && words[0].length >= 3) {
    score += 10
  }

  score = Math.max(0, Math.min(100, score))

  return {
    score,
    weight: CASSINI_WEIGHTS.titleOptimization,
    status: getCheckStatus(score),
    details: `Title: ${titleLength}/80 characters`,
    improvements: improvements.length > 0 ? improvements : undefined,
  }
}

function scoreItemSpecifics(listing: ListingData): CassiniCheck {
  const specifics = Object.keys(listing.itemSpecifics).length
  let score = 40

  // More specifics = better (category-dependent, but generally 8-15 is good)
  if (specifics >= 12) {
    score = 100
  } else if (specifics >= 8) {
    score = 85
  } else if (specifics >= 5) {
    score = 70
  } else if (specifics >= 3) {
    score = 55
  }

  const improvements: string[] = []
  if (specifics < 8) {
    improvements.push(`Add ${8 - specifics} more item specifics for better filter visibility`)
  }

  // Check for essential specifics
  const essentialKeys = ['brand', 'model', 'color', 'size', 'material', 'condition']
  const missingEssentials = essentialKeys.filter(
    (key) => !Object.keys(listing.itemSpecifics).some((k) => k.toLowerCase().includes(key))
  )
  if (missingEssentials.length > 0) {
    score -= missingEssentials.length * 5
    improvements.push(`Add missing specifics: ${missingEssentials.join(', ')}`)
  }

  return {
    score: Math.max(0, score),
    weight: CASSINI_WEIGHTS.itemSpecifics,
    status: getCheckStatus(score),
    details: `${specifics} item specifics filled`,
    improvements: improvements.length > 0 ? improvements : undefined,
  }
}

function scoreSellerMetrics(seller: SellerData): CassiniCheck {
  let score = 100
  const improvements: string[] = []

  // Defect rate (critical)
  if (seller.defectRate <= CASSINI_THRESHOLDS.defectRate.topRated) {
    // Excellent - no deduction
  } else if (seller.defectRate <= CASSINI_THRESHOLDS.defectRate.aboveStandard) {
    score -= 15
    improvements.push('Reduce defect rate below 0.5% for Top Rated status')
  } else {
    score -= 40 // Critical - major visibility loss
    improvements.push('URGENT: Defect rate above 2% causes listing suppression')
  }

  // Late shipment rate
  if (seller.lateShipmentRate <= CASSINI_THRESHOLDS.lateShipmentRate.topRated) {
    // Excellent
  } else if (seller.lateShipmentRate <= CASSINI_THRESHOLDS.lateShipmentRate.aboveStandard) {
    score -= 10
    improvements.push('Improve shipping speed to under 3% late rate')
  } else {
    score -= 30
    improvements.push('URGENT: Late shipment rate causing visibility reduction')
  }

  // Feedback score
  if (seller.feedbackScore >= CASSINI_THRESHOLDS.feedbackScore.excellent) {
    score += 5 // Bonus
  } else if (seller.feedbackScore >= CASSINI_THRESHOLDS.feedbackScore.good) {
    // OK
  } else if (seller.feedbackScore >= CASSINI_THRESHOLDS.feedbackScore.acceptable) {
    score -= 10
    improvements.push('Improve feedback score above 98%')
  } else {
    score -= 25
    improvements.push('Low feedback score significantly impacts visibility')
  }

  // Account age (trust signal)
  if (seller.accountAgeDays < 90) {
    score -= 15
    improvements.push('New accounts have reduced visibility initially')
  } else if (seller.accountAgeDays < 180) {
    score -= 5
  }

  // Top Rated bonus
  if (seller.isTopRated) {
    score += 10
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: CASSINI_WEIGHTS.sellerMetrics,
    status: getCheckStatus(score),
    details: `Feedback: ${seller.feedbackScore}%, Defects: ${seller.defectRate}%, Late: ${seller.lateShipmentRate}%`,
    improvements: improvements.length > 0 ? improvements : undefined,
  }
}

function scoreShippingProfile(listing: ListingData, seller: SellerData): CassiniCheck {
  let score = 50
  const improvements: string[] = []

  // Handling time
  if (listing.handlingDays === 0) {
    score += 30 // Same-day shipping - major boost
  } else if (listing.handlingDays === 1) {
    score += 25 // Next-day - excellent
  } else if (listing.handlingDays <= 2) {
    score += 15
  } else if (listing.handlingDays <= 3) {
    score += 5
    improvements.push('Reduce handling time to 1-2 days')
  } else {
    score -= 10
    improvements.push('Handling time over 3 days hurts visibility')
  }

  // Free shipping
  if (listing.freeShipping) {
    score += 15
  } else if (listing.shippingCost <= 5) {
    score += 5
  } else {
    improvements.push('Consider offering free shipping for better visibility')
  }

  // Actual shipping performance
  if (seller.avgDaysToShip <= 1) {
    score += 5
  } else if (seller.avgDaysToShip > 3) {
    score -= 10
    improvements.push('Actual shipping times exceed expectations')
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: CASSINI_WEIGHTS.shippingProfile,
    status: getCheckStatus(score),
    details: `${listing.handlingDays} day handling, ${listing.freeShipping ? 'Free' : '$' + listing.shippingCost} shipping`,
    improvements: improvements.length > 0 ? improvements : undefined,
  }
}

function scoreReturnPolicy(listing: ListingData): CassiniCheck {
  let score = 50
  const improvements: string[] = []

  // Return period
  if (listing.returnDays >= 30) {
    score += 30
  } else if (listing.returnDays >= 14) {
    score += 15
    improvements.push('Extend returns to 30 days for better visibility')
  } else if (listing.returnDays > 0) {
    score += 5
    improvements.push('Short return window reduces buyer confidence')
  } else {
    score -= 20
    improvements.push('No returns policy significantly hurts visibility')
  }

  // Free returns
  if (listing.freeReturns) {
    score += 20
  } else {
    improvements.push('Consider free returns for Top Rated Plus benefits')
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: CASSINI_WEIGHTS.returnPolicy,
    status: getCheckStatus(score),
    details: `${listing.returnDays} day returns${listing.freeReturns ? ' (free)' : ''}`,
    improvements: improvements.length > 0 ? improvements : undefined,
  }
}

function scorePriceCompetitiveness(listing: ListingData, market: MarketData): CassiniCheck {
  const price = listing.price
  let score = 50
  const improvements: string[] = []

  if (market.avgPrice === 0) {
    return {
      score: 70,
      weight: CASSINI_WEIGHTS.priceCompetitiveness,
      status: 'good',
      details: 'No market data available',
    }
  }

  const priceDiff = ((price - market.avgPrice) / market.avgPrice) * 100

  if (priceDiff <= -15) {
    score = 95 // Significantly below market - very competitive
  } else if (priceDiff <= -5) {
    score = 85
  } else if (priceDiff <= 5) {
    score = 75 // At market
  } else if (priceDiff <= 15) {
    score = 60
    improvements.push('Price slightly above market average')
  } else if (priceDiff <= 30) {
    score = 45
    improvements.push('Consider lowering price to be more competitive')
  } else {
    score = 30
    improvements.push('Price significantly above market - may affect conversions')
  }

  // Competition level
  if (market.competitorCount > 50) {
    score -= 5
  } else if (market.competitorCount < 10) {
    score += 5
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: CASSINI_WEIGHTS.priceCompetitiveness,
    status: getCheckStatus(score),
    details: `$${price} vs market avg $${market.avgPrice.toFixed(2)} (${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(1)}%)`,
    improvements: improvements.length > 0 ? improvements : undefined,
  }
}

function scoreListingQuality(listing: ListingData): CassiniCheck {
  let score = 50
  const improvements: string[] = []

  // Photo count (12 photos ideal)
  if (listing.photos >= 12) {
    score += 30
  } else if (listing.photos >= 8) {
    score += 20
  } else if (listing.photos >= 4) {
    score += 10
    improvements.push('Add more photos (8-12 recommended)')
  } else {
    improvements.push('More photos significantly improve conversion')
  }

  // Description length (300-1000 words ideal)
  const descWords = listing.description.split(/\s+/).length
  if (descWords >= 300 && descWords <= 1000) {
    score += 20
  } else if (descWords >= 150) {
    score += 10
    improvements.push('Expand description to 300+ words')
  } else {
    improvements.push('Description too short - impacts buyer confidence')
  }

  // Check for HTML/formatting
  if (listing.description.includes('<') || listing.description.includes('style=')) {
    score += 5 // Formatted descriptions
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: CASSINI_WEIGHTS.listingQuality,
    status: getCheckStatus(score),
    details: `${listing.photos} photos, ${descWords} word description`,
    improvements: improvements.length > 0 ? improvements : undefined,
  }
}

function scorePerformanceHistory(seller: SellerData): CassiniCheck {
  let score = 50
  const improvements: string[] = []

  // Sales velocity (last 30 days)
  if (seller.totalSales30d >= 100) {
    score += 30
  } else if (seller.totalSales30d >= 50) {
    score += 20
  } else if (seller.totalSales30d >= 20) {
    score += 10
  } else {
    improvements.push('Increase sales velocity for better rankings')
  }

  // Conversion rate
  if (seller.conversionRate >= 5) {
    score += 20
  } else if (seller.conversionRate >= 3) {
    score += 10
  } else if (seller.conversionRate >= 1) {
    score += 5
  } else {
    improvements.push('Low conversion rate - optimize listings')
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: CASSINI_WEIGHTS.performanceHistory,
    status: getCheckStatus(score),
    details: `${seller.totalSales30d} sales/30d, ${seller.conversionRate.toFixed(1)}% conversion`,
    improvements: improvements.length > 0 ? improvements : undefined,
  }
}

// =============================================================================
// BOOST & PENALTY COLLECTION
// =============================================================================

function collectBoosts(seller: SellerData, listing: ListingData): CassiniBoost[] {
  const boosts: CassiniBoost[] = []

  // Top Rated Seller
  if (seller.isTopRated) {
    boosts.push({
      type: 'top_rated',
      multiplier: 1.15, // ~15% visibility boost
    })
  }

  // Fast shipping
  if (listing.handlingDays <= 1 && seller.avgDaysToShip <= 2) {
    boosts.push({
      type: 'fast_shipping',
      multiplier: 1.1,
    })
  }

  // Free returns
  if (listing.freeReturns && listing.returnDays >= 30) {
    boosts.push({
      type: 'free_returns',
      multiplier: 1.08,
    })
  }

  return boosts
}

function collectPenalties(seller: SellerData, listing: ListingData): CassiniPenalty[] {
  const penalties: CassiniPenalty[] = []

  // High defect rate
  if (seller.defectRate > CASSINI_THRESHOLDS.defectRate.aboveStandard) {
    penalties.push({
      type: 'defects',
      severity: seller.defectRate > 4 ? 'severe' : 'moderate',
      impact: seller.defectRate > 4 ? 50 : 25,
      reason: `Defect rate ${seller.defectRate.toFixed(2)}% exceeds threshold`,
    })
  }

  // Late shipments
  if (seller.lateShipmentRate > CASSINI_THRESHOLDS.lateShipmentRate.aboveStandard) {
    penalties.push({
      type: 'late_shipments',
      severity: seller.lateShipmentRate > 10 ? 'severe' : 'moderate',
      impact: seller.lateShipmentRate > 10 ? 40 : 20,
      reason: `Late shipment rate ${seller.lateShipmentRate.toFixed(2)}% exceeds threshold`,
    })
  }

  // Low feedback
  if (seller.feedbackScore < CASSINI_THRESHOLDS.feedbackScore.acceptable) {
    penalties.push({
      type: 'low_feedback',
      severity: seller.feedbackScore < 90 ? 'severe' : 'moderate',
      impact: seller.feedbackScore < 90 ? 35 : 15,
      reason: `Feedback score ${seller.feedbackScore.toFixed(1)}% below threshold`,
    })
  }

  // Keyword stuffing check
  const spamPatterns = /\bL@@K\b|\bWOW\b|\bAMAZING\b|\bMUST SEE\b|\!{3,}/i
  if (spamPatterns.test(listing.title)) {
    penalties.push({
      type: 'keyword_stuffing',
      severity: 'minor',
      impact: 10,
      reason: 'Spammy keywords in title',
    })
  }

  return penalties
}

// =============================================================================
// HELPERS
// =============================================================================

function getCheckStatus(score: number): CassiniCheck['status'] {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 55) return 'fair'
  if (score >= 40) return 'poor'
  return 'critical'
}

function getVisibilityLevel(adjustedScore: number): CassiniScore['projectedVisibility'] {
  if (adjustedScore >= 80) return 'high'
  if (adjustedScore >= 60) return 'medium'
  if (adjustedScore >= 40) return 'low'
  return 'suppressed'
}

function generateCassiniRecommendations(
  breakdown: CassiniScore['breakdown'],
  penalties: CassiniPenalty[]
): string[] {
  const recommendations: string[] = []

  // Priority: Fix penalties first
  for (const penalty of penalties) {
    if (penalty.severity === 'severe') {
      recommendations.push(`CRITICAL: ${penalty.reason} - fix immediately`)
    }
  }

  // Collect all improvements from checks
  const checks = Object.values(breakdown)
  for (const check of checks) {
    if (check.improvements && check.status !== 'excellent' && check.status !== 'good') {
      recommendations.push(...check.improvements)
    }
  }

  // Prioritize by impact
  return recommendations.slice(0, 8) // Max 8 recommendations
}

// =============================================================================
// SUPPLIER CASSINI VALIDATION
// =============================================================================

export interface SupplierCassiniRequirements {
  maxHandlingDays: number
  maxTotalDeliveryDays: number
  requiresTracking: boolean
  minReliabilityScore: number // 0-100
  acceptedFulfillmentTypes: ('fba' | 'fbm' | 'dropship' | 'warehouse')[]
}

export const DEFAULT_CASSINI_SUPPLIER_REQUIREMENTS: SupplierCassiniRequirements = {
  maxHandlingDays: 2, // Max 2 days before shipping
  maxTotalDeliveryDays: 7, // Max 7 days total
  requiresTracking: true,
  minReliabilityScore: 70,
  acceptedFulfillmentTypes: ['fba', 'fbm', 'dropship', 'warehouse'],
}

export interface SupplierShippingProfile {
  fulfillmentType: 'fba' | 'fbm' | 'dropship' | 'warehouse'
  estimatedHandlingDays: number
  estimatedShippingDays: number
  totalDeliveryDays: number
  hasTracking: boolean
  onTimeDeliveryRate: number // 0-100
  supplierRating: number // 0-5
  supplierReviewCount: number
}

export interface SupplierCassiniValidation {
  isValid: boolean
  score: number // 0-100
  shippingProfile: SupplierShippingProfile
  meetsShippingRequirements: boolean
  meetsReliabilityRequirements: boolean
  riskToSellerMetrics: 'low' | 'medium' | 'high' | 'critical'
  warnings: string[]
  blockers: string[]
  recommendations: string[]
}

export function validateSupplierForCassini(
  shipping: SupplierShippingProfile,
  requirements: Partial<SupplierCassiniRequirements> = {}
): SupplierCassiniValidation {
  const req = { ...DEFAULT_CASSINI_SUPPLIER_REQUIREMENTS, ...requirements }
  const warnings: string[] = []
  const blockers: string[] = []
  const recommendations: string[] = []
  let score = 100

  // Check fulfillment type
  if (!req.acceptedFulfillmentTypes.includes(shipping.fulfillmentType)) {
    blockers.push(`Fulfillment type '${shipping.fulfillmentType}' not accepted`)
    score -= 50
  }

  // Check handling time
  if (shipping.estimatedHandlingDays > req.maxHandlingDays) {
    score -= 20
    if (shipping.estimatedHandlingDays > req.maxHandlingDays + 2) {
      blockers.push(`Handling time ${shipping.estimatedHandlingDays} days exceeds maximum ${req.maxHandlingDays} days`)
    } else {
      warnings.push(`Handling time ${shipping.estimatedHandlingDays} days above ideal ${req.maxHandlingDays} days`)
    }
  }

  // Check total delivery time
  if (shipping.totalDeliveryDays > req.maxTotalDeliveryDays) {
    score -= 25
    if (shipping.totalDeliveryDays > req.maxTotalDeliveryDays + 3) {
      blockers.push(`Total delivery ${shipping.totalDeliveryDays} days exceeds maximum ${req.maxTotalDeliveryDays} days`)
    } else {
      warnings.push(`Delivery time ${shipping.totalDeliveryDays} days above ideal ${req.maxTotalDeliveryDays} days`)
    }
  }

  // Check tracking
  if (req.requiresTracking && !shipping.hasTracking) {
    blockers.push('Tracking required but supplier does not provide tracking')
    score -= 30
  }

  // Check on-time delivery rate (critical for late shipment rate)
  if (shipping.onTimeDeliveryRate < 95) {
    score -= 20
    if (shipping.onTimeDeliveryRate < 85) {
      blockers.push(`On-time delivery rate ${shipping.onTimeDeliveryRate}% too low - will impact seller metrics`)
    } else {
      warnings.push(`On-time delivery rate ${shipping.onTimeDeliveryRate}% below ideal 95%`)
    }
  }

  // Check supplier rating
  if (shipping.supplierRating < 4.0 && shipping.supplierReviewCount >= 50) {
    score -= 15
    warnings.push(`Supplier rating ${shipping.supplierRating}/5 below recommended 4.0`)
  }

  if (shipping.supplierReviewCount < 10) {
    score -= 10
    warnings.push('Supplier has limited review history')
  }

  // Fulfillment type bonuses/penalties
  switch (shipping.fulfillmentType) {
    case 'fba':
      score += 10 // FBA most reliable
      break
    case 'warehouse':
      score += 5 // Own warehouse good
      break
    case 'dropship':
      score -= 5 // Dropship more variable
      recommendations.push('Dropship suppliers require careful monitoring of delivery times')
      break
  }

  // Calculate risk to seller metrics
  let riskLevel: SupplierCassiniValidation['riskToSellerMetrics']
  if (blockers.length > 0 || score < 50) {
    riskLevel = 'critical'
  } else if (warnings.length >= 3 || score < 65) {
    riskLevel = 'high'
  } else if (warnings.length >= 1 || score < 80) {
    riskLevel = 'medium'
  } else {
    riskLevel = 'low'
  }

  // Generate recommendations
  if (shipping.estimatedHandlingDays > 1) {
    recommendations.push('Set eBay handling time 1 day above supplier estimate for safety')
  }
  if (shipping.fulfillmentType === 'dropship') {
    recommendations.push('Monitor this supplier closely for delivery time consistency')
  }
  if (riskLevel === 'medium' || riskLevel === 'high') {
    recommendations.push('Consider alternative suppliers to reduce seller metric risk')
  }

  const isValid = blockers.length === 0 && score >= 60
  const meetsShippingRequirements =
    shipping.totalDeliveryDays <= req.maxTotalDeliveryDays &&
    shipping.estimatedHandlingDays <= req.maxHandlingDays &&
    (shipping.hasTracking || !req.requiresTracking)
  const meetsReliabilityRequirements = shipping.onTimeDeliveryRate >= 90 && score >= req.minReliabilityScore

  return {
    isValid,
    score: Math.max(0, Math.min(100, score)),
    shippingProfile: shipping,
    meetsShippingRequirements,
    meetsReliabilityRequirements,
    riskToSellerMetrics: riskLevel,
    warnings,
    blockers,
    recommendations,
  }
}

// =============================================================================
// DATABASE INTEGRATION
// =============================================================================

export async function saveCassiniScore(
  listingId: string,
  score: CassiniScore
): Promise<void> {
  await supabase.from('cassini_scores').upsert({
    listing_id: listingId,
    overall_score: score.overall,
    breakdown: score.breakdown,
    boosts: score.boosts,
    penalties: score.penalties,
    recommendations: score.recommendations,
    projected_visibility: score.projectedVisibility,
    calculated_at: new Date().toISOString(),
  }, {
    onConflict: 'listing_id',
  })
}

export async function getListingsNeedingOptimization(
  userId?: string,
  limit = 50
): Promise<Array<{ listingId: string; currentScore: number; issues: string[] }>> {
  let query = supabase
    .from('cassini_scores')
    .select(`
      listing_id,
      overall_score,
      penalties,
      recommendations,
      listings!inner(
        id,
        store_id,
        stores!inner(user_id)
      )
    `)
    .lt('overall_score', 70)
    .order('overall_score', { ascending: true })
    .limit(limit)

  if (userId) {
    query = query.eq('listings.stores.user_id', userId)
  }

  const { data } = await query

  return (data || []).map((row) => ({
    listingId: row.listing_id,
    currentScore: row.overall_score,
    issues: row.recommendations.slice(0, 5),
  }))
}

// =============================================================================
// BATCH ANALYSIS
// =============================================================================

export interface CassiniBatchResult {
  analyzed: number
  avgScore: number
  scoreDistribution: {
    excellent: number // 85+
    good: number // 70-84
    fair: number // 55-69
    poor: number // 40-54
    critical: number // <40
  }
  commonIssues: Array<{ issue: string; count: number }>
  topRecommendations: string[]
}

export async function analyzeListingsBatch(
  listingIds: string[]
): Promise<CassiniBatchResult> {
  const { data: scores } = await supabase
    .from('cassini_scores')
    .select('overall_score, recommendations, penalties')
    .in('listing_id', listingIds)

  if (!scores || scores.length === 0) {
    return {
      analyzed: 0,
      avgScore: 0,
      scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 },
      commonIssues: [],
      topRecommendations: [],
    }
  }

  const distribution = { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 }
  const issueMap = new Map<string, number>()
  let totalScore = 0

  for (const score of scores) {
    totalScore += score.overall_score

    if (score.overall_score >= 85) distribution.excellent++
    else if (score.overall_score >= 70) distribution.good++
    else if (score.overall_score >= 55) distribution.fair++
    else if (score.overall_score >= 40) distribution.poor++
    else distribution.critical++

    for (const rec of score.recommendations || []) {
      issueMap.set(rec, (issueMap.get(rec) || 0) + 1)
    }
  }

  const commonIssues = Array.from(issueMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }))

  return {
    analyzed: scores.length,
    avgScore: Math.round(totalScore / scores.length),
    scoreDistribution: distribution,
    commonIssues,
    topRecommendations: commonIssues.slice(0, 5).map((i) => i.issue),
  }
}
