/**
 * Data-Driven Listing Optimization System
 *
 * Automatically optimizes listings based on performance data to maximize
 * profit goals. Implements regular changes to prices, titles, and descriptions
 * based on Cassini factors and market conditions.
 *
 * Key features:
 * - Price optimization based on competition and profit targets
 * - Title optimization for Cassini keyword ranking
 * - Description enhancement for conversion
 * - A/B testing framework for optimization experiments
 * - Performance-based auto-adjustments
 */

import { supabase } from '../supabase'
import { calculateCassiniScore, type CassiniScore, type ListingData, type MarketData, type SellerData } from './cassini-optimizer'

// =============================================================================
// TYPES
// =============================================================================

export interface ListingOptimization {
  listingId: string
  optimizationType: 'price' | 'title' | 'description' | 'photos' | 'item_specifics' | 'shipping'
  priority: 'low' | 'medium' | 'high' | 'critical'
  currentValue: string | number
  recommendedValue: string | number
  expectedImpact: {
    profitChange: number // Estimated $ change per month
    conversionChange: number // Estimated % change
    visibilityChange: number // Estimated % change in impressions
  }
  confidence: number // 0-100
  reasoning: string[]
  dataPoints: Array<{ metric: string; value: string | number }>
}

export interface OptimizationPlan {
  listingId: string
  currentPerformance: ListingPerformance
  optimizations: ListingOptimization[]
  totalExpectedProfitImpact: number
  implementationOrder: string[] // optimization IDs in recommended order
  estimatedTimeToImpact: string
}

export interface ListingPerformance {
  listingId: string
  views: number
  clicks: number
  sales: number
  revenue: number
  profit: number
  profitMargin: number
  conversionRate: number
  clickThroughRate: number
  avgPosition: number
  daysActive: number
  cassiniScore: number
  trend: 'improving' | 'stable' | 'declining'
}

export interface PriceOptimizationConfig {
  targetProfitMargin: number // Default: 20%
  minProfitMargin: number // Default: 10%
  maxProfitMargin: number // Default: 50%
  competitorPriceWeight: number // How much to weight competitor pricing (0-1)
  demandElasticity: number // Estimated price sensitivity (0-1)
  autoReprice: boolean // Whether to auto-apply price changes
  repriceFrequencyHours: number // How often to reprice
}

export interface TitleOptimizationConfig {
  maxLength: number // Default: 80 chars
  prioritizeKeywords: string[] // Keywords to prioritize
  avoidKeywords: string[] // Keywords to avoid
  includeModifiers: boolean // Include "New", "Fast Shipping", etc.
  caseSensitive: boolean
}

export interface OptimizationConfig {
  pricing: PriceOptimizationConfig
  title: TitleOptimizationConfig
  autoApply: boolean // Auto-apply optimizations above confidence threshold
  minConfidenceToApply: number // Default: 80%
  maxOptimizationsPerDay: number // Default: 50
  abTestingEnabled: boolean // Run A/B tests for changes
  profitGoalMonthly: number // Target monthly profit
}

const DEFAULT_CONFIG: OptimizationConfig = {
  pricing: {
    targetProfitMargin: 20,
    minProfitMargin: 10,
    maxProfitMargin: 50,
    competitorPriceWeight: 0.7,
    demandElasticity: 0.3,
    autoReprice: true,
    repriceFrequencyHours: 24,
  },
  title: {
    maxLength: 80,
    prioritizeKeywords: [],
    avoidKeywords: ['L@@K', 'WOW', 'AMAZING', 'MUST SEE', '!!!'],
    includeModifiers: true,
    caseSensitive: false,
  },
  autoApply: false,
  minConfidenceToApply: 80,
  maxOptimizationsPerDay: 50,
  abTestingEnabled: true,
  profitGoalMonthly: 5000,
}

// =============================================================================
// PRICE OPTIMIZATION
// =============================================================================

export interface PriceRecommendation {
  currentPrice: number
  recommendedPrice: number
  priceChange: number
  priceChangePercent: number
  expectedProfitChange: number
  expectedSalesVolumeChange: number
  competitorPrices: {
    min: number
    max: number
    avg: number
    count: number
  }
  reasoning: string[]
  confidence: number
}

