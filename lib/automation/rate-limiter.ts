/**
 * Rate Limiter for Automation Tasks
 *
 * Prevents hitting API/service rate limits by throttling requests.
 * Stores rate limit state in database for persistence across restarts.
 */

import { supabase } from '@/lib/supabase'

export interface RateLimitConfig {
  service: string
  action: string
  maxRequests: number
  windowSeconds: number
}

export interface RateLimitStatus {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfterMs: number | null
}

// Default rate limits
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // ZIK Analytics limits
  zik_search: {
    service: 'zik',
    action: 'search',
    maxRequests: 60,
    windowSeconds: 3600, // 60 per hour
  },
  zik_category: {
    service: 'zik',
    action: 'category',
    maxRequests: 30,
    windowSeconds: 3600, // 30 per hour
  },
  zik_login: {
    service: 'zik',
    action: 'login',
    maxRequests: 5,
    windowSeconds: 300, // 5 per 5 minutes
  },

  // AutoDS limits
  autods_upload: {
    service: 'autods',
    action: 'upload',
    maxRequests: 50,
    windowSeconds: 3600, // 50 per hour
  },
  autods_publish: {
    service: 'autods',
    action: 'publish',
    maxRequests: 100,
    windowSeconds: 3600, // 100 per hour
  },
  autods_sync: {
    service: 'autods',
    action: 'sync',
    maxRequests: 30,
    windowSeconds: 3600, // 30 per hour
  },

  // Keepa limits (based on tokens, but we track calls too)
  keepa_lookup: {
    service: 'keepa',
    action: 'lookup',
    maxRequests: 100,
    windowSeconds: 3600, // 100 per hour
  },
  keepa_bestsellers: {
    service: 'keepa',
    action: 'bestsellers',
    maxRequests: 50,
    windowSeconds: 3600, // 50 per hour
  },
}

class RateLimiter {
  private memoryCache: Map<string, { count: number; windowStart: number }> = new Map()

  /**
   * Check if a request is allowed under rate limits
   */
  async checkLimit(service: string, action: string): Promise<RateLimitStatus> {
    const key = `${service}_${action}`
    const config = RATE_LIMITS[key]

    if (!config) {
      // No limit configured, always allow
      return {
        allowed: true,
        remaining: Infinity,
        resetAt: new Date(),
        retryAfterMs: null,
      }
    }

    const now = Date.now()
    const windowStart = Math.floor(now / (config.windowSeconds * 1000)) * (config.windowSeconds * 1000)
    const windowEnd = windowStart + config.windowSeconds * 1000

    // Try memory cache first
    const cacheKey = `${key}_${windowStart}`
    let cached = this.memoryCache.get(cacheKey)

    if (!cached) {
      // Try database
      const { data } = await supabase
        .from('automation_rate_limits')
        .select('request_count')
        .eq('service', service)
        .eq('action', action)
        .eq('window_start', new Date(windowStart).toISOString())
        .single()

      cached = {
        count: data?.request_count || 0,
        windowStart,
      }
      this.memoryCache.set(cacheKey, cached)
    }

    const remaining = config.maxRequests - cached.count
    const allowed = remaining > 0

    return {
      allowed,
      remaining: Math.max(0, remaining),
      resetAt: new Date(windowEnd),
      retryAfterMs: allowed ? null : windowEnd - now,
    }
  }

  /**
   * Record a request (call after successful request)
   */
  async recordRequest(service: string, action: string): Promise<void> {
    const key = `${service}_${action}`
    const config = RATE_LIMITS[key]

    if (!config) return

    const now = Date.now()
    const windowStart = Math.floor(now / (config.windowSeconds * 1000)) * (config.windowSeconds * 1000)
    const windowStartISO = new Date(windowStart).toISOString()

    // Update memory cache
    const cacheKey = `${key}_${windowStart}`
    const cached = this.memoryCache.get(cacheKey) || { count: 0, windowStart }
    cached.count++
    this.memoryCache.set(cacheKey, cached)

    // Update database (upsert)
    await supabase
      .from('automation_rate_limits')
      .upsert(
        {
          service,
          action,
          window_start: windowStartISO,
          request_count: cached.count,
          max_requests: config.maxRequests,
          window_seconds: config.windowSeconds,
        },
        {
          onConflict: 'service,action,window_start',
        }
      )
  }

  /**
   * Wait until rate limit allows a request
   */
  async waitForLimit(
    service: string,
    action: string,
    options: { maxWaitMs?: number; checkIntervalMs?: number } = {}
  ): Promise<boolean> {
    const { maxWaitMs = 60000, checkIntervalMs = 1000 } = options
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.checkLimit(service, action)

      if (status.allowed) {
        return true
      }

      if (status.retryAfterMs && status.retryAfterMs > maxWaitMs - (Date.now() - startTime)) {
        return false // Would exceed max wait
      }

      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs))
    }

    return false
  }

  /**
   * Execute a function with rate limiting
   */
  async withRateLimit<T>(
    service: string,
    action: string,
    fn: () => Promise<T>,
    options: { waitForLimit?: boolean; maxWaitMs?: number } = {}
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const { waitForLimit = true, maxWaitMs = 60000 } = options

    // Check limit
    const status = await this.checkLimit(service, action)

    if (!status.allowed) {
      if (waitForLimit) {
        const canProceed = await this.waitForLimit(service, action, { maxWaitMs })
        if (!canProceed) {
          return {
            success: false,
            error: `Rate limit exceeded. Retry after ${status.retryAfterMs}ms`,
          }
        }
      } else {
        return {
          success: false,
          error: `Rate limit exceeded. ${status.remaining} requests remaining. Reset at ${status.resetAt.toISOString()}`,
        }
      }
    }

    try {
      const result = await fn()
      await this.recordRequest(service, action)
      return { success: true, result }
    } catch (error) {
      // Still record the request even if it failed
      await this.recordRequest(service, action)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Get current rate limit status for all services
   */
  async getAllLimitsStatus(): Promise<Record<string, RateLimitStatus>> {
    const status: Record<string, RateLimitStatus> = {}

    for (const [key, config] of Object.entries(RATE_LIMITS)) {
      status[key] = await this.checkLimit(config.service, config.action)
    }

    return status
  }

  /**
   * Clear rate limit cache (for testing)
   */
  clearCache(): void {
    this.memoryCache.clear()
  }

  /**
   * Clean up old rate limit records from database
   */
  async cleanupOldRecords(olderThanHours: number = 24): Promise<number> {
    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - olderThanHours)

    const { data, error } = await supabase
      .from('automation_rate_limits')
      .delete()
      .lt('window_start', cutoff.toISOString())
      .select('id')

    if (error) {
      console.error('[RateLimiter] Cleanup error:', error)
      return 0
    }

    return data?.length || 0
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter()
  }
  return rateLimiterInstance
}

// Convenience wrapper
export const rateLimiter = {
  check: (service: string, action: string) => getRateLimiter().checkLimit(service, action),
  record: (service: string, action: string) => getRateLimiter().recordRequest(service, action),
  wait: (service: string, action: string, options?: Parameters<RateLimiter['waitForLimit']>[2]) =>
    getRateLimiter().waitForLimit(service, action, options),
  withLimit: <T>(
    service: string,
    action: string,
    fn: () => Promise<T>,
    options?: Parameters<RateLimiter['withRateLimit']>[3]
  ) => getRateLimiter().withRateLimit(service, action, fn, options),
  getAllStatus: () => getRateLimiter().getAllLimitsStatus(),
  cleanup: (hours?: number) => getRateLimiter().cleanupOldRecords(hours),
}

export { RateLimiter }
