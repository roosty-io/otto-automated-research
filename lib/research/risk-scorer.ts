/**
 * Product Risk Scoring Module
 *
 * Evaluates products for various risk factors that could lead to:
 * - Account suspension (policy violations)
 * - Returns/complaints
 * - Low profitability
 * - Supply chain issues
 *
 * Lower risk score = safer product
 */

import { supabase } from '../supabase'

// =============================================================================
// TYPES
// =============================================================================

export interface RiskAssessment {
  productId: string
  title: string

  // Overall score (0-100, lower = better)
  overallRiskScore: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'

  // Individual risk categories
  risks: {
    policyCompliance: RiskCategory
    brandRestriction: RiskCategory
    categoryRestriction: RiskCategory
    supplyChain: RiskCategory
    priceVolatility: RiskCategory
    competition: RiskCategory
    seasonality: RiskCategory
    qualityIssues: RiskCategory
  }

  // Blockers (immediate disqualifiers)
  blockers: RiskBlocker[]

  // Warnings (proceed with caution)
  warnings: RiskWarning[]

  // Recommendations
  mitigations: string[]

  assessedAt: string
}

export interface RiskCategory {
  name: string
  score: number // 0-100
  weight: number // How much this contributes to overall
  factors: RiskFactor[]
}

export interface RiskFactor {
  name: string
  detected: boolean
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  description: string
  mitigation?: string
}

export interface RiskBlocker {
  type: string
  reason: string
  severity: 'high' | 'critical'
}

export interface RiskWarning {
  type: string
  reason: string
  severity: 'low' | 'medium'
  recommendation?: string
}

// =============================================================================
// RISK CONFIGURATION
// =============================================================================

// VERO brands (Verified Rights Owner Program) - listing these can result in account suspension
const VERO_BRANDS = new Set([
  'nike', 'adidas', 'apple', 'louis vuitton', 'gucci', 'prada', 'chanel',
  'rolex', 'omega', 'cartier', 'tiffany', 'hermès', 'hermes', 'burberry',
  'versace', 'armani', 'dior', 'fendi', 'valentino', 'balenciaga',
  'supreme', 'off-white', 'yeezy', 'jordan', 'oakley', 'ray-ban',
  'microsoft', 'sony', 'nintendo', 'disney', 'marvel', 'dc comics',
  'pokemon', 'hello kitty', 'sanrio', 'lego', 'mattel', 'hasbro',
  'nfl', 'nba', 'mlb', 'nhl', 'fifa', 'uefa', 'olympics',
])

// High-risk categories on eBay
const HIGH_RISK_CATEGORIES = new Set([
  'health & beauty', 'supplements', 'vitamins', 'medications',
  'weapons', 'knives', 'firearms', 'ammunition',
  'alcohol', 'tobacco', 'vape', 'e-cigarettes',
  'adult', 'mature', 'explicit',
  'counterfeit', 'replica', 'knockoff',
  'food', 'perishable',
  'hazardous materials', 'chemicals',
  'recalled items',
])

// Prohibited terms in listings
const PROHIBITED_TERMS = [
  'replica', 'fake', 'counterfeit', 'knockoff', 'copy', 'imitation',
  'unauthorized', 'bootleg', 'pirated', 'illegal',
  'not authentic', 'not genuine', 'not original',
  'like authentic', 'looks like', 'inspired by',
  'a+ quality', 'aaa quality', '1:1',
]

// Terms suggesting quality issues
const QUALITY_WARNING_TERMS = [
  'as-is', 'for parts', 'not working', 'broken', 'damaged',
  'defective', 'refurbished', 'open box', 'used',
  'scratched', 'dented', 'missing parts',
]

// =============================================================================
// RISK ASSESSMENT
// =============================================================================

