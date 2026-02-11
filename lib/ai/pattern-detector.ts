/**
 * Pattern Detection for Product Opportunities
 *
 * Analyzes product data to identify:
 * - Trending niches and categories
 * - Price gap opportunities
 * - Seasonal patterns
 * - High-margin product clusters
 * - Emerging demand signals
 */

import { supabase } from '@/lib/supabase'
import { calculateQualityScore, type ProductData, type QualityScore } from './quality-scorer'

// Pattern types
export type PatternType =
  | 'trending_niche'
  | 'price_gap'
  | 'seasonal'
  | 'margin_opportunity'
  | 'demand_spike'
  | 'low_competition'
  | 'brand_opportunity'
  | 'bundle_potential'

export interface DetectedPattern {
  type: PatternType
  name: string
  description: string
  confidence: number // 0-1
  products: string[] // Product IDs matching this pattern
  metrics: {
    avgMargin?: number
    avgScore?: number
    productCount: number
    totalRevenuePotential?: number
  }
  insights: string[]
  actionItems: string[]
  priority: 'high' | 'medium' | 'low'
  detectedAt: Date
}

export interface PatternAnalysisResult {
  patterns: DetectedPattern[]
  summary: {
    totalPatternsFound: number
    highPriorityCount: number
    topOpportunities: string[]
    analysisDate: Date
    productsAnalyzed: number
  }
}

export interface PatternDetectionConfig {
  minConfidence?: number
  minProducts?: number
  lookbackDays?: number
  categories?: string[]
  priceRange?: { min: number; max: number }
}

/**
 * Run full pattern detection analysis
 */
export async function detectPatterns(
  config: PatternDetectionConfig = {}
): Promise<PatternAnalysisResult> {
  const {
    minConfidence = 0.6,
    minProducts = 3,
    lookbackDays = 30,
    categories,
    priceRange,
  } = config

  // Fetch product data for analysis
  const products = await fetchProductsForAnalysis(lookbackDays, categories, priceRange)

  if (products.length === 0) {
    return {
      patterns: [],
      summary: {
        totalPatternsFound: 0,
        highPriorityCount: 0,
        topOpportunities: [],
        analysisDate: new Date(),
        productsAnalyzed: 0,
      },
    }
  }

  // Run all pattern detectors
  const allPatterns: DetectedPattern[] = []

  const detectors = [
    detectTrendingNiches,
    detectPriceGaps,
    detectMarginOpportunities,
    detectLowCompetition,
    detectBrandOpportunities,
    detectBundlePotential,
  ]

  for (const detector of detectors) {
    const patterns = await detector(products)
    allPatterns.push(...patterns)
  }

  // Filter by confidence and min products
  const filteredPatterns = allPatterns.filter(
    (p) => p.confidence >= minConfidence && p.metrics.productCount >= minProducts
  )

  // Sort by priority and confidence
  filteredPatterns.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }
    return b.confidence - a.confidence
  })

  // Generate summary
  const highPriorityCount = filteredPatterns.filter((p) => p.priority === 'high').length
  const topOpportunities = filteredPatterns.slice(0, 3).map((p) => p.name)

  return {
    patterns: filteredPatterns,
    summary: {
      totalPatternsFound: filteredPatterns.length,
      highPriorityCount,
      topOpportunities,
      analysisDate: new Date(),
      productsAnalyzed: products.length,
    },
  }
}

/**
 * Detect trending niches
 */
