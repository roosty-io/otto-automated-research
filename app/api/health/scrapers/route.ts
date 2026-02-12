import { NextResponse } from 'next/server'
import { getBrowserPool, withPage, navigateTo, sleep, takeScreenshot } from '@/lib/automation'
import { supabase } from '@/lib/supabase'
import type { Page } from 'puppeteer-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minutes for full check

/**
 * Scraper Health Check API
 *
 * GET /api/health/scrapers
 * Tests AutoDS and ZIK Analytics scraper selectors to detect UI changes
 *
 * Query params:
 * - platform: 'autods' | 'zik' | 'all' (default: 'all')
 * - deep: 'true' for deep check including login (default: false)
 */

interface SelectorTest {
  name: string
  selector: string
  found: boolean
  visible?: boolean
  fallbacksUsed?: string[]
}

interface PlatformHealth {
  platform: string
  reachable: boolean
  loginPageLoads: boolean
  selectors: SelectorTest[]
  errors: string[]
  screenshotPath?: string
  testedAt: string
}

interface HealthCheckResult {
  success: boolean
  timestamp: string
  duration: string
  platforms: PlatformHealth[]
  browserPool: {
    activeBrowsers: number
    totalPages: number
    maxBrowsers: number
  }
  summary: {
    totalSelectors: number
    workingSelectors: number
    brokenSelectors: number
    healthScore: number // 0-100
  }
}

// AutoDS selectors to test (from auth.ts and navigation.ts)
const AUTODS_SELECTORS = {
  // Login page
  loginEmailInput: ['input[type="email"]', 'input[name="email"]'],
  loginPasswordInput: ['input[type="password"]', 'input[name="password"]'],
  loginButton: ['button[type="submit"]', 'form button'],

  // Error detection (for login failures)
  errorMessage: ['.error-message', '.alert-error', '[class*="error"]', '.notification-error'],
}

// ZIK selectors to test (from zik/auth.ts and zik/product-research.ts)
const ZIK_SELECTORS = {
  // Login page
  loginEmailInput: ['input[type="email"]', 'input[name="email"]', '#email'],
  loginPasswordInput: ['input[type="password"]', 'input[name="password"]', '#password'],
  loginButton: ['button[type="submit"]', 'input[type="submit"]', '.login-btn'],

  // Error detection
  errorMessage: ['.error-message', '.alert-danger', '[class*="error"]', '.invalid-feedback'],
}

async function testSelectors(
  page: Page,
  selectors: Record<string, string[]>
): Promise<SelectorTest[]> {
  const results: SelectorTest[] = []

  for (const [name, selectorList] of Object.entries(selectors)) {
    let found = false
    let visible = false
    const fallbacksUsed: string[] = []

    for (let i = 0; i < selectorList.length; i++) {
      const selector = selectorList[i]
      try {
        const element = await page.$(selector)
        if (element) {
          found = true
          try {
            visible = await element.isVisible()
          } catch {
            visible = false
          }

          // Track if we had to use fallbacks
          if (i > 0) {
            fallbacksUsed.push(...selectorList.slice(0, i))
          }
          break
        }
      } catch (error) {
        // Selector failed, try next
      }
    }

    results.push({
      name,
      selector: selectorList[0], // Primary selector
      found,
      visible,
      fallbacksUsed: fallbacksUsed.length > 0 ? fallbacksUsed : undefined,
    })
  }

  return results
}

async function testAutoDSHealth(takeShot: boolean): Promise<PlatformHealth> {
  const health: PlatformHealth = {
    platform: 'autods',
    reachable: false,
    loginPageLoads: false,
    selectors: [],
    errors: [],
    testedAt: new Date().toISOString(),
  }

  try {
    const result = await withPage(async (page) => {
      // Test reachability
      const navSuccess = await navigateTo(page, 'https://platform.autods.com/login', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      })

      if (!navSuccess) {
        health.errors.push('Failed to navigate to AutoDS login page')
        return health
      }

      health.reachable = true

      // Wait for page to settle
      await sleep(2000)

      // Check if we're on login page (not redirected)
      const url = page.url()
      health.loginPageLoads = url.includes('login') || url.includes('signin')

      // Test selectors
      health.selectors = await testSelectors(page, AUTODS_SELECTORS)

      // Take screenshot if requested
      if (takeShot) {
        health.screenshotPath = await takeScreenshot(page, 'autods_health_check') || undefined
      }

      return health
    })

    return result
  } catch (error) {
    health.errors.push(error instanceof Error ? error.message : 'Unknown error')
    return health
  }
}

