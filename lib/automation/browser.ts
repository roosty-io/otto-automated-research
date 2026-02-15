/**
 * Browser Pool for Puppeteer automation
 *
 * Supports both local browsers and remote browser services (Browserless.io, etc.)
 *
 * Environment variables:
 * - BROWSER_WS_ENDPOINT: WebSocket URL for remote browser service (e.g., wss://chrome.browserless.io?token=XXX)
 * - PUPPETEER_EXECUTABLE_PATH: Path to local Chrome binary (for local mode)
 *
 * Uses dynamic imports to avoid webpack bundling issues with puppeteer-extra
 */

import type { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer-core'
import { existsSync } from 'fs'

// Lazy-loaded puppeteer instance
let puppeteerInstance: any = null
let puppeteerCore: any = null
let stealthInitialized = false

// Parsed proxy configuration
interface ProxyConfig {
  server: string
  username?: string
  password?: string
}

/**
 * Parse proxy URL from environment (supports http://user:pass@host:port format)
 */
function getProxyConfig(): ProxyConfig | null {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy
  if (!proxyUrl) return null

  try {
    const url = new URL(proxyUrl)
    return {
      server: `${url.protocol}//${url.host}`,
      username: url.username || undefined,
      password: url.password || undefined,
    }
  } catch {
    // Fallback: assume it's just host:port
    return { server: proxyUrl }
  }
}

// Known browser paths to try if PUPPETEER_EXECUTABLE_PATH is not set
const BROWSER_PATHS = [
  // Playwright's Chromium (commonly available in CI/dev environments)
  '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
  // Common Linux paths
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  // macOS paths
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Windows paths (WSL)
  '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
]

/**
 * Find an available browser executable path
 */
function findBrowserPath(): string | undefined {
  // First check environment variable
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH
  if (envPath && existsSync(envPath)) {
    return envPath
  }

  // Try known paths
  for (const browserPath of BROWSER_PATHS) {
    if (existsSync(browserPath)) {
      console.log(`[BrowserPool] Found browser at: ${browserPath}`)
      return browserPath
    }
  }

  return undefined
}

// Check if we're using remote browser
function isRemoteBrowser(): boolean {
  return !!process.env.BROWSER_WS_ENDPOINT
}

async function getPuppeteerCore() {
  if (!puppeteerCore) {
    puppeteerCore = await import('puppeteer-core')
  }
  return puppeteerCore.default || puppeteerCore
}

async function getPuppeteer() {
  // For remote browsers, use puppeteer-core directly (stealth not needed/supported)
  if (isRemoteBrowser()) {
    return getPuppeteerCore()
  }

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
  proxyAuth?: { username: string; password: string }
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

  private getLaunchOptions(): { options: PuppeteerLaunchOptions; proxyAuth?: { username: string; password: string } } {
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
        // SSL certificate handling for proxy environments
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--allow-running-insecure-content',
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    }

    let proxyAuth: { username: string; password: string } | undefined

    // Add proxy if configured via config or environment
    if (this.config.proxyServer) {
      options.args?.push(`--proxy-server=${this.config.proxyServer}`)
    } else {
      // Check environment for proxy
      const envProxy = getProxyConfig()
      if (envProxy) {
        options.args?.push(`--proxy-server=${envProxy.server}`)
        if (envProxy.username && envProxy.password) {
          proxyAuth = { username: envProxy.username, password: envProxy.password }
        }
      }
    }

    // Find browser executable - checks env var first, then known paths
    const executablePath = findBrowserPath()
    if (executablePath) {
      options.executablePath = executablePath
    }

    return { options, proxyAuth }
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
    const puppeteer = await getPuppeteer()
    let browser: Browser

    // Check for remote browser service
    const wsEndpoint = process.env.BROWSER_WS_ENDPOINT
    if (wsEndpoint) {
      console.log(`[BrowserPool] Connecting to remote browser: ${id}`)
      console.log(`[BrowserPool] WebSocket endpoint: ${wsEndpoint.substring(0, 50)}...`)

      try {
        browser = await puppeteer.connect({
          browserWSEndpoint: wsEndpoint,
          defaultViewport: {
            width: 1920,
            height: 1080,
          },
        })
      } catch (connectError) {
        console.error(`[BrowserPool] Failed to connect to remote browser:`, connectError)
        throw new Error(
          `Failed to connect to remote browser service. ` +
          `Check BROWSER_WS_ENDPOINT is valid. Error: ${connectError instanceof Error ? connectError.message : 'Unknown'}`
        )
      }
    } else {
      // Check if local browser is available
      const executablePath = findBrowserPath()
      if (!executablePath) {
        throw new Error(
          `No browser configured. For production/scale, set BROWSER_WS_ENDPOINT to a remote browser service:\n` +
          `  - Browserless.io: wss://chrome.browserless.io?token=YOUR_TOKEN\n` +
          `  - Bright Data: wss://brd.superproxy.io:9222\n` +
          `For local development, set PUPPETEER_EXECUTABLE_PATH to your Chrome binary path.\n` +
          `Alternatively, install Playwright browsers: npx playwright install chromium`
        )
      }
      console.log(`[BrowserPool] Launching local browser: ${id} (${executablePath})`)
      const { options, proxyAuth } = this.getLaunchOptions()
      browser = await puppeteer.launch(options)

      // Store browser with proxy auth info
      this.browsers.set(id, {
        browser,
        pageCount: 0,
        lastUsed: Date.now(),
        id,
        proxyAuth,
      })

      // Handle browser disconnect
      browser.on('disconnected', () => {
        console.log(`[BrowserPool] Browser disconnected: ${id}`)
        this.browsers.delete(id)
      })

      return { browser, browserId: id }
    }

    // For remote browsers (no proxy auth needed - handled by the service)
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
    let pooled: PooledBrowser | undefined

    if (browserId && this.browsers.has(browserId)) {
      pooled = this.browsers.get(browserId)!
      browser = pooled.browser
      actualBrowserId = browserId
    } else {
      const result = await this.getBrowser()
      browser = result.browser
      actualBrowserId = result.browserId
      pooled = this.browsers.get(actualBrowserId)
    }

    const page = await browser.newPage()

    // Apply proxy authentication if configured
    if (pooled?.proxyAuth) {
      await page.authenticate({
        username: pooled.proxyAuth.username,
        password: pooled.proxyAuth.password,
      })
    }

    // Set user agent to avoid detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    })

    // Update page count
    if (pooled) {
      pooled.pageCount++
      pooled.lastUsed = Date.now()
    }

    // Track page close to update count
    page.on('close', () => {
      const currentPooled = this.browsers.get(actualBrowserId)
      if (currentPooled) {
        currentPooled.pageCount = Math.max(0, currentPooled.pageCount - 1)
        currentPooled.lastUsed = Date.now()
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
