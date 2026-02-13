/**
 * Competition Monitoring Service
 *
 * Monitors eBay marketplace competition for products:
 * - Tracks number of sellers for each product
 * - Monitors price trends and undercuts
 * - Detects new competitors entering
 * - Analyzes seller strength
 * - Cassini visibility scoring for accurate competition assessment
 * - Visibility-adjusted pricing recommendations
 */

import { EbayClient, getEbayClient } from '../integrations/ebay/client'
import { supabase } from '../supabase'
import { CASSINI_THRESHOLDS } from './cassini-optimizer'

// =============================================================================
// TYPES
// =============================================================================

export interface CompetitorInfo {
  sellerId: string
  sellerName: string
  price: number
  condition: string
  feedbackScore: number
  feedbackPercent: number
  shippingCost: number
  totalPrice: number
  isFeatured: boolean
  listingUrl?: string
  // Cassini visibility factors
  cassiniVisibility: {
    isTopRatedPlus: boolean
    isTopRatedSeller: boolean
    visibilityBoost: number        // 0, 15, or 20%
    estimatedSearchPosition: number // Adjusted position based on visibility
    hasNewListingBoost: boolean
    titleScore: number             // 0-100 based on title optimization
    itemSpecificsCount?: number
  }
}

export interface CompetitionAnalysis {
  productId: string
  productTitle: string

  // Overall metrics
  totalCompetitors: number
  competitionLevel: 'none' | 'low' | 'medium' | 'high' | 'saturated'

  // Price analysis
  lowestPrice: number
  highestPrice: number
  averagePrice: number
  medianPrice: number
  priceSpread: number // % difference between low and high

  // Position analysis
  ourPosition?: number
  priceToWin?: number // Price needed to be cheapest
  marginAtWinningPrice?: number

  // Seller analysis
  topCompetitors: CompetitorInfo[]
  newCompetitors24h?: number
  exitedCompetitors24h?: number

  // Cassini visibility analysis (NEW)
  cassiniAnalysis: {
    topRatedPlusCompetitors: number
    topRatedCompetitors: number
    avgCompetitorVisibilityBoost: number
    highVisibilityCompetitors: number  // Competitors with visibility boost >= 15%
    visibilityAdjustedPosition?: number  // Our position accounting for visibility
    visibilityGap?: number            // Our visibility vs avg competitor visibility
    effectiveCompetition: number       // Visibility-weighted competitor count
    cassiniAdvantage: 'strong' | 'neutral' | 'weak'  // Our Cassini position vs competition
  }

  // Recommendations
  pricingRecommendation: 'hold' | 'lower' | 'raise' | 'delist'
  suggestedPrice?: number
  reasoning: string
  cassiniRecommendations?: string[]  // Visibility-specific recommendations

  analyzedAt: string
}

export interface MarketTrend {
  productId: string
  period: '7d' | '30d' | '90d'
  priceChange: number // %
  competitorChange: number // count
  demandChange: number // % based on sold count
  trend: 'growing' | 'stable' | 'declining' | 'volatile'
}

// =============================================================================
// COMPETITION ANALYSIS
// =============================================================================

interface EbayItemResponse {
  itemId: string
  title: string
  price: { value: string; currency: string }
  seller?: {
    username: string
    feedbackPercentage: string
    feedbackScore: number
    topRatedSeller?: boolean  // eBay API may provide this
  }
  condition?: string
  shippingOptions?: Array<{
    shippingCost?: { value: string }
    type?: string
    shipToLocationUsedForEstimate?: string
    deliveryDateEstimate?: {
      minDate: string
      maxDate: string
    }
  }>
  topRatedBuyingExperience?: boolean  // Top Rated Plus indicator
  itemCreationDate?: string           // For new listing boost estimation
  localizedAspects?: Array<{          // Item specifics
    type: string
    name: string
    value: string
  }>
}

interface EbaySearchItemsResponse {
  itemSummaries?: EbayItemResponse[]
  total: number
}

