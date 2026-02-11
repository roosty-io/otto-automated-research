import type { Page, ElementHandle } from 'puppeteer-core'
import * as fs from 'fs/promises'
import * as path from 'path'

// Default timeouts
const DEFAULT_TIMEOUT = 30000 // 30 seconds
const DEFAULT_NAVIGATION_TIMEOUT = 60000 // 60 seconds

// Wait options
interface WaitOptions {
  timeout?: number
  visible?: boolean
  hidden?: boolean
}

// Type options
interface TypeOptions {
  delay?: number // Delay between keystrokes in ms
  clear?: boolean // Clear existing content first
}

// Click options
interface ClickOptions {
  delay?: number // Delay before click
  doubleClick?: boolean
  rightClick?: boolean
  waitForNavigation?: boolean
}

// Screenshot options
interface ScreenshotOptions {
  fullPage?: boolean
  type?: 'png' | 'jpeg'
  quality?: number
  path?: string
}

/**
 * Wait for a selector to appear on the page
 */
export async function waitForSelector(
  page: Page,
  selector: string,
  options: WaitOptions = {}
): Promise<ElementHandle | null> {
  try {
    const element = await page.waitForSelector(selector, {
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      visible: options.visible,
      hidden: options.hidden,
    })
    return element
  } catch (error) {
    console.warn(`[Helpers] Selector not found: ${selector}`)
    return null
  }
}

/**
 * Wait for any of multiple selectors
 */
export async function waitForAnySelector(
  page: Page,
  selectors: string[],
  options: WaitOptions = {}
): Promise<{ selector: string; element: ElementHandle } | null> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector)
        if (element) {
          const isVisible = await element.isVisible()
          if (!options.visible || isVisible) {
            return { selector, element }
          }
        }
      } catch {
        // Continue checking other selectors
      }
    }
    await sleep(100)
  }

  return null
}

/**
 * Wait for text to appear on the page
 */
export async function waitForText(
  page: Page,
  text: string,
  options: WaitOptions = {}
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (searchText) => document.body.innerText.includes(searchText),
      { timeout: options.timeout ?? DEFAULT_TIMEOUT },
      text
    )
    return true
  } catch {
    return false
  }
}

/**
 * Wait for URL to match pattern
 */
export async function waitForUrl(
  page: Page,
  urlPattern: string | RegExp,
  options: WaitOptions = {}
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (pattern, isRegex) => {
        if (isRegex) {
          return new RegExp(pattern).test(window.location.href)
        }
        return window.location.href.includes(pattern)
      },
      { timeout: options.timeout ?? DEFAULT_TIMEOUT },
      typeof urlPattern === 'string' ? urlPattern : urlPattern.source,
      urlPattern instanceof RegExp
    )
    return true
  } catch {
    return false
  }
}

/**
 * Safe click on an element
 */
export async function safeClick(
  page: Page,
  selector: string,
  options: ClickOptions = {}
): Promise<boolean> {
  try {
    const element = await waitForSelector(page, selector, { visible: true })
    if (!element) {
      return false
    }

    // Optional delay before click
    if (options.delay) {
      await sleep(options.delay)
    }

    // Scroll element into view
    await element.evaluate((el) => el.scrollIntoView({ block: 'center' }))

    // Perform click
    if (options.waitForNavigation) {
      await Promise.all([
        page.waitForNavigation({ timeout: DEFAULT_NAVIGATION_TIMEOUT }),
        options.doubleClick
          ? element.click({ count: 2 })
          : options.rightClick
            ? element.click({ button: 'right' })
            : element.click(),
      ])
    } else {
      if (options.doubleClick) {
        await element.click({ count: 2 })
      } else if (options.rightClick) {
        await element.click({ button: 'right' })
      } else {
        await element.click()
      }
    }

    return true
  } catch (error) {
    console.warn(`[Helpers] Click failed for: ${selector}`, error)
    return false
  }
}

/**
 * Type text into an input field
 */
export async function safeType(
  page: Page,
  selector: string,
  text: string,
  options: TypeOptions = {}
): Promise<boolean> {
  try {
    const element = await waitForSelector(page, selector, { visible: true })
    if (!element) {
      return false
    }

    // Clear existing content if requested
    if (options.clear) {
      await element.click({ count: 3 }) // Select all
      await page.keyboard.press('Backspace')
    }

    // Type with optional delay
    await element.type(text, { delay: options.delay ?? 50 })
    return true
  } catch (error) {
    console.warn(`[Helpers] Type failed for: ${selector}`, error)
    return false
  }
}

/**
 * Select an option from a dropdown
 */
export async function safeSelect(
  page: Page,
  selector: string,
  value: string
): Promise<boolean> {
  try {
    await page.select(selector, value)
    return true
  } catch (error) {
    console.warn(`[Helpers] Select failed for: ${selector}`, error)
    return false
  }
}

/**
 * Get text content from an element
 */
export async function getText(
  page: Page,
  selector: string
): Promise<string | null> {
  try {
    const element = await page.$(selector)
    if (!element) {
      return null
    }
    return await element.evaluate((el) => el.textContent?.trim() || null)
  } catch {
    return null
  }
}

/**
 * Get attribute value from an element
 */
