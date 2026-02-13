/**
 * Enhanced Supplier Validation Service
 *
 * Validates suppliers (Amazon, wholesale, dropship) for eBay reselling:
 * - Price stability and profit margins
 * - Stock availability and reliability
 * - Shipping time validation (critical for Cassini/seller metrics)
 * - Seller reputation assessment
 * - Risk scoring for seller metric impact
 *
 * Supports multiple fulfillment types: FBA, FBM, Dropship, Warehouse
 */

import { getKeepaClient, type KeepaProduct, type KeepaProductStats } from '../integrations/keepa'
import { supabase } from '../supabase'
import {
  validateSupplierForCassini,
  type SupplierShippingProfile,
  type SupplierCassiniValidation,
  CASSINI_THRESHOLDS,
} from './cassini-optimizer'

// =============================================================================
// TYPES
// =============================================================================

export type FulfillmentType = 'fba' | 'fbm' | 'dropship' | 'warehouse' | 'unknown'

export interface SupplierValidationResult {
  asin: string
  isValid: boolean
  overallScore: number // 0-100

  // Individual checks
  checks: {
    priceStability: ValidationCheck
    stockAvailability: ValidationCheck
    sellerReputation: ValidationCheck
    shippingReliability: ValidationCheck
    demandConfidence: ValidationCheck
    profitViability: ValidationCheck
    cassiniCompliance: ValidationCheck // New: Cassini-specific validation
  }

  // Extracted data
  supplierData: {
    currentPrice: number | null
    avgPrice30d: number | null
    avgPrice90d: number | null
    priceVolatility: number // % standard deviation
    inStock: boolean
    stockConfidence: number // 0-100
    fulfillmentType: FulfillmentType
    isFBA: boolean // Legacy support
    sellerCount: number
    salesRank: number | null
    salesRankCategory: string | null
    reviewCount: number
    rating: number | null
    estimatedMonthlySales: number | null
  }

  // Shipping validation
  shippingValidation: {
    estimatedHandlingDays: number
    estimatedShippingDays: number
    totalDeliveryDays: number
    meetsEbayStandards: boolean
    riskToSellerMetrics: 'low' | 'medium' | 'high' | 'critical'
    hasTracking: boolean
    onTimeDeliveryRate: number
  }

  // Cassini impact
  cassiniImpact: {
    projectedVisibility: 'high' | 'medium' | 'low' | 'suppressed'
    sellerMetricRisk: string[]
    shippingScoreImpact: number // -50 to +20
  }

  // Recommendations
  recommendations: string[]
  blockers: string[]
  warnings: string[]

  validatedAt: string
}

export interface ValidationCheck {
  passed: boolean
  score: number // 0-100
  reason: string
  details?: Record<string, unknown>
}

export interface SupplierValidationConfig {
  // Price validation
  minPriceStability: number // Max % price volatility allowed (default: 20%)
  minProfitMargin: number // Min profit margin % (default: 15%)

  // Stock validation
  minStockConfidence: number // Min stock confidence (default: 60)

  // Seller validation
  minSellerReputation: number // Min seller score (default: 70)
  minDemandConfidence: number // Min demand score (default: 50)
  maxSellerCount: number // Max competing sellers (default: 50)
  minSalesRank: number // Max acceptable sales rank (default: 500000)

  // Fulfillment preferences (no longer FBA-only)
  acceptedFulfillmentTypes: FulfillmentType[] // All types accepted by default
  preferredFulfillmentTypes: FulfillmentType[] // Scoring boost for these

  // Shipping requirements (Cassini compliance)
  maxHandlingDays: number // Max handling time (default: 2)
  maxTotalDeliveryDays: number // Max total delivery (default: 7)
  minOnTimeDeliveryRate: number // Min on-time rate (default: 90%)
  requireTracking: boolean // Require tracking (default: true)

  // Legacy
  preferFBA: boolean // Deprecated - use preferredFulfillmentTypes
}

