import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildBrowserlessUrl, BrowserlessPool } from '@/lib/automation/browserless'

describe('Browserless Integration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('buildBrowserlessUrl', () => {
    it('should use BROWSER_WS_ENDPOINT if provided', () => {
      process.env.BROWSER_WS_ENDPOINT = 'wss://custom.endpoint.io?token=abc'
      const url = buildBrowserlessUrl()
      expect(url).toBe('wss://custom.endpoint.io?token=abc')
    })

    it('should build URL from token', () => {
      delete process.env.BROWSER_WS_ENDPOINT
      process.env.BROWSERLESS_TOKEN = 'test-token'

      const url = buildBrowserlessUrl()
      expect(url).toContain('wss://chrome.browserless.io')
      expect(url).toContain('token=test-token')
    })

    it('should use custom URL if provided', () => {
      delete process.env.BROWSER_WS_ENDPOINT
      process.env.BROWSERLESS_TOKEN = 'test-token'
      process.env.BROWSERLESS_URL = 'custom.browserless.io'

      const url = buildBrowserlessUrl()
      expect(url).toContain('wss://custom.browserless.io')
    })

    it('should include optional parameters', () => {
      delete process.env.BROWSER_WS_ENDPOINT
      const url = buildBrowserlessUrl({
        token: 'test-token',
        timeout: 30000,
        headless: true,
        blockAds: true,
        stealth: true,
      })

      expect(url).toContain('timeout=30000')
      expect(url).toContain('headless=true')
      expect(url).toContain('blockAds=true')
      expect(url).toContain('stealth=true')
    })

    it('should throw error when no token or endpoint provided', () => {
      delete process.env.BROWSER_WS_ENDPOINT
      delete process.env.BROWSERLESS_TOKEN

      expect(() => buildBrowserlessUrl()).toThrow(
        'BROWSERLESS_TOKEN or BROWSER_WS_ENDPOINT is required'
      )
    })
  })

  describe('BrowserlessPool', () => {
    it('should track pool stats correctly', () => {
      const pool = new BrowserlessPool({ token: 'test' }, 3)
      const stats = pool.getStats()

      expect(stats.activeSessions).toBe(0)
      expect(stats.maxSessions).toBe(3)
      expect(stats.oldestSession).toBeUndefined()
    })

    it('should respect max sessions limit', () => {
      const pool = new BrowserlessPool({ token: 'test' }, 2)
      expect(pool.getStats().maxSessions).toBe(2)
    })
  })
})
