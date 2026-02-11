/**
 * ZIK Analytics Product Research Scraper
 *
 * Scrapes eBay sold items data from ZIK Analytics to find
 * high-demand products for dropshipping.
 */

import type { Page } from 'puppeteer-core'
import { getBrowserPool } from '../browser'
import { ensureZikSession, ZIK_BASE_URL } from './auth'
import {
  navigateTo,
  waitForSelector,
  safeType,
  safeClick,
  waitForText,
  sleep,
  scrollToBottom,
  extractFromElements,
  takeScreenshot,
  getText,
  getElements,
} from '../helpers'

// ZIK Product Research URLs
const ZIK_PRODUCT_RESEARCH_URL = `${ZIK_BASE_URL}/product-research`
const ZIK_EBAY_RESEARCH_URL = `${ZIK_BASE_URL}/ebay-research`

// Selectors for ZIK product research
const SELECTORS = {
  // Search form
  searchInput: 'input[name="search"], input[placeholder*="search"], .search-input, #search',
  searchButton: 'button[type="submit"], .search-btn, button:has-text("Search")',

  // Filters
  filterCategory: 'select[name="category"], .category-filter, [data-filter="category"]',
  filterMinPrice: 'input[name="minPrice"], input[placeholder*="Min"]',
  filterMaxPrice: 'input[name="maxPrice"], input[placeholder*="Max"]',
  filterMinSold: 'input[name="minSold"]',
  filterDateRange: 'select[name="dateRange"], .date-range-filter',
  applyFiltersBtn: 'button:has-text("Apply"), .apply-filters',

  // Results table
  resultsTable: 'table, .results-table, .product-list, [class*="results"]',
  resultRow: 'tbody tr, .result-row, .product-item, [class*="result-item"]',
  pagination: '.pagination, [class*="pagination"]',
  nextPageBtn: '.next-page, [class*="next"], button:has-text("Next")',

  // Product data cells (relative to row)
  productTitle: 'td:nth-child(1), .product-title, [class*="title"]',
  productPrice: 'td:nth-child(2), .product-price, [class*="price"]',
  productSold: 'td:nth-child(3), .sold-count, [class*="sold"]',
  productCategory: 'td:nth-child(4), .product-category, [class*="category"]',
  productSeller: 'td:nth-child(5), .seller-name, [class*="seller"]',
  productLink: 'a[href*="ebay"], .product-link',

  // Loading indicators
  loading: '.loading, .spinner, [class*="loading"]',
  noResults: '.no-results, .empty-state, [class*="no-results"]',
}

export interface ZikSearchFilters {
  query?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  minSold?: number
  dateRange?: '7' | '14' | '30' | '90' // days
  sortBy?: 'sold' | 'price' | 'recent'
}

export interface ZikProductResult {
  title: string
  price: number | null
  soldCount: number | null
  category: string | null
  seller: string | null
  ebayUrl: string | null
  ebayItemId: string | null
  scrapedAt: string
}

export interface ZikSearchResult {
  success: boolean
  query: string
  filters: ZikSearchFilters
  totalResults: number
  products: ZikProductResult[]
  hasMorePages: boolean
  error?: string
}

/**
 * Search for products on ZIK Analytics
 */
