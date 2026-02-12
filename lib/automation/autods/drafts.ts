/**
 * AutoDS Draft Management Service
 *
 * Handles draft products in AutoDS:
 * - List all drafts
 * - Publish drafts to eBay
 * - Edit drafts
 * - Delete drafts
 * - Bulk operations
 */

import { getAuthenticatedPage, navigateToDrafts, goToNextPage, waitForPageLoad, isOnLoginPage } from './navigation'
import { supabase } from '@/lib/supabase'
import type { Page } from 'puppeteer'

export interface AutoDSDraft {
  id: string
  title: string
  price: number
  imageUrl?: string
  status: 'ready' | 'error' | 'processing'
  errorMessage?: string
  sourceUrl?: string
  createdAt?: string
}

export interface DraftListResult {
  success: boolean
  drafts: AutoDSDraft[]
  totalCount: number
  error?: string
}

export interface PublishResult {
  success: boolean
  listingId?: string
  ebayItemId?: string
  error?: string
}

export interface BulkPublishResult {
  total: number
  successful: number
  failed: number
  results: Array<{
    draftId: string
    success: boolean
    listingId?: string
    error?: string
  }>
}

/**
 * Get all drafts for a store
 */
export async function getDrafts(
  storeId?: string,
  options: { limit?: number; page?: number } = {}
): Promise<DraftListResult> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { success: false, drafts: [], totalCount: 0, error: 'Authentication failed' }
  }

  const { page, release } = authenticated
  const allDrafts: AutoDSDraft[] = []

  try {
    // Navigate to drafts page
    const navSuccess = await navigateToDrafts(page, storeId)
    if (!navSuccess) {
      return { success: false, drafts: [], totalCount: 0, error: 'Failed to navigate to drafts' }
    }

    // Extract drafts from current page
    let hasMorePages = true
    let pageNum = 1
    const maxPages = options.limit ? Math.ceil(options.limit / 50) : 10

    while (hasMorePages && pageNum <= maxPages) {
      const pageDrafts = await extractDraftsFromPage(page)
      allDrafts.push(...pageDrafts)

      if (options.limit && allDrafts.length >= options.limit) {
        break
      }

      hasMorePages = await goToNextPage(page)
      pageNum++
    }

    // Get total count
    const totalCount = await getTotalDraftCount(page)

    return {
      success: true,
      drafts: options.limit ? allDrafts.slice(0, options.limit) : allDrafts,
      totalCount,
    }
  } catch (error) {
    console.error('[AutoDS Drafts] Get drafts error:', error)
    return {
      success: false,
      drafts: [],
      totalCount: 0,
      error: error instanceof Error ? error.message : 'Failed to get drafts',
    }
  } finally {
    await release()
  }
}

/**
 * Publish a single draft to eBay
 */
