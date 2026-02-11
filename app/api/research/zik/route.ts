import { NextResponse } from 'next/server'
import {
  searchZikProducts,
  getTrendingProducts,
  getCategories,
  hasValidZikSession,
  loginToZik,
  type ZikSearchFilters,
} from '@/lib/automation/zik'
import { rateLimiter } from '@/lib/automation'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minutes max for scraping

/**
 * GET /api/research/zik
 *
 * Get ZIK session status and rate limit info
 */
export async function GET() {
  try {
    const hasSession = await hasValidZikSession()
    const rateLimits = {
      search: await rateLimiter.check('zik', 'search'),
      category: await rateLimiter.check('zik', 'category'),
    }

    return NextResponse.json({
      success: true,
      session: {
        valid: hasSession,
      },
      rateLimits,
    })
  } catch (error) {
    console.error('[ZIK API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/research/zik
 *
 * Search for products on ZIK Analytics
 *
 * Body:
 * {
 *   action: 'search' | 'trending' | 'categories' | 'login',
 *   filters?: ZikSearchFilters,
 *   maxResults?: number,
 *   credentials?: { email: string, password: string, twoFactorCode?: string }
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, filters, maxResults = 50, credentials } = body

    switch (action) {
      case 'login': {
        const result = await loginToZik(credentials)
        return NextResponse.json({
          success: result.success,
          error: result.error,
          requiresTwoFactor: result.requiresTwoFactor,
        })
      }

      case 'search': {
        // Check rate limit
        const limitStatus = await rateLimiter.check('zik', 'search')
        if (!limitStatus.allowed) {
          return NextResponse.json(
            {
              success: false,
              error: 'Rate limit exceeded',
              retryAfter: limitStatus.retryAfterMs,
              resetAt: limitStatus.resetAt.toISOString(),
            },
            { status: 429 }
          )
        }

        const searchFilters: ZikSearchFilters = {
          query: filters?.query,
          category: filters?.category,
          minPrice: filters?.minPrice,
          maxPrice: filters?.maxPrice,
          minSold: filters?.minSold,
          dateRange: filters?.dateRange || '30',
        }

        const result = await searchZikProducts(searchFilters, { maxResults })

        // Record the request
        await rateLimiter.record('zik', 'search')

        // Save products to database if successful
        if (result.success && result.products.length > 0) {
          await saveZikProductsToDatabase(result.products, searchFilters.query || 'search')
        }

        return NextResponse.json({
          success: result.success,
          query: result.query,
          totalResults: result.totalResults,
          hasMorePages: result.hasMorePages,
          products: result.products,
          error: result.error,
        })
      }

      case 'trending': {
        const limitStatus = await rateLimiter.check('zik', 'search')
        if (!limitStatus.allowed) {
          return NextResponse.json(
            { success: false, error: 'Rate limit exceeded', retryAfter: limitStatus.retryAfterMs },
            { status: 429 }
          )
        }

        const result = await getTrendingProducts({
          category: filters?.category,
          limit: maxResults,
        })

        await rateLimiter.record('zik', 'search')

        if (result.success && result.products.length > 0) {
          await saveZikProductsToDatabase(result.products, 'trending')
        }

        return NextResponse.json({
          success: result.success,
          totalResults: result.totalResults,
          products: result.products,
          error: result.error,
        })
      }

      case 'categories': {
        const limitStatus = await rateLimiter.check('zik', 'category')
        if (!limitStatus.allowed) {
          return NextResponse.json(
            { success: false, error: 'Rate limit exceeded', retryAfter: limitStatus.retryAfterMs },
            { status: 429 }
          )
        }

        const result = await getCategories({
          includeSubcategories: filters?.includeSubcategories ?? true,
          maxDepth: filters?.maxDepth ?? 2,
        })

        await rateLimiter.record('zik', 'category')

        return NextResponse.json({
          success: result.success,
          categories: result.categories,
          trending: result.trending,
          error: result.error,
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[ZIK API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Save ZIK products to database for later processing
 */
async function saveZikProductsToDatabase(
  products: Array<{
    title: string
    price: number | null
    soldCount: number | null
    category: string | null
    seller: string | null
    ebayUrl: string | null
    ebayItemId: string | null
    scrapedAt: string
  }>,
  source: string
): Promise<number> {
  let savedCount = 0
  const batchId = `zik_${source}_${Date.now()}`

  for (const product of products) {
    if (!product.title || !product.ebayItemId) continue

    try {
      // Save to a zik_products staging table (or raw_products with zik source)
      // For now, we'll log and return count
      // In production, this would insert into a staging table

      // Check if we already have this eBay item
      const { data: existing } = await supabase
        .from('raw_products')
        .select('id')
        .eq('source', 'zik')
        .eq('asin', product.ebayItemId) // Using asin field for eBay item ID
        .single()

      if (!existing) {
        // Would insert new ZIK product
        // For now, just count
        savedCount++
      }
    } catch (error) {
      // Ignore errors for individual products
    }
  }

  console.log(`[ZIK API] Would save ${savedCount} products from batch ${batchId}`)
  return savedCount
}
