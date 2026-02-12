/**
 * AutoDS Authentication Service
 *
 * Handles login, session management, and credential storage
 * for AutoDS automation.
 */

import { getBrowserPool } from '../browser'
import { supabase } from '@/lib/supabase'
import type { Page, Browser } from 'puppeteer'

export interface AutoDSCredentials {
  email: string
  password: string
}

export interface AutoDSSession {
  id: string
  cookies: any[]
  localStorage: Record<string, string>
  userAgent: string
  isValid: boolean
  expiresAt: Date
  lastUsed: Date
}

export interface LoginResult {
  success: boolean
  session?: AutoDSSession
  error?: string
  requires2FA?: boolean
}

// AutoDS URLs
const AUTODS_URLS = {
  base: 'https://platform.autods.com',
  login: 'https://platform.autods.com/login',
  dashboard: 'https://platform.autods.com/dashboard',
  products: 'https://platform.autods.com/products',
  drafts: 'https://platform.autods.com/drafts',
  orders: 'https://platform.autods.com/orders',
  stores: 'https://platform.autods.com/stores',
}

// Session cache
const sessionCache = new Map<string, AutoDSSession>()

/**
 * Login to AutoDS
 */
export async function loginToAutoDS(
  credentials?: AutoDSCredentials
): Promise<LoginResult> {
  const email = credentials?.email || process.env.AUTODS_EMAIL
  const password = credentials?.password || process.env.AUTODS_PASSWORD

  if (!email || !password) {
    return {
      success: false,
      error: 'AutoDS credentials not provided. Set AUTODS_EMAIL and AUTODS_PASSWORD.',
    }
  }

  const pool = getBrowserPool()
  let page: Page | null = null

  try {
    console.log('[AutoDS] Starting login process...')

    // Get a browser page
    page = await pool.acquirePage()

    // Set a realistic viewport
    await page.setViewport({ width: 1920, height: 1080 })

    // Navigate to login page
    await page.goto(AUTODS_URLS.login, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Wait for login form
    await page.waitForSelector('input[type="email"], input[name="email"]', {
      timeout: 10000,
    })

    console.log('[AutoDS] Login page loaded, entering credentials...')

    // Enter email
    const emailSelector = 'input[type="email"], input[name="email"]'
    await page.click(emailSelector)
    await page.type(emailSelector, email, { delay: 50 })

    // Enter password
    const passwordSelector = 'input[type="password"], input[name="password"]'
    await page.click(passwordSelector)
    await page.type(passwordSelector, password, { delay: 50 })

    // Click login button
    const loginButtonSelector = 'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")'
    await page.click(loginButtonSelector)

    // Wait for navigation or error
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
        page.waitForSelector('.error-message, .alert-error, [class*="error"]', { timeout: 15000 }),
      ])
    } catch {
      // Navigation might have already happened
    }

    // Check if we're on the dashboard
    const currentUrl = page.url()

    if (currentUrl.includes('/dashboard') || currentUrl.includes('/products')) {
      console.log('[AutoDS] Login successful!')

      // Extract session data
      const cookies = await page.cookies()
      const localStorage = await page.evaluate(() => {
        const items: Record<string, string> = {}
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)
          if (key) {
            items[key] = window.localStorage.getItem(key) || ''
          }
        }
        return items
      })

      const userAgent = await page.evaluate(() => navigator.userAgent)

      const session: AutoDSSession = {
        id: `autods_${Date.now()}`,
        cookies,
        localStorage,
        userAgent,
        isValid: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        lastUsed: new Date(),
      }

      // Cache the session
      sessionCache.set(email, session)

      // Store in database for persistence
      await storeSession(email, session)

      return { success: true, session }
    }

    // Check for 2FA
    const has2FA = await page.$('input[name="code"], input[name="otp"], [class*="2fa"]')
    if (has2FA) {
      console.log('[AutoDS] 2FA required')
      return {
        success: false,
        requires2FA: true,
        error: '2FA verification required. Please disable 2FA or handle manually.',
      }
    }

    // Check for error message
    const errorElement = await page.$('.error-message, .alert-error, [class*="error"]')
    if (errorElement) {
      const errorText = await page.evaluate(el => el?.textContent || '', errorElement)
      return {
        success: false,
        error: `Login failed: ${errorText.trim()}`,
      }
    }

    return {
      success: false,
      error: 'Login failed - unable to reach dashboard',
    }
  } catch (error) {
    console.error('[AutoDS] Login error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown login error',
    }
  } finally {
    if (page) {
      await pool.releasePage(page)
    }
  }
}

/**
 * Get or create a valid session
 */