async function testZikHealth(takeShot: boolean): Promise<PlatformHealth> {
  const health: PlatformHealth = {
    platform: 'zik',
    reachable: false,
    loginPageLoads: false,
    selectors: [],
    errors: [],
    testedAt: new Date().toISOString(),
  }

  try {
    const result = await withPage(async (page) => {
      // Test reachability
      const navSuccess = await navigateTo(page, 'https://app.zikanalytics.com/login', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      })

      if (!navSuccess) {
        health.errors.push('Failed to navigate to ZIK login page')
        return health
      }

      health.reachable = true

      // Wait for page to settle
      await sleep(2000)

      // Check if we're on login page
      const url = page.url()
      health.loginPageLoads = url.includes('login') || url.includes('signin')

      // Test selectors
      health.selectors = await testSelectors(page, ZIK_SELECTORS)

      // Take screenshot if requested
      if (takeShot) {
        health.screenshotPath = await takeScreenshot(page, 'zik_health_check') || undefined
      }

      return health
    })

    return result
  } catch (error) {
    health.errors.push(error instanceof Error ? error.message : 'Unknown error')
    return health
  }
}

function calculateSummary(platforms: PlatformHealth[]): HealthCheckResult['summary'] {
  let totalSelectors = 0
  let workingSelectors = 0

  for (const platform of platforms) {
    for (const selector of platform.selectors) {
      totalSelectors++
      if (selector.found) {
        workingSelectors++
      }
    }
  }

  const brokenSelectors = totalSelectors - workingSelectors
  const healthScore = totalSelectors > 0
    ? Math.round((workingSelectors / totalSelectors) * 100)
    : 0

  return {
    totalSelectors,
    workingSelectors,
    brokenSelectors,
    healthScore,
  }
}

async function storeHealthCheck(result: HealthCheckResult): Promise<void> {
  try {
    // Store in scraper_health_checks table
    await supabase
      .from('scraper_health_checks')
      .insert({
        timestamp: result.timestamp,
        duration_ms: parseInt(result.duration.replace('ms', '')),
        health_score: result.summary.healthScore,
        total_selectors: result.summary.totalSelectors,
        working_selectors: result.summary.workingSelectors,
        broken_selectors: result.summary.brokenSelectors,
        platforms: result.platforms,
        browser_pool: result.browserPool,
      })
  } catch (error) {
    console.error('[ScraperHealth] Failed to store health check:', error)
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform') || 'all'
  const takeShot = searchParams.get('screenshot') === 'true'

  const startTime = Date.now()

  try {
    const platforms: PlatformHealth[] = []

    // Test platforms based on query param
    if (platform === 'all' || platform === 'autods') {
      console.log('[ScraperHealth] Testing AutoDS...')
      const autods = await testAutoDSHealth(takeShot)
      platforms.push(autods)
    }

    if (platform === 'all' || platform === 'zik') {
      console.log('[ScraperHealth] Testing ZIK Analytics...')
      const zik = await testZikHealth(takeShot)
      platforms.push(zik)
    }

    // Get browser pool stats
    const pool = getBrowserPool()
    const poolStats = pool.getStats()

    // Calculate summary
    const summary = calculateSummary(platforms)

    const result: HealthCheckResult = {
      success: summary.healthScore >= 50, // At least 50% selectors working
      timestamp: new Date().toISOString(),
      duration: `${Date.now() - startTime}ms`,
      platforms,
      browserPool: poolStats,
      summary,
    }

    // Store health check results
    await storeHealthCheck(result)

    // Return appropriate status based on health
    const status = result.success ? 200 : 503

    return NextResponse.json(result, { status })
  } catch (error) {
    console.error('[ScraperHealth] Error:', error)

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        duration: `${Date.now() - startTime}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        platforms: [],
        browserPool: { activeBrowsers: 0, totalPages: 0, maxBrowsers: 0 },
        summary: { totalSelectors: 0, workingSelectors: 0, brokenSelectors: 0, healthScore: 0 },
      },
      { status: 500 }
    )
  }
}
