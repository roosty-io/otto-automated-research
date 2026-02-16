/**
 * Keepa API Client
 *
 * Keepa provides Amazon product data including:
 * - Product details (title, images, categories, etc.)
 * - Price history (Amazon, new, used, etc.)
 * - Sales rank history
 * - Buy Box statistics
 * - Category best sellers
 *
 * API Documentation: https://keepa.com/#!discuss/t/pa-api
 */

// Keepa API configuration
const KEEPA_API_BASE = 'https://api.keepa.com'

// Get fetch function with proxy support for containerized environments
function getProxyFetch(): typeof fetch {
  const proxyUrl = process.env.GLOBAL_AGENT_HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.HTTPS_PROXY

  // In containerized environments, we need the proxy for DNS resolution
  if (proxyUrl && typeof window === 'undefined') {
    try {
      const { ProxyAgent, fetch: undiciFetch } = require('undici')
      const proxyAgent = new ProxyAgent({
        uri: proxyUrl,
        requestTls: {
          rejectUnauthorized: false
        }
      })
      console.log('[Keepa] Using proxy for API calls')

      return ((input: RequestInfo | URL, init?: RequestInit) => {
        return undiciFetch(input as any, {
          ...init,
          dispatcher: proxyAgent,
          headers: {
            'Accept-Encoding': 'gzip, deflate',
            'Accept': 'application/json',
            ...(init?.headers as Record<string, string> || {})
          }
        } as any)
      }) as typeof fetch
    } catch (e) {
      console.warn('[Keepa] Failed to create proxy fetch:', e)
    }
  }

  return fetch
}

// Amazon domain IDs
export const AMAZON_DOMAINS = {
  US: 1,
  UK: 2,
  DE: 3,
  FR: 4,
  JP: 5,
  CA: 6,
  IT: 8,
  ES: 9,
  IN: 10,
  MX: 11,
  BR: 12,
  AU: 13,
} as const

export type AmazonDomain = keyof typeof AMAZON_DOMAINS

// Price types in Keepa
export const PRICE_TYPES = {
  AMAZON: 0,
  NEW: 1,
  USED: 2,
  SALES_RANK: 3,
  LIST_PRICE: 4,
  COLLECTIBLE: 5,
  REFURBISHED: 6,
  NEW_FBM_SHIPPING: 7,
  LIGHTNING_DEAL: 8,
  WAREHOUSE: 9,
  NEW_FBA: 10,
  COUNT_NEW: 11,
  COUNT_USED: 12,
  COUNT_REFURBISHED: 13,
  COUNT_COLLECTIBLE: 14,
  EXTRA_INFO_UPDATES: 15,
  RATING: 16,
  COUNT_REVIEWS: 17,
  BUY_BOX_SHIPPING: 18,
  USED_NEW_SHIPPING: 19,
  USED_VERY_GOOD_SHIPPING: 20,
  USED_GOOD_SHIPPING: 21,
  USED_ACCEPTABLE_SHIPPING: 22,
  COLLECTIBLE_NEW_SHIPPING: 23,
  COLLECTIBLE_VERY_GOOD_SHIPPING: 24,
  COLLECTIBLE_GOOD_SHIPPING: 25,
  COLLECTIBLE_ACCEPTABLE_SHIPPING: 26,
  REFURBISHED_SHIPPING: 27,
  EBAY_NEW_SHIPPING: 28,
  EBAY_USED_SHIPPING: 29,
  TRADE_IN: 30,
  RENTAL: 31,
} as const

