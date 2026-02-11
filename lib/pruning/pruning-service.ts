/**
 * Automated Pruning Service
 *
 * Runs pruning rules against listings and takes appropriate actions:
 * - Identifies underperforming listings
 * - Executes prune/pause/reprice actions
 * - Logs all decisions for analytics
 * - Supports manual and automated pruning
 */

import { supabase } from '@/lib/supabase'
import {
  PruningRule,
  RuleEvaluation,
  ListingData,
  RuleAction,
  getActiveRules,
  evaluateAllRules,
  enrichListingData,
} from './rules-engine'

export interface PruningCandidate {
  listing: ListingData
  evaluation: RuleEvaluation
  recommendedAction: RuleAction
}

export interface PruningResult {
  assignmentId: string
  skuId: string
  storeId: string
  action: RuleAction
  ruleId: string
  ruleName: string
  success: boolean
  error?: string
  previousStatus?: string
  newStatus?: string
  metadata?: Record<string, any>
}

export interface PruningBatchResult {
  totalEvaluated: number
  totalMatched: number
  actionsTaken: {
    prune: number
    pause: number
    reprice: number
    review: number
    alert: number
  }
  results: PruningResult[]
  errors: string[]
  duration: number
}

export interface PruningOptions {
  storeId?: string
  dryRun?: boolean
  maxListings?: number
  minDaysListed?: number
  excludeStatuses?: string[]
}

/**
 * Get all listings eligible for pruning evaluation
 */
