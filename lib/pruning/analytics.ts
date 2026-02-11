/**
 * Pruning Analytics
 *
 * Provides insights and reports on pruning performance:
 * - Pruning effectiveness metrics
 * - Rule performance analysis
 * - Cost savings calculations
 * - Trend analysis
 */

import { supabase } from '@/lib/supabase'

export interface PruningMetrics {
  period: {
    start: string
    end: string
    days: number
  }
  totals: {
    evaluated: number
    pruned: number
    paused: number
    repriced: number
    reviewed: number
  }
  rates: {
    pruneRate: number // % of evaluated that were pruned
    reviewApprovalRate: number // % of reviews that were approved
    successRate: number // % of actions that succeeded
  }
  savings: {
    estimatedFeesSaved: number // Based on eBay listing fees
    underperformersRemoved: number
    avgDaysToAction: number
  }
  topRules: Array<{
    ruleId: string
    ruleName: string
    actionCount: number
    effectiveness: number
  }>
}

export interface RulePerformance {
  ruleId: string
  ruleName: string
  totalMatches: number
  totalActions: number
  successRate: number
  avgListingAge: number
  avgViewsAtPrune: number
  avgSalesAtPrune: number
  byAction: Record<string, number>
}

export interface TrendData {
  date: string
  pruned: number
  paused: number
  reviewed: number
  evaluated: number
}

/**
 * Get pruning metrics for a time period
 */
export async function getPruningMetrics(options: {
  storeId?: string
  startDate?: Date
  endDate?: Date
} = {}): Promise<PruningMetrics> {
  const endDate = options.endDate || new Date()
  const startDate = options.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  // Get pruning logs for the period
  let query = supabase
    .from('pruning_log')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  if (options.storeId) {
    query = query.eq('store_id', options.storeId)
  }

  const { data: logs } = await query

  // Get review data
  let reviewQuery = supabase
    .from('pruning_reviews')
    .select('status')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  if (options.storeId) {
    reviewQuery = reviewQuery.eq('store_id', options.storeId)
  }

  const { data: reviews } = await reviewQuery

  // Calculate totals
  const totals = {
    evaluated: 0,
    pruned: 0,
    paused: 0,
    repriced: 0,
    reviewed: 0,
  }

  const ruleStats: Record<string, { count: number; success: number }> = {}
  let totalDaysToAction = 0
  let actionCount = 0

  if (logs) {
    for (const log of logs as any[]) {
      switch (log.action) {
        case 'prune':
          totals.pruned++
          break
        case 'pause':
          totals.paused++
          break
        case 'reprice':
          totals.repriced++
          break
        case 'review':
          totals.reviewed++
          break
      }

      // Track rule performance
      const ruleKey = log.rule_id || 'unknown'
      if (!ruleStats[ruleKey]) {
        ruleStats[ruleKey] = { count: 0, success: 0 }
      }
      ruleStats[ruleKey].count++
      if (log.success) {
        ruleStats[ruleKey].success++
      }

      // Track days to action
      if (log.listing_data?.daysListed) {
        totalDaysToAction += log.listing_data.daysListed
        actionCount++
      }
    }
  }

  // Get total evaluated (unique assignments)
  const uniqueAssignments = new Set(
    (logs as any[] || []).map((l) => l.assignment_id)
  )
  totals.evaluated = uniqueAssignments.size || (logs?.length || 0)

  // Calculate review approval rate
  let reviewApprovalRate = 0
  if (reviews) {
    const reviewData = reviews as any[]
    const approved = reviewData.filter((r) => r.status === 'approved').length
    const total = reviewData.filter((r) => r.status !== 'pending').length
    reviewApprovalRate = total > 0 ? (approved / total) * 100 : 0
  }

  // Calculate success rate
  const totalActions = (logs as any[] || []).length
  const successfulActions = (logs as any[] || []).filter((l) => l.success).length
  const successRate = totalActions > 0 ? (successfulActions / totalActions) * 100 : 100

  // Calculate savings (estimated eBay fees ~$0.35 per listing)
  const estimatedFeesSaved = totals.pruned * 0.35 * 30 // Monthly fee savings

  // Get top rules
  const topRules = Object.entries(ruleStats)
    .map(([ruleId, stats]) => {
      const ruleName = (logs as any[] || [])
        .find((l) => l.rule_id === ruleId)?.rule_name || ruleId
      return {
        ruleId,
        ruleName,
        actionCount: stats.count,
        effectiveness: stats.count > 0 ? (stats.success / stats.count) * 100 : 0,
      }
    })
    .sort((a, b) => b.actionCount - a.actionCount)
    .slice(0, 5)

  return {
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      days,
    },
    totals,
    rates: {
      pruneRate: totals.evaluated > 0 ? (totals.pruned / totals.evaluated) * 100 : 0,
      reviewApprovalRate,
      successRate,
    },
    savings: {
      estimatedFeesSaved,
      underperformersRemoved: totals.pruned + totals.paused,
      avgDaysToAction: actionCount > 0 ? Math.round(totalDaysToAction / actionCount) : 0,
    },
    topRules,
  }
}