const DEFAULT_CONFIG: SupplierValidationConfig = {
  // Price
  minPriceStability: 20,
  minProfitMargin: 15,

  // Stock
  minStockConfidence: 60, // Lowered from 70 to support more fulfillment types

  // Seller
  minSellerReputation: 70, // Lowered from 80
  minDemandConfidence: 50,
  maxSellerCount: 50,
  minSalesRank: 500000,

  // Fulfillment - accept all types
  acceptedFulfillmentTypes: ['fba', 'fbm', 'dropship', 'warehouse'],
  preferredFulfillmentTypes: ['fba', 'warehouse'], // These get scoring bonus

  // Shipping requirements for Cassini
  maxHandlingDays: 2,
  maxTotalDeliveryDays: 7,
  minOnTimeDeliveryRate: 90,
  requireTracking: true,

  // Legacy
  preferFBA: false, // Deprecated
}

// Shipping estimates by fulfillment type
const SHIPPING_ESTIMATES: Record<FulfillmentType, { handling: number; shipping: number; onTimeRate: number }> = {
  fba: { handling: 0, shipping: 2, onTimeRate: 98 },
  warehouse: { handling: 1, shipping: 3, onTimeRate: 95 },
  fbm: { handling: 1, shipping: 4, onTimeRate: 90 },
  dropship: { handling: 2, shipping: 5, onTimeRate: 85 },
  unknown: { handling: 3, shipping: 5, onTimeRate: 75 },
}

// =============================================================================
// VALIDATION LOGIC
// =============================================================================

export async function validateSupplier(
  asin: string,
  targetSellPrice?: number,
  config: Partial<SupplierValidationConfig> = {}
): Promise<SupplierValidationResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  try {
    const keepa = getKeepaClient()
    const products = await keepa.getProducts([asin], { stats: 180 })

    if (products.length === 0) {
      return createFailedResult(asin, 'Product not found on Amazon')
    }

    const product = products[0]

    // Extract supplier data
    const supplierData = extractSupplierData(product)

    // Check if fulfillment type is accepted
    if (!cfg.acceptedFulfillmentTypes.includes(supplierData.fulfillmentType)) {
      return createFailedResult(
        asin,
        `Fulfillment type '${supplierData.fulfillmentType}' not accepted`
      )
    }

    // Calculate shipping validation
    const shippingValidation = calculateShippingValidation(supplierData, cfg)

    // Run validation checks
    const checks = {
      priceStability: checkPriceStability(supplierData, cfg),
      stockAvailability: checkStockAvailability(product, supplierData, cfg),
      sellerReputation: checkSellerReputation(supplierData, cfg),
      shippingReliability: checkShippingReliability(supplierData, shippingValidation, cfg),
      demandConfidence: checkDemandConfidence(supplierData, cfg),
      profitViability: checkProfitViability(supplierData, targetSellPrice, cfg),
      cassiniCompliance: checkCassiniCompliance(shippingValidation, cfg),
    }

    // Calculate overall score with updated weights
    const weights = {
      priceStability: 0.15,
      stockAvailability: 0.20,
      sellerReputation: 0.10,
      shippingReliability: 0.20, // Increased weight for shipping
      demandConfidence: 0.10,
      profitViability: 0.15,
      cassiniCompliance: 0.10, // New weight for Cassini
    }

    const overallScore = Object.entries(checks).reduce(
      (sum, [key, check]) => sum + check.score * weights[key as keyof typeof weights],
      0
    )

    // Determine if valid
    const blockers = Object.entries(checks)
      .filter(([_, check]) => !check.passed)
      .map(([key, check]) => `${key}: ${check.reason}`)

    const warnings = Object.entries(checks)
      .filter(([_, check]) => check.passed && check.score < 70)
      .map(([key, check]) => `${key}: ${check.reason}`)

    // Calculate Cassini impact
    const cassiniImpact = calculateCassiniImpact(checks, shippingValidation)

    const recommendations = generateRecommendations(checks, supplierData, shippingValidation, cfg)

    const isValid = blockers.length === 0 && overallScore >= 55 // Lowered threshold

    return {
      asin,
      isValid,
      overallScore: Math.round(overallScore),
      checks,
      supplierData,
      shippingValidation,
      cassiniImpact,
      recommendations,
      blockers,
      warnings,
      validatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('[SupplierValidator] Error:', error)
    return createFailedResult(asin, error instanceof Error ? error.message : 'Validation failed')
  }
}

