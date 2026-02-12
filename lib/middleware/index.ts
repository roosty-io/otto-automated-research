/**
 * Middleware Module
 *
 * Rate limiting and caching utilities.
 */

// Rate Limiting
export {
  type RateLimitConfig,
  type RateLimitResult,
  RATE_LIMIT_TIERS,
  ENDPOINT_LIMITS,
  checkRateLimit,
  createRateLimiter,
  getRateLimitHeaders,
  getRateLimitKey,
  getEndpointConfig,
  cleanupExpiredEntries,
  getStoreSize,
  resetAllLimits,
  getRateLimitStats,
} from './rate-limiter'

// Caching
export {
  type CacheConfig,
  type CacheEntry,
  type CacheStats,
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheHas,
  cacheInvalidatePattern,
  cacheInvalidateByTags,
  cacheGetOrSet,
  withCache,
  getCacheStats,
  cacheClear,
  resetCacheStats,
  getCacheKeys,
  getCacheEntryInfo,
  CACHE_KEYS,
  CACHE_TAGS,
} from './cache'
