/**
 * Job Handlers for Automation Tasks
 *
 * Implements the actual logic for each job type.
 */

import { registerJobHandler, type Job, type JobResult } from './processor'
import { searchZikProducts, getCategories } from '@/lib/automation/zik'
import { getKeepaClient } from '@/lib/integrations/keepa'
import { supabase } from '@/lib/supabase'
import { continuePipeline } from '@/lib/pipeline'
import {
  normalizeProduct as aiNormalizeProduct,
  calculateQualityScore as aiCalculateQualityScore,
  generateSku as aiGenerateSku,
} from '@/lib/ai'

/**
 * ZIK Research Job Handler
 *
 * Payload:
 * {
 *   query?: string,
 *   category?: string,
 *   minSold?: number,
 *   maxResults?: number
 * }
 */
registerJobHandler('zik_research', async (job: Job): Promise<JobResult> => {
  const { query, category, minSold = 5, maxResults = 50, pipelineId, filters } = job.payload

  // Use filters object if provided, otherwise use individual params
  const searchFilters = filters || {
    query,
    category,
    minSold,
    dateRange: '30',
  }

  const result = await searchZikProducts(searchFilters, { maxResults })

  if (!result.success) {
    // Notify pipeline of failure
    if (pipelineId) {
      await continuePipeline(pipelineId, 'research', { error: result.error })
    }
    return { success: false, error: result.error }
  }

  // Save products to staging table or process directly
  const { savedIds, savedCount } = await saveZikProductsToStaging(result.products)

  // Continue pipeline if this is part of one
  if (pipelineId) {
    await continuePipeline(pipelineId, 'research', { productIds: savedIds })
  }

  return {
    success: true,
    data: {
      query: searchFilters.query,
      found: result.totalResults,
      saved: savedCount,
      hasMore: result.hasMorePages,
      productIds: savedIds,
    },
  }
})

/**
 * Keepa Lookup Job Handler
 *
 * Payload:
 * {
 *   asins: string[],
 *   domain?: string
 * }
 */
registerJobHandler('keepa_lookup', async (job: Job): Promise<JobResult> => {
  const { asins, domain = 'US', pipelineId, productIds } = job.payload

  // Support both direct ASIN list and product IDs for pipeline
  let asinsToLookup = asins

  if (!asinsToLookup && productIds) {
    // Fetch ASINs from raw products
    const { data } = await supabase
      .from('raw_products')
      .select('asin')
      .in('id', productIds)

    asinsToLookup = data?.map((p) => p.asin).filter(Boolean) || []
  }

  if (!asinsToLookup || asinsToLookup.length === 0) {
    if (pipelineId) {
      await continuePipeline(pipelineId, 'sourcing', { error: 'No ASINs to lookup' })
    }
    return { success: false, error: 'No ASINs provided' }
  }

  const keepa = getKeepaClient()
  const products = await keepa.getProducts(asinsToLookup, {
    domain: domain as any,
    stats: 90,
    buybox: true,
    rating: true,
  })

  // Save to raw_products
  const { savedIds, savedCount } = await saveKeepaProducts(products, domain)

  // Continue pipeline if this is part of one
  if (pipelineId) {
    await continuePipeline(pipelineId, 'sourcing', { productIds: savedIds })
  }

  return {
    success: true,
    data: {
      requested: asinsToLookup.length,
      found: products.length,
      saved: savedCount,
      productIds: savedIds,
      tokensRemaining: keepa.getTokensRemaining(),
    },
  }
})

/**
 * Normalize Products Job Handler
 *
 * Processes raw_products and creates normalized_products using AI
 *
 * Payload:
 * {
 *   batchSize?: number,
 *   rawProductIds?: string[]
 * }
 */
registerJobHandler('normalize_products', async (job: Job): Promise<JobResult> => {
  const { batchSize = 10, rawProductIds, pipelineId, productIds } = job.payload

  // Support both rawProductIds and productIds (from pipeline)
  const idsToProcess = rawProductIds || productIds

  // Get unprocessed raw products
  let query = supabase
    .from('raw_products')
    .select('*')
    .eq('is_processed', false)
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (idsToProcess && idsToProcess.length > 0) {
    query = query.in('id', idsToProcess)
  }

  const { data: rawProducts, error } = await query

  if (error || !rawProducts || rawProducts.length === 0) {
    if (pipelineId) {
      await continuePipeline(pipelineId, 'normalizing', { productIds: [] })
    }
    return {
      success: true,
      data: { processed: 0, message: 'No products to normalize' },
    }
  }

  let normalizedCount = 0
  const normalizedIds: string[] = []
  const errors: string[] = []

  for (const rawProduct of rawProducts) {
    try {
      // For now, do basic normalization without AI
      // In production, this would call Claude API
      const normalized = await normalizeProduct(rawProduct)

      if (normalized) {
        // Insert into normalized_products
        const { data: inserted, error: insertError } = await supabase
          .from('normalized_products')
          .insert(normalized)
          .select('id')
          .single()

        if (!insertError && inserted) {
          // Mark raw product as processed
          await supabase
            .from('raw_products')
            .update({ is_processed: true, processed_at: new Date().toISOString() })
            .eq('id', rawProduct.id)

          normalizedIds.push(inserted.id)
          normalizedCount++
        } else if (insertError) {
          errors.push(`Failed to insert normalized product for ${rawProduct.asin}: ${insertError.message}`)
        }
      }
    } catch (err) {
      errors.push(`Error normalizing ${rawProduct.asin}: ${err}`)
    }
  }

  // Continue pipeline if this is part of one
  if (pipelineId) {
    await continuePipeline(pipelineId, 'normalizing', { productIds: normalizedIds })
  }

  return {
    success: true,
    data: {
      processed: normalizedCount,
      total: rawProducts.length,
      productIds: normalizedIds,
      errors: errors.length > 0 ? errors : undefined,
    },
  }
})