export async function publishDraft(draftId: string): Promise<PublishResult> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { success: false, error: 'Authentication failed' }
  }

  const { page, release } = authenticated

  try {
    console.log(`[AutoDS Drafts] Publishing draft ${draftId}...`)

    // Navigate to draft detail or drafts list
    await page.goto(`https://platform.autods.com/drafts/${draftId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Check if we landed on the draft page
    if (await isOnLoginPage(page)) {
      return { success: false, error: 'Session expired' }
    }

    // Look for publish button
    const publishButton = await findPublishButton(page)
    if (!publishButton) {
      // Try finding in draft list
      await navigateToDrafts(page)
      const draftRow = await page.$(`[data-draft-id="${draftId}"], tr:has-text("${draftId}")`)

      if (draftRow) {
        const rowPublishBtn = await draftRow.$('button:has-text("Publish"), [class*="publish"]')
        if (rowPublishBtn) {
          await rowPublishBtn.click()
        } else {
          return { success: false, error: 'Publish button not found in draft row' }
        }
      } else {
        return { success: false, error: 'Draft not found' }
      }
    } else {
      await publishButton.click()
    }

    // Wait for publish confirmation
    await waitForPublishComplete(page)

    // Check for errors
    const errorMessage = await checkForPublishErrors(page)
    if (errorMessage) {
      return { success: false, error: errorMessage }
    }

    // Extract listing ID
    const listingId = await extractListingId(page, draftId)

    // Update our database
    await updateDraftStatus(draftId, 'published', listingId)

    console.log(`[AutoDS Drafts] Draft ${draftId} published successfully!`)

    return {
      success: true,
      listingId,
    }
  } catch (error) {
    console.error('[AutoDS Drafts] Publish error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Publish failed',
    }
  } finally {
    await release()
  }
}

/**
 * Publish multiple drafts
 */
export async function publishDraftsBulk(
  draftIds: string[],
  options: { delayBetween?: number; stopOnError?: boolean } = {}
): Promise<BulkPublishResult> {
  const { delayBetween = 3000, stopOnError = false } = options

  const result: BulkPublishResult = {
    total: draftIds.length,
    successful: 0,
    failed: 0,
    results: [],
  }

  console.log(`[AutoDS Drafts] Starting bulk publish of ${draftIds.length} drafts...`)

  for (let i = 0; i < draftIds.length; i++) {
    const draftId = draftIds[i]
    console.log(`[AutoDS Drafts] Publishing ${i + 1}/${draftIds.length}: ${draftId}`)

    const publishResult = await publishDraft(draftId)

    result.results.push({
      draftId,
      success: publishResult.success,
      listingId: publishResult.listingId,
      error: publishResult.error,
    })

    if (publishResult.success) {
      result.successful++
    } else {
      result.failed++
      if (stopOnError) break
    }

    // Delay between publishes
    if (i < draftIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayBetween))
    }
  }

  console.log(`[AutoDS Drafts] Bulk publish complete: ${result.successful}/${result.total} successful`)

  return result
}

/**
 * Delete a draft
 */
export async function deleteDraft(draftId: string): Promise<{ success: boolean; error?: string }> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { success: false, error: 'Authentication failed' }
  }

  const { page, release } = authenticated

  try {
    await navigateToDrafts(page)

    // Find the draft row
    const draftRow = await page.$(`[data-draft-id="${draftId}"], tr:has([data-id="${draftId}"])`)

    if (!draftRow) {
      return { success: false, error: 'Draft not found' }
    }

    // Find delete button
    const deleteBtn = await draftRow.$('button:has-text("Delete"), [class*="delete"], .btn-delete')

    if (!deleteBtn) {
      // Try checkbox + bulk delete
      const checkbox = await draftRow.$('input[type="checkbox"]')
      if (checkbox) {
        await checkbox.click()
        const bulkDeleteBtn = await page.$('button:has-text("Delete Selected"), .bulk-delete')
        if (bulkDeleteBtn) {
          await bulkDeleteBtn.click()
        }
      }
    } else {
      await deleteBtn.click()
    }

    // Confirm deletion if dialog appears
    const confirmBtn = await page.waitForSelector(
      'button:has-text("Confirm"), button:has-text("Yes"), .confirm-delete',
      { timeout: 5000 }
    ).catch(() => null)

    if (confirmBtn) {
      await confirmBtn.click()
    }

    await waitForPageLoad(page)

    // Update our database
    await updateDraftStatus(draftId, 'deleted')

    return { success: true }
  } catch (error) {
    console.error('[AutoDS Drafts] Delete error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    }
  } finally {
    await release()
  }
}

/**
 * Edit draft details
 */
export async function editDraft(
  draftId: string,
  updates: { title?: string; price?: number; quantity?: number }
): Promise<{ success: boolean; error?: string }> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { success: false, error: 'Authentication failed' }
  }

  const { page, release } = authenticated

  try {
    // Navigate to draft edit page
    await page.goto(`https://platform.autods.com/drafts/${draftId}/edit`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    if (await isOnLoginPage(page)) {
      return { success: false, error: 'Session expired' }
    }

    // Update title
    if (updates.title) {
      const titleInput = await page.$('input[name="title"], .title-input, [class*="title"] input')
      if (titleInput) {
        await titleInput.click({ clickCount: 3 })
        await titleInput.type(updates.title, { delay: 10 })
      }
    }

    // Update price
    if (updates.price) {
      const priceInput = await page.$('input[name="price"], .price-input, [class*="price"] input')
      if (priceInput) {
        await priceInput.click({ clickCount: 3 })
        await priceInput.type(updates.price.toFixed(2), { delay: 10 })
      }
    }

    // Update quantity
    if (updates.quantity) {
      const qtyInput = await page.$('input[name="quantity"], .quantity-input')
      if (qtyInput) {
        await qtyInput.click({ clickCount: 3 })
        await qtyInput.type(updates.quantity.toString(), { delay: 10 })
      }
    }

    // Save changes
    const saveBtn = await page.$('button:has-text("Save"), button[type="submit"], .save-btn')
    if (saveBtn) {
      await saveBtn.click()
      await waitForPageLoad(page)
    }

    return { success: true }
  } catch (error) {
    console.error('[AutoDS Drafts] Edit error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Edit failed',
    }
  } finally {
    await release()
  }
}

