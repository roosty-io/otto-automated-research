// OTTO Research Labs - Compliance Service
// Comprehensive compliance checking with audit trails and market analysis

import { createClient } from '@supabase/supabase-js'
import {
  checkPolicy,
  PolicyCheckResult,
  PolicyCheckInput,
  checkForVeroBrands,
  checkForBlacklistedWords,
  checkForRestrictedCategories
} from '@/lib/policy'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TYPES
// ============================================================================

export interface ComplianceCheckRequest {
  skuId?: string
  storeId?: string
  title: string
  description?: string
  category?: string
  bulletPoints?: string[]
  costPrice?: number
  sellPrice?: number
  sourceUrl?: string
  marketPrice?: number  // Average market price for comparison
  competitorPrices?: number[]  // Array of competitor prices
}

export interface ComplianceViolation {
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  field: string
  message: string
  matched: string
  actionRequired: string
  autoFixable: boolean
  suggestedFix?: string
}

export interface ComplianceResult {
  id: string
  timestamp: string
  passed: boolean
  score: number
  decision: 'approved' | 'blocked' | 'review_required' | 'auto_fixed'
  violations: ComplianceViolation[]
  riskLevel: 'safe' | 'low_risk' | 'medium_risk' | 'high_risk' | 'critical'
  policyDetails: PolicyCheckResult
  priceAnalysis?: PriceComplianceResult
  recommendations: string[]
  auditTrail: {
    checkType: string[]
    duration: number
    version: string
  }
}

export interface PriceComplianceResult {
  isGouging: boolean
  markupPercentage: number
  marketComparison: {
    averageMarketPrice: number
    priceDeviation: number  // Percentage deviation from market
    competitorCount: number
  } | null
  sustainableMargin: boolean
  warnings: string[]
}

export interface ComplianceStats {
  totalChecks: number
  passed: number
  blocked: number
  reviewRequired: number
  topViolations: Array<{ type: string; count: number }>
  averageScore: number
  checksByDay: Array<{ date: string; count: number; passRate: number }>
}

// ============================================================================
// PRICE GOUGING DETECTION
// ============================================================================

export function analyzePricing(
  costPrice: number,
  sellPrice: number,
  marketPrice?: number,
  competitorPrices?: number[]
): PriceComplianceResult {
  const warnings: string[] = []
  const markupPercentage = ((sellPrice - costPrice) / costPrice) * 100

  // Basic gouging check (5x or more markup)
  let isGouging = markupPercentage >= 400  // 5x = 400% markup

  // Check against market if data available
  let marketComparison: PriceComplianceResult['marketComparison'] = null

  if (marketPrice && marketPrice > 0) {
    const priceDeviation = ((sellPrice - marketPrice) / marketPrice) * 100

    marketComparison = {
      averageMarketPrice: marketPrice,
      priceDeviation,
      competitorCount: competitorPrices?.length || 0
    }

    // If price is 50% or more above market average, flag as gouging
    if (priceDeviation >= 50) {
      isGouging = true
      warnings.push(`Price is ${priceDeviation.toFixed(0)}% above market average ($${marketPrice.toFixed(2)})`)
    }

    // If price is significantly below market, warn about potential issues
    if (priceDeviation <= -40) {
      warnings.push(`Price is ${Math.abs(priceDeviation).toFixed(0)}% below market - verify supplier legitimacy`)
    }
  }

  // Check if margin is sustainable after eBay fees
  // eBay fees: ~13% final value + payment processing ~3%
  const effectiveFees = sellPrice * 0.16
  const netProfit = sellPrice - costPrice - effectiveFees
  const sustainableMargin = netProfit > 0 && (netProfit / sellPrice) >= 0.10  // At least 10% net

  if (!sustainableMargin) {
    warnings.push(`Net margin after fees is ${((netProfit / sellPrice) * 100).toFixed(1)}% - consider raising price`)
  }

  // Additional markup checks
  if (markupPercentage < 20) {
    warnings.push('Markup below 20% - thin margin after fees')
  }

  if (markupPercentage >= 200 && markupPercentage < 400) {
    warnings.push(`High markup (${markupPercentage.toFixed(0)}%) - may attract buyer complaints`)
  }

  return {
    isGouging,
    markupPercentage,
    marketComparison,
    sustainableMargin,
    warnings
  }
}

