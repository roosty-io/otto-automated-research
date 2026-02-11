/**
 * Claude AI Client for Product Processing
 *
 * Uses Claude to intelligently normalize product data:
 * - Clean and standardize titles
 * - Extract brand, model, specifications
 * - Map to normalized categories
 * - Generate SEO-optimized bullet points
 * - Detect product quality signals
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
  specifications: Record<string, string>
  targetAudience: string[]
  useCase: string
  qualitySignals: QualitySignals
  seoKeywords: string[]
  suggestedTags: string[]
  confidenceScore: number
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
 */
export async function cleanProductTitle(
  title: string,
  options: { model?: string } = {}
): Promise<string> {
  const { model = 'claude-haiku-4-20250514' } = options
  const client = getClient()

  const response = await client.messages.create({
    model,
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Clean this product title for eBay listing. Remove excessive keywords, fix capitalization, keep essential info. Return ONLY the cleaned title, nothing else.

Title: ${title}`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    return title
  }

  return content.text.trim()
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
  return `You are a product data normalization expert for eBay dropshipping. Your task is to analyze raw product data and output a structured, normalized version optimized for eBay listings.

Category Taxonomy:
${JSON.stringify(CATEGORY_TAXONOMY, null, 2)}

Guidelines:
1. Normalize titles: Remove spam keywords, fix capitalization, keep essential product info
2. Extract brand accurately - if unknown, use "Unbranded" or "Generic"
3. Map to the most specific category/subcategory from the taxonomy
4. Generate compelling, accurate bullet points
5. Identify quality signals honestly - don't inflate scores
6. Flag any issues that could affect listing success

Output ONLY valid JSON matching the NormalizedProductOutput schema.`
}

function buildProductPrompt(product: RawProductInput): string {
  return `Normalize this product:

Title: ${product.title}
Brand: ${product.brand || 'Not specified'}
Category: ${product.category || 'Not specified'}
Description: ${product.description || 'Not available'}
Amazon Price: ${product.amazonPrice ? `$${product.amazonPrice}` : 'Unknown'}
eBay Price: ${product.ebayPrice ? `$${product.ebayPrice}` : 'Unknown'}
Sales Rank: ${product.salesRank || 'Unknown'}
Reviews: ${product.reviewCount || 0} reviews, ${product.rating || 0} stars
ASIN: ${product.asin || 'N/A'}

Output the normalized product as JSON with these fields:
{
  "normalizedTitle": "Clean, professional title",
  "normalizedBrand": "Brand name or Unbranded",
  "normalizedCategory": "Main category from taxonomy",
  "subcategory": "Subcategory or null",
  "bulletPoints": ["5 compelling bullet points"],
  "keyFeatures": ["Key product features"],
  "specifications": {"Size": "value", "Material": "value"},
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
  "seoKeywords": ["Relevant search terms"],
  "suggestedTags": ["eBay item specifics"],
  "confidenceScore": 0.0-1.0
}`
}

function validateAndEnrichOutput(
  output: NormalizedProductOutput,
  input: RawProductInput
): NormalizedProductOutput {
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
  }
}

// Export types for use elsewhere
export type { Anthropic }
