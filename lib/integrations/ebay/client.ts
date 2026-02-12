/**
 * eBay API Client
 *
 * Generic HTTP client for eBay APIs with:
 * - Automatic token management
 * - Rate limiting
 * - Retry logic
 * - Error handling
 */

import { getEbayConfig, EBAY_MARKETPLACES, type EbayMarketplace } from './config'
import { getValidAccessToken, getApplicationToken } from './auth'

export interface EbayApiError {
  errorId: number
  domain: string
  category: string
  message: string
  longMessage?: string
  parameters?: Array<{ name: string; value: string }>
}

export interface EbayApiResponse<T> {
  success: boolean
  data?: T
  errors?: EbayApiError[]
  warnings?: EbayApiError[]
  httpStatus: number
}

// Rate limiting state
const rateLimitState: Record<string, { count: number; resetAt: number }> = {}
const MAX_REQUESTS_PER_SECOND = 5

async function waitForRateLimit(endpoint: string): Promise<void> {
  const now = Date.now()
  const state = rateLimitState[endpoint] || { count: 0, resetAt: now + 1000 }

  if (now > state.resetAt) {
    rateLimitState[endpoint] = { count: 1, resetAt: now + 1000 }
    return
  }

  if (state.count >= MAX_REQUESTS_PER_SECOND) {
    const waitTime = state.resetAt - now
    await new Promise(resolve => setTimeout(resolve, waitTime))
    rateLimitState[endpoint] = { count: 1, resetAt: Date.now() + 1000 }
    return
  }

  state.count++
}

export class EbayClient {
  private storeId?: string
  private marketplace: EbayMarketplace
  private maxRetries: number

  constructor(options: {
    storeId?: string
    marketplace?: EbayMarketplace
    maxRetries?: number
  } = {}) {
    this.storeId = options.storeId
    this.marketplace = options.marketplace || 'US'
    this.maxRetries = options.maxRetries || 3
  }

  /**
   * Make an authenticated API request
   */
  async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
      body?: any
      headers?: Record<string, string>
      useApplicationToken?: boolean
      queryParams?: Record<string, string>
    } = {}
  ): Promise<EbayApiResponse<T>> {
    const config = getEbayConfig()
    const { method = 'GET', body, headers = {}, useApplicationToken = false, queryParams } = options

    // Get access token
    let accessToken: string | null
    if (useApplicationToken) {
      accessToken = await getApplicationToken()
    } else if (this.storeId) {
      accessToken = await getValidAccessToken(this.storeId)
    } else {
      throw new Error('No storeId provided and not using application token')
    }

    if (!accessToken) {
      return {
        success: false,
        errors: [{ errorId: 0, domain: 'auth', category: 'auth', message: 'No valid access token' }],
        httpStatus: 401,
      }
    }

    // Build URL
    let url = `${config.apiUrl}${endpoint}`
    if (queryParams) {
      const params = new URLSearchParams(queryParams)
      url += `?${params.toString()}`
    }

    // Apply rate limiting
    await waitForRateLimit(endpoint)

    // Make request with retry logic
    let lastError: Error | null = null
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACES[this.marketplace],
            'Accept': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        })

        const responseData = await response.json().catch(() => ({}))

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5')
          console.log(`[eBay] Rate limited, waiting ${retryAfter}s...`)
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
          continue
        }

        // Handle errors
        if (!response.ok) {
          return {
            success: false,
            errors: responseData.errors || [{
              errorId: response.status,
              domain: 'api',
              category: 'request',
              message: responseData.message || `HTTP ${response.status}`,
            }],
            warnings: responseData.warnings,
            httpStatus: response.status,
          }
        }

        return {
          success: true,
          data: responseData as T,
          warnings: responseData.warnings,
          httpStatus: response.status,
        }
      } catch (error) {
        lastError = error as Error
        console.error(`[eBay] Request attempt ${attempt + 1} failed:`, error)

        if (attempt < this.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000 // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    return {
      success: false,
      errors: [{
        errorId: 0,
        domain: 'network',
        category: 'request',
        message: lastError?.message || 'Request failed after retries',
      }],
      httpStatus: 0,
    }
  }

  /**
   * GET request helper
   */
  async get<T>(endpoint: string, queryParams?: Record<string, string>): Promise<EbayApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', queryParams })
  }

  /**
   * POST request helper
   */
  async post<T>(endpoint: string, body: any): Promise<EbayApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body })
  }

  /**
   * PUT request helper
   */
  async put<T>(endpoint: string, body: any): Promise<EbayApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body })
  }

  /**
   * DELETE request helper
   */
  async delete<T>(endpoint: string): Promise<EbayApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }

  /**
   * Set the store ID for authenticated requests
   */
  setStoreId(storeId: string): void {
    this.storeId = storeId
  }

  /**
   * Set the marketplace for requests
   */
  setMarketplace(marketplace: EbayMarketplace): void {
    this.marketplace = marketplace
  }
}

// Create singleton instance
let ebayClientInstance: EbayClient | null = null

export function getEbayClient(storeId?: string): EbayClient {
  if (!ebayClientInstance) {
    ebayClientInstance = new EbayClient({ storeId })
  } else if (storeId) {
    ebayClientInstance.setStoreId(storeId)
  }
  return ebayClientInstance
}
