/**
 * Quality Scoring System
 *
 * Calculates comprehensive quality scores for products using multiple signals:
 * - Demand indicators (sales rank, review count, sold count)
 * - Supply indicators (competition, seller count)
 * - Profit indicators (margin, price band)
 * - Quality indicators (rating, brand, listing readiness)
 */

import type { NormalizedProductOutput, QualitySignals } from './claude-normalizer'

// Scoring weights (must sum to 1.0)
const WEIGHTS = {
  demand: 0.30,      // How much people want this product
  supply: 0.15,      // Competition level
  profit: 0.25,      // Profit potential
  quality: 0.15,     // Product quality signals
  listing: 0.15,     // Listing readiness
}

// Score thresholds
export const SCORE_THRESHOLDS = {
  excellent: 85,
  good: 70,
  fair: 55,
  poor: 40,
}

export interface ProductData {
  // Demand signals
  salesRank?: number | null
  reviewCount?: number | null
  rating?: number | null
  ebaySOldCount?: number | null
  searchVolume?: number | null

  // Supply signals
  competitorCount?: number | null
  amazonSellerCount?: number | null

  // Price signals
  amazonPrice?: number | null
  ebayPrice?: number | null
  costPrice?: number | null

  // Quality signals from AI
  aiQualitySignals?: QualitySignals | null

  // Category context
  category?: string | null
  subcategory?: string | null
}

export interface QualityScore {
  overall: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  breakdown: {
    demand: number
    supply: number
    profit: number
    quality: number
    listing: number
  }
  factors: {
    positive: string[]
    negative: string[]
    neutral: string[]
  }
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'avoid'
  confidence: number
}

export interface ScoringConfig {
  // Category-specific adjustments
  categoryMultipliers?: Record<string, number>

  // Custom weight overrides
  weights?: Partial<typeof WEIGHTS>

  // Threshold adjustments
  salesRankCutoff?: number
  minProfitMargin?: number
  minRating?: number
}

/**
 * Calculate comprehensive quality score for a product
 */
export function calculateQualityScore(
  data: ProductData,
  config: ScoringConfig = {}
): QualityScore {
  const weights = { ...WEIGHTS, ...config.weights }

  // Calculate component scores (0-100)
  const demandScore = calculateDemandScore(data, config)
  const supplyScore = calculateSupplyScore(data, config)
  const profitScore = calculateProfitScore(data, config)
  const qualityScore = calculateQualitySignalScore(data, config)
  const listingScore = calculateListingScore(data, config)

  // Weighted overall score
  const overall = Math.round(
    demandScore * weights.demand +
    supplyScore * weights.supply +
    profitScore * weights.profit +
    qualityScore * weights.quality +
    listingScore * weights.listing
  )

  // Determine grade
  const grade = getGrade(overall)

  // Collect factors
  const factors = collectFactors(data, {
    demand: demandScore,
    supply: supplyScore,
    profit: profitScore,
    quality: qualityScore,
    listing: listingScore,
  })

  // Calculate confidence based on data completeness
  const confidence = calculateConfidence(data)

  // Generate recommendation
  const recommendation = getRecommendation(overall, confidence, factors)

  return {
    overall,
    grade,
    breakdown: {
      demand: demandScore,
      supply: supplyScore,
      profit: profitScore,
      quality: qualityScore,
      listing: listingScore,
    },
    factors,
    recommendation,
    confidence,
  }
}

/**
 * Score multiple products and rank them
 */
export function rankProducts(
  products: Array<{ id: string; data: ProductData }>,
  config: ScoringConfig = {}
): Array<{ id: string; score: QualityScore; rank: number }> {
  const scored = products.map((p) => ({
    id: p.id,
    score: calculateQualityScore(p.data, config),
  }))

  // Sort by overall score descending
  scored.sort((a, b) => b.score.overall - a.score.overall)

  // Add ranks
  return scored.map((item, index) => ({
    ...item,
    rank: index + 1,
  }))
}

/**
 * Get products that meet minimum quality threshold
 */
export function filterByQuality(
  products: Array<{ id: string; data: ProductData }>,
  minScore: number = SCORE_THRESHOLDS.fair,
  config: ScoringConfig = {}
): Array<{ id: string; score: QualityScore }> {
  return products
    .map((p) => ({ id: p.id, score: calculateQualityScore(p.data, config) }))
    .filter((p) => p.score.overall >= minScore)
}

// Component scoring functions

