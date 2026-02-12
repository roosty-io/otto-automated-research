/**
 * Competition Monitoring Service
 *
 * Monitors eBay marketplace competition for products:
 * - Tracks number of sellers for each product
 * - Monitors price trends and undercuts
 * - Detects new competitors entering
 * - Analyzes seller strength
 */

import { EbayClient, getEbayClient } from '../integrations/ebay/client'
import { supabase } from '../supabase'

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

  // Recommendations
  pricingRecommendation: 'hold' | 'lower' | 'raise' | 'delist'
  suggestedPrice?: number
  reasoning: string

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
  }
  condition?: string
  shippingOptions?: Array<{
    shippingCost?: { value: string }
    type?: string
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
  } = {}
): Promise<CompetitionAnalysis> {
  const { ourPrice, ourSellerId, category, condition = 'new', maxCompetitors = 50 } = options

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

    // Extract competitor info
    const competitors: CompetitorInfo[] = items
      .filter((item) => item.seller?.username !== ourSellerId)
      .map((item) => {
        const price = parseFloat(item.price?.value || '0')
        const shippingCost = parseFloat(item.shippingOptions?.[0]?.shippingCost?.value || '0')

        return {
          sellerId: item.seller?.username || 'unknown',
          sellerName: item.seller?.username || 'Unknown Seller',
          price,
          condition: item.condition || 'New',
          feedbackScore: item.seller?.feedbackScore || 0,
          feedbackPercent: parseFloat(item.seller?.feedbackPercentage || '0'),
          shippingCost,
          totalPrice: price + shippingCost,
          isFeatured: false, // Would need additional API call
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

    // Generate pricing recommendation
    const { recommendation, suggestedPrice, reasoning } = generatePricingRecommendation(
      competitors,
      ourPrice,
      lowestPrice,
      averagePrice,
      competitionLevel
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
      pricingRecommendation: recommendation,
      suggestedPrice,
      reasoning,
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

function generatePricingRecommendation(
  competitors: CompetitorInfo[],
  ourPrice: number | undefined,
  lowestPrice: number,
  averagePrice: number,
  competitionLevel: CompetitionAnalysis['competitionLevel']
): {
  recommendation: CompetitionAnalysis['pricingRecommendation']
  suggestedPrice?: number
  reasoning: string
} {
  if (!ourPrice) {
    // No current price - suggest based on market
    const suggestedPrice = Math.round(averagePrice * 0.95 * 100) / 100 // 5% below average
    return {
      recommendation: 'hold',
      suggestedPrice,
      reasoning: `Suggested entry price at $${suggestedPrice} (5% below market average)`,
    }
  }

  const priceDiffFromLowest = ((ourPrice - lowestPrice) / lowestPrice) * 100

  if (competitionLevel === 'saturated') {
    if (priceDiffFromLowest > 20) {
      return {
        recommendation: 'delist',
        reasoning: 'Market saturated and your price is 20%+ above lowest. Consider delisting.',
      }
    }
    if (priceDiffFromLowest > 10) {
      return {
        recommendation: 'lower',
        suggestedPrice: Math.round(lowestPrice * 1.05 * 100) / 100,
        reasoning: 'Saturated market - lower price to remain competitive',
      }
    }
  }

  if (priceDiffFromLowest > 15) {
    return {
      recommendation: 'lower',
      suggestedPrice: Math.round(lowestPrice * 1.05 * 100) / 100,
      reasoning: `Your price is ${priceDiffFromLowest.toFixed(0)}% above lowest. Consider lowering.`,
    }
  }

  if (priceDiffFromLowest < -10 && competitionLevel !== 'saturated') {
    return {
      recommendation: 'raise',
      suggestedPrice: Math.round(averagePrice * 0.95 * 100) / 100,
      reasoning: 'Your price is significantly below market. You could raise and still sell.',
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
    pricingRecommendation: 'hold',
    reasoning: 'No competitors found - you may have the market to yourself!',
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
  type: 'price_undercut' | 'new_competitor' | 'competitor_exit' | 'price_war' | 'market_saturation'
  severity: 'low' | 'medium' | 'high' | 'critical'
  productId: string
  message: string
  data: Record<string, unknown>
  createdAt: string
}

export async function checkForAlerts(
  analysis: CompetitionAnalysis,
  previousAnalysis?: CompetitionAnalysis
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
