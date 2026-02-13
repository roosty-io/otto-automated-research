/**
 * Pricing Module
 *
 * Simple pricing rules:
 * - Minimum profit: $2 after all fees
 * - Minimum buy price: $11 (AutoDS returns limitation)
 * - High-volume exception for products with 50+/month sales
 */

export {
  // Configuration
  DEFAULT_PRICING_CONFIG,
  type PricingConfig,

  // Types
  type PricingInput,
  type PricingResult,
  type QualificationResult,
  type RepricingDecision,

  // Core functions
  calculateFees,
  calculateNetProfit,
  calculateMinSellPrice,
  calculateSellPrice,
  checkProductQualification,
  makeRepricingDecision,

  // Utilities
  isProfitable,
  getMinViablePrice,
  getTotalFeePercentage,
  validatePriceChange,

  // Batch operations
  batchCalculatePricing,
  filterQualifiedProducts,
} from './pricing-engine';