export async function getAttribute(
  page: Page,
  selector: string,
  attribute: string
): Promise<string | null> {
  try {
    const element = await page.$(selector)
    if (!element) {
      return null
    }
    return await element.evaluate(
      (el, attr) => el.getAttribute(attr),
      attribute
    )
  } catch {
    return null
  }
}

/**
 * Get value from an input element
 */
export async function getValue(
  page: Page,
  selector: string
): Promise<string | null> {
  try {
    const element = await page.$(selector)
    if (!element) {
      return null
    }
    return await element.evaluate((el) => (el as HTMLInputElement).value)
  } catch {
    return null
  }
}

/**
 * Check if element exists on page
 */
export async function elementExists(
  page: Page,
  selector: string
): Promise<boolean> {
  const element = await page.$(selector)
  return element !== null
}

/**
 * Check if element is visible
 */
export async function isVisible(
  page: Page,
  selector: string
): Promise<boolean> {
  try {
    const element = await page.$(selector)
    if (!element) {
      return false
    }
    return await element.isVisible()
  } catch {
    return false
  }
}

/**
 * Take a screenshot
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  options: ScreenshotOptions = {}
): Promise<string | null> {
  try {
    const screenshotsDir = path.join(process.cwd(), 'screenshots')
    await fs.mkdir(screenshotsDir, { recursive: true })

    const filename = `${name}_${Date.now()}.${options.type ?? 'png'}`
    const filepath = options.path ?? path.join(screenshotsDir, filename)

    await page.screenshot({
      path: filepath,
      fullPage: options.fullPage ?? false,
      type: options.type ?? 'png',
      quality: options.type === 'jpeg' ? options.quality ?? 80 : undefined,
    })

    console.log(`[Helpers] Screenshot saved: ${filepath}`)
    return filepath
  } catch (error) {
    console.error('[Helpers] Screenshot failed:', error)
    return null
  }
}

/**
 * Navigate to URL with retry
 */
export async function navigateTo(
  page: Page,
  url: string,
  options: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
    timeout?: number
    retries?: number
  } = {}
): Promise<boolean> {
  const maxRetries = options.retries ?? 3
  const timeout = options.timeout ?? DEFAULT_NAVIGATION_TIMEOUT

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, {
        waitUntil: options.waitUntil ?? 'networkidle2',
        timeout,
      })
      return true
    } catch (error) {
      console.warn(`[Helpers] Navigation attempt ${attempt}/${maxRetries} failed:`, url)
      if (attempt === maxRetries) {
        console.error('[Helpers] Navigation failed after all retries:', error)
        return false
      }
      await sleep(1000 * attempt) // Exponential backoff
    }
  }
  return false
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Random delay between min and max milliseconds (human-like behavior)
 */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return sleep(delay)
}

/**
 * Scroll to bottom of page
 */
export async function scrollToBottom(
  page: Page,
  options: { step?: number; delay?: number } = {}
): Promise<void> {
  const step = options.step ?? 250
  const delay = options.delay ?? 100

  await page.evaluate(
    async (scrollStep, scrollDelay) => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0
        const distance = scrollStep
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight
          window.scrollBy(0, distance)
          totalHeight += distance

          if (totalHeight >= scrollHeight) {
            clearInterval(timer)
            resolve()
          }
        }, scrollDelay)
      })
    },
    step,
    delay
  )
}

/**
 * Scroll element into view
 */
export async function scrollIntoView(
  page: Page,
  selector: string
): Promise<boolean> {
  try {
    const element = await page.$(selector)
    if (!element) {
      return false
    }
    await element.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    return true
  } catch {
    return false
  }
}

/**
 * Get all elements matching selector
 */
export async function getElements(
  page: Page,
  selector: string
): Promise<ElementHandle[]> {
  return await page.$$(selector)
}

/**
 * Extract data from multiple elements
 */
export async function extractFromElements<T>(
  page: Page,
  selector: string,
  extractor: (element: ElementHandle) => Promise<T>
): Promise<T[]> {
  const elements = await getElements(page, selector)
  const results: T[] = []

  for (const element of elements) {
    try {
      const data = await extractor(element)
      results.push(data)
    } catch (error) {
      console.warn('[Helpers] Extraction failed for element:', error)
    }
  }

  return results
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number
    initialDelay?: number
    maxDelay?: number
    shouldRetry?: (error: Error) => boolean
  } = {}
): Promise<T> {
  const maxRetries = options.retries ?? 3
  const initialDelay = options.initialDelay ?? 1000
  const maxDelay = options.maxDelay ?? 30000

  let lastError: Error

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (options.shouldRetry && !options.shouldRetry(lastError)) {
        throw lastError
      }

      if (attempt < maxRetries - 1) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay)
        console.log(`[Helpers] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`)
        await sleep(delay)
      }
    }
  }

  throw lastError!
}

/**
 * Block unnecessary resources for faster loading
 */
export async function blockResources(
  page: Page,
  resourceTypes: string[] = ['image', 'stylesheet', 'font', 'media']
): Promise<void> {
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    if (resourceTypes.includes(request.resourceType())) {
      request.abort()
    } else {
      request.continue()
    }
  })
}

/**
 * Execute JavaScript in page context
 */
export async function evaluate<T>(
  page: Page,
  fn: (...args: unknown[]) => T,
  ...args: unknown[]
): Promise<T> {
  return await page.evaluate(fn, ...args)
}
