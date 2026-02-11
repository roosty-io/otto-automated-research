import { NextRequest, NextResponse } from 'next/server'
import {
  updateRepricingRule,
  deleteRepricingRule,
  getDefaultRepricingRules,
} from '@/lib/repricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/repricing/rules
 *
 * Get default repricing rules templates
 */
export async function GET() {
  try {
    const rules = getDefaultRepricingRules()
    return NextResponse.json({
      success: true,
      rules,
    })
  } catch (error) {
    console.error('[Repricing Rules] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/repricing/rules
 *
 * Update a repricing rule
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { ruleId, updates } = body

    if (!ruleId) {
      return NextResponse.json(
        { error: 'ruleId is required' },
        { status: 400 }
      )
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'updates object is required' },
        { status: 400 }
      )
    }

    const result = await updateRepricingRule(ruleId, updates)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      rule: result.rule,
    })
  } catch (error) {
    console.error('[Repricing Rules] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/repricing/rules
 *
 * Delete a repricing rule
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { ruleId } = body

    if (!ruleId) {
      return NextResponse.json(
        { error: 'ruleId is required' },
        { status: 400 }
      )
    }

    const result = await deleteRepricingRule(ruleId)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error('[Repricing Rules] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
