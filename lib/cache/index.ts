/**
 * Research Cache Module
 *
 * High-performance caching layer for the research pipeline.
 */

export {
  ResearchCache,
  ZikCache,
  KeepaCache,
  ComplianceCache,
  NormalizationCache,
  getZikCache,
  getKeepaCache,
  getComplianceCache,
  getNormalizationCache,
  getAllCacheStats,
  type CacheConfig,
  type CacheStats,
} from './research-cache';
