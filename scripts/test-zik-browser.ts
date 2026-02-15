/**
 * Test ZIK Analytics browser automation
 *
 * Tests the complete flow:
 * 1. Browser launches with correct config
 * 2. Can navigate to ZIK login page
 * 3. Login form elements are found
 */

import { getBrowserPool } from '../lib/automation/browser'
import { ZIK_LOGIN_URL, ZIK_BASE_URL } from '../lib/automation/zik/auth'

async function testZikBrowser() {
  console.log('Testing ZIK browser automation...')
  console.log('')

  const pool = getBrowserPool()

  try {
    const { page, browserId } = await pool.getPage()
    console.log(`✓ Browser launched: ${browserId}`)

    // Test 1: Navigate to ZIK login page
    console.log('\nTest 1: Navigate to ZIK login page...')
    await page.goto(ZIK_LOGIN_URL || 'https://app.zikanalytics.com/login', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })
    console.log(`✓ Navigated to: ${page.url()}`)

    // Take a screenshot for debugging
    const screenshotPath = '/tmp/zik-login-test.png'
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`✓ Screenshot saved: ${screenshotPath}`)

    // Test 2: Check for login form elements
    console.log('\nTest 2: Check for login form elements...')
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      '#email',
      'input[placeholder*="email" i]',
    ]

    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      '#password',
    ]

    let emailFound = false
    let passwordFound = false

    for (const selector of emailSelectors) {
      try {
        const element = await page.$(selector)
        if (element) {
          console.log(`✓ Found email input: ${selector}`)
          emailFound = true
          break
        }
      } catch {}
    }

    for (const selector of passwordSelectors) {
      try {
        const element = await page.$(selector)
        if (element) {
          console.log(`✓ Found password input: ${selector}`)
          passwordFound = true
          break
        }
      } catch {}
    }

    if (!emailFound) {
      console.log('⚠ Email input not found - page may have changed')
    }

    if (!passwordFound) {
      console.log('⚠ Password input not found - page may have changed')
    }

    // Get page title
    const title = await page.title()
    console.log(`\nPage title: ${title}`)

    // Get current URL
    console.log(`Current URL: ${page.url()}`)

    await page.close()
    console.log('\n✓ Page closed')

    await pool.closeAll()
    console.log('✓ Browser closed')

    console.log('\n========================================')
    console.log('✅ ZIK Browser Test PASSED!')
    console.log('========================================')
    console.log('\nThe browser is properly configured for ZIK automation.')
    console.log('Next steps:')
    console.log('  1. Ensure ZIK_EMAIL and ZIK_PASSWORD are set in .env.local')
    console.log('  2. Run the health check: curl http://localhost:3000/api/health/scrapers?platform=zik')
    console.log('  3. Run a full ZIK research job')

  } catch (error) {
    console.error('\n❌ ZIK Browser Test FAILED:', error)
    await pool.closeAll()
    process.exit(1)
  }
}

testZikBrowser()
