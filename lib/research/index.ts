/**
 * Research & Validation Module
 *
 * Exports all research and validation utilities
 */

// Multi-source research
export {
  researchProducts,
  researchProductsCached,
  batchResearchProducts,
  saveResearchResults,
  type ProductResearchQuery,
  type ResearchedProduct,
  type ResearchResult,
} from './multi-source-research'

// Supplier validation
export {
  validateSupplier,
  batchValidateSuppliers,
  saveValidationResult,
  type SupplierValidationResult,
  type SupplierValidationConfig,
  type ValidationCheck,
} from './supplier-validator'

// Competition monitoring
export {
  analyzeCompetition,
  monitorListingCompetition,
  batchMonitorCompetition,
  checkForAlerts,
  saveCompetitionAnalysis,
  saveAlert,
  type CompetitionAnalysis,
  type CompetitorInfo,
  type CompetitionAlert,
  type MarketTrend,
} from './competition-monitor'

// Product uniqueness
export {
  checkProductAvailability,
  batchCheckAvailability,
  assignProductToUser,
  releaseProductSlot,
  joinWaitlist,
  processWaitlist,
  getProductDistributionStats,
  type ProductAvailability,
  type AssignmentResult,
  type UniquenessConfig,
  type WaitlistEntry,
} from './product-uniqueness'

// Risk scoring
export {
  assessProductRisk,
  batchAssessRisk,
  saveRiskAssessment,
  getHighRiskProducts,
  type RiskAssessment,
  type RiskCategory,
  type RiskFactor,
  type RiskBlocker,
  type RiskWarning,
} from './risk-scorer'