// --- Helper functions ---

async function extractDraftsFromPage(page: Page): Promise<AutoDSDraft[]> {
  return page.evaluate(() => {
    const drafts: Array<{
      id: string
      title: string
      price: number
      imageUrl?: string
      status: string
      errorMessage?: string
    }> = []

    const rows = document.querySelectorAll('tr[data-draft-id], [class*="draft-row"], .draft-item')

    rows.forEach(row => {
      const id = row.getAttribute('data-draft-id') || row.getAttribute('data-id') || ''
      const titleEl = row.querySelector('[class*="title"], .product-title, td:nth-child(2)')
      const priceEl = row.querySelector('[class*="price"], .product-price')
      const imageEl = row.querySelector('img')
      const statusEl = row.querySelector('[class*="status"], .draft-status')
      const errorEl = row.querySelector('[class*="error"]')

      const priceText = priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0'

      drafts.push({
        id,
        title: titleEl?.textContent?.trim() || 'Unknown',
        price: parseFloat(priceText),
        imageUrl: imageEl?.src,
        status: statusEl?.textContent?.toLowerCase()?.includes('error') ? 'error' :
               statusEl?.textContent?.toLowerCase()?.includes('processing') ? 'processing' : 'ready',
        errorMessage: errorEl?.textContent?.trim(),
      })
    })

    return drafts
  }) as Promise<AutoDSDraft[]>
}

async function getTotalDraftCount(page: Page): Promise<number> {
  try {
    const countText = await page.$eval(
      '[class*="total"], .draft-count, .pagination-info',
      el => el.textContent || ''
    )
    const match = countText.match(/(\d+)\s*(?:total|drafts|items)/i)
    return match ? parseInt(match[1]) : 0
  } catch {
    return 0
  }
}

async function findPublishButton(page: Page): Promise<any> {
  const selectors = [
    'button:has-text("Publish")',
    'button:has-text("List")',
    'button:has-text("Go Live")',
    '[class*="publish-btn"]',
    '.publish-button',
  ]

  for (const selector of selectors) {
    const button = await page.$(selector)
    if (button) return button
  }

  return null
}

async function waitForPublishComplete(page: Page): Promise<void> {
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.waitForSelector('.success-message, [class*="success"]', { timeout: 30000 }),
      page.waitForSelector('.error-message, [class*="error"]', { timeout: 30000 }),
    ])
  } catch {
    // Timeout ok, will check state
  }
}

async function checkForPublishErrors(page: Page): Promise<string | null> {
  const errorEl = await page.$('.error-message, .alert-error, [class*="publish-error"]')
  if (errorEl) {
    return page.evaluate(el => el?.textContent?.trim() || null, errorEl)
  }
  return null
}

async function extractListingId(page: Page, draftId: string): Promise<string | undefined> {
  try {
    // Check URL for listing ID
    const url = page.url()
    const urlMatch = url.match(/listing[s]?[=/](\w+)/)
    if (urlMatch) return urlMatch[1]

    // Check page for listing ID
    const listingId = await page.evaluate(() => {
      const el = document.querySelector('[data-listing-id], [data-ebay-id]')
      return el?.getAttribute('data-listing-id') || el?.getAttribute('data-ebay-id')
    })

    return listingId || undefined
  } catch {
    return undefined
  }
}

async function updateDraftStatus(
  draftId: string,
  status: 'published' | 'deleted',
  listingId?: string
): Promise<void> {
  try {
    const updates: Record<string, any> = {
      listing_status: status === 'published' ? 'active' : 'deleted',
    }

    if (listingId) {
      updates.ebay_listing_id = listingId
      updates.listed_at = new Date().toISOString()
    }

    await supabase
      .from('store_sku_assignments')
      .update(updates)
      .eq('autods_draft_id', draftId)
  } catch (error) {
    console.error('[AutoDS Drafts] Failed to update draft status:', error)
  }
}
