import { NextResponse } from 'next/server'
import { normalizeProduct, normalizeProductBatch, cleanProductTitle } from '@/lib/ai'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/processing/normalize
 *
 * Normalize product data using Claude AI.
 *
 * Actions:
 * - normalize: Normalize a single product
 * - batch: Normalize multiple products
 * - clean-title: Quick title cleanup
 * - process-pending: Process pending raw_products
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action = 'normalize', ...params } = body

    switch (action) {
      case 'normalize': {
        // Single product normalization
        const product = params.product
        if (!product || !product.title) {
          return NextResponse.json({ error: 'Product with title required' }, { status: 400 })
        }

        const normalized = await normalizeProduct({
          id: product.id || 'temp',
          title: product.title,
          brand: product.brand,
          category: product.category,
          description: product.description,
          amazonPrice: product.amazonPrice,
          ebayPrice: product.ebayPrice,
          salesRank: product.salesRank,
          reviewCount: product.reviewCount,
          rating: product.rating,
          asin: product.asin,
        })

        // Optionally save to database
        if (params.saveToDatabase && product.id) {
          await saveNormalizedProduct(product.id, normalized)
        }

        return NextResponse.json({
          success: true,
          normalized,
        })
      }

      case 'batch': {
        // Batch normalization
        const products = params.products
        if (!Array.isArray(products) || products.length === 0) {
          return NextResponse.json({ error: 'Products array required' }, { status: 400 })
        }

        const result = await normalizeProductBatch(
          products.map((p: any) => ({
            id: p.id || `temp-${Math.random()}`,
            title: p.title,
            brand: p.brand,
            category: p.category,
            description: p.description,
            amazonPrice: p.amazonPrice,
            ebayPrice: p.ebayPrice,
            salesRank: p.salesRank,
            reviewCount: p.reviewCount,
            rating: p.rating,
            asin: p.asin,
          })),
          { batchSize: params.batchSize || 5 }
        )

        // Save to database if requested
        if (params.saveToDatabase) {
          for (const r of result.results) {
            if (r.normalized) {
              await saveNormalizedProduct(r.productId, r.normalized)
            }
          }
        }

        return NextResponse.json({
          success: result.success,
          results: result.results,
          processingTime: result.processingTime,
        })
      }

      case 'clean-title': {
        // Quick title cleanup
        const title = params.title
        if (!title) {
          return NextResponse.json({ error: 'Title required' }, { status: 400 })
        }

        const cleanedTitle = await cleanProductTitle(title)

        return NextResponse.json({
          success: true,
          original: title,
          cleaned: cleanedTitle,
        })
      }

      case 'process-pending': {
        // Process pending raw_products from database
        const limit = params.limit || 10

        // Fetch pending products
        const { data: rawProducts, error } = await supabase
          .from('raw_products')
          .select('*')
          .eq('is_processed', false)
          .order('created_at', { ascending: true })
          .limit(limit)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!rawProducts || rawProducts.length === 0) {
          return NextResponse.json({
            success: true,
            message: 'No pending products to process',
            processed: 0,
          })
        }

        // Normalize each product
        const results = await normalizeProductBatch(
          rawProducts.map((p: any) => ({
            id: p.id,
            title: p.title,
            brand: p.brand,
            category: p.category,
            description: p.description,
            amazonPrice: p.amazon_price,
            salesRank: p.sales_rank,
            reviewCount: p.review_count,
            rating: p.rating,
            asin: p.asin,
          }))
        )

        // Save results
        let savedCount = 0
        for (const r of results.results) {
          if (r.normalized) {
            const saved = await saveNormalizedProduct(r.productId, r.normalized)
            if (saved) savedCount++
          }
        }

        return NextResponse.json({
          success: true,
          processed: rawProducts.length,
          normalized: results.results.filter((r) => r.normalized).length,
          saved: savedCount,
          failed: results.results.filter((r) => r.error).length,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('[Normalize API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper to save normalized product
async function saveNormalizedProduct(rawProductId: string, normalized: any): Promise<boolean> {
  try {
    // Insert into normalized_products
    const { error: insertError } = await supabase.from('normalized_products').insert({
      raw_product_id: rawProductId,
      normalized_title: normalized.normalizedTitle,
      normalized_category: normalized.normalizedCategory,
      normalized_brand: normalized.normalizedBrand,
      subcategory: normalized.subcategory,
      bullet_points: normalized.bulletPoints,
      key_features: normalized.keyFeatures,
      specifications: normalized.specifications,
      target_audience: normalized.targetAudience,
      use_case: normalized.useCase,
      quality_signals: normalized.qualitySignals,
      seo_keywords: normalized.seoKeywords,
      suggested_tags: normalized.suggestedTags,
      confidence_score: normalized.confidenceScore,
      ai_model: 'claude-sonnet-4-20250514',
    })

    if (insertError) {
      console.error('Error saving normalized product:', insertError)
      return false
    }

    // Mark raw product as processed
    await supabase
      .from('raw_products')
      .update({ is_processed: true, processed_at: new Date().toISOString() })
      .eq('id', rawProductId)

    return true
  } catch (error) {
    console.error('Error in saveNormalizedProduct:', error)
    return false
  }
}
