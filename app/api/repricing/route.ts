import { NextRequest, NextResponse } from 'next/server'
import {
  getAllRepricingRules,
  createRepricingRule,
  runRepricingBatch,
  getRepricingStats,
} from '@/lib/repricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/repricing
 *
 * Get repricing rules or stats
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'rules'
    const storeId = searchParams.get('storeId') || undefined

    switch (type) {
      case 'rules': {
        const rules = await getAllRepricingRules()
        return NextResponse.json({
          success: true,
          rules,
          total: rules.length,
        })
      }

      case 'stats': {
        const daysBack = searchParams.get('daysBack')
          ? parseInt(searchParams.get('daysBack')!)
          : 30

        const stats = await getRepricingStats({ storeId, daysBack })
        return NextResponse.json({
          success: true,
          stats,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Repricing API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/repricing
 *
 * Create rule or run repricing batch
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'create-rule': {
        const { rule, storeId } = body

        if (!rule || !rule.name || !rule.strategy) {
          return NextResponse.json(
            { error: 'rule with name and strategy is required' },
            { status: 400 }
          )
        }

        const newRule = await createRepricingRule(rule, storeId)
        return NextResponse.json({
          success: true,
          rule: newRule,
        })
      }

      case 'run-batch': {
        const { storeId, dryRun = true, maxListings = 1000 } = body

        const result = await runRepricingBatch({
          storeId,
          dryRun,
          maxListings,
        })

        return NextResponse.json({
          success: true,
          result,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Repricing API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
