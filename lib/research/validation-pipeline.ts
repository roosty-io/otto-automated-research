/**
 * Validation Pipeline Measurement System
 *
 * Comprehensive metrics and measurement for the product validation pipeline.
 * Designed for scale: 150k+ products/month at 10,000+ users.
 *
 * Key measurements:
 * - Pipeline throughput and latency
 * - Validation success/failure rates by stage
 * - Bottleneck identification
 * - Quality metrics for validated products
 * - Supplier performance tracking
 * - Cassini compliance rates
 */

import { supabase } from '../supabase'

// =============================================================================
// TYPES
// =============================================================================

export interface PipelineMetrics {
  // Throughput metrics
  throughput: {
    productsPerHour: number
    productsPerDay: number
    productsPerMonth: number
    currentBacklog: number
    avgProcessingTimeMs: number
    p95ProcessingTimeMs: number
  }

  // Stage metrics
  stages: {
    discovery: StageMetrics
    supplierValidation: StageMetrics
    cassiniValidation: StageMetrics
    competitionAnalysis: StageMetrics
    riskAssessment: StageMetrics
    finalApproval: StageMetrics
  }

  // Quality metrics
  quality: {
    overallPassRate: number
    avgValidationScore: number
    cassiniComplianceRate: number
    shippingRiskDistribution: Record<string, number>
    profitMarginDistribution: {
      excellent: number // 30%+
      good: number // 20-30%
      acceptable: number // 15-20%
      marginal: number // <15%
    }
  }

  // Capacity metrics
  capacity: {
    currentUtilization: number // % of max throughput
    maxTheoreticalThroughput: number
    bottlenecks: Bottleneck[]
    scalingRecommendations: string[]
  }

  // Time period
  period: {
    start: string
    end: string
    durationHours: number
  }
}

export interface StageMetrics {
  name: string
  processed: number
  passed: number
  failed: number
  passRate: number
  avgDurationMs: number
  p95DurationMs: number
  errorRate: number
  topFailureReasons: Array<{ reason: string; count: number; percentage: number }>
}

export interface Bottleneck {
  stage: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  impact: string
  recommendation: string
}