export async function assessProductRisk(
  product: {
    id: string
    title: string
    category?: string
    brand?: string
    price?: number
    sourcePrice?: number
    description?: string
    supplierData?: {
      priceVolatility?: number
      stockConfidence?: number
      sellerCount?: number
    }
    competitionData?: {
      totalCompetitors?: number
      competitionLevel?: string
    }
  }
): Promise<RiskAssessment> {
  const risks: RiskAssessment['risks'] = {
    policyCompliance: assessPolicyCompliance(product),
    brandRestriction: assessBrandRestriction(product),
    categoryRestriction: assessCategoryRestriction(product),
    supplyChain: assessSupplyChainRisk(product),
    priceVolatility: assessPriceVolatility(product),
    competition: assessCompetitionRisk(product),
    seasonality: assessSeasonalityRisk(product),
    qualityIssues: assessQualityRisk(product),
  }

  // Calculate overall risk score (weighted average)
  const totalWeight = Object.values(risks).reduce((sum, r) => sum + r.weight, 0)
  const weightedSum = Object.values(risks).reduce((sum, r) => sum + r.score * r.weight, 0)
  const overallRiskScore = Math.round(weightedSum / totalWeight)

  // Determine risk level
  let riskLevel: RiskAssessment['riskLevel']
  if (overallRiskScore >= 75) riskLevel = 'critical'
  else if (overallRiskScore >= 50) riskLevel = 'high'
  else if (overallRiskScore >= 25) riskLevel = 'medium'
  else riskLevel = 'low'

  // Collect blockers and warnings
  const blockers: RiskBlocker[] = []
  const warnings: RiskWarning[] = []

  for (const category of Object.values(risks)) {
    for (const factor of category.factors) {
      if (factor.detected) {
        if (factor.severity === 'critical' || factor.severity === 'high') {
          blockers.push({
            type: factor.name,
            reason: factor.description,
            severity: factor.severity as 'high' | 'critical',
          })
        } else if (factor.severity === 'medium' || factor.severity === 'low') {
          warnings.push({
            type: factor.name,
            reason: factor.description,
            severity: factor.severity as 'low' | 'medium',
            recommendation: factor.mitigation,
          })
        }
      }
    }
  }

  // Generate mitigations
  const mitigations = generateMitigations(risks, blockers, warnings)

  return {
    productId: product.id,
    title: product.title,
    overallRiskScore,
    riskLevel,
    risks,
    blockers,
    warnings,
    mitigations,
    assessedAt: new Date().toISOString(),
  }
}

// =============================================================================
// INDIVIDUAL RISK ASSESSMENTS
// =============================================================================

function assessPolicyCompliance(product: { title: string; description?: string }): RiskCategory {
  const factors: RiskFactor[] = []
  let score = 0

  const textToCheck = `${product.title} ${product.description || ''}`.toLowerCase()

  // Check for prohibited terms
  for (const term of PROHIBITED_TERMS) {
    if (textToCheck.includes(term)) {
      factors.push({
        name: 'prohibited_term',
        detected: true,
        severity: 'critical',
        description: `Contains prohibited term: "${term}"`,
        mitigation: 'Remove prohibited terms from listing',
      })
      score += 25
    }
  }

  // Check for policy violation patterns
  if (textToCheck.match(/\b(free|complimentary)\s+(gift|bonus|sample)\b/i)) {
    factors.push({
      name: 'gift_promotion',
      detected: true,
      severity: 'medium',
      description: 'May violate eBay promotional rules',
      mitigation: 'Review eBay promotional policies',
    })
    score += 10
  }

  return {
    name: 'Policy Compliance',
    score: Math.min(100, score),
    weight: 0.25,
    factors,
  }
}

function assessBrandRestriction(product: { title: string; brand?: string }): RiskCategory {
  const factors: RiskFactor[] = []
  let score = 0

  const textToCheck = `${product.title} ${product.brand || ''}`.toLowerCase()

  // Check for VERO brands
  for (const brand of VERO_BRANDS) {
    if (textToCheck.includes(brand)) {
      factors.push({
        name: 'vero_brand',
        detected: true,
        severity: 'critical',
        description: `Contains VERO brand: "${brand}" - high risk of takedown`,
        mitigation: 'Avoid listing unless you are an authorized reseller',
      })
      score += 40
      break // One VERO brand is enough to flag
    }
  }

  // Check for "compatible with" claims
  if (textToCheck.match(/compatible\s+(with|for)\s+\w+/i)) {
    factors.push({
      name: 'compatibility_claim',
      detected: true,
      severity: 'low',
      description: 'Compatibility claims may require verification',
      mitigation: 'Ensure compatibility claims are accurate',
    })
    score += 5
  }

  return {
    name: 'Brand Restriction',
    score: Math.min(100, score),
    weight: 0.25,
    factors,
  }
}

function assessCategoryRestriction(product: { category?: string; title: string }): RiskCategory {
  const factors: RiskFactor[] = []
  let score = 0

  const categoryLower = (product.category || '').toLowerCase()
  const titleLower = product.title.toLowerCase()

  // Check for high-risk categories
  for (const riskyCategory of HIGH_RISK_CATEGORIES) {
    if (categoryLower.includes(riskyCategory) || titleLower.includes(riskyCategory)) {
      factors.push({
        name: 'high_risk_category',
        detected: true,
        severity: 'high',
        description: `Product may fall into restricted category: "${riskyCategory}"`,
        mitigation: 'Verify category requirements and seller qualifications',
      })
      score += 30
      break
    }
  }

  // Check for age-restricted products
  if (titleLower.match(/\b(21\+|18\+|adults?\s+only|mature)\b/i)) {
    factors.push({
      name: 'age_restricted',
      detected: true,
      severity: 'medium',
      description: 'Age-restricted product requires special handling',
      mitigation: 'Ensure proper age verification processes',
    })
    score += 15
  }

  return {
    name: 'Category Restriction',
    score: Math.min(100, score),
    weight: 0.15,
    factors,
  }
}