/**
 * Generate SKUs Job Handler
 *
 * Creates SKUs from high-quality normalized products
 *
 * Payload:
 * {
 *   minScore?: number,
 *   batchSize?: number
 * }
 */
registerJobHandler('generate_skus', async (job: Job): Promise<JobResult> => {
  const { minScore = 70, batchSize = 20, pipelineId, productIds } = job.payload

  // Build query for normalized products
  let query = supabase
    .from('normalized_products')
    .select('*')
    .gte('quality_score', minScore)
    .is('sku_id', null)
    .order('quality_score', { ascending: false })
    .limit(batchSize)

  // If specific product IDs provided (from pipeline), use those
  if (productIds && productIds.length > 0) {
    query = supabase
      .from('normalized_products')
      .select('*')
      .in('id', productIds)
      .is('sku_id', null)
  }

  const { data: products, error } = await query

  if (error || !products || products.length === 0) {
    if (pipelineId) {
      await continuePipeline(pipelineId, 'generating', { productIds: [] })
    }
    return {
      success: true,
      data: { generated: 0, message: 'No eligible products for SKU generation' },
    }
  }

  let generatedCount = 0
  const generatedSkuIds: string[] = []

  for (const product of products) {
    try {
      // Generate SKU
      const skuCode = generateSkuCode(product)

      const { data: sku, error: skuError } = await supabase
        .from('skus')
        .insert({
          normalized_product_id: product.id,
          sku_code: skuCode,
          price_band: determinePriceBand(product.cost_price),
          use_case: product.normalized_category || 'general',
          cost_price: product.cost_price,
          sell_price: calculateSellPrice(product.cost_price),
          status: 'ready',
        })
        .select()
        .single()

      if (!skuError && sku) {
        // Update normalized product with SKU reference
        await supabase
          .from('normalized_products')
          .update({ sku_id: sku.id })
          .eq('id', product.id)

        generatedSkuIds.push(sku.id)
        generatedCount++
      }
    } catch (err) {
      console.error(`Error generating SKU for product ${product.id}:`, err)
    }
  }

  // Continue pipeline if this is part of one
  if (pipelineId) {
    await continuePipeline(pipelineId, 'generating', { productIds: generatedSkuIds })
  }

  return {
    success: true,
    data: {
      generated: generatedCount,
      eligible: products.length,
      skuIds: generatedSkuIds,
    },
  }
})

// Helper functions

async function saveZikProductsToStaging(
  products: Array<{
    title: string
    price: number | null
    soldCount: number | null
    category: string | null
    ebayItemId: string | null
  }>
): Promise<{ savedIds: string[]; savedCount: number }> {
  const savedIds: string[] = []
  const batchId = `zik_${Date.now()}`

  for (const product of products) {
    if (!product.title || !product.ebayItemId) continue

    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('raw_products')
        .select('id')
        .eq('source_item_id', product.ebayItemId)
        .single()

      if (existing) {
        savedIds.push(existing.id)
        continue
      }

      // Insert new product
      const { data: inserted, error } = await supabase
        .from('raw_products')
        .insert({
          title: product.title,
          source: 'zik',
          source_item_id: product.ebayItemId,
          source_batch_id: batchId,
          ebay_price: product.price,
          ebay_sold_count: product.soldCount,
          category: product.category,
        })
        .select('id')
        .single()

      if (!error && inserted) {
        savedIds.push(inserted.id)
      }
    } catch {
      // Ignore individual errors
    }
  }

  return { savedIds, savedCount: savedIds.length }
}

