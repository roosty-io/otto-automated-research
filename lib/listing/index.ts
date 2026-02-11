/**
 * Listing Module
 *
 * Exports all listing-related functionality:
 * - Assignment service: Assign SKUs to stores
 * - Job manager: Create and manage listing jobs
 * - Queue processor: Process listing queue automatically
 * - Status tracker: Track and monitor listing statuses
 */

// Assignment Service
export {
  type StoreInfo,
  type SkuInfo,
  type AssignmentResult,
  type BulkAssignmentResult,
  getEligibleStores,
  getAvailableSkus,
  assignSkuToStore,
  bulkAssignSkus,
  getStoreAssignmentStats,
  removeAssignment,
} from './assignment-service'

// Job Manager
export {
  type ListingJob,
  type ListingJobStatus,
  type ListingJobType,
  type CreateJobInput,
  type JobFilter,
  createListingJob,
  createBulkListingJobs,
  getProcessableJobs,
  getJob,
  updateJobStatus,
  startJob,
  completeJob,
  failJob,
  cancelJob,
  getJobStats,
  getStoreJobs,
  cleanupOldJobs,
} from './job-manager'

// Queue Processor
export {
  type ProcessorConfig,
  type ProcessingResult,
  type BatchResult,
  processBatch,
  getProcessorStatus,
  startProcessor,
} from './queue-processor'

// Status Tracker
export {
  type ListingStatus,
  type ListingDetails,
  type StatusSummary,
  type PerformanceMetrics,
  getListings,
  getStatusSummary,
  getPerformanceMetrics,
  updateListingStatus,
  bulkUpdateStatus,
  getListingsNeedingAttention,
  getStatusHistory,
} from './status-tracker'
