/**
 * Caching Service
 *
 * Provides in-memory caching with:
 * - TTL-based expiration
 * - LRU eviction
 * - Cache invalidation patterns
 * - Stale-while-revalidate support
 */

export interface CacheConfig {
  maxSize?: number        // Max entries
  defaultTtl?: number     // Default TTL in ms
  staleWhileRevalidate?: boolean
}

export interface CacheEntry<T> {
  value: T
  expiresAt: number
  staleAt?: number
  createdAt: number
  accessCount: number
  lastAccessed: number
  tags?: string[]
}

export interface CacheStats {
  size: number
  hits: number
  misses: number
  hitRate: number
  evictions: number
  invalidations: number
}

// Default cache configuration
const DEFAULT_CONFIG: Required<CacheConfig> = {
  maxSize: 1000,
  defaultTtl: 5 * 60 * 1000, // 5 minutes
  staleWhileRevalidate: true,
}

// In-memory cache store
const cacheStore = new Map<string, CacheEntry<any>>()
let cacheHits = 0
let cacheMisses = 0
let cacheEvictions = 0
let cacheInvalidations = 0

// LRU tracking
const accessOrder: string[] = []

/**
 * Get value from cache
 */
export function cacheGet<T>(key: string): T | null {
  const entry = cacheStore.get(key)

  if (!entry) {
    cacheMisses++
    return null
  }

  const now = Date.now()

  // Check if expired
  if (now >= entry.expiresAt) {
    // If stale-while-revalidate, return stale value
    if (entry.staleAt && now < entry.staleAt) {
      cacheHits++
      updateAccessOrder(key)
      entry.accessCount++
      entry.lastAccessed = now
      return entry.value
    }

    // Fully expired
    cacheStore.delete(key)
    cacheMisses++
    return null
  }

  cacheHits++
  updateAccessOrder(key)
  entry.accessCount++
  entry.lastAccessed = now
  return entry.value
}

/**
 * Set value in cache
 */
export function cacheSet<T>(
  key: string,
  value: T,
  options: {
    ttl?: number
    tags?: string[]
    staleTime?: number
  } = {}
): void {
  const now = Date.now()
  const { ttl = DEFAULT_CONFIG.defaultTtl, tags, staleTime } = options

  // Evict if at max size
  while (cacheStore.size >= DEFAULT_CONFIG.maxSize) {
    evictLRU()
  }

  const entry: CacheEntry<T> = {
    value,
    expiresAt: now + ttl,
    staleAt: staleTime ? now + ttl + staleTime : undefined,
    createdAt: now,
    accessCount: 1,
    lastAccessed: now,
    tags,
  }

  cacheStore.set(key, entry)
  updateAccessOrder(key)
}

/**
 * Delete value from cache
 */
export function cacheDelete(key: string): boolean {
  const existed = cacheStore.delete(key)
  if (existed) {
    cacheInvalidations++
    removeFromAccessOrder(key)
  }
  return existed
}

/**
 * Check if key exists in cache
 */
export function cacheHas(key: string): boolean {
  const entry = cacheStore.get(key)
  if (!entry) return false
  return Date.now() < entry.expiresAt
}

/**
 * Invalidate by pattern (glob-like)
 */
export function cacheInvalidatePattern(pattern: string): number {
  const regex = patternToRegex(pattern)
  let count = 0

  for (const key of cacheStore.keys()) {
    if (regex.test(key)) {
      cacheStore.delete(key)
      removeFromAccessOrder(key)
      count++
    }
  }

  cacheInvalidations += count
  return count
}

/**
 * Invalidate by tags
 */
export function cacheInvalidateByTags(tags: string[]): number {
  let count = 0

  for (const [key, entry] of cacheStore.entries()) {
    if (entry.tags && entry.tags.some(t => tags.includes(t))) {
      cacheStore.delete(key)
      removeFromAccessOrder(key)
      count++
    }
  }

  cacheInvalidations += count
  return count
}

/**
 * Get or set pattern (cache-aside)
 */
