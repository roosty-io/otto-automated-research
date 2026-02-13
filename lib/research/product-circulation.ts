/**
 * Product Circulation System
 *
 * Manages the lifecycle and circulation of products across the platform.
 * Designed for scale: 150k+ products/month at 10,000+ users with 6 users per product.
 *
 * Key responsibilities:
 * - Product lifecycle management (discovery -> active -> pruned -> recycled)
 * - Intelligent product allocation across stores
 * - Data-driven pruning with protection against over-pruning
 * - Product replacement pipeline
 * - Performance-based circulation optimization
 */

import { supabase } from '../supabase'

// =============================================================================
// TYPES
// =============================================================================

export type ProductStatus = 'discovery' | 'validating' | 'ready' | 'active' | 'underperforming' | 'pruned' | 'recycled'

export interface ProductCirculationState {
  productId: string
  skuCode: string
  status: ProductStatus
  currentStores: number
  maxStores: number
  availableSlots: number

  // Performance metrics
  performance: {
    totalSales: number
    totalRevenue: number
    totalProfit: number
    avgProfitMargin: number
    daysSinceLastSale: number
    viewCount: number
    conversionRate: number
    sellThroughRate: number
  }

  // Health indicators
  health: {
    score: number // 0-100
    trend: 'improving' | 'stable' | 'declining' | 'critical'
    atRisk: boolean
    pruneRecommended: boolean
    replacementPriority: 'none' | 'low' | 'medium' | 'high' | 'critical'
  }

  // Lifecycle tracking
  lifecycle: {
    discoveredAt: string
    validatedAt?: string
    activatedAt?: string
    lastSaleAt?: string
    prunedAt?: string
    recycledAt?: string
    daysActive: number
    daysWithoutSale: number
  }

  // Allocation info
  allocation: {
    assignedStores: Array<{
      storeId: string
      storeName: string
      assignedAt: string
      salesCount: number
      status: 'active' | 'paused' | 'underperforming'
    }>
    waitlistCount: number
  }
}

export interface CirculationMetrics {
  // Inventory status
  inventory: {
    totalProducts: number
    byStatus: Record<ProductStatus, number>
    utilizationRate: number // % of max capacity
    avgSlotsUsed: number
    fullyAllocated: number
    partiallyAllocated: number
    unallocated: number
  }

  // Circulation flow
  flow: {
    discoveredLast24h: number
    activatedLast24h: number
    prunedLast24h: number
    replacedLast24h: number
    netGrowth: number
  }

  // Health overview
  health: {
    healthyProducts: number // Score >= 70
    atRiskProducts: number // Score 40-69
    criticalProducts: number // Score < 40
    avgHealthScore: number
    pruningCandidates: number
  }

  // Replacement pipeline
  replacement: {
    productsNeedingReplacement: number
    replacementCapacity: number // Products ready to replace
    estimatedDaysToFill: number | null
    replacementDeficit: number
  }

  // Scale metrics
  scale: {
    targetMonthlyProducts: number
    currentMonthlyCapacity: number
    utilizationVsTarget: number
    usersPerProduct: number
    effectiveProductCount: number // After accounting for shared allocation
  }
}

export interface PruningDecision {
  productId: string
  decision: 'prune' | 'warn' | 'monitor' | 'protect'
  confidence: number // 0-100
  reasons: string[]
  metrics: {
    healthScore: number
    daysSinceLastSale: number
    profitMargin: number
    viewCount: number
    conversionRate: number
    competitorPressure: number
  }
  recommendedAction?: string
  protectionReason?: string
}

export interface CirculationConfig {
  // Scale targets
  targetMonthlyProducts: number // Default: 150,000
  targetUniqueProducts: number // Default: 25,000 (150k/6)
  maxUsersPerProduct: number // Default: 6

  // Pruning thresholds
  maxDaysWithoutSale: number // Default: 21 days
  minHealthScoreToProtect: number // Default: 40
  minProfitMarginToProtect: number // Default: 10%
  minViewsToProtect: number // Default: 50 views

  // Anti-over-pruning
  maxDailyPruneRate: number // Default: 5% of active products
  minProductAge: number // Default: 7 days before eligible for pruning
  requireMultipleWarnings: boolean // Default: true