export async function optimizePrice(
  listingId: string,
  config: Partial<PriceOptimizationConfig> = {}
): Promise<PriceRecommendation> {
  const cfg = { ...DEFAULT_CONFIG.pricing, ...config }

  // Get listing data
  const { data: listing } = await supabase
    .from('listings')
    .select(`
      *,
      skus(
        *,
        supplier_validations(*)
      )
    `)
    .eq('id', listingId)
    .single()

  if (!listing) {
    throw new Error('Listing not found')
  }

  const currentPrice = listing.price || 0
  const supplierCost = listing.skus?.supplier_validations?.[0]?.supplier_data?.currentPrice || 0

  // Get competitor prices
  const competitorPrices = await getCompetitorPrices(listing.skus?.asin, listing.category)

  // Calculate optimal price
  const optimalPrice = calculateOptimalPrice(
    currentPrice,
    supplierCost,
    competitorPrices,
    cfg
  )

  const priceChange = optimalPrice - currentPrice
  const priceChangePercent = currentPrice > 0 ? (priceChange / currentPrice) * 100 : 0

  // Estimate impact
  const ebayFees = optimalPrice * 0.16
  const newProfit = optimalPrice - ebayFees - supplierCost
  const currentProfit = currentPrice - (currentPrice * 0.16) - supplierCost
  const expectedProfitChange = newProfit - currentProfit

  // Estimate sales volume change based on price elasticity
  const expectedSalesVolumeChange = -priceChangePercent * cfg.demandElasticity

  // Build reasoning
  const reasoning: string[] = []

  if (optimalPrice < currentPrice) {
    reasoning.push(`Price above market avg ($${competitorPrices.avg.toFixed(2)}) by ${((currentPrice - competitorPrices.avg) / competitorPrices.avg * 100).toFixed(1)}%`)
    if (expectedSalesVolumeChange > 0) {
      reasoning.push(`Lower price expected to increase sales volume by ${expectedSalesVolumeChange.toFixed(1)}%`)
    }
  } else if (optimalPrice > currentPrice) {
    reasoning.push(`Current price leaves room for ${((optimalPrice - currentPrice) / currentPrice * 100).toFixed(1)}% increase`)
    reasoning.push(`Profit margin would increase from ${((currentProfit / currentPrice) * 100).toFixed(1)}% to ${((newProfit / optimalPrice) * 100).toFixed(1)}%`)
  }

  // Calculate confidence
  let confidence = 70
  if (competitorPrices.count >= 10) confidence += 10
  if (Math.abs(priceChangePercent) < 10) confidence += 10
  if (newProfit >= currentProfit) confidence += 5

  return {
    currentPrice,
    recommendedPrice: optimalPrice,
    priceChange,
    priceChangePercent,
    expectedProfitChange,
    expectedSalesVolumeChange,
    competitorPrices,
    reasoning,
    confidence: Math.min(100, confidence),
  }
}

async function getCompetitorPrices(
  asin: string | undefined,
  category: string | undefined
): Promise<PriceRecommendation['competitorPrices']> {
  // In production, this would fetch from competition analysis data
  const { data } = await supabase
    .from('competition_analyses')
    .select('competitor_prices')
    .eq('asin', asin)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .single()

  if (!data?.competitor_prices || !Array.isArray(data.competitor_prices)) {
    return { min: 0, max: 0, avg: 0, count: 0 }
  }

  const prices = data.competitor_prices as number[]
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    count: prices.length,
  }
}

function calculateOptimalPrice(
  currentPrice: number,
  supplierCost: number,
  competitors: PriceRecommendation['competitorPrices'],
  config: PriceOptimizationConfig
): number {
  const ebayFeeRate = 0.16

  // Calculate minimum viable price (to maintain min profit margin)
  const minViablePrice = supplierCost / (1 - ebayFeeRate - config.minProfitMargin / 100)

  // Calculate target price (for target profit margin)
  const targetPrice = supplierCost / (1 - ebayFeeRate - config.targetProfitMargin / 100)

  // Calculate competitive price
  let competitivePrice = competitors.avg
  if (competitors.count === 0) {
    competitivePrice = currentPrice
  }

  // Blend target and competitive price
  const blendedPrice =
    targetPrice * (1 - config.competitorPriceWeight) +
    competitivePrice * config.competitorPriceWeight

  // Ensure within bounds
  const maxPrice = supplierCost / (1 - ebayFeeRate - config.maxProfitMargin / 100)

  let optimalPrice = Math.max(minViablePrice, Math.min(maxPrice, blendedPrice))

  // Round to .99 for psychological pricing
  optimalPrice = Math.floor(optimalPrice) + 0.99

  return optimalPrice
}

