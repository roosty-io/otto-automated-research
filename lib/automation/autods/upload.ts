/**
 * AutoDS Product Upload Service
 *
 * Handles uploading products from Amazon to eBay via AutoDS:
 * - Single product import
 * - Bulk product import
 * - Price and title customization
 * - Variant handling
 */

import { getAuthenticatedPage, navigateToProducts, waitForPageLoad, isOnLoginPage } from './navigation'
import { supabase } from '@/lib/supabase'
import type { Page } from 'puppeteer'

export interface ProductUploadData {
  amazonUrl?: string
  amazonAsin?: string
  title?: string          // Override title
  price?: number          // Override price
  markup?: number         // Markup percentage
  quantity?: number
  storeId: string
  skuId?: string          // Our internal SKU ID for tracking
  category?: string
  itemSpecifics?: Record<string, string>
}

export interface UploadResult {
  success: boolean
  draftId?: string
  autoDsProductId?: string
  error?: string
  screenshotPath?: string
}

export interface BulkUploadResult {
  total: number
  successful: number
  failed: number
  results: Array<{
    amazonAsin: string
    success: boolean
    draftId?: string
    error?: string
  }>
}

/**
 * Upload a single product to AutoDS
 */
export async function uploadProduct(data: ProductUploadData): Promise<UploadResult> {
  const authenticated = await getAuthenticatedPage()
  if (!authenticated) {
    return { success: false, error: 'Failed to authenticate with AutoDS' }
  }

  const { page, release } = authenticated

  try {
    console.log('[AutoDS Upload] Starting product upload...')

    // Navigate to add product page
    await page.goto('https://platform.autods.com/add-product', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Check for login redirect
    if (await isOnLoginPage(page)) {
      return { success: false, error: 'Session expired' }
    }

    // Build Amazon URL if ASIN provided
    const amazonUrl = data.amazonUrl || `https://www.amazon.com/dp/${data.amazonAsin}`

    // Enter Amazon URL
    const urlInput = await page.waitForSelector(
      'input[placeholder*="Amazon"], input[placeholder*="URL"], input[name="url"], input[type="url"], .product-url-input',
      { timeout: 10000 }
    )

    if (!urlInput) {
      return { success: false, error: 'Could not find URL input field' }
    }

    await urlInput.click({ clickCount: 3 }) // Select all
    await urlInput.type(amazonUrl, { delay: 30 })

    console.log('[AutoDS Upload] Entered Amazon URL, importing...')

    // Click import/add button
    const importButton = await findImportButton(page)
    if (!importButton) {
      return { success: false, error: 'Could not find import button' }
    }

    await importButton.click()

    // Wait for product to load
    await waitForProductLoad(page)

    // Check for errors
    const errorMessage = await checkForErrors(page)
    if (errorMessage) {
      return { success: false, error: errorMessage }
    }

    console.log('[AutoDS Upload] Product imported, applying customizations...')

    // Apply customizations if provided
    if (data.title) {
      await setProductTitle(page, data.title)
    }

    if (data.price) {
      await setProductPrice(page, data.price)
    } else if (data.markup) {
      await applyMarkup(page, data.markup)
    }

    if (data.quantity) {
      await setQuantity(page, data.quantity)
    }

    // Select store if needed
    if (data.storeId) {
      await selectTargetStore(page, data.storeId)
    }

    // Save as draft
    console.log('[AutoDS Upload] Saving as draft...')
    const saveResult = await saveAsDraft(page)

    if (!saveResult.success) {
      return { success: false, error: saveResult.error }
    }

    // Track in our database
    if (data.skuId) {
      await trackUpload(data.skuId, data.storeId, saveResult.draftId)
    }

    console.log('[AutoDS Upload] Product uploaded successfully!')

    return {
      success: true,
      draftId: saveResult.draftId,
      autoDsProductId: saveResult.productId,
    }
  } catch (error) {
    console.error('[AutoDS Upload] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error',
    }
  } finally {
    await release()
  }
}

/**
 * Upload multiple products in bulk
 */
export async function uploadProductsBulk(
  products: ProductUploadData[],
  options: {
    batchSize?: number
    delayBetweenUploads?: number
    stopOnError?: boolean
  } = {}
): Promise<BulkUploadResult> {
  const { batchSize = 5, delayBetweenUploads = 2000, stopOnError = false } = options

  const result: BulkUploadResult = {
    total: products.length,
    successful: 0,
    failed: 0,
    results: [],
  }

  console.log(`[AutoDS Upload] Starting bulk upload of ${products.length} products...`)

  for (let i = 0; i < products.length; i++) {
    const product = products[i]

    console.log(`[AutoDS Upload] Uploading ${i + 1}/${products.length}: ${product.amazonAsin || product.amazonUrl}`)

    const uploadResult = await uploadProduct(product)

    result.results.push({
      amazonAsin: product.amazonAsin || extractAsin(product.amazonUrl || ''),
      success: uploadResult.success,
      draftId: uploadResult.draftId,
      error: uploadResult.error,
    })

    if (uploadResult.success) {
      result.successful++
    } else {
      result.failed++

      if (stopOnError) {
        console.log('[AutoDS Upload] Stopping bulk upload due to error')
        break
      }
    }

    // Delay between uploads
    if (i < products.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenUploads))
    }

    // Log progress every batch
    if ((i + 1) % batchSize === 0) {
      console.log(`[AutoDS Upload] Progress: ${i + 1}/${products.length} (${result.successful} successful, ${result.failed} failed)`)
    }
  }

  console.log(`[AutoDS Upload] Bulk upload complete: ${result.successful}/${result.total} successful`)

  return result
}

