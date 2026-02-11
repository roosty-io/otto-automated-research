/**
 * Enhanced SKU Generation Pipeline
 *
 * Creates optimized SKUs from normalized products with:
 * - Smart pricing strategies
 * - Optimized listing content
 * - Category-specific templates
 * - A/B testing variants
 * - Policy compliance checks
 */

import { supabase } from '@/lib/supabase'
import type { NormalizedProductOutput } from './claude-normalizer'
import { calculateQualityScore, type QualityScore } from './quality-scorer'

// SKU code structure: [CATEGORY]-[PRICE_BAND]-[UNIQUE_ID]-[VARIANT]
// Example: ELE-MID-A7X9K-01

export interface SkuGenerationInput {
  normalizedProductId: string
  normalizedProduct: NormalizedProductOutput
  costPrice: number
  sourceAsin?: string
  sourceUrl?: string
  qualityScore?: QualityScore
  imageUrls?: string[]
}

export interface GeneratedSku {
  skuCode: string
  listingTitle: string
  listingDescription: string
  bulletPoints: string[]
  suggestedPrice: number
  minPrice: number
  maxPrice: number
  pricingStrategy: PricingStrategy
  categoryId: string
  itemSpecifics: Record<string, string>
  shippingProfile: ShippingProfile
  variants: SkuVariant[]
  complianceStatus: ComplianceStatus
  listingReadiness: number // 0-100
  optimizations: string[]
}

export interface PricingStrategy {
  type: 'competitive' | 'premium' | 'value' | 'dynamic'
  baseCost: number
  targetMargin: number
  priceFloor: number
  priceCeiling: number
  competitorAvg?: number
  adjustmentFactors: string[]
}

export interface ShippingProfile {
  type: 'free' | 'calculated' | 'flat'
  flatRate?: number
  handlingDays: number
  domesticServices: string[]
  internationalServices?: string[]
  excludedLocations?: string[]
}

export interface SkuVariant {
  variantId: string
  type: 'title' | 'price' | 'image'
  value: string | number
  purpose: string
}

export interface ComplianceStatus {
  isCompliant: boolean
  checks: {
    name: string
    passed: boolean
    message?: string
  }[]
  blockers: string[]
  warnings: string[]
}

export interface SkuGenerationConfig {
  // Pricing
  minMarginPercent?: number
  maxMarginPercent?: number
  roundToNearest?: number
  pricingStrategy?: PricingStrategy['type']

  // Content
  maxTitleLength?: number
  maxDescriptionLength?: number
  includeBrandInTitle?: boolean

  // Variants
  generateVariants?: boolean
  variantCount?: number

  // Shipping
  defaultShippingProfile?: Partial<ShippingProfile>
}

const DEFAULT_CONFIG: Required<SkuGenerationConfig> = {
  minMarginPercent: 25,
  maxMarginPercent: 60,
  roundToNearest: 0.99,
  pricingStrategy: 'competitive',
  maxTitleLength: 80,
  maxDescriptionLength: 5000,
  includeBrandInTitle: true,
  generateVariants: true,
  variantCount: 2,
  defaultShippingProfile: {
    type: 'free',
    handlingDays: 2,
    domesticServices: ['USPS First Class', 'USPS Priority'],
  },
}

// Category code mapping
const CATEGORY_CODES: Record<string, string> = {
  Electronics: 'ELE',
  'Home & Garden': 'HOM',
  'Health & Beauty': 'HLT',
  'Clothing & Accessories': 'CLO',
  'Toys & Games': 'TOY',
  'Sports & Outdoors': 'SPO',
  'Pet Supplies': 'PET',
  Automotive: 'AUT',
  'Office & School': 'OFF',
  'Baby & Kids': 'BAB',
  Uncategorized: 'GEN',
}

// Price band codes
const PRICE_BAND_CODES: Record<string, string> = {
  budget: 'BUD', // < $15
  low: 'LOW', // $15-30
  mid: 'MID', // $30-60
  high: 'HIG', // $60-100
  premium: 'PRE', // > $100
}

/**
 * Generate a complete SKU from normalized product data
 */