// =============================================================================
// TITLE OPTIMIZATION
// =============================================================================

export interface TitleRecommendation {
  currentTitle: string
  recommendedTitle: string
  changes: Array<{
    type: 'add' | 'remove' | 'reorder' | 'modify'
    description: string
    impact: string
  }>
  keywordAnalysis: {
    highValueKeywords: string[]
    missingKeywords: string[]
    lowValueKeywords: string[]
    spamKeywords: string[]
  }
  cassiniScoreChange: number
  confidence: number
}

export async function optimizeTitle(
  listingId: string,
  config: Partial<TitleOptimizationConfig> = {}
): Promise<TitleRecommendation> {
  const cfg = { ...DEFAULT_CONFIG.title, ...config }

  const { data: listing } = await supabase
    .from('listings')
    .select('title, category, skus(*)')
    .eq('id', listingId)
    .single()

  if (!listing) {
    throw new Error('Listing not found')
  }

  const currentTitle = listing.title || ''

  // Analyze current title
  const analysis = analyzeTitleKeywords(currentTitle, cfg)

  // Get high-performing keywords for this category
  const categoryKeywords = await getCategoryKeywords(listing.category)

  // Build optimized title
  const optimizedTitle = buildOptimizedTitle(
    currentTitle,
    analysis,
    categoryKeywords,
    cfg
  )

  // Calculate Cassini score difference
  const currentScore = calculateTitleScore(currentTitle)
  const newScore = calculateTitleScore(optimizedTitle)

  // Build changes list
  const changes: TitleRecommendation['changes'] = []

  if (analysis.spamKeywords.length > 0) {
    changes.push({
      type: 'remove',
      description: `Remove spam keywords: ${analysis.spamKeywords.join(', ')}`,
      impact: 'Avoid Cassini penalties',
    })
  }

  if (analysis.missingKeywords.length > 0) {
    changes.push({
      type: 'add',
      description: `Add high-value keywords: ${analysis.missingKeywords.slice(0, 3).join(', ')}`,
      impact: 'Improve search visibility',
    })
  }

  if (currentTitle.length < 70) {
    changes.push({
      type: 'modify',
      description: 'Expand title to use more characters',
      impact: 'Better keyword coverage',
    })
  }

  return {
    currentTitle,
    recommendedTitle: optimizedTitle,
    changes,
    keywordAnalysis: {
      highValueKeywords: analysis.highValueKeywords,
      missingKeywords: analysis.missingKeywords,
      lowValueKeywords: analysis.lowValueKeywords,
      spamKeywords: analysis.spamKeywords,
    },
    cassiniScoreChange: newScore - currentScore,
    confidence: calculateTitleConfidence(changes, analysis),
  }
}

function analyzeTitleKeywords(
  title: string,
  config: TitleOptimizationConfig
): {
  highValueKeywords: string[]
  missingKeywords: string[]
  lowValueKeywords: string[]
  spamKeywords: string[]
} {
  const words = title.toLowerCase().split(/\s+/)

  // Detect spam keywords
  const spamKeywords = words.filter((word) =>
    config.avoidKeywords.some((avoid) => word.includes(avoid.toLowerCase()))
  )

  // High-value keywords (longer, descriptive words)
  const highValueKeywords = words.filter(
    (word) =>
      word.length >= 4 &&
      !spamKeywords.includes(word) &&
      !/^\d+$/.test(word)
  )

  // Low-value keywords (short common words)
  const lowValueKeywords = words.filter(
    (word) =>
      word.length <= 3 ||
      ['the', 'and', 'for', 'new', 'with'].includes(word)
  )

  return {
    highValueKeywords,
    missingKeywords: config.prioritizeKeywords.filter(
      (kw) => !title.toLowerCase().includes(kw.toLowerCase())
    ),
    lowValueKeywords,
    spamKeywords,
  }
}

async function getCategoryKeywords(category: string | undefined): Promise<string[]> {
  // In production, this would fetch from keyword analytics data
  // For now, return common high-value keywords
  return ['genuine', 'authentic', 'brand', 'original', 'quality']
}

