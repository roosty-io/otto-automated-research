import { NextResponse } from 'next/server'
import { calculateQualityScore, rankProducts, filterByQuality, SCORE_THRESHOLDS } from '@/lib/ai'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/processing/score
 *
 * Calculate quality scores for products.
 *
 * Actions:
 * - score: Score a single product
 * - rank: Score and rank multiple products
 * - filter: Filter products by minimum score
 * - update-scores: Update quality scores in database
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action = 'score', ...params } = body

    switch (action) {
      case 'score': {
        // Score a single product
        const productData = params.product
        if (!productData) {
          return NextResponse.json({ error: 'Product data required' }, { status: 400 })
        }

        const score = calculateQualityScore({
          salesRank: productData.salesRank,
          reviewCount: productData.reviewCount,
          rating: productData.rating,
          ebaySOldCount: productData.ebaySoldCount,
          competitorCount: productData.competitorCount,
          amazonPrice: productData.amazonPrice,
          ebayPrice: productData.ebayPrice,
          aiQualitySignals: productData.qualitySignals,
          category: productData.category,
        }, params.config || {})

        return NextResponse.json({
          success: true,
          score,
        })
      }

      case 'rank': {
        // Score and rank multiple products
        const products = params.products
        if (!Array.isArray(products) || products.length === 0) {
          return NextResponse.json({ error: 'Products array required' }, { status: 400 })
        }

        const ranked = rankProducts(
          products.map((p: any) => ({
            id: p.id,
            data: {
              salesRank: p.salesRank,
              reviewCount: p.reviewCount,
              rating: p.rating,
              ebaySOldCount: p.ebaySoldCount,
              competitorCount: p.competitorCount,
              amazonPrice: p.amazonPrice,
              ebayPrice: p.ebayPrice,
              aiQualitySignals: p.qualitySignals,
              category: p.category,
            },
          })),
          params.config || {}
        )

        return NextResponse.json({
          success: true,
          rankings: ranked,
          totalProducts: ranked.length,
        })
      }

      case 'filter': {
        // Filter products by minimum score
        const products = params.products
        const minScore = params.minScore || SCORE_THRESHOLDS.fair

        if (!Array.isArray(products) || products.length === 0) {
          return NextResponse.json({ error: 'Products array required' }, { status: 400 })
        }

        const filtered = filterByQuality(
          products.map((p: any) => ({
            id: p.id,
            data: {
              salesRank: p.salesRank,
              reviewCount: p.reviewCount,
              rating: p.rating,
              ebaySOldCount: p.ebaySoldCount,
              competitorCount: p.competitorCount,
              amazonPrice: p.amazonPrice,
              ebayPrice: p.ebayPrice,
              aiQualitySignals: p.qualitySignals,
              category: p.category,
            },
          })),
          minScore,
          params.config || {}
        )

        return NextResponse.json({
          success: true,
          filtered,
          passedCount: filtered.length,
          filteredOutCount: products.length - filtered.length,
          threshold: minScore,
        })
      }

      case 'update-scores': {
        // Update quality scores for normalized products in database
        const limit = params.limit || 50

        // Fetch normalized products that need scoring
        const { data: products, error } = await supabase
          .from('normalized_products')
          .select(`
            id,
            raw_product_id,
            normalized_category,
            quality_signals,
            raw_products (
              amazon_price,
              sales_rank,
              review_count,
              rating
            )
          `)
          .is('quality_score', null)
          .limit(limit)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!products || products.length === 0) {
          return NextResponse.json({
            success: true,
            message: 'No products need scoring',
            updated: 0,
          })
        }

        let updatedCount = 0
        const results: { id: string; score: number; grade: string }[] = []

        for (const product of products as any[]) {
          const rawProduct = product.raw_products

          const score = calculateQualityScore({
            salesRank: rawProduct?.sales_rank,
            reviewCount: rawProduct?.review_count,
            rating: rawProduct?.rating,
            amazonPrice: rawProduct?.amazon_price,
            aiQualitySignals: product.quality_signals,
            category: product.normalized_category,
          })

          // Update the product
          const { error: updateError } = await supabase
            .from('normalized_products')
            .update({
              quality_score: score.overall,
              demand_confidence: score.confidence,
              updated_at: new Date().toISOString(),
            })
            .eq('id', product.id)

          if (!updateError) {
            updatedCount++
            results.push({
              id: product.id,
              score: score.overall,
              grade: score.grade,
            })
          }
        }

        return NextResponse.json({
          success: true,
          updated: updatedCount,
          total: products.length,
          results,
          thresholds: SCORE_THRESHOLDS,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('[Score API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/processing/score
 *
 * Get score thresholds and configuration
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    thresholds: SCORE_THRESHOLDS,
    grades: {
      A: `Score >= ${SCORE_THRESHOLDS.excellent}`,
      B: `Score >= ${SCORE_THRESHOLDS.good}`,
      C: `Score >= ${SCORE_THRESHOLDS.fair}`,
      D: `Score >= ${SCORE_THRESHOLDS.poor}`,
      F: `Score < ${SCORE_THRESHOLDS.poor}`,
    },
    recommendations: {
      strong_buy: 'High score (80+) with good confidence',
      buy: 'Good score (65+) with decent confidence',
      hold: 'Fair score (45+) - needs more analysis',
      avoid: 'Poor score or deal-breakers found',
    },
  })
}