export async function analyzeCompetition(
  productTitle: string,
  options: {
    ourPrice?: number
    ourSellerId?: string
    category?: string
    condition?: 'new' | 'used' | 'all'
    maxCompetitors?: number
    // Cassini visibility data for our listing
    ourCassiniData?: {
      isTopRatedPlus?: boolean
      isTopRatedSeller?: boolean
      visibilityBoost?: number
    }
  } = {}
): Promise<CompetitionAnalysis> {
  const { ourPrice, ourSellerId, category, condition = 'new', maxCompetitors = 50, ourCassiniData } = options

  try {
    const client = new EbayClient({ marketplace: 'US' })

    // Search for similar listings
    const searchParams: Record<string, string> = {
      q: extractSearchQuery(productTitle),
      limit: String(Math.min(maxCompetitors, 200)),
      filter: `buyingOptions:{FIXED_PRICE}`,
    }

    if (category) {
      searchParams.category_ids = category
    }

    if (condition === 'new') {
      searchParams.filter += `,conditionIds:{1000}` // New condition
    }

    const response = await client.request<EbaySearchItemsResponse>(
      '/buy/browse/v1/item_summary/search',
      {
        method: 'GET',
        queryParams: searchParams,
        useApplicationToken: true,
      }
    )

    if (!response.success || !response.data?.itemSummaries) {
      return createEmptyAnalysis(productTitle, 'none')
    }

    const items = response.data.itemSummaries

    // Extract competitor info with Cassini visibility scoring
    const competitors: CompetitorInfo[] = items
      .filter((item) => item.seller?.username !== ourSellerId)
      .map((item, index) => {
        const price = parseFloat(item.price?.value || '0')
        const shippingCost = parseFloat(item.shippingOptions?.[0]?.shippingCost?.value || '0')

        // Calculate Cassini visibility factors
        const isTopRatedPlus = item.topRatedBuyingExperience === true
        const isTopRatedSeller = item.seller?.topRatedSeller === true ||
          (item.seller?.feedbackScore && item.seller.feedbackScore >= 100 &&
           parseFloat(item.seller?.feedbackPercentage || '0') >= CASSINI_THRESHOLDS.feedbackScore.good)

        let visibilityBoost = 0
        if (isTopRatedPlus) visibilityBoost = 20
        else if (isTopRatedSeller) visibilityBoost = 15

        // Estimate if this is a new listing (within 48h boost window)
        const hasNewListingBoost = item.itemCreationDate
          ? (Date.now() - new Date(item.itemCreationDate).getTime()) < 48 * 60 * 60 * 1000
          : false
        if (hasNewListingBoost) visibilityBoost += 5  // Estimated new listing boost

        // Score the title for Cassini optimization
        const titleScore = scoreTitleForCassini(item.title)

        // Item specifics count
        const itemSpecificsCount = item.localizedAspects?.length || 0

        return {
          sellerId: item.seller?.username || 'unknown',
          sellerName: item.seller?.username || 'Unknown Seller',
          price,
          condition: item.condition || 'New',
          feedbackScore: item.seller?.feedbackScore || 0,
          feedbackPercent: parseFloat(item.seller?.feedbackPercentage || '0'),
          shippingCost,
          totalPrice: price + shippingCost,
          isFeatured: false,
          cassiniVisibility: {
            isTopRatedPlus,
            isTopRatedSeller,
            visibilityBoost,
            estimatedSearchPosition: index + 1,  // Will be adjusted later
            hasNewListingBoost,
            titleScore,
            itemSpecificsCount: itemSpecificsCount > 0 ? itemSpecificsCount : undefined,
          },
        }
      })

    if (competitors.length === 0) {
      return createEmptyAnalysis(productTitle, 'none')
    }

    // Price analysis
    const prices = competitors.map((c) => c.totalPrice).sort((a, b) => a - b)
    const lowestPrice = prices[0]
    const highestPrice = prices[prices.length - 1]
    const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length
    const medianPrice = prices[Math.floor(prices.length / 2)]
    const priceSpread = ((highestPrice - lowestPrice) / lowestPrice) * 100

    // Determine competition level
    let competitionLevel: CompetitionAnalysis['competitionLevel']
    if (competitors.length === 0) competitionLevel = 'none'
    else if (competitors.length <= 5) competitionLevel = 'low'
    else if (competitors.length <= 15) competitionLevel = 'medium'
    else if (competitors.length <= 30) competitionLevel = 'high'
    else competitionLevel = 'saturated'

    // Calculate our position if we have a price
    let ourPosition: number | undefined
    let priceToWin: number | undefined
    let marginAtWinningPrice: number | undefined

    if (ourPrice) {
      const allPrices = [...prices, ourPrice].sort((a, b) => a - b)
      ourPosition = allPrices.indexOf(ourPrice) + 1
      priceToWin = Math.max(0, lowestPrice - 0.01)
    }

    // Cassini visibility analysis
    const topRatedPlusCompetitors = competitors.filter(c => c.cassiniVisibility.isTopRatedPlus).length
    const topRatedCompetitors = competitors.filter(c => c.cassiniVisibility.isTopRatedSeller).length
    const avgCompetitorVisibilityBoost = competitors.length > 0
      ? competitors.reduce((sum, c) => sum + c.cassiniVisibility.visibilityBoost, 0) / competitors.length
      : 0
    const highVisibilityCompetitors = competitors.filter(c => c.cassiniVisibility.visibilityBoost >= 15).length

    // Calculate effective competition (visibility-weighted)
    // Competitors with higher visibility are weighted more heavily
    const effectiveCompetition = competitors.reduce((sum, c) => {
      const weight = 1 + (c.cassiniVisibility.visibilityBoost / 100)
      return sum + weight
    }, 0)

    // Calculate our visibility-adjusted position
    let visibilityAdjustedPosition: number | undefined
    let visibilityGap: number | undefined
    let cassiniAdvantage: 'strong' | 'neutral' | 'weak' = 'neutral'

    if (ourCassiniData) {
      const ourVisibility = ourCassiniData.visibilityBoost || 0

      // Calculate visibility gap (positive = we have advantage)
      visibilityGap = ourVisibility - avgCompetitorVisibilityBoost

      // Determine Cassini advantage
      if (ourVisibility >= 15 && avgCompetitorVisibilityBoost < 10) {
        cassiniAdvantage = 'strong'
      } else if (ourVisibility < 10 && avgCompetitorVisibilityBoost >= 15) {
        cassiniAdvantage = 'weak'
      }

      // Adjust position based on visibility
      if (ourPosition) {
        // Better visibility can improve effective position
        const positionBonus = Math.floor(visibilityGap / 5)  // Each 5% visibility advantage = 1 position improvement
        visibilityAdjustedPosition = Math.max(1, ourPosition - positionBonus)
      }
    }

    // Generate Cassini-specific recommendations
    const cassiniRecommendations: string[] = []

    if (topRatedPlusCompetitors > competitors.length * 0.3) {
      cassiniRecommendations.push('Many competitors have Top Rated Plus. Achieve TRP for +20% visibility.')
    }

    if (avgCompetitorVisibilityBoost > 10 && (!ourCassiniData?.visibilityBoost || ourCassiniData.visibilityBoost < 10)) {
      cassiniRecommendations.push('Competitors have visibility advantage. Improve seller metrics for Top Rated status.')
    }

    if (cassiniAdvantage === 'weak') {
      cassiniRecommendations.push('Your Cassini visibility is below average. Focus on 1-day handling and free returns.')
    }

    if (cassiniAdvantage === 'strong') {
      cassiniRecommendations.push('You have strong visibility advantage. Consider premium pricing strategy.')
    }

    // Generate pricing recommendation with Cassini context
    const { recommendation, suggestedPrice, reasoning } = generatePricingRecommendation(
      competitors,
      ourPrice,
      lowestPrice,
      averagePrice,
      competitionLevel,
      cassiniAdvantage  // Pass Cassini advantage to pricing
    )

    // Sort competitors by total price
    const topCompetitors = [...competitors]
      .sort((a, b) => a.totalPrice - b.totalPrice)
      .slice(0, 10)

    return {
      productId: productTitle.substring(0, 50).replace(/\s+/g, '-').toLowerCase(),
      productTitle,
      totalCompetitors: competitors.length,
      competitionLevel,
      lowestPrice,
      highestPrice,
      averagePrice: Math.round(averagePrice * 100) / 100,
      medianPrice,
      priceSpread: Math.round(priceSpread * 10) / 10,
      ourPosition,
      priceToWin,
      marginAtWinningPrice,
      topCompetitors,
      cassiniAnalysis: {
        topRatedPlusCompetitors,
        topRatedCompetitors,
        avgCompetitorVisibilityBoost: Math.round(avgCompetitorVisibilityBoost * 10) / 10,
        highVisibilityCompetitors,
        visibilityAdjustedPosition,
        visibilityGap: visibilityGap !== undefined ? Math.round(visibilityGap * 10) / 10 : undefined,
        effectiveCompetition: Math.round(effectiveCompetition * 10) / 10,
        cassiniAdvantage,
      },
      pricingRecommendation: recommendation,
      suggestedPrice,
      reasoning,
      cassiniRecommendations: cassiniRecommendations.length > 0 ? cassiniRecommendations : undefined,
      analyzedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('[CompetitionMonitor] Error:', error)
    return createEmptyAnalysis(productTitle, 'none')
  }
}

function extractSearchQuery(title: string): string {
  // Extract key terms from title, removing common filler words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'new', 'used', 'brand', 'free', 'shipping', 'fast', 'sale',
  ])

  const words = title.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))

  // Take first 5-7 meaningful words
  return words.slice(0, 7).join(' ')
}

