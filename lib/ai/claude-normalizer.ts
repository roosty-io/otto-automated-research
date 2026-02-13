/**
 * Claude AI Client for Product Processing
 *
 * Uses Claude to intelligently normalize product data:
 * - Clean and standardize titles (Cassini-optimized, 75-80 chars)
 * - Extract brand, model, specifications
 * - Map to normalized categories
 * - Generate SEO-optimized bullet points
 * - Detect product quality signals
 * - Optimize for eBay Cassini algorithm visibility
 *
 * Cassini Optimization Factors:
 * - Title: 75-80 characters, front-load keywords, no spam
 * - Item specifics: Extract 8-12 attributes for filter visibility
 * - Keywords: Focus on buyer search terms, not seller jargon
 */

import Anthropic from '@anthropic-ai/sdk'

// Initialize client
let anthropicClient: Anthropic | null = null

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set')
    }
    anthropicClient = new Anthropic({ apiKey })
  }
  return anthropicClient
}

// Types
export interface RawProductInput {
  id: string
  title: string
  brand?: string | null
  category?: string | null
  description?: string | null
  bulletPoints?: string[] | null
  amazonPrice?: number | null
  ebayPrice?: number | null
  salesRank?: number | null
  reviewCount?: number | null
  rating?: number | null
  asin?: string | null
  imageUrls?: string[] | null
}

export interface NormalizedProductOutput {
  normalizedTitle: string
  normalizedBrand: string
  normalizedCategory: string
  subcategory: string | null
  bulletPoints: string[]
  keyFeatures: string[]
  specifications: Record<string, string>  // For eBay item specifics
  targetAudience: string[]
  useCase: string
  qualitySignals: QualitySignals
  seoKeywords: string[]
  suggestedTags: string[]
  confidenceScore: number

  // Cassini optimization fields (NEW)
  cassiniOptimization: CassiniTitleOptimization
}

// Cassini-specific title and listing optimization
export interface CassiniTitleOptimization {
  optimizedTitle: string  // 75-80 chars, keyword-optimized
  titleLength: number
  primaryKeywords: string[]  // Top 3-5 search keywords
  secondaryKeywords: string[]  // Additional keywords
  avoidedTerms: string[]  // Spam terms removed
  itemSpecifics: Record<string, string>  // 8-12 recommended
  itemSpecificsCount: number
  cassiniScore: number  // Estimated 0-100
  optimizationNotes: string[]
}

export interface QualitySignals {
  brandRecognition: 'high' | 'medium' | 'low' | 'unknown'
  productClarity: 'high' | 'medium' | 'low'
  marketDemand: 'high' | 'medium' | 'low'
  competitionLevel: 'high' | 'medium' | 'low'
  profitPotential: 'high' | 'medium' | 'low'
  listingReadiness: 'ready' | 'needs_work' | 'not_ready'
  issues: string[]
  strengths: string[]
}

export interface BatchNormalizationResult {
  success: boolean
  results: {
    productId: string
    normalized: NormalizedProductOutput | null
    error?: string
  }[]
  tokensUsed: number
  processingTime: number
}

// Category taxonomy for eBay dropshipping
const CATEGORY_TAXONOMY = {
  'Electronics': ['Smartphones', 'Tablets', 'Laptops', 'Accessories', 'Audio', 'Cameras', 'Gaming', 'Smart Home'],
  'Home & Garden': ['Kitchen', 'Bedding', 'Furniture', 'Decor', 'Outdoor', 'Tools', 'Storage', 'Cleaning'],
  'Health & Beauty': ['Skincare', 'Haircare', 'Makeup', 'Personal Care', 'Vitamins', 'Fitness', 'Wellness'],
  'Clothing & Accessories': ['Men', 'Women', 'Kids', 'Shoes', 'Bags', 'Jewelry', 'Watches'],
  'Toys & Games': ['Action Figures', 'Board Games', 'Educational', 'Outdoor Play', 'Puzzles', 'Collectibles'],
  'Sports & Outdoors': ['Exercise', 'Camping', 'Cycling', 'Water Sports', 'Team Sports', 'Hunting'],
  'Pet Supplies': ['Dogs', 'Cats', 'Fish', 'Birds', 'Small Animals', 'Reptiles'],
  'Automotive': ['Parts', 'Accessories', 'Tools', 'Care', 'Electronics'],
  'Office & School': ['Supplies', 'Furniture', 'Technology', 'Organization'],
  'Baby & Kids': ['Feeding', 'Diapering', 'Safety', 'Toys', 'Clothing', 'Nursery'],
}

/**
 * Normalize a single product using Claude
 */