export interface ValidationEvent {
  id: string
  productId: string
  asin?: string
  stage: string
  status: 'started' | 'passed' | 'failed' | 'skipped'
  score?: number
  durationMs?: number
  failureReason?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface PipelineRun {
  id: string
  batchId?: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  totalProducts: number
  processed: number
  passed: number
  failed: number
  avgScore: number
  throughputPerMinute: number
}

// =============================================================================
// PIPELINE STAGES
// =============================================================================

export const PIPELINE_STAGES = [
  'discovery',
  'supplier_validation',
  'cassini_validation',
  'competition_analysis',
  'risk_assessment',
  'final_approval',
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

// =============================================================================
// EVENT LOGGING
// =============================================================================

export async function logValidationEvent(event: Omit<ValidationEvent, 'id' | 'createdAt'>): Promise<void> {
  try {
    await supabase.from('validation_events').insert({
      product_id: event.productId,
      asin: event.asin,
      stage: event.stage,
      status: event.status,
      score: event.score,
      duration_ms: event.durationMs,
      failure_reason: event.failureReason,
      metadata: event.metadata,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[ValidationPipeline] Failed to log event:', error)
  }
}

export async function logBatchEvent(
  batchId: string,
  stage: string,
  metrics: {
    processed: number
    passed: number
    failed: number
    avgDurationMs: number
  }
): Promise<void> {
  try {
    await supabase.from('validation_batch_events').insert({
      batch_id: batchId,
      stage,
      processed: metrics.processed,
      passed: metrics.passed,
      failed: metrics.failed,
      avg_duration_ms: metrics.avgDurationMs,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[ValidationPipeline] Failed to log batch event:', error)
  }
}

// =============================================================================
// PIPELINE RUN MANAGEMENT
// =============================================================================

export async function startPipelineRun(
  totalProducts: number,
  batchId?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('pipeline_runs')
    .insert({
      batch_id: batchId,
      started_at: new Date().toISOString(),
      status: 'running',
      total_products: totalProducts,
      processed: 0,
      passed: 0,
      failed: 0,
      avg_score: 0,
      throughput_per_minute: 0,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to start pipeline run: ${error.message}`)
  }

  return data.id
}

export async function updatePipelineRun(
  runId: string,
  updates: Partial<{
    processed: number
    passed: number
    failed: number
    avgScore: number
    throughputPerMinute: number
    status: PipelineRun['status']
    completedAt: string
  }>
): Promise<void> {
  await supabase
    .from('pipeline_runs')
    .update({
      processed: updates.processed,
      passed: updates.passed,
      failed: updates.failed,
      avg_score: updates.avgScore,
      throughput_per_minute: updates.throughputPerMinute,
      status: updates.status,
      completed_at: updates.completedAt,
    })
    .eq('id', runId)
}

export async function completePipelineRun(
  runId: string,
  finalMetrics: {
    processed: number
    passed: number
    failed: number
    avgScore: number
  }
): Promise<void> {
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('started_at')
    .eq('id', runId)
    .single()

  const durationMinutes =
    (Date.now() - new Date(run?.started_at || Date.now()).getTime()) / 60000
  const throughput = durationMinutes > 0 ? finalMetrics.processed / durationMinutes : 0

  await updatePipelineRun(runId, {
    ...finalMetrics,
    throughputPerMinute: throughput,
    status: 'completed',
    completedAt: new Date().toISOString(),
  })
}

// =============================================================================
// METRICS CALCULATION
// =============================================================================

export async function calculatePipelineMetrics(
  hoursBack = 24
): Promise<PipelineMetrics> {
  const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
  const endTime = new Date()

  // Fetch validation events
  const { data: events } = await supabase
    .from('validation_events')
    .select('*')
    .gte('created_at', startTime.toISOString())

  // Fetch pipeline runs
  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('*')
    .gte('started_at', startTime.toISOString())

  const eventList = events || []
  const runList = runs || []

  // Calculate throughput
  const throughput = calculateThroughput(eventList, runList, hoursBack)

  // Calculate stage metrics
  const stages = calculateStageMetrics(eventList)

  // Calculate quality metrics
  const quality = calculateQualityMetrics(eventList)

  // Calculate capacity
  const capacity = calculateCapacity(throughput, stages)

  return {
    throughput,
    stages,
    quality,
    capacity,
    period: {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      durationHours: hoursBack,
    },
  }
}

function calculateThroughput(
  events: any[],
  runs: any[],
  hours: number
): PipelineMetrics['throughput'] {
  const completedProducts = events.filter(
    (e) => e.stage === 'final_approval' && e.status === 'passed'
  ).length

  const processingTimes = events
    .filter((e) => e.duration_ms !== null)
    .map((e) => e.duration_ms)

  const avgProcessingTime =
    processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0

  const sortedTimes = processingTimes.sort((a, b) => a - b)
  const p95Index = Math.floor(sortedTimes.length * 0.95)
  const p95ProcessingTime = sortedTimes[p95Index] || 0

  const pendingRuns = runs.filter((r) => r.status === 'running')
  const backlog = pendingRuns.reduce(
    (sum, r) => sum + (r.total_products - r.processed),
    0
  )

  return {
    productsPerHour: hours > 0 ? Math.round(completedProducts / hours) : 0,
    productsPerDay: hours > 0 ? Math.round((completedProducts / hours) * 24) : 0,
    productsPerMonth: hours > 0 ? Math.round((completedProducts / hours) * 24 * 30) : 0,
    currentBacklog: backlog,
    avgProcessingTimeMs: Math.round(avgProcessingTime),
    p95ProcessingTimeMs: Math.round(p95ProcessingTime),
  }
}

function calculateStageMetrics(events: any[]): PipelineMetrics['stages'] {
  const stageMap: Record<string, StageMetrics> = {}

  for (const stageName of PIPELINE_STAGES) {
    const stageEvents = events.filter((e) => e.stage === stageName)
    const passed = stageEvents.filter((e) => e.status === 'passed').length
    const failed = stageEvents.filter((e) => e.status === 'failed').length
    const total = passed + failed

    // Calculate durations
    const durations = stageEvents
      .filter((e) => e.duration_ms !== null)
      .map((e) => e.duration_ms)
    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0
    const sortedDurations = durations.sort((a, b) => a - b)
    const p95Index = Math.floor(sortedDurations.length * 0.95)
    const p95Duration = sortedDurations[p95Index] || 0

    // Calculate failure reasons
    const failureReasons: Record<string, number> = {}
    for (const event of stageEvents.filter((e) => e.status === 'failed')) {
      const reason = event.failure_reason || 'Unknown'
      failureReasons[reason] = (failureReasons[reason] || 0) + 1
    }

    const topFailureReasons = Object.entries(failureReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))

    stageMap[stageName] = {
      name: stageName,
      processed: total,
      passed,
      failed,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
      avgDurationMs: Math.round(avgDuration),
      p95DurationMs: Math.round(p95Duration),
      errorRate: total > 0 ? Math.round((failed / total) * 100) : 0,
      topFailureReasons,
    }
  }

  return {
    discovery: stageMap['discovery'] || createEmptyStageMetrics('discovery'),
    supplierValidation:
      stageMap['supplier_validation'] || createEmptyStageMetrics('supplier_validation'),
    cassiniValidation:
      stageMap['cassini_validation'] || createEmptyStageMetrics('cassini_validation'),
    competitionAnalysis:
      stageMap['competition_analysis'] || createEmptyStageMetrics('competition_analysis'),
    riskAssessment:
      stageMap['risk_assessment'] || createEmptyStageMetrics('risk_assessment'),
    finalApproval:
      stageMap['final_approval'] || createEmptyStageMetrics('final_approval'),
  }
}

function createEmptyStageMetrics(name: string): StageMetrics {
  return {
    name,
    processed: 0,
    passed: 0,
    failed: 0,
    passRate: 0,
    avgDurationMs: 0,
    p95DurationMs: 0,
    errorRate: 0,
    topFailureReasons: [],
  }
}

function calculateQualityMetrics(events: any[]): PipelineMetrics['quality'] {
  const approvedEvents = events.filter(
    (e) => e.stage === 'final_approval' && e.status === 'passed'
  )
  const validationEvents = events.filter(
    (e) => e.stage === 'supplier_validation' && e.score !== null
  )
  const cassiniEvents = events.filter(
    (e) => e.stage === 'cassini_validation' && e.status === 'passed'
  )

  const totalValidated = events.filter(
    (e) => e.stage === 'final_approval' && (e.status === 'passed' || e.status === 'failed')
  ).length

  const overallPassRate =
    totalValidated > 0 ? (approvedEvents.length / totalValidated) * 100 : 0

  const avgScore =
    validationEvents.length > 0
      ? validationEvents.reduce((sum, e) => sum + e.score, 0) / validationEvents.length
      : 0

  const cassiniComplianceRate =
    validationEvents.length > 0
      ? (cassiniEvents.length / validationEvents.length) * 100
      : 0

  // Calculate shipping risk distribution
  const shippingRiskDistribution: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  }
  for (const event of validationEvents) {
    const risk = (event.metadata as any)?.shippingRisk || 'unknown'
    shippingRiskDistribution[risk] = (shippingRiskDistribution[risk] || 0) + 1
  }

  // Calculate profit margin distribution
  const profitMarginDistribution = { excellent: 0, good: 0, acceptable: 0, marginal: 0 }
  for (const event of validationEvents) {
    const margin = (event.metadata as any)?.profitMargin || 0
    if (margin >= 30) profitMarginDistribution.excellent++
    else if (margin >= 20) profitMarginDistribution.good++
    else if (margin >= 15) profitMarginDistribution.acceptable++
    else profitMarginDistribution.marginal++
  }

  return {
    overallPassRate: Math.round(overallPassRate),
    avgValidationScore: Math.round(avgScore),
    cassiniComplianceRate: Math.round(cassiniComplianceRate),
    shippingRiskDistribution,
    profitMarginDistribution,
  }
}

function calculateCapacity(
  throughput: PipelineMetrics['throughput'],
  stages: PipelineMetrics['stages']
): PipelineMetrics['capacity'] {
  // Target: 150k products/month = ~5k/day = ~208/hour
  const targetPerHour = 208
  const maxTheoreticalThroughput = targetPerHour * 2 // Design for 2x headroom

  const currentUtilization =
    maxTheoreticalThroughput > 0
      ? (throughput.productsPerHour / maxTheoreticalThroughput) * 100
      : 0

  // Identify bottlenecks
  const bottlenecks: Bottleneck[] = []
  const scalingRecommendations: string[] = []

  // Check each stage for issues
  const stageList = Object.values(stages)
  const avgPassRate =
    stageList.reduce((sum, s) => sum + s.passRate, 0) / stageList.length

  for (const stage of stageList) {
    // Low pass rate bottleneck
    if (stage.passRate < 70 && stage.processed > 10) {
      bottlenecks.push({
        stage: stage.name,
        severity: stage.passRate < 50 ? 'high' : 'medium',
        description: `Low pass rate: ${stage.passRate}%`,
        impact: `${100 - stage.passRate}% of products fail at ${stage.name}`,
        recommendation: `Review validation criteria for ${stage.name} stage`,
      })
    }

    // Slow processing bottleneck
    if (stage.p95DurationMs > 5000 && stage.processed > 10) {
      bottlenecks.push({
        stage: stage.name,
        severity: stage.p95DurationMs > 10000 ? 'high' : 'medium',
        description: `Slow processing: p95 = ${Math.round(stage.p95DurationMs / 1000)}s`,
        impact: 'Reduces overall throughput',
        recommendation: `Optimize ${stage.name} or add parallel processing`,
      })
    }
  }

  // Throughput bottleneck
  if (throughput.productsPerHour < targetPerHour * 0.8) {
    bottlenecks.push({
      stage: 'overall',
      severity: throughput.productsPerHour < targetPerHour * 0.5 ? 'critical' : 'high',
      description: `Below target throughput: ${throughput.productsPerHour}/${targetPerHour} per hour`,
      impact: 'Cannot meet 150k/month target',
      recommendation: 'Scale validation infrastructure',
    })
  }

  // Backlog bottleneck
  if (throughput.currentBacklog > throughput.productsPerHour * 4) {
    bottlenecks.push({
      stage: 'queue',
      severity: 'high',
      description: `Large backlog: ${throughput.currentBacklog} products pending`,
      impact: 'Processing delays',
      recommendation: 'Increase parallel processing capacity',
    })
  }

  // Generate scaling recommendations
  if (currentUtilization > 80) {
    scalingRecommendations.push('Consider scaling infrastructure to maintain headroom')
  }
  if (throughput.p95ProcessingTimeMs > 3000) {
    scalingRecommendations.push('Optimize slowest pipeline stages')
  }
  if (stages.supplierValidation.passRate < 60) {
    scalingRecommendations.push('Improve product sourcing quality to reduce validation failures')
  }

  return {
    currentUtilization: Math.round(currentUtilization),
    maxTheoreticalThroughput,
    bottlenecks,
    scalingRecommendations,
  }
}

// =============================================================================
// REAL-TIME MONITORING
// =============================================================================

export interface PipelineStatus {
  isHealthy: boolean
  activeRuns: number
  throughputLastHour: number
  errorRateLastHour: number
  alerts: PipelineAlert[]
}

export interface PipelineAlert {
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
  stage?: string
  timestamp: string
}

export async function getPipelineStatus(): Promise<PipelineStatus> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  // Get active runs
  const { data: activeRuns } = await supabase
    .from('pipeline_runs')
    .select('id')
    .eq('status', 'running')

  // Get recent events
  const { data: recentEvents } = await supabase
    .from('validation_events')
    .select('status, stage')
    .gte('created_at', oneHourAgo.toISOString())

  const events = recentEvents || []
  const failedEvents = events.filter((e) => e.status === 'failed')
  const errorRate = events.length > 0 ? (failedEvents.length / events.length) * 100 : 0

  const alerts: PipelineAlert[] = []

  // Check for issues
  if (errorRate > 30) {
    alerts.push({
      severity: 'error',
      message: `High error rate: ${Math.round(errorRate)}% of validations failing`,
      timestamp: new Date().toISOString(),
    })
  }

  if (events.length < 10 && activeRuns && activeRuns.length > 0) {
    alerts.push({
      severity: 'warning',
      message: 'Low throughput detected despite active runs',
      timestamp: new Date().toISOString(),
    })
  }

  return {
    isHealthy: alerts.filter((a) => a.severity === 'error' || a.severity === 'critical').length === 0,
    activeRuns: activeRuns?.length || 0,
    throughputLastHour: events.filter((e) => e.status === 'passed').length,
    errorRateLastHour: Math.round(errorRate),
    alerts,
  }
}

// =============================================================================
// HISTORICAL ANALYTICS
// =============================================================================

export interface PipelineTrend {
  date: string
  throughput: number
  passRate: number
  avgScore: number
  cassiniCompliance: number
}

export async function getPipelineTrends(daysBack = 30): Promise<PipelineTrend[]> {
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

  const { data } = await supabase
    .from('validation_events')
    .select('created_at, status, score, stage')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true })

  if (!data || data.length === 0) {
    return []
  }

  // Group by day
  const dayMap = new Map<
    string,
    {
      total: number
      passed: number
      scores: number[]
      cassiniPassed: number
      cassiniTotal: number
    }
  >()

  for (const event of data) {
    const day = event.created_at.split('T')[0]
    const existing = dayMap.get(day) || {
      total: 0,
      passed: 0,
      scores: [],
      cassiniPassed: 0,
      cassiniTotal: 0,
    }

    if (event.stage === 'final_approval') {
      existing.total++
      if (event.status === 'passed') existing.passed++
    }

    if (event.stage === 'supplier_validation' && event.score !== null) {
      existing.scores.push(event.score)
    }

    if (event.stage === 'cassini_validation') {
      existing.cassiniTotal++
      if (event.status === 'passed') existing.cassiniPassed++
    }

    dayMap.set(day, existing)
  }

  return Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, stats]) => ({
      date,
      throughput: stats.passed,
      passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0,
      avgScore:
        stats.scores.length > 0
          ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
          : 0,
      cassiniCompliance:
        stats.cassiniTotal > 0
          ? Math.round((stats.cassiniPassed / stats.cassiniTotal) * 100)
          : 0,
    }))
}

// =============================================================================
// SUPPLIER PERFORMANCE TRACKING
// =============================================================================

export interface SupplierPerformance {
  fulfillmentType: string
  totalValidated: number
  passRate: number
  avgScore: number
  avgDeliveryDays: number
  shippingRiskDistribution: Record<string, number>
  topIssues: Array<{ issue: string; count: number }>
}

export async function getSupplierPerformance(daysBack = 30): Promise<SupplierPerformance[]> {
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

  const { data } = await supabase
    .from('supplier_validations')
    .select('is_valid, overall_score, supplier_data, shipping_validation, blockers')
    .gte('validated_at', startDate.toISOString())

  if (!data || data.length === 0) {
    return []
  }

  // Group by fulfillment type
  const typeMap = new Map<
    string,
    {
      total: number
      passed: number
      scores: number[]
      deliveryDays: number[]
      shippingRisk: Record<string, number>
      issues: Record<string, number>
    }
  >()

  for (const row of data) {
    const type = (row.supplier_data as any)?.fulfillmentType || 'unknown'
    const existing = typeMap.get(type) || {
      total: 0,
      passed: 0,
      scores: [],
      deliveryDays: [],
      shippingRisk: {},
      issues: {},
    }

    existing.total++
    if (row.is_valid) existing.passed++
    existing.scores.push(row.overall_score)

    const shipping = row.shipping_validation as any
    if (shipping?.totalDeliveryDays) {
      existing.deliveryDays.push(shipping.totalDeliveryDays)
    }

    const risk = shipping?.riskToSellerMetrics || 'unknown'
    existing.shippingRisk[risk] = (existing.shippingRisk[risk] || 0) + 1

    for (const blocker of (row.blockers || []) as string[]) {
      const key = blocker.split(':')[0]
      existing.issues[key] = (existing.issues[key] || 0) + 1
    }

    typeMap.set(type, existing)
  }

  return Array.from(typeMap.entries()).map(([type, stats]) => ({
    fulfillmentType: type,
    totalValidated: stats.total,
    passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0,
    avgScore:
      stats.scores.length > 0
        ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
        : 0,
    avgDeliveryDays:
      stats.deliveryDays.length > 0
        ? Math.round(
            (stats.deliveryDays.reduce((a, b) => a + b, 0) / stats.deliveryDays.length) * 10
          ) / 10
        : 0,
    shippingRiskDistribution: stats.shippingRisk,
    topIssues: Object.entries(stats.issues)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue, count]) => ({ issue, count })),
  }))
}

// =============================================================================
// SCALE TARGET TRACKING
// =============================================================================

export interface ScaleTargetStatus {
  target: {
    productsPerMonth: number
    uniqueProductsRequired: number
    usersSupported: number
  }
  current: {
    productsPerMonth: number
    uniqueProductsActive: number
    activeUsers: number
  }
  progress: {
    throughputPercent: number
    onTrackForTarget: boolean
    daysToTarget: number | null
    bottlenecks: string[]
  }
  recommendations: string[]
}

export async function getScaleTargetStatus(): Promise<ScaleTargetStatus> {
  const metrics = await calculatePipelineMetrics(24 * 30) // Last 30 days

  // Target: 150k products/month, 10k users, 6 users per product
  const targetProductsPerMonth = 150000
  const targetUsers = 10000
  const usersPerProduct = 6
  const uniqueProductsRequired = Math.ceil(targetProductsPerMonth / usersPerProduct)

  // Get current active products and users
  const { count: activeProducts } = await supabase
    .from('skus')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ready')

  const { count: activeUsers } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  const currentThroughput = metrics.throughput.productsPerMonth
  const throughputPercent = Math.round((currentThroughput / targetProductsPerMonth) * 100)

  // Calculate days to target
  let daysToTarget: number | null = null
  if (currentThroughput > 0 && currentThroughput < targetProductsPerMonth) {
    const gap = targetProductsPerMonth - currentThroughput
    const dailyRate = currentThroughput / 30
    // Assuming 10% improvement per month
    const improvementRate = 0.1
    daysToTarget = Math.ceil(gap / (dailyRate * improvementRate * 30))
  } else if (currentThroughput >= targetProductsPerMonth) {
    daysToTarget = 0
  }

  // Collect bottlenecks
  const bottlenecks = metrics.capacity.bottlenecks
    .filter((b) => b.severity === 'high' || b.severity === 'critical')
    .map((b) => b.description)

  // Generate recommendations
  const recommendations: string[] = []

  if (throughputPercent < 50) {
    recommendations.push('Scale validation infrastructure significantly to meet targets')
  }

  if (metrics.quality.cassiniComplianceRate < 80) {
    recommendations.push('Improve Cassini compliance rate by sourcing better suppliers')
  }

  if (metrics.stages.supplierValidation.passRate < 60) {
    recommendations.push('Refine product discovery to improve validation pass rates')
  }

  if ((activeProducts || 0) < uniqueProductsRequired * 0.5) {
    recommendations.push('Accelerate unique product discovery')
  }

  return {
    target: {
      productsPerMonth: targetProductsPerMonth,
      uniqueProductsRequired,
      usersSupported: targetUsers,
    },
    current: {
      productsPerMonth: currentThroughput,
      uniqueProductsActive: activeProducts || 0,
      activeUsers: activeUsers || 0,
    },
    progress: {
      throughputPercent,
      onTrackForTarget: throughputPercent >= 80 || daysToTarget === 0,
      daysToTarget,
      bottlenecks,
    },
    recommendations,
  }
}
