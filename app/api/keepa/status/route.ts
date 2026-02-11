import { NextResponse } from 'next/server'
import { getKeepaClient } from '@/lib/integrations/keepa'

export const dynamic = 'force-dynamic'

/**
 * GET /api/keepa/status
 *
 * Get Keepa API token status
 * This is a free call that doesn't consume tokens
 */
export async function GET() {
  try {
    const keepa = getKeepaClient()
    const status = await keepa.getTokenStatus()

    return NextResponse.json({
      success: true,
      tokens: {
        remaining: status.tokensLeft,
        refillIn: status.refillIn,
        refillRate: status.refillRate,
        reductionFactor: status.tokenFlowReduction,
      },
      processing: {
        timeMs: status.processingTimeInMs,
        timestamp: new Date(status.timestamp).toISOString(),
      },
      // Helpful calculations
      estimates: {
        productLookups: Math.floor(status.tokensLeft / 2), // ~2 tokens per product
        bestSellerQueries: Math.floor(status.tokensLeft / 1), // 1 token per 10k results
        fullProductLookups: Math.floor(status.tokensLeft / 10), // ~10 tokens with history
      },
    })
  } catch (error) {
    console.error('[Keepa Status] Error:', error)

    // Check if it's an auth error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isAuthError = errorMessage.includes('401') || errorMessage.includes('key')

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        hint: isAuthError
          ? 'Check that KEEPA_API_KEY is set correctly in environment variables'
          : undefined,
      },
      { status: isAuthError ? 401 : 500 }
    )
  }
}
