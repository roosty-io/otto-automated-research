import { NextRequest, NextResponse } from 'next/server'
import {
  createAlertRule,
  getAlertRules,
  checkAlerts,
} from '@/lib/notifications'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/alerts
 *
 * Get alert rules
 */
export async function GET() {
  try {
    const rules = await getAlertRules()

    return NextResponse.json({
      success: true,
      rules,
      total: rules.length,
    })
  } catch (error) {
    console.error('[Alerts API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/notifications/alerts
 *
 * Create alert rule or trigger alert check
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'create': {
        const { name, type, conditions, channels, priority, enabled, cooldownMinutes } = body

        if (!name || !type) {
          return NextResponse.json(
            { error: 'name and type are required' },
            { status: 400 }
          )
        }

        const result = await createAlertRule({
          name,
          type,
          conditions: conditions || [],
          channels: channels || ['in_app'],
          priority: priority || 'normal',
          enabled: enabled !== false,
          cooldownMinutes: cooldownMinutes || 60,
        })

        return NextResponse.json(result)
      }

      case 'check': {
        const { type, data } = body

        if (!type || !data) {
          return NextResponse.json(
            { error: 'type and data are required' },
            { status: 400 }
          )
        }

        const triggered = await checkAlerts({ type, data })

        return NextResponse.json({
          success: true,
          triggered,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Alerts API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/notifications/alerts
 *
 * Update an alert rule
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { ruleId, ...updates } = body

    if (!ruleId) {
      return NextResponse.json(
        { error: 'ruleId is required' },
        { status: 400 }
      )
    }

    const dbUpdates: Record<string, any> = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled
    if (updates.conditions !== undefined) dbUpdates.conditions = updates.conditions
    if (updates.channels !== undefined) dbUpdates.channels = updates.channels
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority
    if (updates.cooldownMinutes !== undefined) dbUpdates.cooldown_minutes = updates.cooldownMinutes

    const { error } = await supabase
      .from('alert_rules')
      .update(dbUpdates)
      .eq('id', ruleId)

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Alerts API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/notifications/alerts
 *
 * Delete an alert rule
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

    const { error } = await supabase
      .from('alert_rules')
      .delete()
      .eq('id', ruleId)

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Alerts API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