/**
 * Score a title for Cassini optimization (0-100)
 * Higher score = better optimized for Cassini algorithm
 */
function scoreTitleForCassini(title: string): number {
  let score = 50  // Start at neutral

  // Spam terms that Cassini penalizes
  const spamTerms = [
    'l@@k', 'look', 'wow', 'amazing', 'best', 'cheap', 'sale',
    '!!!', '***', 'must see', 'hot', 'rare find',
  ]

  const titleLower = title.toLowerCase()

  // Penalize spam terms
  let spamCount = 0
  for (const term of spamTerms) {
    if (titleLower.includes(term)) spamCount++
  }
  score -= spamCount * 10

  // Title length scoring
  const length = title.length
  if (length >= 75 && length <= 80) {
    score += 20  // Optimal length
  } else if (length >= 60 && length < 75) {
    score += 10  // Good length
  } else if (length < 40) {
    score -= 15  // Too short
  }

  // Check for keyword front-loading (starts with meaningful words)
  const fillerStarters = ['new', 'hot', 'sale', 'best', 'great', 'amazing', 'a', 'an', 'the']
  const firstWord = titleLower.split(/\s+/)[0]
  if (!fillerStarters.includes(firstWord)) {
    score += 10  // Good keyword placement
  } else {
    score -= 5
  }

  // Excessive punctuation check
  const punctuationCount = (title.match(/[!*@#$%^&(){}[\]]/g) || []).length
  if (punctuationCount > 2) {
    score -= punctuationCount * 3
  }

  // Check for all caps (Cassini may penalize)
  const capsRatio = (title.match(/[A-Z]/g) || []).length / title.length
  if (capsRatio > 0.5) {
    score -= 10
  }

  return Math.max(0, Math.min(100, score))
}

function generatePricingRecommendation(
  competitors: CompetitorInfo[],
  ourPrice: number | undefined,
  lowestPrice: number,
  averagePrice: number,
  competitionLevel: CompetitionAnalysis['competitionLevel'],
  cassiniAdvantage?: 'strong' | 'neutral' | 'weak'
): {
  recommendation: CompetitionAnalysis['pricingRecommendation']
  suggestedPrice?: number
  reasoning: string
} {
  if (!ourPrice) {
    // No current price - suggest based on market
    let multiplier = 0.95  // Default 5% below average

    // Adjust entry price based on Cassini advantage
    if (cassiniAdvantage === 'strong') {
      multiplier = 1.0  // Can match average with strong visibility
    } else if (cassiniAdvantage === 'weak') {
      multiplier = 0.90  // Need to be more aggressive without visibility
    }

    const suggestedPrice = Math.round(averagePrice * multiplier * 100) / 100
    const visibilityNote = cassiniAdvantage === 'strong'
      ? ' (visibility advantage allows competitive pricing)'
      : cassiniAdvantage === 'weak'
        ? ' (lower price compensates for visibility gap)'
        : ''
    return {
      recommendation: 'hold',
      suggestedPrice,
      reasoning: `Suggested entry price at $${suggestedPrice}${visibilityNote}`,
    }
  }

  const priceDiffFromLowest = ((ourPrice - lowestPrice) / lowestPrice) * 100

  // Adjust thresholds based on Cassini advantage
  // Strong visibility allows higher prices; weak visibility needs lower prices
  const priceThresholdAdjustment = cassiniAdvantage === 'strong' ? 5 : cassiniAdvantage === 'weak' ? -5 : 0

  if (competitionLevel === 'saturated') {
    const delistThreshold = 20 + priceThresholdAdjustment
    const lowerThreshold = 10 + priceThresholdAdjustment

    if (priceDiffFromLowest > delistThreshold) {
      // With strong visibility, suggest lowering instead of delisting
      if (cassiniAdvantage === 'strong') {
        return {
          recommendation: 'lower',
          suggestedPrice: Math.round(lowestPrice * 1.10 * 100) / 100,
          reasoning: 'Market saturated but your visibility advantage may offset. Try lowering price first.',
        }
      }
      return {
        recommendation: 'delist',
        reasoning: 'Market saturated and your price is too high. Consider delisting.',
      }
    }
    if (priceDiffFromLowest > lowerThreshold) {
      return {
        recommendation: 'lower',
        suggestedPrice: Math.round(lowestPrice * 1.05 * 100) / 100,
        reasoning: 'Saturated market - lower price to remain competitive',
      }
    }
  }

  const upperThreshold = 15 + priceThresholdAdjustment
  if (priceDiffFromLowest > upperThreshold) {
    return {
      recommendation: 'lower',
      suggestedPrice: Math.round(lowestPrice * 1.05 * 100) / 100,
      reasoning: `Your price is ${priceDiffFromLowest.toFixed(0)}% above lowest. Consider lowering.`,
    }
  }

  const lowerThreshold = -10 - priceThresholdAdjustment
  if (priceDiffFromLowest < lowerThreshold && competitionLevel !== 'saturated') {
    // With strong visibility, can raise more aggressively
    const raiseMultiplier = cassiniAdvantage === 'strong' ? 1.0 : 0.95
    return {
      recommendation: 'raise',
      suggestedPrice: Math.round(averagePrice * raiseMultiplier * 100) / 100,
      reasoning: cassiniAdvantage === 'strong'
        ? 'Your price is below market and you have visibility advantage. Raise to market average.'
        : 'Your price is significantly below market. You could raise and still sell.',
    }
  }

  // With strong Cassini visibility, can maintain slightly higher prices
  if (cassiniAdvantage === 'strong' && priceDiffFromLowest > 5 && priceDiffFromLowest <= 15) {
    return {
      recommendation: 'hold',
      reasoning: 'Your visibility advantage offsets slightly higher price. Hold current price.',
    }
  }

  return {
    recommendation: 'hold',
    reasoning: 'Your price is competitive with the market.',
  }
}

function createEmptyAnalysis(
  productTitle: string,
  competitionLevel: CompetitionAnalysis['competitionLevel']
): CompetitionAnalysis {
  return {
    productId: productTitle.substring(0, 50).replace(/\s+/g, '-').toLowerCase(),
    productTitle,
    totalCompetitors: 0,
    competitionLevel,
    lowestPrice: 0,
    highestPrice: 0,
    averagePrice: 0,
    medianPrice: 0,
    priceSpread: 0,
    topCompetitors: [],
    cassiniAnalysis: {
      topRatedPlusCompetitors: 0,
      topRatedCompetitors: 0,
      avgCompetitorVisibilityBoost: 0,
      highVisibilityCompetitors: 0,
      effectiveCompetition: 0,
      cassiniAdvantage: 'strong',  // No competition = strong position
    },
    pricingRecommendation: 'hold',
    reasoning: 'No competitors found - you have the market to yourself!',
    analyzedAt: new Date().toISOString(),
  }
}

// =============================================================================
// MARKET MONITORING
// =============================================================================

export async function monitorListingCompetition(
  listingId: string
): Promise<CompetitionAnalysis | null> {
  try {
    // Get listing details from database
    const { data: assignment } = await supabase
      .from('store_sku_assignments')
      .select(`
        id,
        current_price,
        store_id,
        sku:skus(title, source_price)
      `)
      .eq('ebay_listing_id', listingId)
      .single()

    if (!assignment) {
      return null
    }

    // Get store's seller ID
    const { data: store } = await supabase
      .from('stores')
      .select('external_id')
      .eq('id', assignment.store_id)
      .single()

    return analyzeCompetition(assignment.sku.title, {
      ourPrice: assignment.current_price,
      ourSellerId: store?.external_id,
    })
  } catch (error) {
    console.error('[CompetitionMonitor] Monitor listing error:', error)
    return null
  }
}

// =============================================================================
// BATCH MONITORING
// =============================================================================

export async function batchMonitorCompetition(
  products: Array<{ title: string; ourPrice?: number; category?: string }>
): Promise<CompetitionAnalysis[]> {
  const results: CompetitionAnalysis[] = []
  const BATCH_SIZE = 5 // Limit concurrent API calls

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)

    const batchResults = await Promise.all(
      batch.map((product) =>
        analyzeCompetition(product.title, {
          ourPrice: product.ourPrice,
          category: product.category,
        })
      )
    )

    results.push(...batchResults)

    // Rate limit
    if (i + BATCH_SIZE < products.length) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  return results
}

// =============================================================================
// ALERTS
// =============================================================================

export interface CompetitionAlert {
  type: 'price_undercut' | 'new_competitor' | 'competitor_exit' | 'price_war' | 'market_saturation' | 'visibility_gap' | 'trp_competition_surge'
  severity: 'low' | 'medium' | 'high' | 'critical'
  productId: string
  message: string
  data: Record<string, unknown>
  createdAt: string
}

export async function checkForAlerts(
  analysis: CompetitionAnalysis,
  previousAnalysis?: CompetitionAnalysis,
  ourCassiniData?: { visibilityBoost: number; isTopRatedPlus: boolean }
): Promise<CompetitionAlert[]> {
  const alerts: CompetitionAlert[] = []

  // Price undercut detection
  if (previousAnalysis && analysis.lowestPrice < previousAnalysis.lowestPrice * 0.9) {
    alerts.push({
      type: 'price_undercut',
      severity: 'high',
      productId: analysis.productId,
      message: `Price dropped ${((1 - analysis.lowestPrice / previousAnalysis.lowestPrice) * 100).toFixed(0)}%`,
      data: {
        previousLow: previousAnalysis.lowestPrice,
        currentLow: analysis.lowestPrice,
      },
      createdAt: new Date().toISOString(),
    })
  }

  // New competitors
  if (previousAnalysis && analysis.totalCompetitors > previousAnalysis.totalCompetitors + 5) {
    alerts.push({
      type: 'new_competitor',
      severity: 'medium',
      productId: analysis.productId,
      message: `${analysis.totalCompetitors - previousAnalysis.totalCompetitors} new competitors entered`,
      data: {
        previousCount: previousAnalysis.totalCompetitors,
        currentCount: analysis.totalCompetitors,
      },
      createdAt: new Date().toISOString(),
    })
  }

  // Market saturation warning
  if (analysis.competitionLevel === 'saturated' && analysis.pricingRecommendation === 'delist') {
    alerts.push({
      type: 'market_saturation',
      severity: 'critical',
      productId: analysis.productId,
      message: 'Market is saturated - consider delisting',
      data: {
        competitors: analysis.totalCompetitors,
        priceSpread: analysis.priceSpread,
      },
      createdAt: new Date().toISOString(),
    })
  }

  // Cassini visibility gap alert
  if (analysis.cassiniAnalysis.cassiniAdvantage === 'weak' &&
      analysis.cassiniAnalysis.avgCompetitorVisibilityBoost > 15) {
    alerts.push({
      type: 'visibility_gap',
      severity: 'high',
      productId: analysis.productId,
      message: `Cassini visibility gap: competitors avg ${analysis.cassiniAnalysis.avgCompetitorVisibilityBoost}% boost`,
      data: {
        avgCompetitorBoost: analysis.cassiniAnalysis.avgCompetitorVisibilityBoost,
        topRatedPlusCount: analysis.cassiniAnalysis.topRatedPlusCompetitors,
        yourBoost: ourCassiniData?.visibilityBoost || 0,
        visibilityGap: analysis.cassiniAnalysis.visibilityGap,
      },
      createdAt: new Date().toISOString(),
    })
  }

  // Top Rated Plus competition surge alert
  if (previousAnalysis) {
    const previousTRP = previousAnalysis.cassiniAnalysis?.topRatedPlusCompetitors || 0
    const currentTRP = analysis.cassiniAnalysis.topRatedPlusCompetitors

    if (currentTRP > previousTRP + 3) {
      const isOurTRP = ourCassiniData?.isTopRatedPlus || false

      alerts.push({
        type: 'trp_competition_surge',
        severity: isOurTRP ? 'medium' : 'high',
        productId: analysis.productId,
        message: `${currentTRP - previousTRP} new Top Rated Plus competitors entered`,
        data: {
          previousTRPCount: previousTRP,
          currentTRPCount: currentTRP,
          youHaveTRP: isOurTRP,
          recommendation: isOurTRP
            ? 'Maintain TRP status to stay competitive'
            : 'Achieve Top Rated Plus for +20% visibility to compete',
        },
        createdAt: new Date().toISOString(),
      })
    }
  }

  // High visibility competitor concentration alert
  if (analysis.cassiniAnalysis.highVisibilityCompetitors > analysis.totalCompetitors * 0.5 &&
      analysis.cassiniAnalysis.highVisibilityCompetitors >= 5) {
    alerts.push({
      type: 'visibility_gap',
      severity: 'medium',
      productId: analysis.productId,
      message: `${analysis.cassiniAnalysis.highVisibilityCompetitors}/${analysis.totalCompetitors} competitors have high Cassini visibility`,
      data: {
        highVisibilityCount: analysis.cassiniAnalysis.highVisibilityCompetitors,
        totalCompetitors: analysis.totalCompetitors,
        percentageWithBoost: Math.round(analysis.cassiniAnalysis.highVisibilityCompetitors / analysis.totalCompetitors * 100),
      },
      createdAt: new Date().toISOString(),
    })
  }

  return alerts
}

// =============================================================================
// DATABASE INTEGRATION
// =============================================================================

export async function saveCompetitionAnalysis(analysis: CompetitionAnalysis): Promise<void> {
  try {
    await supabase.from('competition_analyses').insert({
      product_id: analysis.productId,
      product_title: analysis.productTitle,
      total_competitors: analysis.totalCompetitors,
      competition_level: analysis.competitionLevel,
      lowest_price: analysis.lowestPrice,
      highest_price: analysis.highestPrice,
      average_price: analysis.averagePrice,
      median_price: analysis.medianPrice,
      price_spread: analysis.priceSpread,
      our_position: analysis.ourPosition,
      pricing_recommendation: analysis.pricingRecommendation,
      suggested_price: analysis.suggestedPrice,
      reasoning: analysis.reasoning,
      top_competitors: analysis.topCompetitors,
      analyzed_at: analysis.analyzedAt,
    })
  } catch (error) {
    console.error('[CompetitionMonitor] Failed to save analysis:', error)
  }
}

export async function saveAlert(alert: CompetitionAlert): Promise<void> {
  try {
    await supabase.from('competition_alerts').insert({
      type: alert.type,
      severity: alert.severity,
      product_id: alert.productId,
      message: alert.message,
      data: alert.data,
      created_at: alert.createdAt,
      is_read: false,
    })
  } catch (error) {
    console.error('[CompetitionMonitor] Failed to save alert:', error)
  }
}