export async function getEligibleListings(options: PruningOptions = {}): Promise<ListingData[]> {
  const {
    storeId,
    maxListings = 1000,
    minDaysListed = 0,
    excludeStatuses = ['ended', 'pruned', 'draft'],
  } = options

  // Calculate cutoff date for minimum listing age
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - minDaysListed)

  let query = supabase
    .from('store_sku_assignments')
    .select(`
      id,
      store_id,
      sku_id,
      listing_status,
      listed_at,
      views,
      watchers,
      sales,
      revenue,
      profit,
      actual_price,
      last_sale_at,
      skus (
        quality_score,
        cost_price,
        sell_price
      )
    `)
    .not('listing_status', 'in', `(${excludeStatuses.join(',')})`)
    .not('listed_at', 'is', null)
    .lte('listed_at', cutoffDate.toISOString())
    .limit(maxListings)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error || !data) {
    console.error('Error fetching eligible listings:', error)
    return []
  }

  const now = new Date()

  return (data as any[]).map((row) => {
    const listedAt = row.listed_at ? new Date(row.listed_at) : null
    const daysListed = listedAt
      ? Math.floor((now.getTime() - listedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0

    const lastSaleAt = row.last_sale_at ? new Date(row.last_sale_at) : null
    const daysSinceLastSale = lastSaleAt
      ? Math.floor((now.getTime() - lastSaleAt.getTime()) / (1000 * 60 * 60 * 24))
      : daysListed // If never sold, use days listed

    return enrichListingData({
      assignmentId: row.id,
      skuId: row.sku_id,
      storeId: row.store_id,
      status: row.listing_status,
      daysListed,
      views: row.views || 0,
      watchers: row.watchers || 0,
      sales: row.sales || 0,
      revenue: row.revenue || 0,
      profit: row.profit || 0,
      sellPrice: row.actual_price || row.skus?.sell_price || 0,
      costPrice: row.skus?.cost_price || 0,
      qualityScore: row.skus?.quality_score,
      lastSaleAt: row.last_sale_at,
      daysSinceLastSale,
    })
  })
}

/**
 * Find listings that match pruning rules
 */
export async function findPruningCandidates(
  options: PruningOptions = {}
): Promise<PruningCandidate[]> {
  const rules = await getActiveRules()
  const listings = await getEligibleListings(options)

  const candidates: PruningCandidate[] = []

  for (const listing of listings) {
    const evaluation = evaluateAllRules(rules, listing)

    if (evaluation && evaluation.matches && evaluation.action) {
      candidates.push({
        listing,
        evaluation,
        recommendedAction: evaluation.action,
      })
    }
  }

  return candidates
}

/**
 * Execute a single pruning action
 */
async function executePruningAction(
  candidate: PruningCandidate,
  dryRun: boolean = false
): Promise<PruningResult> {
  const { listing, evaluation } = candidate
  const action = evaluation.action!

  const result: PruningResult = {
    assignmentId: listing.assignmentId,
    skuId: listing.skuId,
    storeId: listing.storeId,
    action,
    ruleId: evaluation.ruleId,
    ruleName: evaluation.ruleName,
    success: false,
    previousStatus: listing.status,
  }

  if (dryRun) {
    result.success = true
    result.metadata = { dryRun: true }
    return result
  }

  try {
    switch (action) {
      case 'prune':
        result.newStatus = 'pruned'
        await supabase
          .from('store_sku_assignments')
          .update({
            listing_status: 'pruned',
            pruned_at: new Date().toISOString(),
            prune_reason: evaluation.ruleName,
          })
          .eq('id', listing.assignmentId)
        result.success = true
        break

      case 'pause':
        result.newStatus = 'paused'
        await supabase
          .from('store_sku_assignments')
          .update({
            listing_status: 'paused',
            pause_reason: evaluation.ruleName,
          })
          .eq('id', listing.assignmentId)
        result.success = true
        break

      case 'reprice':
        // Calculate new price based on action config
        const repriceBy = evaluation.actionConfig?.repriceBy || 0
        const newPrice = listing.sellPrice * (1 + repriceBy / 100)

        // Update the suggested price on the SKU
        await supabase
          .from('skus')
          .update({
            sell_price: newPrice,
            price_last_adjusted: new Date().toISOString(),
          })
          .eq('id', listing.skuId)

        result.success = true
        result.metadata = {
          oldPrice: listing.sellPrice,
          newPrice,
          repriceBy,
        }
        break

      case 'review':
        // Create a review task
        await supabase.from('pruning_reviews').insert({
          assignment_id: listing.assignmentId,
          sku_id: listing.skuId,
          store_id: listing.storeId,
          rule_id: evaluation.ruleId,
          rule_name: evaluation.ruleName,
          reason: evaluation.actionConfig?.reviewReason || 'Flagged for review',
          listing_data: listing,
          status: 'pending',
        })
        result.success = true
        result.metadata = { reviewReason: evaluation.actionConfig?.reviewReason }
        break

      case 'alert':
        // Log alert (would integrate with notification system)
        console.log(
          `[Pruning Alert] ${listing.skuId}: ${evaluation.ruleName}`,
          evaluation.actionConfig
        )
        result.success = true
        result.metadata = { alertChannel: evaluation.actionConfig?.alertChannel }
        break
    }

    // Log the pruning action
    await logPruningAction(result, listing, evaluation)
  } catch (error) {
    result.success = false
    result.error = error instanceof Error ? error.message : 'Unknown error'
  }

  return result
}

/**
 * Log a pruning action for analytics
 */
async function logPruningAction(
  result: PruningResult,
  listing: ListingData,
  evaluation: RuleEvaluation
): Promise<void> {
  try {
    await supabase.from('pruning_log').insert({
      assignment_id: listing.assignmentId,
      sku_id: listing.skuId,
      store_id: listing.storeId,
      rule_id: evaluation.ruleId,
      rule_name: evaluation.ruleName,
      action: result.action,
      previous_status: result.previousStatus,
      new_status: result.newStatus,
      success: result.success,
      error: result.error,
      listing_data: listing,
      evaluation_details: evaluation.conditionResults,
      metadata: result.metadata,
    })
  } catch (error) {
    console.error('Error logging pruning action:', error)
  }
}

/**
 * Run automated pruning batch
 */
export async function runPruningBatch(
  options: PruningOptions = {}
): Promise<PruningBatchResult> {
  const startTime = Date.now()
  const results: PruningResult[] = []
  const errors: string[] = []

  const actionsTaken = {
    prune: 0,
    pause: 0,
    reprice: 0,
    review: 0,
    alert: 0,
  }

  try {
    // Find candidates
    const candidates = await findPruningCandidates(options)

    // Execute actions
    for (const candidate of candidates) {
      try {
        const result = await executePruningAction(candidate, options.dryRun)
        results.push(result)

        if (result.success) {
          actionsTaken[result.action]++
        }
      } catch (error) {
        errors.push(
          `Error processing ${candidate.listing.assignmentId}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        )
      }
    }

    // Get total evaluated count
    const listings = await getEligibleListings(options)

    return {
      totalEvaluated: listings.length,
      totalMatched: candidates.length,
      actionsTaken,
      results,
      errors,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    errors.push(
      `Batch error: ${error instanceof Error ? error.message : 'Unknown error'}`
    )

    return {
      totalEvaluated: 0,
      totalMatched: 0,
      actionsTaken,
      results,
      errors,
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Get pruning statistics
 */
export async function getPruningStats(options: {
  storeId?: string
  daysBack?: number
} = {}): Promise<{
  totalPruned: number
  totalPaused: number
  totalReviewed: number
  byRule: Record<string, number>
  byStore: Record<string, number>
  recentActions: Array<{
    assignmentId: string
    action: string
    ruleName: string
    createdAt: string
  }>
}> {
  const { storeId, daysBack = 30 } = options

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  let query = supabase
    .from('pruning_log')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .eq('success', true)
    .order('created_at', { ascending: false })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data } = await query

  const stats = {
    totalPruned: 0,
    totalPaused: 0,
    totalReviewed: 0,
    byRule: {} as Record<string, number>,
    byStore: {} as Record<string, number>,
    recentActions: [] as Array<{
      assignmentId: string
      action: string
      ruleName: string
      createdAt: string
    }>,
  }

  if (!data) return stats

  for (const row of data as any[]) {
    // Count by action type
    switch (row.action) {
      case 'prune':
        stats.totalPruned++
        break
      case 'pause':
        stats.totalPaused++
        break
      case 'review':
        stats.totalReviewed++
        break
    }

    // Count by rule
    const ruleName = row.rule_name || 'Unknown'
    stats.byRule[ruleName] = (stats.byRule[ruleName] || 0) + 1

    // Count by store
    stats.byStore[row.store_id] = (stats.byStore[row.store_id] || 0) + 1
  }

  // Get recent actions
  stats.recentActions = (data as any[]).slice(0, 20).map((row) => ({
    assignmentId: row.assignment_id,
    action: row.action,
    ruleName: row.rule_name,
    createdAt: row.created_at,
  }))

  return stats
}

/**
 * Get pending reviews
 */
export async function getPendingReviews(options: {
  storeId?: string
  limit?: number
} = {}): Promise<Array<{
  id: string
  assignmentId: string
  skuId: string
  storeId: string
  ruleName: string
  reason: string
  listingData: ListingData
  createdAt: string
}>> {
  const { storeId, limit = 50 } = options

  let query = supabase
    .from('pruning_reviews')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data } = await query

  if (!data) return []

  return (data as any[]).map((row) => ({
    id: row.id,
    assignmentId: row.assignment_id,
    skuId: row.sku_id,
    storeId: row.store_id,
    ruleName: row.rule_name,
    reason: row.reason,
    listingData: row.listing_data,
    createdAt: row.created_at,
  }))
}

/**
 * Resolve a pending review
 */
export async function resolveReview(
  reviewId: string,
  resolution: 'approved' | 'rejected',
  action?: RuleAction,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: review, error: fetchError } = await supabase
    .from('pruning_reviews')
    .select('*')
    .eq('id', reviewId)
    .single()

  if (fetchError || !review) {
    return { success: false, error: 'Review not found' }
  }

  // Update review status
  const { error: updateError } = await supabase
    .from('pruning_reviews')
    .update({
      status: resolution,
      resolved_at: new Date().toISOString(),
      resolution_action: action,
      resolution_notes: notes,
    })
    .eq('id', reviewId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // If approved with an action, execute it
  if (resolution === 'approved' && action) {
    const listing = enrichListingData({
      assignmentId: (review as any).assignment_id,
      skuId: (review as any).sku_id,
      storeId: (review as any).store_id,
      ...((review as any).listing_data || {}),
    })

    await executePruningAction(
      {
        listing,
        evaluation: {
          ruleId: 'manual_review',
          ruleName: 'Manual Review',
          matches: true,
          action,
          conditionResults: [],
        },
        recommendedAction: action,
      },
      false
    )
  }

  return { success: true }
}

/**
 * Manually prune a specific listing
 */
export async function manualPrune(
  assignmentId: string,
  reason: string
): Promise<PruningResult> {
  // Get listing data
  const { data } = await supabase
    .from('store_sku_assignments')
    .select(`
      *,
      skus (quality_score, cost_price, sell_price)
    `)
    .eq('id', assignmentId)
    .single()

  if (!data) {
    return {
      assignmentId,
      skuId: '',
      storeId: '',
      action: 'prune',
      ruleId: 'manual',
      ruleName: 'Manual Prune',
      success: false,
      error: 'Listing not found',
    }
  }

  const row = data as any
  const listing = enrichListingData({
    assignmentId: row.id,
    skuId: row.sku_id,
    storeId: row.store_id,
    status: row.listing_status,
    daysListed: 0,
    views: row.views || 0,
    watchers: row.watchers || 0,
    sales: row.sales || 0,
    revenue: row.revenue || 0,
    profit: row.profit || 0,
    sellPrice: row.actual_price || row.skus?.sell_price || 0,
    costPrice: row.skus?.cost_price || 0,
    qualityScore: row.skus?.quality_score,
  })

  return executePruningAction(
    {
      listing,
      evaluation: {
        ruleId: 'manual',
        ruleName: `Manual: ${reason}`,
        matches: true,
        action: 'prune',
        conditionResults: [],
      },
      recommendedAction: 'prune',
    },
    false
  )
}
