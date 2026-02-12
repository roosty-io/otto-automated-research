/**
 * AutoDS Listings Management Service
 *
 * Handles active eBay listings via AutoDS:
 * - List active listings
 * - Update prices
 * - Update quantities
 * - End listings
 * - Sync listing status
 */

import { getAuthenticatedPage, navigateToProducts, goToNextPage, waitForPageLoad, isOnLoginPage } from './navigation'
import { supabase } from '@/lib/supabase'
import type { Page } from 'puppeteer'

export interface AutoDSListing {
  id: string
  ebayItemId?: string
  title: string
  price: number
  quantity: number
  sold: number
  views?: number
  watchers?: number
  status: 'active' | 'ended' | 'out_of_stock' | 'error'
  imageUrl?: string
  lastUpdated?: string
}

export interface ListingsResult {
  success: boolean
  listings: AutoDSListing[]
  totalCount: number
  error?: string
}

export interface UpdateResult {
  success: boolean
  error?: string
}

/**
 * Get all active listings for a store
 */
export async function getListings(
  storeId?: string,
  options: { limit?: number; status?: string } = {}
): Promise<ListingsResult> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { success: false, listings: [], totalCount: 0, error: 'Authentication failed' }
  }

  const { page, release } = authenticated
  const allListings: AutoDSListing[] = []

  try {
    const navSuccess = await navigateToProducts(page, storeId)
    if (!navSuccess) {
      return { success: false, listings: [], totalCount: 0, error: 'Failed to navigate to products' }
    }

    // Apply status filter if provided
    if (options.status) {
      await applyStatusFilter(page, options.status)
    }

    // Extract listings from all pages
    let hasMorePages = true
    let pageNum = 1
    const maxPages = options.limit ? Math.ceil(options.limit / 50) : 20

    while (hasMorePages && pageNum <= maxPages) {
      const pageListings = await extractListingsFromPage(page)
      allListings.push(...pageListings)

      if (options.limit && allListings.length >= options.limit) {
        break
      }

      hasMorePages = await goToNextPage(page)
      pageNum++
    }

    const totalCount = await getTotalListingCount(page)

    return {
      success: true,
      listings: options.limit ? allListings.slice(0, options.limit) : allListings,
      totalCount,
    }
  } catch (error) {
    console.error('[AutoDS Listings] Get listings error:', error)
    return {
      success: false,
      listings: [],
      totalCount: 0,
      error: error instanceof Error ? error.message : 'Failed to get listings',
    }
  } finally {
    await release()
  }
}

/**
 * Update listing price
 */