function calculateDemandScore(data: ProductData, config: ScoringConfig): number {
  let score = 50 // Base score
  const factors: number[] = []

  // Sales rank score (lower is better)
  if (data.salesRank != null) {
    const cutoff = config.salesRankCutoff || 100000
    if (data.salesRank < 1000) factors.push(100)
    else if (data.salesRank < 5000) factors.push(90)
    else if (data.salesRank < 10000) factors.push(80)
    else if (data.salesRank < 25000) factors.push(70)
    else if (data.salesRank < 50000) factors.push(60)
    else if (data.salesRank < cutoff) factors.push(50)
    else factors.push(30)
  }

  // Review count score
  if (data.reviewCount != null) {
    if (data.reviewCount >= 1000) factors.push(100)
    else if (data.reviewCount >= 500) factors.push(90)
    else if (data.reviewCount >= 100) factors.push(75)
    else if (data.reviewCount >= 50) factors.push(60)
    else if (data.reviewCount >= 10) factors.push(50)
    else factors.push(35)
  }

  // eBay sold count
  if (data.ebaySOldCount != null) {
    if (data.ebaySOldCount >= 100) factors.push(100)
    else if (data.ebaySOldCount >= 50) factors.push(85)
    else if (data.ebaySOldCount >= 25) factors.push(70)
    else if (data.ebaySOldCount >= 10) factors.push(55)
    else if (data.ebaySOldCount >= 5) factors.push(45)
    else factors.push(30)
  }

  // AI demand signal
  if (data.aiQualitySignals?.marketDemand) {
    const demandMap = { high: 90, medium: 60, low: 30 }
    factors.push(demandMap[data.aiQualitySignals.marketDemand])
  }

  if (factors.length > 0) {
    score = Math.round(factors.reduce((a, b) => a + b, 0) / factors.length)
  }

  return Math.min(100, Math.max(0, score))
}

function calculateSupplyScore(data: ProductData, config: ScoringConfig): number {
  let score = 50
  const factors: number[] = []

  // Competitor count (fewer is better)
  if (data.competitorCount != null) {
    if (data.competitorCount < 5) factors.push(95)
    else if (data.competitorCount < 10) factors.push(85)
    else if (data.competitorCount < 25) factors.push(70)
    else if (data.competitorCount < 50) factors.push(55)
    else if (data.competitorCount < 100) factors.push(40)
    else factors.push(25)
  }

  // Amazon seller count
  if (data.amazonSellerCount != null) {
    if (data.amazonSellerCount < 3) factors.push(90)
    else if (data.amazonSellerCount < 5) factors.push(75)
    else if (data.amazonSellerCount < 10) factors.push(60)
    else if (data.amazonSellerCount < 20) factors.push(45)
    else factors.push(30)
  }

  // AI competition signal
  if (data.aiQualitySignals?.competitionLevel) {
    // Inverse - low competition is good
    const compMap = { high: 30, medium: 60, low: 90 }
    factors.push(compMap[data.aiQualitySignals.competitionLevel])
  }

  if (factors.length > 0) {
    score = Math.round(factors.reduce((a, b) => a + b, 0) / factors.length)
  }

  return Math.min(100, Math.max(0, score))
}

function calculateProfitScore(data: ProductData, config: ScoringConfig): number {
  let score = 50
  const factors: number[] = []

  // Calculate margin if we have prices
  if (data.amazonPrice && data.ebayPrice) {
    const margin = ((data.ebayPrice - data.amazonPrice) / data.ebayPrice) * 100
    const minMargin = config.minProfitMargin || 20

    if (margin >= 50) factors.push(100)
    else if (margin >= 40) factors.push(90)
    else if (margin >= 35) factors.push(80)
    else if (margin >= 30) factors.push(70)
    else if (margin >= minMargin) factors.push(55)
    else if (margin >= 15) factors.push(40)
    else factors.push(20)
  }

  // Price band scoring (mid-range often best for dropshipping)
  if (data.amazonPrice) {
    if (data.amazonPrice >= 25 && data.amazonPrice <= 75) factors.push(90)
    else if (data.amazonPrice >= 15 && data.amazonPrice <= 100) factors.push(75)
    else if (data.amazonPrice >= 10 && data.amazonPrice <= 150) factors.push(60)
    else factors.push(45)
  }

  // AI profit signal
  if (data.aiQualitySignals?.profitPotential) {
    const profitMap = { high: 90, medium: 60, low: 30 }
    factors.push(profitMap[data.aiQualitySignals.profitPotential])
  }

  if (factors.length > 0) {
    score = Math.round(factors.reduce((a, b) => a + b, 0) / factors.length)
  }

  return Math.min(100, Math.max(0, score))
}

