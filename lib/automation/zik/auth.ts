/**
 * ZIK Analytics Authentication Handler
 *
 * Handles login to ZIK Analytics using Puppeteer.
 * Stores session cookies for reuse across requests.
 */

import type { Page } from 'puppeteer-core'
import { getBrowserPool } from '../browser'
import { sessionManager } from '../session'
import {
  navigateTo,
  waitForSelector,
  safeType,
  safeClick,
  waitForUrl,
  waitForAnySelector,
  takeScreenshot,
  sleep,
} from '../helpers'

// ZIK URLs
const ZIK_BASE_URL = 'https://app.zikanalytics.com'
const ZIK_LOGIN_URL = `${ZIK_BASE_URL}/login`
const ZIK_DASHBOARD_URL = `${ZIK_BASE_URL}/dashboard`

// Selectors
const SELECTORS = {
  // Login page
  emailInput: 'input[type="email"], input[name="email"], #email',
  passwordInput: 'input[type="password"], input[name="password"], #password',
  loginButton: 'button[type="submit"], input[type="submit"], .login-btn, button:has-text("Login"), button:has-text("Sign in")',
  rememberMe: 'input[type="checkbox"][name="remember"]',

  // Post-login indicators
  dashboard: '.dashboard, [class*="dashboard"], #dashboard',
  userMenu: '.user-menu, .profile-menu, [class*="user-avatar"], [class*="profile"]',
  sidebar: '.sidebar, nav[class*="sidebar"], [class*="navigation"]',

  // Error indicators
  errorMessage: '.error-message, .alert-danger, [class*="error"], .invalid-feedback',
  invalidCredentials: '[class*="invalid"], [class*="incorrect"]',

  // 2FA
  twoFactorInput: 'input[name="code"], input[name="otp"], input[name="2fa"], input[placeholder*="code"]',
  twoFactorSubmit: 'button[type="submit"]',
}

export interface ZikAuthResult {
  success: boolean
  error?: string
  sessionValid?: boolean
  requiresTwoFactor?: boolean
}

export interface ZikCredentials {
  email: string
  password: string
  twoFactorCode?: string
}

/**
 * Check if we have a valid ZIK session
 */
export async function hasValidZikSession(): Promise<boolean> {
  return sessionManager.hasValid('zik')
}

/**
 * Login to ZIK Analytics
 */