function extractSupplierData(product: KeepaProduct): SupplierValidationResult['supplierData'] {
  const stats = product.stats

  // Current prices from csv array (index 1 = NEW price, index 10 = NEW_FBA price)
  const currentNew =
    stats?.current?.[1] !== undefined && stats.current[1] > 0 ? stats.current[1] / 100 : null
  const currentFBA =
    stats?.current?.[10] !== undefined && stats.current[10] > 0 ? stats.current[10] / 100 : null

  const currentPrice = currentFBA || currentNew

  // Average prices
  const avg30New = stats?.avg30?.[1] !== undefined ? stats.avg30[1] / 100 : null
  const avg90New = stats?.avg90?.[1] !== undefined ? stats.avg90[1] / 100 : null

  // Calculate price volatility
  let priceVolatility = 0
  if (stats?.min?.[1] && stats?.max?.[1]) {
    const minPrice = Math.min(...stats.min[1].filter((p) => p > 0)) / 100
    const maxPrice = Math.max(...stats.max[1].filter((p) => p > 0)) / 100
    if (minPrice > 0 && maxPrice > 0) {
      const avgPrice = (minPrice + maxPrice) / 2
      priceVolatility = ((maxPrice - minPrice) / avgPrice) * 100
    }
  }

  // Stock availability
  const inStock = product.availabilityAmazon !== undefined && product.availabilityAmazon >= 0
  const stockConfidence = inStock ? 85 : 20

  // Determine fulfillment type
  const isFBA = currentFBA !== null
  let fulfillmentType: FulfillmentType = 'unknown'
  if (isFBA) {
    fulfillmentType = 'fba'
  } else if (inStock) {
    fulfillmentType = 'fbm'
  }

  // Seller count
  const sellerCountNew = stats?.current?.[11] || 0

  // Sales rank
  const salesRank = stats?.current?.[3] || null

  // Reviews
  const reviewCount = stats?.current?.[17] || 0
  const rating = stats?.current?.[16] ? stats.current[16] / 10 : null

  // Estimate monthly sales based on sales rank
  let estimatedMonthlySales: number | null = null
  if (salesRank) {
    if (salesRank <= 1000) estimatedMonthlySales = 3000
    else if (salesRank <= 5000) estimatedMonthlySales = 1000
    else if (salesRank <= 20000) estimatedMonthlySales = 300
    else if (salesRank <= 100000) estimatedMonthlySales = 50
    else if (salesRank <= 500000) estimatedMonthlySales = 10
    else estimatedMonthlySales = 1
  }

  return {
    currentPrice,
    avgPrice30d: avg30New,
    avgPrice90d: avg90New,
    priceVolatility,
    inStock,
    stockConfidence,
    fulfillmentType,
    isFBA,
    sellerCount: sellerCountNew,
    salesRank,
    salesRankCategory: null,
    reviewCount,
    rating,
    estimatedMonthlySales,
  }
}

function calculateShippingValidation(
  supplierData: SupplierValidationResult['supplierData'],
  config: SupplierValidationConfig
): SupplierValidationResult['shippingValidation'] {
  const fulfillmentType = supplierData.fulfillmentType
  const estimates = SHIPPING_ESTIMATES[fulfillmentType]

  const totalDeliveryDays = estimates.handling + estimates.shipping
  const meetsEbayStandards =
    totalDeliveryDays <= config.maxTotalDeliveryDays &&
    estimates.handling <= config.maxHandlingDays &&
    estimates.onTimeRate >= config.minOnTimeDeliveryRate

  // Calculate risk to seller metrics
  let riskLevel: SupplierValidationResult['shippingValidation']['riskToSellerMetrics']
  if (estimates.onTimeRate < 80 || totalDeliveryDays > 10) {
    riskLevel = 'critical'
  } else if (estimates.onTimeRate < 85 || totalDeliveryDays > 7) {
    riskLevel = 'high'
  } else if (estimates.onTimeRate < 92 || totalDeliveryDays > 5) {
    riskLevel = 'medium'
  } else {
    riskLevel = 'low'
  }

  return {
    estimatedHandlingDays: estimates.handling,
    estimatedShippingDays: estimates.shipping,
    totalDeliveryDays,
    meetsEbayStandards,
    riskToSellerMetrics: riskLevel,
    hasTracking: fulfillmentType !== 'unknown',
    onTimeDeliveryRate: estimates.onTimeRate,
  }
}

