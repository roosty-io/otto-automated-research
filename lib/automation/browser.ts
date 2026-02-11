/**
 * Browser Pool for Puppeteer automation
 *
 * Uses dynamic imports to avoid webpack bundling issues with puppeteer-extra
 */

import type { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer-core'

// Lazy-loaded puppeteer instance
let puppeteerInstance: any = null
let stealthInitialized = false

async function getPuppeteer() {
  if (!puppeteerInstance) {
    // Dynamic import to avoid webpack bundling issues
    const puppeteerExtra = await import('puppeteer-extra')
    puppeteerInstance = puppeteerExtra.default

    // Add stealth plugin only once
    if (!stealthInitialized) {
      try {
        const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default
        puppeteerInstance.use(StealthPlugin())
        stealthInitialized = true
      } catch (error) {
        console.warn('[BrowserPool] Stealth plugin not available, continuing without it')
      }
    }
  }
  return puppeteerInstance
}

// Browser pool configuration
interface BrowserPoolConfig {
  maxBrowsers: number
  maxPagesPerBrowser: number
  browserTimeout: number // ms before idle browser is closed
  headless: boolean
  proxyServer?: string
}

interface PooledBrowser {
  browser: Browser
  pageCount: number
  lastUsed: number
  id: string
}

const DEFAULT_CONFIG: BrowserPoolConfig = {
  maxBrowsers: 3,
  maxPagesPerBrowser: 5,
  browserTimeout: 5 * 60 * 1000, // 5 minutes
  headless: true,
}

class BrowserPool {
  private browsers: Map<string, PooledBrowser> = new Map()
  private config: BrowserPoolConfig
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(config: Partial<BrowserPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.startCleanupInterval()
  }

  private startCleanupInterval() {
    // Clean up idle browsers every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleBrowsers()
    }, 60 * 1000)
  }

  private async cleanupIdleBrowsers() {
    const now = Date.now()
    for (const [id, pooled] of this.browsers) {
      if (
        pooled.pageCount === 0 &&
        now - pooled.lastUsed > this.config.browserTimeout
      ) {
        console.log(`[BrowserPool] Closing idle browser: ${id}`)
        await this.closeBrowser(id)
      }
    }
  }

  private generateId(): string {
    return `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getLaunchOptions(): PuppeteerLaunchOptions {
    const options: PuppeteerLaunchOptions = {
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    }

    // Add proxy if configured
    if (this.config.proxyServer) {
      options.args?.push(`--proxy-server=${this.config.proxyServer}`)
    }

    // Use system Chrome if available, otherwise use default
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
    if (executablePath) {
      options.executablePath = executablePath
    }

    return options
  }

  async getBrowser(): Promise<{ browser: Browser; browserId: string }> {
    // Find an existing browser with capacity
    for (const [id, pooled] of this.browsers) {
      if (pooled.pageCount < this.config.maxPagesPerBrowser) {
        pooled.lastUsed = Date.now()
        return { browser: pooled.browser, browserId: id }
      }
    }

    // Check if we can create a new browser
    if (this.browsers.size >= this.config.maxBrowsers) {
      throw new Error(
        `Browser pool exhausted. Max browsers: ${this.config.maxBrowsers}`
      )
    }

    // Create a new browser
    const id = this.generateId()
    console.log(`[BrowserPool] Launching new browser: ${id}`)

    const puppeteer = await getPuppeteer()
    const browser = await puppeteer.launch(this.getLaunchOptions())

    this.browsers.set(id, {
      browser,
      pageCount: 0,
      lastUsed: Date.now(),
      id,
    })

    // Handle browser disconnect
    browser.on('disconnected', () => {
      console.log(`[BrowserPool] Browser disconnected: ${id}`)
      this.browsers.delete(id)
    })

    return { browser, browserId: id }
  }

  async getPage(browserId?: string): Promise<{ page: Page; browserId: string }> {
    let browser: Browser
    let actualBrowserId: string

    if (browserId && this.browsers.has(browserId)) {
      const pooled = this.browsers.get(browserId)!
      browser = pooled.browser
      actualBrowserId = browserId
    } else {
      const result = await this.getBrowser()
      browser = result.browser
      actualBrowserId = result.browserId
    }

    const page = await browser.newPage()

    // Set user agent to avoid detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    })

    // Update page count
    const pooled = this.browsers.get(actualBrowserId)
    if (pooled) {
      pooled.pageCount++
      pooled.lastUsed = Date.now()
    }

    // Track page close to update count
    page.on('close', () => {
      const pooled = this.browsers.get(actualBrowserId)
      if (pooled) {
        pooled.pageCount = Math.max(0, pooled.pageCount - 1)
        pooled.lastUsed = Date.now()
      }
    })

    return { page, browserId: actualBrowserId }
  }

  async closeBrowser(browserId: string): Promise<void> {
    const pooled = this.browsers.get(browserId)
    if (pooled) {
      try {
        await pooled.browser.close()
      } catch (error) {
        console.error(`[BrowserPool] Error closing browser ${browserId}:`, error)
      }
      this.browsers.delete(browserId)
    }
  }

  async closeAll(): Promise<void> {
    console.log(`[BrowserPool] Closing all browsers (${this.browsers.size})`)

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    const closePromises = Array.from(this.browsers.keys()).map((id) =>
      this.closeBrowser(id)
    )
    await Promise.all(closePromises)
  }

  getStats(): {
    activeBrowsers: number
    totalPages: number
    maxBrowsers: number
  } {
    let totalPages = 0
    for (const pooled of this.browsers.values()) {
      totalPages += pooled.pageCount
    }
    return {
      activeBrowsers: this.browsers.size,
      totalPages,
      maxBrowsers: this.config.maxBrowsers,
    }
  }
}

// Singleton instance
let browserPoolInstance: BrowserPool | null = null

export function getBrowserPool(config?: Partial<BrowserPoolConfig>): BrowserPool {
  if (!browserPoolInstance) {
    browserPoolInstance = new BrowserPool(config)
  }
  return browserPoolInstance
}

export async function withBrowser<T>(
  fn: (browser: Browser) => Promise<T>,
  config?: Partial<BrowserPoolConfig>
): Promise<T> {
  const pool = getBrowserPool(config)
  const { browser, browserId } = await pool.getBrowser()

  try {
    return await fn(browser)
  } finally {
    // Don't close browser, it stays in pool
  }
}

export async function withPage<T>(
  fn: (page: Page) => Promise<T>,
  config?: Partial<BrowserPoolConfig>
): Promise<T> {
  const pool = getBrowserPool(config)
  const { page } = await pool.getPage()

  try {
    return await fn(page)
  } finally {
    await page.close()
  }
}

export { BrowserPool }
export type { BrowserPoolConfig, PooledBrowser }
