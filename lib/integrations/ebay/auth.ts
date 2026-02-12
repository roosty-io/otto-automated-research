/**
 * eBay OAuth 2.0 Authentication
 *
 * Handles:
 * - Authorization URL generation
 * - Token exchange (authorization code -> access token)
 * - Token refresh
 * - Token storage and retrieval
 */

import { supabase } from '@/lib/supabase'
import { getEbayConfig, EBAY_SCOPES } from './config'

export interface EbayTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  tokenType: string
  scope: string[]
}

export interface EbayUserToken {
  id: string
  storeId: string
  ebayUsername: string
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scopes: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Generate OAuth authorization URL for user consent
 */
export function getAuthorizationUrl(state: string): string {
  const config = getEbayConfig()

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: EBAY_SCOPES.join(' '),
    state: state,
  })

  return `${config.authUrl}?${params.toString()}`
}

/**
 * Exchange authorization code for access tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<EbayTokens> {
  const config = getEbayConfig()

  const credentials = Buffer.from(`${config.appId}:${config.certId}`).toString('base64')

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[eBay Auth] Token exchange failed:', error)
    throw new Error(`eBay token exchange failed: ${response.status}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    tokenType: data.token_type,
    scope: data.scope?.split(' ') || [],
  }
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<EbayTokens> {
  const config = getEbayConfig()

  const credentials = Buffer.from(`${config.appId}:${config.certId}`).toString('base64')

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: EBAY_SCOPES.join(' '),
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[eBay Auth] Token refresh failed:', error)
    throw new Error(`eBay token refresh failed: ${response.status}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // May not return new refresh token
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    tokenType: data.token_type,
    scope: data.scope?.split(' ') || [],
  }
}

/**
 * Get application-level access token (for public APIs)
 */
export async function getApplicationToken(): Promise<string> {
  const config = getEbayConfig()

  const credentials = Buffer.from(`${config.appId}:${config.certId}`).toString('base64')

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  })

  if (!response.ok) {
    throw new Error(`eBay application token failed: ${response.status}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Save user tokens to database
 */
export async function saveUserTokens(
  storeId: string,
  ebayUsername: string,
  tokens: EbayTokens
): Promise<void> {
  const { error } = await supabase
    .from('ebay_tokens')
    .upsert({
      store_id: storeId,
      ebay_username: ebayUsername,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt.toISOString(),
      scopes: tokens.scope,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'store_id',
    })

  if (error) {
    console.error('[eBay Auth] Failed to save tokens:', error)
    throw new Error(`Failed to save eBay tokens: ${error.message}`)
  }
}

/**
 * Get valid access token for a store (auto-refresh if needed)
 */
export async function getValidAccessToken(storeId: string): Promise<string | null> {
  const { data: tokenData, error } = await supabase
    .from('ebay_tokens')
    .select('*')
    .eq('store_id', storeId)
    .single()

  if (error || !tokenData) {
    console.log('[eBay Auth] No tokens found for store:', storeId)
    return null
  }

  const expiresAt = new Date(tokenData.expires_at)
  const now = new Date()

  // If token expires in less than 5 minutes, refresh it
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    console.log('[eBay Auth] Token expiring soon, refreshing...')

    try {
      const newTokens = await refreshAccessToken(tokenData.refresh_token)
      await saveUserTokens(storeId, tokenData.ebay_username, newTokens)
      return newTokens.accessToken
    } catch (error) {
      console.error('[eBay Auth] Token refresh failed:', error)
      return null
    }
  }

  return tokenData.access_token
}

/**
 * Check if a store has valid eBay authorization
 */
export async function hasValidAuthorization(storeId: string): Promise<boolean> {
  const token = await getValidAccessToken(storeId)
  return token !== null
}

/**
 * Revoke eBay authorization for a store
 */
export async function revokeAuthorization(storeId: string): Promise<void> {
  const { error } = await supabase
    .from('ebay_tokens')
    .delete()
    .eq('store_id', storeId)

  if (error) {
    throw new Error(`Failed to revoke eBay authorization: ${error.message}`)
  }
}