async function detectTrendingNiches(products: AnalyzableProduct[]): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = []

  // Group by category
  const categoryGroups = groupBy(products, (p) => p.category || 'Uncategorized')

  for (const [category, categoryProducts] of Object.entries(categoryGroups)) {
    if (categoryProducts.length < 3) continue

    // Calculate average metrics
    const avgSalesRank = average(categoryProducts.map((p) => p.salesRank).filter(notNull))
    const avgSoldCount = average(categoryProducts.map((p) => p.ebaySOldCount).filter(notNull))
    const avgScore = average(categoryProducts.map((p) => p.qualityScore).filter(notNull))

    // Check for trending signals
    const isTrending =
      (avgSalesRank && avgSalesRank < 25000) ||
      (avgSoldCount && avgSoldCount > 20) ||
      (avgScore && avgScore > 70)

    if (isTrending) {
      const confidence = calculateTrendingConfidence(categoryProducts)

      patterns.push({
        type: 'trending_niche',
        name: `Trending: ${category}`,
        description: `${category} shows strong demand signals with ${categoryProducts.length} products performing well`,
        confidence,
        products: categoryProducts.map((p) => p.id),
        metrics: {
          avgScore: avgScore || 0,
          productCount: categoryProducts.length,
          avgMargin: calculateAvgMargin(categoryProducts),
        },
        insights: [
          avgSalesRank ? `Average sales rank: ${Math.round(avgSalesRank)}` : null,
          avgSoldCount ? `Average eBay sales: ${Math.round(avgSoldCount)} units` : null,
          `${categoryProducts.length} products in this niche`,
        ].filter(notNull) as string[],
        actionItems: [
          'Research top performers in this category',
          'Identify sub-niches with less competition',
          'Consider expanding product sourcing here',
        ],
        priority: confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low',
        detectedAt: new Date(),
      })
    }
  }

  return patterns
}

/**
 * Detect price gap opportunities
 */
async function detectPriceGaps(products: AnalyzableProduct[]): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = []

  // Find products with large Amazon-to-eBay price gaps
  const priceGapProducts = products.filter((p) => {
    if (!p.amazonPrice || !p.ebayPrice) return false
    const gap = p.ebayPrice - p.amazonPrice
    const margin = (gap / p.ebayPrice) * 100
    return margin >= 35 // 35%+ margin
  })

  if (priceGapProducts.length >= 3) {
    const avgMargin = calculateAvgMargin(priceGapProducts)

    patterns.push({
      type: 'price_gap',
      name: 'High-Margin Products',
      description: `Found ${priceGapProducts.length} products with 35%+ profit margins`,
      confidence: Math.min(1, priceGapProducts.length / 10),
      products: priceGapProducts.map((p) => p.id),
      metrics: {
        avgMargin,
        productCount: priceGapProducts.length,
        avgScore: average(priceGapProducts.map((p) => p.qualityScore).filter(notNull)),
      },
      insights: [
        `Average margin: ${Math.round(avgMargin || 0)}%`,
        `Best margin: ${Math.round(Math.max(...priceGapProducts.map((p) => calculateMargin(p))))}%`,
        'These products offer strong profit potential',
      ],
      actionItems: [
        'Verify prices are current and accurate',
        'Check for shipping cost impacts on margins',
        'Prioritize highest-margin items for listing',
      ],
      priority: avgMargin && avgMargin > 40 ? 'high' : 'medium',
      detectedAt: new Date(),
    })
  }

  return patterns
}

/**
 * Detect margin opportunities in specific price bands
 */
async function detectMarginOpportunities(products: AnalyzableProduct[]): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = []

  // Group by price band
  const priceBands = {
    budget: products.filter((p) => p.amazonPrice && p.amazonPrice < 15),
    low: products.filter((p) => p.amazonPrice && p.amazonPrice >= 15 && p.amazonPrice < 30),
    mid: products.filter((p) => p.amazonPrice && p.amazonPrice >= 30 && p.amazonPrice < 60),
    high: products.filter((p) => p.amazonPrice && p.amazonPrice >= 60 && p.amazonPrice < 100),
    premium: products.filter((p) => p.amazonPrice && p.amazonPrice >= 100),
  }

  for (const [band, bandProducts] of Object.entries(priceBands)) {
    if (bandProducts.length < 3) continue

    const avgMargin = calculateAvgMargin(bandProducts)
    const avgScore = average(bandProducts.map((p) => p.qualityScore).filter(notNull))

    if (avgMargin && avgMargin > 30 && avgScore && avgScore > 60) {
      patterns.push({
        type: 'margin_opportunity',
        name: `${band.charAt(0).toUpperCase() + band.slice(1)} Price Band Opportunity`,
        description: `${band} price band shows strong margins with ${bandProducts.length} products`,
        confidence: Math.min(1, (avgMargin / 50) * (avgScore / 100)),
        products: bandProducts.map((p) => p.id),
        metrics: {
          avgMargin,
          avgScore,
          productCount: bandProducts.length,
        },
        insights: [
          `Price range: ${getPriceBandRange(band)}`,
          `Average margin: ${Math.round(avgMargin)}%`,
          `Average quality score: ${Math.round(avgScore)}`,
        ],
        actionItems: [
          `Focus sourcing on ${band} price band`,
          'Analyze best performers for patterns',
          'Consider this band for new product research',
        ],
        priority: avgMargin > 40 && avgScore > 70 ? 'high' : 'medium',
        detectedAt: new Date(),
      })
    }
  }

  return patterns
}

