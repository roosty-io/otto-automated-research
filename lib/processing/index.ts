/**
 * Batch Processing Module
 *
 * High-throughput batch processing for AI normalization and other intensive operations.
 */

export {
  BatchProcessor,
  NormalizationBatchProcessor,
  ComplianceBatchProcessor,
  KeepaBatchProcessor,
  BATCH_CONFIGS,
  getNormalizationProcessor,
  getComplianceProcessor,
  getKeepaProcessor,
  calculateMaxThroughput,
  type BatchConfig,
  type BatchStatus,
  type BatchItem,
  type BatchProcessorFn,
} from './batch-processor';
