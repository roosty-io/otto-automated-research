/**
 * Price Optimization Service
 *
 * Executes repricing recommendations and manages price updates:
 * - Batch repricing operations
 * - Price change logging and history
 * - A/B testing support
 * - Rollback capabilities
 */

import { supabase } from '@/lib/supabase'
import {
  RepricingRule,
  RepricingRecommendation,
  ListingPriceData,
  getActiveRepricingRules,
  evaluateAllRepricingRules,
  enrichListingPriceData,
} from './rules-engine'

export interface RepricingCandidate {
  listing: ListingPriceData
  recommendation: RepricingRecommendation
}

export interface RepricingResult {
  assignmentId: string
  skuId: string
  previousPrice: number
  newPrice: number
  priceChange: number
  ruleId: string
  ruleName: string
  success: boolean
  error?: string
}

export interface RepricingBatchResult {
  totalEvaluated: number
  totalCandidates: number
  totalRepriced: number
  totalSkipped: number
  totalFailed: number
  results: RepricingResult[]
  errors: string[]
  duration: number
  avgPriceChange: number
  avgMarginChange: number
}

export interface RepricingOptions {
  storeId?: string
  dryRun?: boolean
  maxListings?: number
  minDaysSinceLastChange?: number
  skipCooldown?: boolean
}

/**
 * Get all listings eligible for repricing
 */
export async function getEligibleListings(options: RepricingOptions = {}): Promise<ListingPriceData[]> {
  const {
    storeId,
    maxListings = 1000,
    minDaysSinceLastChange = 0,
  } = options

  let query = supabase
    .from('store_sku_assignments')
    .select(`
      id,
      store_id,
      sku_id,
      actual_price,
      listing_status,
      listed_at,
      views,
      watchers,
      sales,
      last_sale_at,
      price_last_adjusted,
      skus (
        cost_price,
        sell_price,
        msrp,
        competitor_lowest_price,
        competitor_avg_price,
        competitor_count
      )
    `)
    .eq('listing_status', 'active')
    .not('listed_at', 'is', null)
    .limit(maxListings)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  // Filter by last price change if specified
  if (minDaysSinceLastChange > 0) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - minDaysSinceLastChange)
    query = query.or(`price_last_adjusted.is.null,price_last_adjusted.lt.${cutoffDate.toISOString()}`)
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

    return enrichListingPriceData({
      assignmentId: row.id,
      skuId: row.sku_id,
      storeId: row.store_id,
      currentPrice: row.actual_price || row.skus?.sell_price || 0,
      costPrice: row.skus?.cost_price || 0,
      msrp: row.skus?.msrp,
      competitorLowest: row.skus?.competitor_lowest_price,
      competitorAvg: row.skus?.competitor_avg_price,
      competitorCount: row.skus?.competitor_count || 0,
      daysListed,
      views: row.views || 0,
      watchers: row.watchers || 0,
      sales: row.sales || 0,
      lastSaleAt: row.last_sale_at,
      lastPriceChange: row.price_last_adjusted,
    })
  })
}

/**
 * Find listings that need repricing based on rules
 */
export async function findRepricingCandidates(
  options: RepricingOptions = {}
): Promise<RepricingCandidate[]> {
  const rules = await getActiveRepricingRules()
  const listings = await getEligibleListings(options)

  const candidates: RepricingCandidate[] = []

  for (const listing of listings) {
    // Check cooldown if not skipped
    if (!options.skipCooldown && listing.lastPriceChange) {
      const lastChange = new Date(listing.lastPriceChange)
      const hoursSinceChange = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60)

      // Find the applicable rule's cooldown
      const recommendation = evaluateAllRepricingRules(rules, listing)
      if (recommendation) {
        const rule = rules.find((r) => r.id === recommendation.ruleId)
        if (rule?.constraints.cooldownHours && hoursSinceChange < rule.constraints.cooldownHours) {
          recommendation.constraints.appliedCooldown = true
          continue // Skip this listing due to cooldown
        }
      }
    }

    const recommendation = evaluateAllRepricingRules(rules, listing)
    if (recommendation) {
      candidates.push({ listing, recommendation })
    }
  }

  return candidates
}