// =============================================================================
// INDIVIDUAL CHECKS
// =============================================================================

function checkPriceStability(
  data: SupplierValidationResult['supplierData'],
  config: SupplierValidationConfig
): ValidationCheck {
  if (data.priceVolatility > config.minPriceStability * 2) {
    return {
      passed: false,
      score: 20,
      reason: `Price volatility too high: ${data.priceVolatility.toFixed(1)}%`,
      details: { volatility: data.priceVolatility, threshold: config.minPriceStability * 2 },
    }
  }

  if (data.priceVolatility > config.minPriceStability) {
    return {
      passed: true,
      score: 60,
      reason: `Price somewhat volatile: ${data.priceVolatility.toFixed(1)}%`,
      details: { volatility: data.priceVolatility },
    }
  }

  return {
    passed: true,
    score: 90,
    reason: 'Price stable',
    details: { volatility: data.priceVolatility },
  }
}

function checkStockAvailability(
  product: KeepaProduct,
  data: SupplierValidationResult['supplierData'],
  config: SupplierValidationConfig
): ValidationCheck {
  if (!data.inStock) {
    return {
      passed: false,
      score: 0,
      reason: 'Product currently out of stock',
    }
  }

  if (data.stockConfidence < config.minStockConfidence) {
    return {
      passed: false,
      score: 30,
      reason: `Low stock confidence: ${data.stockConfidence}%`,
      details: { confidence: data.stockConfidence },
    }
  }

  // Score based on fulfillment type reliability
  const fulfillmentScores: Record<FulfillmentType, number> = {
    fba: 95,
    warehouse: 90,
    fbm: 80,
    dropship: 70,
    unknown: 50,
  }

  const score = fulfillmentScores[data.fulfillmentType]

  return {
    passed: true,
    score,
    reason: `In stock via ${data.fulfillmentType.toUpperCase()}`,
    details: { fulfillmentType: data.fulfillmentType },
  }
}

function checkSellerReputation(
  data: SupplierValidationResult['supplierData'],
  config: SupplierValidationConfig
): ValidationCheck {
  if (data.reviewCount < 10) {
    return {
      passed: false,
      score: 30,
      reason: 'Insufficient reviews for reliability assessment',
      details: { reviewCount: data.reviewCount },
    }
  }

  if (data.rating !== null && data.rating < 3.5) {
    return {
      passed: false,
      score: 25,
      reason: `Poor product rating: ${data.rating}/5`,
      details: { rating: data.rating },
    }
  }

  if (data.rating !== null && data.rating >= 4.5 && data.reviewCount >= 100) {
    return {
      passed: true,
      score: 95,
      reason: `Excellent rating (${data.rating}/5) with ${data.reviewCount} reviews`,
    }
  }

  if (data.rating !== null && data.rating >= 4.0) {
    return {
      passed: true,
      score: 80,
      reason: `Good rating: ${data.rating}/5`,
    }
  }

  return {
    passed: true,
    score: 65,
    reason: 'Acceptable seller ecosystem',
  }
}