function buildOptimizedTitle(
  currentTitle: string,
  analysis: ReturnType<typeof analyzeTitleKeywords>,
  categoryKeywords: string[],
  config: TitleOptimizationConfig
): string {
  let title = currentTitle

  // Remove spam keywords
  for (const spam of analysis.spamKeywords) {
    title = title.replace(new RegExp(spam, 'gi'), '').trim()
  }

  // Clean up excessive punctuation
  title = title.replace(/[!]{2,}/g, '!').replace(/\s+/g, ' ').trim()

  // Add missing high-value keywords if space allows
  const remaining = config.maxLength - title.length
  if (remaining > 10 && analysis.missingKeywords.length > 0) {
    const toAdd = analysis.missingKeywords[0]
    if (toAdd.length + 1 <= remaining) {
      title = `${title} ${toAdd}`
    }
  }

  // Ensure doesn't exceed max length
  if (title.length > config.maxLength) {
    title = title.substring(0, config.maxLength).trim()
    // Don't cut mid-word
    const lastSpace = title.lastIndexOf(' ')
    if (lastSpace > config.maxLength - 10) {
      title = title.substring(0, lastSpace)
    }
  }

  return title
}

function calculateTitleScore(title: string): number {
  let score = 50

  // Length scoring
  if (title.length >= 75 && title.length <= 80) score += 20
  else if (title.length >= 60) score += 10
  else if (title.length < 40) score -= 10

  // Spam penalty
  const spamPatterns = /L@@K|WOW|AMAZING|MUST SEE|!{2,}/i
  if (spamPatterns.test(title)) score -= 20

  // Keyword density (rough approximation)
  const words = title.split(/\s+/)
  const longWords = words.filter((w) => w.length >= 4).length
  if (longWords >= 6) score += 15
  else if (longWords >= 4) score += 10

  return Math.max(0, Math.min(100, score))
}

function calculateTitleConfidence(
  changes: TitleRecommendation['changes'],
  analysis: ReturnType<typeof analyzeTitleKeywords>
): number {
  let confidence = 70

  // More changes = more uncertain
  if (changes.length > 3) confidence -= 10
  if (changes.length === 0) confidence += 10

  // Spam removal is high confidence
  if (analysis.spamKeywords.length > 0) confidence += 10

  return Math.min(100, Math.max(0, confidence))
}

// =============================================================================
// OPTIMIZATION PLAN GENERATION
// =============================================================================

export async function generateOptimizationPlan(
  listingId: string,
  config: Partial<OptimizationConfig> = {}
): Promise<OptimizationPlan> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // Get listing performance
  const performance = await getListingPerformance(listingId)

  // Generate optimizations
  const optimizations: ListingOptimization[] = []

  // Price optimization
  try {
    const priceRec = await optimizePrice(listingId, cfg.pricing)
    if (Math.abs(priceRec.priceChangePercent) >= 3) {
      optimizations.push({
        listingId,
        optimizationType: 'price',
        priority: priceRec.expectedProfitChange > 5 ? 'high' : 'medium',
        currentValue: priceRec.currentPrice,
        recommendedValue: priceRec.recommendedPrice,
        expectedImpact: {
          profitChange: priceRec.expectedProfitChange * 30, // Monthly
          conversionChange: priceRec.expectedSalesVolumeChange,
          visibilityChange: 0,
        },
        confidence: priceRec.confidence,
        reasoning: priceRec.reasoning,
        dataPoints: [
          { metric: 'Competitor Avg', value: priceRec.competitorPrices.avg.toFixed(2) },
          { metric: 'Price Change', value: `${priceRec.priceChangePercent.toFixed(1)}%` },
        ],
      })
    }
  } catch (e) {
    console.error('[Optimizer] Price optimization error:', e)
  }

  // Title optimization
  try {
    const titleRec = await optimizeTitle(listingId, cfg.title)
    if (titleRec.changes.length > 0) {
      optimizations.push({
        listingId,
        optimizationType: 'title',
        priority: titleRec.keywordAnalysis.spamKeywords.length > 0 ? 'high' : 'low',
        currentValue: titleRec.currentTitle,
        recommendedValue: titleRec.recommendedTitle,
        expectedImpact: {
          profitChange: 0,
          conversionChange: titleRec.cassiniScoreChange > 10 ? 5 : 2,
          visibilityChange: titleRec.cassiniScoreChange,
        },
        confidence: titleRec.confidence,
        reasoning: titleRec.changes.map((c) => c.description),
        dataPoints: [
          { metric: 'Cassini Score Change', value: `+${titleRec.cassiniScoreChange}` },
          { metric: 'Spam Keywords', value: titleRec.keywordAnalysis.spamKeywords.length },
        ],
      })
    }
  } catch (e) {
    console.error('[Optimizer] Title optimization error:', e)
  }

  // Sort by expected profit impact
  optimizations.sort((a, b) => b.expectedImpact.profitChange - a.expectedImpact.profitChange)

  // Calculate total expected impact
  const totalExpectedProfitImpact = optimizations.reduce(
    (sum, opt) => sum + opt.expectedImpact.profitChange,
    0
  )

  return {
    listingId,
    currentPerformance: performance,
    optimizations,
    totalExpectedProfitImpact,
    implementationOrder: optimizations.map((_, i) => `opt_${i}`),
    estimatedTimeToImpact: optimizations.length > 0 ? '7-14 days' : 'N/A',
  }
}