function assessSupplyChainRisk(product: {
  supplierData?: { priceVolatility?: number; stockConfidence?: number; sellerCount?: number }
}): RiskCategory {
  const factors: RiskFactor[] = []
  let score = 0

  const data = product.supplierData

  if (!data) {
    factors.push({
      name: 'no_supplier_data',
      detected: true,
      severity: 'medium',
      description: 'No supplier validation data available',
      mitigation: 'Run supplier validation before listing',
    })
    return { name: 'Supply Chain', score: 40, weight: 0.15, factors }
  }

  // Price volatility
  if (data.priceVolatility && data.priceVolatility > 30) {
    factors.push({
      name: 'high_price_volatility',
      detected: true,
      severity: 'high',
      description: `Supplier price volatility: ${data.priceVolatility}%`,
      mitigation: 'Set up price monitoring alerts',
    })
    score += 25
  } else if (data.priceVolatility && data.priceVolatility > 15) {
    factors.push({
      name: 'moderate_price_volatility',
      detected: true,
      severity: 'low',
      description: `Moderate price volatility: ${data.priceVolatility}%`,
    })
    score += 10
  }

  // Stock confidence
  if (data.stockConfidence && data.stockConfidence < 50) {
    factors.push({
      name: 'low_stock_confidence',
      detected: true,
      severity: 'high',
      description: 'Low supplier stock confidence',
      mitigation: 'Consider alternative suppliers',
    })
    score += 25
  }

  // Single seller risk
  if (data.sellerCount !== undefined && data.sellerCount <= 1) {
    factors.push({
      name: 'single_supplier',
      detected: true,
      severity: 'medium',
      description: 'Single supplier - no backup source',
      mitigation: 'Identify backup suppliers',
    })
    score += 15
  }

  return {
    name: 'Supply Chain',
    score: Math.min(100, score),
    weight: 0.15,
    factors,
  }
}

function assessPriceVolatility(product: { price?: number; sourcePrice?: number }): RiskCategory {
  const factors: RiskFactor[] = []
  let score = 0

  if (!product.price || !product.sourcePrice) {
    return { name: 'Price Volatility', score: 20, weight: 0.05, factors }
  }

  // Calculate margin
  const margin = ((product.price - product.sourcePrice) / product.price) * 100

  if (margin < 10) {
    factors.push({
      name: 'thin_margin',
      detected: true,
      severity: 'high',
      description: `Thin margin: ${margin.toFixed(1)}% - vulnerable to price changes`,
      mitigation: 'Consider raising price or finding cheaper supplier',
    })
    score += 30
  } else if (margin < 20) {
    factors.push({
      name: 'moderate_margin',
      detected: true,
      severity: 'low',
      description: `Moderate margin: ${margin.toFixed(1)}%`,
    })
    score += 10
  }

  return {
    name: 'Price Volatility',
    score: Math.min(100, score),
    weight: 0.05,
    factors,
  }
}

function assessCompetitionRisk(product: {
  competitionData?: { totalCompetitors?: number; competitionLevel?: string }
}): RiskCategory {
  const factors: RiskFactor[] = []
  let score = 0

  const data = product.competitionData

  if (!data) {
    return { name: 'Competition', score: 25, weight: 0.05, factors }
  }

  if (data.competitionLevel === 'saturated' || (data.totalCompetitors && data.totalCompetitors > 50)) {
    factors.push({
      name: 'saturated_market',
      detected: true,
      severity: 'high',
      description: 'Highly saturated market with many competitors',
      mitigation: 'Consider niche variations or different products',
    })
    score += 35
  } else if (data.competitionLevel === 'high' || (data.totalCompetitors && data.totalCompetitors > 20)) {
    factors.push({
      name: 'high_competition',
      detected: true,
      severity: 'medium',
      description: 'High competition market',
    })
    score += 20
  }

  return {
    name: 'Competition',
    score: Math.min(100, score),
    weight: 0.05,
    factors,
  }
}