export async function getAutoDBSession(
  credentials?: AutoDSCredentials
): Promise<AutoDSSession | null> {
  const email = credentials?.email || process.env.AUTODS_EMAIL

  if (!email) {
    console.error('[AutoDS] No email provided')
    return null
  }

  // Check cache first
  const cached = sessionCache.get(email)
  if (cached && isSessionValid(cached)) {
    cached.lastUsed = new Date()
    return cached
  }

  // Try to load from database
  const stored = await loadSession(email)
  if (stored && isSessionValid(stored)) {
    sessionCache.set(email, stored)
    stored.lastUsed = new Date()
    return stored
  }

  // Need to login
  const result = await loginToAutoDS(credentials)
  if (result.success && result.session) {
    return result.session
  }

  return null
}

/**
 * Check if session is still valid
 */
function isSessionValid(session: AutoDSSession): boolean {
  if (!session.isValid) return false
  if (new Date() >= session.expiresAt) return false
  return true
}

/**
 * Apply session to a page
 */
export async function applySessionToPage(
  page: Page,
  session: AutoDSSession
): Promise<void> {
  // Set cookies
  await page.setCookie(...session.cookies)

  // Set localStorage
  await page.evaluateOnNewDocument((storage) => {
    for (const [key, value] of Object.entries(storage)) {
      localStorage.setItem(key, value)
    }
  }, session.localStorage)
}

/**
 * Verify session is still valid by checking dashboard access
 */
export async function verifySession(session: AutoDSSession): Promise<boolean> {
  const pool = getBrowserPool()
  let page: Page | null = null

  try {
    page = await pool.acquirePage()

    // Apply session
    await applySessionToPage(page, session)

    // Try to access dashboard
    await page.goto(AUTODS_URLS.dashboard, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    })

    const url = page.url()

    // If redirected to login, session is invalid
    if (url.includes('/login')) {
      session.isValid = false
      return false
    }

    // Session is valid
    session.lastUsed = new Date()
    return true
  } catch (error) {
    console.error('[AutoDS] Session verification error:', error)
    return false
  } finally {
    if (page) {
      await pool.releasePage(page)
    }
  }
}

/**
 * Refresh session if needed
 */
export async function refreshSession(
  credentials?: AutoDSCredentials
): Promise<AutoDSSession | null> {
  const email = credentials?.email || process.env.AUTODS_EMAIL
  if (!email) return null

  // Clear cached session
  sessionCache.delete(email)

  // Clear stored session
  await clearStoredSession(email)

  // Login fresh
  const result = await loginToAutoDS(credentials)
  return result.success ? result.session || null : null
}

/**
 * Store session in database
 */
async function storeSession(email: string, session: AutoDSSession): Promise<void> {
  try {
    await supabase
      .from('autods_sessions')
      .upsert({
        email,
        session_id: session.id,
        cookies: session.cookies,
        local_storage: session.localStorage,
        user_agent: session.userAgent,
        is_valid: session.isValid,
        expires_at: session.expiresAt.toISOString(),
        last_used: session.lastUsed.toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'email',
      })
  } catch (error) {
    console.error('[AutoDS] Failed to store session:', error)
  }
}

/**
 * Load session from database
 */
async function loadSession(email: string): Promise<AutoDSSession | null> {
  try {
    const { data, error } = await supabase
      .from('autods_sessions')
      .select('*')
      .eq('email', email)
      .single()

    if (error || !data) return null

    return {
      id: data.session_id,
      cookies: data.cookies,
      localStorage: data.local_storage,
      userAgent: data.user_agent,
      isValid: data.is_valid,
      expiresAt: new Date(data.expires_at),
      lastUsed: new Date(data.last_used),
    }
  } catch {
    return null
  }
}

/**
 * Clear stored session
 */
async function clearStoredSession(email: string): Promise<void> {
  try {
    await supabase
      .from('autods_sessions')
      .delete()
      .eq('email', email)
  } catch (error) {
    console.error('[AutoDS] Failed to clear session:', error)
  }
}

/**
 * Invalidate all sessions (for security)
 */
export async function invalidateAllSessions(): Promise<void> {
  sessionCache.clear()

  try {
    await supabase
      .from('autods_sessions')
      .update({ is_valid: false })
      .neq('id', '')
  } catch (error) {
    console.error('[AutoDS] Failed to invalidate sessions:', error)
  }
}

/**
 * Get session status
 */
export async function getSessionStatus(email?: string): Promise<{
  hasSession: boolean
  isValid: boolean
  expiresAt?: Date
  lastUsed?: Date
}> {
  const targetEmail = email || process.env.AUTODS_EMAIL
  if (!targetEmail) {
    return { hasSession: false, isValid: false }
  }

  const session = sessionCache.get(targetEmail) || await loadSession(targetEmail)

  if (!session) {
    return { hasSession: false, isValid: false }
  }

  return {
    hasSession: true,
    isValid: isSessionValid(session),
    expiresAt: session.expiresAt,
    lastUsed: session.lastUsed,
  }
}

export { AUTODS_URLS }