async function saveKeepaProducts(products: any[], domain: string): Promise<{ savedIds: string[]; savedCount: number }> {
  const savedIds: string[] = []
  const batchId = `keepa_job_${Date.now()}`

  for (const product of products) {
    try {
      const { data: existing } = await supabase
        .from('raw_products')
        .select('id')
        .eq('asin', product.asin)
        .single()

      if (existing) {
        await supabase
          .from('raw_products')
          .update({
            keepa_data: product.rawData,
            amazon_price: product.buyBoxPrice || product.amazonPrice,
            sales_rank: product.salesRank,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        savedIds.push(existing.id)
      } else {
        const { data: inserted, error } = await supabase
          .from('raw_products')
          .insert({
            asin: product.asin,
            amazon_url: `https://www.amazon.com/dp/${product.asin}`,
            keepa_data: product.rawData,
            title: product.title,
            brand: product.brand,
            amazon_price: product.buyBoxPrice || product.amazonPrice,
            sales_rank: product.salesRank,
            review_count: product.reviewCount,
            rating: product.rating,
            source: 'keepa',
            source_batch_id: batchId,
          })
          .select('id')
          .single()

        if (!error && inserted) {
          savedIds.push(inserted.id)
        }
      }
    } catch {
      // Ignore individual errors
    }
  }

  return { savedIds, savedCount: savedIds.length }
}

async function normalizeProduct(rawProduct: any): Promise<any | null> {
  if (!rawProduct.title) return null

  // Try AI normalization if API key is available
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const aiResult = await aiNormalizeProduct({
        id: rawProduct.id,
        title: rawProduct.title,
        brand: rawProduct.brand,
        category: rawProduct.category,
        description: rawProduct.description,
        amazonPrice: rawProduct.amazon_price,
        ebayPrice: rawProduct.ebay_price,
        salesRank: rawProduct.sales_rank,
        reviewCount: rawProduct.review_count,
        rating: rawProduct.rating,
        asin: rawProduct.asin,
      })

      return {
        raw_product_id: rawProduct.id,
        normalized_title: aiResult.normalizedTitle,
        normalized_category: aiResult.normalizedCategory,
        normalized_brand: aiResult.normalizedBrand,
        subcategory: aiResult.subcategory,
        bullet_points: aiResult.bulletPoints,
        key_features: aiResult.keyFeatures,
        specifications: aiResult.specifications,
        target_audience: aiResult.targetAudience,
        use_case: aiResult.useCase,
        quality_signals: aiResult.qualitySignals,
        seo_keywords: aiResult.seoKeywords,
        suggested_tags: aiResult.suggestedTags,
        confidence_score: aiResult.confidenceScore,
        cost_price: rawProduct.amazon_price || 0,
        quality_score: null, // Will be calculated separately
        demand_confidence: null,
        ai_model: 'claude-sonnet-4-20250514',
      }
    } catch (error) {
      console.warn('AI normalization failed, falling back to basic:', error)
    }
  }

  // Fallback to basic normalization
  const title = rawProduct.title
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)

  return {
    raw_product_id: rawProduct.id,
    normalized_title: title,
    normalized_category: rawProduct.category || 'Uncategorized',
    normalized_brand: rawProduct.brand || 'Unbranded',
    bullet_points: [],
    cost_price: rawProduct.amazon_price || 0,
    quality_score: calculateBasicQualityScore(rawProduct),
    demand_confidence: calculateDemandConfidence(rawProduct),
    ai_model: 'basic',
  }
}

function calculateBasicQualityScore(product: any): number {
  let score = 50 // Base score

  // Rating bonus
  if (product.rating >= 4.5) score += 20
  else if (product.rating >= 4.0) score += 15
  else if (product.rating >= 3.5) score += 10

  // Review count bonus
  if (product.review_count >= 1000) score += 15
  else if (product.review_count >= 100) score += 10
  else if (product.review_count >= 10) score += 5

  // Sales rank bonus (lower is better)
  if (product.sales_rank && product.sales_rank < 10000) score += 15
  else if (product.sales_rank && product.sales_rank < 50000) score += 10
  else if (product.sales_rank && product.sales_rank < 100000) score += 5

  return Math.min(100, score)
}

function calculateDemandConfidence(product: any): number {
  let confidence = 0.5 // Base confidence

  if (product.sales_rank && product.sales_rank < 50000) {
    confidence += 0.3
  }

  if (product.review_count && product.review_count > 100) {
    confidence += 0.2
  }

  return Math.min(1, confidence)
}

function generateSkuCode(product: any): string {
  const prefix = (product.normalized_category || 'GEN').slice(0, 3).toUpperCase()
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

function determinePriceBand(price: number): string {
  if (price < 10) return 'budget'
  if (price < 25) return 'low'
  if (price < 50) return 'mid'
  if (price < 100) return 'high'
  return 'premium'
}

function calculateSellPrice(costPrice: number): number {
  // 30% markup minimum
  const minMarkup = costPrice * 1.3
  // Add eBay fees (~13%)
  const withFees = minMarkup / 0.87
  // Round to .99
  return Math.ceil(withFees) - 0.01
}