export async function updateListingPrice(
  listingId: string,
  newPrice: number
): Promise<UpdateResult> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { success: false, error: 'Authentication failed' }
  }

  const { page, release } = authenticated

  try {
    console.log(`[AutoDS Listings] Updating price for ${listingId} to $${newPrice}...`)

    // Navigate to listing edit page
    await page.goto(`https://platform.autods.com/products/${listingId}/edit`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    if (await isOnLoginPage(page)) {
      return { success: false, error: 'Session expired' }
    }

    // Find and update price input
    const priceInput = await page.$('input[name="price"], [class*="price"] input, .price-input')
    if (!priceInput) {
      return { success: false, error: 'Price input not found' }
    }

    await priceInput.click({ clickCount: 3 })
    await priceInput.type(newPrice.toFixed(2), { delay: 10 })

    // Save changes
    const saveBtn = await page.$('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
    if (saveBtn) {
      await saveBtn.click()
      await waitForPageLoad(page)
    }

    // Check for errors
    const errorEl = await page.$('.error-message, [class*="error"]')
    if (errorEl) {
      const errorText = await page.evaluate(el => el?.textContent || '', errorEl)
      return { success: false, error: errorText }
    }

    // Update our database
    await updateListingInDb(listingId, { price: newPrice })

    console.log(`[AutoDS Listings] Price updated successfully!`)

    return { success: true }
  } catch (error) {
    console.error('[AutoDS Listings] Update price error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Price update failed',
    }
  } finally {
    await release()
  }
}

/**
 * Update listing quantity
 */
export async function updateListingQuantity(
  listingId: string,
  newQuantity: number
): Promise<UpdateResult> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { success: false, error: 'Authentication failed' }
  }

  const { page, release } = authenticated

  try {
    console.log(`[AutoDS Listings] Updating quantity for ${listingId} to ${newQuantity}...`)

    await page.goto(`https://platform.autods.com/products/${listingId}/edit`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    if (await isOnLoginPage(page)) {
      return { success: false, error: 'Session expired' }
    }

    const qtyInput = await page.$('input[name="quantity"], [class*="quantity"] input, .quantity-input')
    if (!qtyInput) {
      return { success: false, error: 'Quantity input not found' }
    }

    await qtyInput.click({ clickCount: 3 })
    await qtyInput.type(newQuantity.toString(), { delay: 10 })

    const saveBtn = await page.$('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
    if (saveBtn) {
      await saveBtn.click()
      await waitForPageLoad(page)
    }

    await updateListingInDb(listingId, { quantity: newQuantity })

    return { success: true }
  } catch (error) {
    console.error('[AutoDS Listings] Update quantity error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Quantity update failed',
    }
  } finally {
    await release()
  }
}

/**
 * End a listing (remove from eBay)
 */
export async function endListing(listingId: string): Promise<UpdateResult> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { success: false, error: 'Authentication failed' }
  }

  const { page, release } = authenticated

  try {
    console.log(`[AutoDS Listings] Ending listing ${listingId}...`)

    await navigateToProducts(page)

    // Find listing row
    const listingRow = await page.$(`[data-listing-id="${listingId}"], [data-product-id="${listingId}"], tr:has-text("${listingId}")`)

    if (!listingRow) {
      return { success: false, error: 'Listing not found' }
    }

    // Look for end/delete button
    const endBtn = await listingRow.$(
      'button:has-text("End"), button:has-text("Remove"), [class*="end-listing"], [class*="delete"]'
    )

    if (!endBtn) {
      // Try actions menu
      const actionsBtn = await listingRow.$('[class*="actions"], .dropdown-toggle, .menu-btn')
      if (actionsBtn) {
        await actionsBtn.click()
        await page.waitForSelector('[class*="dropdown-menu"], .menu', { timeout: 3000 })

        const endOption = await page.$('a:has-text("End"), button:has-text("End"), [class*="end"]')
        if (endOption) {
          await endOption.click()
        }
      }
    } else {
      await endBtn.click()
    }

    // Confirm if dialog appears
    const confirmBtn = await page.waitForSelector(
      'button:has-text("Confirm"), button:has-text("Yes"), .confirm-btn',
      { timeout: 5000 }
    ).catch(() => null)

    if (confirmBtn) {
      await confirmBtn.click()
    }

    await waitForPageLoad(page)

    // Update our database
    await updateListingInDb(listingId, { status: 'ended' })

    console.log(`[AutoDS Listings] Listing ended successfully!`)

    return { success: true }
  } catch (error) {
    console.error('[AutoDS Listings] End listing error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'End listing failed',
    }
  } finally {
    await release()
  }
}

/**
 * Sync listing data from AutoDS to our database
 */
export async function syncListingsToDatabase(storeId: string): Promise<{
  success: boolean
  synced: number
  errors: number
}> {
  const result = { success: true, synced: 0, errors: 0 }

  try {
    console.log(`[AutoDS Listings] Syncing listings for store ${storeId}...`)

    // Get listings from AutoDS
    const listingsResult = await getListings(storeId, { limit: 1000 })

    if (!listingsResult.success) {
      return { success: false, synced: 0, errors: 0 }
    }

    // Update each listing in our database
    for (const listing of listingsResult.listings) {
      try {
        const { error } = await supabase
          .from('store_sku_assignments')
          .update({
            ebay_listing_id: listing.ebayItemId,
            current_price: listing.price,
            views: listing.views,
            watchers: listing.watchers,
            sales: listing.sold,
            listing_status: listing.status,
            last_synced: new Date().toISOString(),
          })
          .or(`autods_listing_id.eq.${listing.id},ebay_listing_id.eq.${listing.ebayItemId}`)

        if (error) {
          result.errors++
        } else {
          result.synced++
        }
      } catch {
        result.errors++
      }
    }

    console.log(`[AutoDS Listings] Sync complete: ${result.synced} synced, ${result.errors} errors`)

    return result
  } catch (error) {
    console.error('[AutoDS Listings] Sync error:', error)
    return { success: false, synced: 0, errors: 0 }
  }
}

/**
 * Bulk update prices
 */
