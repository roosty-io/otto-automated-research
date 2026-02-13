/**
 * Product Risk Scoring Module
 *
 * Evaluates products for various risk factors that could lead to:
 * - Account suspension (policy violations)
 * - Returns/complaints
 * - Low profitability
 * - Supply chain issues
 * - Cassini visibility penalties (NEW)
 *
 * Lower risk score = safer product
 *
 * Cassini Risk Factors:
 * - Title spam terms that cause algorithm penalties
 * - Slow shipping that hurts seller metrics
 * - Low item specifics that reduce filter visibility
 * - Pricing that affects conversion rates
 */

import { supabase } from '../supabase'
import { CASSINI_THRESHOLDS } from './cassini-optimizer'

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
    cassiniVisibility: RiskCategory  // NEW: Cassini algorithm risk factors
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
// CASSINI ALGORITHM RISK FACTORS
// =============================================================================

// Spam terms that Cassini algorithm penalizes
const CASSINI_SPAM_TERMS = [
  'l@@k', 'look', 'wow', 'amazing', 'best', 'cheap', 'sale',
  '!!!', '***', 'must see', 'hot', 'rare find', 'great deal',
  'limited time', 'act now', 'hurry', 'dont miss', "don't miss",
  'last chance', 'ending soon', 'price drop', 'clearance',
  'a+++', 'a++', 'a+', 'aaa', 'top quality', 'best quality',
  'fast ship', 'ships fast', 'quick ship', 'free ship',
  'u.s.a', 'usa seller', 'usa only', 'american made',
]

// Cassini optimal title characteristics
const CASSINI_TITLE_REQUIREMENTS = {
  minLength: 60,       // Below this, missing keyword opportunities
  optimalMin: 75,      // Optimal range start
  optimalMax: 80,      // Optimal range end
  maxLength: 80,       // eBay limit
  minKeywords: 5,      // Minimum relevant keywords
}

// Cassini item specifics requirements
const CASSINI_ITEM_SPECIFICS = {
  minimum: 5,          // Minimum for basic visibility
  recommended: 8,      // Good visibility
  optimal: 12,         // Maximum algorithm benefit
}

