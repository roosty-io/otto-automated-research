/**
 * AutoDS Navigation Service
 *
 * Handles navigation within the AutoDS platform:
 * - Dashboard access
 * - Store selection
 * - Products/Drafts/Orders pages
 * - Pagination and filtering
 */

import { getBrowserPool } from '../browser'
import { getAutoDBSession, applySessionToPage, AUTODS_URLS, type AutoDSSession } from './auth'
import type { Page } from 'puppeteer'

export interface AutoDSStore {
  id: string
  name: string
  platform: 'ebay' | 'shopify' | 'wix' | 'facebook' | 'amazon'
  status: 'active' | 'inactive' | 'pending'
  listingsCount: number
  draftsCount: number
}

export interface NavigationResult {
  success: boolean
  page?: Page
  error?: string
}

/**
 * Get an authenticated page ready for AutoDS operations
 */
export async function getAuthenticatedPage(): Promise<{
  page: Page
  session: AutoDSSession
  release: () => Promise<void>
} | null> {
  const session = await getAutoDBSession()
  if (!session) {
    console.error('[AutoDS Nav] No valid session available')
    return null
  }

  const pool = getBrowserPool()
  const page = await pool.acquirePage()

  // Apply session
  await applySessionToPage(page, session)

  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 })

  return {
    page,
    session,
    release: async () => {
      await pool.releasePage(page)
    },
  }
}

/**
 * Navigate to dashboard
 */
export async function navigateToDashboard(page: Page): Promise<boolean> {
  try {
    await page.goto(AUTODS_URLS.dashboard, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Verify we're on dashboard
    const url = page.url()
    if (url.includes('/login')) {
      console.error('[AutoDS Nav] Session expired, redirected to login')
      return false
    }

    // Wait for dashboard content
    await page.waitForSelector('[class*="dashboard"], [class*="Dashboard"], main', {
      timeout: 10000,
    })

    return true
  } catch (error) {
    console.error('[AutoDS Nav] Dashboard navigation error:', error)
    return false
  }
}

/**
 * Navigate to products page
 */
export async function navigateToProducts(
  page: Page,
  storeId?: string
): Promise<boolean> {
  try {
    let url = AUTODS_URLS.products
    if (storeId) {
      url += `?store=${storeId}`
    }

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Wait for products table/grid
    await page.waitForSelector(
      'table, [class*="product"], [class*="Product"], .products-list',
      { timeout: 10000 }
    )

    return true
  } catch (error) {
    console.error('[AutoDS Nav] Products navigation error:', error)
    return false
  }
}

/**
 * Navigate to drafts page
 */
export async function navigateToDrafts(
  page: Page,
  storeId?: string
): Promise<boolean> {
  try {
    let url = AUTODS_URLS.drafts
    if (storeId) {
      url += `?store=${storeId}`
    }

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Wait for drafts content
    await page.waitForSelector(
      'table, [class*="draft"], [class*="Draft"], .drafts-list',
      { timeout: 10000 }
    )

    return true
  } catch (error) {
    console.error('[AutoDS Nav] Drafts navigation error:', error)
    return false
  }
}

/**
 * Navigate to orders page
 */
export async function navigateToOrders(
  page: Page,
  storeId?: string
): Promise<boolean> {
  try {
    let url = AUTODS_URLS.orders
    if (storeId) {
      url += `?store=${storeId}`
    }

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Wait for orders content
    await page.waitForSelector(
      'table, [class*="order"], [class*="Order"], .orders-list',
      { timeout: 10000 }
    )

    return true
  } catch (error) {
    console.error('[AutoDS Nav] Orders navigation error:', error)
    return false
  }
}

/**
 * Get list of connected stores
 */
export async function getConnectedStores(page: Page): Promise<AutoDSStore[]> {
  try {
    // Navigate to stores page
    await page.goto(AUTODS_URLS.stores, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Wait for stores list
    await page.waitForSelector('[class*="store"], [class*="Store"]', {
      timeout: 10000,
    })

    // Extract store data
    const stores = await page.evaluate(() => {
      const storeElements = document.querySelectorAll('[class*="store-card"], [class*="StoreCard"], .store-item')
      const results: Array<{
        id: string
        name: string
        platform: string
        status: string
        listingsCount: number
        draftsCount: number
      }> = []

      storeElements.forEach((el) => {
        const nameEl = el.querySelector('[class*="name"], h3, h4, .store-name')
        const platformEl = el.querySelector('[class*="platform"], .platform-icon, img[alt]')
        const statusEl = el.querySelector('[class*="status"], .store-status')
        const listingsEl = el.querySelector('[class*="listings"], .listings-count')
        const draftsEl = el.querySelector('[class*="drafts"], .drafts-count')

        // Try to get store ID from data attribute or link
        const link = el.querySelector('a[href*="store"]')
        const href = link?.getAttribute('href') || ''
        const idMatch = href.match(/store[=\/](\w+)/)

        results.push({
          id: idMatch?.[1] || el.getAttribute('data-store-id') || `store_${Date.now()}`,
          name: nameEl?.textContent?.trim() || 'Unknown Store',
          platform: platformEl?.getAttribute('alt')?.toLowerCase() || 'ebay',
          status: statusEl?.textContent?.toLowerCase()?.includes('active') ? 'active' : 'inactive',
          listingsCount: parseInt(listingsEl?.textContent?.replace(/\D/g, '') || '0'),
          draftsCount: parseInt(draftsEl?.textContent?.replace(/\D/g, '') || '0'),
        })
      })

      return results
    })

    return stores.map(s => ({
      ...s,
      platform: s.platform as AutoDSStore['platform'],
      status: s.status as AutoDSStore['status'],
    }))
  } catch (error) {
    console.error('[AutoDS Nav] Get stores error:', error)
    return []
  }
}

/**
 * Select a specific store
 */
export async function selectStore(page: Page, storeId: string): Promise<boolean> {
  try {
    // Look for store selector dropdown
    const selectorExists = await page.$('[class*="store-select"], [class*="StoreSelect"], .store-dropdown')

    if (selectorExists) {
      await page.click('[class*="store-select"], [class*="StoreSelect"], .store-dropdown')
      await page.waitForSelector('[class*="dropdown-menu"], [class*="menu"]', { timeout: 5000 })

      // Click on the specific store
      const storeOption = await page.$(`[data-store-id="${storeId}"], [data-value="${storeId}"]`)
      if (storeOption) {
        await storeOption.click()
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
        return true
      }
    }

    // Alternative: Navigate directly with store in URL
    const currentUrl = page.url()
    const newUrl = new URL(currentUrl)
    newUrl.searchParams.set('store', storeId)
    await page.goto(newUrl.toString(), { waitUntil: 'networkidle2' })

    return true
  } catch (error) {
    console.error('[AutoDS Nav] Select store error:', error)
    return false
  }
}

/**
 * Click "Add Product" button to start product import
 */
export async function clickAddProduct(page: Page): Promise<boolean> {
  try {
    // Common selectors for add product button
    const buttonSelectors = [
      'button:has-text("Add Product")',
      'button:has-text("Import Product")',
      '[class*="add-product"]',
      '[class*="AddProduct"]',
      'a[href*="add-product"]',
      'a[href*="import"]',
      '.btn-add-product',
    ]

    for (const selector of buttonSelectors) {
      const button = await page.$(selector)
      if (button) {
        await button.click()
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
        return true
      }
    }

    // Try finding by text content
    const addButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'))
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('add product') ||
        b.textContent?.toLowerCase().includes('import')
      )
    })

    if (addButton) {
      await (addButton as any).click()
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
      return true
    }

    console.error('[AutoDS Nav] Add product button not found')
    return false
  } catch (error) {
    console.error('[AutoDS Nav] Click add product error:', error)
    return false
  }
}