/**
 * Detect low competition opportunities
 */
async function detectLowCompetition(products: AnalyzableProduct[]): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = []

  // Find products with good scores but low competition signals
  const lowCompProducts = products.filter((p) => {
    if (!p.qualityScore || p.qualityScore < 60) return false
    if (p.competitorCount && p.competitorCount < 20) return true
    if (p.amazonSellerCount && p.amazonSellerCount < 5) return true
    return false
  })

  if (lowCompProducts.length >= 3) {
    patterns.push({
      type: 'low_competition',
      name: 'Low Competition Opportunities',
      description: `Found ${lowCompProducts.length} quality products with minimal competition`,
      confidence: Math.min(1, lowCompProducts.length / 15),
      products: lowCompProducts.map((p) => p.id),
      metrics: {
        productCount: lowCompProducts.length,
        avgScore: average(lowCompProducts.map((p) => p.qualityScore).filter(notNull)),
        avgMargin: calculateAvgMargin(lowCompProducts),
      },
      insights: [
        'Lower competition typically means better conversion rates',
        'May indicate emerging niches or underserved markets',
        'Good candidates for quick wins',
      ],
      actionItems: [
        'List these products first for quick traction',
        'Monitor competitor entry closely',
        'Build brand presence before competition increases',
      ],
      priority: 'high',
      detectedAt: new Date(),
    })
  }

  return patterns
}

/**
 * Detect brand opportunities
 */
async function detectBrandOpportunities(products: AnalyzableProduct[]): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = []

  // Group by brand
  const brandGroups = groupBy(products, (p) => p.brand || 'Unbranded')

  for (const [brand, brandProducts] of Object.entries(brandGroups)) {
    if (brand === 'Unbranded' || brand === 'Generic') continue
    if (brandProducts.length < 3) continue

    const avgScore = average(brandProducts.map((p) => p.qualityScore).filter(notNull))
    const avgRating = average(brandProducts.map((p) => p.rating).filter(notNull))

    if (avgScore && avgScore > 65 && avgRating && avgRating >= 4.0) {
      patterns.push({
        type: 'brand_opportunity',
        name: `Brand Focus: ${brand}`,
        description: `${brand} products show consistent quality with ${brandProducts.length} items`,
        confidence: Math.min(1, brandProducts.length / 10),
        products: brandProducts.map((p) => p.id),
        metrics: {
          productCount: brandProducts.length,
          avgScore,
          avgMargin: calculateAvgMargin(brandProducts),
        },
        insights: [
          `Average rating: ${avgRating.toFixed(1)} stars`,
          `${brandProducts.length} products from this brand`,
          'Brand recognition can improve conversion rates',
        ],
        actionItems: [
          `Explore more ${brand} products`,
          'Consider brand-focused store sections',
          'Monitor brand for new product releases',
        ],
        priority: brandProducts.length >= 5 && avgScore > 75 ? 'high' : 'medium',
        detectedAt: new Date(),
      })
    }
  }

  return patterns
}

/**
 * Detect bundle potential
 */
async function detectBundlePotential(products: AnalyzableProduct[]): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = []

  // Find complementary products in same category
  const categoryGroups = groupBy(products, (p) => p.category || 'Uncategorized')

  for (const [category, categoryProducts] of Object.entries(categoryGroups)) {
    if (categoryProducts.length < 4) continue

    // Look for low-price accessories that could be bundled
    const mainProducts = categoryProducts.filter((p) => p.amazonPrice && p.amazonPrice >= 20)
    const accessories = categoryProducts.filter((p) => p.amazonPrice && p.amazonPrice < 20)

    if (mainProducts.length >= 2 && accessories.length >= 2) {
      patterns.push({
        type: 'bundle_potential',
        name: `Bundle Opportunity: ${category}`,
        description: `${category} has products suitable for bundling (${mainProducts.length} main + ${accessories.length} accessories)`,
        confidence: 0.7,
        products: [...mainProducts, ...accessories].map((p) => p.id),
        metrics: {
          productCount: mainProducts.length + accessories.length,
          avgMargin: calculateAvgMargin([...mainProducts, ...accessories]),
        },
        insights: [
          'Bundles can increase average order value',
          'Differentiate from competitors with unique combinations',
          'May improve profit margins on accessories',
        ],
        actionItems: [
          'Identify complementary product pairs',
          'Calculate bundle pricing for profitability',
          'Test bundle listings vs individual items',
        ],
        priority: 'medium',
        detectedAt: new Date(),
      })
    }
  }

  return patterns
}

