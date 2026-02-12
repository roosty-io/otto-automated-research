/**
 * eBay OAuth Authorization API
 *
 * GET /api/ebay/auth?storeId=xxx - Get authorization URL
 * POST /api/ebay/auth - Check authorization status
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizationUrl, hasValidAuthorization } from '@/lib/integrations/ebay'
import { v4 as uuidv4 } from 'uuid'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('storeId')

  if (!storeId) {
    return NextResponse.json(
      { success: false, error: 'storeId is required' },
      { status: 400 }
    )
  }

  try {
    // Generate state parameter with storeId for callback
    const state = Buffer.from(JSON.stringify({
      storeId,
      nonce: uuidv4(),
      timestamp: Date.now(),
    })).toString('base64')

    const authUrl = getAuthorizationUrl(state)

    return NextResponse.json({
      success: true,
      authUrl,
      state,
    })
  } catch (error) {
    console.error('[eBay Auth] Error generating auth URL:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate authorization URL' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await request.json()

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId is required' },
        { status: 400 }
      )
    }

    const isAuthorized = await hasValidAuthorization(storeId)

    return NextResponse.json({
      success: true,
      authorized: isAuthorized,
    })
  } catch (error) {
    console.error('[eBay Auth] Error checking authorization:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to check authorization status' },
      { status: 500 }
    )
  }
}