export async function normalizeProduct(
  product: RawProductInput,
  options: { model?: string; maxRetries?: number } = {}
): Promise<NormalizedProductOutput> {
  const { model = 'claude-sonnet-4-20250514', maxRetries = 2 } = options
  const client = getClient()

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildProductPrompt(product)

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type')
      }

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const parsed = JSON.parse(jsonMatch[0]) as NormalizedProductOutput
      return validateAndEnrichOutput(parsed, product)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  throw lastError || new Error('Normalization failed')
}

/**
 * Normalize multiple products in a batch (more efficient)
 */
export async function normalizeProductBatch(
  products: RawProductInput[],
  options: { model?: string; batchSize?: number } = {}
): Promise<BatchNormalizationResult> {
  const { model = 'claude-sonnet-4-20250514', batchSize = 5 } = options
  const startTime = Date.now()
  let totalTokens = 0

  const results: BatchNormalizationResult['results'] = []

  // Process in batches
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)

    const batchResults = await Promise.all(
      batch.map(async (product) => {
        try {
          const normalized = await normalizeProduct(product, { model })
          return { productId: product.id, normalized, error: undefined }
        } catch (error) {
          return {
            productId: product.id,
            normalized: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })
    )

    results.push(...batchResults)

    // Rate limit between batches
    if (i + batchSize < products.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  return {
    success: results.every((r) => r.normalized !== null),
    results,
    tokensUsed: totalTokens,
    processingTime: Date.now() - startTime,
  }
}

/**
 * Quick title cleaning without full normalization
 * Now Cassini-optimized: 75-80 chars, front-loaded keywords, no spam
 */
export async function cleanProductTitle(
  title: string,
  options: { model?: string; targetLength?: number } = {}
): Promise<string> {
  const { model = 'claude-haiku-4-20250514', targetLength = 78 } = options
  const client = getClient()

  const response = await client.messages.create({
    model,
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Optimize this product title for eBay Cassini search algorithm.

REQUIREMENTS:
- Target length: ${targetLength} characters (use 75-80 chars)
- Front-load the most important keywords (brand, product type)
- Remove ALL spam terms: L@@K, WOW, AMAZING, MUST SEE, !!!
- Fix capitalization (Title Case, not ALL CAPS)
- Keep essential info: brand, product type, key features, size/color
- Natural language buyers would search for

Original title: ${title}

Return ONLY the optimized title, nothing else. Use all available characters up to 80.`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    return title.substring(0, 80)
  }

  // Ensure max 80 chars
  return content.text.trim().substring(0, 80)
}

/**
 * Generate a Cassini-optimized title from product data
 * For use when creating new listings
 */
export async function generateCassiniTitle(
  product: {
    title: string
    brand?: string
    category?: string
    features?: string[]
    color?: string
    size?: string
  },
  options: { model?: string } = {}
): Promise<{
  title: string
  length: number
  keywords: string[]
  score: number
}> {
  const { model = 'claude-sonnet-4-20250514' } = options
  const client = getClient()

  const response = await client.messages.create({
    model,
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `Create a Cassini-optimized eBay title for this product.

Product: ${product.title}
Brand: ${product.brand || 'Unknown'}
Category: ${product.category || 'General'}
Features: ${product.features?.join(', ') || 'None specified'}
Color: ${product.color || 'Not specified'}
Size: ${product.size || 'Not specified'}

CASSINI OPTIMIZATION RULES:
1. EXACTLY 75-80 characters (use every character!)
2. Format: [Brand] [Product Type] [Key Feature] [Model/Variant] [Additional Keywords]
3. Front-load most searched terms
4. NO spam: L@@K, WOW, AMAZING, MUST SEE, !!!
5. Title Case capitalization
6. Include color/size if space allows

Return as JSON:
{
  "title": "75-80 char Cassini-optimized title",
  "length": 78,
  "keywords": ["primary", "search", "terms"],
  "score": 85
}`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    return {
      title: product.title.substring(0, 80),
      length: Math.min(product.title.length, 80),
      keywords: [],
      score: 50,
    }
  }

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        title: (parsed.title || product.title).substring(0, 80),
        length: Math.min(parsed.title?.length || 0, 80),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        score: typeof parsed.score === 'number' ? parsed.score : 50,
      }
    }
  } catch {
    // Parse error - return cleaned version
  }

  return {
    title: product.title.substring(0, 80),
    length: Math.min(product.title.length, 80),
    keywords: [],
    score: 50,
  }
}

/**
 * Generate SEO bullet points for a product
 */
export async function generateBulletPoints(
  product: { title: string; category?: string; features?: string[] },
  options: { count?: number; model?: string } = {}
): Promise<string[]> {
  const { count = 5, model = 'claude-sonnet-4-20250514' } = options
  const client = getClient()

  const response = await client.messages.create({
    model,
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `Generate ${count} compelling eBay listing bullet points for this product. Each bullet should highlight a key benefit or feature. Make them concise but persuasive.

Product: ${product.title}
Category: ${product.category || 'General'}
Known Features: ${product.features?.join(', ') || 'None specified'}

Return as a JSON array of strings, e.g., ["Bullet 1", "Bullet 2"]`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    return []
  }

  try {
    const jsonMatch = content.text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // Fall back to line parsing
    return content.text
      .split('\n')
      .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('•'))
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .slice(0, count)
  }

  return []
}

// Helper functions

function buildSystemPrompt(): string {
  return `You are a product data normalization expert for eBay dropshipping, specialized in Cassini algorithm optimization. Your task is to analyze raw product data and output a structured, normalized version optimized for maximum eBay search visibility.

Category Taxonomy:
${JSON.stringify(CATEGORY_TAXONOMY, null, 2)}

=== CASSINI ALGORITHM OPTIMIZATION (CRITICAL) ===

eBay's Cassini search algorithm determines listing visibility. Follow these rules:

TITLE OPTIMIZATION (75-80 characters ideal):
- Front-load the most important keywords (brand, product type, key feature)
- Use all 80 characters - every character is an opportunity for keywords
- Format: [Brand] [Product Type] [Key Feature] [Model/Size] [Additional Keywords]
- NO spam terms: L@@K, WOW, AMAZING, MUST SEE, !!! (causes penalties)
- NO excessive punctuation or symbols
- Use natural language buyers search for, not seller jargon
- Include size/color/material if space allows

ITEM SPECIFICS (8-12 minimum):
- Brand, Model, Type, Color, Size, Material, Condition are essential
- The more specifics, the more filter visibility
- Extract every attribute possible from the product data

KEYWORDS:
- Primary: What buyers type to find this product
- Secondary: Related search terms
- Avoid: Generic filler words, spam terms

Guidelines:
1. Create TWO titles: normalizedTitle (clean) and cassiniOptimization.optimizedTitle (80-char Cassini-optimized)
2. Extract brand accurately - if unknown, use "Unbranded"
3. Map to the most specific category/subcategory from the taxonomy
4. Generate 8-12 item specifics for filter visibility
5. Generate compelling bullet points with keywords
6. Identify quality signals honestly
7. Flag any issues that could affect Cassini visibility

Output ONLY valid JSON matching the NormalizedProductOutput schema.`
}

function buildProductPrompt(product: RawProductInput): string {
  return `Normalize this product for eBay Cassini optimization:

Title: ${product.title}
Brand: ${product.brand || 'Not specified'}
Category: ${product.category || 'Not specified'}
Description: ${product.description || 'Not available'}
Bullet Points: ${product.bulletPoints?.join(' | ') || 'None'}
Amazon Price: ${product.amazonPrice ? `$${product.amazonPrice}` : 'Unknown'}
eBay Price: ${product.ebayPrice ? `$${product.ebayPrice}` : 'Unknown'}
Sales Rank: ${product.salesRank || 'Unknown'}
Reviews: ${product.reviewCount || 0} reviews, ${product.rating || 0} stars
ASIN: ${product.asin || 'N/A'}

Output the normalized product as JSON:
{
  "normalizedTitle": "Clean, professional title",
  "normalizedBrand": "Brand name or Unbranded",
  "normalizedCategory": "Main category from taxonomy",
  "subcategory": "Subcategory or null",
  "bulletPoints": ["5 compelling bullet points with keywords"],
  "keyFeatures": ["Key product features"],
  "specifications": {"Brand": "value", "Type": "value", "Size": "value", "Material": "value", "Color": "value"},
  "targetAudience": ["Who this product is for"],
  "useCase": "Primary use case",
  "qualitySignals": {
    "brandRecognition": "high|medium|low|unknown",
    "productClarity": "high|medium|low",
    "marketDemand": "high|medium|low",
    "competitionLevel": "high|medium|low",
    "profitPotential": "high|medium|low",
    "listingReadiness": "ready|needs_work|not_ready",
    "issues": ["Any problems found"],
    "strengths": ["Product strengths"]
  },
  "seoKeywords": ["Buyer search terms"],
  "suggestedTags": ["eBay item specifics"],
  "confidenceScore": 0.0-1.0,
  "cassiniOptimization": {
    "optimizedTitle": "75-80 char Cassini-optimized title with front-loaded keywords",
    "titleLength": 78,
    "primaryKeywords": ["top 3-5 buyer search terms"],
    "secondaryKeywords": ["additional search terms"],
    "avoidedTerms": ["spam terms that were removed"],
    "itemSpecifics": {"Brand": "value", "Model": "value", "Type": "value", "Color": "value", "Size": "value", "Material": "value", "Condition": "New", "MPN": "value"},
    "itemSpecificsCount": 8,
    "cassiniScore": 75,
    "optimizationNotes": ["Notes on title optimization decisions"]
  }
}

CRITICAL: The cassiniOptimization.optimizedTitle MUST be 75-80 characters with front-loaded keywords for maximum Cassini visibility.`
}

function validateAndEnrichOutput(
  output: NormalizedProductOutput,
  input: RawProductInput
): NormalizedProductOutput {
  // Build Cassini optimization with defaults if not provided
  const cassiniOpt = output.cassiniOptimization || {}
  const optimizedTitle = cassiniOpt.optimizedTitle || output.normalizedTitle || input.title

  // Calculate Cassini score estimate based on title length and keywords
  const titleLength = optimizedTitle?.length || 0
  let estimatedCassiniScore = 50
  if (titleLength >= 75 && titleLength <= 80) estimatedCassiniScore += 20
  else if (titleLength >= 60) estimatedCassiniScore += 10
  else if (titleLength < 40) estimatedCassiniScore -= 10

  const itemSpecificsCount = Object.keys(cassiniOpt.itemSpecifics || output.specifications || {}).length
  if (itemSpecificsCount >= 10) estimatedCassiniScore += 15
  else if (itemSpecificsCount >= 6) estimatedCassiniScore += 10
  else if (itemSpecificsCount < 3) estimatedCassiniScore -= 10

  // Check for spam terms
  const spamTerms = ['L@@K', 'WOW', 'AMAZING', 'MUST SEE', '!!!']
  const hasSpam = spamTerms.some(term =>
    (optimizedTitle || '').toUpperCase().includes(term)
  )
  if (hasSpam) estimatedCassiniScore -= 20

  // Ensure required fields have values
  return {
    normalizedTitle: output.normalizedTitle || input.title,
    normalizedBrand: output.normalizedBrand || 'Unbranded',
    normalizedCategory: output.normalizedCategory || 'Uncategorized',
    subcategory: output.subcategory || null,
    bulletPoints: Array.isArray(output.bulletPoints) ? output.bulletPoints.slice(0, 5) : [],
    keyFeatures: Array.isArray(output.keyFeatures) ? output.keyFeatures : [],
    specifications: output.specifications || {},
    targetAudience: Array.isArray(output.targetAudience) ? output.targetAudience : [],
    useCase: output.useCase || 'General',
    qualitySignals: {
      brandRecognition: output.qualitySignals?.brandRecognition || 'unknown',
      productClarity: output.qualitySignals?.productClarity || 'medium',
      marketDemand: output.qualitySignals?.marketDemand || 'medium',
      competitionLevel: output.qualitySignals?.competitionLevel || 'medium',
      profitPotential: output.qualitySignals?.profitPotential || 'medium',
      listingReadiness: output.qualitySignals?.listingReadiness || 'needs_work',
      issues: output.qualitySignals?.issues || [],
      strengths: output.qualitySignals?.strengths || [],
    },
    seoKeywords: Array.isArray(output.seoKeywords) ? output.seoKeywords : [],
    suggestedTags: Array.isArray(output.suggestedTags) ? output.suggestedTags : [],
    confidenceScore: typeof output.confidenceScore === 'number'
      ? Math.min(1, Math.max(0, output.confidenceScore))
      : 0.5,
    cassiniOptimization: {
      optimizedTitle: optimizedTitle.substring(0, 80),  // Enforce max length
      titleLength: Math.min(optimizedTitle.length, 80),
      primaryKeywords: Array.isArray(cassiniOpt.primaryKeywords) ? cassiniOpt.primaryKeywords.slice(0, 5) : [],
      secondaryKeywords: Array.isArray(cassiniOpt.secondaryKeywords) ? cassiniOpt.secondaryKeywords : [],
      avoidedTerms: Array.isArray(cassiniOpt.avoidedTerms) ? cassiniOpt.avoidedTerms : [],
      itemSpecifics: cassiniOpt.itemSpecifics || output.specifications || {},
      itemSpecificsCount,
      cassiniScore: typeof cassiniOpt.cassiniScore === 'number'
        ? cassiniOpt.cassiniScore
        : Math.max(0, Math.min(100, estimatedCassiniScore)),
      optimizationNotes: Array.isArray(cassiniOpt.optimizationNotes) ? cassiniOpt.optimizationNotes : [],
    },
  }
}

// Export types for use elsewhere
export type { Anthropic }
