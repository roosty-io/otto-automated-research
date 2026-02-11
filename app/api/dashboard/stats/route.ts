import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getPipelineStats } from '@/lib/pipeline'
import { getJobStats } from '@/lib/jobs'
import { detectPatterns } from '@/lib/ai'

/**
 * GET /api/dashboard/stats
 *
 * Get comprehensive dashboard statistics
 */
export async function GET() {
  try {
    // Fetch all stats in parallel
    const [
      pipelineStats,
      jobStats,
      productCounts,
      skuCounts,
      recentActivity,
      topPatterns,
    ] = await Promise.all([
      getPipelineStats(),
      getJobStats(),
      getProductCounts(),
      getSkuCounts(),
      getRecentActivity(),
      getTopPatterns(),
    ])

    // Calculate funnel metrics
    const funnel = calculateFunnelMetrics(productCounts)

    // Calculate health score
    const healthScore = calculateHealthScore({
      pipelineStats,
      jobStats,
      productCounts,
      skuCounts,
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),

      // Pipeline stats
      pipeline: {
        ...pipelineStats,
        funnel,
      },

      // Job queue stats
      jobs: jobStats,

      // Product counts by stage
      products: productCounts,

      // SKU stats
      skus: skuCounts,

      // Recent activity
      recentActivity,

      // Top patterns/opportunities
      topPatterns,

      // Overall health
      health: healthScore,
    })
  } catch (error) {
    console.error('[Dashboard Stats] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function getProductCounts(): Promise<{
  raw: number
  processed: number
  normalized: number
  withSkus: number
  listed: number
  bySource: Record<string, number>
  byCategory: Record<string, number>
  avgQualityScore: number
}> {
  // Get raw products count
  const { count: rawCount } = await supabase
    .from('raw_products')
    .select('*', { count: 'exact', head: true })

  // Get processed count
  const { count: processedCount } = await supabase
    .from('raw_products')
    .select('*', { count: 'exact', head: true })
    .eq('is_processed', true)

  // Get normalized products count
  const { count: normalizedCount } = await supabase
    .from('normalized_products')
    .select('*', { count: 'exact', head: true })

  // Get products with SKUs
  const { count: withSkusCount } = await supabase
    .from('normalized_products')
    .select('*', { count: 'exact', head: true })
    .not('sku_id', 'is', null)

  // Get listed products
  const { count: listedCount } = await supabase
    .from('skus')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'listed')

  // Get counts by source
  const { data: sourceData } = await supabase
    .from('raw_products')
    .select('source')

  const bySource: Record<string, number> = {}
  if (sourceData) {
    for (const row of sourceData as any[]) {
      const source = row.source || 'unknown'
      bySource[source] = (bySource[source] || 0) + 1
    }
  }

  // Get counts by category
  const { data: categoryData } = await supabase
    .from('normalized_products')
    .select('normalized_category')

  const byCategory: Record<string, number> = {}
  if (categoryData) {
    for (const row of categoryData as any[]) {
      const category = row.normalized_category || 'Uncategorized'
      byCategory[category] = (byCategory[category] || 0) + 1
    }
  }

  // Get average quality score
  const { data: qualityData } = await supabase
    .from('normalized_products')
    .select('quality_score')
    .not('quality_score', 'is', null)

  let avgQualityScore = 0
  if (qualityData && qualityData.length > 0) {
    const sum = (qualityData as any[]).reduce((acc, row) => acc + (row.quality_score || 0), 0)
    avgQualityScore = Math.round(sum / qualityData.length)
  }

  return {
    raw: rawCount || 0,
    processed: processedCount || 0,
    normalized: normalizedCount || 0,
    withSkus: withSkusCount || 0,
    listed: listedCount || 0,
    bySource,
    byCategory,
    avgQualityScore,
  }
}

async function getSkuCounts(): Promise<{
  total: number
  ready: number
  needsReview: number
  listed: number
  paused: number
  byPriceBand: Record<string, number>
  avgPrice: number
  avgMargin: number
}> {
  // Get total SKUs
  const { count: totalCount } = await supabase
    .from('skus')
    .select('*', { count: 'exact', head: true })

  // Get by status
  const { count: readyCount } = await supabase
    .from('skus')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ready')

  const { count: needsReviewCount } = await supabase
    .from('skus')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'needs_review')

  const { count: listedCount } = await supabase
    .from('skus')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'listed')

  const { count: pausedCount } = await supabase
    .from('skus')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'paused')

  // Get price band distribution
  const { data: skuData } = await supabase
    .from('skus')
    .select('suggested_price, cost_price, price_band')

  const byPriceBand: Record<string, number> = {}
  let totalPrice = 0
  let totalMargin = 0
  let marginCount = 0

  if (skuData) {
    for (const row of skuData as any[]) {
      const band = row.price_band || 'unknown'
      byPriceBand[band] = (byPriceBand[band] || 0) + 1

      if (row.suggested_price) {
        totalPrice += row.suggested_price
      }

      if (row.suggested_price && row.cost_price && row.cost_price > 0) {
        const margin = ((row.suggested_price - row.cost_price) / row.suggested_price) * 100
        totalMargin += margin
        marginCount++
      }
    }
  }

  const avgPrice = skuData && skuData.length > 0
    ? Math.round((totalPrice / skuData.length) * 100) / 100
    : 0

  const avgMargin = marginCount > 0
    ? Math.round((totalMargin / marginCount) * 10) / 10
    : 0

  return {
    total: totalCount || 0,
    ready: readyCount || 0,
    needsReview: needsReviewCount || 0,
    listed: listedCount || 0,
    paused: pausedCount || 0,
    byPriceBand,
    avgPrice,
    avgMargin,
  }
}