/**
 * Get detailed performance metrics for each rule
 */
export async function getRulePerformance(options: {
  storeId?: string
  daysBack?: number
} = {}): Promise<RulePerformance[]> {
  const { storeId, daysBack = 30 } = options

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  let query = supabase
    .from('pruning_log')
    .select('*')
    .gte('created_at', startDate.toISOString())

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: logs } = await query

  if (!logs) return []

  // Group by rule
  const ruleGroups: Record<string, any[]> = {}
  for (const log of logs as any[]) {
    const ruleId = log.rule_id || 'unknown'
    if (!ruleGroups[ruleId]) {
      ruleGroups[ruleId] = []
    }
    ruleGroups[ruleId].push(log)
  }

  // Calculate metrics for each rule
  return Object.entries(ruleGroups).map(([ruleId, ruleLogs]) => {
    const successCount = ruleLogs.filter((l) => l.success).length
    const totalViews = ruleLogs.reduce((sum, l) => sum + (l.listing_data?.views || 0), 0)
    const totalSales = ruleLogs.reduce((sum, l) => sum + (l.listing_data?.sales || 0), 0)
    const totalDays = ruleLogs.reduce((sum, l) => sum + (l.listing_data?.daysListed || 0), 0)

    const byAction: Record<string, number> = {}
    for (const log of ruleLogs) {
      byAction[log.action] = (byAction[log.action] || 0) + 1
    }

    return {
      ruleId,
      ruleName: ruleLogs[0]?.rule_name || ruleId,
      totalMatches: ruleLogs.length,
      totalActions: ruleLogs.filter((l) => l.action !== 'review').length,
      successRate: ruleLogs.length > 0 ? (successCount / ruleLogs.length) * 100 : 0,
      avgListingAge: ruleLogs.length > 0 ? Math.round(totalDays / ruleLogs.length) : 0,
      avgViewsAtPrune: ruleLogs.length > 0 ? Math.round(totalViews / ruleLogs.length) : 0,
      avgSalesAtPrune: ruleLogs.length > 0 ? Math.round(totalSales / ruleLogs.length * 10) / 10 : 0,
      byAction,
    }
  })
}

/**
 * Get trend data for charting
 */
export async function getPruningTrends(options: {
  storeId?: string
  daysBack?: number
} = {}): Promise<TrendData[]> {
  const { storeId, daysBack = 30 } = options

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  let query = supabase
    .from('pruning_log')
    .select('action, created_at, success')
    .gte('created_at', startDate.toISOString())
    .eq('success', true)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: logs } = await query

  // Group by date
  const dateGroups: Record<string, TrendData> = {}

  // Initialize all dates
  for (let i = 0; i < daysBack; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateKey = date.toISOString().split('T')[0]
    dateGroups[dateKey] = {
      date: dateKey,
      pruned: 0,
      paused: 0,
      reviewed: 0,
      evaluated: 0,
    }
  }

  // Aggregate logs
  if (logs) {
    for (const log of logs as any[]) {
      const dateKey = log.created_at.split('T')[0]
      if (dateGroups[dateKey]) {
        dateGroups[dateKey].evaluated++
        switch (log.action) {
          case 'prune':
            dateGroups[dateKey].pruned++
            break
          case 'pause':
            dateGroups[dateKey].paused++
            break
          case 'review':
            dateGroups[dateKey].reviewed++
            break
        }
      }
    }
  }

  // Convert to sorted array
  return Object.values(dateGroups).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Get pruning impact analysis
 */
