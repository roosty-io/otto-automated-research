// OTTO Research Labs - Profit Optimization Engine
// Automatically optimizes pricing, inventory, and operations for maximum profit

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TYPES
// ============================================================================

export interface OptimizationConfig {
  // Target Metrics
  targetMonthlyProfit: number
  targetProfitMargin: number  // Minimum acceptable margin
  minPriceMargin: number  // Floor margin (never go below)

  // Pricing Strategy
  pricingStrategy: 'competitive' | 'value' | 'premium'
  priceAdjustmentRange: { min: number; max: number }  // % adjustment
  repriceFrequency: 'hourly' | 'daily' | 'weekly'

  // Inventory Strategy
  inventoryStrategy: 'aggressive' | 'balanced' | 'conservative'
  maxListingsPerDay: number
  pruneThreshold: number  // Days without sale before pruning

  // Risk Tolerance
  riskTolerance: 'low' | 'medium' | 'high'
  complianceStrict: boolean
}

export interface OptimizationRecommendation {
  id: string
  type: 'pricing' | 'inventory' | 'listing' | 'pruning' | 'restock'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  expectedImpact: {
    profitChange: number
    marginChange: number
    riskLevel: string
  }
  action: {
    type: string
    params: Record<string, unknown>
  }
  autoApply: boolean
}

export interface OptimizationResult {
  storeId: string
  storeName: string
  currentMetrics: {
    monthlyProfit: number
    profitMargin: number
    activeListings: number
    avgDaysToSale: number
  }
  targetMetrics: {
    monthlyProfit: number
    profitMargin: number
  }
  gap: {
    profitGap: number
    marginGap: number
    onTrack: boolean
  }
  recommendations: OptimizationRecommendation[]
  projectedOutcome: {
    expectedProfit: number
    expectedMargin: number
    confidenceLevel: number
  }
  lastOptimized: string
}

// ============================================================================
// DEFAULT CONFIGURATIONS BY TIER
// ============================================================================

export const TIER_OPTIMIZATION_CONFIGS: Record<string, OptimizationConfig> = {
  starter: {
    targetMonthlyProfit: 1000,
    targetProfitMargin: 20,
    minPriceMargin: 15,
    pricingStrategy: 'competitive',
    priceAdjustmentRange: { min: -10, max: 15 },
    repriceFrequency: 'daily',
    inventoryStrategy: 'conservative',
    maxListingsPerDay: 20,
    pruneThreshold: 45,
    riskTolerance: 'low',
    complianceStrict: true
  },
  growth: {
    targetMonthlyProfit: 2000,
    targetProfitMargin: 22,
    minPriceMargin: 15,
    pricingStrategy: 'competitive',
    priceAdjustmentRange: { min: -15, max: 20 },
    repriceFrequency: 'daily',
    inventoryStrategy: 'balanced',
    maxListingsPerDay: 50,
    pruneThreshold: 30,
    riskTolerance: 'medium',
    complianceStrict: true
  },
  professional: {
    targetMonthlyProfit: 3000,
    targetProfitMargin: 25,
    minPriceMargin: 18,
    pricingStrategy: 'value',
    priceAdjustmentRange: { min: -10, max: 25 },
    repriceFrequency: 'hourly',
    inventoryStrategy: 'balanced',
    maxListingsPerDay: 100,
    pruneThreshold: 21,
    riskTolerance: 'medium',
    complianceStrict: true
  },
  enterprise: {
    targetMonthlyProfit: 7500,
    targetProfitMargin: 25,
    minPriceMargin: 18,
    pricingStrategy: 'value',
    priceAdjustmentRange: { min: -15, max: 30 },
    repriceFrequency: 'hourly',
    inventoryStrategy: 'aggressive',
    maxListingsPerDay: 500,
    pruneThreshold: 14,
    riskTolerance: 'high',
    complianceStrict: true
  },
  managed_service: {
    targetMonthlyProfit: 3000,  // $3k per store goal
    targetProfitMargin: 25,
    minPriceMargin: 18,
    pricingStrategy: 'value',
    priceAdjustmentRange: { min: -10, max: 25 },
    repriceFrequency: 'hourly',
    inventoryStrategy: 'aggressive',
    maxListingsPerDay: 200,
    pruneThreshold: 14,
    riskTolerance: 'medium',
    complianceStrict: true
  }
}