async function getListingPerformance(listingId: string): Promise<ListingPerformance> {
  const { data: listing } = await supabase
    .from('listings')
    .select(`
      *,
      orders(total_amount, item_cost, order_date)
    `)
    .eq('id', listingId)
    .single()

  if (!listing) {
    throw new Error('Listing not found')
  }

  const orders = listing.orders || []
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentOrders = orders.filter(
    (o: any) => new Date(o.order_date) >= thirtyDaysAgo
  )

  const revenue = recentOrders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0)
  const cost = recentOrders.reduce((sum: number, o: any) => sum + (o.item_cost || 0), 0)
  const profit = revenue - cost - revenue * 0.16
  const sales = recentOrders.length

  const views = listing.view_count || 1
  const clicks = listing.click_count || 1

  const daysActive = listing.created_at
    ? Math.floor((Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0

  return {
    listingId,
    views,
    clicks,
    sales,
    revenue,
    profit,
    profitMargin: revenue > 0 ? (profit / revenue) * 100 : 0,
    conversionRate: views > 0 ? (sales / views) * 100 : 0,
    clickThroughRate: views > 0 ? (clicks / views) * 100 : 0,
    avgPosition: listing.avg_position || 50,
    daysActive,
    cassiniScore: listing.cassini_score || 50,
    trend: sales > 2 ? 'stable' : sales === 0 ? 'declining' : 'stable',
  }
}

// =============================================================================
// BATCH OPTIMIZATION
// =============================================================================

export interface BatchOptimizationResult {
  totalListings: number
  optimized: number
  skipped: number
  errors: number
  totalExpectedProfitImpact: number
  optimizationsByType: Record<string, number>
  topOpportunities: Array<{
    listingId: string
    expectedImpact: number
    primaryOptimization: string
  }>
}

export async function batchOptimize(
  listingIds: string[],
  config: Partial<OptimizationConfig> = {}
): Promise<BatchOptimizationResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const results: BatchOptimizationResult = {
    totalListings: listingIds.length,
    optimized: 0,
    skipped: 0,
    errors: 0,
    totalExpectedProfitImpact: 0,
    optimizationsByType: {},
    topOpportunities: [],
  }

  const allPlans: OptimizationPlan[] = []

  // Generate plans for all listings
  for (const listingId of listingIds) {
    try {
      const plan = await generateOptimizationPlan(listingId, cfg)

      if (plan.optimizations.length > 0) {
        allPlans.push(plan)
        results.optimized++
        results.totalExpectedProfitImpact += plan.totalExpectedProfitImpact

        // Count by type
        for (const opt of plan.optimizations) {
          results.optimizationsByType[opt.optimizationType] =
            (results.optimizationsByType[opt.optimizationType] || 0) + 1
        }
      } else {
        results.skipped++
      }
    } catch (e) {
      results.errors++
      console.error(`[Optimizer] Error processing ${listingId}:`, e)
    }
  }

  // Get top opportunities
  results.topOpportunities = allPlans
    .sort((a, b) => b.totalExpectedProfitImpact - a.totalExpectedProfitImpact)
    .slice(0, 10)
    .map((plan) => ({
      listingId: plan.listingId,
      expectedImpact: plan.totalExpectedProfitImpact,
      primaryOptimization: plan.optimizations[0]?.optimizationType || 'none',
    }))

  return results
}

