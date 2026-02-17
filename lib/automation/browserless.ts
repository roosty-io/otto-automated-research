/**
 * Browserless.io Integration
 *
 * Provides enhanced integration with browserless.io for scalable browser automation.
 * Supports both browserless.io cloud and self-hosted browserless instances.
 *
 * Environment Variables:
 * - BROWSERLESS_TOKEN: Your browserless.io API token
 * - BROWSERLESS_URL: Custom browserless URL (defaults to chrome.browserless.io)
 * - BROWSER_WS_ENDPOINT: Full WebSocket URL (alternative to token-based config)
 */

import type { Browser, Page } from 'puppeteer-core'

// Browserless configuration
export interface BrowserlessConfig {
  token?: string
  url?: string
  timeout?: number
  headless?: boolean
  blockAds?: boolean
  stealth?: boolean
}

interface BrowserlessSession {
  browser: Browser
  sessionId: string
  createdAt: Date
  lastUsed: Date
}

// Default browserless configuration
const DEFAULT_BROWSERLESS_URL = 'chrome.browserless.io'

/**
 * Build browserless WebSocket endpoint URL
 */
export function buildBrowserlessUrl(config: BrowserlessConfig = {}): string {
  // Check for full endpoint URL first
  const fullEndpoint = process.env.BROWSER_WS_ENDPOINT
  if (fullEndpoint) {
    return fullEndpoint
  }

  const token = config.token || process.env.BROWSERLESS_TOKEN
  if (!token) {
    throw new Error('BROWSERLESS_TOKEN or BROWSER_WS_ENDPOINT is required')
  }

  const baseUrl = config.url || process.env.BROWSERLESS_URL || DEFAULT_BROWSERLESS_URL

  // Build query parameters
  const params = new URLSearchParams()
  params.set('token', token)

  if (config.timeout) {
    params.set('timeout', config.timeout.toString())
  }

  if (config.headless !== undefined) {
    params.set('headless', config.headless.toString())
  }

  if (config.blockAds) {
    params.set('blockAds', 'true')
  }

  if (config.stealth) {
    params.set('stealth', 'true')
  }

  return `wss://${baseUrl}?${params.toString()}`
}

/**
 * Connect to browserless.io
 */
export async function connectToBrowserless(
  config: BrowserlessConfig = {}
): Promise<Browser> {
  const puppeteerCore = await import('puppeteer-core')
  const wsEndpoint = buildBrowserlessUrl(config)

  console.log(`[Browserless] Connecting to: ${wsEndpoint.substring(0, 60)}...`)

  try {
    const browser = await puppeteerCore.default.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    })

    console.log('[Browserless] Connected successfully')
    return browser
  } catch (error) {
    console.error('[Browserless] Connection failed:', error)
    throw new Error(
      `Failed to connect to browserless: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Create a new page with browserless
 */
export async function createBrowserlessPage(
  config: BrowserlessConfig = {}
): Promise<{ browser: Browser; page: Page }> {
  const browser = await connectToBrowserless(config)
  const page = await browser.newPage()

  // Set default user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  // Set default headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  })

  return { browser, page }
}

/**
 * Run a function with a browserless page, automatically cleaning up
 */
export async function withBrowserlessPage<T>(
  fn: (page: Page) => Promise<T>,
  config: BrowserlessConfig = {}
): Promise<T> {
  const { browser, page } = await createBrowserlessPage(config)

  try {
    return await fn(page)
  } finally {
    await page.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

/**
 * Health check for browserless connection
 */
export async function checkBrowserlessHealth(
  config: BrowserlessConfig = {}
): Promise<{
  healthy: boolean
  latencyMs?: number
  error?: string
  version?: string
}> {
  const startTime = Date.now()

  try {
    const { browser, page } = await createBrowserlessPage(config)

    // Quick navigation test
    await page.goto('about:blank', { waitUntil: 'load', timeout: 10000 })

    const version = await browser.version()

    await page.close()
    await browser.close()

    return {
      healthy: true,
      latencyMs: Date.now() - startTime,
      version,
    }
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Screenshot with browserless (convenience function)
 */
export async function takeScreenshotWithBrowserless(
  url: string,
  config: BrowserlessConfig = {}
): Promise<Buffer> {
  return withBrowserlessPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    return (await page.screenshot({ fullPage: true })) as Buffer
  }, config)
}

/**
 * PDF generation with browserless (convenience function)
 */
export async function generatePdfWithBrowserless(
  url: string,
  config: BrowserlessConfig = {}
): Promise<Buffer> {
  return withBrowserlessPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    return (await page.pdf({ format: 'A4' })) as Buffer
  }, config)
}

/**
 * Content extraction with browserless (convenience function)
 */
export async function extractContentWithBrowserless(
  url: string,
  config: BrowserlessConfig = {}
): Promise<{ html: string; text: string; title: string }> {
  return withBrowserlessPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

    const [html, text, title] = await Promise.all([
      page.content(),
      page.evaluate(() => document.body.innerText),
      page.evaluate(() => document.title),
    ])

    return { html, text, title }
  }, config)
}

/**
 * Browserless session pool for managing multiple concurrent sessions
 */
class BrowserlessPool {
  private sessions: Map<string, BrowserlessSession> = new Map()
  private config: BrowserlessConfig
  private maxSessions: number

  constructor(config: BrowserlessConfig = {}, maxSessions = 5) {
    this.config = config
    this.maxSessions = maxSessions
  }

  private generateSessionId(): string {
    return `browserless_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  async getSession(): Promise<BrowserlessSession> {
    // Check for available session
    for (const [id, session] of this.sessions) {
      if (session.browser.connected) {
        session.lastUsed = new Date()
        return session
      }
      // Remove disconnected session
      this.sessions.delete(id)
    }

    // Create new session if under limit
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Browserless pool exhausted. Max sessions: ${this.maxSessions}`)
    }

    const sessionId = this.generateSessionId()
    const browser = await connectToBrowserless(this.config)

    const session: BrowserlessSession = {
      browser,
      sessionId,
      createdAt: new Date(),
      lastUsed: new Date(),
    }

    this.sessions.set(sessionId, session)

    // Handle disconnect
    browser.on('disconnected', () => {
      console.log(`[BrowserlessPool] Session disconnected: ${sessionId}`)
      this.sessions.delete(sessionId)
    })

    return session
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      await session.browser.close().catch(() => {})
      this.sessions.delete(sessionId)
    }
  }

  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.sessions.values()).map((session) =>
      session.browser.close().catch(() => {})
    )
    await Promise.all(closePromises)
    this.sessions.clear()
  }

  getStats(): {
    activeSessions: number
    maxSessions: number
    oldestSession?: Date
  } {
    let oldest: Date | undefined
    for (const session of this.sessions.values()) {
      if (!oldest || session.createdAt < oldest) {
        oldest = session.createdAt
      }
    }

    return {
      activeSessions: this.sessions.size,
      maxSessions: this.maxSessions,
      oldestSession: oldest,
    }
  }
}

// Singleton pool instance
let browserlessPoolInstance: BrowserlessPool | null = null

export function getBrowserlessPool(
  config?: BrowserlessConfig,
  maxSessions?: number
): BrowserlessPool {
  if (!browserlessPoolInstance) {
    browserlessPoolInstance = new BrowserlessPool(config, maxSessions)
  }
  return browserlessPoolInstance
}

export { BrowserlessPool }