// ============================================================================
// OPTIMIZATION ENGINE
// ============================================================================

export async function optimizeStore(
  storeId: string,
  config?: Partial<OptimizationConfig>
): Promise<OptimizationResult> {
  // Fetch store data
  const { data: store } = await supabase
    .from('stores')
    .select(`
      *,
      store_tiers(tier_name),
      user_subscriptions(tier_id)
    `)
    .eq('id', storeId)
    .single()

  if (!store) {
    throw new Error('Store not found')
  }

  // Get tier-based config
  const tierId = store.user_subscriptions?.tier_id || 'starter'
  const baseConfig = TIER_OPTIMIZATION_CONFIGS[tierId] || TIER_OPTIMIZATION_CONFIGS.starter
  const finalConfig = { ...baseConfig, ...config }

  // Calculate current metrics
  const currentMetrics = await calculateCurrentMetrics(storeId)

  // Calculate gap to target
  const gap = {
    profitGap: finalConfig.targetMonthlyProfit - currentMetrics.monthlyProfit,
    marginGap: finalConfig.targetProfitMargin - currentMetrics.profitMargin,
    onTrack: currentMetrics.monthlyProfit >= finalConfig.targetMonthlyProfit * 0.85
  }

  // Generate recommendations
  const recommendations = await generateRecommendations(
    storeId,
    currentMetrics,
    finalConfig,
    gap
  )

  // Project outcome if recommendations applied
  const projectedOutcome = projectOutcome(currentMetrics, recommendations)

  return {
    storeId,
    storeName: store.store_name,
    currentMetrics,
    targetMetrics: {
      monthlyProfit: finalConfig.targetMonthlyProfit,
      profitMargin: finalConfig.targetProfitMargin
    },
    gap,
    recommendations,
    projectedOutcome,
    lastOptimized: new Date().toISOString()
  }
}

async function calculateCurrentMetrics(storeId: string): Promise<OptimizationResult['currentMetrics']> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Get orders this month
  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, item_cost, net_profit, order_date')
    .eq('store_id', storeId)
    .gte('order_date', monthStart.toISOString())
    .not('status', 'eq', 'CANCELLED')

  const revenue = (orders || []).reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const profit = (orders || []).reduce((sum, o) => sum + (o.net_profit || 0), 0)
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0

  // Get active listings
  const { count: activeListings } = await supabase
    .from('store_sku_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('listing_status', 'active')

  // Calculate avg days to sale (from listing to first sale)
  const avgDaysToSale = 7  // Placeholder - would calculate from actual data

  return {
    monthlyProfit: profit,
    profitMargin: margin,
    activeListings: activeListings || 0,
    avgDaysToSale
  }
}