// ============================================================================
// ENHANCED COMPLIANCE CHECK
// ============================================================================

export async function performComplianceCheck(
  request: ComplianceCheckRequest
): Promise<ComplianceResult> {
  const startTime = Date.now()
  const checkTypes: string[] = []

  // Run base policy check
  const policyInput: PolicyCheckInput = {
    title: request.title,
    description: request.description,
    category: request.category,
    bulletPoints: request.bulletPoints,
    costPrice: request.costPrice,
    sellPrice: request.sellPrice
  }

  const policyResult = checkPolicy(policyInput)
  checkTypes.push('vero_brands', 'blacklisted_words', 'restricted_categories', 'title_format')

  // Convert policy flags to compliance violations
  const violations: ComplianceViolation[] = policyResult.flags.map(flag => ({
    type: flag.type,
    severity: mapSeverity(flag.severity),
    field: flag.field,
    message: flag.message,
    matched: flag.matched,
    actionRequired: getActionRequired(flag.type, flag.severity),
    autoFixable: isAutoFixable(flag.type),
    suggestedFix: getSuggestedFix(flag)
  }))

  // Price analysis
  let priceAnalysis: PriceComplianceResult | undefined
  if (request.costPrice !== undefined && request.sellPrice !== undefined) {
    priceAnalysis = analyzePricing(
      request.costPrice,
      request.sellPrice,
      request.marketPrice,
      request.competitorPrices
    )
    checkTypes.push('price_analysis')

    // Add price-related violations
    if (priceAnalysis.isGouging) {
      violations.push({
        type: 'price_gouging',
        severity: 'high',
        field: 'price',
        message: 'Potential price gouging detected',
        matched: `${priceAnalysis.markupPercentage.toFixed(0)}% markup`,
        actionRequired: 'Review pricing strategy and adjust to market rates',
        autoFixable: false
      })
    }

    if (!priceAnalysis.sustainableMargin) {
      violations.push({
        type: 'low_margin',
        severity: 'medium',
        field: 'price',
        message: 'Unsustainable profit margin',
        matched: `Net margin too low`,
        actionRequired: 'Increase sell price or find lower cost supplier',
        autoFixable: false
      })
    }
  }

  // Calculate overall risk level
  const riskLevel = calculateRiskLevel(violations, policyResult.score)

  // Determine final decision
  let decision: ComplianceResult['decision'] = policyResult.decision
  if (riskLevel === 'critical') {
    decision = 'blocked'
  }

  // Generate comprehensive recommendations
  const recommendations = [
    ...policyResult.recommendations,
    ...(priceAnalysis?.warnings || [])
  ]

  const duration = Date.now() - startTime

  const result: ComplianceResult = {
    id: generateComplianceId(),
    timestamp: new Date().toISOString(),
    passed: decision === 'approved',
    score: policyResult.score,
    decision,
    violations,
    riskLevel,
    policyDetails: policyResult,
    priceAnalysis,
    recommendations,
    auditTrail: {
      checkType: checkTypes,
      duration,
      version: '2.0.0'
    }
  }

  // Log to database if SKU or store provided
  if (request.skuId || request.storeId) {
    await logComplianceCheck(request, result)
  }

  return result
}

// ============================================================================
// BATCH COMPLIANCE CHECK
// ============================================================================