// Keepa product response types
export interface KeepaProduct {
  asin: string
  domainId: number
  title?: string
  trackingSince?: number
  listedSince?: number
  lastUpdate?: number
  lastRatingUpdate?: number
  lastPriceChange?: number
  lastEbayUpdate?: number
  imagesCSV?: string
  categories?: number[]
  rootCategory?: number
  parentAsin?: string
  variationCSV?: string
  mpn?: string
  partNumber?: string
  brand?: string
  productGroup?: string
  productType?: string
  manufacturer?: string
  binding?: string
  label?: string
  department?: string
  publisher?: string
  publicationDate?: number
  releaseDate?: number
  model?: string
  color?: string
  size?: string
  edition?: string
  platform?: string
  format?: string
  packageHeight?: number
  packageLength?: number
  packageWidth?: number
  packageWeight?: number
  packageQuantity?: number
  itemHeight?: number
  itemLength?: number
  itemWidth?: number
  itemWeight?: number
  eanList?: string[]
  upcList?: string[]
  description?: string
  features?: string[]
  hazardousMaterialType?: string
  isAdultProduct?: boolean
  isEligibleForTradeIn?: boolean
  isEligibleForSuperSaverShipping?: boolean
  isRedirectASIN?: boolean
  isSNS?: boolean
  author?: string
  numberOfItems?: number
  numberOfPages?: number
  type?: string
  availabilityAmazon?: number
  availabilityAmazonDelay?: number[]
  fbaFees?: {
    storageFee?: number
    storageFee3?: number
    storageFee6?: number
    storageFee12?: number
    pickAndPackFee?: number
  }
  stats?: KeepaProductStats
  csv?: number[][]
  buyBoxSellerIdHistory?: string[]
  salesRanks?: Record<string, number[][]>
}

export interface KeepaProductStats {
  current?: number[]
  avg?: number[]
  avg30?: number[]
  avg90?: number[]
  avg180?: number[]
  atIntervalStart?: number[]
  min?: number[][]
  max?: number[][]
  minInInterval?: number[][]
  maxInInterval?: number[][]
  outOfStockPercentageInInterval?: number[]
  outOfStockPercentage30?: number[]
  outOfStockPercentage90?: number[]
  lastOffersUpdate?: number
  totalOfferCount?: number
  lightningDealInfo?: number[]
  retrievedOfferCount?: number
  buyBoxPrice?: number
  buyBoxShipping?: number
  buyBoxIsUnqualified?: boolean
  buyBoxIsShippable?: boolean
  buyBoxIsPreorder?: boolean
  buyBoxIsBackorder?: boolean
  buyBoxIsAmazon?: boolean
  buyBoxIsMAP?: boolean
  buyBoxIsFBA?: boolean
  buyBoxUsedPrice?: number
  buyBoxUsedShipping?: number
  sellerIdsLowestFBA?: string[]
  sellerIdsLowestFBM?: string[]
  offerCountFBA?: number
  offerCountFBM?: number
}

export interface KeepaCategory {
  catId: number
  name: string
  children?: number[]
  parent?: number
  highestRank?: number
  productCount?: number
  domainId?: number
}

export interface KeepaBestSeller {
  asin: string
  domainId: number
  lastUpdate: number
  categoryId: number
  rank: number
}

export interface KeepaTokenStatus {
  timestamp: number
  tokensLeft: number
  refillIn: number
  refillRate: number
  tokenFlowReduction: number
  tokensConsumed: number
  processingTimeInMs: number
}

export interface KeepaApiResponse<T> {
  timestamp: number
  tokensLeft: number
  refillIn: number
  refillRate: number
  tokenFlowReduction: number
  tokensConsumed: number
  processingTimeInMs: number
  products?: T[]
  categories?: Record<string, KeepaCategory>
  bestSellersList?: KeepaBestSeller[]
  error?: {
    type: string
    message: string
  }
}

// Parsed product for our database
export interface ParsedKeepaProduct {
  asin: string
  title: string
  brand: string | null
  manufacturer: string | null
  categories: string[]
  rootCategory: number | null
  images: string[]
  currentPrice: number | null
  amazonPrice: number | null
  newPrice: number | null
  usedPrice: number | null
  salesRank: number | null
  reviewCount: number | null
  rating: number | null
  buyBoxPrice: number | null
  buyBoxIsFba: boolean
  buyBoxIsAmazon: boolean
  fbaFees: {
    pickAndPack: number | null
    storage: number | null
  }
  dimensions: {
    height: number | null
    length: number | null
    width: number | null
    weight: number | null
  }
  priceHistory: {
    amazon: Array<{ timestamp: number; price: number }>
    new: Array<{ timestamp: number; price: number }>
    salesRank: Array<{ timestamp: number; rank: number }>
  }
  lastUpdate: Date
  isAdult: boolean
  upc: string | null
  ean: string | null
  rawData: KeepaProduct
}