// =============================================================================
// AUTO-OPTIMIZATION EXECUTION
// =============================================================================

export async function executeOptimization(
  optimization: ListingOptimization,
  config: Partial<OptimizationConfig> = {}
): Promise<{
  success: boolean
  appliedValue: string | number
  previousValue: string | number
  error?: string
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // Check confidence threshold
  if (optimization.confidence < cfg.minConfidenceToApply) {
    return {
      success: false,
      appliedValue: optimization.currentValue,
      previousValue: optimization.currentValue,
      error: `Confidence ${optimization.confidence}% below threshold ${cfg.minConfidenceToApply}%`,
    }
  }

  try {
    switch (optimization.optimizationType) {
      case 'price':
        await supabase
          .from('listings')
          .update({
            price: optimization.recommendedValue,
            last_price_update: new Date().toISOString(),
            previous_price: optimization.currentValue,
          })
          .eq('id', optimization.listingId)
        break

      case 'title':
        await supabase
          .from('listings')
          .update({
            title: optimization.recommendedValue,
            last_title_update: new Date().toISOString(),
            previous_title: optimization.currentValue,
          })
          .eq('id', optimization.listingId)
        break

      default:
        return {
          success: false,
          appliedValue: optimization.currentValue,
          previousValue: optimization.currentValue,
          error: `Optimization type ${optimization.optimizationType} not implemented for auto-apply`,
        }
    }

    // Log the optimization
    await supabase.from('optimization_history').insert({
      listing_id: optimization.listingId,
      optimization_type: optimization.optimizationType,
      previous_value: JSON.stringify(optimization.currentValue),
      new_value: JSON.stringify(optimization.recommendedValue),
      expected_impact: optimization.expectedImpact,
      confidence: optimization.confidence,
      applied_at: new Date().toISOString(),
      auto_applied: true,
    })

    return {
      success: true,
      appliedValue: optimization.recommendedValue,
      previousValue: optimization.currentValue,
    }
  } catch (error) {
    return {
      success: false,
      appliedValue: optimization.currentValue,
      previousValue: optimization.currentValue,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// OPTIMIZATION ANALYTICS
// =============================================================================

export interface OptimizationAnalytics {
  period: string
  totalOptimizations: number
  byType: Record<string, { count: number; avgImpact: number }>
  successRate: number
  totalProfitImpact: number
  avgConfidence: number
  topPerformers: Array<{
    listingId: string
    optimizationType: string
    actualImpact: number
    expectedImpact: number
    accuracy: number
  }>
  underperformers: Array<{
    listingId: string
    optimizationType: string
    actualImpact: number
    expectedImpact: number
    variance: number
  }>
}

export async function getOptimizationAnalytics(daysBack = 30): Promise<OptimizationAnalytics> {
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

  const { data } = await supabase
    .from('optimization_history')
    .select('*')
    .gte('applied_at', startDate.toISOString())

  const history = data || []

  const byType: Record<string, { count: number; totalImpact: number }> = {}
  let totalConfidence = 0
  let totalProfitImpact = 0
  let successCount = 0

  for (const opt of history) {
    const type = opt.optimization_type
    if (!byType[type]) {
      byType[type] = { count: 0, totalImpact: 0 }
    }
    byType[type].count++

    const impact = (opt.expected_impact as any)?.profitChange || 0
    byType[type].totalImpact += impact
    totalProfitImpact += impact
    totalConfidence += opt.confidence || 0

    if (opt.success !== false) successCount++
  }

  const byTypeFormatted: Record<string, { count: number; avgImpact: number }> = {}
  for (const [type, stats] of Object.entries(byType)) {
    byTypeFormatted[type] = {
      count: stats.count,
      avgImpact: stats.count > 0 ? stats.totalImpact / stats.count : 0,
    }
  }

  return {
    period: `${daysBack} days`,
    totalOptimizations: history.length,
    byType: byTypeFormatted,
    successRate: history.length > 0 ? (successCount / history.length) * 100 : 0,
    totalProfitImpact,
    avgConfidence: history.length > 0 ? totalConfidence / history.length : 0,
    topPerformers: [], // Would need actual vs expected comparison
    underperformers: [],
  }
}
