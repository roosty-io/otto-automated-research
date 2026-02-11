/**
 * Pruning Module
 *
 * Automated pruning system for underperforming listings:
 * - Rules engine for defining pruning criteria
 * - Pruning service for executing actions
 * - Analytics for tracking pruning effectiveness
 */

// Rules Engine
export {
  type RuleOperator,
  type RuleAction,
  type PruningRule,
  type RuleCondition,
  type ListingData,
  type RuleEvaluation,
  getActiveRules,
  getAllRules,
  createRule,
  updateRule,
  deleteRule,
  evaluateRule,
  evaluateAllRules,
  enrichListingData,
} from './rules-engine'

// Pruning Service
export {
  type PruningCandidate,
  type PruningResult,
  type PruningBatchResult,
  type PruningOptions,
  getEligibleListings,
  findPruningCandidates,
  runPruningBatch,
  getPruningStats,
  getPendingReviews,
  resolveReview,
  manualPrune,
} from './pruning-service'

// Analytics
export {
  type PruningMetrics,
  type RulePerformance,
  type TrendData,
  getPruningMetrics,
  getRulePerformance,
  getPruningTrends,
  getPruningImpact,
  generatePruningReport,
} from './analytics'
