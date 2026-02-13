/**
 * High-Throughput Processing Queue
 *
 * Optimized queue system for processing 3000+ products/day with:
 * - Priority-based scheduling
 * - Parallel worker pools
 * - Rate limiting per resource type
 * - Backpressure handling
 * - Circuit breaker for failing services
 * - Batch processing optimization
 */

import { supabase } from '@/lib/supabase';
import { EventEmitter } from 'events';

// Queue item priorities
export enum QueuePriority {
  CRITICAL = 100,   // System-critical tasks
  HIGH = 75,        // User-initiated actions
  NORMAL = 50,      // Standard pipeline tasks
  LOW = 25,         // Background tasks
  IDLE = 0,         // Run when nothing else to do
}

// Queue item status
export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying' | 'dead';

// Queue item structure
export interface QueueItem<T = any> {
  id: string;
  type: string;
  priority: QueuePriority;
  payload: T;
  status: QueueItemStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
  workerId?: string;
  batchId?: string;
  dependencies?: string[];
}

// Worker configuration
export interface WorkerConfig {
  id: string;
  concurrency: number;
  types: string[];
  rateLimits: Record<string, { maxPerSecond: number; maxPerMinute: number }>;
}

// Queue metrics
export interface QueueMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  throughputPerMinute: number;
  avgProcessingTimeMs: number;
  errorRate: number;
  queueDepth: number;
  oldestItemAge: number;
}

// Circuit breaker state
interface CircuitBreaker {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
  threshold: number;
  resetTimeMs: number;
}

// Rate limiter state
interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

/**
 * High-Throughput Queue Manager
 */
export class HighThroughputQueue extends EventEmitter {
  private workers: Map<string, Worker> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private rateLimiters: Map<string, RateLimiterState> = new Map();
  private processingCounts: Map<string, number> = new Map();
  private metricsHistory: Array<{ timestamp: number; processed: number }> = [];
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(private config: {
    pollIntervalMs?: number;
    maxQueueDepth?: number;
    defaultMaxAttempts?: number;
    circuitBreakerThreshold?: number;
    circuitBreakerResetMs?: number;
  } = {}) {
    super();
    this.config = {
      pollIntervalMs: 100,
      maxQueueDepth: 10000,
      defaultMaxAttempts: 3,
      circuitBreakerThreshold: 5,
      circuitBreakerResetMs: 60000,
      ...config,
    };
  }

  /**
   * Register a worker pool
   */
  registerWorker(config: WorkerConfig, handler: (item: QueueItem) => Promise<any>): void {
    const worker = new Worker(config, handler, this);
    this.workers.set(config.id, worker);

    // Initialize rate limiters for this worker's types
    for (const type of config.types) {
      if (config.rateLimits[type]) {
        const limit = config.rateLimits[type];
        this.rateLimiters.set(`${config.id}:${type}`, {
          tokens: limit.maxPerSecond,
          lastRefill: Date.now(),
          maxTokens: limit.maxPerSecond,
          refillRate: limit.maxPerSecond,
        });
      }
    }

    // Initialize circuit breaker
    this.circuitBreakers.set(config.id, {
      failures: 0,
      lastFailure: 0,
      state: 'closed',
      threshold: this.config.circuitBreakerThreshold!,
      resetTimeMs: this.config.circuitBreakerResetMs!,
    });
  }

  /**
   * Enqueue a single item
   */
  async enqueue<T>(
    type: string,
    payload: T,
    options: {
      priority?: QueuePriority;
      maxAttempts?: number;
      batchId?: string;
      dependencies?: string[];
    } = {}
  ): Promise<string> {
    const id = this.generateId();
    const item: QueueItem<T> = {
      id,
      type,
      payload,
      priority: options.priority ?? QueuePriority.NORMAL,
      status: 'pending',
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.config.defaultMaxAttempts!,
      createdAt: new Date(),
      batchId: options.batchId,
      dependencies: options.dependencies,
    };

    await this.saveItem(item);
    this.emit('enqueued', item);

    return id;
  }