export async function loginToZik(
  credentials?: ZikCredentials
): Promise<ZikAuthResult> {
  // Get credentials from params or environment
  const email = credentials?.email || process.env.ZIK_EMAIL
  const password = credentials?.password || process.env.ZIK_PASSWORD

  if (!email || !password) {
    return {
      success: false,
      error: 'ZIK credentials not provided. Set ZIK_EMAIL and ZIK_PASSWORD environment variables.',
    }
  }

  const pool = getBrowserPool()
  const { page, browserId } = await pool.getPage()

  try {
    console.log('[ZIK Auth] Starting login process...')

    // Navigate to login page
    const navSuccess = await navigateTo(page, ZIK_LOGIN_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    if (!navSuccess) {
      return { success: false, error: 'Failed to load ZIK login page' }
    }

    // Check if already logged in (redirected to dashboard)
    if (page.url().includes('dashboard')) {
      console.log('[ZIK Auth] Already logged in!')
      await captureZikSession(page)
      return { success: true }
    }

    // Wait for login form
    const emailField = await waitForSelector(page, SELECTORS.emailInput, {
      visible: true,
      timeout: 10000,
    })

    if (!emailField) {
      await takeScreenshot(page, 'zik_login_no_form')
      return { success: false, error: 'Login form not found' }
    }

    // Enter email
    await safeType(page, SELECTORS.emailInput, email, { clear: true, delay: 50 })
    await sleep(300)

    // Enter password
    await safeType(page, SELECTORS.passwordInput, password, { clear: true, delay: 50 })
    await sleep(300)

    // Check remember me if available
    const rememberMe = await page.$(SELECTORS.rememberMe)
    if (rememberMe) {
      await rememberMe.click()
    }

    // Click login button
    console.log('[ZIK Auth] Submitting login form...')
    await safeClick(page, SELECTORS.loginButton)

    // Wait for result - either dashboard, error, or 2FA
    const result = await waitForAnySelector(page, [
      SELECTORS.dashboard,
      SELECTORS.userMenu,
      SELECTORS.sidebar,
      SELECTORS.errorMessage,
      SELECTORS.twoFactorInput,
    ], { timeout: 15000 })

    if (!result) {
      // Check URL for success
      await sleep(2000)
      if (page.url().includes('dashboard') || page.url().includes('app.zikanalytics.com')) {
        console.log('[ZIK Auth] Login successful (URL check)')
        await captureZikSession(page)
        return { success: true }
      }

      await takeScreenshot(page, 'zik_login_unknown_state')
      return { success: false, error: 'Unknown login state' }
    }

    // Check for 2FA
    if (result.selector === SELECTORS.twoFactorInput) {
      console.log('[ZIK Auth] 2FA required')

      if (credentials?.twoFactorCode) {
        // Enter 2FA code
        await safeType(page, SELECTORS.twoFactorInput, credentials.twoFactorCode, {
          clear: true,
          delay: 100,
        })
        await safeClick(page, SELECTORS.twoFactorSubmit)

        // Wait for dashboard after 2FA
        const dashboardAfter2FA = await waitForUrl(page, /dashboard/, { timeout: 10000 })
        if (dashboardAfter2FA) {
          await captureZikSession(page)
          return { success: true }
        }

        return { success: false, error: '2FA code rejected' }
      }

      return {
        success: false,
        requiresTwoFactor: true,
        error: '2FA required. Please provide twoFactorCode.',
      }
    }

    // Check for error message
    if (result.selector === SELECTORS.errorMessage || result.selector === SELECTORS.invalidCredentials) {
      const errorText = await result.element.evaluate((el) => el.textContent?.trim())
      await takeScreenshot(page, 'zik_login_error')
      return {
        success: false,
        error: `Login failed: ${errorText || 'Invalid credentials'}`,
      }
    }

    // Success - found dashboard elements
    console.log('[ZIK Auth] Login successful!')
    await captureZikSession(page)
    return { success: true }
  } catch (error) {
    console.error('[ZIK Auth] Error:', error)
    await takeScreenshot(page, 'zik_login_exception')
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during login',
    }
  } finally {
    await page.close()
  }
}

/**
 * Capture and store ZIK session
 */
async function captureZikSession(page: Page): Promise<void> {
  await sessionManager.captureFromPage(page, 'zik', {
    includeLocalStorage: true,
    includeSessionStorage: true,
    expiresInHours: 24, // ZIK sessions typically last 24 hours
    metadata: {
      loginTime: new Date().toISOString(),
      url: page.url(),
    },
  })
  console.log('[ZIK Auth] Session saved')
}

/**
 * Restore ZIK session to a page
 */
export async function restoreZikSession(page: Page): Promise<boolean> {
  const applied = await sessionManager.applyToPage(page, 'zik')
  if (!applied) {
    return false
  }

  // Navigate to dashboard to verify session
  await navigateTo(page, ZIK_DASHBOARD_URL)

  // Check if we're still logged in
  const isLoggedIn = !page.url().includes('login')
  if (!isLoggedIn) {
    // Session expired, invalidate it
    await sessionManager.invalidate('zik')
    return false
  }

  return true
}

/**
 * Ensure we have a valid ZIK session, logging in if needed
 */
export async function ensureZikSession(
  page: Page,
  credentials?: ZikCredentials
): Promise<boolean> {
  // Try to restore existing session
  const restored = await restoreZikSession(page)
  if (restored) {
    return true
  }

  // Need to login
  const loginResult = await loginToZik(credentials)
  if (!loginResult.success) {
    console.error('[ZIK Auth] Login failed:', loginResult.error)
    return false
  }

  // Apply fresh session to page
  return await sessionManager.applyToPage(page, 'zik')
}

/**
 * Logout from ZIK (invalidate session)
 */
export async function logoutFromZik(): Promise<void> {
  await sessionManager.invalidate('zik')
  console.log('[ZIK Auth] Session invalidated')
}

export { ZIK_BASE_URL, ZIK_LOGIN_URL, ZIK_DASHBOARD_URL }
