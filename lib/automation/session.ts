import type { Page, Cookie, Protocol } from 'puppeteer-core'
import { supabase } from '@/lib/supabase'

// Session types
export interface StoredSession {
  id: string
  service: 'zik' | 'autods' | 'ebay' | 'amazon'
  cookies: Cookie[]
  localStorage?: Record<string, string>
  sessionStorage?: Record<string, string>
  userAgent?: string
  createdAt: string
  updatedAt: string
  expiresAt?: string
  isValid: boolean
  metadata?: Record<string, unknown>
}

interface SessionCreateInput {
  service: StoredSession['service']
  cookies: Cookie[]
  localStorage?: Record<string, string>
  sessionStorage?: Record<string, string>
  userAgent?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}

// Cookie utilities
export function serializeCookies(cookies: Cookie[]): string {
  return JSON.stringify(cookies)
}

export function deserializeCookies(serialized: string): Cookie[] {
  try {
    return JSON.parse(serialized)
  } catch {
    return []
  }
}

// Check if cookies are expired
export function areCookiesExpired(cookies: Cookie[]): boolean {
  const now = Date.now() / 1000 // Convert to seconds
  return cookies.some((cookie) => {
    if (cookie.expires && cookie.expires !== -1) {
      return cookie.expires < now
    }
    return false
  })
}

// Session manager class
class SessionManager {
  private tableName = 'automation_sessions'

  // Save session to database
  async saveSession(input: SessionCreateInput): Promise<StoredSession> {
    const now = new Date().toISOString()
    const id = `${input.service}_${Date.now()}`

    const sessionData = {
      id,
      service: input.service,
      cookies: serializeCookies(input.cookies),
      local_storage: input.localStorage ? JSON.stringify(input.localStorage) : null,
      session_storage: input.sessionStorage ? JSON.stringify(input.sessionStorage) : null,
      user_agent: input.userAgent,
      created_at: now,
      updated_at: now,
      expires_at: input.expiresAt,
      is_valid: true,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    }

    // Try to update existing session for this service, or insert new
    const { data: existing } = await supabase
      .from(this.tableName)
      .select('id')
      .eq('service', input.service)
      .eq('is_valid', true)
      .single()

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from(this.tableName)
        .update({
          cookies: sessionData.cookies,
          local_storage: sessionData.local_storage,
          session_storage: sessionData.session_storage,
          user_agent: sessionData.user_agent,
          updated_at: now,
          expires_at: sessionData.expires_at,
          metadata: sessionData.metadata,
        })
        .eq('id', existing.id)

      if (error) {
        console.error('[SessionManager] Error updating session:', error)
        throw error
      }

      return this.getSession(input.service) as Promise<StoredSession>
    }

    // Insert new
    const { error } = await supabase.from(this.tableName).insert(sessionData)

    if (error) {
      console.error('[SessionManager] Error saving session:', error)
      throw error
    }