async function getRecentActivity(): Promise<Array<{
  type: string
  message: string
  details?: string
  timestamp: string
}>> {
  const activities: Array<{
    type: string
    message: string
    details?: string
    timestamp: string
  }> = []

  // Get recent jobs
  const { data: recentJobs } = await supabase
    .from('automation_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  if (recentJobs) {
    for (const job of recentJobs as any[]) {
      let message = ''
      switch (job.type) {
        case 'zik_research':
          message = 'ZIK research job'
          break
        case 'keepa_lookup':
          message = 'Amazon product lookup'
          break
        case 'normalize_products':
          message = 'Product normalization'
          break
        case 'generate_skus':
          message = 'SKU generation'
          break
        default:
          message = `${job.type} job`
      }

      activities.push({
        type: job.status,
        message: `${message} ${job.status}`,
        details: job.result?.data?.processed
          ? `${job.result.data.processed} items processed`
          : undefined,
        timestamp: job.updated_at || job.created_at,
      })
    }
  }

  // Get recent raw products
  const { data: recentProducts } = await supabase
    .from('raw_products')
    .select('id, title, source, created_at')
    .order('created_at', { ascending: false })
    .limit(3)

  if (recentProducts) {
    for (const product of recentProducts as any[]) {
      activities.push({
        type: 'product',
        message: 'Product discovered',
        details: product.title?.slice(0, 50) + (product.title?.length > 50 ? '...' : ''),
        timestamp: product.created_at,
      })
    }
  }

  // Sort by timestamp
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return activities.slice(0, 10)
}

async function getTopPatterns(): Promise<Array<{
  type: string
  name: string
  confidence: number
  productCount: number
  priority: string
}>> {
  try {
    const result = await detectPatterns({ minConfidence: 0.5, minProducts: 2 })

    return result.patterns.slice(0, 5).map((p) => ({
      type: p.type,
      name: p.name,
      confidence: Math.round(p.confidence * 100),
      productCount: p.metrics.productCount,
      priority: p.priority,
    }))
  } catch {
    // Pattern detection may fail if no data, return empty
    return []
  }
}

function calculateFunnelMetrics(productCounts: any): {
  discoveryRate: number
  processingRate: number
  normalizationRate: number
  skuRate: number
  listingRate: number
} {
  const raw = productCounts.raw || 1
  const processed = productCounts.processed || 0
  const normalized = productCounts.normalized || 0
  const withSkus = productCounts.withSkus || 0
  const listed = productCounts.listed || 0

  return {
    discoveryRate: 100, // Raw is the baseline
    processingRate: Math.round((processed / raw) * 100),
    normalizationRate: processed > 0 ? Math.round((normalized / processed) * 100) : 0,
    skuRate: normalized > 0 ? Math.round((withSkus / normalized) * 100) : 0,
    listingRate: withSkus > 0 ? Math.round((listed / withSkus) * 100) : 0,
  }
}

function calculateHealthScore(data: {
  pipelineStats: any
  jobStats: any
  productCounts: any
  skuCounts: any
}): {
  overall: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  factors: { name: string; score: number; status: 'good' | 'warning' | 'critical' }[]
} {
  const factors: { name: string; score: number; status: 'good' | 'warning' | 'critical' }[] = []

  // Pipeline health
  const pipelineHealth = data.pipelineStats.failed === 0 ? 100 :
    Math.max(0, 100 - (data.pipelineStats.failed / Math.max(1, data.pipelineStats.total)) * 100)
  factors.push({
    name: 'Pipeline Health',
    score: Math.round(pipelineHealth),
    status: pipelineHealth >= 80 ? 'good' : pipelineHealth >= 50 ? 'warning' : 'critical',
  })

  // Job queue health
  const jobHealth = data.jobStats.failed === 0 ? 100 :
    Math.max(0, 100 - (data.jobStats.failed / Math.max(1, data.jobStats.completed + data.jobStats.failed)) * 50)
  factors.push({
    name: 'Job Queue',
    score: Math.round(jobHealth),
    status: jobHealth >= 80 ? 'good' : jobHealth >= 50 ? 'warning' : 'critical',
  })

  // Product quality
  const qualityScore = data.productCounts.avgQualityScore || 50
  factors.push({
    name: 'Product Quality',
    score: qualityScore,
    status: qualityScore >= 70 ? 'good' : qualityScore >= 50 ? 'warning' : 'critical',
  })

  // SKU readiness
  const totalSkus = data.skuCounts.total || 1
  const readyRate = Math.round(((data.skuCounts.ready + data.skuCounts.listed) / totalSkus) * 100)
  factors.push({
    name: 'SKU Readiness',
    score: readyRate,
    status: readyRate >= 70 ? 'good' : readyRate >= 40 ? 'warning' : 'critical',
  })

  // Overall score
  const overall = Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length)

  // Grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F'
  if (overall >= 90) grade = 'A'
  else if (overall >= 80) grade = 'B'
  else if (overall >= 70) grade = 'C'
  else if (overall >= 60) grade = 'D'

  return { overall, grade, factors }
}
