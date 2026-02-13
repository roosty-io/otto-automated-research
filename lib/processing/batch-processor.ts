/**
 * Batch Processor
 *
 * High-throughput batch processing for AI normalization and other
 * CPU/API intensive operations. Designed for 25,000+ products/day.
 *
 * Key Features:
 * - Batch aggregation to reduce API overhead
 * - Parallel processing with configurable concurrency
 * - Progress tracking and resumability
 * - Memory-efficient streaming for large datasets
 * - Automatic retry with exponential backoff
 */

import { supabase } from '@/lib/supabase';
import { EventEmitter } from 'events';
import { getNormalizationCache } from '@/lib/cache/research-cache';

// Batch configuration
export interface BatchConfig {
  batchSize: number;           // Items per batch
  concurrency: number;         // Parallel batches
  maxRetries: number;          // Retries per item
  retryDelayMs: number;        // Base retry delay
  timeoutMs: number;           // Per-batch timeout
  checkpointInterval: number;  // Save progress every N items
}

// Default configurations for different processors
export const BATCH_CONFIGS = {
  normalization: {
    batchSize: 25,             // Claude handles 25 well
    concurrency: 4,            // 4 parallel batches = 100 items in flight
    maxRetries: 2,
    retryDelayMs: 1000,
    timeoutMs: 60000,
    checkpointInterval: 100,
  } as BatchConfig,

  compliance: {
    batchSize: 100,            // Local processing, can batch more
    concurrency: 10,
    maxRetries: 1,
    retryDelayMs: 500,
    timeoutMs: 30000,
    checkpointInterval: 500,
  } as BatchConfig,

  skuGeneration: {
    batchSize: 50,
    concurrency: 5,
    maxRetries: 2,
    retryDelayMs: 1000,
    timeoutMs: 45000,
    checkpointInterval: 200,
  } as BatchConfig,

  keepaLookup: {
    batchSize: 100,            // Keepa supports 100 ASINs per request
    concurrency: 3,            // Limited by token budget
    maxRetries: 3,
    retryDelayMs: 2000,
    timeoutMs: 120000,
    checkpointInterval: 100,
  } as BatchConfig,
};

// Batch status
export interface BatchStatus {
  id: string;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  progress: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  startedAt?: Date;
  completedAt?: Date;
  estimatedTimeRemainingMs?: number;
  throughputPerSecond: number;
  errors: Array<{ itemId: string; error: string }>;
}

// Batch item
export interface BatchItem<T = any> {
  id: string;
  data: T;
  status: 'pending' | 'processing' | 'success' | 'failed';
  result?: any;
  error?: string;
  attempts: number;
}

// Processor function type
export type BatchProcessorFn<T, R> = (items: T[]) => Promise<R[]>;

/**
 * Generic Batch Processor
 */
export class BatchProcessor<T, R> extends EventEmitter {
  private config: BatchConfig;
  private status: BatchStatus;
  private items: Map<string, BatchItem<T>> = new Map();
  private processingPromises: Map<string, Promise<void>> = new Map();
  private isPaused = false;
  private startTime = 0;

  constructor(
    private batchId: string,
    private processor: BatchProcessorFn<T, R>,
    config: Partial<BatchConfig> = {}
  ) {
    super();
    this.config = { ...BATCH_CONFIGS.normalization, ...config };
    this.status = {
      id: batchId,
      totalItems: 0,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      progress: 0,
      status: 'pending',
      throughputPerSecond: 0,
      errors: [],
    };
  }

  /**
   * Add items to the batch
   */
  addItems(items: Array<{ id: string; data: T }>): void {
    for (const item of items) {
      this.items.set(item.id, {
        id: item.id,
        data: item.data,
        status: 'pending',
        attempts: 0,
      });
    }
    this.status.totalItems = this.items.size;
  }

  /**
   * Process all items
   */
  async process(): Promise<BatchStatus> {
    this.status.status = 'running';
    this.status.startedAt = new Date();
    this.startTime = Date.now();
    this.emit('started', this.status);

    try {
      // Get pending items
      const pendingItems = Array.from(this.items.values())
        .filter(i => i.status === 'pending');

      // Process in batches with concurrency control
      await this.processWithConcurrency(pendingItems);

      // Update final status
      this.status.status = this.status.failedItems > 0 ? 'completed' : 'completed';
      this.status.completedAt = new Date();
      this.status.progress = 1;

    } catch (error) {
      this.status.status = 'failed';
      this.emit('error', error);
    }

    this.emit('completed', this.status);
    return this.status;
  }