    return {
      id,
      service: input.service,
      cookies: input.cookies,
      localStorage: input.localStorage,
      sessionStorage: input.sessionStorage,
      userAgent: input.userAgent,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      isValid: true,
      metadata: input.metadata,
    }
  }

  // Get session from database
  async getSession(service: StoredSession['service']): Promise<StoredSession | null> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('service', service)
      .eq('is_valid', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    const cookies = deserializeCookies(data.cookies)

    // Check if session is expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      await this.invalidateSession(service)
      return null
    }

    // Check if cookies are expired
    if (areCookiesExpired(cookies)) {
      await this.invalidateSession(service)
      return null
    }

    return {
      id: data.id,
      service: data.service,
      cookies,
      localStorage: data.local_storage ? JSON.parse(data.local_storage) : undefined,
      sessionStorage: data.session_storage ? JSON.parse(data.session_storage) : undefined,
      userAgent: data.user_agent,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      expiresAt: data.expires_at,
      isValid: data.is_valid,
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
    }
  }

  // Invalidate session
  async invalidateSession(service: StoredSession['service']): Promise<void> {
    const { error } = await supabase
      .from(this.tableName)
      .update({ is_valid: false, updated_at: new Date().toISOString() })
      .eq('service', service)
      .eq('is_valid', true)

    if (error) {
      console.error('[SessionManager] Error invalidating session:', error)
    }
  }

  // Check if valid session exists
  async hasValidSession(service: StoredSession['service']): Promise<boolean> {
    const session = await this.getSession(service)
    return session !== null
  }

  // Apply session to page
  async applyToPage(page: Page, service: StoredSession['service']): Promise<boolean> {
    const session = await this.getSession(service)
    if (!session) {
      return false
    }

    try {
      // Set cookies
      if (session.cookies.length > 0) {
        await page.setCookie(...session.cookies)
      }

      // Set user agent if stored
      if (session.userAgent) {
        await page.setUserAgent(session.userAgent)
      }

      // Set localStorage and sessionStorage via page.evaluate
      if (session.localStorage || session.sessionStorage) {
        await page.evaluateOnNewDocument(
          (localStorage, sessionStorage) => {
            if (localStorage) {
              for (const [key, value] of Object.entries(localStorage)) {
                window.localStorage.setItem(key, value)
              }
            }
            if (sessionStorage) {
              for (const [key, value] of Object.entries(sessionStorage)) {
                window.sessionStorage.setItem(key, value)
              }
            }
          },
          session.localStorage || {},
          session.sessionStorage || {}
        )
      }

      console.log(`[SessionManager] Applied session for ${service}`)
      return true
    } catch (error) {
      console.error(`[SessionManager] Error applying session for ${service}:`, error)
      return false
    }
  }

  // Capture session from page
  async captureFromPage(
    page: Page,
    service: StoredSession['service'],
    options: {
      includeLocalStorage?: boolean
      includeSessionStorage?: boolean
      expiresInHours?: number
      metadata?: Record<string, unknown>
    } = {}
  ): Promise<StoredSession> {
    // Get cookies
    const cookies = await page.cookies()

    // Get localStorage and sessionStorage if requested
    let localStorage: Record<string, string> | undefined
    let sessionStorage: Record<string, string> | undefined

    if (options.includeLocalStorage || options.includeSessionStorage) {
      const storageData = await page.evaluate(
        (getLocal, getSession) => {
          const result: {
            localStorage?: Record<string, string>
            sessionStorage?: Record<string, string>
          } = {}

          if (getLocal) {
            result.localStorage = {}
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i)
              if (key) {
                result.localStorage[key] = window.localStorage.getItem(key) || ''
              }
            }
          }

          if (getSession) {
            result.sessionStorage = {}
            for (let i = 0; i < window.sessionStorage.length; i++) {
              const key = window.sessionStorage.key(i)
              if (key) {
                result.sessionStorage[key] = window.sessionStorage.getItem(key) || ''
              }
            }
          }

          return result
        },
        options.includeLocalStorage ?? false,
        options.includeSessionStorage ?? false
      )

      localStorage = storageData.localStorage
      sessionStorage = storageData.sessionStorage
    }

    // Calculate expiration
    let expiresAt: string | undefined
    if (options.expiresInHours) {
      const expires = new Date()
      expires.setHours(expires.getHours() + options.expiresInHours)
      expiresAt = expires.toISOString()
    }

    // Save session
    return this.saveSession({
      service,
      cookies,
      localStorage,
      sessionStorage,
      userAgent: await page.evaluate(() => navigator.userAgent),
      expiresAt,
      metadata: options.metadata,
    })
  }
}

// Singleton instance
let sessionManagerInstance: SessionManager | null = null

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager()
  }
  return sessionManagerInstance
}

// Convenience exports
export const sessionManager = {
  save: (input: SessionCreateInput) => getSessionManager().saveSession(input),
  get: (service: StoredSession['service']) => getSessionManager().getSession(service),
  invalidate: (service: StoredSession['service']) => getSessionManager().invalidateSession(service),
  hasValid: (service: StoredSession['service']) => getSessionManager().hasValidSession(service),
  applyToPage: (page: Page, service: StoredSession['service']) =>
    getSessionManager().applyToPage(page, service),
  captureFromPage: (
    page: Page,
    service: StoredSession['service'],
    options?: Parameters<SessionManager['captureFromPage']>[2]
  ) => getSessionManager().captureFromPage(page, service, options),
}
