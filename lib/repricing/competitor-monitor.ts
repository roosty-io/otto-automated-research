/**
 * Competitor Price Monitoring Service
 *
 * Tracks competitor prices for active listings to enable
 * intelligent repricing decisions.
 */

import { supabase } from '@/lib/supabase'

export interface CompetitorPrice {
  sellerId: string
  sellerName?: string
  price: number
  shippingCost: number
  totalPrice: number
  condition: string
  quantity: number
  feedbackScore?: number
  feedbackPercent?: number
  lastSeen: Date
  isTopRated?: boolean
}

export interface CompetitorAnalysis {
  sku: string
  assignmentId: string
  ourPrice: number
  lowestPrice: number
  lowestTotalPrice: number
  averagePrice: number
  medianPrice: number
  highestPrice: number
  competitorCount: number
  ourPosition: number
  priceSpread: number
  competitors: CompetitorPrice[]
  buyBoxHolder?: CompetitorPrice
  recommendedPrice?: number
  lastUpdated: Date
}

export interface MonitoringJob {
  id: string
  assignmentId: string
  sku: string
  ebayListingId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  lastRun?: Date
  nextRun?: Date
  error?: string
}

export interface MonitoringOptions {
  storeId?: string
  maxListings?: number
  prioritizeActive?: boolean
  minDaysSinceCheck?: number
}

export interface MonitoringResult {
  totalChecked: number
  totalUpdated: number
  totalErrors: number
  priceChangesDetected: number
  duration: number
  errors: Array<{ assignmentId: string; error: string }>
}

/**
 * Run competitor monitoring batch
 */