// Helper types and functions

interface AnalyzableProduct {
  id: string
  category?: string | null
  subcategory?: string | null
  brand?: string | null
  amazonPrice?: number | null
  ebayPrice?: number | null
  salesRank?: number | null
  ebaySOldCount?: number | null
  rating?: number | null
  reviewCount?: number | null
  competitorCount?: number | null
  amazonSellerCount?: number | null
  qualityScore?: number | null
}

async function fetchProductsForAnalysis(
  lookbackDays: number,
  categories?: string[],
  priceRange?: { min: number; max: number }
): Promise<AnalyzableProduct[]> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays)

  let query = supabase
    .from('raw_products')
    .select('id, category, brand, amazon_price, sales_rank, review_count, rating')
    .gte('created_at', cutoffDate.toISOString())
    .limit(1000)

  if (categories && categories.length > 0) {
    query = query.in('category', categories)
  }

  if (priceRange) {
    query = query.gte('amazon_price', priceRange.min).lte('amazon_price', priceRange.max)
  }

  const { data, error } = await query

  if (error || !data) {
    return []
  }

  // Transform to analyzable format
  return data.map((row: any) => ({
    id: row.id,
    category: row.category,
    brand: row.brand,
    amazonPrice: row.amazon_price,
    salesRank: row.sales_rank,
    reviewCount: row.review_count,
    rating: row.rating,
    qualityScore: calculateBasicScore(row),
  }))
}

function calculateBasicScore(row: any): number {
  let score = 50

  if (row.rating >= 4.5) score += 15
  else if (row.rating >= 4.0) score += 10

  if (row.review_count >= 100) score += 15
  else if (row.review_count >= 10) score += 8

  if (row.sales_rank && row.sales_rank < 10000) score += 15
  else if (row.sales_rank && row.sales_rank < 50000) score += 8

  return Math.min(100, score)
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce(
    (groups, item) => {
      const k = key(item)
      if (!groups[k]) groups[k] = []
      groups[k].push(item)
      return groups
    },
    {} as Record<string, T[]>
  )
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function notNull<T>(value: T | null | undefined): value is T {
  return value != null
}

function calculateMargin(p: AnalyzableProduct): number {
  if (!p.amazonPrice || !p.ebayPrice) return 0
  return ((p.ebayPrice - p.amazonPrice) / p.ebayPrice) * 100
}

function calculateAvgMargin(products: AnalyzableProduct[]): number | undefined {
  const margins = products.map(calculateMargin).filter((m) => m > 0)
  return margins.length > 0 ? average(margins) || undefined : undefined
}

function calculateTrendingConfidence(products: AnalyzableProduct[]): number {
  let signals = 0

  const avgSalesRank = average(products.map((p) => p.salesRank).filter(notNull))
  const avgRating = average(products.map((p) => p.rating).filter(notNull))
  const avgReviews = average(products.map((p) => p.reviewCount).filter(notNull))

  if (avgSalesRank && avgSalesRank < 25000) signals += 0.3
  if (avgRating && avgRating >= 4.0) signals += 0.2
  if (avgReviews && avgReviews >= 50) signals += 0.2
  if (products.length >= 10) signals += 0.2
  else if (products.length >= 5) signals += 0.1

  return Math.min(1, signals + 0.2) // Base confidence
}

function getPriceBandRange(band: string): string {
  const ranges: Record<string, string> = {
    budget: '$0 - $15',
    low: '$15 - $30',
    mid: '$30 - $60',
    high: '$60 - $100',
    premium: '$100+',
  }
  return ranges[band] || 'Unknown'
}
