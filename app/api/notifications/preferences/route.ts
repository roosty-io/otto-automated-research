import { NextRequest, NextResponse } from 'next/server'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/preferences
 *
 * Get notification preferences for a user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    const preferences = await getNotificationPreferences(userId)

    return NextResponse.json({
      success: true,
      preferences: preferences || {
        userId,
        enabledTypes: ['price_alert', 'order_received', 'job_completed', 'error'],
        enabledChannels: ['in_app'],
        dailyDigest: false,
        instantAlerts: true,
      },
    })
  } catch (error) {
    console.error('[Notification Preferences API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/notifications/preferences
 *
 * Update notification preferences
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, ...preferences } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    const result = await updateNotificationPreferences(userId, preferences)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Notification Preferences API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