  // Replacement
  replacementBuffer: number // Default: 20% extra products ready
  prioritizeHighMargin: boolean // Default: true
}

const DEFAULT_CONFIG: CirculationConfig = {
  targetMonthlyProducts: 150000,
  targetUniqueProducts: 25000,
  maxUsersPerProduct: 6,

  maxDaysWithoutSale: 21,
  minHealthScoreToProtect: 40,
  minProfitMarginToProtect: 10,
  minViewsToProtect: 50,

  maxDailyPruneRate: 5,
  minProductAge: 7,
  requireMultipleWarnings: true,

  replacementBuffer: 20,
  prioritizeHighMargin: true,
}

// =============================================================================
// CIRCULATION STATE
// =============================================================================

export async function getProductCirculationState(
  productId: string
): Promise<ProductCirculationState | null> {
  const { data: sku } = await supabase
    .from('skus')
    .select(`
      *,
      store_sku_assignments(
        id,
        store_id,
        listing_status,
        created_at,
        stores(store_name)
      ),
      orders(
        id,
        total_amount,
        item_cost,
        order_date
      )
    `)
    .eq('id', productId)
    .single()

  if (!sku) return null

  const assignments = sku.store_sku_assignments || []
  const orders = sku.orders || []

  // Calculate performance metrics
  const activeAssignments = assignments.filter((a: any) =>
    ['active', 'paused'].includes(a.listing_status)
  )
  const totalSales = orders.length
  const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0)
  const totalCost = orders.reduce((sum: number, o: any) => sum + (o.item_cost || 0), 0)
  const totalProfit = totalRevenue - totalCost
  const avgProfitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  const lastSale = orders.sort((a: any, b: any) =>
    new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
  )[0]
  const daysSinceLastSale = lastSale
    ? Math.floor((Date.now() - new Date(lastSale.order_date).getTime()) / (1000 * 60 * 60 * 24))
    : 999

  // Calculate health score
  const healthScore = calculateHealthScore({
    daysSinceLastSale,
    totalSales,
    avgProfitMargin,
    activeAssignments: activeAssignments.length,
  })

  const trend = calculateTrend(orders)
  const atRisk = healthScore < 40 || daysSinceLastSale > 14
  const pruneRecommended = healthScore < 30 && daysSinceLastSale > 21

  // Calculate replacement priority
  let replacementPriority: ProductCirculationState['health']['replacementPriority']
  if (healthScore < 20) replacementPriority = 'critical'
  else if (healthScore < 40) replacementPriority = 'high'
  else if (healthScore < 60) replacementPriority = 'medium'
  else if (healthScore < 70) replacementPriority = 'low'
  else replacementPriority = 'none'

  const daysActive = sku.activated_at
    ? Math.floor((Date.now() - new Date(sku.activated_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0

  // Get waitlist count
  const { count: waitlistCount } = await supabase
    .from('sku_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('sku_id', productId)

  return {
    productId,
    skuCode: sku.sku_code,
    status: sku.status as ProductStatus,
    currentStores: activeAssignments.length,
    maxStores: sku.max_store_count || 6,
    availableSlots: Math.max(0, (sku.max_store_count || 6) - activeAssignments.length),
    performance: {
      totalSales,
      totalRevenue,
      totalProfit,
      avgProfitMargin,
      daysSinceLastSale,
      viewCount: sku.view_count || 0,
      conversionRate: sku.view_count > 0 ? (totalSales / sku.view_count) * 100 : 0,
      sellThroughRate: sku.inventory_count > 0 ? (totalSales / sku.inventory_count) * 100 : 0,
    },
    health: {
      score: healthScore,
      trend,
      atRisk,
      pruneRecommended,
      replacementPriority,
    },
    lifecycle: {
      discoveredAt: sku.created_at,
      validatedAt: sku.validated_at,
      activatedAt: sku.activated_at,
      lastSaleAt: lastSale?.order_date,
      prunedAt: sku.pruned_at,
      recycledAt: sku.recycled_at,
      daysActive,
      daysWithoutSale: daysSinceLastSale,
    },
    allocation: {
      assignedStores: activeAssignments.map((a: any) => ({
        storeId: a.store_id,
        storeName: a.stores?.store_name || 'Unknown',
        assignedAt: a.created_at,
        salesCount: 0, // Would need per-store order data
        status: a.listing_status,
      })),
      waitlistCount: waitlistCount || 0,
    },
  }
}

function calculateHealthScore(metrics: {
  daysSinceLastSale: number
  totalSales: number
  avgProfitMargin: number
  activeAssignments: number
}): number {
  let score = 50 // Base score

  // Recent sales boost
  if (metrics.daysSinceLastSale === 0) score += 25
  else if (metrics.daysSinceLastSale <= 3) score += 20
  else if (metrics.daysSinceLastSale <= 7) score += 10
  else if (metrics.daysSinceLastSale <= 14) score += 0
  else if (metrics.daysSinceLastSale <= 21) score -= 15
  else score -= 30

  // Total sales history
  if (metrics.totalSales >= 10) score += 15
  else if (metrics.totalSales >= 5) score += 10
  else if (metrics.totalSales >= 1) score += 5

  // Profit margin
  if (metrics.avgProfitMargin >= 25) score += 10
  else if (metrics.avgProfitMargin >= 15) score += 5
  else if (metrics.avgProfitMargin < 10) score -= 10

  // Active assignments indicate demand
  if (metrics.activeAssignments >= 4) score += 5
  else if (metrics.activeAssignments === 0) score -= 10

  return Math.max(0, Math.min(100, score))
}

function calculateTrend(orders: any[]): ProductCirculationState['health']['trend'] {
  if (orders.length < 3) return 'stable'

  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000

  const recentOrders = orders.filter(
    (o) => new Date(o.order_date).getTime() >= thirtyDaysAgo
  ).length
  const olderOrders = orders.filter(
    (o) =>
      new Date(o.order_date).getTime() >= sixtyDaysAgo &&
      new Date(o.order_date).getTime() < thirtyDaysAgo
  ).length

  if (olderOrders === 0 && recentOrders > 0) return 'improving'
  if (recentOrders === 0 && olderOrders > 0) return 'declining'
  if (recentOrders > olderOrders * 1.5) return 'improving'
  if (recentOrders < olderOrders * 0.5) return 'declining'
  if (recentOrders === 0 && olderOrders === 0) return 'critical'

  return 'stable'
}

// =============================================================================
// CIRCULATION METRICS
// =============================================================================

export async function getCirculationMetrics(
  config: Partial<CirculationConfig> = {}
): Promise<CirculationMetrics> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // Get all products with status counts
  const { data: skus } = await supabase
    .from('skus')
    .select('id, status, max_store_count, current_store_count, created_at, health_score')

  const products = skus || []

  // Calculate status distribution
  const byStatus: Record<ProductStatus, number> = {
    discovery: 0,
    validating: 0,
    ready: 0,
    active: 0,
    underperforming: 0,
    pruned: 0,
    recycled: 0,
  }

  let totalSlots = 0
  let usedSlots = 0
  let healthyCount = 0
  let atRiskCount = 0
  let criticalCount = 0
  let totalHealth = 0
  let pruningCandidates = 0
  let fullyAllocated = 0
  let partiallyAllocated = 0
  let unallocated = 0

  for (const sku of products) {
    const status = (sku.status || 'discovery') as ProductStatus
    byStatus[status] = (byStatus[status] || 0) + 1

    const maxStores = sku.max_store_count || cfg.maxUsersPerProduct
    const currentStores = sku.current_store_count || 0
    totalSlots += maxStores
    usedSlots += currentStores

    if (currentStores === 0) unallocated++
    else if (currentStores >= maxStores) fullyAllocated++
    else partiallyAllocated++

    const health = sku.health_score || 50
    totalHealth += health

    if (health >= 70) healthyCount++
    else if (health >= 40) atRiskCount++
    else {
      criticalCount++
      pruningCandidates++
    }
  }

  // Calculate flow metrics
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { count: discovered } = await supabase
    .from('skus')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', oneDayAgo)

  const { count: activated } = await supabase
    .from('skus')
    .select('id', { count: 'exact', head: true })
    .gte('activated_at', oneDayAgo)

  const { count: pruned } = await supabase
    .from('skus')
    .select('id', { count: 'exact', head: true })
    .gte('pruned_at', oneDayAgo)

  // Calculate replacement metrics
  const readyProducts = byStatus.ready || 0
  const productsNeedingReplacement = pruningCandidates
  const replacementCapacity = readyProducts
  const replacementDeficit = Math.max(0, productsNeedingReplacement - replacementCapacity)

  let estimatedDaysToFill: number | null = null
  if (replacementDeficit > 0 && (discovered || 0) > 0) {
    estimatedDaysToFill = Math.ceil(replacementDeficit / (discovered || 1))
  }

  // Calculate scale metrics
  const activeProducts = byStatus.active || 0
  const effectiveProductCount = activeProducts * cfg.maxUsersPerProduct

  return {
    inventory: {
      totalProducts: products.length,
      byStatus,
      utilizationRate: totalSlots > 0 ? (usedSlots / totalSlots) * 100 : 0,
      avgSlotsUsed: products.length > 0 ? usedSlots / products.length : 0,
      fullyAllocated,
      partiallyAllocated,
      unallocated,
    },
    flow: {
      discoveredLast24h: discovered || 0,
      activatedLast24h: activated || 0,
      prunedLast24h: pruned || 0,
      replacedLast24h: Math.min(activated || 0, pruned || 0),
      netGrowth: (discovered || 0) - (pruned || 0),
    },
    health: {
      healthyProducts: healthyCount,
      atRiskProducts: atRiskCount,
      criticalProducts: criticalCount,
      avgHealthScore: products.length > 0 ? Math.round(totalHealth / products.length) : 0,
      pruningCandidates,
    },
    replacement: {
      productsNeedingReplacement,
      replacementCapacity,
      estimatedDaysToFill,
      replacementDeficit,
    },
    scale: {
      targetMonthlyProducts: cfg.targetMonthlyProducts,
      currentMonthlyCapacity: effectiveProductCount * 30, // Approximate
      utilizationVsTarget:
        (effectiveProductCount * 30 / cfg.targetMonthlyProducts) * 100,
      usersPerProduct: cfg.maxUsersPerProduct,
      effectiveProductCount,
    },
  }
}

// =============================================================================
// INTELLIGENT PRUNING
// =============================================================================

export async function evaluatePruning(
  productIds: string[],
  config: Partial<CirculationConfig> = {}
): Promise<PruningDecision[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const decisions: PruningDecision[] = []

  // Get daily prune limit
  const { count: activeCount } = await supabase
    .from('skus')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  const maxDailyPrunes = Math.floor(((activeCount || 0) * cfg.maxDailyPruneRate) / 100)

  // Get today's prunes
  const today = new Date().toISOString().split('T')[0]
  const { count: prunedToday } = await supabase
    .from('skus')
    .select('id', { count: 'exact', head: true })
    .gte('pruned_at', today)

  const remainingPruneCapacity = Math.max(0, maxDailyPrunes - (prunedToday || 0))

  for (const productId of productIds) {
    const state = await getProductCirculationState(productId)

    if (!state) {
      decisions.push({
        productId,
        decision: 'protect',
        confidence: 100,
        reasons: ['Product not found'],
        metrics: {
          healthScore: 0,
          daysSinceLastSale: 0,
          profitMargin: 0,
          viewCount: 0,
          conversionRate: 0,
          competitorPressure: 0,
        },
        protectionReason: 'Product not found',
      })
      continue
    }

    const decision = makePruningDecision(state, cfg, remainingPruneCapacity)
    decisions.push(decision)
  }

  return decisions
}

function makePruningDecision(
  state: ProductCirculationState,
  config: CirculationConfig,
  remainingCapacity: number
): PruningDecision {
  const reasons: string[] = []
  let confidence = 0

  // Check protection conditions
  const protectionReasons: string[] = []

  // Age protection
  if (state.lifecycle.daysActive < config.minProductAge) {
    protectionReasons.push(`Product too new (${state.lifecycle.daysActive} days, min ${config.minProductAge})`)
  }

  // Health score protection
  if (state.health.score >= config.minHealthScoreToProtect) {
    protectionReasons.push(`Health score ${state.health.score} above protection threshold ${config.minHealthScoreToProtect}`)
  }

  // Profit margin protection
  if (state.performance.avgProfitMargin >= config.minProfitMarginToProtect) {
    protectionReasons.push(`Profit margin ${state.performance.avgProfitMargin.toFixed(1)}% above protection threshold`)
  }

  // Recent activity protection
  if (state.lifecycle.daysSinceLastSale <= 7) {
    protectionReasons.push('Recent sale within 7 days')
  }

  // High demand protection (waitlist)
  if (state.allocation.waitlistCount > 0) {
    protectionReasons.push(`Product has ${state.allocation.waitlistCount} users on waitlist`)
  }

  // Capacity protection
  if (remainingCapacity <= 0) {
    protectionReasons.push('Daily prune limit reached')
  }

  // If protected, return early
  if (protectionReasons.length > 0) {
    return {
      productId: state.productId,
      decision: 'protect',
      confidence: 90,
      reasons: protectionReasons,
      metrics: extractMetrics(state),
      protectionReason: protectionReasons[0],
    }
  }

  // Evaluate pruning factors
  if (state.lifecycle.daysSinceLastSale > config.maxDaysWithoutSale) {
    reasons.push(`No sales in ${state.lifecycle.daysSinceLastSale} days (max ${config.maxDaysWithoutSale})`)
    confidence += 30
  }

  if (state.health.score < 30) {
    reasons.push(`Critical health score: ${state.health.score}`)
    confidence += 25
  }

  if (state.health.trend === 'critical') {
    reasons.push('Performance trend is critical')
    confidence += 20
  }

  if (state.performance.conversionRate < 0.5 && state.performance.viewCount > 100) {
    reasons.push(`Very low conversion rate: ${state.performance.conversionRate.toFixed(2)}%`)
    confidence += 15
  }

  if (state.performance.avgProfitMargin < 5) {
    reasons.push(`Very low profit margin: ${state.performance.avgProfitMargin.toFixed(1)}%`)
    confidence += 10
  }

  // Make decision
  if (confidence >= 60) {
    return {
      productId: state.productId,
      decision: 'prune',
      confidence: Math.min(100, confidence),
      reasons,
      metrics: extractMetrics(state),
      recommendedAction: 'Remove from active listings and replace with higher-performing product',
    }
  } else if (confidence >= 40) {
    return {
      productId: state.productId,
      decision: 'warn',
      confidence,
      reasons,
      metrics: extractMetrics(state),
      recommendedAction: 'Monitor closely, consider price or title optimization',
    }
  } else {
    return {
      productId: state.productId,
      decision: 'monitor',
      confidence,
      reasons: reasons.length > 0 ? reasons : ['No significant issues detected'],
      metrics: extractMetrics(state),
    }
  }
}

function extractMetrics(state: ProductCirculationState): PruningDecision['metrics'] {
  return {
    healthScore: state.health.score,
    daysSinceLastSale: state.lifecycle.daysSinceLastSale,
    profitMargin: state.performance.avgProfitMargin,
    viewCount: state.performance.viewCount,
    conversionRate: state.performance.conversionRate,
    competitorPressure: 0, // Would need competitor data
  }
}

// =============================================================================
// PRODUCT REPLACEMENT
// =============================================================================

export interface ReplacementCandidate {
  productId: string
  skuCode: string
  validationScore: number
  profitPotential: number
  cassiniScore: number
  priority: number
  readySince: string
}

export async function getReplacementCandidates(
  count: number = 50,
  config: Partial<CirculationConfig> = {}
): Promise<ReplacementCandidate[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  const { data } = await supabase
    .from('skus')
    .select(`
      id,
      sku_code,
      validation_score,
      estimated_profit_margin,
      cassini_score,
      created_at
    `)
    .eq('status', 'ready')
    .order(cfg.prioritizeHighMargin ? 'estimated_profit_margin' : 'validation_score', {
      ascending: false,
    })
    .limit(count)

  return (data || []).map((sku) => ({
    productId: sku.id,
    skuCode: sku.sku_code,
    validationScore: sku.validation_score || 0,
    profitPotential: sku.estimated_profit_margin || 0,
    cassiniScore: sku.cassini_score || 0,
    priority: calculateReplacementPriority(sku),
    readySince: sku.created_at,
  }))
}

function calculateReplacementPriority(sku: any): number {
  let priority = 50

  // High validation score
  if (sku.validation_score >= 80) priority += 20
  else if (sku.validation_score >= 60) priority += 10

  // High profit potential
  if (sku.estimated_profit_margin >= 30) priority += 20
  else if (sku.estimated_profit_margin >= 20) priority += 10

  // Good Cassini score
  if (sku.cassini_score >= 80) priority += 10

  return Math.min(100, priority)
}

export async function executeReplacement(
  pruneProductId: string,
  replaceWithProductId: string,
  storeIds: string[]
): Promise<{
  success: boolean
  prunedAssignments: number
  createdAssignments: number
  errors: string[]
}> {
  const errors: string[] = []
  let prunedAssignments = 0
  let createdAssignments = 0

  try {
    // Mark old product as pruned in specified stores
    const { data: oldAssignments } = await supabase
      .from('store_sku_assignments')
      .update({
        listing_status: 'pruned',
        ended_at: new Date().toISOString(),
      })
      .eq('sku_id', pruneProductId)
      .in('store_id', storeIds)
      .in('listing_status', ['active', 'paused'])
      .select('id')

    prunedAssignments = oldAssignments?.length || 0

    // Create new assignments for replacement product
    for (const storeId of storeIds) {
      const { error } = await supabase.from('store_sku_assignments').insert({
        sku_id: replaceWithProductId,
        store_id: storeId,
        listing_status: 'draft',
        replaced_sku_id: pruneProductId,
        created_at: new Date().toISOString(),
      })

      if (error) {
        errors.push(`Failed to assign to store ${storeId}: ${error.message}`)
      } else {
        createdAssignments++
      }
    }

    // Update product statuses
    if (prunedAssignments > 0) {
      await supabase
        .from('skus')
        .update({
          status: 'pruned',
          pruned_at: new Date().toISOString(),
        })
        .eq('id', pruneProductId)
    }

    if (createdAssignments > 0) {
      await supabase
        .from('skus')
        .update({
          status: 'active',
          activated_at: new Date().toISOString(),
        })
        .eq('id', replaceWithProductId)
    }

    return {
      success: errors.length === 0,
      prunedAssignments,
      createdAssignments,
      errors,
    }
  } catch (error) {
    return {
      success: false,
      prunedAssignments,
      createdAssignments,
      errors: [error instanceof Error ? error.message : 'Replacement failed'],
    }
  }
}

// =============================================================================
// CIRCULATION AUTOMATION
// =============================================================================

export interface CirculationJob {
  id: string
  type: 'prune_evaluation' | 'replacement_batch' | 'health_update' | 'slot_rebalance'
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  results?: {
    processed: number
    succeeded: number
    failed: number
    details: Record<string, unknown>
  }
}

export async function runCirculationCycle(
  config: Partial<CirculationConfig> = {}
): Promise<{
  evaluated: number
  pruned: number
  replaced: number
  errors: string[]
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const errors: string[] = []
  let pruned = 0
  let replaced = 0

  // Get products to evaluate (active products with low health or no recent sales)
  const { data: candidates } = await supabase
    .from('skus')
    .select('id')
    .eq('status', 'active')
    .or(`health_score.lt.50,last_sale_at.lt.${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()}`)
    .limit(100)

  const productIds = (candidates || []).map((c) => c.id)

  if (productIds.length === 0) {
    return { evaluated: 0, pruned: 0, replaced: 0, errors: [] }
  }

  // Evaluate pruning decisions
  const decisions = await evaluatePruning(productIds, cfg)

  // Get replacement candidates
  const replacements = await getReplacementCandidates(50, cfg)

  // Execute pruning and replacement
  const toPrune = decisions.filter((d) => d.decision === 'prune')

  for (let i = 0; i < toPrune.length && i < replacements.length; i++) {
    const pruneDecision = toPrune[i]
    const replacement = replacements[i]

    // Get stores affected
    const state = await getProductCirculationState(pruneDecision.productId)
    if (!state) continue

    const storeIds = state.allocation.assignedStores.map((s) => s.storeId)

    const result = await executeReplacement(
      pruneDecision.productId,
      replacement.productId,
      storeIds
    )

    if (result.success) {
      pruned++
      replaced++
    } else {
      errors.push(...result.errors)
    }
  }

  return {
    evaluated: productIds.length,
    pruned,
    replaced,
    errors,
  }
}