function calculateQualitySignalScore(data: ProductData, config: ScoringConfig): number {
  let score = 50
  const factors: number[] = []

  // Rating score
  if (data.rating != null) {
    const minRating = config.minRating || 3.5
    if (data.rating >= 4.5) factors.push(100)
    else if (data.rating >= 4.0) factors.push(85)
    else if (data.rating >= minRating) factors.push(65)
    else if (data.rating >= 3.0) factors.push(45)
    else factors.push(20)
  }

  // Brand recognition
  if (data.aiQualitySignals?.brandRecognition) {
    const brandMap = { high: 90, medium: 65, low: 45, unknown: 40 }
    factors.push(brandMap[data.aiQualitySignals.brandRecognition])
  }

  // Product clarity
  if (data.aiQualitySignals?.productClarity) {
    const clarityMap = { high: 90, medium: 60, low: 30 }
    factors.push(clarityMap[data.aiQualitySignals.productClarity])
  }

  if (factors.length > 0) {
    score = Math.round(factors.reduce((a, b) => a + b, 0) / factors.length)
  }

  return Math.min(100, Math.max(0, score))
}

function calculateListingScore(data: ProductData, config: ScoringConfig): number {
  if (!data.aiQualitySignals) return 50

  const readinessMap = { ready: 90, needs_work: 55, not_ready: 25 }
  let score = readinessMap[data.aiQualitySignals.listingReadiness] || 50

  // Adjust based on issues count
  const issueCount = data.aiQualitySignals.issues?.length || 0
  const strengthCount = data.aiQualitySignals.strengths?.length || 0

  score = score - (issueCount * 5) + (strengthCount * 3)

  return Math.min(100, Math.max(0, score))
}

// Helper functions

function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= SCORE_THRESHOLDS.excellent) return 'A'
  if (score >= SCORE_THRESHOLDS.good) return 'B'
  if (score >= SCORE_THRESHOLDS.fair) return 'C'
  if (score >= SCORE_THRESHOLDS.poor) return 'D'
  return 'F'
}

function collectFactors(
  data: ProductData,
  scores: Record<string, number>
): QualityScore['factors'] {
  const positive: string[] = []
  const negative: string[] = []
  const neutral: string[] = []

  // Demand factors
  if (scores.demand >= 70) {
    positive.push('Strong demand indicators')
  } else if (scores.demand < 40) {
    negative.push('Weak demand signals')
  }

  // Supply factors
  if (scores.supply >= 70) {
    positive.push('Low competition')
  } else if (scores.supply < 40) {
    negative.push('High competition')
  }

  // Profit factors
  if (scores.profit >= 70) {
    positive.push('Good profit margins')
  } else if (scores.profit < 40) {
    negative.push('Thin margins')
  }

  // Rating
  if (data.rating && data.rating >= 4.5) {
    positive.push(`Excellent rating (${data.rating} stars)`)
  } else if (data.rating && data.rating < 3.5) {
    negative.push(`Low rating (${data.rating} stars)`)
  }

  // Sales rank
  if (data.salesRank && data.salesRank < 10000) {
    positive.push('Top seller in category')
  } else if (data.salesRank && data.salesRank > 100000) {
    negative.push('Low sales velocity')
  }

  // AI signals
  if (data.aiQualitySignals?.strengths) {
    positive.push(...data.aiQualitySignals.strengths)
  }
  if (data.aiQualitySignals?.issues) {
    negative.push(...data.aiQualitySignals.issues)
  }

  // Fill neutral if needed
  if (positive.length === 0 && negative.length === 0) {
    neutral.push('Insufficient data for detailed analysis')
  }

  return { positive, negative, neutral }
}

function calculateConfidence(data: ProductData): number {
  let dataPoints = 0
  let totalPoints = 8

  if (data.salesRank != null) dataPoints++
  if (data.reviewCount != null) dataPoints++
  if (data.rating != null) dataPoints++
  if (data.amazonPrice != null) dataPoints++
  if (data.ebayPrice != null) dataPoints++
  if (data.ebaySOldCount != null) dataPoints++
  if (data.competitorCount != null) dataPoints++
  if (data.aiQualitySignals != null) dataPoints++

  return Math.round((dataPoints / totalPoints) * 100) / 100
}

function getRecommendation(
  score: number,
  confidence: number,
  factors: QualityScore['factors']
): QualityScore['recommendation'] {
  // Adjust for confidence
  const adjustedScore = score * (0.5 + confidence * 0.5)

  // Check for deal-breakers
  const dealBreakers = factors.negative.some((f) =>
    f.toLowerCase().includes('prohibited') ||
    f.toLowerCase().includes('restricted') ||
    f.toLowerCase().includes('counterfeit')
  )

  if (dealBreakers) return 'avoid'

  if (adjustedScore >= 80 && confidence >= 0.6) return 'strong_buy'
  if (adjustedScore >= 65 && confidence >= 0.4) return 'buy'
  if (adjustedScore >= 45) return 'hold'
  return 'avoid'
}
