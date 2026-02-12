/**
 * AutoDS Authentication API
 *
 * POST /api/autods/auth - Login to AutoDS
 * GET /api/autods/auth - Check session status
 * DELETE /api/autods/auth - Logout/invalidate session
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  loginToAutoDS,
  getSessionStatus,
  invalidateAllSessions,
  verifySession,
} from '@/lib/automation/autods'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { email, password } = body

    // Use provided credentials or fall back to env vars
    const credentials = email && password ? { email, password } : undefined

    const result = await loginToAutoDS(credentials)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Login successful',
        sessionId: result.sessionId,
      })
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 401 }
    )
  } catch (error) {
    console.error('[API] AutoDS auth error:', error)
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const status = await getSessionStatus()

    return NextResponse.json({
      success: true,
      ...status,
    })
  } catch (error) {
    console.error('[API] AutoDS session status error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get session status' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    await invalidateAllSessions()

    return NextResponse.json({
      success: true,
      message: 'All sessions invalidated',
    })
  } catch (error) {
    console.error('[API] AutoDS logout error:', error)
    return NextResponse.json(
      { success: false, error: 'Logout failed' },
      { status: 500 }
    )
  }
}
