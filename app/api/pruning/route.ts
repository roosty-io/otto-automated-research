import { NextRequest, NextResponse } from 'next/server'
import {
  getAllRules,
  createRule,
  updateRule,
  deleteRule,
  runPruningBatch,
  findPruningCandidates,
  getPruningStats,
  manualPrune,
} from '@/lib/pruning'

export const dynamic = 'force-dynamic'

/**
 * GET /api/pruning
 *
 * Get pruning info, rules, stats, or candidates
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'stats'
    const storeId = searchParams.get('storeId') || undefined
    const daysBack = searchParams.get('daysBack')
      ? parseInt(searchParams.get('daysBack')!)
      : 30

    switch (type) {
      case 'rules': {
        const rules = await getAllRules()
        return NextResponse.json({
          success: true,
          rules,
        })
      }

      case 'stats': {
        const stats = await getPruningStats({ storeId, daysBack })
        return NextResponse.json({
          success: true,
          stats,
        })
      }

      case 'candidates': {
        const maxListings = searchParams.get('limit')
          ? parseInt(searchParams.get('limit')!)
          : 100

        const candidates = await findPruningCandidates({
          storeId,
          maxListings,
        })

        return NextResponse.json({
          success: true,
          candidates: candidates.map((c) => ({
            listing: c.listing,
            rule: {
              id: c.evaluation.ruleId,
              name: c.evaluation.ruleName,
            },
            recommendedAction: c.recommendedAction,
          })),
          total: candidates.length,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Pruning API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/pruning
 *
 * Execute pruning actions or manage rules
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'run': {
        // Run automated pruning batch
        const { storeId, dryRun = true, maxListings } = body

        const result = await runPruningBatch({
          storeId,
          dryRun,
          maxListings,
        })

        return NextResponse.json({
          success: true,
          result: {
            totalEvaluated: result.totalEvaluated,
            totalMatched: result.totalMatched,
            actionsTaken: result.actionsTaken,
            errors: result.errors,
            duration: result.duration,
            dryRun,
          },
          details: dryRun ? result.results.slice(0, 20) : undefined,
        })
      }

      case 'manual_prune': {
        // Manually prune a specific listing
        const { assignmentId, reason } = body

        if (!assignmentId) {
          return NextResponse.json(
            { error: 'assignmentId is required' },
            { status: 400 }
          )
        }

        const result = await manualPrune(assignmentId, reason || 'Manual prune')

        return NextResponse.json({
          success: result.success,
          result,
          error: result.error,
        })
      }

      case 'create_rule': {
        // Create a new pruning rule
        const { rule } = body

        if (!rule || !rule.name || !rule.conditions || !rule.action) {
          return NextResponse.json(
            { error: 'Rule must have name, conditions, and action' },
            { status: 400 }
          )
        }

        const result = await createRule({
          name: rule.name,
          description: rule.description,
          isActive: rule.isActive ?? true,
          priority: rule.priority || 50,
          conditions: rule.conditions,
          action: rule.action,
          actionConfig: rule.actionConfig,
          cooldownDays: rule.cooldownDays,
          minListingAge: rule.minListingAge || 0,
        })

        return NextResponse.json({
          success: result.success,
          rule: result.rule,
          error: result.error,
        })
      }

      case 'update_rule': {
        // Update an existing rule
        const { ruleId, updates } = body

        if (!ruleId) {
          return NextResponse.json(
            { error: 'ruleId is required' },
            { status: 400 }
          )
        }

        const result = await updateRule(ruleId, updates)

        return NextResponse.json({
          success: result.success,
          error: result.error,
        })
      }

      case 'delete_rule': {
        // Delete a rule
        const { ruleId } = body

        if (!ruleId) {
          return NextResponse.json(
            { error: 'ruleId is required' },
            { status: 400 }
          )
        }

        const result = await deleteRule(ruleId)

        return NextResponse.json({
          success: result.success,
          error: result.error,
        })
      }

      case 'toggle_rule': {
        // Toggle rule active state
        const { ruleId, isActive } = body

        if (!ruleId || isActive === undefined) {
          return NextResponse.json(
            { error: 'ruleId and isActive are required' },
            { status: 400 }
          )
        }

        const result = await updateRule(ruleId, { isActive })

        return NextResponse.json({
          success: result.success,
          error: result.error,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Pruning API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