export async function generateSku(
  input: SkuGenerationInput,
  config: SkuGenerationConfig = {}
): Promise<GeneratedSku> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const { normalizedProduct, costPrice, qualityScore } = input

  // Generate SKU code
  const skuCode = generateSkuCode(normalizedProduct, costPrice)

  // Calculate pricing
  const pricing = calculatePricing(costPrice, cfg, qualityScore)

  // Generate listing content
  const listingTitle = generateListingTitle(normalizedProduct, cfg)
  const listingDescription = generateListingDescription(normalizedProduct)
  const bulletPoints = optimizeBulletPoints(normalizedProduct.bulletPoints)

  // Determine item specifics
  const itemSpecifics = generateItemSpecifics(normalizedProduct)

  // Set shipping profile
  const shippingProfile = determineShippingProfile(costPrice, cfg)

  // Generate variants for A/B testing
  const variants = cfg.generateVariants
    ? generateVariants(listingTitle, pricing.suggestedPrice, cfg.variantCount)
    : []

  // Run compliance checks
  const complianceStatus = runComplianceChecks(normalizedProduct, listingTitle, listingDescription)

  // Calculate listing readiness
  const listingReadiness = calculateListingReadiness(
    normalizedProduct,
    complianceStatus,
    qualityScore
  )

  // Generate optimization suggestions
  const optimizations = generateOptimizations(
    normalizedProduct,
    complianceStatus,
    listingReadiness
  )

  return {
    skuCode,
    listingTitle,
    listingDescription,
    bulletPoints,
    suggestedPrice: pricing.suggestedPrice,
    minPrice: pricing.priceFloor,
    maxPrice: pricing.priceCeiling,
    pricingStrategy: pricing,
    categoryId: normalizedProduct.normalizedCategory,
    itemSpecifics,
    shippingProfile,
    variants,
    complianceStatus,
    listingReadiness,
    optimizations,
  }
}

/**
 * Generate SKUs for multiple products
 */