function checkShippingReliability(
  data: SupplierValidationResult['supplierData'],
  shipping: SupplierValidationResult['shippingValidation'],
  config: SupplierValidationConfig
): ValidationCheck {
  // Critical: Check if shipping meets requirements
  if (shipping.riskToSellerMetrics === 'critical') {
    return {
      passed: false,
      score: 20,
      reason: `Shipping risk critical: ${shipping.totalDeliveryDays} days, ${shipping.onTimeDeliveryRate}% on-time`,
      details: shipping,
    }
  }

  if (shipping.riskToSellerMetrics === 'high') {
    return {
      passed: true, // Pass but with low score
      score: 50,
      reason: `Shipping risk high: ${shipping.totalDeliveryDays} days delivery`,
      details: shipping,
    }
  }

  // Score based on total delivery time and reliability
  let score = 50

  // Delivery time scoring
  if (shipping.totalDeliveryDays <= 3) {
    score += 30
  } else if (shipping.totalDeliveryDays <= 5) {
    score += 20
  } else if (shipping.totalDeliveryDays <= 7) {
    score += 10
  }

  // On-time rate scoring
  if (shipping.onTimeDeliveryRate >= 98) {
    score += 20
  } else if (shipping.onTimeDeliveryRate >= 95) {
    score += 15
  } else if (shipping.onTimeDeliveryRate >= 90) {
    score += 10
  }

  // Tracking bonus
  if (shipping.hasTracking) {
    score += 5
  }

  return {
    passed: true,
    score: Math.min(100, score),
    reason: `${shipping.totalDeliveryDays} day delivery, ${shipping.onTimeDeliveryRate}% on-time`,
    details: shipping,
  }
}

function checkDemandConfidence(
  data: SupplierValidationResult['supplierData'],
  config: SupplierValidationConfig
): ValidationCheck {
  if (data.salesRank === null) {
    return {
      passed: true,
      score: 50,
      reason: 'No sales rank data available',
    }
  }

  if (data.salesRank > config.minSalesRank) {
    return {
      passed: false,
      score: 20,
      reason: `Poor sales rank: #${data.salesRank.toLocaleString()}`,
      details: { salesRank: data.salesRank, threshold: config.minSalesRank },
    }
  }

  if (data.salesRank <= 10000) {
    return {
      passed: true,
      score: 95,
      reason: `Excellent sales rank: #${data.salesRank.toLocaleString()}`,
    }
  }

  if (data.salesRank <= 50000) {
    return {
      passed: true,
      score: 85,
      reason: `Good sales rank: #${data.salesRank.toLocaleString()}`,
    }
  }

  if (data.salesRank <= 200000) {
    return {
      passed: true,
      score: 70,
      reason: `Moderate sales rank: #${data.salesRank.toLocaleString()}`,
    }
  }

  return {
    passed: true,
    score: 55,
    reason: `Below average sales rank: #${data.salesRank.toLocaleString()}`,
  }
}

function checkProfitViability(
  data: SupplierValidationResult['supplierData'],
  targetSellPrice: number | undefined,
  config: SupplierValidationConfig
): ValidationCheck {
  if (data.currentPrice === null) {
    return {
      passed: false,
      score: 0,
      reason: 'No current price available',
    }
  }

  if (!targetSellPrice) {
    return {
      passed: true,
      score: 70,
      reason: 'No target sell price provided for margin check',
    }
  }

  // Calculate potential margin
  // eBay fees ~13% + PayPal ~3% = ~16%
  const ebayFees = targetSellPrice * 0.16
  const netRevenue = targetSellPrice - ebayFees
  const profit = netRevenue - data.currentPrice
  const marginPercent = (profit / targetSellPrice) * 100

  if (marginPercent < 0) {
    return {
      passed: false,
      score: 0,
      reason: `Negative margin: ${marginPercent.toFixed(1)}%`,
      details: {
        sourcePrice: data.currentPrice,
        targetPrice: targetSellPrice,
        fees: ebayFees,
        profit,
      },
    }
  }

  if (marginPercent < config.minProfitMargin) {
    return {
      passed: false,
      score: 30,
      reason: `Margin below threshold: ${marginPercent.toFixed(1)}% (min: ${config.minProfitMargin}%)`,
      details: { marginPercent, profit },
    }
  }

  if (marginPercent >= 30) {
    return {
      passed: true,
      score: 95,
      reason: `Excellent margin: ${marginPercent.toFixed(1)}% ($${profit.toFixed(2)})`,
      details: { marginPercent, profit },
    }
  }

  if (marginPercent >= 20) {
    return {
      passed: true,
      score: 85,
      reason: `Good margin: ${marginPercent.toFixed(1)}% ($${profit.toFixed(2)})`,
      details: { marginPercent, profit },
    }
  }

  return {
    passed: true,
    score: 70,
    reason: `Acceptable margin: ${marginPercent.toFixed(1)}% ($${profit.toFixed(2)})`,
    details: { marginPercent, profit },
  }
}

