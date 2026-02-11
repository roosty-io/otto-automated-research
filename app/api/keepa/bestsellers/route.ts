import { NextResponse } from 'next/server'
import { getKeepaClient, type AmazonDomain } from '@/lib/integrations/keepa'

export const dynamic = 'force-dynamic'

/**
 * GET /api/keepa/bestsellers
 *
 * Get best sellers for an Amazon category
 *
 * Query params:
 * - categoryId: Amazon category ID (required)
 * - domain: Amazon domain (default: US)
 * - limit: Number of results (default: 100, max: 10000)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const categoryId = searchParams.get('categoryId')
  const domain = (searchParams.get('domain') || 'US') as AmazonDomain
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 10000)

  if (!categoryId) {
    return NextResponse.json(
      { error: 'categoryId query parameter is required' },
      { status: 400 }
    )
  }

  try {
    const keepa = getKeepaClient()

    const bestSellers = await keepa.getBestSellers(parseInt(categoryId, 10), {
      domain,
      range: limit,
    })

    return NextResponse.json({
      success: true,
      categoryId: parseInt(categoryId, 10),
      domain,
      count: bestSellers.length,
      tokensRemaining: keepa.getTokensRemaining(),
      bestSellers: bestSellers.map((item) => ({
        asin: item.asin,
        rank: item.rank,
        categoryId: item.categoryId,
        lastUpdate: new Date(item.lastUpdate).toISOString(),
      })),
    })
  } catch (error) {
    console.error('[Keepa Best Sellers] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/keepa/bestsellers
 *
 * Get best sellers and fetch full product data for top items
 *
 * Body:
 * {
 *   categoryId: number,
 *   domain?: 'US' | 'UK' | etc,
 *   limit?: number,
 *   fetchProducts?: boolean,  // Fetch full product data for results
 *   productLimit?: number     // How many products to fetch (default: 20)
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      categoryId,
      domain = 'US',
      limit = 100,
      fetchProducts = true,
      productLimit = 20,
    } = body

    if (!categoryId) {
      return NextResponse.json(
        { error: 'categoryId is required' },
        { status: 400 }
      )
    }

    const keepa = getKeepaClient()

    // Get best sellers list
    const bestSellers = await keepa.getBestSellers(categoryId, {
      domain: domain as AmazonDomain,
      range: Math.min(limit, 10000),
    })

    let products = null

    // Optionally fetch full product data
    if (fetchProducts && bestSellers.length > 0) {
      const asinsToFetch = bestSellers
        .slice(0, Math.min(productLimit, 100))
        .map((item) => item.asin)

      products = await keepa.getProducts(asinsToFetch, {
        domain: domain as AmazonDomain,
        stats: 90,
        buybox: true,
        rating: true,
      })
    }

    return NextResponse.json({
      success: true,
      categoryId,
      domain,
      bestSellersCount: bestSellers.length,
      tokensRemaining: keepa.getTokensRemaining(),
      bestSellers: bestSellers.slice(0, 100).map((item) => ({
        asin: item.asin,
        rank: item.rank,
      })),
      products: products?.map((p) => ({
        asin: p.asin,
        title: p.title,
        brand: p.brand,
        buyBoxPrice: p.buyBoxPrice,
        salesRank: p.salesRank,
        rating: p.rating,
        reviewCount: p.reviewCount,
        image: p.images[0],
      })),
    })
  } catch (error) {
    console.error('[Keepa Best Sellers] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