/**
 * Execute a single price change
 */
async function executeReprice(
  candidate: RepricingCandidate,
  dryRun: boolean = false
): Promise<RepricingResult> {
  const { listing, recommendation } = candidate

  const result: RepricingResult = {
    assignmentId: listing.assignmentId,
    skuId: listing.skuId,
    previousPrice: listing.currentPrice,
    newPrice: recommendation.recommendedPrice,
    priceChange: recommendation.priceChange,
    ruleId: recommendation.ruleId,
    ruleName: recommendation.ruleName,
    success: false,
  }

  if (dryRun) {
    result.success = true
    return result
  }

  try {
    // Update the assignment price
    const { error: assignmentError } = await supabase
      .from('store_sku_assignments')
      .update({
        actual_price: recommendation.recommendedPrice,
        price_last_adjusted: new Date().toISOString(),
      })
      .eq('id', listing.assignmentId)

    if (assignmentError) {
      throw new Error(assignmentError.message)
    }

    // Update the SKU sell price
    const { error: skuError } = await supabase
      .from('skus')
      .update({
        sell_price: recommendation.recommendedPrice,
        price_last_adjusted: new Date().toISOString(),
      })
      .eq('id', listing.skuId)

    if (skuError) {
      console.warn('Warning: Could not update SKU sell price:', skuError.message)
    }

    // Log the price change
    await logPriceChange(listing, recommendation)

    result.success = true
  } catch (error) {
    result.success = false
    result.error = error instanceof Error ? error.message : 'Unknown error'
  }

  return result
}

/**
 * Log a price change for analytics and history
 */
async function logPriceChange(
  listing: ListingPriceData,
  recommendation: RepricingRecommendation
): Promise<void> {
  try {
    await supabase.from('price_change_log').insert({
      assignment_id: listing.assignmentId,
      sku_id: listing.skuId,
      store_id: listing.storeId,
      previous_price: listing.currentPrice,
      new_price: recommendation.recommendedPrice,
      price_change: recommendation.priceChange,
      price_change_percent: recommendation.priceChangePercent,
      rule_id: recommendation.ruleId,
      rule_name: recommendation.ruleName,
      strategy: recommendation.strategy,
      reason: recommendation.reason,
      previous_margin: listing.currentMargin,
      new_margin: recommendation.newMargin,
      competitor_lowest: listing.competitorLowest,
      competitor_avg: listing.competitorAvg,
      listing_data: listing,
    })
  } catch (error) {
    console.error('Error logging price change:', error)
  }
}

/**
 * Run automated repricing batch
 */
