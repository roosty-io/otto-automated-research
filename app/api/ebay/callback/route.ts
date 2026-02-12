/**
 * eBay OAuth Callback
 *
 * GET /api/ebay/callback - Handle OAuth redirect from eBay
 */

import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, saveUserTokens } from '@/lib/integrations/ebay'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle errors from eBay
  if (error) {
    console.error('[eBay Callback] OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      new URL(`/stores?error=${encodeURIComponent(errorDescription || error)}`, request.url)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/stores?error=Missing%20authorization%20code', request.url)
    )
  }

  try {
    // Decode state to get storeId
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    const { storeId } = stateData

    if (!storeId) {
      throw new Error('Invalid state: missing storeId')
    }

    // Verify state is not too old (30 minutes max)
    if (Date.now() - stateData.timestamp > 30 * 60 * 1000) {
      throw new Error('Authorization request expired')
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Get eBay username (we'll need to make an API call for this)
    // For now, we'll use the storeId as a placeholder
    const ebayUsername = `store_${storeId}`

    // Save tokens to database
    await saveUserTokens(storeId, ebayUsername, tokens)

    // Update store record to mark as connected
    await supabase
      .from('stores')
      .update({
        ebay_connected: true,
        ebay_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', storeId)

    // Log successful connection
    await supabase.from('system_events').insert({
      event_type: 'ebay_connected',
      event_source: 'oauth_callback',
      context: { storeId },
      status: 'success',
    })

    // Redirect to store page with success message
    return NextResponse.redirect(
      new URL(`/stores/${storeId}?success=eBay%20connected%20successfully`, request.url)
    )
  } catch (error) {
    console.error('[eBay Callback] Error:', error)

    // Log failure
    await supabase.from('system_events').insert({
      event_type: 'ebay_connection_failed',
      event_source: 'oauth_callback',
      context: { error: error instanceof Error ? error.message : 'Unknown error' },
      status: 'error',
    })

    return NextResponse.redirect(
      new URL(`/stores?error=${encodeURIComponent(error instanceof Error ? error.message : 'Connection failed')}`, request.url)
    )
  }
}