// --- Helper functions ---

async function findImportButton(page: Page): Promise<any> {
  const selectors = [
    'button:has-text("Import")',
    'button:has-text("Add")',
    'button:has-text("Fetch")',
    'button[type="submit"]',
    '.import-btn',
    '.add-product-btn',
    '[class*="import"]',
  ]

  for (const selector of selectors) {
    const button = await page.$(selector)
    if (button) return button
  }

  // Try finding by text
  const button = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    return buttons.find(b =>
      b.textContent?.toLowerCase().includes('import') ||
      b.textContent?.toLowerCase().includes('add') ||
      b.textContent?.toLowerCase().includes('fetch')
    )
  })

  return button
}

async function waitForProductLoad(page: Page): Promise<void> {
  try {
    // Wait for loading to complete
    await page.waitForFunction(
      () => {
        const loading = document.querySelector('[class*="loading"], [class*="spinner"]')
        return !loading || window.getComputedStyle(loading).display === 'none'
      },
      { timeout: 30000 }
    )

    // Wait for product details to appear
    await page.waitForSelector(
      '[class*="product-title"], [class*="ProductTitle"], input[name="title"], .product-editor',
      { timeout: 15000 }
    )
  } catch {
    // Timeout is ok, we'll check for errors
  }
}

async function checkForErrors(page: Page): Promise<string | null> {
  const errorSelectors = [
    '.error-message',
    '.alert-error',
    '[class*="error"]',
    '.notification-error',
  ]

  for (const selector of errorSelectors) {
    const errorEl = await page.$(selector)
    if (errorEl) {
      const text = await page.evaluate(el => el?.textContent || '', errorEl)
      if (text && text.trim().length > 0) {
        return text.trim()
      }
    }
  }

  return null
}

async function setProductTitle(page: Page, title: string): Promise<void> {
  try {
    const titleInput = await page.$('input[name="title"], [class*="title-input"], .product-title input, textarea[name="title"]')
    if (titleInput) {
      await titleInput.click({ clickCount: 3 })
      await titleInput.type(title, { delay: 10 })
    }
  } catch (error) {
    console.warn('[AutoDS Upload] Could not set title:', error)
  }
}

async function setProductPrice(page: Page, price: number): Promise<void> {
  try {
    const priceInput = await page.$('input[name="price"], [class*="price-input"], .product-price input')
    if (priceInput) {
      await priceInput.click({ clickCount: 3 })
      await priceInput.type(price.toFixed(2), { delay: 10 })
    }
  } catch (error) {
    console.warn('[AutoDS Upload] Could not set price:', error)
  }
}

async function applyMarkup(page: Page, markupPercent: number): Promise<void> {
  try {
    // Look for markup input or pricing rules
    const markupInput = await page.$('input[name="markup"], [class*="markup"], .markup-input')
    if (markupInput) {
      await markupInput.click({ clickCount: 3 })
      await markupInput.type(markupPercent.toString(), { delay: 10 })
    }
  } catch (error) {
    console.warn('[AutoDS Upload] Could not apply markup:', error)
  }
}