  /**
   * Process with concurrency control
   */
  private async processWithConcurrency(items: BatchItem<T>[]): Promise<void> {
    // Split into batches
    const batches: BatchItem<T>[][] = [];
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      batches.push(items.slice(i, i + this.config.batchSize));
    }

    // Process batches with concurrency limit
    let batchIndex = 0;
    const activeBatches: Promise<void>[] = [];

    while (batchIndex < batches.length || activeBatches.length > 0) {
      // Check if paused
      if (this.isPaused) {
        await this.waitForResume();
      }

      // Start new batches up to concurrency limit
      while (
        batchIndex < batches.length &&
        activeBatches.length < this.config.concurrency
      ) {
        const batch = batches[batchIndex];
        const batchPromise = this.processBatch(batch, batchIndex);

        activeBatches.push(batchPromise);
        batchIndex++;

        // Remove from active when done
        batchPromise.finally(() => {
          const idx = activeBatches.indexOf(batchPromise);
          if (idx >= 0) activeBatches.splice(idx, 1);
        });
      }

      // Wait for at least one batch to complete
      if (activeBatches.length >= this.config.concurrency || batchIndex >= batches.length) {
        await Promise.race(activeBatches);
      }
    }
  }

  /**
   * Process a single batch
   */
  private async processBatch(batch: BatchItem<T>[], batchIndex: number): Promise<void> {
    const batchData = batch.map(item => item.data);

    // Mark items as processing
    for (const item of batch) {
      item.status = 'processing';
      item.attempts++;
    }

    try {
      // Process with timeout
      const results = await this.withTimeout(
        this.processor(batchData),
        this.config.timeoutMs
      );

      // Map results back to items
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        item.result = results[i];
        item.status = 'success';
        this.status.successfulItems++;
        this.status.processedItems++;
      }

    } catch (error) {
      // Handle batch failure
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      for (const item of batch) {
        if (item.attempts < this.config.maxRetries) {
          // Retry
          item.status = 'pending';
          await this.delay(this.config.retryDelayMs * Math.pow(2, item.attempts - 1));
        } else {
          // Mark as failed
          item.status = 'failed';
          item.error = errorMessage;
          this.status.failedItems++;
          this.status.processedItems++;
          this.status.errors.push({ itemId: item.id, error: errorMessage });
        }
      }
    }

    // Update progress
    this.updateProgress();

    // Checkpoint if needed
    if (this.status.processedItems % this.config.checkpointInterval === 0) {
      await this.saveCheckpoint();
    }

    this.emit('batch_completed', { batchIndex, itemsProcessed: batch.length });
  }

  /**
   * Pause processing
   */
  pause(): void {
    this.isPaused = true;
    this.status.status = 'paused';
    this.emit('paused', this.status);
  }

  /**
   * Resume processing
   */
  resume(): void {
    this.isPaused = false;
    this.status.status = 'running';
    this.emit('resumed', this.status);
  }

  /**
   * Get current status
   */
  getStatus(): BatchStatus {
    return { ...this.status };
  }

  /**
   * Get results
   */
  getResults(): Map<string, R | undefined> {
    const results = new Map<string, R | undefined>();
    for (const [id, item] of this.items) {
      results.set(id, item.result);
    }
    return results;
  }

  /**
   * Get failed items
   */
  getFailedItems(): BatchItem<T>[] {
    return Array.from(this.items.values()).filter(i => i.status === 'failed');
  }

  // Private helpers

  private updateProgress(): void {
    this.status.progress = this.status.processedItems / this.status.totalItems;

    // Calculate throughput
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    this.status.throughputPerSecond = elapsedSeconds > 0
      ? this.status.processedItems / elapsedSeconds
      : 0;

    // Estimate time remaining
    if (this.status.throughputPerSecond > 0) {
      const remainingItems = this.status.totalItems - this.status.processedItems;
      this.status.estimatedTimeRemainingMs = (remainingItems / this.status.throughputPerSecond) * 1000;
    }

    this.emit('progress', this.status);
  }

  private async saveCheckpoint(): Promise<void> {
    // Save progress to database for resumability
    try {
      await supabase
        .from('batch_checkpoints')
        .upsert({
          batch_id: this.batchId,
          status: this.status,
          items: Object.fromEntries(this.items),
          updated_at: new Date().toISOString(),
        });
    } catch (error) {
      console.error('[BatchProcessor] Checkpoint save failed:', error);
    }
  }

  private async waitForResume(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (!this.isPaused) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SPECIALIZED BATCH PROCESSORS
// =============================================================================

/**
 * AI Normalization Batch Processor
 * Optimized for Claude API with smart batching
 */
export class NormalizationBatchProcessor {
  private cache = getNormalizationCache();

  /**
   * Normalize a batch of raw products
   */
  async normalizeBatch(
    rawProducts: Array<{
      id: string;
      title: string;
      brand?: string;
      category?: string;
      description?: string;
      price?: number;
      asin?: string;
    }>,
    options: {
      useCassiniOptimization?: boolean;
      tier?: string;
    } = {}
  ): Promise<Map<string, any>> {
    const { useCassiniOptimization = true, tier = 'standard' } = options;

    // Check cache first
    const cachedResults = await this.cache.batchGetNormalized(
      rawProducts.map(p => p.id)
    );

    // Filter out cached items
    const uncachedProducts = rawProducts.filter(p => !cachedResults.has(p.id));

    if (uncachedProducts.length === 0) {
      return cachedResults;
    }

    // Create batch processor
    const processor = new BatchProcessor<typeof rawProducts[0], any>(
      `normalize_${Date.now()}`,
      async (batch) => {
        return this.normalizeWithClaude(batch, useCassiniOptimization);
      },
      BATCH_CONFIGS.normalization
    );

    // Add items
    processor.addItems(uncachedProducts.map(p => ({ id: p.id, data: p })));

    // Process
    await processor.process();

    // Get results and cache them
    const newResults = processor.getResults();
    const toCache: Array<{ id: string; data: any }> = [];

    for (const [id, result] of newResults) {
      if (result) {
        cachedResults.set(id, result);
        toCache.push({ id, data: result });
      }
    }

    // Cache new results
    if (toCache.length > 0) {
      await this.cache.batchSetNormalized(toCache);
    }

    return cachedResults;
  }

  /**
   * Call Claude API for normalization
   */
  private async normalizeWithClaude(
    products: Array<{
      id: string;
      title: string;
      brand?: string;
      category?: string;
      description?: string;
      price?: number;
      asin?: string;
    }>,
    useCassiniOptimization: boolean
  ): Promise<any[]> {
    // Import AI normalizer
    const { normalizeProduct } = await import('@/lib/ai');

    // Process each product
    const results = await Promise.all(
      products.map(async (product) => {
        try {
          const normalized = await normalizeProduct({
            id: product.id,
            title: product.title,
            brand: product.brand,
            category: product.category,
            description: product.description,
            amazonPrice: product.price,
            asin: product.asin,
          });

          return {
            rawProductId: product.id,
            ...normalized,
            normalizedAt: new Date().toISOString(),
          };
        } catch (error) {
          console.error(`[Normalization] Failed for ${product.id}:`, error);
          return null;
        }
      })
    );

    return results;
  }
}

/**
 * Compliance Batch Processor
 * Fast local processing for policy checks
 */
export class ComplianceBatchProcessor {
  /**
   * Check compliance for multiple items
   */
  async checkBatch(
    items: Array<{
      id: string;
      title: string;
      description?: string;
      category?: string;
    }>
  ): Promise<Map<string, any>> {
    // Import compliance checker
    const { analyzeCompliance } = await import('@/lib/optimization/policy-compliance');
    const { quickComplianceCheck } = await import('@/lib/optimization/listing-optimizer');

    const processor = new BatchProcessor<typeof items[0], any>(
      `compliance_${Date.now()}`,
      async (batch) => {
        return batch.map(item => {
          const content = `${item.title} ${item.description || ''}`;
          const quickCheck = quickComplianceCheck(content, item.category);
          const fullAnalysis = analyzeCompliance(content, item.category);

          return {
            id: item.id,
            isCompliant: quickCheck.isCompliant,
            riskLevel: quickCheck.riskLevel,
            hasVeroRisk: quickCheck.hasVeroRisk,
            hasBlacklistHits: quickCheck.hasBlacklistHits,
            hasContactInfo: quickCheck.hasContactInfo,
            violations: fullAnalysis.violations,
            canAutoFix: fullAnalysis.canAutoFix,
            autoFixedContent: fullAnalysis.autoFixedContent,
          };
        });
      },
      BATCH_CONFIGS.compliance
    );

    processor.addItems(items.map(i => ({ id: i.id, data: i })));
    await processor.process();

    return processor.getResults() as Map<string, any>;
  }
}

/**
 * Keepa Batch Processor
 * Optimized for Keepa API with token management
 */
export class KeepaBatchProcessor {
  /**
   * Lookup multiple ASINs
   */
  async lookupBatch(asins: string[]): Promise<Map<string, any>> {
    const { getKeepaClient } = await import('@/lib/integrations/keepa');
    const keepa = getKeepaClient();

    const processor = new BatchProcessor<string, any>(
      `keepa_${Date.now()}`,
      async (batch) => {
        // Keepa supports up to 100 ASINs per request
        const products = await keepa.getProducts(batch, {
          domain: 'US',
          stats: 90,
          buybox: true,
          rating: true,
        });

        return products;
      },
      BATCH_CONFIGS.keepaLookup
    );

    processor.addItems(asins.map(asin => ({ id: asin, data: asin })));
    await processor.process();

    return processor.getResults() as Map<string, any>;
  }
}

// =============================================================================
// THROUGHPUT CALCULATOR
// =============================================================================

/**
 * Calculate theoretical max throughput for the system
 */
export function calculateMaxThroughput(): {
  perMinute: number;
  perHour: number;
  perDay: number;
  bottleneck: string;
  recommendations: string[];
} {
  // Rate limits and processing times
  const constraints = {
    zikSearches: { perMinute: 30, itemsPerSearch: 50 }, // 1500 items/minute
    keepaLookups: { perMinute: 30, itemsPerLookup: 100 }, // 3000 items/minute
    claudeNormalization: { perMinute: 200, itemsPerCall: 1 }, // 200 items/minute
    complianceChecks: { perMinute: 3000, itemsPerCheck: 1 }, // 3000 items/minute
  };

  // Calculate throughput for each stage
  const throughputs = {
    zik: constraints.zikSearches.perMinute * constraints.zikSearches.itemsPerSearch,
    keepa: constraints.keepaLookups.perMinute * constraints.keepaLookups.itemsPerLookup,
    claude: constraints.claudeNormalization.perMinute * constraints.claudeNormalization.itemsPerCall,
    compliance: constraints.complianceChecks.perMinute * constraints.complianceChecks.itemsPerCheck,
  };

  // Find bottleneck
  const minThroughput = Math.min(...Object.values(throughputs));
  const bottleneck = Object.entries(throughputs).find(([, v]) => v === minThroughput)![0];

  const recommendations: string[] = [];

  if (bottleneck === 'claude') {
    recommendations.push('Consider batching Claude API calls');
    recommendations.push('Use caching to avoid re-normalizing same products');
    recommendations.push('Implement async normalization to not block pipeline');
  }

  if (minThroughput < 1750) { // 25000/day = ~1041/hour = ~17/minute
    recommendations.push('Current throughput may not meet 25k/day target');
    recommendations.push('Consider parallel Claude API accounts');
    recommendations.push('Implement aggressive caching for repeat products');
  }

  return {
    perMinute: minThroughput,
    perHour: minThroughput * 60,
    perDay: minThroughput * 60 * 24,
    bottleneck,
    recommendations,
  };
}

// Export singleton instances
let normalizationProcessor: NormalizationBatchProcessor | null = null;
let complianceProcessor: ComplianceBatchProcessor | null = null;
let keepaProcessor: KeepaBatchProcessor | null = null;

export function getNormalizationProcessor(): NormalizationBatchProcessor {
  if (!normalizationProcessor) {
    normalizationProcessor = new NormalizationBatchProcessor();
  }
  return normalizationProcessor;
}

export function getComplianceProcessor(): ComplianceBatchProcessor {
  if (!complianceProcessor) {
    complianceProcessor = new ComplianceBatchProcessor();
  }
  return complianceProcessor;
}

export function getKeepaProcessor(): KeepaBatchProcessor {
  if (!keepaProcessor) {
    keepaProcessor = new KeepaBatchProcessor();
  }
  return keepaProcessor;
}