function checkCassiniCompliance(
  shipping: SupplierValidationResult['shippingValidation'],
  config: SupplierValidationConfig
): ValidationCheck {
  // Create shipping profile for Cassini validation
  const shippingProfile: SupplierShippingProfile = {
    fulfillmentType: 'fbm', // Will be overridden
    estimatedHandlingDays: shipping.estimatedHandlingDays,
    estimatedShippingDays: shipping.estimatedShippingDays,
    totalDeliveryDays: shipping.totalDeliveryDays,
    hasTracking: shipping.hasTracking,
    onTimeDeliveryRate: shipping.onTimeDeliveryRate,
    supplierRating: 4.0, // Default assumption
    supplierReviewCount: 100,
  }

  // Check against Cassini requirements
  if (!shipping.meetsEbayStandards) {
    return {
      passed: false,
      score: 30,
      reason: 'Does not meet eBay shipping standards for good visibility',
      details: {
        maxHandling: config.maxHandlingDays,
        actualHandling: shipping.estimatedHandlingDays,
        maxDelivery: config.maxTotalDeliveryDays,
        actualDelivery: shipping.totalDeliveryDays,
      },
    }
  }

  // Score based on how well it exceeds minimum requirements
  let score = 60

  // Better than minimum handling time
  if (shipping.estimatedHandlingDays === 0) {
    score += 25
  } else if (shipping.estimatedHandlingDays === 1) {
    score += 15
  }

  // On-time delivery rate
  if (shipping.onTimeDeliveryRate >= 98) {
    score += 15
  } else if (shipping.onTimeDeliveryRate >= 95) {
    score += 10
  }

  return {
    passed: true,
    score: Math.min(100, score),
    reason: `Cassini compliant: ${shipping.totalDeliveryDays}d delivery, ${shipping.onTimeDeliveryRate}% on-time`,
  }
}

// =============================================================================
// CASSINI IMPACT CALCULATION
// =============================================================================

function calculateCassiniImpact(
  checks: SupplierValidationResult['checks'],
  shipping: SupplierValidationResult['shippingValidation']
): SupplierValidationResult['cassiniImpact'] {
  const sellerMetricRisk: string[] = []
  let shippingScoreImpact = 0

  // Assess shipping impact
  if (shipping.onTimeDeliveryRate < 90) {
    sellerMetricRisk.push('High late shipment rate risk')
    shippingScoreImpact -= 20
  } else if (shipping.onTimeDeliveryRate < 95) {
    sellerMetricRisk.push('Moderate late shipment rate risk')
    shippingScoreImpact -= 10
  }

  if (shipping.totalDeliveryDays > 7) {
    sellerMetricRisk.push('Long delivery times may increase cases')
    shippingScoreImpact -= 15
  }

  if (!shipping.hasTracking) {
    sellerMetricRisk.push('No tracking increases item not received cases')
    shippingScoreImpact -= 10
  }

  // Positive impacts
  if (shipping.estimatedHandlingDays <= 1 && shipping.onTimeDeliveryRate >= 98) {
    shippingScoreImpact += 15
  }

  // Determine projected visibility
  let projectedVisibility: SupplierValidationResult['cassiniImpact']['projectedVisibility']
  const cassiniScore = checks.cassiniCompliance.score
  const shippingScore = checks.shippingReliability.score

  if (cassiniScore >= 85 && shippingScore >= 85) {
    projectedVisibility = 'high'
  } else if (cassiniScore >= 70 && shippingScore >= 70) {
    projectedVisibility = 'medium'
  } else if (cassiniScore >= 50 && shippingScore >= 50) {
    projectedVisibility = 'low'
  } else {
    projectedVisibility = 'suppressed'
  }

  return {
    projectedVisibility,
    sellerMetricRisk,
    shippingScoreImpact,
  }
}