export async function generateSkuBatch(
  inputs: SkuGenerationInput[],
  config: SkuGenerationConfig = {}
): Promise<{
  generated: GeneratedSku[]
  failed: { productId: string; error: string }[]
}> {
  const generated: GeneratedSku[] = []
  const failed: { productId: string; error: string }[] = []

  for (const input of inputs) {
    try {
      const sku = await generateSku(input, config)
      generated.push(sku)
    } catch (error) {
      failed.push({
        productId: input.normalizedProductId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return { generated, failed }
}

/**
 * Save generated SKU to database
 */
export async function saveGeneratedSku(
  sku: GeneratedSku,
  normalizedProductId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('skus')
    .insert({
      normalized_product_id: normalizedProductId,
      sku_code: sku.skuCode,
      listing_title: sku.listingTitle,
      listing_description: sku.listingDescription,
      bullet_points: sku.bulletPoints,
      suggested_price: sku.suggestedPrice,
      min_price: sku.minPrice,
      max_price: sku.maxPrice,
      pricing_strategy: sku.pricingStrategy,
      category_id: sku.categoryId,
      item_specifics: sku.itemSpecifics,
      shipping_profile: sku.shippingProfile,
      variants: sku.variants,
      compliance_status: sku.complianceStatus,
      listing_readiness: sku.listingReadiness,
      optimizations: sku.optimizations,
      status: sku.complianceStatus.isCompliant ? 'ready' : 'needs_review',
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error saving SKU:', error)
    return null
  }

  return data
}

// Helper functions

function generateSkuCode(product: NormalizedProductOutput, costPrice: number): string {
  const categoryCode = CATEGORY_CODES[product.normalizedCategory] || 'GEN'
  const priceBand = getPriceBand(costPrice)
  const bandCode = PRICE_BAND_CODES[priceBand]
  const uniqueId = generateUniqueId()

  return `${categoryCode}-${bandCode}-${uniqueId}`
}

function getPriceBand(price: number): string {
  if (price < 15) return 'budget'
  if (price < 30) return 'low'
  if (price < 60) return 'mid'
  if (price < 100) return 'high'
  return 'premium'
}

function generateUniqueId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 5; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

function calculatePricing(
  costPrice: number,
  config: Required<SkuGenerationConfig>,
  qualityScore?: QualityScore
): PricingStrategy {
  const minMargin = config.minMarginPercent / 100
  const maxMargin = config.maxMarginPercent / 100

  // Base margins
  const priceFloor = costPrice / (1 - minMargin)
  const priceCeiling = costPrice / (1 - maxMargin)

  // Target margin based on quality score
  let targetMargin = (minMargin + maxMargin) / 2
  if (qualityScore) {
    // Higher quality = higher margin potential
    const qualityFactor = qualityScore.overall / 100
    targetMargin = minMargin + (maxMargin - minMargin) * qualityFactor
  }

  const suggestedPrice = roundToNearest(costPrice / (1 - targetMargin), config.roundToNearest)

  const adjustmentFactors: string[] = []
  if (qualityScore?.breakdown.demand && qualityScore.breakdown.demand > 70) {
    adjustmentFactors.push('High demand (+margin)')
  }
  if (qualityScore?.breakdown.supply && qualityScore.breakdown.supply < 40) {
    adjustmentFactors.push('High competition (-margin)')
  }

  return {
    type: config.pricingStrategy,
    baseCost: costPrice,
    targetMargin,
    priceFloor: roundToNearest(priceFloor, config.roundToNearest),
    priceCeiling: roundToNearest(priceCeiling, config.roundToNearest),
    adjustmentFactors,
  }
}

function roundToNearest(price: number, nearest: number): number {
  if (nearest === 0.99) {
    return Math.ceil(price) - 0.01
  }
  return Math.round(price / nearest) * nearest
}

function generateListingTitle(
  product: NormalizedProductOutput,
  config: Required<SkuGenerationConfig>
): string {
  let title = ''

  // Add brand if configured
  if (config.includeBrandInTitle && product.normalizedBrand !== 'Unbranded') {
    title = `${product.normalizedBrand} `
  }

  title += product.normalizedTitle

  // Add key feature if space allows
  if (product.keyFeatures.length > 0 && title.length < config.maxTitleLength - 20) {
    const feature = product.keyFeatures[0]
    if (title.length + feature.length + 3 <= config.maxTitleLength) {
      title += ` - ${feature}`
    }
  }

  // Truncate if needed
  if (title.length > config.maxTitleLength) {
    title = title.slice(0, config.maxTitleLength - 3) + '...'
  }

  return title
}

function generateListingDescription(product: NormalizedProductOutput): string {
  const sections: string[] = []

  // Product overview
  sections.push(`## ${product.normalizedTitle}`)
  sections.push('')

  // Key features
  if (product.keyFeatures.length > 0) {
    sections.push('### Key Features')
    product.keyFeatures.forEach((f) => sections.push(`- ${f}`))
    sections.push('')
  }

  // Specifications
  if (Object.keys(product.specifications).length > 0) {
    sections.push('### Specifications')
    Object.entries(product.specifications).forEach(([key, value]) => {
      sections.push(`- **${key}**: ${value}`)
    })
    sections.push('')
  }

  // Target audience
  if (product.targetAudience.length > 0) {
    sections.push(`**Perfect for**: ${product.targetAudience.join(', ')}`)
    sections.push('')
  }

  // Use case
  if (product.useCase) {
    sections.push(`**Ideal for**: ${product.useCase}`)
    sections.push('')
  }

  // Standard footer
  sections.push('---')
  sections.push('**Shipping**: Fast, free shipping on all orders!')
  sections.push('**Returns**: 30-day hassle-free returns')
  sections.push("**Questions?**: Message us - we're here to help!")

  return sections.join('\n')
}

function optimizeBulletPoints(bulletPoints: string[]): string[] {
  return bulletPoints.map((bp) => {
    // Ensure starts with action word or benefit
    let optimized = bp.trim()

    // Capitalize first letter
    optimized = optimized.charAt(0).toUpperCase() + optimized.slice(1)

    // Remove trailing period if present (eBay style)
    if (optimized.endsWith('.')) {
      optimized = optimized.slice(0, -1)
    }

    return optimized
  })
}

function generateItemSpecifics(product: NormalizedProductOutput): Record<string, string> {
  const specifics: Record<string, string> = {
    Brand: product.normalizedBrand,
    Type: product.subcategory || product.normalizedCategory,
  }

  // Add specifications as item specifics
  Object.entries(product.specifications).forEach(([key, value]) => {
    specifics[key] = value
  })

  return specifics
}

function determineShippingProfile(
  costPrice: number,
  config: Required<SkuGenerationConfig>
): ShippingProfile {
  const base = config.defaultShippingProfile

  // Higher priced items can absorb free shipping
  if (costPrice >= 20) {
    return {
      type: 'free',
      handlingDays: base.handlingDays || 2,
      domesticServices: base.domesticServices || ['USPS First Class', 'USPS Priority'],
    }
  }

  // Lower priced items might need calculated shipping
  return {
    type: 'calculated',
    handlingDays: base.handlingDays || 2,
    domesticServices: base.domesticServices || ['USPS First Class'],
  }
}

function generateVariants(title: string, price: number, count: number): SkuVariant[] {
  const variants: SkuVariant[] = []

  if (count >= 1) {
    // Title variant - shorter/punchier
    const words = title.split(' ')
    if (words.length > 4) {
      variants.push({
        variantId: 'title-a',
        type: 'title',
        value: words.slice(0, Math.ceil(words.length * 0.7)).join(' '),
        purpose: 'Shorter title for mobile optimization',
      })
    }
  }

  if (count >= 2) {
    // Price variant - slightly lower
    variants.push({
      variantId: 'price-a',
      type: 'price',
      value: roundToNearest(price * 0.95, 0.99),
      purpose: 'Test price sensitivity',
    })
  }

  return variants
}

function runComplianceChecks(
  product: NormalizedProductOutput,
  title: string,
  description: string
): ComplianceStatus {
  const checks: ComplianceStatus['checks'] = []
  const blockers: string[] = []
  const warnings: string[] = []

  // Check for prohibited terms
  const prohibitedTerms = [
    'replica',
    'counterfeit',
    'fake',
    'knockoff',
    'unauthorized',
    'bootleg',
  ]
  const contentLower = (title + ' ' + description).toLowerCase()

  const hasProhibited = prohibitedTerms.some((term) => contentLower.includes(term))
  checks.push({
    name: 'Prohibited terms',
    passed: !hasProhibited,
    message: hasProhibited ? 'Contains potentially prohibited language' : undefined,
  })
  if (hasProhibited) blockers.push('Contains prohibited terms')

  // Check title length
  const titleOk = title.length <= 80
  checks.push({
    name: 'Title length',
    passed: titleOk,
    message: titleOk ? undefined : `Title too long (${title.length} chars)`,
  })
  if (!titleOk) warnings.push('Title exceeds 80 characters')

  // Check for brand issues
  const knownRestricted = ['nike', 'apple', 'louis vuitton', 'gucci', 'rolex']
  const brandLower = product.normalizedBrand.toLowerCase()
  const hasRestrictedBrand = knownRestricted.includes(brandLower)
  checks.push({
    name: 'Brand restrictions',
    passed: !hasRestrictedBrand,
    message: hasRestrictedBrand ? 'Brand may require authentication' : undefined,
  })
  if (hasRestrictedBrand) warnings.push('Brand may have selling restrictions')

  // Check description quality
  const descOk = description.length >= 100
  checks.push({
    name: 'Description quality',
    passed: descOk,
    message: descOk ? undefined : 'Description may be too short',
  })

  return {
    isCompliant: blockers.length === 0,
    checks,
    blockers,
    warnings,
  }
}

function calculateListingReadiness(
  product: NormalizedProductOutput,
  compliance: ComplianceStatus,
  qualityScore?: QualityScore
): number {
  let readiness = 50 // Base

  // Compliance
  if (compliance.isCompliant) readiness += 20
  readiness -= compliance.warnings.length * 5

  // Content quality
  if (product.bulletPoints.length >= 5) readiness += 10
  if (Object.keys(product.specifications).length >= 3) readiness += 10
  if (product.keyFeatures.length >= 3) readiness += 5

  // Quality score integration
  if (qualityScore) {
    readiness += Math.floor(qualityScore.overall / 10)
  }

  // AI confidence
  readiness += Math.floor(product.confidenceScore * 10)

  return Math.min(100, Math.max(0, readiness))
}

function generateOptimizations(
  product: NormalizedProductOutput,
  compliance: ComplianceStatus,
  readiness: number
): string[] {
  const optimizations: string[] = []

  // Address compliance warnings
  compliance.warnings.forEach((w) => {
    optimizations.push(`Fix: ${w}`)
  })

  // Content improvements
  if (product.bulletPoints.length < 5) {
    optimizations.push('Add more bullet points (aim for 5)')
  }

  if (Object.keys(product.specifications).length < 3) {
    optimizations.push('Add more specifications for better search visibility')
  }

  if (product.seoKeywords.length < 5) {
    optimizations.push('Research additional SEO keywords')
  }

  // Readiness-based suggestions
  if (readiness < 70) {
    optimizations.push('Consider adding product images')
    optimizations.push('Review competitor listings for improvements')
  }

  return optimizations
}