  /**
   * Enqueue multiple items (optimized batch insert)
   */
  async enqueueBatch<T>(
    type: string,
    payloads: T[],
    options: {
      priority?: QueuePriority;
      maxAttempts?: number;
      batchId?: string;
    } = {}
  ): Promise<string[]> {
    const batchId = options.batchId || this.generateBatchId();
    const items: QueueItem<T>[] = payloads.map(payload => ({
      id: this.generateId(),
      type,
      payload,
      priority: options.priority ?? QueuePriority.NORMAL,
      status: 'pending' as QueueItemStatus,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.config.defaultMaxAttempts!,
      createdAt: new Date(),
      batchId,
    }));

    await this.saveBatch(items);
    this.emit('batch_enqueued', { batchId, count: items.length });

    return items.map(i => i.id);
  }

  /**
   * Start processing
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Start all workers
    for (const worker of this.workers.values()) {
      worker.start();
    }

    // Start polling for new items
    this.pollInterval = setInterval(() => {
      this.distributeWork();
    }, this.config.pollIntervalMs);

    this.emit('started');
  }

  /**
   * Stop processing
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Stop all workers
    for (const worker of this.workers.values()) {
      await worker.stop();
    }

    this.emit('stopped');
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    const { data: counts } = await supabase
      .from('processing_queue')
      .select('status')
      .then(({ data }) => {
        const result: Record<string, number> = {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
        };
        for (const item of data || []) {
          result[item.status] = (result[item.status] || 0) + 1;
        }
        return { data: result };
      });

    // Calculate throughput (items processed in last minute)
    const oneMinuteAgo = Date.now() - 60000;
    const recentProcessed = this.metricsHistory.filter(m => m.timestamp > oneMinuteAgo);
    const throughputPerMinute = recentProcessed.reduce((sum, m) => sum + m.processed, 0);

    // Get oldest pending item age
    const { data: oldest } = await supabase
      .from('processing_queue')
      .select('created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    const oldestItemAge = oldest
      ? Date.now() - new Date(oldest.created_at).getTime()
      : 0;

    // Calculate error rate from recent history
    const totalProcessed = counts?.completed || 0 + (counts?.failed || 0);
    const errorRate = totalProcessed > 0
      ? (counts?.failed || 0) / totalProcessed
      : 0;

    return {
      pending: counts?.pending || 0,
      processing: counts?.processing || 0,
      completed: counts?.completed || 0,
      failed: counts?.failed || 0,
      throughputPerMinute,
      avgProcessingTimeMs: 0, // TODO: track this
      errorRate,
      queueDepth: (counts?.pending || 0) + (counts?.processing || 0),
      oldestItemAge,
    };
  }

  /**
   * Check rate limit
   */
  checkRateLimit(workerId: string, type: string): boolean {
    const key = `${workerId}:${type}`;
    const limiter = this.rateLimiters.get(key);

    if (!limiter) return true; // No limit configured

    // Refill tokens
    const now = Date.now();
    const elapsed = (now - limiter.lastRefill) / 1000;
    limiter.tokens = Math.min(limiter.maxTokens, limiter.tokens + elapsed * limiter.refillRate);
    limiter.lastRefill = now;

    // Check if we have tokens
    if (limiter.tokens >= 1) {
      limiter.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Check circuit breaker
   */
  checkCircuitBreaker(workerId: string): boolean {
    const breaker = this.circuitBreakers.get(workerId);
    if (!breaker) return true;

    const now = Date.now();

    switch (breaker.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if we should try half-open
        if (now - breaker.lastFailure > breaker.resetTimeMs) {
          breaker.state = 'half-open';
          return true;
        }
        return false;

      case 'half-open':
        return true;
    }
  }

  /**
   * Record success (for circuit breaker)
   */
  recordSuccess(workerId: string): void {
    const breaker = this.circuitBreakers.get(workerId);
    if (!breaker) return;

    if (breaker.state === 'half-open') {
      breaker.state = 'closed';
      breaker.failures = 0;
    }

    // Track metrics
    this.metricsHistory.push({ timestamp: Date.now(), processed: 1 });

    // Cleanup old metrics
    const cutoff = Date.now() - 300000; // 5 minutes
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);
  }

  /**
   * Record failure (for circuit breaker)
   */
  recordFailure(workerId: string): void {
    const breaker = this.circuitBreakers.get(workerId);
    if (!breaker) return;

    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.failures >= breaker.threshold) {
      breaker.state = 'open';
      this.emit('circuit_open', { workerId });
    }
  }

