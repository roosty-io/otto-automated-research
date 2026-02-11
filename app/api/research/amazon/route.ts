import { NextResponse } from 'next/server'
import { getKeepaClient, type AmazonDomain } from '@/lib/integrations/keepa'
import { rateLimiter } from '@/lib/automation'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/research/amazon
 *
 * Research Amazon products for dropshipping sourcing.
 * Uses Keepa API to find products that match eBay demand.
 *
 * Body:
 * {
 *   action: 'lookup' | 'search' | 'bestsellers' | 'source-for-ebay',
 *   asins?: string[],
 *   query?: string,
 *   categoryId?: number,
 *   ebayProducts?: Array<{ title: string, price: number, soldCount: number }>,
 *   domain?: AmazonDomain,
 *   maxResults?: number
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      action,
      asins,
      query,
      categoryId,
      ebayProducts,
      domain = 'US',
      maxResults = 50,
    } = body

    // Check rate limit
    const limitStatus = await rateLimiter.check('keepa', 'lookup')
    if (!limitStatus.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: limitStatus.retryAfterMs,
          tokensRemaining: 0,
        },
        { status: 429 }
      )
    }

    const keepa = getKeepaClient()

    switch (action) {
      case 'lookup': {
        if (!asins || asins.length === 0) {
          return NextResponse.json(
            { success: false, error: 'ASINs required for lookup' },
            { status: 400 }
          )
        }

        const products = await keepa.getProducts(asins.slice(0, 100), {
          domain: domain as AmazonDomain,
          stats: 90,
          buybox: true,
          rating: true,
        })

        await rateLimiter.record('keepa', 'lookup')

        // Save to database
        const savedCount = await saveProducts(products, domain)

        return NextResponse.json({
          success: true,
          found: products.length,
          saved: savedCount,
          tokensRemaining: keepa.getTokensRemaining(),
          products: products.map(formatProduct),
        })
      }

      case 'search': {
        if (!query) {
          return NextResponse.json(
            { success: false, error: 'Query required for search' },
            { status: 400 }
          )
        }

        const products = await keepa.searchProducts(query, {
          domain: domain as AmazonDomain,
          perPage: Math.min(maxResults, 50),
        })

        await rateLimiter.record('keepa', 'lookup')

        const savedCount = await saveProducts(products, domain)

        return NextResponse.json({
          success: true,
          query,
          found: products.length,
          saved: savedCount,
          tokensRemaining: keepa.getTokensRemaining(),
          products: products.map(formatProduct),
        })
      }

      case 'bestsellers': {
        if (!categoryId) {
          return NextResponse.json(
            { success: false, error: 'categoryId required for bestsellers' },
            { status: 400 }
          )
        }

        const bestSellers = await keepa.getBestSellers(categoryId, {
          domain: domain as AmazonDomain,
          range: Math.min(maxResults, 100),
        })

        await rateLimiter.record('keepa', 'lookup')

        // Fetch full product data for top items
        const topAsins = bestSellers.slice(0, 20).map((b) => b.asin)
        let products: any[] = []

        if (topAsins.length > 0) {
          products = await keepa.getProducts(topAsins, {
            domain: domain as AmazonDomain,
            stats: 90,
            buybox: true,
          })
          await saveProducts(products, domain)
        }

        return NextResponse.json({
          success: true,
          categoryId,
          totalBestSellers: bestSellers.length,
          tokensRemaining: keepa.getTokensRemaining(),
          bestSellers: bestSellers.slice(0, maxResults).map((b) => ({
            asin: b.asin,
            rank: b.rank,
          })),
          products: products.map(formatProduct),
        })
      }

      case 'source-for-ebay': {
        // Find Amazon products to source for eBay demand
        if (!ebayProducts || ebayProducts.length === 0) {
          return NextResponse.json(
            { success: false, error: 'ebayProducts required for sourcing' },
            { status: 400 }
          )
        }

        const results = await findAmazonSources(ebayProducts, domain as AmazonDomain)
        await rateLimiter.record('keepa', 'lookup')

        return NextResponse.json({
          success: true,
          searched: ebayProducts.length,
          found: results.filter((r) => r.amazonMatch).length,
          tokensRemaining: keepa.getTokensRemaining(),
          results,
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Amazon Research] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/research/amazon/status
 *
 * Get Keepa API status and rate limits
 */
export async function GET() {
  try {
    const keepa = getKeepaClient()
    const status = await keepa.getTokenStatus()
    const rateLimit = await rateLimiter.check('keepa', 'lookup')

    return NextResponse.json({
      success: true,
      keepa: {
        tokensRemaining: status.tokensLeft,
        refillRate: status.refillRate,
        refillIn: status.refillIn,
      },
      rateLimit: {
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt.toISOString(),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Find Amazon products to source for eBay items
 */
async function findAmazonSources(
  ebayProducts: Array<{ title: string; price: number; soldCount: number }>,
  domain: AmazonDomain
): Promise<Array<{
  ebayTitle: string
  ebayPrice: number
  soldCount: number
  amazonMatch: any | null
  profitMargin: number | null
  recommendation: 'good' | 'marginal' | 'skip' | null
}>> {
  const keepa = getKeepaClient()
  const results: Array<{
    ebayTitle: string
    ebayPrice: number
    soldCount: number
    amazonMatch: any | null
    profitMargin: number | null
    recommendation: 'good' | 'marginal' | 'skip' | null
  }> = []

  for (const ebayProduct of ebayProducts.slice(0, 20)) {
    try {
      // Extract keywords from eBay title for Amazon search
      const searchQuery = extractSearchQuery(ebayProduct.title)

      // Search Amazon via Keepa
      const amazonProducts = await keepa.searchProducts(searchQuery, {
        domain,
        perPage: 5,
      })

      if (amazonProducts.length > 0) {
        // Find best match (lowest price with good rating)
        const bestMatch = amazonProducts
          .filter((p) => p.buyBoxPrice && p.buyBoxPrice < ebayProduct.price * 0.7)
          .sort((a, b) => (a.buyBoxPrice || 999) - (b.buyBoxPrice || 999))[0]

        if (bestMatch) {
          const amazonPrice = bestMatch.buyBoxPrice || 0
          const ebayFees = ebayProduct.price * 0.13 // ~13% eBay + PayPal fees
          const profit = ebayProduct.price - amazonPrice - ebayFees
          const margin = (profit / ebayProduct.price) * 100

          results.push({
            ebayTitle: ebayProduct.title,
            ebayPrice: ebayProduct.price,
            soldCount: ebayProduct.soldCount,
            amazonMatch: formatProduct(bestMatch),
            profitMargin: Math.round(margin * 100) / 100,
            recommendation: margin >= 25 ? 'good' : margin >= 15 ? 'marginal' : 'skip',
          })

          // Save to database
          await saveProducts([bestMatch], domain)
        } else {
          results.push({
            ebayTitle: ebayProduct.title,
            ebayPrice: ebayProduct.price,
            soldCount: ebayProduct.soldCount,
            amazonMatch: null,
            profitMargin: null,
            recommendation: null,
          })
        }
      } else {
        results.push({
          ebayTitle: ebayProduct.title,
          ebayPrice: ebayProduct.price,
          soldCount: ebayProduct.soldCount,
          amazonMatch: null,
          profitMargin: null,
          recommendation: null,
        })
      }
    } catch (error) {
      console.error(`[Amazon Research] Error searching for "${ebayProduct.title}":`, error)
      results.push({
        ebayTitle: ebayProduct.title,
        ebayPrice: ebayProduct.price,
        soldCount: ebayProduct.soldCount,
        amazonMatch: null,
        profitMargin: null,
        recommendation: null,
      })
    }
  }

  return results
}

/**
 * Extract search query from eBay title
 */
function extractSearchQuery(title: string): string {
  // Remove common eBay-specific terms
  const cleaned = title
    .replace(/\b(new|brand new|sealed|usa|fast ship|free ship|lot of \d+)\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Take first 5-6 significant words
  const words = cleaned.split(' ').filter((w) => w.length > 2)
  return words.slice(0, 6).join(' ')
}

/**
 * Save products to raw_products table
 */
async function saveProducts(products: any[], domain: string): Promise<number> {
  let savedCount = 0
  const batchId = `amazon_${domain.toLowerCase()}_${Date.now()}`

  for (const product of products) {
    try {
      const { data: existing } = await supabase
        .from('raw_products')
        .select('id')
        .eq('asin', product.asin)
        .single()

      const rawProductData = {
        asin: product.asin,
        amazon_url: `https://www.amazon.com/dp/${product.asin}`,
        keepa_data: product.rawData,
        title: product.title,
        brand: product.brand,
        category: product.rootCategory?.toString() || null,
        amazon_price: product.buyBoxPrice || product.amazonPrice || product.newPrice,
        sales_rank: product.salesRank,
        review_count: product.reviewCount,
        rating: product.rating,
        is_processed: false,
        source: 'keepa',
        source_batch_id: batchId,
      }

      if (existing) {
        await supabase
          .from('raw_products')
          .update({
            keepa_data: rawProductData.keepa_data,
            amazon_price: rawProductData.amazon_price,
            sales_rank: rawProductData.sales_rank,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('raw_products').insert(rawProductData)
      }

      savedCount++
    } catch (error) {
      // Ignore individual save errors
    }
  }

  return savedCount
}

/**
 * Format product for response
 */
function formatProduct(product: any) {
  return {
    asin: product.asin,
    title: product.title,
    brand: product.brand,
    price: product.buyBoxPrice || product.amazonPrice || product.newPrice,
    salesRank: product.salesRank,
    rating: product.rating,
    reviewCount: product.reviewCount,
    image: product.images?.[0],
    buyBoxIsFba: product.buyBoxIsFba,
  }
}
