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
 * Keepa Research Job Handler (No Browser Required)
 *
 * Alternative to ZIK research that uses Keepa's Best Sellers API
 * to find trending Amazon products for eBay arbitrage.
 *
 * Payload:
 * {
 *   categoryId?: number,    // Keepa category ID (optional, uses Home & Garden default)
 *   categoryName?: string,  // Human-readable name for logging
 *   maxResults?: number,
 *   domain?: string,
 *   pipelineId?: string
 * }
 */
registerJobHandler('keepa_research', async (job: Job): Promise<JobResult> => {
  const {
    categoryId,
    categoryName = 'General',
    maxResults = 50,
    domain = 'US',
    pipelineId,
    filters,
  } = job.payload

  // Category mapping for common categories
  const categoryMap: Record<string, number> = {
    'Home & Garden': 1055398,
    'Kitchen': 284507,
    'Tools': 228013,
    'Electronics': 172282,
    'Sports': 3375251,
    'Toys': 165793011,
    'Beauty': 3760911,
    'Health': 3760901,
    'Pet Supplies': 2619533011,
    'Office': 1064954,
    'Automotive': 15684181,
  }

  // Get category ID from name or use provided ID
  const targetCategoryId = categoryId ||
    categoryMap[filters?.category || categoryName] ||
    categoryMap['Home & Garden']

  console.log(`[Keepa Research] Starting research for category: ${categoryName} (${targetCategoryId})`)

  try {
    const keepa = getKeepaClient()

    // Get best sellers for the category
    // Note: Keepa 'range' is days of history (0, 30, 90, 180), not result count
    const bestSellers = await keepa.getBestSellers(targetCategoryId, {
      domain: domain as any,
      range: 30, // 30 days of bestseller history
    })

    if (!bestSellers || bestSellers.length === 0) {
      if (pipelineId) {
        await continuePipeline(pipelineId, 'research', { error: 'No best sellers found' })
      }
      return { success: false, error: 'No best sellers found for category' }
    }

    console.log(`[Keepa Research] Found ${bestSellers.length} best sellers, fetching details...`)

    // Get detailed product info for top items
    const asins = bestSellers.slice(0, maxResults).map(bs => bs.asin)
    const products = await keepa.getProducts(asins, {
      domain: domain as any,
      stats: 90,
      buybox: true,
      rating: true,
    })

    console.log(`[Keepa Research] Retrieved details for ${products.length} products`)

    // Filter for products suitable for eBay arbitrage
    const eligibleProducts = products.filter(p => {
      // Must have buybox price
      if (!p.buyBoxPrice && !p.amazonPrice) return false
      // Reasonable price range for dropshipping ($10-200)
      const price = p.buyBoxPrice || p.amazonPrice || 0
      if (price < 10 || price > 200) return false
      // Good rating
      if (p.rating && p.rating < 3.5) return false
      // Not adult content
      if (p.isAdult) return false
      return true
    })

    console.log(`[Keepa Research] ${eligibleProducts.length} products eligible for arbitrage`)

    // Save to raw_products
    const { savedIds, savedCount } = await saveKeepaResearchProducts(eligibleProducts, categoryName, domain)

    // Continue pipeline if this is part of one
    if (pipelineId) {
      await continuePipeline(pipelineId, 'research', { productIds: savedIds })
    }

    return {
      success: true,
      data: {
        category: categoryName,
        categoryId: targetCategoryId,
        bestSellersFound: bestSellers.length,
        detailsFetched: products.length,
        eligible: eligibleProducts.length,
        saved: savedCount,
        productIds: savedIds,
        tokensRemaining: keepa.getTokensRemaining(),
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Keepa Research] Error:`, error)

    if (pipelineId) {
      await continuePipeline(pipelineId, 'research', { error: errorMessage })
    }

    return { success: false, error: errorMessage }
  }
})

/**
 * Save Keepa research products to staging
 */
async function saveKeepaResearchProducts(
  products: any[],
  category: string,
  domain: string
): Promise<{ savedIds: string[]; savedCount: number }> {
  const savedIds: string[] = []
  const batchId = `keepa_research_${Date.now()}`

  for (const product of products) {
    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('raw_products')
        .select('id')
        .eq('asin', product.asin)
        .single()

      if (existing) {
        // Update existing
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
        // Insert new
        const { data: inserted, error } = await supabase
          .from('raw_products')
          .insert({
            asin: product.asin,
            title: product.title,
            brand: product.brand,
            amazon_url: `https://www.amazon.com/dp/${product.asin}`,
            amazon_price: product.buyBoxPrice || product.amazonPrice,
            sales_rank: product.salesRank,
            review_count: product.reviewCount,
            rating: product.rating,
            keepa_data: product.rawData,
            source: 'keepa_research',
            source_batch_id: batchId,
            category: category,
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

// =============================================================================
// CASSINI OPTIMIZATION JOB HANDLERS
// =============================================================================

/**
 * Cassini Optimize Job Handler
 *
 * Scores and optimizes products for eBay Cassini algorithm visibility.
 *
 * Payload:
 * {
 *   productIds: string[],
 *   minScore?: number,
 *   optimizeTitles?: boolean,
 *   prioritizeByVisibility?: boolean,
 *   targetTopRatedPlus?: boolean,
 *   pipelineId?: string
 * }
 */
registerJobHandler('cassini_optimize', async (job: Job): Promise<JobResult> => {
  const {
    productIds,
    minScore = 50,
    optimizeTitles = true,
    prioritizeByVisibility = true,
    targetTopRatedPlus = false,
    pipelineId,
  } = job.payload

  if (!productIds || productIds.length === 0) {
    if (pipelineId) {
      await continuePipeline(pipelineId, 'cassini_optimizing', { productIds: [] })
    }
    return { success: false, error: 'No product IDs provided' }
  }

  // Get products to optimize
  const { data: products, error } = await supabase
    .from('normalized_products')
    .select('*')
    .in('id', productIds)

  if (error || !products || products.length === 0) {
    if (pipelineId) {
      await continuePipeline(pipelineId, 'cassini_optimizing', { productIds: [] })
    }
    return { success: false, error: 'No products found' }
  }

  // Track metrics
  const metrics = {
    productsScored: 0,
    avgCassiniScore: 0,
    highVisibilityProducts: 0,
    mediumVisibilityProducts: 0,
    lowVisibilityProducts: 0,
    titlesOptimized: 0,
    productsFiltered: 0,
  }

  const optimizedProductIds: string[] = []
  const cassiniScores: number[] = []

  for (const product of products) {
    try {
      // Calculate Cassini visibility score
      const cassiniScore = calculateCassiniScore(product, targetTopRatedPlus)
      metrics.productsScored++
      cassiniScores.push(cassiniScore)

      // Categorize by visibility
      if (cassiniScore >= 70) {
        metrics.highVisibilityProducts++
      } else if (cassiniScore >= 50) {
        metrics.mediumVisibilityProducts++
      } else {
        metrics.lowVisibilityProducts++
      }

      // Filter by minimum score
      if (cassiniScore < minScore) {
        metrics.productsFiltered++
        continue
      }

      // Optimize title if enabled
      let optimizedTitle = product.normalized_title
      if (optimizeTitles) {
        optimizedTitle = optimizeTitleForCassini(product.normalized_title)
        if (optimizedTitle !== product.normalized_title) {
          metrics.titlesOptimized++
        }
      }

      // Update product with Cassini data
      await supabase
        .from('normalized_products')
        .update({
          cassini_score: cassiniScore,
          cassini_optimized_title: optimizedTitle,
          cassini_optimized_at: new Date().toISOString(),
        })
        .eq('id', product.id)

      optimizedProductIds.push(product.id)
    } catch (err) {
      console.error(`Error optimizing product ${product.id}:`, err)
    }
  }

  // Calculate average score
  if (cassiniScores.length > 0) {
    metrics.avgCassiniScore = Math.round(
      cassiniScores.reduce((a, b) => a + b, 0) / cassiniScores.length
    )
  }

  // Sort by visibility if enabled
  if (prioritizeByVisibility) {
    // Sort in database query would be more efficient for large sets
    // For now, the consumer can sort by cassini_score
  }

  // Continue pipeline if this is part of one
  if (pipelineId) {
    await continuePipeline(pipelineId, 'cassini_optimizing', {
      productIds: optimizedProductIds,
      cassiniMetrics: metrics,
    })
  }

  return {
    success: true,
    data: {
      processed: metrics.productsScored,
      optimized: optimizedProductIds.length,
      filtered: metrics.productsFiltered,
      metrics,
      productIds: optimizedProductIds,
    },
  }
})

/**
 * New Listing Boost Job Handler
 *
 * Manages the 48-hour new listing visibility boost window.
 * Staggers listings across stores to maximize boost coverage.
 *
 * Payload:
 * {
 *   storeGroupId?: string,
 *   storeIds?: string[],
 *   listingsPerStore?: number,
 *   staggerMinutes?: number
 * }
 */
registerJobHandler('new_listing_boost', async (job: Job): Promise<JobResult> => {
  const {
    storeGroupId,
    storeIds,
    listingsPerStore = 5,
    staggerMinutes = 30,
  } = job.payload

  // Get stores to optimize
  let stores: any[] = []

  if (storeGroupId) {
    const { data: group } = await supabase
      .from('store_groups')
      .select('store_ids')
      .eq('id', storeGroupId)
      .single()

    if (group?.store_ids) {
      const { data } = await supabase
        .from('stores')
        .select('id, store_name, health_data')
        .in('id', group.store_ids)
        .eq('is_active', true)

      stores = data || []
    }
  } else if (storeIds) {
    const { data } = await supabase
      .from('stores')
      .select('id, store_name, health_data')
      .in('id', storeIds)
      .eq('is_active', true)

    stores = data || []
  }

  if (stores.length === 0) {
    return { success: false, error: 'No active stores found' }
  }

  // Get pending SKUs that need listing
  const { data: pendingAssignments } = await supabase
    .from('store_sku_assignments')
    .select('id, store_id, sku_id')
    .eq('listing_status', 'pending')
    .in('store_id', stores.map((s) => s.id))
    .limit(stores.length * listingsPerStore)

  if (!pendingAssignments || pendingAssignments.length === 0) {
    return {
      success: true,
      data: { message: 'No pending assignments to boost' },
    }
  }

  // Group by store
  const byStore = new Map<string, typeof pendingAssignments>()
  for (const assignment of pendingAssignments) {
    if (!byStore.has(assignment.store_id)) {
      byStore.set(assignment.store_id, [])
    }
    byStore.get(assignment.store_id)!.push(assignment)
  }

  // Schedule staggered listings for each store
  const scheduledCount = 0
  let scheduleOffset = 0

  for (const [storeId, assignments] of byStore) {
    const limitedAssignments = assignments.slice(0, listingsPerStore)

    for (const assignment of limitedAssignments) {
      // Schedule the listing with stagger
      const scheduledTime = new Date(Date.now() + scheduleOffset * 60 * 1000)

      await supabase
        .from('store_sku_assignments')
        .update({
          listing_status: 'scheduled',
          scheduled_at: scheduledTime.toISOString(),
          boost_window_starts: scheduledTime.toISOString(),
          boost_window_ends: new Date(scheduledTime.getTime() + 48 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', assignment.id)

      scheduleOffset += staggerMinutes
    }
  }

  return {
    success: true,
    data: {
      storesProcessed: byStore.size,
      listingsScheduled: pendingAssignments.length,
      staggerIntervalMinutes: staggerMinutes,
      estimatedCompletionTime: new Date(Date.now() + scheduleOffset * 60 * 1000).toISOString(),
    },
  }
})

/**
 * Cassini Reprice Job Handler
 *
 * Reprices listings with Cassini visibility factors in mind.
 * Accounts for seller status, visibility boost, and competition.
 *
 * Payload:
 * {
 *   assignmentIds?: string[],
 *   storeId?: string,
 *   adjustForVisibility?: boolean,
 *   maxPriceChange?: number
 * }
 */
registerJobHandler('cassini_reprice', async (job: Job): Promise<JobResult> => {
  const {
    assignmentIds,
    storeId,
    adjustForVisibility = true,
    maxPriceChange = 10, // Max % change per adjustment
  } = job.payload

  // Get assignments to reprice
  let query = supabase
    .from('store_sku_assignments')
    .select(`
      id, current_price, store_id, sku_id,
      sku:skus(id, sell_price, normalized_product:normalized_products(cassini_score)),
      store:stores(id, health_data)
    `)
    .eq('listing_status', 'active')

  if (assignmentIds) {
    query = query.in('id', assignmentIds)
  } else if (storeId) {
    query = query.eq('store_id', storeId)
  }

  query = query.limit(100)

  const { data: assignments, error } = await query

  if (error || !assignments || assignments.length === 0) {
    return {
      success: true,
      data: { message: 'No assignments to reprice' },
    }
  }

  let repricedCount = 0
  let priceIncreasedCount = 0
  let priceDecreasedCount = 0
  let unchangedCount = 0

  for (const assignment of assignments) {
    try {
      const currentPrice = assignment.current_price
      const basePrice = assignment.sku?.sell_price || currentPrice
      const cassiniScore = assignment.sku?.normalized_product?.cassini_score || 50
      const storeHealth = assignment.store?.health_data as any

      // Calculate visibility adjustment
      let visibilityMultiplier = 1.0

      if (adjustForVisibility) {
        // Top Rated Plus: can charge 3-5% more
        if (storeHealth?.cassiniStatus?.isTopRatedPlus) {
          visibilityMultiplier += 0.04
        } else if (storeHealth?.cassiniStatus?.isTopRatedSeller) {
          // Top Rated: can charge 2-3% more
          visibilityMultiplier += 0.025
        }

        // High Cassini score product: can maintain higher price
        if (cassiniScore >= 80) {
          visibilityMultiplier += 0.02
        } else if (cassiniScore < 50) {
          // Low Cassini score: may need lower price
          visibilityMultiplier -= 0.02
        }

        // New listing boost active: can be slightly aggressive
        const boostEnds = assignment.boost_window_ends
        if (boostEnds && new Date(boostEnds) > new Date()) {
          visibilityMultiplier += 0.015
        }
      }

      // Calculate new price
      let newPrice = basePrice * visibilityMultiplier

      // Enforce max price change
      const maxChange = currentPrice * (maxPriceChange / 100)
      if (Math.abs(newPrice - currentPrice) > maxChange) {
        newPrice = newPrice > currentPrice
          ? currentPrice + maxChange
          : currentPrice - maxChange
      }

      // Round to .99
      newPrice = Math.ceil(newPrice) - 0.01

      // Skip if no meaningful change
      if (Math.abs(newPrice - currentPrice) < 0.5) {
        unchangedCount++
        continue
      }

      // Update price
      await supabase
        .from('store_sku_assignments')
        .update({
          current_price: newPrice,
          price_updated_at: new Date().toISOString(),
          cassini_price_adjustment: visibilityMultiplier,
        })
        .eq('id', assignment.id)

      repricedCount++
      if (newPrice > currentPrice) {
        priceIncreasedCount++
      } else {
        priceDecreasedCount++
      }
    } catch (err) {
      console.error(`Error repricing assignment ${assignment.id}:`, err)
    }
  }

  return {
    success: true,
    data: {
      processed: assignments.length,
      repriced: repricedCount,
      increased: priceIncreasedCount,
      decreased: priceDecreasedCount,
      unchanged: unchangedCount,
    },
  }
})

// =============================================================================
// CASSINI HELPER FUNCTIONS
// =============================================================================

function calculateCassiniScore(product: any, targetTopRatedPlus: boolean): number {
  let score = 50 // Base score

  const title = product.normalized_title || ''

  // Title optimization factors
  const titleLength = title.length
  if (titleLength >= 75 && titleLength <= 80) {
    score += 15 // Optimal length
  } else if (titleLength >= 60 && titleLength < 75) {
    score += 8
  } else if (titleLength < 40) {
    score -= 10 // Too short
  }

  // Spam term penalties
  const spamTerms = ['l@@k', 'wow', 'amazing', 'best', 'cheap', '!!!', '***']
  const titleLower = title.toLowerCase()
  for (const term of spamTerms) {
    if (titleLower.includes(term)) {
      score -= 8
    }
  }

  // Quality signals
  if (product.quality_score) {
    score += Math.round(product.quality_score * 0.2)
  }

  // Brand recognition
  if (product.normalized_brand && product.normalized_brand !== 'Unbranded') {
    score += 5
  }

  // If targeting TRP, penalize products that may have shipping issues
  if (targetTopRatedPlus) {
    // Heavy items may have shipping delays
    if (titleLower.includes('heavy') || titleLower.includes('large') || titleLower.includes('oversized')) {
      score -= 5
    }
  }

  return Math.max(0, Math.min(100, score))
}

function optimizeTitleForCassini(title: string): string {
  // Remove spam terms
  const spamTerms = ['l@@k', 'look!', 'wow!', 'amazing!', 'best!', 'cheap!', '!!!', '***', '~', '**']
  let optimized = title

  for (const term of spamTerms) {
    optimized = optimized.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
  }

  // Clean up extra spaces
  optimized = optimized.replace(/\s+/g, ' ').trim()

  // Ensure proper capitalization (title case for first letter of each word)
  optimized = optimized
    .split(' ')
    .map((word) => {
      if (word.length <= 2) return word.toLowerCase()
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')

  // Truncate to 80 characters (Cassini optimal)
  if (optimized.length > 80) {
    optimized = optimized.substring(0, 77) + '...'
  }

  return optimized
}

// =============================================================================
// LISTING OPTIMIZATION JOB HANDLERS (With Policy Compliance)
// =============================================================================

import {
  ListingOptimizer,
  optimizeListing as optimizeListingFn,
  quickComplianceCheck,
  type OptimizationTier,
} from '@/lib/optimization/listing-optimizer'

import {
  ScheduledListingWorkflow,
  createScheduledWorkflow,
  generateActivationJobs,
} from '@/lib/optimization/scheduled-listing-workflow'

import {
  analyzeCompliance,
  getComplianceScore,
  hasCriticalViolations,
} from '@/lib/optimization/policy-compliance'

import {
  containsVeroBrand,
  fullComplianceScan,
} from '@/lib/optimization/vero-blacklist'

// Singleton workflow instance for scheduled listings
let scheduledWorkflow: ScheduledListingWorkflow | null = null

function getScheduledWorkflow(): ScheduledListingWorkflow {
  if (!scheduledWorkflow) {
    scheduledWorkflow = createScheduledWorkflow({
      activationDelayMs: 12 * 60 * 60 * 1000, // 12 hours
      tier: 'standard',
      strictCompliance: true,
      staggerListings: true,
      staggerIntervalMs: 30 * 60 * 1000, // 30 minutes
    })
  }
  return scheduledWorkflow
}

/**
 * Optimize Listing Job Handler
 *
 * Optimizes title and description for Cassini and policy compliance.
 * This is a tier-differentiated feature.
 *
 * Payload:
 * {
 *   productId: string,
 *   title: string,
 *   description: string,
 *   tier?: 'basic' | 'standard' | 'premium' | 'enterprise',
 *   category?: string,
 *   productName?: string,
 *   features?: string[],
 *   specifications?: Record<string, string>,
 *   strictMode?: boolean
 * }
 */
registerJobHandler('optimize_listing', async (job: Job): Promise<JobResult> => {
  const {
    productId,
    title,
    description,
    tier = 'standard',
    category,
    productName,
    features,
    specifications,
    strictMode = true,
    pipelineId,
  } = job.payload

  if (!productId || !title) {
    return { success: false, error: 'Product ID and title are required' }
  }

  try {
    // Create optimizer with specified tier
    const optimizer = new ListingOptimizer({
      tier: tier as OptimizationTier,
      category,
      strictMode,
    })

    // Run full optimization
    const result = optimizer.optimizeListing(title, description || '', {
      productName,
      features,
      specifications,
    })

    // Store optimization result
    const optimizationData = {
      original_title: title,
      optimized_title: result.title.optimizedTitle,
      title_cassini_score: result.title.cassiniScore,
      title_compliance_score: result.title.complianceScore,
      title_changes: result.title.changes,
      title_warnings: result.title.warnings,
      title_blockers: result.title.blockers,

      original_description: description,
      optimized_description: result.description.optimizedDescription,
      description_compliance: result.description.complianceReport.isCompliant,
      description_risk_score: result.description.complianceReport.riskScore,
      description_structure_score: result.description.structureScore,
      description_readability_score: result.description.readabilityScore,
      description_changes: result.description.changes,
      description_warnings: result.description.warnings,
      description_blockers: result.description.blockers,

      overall_score: result.overallScore,
      can_list: result.canList,
      all_blockers: result.blockers,
      tier_benefits: result.tierBenefits,
      upgrade_benefits: result.upgradeBenefits,

      optimization_tier: tier,
      optimized_at: new Date().toISOString(),
    }

    // Update product with optimized data
    await supabase
      .from('normalized_products')
      .update({
        cassini_optimized_title: result.title.optimizedTitle,
        cassini_optimized_description: result.description.optimizedDescription,
        optimization_data: optimizationData,
        optimization_tier: tier,
        can_list: result.canList,
        listing_blockers: result.blockers,
        optimized_at: new Date().toISOString(),
      })
      .eq('id', productId)

    // Continue pipeline if part of one
    if (pipelineId) {
      await continuePipeline(pipelineId, 'optimizing', {
        productId,
        canList: result.canList,
        overallScore: result.overallScore,
        blockers: result.blockers,
      })
    }

    return {
      success: true,
      data: {
        productId,
        canList: result.canList,
        overallScore: result.overallScore,
        titleScore: result.title.cassiniScore,
        complianceScore: result.title.complianceScore,
        blockers: result.blockers,
        titleOptimized: result.title.wasModified,
        descriptionOptimized: result.description.wasModified,
        tierBenefits: result.tierBenefits,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Optimization failed: ${errorMessage}` }
  }
})

/**
 * Scheduled Listing Job Handler
 *
 * Creates a draft listing with 12-hour delayed activation to work around
 * AutoDS "product does not exist" errors.
 *
 * Payload:
 * {
 *   productId: string,
 *   sku: string,
 *   storeId: string,
 *   title: string,
 *   description: string,
 *   category?: string,
 *   tier?: OptimizationTier,
 *   productName?: string,
 *   features?: string[],
 *   specifications?: Record<string, string>,
 *   forceActivate?: boolean (bypass 12h delay - use with caution)
 * }
 */
registerJobHandler('scheduled_listing', async (job: Job): Promise<JobResult> => {
  const {
    productId,
    sku,
    storeId,
    title,
    description,
    category,
    tier = 'standard',
    productName,
    features,
    specifications,
    forceActivate = false,
    pipelineId,
  } = job.payload

  if (!productId || !sku || !storeId || !title) {
    return { success: false, error: 'Product ID, SKU, store ID, and title are required' }
  }

  try {
    const workflow = getScheduledWorkflow()

    // Update workflow config based on tier
    workflow.updateConfig({
      tier: tier as OptimizationTier,
      activationDelayMs: forceActivate ? 0 : 12 * 60 * 60 * 1000,
    })

    // Start the workflow
    const result = await workflow.startWorkflow({
      productId,
      sku,
      storeId,
      title,
      description: description || '',
      category,
      source: pipelineId ? 'pipeline' : 'manual',
      productName,
      features,
      specifications,
    })

    // Store the listing record in database
    await supabase
      .from('scheduled_listings')
      .upsert({
        id: result.listing.id,
        product_id: productId,
        sku,
        store_id: storeId,
        state: result.listing.state,
        original_title: result.listing.originalTitle,
        optimized_title: result.listing.optimizedTitle,
        original_description: result.listing.originalDescription,
        optimized_description: result.listing.optimizedDescription,
        optimization_result: result.listing.optimizationResult,
        scheduled_activation_at: result.listing.scheduledActivationAt?.toISOString(),
        autods_draft_id: result.listing.autodsDraftId,
        autods_product_id: result.listing.autodsProductId,
        blockers: result.listing.blockers,
        tier: result.listing.tier,
        created_at: result.listing.createdAt.toISOString(),
      })

    // Continue pipeline if part of one
    if (pipelineId) {
      await continuePipeline(pipelineId, 'scheduling', {
        listingId: result.listing.id,
        state: result.listing.state,
        canList: result.success,
        scheduledActivationAt: result.listing.scheduledActivationAt?.toISOString(),
      })
    }

    return {
      success: result.success,
      data: {
        listingId: result.listing.id,
        state: result.listing.state,
        message: result.message,
        scheduledActivationAt: result.listing.scheduledActivationAt?.toISOString(),
        nextAction: result.nextAction,
        nextActionAt: result.nextActionAt?.toISOString(),
        blockers: result.listing.blockers,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Scheduled listing failed: ${errorMessage}` }
  }
})

/**
 * Process Scheduled Activations Job Handler
 *
 * Background job that runs periodically to activate scheduled listings
 * that have passed their 12-hour wait period.
 *
 * Payload:
 * {
 *   batchSize?: number,
 *   forceAll?: boolean (activate all scheduled, ignore timing)
 * }
 */
registerJobHandler('process_scheduled_activations', async (job: Job): Promise<JobResult> => {
  const { batchSize = 50, forceAll = false } = job.payload

  try {
    const workflow = getScheduledWorkflow()

    // Load pending listings from database into workflow
    const { data: pendingListings } = await supabase
      .from('scheduled_listings')
      .select('*')
      .in('state', ['scheduled', 'draft_created'])
      .limit(batchSize)

    if (pendingListings && pendingListings.length > 0) {
      // Import listings into workflow
      const listings = pendingListings.map((l) => ({
        id: l.id,
        productId: l.product_id,
        sku: l.sku,
        storeId: l.store_id,
        state: l.state,
        originalTitle: l.original_title,
        originalDescription: l.original_description,
        optimizedTitle: l.optimized_title,
        optimizedDescription: l.optimized_description,
        optimizationResult: l.optimization_result,
        createdAt: new Date(l.created_at),
        draftCreatedAt: l.draft_created_at ? new Date(l.draft_created_at) : undefined,
        scheduledActivationAt: l.scheduled_activation_at ? new Date(l.scheduled_activation_at) : undefined,
        activatedAt: l.activated_at ? new Date(l.activated_at) : undefined,
        autodsProductId: l.autods_product_id,
        autodsDraftId: l.autods_draft_id,
        failureReason: l.failure_reason,
        blockers: l.blockers,
        retryCount: l.retry_count || 0,
        maxRetries: 3,
        tier: l.tier || 'standard',
        category: l.category,
        source: l.source || 'pipeline',
      }))

      workflow.importListings(listings as any)
    }

    // If force all, update all scheduled listings to be ready now
    if (forceAll) {
      await supabase
        .from('scheduled_listings')
        .update({ scheduled_activation_at: new Date().toISOString() })
        .eq('state', 'scheduled')
    }

    // Process activations
    const result = await workflow.processScheduledActivations()

    // Update database with results
    for (const workflowResult of result.results) {
      await supabase
        .from('scheduled_listings')
        .update({
          state: workflowResult.listing.state,
          activated_at: workflowResult.listing.activatedAt?.toISOString(),
          failure_reason: workflowResult.listing.failureReason,
          retry_count: workflowResult.listing.retryCount,
          scheduled_activation_at: workflowResult.listing.scheduledActivationAt?.toISOString(),
        })
        .eq('id', workflowResult.listing.id)
    }

    // Get workflow status for response
    const status = workflow.getWorkflowStatus()

    return {
      success: true,
      data: {
        activated: result.activated,
        failed: result.failed,
        pending: result.pending,
        totalInWorkflow: status.total,
        byState: status.byState,
        nextActivation: status.nextActivation?.toISOString(),
        blockedCount: status.blockedListings.length,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Processing activations failed: ${errorMessage}` }
  }
})

/**
 * Batch Optimize Listings Job Handler
 *
 * Optimizes multiple listings at once with tier-based features.
 *
 * Payload:
 * {
 *   productIds: string[],
 *   tier?: OptimizationTier,
 *   category?: string,
 *   strictMode?: boolean,
 *   createScheduledListings?: boolean,
 *   storeId?: string (required if createScheduledListings is true)
 * }
 */
registerJobHandler('batch_optimize_listings', async (job: Job): Promise<JobResult> => {
  const {
    productIds,
    tier = 'standard',
    category,
    strictMode = true,
    createScheduledListings = false,
    storeId,
    pipelineId,
  } = job.payload

  if (!productIds || productIds.length === 0) {
    return { success: false, error: 'Product IDs are required' }
  }

  if (createScheduledListings && !storeId) {
    return { success: false, error: 'Store ID is required when creating scheduled listings' }
  }

  try {
    // Get products
    const { data: products, error } = await supabase
      .from('normalized_products')
      .select('*, sku:skus(sku_code)')
      .in('id', productIds)

    if (error || !products || products.length === 0) {
      return { success: false, error: 'No products found' }
    }

    const optimizer = new ListingOptimizer({
      tier: tier as OptimizationTier,
      category,
      strictMode,
    })

    const results = {
      total: products.length,
      optimized: 0,
      canList: 0,
      blocked: 0,
      scheduled: 0,
      errors: [] as string[],
    }

    const optimizedProductIds: string[] = []

    for (const product of products) {
      try {
        // Run optimization
        const optimizationResult = optimizer.optimizeListing(
          product.normalized_title || '',
          product.description || ''
        )

        // Update product
        await supabase
          .from('normalized_products')
          .update({
            cassini_optimized_title: optimizationResult.title.optimizedTitle,
            cassini_optimized_description: optimizationResult.description.optimizedDescription,
            optimization_tier: tier,
            can_list: optimizationResult.canList,
            listing_blockers: optimizationResult.blockers,
            optimized_at: new Date().toISOString(),
          })
          .eq('id', product.id)

        results.optimized++

        if (optimizationResult.canList) {
          results.canList++
          optimizedProductIds.push(product.id)

          // Create scheduled listing if requested
          if (createScheduledListings && product.sku?.sku_code) {
            const workflow = getScheduledWorkflow()
            workflow.updateConfig({ tier: tier as OptimizationTier })

            const workflowResult = await workflow.startWorkflow({
              productId: product.id,
              sku: product.sku.sku_code,
              storeId,
              title: optimizationResult.title.optimizedTitle,
              description: optimizationResult.description.optimizedDescription,
              category,
              source: 'bulk',
            })

            if (workflowResult.success) {
              results.scheduled++
            }
          }
        } else {
          results.blocked++
        }
      } catch (err) {
        results.errors.push(`Product ${product.id}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    // Continue pipeline if part of one
    if (pipelineId) {
      await continuePipeline(pipelineId, 'batch_optimizing', {
        productIds: optimizedProductIds,
        results,
      })
    }

    return {
      success: true,
      data: {
        ...results,
        productIds: optimizedProductIds,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Batch optimization failed: ${errorMessage}` }
  }
})

/**
 * Compliance Check Job Handler
 *
 * Runs compliance checks on listings without modifying them.
 * Useful for auditing existing listings.
 *
 * Payload:
 * {
 *   content: string,
 *   contentType: 'title' | 'description' | 'both',
 *   category?: string,
 *   strictMode?: boolean
 * }
 */
registerJobHandler('compliance_check', async (job: Job): Promise<JobResult> => {
  const {
    content,
    title,
    description,
    contentType = 'both',
    category,
    strictMode = true,
  } = job.payload

  if (!content && !title && !description) {
    return { success: false, error: 'Content, title, or description is required' }
  }

  try {
    const results: any = {}

    // Check VERO brands
    const textToCheck = content || `${title || ''} ${description || ''}`
    const veroCheck = containsVeroBrand(textToCheck)
    results.vero = veroCheck

    // Full compliance scan
    const complianceScan = fullComplianceScan(textToCheck, category)
    results.compliance = {
      isCompliant: complianceScan.isCompliant,
      overallRisk: complianceScan.overallRisk,
      issues: complianceScan.issues,
      sanitizedText: complianceScan.sanitizedText,
    }

    // Detailed compliance analysis
    const complianceReport = analyzeCompliance(textToCheck, category, {
      strictMode,
      includeWarnings: true,
    })
    results.detailedReport = {
      isCompliant: complianceReport.isCompliant,
      overallRisk: complianceReport.overallRisk,
      riskScore: complianceReport.riskScore,
      violationCount: complianceReport.violations.length,
      warningCount: complianceReport.warnings.length,
      violations: complianceReport.violations,
      warnings: complianceReport.warnings,
      canAutoFix: complianceReport.canAutoFix,
      autoFixedContent: complianceReport.autoFixedContent,
    }

    // Quick check summary
    const quickCheck = quickComplianceCheck(textToCheck, category)
    results.quickCheck = quickCheck

    // Calculate overall compliance score
    results.complianceScore = getComplianceScore(textToCheck, category)
    results.hasCriticalViolations = hasCriticalViolations(textToCheck, category)

    return {
      success: true,
      data: results,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Compliance check failed: ${errorMessage}` }
  }
})
