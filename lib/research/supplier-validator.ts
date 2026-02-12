/**
 * Supplier Validation Service
 *
 * Validates Amazon suppliers to ensure reliability and profitability:
 * - Price stability (no volatile pricing)
 * - Stock availability
 * - Seller reputation
 * - FBA vs FBM considerations
 * - Shipping reliability
 */

import { getKeepaClient, type KeepaProduct, type KeepaProductStats } from '../integrations/keepa'
import { supabase } from '../supabase'

// =============================================================================
// TYPES
// =============================================================================

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
  }

  // Extracted data
  supplierData: {
    currentPrice: number | null
    avgPrice30d: number | null
    avgPrice90d: number | null
    priceVolatility: number // % standard deviation
    inStock: boolean
    stockConfidence: number // 0-100
    isFBA: boolean
    sellerCount: number
    salesRank: number | null
    salesRankCategory: string | null
    reviewCount: number
    rating: number | null
    estimatedMonthlySales: number | null
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
  minPriceStability: number // Max % price volatility allowed (default: 20%)
  minStockConfidence: number // Min stock confidence (default: 70)
  minSellerReputation: number // Min seller score (default: 80)
  minDemandConfidence: number // Min demand score (default: 50)
  minProfitMargin: number // Min profit margin % (default: 15%)
  maxSellerCount: number // Max competing sellers (default: 50)
  preferFBA: boolean // Prefer FBA suppliers (default: true)
  minSalesRank: number // Max acceptable sales rank (default: 500000)
}

const DEFAULT_CONFIG: SupplierValidationConfig = {
  minPriceStability: 20,
  minStockConfidence: 70,
  minSellerReputation: 80,
  minDemandConfidence: 50,
  minProfitMargin: 15,
  maxSellerCount: 50,
  preferFBA: true,
  minSalesRank: 500000,
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
    const stats = product.stats

    // Extract supplier data
    const supplierData = extractSupplierData(product)

    // Run validation checks
    const checks = {
      priceStability: checkPriceStability(supplierData, cfg),
      stockAvailability: checkStockAvailability(product, supplierData, cfg),
      sellerReputation: checkSellerReputation(supplierData, cfg),
      shippingReliability: checkShippingReliability(product, supplierData, cfg),
      demandConfidence: checkDemandConfidence(supplierData, cfg),
      profitViability: checkProfitViability(supplierData, targetSellPrice, cfg),
    }

    // Calculate overall score
    const weights = {
      priceStability: 0.20,
      stockAvailability: 0.25,
      sellerReputation: 0.15,
      shippingReliability: 0.10,
      demandConfidence: 0.15,
      profitViability: 0.15,
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

    const recommendations = generateRecommendations(checks, supplierData, cfg)

    const isValid = blockers.length === 0 && overallScore >= 60

    return {
      asin,
      isValid,
      overallScore: Math.round(overallScore),
      checks,
      supplierData,
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
  const currentNew = stats?.current?.[1] !== undefined && stats.current[1] > 0
    ? stats.current[1] / 100
    : null
  const currentFBA = stats?.current?.[10] !== undefined && stats.current[10] > 0
    ? stats.current[10] / 100
    : null

  const currentPrice = currentFBA || currentNew

  // Average prices
  const avg30New = stats?.avg30?.[1] !== undefined ? stats.avg30[1] / 100 : null
  const avg90New = stats?.avg90?.[1] !== undefined ? stats.avg90[1] / 100 : null

  // Calculate price volatility (simplified - would need full price history for accurate calculation)
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

  // Check if FBA available
  const isFBA = currentFBA !== null

  // Seller count
  const sellerCountNew = stats?.current?.[11] || 0

  // Sales rank
  const salesRank = stats?.current?.[3] || null

  // Reviews
  const reviewCount = stats?.current?.[17] || 0
  const rating = stats?.current?.[16] ? stats.current[16] / 10 : null

  // Estimate monthly sales based on sales rank (very rough estimate)
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
    isFBA,
    sellerCount: sellerCountNew,
    salesRank,
    salesRankCategory: null, // Would need category lookup
    reviewCount,
    rating,
    estimatedMonthlySales,
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

  // Check if FBA available (better for reliability)
  if (data.isFBA) {
    return {
      passed: true,
      score: 95,
      reason: 'In stock via FBA (high reliability)',
    }
  }

  return {
    passed: true,
    score: 75,
    reason: 'In stock via FBM',
  }
}

function checkSellerReputation(
  data: SupplierValidationResult['supplierData'],
  config: SupplierValidationConfig
): ValidationCheck {
  // Use review count and rating as proxy for seller ecosystem health
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
  product: KeepaProduct,
  data: SupplierValidationResult['supplierData'],
  config: SupplierValidationConfig
): ValidationCheck {
  // FBA = Prime eligible = reliable shipping
  if (data.isFBA) {
    return {
      passed: true,
      score: 95,
      reason: 'FBA (Prime eligible, fast shipping)',
    }
  }

  // Multiple sellers = more shipping options
  if (data.sellerCount >= 3) {
    return {
      passed: true,
      score: 75,
      reason: 'Multiple sellers available',
      details: { sellerCount: data.sellerCount },
    }
  }

  if (data.sellerCount === 0) {
    return {
      passed: false,
      score: 0,
      reason: 'No sellers available',
    }
  }

  return {
    passed: true,
    score: 60,
    reason: 'Limited seller options',
    details: { sellerCount: data.sellerCount },
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
    // Can't check margin without target price
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

// =============================================================================
// RECOMMENDATIONS
// =============================================================================

function generateRecommendations(
  checks: SupplierValidationResult['checks'],
  data: SupplierValidationResult['supplierData'],
  config: SupplierValidationConfig
): string[] {
  const recommendations: string[] = []

  if (!data.isFBA && checks.shippingReliability.score < 80) {
    recommendations.push('Consider finding an FBA supplier for better shipping reliability')
  }

  if (data.priceVolatility > 15) {
    recommendations.push('Monitor price closely - set up price alerts')
  }

  if (data.sellerCount > 30) {
    recommendations.push('High competition - consider niche variations')
  }

  if (data.salesRank && data.salesRank > 100000) {
    recommendations.push('Lower demand product - ensure adequate margin')
  }

  if (checks.profitViability.score >= 85) {
    recommendations.push('Strong profit potential - prioritize this product')
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
    },
    supplierData: {
      currentPrice: null,
      avgPrice30d: null,
      avgPrice90d: null,
      priceVolatility: 0,
      inStock: false,
      stockConfidence: 0,
      isFBA: false,
      sellerCount: 0,
      salesRank: null,
      salesRankCategory: null,
      reviewCount: 0,
      rating: null,
      estimatedMonthlySales: null,
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
      batch.map((asin) =>
        validateSupplier(asin, targetPrices?.[asin], config)
      )
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
    await supabase.from('supplier_validations').upsert({
      asin: result.asin,
      is_valid: result.isValid,
      overall_score: result.overallScore,
      checks: result.checks,
      supplier_data: result.supplierData,
      recommendations: result.recommendations,
      blockers: result.blockers,
      warnings: result.warnings,
      validated_at: result.validatedAt,
    }, {
      onConflict: 'asin',
    })
  } catch (error) {
    console.error('[SupplierValidator] Failed to save result:', error)
  }
}
