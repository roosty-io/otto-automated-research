import { NextResponse } from 'next/server'
import { generateSku, generateSkuBatch, saveGeneratedSku } from '@/lib/ai'
import { calculateQualityScore } from '@/lib/ai'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/processing/generate-sku
 *
 * Generate optimized SKUs from normalized products.
 *
 * Actions:
 * - generate: Generate SKU for a single product
 * - batch: Generate SKUs for multiple products
 * - process-ready: Generate SKUs for ready normalized products
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action = 'generate', ...params } = body

    switch (action) {
      case 'generate': {
        // Generate SKU for a single product
        const { normalizedProduct, costPrice } = params

        if (!normalizedProduct || !costPrice) {
          return NextResponse.json(
            { error: 'normalizedProduct and costPrice required' },
            { status: 400 }
          )
        }

        // Calculate quality score if not provided
        const qualityScore = params.qualityScore || calculateQualityScore({
          amazonPrice: costPrice,
          aiQualitySignals: normalizedProduct.qualitySignals,
          category: normalizedProduct.normalizedCategory,
        })

        const sku = await generateSku(
          {
            normalizedProductId: params.normalizedProductId || 'preview',
            normalizedProduct,
            costPrice,
            sourceAsin: params.asin,
            sourceUrl: params.sourceUrl,
            qualityScore,
            imageUrls: params.imageUrls,
          },
          params.config || {}
        )

        // Optionally save to database
        if (params.saveToDatabase && params.normalizedProductId) {
          const saved = await saveGeneratedSku(sku, params.normalizedProductId)
          return NextResponse.json({
            success: true,
            sku,
            savedId: saved?.id,
          })
        }

        return NextResponse.json({
          success: true,
          sku,
        })
      }

      case 'batch': {
        // Generate SKUs for multiple products
        const inputs = params.inputs
        if (!Array.isArray(inputs) || inputs.length === 0) {
          return NextResponse.json({ error: 'inputs array required' }, { status: 400 })
        }

        const result = await generateSkuBatch(
          inputs.map((input: any) => ({
            normalizedProductId: input.normalizedProductId,
            normalizedProduct: input.normalizedProduct,
            costPrice: input.costPrice,
            sourceAsin: input.asin,
            qualityScore: input.qualityScore,
          })),
          params.config || {}
        )

        // Optionally save to database
        if (params.saveToDatabase) {
          const savedIds: string[] = []
          for (let i = 0; i < result.generated.length; i++) {
            const sku = result.generated[i]
            const input = inputs[i]
            if (input.normalizedProductId) {
              const saved = await saveGeneratedSku(sku, input.normalizedProductId)
              if (saved) savedIds.push(saved.id)
            }
          }

          return NextResponse.json({
            success: true,
            generated: result.generated.length,
            failed: result.failed.length,
            savedIds,
            errors: result.failed,
          })
        }

        return NextResponse.json({
          success: true,
          generated: result.generated,
          failed: result.failed,
        })
      }

      case 'process-ready': {
        // Generate SKUs for ready normalized products
        const limit = params.limit || 20
        const minScore = params.minScore || 60

        // Fetch normalized products ready for SKU generation
        const { data: products, error } = await supabase
          .from('normalized_products')
          .select(`
            id,
            raw_product_id,
            normalized_title,
            normalized_category,
            normalized_brand,
            subcategory,
            bullet_points,
            key_features,
            specifications,
            target_audience,
            use_case,
            quality_signals,
            seo_keywords,
            suggested_tags,
            confidence_score,
            quality_score,
            raw_products (
              amazon_price,
              asin,
              amazon_url
            )
          `)
          .is('sku_id', null)
          .gte('quality_score', minScore)
          .order('quality_score', { ascending: false })
          .limit(limit)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!products || products.length === 0) {
          return NextResponse.json({
            success: true,
            message: 'No products ready for SKU generation',
            generated: 0,
          })
        }

        let generatedCount = 0
        const generatedSkus: { normalizedProductId: string; skuCode: string; skuId: string }[] = []
        const errors: { productId: string; error: string }[] = []

        for (const product of products as any[]) {
          try {
            const rawProduct = product.raw_products
            const costPrice = rawProduct?.amazon_price || 0

            if (costPrice <= 0) {
              errors.push({ productId: product.id, error: 'No cost price available' })
              continue
            }

            const sku = await generateSku({
              normalizedProductId: product.id,
              normalizedProduct: {
                normalizedTitle: product.normalized_title,
                normalizedBrand: product.normalized_brand,
                normalizedCategory: product.normalized_category,
                subcategory: product.subcategory,
                bulletPoints: product.bullet_points || [],
                keyFeatures: product.key_features || [],
                specifications: product.specifications || {},
                targetAudience: product.target_audience || [],
                useCase: product.use_case || 'General',
                qualitySignals: product.quality_signals || {},
                seoKeywords: product.seo_keywords || [],
                suggestedTags: product.suggested_tags || [],
                confidenceScore: product.confidence_score || 0.5,
              },
              costPrice,
              sourceAsin: rawProduct?.asin,
              sourceUrl: rawProduct?.amazon_url,
            })

            // Save SKU
            const saved = await saveGeneratedSku(sku, product.id)
            if (saved) {
              // Update normalized product with SKU reference
              await supabase
                .from('normalized_products')
                .update({ sku_id: saved.id })
                .eq('id', product.id)

              generatedSkus.push({
                normalizedProductId: product.id,
                skuCode: sku.skuCode,
                skuId: saved.id,
              })
              generatedCount++
            }
          } catch (err) {
            errors.push({
              productId: product.id,
              error: err instanceof Error ? err.message : 'Unknown error',
            })
          }
        }

        return NextResponse.json({
          success: true,
          processed: products.length,
          generated: generatedCount,
          skus: generatedSkus,
          errors: errors.length > 0 ? errors : undefined,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('[Generate SKU API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/processing/generate-sku
 *
 * Get SKU generation stats and configuration.
 */
export async function GET() {
  try {
    // Get SKU stats
    const { data: stats } = await supabase.rpc('get_sku_stats').single()

    // Get recent SKUs
    const { data: recentSkus } = await supabase
      .from('skus')
      .select('id, sku_code, listing_title, suggested_price, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      success: true,
      stats: stats || {
        total: 0,
        ready: 0,
        needs_review: 0,
        listed: 0,
      },
      recentSkus: recentSkus || [],
      config: {
        defaultMinMargin: 25,
        defaultMaxMargin: 60,
        pricingStrategies: ['competitive', 'premium', 'value', 'dynamic'],
        shippingTypes: ['free', 'calculated', 'flat'],
      },
    })
  } catch (error) {
    console.error('[Generate SKU API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
