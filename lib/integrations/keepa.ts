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

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.KEEPA_API_KEY || ''
    if (!this.apiKey) {
      console.warn('[Keepa] No API key provided. Set KEEPA_API_KEY environment variable.')
    }
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string | number | boolean>
  ): Promise<KeepaApiResponse<T>> {
    const url = new URL(`${KEEPA_API_BASE}${endpoint}`)
    url.searchParams.set('key', this.apiKey)

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }

    // Use proxy-aware fetch for containerized environments
    const proxyFetch = getProxyFetch()
    const requestUrl = url.toString()
    console.log(`[Keepa] Requesting: ${endpoint}`)

    const response = await proxyFetch(requestUrl)

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

    const data = await response.json() as KeepaApiResponse<T>

    // Update token tracking
    this.tokensRemaining = data.tokensLeft
    this.refillRate = data.refillRate
    this.lastTokenUpdate = Date.now()

    if (data.error) {
      throw new Error(`Keepa API error: ${data.error.type} - ${data.error.message}`)
    }

    return data
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

    // Debug: log the raw response structure
    console.log('[Keepa] bestSellersList type:', typeof response.bestSellersList)
    if (response.bestSellersList) {
      const sample = Array.isArray(response.bestSellersList)
        ? response.bestSellersList.slice(0, 2)
        : Object.entries(response.bestSellersList).slice(0, 2)
      console.log('[Keepa] bestSellersList sample:', JSON.stringify(sample))
    }

    // bestSellersList format from Keepa: { "asinList": ["ASIN1", "ASIN2", ...] }
    const bsList = response.bestSellersList as any
    if (!bsList) {
      return []
    }

    // Handle the { asinList: string[] } format
    if (bsList.asinList && Array.isArray(bsList.asinList)) {
      // Convert string ASINs to KeepaBestSeller objects
      return bsList.asinList.map((asin: string, index: number) => ({
        asin,
        domainId: domainId,
        lastUpdate: Date.now(),
        categoryId: categoryId,
        rank: index + 1,
      }))
    }

    // If it's already an array of objects with asin property
    if (Array.isArray(bsList)) {
      return bsList
    }

    // If it's an object keyed by category ID
    if (typeof bsList === 'object') {
      const categoryData = bsList[categoryId]
      if (Array.isArray(categoryData)) {
        return categoryData
      }
      // Try to get any available array
      const values = Object.values(bsList)
      if (values.length > 0 && Array.isArray(values[0])) {
        return values[0] as KeepaBestSeller[]
      }
    }

    console.log('[Keepa] Unexpected bestSellersList format:', typeof bsList)
    return []
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