export async function searchZikProducts(
  filters: ZikSearchFilters,
  options: {
    maxResults?: number
    maxPages?: number
  } = {}
): Promise<ZikSearchResult> {
  const { maxResults = 100, maxPages = 5 } = options
  const pool = getBrowserPool()
  const { page } = await pool.getPage()

  try {
    console.log('[ZIK Research] Starting product search:', filters.query)

    // Ensure we're logged in
    const sessionOk = await ensureZikSession(page)
    if (!sessionOk) {
      return {
        success: false,
        query: filters.query || '',
        filters,
        totalResults: 0,
        products: [],
        hasMorePages: false,
        error: 'Failed to authenticate with ZIK',
      }
    }

    // Navigate to product research page
    await navigateTo(page, ZIK_PRODUCT_RESEARCH_URL)
    await sleep(1000)

    // Apply search query
    if (filters.query) {
      await safeType(page, SELECTORS.searchInput, filters.query, { clear: true })
    }

    // Apply filters
    await applyFilters(page, filters)

    // Click search
    await safeClick(page, SELECTORS.searchButton)

    // Wait for results
    await waitForResults(page)

    // Scrape results across pages
    const products: ZikProductResult[] = []
    let currentPage = 1
    let hasMorePages = true

    while (hasMorePages && products.length < maxResults && currentPage <= maxPages) {
      console.log(`[ZIK Research] Scraping page ${currentPage}...`)

      const pageProducts = await scrapeResultsPage(page)
      products.push(...pageProducts)

      // Check for next page
      hasMorePages = await goToNextPage(page)
      if (hasMorePages) {
        currentPage++
        await waitForResults(page)
      }
    }

    console.log(`[ZIK Research] Found ${products.length} products`)

    return {
      success: true,
      query: filters.query || '',
      filters,
      totalResults: products.length,
      products: products.slice(0, maxResults),
      hasMorePages,
    }
  } catch (error) {
    console.error('[ZIK Research] Error:', error)
    await takeScreenshot(page, 'zik_research_error')

    return {
      success: false,
      query: filters.query || '',
      filters,
      totalResults: 0,
      products: [],
      hasMorePages: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    await page.close()
  }
}

/**
 * Apply search filters
 */
async function applyFilters(page: Page, filters: ZikSearchFilters): Promise<void> {
  if (filters.minPrice !== undefined) {
    await safeType(page, SELECTORS.filterMinPrice, String(filters.minPrice), { clear: true })
  }

  if (filters.maxPrice !== undefined) {
    await safeType(page, SELECTORS.filterMaxPrice, String(filters.maxPrice), { clear: true })
  }

  if (filters.minSold !== undefined) {
    await safeType(page, SELECTORS.filterMinSold, String(filters.minSold), { clear: true })
  }

  if (filters.category) {
    const categorySelect = await page.$(SELECTORS.filterCategory)
    if (categorySelect) {
      await page.select(SELECTORS.filterCategory, filters.category)
    }
  }

  if (filters.dateRange) {
    const dateSelect = await page.$(SELECTORS.filterDateRange)
    if (dateSelect) {
      await page.select(SELECTORS.filterDateRange, filters.dateRange)
    }
  }

  // Click apply if there's a separate button
  const applyBtn = await page.$(SELECTORS.applyFiltersBtn)
  if (applyBtn) {
    await applyBtn.click()
    await sleep(500)
  }
}

/**
 * Wait for results to load
 */
async function waitForResults(page: Page): Promise<void> {
  // Wait for loading to disappear
  try {
    await page.waitForSelector(SELECTORS.loading, { hidden: true, timeout: 5000 })
  } catch {
    // Loading indicator might not exist
  }

  // Wait for results table or no results message
  await Promise.race([
    waitForSelector(page, SELECTORS.resultsTable, { timeout: 15000 }),
    waitForSelector(page, SELECTORS.noResults, { timeout: 15000 }),
  ])

  // Extra wait for data to populate
  await sleep(1000)
}

/**
 * Scrape products from current results page
 */
async function scrapeResultsPage(page: Page): Promise<ZikProductResult[]> {
  const rows = await getElements(page, SELECTORS.resultRow)

  if (rows.length === 0) {
    return []
  }

  const products: ZikProductResult[] = []

  for (const row of rows) {
    try {
      const product = await extractProductFromRow(row)
      if (product.title) {
        products.push(product)
      }
    } catch (error) {
      console.warn('[ZIK Research] Error extracting product:', error)
    }
  }

  return products
}

/**
 * Extract product data from a table row
 */
async function extractProductFromRow(row: any): Promise<ZikProductResult> {
  const getText = async (selector: string): Promise<string | null> => {
    try {
      const element = await row.$(selector)
      if (!element) return null
      return await element.evaluate((el: Element) => el.textContent?.trim() || null)
    } catch {
      return null
    }
  }

  const getHref = async (selector: string): Promise<string | null> => {
    try {
      const element = await row.$(selector)
      if (!element) return null
      return await element.evaluate((el: Element) => el.getAttribute('href'))
    } catch {
      return null
    }
  }

  // Try multiple selector strategies
  const title = await getText('td:first-child') ||
    await getText('.product-title') ||
    await getText('[class*="title"]') ||
    await row.evaluate((el: Element) => el.querySelector('td')?.textContent?.trim()) ||
    ''

  const priceText = await getText('td:nth-child(2)') ||
    await getText('.price') ||
    await getText('[class*="price"]')
  const price = priceText ? parsePrice(priceText) : null

  const soldText = await getText('td:nth-child(3)') ||
    await getText('.sold') ||
    await getText('[class*="sold"]')
  const soldCount = soldText ? parseInt(soldText.replace(/[^\d]/g, ''), 10) || null : null

  const category = await getText('td:nth-child(4)') ||
    await getText('.category') ||
    await getText('[class*="category"]')

  const seller = await getText('td:nth-child(5)') ||
    await getText('.seller') ||
    await getText('[class*="seller"]')

  const ebayUrl = await getHref('a[href*="ebay"]') ||
    await getHref('.product-link')

  // Extract eBay item ID from URL
  let ebayItemId: string | null = null
  if (ebayUrl) {
    const match = ebayUrl.match(/\/itm\/(\d+)/) || ebayUrl.match(/item=(\d+)/)
    ebayItemId = match ? match[1] : null
  }

  return {
    title,
    price,
    soldCount,
    category,
    seller,
    ebayUrl,
    ebayItemId,
    scrapedAt: new Date().toISOString(),
  }
}

/**
 * Parse price string to number
 */
function parsePrice(priceStr: string): number | null {
  const cleaned = priceStr.replace(/[^0-9.]/g, '')
  const price = parseFloat(cleaned)
  return isNaN(price) ? null : price
}

/**
 * Navigate to next page of results
 */
async function goToNextPage(page: Page): Promise<boolean> {
  const nextBtn = await page.$(SELECTORS.nextPageBtn)
  if (!nextBtn) {
    return false
  }

  // Check if button is disabled
  const isDisabled = await nextBtn.evaluate((el) => {
    return el.hasAttribute('disabled') ||
      el.classList.contains('disabled') ||
      el.getAttribute('aria-disabled') === 'true'
  })

  if (isDisabled) {
    return false
  }

  await nextBtn.click()
  return true
}

/**
 * Get trending/hot products from ZIK
 */
export async function getTrendingProducts(
  options: {
    category?: string
    limit?: number
  } = {}
): Promise<ZikSearchResult> {
  return searchZikProducts(
    {
      minSold: 10,
      dateRange: '7',
      category: options.category,
      sortBy: 'sold',
    },
    { maxResults: options.limit || 50 }
  )
}

/**
 * Analyze a specific eBay seller's products
 */
export async function analyzeSeller(
  sellerName: string,
  options: { maxProducts?: number } = {}
): Promise<ZikSearchResult> {
  // This would search for products by seller
  return searchZikProducts(
    { query: `seller:${sellerName}` },
    { maxResults: options.maxProducts || 100 }
  )
}