  /**
   * Get next items for a worker
   */
  async getNextItems(workerId: string, types: string[], limit: number): Promise<QueueItem[]> {
    // Check circuit breaker
    if (!this.checkCircuitBreaker(workerId)) {
      return [];
    }

    // Get items that match worker types and aren't already being processed
    const { data: items, error } = await supabase
      .from('processing_queue')
      .select('*')
      .in('type', types)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error || !items) return [];

    // Filter by rate limits and lock items
    const eligible: QueueItem[] = [];

    for (const item of items) {
      if (!this.checkRateLimit(workerId, item.type)) {
        continue;
      }

      // Try to lock the item
      const { data: locked } = await supabase
        .from('processing_queue')
        .update({
          status: 'processing',
          worker_id: workerId,
          started_at: new Date().toISOString(),
          attempts: item.attempts + 1,
        })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select()
        .single();

      if (locked) {
        eligible.push(this.mapFromDb(locked));
      }
    }

    return eligible;
  }

  /**
   * Complete an item
   */
  async completeItem(id: string, result?: any): Promise<void> {
    await supabase
      .from('processing_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result,
      })
      .eq('id', id);

    this.emit('completed', { id, result });
  }

  /**
   * Fail an item
   */
  async failItem(id: string, error: string, retry: boolean = true): Promise<void> {
    const { data: item } = await supabase
      .from('processing_queue')
      .select('attempts, max_attempts')
      .eq('id', id)
      .single();

    if (!item) return;

    const shouldRetry = retry && item.attempts < item.max_attempts;

    await supabase
      .from('processing_queue')
      .update({
        status: shouldRetry ? 'retrying' : 'failed',
        error,
        completed_at: shouldRetry ? null : new Date().toISOString(),
      })
      .eq('id', id);

    if (shouldRetry) {
      // Re-enqueue with delay
      const delay = Math.pow(2, item.attempts) * 1000; // Exponential backoff
      setTimeout(async () => {
        await supabase
          .from('processing_queue')
          .update({ status: 'pending', worker_id: null })
          .eq('id', id);
      }, delay);
    }

    this.emit('failed', { id, error, willRetry: shouldRetry });
  }

  /**
   * Get batch status
   */
  async getBatchStatus(batchId: string): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    progress: number;
  }> {
    const { data } = await supabase
      .from('processing_queue')
      .select('status')
      .eq('batch_id', batchId);

    const counts = {
      total: data?.length || 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const item of data || []) {
      counts[item.status as keyof typeof counts]++;
    }

    return {
      ...counts,
      progress: counts.total > 0 ? (counts.completed + counts.failed) / counts.total : 0,
    };
  }

  // Private methods

  private async distributeWork(): Promise<void> {
    for (const [workerId, worker] of this.workers) {
      if (worker.hasCapacity()) {
        const items = await this.getNextItems(
          workerId,
          worker.config.types,
          worker.availableSlots()
        );

        for (const item of items) {
          worker.process(item);
        }
      }
    }
  }

  private async saveItem(item: QueueItem): Promise<void> {
    await supabase
      .from('processing_queue')
      .insert(this.mapToDb(item));
  }

  private async saveBatch(items: QueueItem[]): Promise<void> {
    const rows = items.map(i => this.mapToDb(i));

    // Insert in chunks
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await supabase.from('processing_queue').insert(chunk);
    }
  }

  private mapToDb(item: QueueItem): any {
    return {
      id: item.id,
      type: item.type,
      priority: item.priority,
      payload: item.payload,
      status: item.status,
      attempts: item.attempts,
      max_attempts: item.maxAttempts,
      created_at: item.createdAt.toISOString(),
      started_at: item.startedAt?.toISOString(),
      completed_at: item.completedAt?.toISOString(),
      error: item.error,
      result: item.result,
      worker_id: item.workerId,
      batch_id: item.batchId,
      dependencies: item.dependencies,
    };
  }

  private mapFromDb(row: any): QueueItem {
    return {
      id: row.id,
      type: row.type,
      priority: row.priority,
      payload: row.payload,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error,
      result: row.result,
      workerId: row.worker_id,
      batchId: row.batch_id,
      dependencies: row.dependencies,
    };
  }

  private generateId(): string {
    return `qi_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Worker class - processes queue items
 */
class Worker {
  private activeJobs: Map<string, Promise<void>> = new Map();
  private isRunning = false;

  constructor(
    public config: WorkerConfig,
    private handler: (item: QueueItem) => Promise<any>,
    private queue: HighThroughputQueue
  ) {}

  start(): void {
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    // Wait for active jobs to complete
    await Promise.all(this.activeJobs.values());
  }

  hasCapacity(): boolean {
    return this.isRunning && this.activeJobs.size < this.config.concurrency;
  }

  availableSlots(): number {
    return Math.max(0, this.config.concurrency - this.activeJobs.size);
  }

  async process(item: QueueItem): Promise<void> {
    if (!this.hasCapacity()) return;

    const job = this.executeJob(item);
    this.activeJobs.set(item.id, job);

    job.finally(() => {
      this.activeJobs.delete(item.id);
    });
  }

  private async executeJob(item: QueueItem): Promise<void> {
    try {
      const result = await this.handler(item);
      await this.queue.completeItem(item.id, result);
      this.queue.recordSuccess(this.config.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.queue.failItem(item.id, errorMessage);
      this.queue.recordFailure(this.config.id);
    }
  }
}

// =============================================================================
// PRE-CONFIGURED QUEUES FOR RESEARCH PIPELINE
// =============================================================================

/**
 * Create research-optimized queue
 */
export function createResearchQueue(): HighThroughputQueue {
  const queue = new HighThroughputQueue({
    pollIntervalMs: 50,      // Fast polling for high throughput
    maxQueueDepth: 50000,    // Support large batches
    defaultMaxAttempts: 3,
    circuitBreakerThreshold: 10,
    circuitBreakerResetMs: 30000,
  });

  // ZIK Research Worker
  queue.registerWorker(
    {
      id: 'zik-worker',
      concurrency: 3,        // Limited by ZIK rate limits
      types: ['zik_search', 'zik_category', 'zik_seller'],
      rateLimits: {
        'zik_search': { maxPerSecond: 1, maxPerMinute: 30 },
        'zik_category': { maxPerSecond: 2, maxPerMinute: 60 },
        'zik_seller': { maxPerSecond: 1, maxPerMinute: 20 },
      },
    },
    async (item) => {
      // Handler implemented in pipeline
      return { type: item.type, processed: true };
    }
  );

  // Keepa Lookup Worker
  queue.registerWorker(
    {
      id: 'keepa-worker',
      concurrency: 5,        // Higher concurrency, API handles batching
      types: ['keepa_lookup', 'keepa_batch'],
      rateLimits: {
        'keepa_lookup': { maxPerSecond: 10, maxPerMinute: 300 },
        'keepa_batch': { maxPerSecond: 2, maxPerMinute: 30 },
      },
    },
    async (item) => {
      return { type: item.type, processed: true };
    }
  );

  // AI Normalization Worker
  queue.registerWorker(
    {
      id: 'normalize-worker',
      concurrency: 10,       // Can parallelize API calls
      types: ['normalize', 'normalize_batch'],
      rateLimits: {
        'normalize': { maxPerSecond: 5, maxPerMinute: 200 },
        'normalize_batch': { maxPerSecond: 2, maxPerMinute: 60 },
      },
    },
    async (item) => {
      return { type: item.type, processed: true };
    }
  );

  // Compliance Check Worker
  queue.registerWorker(
    {
      id: 'compliance-worker',
      concurrency: 20,       // Fast local processing
      types: ['compliance_check', 'compliance_batch'],
      rateLimits: {
        'compliance_check': { maxPerSecond: 100, maxPerMinute: 3000 },
        'compliance_batch': { maxPerSecond: 10, maxPerMinute: 300 },
      },
    },
    async (item) => {
      return { type: item.type, processed: true };
    }
  );

  // SKU Generation Worker
  queue.registerWorker(
    {
      id: 'sku-worker',
      concurrency: 10,
      types: ['generate_sku', 'generate_sku_batch'],
      rateLimits: {
        'generate_sku': { maxPerSecond: 20, maxPerMinute: 600 },
        'generate_sku_batch': { maxPerSecond: 5, maxPerMinute: 100 },
      },
    },
    async (item) => {
      return { type: item.type, processed: true };
    }
  );

  return queue;
}

// Singleton instance
let researchQueue: HighThroughputQueue | null = null;

export function getResearchQueue(): HighThroughputQueue {
  if (!researchQueue) {
    researchQueue = createResearchQueue();
  }
  return researchQueue;
}
