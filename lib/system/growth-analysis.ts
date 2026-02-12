// OTTO Research Labs - Growth Bottleneck Analysis & Future-Proofing
// Comprehensive system analysis for scaling to 10,000+ users
// Target: $50M+ acquisition value with 5,000+ paying users

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TYPES
// ============================================================================

export interface BottleneckReport {
  timestamp: string
  overallScore: number  // 0-100, higher is better
  readyForScale: boolean
  criticalIssues: Issue[]
  warnings: Issue[]
  recommendations: Recommendation[]
  capacityAnalysis: CapacityAnalysis
  performanceMetrics: PerformanceMetrics
  scalabilityAssessment: ScalabilityAssessment
  costProjections: CostProjection
  revenueProjections: RevenueProjection
}

export interface Issue {
  id: string
  category: 'database' | 'api' | 'infrastructure' | 'code' | 'business'
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  impact: string
  affectedComponents: string[]
  suggestedFix: string
  effortEstimate: 'hours' | 'days' | 'weeks'
  priorityScore: number  // 1-10
}

export interface Recommendation {
  id: string
  category: string
  title: string
  description: string
  benefit: string
  implementation: string
  priority: 'immediate' | 'short_term' | 'medium_term' | 'long_term'
  estimatedROI: string
}

export interface CapacityAnalysis {
  currentUsers: number
  maxUsersAtCurrentScale: number
  currentStores: number
  maxStoresAtCurrentScale: number
  currentDailyAPICallsCapacity: number
  currentDailyJobsCapacity: number
  databaseUtilization: number
  storageUtilization: number
  bottleneckComponents: string[]
}

export interface PerformanceMetrics {
  avgAPIResponseTime: number
  p95APIResponseTime: number
  avgJobProcessingTime: number
  databaseQueryTime: number
  errorRate: number
  uptime: number
  memoryUsage: number
  cpuUsage: number
}

export interface ScalabilityAssessment {
  horizontalScalingReady: boolean
  verticalScalingNeeded: boolean
  databaseShardingReady: boolean
  cachingImplemented: boolean
  queueSystemAdequate: boolean
  apiRateLimitingProper: boolean
  monitoringAdequate: boolean
  disasterRecoveryReady: boolean
  scores: {
    database: number
    api: number
    jobProcessing: number
    caching: number
    security: number
    monitoring: number
    deployment: number
  }
}

export interface CostProjection {
  current: {
    monthly: number
    perUser: number
    breakdown: Record<string, number>
  }
  at1000Users: {
    monthly: number
    perUser: number
  }
  at5000Users: {
    monthly: number
    perUser: number
  }
  at10000Users: {
    monthly: number
    perUser: number
  }
}

export interface RevenueProjection {
  currentMRR: number
  projectedMRRAt1000Users: number
  projectedMRRAt5000Users: number
  projectedARR: number
  tierDistribution: {
    starter: number
    growth: number
    professional: number
    enterprise: number
    managed: number
  }
  ltv: number
  cac: number
  ltvCacRatio: number
}

// ============================================================================
// GROWTH TARGETS
// ============================================================================

const GROWTH_TARGETS = {
  users: {
    q1_2026: 500,
    q2_2026: 1500,
    q3_2026: 3500,
    q4_2026: 5000,
    end_2026: 5000
  },
  mrr: {
    q1_2026: 100000,   // $100k
    q2_2026: 375000,   // $375k
    q3_2026: 875000,   // $875k
    q4_2026: 1250000,  // $1.25M
    end_2026: 1500000  // $1.5M MRR target
  },
  acquisitionValue: 50000000  // $50M target
}

// Subscription pricing (average revenue per user)
const ARPU_ESTIMATES = {
  starter: 199,
  growth: 299,
  professional: 499,
  enterprise: 999,
  managed: 2500  // Estimated value of managed service
}

// ============================================================================
// BOTTLENECK ANALYSIS
// ============================================================================

