import { NextResponse } from 'next/server'
import { getKeepaClient, type AmazonDomain, type ParsedKeepaProduct } from '@/lib/integrations/keepa'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/keepa/lookup
 *
 * Look up Amazon product data via Keepa API
 *
 * Body:
 * {
 *   asins: string | string[],  // ASIN(s) to lookup (max 100)
 *   domain?: 'US' | 'UK' | 'DE' | etc,  // Amazon domain (default: US)
 *   includeHistory?: boolean,  // Include price history (costs more tokens)
 *   saveToDatabase?: boolean   // Save results to raw_products table
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { asins, domain = 'US', includeHistory = false, saveToDatabase = true } = body

    if (!asins) {
      return NextResponse.json(
        { error: 'ASINs are required' },
        { status: 400 }
      )
    }

    const asinList = Array.isArray(asins) ? asins : [asins]

    if (asinList.length === 0) {
      return NextResponse.json(
        { error: 'At least one ASIN is required' },
        { status: 400 }
      )
    }

    if (asinList.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 ASINs per request' },
        { status: 400 }
      )
    }

    // Validate ASINs format (10 alphanumeric characters)
    const invalidAsins = asinList.filter((asin: string) => !/^[A-Z0-9]{10}$/.test(asin))
    if (invalidAsins.length > 0) {
      return NextResponse.json(
        { error: `Invalid ASIN format: ${invalidAsins.join(', ')}` },
        { status: 400 }
      )
    }

    const keepa = getKeepaClient()

    // Fetch products from Keepa
    const products = await keepa.getProducts(asinList, {
      domain: domain as AmazonDomain,
      history: includeHistory,
      stats: 180, // 180 days of stats
      buybox: true,
      rating: true,
    })

    // Save to database if requested
    let savedCount = 0
    if (saveToDatabase && products.length > 0) {
      savedCount = await saveToRawProducts(products, domain)
    }

    return NextResponse.json({
      success: true,
      found: products.length,
      requested: asinList.length,
      saved: savedCount,
      tokensRemaining: keepa.getTokensRemaining(),
      products: products.map(formatProductResponse),
    })
  } catch (error) {
    console.error('[Keepa Lookup] Error:', error)

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
 * GET /api/keepa/lookup?asin=B0...
 *
 * Quick lookup for a single ASIN
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const asin = searchParams.get('asin')
  const domain = searchParams.get('domain') || 'US'

  if (!asin) {
    return NextResponse.json(
      { error: 'ASIN query parameter is required' },
      { status: 400 }
    )
  }

  try {
    const keepa = getKeepaClient()
    const product = await keepa.getProduct(asin, {
      domain: domain as AmazonDomain,
      stats: 180,
      buybox: true,
      rating: true,
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      tokensRemaining: keepa.getTokensRemaining(),
      product: formatProductResponse(product),
    })
  } catch (error) {
    console.error('[Keepa Lookup] Error:', error)

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
 * Save Keepa products to raw_products table
 * Schema: asin, amazon_url, keepa_data, title, brand, category,
 *         amazon_price, sales_rank, review_count, rating,
 *         is_processed, source, source_batch_id
 */
async function saveToRawProducts(
  products: ParsedKeepaProduct[],
  domain: string
): Promise<number> {
  let savedCount = 0
  const batchId = `keepa_${domain.toLowerCase()}_${Date.now()}`

  for (const product of products) {
    try {
      // Check if product already exists (ASIN is unique)
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
        // Update existing - refresh data but keep processed state
        await supabase
          .from('raw_products')
          .update({
            keepa_data: rawProductData.keepa_data,
            title: rawProductData.title,
            brand: rawProductData.brand,
            category: rawProductData.category,
            amazon_price: rawProductData.amazon_price,
            sales_rank: rawProductData.sales_rank,
            review_count: rawProductData.review_count,
            rating: rawProductData.rating,
            source_batch_id: batchId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        // Insert new
        await supabase
          .from('raw_products')
          .insert(rawProductData)
      }

      savedCount++
    } catch (error) {
      console.error(`[Keepa] Failed to save product ${product.asin}:`, error)
    }
  }

  return savedCount
}

/**
 * Format product for API response (exclude raw data for smaller payload)
 */
function formatProductResponse(product: ParsedKeepaProduct) {
  return {
    asin: product.asin,
    title: product.title,
    brand: product.brand,
    manufacturer: product.manufacturer,
    images: product.images.slice(0, 5), // First 5 images
    pricing: {
      current: product.currentPrice,
      amazon: product.amazonPrice,
      new: product.newPrice,
      used: product.usedPrice,
      buyBox: product.buyBoxPrice,
      buyBoxIsFba: product.buyBoxIsFba,
      buyBoxIsAmazon: product.buyBoxIsAmazon,
    },
    metrics: {
      salesRank: product.salesRank,
      reviewCount: product.reviewCount,
      rating: product.rating,
    },
    fbaFees: product.fbaFees,
    dimensions: product.dimensions,
    identifiers: {
      upc: product.upc,
      ean: product.ean,
    },
    isAdult: product.isAdult,
    lastUpdate: product.lastUpdate.toISOString(),
    // Include summary of price history if available
    priceHistorySummary: {
      amazonDataPoints: product.priceHistory.amazon.length,
      newDataPoints: product.priceHistory.new.length,
      salesRankDataPoints: product.priceHistory.salesRank.length,
    },
  }
}
