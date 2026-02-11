import { NextResponse } from 'next/server'
import { getBrowserPool, withPage, navigateTo, getText, takeScreenshot } from '@/lib/automation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 seconds max

/**
 * GET /api/automation/test
 * Test browser automation infrastructure
 *
 * Query params:
 * - url: URL to test (default: https://httpbin.org/ip)
 * - screenshot: Take screenshot (default: false)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const testUrl = searchParams.get('url') || 'https://httpbin.org/ip'
  const takeShot = searchParams.get('screenshot') === 'true'

  const startTime = Date.now()

  try {
    // Get pool stats before
    const pool = getBrowserPool()
    const statsBefore = pool.getStats()

    // Run test with a page
    const result = await withPage(async (page) => {
      // Navigate to test URL
      const navSuccess = await navigateTo(page, testUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      })

      if (!navSuccess) {
        throw new Error(`Failed to navigate to ${testUrl}`)
      }

      // Get page info
      const title = await page.title()
      const url = page.url()
      const content = await page.content()

      // Try to get body text
      const bodyText = await getText(page, 'body')

      // Take screenshot if requested
      let screenshotPath: string | null = null
      if (takeShot) {
        screenshotPath = await takeScreenshot(page, 'automation_test', {
          fullPage: true,
        })
      }

      // Get user agent
      const userAgent = await page.evaluate(() => navigator.userAgent)

      return {
        title,
        url,
        bodyText: bodyText?.substring(0, 500),
        contentLength: content.length,
        screenshotPath,
        userAgent,
      }
    })

    // Get pool stats after
    const statsAfter = pool.getStats()

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      test: {
        requestedUrl: testUrl,
        ...result,
      },
      pool: {
        before: statsBefore,
        after: statsAfter,
      },
      environment: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'default',
        nodeEnv: process.env.NODE_ENV,
      },
    })
  } catch (error) {
    const duration = Date.now() - startTime

    console.error('[AutomationTest] Error:', error)

    return NextResponse.json(
      {
        success: false,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        environment: {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'default',
          nodeEnv: process.env.NODE_ENV,
        },
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/automation/test
 * Run a custom browser test
 *
 * Body:
 * {
 *   url: string,
 *   actions: Array<{ type: 'click' | 'type' | 'wait', selector?: string, value?: string }>
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { url, actions = [] } = body

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    const result = await withPage(async (page) => {
      // Navigate
      const navSuccess = await navigateTo(page, url)
      if (!navSuccess) {
        throw new Error(`Failed to navigate to ${url}`)
      }

      const actionResults: Array<{ action: string; success: boolean; error?: string }> = []

      // Execute actions
      for (const action of actions) {
        try {
          switch (action.type) {
            case 'click':
              if (action.selector) {
                await page.click(action.selector)
                actionResults.push({ action: `click(${action.selector})`, success: true })
              }
              break

            case 'type':
              if (action.selector && action.value) {
                await page.type(action.selector, action.value)
                actionResults.push({ action: `type(${action.selector})`, success: true })
              }
              break

            case 'wait':
              if (action.selector) {
                await page.waitForSelector(action.selector, { timeout: 10000 })
                actionResults.push({ action: `wait(${action.selector})`, success: true })
              } else if (action.value) {
                await new Promise((r) => setTimeout(r, parseInt(action.value, 10)))
                actionResults.push({ action: `wait(${action.value}ms)`, success: true })
              }
              break

            default:
              actionResults.push({ action: action.type, success: false, error: 'Unknown action' })
          }
        } catch (error) {
          actionResults.push({
            action: action.type,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Final state
      const title = await page.title()
      const finalUrl = page.url()

      return {
        title,
        url: finalUrl,
        actions: actionResults,
      }
    })

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      result,
    })
  } catch (error) {
    console.error('[AutomationTest] POST Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