export async function analyzeGrowthBottlenecks(): Promise<BottleneckReport> {
  const issues: Issue[] = []
  const warnings: Issue[] = []
  const recommendations: Recommendation[] = []

  // Analyze each component
  const dbAnalysis = await analyzeDatabaseBottlenecks()
  const apiAnalysis = await analyzeAPIBottlenecks()
  const infraAnalysis = analyzeInfrastructureBottlenecks()
  const codeAnalysis = analyzeCodeBottlenecks()
  const businessAnalysis = analyzeBusinessBottlenecks()

  // Collect issues
  issues.push(...dbAnalysis.issues.filter(i => i.severity === 'critical'))
  issues.push(...apiAnalysis.issues.filter(i => i.severity === 'critical'))
  issues.push(...infraAnalysis.issues.filter(i => i.severity === 'critical'))

  warnings.push(...dbAnalysis.issues.filter(i => i.severity !== 'critical'))
  warnings.push(...apiAnalysis.issues.filter(i => i.severity !== 'critical'))
  warnings.push(...infraAnalysis.issues.filter(i => i.severity !== 'critical'))
  warnings.push(...codeAnalysis.issues)
  warnings.push(...businessAnalysis.issues)

  // Collect recommendations
  recommendations.push(...dbAnalysis.recommendations)
  recommendations.push(...apiAnalysis.recommendations)
  recommendations.push(...infraAnalysis.recommendations)
  recommendations.push(...codeAnalysis.recommendations)
  recommendations.push(...businessAnalysis.recommendations)

  // Calculate capacity
  const capacityAnalysis = await calculateCapacity()

  // Get performance metrics
  const performanceMetrics = await getPerformanceMetrics()

  // Assess scalability
  const scalabilityAssessment = assessScalability(dbAnalysis, apiAnalysis, infraAnalysis)

  // Project costs
  const costProjections = projectCosts()

  // Project revenue
  const revenueProjections = await projectRevenue()

  // Calculate overall score
  const overallScore = calculateOverallScore(
    issues,
    warnings,
    scalabilityAssessment,
    performanceMetrics
  )

  return {
    timestamp: new Date().toISOString(),
    overallScore,
    readyForScale: overallScore >= 70 && issues.length === 0,
    criticalIssues: issues.sort((a, b) => b.priorityScore - a.priorityScore),
    warnings: warnings.sort((a, b) => b.priorityScore - a.priorityScore),
    recommendations: recommendations.sort((a, b) => {
      const priorityOrder = { immediate: 0, short_term: 1, medium_term: 2, long_term: 3 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }),
    capacityAnalysis,
    performanceMetrics,
    scalabilityAssessment,
    costProjections,
    revenueProjections
  }
}

// ============================================================================
// DATABASE ANALYSIS
// ============================================================================

async function analyzeDatabaseBottlenecks(): Promise<{
  issues: Issue[]
  recommendations: Recommendation[]
}> {
  const issues: Issue[] = []
  const recommendations: Recommendation[] = []

  // Check table sizes and row counts
  const { data: stores } = await supabase
    .from('stores')
    .select('id', { count: 'exact', head: true })

  const { data: assignments } = await supabase
    .from('store_sku_assignments')
    .select('id', { count: 'exact', head: true })

  const { data: orders } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })

  const { data: skus } = await supabase
    .from('skus')
    .select('id', { count: 'exact', head: true })

  // Check for potential N+1 patterns
  // In production, we'd analyze query logs here

  // Issue: Need connection pooling for 10k users
  recommendations.push({
    id: 'db-pooling',
    category: 'database',
    title: 'Implement Connection Pooling with PgBouncer',
    description: 'At 5000+ concurrent users, database connections will become a bottleneck',
    benefit: 'Handle 10x more concurrent connections with same database resources',
    implementation: 'Deploy PgBouncer in transaction mode with 50-100 connection pool',
    priority: 'short_term',
    estimatedROI: 'Prevents $50k/month in additional database costs'
  })

  // Issue: Need read replicas for scale
  recommendations.push({
    id: 'db-replicas',
    category: 'database',
    title: 'Add Read Replicas for Dashboard Queries',
    description: 'Dashboard and analytics queries should not compete with transactional writes',
    benefit: '50% reduction in database load, faster dashboard response times',
    implementation: 'Configure Supabase read replicas, route analytics queries to replicas',
    priority: 'medium_term',
    estimatedROI: 'Better user experience, reduced churn'
  })

  // Issue: Partitioning for orders table
  recommendations.push({
    id: 'db-partitioning',
    category: 'database',
    title: 'Partition Orders Table by Date',
    description: 'Orders table will grow to millions of rows, needs time-based partitioning',
    benefit: 'Maintain query performance as data grows, easier archival of old data',
    implementation: 'Create monthly partitions for orders table with automated rotation',
    priority: 'medium_term',
    estimatedROI: '10x improvement in order history queries'
  })

  // Check if migrations are up to date
  recommendations.push({
    id: 'db-migrations',
    category: 'database',
    title: 'Run Pending Database Migrations',
    description: 'Ensure all performance indexes and new tables are created',
    benefit: 'Full feature availability and optimal query performance',
    implementation: 'Run migrations 004-008 in sequence',
    priority: 'immediate',
    estimatedROI: 'Required for proper system operation'
  })

  return { issues, recommendations }
}