async function setQuantity(page: Page, quantity: number): Promise<void> {
  try {
    const qtyInput = await page.$('input[name="quantity"], [class*="quantity"], .quantity-input')
    if (qtyInput) {
      await qtyInput.click({ clickCount: 3 })
      await qtyInput.type(quantity.toString(), { delay: 10 })
    }
  } catch (error) {
    console.warn('[AutoDS Upload] Could not set quantity:', error)
  }
}

async function selectTargetStore(page: Page, storeId: string): Promise<void> {
  try {
    // Look for store selector
    const storeSelector = await page.$('[class*="store-select"], select[name="store"], .store-dropdown')
    if (storeSelector) {
      await storeSelector.click()
      await page.waitForSelector('[class*="dropdown-item"], option', { timeout: 3000 })

      const storeOption = await page.$(`[data-store-id="${storeId}"], option[value="${storeId}"]`)
      if (storeOption) {
        await storeOption.click()
      }
    }
  } catch (error) {
    console.warn('[AutoDS Upload] Could not select store:', error)
  }
}

async function saveAsDraft(page: Page): Promise<{
  success: boolean
  draftId?: string
  productId?: string
  error?: string
}> {
  try {
    // Find save/draft button
    const saveButton = await page.$(
      'button:has-text("Save"), button:has-text("Draft"), button:has-text("Add to Drafts"), .save-draft-btn'
    ) || await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('save') ||
        b.textContent?.toLowerCase().includes('draft')
      )
    })

    if (!saveButton) {
      return { success: false, error: 'Save button not found' }
    }

    await (saveButton as any).click()

    // Wait for save to complete
    await waitForPageLoad(page)

    // Check for success message or redirect
    const currentUrl = page.url()
    if (currentUrl.includes('/drafts') || currentUrl.includes('/products')) {
      // Try to extract draft ID from URL or page
      const draftId = await extractDraftId(page)
      return { success: true, draftId }
    }

    // Check for success message
    const successEl = await page.$('.success-message, .alert-success, [class*="success"]')
    if (successEl) {
      const draftId = await extractDraftId(page)
      return { success: true, draftId }
    }

    // Check for error
    const errorMessage = await checkForErrors(page)
    if (errorMessage) {
      return { success: false, error: errorMessage }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Save failed',
    }
  }
}

async function extractDraftId(page: Page): Promise<string | undefined> {
  try {
    const url = page.url()
    const match = url.match(/[?&]id=(\w+)/) || url.match(/\/drafts?\/(\w+)/)
    if (match) return match[1]

    // Try to get from page data
    const id = await page.evaluate(() => {
      const dataEl = document.querySelector('[data-draft-id], [data-product-id]')
      return dataEl?.getAttribute('data-draft-id') || dataEl?.getAttribute('data-product-id')
    })

    return id || undefined
  } catch {
    return undefined
  }
}

function extractAsin(url: string): string {
  const match = url.match(/\/dp\/(\w{10})/) || url.match(/asin=(\w{10})/)
  return match?.[1] || ''
}

async function trackUpload(
  skuId: string,
  storeId: string,
  draftId?: string
): Promise<void> {
  try {
    await supabase
      .from('store_sku_assignments')
      .update({
        autods_draft_id: draftId,
        listing_status: 'draft',
        uploaded_at: new Date().toISOString(),
      })
      .eq('sku_id', skuId)
      .eq('store_id', storeId)
  } catch (error) {
    console.error('[AutoDS Upload] Failed to track upload:', error)
  }
}

/**
 * Upload product from our SKU database
 */
export async function uploadFromSKU(
  skuId: string,
  storeId: string,
  options: {
    markup?: number
    customTitle?: string
  } = {}
): Promise<UploadResult> {
  // Get SKU data
  const { data: sku, error } = await supabase
    .from('skus')
    .select('*')
    .eq('id', skuId)
    .single()

  if (error || !sku) {
    return { success: false, error: 'SKU not found' }
  }

  // Calculate price with markup
  let price: number | undefined
  if (options.markup && sku.cost_price) {
    price = sku.cost_price * (1 + options.markup / 100)
  } else if (sku.sell_price) {
    price = sku.sell_price
  }

  return uploadProduct({
    amazonAsin: sku.asin,
    amazonUrl: sku.amazon_url,
    title: options.customTitle || sku.title,
    price,
    storeId,
    skuId,
    category: sku.category,
  })
}