export async function bulkUpdatePrices(
  updates: Array<{ listingId: string; newPrice: number }>
): Promise<{ successful: number; failed: number }> {
  const result = { successful: 0, failed: 0 }

  for (const update of updates) {
    const updateResult = await updateListingPrice(update.listingId, update.newPrice)
    if (updateResult.success) {
      result.successful++
    } else {
      result.failed++
    }

    // Small delay between updates
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return result
}

/**
 * Get listing count by status
 */
export async function getListingCounts(storeId?: string): Promise<{
  active: number
  ended: number
  outOfStock: number
  error: number
  total: number
}> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { active: 0, ended: 0, outOfStock: 0, error: 0, total: 0 }
  }

  const { page, release } = authenticated

  try {
    await navigateToProducts(page, storeId)

    const counts = await page.evaluate(() => {
      const result = { active: 0, ended: 0, outOfStock: 0, error: 0, total: 0 }

      // Look for status tabs or filters with counts
      const tabs = document.querySelectorAll('[class*="tab"], [class*="filter"] [class*="count"]')

      tabs.forEach(tab => {
        const text = tab.textContent?.toLowerCase() || ''
        const countMatch = text.match(/(\d+)/)
        const count = countMatch ? parseInt(countMatch[1]) : 0

        if (text.includes('active')) result.active = count
        else if (text.includes('ended')) result.ended = count
        else if (text.includes('out of stock') || text.includes('oos')) result.outOfStock = count
        else if (text.includes('error')) result.error = count
        else if (text.includes('all') || text.includes('total')) result.total = count
      })

      return result
    })

    if (counts.total === 0) {
      counts.total = counts.active + counts.ended + counts.outOfStock + counts.error
    }

    return counts
  } catch (error) {
    console.error('[AutoDS Listings] Get counts error:', error)
    return { active: 0, ended: 0, outOfStock: 0, error: 0, total: 0 }
  } finally {
    await release()
  }
}

// --- Helper functions ---

async function extractListingsFromPage(page: Page): Promise<AutoDSListing[]> {
  return page.evaluate(() => {
    const listings: Array<{
      id: string
      ebayItemId?: string
      title: string
      price: number
      quantity: number
      sold: number
      views?: number
      watchers?: number
      status: string
      imageUrl?: string
    }> = []

    const rows = document.querySelectorAll(
      'tr[data-product-id], [class*="product-row"], .product-item, .listing-row'
    )

    rows.forEach(row => {
      const id = row.getAttribute('data-product-id') || row.getAttribute('data-id') || ''
      const ebayId = row.getAttribute('data-ebay-id')
      const titleEl = row.querySelector('[class*="title"], .product-title, td:nth-child(2)')
      const priceEl = row.querySelector('[class*="price"]')
      const qtyEl = row.querySelector('[class*="quantity"], [class*="stock"]')
      const soldEl = row.querySelector('[class*="sold"]')
      const viewsEl = row.querySelector('[class*="views"]')
      const watchersEl = row.querySelector('[class*="watchers"]')
      const statusEl = row.querySelector('[class*="status"]')
      const imageEl = row.querySelector('img')

      const parseNum = (el: Element | null) => parseInt(el?.textContent?.replace(/\D/g, '') || '0')

      listings.push({
        id,
        ebayItemId: ebayId || undefined,
        title: titleEl?.textContent?.trim() || 'Unknown',
        price: parseFloat(priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0'),
        quantity: parseNum(qtyEl),
        sold: parseNum(soldEl),
        views: viewsEl ? parseNum(viewsEl) : undefined,
        watchers: watchersEl ? parseNum(watchersEl) : undefined,
        status: statusEl?.textContent?.toLowerCase()?.includes('active') ? 'active' :
               statusEl?.textContent?.toLowerCase()?.includes('ended') ? 'ended' :
               statusEl?.textContent?.toLowerCase()?.includes('out') ? 'out_of_stock' : 'active',
        imageUrl: imageEl?.src,
      })
    })

    return listings
  }) as Promise<AutoDSListing[]>
}

async function getTotalListingCount(page: Page): Promise<number> {
  try {
    const countText = await page.$eval(
      '[class*="total"], .listing-count, .pagination-info, [class*="showing"]',
      el => el.textContent || ''
    )
    const match = countText.match(/of\s*(\d+)|(\d+)\s*(?:total|items|products)/i)
    return match ? parseInt(match[1] || match[2]) : 0
  } catch {
    return 0
  }
}

async function applyStatusFilter(page: Page, status: string): Promise<void> {
  try {
    const filterBtn = await page.$(`[data-status="${status}"], button:has-text("${status}"), [class*="filter-${status}"]`)
    if (filterBtn) {
      await filterBtn.click()
      await waitForPageLoad(page)
    }
  } catch {
    // Filter not found, continue without filter
  }
}

async function updateListingInDb(
  listingId: string,
  updates: { price?: number; quantity?: number; status?: string }
): Promise<void> {
  try {
    const dbUpdates: Record<string, any> = {}

    if (updates.price !== undefined) {
      dbUpdates.current_price = updates.price
      dbUpdates.price_last_adjusted = new Date().toISOString()
    }

    if (updates.quantity !== undefined) {
      dbUpdates.quantity = updates.quantity
    }

    if (updates.status !== undefined) {
      dbUpdates.listing_status = updates.status
    }

    await supabase
      .from('store_sku_assignments')
      .update(dbUpdates)
      .or(`autods_listing_id.eq.${listingId},ebay_listing_id.eq.${listingId}`)
  } catch (error) {
    console.error('[AutoDS Listings] DB update error:', error)
  }
}
