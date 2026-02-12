import { NextRequest, NextResponse } from 'next/server'
import {
  sendNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications
 *
 * Get notifications or unread count
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'list'
    const userId = searchParams.get('userId') || undefined
    const storeId = searchParams.get('storeId') || undefined

    switch (type) {
      case 'list': {
        const unreadOnly = searchParams.get('unreadOnly') === 'true'
        const notifType = searchParams.get('notifType') as any
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = parseInt(searchParams.get('offset') || '0')

        const result = await getNotifications({
          userId,
          storeId,
          unreadOnly,
          type: notifType,
          limit,
          offset,
        })

        return NextResponse.json({
          success: true,
          ...result,
        })
      }

      case 'unread-count': {
        if (!userId) {
          return NextResponse.json(
            { error: 'userId is required' },
            { status: 400 }
          )
        }

        const count = await getUnreadCount(userId)
        return NextResponse.json({
          success: true,
          count,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Notifications API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/notifications
 *
 * Send notification or mark as read
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'send': {
        const { type, title, message, priority, channels, data, userId, storeId } = body

        if (!type || !title || !message) {
          return NextResponse.json(
            { error: 'type, title, and message are required' },
            { status: 400 }
          )
        }

        const result = await sendNotification({
          type,
          title,
          message,
          priority,
          channels,
          data,
          userId,
          storeId,
        })

        return NextResponse.json(result)
      }

      case 'mark-read': {
        const { notificationIds } = body

        if (!notificationIds || !Array.isArray(notificationIds)) {
          return NextResponse.json(
            { error: 'notificationIds array is required' },
            { status: 400 }
          )
        }

        const result = await markAsRead(notificationIds)
        return NextResponse.json(result)
      }

      case 'mark-all-read': {
        const { userId } = body

        if (!userId) {
          return NextResponse.json(
            { error: 'userId is required' },
            { status: 400 }
          )
        }

        const result = await markAllAsRead(userId)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Notifications API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