export async function getPruningImpact(options: {
  storeId?: string
  daysBack?: number
} = {}): Promise<{
  beforePrune: {
    avgViews: number
    avgSales: number
    avgRevenue: number
    avgDaysListed: number
  }
  afterPrune: {
    listingsRemoved: number
    capacityFreed: number
    projectedSavings: number
  }
  efficiency: {
    avgTimeToDetect: number // Days from listing to prune decision
    falsePositiveRate: number // Reviews rejected / total reviews
    rulesEffectiveness: number // % of rules that have triggered
  }
}> {
  const { storeId, daysBack = 30 } = options

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  let query = supabase
    .from('pruning_log')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .eq('success', true)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: logs } = await query

  // Calculate before-prune metrics
  let totalViews = 0
  let totalSales = 0
  let totalRevenue = 0
  let totalDays = 0
  let count = 0

  if (logs) {
    for (const log of logs as any[]) {
      if (log.listing_data) {
        totalViews += log.listing_data.views || 0
        totalSales += log.listing_data.sales || 0
        totalRevenue += log.listing_data.revenue || 0
        totalDays += log.listing_data.daysListed || 0
        count++
      }
    }
  }

  const prunedCount = (logs as any[] || []).filter(
    (l) => l.action === 'prune' || l.action === 'pause'
  ).length

  // Get review stats for false positive rate
  let reviewQuery = supabase
    .from('pruning_reviews')
    .select('status')
    .gte('created_at', startDate.toISOString())
    .neq('status', 'pending')

  if (storeId) {
    reviewQuery = reviewQuery.eq('store_id', storeId)
  }

  const { data: reviews } = await reviewQuery
  const rejectedReviews = (reviews as any[] || []).filter((r) => r.status === 'rejected').length
  const totalReviews = (reviews as any[] || []).length

  return {
    beforePrune: {
      avgViews: count > 0 ? Math.round(totalViews / count) : 0,
      avgSales: count > 0 ? Math.round(totalSales / count * 10) / 10 : 0,
      avgRevenue: count > 0 ? Math.round(totalRevenue / count * 100) / 100 : 0,
      avgDaysListed: count > 0 ? Math.round(totalDays / count) : 0,
    },
    afterPrune: {
      listingsRemoved: prunedCount,
      capacityFreed: prunedCount, // Each pruned listing frees one slot
      projectedSavings: prunedCount * 0.35 * 30, // Monthly listing fee estimate
    },
    efficiency: {
      avgTimeToDetect: count > 0 ? Math.round(totalDays / count) : 0,
      falsePositiveRate: totalReviews > 0 ? (rejectedReviews / totalReviews) * 100 : 0,
      rulesEffectiveness: 0, // Would need to compare active rules vs triggered rules
    },
  }
}

/**
 * Generate pruning report
 */
export async function generatePruningReport(options: {
  storeId?: string
  startDate: Date
  endDate: Date
}): Promise<{
  summary: PruningMetrics
  rulePerformance: RulePerformance[]
  trends: TrendData[]
  impact: Awaited<ReturnType<typeof getPruningImpact>>
  recommendations: string[]
}> {
  const [summary, rulePerformance, trends, impact] = await Promise.all([
    getPruningMetrics(options),
    getRulePerformance({ storeId: options.storeId }),
    getPruningTrends({ storeId: options.storeId }),
    getPruningImpact({ storeId: options.storeId }),
  ])

  // Generate recommendations
  const recommendations: string[] = []

  if (summary.rates.pruneRate > 30) {
    recommendations.push(
      'High prune rate detected. Consider reviewing listing quality before publishing.'
    )
  }

  if (summary.savings.avgDaysToAction > 45) {
    recommendations.push(
      'Listings are taking too long to be pruned. Consider tightening pruning rules.'
    )
  }

  if (impact.efficiency.falsePositiveRate > 20) {
    recommendations.push(
      'High false positive rate in reviews. Consider adjusting rule thresholds.'
    )
  }

  const underperformingRules = rulePerformance.filter((r) => r.successRate < 80)
  if (underperformingRules.length > 0) {
    recommendations.push(
      `${underperformingRules.length} rules have low success rates. Review and adjust these rules.`
    )
  }

  if (summary.totals.reviewed > summary.totals.pruned * 2) {
    recommendations.push(
      'Too many listings are being flagged for review. Consider automating more decisions.'
    )
  }

  return {
    summary,
    rulePerformance,
    trends,
    impact,
    recommendations,
  }
}
