/**
 * Research Cache System
 *
 * High-performance caching layer for research data to enable 3000+ products/day
 * throughput. Uses tiered caching with in-memory LRU and database persistence.
 *
 * Cache Layers:
 * 1. L1: In-memory LRU cache (fastest, limited size)
 * 2. L2: Database cache table (persistent, larger capacity)
 *
 * Cached Data Types:
 * - ZIK search results (by query hash)
 * - Keepa product data (by ASIN)
 * - Compliance check results (by content hash)
 * - Normalized product data (by raw product ID)
 */

import { supabase } from '@/lib/supabase';
import crypto from 'crypto';

// Cache configuration
export interface CacheConfig {
  // L1 (in-memory) settings
  l1MaxSize: number;           // Max items in memory
  l1TtlMs: number;             // Time-to-live in memory

  // L2 (database) settings
  l2TtlMs: number;             // Time-to-live in database
  l2CleanupIntervalMs: number; // How often to clean expired entries

  // Feature flags
  enableL1: boolean;
  enableL2: boolean;
  enableCompression: boolean;
}

// Default configuration optimized for high throughput
const DEFAULT_CONFIG: CacheConfig = {
  l1MaxSize: 10000,                    // 10k items in memory
  l1TtlMs: 30 * 60 * 1000,             // 30 minutes in memory
  l2TtlMs: 24 * 60 * 60 * 1000,        // 24 hours in database
  l2CleanupIntervalMs: 60 * 60 * 1000, // Cleanup every hour
  enableL1: true,
  enableL2: true,
  enableCompression: false,             // Enable for large payloads
};

// Cache entry structure
interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  size: number;
}

// Cache statistics
export interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  l1Size: number;
  l2Size: number;
  hitRate: number;
  avgLatencyMs: number;
}

/**
 * LRU Cache implementation for L1 (in-memory)
 */
class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    entry.hitCount++;
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
      hitCount: 0,
      size: JSON.stringify(value).length,
    };

    this.cache.set(key, entry);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Cleanup expired entries
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Research Cache Manager
 */