class KeepaClient {
  private apiKey: string
  private tokensRemaining: number = 0
  private refillRate: number = 0
  private lastTokenUpdate: number = 0
  private requestQueue: Array<() => Promise<void>> = []
  private isProcessingQueue: boolean = false

  // Retry configuration
  private static readonly MAX_RETRIES = 3
  private static readonly RETRY_DELAYS = [1000, 2000, 4000] // Exponential backoff
  private static readonly MIN_TOKENS_THRESHOLD = 5 // Minimum tokens before waiting for refill

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.KEEPA_API_KEY || ''
    if (!this.apiKey) {
      console.warn('[Keepa] No API key provided. Set KEEPA_API_KEY environment variable.')
    }
  }

  /**
   * Check if we should wait for token refill
   */
  private async waitForTokensIfNeeded(requiredTokens: number = 1): Promise<void> {
    // Estimate tokens based on last update
    const timeSinceUpdate = Date.now() - this.lastTokenUpdate
    const estimatedRefill = Math.floor((timeSinceUpdate / 60000) * this.refillRate)
    const estimatedTokens = Math.min(this.tokensRemaining + estimatedRefill, 100)

    if (estimatedTokens < requiredTokens && this.refillRate > 0) {
      const tokensNeeded = requiredTokens - estimatedTokens
      const waitTimeMs = Math.ceil((tokensNeeded / this.refillRate) * 60000) + 1000 // Add 1s buffer

      if (waitTimeMs > 0 && waitTimeMs < 300000) { // Cap at 5 minutes
        console.log(`[Keepa] Low tokens (${estimatedTokens}), waiting ${Math.round(waitTimeMs / 1000)}s for refill...`)
        await new Promise(resolve => setTimeout(resolve, waitTimeMs))
      }
    }
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string | number | boolean>,
    options: { retryCount?: number } = {}
  ): Promise<KeepaApiResponse<T>> {
    const retryCount = options.retryCount ?? 0

    // Check token availability before making request (skip for /token endpoint)
    if (endpoint !== '/token' && this.lastTokenUpdate > 0) {
      await this.waitForTokensIfNeeded()
    }

    const url = new URL(`${KEEPA_API_BASE}${endpoint}`)
    url.searchParams.set('key', this.apiKey)

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }

    // Use proxy-aware fetch for containerized environments
    const proxyFetch = getProxyFetch()
    const requestUrl = url.toString()
    console.log(`[Keepa] Requesting: ${endpoint}${retryCount > 0 ? ` (retry ${retryCount})` : ''}`)

    try {
      const response = await proxyFetch(requestUrl)

      // Handle rate limiting (429 Too Many Requests)
      if (response.status === 429) {
        if (retryCount < KeepaClient.MAX_RETRIES) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10)
          const waitTime = Math.min(retryAfter * 1000, 120000) // Cap at 2 minutes
          console.log(`[Keepa] Rate limited, waiting ${waitTime / 1000}s before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          return this.request<T>(endpoint, params, { retryCount: retryCount + 1 })
        }
        throw new Error('Keepa API rate limit exceeded after retries')
      }

      // Handle server errors with retry
      if (response.status >= 500 && retryCount < KeepaClient.MAX_RETRIES) {
        const delay = KeepaClient.RETRY_DELAYS[retryCount] || 4000
        console.log(`[Keepa] Server error ${response.status}, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.request<T>(endpoint, params, { retryCount: retryCount + 1 })
      }

      if (!response.ok) {
        // Try to get error body for debugging
        let errorBody = ''
        try {
          errorBody = await response.text()
          console.log(`[Keepa] Error response body: ${errorBody.substring(0, 500)}`)
        } catch (e) {
          // ignore
        }
        throw new Error(`Keepa API error: ${response.status} ${response.statusText}`)
      }

      let data: KeepaApiResponse<T>
      try {
        data = await response.json() as KeepaApiResponse<T>
      } catch (parseError) {
        // JSON parse error - retry if possible
        if (retryCount < KeepaClient.MAX_RETRIES) {
          const delay = KeepaClient.RETRY_DELAYS[retryCount] || 4000
          console.log(`[Keepa] JSON parse error, retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          return this.request<T>(endpoint, params, { retryCount: retryCount + 1 })
        }
        throw new Error(`Keepa API response parse error: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`)
      }

      // Update token tracking
      this.tokensRemaining = data.tokensLeft ?? this.tokensRemaining
      this.refillRate = data.refillRate ?? this.refillRate
      this.lastTokenUpdate = Date.now()

      // Log token status for monitoring
      if (this.tokensRemaining < 10) {
        console.warn(`[Keepa] Low tokens remaining: ${this.tokensRemaining}`)
      }

      if (data.error) {
        // Check if error is retryable
        const retryableErrors = ['TEMPORARY_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
        if (retryableErrors.includes(data.error.type) && retryCount < KeepaClient.MAX_RETRIES) {
          const delay = KeepaClient.RETRY_DELAYS[retryCount] || 4000
          console.log(`[Keepa] Retryable error: ${data.error.type}, retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          return this.request<T>(endpoint, params, { retryCount: retryCount + 1 })
        }
        throw new Error(`Keepa API error: ${data.error.type} - ${data.error.message}`)
      }

      return data
    } catch (error) {
      // Handle network errors with retry
      if (error instanceof TypeError && error.message.includes('fetch') && retryCount < KeepaClient.MAX_RETRIES) {
        const delay = KeepaClient.RETRY_DELAYS[retryCount] || 4000
        console.log(`[Keepa] Network error, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.request<T>(endpoint, params, { retryCount: retryCount + 1 })
      }
      throw error
    }
  }

  /**
   * Get token status without consuming tokens
   */
  async getTokenStatus(): Promise<KeepaTokenStatus> {
    const response = await this.request<never>('/token', {})
    return {
      timestamp: response.timestamp,
      tokensLeft: response.tokensLeft,
      refillIn: response.refillIn,
      refillRate: response.refillRate,
      tokenFlowReduction: response.tokenFlowReduction,
      tokensConsumed: response.tokensConsumed,
      processingTimeInMs: response.processingTimeInMs,
    }
  }

  /**
   * Lookup products by ASIN(s)
   * Costs: 1 token per product (without history), up to 10 tokens with full history
   */
  async getProducts(
    asins: string | string[],
    options: {
      domain?: AmazonDomain
      stats?: number // Days of stats (0 = current only)
      history?: boolean // Include price history
      buybox?: boolean // Include buy box info
      offers?: number // Number of offers to retrieve
      rating?: boolean // Include rating info
    } = {}
  ): Promise<ParsedKeepaProduct[]> {
    const asinList = Array.isArray(asins) ? asins : [asins]

    if (asinList.length === 0) {
      return []
    }

    if (asinList.length > 100) {
      throw new Error('Maximum 100 ASINs per request')
    }

    const domain = options.domain || 'US'
    const domainId = AMAZON_DOMAINS[domain]

    // Build params - only include non-zero values to avoid invalid parameter errors
    const params: Record<string, string | number | boolean> = {
      domain: domainId,
      asin: asinList.join(','),
    }

    // Only add optional params if they have meaningful values
    if (options.stats !== undefined && options.stats > 0) {
      params.stats = options.stats
    }
    if (options.history) {
      params.history = 1
    }
    if (options.buybox) {
      params.buybox = 1
    }
    if (options.offers && options.offers > 0) {
      params.offers = options.offers
    }
    if (options.rating) {
      params.rating = 1
    }

    const response = await this.request<KeepaProduct>('/product', params)

    if (!response.products) {
      return []
    }

    return response.products.map((p) => this.parseProduct(p))
  }

  /**
   * Get a single product by ASIN
   */
  async getProduct(
    asin: string,
    options?: Parameters<KeepaClient['getProducts']>[1]
  ): Promise<ParsedKeepaProduct | null> {
    const products = await this.getProducts([asin], options)
    return products[0] || null
  }

  /**
   * Get category information
   */
  async getCategories(
    domain: AmazonDomain = 'US'
  ): Promise<Record<string, KeepaCategory>> {
    const domainId = AMAZON_DOMAINS[domain]
    const response = await this.request<never>('/category', {
      domain: domainId,
    })
    return response.categories || {}
  }

  /**
   * Get best sellers for a category
   * Costs: 1 token per 10,000 best sellers
   */
  async getBestSellers(
    categoryId: number,
    options: {
      domain?: AmazonDomain
      range?: 0 | 30 | 90 | 180 // Days of best seller history (valid: 0, 30, 90, 180)
    } = {}
  ): Promise<KeepaBestSeller[]> {
    const domain = options.domain || 'US'
    const domainId = AMAZON_DOMAINS[domain]

    // Keepa bestsellers range must be one of: 0, 30, 90, 180
    const validRange = options.range ?? 30

    const response = await this.request<never>('/bestsellers', {
      domain: domainId,
      category: categoryId,
      range: validRange,
    })

    // Debug: log the raw response structure (only in development)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Keepa] bestSellersList type:', typeof response.bestSellersList)
      if (response.bestSellersList) {
        const sample = Array.isArray(response.bestSellersList)
          ? response.bestSellersList.slice(0, 2)
          : typeof response.bestSellersList === 'object'
            ? Object.entries(response.bestSellersList).slice(0, 2)
            : response.bestSellersList
        console.log('[Keepa] bestSellersList sample:', JSON.stringify(sample, null, 2))
      }
    }

    return this.parseBestSellersList(response.bestSellersList, domainId, categoryId)
  }

  /**
   * Parse best sellers list from various Keepa response formats
   * Handles all known edge cases in Keepa API responses
   */
  private parseBestSellersList(
    bsList: any,
    domainId: number,
    categoryId: number
  ): KeepaBestSeller[] {
    // Handle null/undefined
    if (bsList === null || bsList === undefined) {
      console.log('[Keepa] bestSellersList is null/undefined')
      return []
    }

    // Handle empty string
    if (bsList === '') {
      console.log('[Keepa] bestSellersList is empty string')
      return []
    }

    // Handle the { asinList: string[] } format (most common)
    if (typeof bsList === 'object' && !Array.isArray(bsList)) {
      // Check for asinList property
      if ('asinList' in bsList) {
        const asinList = bsList.asinList

        // Handle null/empty asinList
        if (!asinList || (Array.isArray(asinList) && asinList.length === 0)) {
          console.log('[Keepa] asinList is empty')
          return []
        }

        if (Array.isArray(asinList)) {
          // Filter and validate ASINs
          return asinList
            .filter((asin: unknown): asin is string =>
              typeof asin === 'string' && asin.length > 0 && asin.length <= 15
            )
            .map((asin: string, index: number) => ({
              asin: asin.trim(),
              domainId,
              lastUpdate: Date.now(),
              categoryId,
              rank: index + 1,
            }))
        }

        // asinList is not an array - try to convert
        if (typeof asinList === 'string') {
          // Single ASIN as string
          return [{
            asin: asinList.trim(),
            domainId,
            lastUpdate: Date.now(),
            categoryId,
            rank: 1,
          }]
        }

        console.log('[Keepa] asinList has unexpected type:', typeof asinList)
        return []
      }

      // Check for categoryId-keyed format: { "12345": [...] }
      const categoryIdStr = String(categoryId)
      if (categoryIdStr in bsList) {
        const categoryData = bsList[categoryIdStr]
        if (Array.isArray(categoryData)) {
          return this.normalizeSellerArray(categoryData, domainId, categoryId)
        }
      }

      // Try to find any array in the object values
      for (const [key, value] of Object.entries(bsList)) {
        if (Array.isArray(value) && value.length > 0) {
          console.log(`[Keepa] Found array in key "${key}", using it as bestSellersList`)
          return this.normalizeSellerArray(value, domainId, categoryId)
        }
      }

      console.log('[Keepa] Object has no recognizable bestSellersList format, keys:', Object.keys(bsList))
      return []
    }

    // Handle direct array format
    if (Array.isArray(bsList)) {
      return this.normalizeSellerArray(bsList, domainId, categoryId)
    }

    console.log('[Keepa] Unexpected bestSellersList format:', typeof bsList)
    return []
  }

  /**
   * Normalize an array of sellers/ASINs to KeepaBestSeller format
   */
  private normalizeSellerArray(
    arr: unknown[],
    domainId: number,
    categoryId: number
  ): KeepaBestSeller[] {
    if (arr.length === 0) return []

    const result: KeepaBestSeller[] = []

    for (let i = 0; i < arr.length; i++) {
      const item = arr[i]

      // Skip null/undefined
      if (item === null || item === undefined) continue

      // String ASIN
      if (typeof item === 'string' && item.length > 0) {
        result.push({
          asin: item.trim(),
          domainId,
          lastUpdate: Date.now(),
          categoryId,
          rank: result.length + 1,
        })
        continue
      }

      // Object with asin property
      if (typeof item === 'object') {
        const obj = item as Record<string, unknown>
        const asin = obj.asin || obj.ASIN || obj.Asin

        if (typeof asin === 'string' && asin.length > 0) {
          result.push({
            asin: asin.trim(),
            domainId: typeof obj.domainId === 'number' ? obj.domainId : domainId,
            lastUpdate: typeof obj.lastUpdate === 'number' ? obj.lastUpdate : Date.now(),
            categoryId: typeof obj.categoryId === 'number' ? obj.categoryId : categoryId,
            rank: typeof obj.rank === 'number' ? obj.rank : result.length + 1,
          })
        }
      }
    }

    return result
  }

  /**
   * Search for products
   * Costs: 1 token per 10 results
   */
  async searchProducts(
    query: string,
    options: {
      domain?: AmazonDomain
      sort?: 'price' | 'salesRank' | 'rating' | 'title'
      page?: number
      perPage?: number
    } = {}
  ): Promise<ParsedKeepaProduct[]> {
    const domain = options.domain || 'US'
    const domainId = AMAZON_DOMAINS[domain]

    const response = await this.request<KeepaProduct>('/search', {
      domain: domainId,
      type: 'product',
      term: query,
      sort: options.sort ? ['price', 'salesRank', 'rating', 'title'].indexOf(options.sort) : 3,
      page: options.page ?? 0,
      perPage: options.perPage ?? 50,
    })

    if (!response.products) {
      return []
    }

    return response.products.map((p) => this.parseProduct(p))
  }

  /**
   * Parse Keepa product into our format
   */
  private parseProduct(product: KeepaProduct): ParsedKeepaProduct {
    const stats = product.stats

    // Parse price history from CSV
    const priceHistory = this.parsePriceHistory(product.csv)

    // Parse images
    const images = product.imagesCSV
      ? product.imagesCSV.split(',').map((img) => `https://images-na.ssl-images-amazon.com/images/I/${img}`)
      : []

    return {
      asin: product.asin,
      title: product.title || '',
      brand: product.brand || null,
      manufacturer: product.manufacturer || null,
      categories: [], // Would need category lookup
      rootCategory: product.rootCategory || null,
      images,
      currentPrice: this.keepaPriceToUsd(stats?.current?.[PRICE_TYPES.AMAZON]),
      amazonPrice: this.keepaPriceToUsd(stats?.current?.[PRICE_TYPES.AMAZON]),
      newPrice: this.keepaPriceToUsd(stats?.current?.[PRICE_TYPES.NEW]),
      usedPrice: this.keepaPriceToUsd(stats?.current?.[PRICE_TYPES.USED]),
      salesRank: stats?.current?.[PRICE_TYPES.SALES_RANK] ?? null,
      reviewCount: stats?.current?.[PRICE_TYPES.COUNT_REVIEWS] ?? null,
      rating: stats?.current?.[PRICE_TYPES.RATING]
        ? stats.current[PRICE_TYPES.RATING] / 10
        : null,
      buyBoxPrice: stats?.buyBoxPrice ? this.keepaPriceToUsd(stats.buyBoxPrice) : null,
      buyBoxIsFba: stats?.buyBoxIsFBA ?? false,
      buyBoxIsAmazon: stats?.buyBoxIsAmazon ?? false,
      fbaFees: {
        pickAndPack: product.fbaFees?.pickAndPackFee
          ? product.fbaFees.pickAndPackFee / 100
          : null,
        storage: product.fbaFees?.storageFee
          ? product.fbaFees.storageFee / 100
          : null,
      },
      dimensions: {
        height: product.packageHeight ? product.packageHeight / 10 : null, // cm
        length: product.packageLength ? product.packageLength / 10 : null,
        width: product.packageWidth ? product.packageWidth / 10 : null,
        weight: product.packageWeight ? product.packageWeight / 1000 : null, // kg
      },
      priceHistory,
      lastUpdate: product.lastUpdate
        ? this.keepaTimeToDate(product.lastUpdate)
        : new Date(),
      isAdult: product.isAdultProduct ?? false,
      upc: product.upcList?.[0] || null,
      ean: product.eanList?.[0] || null,
      rawData: product,
    }
  }

  /**
   * Parse price history from Keepa CSV format
   * CSV format: [time, value, time, value, ...]
   */
  private parsePriceHistory(csv?: number[][]): ParsedKeepaProduct['priceHistory'] {
    const result: ParsedKeepaProduct['priceHistory'] = {
      amazon: [],
      new: [],
      salesRank: [],
    }

    if (!csv) return result

    const parseHistory = (
      data: number[] | undefined,
      isPrice: boolean = true
    ): Array<{ timestamp: number; price?: number; rank?: number }> => {
      if (!data) return []

      const history: Array<{ timestamp: number; price?: number; rank?: number }> = []
      for (let i = 0; i < data.length; i += 2) {
        const time = data[i]
        const value = data[i + 1]

        if (time === undefined || value === undefined) continue
        if (value < 0) continue // -1 = out of stock

        const timestamp = this.keepaTimeToDate(time).getTime()

        if (isPrice) {
          history.push({ timestamp, price: value / 100 })
        } else {
          history.push({ timestamp, rank: value })
        }
      }
      return history
    }

    result.amazon = parseHistory(csv[PRICE_TYPES.AMAZON]).map((h) => ({
      timestamp: h.timestamp,
      price: h.price!,
    }))
    result.new = parseHistory(csv[PRICE_TYPES.NEW]).map((h) => ({
      timestamp: h.timestamp,
      price: h.price!,
    }))
    result.salesRank = parseHistory(csv[PRICE_TYPES.SALES_RANK], false).map((h) => ({
      timestamp: h.timestamp,
      rank: h.rank!,
    }))

    return result
  }

  /**
   * Convert Keepa price (cents) to USD
   */
  private keepaPriceToUsd(price?: number): number | null {
    if (price === undefined || price < 0) return null
    return price / 100
  }

  /**
   * Convert Keepa time (minutes since 2011-01-01) to Date
   */
  private keepaTimeToDate(keepaTime: number): Date {
    const keepaEpoch = new Date('2011-01-01T00:00:00Z').getTime()
    return new Date(keepaEpoch + keepaTime * 60 * 1000)
  }

  /**
   * Get remaining tokens
   */
  getTokensRemaining(): number {
    return this.tokensRemaining
  }

  /**
   * Get token refill rate (tokens per minute)
   */
  getRefillRate(): number {
    return this.refillRate
  }
}

// Singleton instance
let keepaClientInstance: KeepaClient | null = null

export function getKeepaClient(apiKey?: string): KeepaClient {
  if (!keepaClientInstance) {
    keepaClientInstance = new KeepaClient(apiKey)
  }
  return keepaClientInstance
}

// Export types and class
export { KeepaClient }
