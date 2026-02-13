import { NextResponse } from 'next/server'
import {
  startResearchPipeline,
  getPipelineStatus,
  cancelPipeline,
  getUserPipelines,
  getPipelineStats,
} from '@/lib/pipeline'

/**
 * POST /api/research/pipeline
 *
 * Start a new research pipeline or perform pipeline actions.
 *
 * Body:
 * {
 *   action: 'start' | 'status' | 'cancel' | 'list' | 'stats',
 *   // For 'start':
 *   query?: string,
 *   category?: string,
 *   minSold?: number,
 *   maxSold?: number,
 *   minPrice?: number,
 *   maxPrice?: number,
 *   dateRange?: '7' | '14' | '30' | '90',
 *   maxProducts?: number,
 *   autoSourceFromAmazon?: boolean,
 *   autoNormalize?: boolean,
 *   autoGenerateSkus?: boolean,
 *   storeId?: string,       // Associate results with a specific store
 *   testMode?: boolean,     // Enable test mode (limited external API calls)
 *   // For 'status' or 'cancel':
 *   pipelineId?: string,
 *   // For 'list':
 *   limit?: number,
 *   status?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action = 'start', ...params } = body

    switch (action) {
      case 'start': {
        const result = await startResearchPipeline({
          query: params.query,
          category: params.category,
          minSold: params.minSold,
          maxSold: params.maxSold,
          minPrice: params.minPrice,
          maxPrice: params.maxPrice,
          dateRange: params.dateRange,
          maxProducts: params.maxProducts,
          autoSourceFromAmazon: params.autoSourceFromAmazon ?? true,
          autoNormalize: params.autoNormalize ?? false,
          autoGenerateSkus: params.autoGenerateSkus ?? false,
          storeId: params.storeId,
          userId: params.userId,
          sessionId: params.sessionId,
          testMode: params.testMode ?? false,
        })

        if (!result.success) {
          return NextResponse.json(
            { error: result.error, pipelineId: result.pipelineId },
            { status: 400 }
          )
        }

        return NextResponse.json({
          success: true,
          pipelineId: result.pipelineId,
          progress: result.progress,
        })
      }

      case 'status': {
        if (!params.pipelineId) {
          return NextResponse.json({ error: 'pipelineId required' }, { status: 400 })
        }

        const progress = await getPipelineStatus(params.pipelineId)
        if (!progress) {
          return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
        }

        return NextResponse.json({
          success: true,
          pipelineId: params.pipelineId,
          progress,
        })
      }

      case 'cancel': {
        if (!params.pipelineId) {
          return NextResponse.json({ error: 'pipelineId required' }, { status: 400 })
        }

        await cancelPipeline(params.pipelineId)

        return NextResponse.json({
          success: true,
          pipelineId: params.pipelineId,
          message: 'Pipeline cancelled',
        })
      }

      case 'list': {
        const pipelines = await getUserPipelines(params.userId || '', {
          limit: params.limit || 10,
          status: params.status,
        })

        return NextResponse.json({
          success: true,
          pipelines,
          count: pipelines.length,
        })
      }

      case 'stats': {
        const stats = await getPipelineStats()

        return NextResponse.json({
          success: true,
          stats,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Pipeline API] Error:', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/research/pipeline?pipelineId=xxx
 *
 * Get pipeline status (convenience endpoint)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const pipelineId = searchParams.get('pipelineId')

    if (!pipelineId) {
      // Return stats if no pipelineId
      const stats = await getPipelineStats()
      return NextResponse.json({ success: true, stats })
    }

    const progress = await getPipelineStatus(pipelineId)
    if (!progress) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      pipelineId,
      progress,
    })
  } catch (error) {
    console.error('[Pipeline API] Error:', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