/**
 * Handle pagination - go to next page
 */
export async function goToNextPage(page: Page): Promise<boolean> {
  try {
    const nextButton = await page.$('[class*="next"], [aria-label="Next"], .pagination-next, button:has-text("Next")')

    if (nextButton) {
      const isDisabled = await page.evaluate(el => el.hasAttribute('disabled') || el.classList.contains('disabled'), nextButton)

      if (isDisabled) {
        return false // No more pages
      }

      await nextButton.click()
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
      return true
    }

    return false
  } catch (error) {
    console.error('[AutoDS Nav] Pagination error:', error)
    return false
  }
}

/**
 * Get current page number
 */
export async function getCurrentPage(page: Page): Promise<number> {
  try {
    const pageNumber = await page.evaluate(() => {
      // Look for active page indicator
      const active = document.querySelector('[class*="active"] .page-number, .pagination .active, [aria-current="page"]')
      if (active) {
        return parseInt(active.textContent?.replace(/\D/g, '') || '1')
      }

      // Check URL for page parameter
      const url = new URL(window.location.href)
      return parseInt(url.searchParams.get('page') || '1')
    })

    return pageNumber
  } catch {
    return 1
  }
}

/**
 * Wait for page load after action
 */
export async function waitForPageLoad(page: Page, timeout = 10000): Promise<void> {
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout }),
    page.waitForSelector('[class*="loading"]', { hidden: true, timeout }),
    new Promise(resolve => setTimeout(resolve, timeout)),
  ]).catch(() => {})
}

/**
 * Check if on login page (session expired)
 */
export async function isOnLoginPage(page: Page): Promise<boolean> {
  const url = page.url()
  return url.includes('/login') || url.includes('/signin')
}

/**
 * Take screenshot for debugging
 */
export async function takeDebugScreenshot(
  page: Page,
  name: string
): Promise<string | null> {
  try {
    const path = `/tmp/autods_debug_${name}_${Date.now()}.png`
    await page.screenshot({ path, fullPage: true })
    console.log(`[AutoDS Nav] Screenshot saved: ${path}`)
    return path
  } catch (error) {
    console.error('[AutoDS Nav] Screenshot error:', error)
    return null
  }
}
