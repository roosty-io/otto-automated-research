// Claude AI Product Normalizer
export {
  normalizeProduct,
  normalizeProductBatch,
  cleanProductTitle,
  generateBulletPoints,
  type RawProductInput,
  type NormalizedProductOutput,
  type QualitySignals,
  type BatchNormalizationResult,
} from './claude-normalizer'

// Quality Scoring System
export {
  calculateQualityScore,
  rankProducts,
  filterByQuality,
  SCORE_THRESHOLDS,
  type ProductData,
  type QualityScore,
  type ScoringConfig,
} from './quality-scorer'

// Pattern Detection
export {
  detectPatterns,
  type PatternType,
  type DetectedPattern,
  type PatternAnalysisResult,
  type PatternDetectionConfig,
} from './pattern-detector'

// SKU Generation
export {
  generateSku,
  generateSkuBatch,
  saveGeneratedSku,
  type SkuGenerationInput,
  type GeneratedSku,
  type PricingStrategy,
  type ShippingProfile,
  type SkuVariant,
  type ComplianceStatus,
  type SkuGenerationConfig,
} from './sku-generator'