function assessSeasonalityRisk(product: { title: string; category?: string }): RiskCategory {
  const factors: RiskFactor[] = []
  let score = 0

  const textToCheck = `${product.title} ${product.category || ''}`.toLowerCase()

  // Seasonal product indicators
  const seasonalPatterns = [
    { pattern: /christmas|holiday|xmas|santa/i, season: 'winter holiday' },
    { pattern: /halloween|costume|spooky/i, season: 'Halloween' },
    { pattern: /valentine|romantic|love/i, season: 'Valentine\'s Day' },
    { pattern: /easter|bunny|egg hunt/i, season: 'Easter' },
    { pattern: /summer|beach|pool|swimwear/i, season: 'summer' },
    { pattern: /winter|snow|cold weather/i, season: 'winter' },
    { pattern: /back to school|school supplies/i, season: 'back-to-school' },
  ]

  for (const { pattern, season } of seasonalPatterns) {
    if (textToCheck.match(pattern)) {
      factors.push({
        name: 'seasonal_product',
        detected: true,
        severity: 'medium',
        description: `Seasonal product (${season}) - demand may fluctuate`,
        mitigation: 'Plan inventory and pricing around seasonal peaks',
      })
      score += 20
      break
    }
  }

  return {
    name: 'Seasonality',
    score: Math.min(100, score),
    weight: 0.05,
    factors,
  }
}

function assessQualityRisk(product: { title: string; description?: string }): RiskCategory {
  const factors: RiskFactor[] = []
  let score = 0

  const textToCheck = `${product.title} ${product.description || ''}`.toLowerCase()

  // Check for quality warning terms
  for (const term of QUALITY_WARNING_TERMS) {
    if (textToCheck.includes(term)) {
      factors.push({
        name: 'quality_concern',
        detected: true,
        severity: 'medium',
        description: `Quality concern indicator: "${term}"`,
        mitigation: 'Verify product condition and set accurate expectations',
      })
      score += 10
    }
  }

  // Check for lack of warranty/guarantee
  if (!textToCheck.includes('warranty') && !textToCheck.includes('guarantee')) {
    // Not a red flag, just informational
    score += 5
  }

  return {
    name: 'Quality Issues',
    score: Math.min(100, score),
    weight: 0.05,
    factors,
  }
}

// =============================================================================
// MITIGATIONS
// =============================================================================

function generateMitigations(
  risks: RiskAssessment['risks'],
  blockers: RiskBlocker[],
  warnings: RiskWarning[]
): string[] {
  const mitigations: string[] = []

  // If critical blockers exist
  if (blockers.some((b) => b.severity === 'critical')) {
    mitigations.push('DO NOT LIST: Critical policy violations detected')
  }

  // Policy compliance
  if (risks.policyCompliance.score > 20) {
    mitigations.push('Review eBay listing policies before publishing')
  }

  // Brand restrictions
  if (risks.brandRestriction.score > 30) {
    mitigations.push('Verify brand authorization or avoid brand references')
  }

  // Supply chain
  if (risks.supplyChain.score > 25) {
    mitigations.push('Set up supplier price and stock monitoring')
    mitigations.push('Identify backup suppliers before listing')
  }

  // Competition
  if (risks.competition.score > 30) {
    mitigations.push('Implement dynamic repricing strategy')
    mitigations.push('Consider product differentiation (bundles, variations)')
  }

  // Seasonality
  if (risks.seasonality.score > 15) {
    mitigations.push('Plan inventory levels around seasonal demand')
  }

  return mitigations
}

// =============================================================================
// BATCH ASSESSMENT
// =============================================================================

export async function batchAssessRisk(
  products: Parameters<typeof assessProductRisk>[0][]
): Promise<RiskAssessment[]> {
  return Promise.all(products.map(assessProductRisk))
}

// =============================================================================
// DATABASE INTEGRATION
// =============================================================================

export async function saveRiskAssessment(assessment: RiskAssessment): Promise<void> {
  try {
    await supabase.from('product_risk_assessments').upsert({
      product_id: assessment.productId,
      title: assessment.title,
      overall_risk_score: assessment.overallRiskScore,
      risk_level: assessment.riskLevel,
      risks: assessment.risks,
      blockers: assessment.blockers,
      warnings: assessment.warnings,
      mitigations: assessment.mitigations,
      assessed_at: assessment.assessedAt,
    }, {
      onConflict: 'product_id',
    })
  } catch (error) {
    console.error('[RiskScorer] Failed to save assessment:', error)
  }
}

export async function getHighRiskProducts(
  minRiskScore: number = 50
): Promise<RiskAssessment[]> {
  try {
    const { data } = await supabase
      .from('product_risk_assessments')
      .select('*')
      .gte('overall_risk_score', minRiskScore)
      .order('overall_risk_score', { ascending: false })

    return (data || []).map((row) => ({
      productId: row.product_id,
      title: row.title,
      overallRiskScore: row.overall_risk_score,
      riskLevel: row.risk_level,
      risks: row.risks,
      blockers: row.blockers,
      warnings: row.warnings,
      mitigations: row.mitigations,
      assessedAt: row.assessed_at,
    }))
  } catch (error) {
    console.error('[RiskScorer] Failed to get high risk products:', error)
    return []
  }
}
