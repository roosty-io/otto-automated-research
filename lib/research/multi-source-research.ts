/**
 * Multi-Source Product Research Service
 *
 * Provides robust product research with multiple data sources and fallbacks:
 * 1. eBay Browse API (primary - official, stable)
 * 2. ZIK Analytics (secondary - more sold data but fragile scraper)
 * 3. Keepa (Amazon sourcing data)
 *
 * Key features:
 * - Automatic failover between sources
 * - Data validation and quality scoring
 * - Caching to reduce API calls
 * - Rate limiting per source
 */

import { EbayClient, getEbayClient } from '../integrations/ebay/client'
import { KeepaClient, getKeepaClient, type KeepaProduct } from '../integrations/keepa'
import { searchZikProducts, type ZikSearchFilters, type ZikProductResult } from '../automation/zik/product-research'
import { supabase } from '../supabase'
import { logScraperError, scraperLogger } from '../automation/monitoring'

// =============================================================================
// TYPES
// =============================================================================

export interface ProductResearchQuery {
  keywords?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  minSoldCount?: number
  dateRange?: '7' | '14' | '30' | '90'
  maxResults?: number
}

export interface ResearchedProduct {
  // Identifiers
  id: string
  ebayItemId?: string
  asin?: string

  // Product info
  title: string
  price: number
  currency: string
  category?: string
  condition?: string
  imageUrl?: string

  // eBay demand metrics
  soldCount?: number
  watchCount?: number
  viewCount?: number
  sellerId?: string
  sellerFeedbackScore?: number

  // Amazon sourcing info
  amazonPrice?: number
  amazonAvailable?: boolean
  amazonSalesRank?: number
  amazonReviewCount?: number
  amazonRating?: number

  // Calculated metrics
  potentialMargin?: number
  marginPercent?: number
  demandScore?: number
  competitionLevel?: 'low' | 'medium' | 'high' | 'very_high'

  // Data quality
  dataSource: 'ebay_api' | 'zik' | 'combined'
  dataQuality: number // 0-100
  lastUpdated: string
}

export interface ResearchResult {
  success: boolean
  source: 'ebay_api' | 'zik' | 'fallback_combined'
  products: ResearchedProduct[]
  totalFound: number
  query: ProductResearchQuery
  errors: string[]
  warnings: string[]
  timing: {
    ebayApiMs?: number
    zikMs?: number
    keepaMs?: number
    totalMs: number
  }
}

// =============================================================================
// EBAY BROWSE API RESEARCH (Primary - Official API)
// =============================================================================

interface EbaySearchResponse {
  itemSummaries?: Array<{
    itemId: string
    title: string
    price?: { value: string; currency: string }
    condition?: string
    image?: { imageUrl: string }
    seller?: {
      username: string
      feedbackPercentage: string
      feedbackScore: number
    }
    categories?: Array<{ categoryId: string; categoryName: string }>
    buyingOptions?: string[]
    itemLocation?: { country: string }
    watchCount?: number
  }>
  total: number
  limit: number
  offset: number
}