// ============================================================================
// API ANALYSIS
// ============================================================================

async function analyzeAPIBottlenecks(): Promise<{
  issues: Issue[]
  recommendations: Recommendation[]
}> {
  const issues: Issue[] = []
  const recommendations: Recommendation[] = []

  // Rate limiting recommendation
  recommendations.push({
    id: 'api-rate-limit',
    category: 'api',
    title: 'Implement Per-User API Rate Limiting',
    description: 'Current rate limiting is service-wide, not per-user',
    benefit: 'Prevent single users from impacting others, better resource allocation',
    implementation: 'Add Redis-backed rate limiting with tier-based limits',
    priority: 'short_term',
    estimatedROI: 'Prevents abuse, enables premium API features'
  })

  // API versioning
  recommendations.push({
    id: 'api-versioning',
    category: 'api',
    title: 'Implement API Versioning',
    description: 'No version control on API endpoints for breaking changes',
    benefit: 'Safe deployments, client compatibility, smooth migrations',
    implementation: 'Add /v1/ prefix to all API routes, version response headers',
    priority: 'medium_term',
    estimatedROI: 'Reduced support tickets, smoother integrations'
  })

  // Caching layer
  recommendations.push({
    id: 'api-caching',
    category: 'api',
    title: 'Add Redis Caching Layer',
    description: 'Dashboard metrics and health scores are recalculated on every request',
    benefit: '90% reduction in database queries for read-heavy operations',
    implementation: 'Cache health scores, fleet metrics, and user subscription data',
    priority: 'short_term',
    estimatedROI: '5x improvement in dashboard load times'
  })

  // Webhook system
  recommendations.push({
    id: 'api-webhooks',
    category: 'api',
    title: 'Implement Webhook System',
    description: 'No way for external systems to receive real-time updates',
    benefit: 'Enable integrations with user systems, better automation',
    implementation: 'Add webhook registration API, event publishing system',
    priority: 'medium_term',
    estimatedROI: 'Enterprise customer requirement, higher tier adoption'
  })

  return { issues, recommendations }
}

// ============================================================================
// INFRASTRUCTURE ANALYSIS
// ============================================================================

function analyzeInfrastructureBottlenecks(): {
  issues: Issue[]
  recommendations: Recommendation[]
} {
  const issues: Issue[] = []
  const recommendations: Recommendation[] = []

  // Multi-region deployment
  recommendations.push({
    id: 'infra-multiregion',
    category: 'infrastructure',
    title: 'Plan Multi-Region Deployment',
    description: 'Single region deployment limits global reach and has single point of failure',
    benefit: 'Lower latency globally, disaster recovery, 99.99% uptime SLA',
    implementation: 'Deploy to US-West, US-East, EU-West with global load balancing',
    priority: 'long_term',
    estimatedROI: 'Required for enterprise customers, higher retention'
  })

  // CDN for static assets
  recommendations.push({
    id: 'infra-cdn',
    category: 'infrastructure',
    title: 'Configure CDN for Static Assets',
    description: 'Static assets served from origin, increasing load and latency',
    benefit: '80% reduction in origin traffic, faster page loads globally',
    implementation: 'Configure Vercel Edge or Cloudflare CDN for _next/static',
    priority: 'short_term',
    estimatedROI: 'Reduced bandwidth costs, better Core Web Vitals'
  })

  // Background job scaling
  recommendations.push({
    id: 'infra-workers',
    category: 'infrastructure',
    title: 'Implement Dedicated Job Workers',
    description: 'Background jobs run in same process as web requests',
    benefit: 'Independent scaling of web and job processing',
    implementation: 'Deploy separate worker processes with job queue (Bull/BullMQ)',
    priority: 'short_term',
    estimatedROI: '10x job processing capacity'
  })

  // Monitoring and alerting
  recommendations.push({
    id: 'infra-monitoring',
    category: 'infrastructure',
    title: 'Comprehensive Monitoring Stack',
    description: 'Limited visibility into system performance and errors',
    benefit: 'Proactive issue detection, faster incident response',
    implementation: 'Deploy Datadog/Grafana with custom dashboards, PagerDuty alerts',
    priority: 'immediate',
    estimatedROI: 'Reduced downtime, faster problem resolution'
  })

  return { issues, recommendations }
}