// =============================================================================
// RECOMMENDATIONS
// =============================================================================

function generateRecommendations(
  checks: SupplierValidationResult['checks'],
  data: SupplierValidationResult['supplierData'],
  shipping: SupplierValidationResult['shippingValidation'],
  config: SupplierValidationConfig
): string[] {
  const recommendations: string[] = []

  // Shipping recommendations (highest priority for Cassini)
  if (shipping.riskToSellerMetrics === 'high' || shipping.riskToSellerMetrics === 'critical') {
    recommendations.push(
      'CRITICAL: This supplier poses risk to seller metrics. Consider faster fulfillment options.'
    )
  }

  if (shipping.totalDeliveryDays > 5) {
    recommendations.push(
      `Set handling time to ${Math.max(1, shipping.estimatedHandlingDays + 1)} days for safety margin`
    )
  }

  // Fulfillment type recommendations
  if (
    data.fulfillmentType === 'dropship' ||
    data.fulfillmentType === 'fbm'
  ) {
    recommendations.push(
      'Monitor this supplier closely for delivery time consistency'
    )
  }

  if (!config.preferredFulfillmentTypes.includes(data.fulfillmentType)) {
    const preferred = config.preferredFulfillmentTypes.join(' or ').toUpperCase()
    recommendations.push(`Consider ${preferred} alternatives for better reliability`)
  }

  // Price recommendations
  if (data.priceVolatility > 15) {
    recommendations.push('Monitor price closely - set up price alerts')
  }

  // Competition recommendations
  if (data.sellerCount > 30) {
    recommendations.push('High competition - consider niche variations')
  }

  // Demand recommendations
  if (data.salesRank && data.salesRank > 100000) {
    recommendations.push('Lower demand product - ensure adequate margin')
  }

  // Positive recommendations
  if (checks.profitViability.score >= 85) {
    recommendations.push('Strong profit potential - prioritize this product')
  }

  if (shipping.riskToSellerMetrics === 'low' && checks.cassiniCompliance.score >= 85) {
    recommendations.push('Excellent Cassini compliance - high visibility expected')
  }

  return recommendations
}

// =============================================================================
// HELPERS
// =============================================================================

function createFailedResult(asin: string, reason: string): SupplierValidationResult {
  const failedCheck: ValidationCheck = {
    passed: false,
    score: 0,
    reason,
  }

  return {
    asin,
    isValid: false,
    overallScore: 0,
    checks: {
      priceStability: failedCheck,
      stockAvailability: failedCheck,
      sellerReputation: failedCheck,
      shippingReliability: failedCheck,
      demandConfidence: failedCheck,
      profitViability: failedCheck,
      cassiniCompliance: failedCheck,
    },
    supplierData: {
      currentPrice: null,
      avgPrice30d: null,
      avgPrice90d: null,
      priceVolatility: 0,
      inStock: false,
      stockConfidence: 0,
      fulfillmentType: 'unknown',
      isFBA: false,
      sellerCount: 0,
      salesRank: null,
      salesRankCategory: null,
      reviewCount: 0,
      rating: null,
      estimatedMonthlySales: null,
    },
    shippingValidation: {
      estimatedHandlingDays: 0,
      estimatedShippingDays: 0,
      totalDeliveryDays: 0,
      meetsEbayStandards: false,
      riskToSellerMetrics: 'critical',
      hasTracking: false,
      onTimeDeliveryRate: 0,
    },
    cassiniImpact: {
      projectedVisibility: 'suppressed',
      sellerMetricRisk: [reason],
      shippingScoreImpact: -50,
    },
    recommendations: [],
    blockers: [reason],
    warnings: [],
    validatedAt: new Date().toISOString(),
  }
}

// =============================================================================
// BATCH VALIDATION
// =============================================================================