// Cassini shipping risk thresholds
const CASSINI_SHIPPING_RISKS = {
  maxHandlingDays: 1,          // Ideal for Top Rated Plus
  warningHandlingDays: 2,      // Acceptable but not optimal
  riskHandlingDays: 3,         // Risk to seller metrics
  maxDeliveryDays: 7,          // Maximum for good standing
  warningDeliveryDays: 10,     // Yellow flag
  riskDeliveryDays: 14,        // Red flag
}

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
    // Cassini-specific data
    cassiniData?: {
      itemSpecificsCount?: number
      handlingDays?: number
      estimatedDeliveryDays?: number
      hasTopRatedPlus?: boolean
      sellerFeedbackScore?: number
      defectRate?: number
      lateShipmentRate?: number
      titleKeywords?: string[]
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
    cassiniVisibility: assessCassiniVisibilityRisk(product),
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
// CASSINI VISIBILITY RISK ASSESSMENT
// =============================================================================

function assessCassiniVisibilityRisk(product: {
  title: string
  description?: string
  cassiniData?: {
    itemSpecificsCount?: number
    handlingDays?: number
    estimatedDeliveryDays?: number
    hasTopRatedPlus?: boolean
    sellerFeedbackScore?: number
    defectRate?: number
    lateShipmentRate?: number
    titleKeywords?: string[]
  }
}): RiskCategory {
  const factors: RiskFactor[] = []
  let score = 0
  const titleLower = product.title.toLowerCase()
  const data = product.cassiniData

  // -------------------------------------------------------------------------
  // Title Spam Term Detection
  // -------------------------------------------------------------------------
  const detectedSpamTerms: string[] = []
  for (const term of CASSINI_SPAM_TERMS) {
    if (titleLower.includes(term.toLowerCase())) {
      detectedSpamTerms.push(term)
    }
  }

  if (detectedSpamTerms.length > 0) {
    const severity = detectedSpamTerms.length >= 3 ? 'high' :
                     detectedSpamTerms.length >= 2 ? 'medium' : 'low'
    factors.push({
      name: 'title_spam_terms',
      detected: true,
      severity,
      description: `Title contains Cassini-penalized terms: ${detectedSpamTerms.slice(0, 3).join(', ')}${detectedSpamTerms.length > 3 ? '...' : ''}`,
      mitigation: 'Remove spam terms and use relevant product keywords instead',
    })
    score += detectedSpamTerms.length >= 3 ? 25 : detectedSpamTerms.length >= 2 ? 15 : 8
  }

  // -------------------------------------------------------------------------
  // Title Length Analysis
  // -------------------------------------------------------------------------
  const titleLength = product.title.length

  if (titleLength < CASSINI_TITLE_REQUIREMENTS.minLength) {
    factors.push({
      name: 'title_too_short',
      detected: true,
      severity: 'medium',
      description: `Title length (${titleLength} chars) below optimal (${CASSINI_TITLE_REQUIREMENTS.optimalMin}-${CASSINI_TITLE_REQUIREMENTS.optimalMax})`,
      mitigation: 'Add relevant keywords to reach 75-80 characters',
    })
    score += 15
  } else if (titleLength > CASSINI_TITLE_REQUIREMENTS.maxLength) {
    factors.push({
      name: 'title_too_long',
      detected: true,
      severity: 'low',
      description: `Title exceeds eBay limit (${titleLength}/${CASSINI_TITLE_REQUIREMENTS.maxLength} chars)`,
      mitigation: 'Trim title to 80 characters, prioritizing keywords',
    })
    score += 5
  } else if (titleLength < CASSINI_TITLE_REQUIREMENTS.optimalMin) {
    factors.push({
      name: 'title_suboptimal_length',
      detected: true,
      severity: 'low',
      description: `Title length (${titleLength} chars) could be optimized (aim for ${CASSINI_TITLE_REQUIREMENTS.optimalMin}-${CASSINI_TITLE_REQUIREMENTS.optimalMax})`,
      mitigation: 'Consider adding more relevant keywords',
    })
    score += 5
  }

  // -------------------------------------------------------------------------
  // Keyword Front-Loading Check
  // -------------------------------------------------------------------------
  // Check if title starts with important keywords vs filler words
  const fillerStarters = ['new', 'brand new', 'hot', 'sale', 'best', 'great', 'amazing', 'a', 'an', 'the']
  const firstWord = titleLower.split(/\s+/)[0]

  if (fillerStarters.includes(firstWord)) {
    factors.push({
      name: 'poor_keyword_placement',
      detected: true,
      severity: 'low',
      description: `Title starts with filler word "${firstWord}" instead of primary keyword`,
      mitigation: 'Front-load title with primary product keywords',
    })
    score += 8
  }

  // -------------------------------------------------------------------------
  // Item Specifics Risk
  // -------------------------------------------------------------------------
  if (data?.itemSpecificsCount !== undefined) {
    if (data.itemSpecificsCount < CASSINI_ITEM_SPECIFICS.minimum) {
      factors.push({
        name: 'insufficient_item_specifics',
        detected: true,
        severity: 'high',
        description: `Only ${data.itemSpecificsCount} item specifics (minimum ${CASSINI_ITEM_SPECIFICS.minimum} for visibility)`,
        mitigation: `Add at least ${CASSINI_ITEM_SPECIFICS.recommended} item specifics for better filter visibility`,
      })
      score += 25
    } else if (data.itemSpecificsCount < CASSINI_ITEM_SPECIFICS.recommended) {
      factors.push({
        name: 'low_item_specifics',
        detected: true,
        severity: 'medium',
        description: `${data.itemSpecificsCount} item specifics (recommend ${CASSINI_ITEM_SPECIFICS.recommended}+)`,
        mitigation: `Add more item specifics to reach ${CASSINI_ITEM_SPECIFICS.optimal} for optimal visibility`,
      })
      score += 12
    }
  }

  // -------------------------------------------------------------------------
  // Shipping/Handling Risk (affects seller metrics → Cassini ranking)
  // -------------------------------------------------------------------------
  if (data?.handlingDays !== undefined) {
    if (data.handlingDays > CASSINI_SHIPPING_RISKS.riskHandlingDays) {
      factors.push({
        name: 'slow_handling',
        detected: true,
        severity: 'high',
        description: `${data.handlingDays}-day handling time risks seller metrics`,
        mitigation: 'Use supplier with same-day or 1-day handling for Top Rated Plus eligibility',
      })
      score += 20
    } else if (data.handlingDays > CASSINI_SHIPPING_RISKS.warningHandlingDays) {
      factors.push({
        name: 'suboptimal_handling',
        detected: true,
        severity: 'medium',
        description: `${data.handlingDays}-day handling - not eligible for Top Rated Plus`,
        mitigation: 'Consider suppliers with faster handling times',
      })
      score += 10
    }
  }

  if (data?.estimatedDeliveryDays !== undefined) {
    if (data.estimatedDeliveryDays > CASSINI_SHIPPING_RISKS.riskDeliveryDays) {
      factors.push({
        name: 'excessive_delivery_time',
        detected: true,
        severity: 'high',
        description: `${data.estimatedDeliveryDays}-day delivery puts seller metrics at risk`,
        mitigation: 'Find suppliers with faster shipping options',
      })
      score += 20
    } else if (data.estimatedDeliveryDays > CASSINI_SHIPPING_RISKS.maxDeliveryDays) {
      factors.push({
        name: 'slow_delivery',
        detected: true,
        severity: 'medium',
        description: `${data.estimatedDeliveryDays}-day delivery exceeds recommended maximum`,
        mitigation: 'Aim for 7-day or faster delivery',
      })
      score += 12
    }
  }

  // -------------------------------------------------------------------------
  // Seller Metrics Risk (directly affects Cassini visibility)
  // -------------------------------------------------------------------------
  if (data?.defectRate !== undefined) {
    if (data.defectRate > CASSINI_THRESHOLDS.defectRate.belowStandard) {
      factors.push({
        name: 'high_defect_rate_risk',
        detected: true,
        severity: 'critical',
        description: `Product may push defect rate above ${CASSINI_THRESHOLDS.defectRate.belowStandard}%`,
        mitigation: 'Avoid listings that may increase defect rate',
      })
      score += 35
    } else if (data.defectRate > CASSINI_THRESHOLDS.defectRate.topRated) {
      factors.push({
        name: 'moderate_defect_risk',
        detected: true,
        severity: 'medium',
        description: `Defect rate ${data.defectRate}% above Top Rated threshold`,
        mitigation: 'Monitor product quality closely',
      })
      score += 15
    }
  }

  if (data?.lateShipmentRate !== undefined) {
    if (data.lateShipmentRate > CASSINI_THRESHOLDS.lateShipmentRate.belowStandard) {
      factors.push({
        name: 'high_late_shipment_risk',
        detected: true,
        severity: 'critical',
        description: `Late shipment rate ${data.lateShipmentRate}% threatens seller standing`,
        mitigation: 'Only list products with reliable, fast shipping suppliers',
      })
      score += 30
    } else if (data.lateShipmentRate > CASSINI_THRESHOLDS.lateShipmentRate.topRated) {
      factors.push({
        name: 'moderate_late_shipment_risk',
        detected: true,
        severity: 'medium',
        description: `Late shipment rate ${data.lateShipmentRate}% above Top Rated threshold`,
        mitigation: 'Use suppliers with consistent handling times',
      })
      score += 12
    }
  }

  // -------------------------------------------------------------------------
  // Top Rated Plus Eligibility Impact
  // -------------------------------------------------------------------------
  if (data?.hasTopRatedPlus === false) {
    // Not having Top Rated Plus means missing 20% visibility boost
    factors.push({
      name: 'no_top_rated_plus',
      detected: true,
      severity: 'info',
      description: 'Not eligible for Top Rated Plus (+20% visibility)',
      mitigation: 'Meet TRP requirements: 1-day handling + free 30-day returns',
    })
    score += 5
  }

  // -------------------------------------------------------------------------
  // Seller Feedback Score Risk
  // -------------------------------------------------------------------------
  if (data?.sellerFeedbackScore !== undefined) {
    if (data.sellerFeedbackScore < CASSINI_THRESHOLDS.feedbackScore.acceptable) {
      factors.push({
        name: 'low_feedback_score',
        detected: true,
        severity: 'high',
        description: `Feedback score ${data.sellerFeedbackScore}% below acceptable threshold`,
        mitigation: 'Focus on customer service to improve feedback score',
      })
      score += 20
    } else if (data.sellerFeedbackScore < CASSINI_THRESHOLDS.feedbackScore.good) {
      factors.push({
        name: 'moderate_feedback_score',
        detected: true,
        severity: 'medium',
        description: `Feedback score ${data.sellerFeedbackScore}% below good threshold`,
        mitigation: 'Improve feedback score for better visibility',
      })
      score += 10
    }
  }

  return {
    name: 'Cassini Visibility',
    score: Math.min(100, score),
    weight: 0.15,  // Significant weight for Cassini factors
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

  // Cassini Visibility - NEW
  if (risks.cassiniVisibility.score > 25) {
    mitigations.push('Optimize title: 75-80 chars, front-load keywords, remove spam terms')
  }

  if (risks.cassiniVisibility.score > 15) {
    mitigations.push('Add 8-12 item specifics for filter visibility')
  }

  // Check for specific Cassini factors
  const cassiniFactors = risks.cassiniVisibility.factors

  const hasShippingIssue = cassiniFactors.some(f =>
    f.detected && (f.name === 'slow_handling' || f.name === 'excessive_delivery_time')
  )
  if (hasShippingIssue) {
    mitigations.push('Find faster shipping supplier to protect seller metrics')
  }

  const hasSellerMetricRisk = cassiniFactors.some(f =>
    f.detected && (f.name.includes('defect') || f.name.includes('late_shipment'))
  )
  if (hasSellerMetricRisk) {
    mitigations.push('Monitor seller metrics closely - product may impact standing')
  }

  const hasSpamTerms = cassiniFactors.some(f => f.detected && f.name === 'title_spam_terms')
  if (hasSpamTerms) {
    mitigations.push('Remove spam terms from title to avoid Cassini penalties')
  }

  const noTopRatedPlus = cassiniFactors.some(f => f.detected && f.name === 'no_top_rated_plus')
  if (noTopRatedPlus && risks.cassiniVisibility.score > 10) {
    mitigations.push('Consider Top Rated Plus eligibility for +20% visibility boost')
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