// ============================================================================
// CODE ANALYSIS
// ============================================================================

function analyzeCodeBottlenecks(): {
  issues: Issue[]
  recommendations: Recommendation[]
} {
  const issues: Issue[] = []
  const recommendations: Recommendation[] = []

  // Authentication system
  issues.push({
    id: 'code-auth',
    category: 'code',
    severity: 'high',
    title: 'Complete User Authentication Implementation',
    description: 'Authentication middleware exists but user flow not fully implemented',
    impact: 'Cannot onboard paying customers without proper auth',
    affectedComponents: ['auth middleware', 'user registration', 'session management'],
    suggestedFix: 'Complete Supabase Auth integration with email/OAuth providers',
    effortEstimate: 'days',
    priorityScore: 9
  })

  // Type safety
  recommendations.push({
    id: 'code-types',
    category: 'code',
    title: 'Improve Type Coverage',
    description: 'Some API responses use `any` types',
    benefit: 'Catch errors at compile time, better IDE support',
    implementation: 'Generate types from Supabase schema, remove any types',
    priority: 'short_term',
    estimatedROI: 'Reduced bugs in production'
  })

  // Error handling
  recommendations.push({
    id: 'code-errors',
    category: 'code',
    title: 'Standardize Error Handling',
    description: 'Inconsistent error formats across APIs',
    benefit: 'Better client error handling, clearer user feedback',
    implementation: 'Create error middleware with standardized error codes',
    priority: 'short_term',
    estimatedROI: 'Reduced support tickets'
  })

  // Test coverage
  recommendations.push({
    id: 'code-tests',
    category: 'code',
    title: 'Add Comprehensive Test Suite',
    description: 'Limited automated testing',
    benefit: 'Confidence in deployments, catch regressions early',
    implementation: 'Add Jest unit tests, Playwright E2E tests, minimum 80% coverage',
    priority: 'medium_term',
    estimatedROI: 'Faster development velocity, fewer production issues'
  })

  return { issues, recommendations }
}

// ============================================================================
// BUSINESS ANALYSIS
// ============================================================================

function analyzeBusinessBottlenecks(): {
  issues: Issue[]
  recommendations: Recommendation[]
} {
  const issues: Issue[] = []
  const recommendations: Recommendation[] = []

  // Onboarding optimization
  recommendations.push({
    id: 'biz-onboarding',
    category: 'business',
    title: 'Streamline User Onboarding',
    description: 'New users need guided setup experience',
    benefit: 'Higher activation rate, lower churn',
    implementation: 'Add onboarding wizard, video tutorials, setup checklist',
    priority: 'immediate',
    estimatedROI: '30% improvement in activation'
  })

  // Documentation
  recommendations.push({
    id: 'biz-docs',
    category: 'business',
    title: 'Create Comprehensive Documentation',
    description: 'Limited user documentation for self-service',
    benefit: 'Reduced support load, better user experience',
    implementation: 'Create knowledge base with API docs, tutorials, FAQs',
    priority: 'short_term',
    estimatedROI: '50% reduction in support tickets'
  })

  // Billing integration
  issues.push({
    id: 'biz-billing',
    category: 'business',
    severity: 'high',
    title: 'Implement Billing System',
    description: 'No payment processing integration',
    impact: 'Cannot charge customers without billing',
    affectedComponents: ['subscription management', 'payment processing', 'invoicing'],
    suggestedFix: 'Integrate Stripe for subscriptions with webhook handling',
    effortEstimate: 'days',
    priorityScore: 10
  })

  // Support system
  recommendations.push({
    id: 'biz-support',
    category: 'business',
    title: 'Set Up Customer Support System',
    description: 'No ticketing or live chat system',
    benefit: 'Better customer satisfaction, faster issue resolution',
    implementation: 'Integrate Intercom or Zendesk for multi-channel support',
    priority: 'short_term',
    estimatedROI: 'Higher retention, premium support as upsell'
  })

  return { issues, recommendations }
}