export async function runCompetitorMonitoring(
  options: MonitoringOptions = {}
): Promise<MonitoringResult> {
  const startTime = Date.now()
  const {
    storeId,
    maxListings = 500,
    prioritizeActive = true,
    minDaysSinceCheck = 1,
  } = options

  const result: MonitoringResult = {
    totalChecked: 0,
    totalUpdated: 0,
    totalErrors: 0,
    priceChangesDetected: 0,
    duration: 0,
    errors: [],
  }

  try {
    // Get listings that need competitor checks
    const listings = await getListingsForMonitoring({
      storeId,
      maxListings,
      prioritizeActive,
      minDaysSinceCheck,
    })

    console.log(`[CompetitorMonitor] Found ${listings.length} listings to check`)

    for (const listing of listings) {
      try {
        const analysis = await checkCompetitorPrices(listing)

        if (analysis) {
          // Store the analysis
          await storeCompetitorAnalysis(analysis)
          result.totalUpdated++

          // Check if price changes were detected
          if (analysis.priceSpread > 0) {
            result.priceChangesDetected++
          }
        }

        result.totalChecked++
      } catch (error) {
        result.totalErrors++
        result.errors.push({
          assignmentId: listing.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    result.duration = Date.now() - startTime
    return result
  } catch (error) {
    console.error('[CompetitorMonitor] Batch error:', error)
    result.duration = Date.now() - startTime
    throw error
  }
}

/**
 * Get listings that need competitor monitoring
 */
async function getListingsForMonitoring(options: {
  storeId?: string
  maxListings: number
  prioritizeActive: boolean
  minDaysSinceCheck: number
}): Promise<any[]> {
  const { storeId, maxListings, prioritizeActive, minDaysSinceCheck } = options

  let query = supabase
    .from('store_sku_assignments')
    .select(`
      id,
      store_id,
      sku,
      current_price,
      ebay_listing_id,
      competitor_last_checked,
      stores!inner(id, name)
    `)
    .eq('status', 'active')
    .not('ebay_listing_id', 'is', null)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  // Get listings not checked recently
  const checkThreshold = new Date()
  checkThreshold.setDate(checkThreshold.getDate() - minDaysSinceCheck)

  query = query.or(
    `competitor_last_checked.is.null,competitor_last_checked.lt.${checkThreshold.toISOString()}`
  )

  if (prioritizeActive) {
    // Prioritize listings with recent sales
    query = query.order('last_sale_date', { ascending: false, nullsFirst: false })
  }

  query = query.limit(maxListings)

  const { data, error } = await query

  if (error) {
    console.error('[CompetitorMonitor] Query error:', error)
    return []
  }

  return data || []
}

/**
 * Check competitor prices for a listing
 */
async function checkCompetitorPrices(listing: any): Promise<CompetitorAnalysis | null> {
  // In production, this would call eBay API or scrape competitor data
  // For now, simulate competitor data

  const competitors = await fetchCompetitorData(listing.sku, listing.ebay_listing_id)

  if (!competitors || competitors.length === 0) {
    return null
  }

  // Sort by total price
  competitors.sort((a, b) => a.totalPrice - b.totalPrice)

  const prices = competitors.map(c => c.totalPrice)
  const ourPrice = listing.current_price || 0

  // Calculate statistics
  const lowestPrice = Math.min(...competitors.map(c => c.price))
  const lowestTotalPrice = prices[0]
  const highestPrice = Math.max(...prices)
  const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length
  const medianPrice = prices[Math.floor(prices.length / 2)]
  const priceSpread = highestPrice - lowestTotalPrice

  // Determine our position
  let ourPosition = 1
  for (const price of prices) {
    if (price < ourPrice) {
      ourPosition++
    } else {
      break
    }
  }

  // Find buy box holder (lowest price with good feedback)
  const buyBoxHolder = competitors.find(
    c => c.feedbackPercent && c.feedbackPercent >= 98 && c.feedbackScore && c.feedbackScore >= 100
  ) || competitors[0]

  // Calculate recommended price
  const recommendedPrice = calculateRecommendedPrice(
    ourPrice,
    lowestTotalPrice,
    averagePrice,
    competitors
  )

  return {
    sku: listing.sku,
    assignmentId: listing.id,
    ourPrice,
    lowestPrice,
    lowestTotalPrice,
    averagePrice,
    medianPrice,
    highestPrice,
    competitorCount: competitors.length,
    ourPosition,
    priceSpread,
    competitors,
    buyBoxHolder,
    recommendedPrice,
    lastUpdated: new Date(),
  }
}

/**
 * Fetch competitor data from eBay
 */
async function fetchCompetitorData(
  sku: string,
  ebayListingId: string
): Promise<CompetitorPrice[]> {
  // In production, implement actual eBay API calls or scraping
  // This is a placeholder that simulates competitor data

  // Check if we have cached data
  const { data: cached } = await supabase
    .from('competitor_prices')
    .select('*')
    .eq('sku', sku)
    .gte('last_seen', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  if (cached && cached.length > 0) {
    return cached.map(c => ({
      sellerId: c.seller_id,
      sellerName: c.seller_name,
      price: c.price,
      shippingCost: c.shipping_cost || 0,
      totalPrice: c.price + (c.shipping_cost || 0),
      condition: c.condition || 'New',
      quantity: c.quantity || 1,
      feedbackScore: c.feedback_score,
      feedbackPercent: c.feedback_percent,
      lastSeen: new Date(c.last_seen),
      isTopRated: c.is_top_rated,
    }))
  }

  // Simulate API call (in production, replace with actual eBay Browse API)
  // This would use the eBay Browse API's search endpoint
  console.log(`[CompetitorMonitor] Would fetch competitors for SKU: ${sku}`)

  return []
}

/**
 * Calculate recommended price based on competition
 */
function calculateRecommendedPrice(
  currentPrice: number,
  lowestPrice: number,
  averagePrice: number,
  competitors: CompetitorPrice[]
): number {
  // Strategy: Beat the lowest competitive price by a small margin
  // while staying above minimum profit threshold

  if (competitors.length === 0) {
    return currentPrice
  }

  // Target slightly below the lowest qualified competitor
  const qualifiedCompetitors = competitors.filter(
    c => c.feedbackPercent && c.feedbackPercent >= 95 && c.quantity > 0
  )

  if (qualifiedCompetitors.length > 0) {
    const lowestQualified = Math.min(...qualifiedCompetitors.map(c => c.totalPrice))
    // Beat by 1-2%
    return Math.round((lowestQualified * 0.99) * 100) / 100
  }

  // If no qualified competitors, target slightly below average
  return Math.round((averagePrice * 0.97) * 100) / 100
}

/**
 * Store competitor analysis in database
 */
async function storeCompetitorAnalysis(analysis: CompetitorAnalysis): Promise<void> {
  // Update the assignment with competitor data
  const { error: updateError } = await supabase
    .from('store_sku_assignments')
    .update({
      competitor_lowest_price: analysis.lowestTotalPrice,
      competitor_count: analysis.competitorCount,
      competitor_position: analysis.ourPosition,
      competitor_last_checked: new Date().toISOString(),
      recommended_price: analysis.recommendedPrice,
    })
    .eq('id', analysis.assignmentId)

  if (updateError) {
    console.error('[CompetitorMonitor] Update error:', updateError)
  }

  // Store detailed competitor data
  for (const competitor of analysis.competitors) {
    const { error } = await supabase
      .from('competitor_prices')
      .upsert({
        sku: analysis.sku,
        seller_id: competitor.sellerId,
        seller_name: competitor.sellerName,
        price: competitor.price,
        shipping_cost: competitor.shippingCost,
        condition: competitor.condition,
        quantity: competitor.quantity,
        feedback_score: competitor.feedbackScore,
        feedback_percent: competitor.feedbackPercent,
        is_top_rated: competitor.isTopRated,
        last_seen: competitor.lastSeen.toISOString(),
      }, {
        onConflict: 'sku,seller_id',
      })

    if (error && !error.message.includes('duplicate')) {
      console.error('[CompetitorMonitor] Competitor insert error:', error)
    }
  }

  // Log to price history
  await supabase
    .from('competitor_price_history')
    .insert({
      assignment_id: analysis.assignmentId,
      sku: analysis.sku,
      our_price: analysis.ourPrice,
      lowest_price: analysis.lowestTotalPrice,
      average_price: analysis.averagePrice,
      competitor_count: analysis.competitorCount,
      our_position: analysis.ourPosition,
      recorded_at: new Date().toISOString(),
    })
}

/**
 * Get competitor analysis for a listing
 */
export async function getCompetitorAnalysis(assignmentId: string): Promise<CompetitorAnalysis | null> {
  const { data: assignment, error } = await supabase
    .from('store_sku_assignments')
    .select(`
      id,
      sku,
      current_price,
      competitor_lowest_price,
      competitor_count,
      competitor_position,
      competitor_last_checked,
      recommended_price
    `)
    .eq('id', assignmentId)
    .single()

  if (error || !assignment) {
    return null
  }

  // Get competitor details
  const { data: competitors } = await supabase
    .from('competitor_prices')
    .select('*')
    .eq('sku', assignment.sku)
    .order('price', { ascending: true })

  const competitorList: CompetitorPrice[] = (competitors || []).map(c => ({
    sellerId: c.seller_id,
    sellerName: c.seller_name,
    price: c.price,
    shippingCost: c.shipping_cost || 0,
    totalPrice: c.price + (c.shipping_cost || 0),
    condition: c.condition || 'New',
    quantity: c.quantity || 1,
    feedbackScore: c.feedback_score,
    feedbackPercent: c.feedback_percent,
    lastSeen: new Date(c.last_seen),
    isTopRated: c.is_top_rated,
  }))

  const prices = competitorList.map(c => c.totalPrice)

  return {
    sku: assignment.sku,
    assignmentId: assignment.id,
    ourPrice: assignment.current_price || 0,
    lowestPrice: Math.min(...competitorList.map(c => c.price), 0),
    lowestTotalPrice: assignment.competitor_lowest_price || prices[0] || 0,
    averagePrice: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
    medianPrice: prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0,
    highestPrice: Math.max(...prices, 0),
    competitorCount: assignment.competitor_count || 0,
    ourPosition: assignment.competitor_position || 1,
    priceSpread: prices.length > 0 ? Math.max(...prices) - Math.min(...prices) : 0,
    competitors: competitorList,
    recommendedPrice: assignment.recommended_price,
    lastUpdated: assignment.competitor_last_checked
      ? new Date(assignment.competitor_last_checked)
      : new Date(),
  }
}

/**
 * Get competitor monitoring stats
 */
export async function getMonitoringStats(options: {
  storeId?: string
  daysBack?: number
} = {}): Promise<{
  totalMonitored: number
  needsCheck: number
  averageCompetitors: number
  priceAlerts: number
  marketTrends: {
    pricesUp: number
    pricesDown: number
    stable: number
  }
}> {
  const { storeId, daysBack = 7 } = options

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  // Get total monitored
  let totalQuery = supabase
    .from('store_sku_assignments')
    .select('id', { count: 'exact' })
    .eq('status', 'active')
    .not('competitor_last_checked', 'is', null)

  if (storeId) {
    totalQuery = totalQuery.eq('store_id', storeId)
  }

  const { count: totalMonitored } = await totalQuery

  // Get needs check count
  const checkThreshold = new Date()
  checkThreshold.setDate(checkThreshold.getDate() - 1)

  let needsQuery = supabase
    .from('store_sku_assignments')
    .select('id', { count: 'exact' })
    .eq('status', 'active')
    .or(`competitor_last_checked.is.null,competitor_last_checked.lt.${checkThreshold.toISOString()}`)

  if (storeId) {
    needsQuery = needsQuery.eq('store_id', storeId)
  }

  const { count: needsCheck } = await needsQuery

  // Get average competitors
  let avgQuery = supabase
    .from('store_sku_assignments')
    .select('competitor_count')
    .eq('status', 'active')
    .not('competitor_count', 'is', null)

  if (storeId) {
    avgQuery = avgQuery.eq('store_id', storeId)
  }

  const { data: avgData } = await avgQuery

  const averageCompetitors = avgData && avgData.length > 0
    ? avgData.reduce((sum, a) => sum + (a.competitor_count || 0), 0) / avgData.length
    : 0

  // Get price alerts (where we're not in top 3)
  let alertQuery = supabase
    .from('store_sku_assignments')
    .select('id', { count: 'exact' })
    .eq('status', 'active')
    .gt('competitor_position', 3)

  if (storeId) {
    alertQuery = alertQuery.eq('store_id', storeId)
  }

  const { count: priceAlerts } = await alertQuery

  // Get market trends from price history
  const { data: historyData } = await supabase
    .from('competitor_price_history')
    .select('assignment_id, lowest_price')
    .gte('recorded_at', startDate.toISOString())
    .order('recorded_at', { ascending: true })

  // Calculate trends
  const trends = {
    pricesUp: 0,
    pricesDown: 0,
    stable: 0,
  }

  if (historyData && historyData.length > 0) {
    // Group by assignment
    const byAssignment = new Map<string, number[]>()
    for (const h of historyData) {
      if (!byAssignment.has(h.assignment_id)) {
        byAssignment.set(h.assignment_id, [])
      }
      byAssignment.get(h.assignment_id)!.push(h.lowest_price)
    }

    // Analyze each assignment's trend
    for (const [, prices] of byAssignment) {
      if (prices.length >= 2) {
        const first = prices[0]
        const last = prices[prices.length - 1]
        const change = (last - first) / first

        if (change > 0.02) {
          trends.pricesUp++
        } else if (change < -0.02) {
          trends.pricesDown++
        } else {
          trends.stable++
        }
      }
    }
  }

  return {
    totalMonitored: totalMonitored || 0,
    needsCheck: needsCheck || 0,
    averageCompetitors: Math.round(averageCompetitors * 10) / 10,
    priceAlerts: priceAlerts || 0,
    marketTrends: trends,
  }
}

/**
 * Get price alerts for listings needing attention
 */
export async function getPriceAlerts(options: {
  storeId?: string
  limit?: number
} = {}): Promise<Array<{
  assignmentId: string
  sku: string
  ourPrice: number
  lowestPrice: number
  position: number
  competitorCount: number
  priceDiff: number
  priceDiffPercent: number
}>> {
  const { storeId, limit = 50 } = options

  let query = supabase
    .from('store_sku_assignments')
    .select(`
      id,
      sku,
      current_price,
      competitor_lowest_price,
      competitor_position,
      competitor_count
    `)
    .eq('status', 'active')
    .not('competitor_lowest_price', 'is', null)
    .gt('competitor_position', 1) // Not in first position
    .order('competitor_position', { ascending: false })
    .limit(limit)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error || !data) {
    return []
  }

  return data.map(d => {
    const priceDiff = (d.current_price || 0) - (d.competitor_lowest_price || 0)
    const priceDiffPercent = d.competitor_lowest_price
      ? (priceDiff / d.competitor_lowest_price) * 100
      : 0

    return {
      assignmentId: d.id,
      sku: d.sku,
      ourPrice: d.current_price || 0,
      lowestPrice: d.competitor_lowest_price || 0,
      position: d.competitor_position || 1,
      competitorCount: d.competitor_count || 0,
      priceDiff: Math.round(priceDiff * 100) / 100,
      priceDiffPercent: Math.round(priceDiffPercent * 10) / 10,
    }
  })
}

/**
 * Schedule monitoring job
 */
export async function scheduleMonitoring(
  assignmentId: string,
  priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
  const nextRun = new Date()

  switch (priority) {
    case 'high':
      // Check immediately
      break
    case 'normal':
      // Check in 6 hours
      nextRun.setHours(nextRun.getHours() + 6)
      break
    case 'low':
      // Check in 24 hours
      nextRun.setDate(nextRun.getDate() + 1)
      break
  }

  await supabase
    .from('monitoring_queue')
    .upsert({
      assignment_id: assignmentId,
      priority,
      scheduled_at: nextRun.toISOString(),
      status: 'pending',
    }, {
      onConflict: 'assignment_id',
    })
}