export async function cacheGetOrSet<T>(
  key: string,
  factory: () => Promise<T>,
  options: {
    ttl?: number
    tags?: string[]
    staleTime?: number
    forceRefresh?: boolean
  } = {}
): Promise<T> {
  // Check cache first unless forcing refresh
  if (!options.forceRefresh) {
    const cached = cacheGet<T>(key)
    if (cached !== null) {
      return cached
    }
  }

  // Generate value
  const value = await factory()

  // Cache it
  cacheSet(key, value, {
    ttl: options.ttl,
    tags: options.tags,
    staleTime: options.staleTime,
  })

  return value
}

/**
 * Wrap a function with caching
 */
export function withCache<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    keyGenerator: (...args: Parameters<T>) => string
    ttl?: number
    tags?: string[]
  }
): T {
  const { keyGenerator, ttl, tags } = options

  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const key = keyGenerator(...args)

    const cached = cacheGet<ReturnType<T>>(key)
    if (cached !== null) {
      return cached
    }

    const result = await fn(...args)
    cacheSet(key, result, { ttl, tags })
    return result
  }) as T
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  const total = cacheHits + cacheMisses
  return {
    size: cacheStore.size,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? (cacheHits / total) * 100 : 0,
    evictions: cacheEvictions,
    invalidations: cacheInvalidations,
  }
}

/**
 * Clear entire cache
 */
export function cacheClear(): void {
  cacheStore.clear()
  accessOrder.length = 0
}

/**
 * Reset cache stats
 */
export function resetCacheStats(): void {
  cacheHits = 0
  cacheMisses = 0
  cacheEvictions = 0
  cacheInvalidations = 0
}

/**
 * Get all cache keys
 */
export function getCacheKeys(): string[] {
  return Array.from(cacheStore.keys())
}

/**
 * Get cache entry metadata
 */
export function getCacheEntryInfo(key: string): Omit<CacheEntry<any>, 'value'> | null {
  const entry = cacheStore.get(key)
  if (!entry) return null

  return {
    expiresAt: entry.expiresAt,
    staleAt: entry.staleAt,
    createdAt: entry.createdAt,
    accessCount: entry.accessCount,
    lastAccessed: entry.lastAccessed,
    tags: entry.tags,
  }
}

// --- Internal helpers ---

function updateAccessOrder(key: string): void {
  const index = accessOrder.indexOf(key)
  if (index > -1) {
    accessOrder.splice(index, 1)
  }
  accessOrder.push(key)
}

function removeFromAccessOrder(key: string): void {
  const index = accessOrder.indexOf(key)
  if (index > -1) {
    accessOrder.splice(index, 1)
  }
}

function evictLRU(): void {
  if (accessOrder.length === 0) return

  const keyToEvict = accessOrder.shift()
  if (keyToEvict) {
    cacheStore.delete(keyToEvict)
    cacheEvictions++
  }
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

// Clean up expired entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of cacheStore.entries()) {
      // Remove if past stale time or no stale time and expired
      if (entry.staleAt ? now >= entry.staleAt : now >= entry.expiresAt) {
        cacheStore.delete(key)
        removeFromAccessOrder(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[Cache] Cleaned up ${cleaned} expired entries`)
    }
  }, 60 * 1000) // Every minute
}

// --- Pre-built cache keys for common operations ---

export const CACHE_KEYS = {
  // Dashboard stats
  dashboardStats: (storeId?: string) =>
    storeId ? `dashboard:stats:${storeId}` : 'dashboard:stats:global',

  // SKU data
  sku: (skuId: string) => `sku:${skuId}`,
  skuList: (page: number, limit: number) => `skus:list:${page}:${limit}`,

  // Store data
  store: (storeId: string) => `store:${storeId}`,
  storeList: () => 'stores:list',

  // Analytics
  analytics: (type: string, period: string, storeId?: string) =>
    `analytics:${type}:${period}:${storeId || 'all'}`,

  // Repricing
  repricingRules: () => 'repricing:rules',
  competitorData: (sku: string) => `competitors:${sku}`,

  // Patterns
  patterns: () => 'patterns:list',
  pattern: (patternId: string) => `pattern:${patternId}`,
}

// --- Pre-built cache tags ---

export const CACHE_TAGS = {
  SKUS: 'skus',
  STORES: 'stores',
  ANALYTICS: 'analytics',
  REPRICING: 'repricing',
  PATTERNS: 'patterns',
  DASHBOARD: 'dashboard',
}