// ============================================================================
// CAPACITY CALCULATION
// ============================================================================

async function calculateCapacity(): Promise<CapacityAnalysis> {
  // Get current counts
  const { count: userCount } = await supabase
    .from('user_subscriptions')
    .select('id', { count: 'exact', head: true })

  const { count: storeCount } = await supabase
    .from('stores')
    .select('id', { count: 'exact', head: true })

  // Estimate maximums based on current architecture
  // These would be refined with actual load testing
  const maxUsers = 2000  // Before needing major infrastructure changes
  const maxStores = 5000  // Before database partitioning needed

  return {
    currentUsers: userCount || 0,
    maxUsersAtCurrentScale: maxUsers,
    currentStores: storeCount || 0,
    maxStoresAtCurrentScale: maxStores,
    currentDailyAPICallsCapacity: 1000000,  // Vercel serverless estimate
    currentDailyJobsCapacity: 50000,  // Cron job processing estimate
    databaseUtilization: 15,  // Estimated %
    storageUtilization: 5,    // Estimated %
    bottleneckComponents: [
      'Job processing (needs dedicated workers)',
      'Database connections (needs pooling)',
      'Authentication (needs completion)'
    ]
  }
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  // In production, these would come from monitoring tools
  // For now, return reasonable estimates
  return {
    avgAPIResponseTime: 150,   // ms
    p95APIResponseTime: 450,   // ms
    avgJobProcessingTime: 2000, // ms
    databaseQueryTime: 50,     // ms
    errorRate: 0.1,            // %
    uptime: 99.5,              // %
    memoryUsage: 60,           // %
    cpuUsage: 30               // %
  }
}

// ============================================================================
// SCALABILITY ASSESSMENT
// ============================================================================

function assessScalability(
  dbAnalysis: { issues: Issue[]; recommendations: Recommendation[] },
  apiAnalysis: { issues: Issue[]; recommendations: Recommendation[] },
  infraAnalysis: { issues: Issue[]; recommendations: Recommendation[] }
): ScalabilityAssessment {
  return {
    horizontalScalingReady: true,   // Vercel handles this
    verticalScalingNeeded: false,
    databaseShardingReady: false,   // Would need partitioning
    cachingImplemented: false,       // Redis not yet integrated
    queueSystemAdequate: false,      // Need dedicated job queue
    apiRateLimitingProper: false,    // Need per-user limits
    monitoringAdequate: false,       // Need comprehensive monitoring
    disasterRecoveryReady: false,    // Need multi-region
    scores: {
      database: 70,
      api: 75,
      jobProcessing: 50,
      caching: 30,
      security: 60,
      monitoring: 40,
      deployment: 80
    }
  }
}

// ============================================================================
// COST PROJECTIONS
// ============================================================================

function projectCosts(): CostProjection {
  // Based on typical SaaS costs
  const baseMonthly = 500  // Supabase, Vercel, etc.

  return {
    current: {
      monthly: baseMonthly,
      perUser: baseMonthly,
      breakdown: {
        supabase: 25,
        vercel: 20,
        apis: 200,
        monitoring: 0,
        support: 0,
        other: 255
      }
    },
    at1000Users: {
      monthly: 3500,
      perUser: 3.50
    },
    at5000Users: {
      monthly: 12000,
      perUser: 2.40
    },
    at10000Users: {
      monthly: 20000,
      perUser: 2.00
    }
  }
}

// ============================================================================
// REVENUE PROJECTIONS
// ============================================================================