async function searchEbayBrowseApi(
  query: ProductResearchQuery,
  storeId?: string
): Promise<{ products: ResearchedProduct[]; total: number; error?: string }> {
  try {
    const client = storeId ? getEbayClient(storeId) : new EbayClient({ marketplace: 'US' })

    // Build search params
    const params: Record<string, string> = {
      q: query.keywords || '',
      limit: String(Math.min(query.maxResults || 50, 200)),
      filter: buildEbayFilter(query),
    }

    if (query.category) {
      params.category_ids = query.category
    }

    const response = await client.request<EbaySearchResponse>(
      '/buy/browse/v1/item_summary/search',
      {
        method: 'GET',
        queryParams: params,
        useApplicationToken: !storeId,
      }
    )

    if (!response.success || !response.data?.itemSummaries) {
      return {
        products: [],
        total: 0,
        error: response.errors?.[0]?.message || 'eBay API search failed',
      }
    }

    const products: ResearchedProduct[] = response.data.itemSummaries.map((item) => ({
      id: `ebay_${item.itemId}`,
      ebayItemId: item.itemId,
      title: item.title,
      price: parseFloat(item.price?.value || '0'),
      currency: item.price?.currency || 'USD',
      category: item.categories?.[0]?.categoryName,
      condition: item.condition,
      imageUrl: item.image?.imageUrl,
      sellerId: item.seller?.username,
      sellerFeedbackScore: item.seller?.feedbackScore,
      watchCount: item.watchCount,
      dataSource: 'ebay_api',
      dataQuality: 85, // Official API = high quality
      lastUpdated: new Date().toISOString(),
    }))

    return { products, total: response.data.total }
  } catch (error) {
    scraperLogger.error('ebay', 'browse_api_search', error as Error)
    return {
      products: [],
      total: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

function buildEbayFilter(query: ProductResearchQuery): string {
  const filters: string[] = []

  if (query.minPrice !== undefined) {
    filters.push(`price:[${query.minPrice}..${query.maxPrice || '*'}]`)
  } else if (query.maxPrice !== undefined) {
    filters.push(`price:[*..${query.maxPrice}]`)
  }

  // Only show items that have sold (Buy It Now with sales)
  filters.push('buyingOptions:{FIXED_PRICE}')

  return filters.join(',')
}

// =============================================================================
// ZIK ANALYTICS RESEARCH (Secondary - More sold data but scraper-based)
// =============================================================================

async function searchZikAnalytics(
  query: ProductResearchQuery
): Promise<{ products: ResearchedProduct[]; total: number; error?: string }> {
  try {
    const zikFilters: ZikSearchFilters = {
      query: query.keywords,
      category: query.category,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minSold: query.minSoldCount,
      dateRange: query.dateRange,
    }

    const result = await searchZikProducts(zikFilters, {
      maxResults: query.maxResults || 100,
      maxPages: 3,
    })

    if (!result.success) {
      return {
        products: [],
        total: 0,
        error: result.error || 'ZIK search failed',
      }
    }

    const products: ResearchedProduct[] = result.products.map((item) => ({
      id: item.ebayItemId ? `ebay_${item.ebayItemId}` : `zik_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ebayItemId: item.ebayItemId || undefined,
      title: item.title,
      price: item.price || 0,
      currency: 'USD',
      category: item.category || undefined,
      soldCount: item.soldCount || undefined,
      sellerId: item.seller || undefined,
      dataSource: 'zik',
      dataQuality: 70, // Scraper = moderate quality
      lastUpdated: item.scrapedAt,
    }))

    return { products, total: result.totalResults }
  } catch (error) {
    scraperLogger.error('zik', 'product_search', error as Error)
    return {
      products: [],
      total: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// COMBINED RESEARCH WITH FALLBACK
// =============================================================================

export async function researchProducts(
  query: ProductResearchQuery,
  options: {
    sources?: ('ebay_api' | 'zik')[]
    enrichWithKeepa?: boolean
    storeId?: string
  } = {}
): Promise<ResearchResult> {
  const startTime = Date.now()
  const {
    sources = ['ebay_api', 'zik'],
    enrichWithKeepa = false,
    storeId,
  } = options

  const errors: string[] = []
  const warnings: string[] = []
  const timing: ResearchResult['timing'] = { totalMs: 0 }
  let allProducts: ResearchedProduct[] = []
  let source: ResearchResult['source'] = 'ebay_api'

  // Try eBay API first (most reliable)
  if (sources.includes('ebay_api')) {
    const ebayStart = Date.now()
    const ebayResult = await searchEbayBrowseApi(query, storeId)
    timing.ebayApiMs = Date.now() - ebayStart

    if (ebayResult.products.length > 0) {
      allProducts = ebayResult.products
      source = 'ebay_api'
    } else if (ebayResult.error) {
      warnings.push(`eBay API: ${ebayResult.error}`)
    }
  }

  // Try ZIK if eBay API didn't return enough results
  if (sources.includes('zik') && allProducts.length < (query.maxResults || 50) / 2) {
    const zikStart = Date.now()
    const zikResult = await searchZikAnalytics(query)
    timing.zikMs = Date.now() - zikStart

    if (zikResult.products.length > 0) {
      if (allProducts.length === 0) {
        allProducts = zikResult.products
        source = 'zik'
      } else {
        // Merge and deduplicate by eBay item ID
        const existingIds = new Set(allProducts.map((p) => p.ebayItemId).filter(Boolean))
        const newProducts = zikResult.products.filter(
          (p) => !p.ebayItemId || !existingIds.has(p.ebayItemId)
        )
        allProducts = [...allProducts, ...newProducts]
        source = 'fallback_combined'
      }
    } else if (zikResult.error) {
      warnings.push(`ZIK Analytics: ${zikResult.error}`)
    }
  }

  // Enrich with Keepa data if requested
  if (enrichWithKeepa && allProducts.length > 0) {
    const keepaStart = Date.now()
    allProducts = await enrichWithKeepaData(allProducts)
    timing.keepaMs = Date.now() - keepaStart
  }

  // Calculate margins and scores
  allProducts = calculateProductMetrics(allProducts)

  // Sort by demand score
  allProducts.sort((a, b) => (b.demandScore || 0) - (a.demandScore || 0))

  timing.totalMs = Date.now() - startTime

  return {
    success: allProducts.length > 0,
    source,
    products: allProducts.slice(0, query.maxResults || 100),
    totalFound: allProducts.length,
    query,
    errors,
    warnings,
    timing,
  }
}

// =============================================================================
// KEEPA ENRICHMENT
// =============================================================================

async function enrichWithKeepaData(products: ResearchedProduct[]): Promise<ResearchedProduct[]> {
  // Extract ASINs from product titles or lookup by title
  // This is a simplified version - real implementation would use Amazon Product API
  // or title matching

  try {
    const keepa = getKeepaClient()

    // For products that might have ASINs, look them up
    const productsWithAsins = products.filter((p) => p.asin)
    if (productsWithAsins.length === 0) {
      return products
    }

    const asins = productsWithAsins.map((p) => p.asin!).slice(0, 10) // Limit to save tokens
    const keepaProducts = await keepa.getProducts(asins)

    if (keepaProducts.length === 0) {
      return products
    }

    // Create lookup map
    const keepaMap = new Map<string, KeepaProduct>()
    keepaProducts.forEach((kp) => keepaMap.set(kp.asin, kp))

    // Enrich products
    return products.map((product) => {
      if (!product.asin) return product

      const keepaData = keepaMap.get(product.asin)
      if (!keepaData) return product

      return {
        ...product,
        amazonPrice: keepaData.stats?.current?.[1] ? keepaData.stats.current[1] / 100 : undefined,
        amazonAvailable: keepaData.availabilityAmazon !== undefined && keepaData.availabilityAmazon >= 0,
        amazonSalesRank: keepaData.stats?.current?.[3],
        amazonReviewCount: keepaData.stats?.current?.[17],
        amazonRating: keepaData.stats?.current?.[16] ? keepaData.stats.current[16] / 10 : undefined,
        dataQuality: Math.min(100, product.dataQuality + 15), // Boost quality with Keepa data
      }
    })
  } catch (error) {
    scraperLogger.error('other', 'keepa_enrichment', error as Error)
    return products
  }
}

// =============================================================================
// METRICS CALCULATION
// =============================================================================

function calculateProductMetrics(products: ResearchedProduct[]): ResearchedProduct[] {
  return products.map((product) => {
    // Calculate margin if we have both eBay and Amazon prices
    let potentialMargin: number | undefined
    let marginPercent: number | undefined

    if (product.price && product.amazonPrice) {
      // Estimate fees: ~13% eBay final value fee + ~3% PayPal
      const ebayFees = product.price * 0.16
      const netEbayRevenue = product.price - ebayFees
      potentialMargin = netEbayRevenue - product.amazonPrice
      marginPercent = (potentialMargin / product.price) * 100
    }

    // Calculate demand score (0-100)
    let demandScore = 50 // Base score

    if (product.soldCount !== undefined) {
      if (product.soldCount >= 100) demandScore += 30
      else if (product.soldCount >= 50) demandScore += 20
      else if (product.soldCount >= 20) demandScore += 10
      else if (product.soldCount >= 5) demandScore += 5
    }

    if (product.watchCount !== undefined) {
      if (product.watchCount >= 50) demandScore += 10
      else if (product.watchCount >= 20) demandScore += 5
    }

    if (product.amazonSalesRank !== undefined) {
      if (product.amazonSalesRank <= 10000) demandScore += 10
      else if (product.amazonSalesRank <= 50000) demandScore += 5
    }

    demandScore = Math.min(100, demandScore)

    // Determine competition level based on seller count and price
    let competitionLevel: ResearchedProduct['competitionLevel'] = 'medium'
    if (product.soldCount && product.soldCount > 100) {
      competitionLevel = 'high'
    }
    if (product.soldCount && product.soldCount > 500) {
      competitionLevel = 'very_high'
    }

    return {
      ...product,
      potentialMargin,
      marginPercent,
      demandScore,
      competitionLevel,
    }
  })
}

// =============================================================================
// CACHING
// =============================================================================

const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const researchCache = new Map<string, { result: ResearchResult; timestamp: number }>()

export async function researchProductsCached(
  query: ProductResearchQuery,
  options: Parameters<typeof researchProducts>[1] = {}
): Promise<ResearchResult> {
  const cacheKey = JSON.stringify({ query, options })

  const cached = researchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result
  }

  const result = await researchProducts(query, options)

  researchCache.set(cacheKey, { result, timestamp: Date.now() })

  return result
}

// =============================================================================
// BATCH RESEARCH
// =============================================================================

export async function batchResearchProducts(
  queries: ProductResearchQuery[],
  options: Parameters<typeof researchProducts>[1] = {}
): Promise<ResearchResult[]> {
  // Process in batches to avoid rate limiting
  const BATCH_SIZE = 3
  const results: ResearchResult[] = []

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map((q) => researchProductsCached(q, options))
    )
    results.push(...batchResults)

    // Rate limit between batches
    if (i + BATCH_SIZE < queries.length) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  return results
}

// =============================================================================
// STORE TO DATABASE
// =============================================================================

export async function saveResearchResults(
  result: ResearchResult,
  sourceBatchId?: string
): Promise<{ saved: number; errors: string[] }> {
  const errors: string[] = []
  let saved = 0

  for (const product of result.products) {
    try {
      // Check if product already exists
      const { data: existing } = await supabase
        .from('raw_products')
        .select('id')
        .or(`asin.eq.${product.asin || 'none'},ebay_item_id.eq.${product.ebayItemId || 'none'}`)
        .single()

      if (existing) {
        // Update existing
        await supabase
          .from('raw_products')
          .update({
            title: product.title,
            ebay_price: product.price,
            sold_count: product.soldCount,
            watch_count: product.watchCount,
            amazon_price: product.amazonPrice,
            sales_rank: product.amazonSalesRank,
            source: result.source,
            last_updated: product.lastUpdated,
          })
          .eq('id', existing.id)
      } else {
        // Insert new
        await supabase.from('raw_products').insert({
          asin: product.asin,
          ebay_item_id: product.ebayItemId,
          title: product.title,
          category: product.category,
          ebay_price: product.price,
          sold_count: product.soldCount,
          watch_count: product.watchCount,
          seller_id: product.sellerId,
          amazon_price: product.amazonPrice,
          sales_rank: product.amazonSalesRank,
          review_count: product.amazonReviewCount,
          rating: product.amazonRating,
          source: result.source,
          source_batch_id: sourceBatchId,
          is_processed: false,
        })
      }

      saved++
    } catch (error) {
      errors.push(`Failed to save ${product.id}: ${error}`)
    }
  }

  return { saved, errors }
}
