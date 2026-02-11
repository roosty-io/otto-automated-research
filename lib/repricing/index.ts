/**
 * Repricing Module
 *
 * Automated price optimization based on competition,
 * demand, and business rules.
 */

// Rules Engine
export {
  type RepricingRule,
  type RepricingCondition,
  type RepricingStrategy,
  type PriceAdjustment,
  type PriceConstraints,
  type RepricingSchedule,
  type ListingPriceData,
  type RepricingRecommendation,
  evaluateRepricingRule,
  evaluateAllRepricingRules,
  createRepricingRule,
  updateRepricingRule,
  deleteRepricingRule,
  getActiveRepricingRules,
  getAllRepricingRules,
  getDefaultRepricingRules,
  enrichListingPriceData,
} from './rules-engine'

// Optimization Service
export {
  type RepricingOptions,
  type RepricingBatchResult,
  type RepricingResult,
  type RepricingCandidate,
  runRepricingBatch,
  rollbackPriceChange,
  setManualPrice,
  getPriceHistory,
  getRepricingStats,
  getEligibleListings,
  findRepricingCandidates,
  getPendingPriceChanges,
  applyPendingPriceChange,
  rejectPendingPriceChange,
} from './optimization-service'

// Competitor Monitoring
export {
  type CompetitorPrice,
  type CompetitorAnalysis,
  type MonitoringJob,
  type MonitoringOptions,
  type MonitoringResult,
  runCompetitorMonitoring,
  getCompetitorAnalysis,
  getMonitoringStats,
  getPriceAlerts,
  scheduleMonitoring,
} from './competitor-monitor'