export async function batchComplianceCheck(
  requests: ComplianceCheckRequest[],
  options: {
    stopOnBlock?: boolean
    maxConcurrent?: number
    progressCallback?: (completed: number, total: number) => void
  } = {}
): Promise<{
  results: ComplianceResult[]
  summary: {
    total: number
    passed: number
    blocked: number
    reviewRequired: number
    averageScore: number
  }
}> {
  const { stopOnBlock = false, maxConcurrent = 10, progressCallback } = options
  const results: ComplianceResult[] = []
  let completed = 0

  // Process in batches
  for (let i = 0; i < requests.length; i += maxConcurrent) {
    const batch = requests.slice(i, i + maxConcurrent)
    const batchResults = await Promise.all(
      batch.map(req => performComplianceCheck(req))
    )

    for (const result of batchResults) {
      results.push(result)
      completed++

      if (progressCallback) {
        progressCallback(completed, requests.length)
      }

      if (stopOnBlock && result.decision === 'blocked') {
        return {
          results,
          summary: calculateSummary(results)
        }
      }
    }
  }

  return {
    results,
    summary: calculateSummary(results)
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

async function logComplianceCheck(
  request: ComplianceCheckRequest,
  result: ComplianceResult
): Promise<void> {
  try {
    const { error } = await supabase.from('compliance_checks').insert({
      sku_id: request.skuId,
      store_id: request.storeId,
      check_type: 'full_compliance',
      status: result.decision === 'approved' ? 'passed' :
              result.decision === 'blocked' ? 'failed' : 'warning',
      details: {
        score: result.score,
        riskLevel: result.riskLevel,
        violationCount: result.violations.length,
        violations: result.violations,
        priceAnalysis: result.priceAnalysis,
        recommendations: result.recommendations,
        auditTrail: result.auditTrail
      }
    })

    if (error) {
      console.error('Failed to log compliance check:', error)
    }
  } catch (err) {
    console.error('Compliance logging error:', err)
  }
}

export async function getComplianceHistory(
  filters: {
    skuId?: string
    storeId?: string
    status?: 'passed' | 'failed' | 'warning'
    startDate?: string
    endDate?: string
    limit?: number
  }
): Promise<Array<{
  id: string
  skuId: string | null
  storeId: string | null
  checkType: string
  status: string
  details: Record<string, unknown>
  checkedAt: string
}>> {
  let query = supabase
    .from('compliance_checks')
    .select('*')
    .order('checked_at', { ascending: false })

  if (filters.skuId) {
    query = query.eq('sku_id', filters.skuId)
  }
  if (filters.storeId) {
    query = query.eq('store_id', filters.storeId)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.startDate) {
    query = query.gte('checked_at', filters.startDate)
  }
  if (filters.endDate) {
    query = query.lte('checked_at', filters.endDate)
  }
  if (filters.limit) {
    query = query.limit(filters.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('Failed to fetch compliance history:', error)
    return []
  }

  return (data || []).map(row => ({
    id: row.id,
    skuId: row.sku_id,
    storeId: row.store_id,
    checkType: row.check_type,
    status: row.status,
    details: row.details as Record<string, unknown>,
    checkedAt: row.checked_at
  }))
}

export async function getComplianceStats(
  storeId?: string,
  days: number = 30
): Promise<ComplianceStats> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  let query = supabase
    .from('compliance_checks')
    .select('*')
    .gte('checked_at', startDate.toISOString())

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error || !data) {
    return {
      totalChecks: 0,
      passed: 0,
      blocked: 0,
      reviewRequired: 0,
      topViolations: [],
      averageScore: 0,
      checksByDay: []
    }
  }

  const passed = data.filter(d => d.status === 'passed').length
  const blocked = data.filter(d => d.status === 'failed').length
  const reviewRequired = data.filter(d => d.status === 'warning').length

  // Count violations by type
  const violationCounts: Record<string, number> = {}
  for (const check of data) {
    const violations = (check.details as any)?.violations || []
    for (const v of violations) {
      violationCounts[v.type] = (violationCounts[v.type] || 0) + 1
    }
  }

  const topViolations = Object.entries(violationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }))

  // Calculate average score
  const scores = data
    .map(d => (d.details as any)?.score)
    .filter((s): s is number => typeof s === 'number')
  const averageScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0

  // Group by day
  const byDay: Record<string, { total: number; passed: number }> = {}
  for (const check of data) {
    const day = check.checked_at.split('T')[0]
    if (!byDay[day]) {
      byDay[day] = { total: 0, passed: 0 }
    }
    byDay[day].total++
    if (check.status === 'passed') {
      byDay[day].passed++
    }
  }

  const checksByDay = Object.entries(byDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, stats]) => ({
      date,
      count: stats.total,
      passRate: stats.total > 0 ? (stats.passed / stats.total) * 100 : 0
    }))

  return {
    totalChecks: data.length,
    passed,
    blocked,
    reviewRequired,
    topViolations,
    averageScore,
    checksByDay
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapSeverity(severity: 'block' | 'warn' | 'review'): ComplianceViolation['severity'] {
  switch (severity) {
    case 'block': return 'critical'
    case 'warn': return 'high'
    case 'review': return 'medium'
    default: return 'low'
  }
}

function getActionRequired(type: string, severity: string): string {
  if (severity === 'block') {
    return 'Must be resolved before listing'
  }

  switch (type) {
    case 'vero_brand':
      return 'Remove brand name from listing content'
    case 'blacklisted_word':
      return 'Remove or replace the flagged term'
    case 'restricted_category':
      return 'Verify category compliance or choose different product'
    case 'title_format':
      return 'Fix title formatting issues'
    case 'price_issue':
      return 'Review and adjust pricing'
    default:
      return 'Review and address the issue'
  }
}

function isAutoFixable(type: string): boolean {
  return ['title_format'].includes(type)
}

function getSuggestedFix(flag: { type: string; matched: string; message: string }): string | undefined {
  if (flag.type === 'title_format') {
    if (flag.message.includes('capitalization')) {
      return 'Convert to title case'
    }
    if (flag.message.includes('punctuation')) {
      return 'Remove excessive punctuation'
    }
  }

  if (flag.type === 'vero_brand') {
    return `Remove "${flag.matched}" from the listing`
  }

  return undefined
}

function calculateRiskLevel(
  violations: ComplianceViolation[],
  score: number
): ComplianceResult['riskLevel'] {
  const criticalCount = violations.filter(v => v.severity === 'critical').length
  const highCount = violations.filter(v => v.severity === 'high').length

  if (criticalCount > 0) return 'critical'
  if (highCount >= 2) return 'high_risk'
  if (highCount === 1 || score < 60) return 'medium_risk'
  if (score < 80) return 'low_risk'
  return 'safe'
}

function calculateSummary(results: ComplianceResult[]) {
  const total = results.length
  const passed = results.filter(r => r.passed).length
  const blocked = results.filter(r => r.decision === 'blocked').length
  const reviewRequired = results.filter(r => r.decision === 'review_required').length
  const averageScore = total > 0
    ? results.reduce((sum, r) => sum + r.score, 0) / total
    : 0

  return { total, passed, blocked, reviewRequired, averageScore }
}

function generateComplianceId(): string {
  return `cc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ============================================================================
// TITLE SANITIZER
// ============================================================================

export function sanitizeTitle(title: string): {
  sanitized: string
  changes: string[]
} {
  const changes: string[] = []
  let sanitized = title

  // Check for VeRO brands and remove them
  const veroResult = checkForVeroBrands(title)
  for (const match of veroResult.matches) {
    const regex = new RegExp(`\\b${match.brand}\\b`, 'gi')
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, '').trim()
      changes.push(`Removed VeRO brand: ${match.brand}`)
    }
  }

  // Check for blacklisted words and remove blocked ones
  const wordResult = checkForBlacklistedWords(title)
  for (const match of wordResult.matches) {
    if (match.severity === 'block') {
      const isPhrase = match.word.includes(' ')
      const pattern = isPhrase
        ? match.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : `\\b${match.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
      const regex = new RegExp(pattern, 'gi')
      if (regex.test(sanitized)) {
        sanitized = sanitized.replace(regex, '').trim()
        changes.push(`Removed blocked term: ${match.word}`)
      }
    }
  }

  // Fix excessive capitalization (convert to title case)
  const capsRatio = (sanitized.match(/[A-Z]/g) || []).length /
    sanitized.replace(/[^a-zA-Z]/g, '').length
  if (capsRatio > 0.6 && sanitized.length > 10) {
    sanitized = sanitized
      .toLowerCase()
      .replace(/\b\w/g, char => char.toUpperCase())
    changes.push('Converted to title case')
  }

  // Remove excessive punctuation
  if (/[!?]{2,}|[*]{2,}/.test(sanitized)) {
    sanitized = sanitized
      .replace(/[!]+/g, '!')
      .replace(/[?]+/g, '?')
      .replace(/[*]+/g, '*')
    changes.push('Removed excessive punctuation')
  }

  // Remove special character spam
  sanitized = sanitized.replace(/[@#$%^&*]{2,}/g, '')

  // Clean up extra spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim()

  return { sanitized, changes }
}

// ============================================================================
// EXPORT FOR API
// ============================================================================

export type { ComplianceCheckRequest, ComplianceResult, ComplianceViolation, PriceComplianceResult }