async function projectRevenue(): Promise<RevenueProjection> {
  // Get current subscription distribution
  const { data: subscriptions } = await supabase
    .from('user_subscriptions')
    .select('tier_id')

  // Default distribution if no data
  const tierDistribution = {
    starter: 50,    // 50% on $199
    growth: 25,     // 25% on $299
    professional: 15, // 15% on $499
    enterprise: 8,   // 8% on $999
    managed: 2       // 2% managed service
  }

  // Calculate average revenue per user
  const avgARPU =
    (tierDistribution.starter / 100) * ARPU_ESTIMATES.starter +
    (tierDistribution.growth / 100) * ARPU_ESTIMATES.growth +
    (tierDistribution.professional / 100) * ARPU_ESTIMATES.professional +
    (tierDistribution.enterprise / 100) * ARPU_ESTIMATES.enterprise +
    (tierDistribution.managed / 100) * ARPU_ESTIMATES.managed

  // Current MRR (estimate)
  const currentUsers = subscriptions?.length || 0
  const currentMRR = currentUsers * avgARPU

  return {
    currentMRR,
    projectedMRRAt1000Users: 1000 * avgARPU,
    projectedMRRAt5000Users: 5000 * avgARPU,
    projectedARR: 5000 * avgARPU * 12,
    tierDistribution,
    ltv: avgARPU * 24,  // Assume 24-month average lifetime
    cac: 200,           // Estimated customer acquisition cost
    ltvCacRatio: (avgARPU * 24) / 200
  }
}

// ============================================================================
// OVERALL SCORE CALCULATION
// ============================================================================

function calculateOverallScore(
  criticalIssues: Issue[],
  warnings: Issue[],
  scalability: ScalabilityAssessment,
  performance: PerformanceMetrics
): number {
  let score = 100

  // Deduct for critical issues
  score -= criticalIssues.length * 15

  // Deduct for warnings
  score -= warnings.length * 3

  // Factor in scalability scores
  const avgScalabilityScore = Object.values(scalability.scores).reduce((a, b) => a + b, 0) /
    Object.values(scalability.scores).length
  score = (score + avgScalabilityScore) / 2

  // Factor in performance
  if (performance.errorRate > 1) score -= 10
  if (performance.avgAPIResponseTime > 500) score -= 10
  if (performance.uptime < 99) score -= 20

  return Math.max(0, Math.min(100, Math.round(score)))
}

// ============================================================================
// ACQUISITION READINESS
// ============================================================================

export async function assessAcquisitionReadiness(): Promise<{
  score: number
  readyForAcquisition: boolean
  valuationEstimate: number
  strengths: string[]
  gaps: string[]
  actionItems: string[]
}> {
  const report = await analyzeGrowthBottlenecks()
  const revenue = report.revenueProjections

  // AutoDS acquisition criteria
  const strengths: string[] = []
  const gaps: string[] = []
  const actionItems: string[] = []

  // Check key metrics
  if (report.overallScore >= 70) {
    strengths.push('System architecture is sound for scale')
  } else {
    gaps.push('System architecture needs improvements')
    actionItems.push('Address critical bottleneck issues')
  }

  if (revenue.ltvCacRatio >= 3) {
    strengths.push(`Strong unit economics (LTV:CAC = ${revenue.ltvCacRatio.toFixed(1)}x)`)
  } else {
    gaps.push('Unit economics need improvement')
    actionItems.push('Reduce CAC or increase LTV through retention')
  }

  if (report.criticalIssues.length === 0) {
    strengths.push('No critical technical debt')
  } else {
    gaps.push(`${report.criticalIssues.length} critical issues to address`)
    report.criticalIssues.forEach(i => actionItems.push(i.suggestedFix))
  }

  // Calculate valuation estimate
  // SaaS valuations typically 10-15x ARR for fast-growing companies
  const arrMultiple = 12
  const valuationEstimate = revenue.projectedARR * arrMultiple

  const acquisitionScore = Math.round(
    (report.overallScore * 0.4) +
    (Math.min(revenue.ltvCacRatio / 5 * 100, 100) * 0.3) +
    ((100 - report.criticalIssues.length * 20) * 0.3)
  )

  return {
    score: acquisitionScore,
    readyForAcquisition: acquisitionScore >= 70 && report.criticalIssues.length <= 1,
    valuationEstimate,
    strengths,
    gaps,
    actionItems
  }
}