export async function batchValidateSuppliers(
  asins: string[],
  targetPrices?: Record<string, number>,
  config?: Partial<SupplierValidationConfig>
): Promise<SupplierValidationResult[]> {
  const results: SupplierValidationResult[] = []

  // Process in batches of 10 to respect Keepa rate limits
  const BATCH_SIZE = 10

  for (let i = 0; i < asins.length; i += BATCH_SIZE) {
    const batch = asins.slice(i, i + BATCH_SIZE)

    const batchResults = await Promise.all(
      batch.map((asin) => validateSupplier(asin, targetPrices?.[asin], config))
    )

    results.push(...batchResults)

    // Rate limit between batches
    if (i + BATCH_SIZE < asins.length) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  return results
}

// =============================================================================
// DATABASE INTEGRATION
// =============================================================================

export async function saveValidationResult(result: SupplierValidationResult): Promise<void> {
  try {
    await supabase.from('supplier_validations').upsert(
      {
        asin: result.asin,
        is_valid: result.isValid,
        overall_score: result.overallScore,
        checks: result.checks,
        supplier_data: result.supplierData,
        shipping_validation: result.shippingValidation,
        cassini_impact: result.cassiniImpact,
        recommendations: result.recommendations,
        blockers: result.blockers,
        warnings: result.warnings,
        validated_at: result.validatedAt,
      },
      {
        onConflict: 'asin',
      }
    )
  } catch (error) {
    console.error('[SupplierValidator] Failed to save result:', error)
  }
}

// =============================================================================
// AGGREGATED VALIDATION STATS
// =============================================================================

export interface ValidationStats {
  total: number
  valid: number
  invalid: number
  avgScore: number
  byFulfillmentType: Record<FulfillmentType, { count: number; avgScore: number }>
  byShippingRisk: Record<string, number>
  topBlockers: Array<{ reason: string; count: number }>
}

export async function getValidationStats(
  since?: Date
): Promise<ValidationStats> {
  let query = supabase
    .from('supplier_validations')
    .select('is_valid, overall_score, supplier_data, shipping_validation, blockers')

  if (since) {
    query = query.gte('validated_at', since.toISOString())
  }

  const { data } = await query

  if (!data || data.length === 0) {
    return {
      total: 0,
      valid: 0,
      invalid: 0,
      avgScore: 0,
      byFulfillmentType: {} as Record<FulfillmentType, { count: number; avgScore: number }>,
      byShippingRisk: {},
      topBlockers: [],
    }
  }

  const byFulfillment: Record<string, { count: number; totalScore: number }> = {}
  const byShippingRisk: Record<string, number> = {}
  const blockerCounts: Record<string, number> = {}
  let totalScore = 0
  let valid = 0

  for (const row of data) {
    totalScore += row.overall_score
    if (row.is_valid) valid++

    // Fulfillment type
    const ft = (row.supplier_data as any)?.fulfillmentType || 'unknown'
    if (!byFulfillment[ft]) {
      byFulfillment[ft] = { count: 0, totalScore: 0 }
    }
    byFulfillment[ft].count++
    byFulfillment[ft].totalScore += row.overall_score

    // Shipping risk
    const risk = (row.shipping_validation as any)?.riskToSellerMetrics || 'unknown'
    byShippingRisk[risk] = (byShippingRisk[risk] || 0) + 1

    // Blockers
    for (const blocker of (row.blockers || []) as string[]) {
      const key = blocker.split(':')[0]
      blockerCounts[key] = (blockerCounts[key] || 0) + 1
    }
  }

  const byFulfillmentType: Record<FulfillmentType, { count: number; avgScore: number }> = {} as any
  for (const [ft, stats] of Object.entries(byFulfillment)) {
    byFulfillmentType[ft as FulfillmentType] = {
      count: stats.count,
      avgScore: Math.round(stats.totalScore / stats.count),
    }
  }

  const topBlockers = Object.entries(blockerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }))

  return {
    total: data.length,
    valid,
    invalid: data.length - valid,
    avgScore: Math.round(totalScore / data.length),
    byFulfillmentType,
    byShippingRisk,
    topBlockers,
  }
}
