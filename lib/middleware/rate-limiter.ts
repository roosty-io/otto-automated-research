/**
 * Rate Limiting Service
 *
 * Provides API rate limiting using a sliding window algorithm:
 * - Per-IP rate limiting
 * - Per-user rate limiting
 * - Per-endpoint rate limiting
 * - Configurable limits and windows
 */

export interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Max requests per window
  keyPrefix?: string    // Prefix for storage keys
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetTime: number
  retryAfter?: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Default configurations for different tiers
export const RATE_LIMIT_TIERS = {
  free: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  basic: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
  pro: {
    windowMs: 60 * 1000,
    maxRequests: 300,
  },
  enterprise: {
    windowMs: 60 * 1000,
    maxRequests: 1000,
  },
} as const

// Endpoint-specific limits
export const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  '/api/research': {
    windowMs: 60 * 1000,
    maxRequests: 10, // Research is expensive
  },
  '/api/automation': {
    windowMs: 60 * 1000,
    maxRequests: 5, // Automation is very expensive
  },
  '/api/export': {
    windowMs: 60 * 1000,
    maxRequests: 3, // Export is resource intensive
  },
  '/api/seed': {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 1, // Seeding should be rare
  },
  default: {
    windowMs: 60 * 1000,
    maxRequests: 60,
  },
}

/**
 * Check rate limit for a key
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = ENDPOINT_LIMITS.default
): RateLimitResult {
  const now = Date.now()
  const fullKey = `${config.keyPrefix || 'rl'}:${key}`

  // Get or create entry
  let entry = rateLimitStore.get(fullKey)

  // Reset if window has passed
  if (!entry || now >= entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    }
  }

  // Check if over limit
  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return {
      success: false,
      remaining: 0,
      resetTime: entry.resetAt,
      retryAfter,
    }
  }

  // Increment and save
  entry.count++
  rateLimitStore.set(fullKey, entry)

  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetAt,
  }
}

/**
 * Create rate limiter middleware config
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const finalConfig: RateLimitConfig = {
    windowMs: config.windowMs || 60 * 1000,
    maxRequests: config.maxRequests || 60,
    keyPrefix: config.keyPrefix || 'rl',
    skipSuccessfulRequests: config.skipSuccessfulRequests || false,
    skipFailedRequests: config.skipFailedRequests || false,
  }

  return {
    check: (key: string) => checkRateLimit(key, finalConfig),
    config: finalConfig,
  }
}

/**
 * Get rate limit headers
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000)),
  }

  if (!result.success && result.retryAfter) {
    headers['Retry-After'] = String(result.retryAfter)
  }

  return headers
}

/**
 * Get rate limit key from request
 */
export function getRateLimitKey(
  request: Request,
  options: { byIp?: boolean; byUser?: boolean; byEndpoint?: boolean } = {}
): string {
  const { byIp = true, byUser = true, byEndpoint = true } = options

  const parts: string[] = []

  // Get IP (from headers in production)
  if (byIp) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    parts.push(ip)
  }

  // Get user ID if available
  if (byUser) {
    const userId = request.headers.get('x-user-id') || 'anonymous'
    parts.push(userId)
  }

  // Get endpoint
  if (byEndpoint) {
    const url = new URL(request.url)
    parts.push(url.pathname)
  }

  return parts.join(':')
}

/**
 * Get config for specific endpoint
 */
export function getEndpointConfig(pathname: string): RateLimitConfig {
  // Check for exact match
  if (ENDPOINT_LIMITS[pathname]) {
    return ENDPOINT_LIMITS[pathname]
  }

  // Check for prefix match
  for (const [prefix, config] of Object.entries(ENDPOINT_LIMITS)) {
    if (prefix !== 'default' && pathname.startsWith(prefix)) {
      return config
    }
  }

  return ENDPOINT_LIMITS.default
}

/**
 * Clean up expired entries (call periodically)
 */
export function cleanupExpiredEntries(): number {
  const now = Date.now()
  let cleaned = 0

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key)
      cleaned++
    }
  }

  return cleaned
}

/**
 * Get current store size (for monitoring)
 */
export function getStoreSize(): number {
  return rateLimitStore.size
}

/**
 * Reset all rate limits (for testing)
 */
export function resetAllLimits(): void {
  rateLimitStore.clear()
}

/**
 * Get rate limit stats
 */
export function getRateLimitStats(): {
  totalEntries: number
  activeEntries: number
  topKeys: Array<{ key: string; count: number }>
} {
  const now = Date.now()
  let activeCount = 0
  const keyStats: Array<{ key: string; count: number }> = []

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now < entry.resetAt) {
      activeCount++
      keyStats.push({ key, count: entry.count })
    }
  }

  // Sort by count descending
  keyStats.sort((a, b) => b.count - a.count)

  return {
    totalEntries: rateLimitStore.size,
    activeEntries: activeCount,
    topKeys: keyStats.slice(0, 10),
  }
}

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cleaned = cleanupExpiredEntries()
    if (cleaned > 0) {
      console.log(`[RateLimiter] Cleaned up ${cleaned} expired entries`)
    }
  }, 5 * 60 * 1000)
}
