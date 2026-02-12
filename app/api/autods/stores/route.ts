/**
 * AutoDS Stores API
 *
 * GET /api/autods/stores - Get connected stores
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedPage, getConnectedStores } from '@/lib/automation/autods'

export async function GET() {
  try {
    const authenticated = await getAuthenticatedPage()

    if (!authenticated) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { page, release } = authenticated

    try {
      const stores = await getConnectedStores(page)

      return NextResponse.json({
        success: true,
        stores,
      })
    } finally {
      await release()
    }
  } catch (error) {
    console.error('[API] AutoDS stores error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get stores' },
      { status: 500 }
    )
  }
}