export class ResearchCache {
  private config: CacheConfig;
  private l1Cache: LRUCache<any>;
  private stats: CacheStats;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.l1Cache = new LRUCache(this.config.l1MaxSize, this.config.l1TtlMs);
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      l1Size: 0,
      l2Size: 0,
      hitRate: 0,
      avgLatencyMs: 0,
    };

    // Start cleanup interval
    if (this.config.enableL2) {
      this.startCleanupInterval();
    }
  }

  /**
   * Get from cache (checks L1 then L2)
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    const cacheKey = this.buildKey(namespace, key);
    const startTime = Date.now();

    // Try L1 first
    if (this.config.enableL1) {
      const l1Result = this.l1Cache.get(cacheKey);
      if (l1Result !== null) {
        this.stats.l1Hits++;
        this.updateHitRate();
        return l1Result as T;
      }
      this.stats.l1Misses++;
    }

    // Try L2
    if (this.config.enableL2) {
      const l2Result = await this.getFromL2<T>(cacheKey);
      if (l2Result !== null) {
        this.stats.l2Hits++;
        // Promote to L1
        if (this.config.enableL1) {
          this.l1Cache.set(cacheKey, l2Result);
        }
        this.updateHitRate();
        this.updateLatency(startTime);
        return l2Result;
      }
      this.stats.l2Misses++;
    }

    this.updateHitRate();
    return null;
  }

  /**
   * Set in cache (writes to both L1 and L2)
   */
  async set<T>(namespace: string, key: string, value: T, ttlMs?: number): Promise<void> {
    const cacheKey = this.buildKey(namespace, key);
    const effectiveTtl = ttlMs || this.config.l1TtlMs;

    // Write to L1
    if (this.config.enableL1) {
      this.l1Cache.set(cacheKey, value);
    }

    // Write to L2
    if (this.config.enableL2) {
      await this.setInL2(cacheKey, value, ttlMs || this.config.l2TtlMs);
    }
  }

  /**
   * Delete from cache
   */
  async delete(namespace: string, key: string): Promise<void> {
    const cacheKey = this.buildKey(namespace, key);

    if (this.config.enableL1) {
      this.l1Cache.delete(cacheKey);
    }

    if (this.config.enableL2) {
      await this.deleteFromL2(cacheKey);
    }
  }

  /**
   * Clear entire namespace
   */
  async clearNamespace(namespace: string): Promise<void> {
    // L1 doesn't support namespace clearing efficiently
    // Would need to iterate all keys

    if (this.config.enableL2) {
      await supabase
        .from('research_cache')
        .delete()
        .like('cache_key', `${namespace}:%`);
    }
  }

  /**
   * Get or compute - cache-aside pattern
   */
  async getOrCompute<T>(
    namespace: string,
    key: string,
    computeFn: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(namespace, key);
    if (cached !== null) {
      return cached;
    }

    // Compute value
    const value = await computeFn();

    // Cache result
    await this.set(namespace, key, value, ttlMs);

    return value;
  }

  /**
   * Batch get - optimized for multiple keys
   */
  async batchGet<T>(namespace: string, keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const l2Keys: string[] = [];

    // Check L1 first
    if (this.config.enableL1) {
      for (const key of keys) {
        const cacheKey = this.buildKey(namespace, key);
        const value = this.l1Cache.get(cacheKey);
        if (value !== null) {
          results.set(key, value as T);
          this.stats.l1Hits++;
        } else {
          l2Keys.push(key);
          this.stats.l1Misses++;
        }
      }
    } else {
      l2Keys.push(...keys);
    }

    // Batch fetch from L2
    if (this.config.enableL2 && l2Keys.length > 0) {
      const l2Results = await this.batchGetFromL2<T>(namespace, l2Keys);

      for (const [key, value] of l2Results) {
        results.set(key, value);
        this.stats.l2Hits++;

        // Promote to L1
        if (this.config.enableL1) {
          const cacheKey = this.buildKey(namespace, key);
          this.l1Cache.set(cacheKey, value);
        }
      }

      // Track L2 misses
      for (const key of l2Keys) {
        if (!l2Results.has(key)) {
          this.stats.l2Misses++;
        }
      }
    }

    this.updateHitRate();
    return results;
  }

  /**
   * Batch set - optimized for multiple entries
   */
  async batchSet<T>(namespace: string, entries: Array<{ key: string; value: T; ttlMs?: number }>): Promise<void> {
    // Write to L1
    if (this.config.enableL1) {
      for (const entry of entries) {
        const cacheKey = this.buildKey(namespace, entry.key);
        this.l1Cache.set(cacheKey, entry.value);
      }
    }

    // Batch write to L2
    if (this.config.enableL2) {
      await this.batchSetInL2(namespace, entries);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.stats.l1Size = this.l1Cache.size();
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      l1Size: this.l1Cache.size(),
      l2Size: 0,
      hitRate: 0,
      avgLatencyMs: 0,
    };
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<{ l1Cleaned: number; l2Cleaned: number }> {
    const l1Cleaned = this.l1Cache.cleanup();

    let l2Cleaned = 0;
    if (this.config.enableL2) {
      const { data } = await supabase
        .from('research_cache')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select('id');

      l2Cleaned = data?.length || 0;
    }

    return { l1Cleaned, l2Cleaned };
  }

  /**
   * Shutdown - cleanup intervals
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Private methods

  private buildKey(namespace: string, key: string): string {
    return `${namespace}:${key}`;
  }

  private async getFromL2<T>(cacheKey: string): Promise<T | null> {
    try {
      const { data, error } = await supabase
        .from('research_cache')
        .select('value, expires_at')
        .eq('cache_key', cacheKey)
        .single();

      if (error || !data) return null;

      // Check expiration
      if (new Date(data.expires_at) < new Date()) {
        // Async delete expired entry
        supabase.from('research_cache').delete().eq('cache_key', cacheKey);
        return null;
      }

      return data.value as T;
    } catch {
      return null;
    }
  }

  private async setInL2<T>(cacheKey: string, value: T, ttlMs: number): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();

      await supabase
        .from('research_cache')
        .upsert({
          cache_key: cacheKey,
          value,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        }, {
          onConflict: 'cache_key',
        });
    } catch (error) {
      console.error('[ResearchCache] L2 set error:', error);
    }
  }

  private async deleteFromL2(cacheKey: string): Promise<void> {
    try {
      await supabase
        .from('research_cache')
        .delete()
        .eq('cache_key', cacheKey);
    } catch (error) {
      console.error('[ResearchCache] L2 delete error:', error);
    }
  }

  private async batchGetFromL2<T>(namespace: string, keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    try {
      const cacheKeys = keys.map(k => this.buildKey(namespace, k));

      const { data } = await supabase
        .from('research_cache')
        .select('cache_key, value, expires_at')
        .in('cache_key', cacheKeys)
        .gt('expires_at', new Date().toISOString());

      if (data) {
        for (const row of data) {
          const originalKey = row.cache_key.replace(`${namespace}:`, '');
          results.set(originalKey, row.value as T);
        }
      }
    } catch (error) {
      console.error('[ResearchCache] L2 batch get error:', error);
    }

    return results;
  }

  private async batchSetInL2<T>(
    namespace: string,
    entries: Array<{ key: string; value: T; ttlMs?: number }>
  ): Promise<void> {
    try {
      const rows = entries.map(entry => ({
        cache_key: this.buildKey(namespace, entry.key),
        value: entry.value,
        expires_at: new Date(Date.now() + (entry.ttlMs || this.config.l2TtlMs)).toISOString(),
        created_at: new Date().toISOString(),
      }));

      // Batch upsert in chunks to avoid payload limits
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await supabase
          .from('research_cache')
          .upsert(chunk, { onConflict: 'cache_key' });
      }
    } catch (error) {
      console.error('[ResearchCache] L2 batch set error:', error);
    }
  }

  private updateHitRate(): void {
    const totalHits = this.stats.l1Hits + this.stats.l2Hits;
    const totalRequests = totalHits + this.stats.l1Misses + this.stats.l2Misses;
    this.stats.hitRate = totalRequests > 0 ? totalHits / totalRequests : 0;
  }

  private updateLatency(startTime: number): void {
    const latency = Date.now() - startTime;
    // Simple moving average
    this.stats.avgLatencyMs = (this.stats.avgLatencyMs + latency) / 2;
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanup();
    }, this.config.l2CleanupIntervalMs);
  }
}

// =============================================================================
// SPECIALIZED CACHES
// =============================================================================

/**
 * ZIK Research Cache
 * Caches search results by query parameters
 */
export class ZikCache {
  private cache: ResearchCache;

  constructor(config?: Partial<CacheConfig>) {
    this.cache = new ResearchCache({
      l1TtlMs: 15 * 60 * 1000,      // 15 minutes in memory
      l2TtlMs: 4 * 60 * 60 * 1000,  // 4 hours in database
      ...config,
    });
  }

  private hashQuery(query: Record<string, any>): string {
    const sorted = JSON.stringify(query, Object.keys(query).sort());
    return crypto.createHash('md5').update(sorted).digest('hex');
  }

  async getSearchResults(query: Record<string, any>): Promise<any[] | null> {
    const key = this.hashQuery(query);
    return this.cache.get('zik:search', key);
  }

  async setSearchResults(query: Record<string, any>, results: any[]): Promise<void> {
    const key = this.hashQuery(query);
    await this.cache.set('zik:search', key, results);
  }

  async getOrSearch(
    query: Record<string, any>,
    searchFn: () => Promise<any[]>
  ): Promise<any[]> {
    const key = this.hashQuery(query);
    return this.cache.getOrCompute('zik:search', key, searchFn);
  }

  getStats() {
    return this.cache.getStats();
  }
}

/**
 * Keepa Cache
 * Caches product data by ASIN
 */
export class KeepaCache {
  private cache: ResearchCache;

  constructor(config?: Partial<CacheConfig>) {
    this.cache = new ResearchCache({
      l1TtlMs: 60 * 60 * 1000,       // 1 hour in memory
      l2TtlMs: 12 * 60 * 60 * 1000,  // 12 hours in database
      ...config,
    });
  }

  async getProduct(asin: string): Promise<any | null> {
    return this.cache.get('keepa:product', asin);
  }

  async setProduct(asin: string, data: any): Promise<void> {
    await this.cache.set('keepa:product', asin, data);
  }

  async batchGetProducts(asins: string[]): Promise<Map<string, any>> {
    return this.cache.batchGet('keepa:product', asins);
  }

  async batchSetProducts(products: Array<{ asin: string; data: any }>): Promise<void> {
    const entries = products.map(p => ({ key: p.asin, value: p.data }));
    await this.cache.batchSet('keepa:product', entries);
  }

  async getOrFetch(asin: string, fetchFn: () => Promise<any>): Promise<any> {
    return this.cache.getOrCompute('keepa:product', asin, fetchFn);
  }

  getStats() {
    return this.cache.getStats();
  }
}

/**
 * Compliance Cache
 * Caches compliance check results by content hash
 */
export class ComplianceCache {
  private cache: ResearchCache;

  constructor(config?: Partial<CacheConfig>) {
    this.cache = new ResearchCache({
      l1TtlMs: 2 * 60 * 60 * 1000,   // 2 hours in memory
      l2TtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days in database (compliance rules don't change often)
      ...config,
    });
  }

  private hashContent(content: string, category?: string): string {
    const toHash = `${content}:${category || 'none'}`;
    return crypto.createHash('md5').update(toHash).digest('hex');
  }

  async getComplianceResult(content: string, category?: string): Promise<any | null> {
    const key = this.hashContent(content, category);
    return this.cache.get('compliance:check', key);
  }

  async setComplianceResult(content: string, category: string | undefined, result: any): Promise<void> {
    const key = this.hashContent(content, category);
    await this.cache.set('compliance:check', key, result);
  }

  async getOrCheck(
    content: string,
    category: string | undefined,
    checkFn: () => Promise<any>
  ): Promise<any> {
    const key = this.hashContent(content, category);
    return this.cache.getOrCompute('compliance:check', key, checkFn);
  }

  getStats() {
    return this.cache.getStats();
  }
}

/**
 * Normalization Cache
 * Caches AI normalization results by raw product ID
 */
export class NormalizationCache {
  private cache: ResearchCache;

  constructor(config?: Partial<CacheConfig>) {
    this.cache = new ResearchCache({
      l1TtlMs: 30 * 60 * 1000,       // 30 minutes in memory
      l2TtlMs: 24 * 60 * 60 * 1000,  // 24 hours in database
      ...config,
    });
  }

  async getNormalized(rawProductId: string): Promise<any | null> {
    return this.cache.get('normalize:product', rawProductId);
  }

  async setNormalized(rawProductId: string, data: any): Promise<void> {
    await this.cache.set('normalize:product', rawProductId, data);
  }

  async batchGetNormalized(rawProductIds: string[]): Promise<Map<string, any>> {
    return this.cache.batchGet('normalize:product', rawProductIds);
  }

  async batchSetNormalized(products: Array<{ id: string; data: any }>): Promise<void> {
    const entries = products.map(p => ({ key: p.id, value: p.data }));
    await this.cache.batchSet('normalize:product', entries);
  }

  getStats() {
    return this.cache.getStats();
  }
}

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

let zikCache: ZikCache | null = null;
let keepaCache: KeepaCache | null = null;
let complianceCache: ComplianceCache | null = null;
let normalizationCache: NormalizationCache | null = null;

export function getZikCache(): ZikCache {
  if (!zikCache) {
    zikCache = new ZikCache();
  }
  return zikCache;
}

export function getKeepaCache(): KeepaCache {
  if (!keepaCache) {
    keepaCache = new KeepaCache();
  }
  return keepaCache;
}

export function getComplianceCache(): ComplianceCache {
  if (!complianceCache) {
    complianceCache = new ComplianceCache();
  }
  return complianceCache;
}

export function getNormalizationCache(): NormalizationCache {
  if (!normalizationCache) {
    normalizationCache = new NormalizationCache();
  }
  return normalizationCache;
}

/**
 * Get combined cache statistics
 */
export function getAllCacheStats(): {
  zik: CacheStats;
  keepa: CacheStats;
  compliance: CacheStats;
  normalization: CacheStats;
  combined: {
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
  };
} {
  const zik = getZikCache().getStats();
  const keepa = getKeepaCache().getStats();
  const compliance = getComplianceCache().getStats();
  const normalization = getNormalizationCache().getStats();

  const totalHits = zik.l1Hits + zik.l2Hits +
    keepa.l1Hits + keepa.l2Hits +
    compliance.l1Hits + compliance.l2Hits +
    normalization.l1Hits + normalization.l2Hits;

  const totalMisses = zik.l1Misses + zik.l2Misses +
    keepa.l1Misses + keepa.l2Misses +
    compliance.l1Misses + compliance.l2Misses +
    normalization.l1Misses + normalization.l2Misses;

  return {
    zik,
    keepa,
    compliance,
    normalization,
    combined: {
      totalHits,
      totalMisses,
      overallHitRate: totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0,
    },
  };
}
