import { NextRequest, NextResponse } from 'next/server'
import { getPendingReviews, resolveReview } from '@/lib/pruning'

export const dynamic = 'force-dynamic'

/**
 * GET /api/pruning/reviews
 *
 * Get pending pruning reviews
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId') || undefined
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 50

    const reviews = await getPendingReviews({ storeId, limit })

    return NextResponse.json({
      success: true,
      reviews,
      total: reviews.length,
    })
  } catch (error) {
    console.error('[Pruning Reviews] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/pruning/reviews
 *
 * Resolve a pending review
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { reviewId, resolution, action, notes } = body

    if (!reviewId) {
      return NextResponse.json(
        { error: 'reviewId is required' },
        { status: 400 }
      )
    }

    if (!resolution || !['approved', 'rejected'].includes(resolution)) {
      return NextResponse.json(
        { error: 'resolution must be "approved" or "rejected"' },
        { status: 400 }
      )
    }

    // If approved, action is required
    if (resolution === 'approved' && !action) {
      return NextResponse.json(
        { error: 'action is required when approving a review' },
        { status: 400 }
      )
    }

    const result = await resolveReview(reviewId, resolution, action, notes)

    return NextResponse.json({
      success: result.success,
      error: result.error,
    })
  } catch (error) {
    console.error('[Pruning Reviews] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
