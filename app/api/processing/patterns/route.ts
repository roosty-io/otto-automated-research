import { NextResponse } from 'next/server'
import { detectPatterns } from '@/lib/ai'

/**
 * POST /api/processing/patterns
 *
 * Detect patterns and opportunities in product data.
 *
 * Body:
 * {
 *   minConfidence?: number,  // Min confidence (0-1), default 0.6
 *   minProducts?: number,    // Min products per pattern, default 3
 *   lookbackDays?: number,   // Days to analyze, default 30
 *   categories?: string[],   // Filter by categories
 *   priceRange?: { min: number, max: number }
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const result = await detectPatterns({
      minConfidence: body.minConfidence,
      minProducts: body.minProducts,
      lookbackDays: body.lookbackDays,
      categories: body.categories,
      priceRange: body.priceRange,
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[Patterns API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/processing/patterns
 *
 * Run pattern detection with default settings.
 */
export async function GET() {
  try {
    const result = await detectPatterns()

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[Patterns API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