export async function runRepricingBatch(
  options: RepricingOptions = {}
): Promise<RepricingBatchResult> {
  const startTime = Date.now()
  const results: RepricingResult[] = []
  const errors: string[] = []

  let totalRepriced = 0
  let totalSkipped = 0
  let totalFailed = 0
  let totalPriceChange = 0
  let totalMarginChange = 0

  try {
    // Find candidates
    const candidates = await findRepricingCandidates(options)

    // Get total evaluated
    const listings = await getEligibleListings(options)

    // Execute repricing for each candidate
    for (const candidate of candidates) {
      try {
        const result = await executeReprice(candidate, options.dryRun)
        results.push(result)

        if (result.success) {
          totalRepriced++
          totalPriceChange += result.priceChange
          totalMarginChange += candidate.recommendation.newMargin - candidate.listing.currentMargin
        } else {
          totalFailed++
        }
      } catch (error) {
        totalFailed++
        errors.push(
          `Error repricing ${candidate.listing.assignmentId}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        )
      }
    }

    totalSkipped = listings.length - candidates.length

    return {
      totalEvaluated: listings.length,
      totalCandidates: candidates.length,
      totalRepriced,
      totalSkipped,
      totalFailed,
      results,
      errors,
      duration: Date.now() - startTime,
      avgPriceChange: totalRepriced > 0 ? totalPriceChange / totalRepriced : 0,
      avgMarginChange: totalRepriced > 0 ? totalMarginChange / totalRepriced : 0,
    }
  } catch (error) {
    errors.push(
      `Batch error: ${error instanceof Error ? error.message : 'Unknown error'}`
    )

    return {
      totalEvaluated: 0,
      totalCandidates: 0,
      totalRepriced,
      totalSkipped,
      totalFailed,
      results,
      errors,
      duration: Date.now() - startTime,
      avgPriceChange: 0,
      avgMarginChange: 0,
    }
  }
}

/**
 * Get repricing statistics
 */
export async function getRepricingStats(options: {
  storeId?: string
  daysBack?: number
} = {}): Promise<{
  totalChanges: number
  avgPriceChange: number
  avgMarginChange: number
  increaseCount: number
  decreaseCount: number
  byRule: Record<string, number>
  byStrategy: Record<string, number>
  recentChanges: Array<{
    assignmentId: string
    skuId: string
    previousPrice: number
    newPrice: number
    ruleName: string
    createdAt: string
  }>
}> {
  const { storeId, daysBack = 30 } = options

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  let query = supabase
    .from('price_change_log')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data } = await query

  const stats = {
    totalChanges: 0,
    avgPriceChange: 0,
    avgMarginChange: 0,
    increaseCount: 0,
    decreaseCount: 0,
    byRule: {} as Record<string, number>,
    byStrategy: {} as Record<string, number>,
    recentChanges: [] as Array<{
      assignmentId: string
      skuId: string
      previousPrice: number
      newPrice: number
      ruleName: string
      createdAt: string
    }>,
  }

  if (!data) return stats

  let totalPriceChange = 0
  let totalMarginChange = 0

  for (const row of data as any[]) {
    stats.totalChanges++
    totalPriceChange += row.price_change || 0
    totalMarginChange += (row.new_margin - row.previous_margin) || 0

    if ((row.price_change || 0) > 0) {
      stats.increaseCount++
    } else {
      stats.decreaseCount++
    }

    const ruleName = row.rule_name || 'Unknown'
    stats.byRule[ruleName] = (stats.byRule[ruleName] || 0) + 1

    const strategy = row.strategy || 'unknown'
    stats.byStrategy[strategy] = (stats.byStrategy[strategy] || 0) + 1
  }

  stats.avgPriceChange = stats.totalChanges > 0 ? totalPriceChange / stats.totalChanges : 0
  stats.avgMarginChange = stats.totalChanges > 0 ? totalMarginChange / stats.totalChanges : 0

  stats.recentChanges = (data as any[]).slice(0, 20).map((row) => ({
    assignmentId: row.assignment_id,
    skuId: row.sku_id,
    previousPrice: row.previous_price,
    newPrice: row.new_price,
    ruleName: row.rule_name,
    createdAt: row.created_at,
  }))

  return stats
}

/**
 * Get price history for a specific listing
 */
export async function getPriceHistory(
  assignmentId: string,
  limit: number = 50
): Promise<Array<{
  previousPrice: number
  newPrice: number
  priceChange: number
  ruleName: string
  reason: string
  createdAt: string
}>> {
  const { data } = await supabase
    .from('price_change_log')
    .select('previous_price, new_price, price_change, rule_name, reason, created_at')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  return (data as any[]).map((row) => ({
    previousPrice: row.previous_price,
    newPrice: row.new_price,
    priceChange: row.price_change,
    ruleName: row.rule_name,
    reason: row.reason,
    createdAt: row.created_at,
  }))
}

/**
 * Rollback a price change
 */
export async function rollbackPriceChange(
  assignmentId: string,
  priceLogId?: string
): Promise<{ success: boolean; error?: string; restoredPrice?: number }> {
  // Get the most recent or specified price change
  let query = supabase
    .from('price_change_log')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false })

  if (priceLogId) {
    query = query.eq('id', priceLogId)
  }

  const { data } = await query.limit(1).single()

  if (!data) {
    return { success: false, error: 'No price change found to rollback' }
  }

  const previousPrice = (data as any).previous_price

  try {
    // Restore the previous price
    const { error: updateError } = await supabase
      .from('store_sku_assignments')
      .update({
        actual_price: previousPrice,
        price_last_adjusted: new Date().toISOString(),
      })
      .eq('id', assignmentId)

    if (updateError) {
      throw new Error(updateError.message)
    }

    // Log the rollback
    await supabase.from('price_change_log').insert({
      assignment_id: assignmentId,
      sku_id: (data as any).sku_id,
      store_id: (data as any).store_id,
      previous_price: (data as any).new_price,
      new_price: previousPrice,
      price_change: previousPrice - (data as any).new_price,
      rule_id: 'rollback',
      rule_name: 'Manual Rollback',
      strategy: 'manual',
      reason: `Rollback of ${(data as any).rule_name}`,
    })

    return { success: true, restoredPrice: previousPrice }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Manually set a price for a listing
 */
export async function setManualPrice(
  assignmentId: string,
  newPrice: number,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  // Get current listing data
  const { data: listing } = await supabase
    .from('store_sku_assignments')
    .select('actual_price, sku_id, store_id')
    .eq('id', assignmentId)
    .single()

  if (!listing) {
    return { success: false, error: 'Listing not found' }
  }

  const currentPrice = (listing as any).actual_price || 0

  try {
    // Update the price
    const { error: updateError } = await supabase
      .from('store_sku_assignments')
      .update({
        actual_price: newPrice,
        price_last_adjusted: new Date().toISOString(),
      })
      .eq('id', assignmentId)

    if (updateError) {
      throw new Error(updateError.message)
    }

    // Log the manual change
    await supabase.from('price_change_log').insert({
      assignment_id: assignmentId,
      sku_id: (listing as any).sku_id,
      store_id: (listing as any).store_id,
      previous_price: currentPrice,
      new_price: newPrice,
      price_change: newPrice - currentPrice,
      price_change_percent: currentPrice > 0 ? ((newPrice - currentPrice) / currentPrice) * 100 : 0,
      rule_id: 'manual',
      rule_name: 'Manual Price Set',
      strategy: 'manual',
      reason: reason || 'Manual price adjustment',
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get pending price changes awaiting approval
 */
export async function getPendingPriceChanges(options: {
  storeId?: string
  limit?: number
} = {}): Promise<any[]> {
  const { storeId, limit = 50 } = options

  let query = supabase
    .from('pending_price_changes')
    .select(`
      id,
      assignment_id,
      sku_id,
      store_id,
      current_price,
      recommended_price,
      price_change,
      price_change_percent,
      rule_id,
      rule_name,
      strategy,
      reason,
      created_at
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[Repricing] Get pending changes error:', error)
    return []
  }

  return data || []
}

/**
 * Apply a pending price change
 */
export async function applyPendingPriceChange(
  changeId: string
): Promise<{ success: boolean; error?: string }> {
  // Get the pending change
  const { data: change, error: fetchError } = await supabase
    .from('pending_price_changes')
    .select('*')
    .eq('id', changeId)
    .eq('status', 'pending')
    .single()

  if (fetchError || !change) {
    return { success: false, error: 'Pending change not found' }
  }

  try {
    // Apply the price change
    const { error: updateError } = await supabase
      .from('store_sku_assignments')
      .update({
        actual_price: change.recommended_price,
        price_last_adjusted: new Date().toISOString(),
      })
      .eq('id', change.assignment_id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    // Log the change
    await supabase.from('price_change_log').insert({
      assignment_id: change.assignment_id,
      sku_id: change.sku_id,
      store_id: change.store_id,
      previous_price: change.current_price,
      new_price: change.recommended_price,
      price_change: change.price_change,
      price_change_percent: change.price_change_percent,
      rule_id: change.rule_id,
      rule_name: change.rule_name,
      strategy: change.strategy,
      reason: change.reason,
    })

    // Mark as applied
    await supabase
      .from('pending_price_changes')
      .update({
        status: 'applied',
        applied_at: new Date().toISOString(),
      })
      .eq('id', changeId)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Reject a pending price change
 */
export async function rejectPendingPriceChange(
  changeId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('pending_price_changes')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq('id', changeId)
      .eq('status', 'pending')

    if (error) {
      throw new Error(error.message)
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
