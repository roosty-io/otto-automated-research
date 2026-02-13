/**
 * Listing Optimization Module
 *
 * Comprehensive listing optimization for eBay with:
 * - Cassini algorithm optimization (titles)
 * - Policy compliance checking (VERO, off-platform, medical, firearms, etc.)
 * - Description optimization and structuring
 * - Scheduled listing workflow with 12-hour AutoDS delay
 * - Tier-based feature differentiation
 */

// VERO and Blacklist Database
export {
  VERO_HIGH_RISK_BRANDS,
  VERO_MEDIUM_RISK_BRANDS,
  BLACKLIST_KEYWORDS,
  CONTACT_INFO_PATTERNS,
  CATEGORY_RESTRICTIONS,
  SAFE_ALTERNATIVES,
  containsVeroBrand,
  containsBlacklistKeywords,
  containsContactInfo,
  removeVeroBrands,
  sanitizeBlacklistKeywords,
  removeContactInfo,
  fullComplianceScan,
} from './vero-blacklist';

// Policy Compliance Analyzer
export {
  analyzeCompliance,
  autoFixContent,
  isCompliant,
  getComplianceScore,
  hasCriticalViolations,
  getViolationReport,
  type ViolationSeverity,
  type PolicyCategory,
  type PolicyViolation,
  type ComplianceReport,
} from './policy-compliance';

// Listing Optimizer
export {
  ListingOptimizer,
  optimizeTitle,
  optimizeDescription,
  optimizeListing,
  quickComplianceCheck,
  type OptimizationTier,
  type TitleOptimizationResult,
  type DescriptionOptimizationResult,
  type ListingOptimizationResult,
} from './listing-optimizer';

// Scheduled Listing Workflow
export {
  ScheduledListingWorkflow,
  createScheduledWorkflow,
  generateActivationJobs,
  type ListingState,
  type ScheduledListing,
  type WorkflowConfig,
  type WorkflowResult,
  type BatchWorkflowResult,
  type ScheduledListingJob,
} from './scheduled-listing-workflow';

/**
 * Quick start guide:
 *
 * 1. Optimize a single listing:
 * ```typescript
 * import { optimizeListing } from '@/lib/optimization';
 *
 * const result = optimizeListing(title, description, 'premium');
 * console.log(result.canList); // true if no blockers
 * console.log(result.title.optimizedTitle); // Cassini-optimized title
 * ```
 *
 * 2. Check compliance without modifying:
 * ```typescript
 * import { quickComplianceCheck } from '@/lib/optimization';
 *
 * const check = quickComplianceCheck(content);
 * if (check.hasVeroRisk) {
 *   console.log('VERO brand detected!');
 * }
 * ```
 *
 * 3. Use scheduled workflow for AutoDS:
 * ```typescript
 * import { createScheduledWorkflow } from '@/lib/optimization';
 *
 * const workflow = createScheduledWorkflow({ tier: 'premium' });
 * const result = await workflow.startWorkflow({
 *   productId: '123',
 *   sku: 'ABC-123',
 *   storeId: 'store_1',
 *   title: 'Product Title',
 *   description: 'Product description...',
 * });
 *
 * // Listing will be scheduled for 12 hours from now
 * console.log(result.listing.scheduledActivationAt);
 * ```
 */

// Default export for convenience
export default {
  // Quick functions
  optimizeListing,
  optimizeTitle,
  optimizeDescription,
  quickComplianceCheck,

  // Compliance
  analyzeCompliance,
  isCompliant,
  getComplianceScore,
  hasCriticalViolations,
  getViolationReport,

  // VERO/Blacklist
  containsVeroBrand,
  containsBlacklistKeywords,
  fullComplianceScan,

  // Workflow
  createScheduledWorkflow,
};