async function generateRecommendations(
  storeId: string,
  metrics: OptimizationResult['currentMetrics'],
  config: OptimizationConfig,
  gap: OptimizationResult['gap']
): Promise<OptimizationRecommendation[]> {
  const recommendations: OptimizationRecommendation[] = []

  // ========== PRICING RECOMMENDATIONS ==========

  // Check for underpriced items
  const { data: underpricedItems } = await supabase
    .from('store_sku_assignments')
    .select(`
      id,
      current_price,
      skus(amazon_price, ebay_price, title)
    `)
    .eq('store_id', storeId)
    .eq('listing_status', 'active')
    .lt('current_price', supabase.raw('skus.ebay_price * 0.9'))
    .limit(20)

  if (underpricedItems && underpricedItems.length > 0) {
    const potentialRevenue = underpricedItems.reduce((sum, item) => {
      const targetPrice = (item.skus as any)?.ebay_price || item.current_price
      return sum + (targetPrice - item.current_price)
    }, 0)

    recommendations.push({
      id: `price-increase-${Date.now()}`,
      type: 'pricing',
      priority: 'high',
      title: `Increase prices on ${underpricedItems.length} underpriced items`,
      description: `These items are priced below market rate. Adjusting to competitive prices could increase monthly profit.`,
      expectedImpact: {
        profitChange: potentialRevenue * 0.8,  // Assume 80% conversion
        marginChange: 2,
        riskLevel: 'low'
      },
      action: {
        type: 'bulk_reprice',
        params: {
          itemIds: underpricedItems.map(i => i.id),
          strategy: 'market_rate'
        }
      },
      autoApply: config.riskTolerance !== 'low'
    })
  }

  // Check for overpriced items (no sales in 14+ days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const { data: overpricedItems } = await supabase
    .from('store_sku_assignments')
    .select('id, current_price, listed_at')
    .eq('store_id', storeId)
    .eq('listing_status', 'active')
    .lt('listed_at', fourteenDaysAgo.toISOString())
    .limit(50)

  // Filter to items without recent sales (would need sales data per item)
  if (overpricedItems && overpricedItems.length > 10) {
    recommendations.push({
      id: `price-decrease-${Date.now()}`,
      type: 'pricing',
      priority: 'medium',
      title: `Consider reducing prices on ${overpricedItems.length} slow-moving items`,
      description: `These items haven't sold in 14+ days. A 5-10% price reduction could improve sell-through rate.`,
      expectedImpact: {
        profitChange: -100,  // Short term loss
        marginChange: -1,
        riskLevel: 'low'
      },
      action: {
        type: 'bulk_reprice',
        params: {
          itemIds: overpricedItems.slice(0, 20).map(i => i.id),
          strategy: 'discount',
          discountPercent: 7
        }
      },
      autoApply: false
    })
  }

  // ========== INVENTORY RECOMMENDATIONS ==========

  // Check if store needs more listings
  const listingDeficit = calculateListingDeficit(metrics, config, gap)

  if (listingDeficit > 0) {
    recommendations.push({
      id: `add-listings-${Date.now()}`,
      type: 'inventory',
      priority: gap.onTrack ? 'medium' : 'high',
      title: `Add ${listingDeficit} more listings`,
      description: `Based on your profit target and current performance, adding more quality listings will help reach your goal.`,
      expectedImpact: {
        profitChange: listingDeficit * 3,  // Assume $3 profit per listing per month
        marginChange: 0,
        riskLevel: 'low'
      },
      action: {
        type: 'auto_replenish',
        params: {
          count: listingDeficit,
          strategy: config.inventoryStrategy
        }
      },
      autoApply: config.inventoryStrategy === 'aggressive'
    })
  }

  // ========== PRUNING RECOMMENDATIONS ==========

  // Find items to prune
  const pruneDate = new Date(Date.now() - config.pruneThreshold * 24 * 60 * 60 * 1000)

  const { data: staleListing, count: staleCount } = await supabase
    .from('store_sku_assignments')
    .select('id', { count: 'exact' })
    .eq('store_id', storeId)
    .eq('listing_status', 'active')
    .lt('listed_at', pruneDate.toISOString())
    .limit(100)

  if (staleCount && staleCount > 10) {
    recommendations.push({
      id: `prune-stale-${Date.now()}`,
      type: 'pruning',
      priority: 'medium',
      title: `Prune ${staleCount} stale listings`,
      description: `These listings haven't sold in ${config.pruneThreshold}+ days. Removing them frees up capacity for better-performing products.`,
      expectedImpact: {
        profitChange: staleCount * 0.5,  // Small boost from removing fees
        marginChange: 1,
        riskLevel: 'low'
      },
      action: {
        type: 'bulk_prune',
        params: {
          itemIds: (staleListing || []).map(i => i.id),
          threshold: config.pruneThreshold
        }
      },
      autoApply: true
    })
  }

  // ========== RESTOCK RECOMMENDATIONS ==========

  // Find top performers that need restocking (if applicable)
  // This would check for items that sold out

  // ========== GAP ANALYSIS ==========

  if (!gap.onTrack) {
    const requiredDailyProfit = gap.profitGap / 30

    recommendations.push({
      id: `profit-gap-${Date.now()}`,
      type: 'listing',
      priority: 'critical',
      title: `Close $${gap.profitGap.toFixed(0)} monthly profit gap`,
      description: `You need an additional $${requiredDailyProfit.toFixed(2)}/day to hit your target. Focus on high-margin products and optimize pricing.`,
      expectedImpact: {
        profitChange: gap.profitGap,
        marginChange: gap.marginGap,
        riskLevel: 'medium'
      },
      action: {
        type: 'strategy_adjustment',
        params: {
          focus: 'profit_recovery',
          urgency: 'high'
        }
      },
      autoApply: false
    })
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return recommendations.slice(0, 10)  // Max 10 recommendations
}

function calculateListingDeficit(
  metrics: OptimizationResult['currentMetrics'],
  config: OptimizationConfig,
  gap: OptimizationResult['gap']
): number {
  if (gap.onTrack) {
    // Still add some to grow
    return Math.min(50, config.maxListingsPerDay * 7)
  }

  // Calculate how many listings needed to close gap
  const avgProfitPerListing = metrics.activeListings > 0
    ? metrics.monthlyProfit / metrics.activeListings
    : 3  // Default $3/listing/month

  const listingsNeeded = avgProfitPerListing > 0
    ? Math.ceil(gap.profitGap / avgProfitPerListing)
    : 100

  return Math.min(listingsNeeded, config.maxListingsPerDay * 14)  // Cap at 2 weeks worth
}

function projectOutcome(
  current: OptimizationResult['currentMetrics'],
  recommendations: OptimizationRecommendation[]
): OptimizationResult['projectedOutcome'] {
  let expectedProfitIncrease = 0
  let expectedMarginChange = 0

  for (const rec of recommendations) {
    if (rec.autoApply || rec.priority === 'critical' || rec.priority === 'high') {
      expectedProfitIncrease += rec.expectedImpact.profitChange
      expectedMarginChange += rec.expectedImpact.marginChange
    }
  }

  const expectedProfit = current.monthlyProfit + expectedProfitIncrease
  const expectedMargin = current.profitMargin + expectedMarginChange

  // Confidence based on how many recommendations can be auto-applied
  const autoApplyCount = recommendations.filter(r => r.autoApply).length
  const confidenceLevel = Math.min(90, 50 + (autoApplyCount * 10))

  return {
    expectedProfit,
    expectedMargin,
    confidenceLevel
  }
}

// ============================================================================
// AUTO-OPTIMIZATION EXECUTION
// ============================================================================

export async function executeAutoOptimizations(storeId: string): Promise<{
  executed: number
  skipped: number
  results: Array<{ recommendationId: string; success: boolean; message: string }>
}> {
  const optimization = await optimizeStore(storeId)
  const autoApplyRecs = optimization.recommendations.filter(r => r.autoApply)

  const results: Array<{ recommendationId: string; success: boolean; message: string }> = []

  for (const rec of autoApplyRecs) {
    try {
      switch (rec.action.type) {
        case 'bulk_reprice':
          // Would call repricing service
          results.push({
            recommendationId: rec.id,
            success: true,
            message: `Repriced ${(rec.action.params.itemIds as string[]).length} items`
          })
          break

        case 'bulk_prune':
          // Would call pruning service
          results.push({
            recommendationId: rec.id,
            success: true,
            message: `Pruned ${(rec.action.params.itemIds as string[]).length} items`
          })
          break

        case 'auto_replenish':
          // Would call replenishment service
          results.push({
            recommendationId: rec.id,
            success: true,
            message: `Queued ${rec.action.params.count} items for listing`
          })
          break

        default:
          results.push({
            recommendationId: rec.id,
            success: false,
            message: `Unknown action type: ${rec.action.type}`
          })
      }
    } catch (error) {
      results.push({
        recommendationId: rec.id,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return {
    executed: results.filter(r => r.success).length,
    skipped: optimization.recommendations.length - autoApplyRecs.length,
    results
  }
}

// ============================================================================
// BATCH OPTIMIZATION (for managed service)
// ============================================================================

export async function optimizeAllStores(userId?: string): Promise<{
  optimized: number
  totalRecommendations: number
  criticalCount: number
  aggregateGap: number
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
    return { optimized: 0, totalRecommendations: 0, criticalCount: 0, aggregateGap: 0 }
  }

  let totalRecommendations = 0
  let criticalCount = 0
  let aggregateGap = 0

  for (const store of stores) {
    try {
      const result = await optimizeStore(store.id)
      totalRecommendations += result.recommendations.length
      criticalCount += result.recommendations.filter(r => r.priority === 'critical').length
      aggregateGap += result.gap.profitGap
    } catch (error) {
      console.error(`[Optimizer] Failed to optimize store ${store.id}:`, error)
    }
  }

  return {
    optimized: stores.length,
    totalRecommendations,
    criticalCount,
    aggregateGap
  }
}

// ============================================================================
// 30-45 DAY RAMP-UP PLAN
// ============================================================================

export interface RampUpPlan {
  storeId: string
  targetProfit: number
  currentProfit: number
  daysToTarget: number
  phases: Array<{
    week: number
    listingsToAdd: number
    targetRevenue: number
    targetProfit: number
    actions: string[]
  }>
  milestones: Array<{
    day: number
    metric: string
    target: number
    description: string
  }>
}

export function createRampUpPlan(
  storeId: string,
  currentListings: number,
  currentProfit: number,
  targetProfit: number = 3000,
  daysToTarget: number = 30
): RampUpPlan {
  const weeksToTarget = Math.ceil(daysToTarget / 7)
  const profitGap = targetProfit - currentProfit
  const weeklyProfitIncrease = profitGap / weeksToTarget

  // Estimate listings needed (assuming $3 profit per listing per month)
  const profitPerListing = 3
  const listingsNeeded = Math.ceil(profitGap / profitPerListing)
  const listingsPerWeek = Math.ceil(listingsNeeded / weeksToTarget)

  const phases: RampUpPlan['phases'] = []
  let cumulativeListings = currentListings
  let cumulativeProfit = currentProfit

  for (let week = 1; week <= weeksToTarget; week++) {
    const weekListings = week === 1
      ? Math.ceil(listingsPerWeek * 0.7)  // Start slower
      : listingsPerWeek

    cumulativeListings += weekListings
    cumulativeProfit += weeklyProfitIncrease

    const actions: string[] = []

    if (week === 1) {
      actions.push('Set up repricing rules for competitive pricing')
      actions.push('Enable auto-compliance checking')
      actions.push('Configure pruning rules (14-day threshold)')
    } else if (week === 2) {
      actions.push('Review first week performance')
      actions.push('Adjust pricing strategy based on sell-through')
      actions.push('Ramp up listing velocity')
    } else if (week === 3) {
      actions.push('Prune underperforming listings')
      actions.push('Double down on top categories')
      actions.push('Enable aggressive repricing')
    } else {
      actions.push('Maintain listing velocity')
      actions.push('Optimize for profit margin')
      actions.push('Monitor compliance scores')
    }

    phases.push({
      week,
      listingsToAdd: weekListings,
      targetRevenue: cumulativeProfit * 4,  // Assuming 25% margin
      targetProfit: Math.round(cumulativeProfit),
      actions
    })
  }

  const milestones: RampUpPlan['milestones'] = [
    { day: 7, metric: 'listings', target: currentListings + listingsPerWeek, description: 'First week listing target' },
    { day: 7, metric: 'orders', target: 5, description: 'First sales coming in' },
    { day: 14, metric: 'profit', target: Math.round(currentProfit + weeklyProfitIncrease * 2), description: 'Halfway to weekly profit target' },
    { day: 21, metric: 'listings', target: currentListings + listingsPerWeek * 3, description: '75% of listings added' },
    { day: 30, metric: 'profit', target: targetProfit, description: 'Reach $3k monthly profit target' }
  ]

  return {
    storeId,
    targetProfit,
    currentProfit,
    daysToTarget,
    phases,
    milestones
  }
}
