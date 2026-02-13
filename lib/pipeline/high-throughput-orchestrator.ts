/**
 * High-Throughput Research Pipeline Orchestrator
 *
 * Coordinates the entire research pipeline for 25,000+ products/day throughput.
 * Manages data flow from discovery through listing with optimal resource utilization.
 *
 * Pipeline Stages:
 * 1. DISCOVER: ZIK research for trending products
 * 2. VALIDATE: Keepa lookup for supplier data
 * 3. NORMALIZE: AI-powered product normalization
 * 4. COMPLIANCE: Policy and VERO checking
 * 5. SCORE: Quality and Cassini scoring
 * 6. GENERATE: SKU generation
 * 7. OPTIMIZE: Title/description optimization
 * 8. QUEUE: Add to listing queue
 *
 * Design Principles:
 * - Streaming architecture (no large batches in memory)
 * - Parallel processing at each stage
 * - Checkpointing for resumability
 * - Backpressure handling
 * - Real-time metrics
 */

import { EventEmitter } from 'events';
import { supabase } from '@/lib/supabase';
import { getZikCache, getKeepaCache, getComplianceCache, getNormalizationCache, getAllCacheStats } from '@/lib/cache/research-cache';
import { getResearchQueue, QueuePriority } from '@/lib/queue/high-throughput-queue';
import { getNormalizationProcessor, getComplianceProcessor, getKeepaProcessor, calculateMaxThroughput } from '@/lib/processing/batch-processor';

// Pipeline configuration
export interface PipelineConfig {
  // Throughput targets
  targetProductsPerDay: number;
  targetProductsPerHour: number;

  // Stage configurations
  discoveryBatchSize: number;
  validationBatchSize: number;
  normalizationBatchSize: number;
  complianceBatchSize: number;
  skuGenerationBatchSize: number;

  // Concurrency limits
  maxConcurrentDiscoveries: number;
  maxConcurrentValidations: number;
  maxConcurrentNormalizations: number;

  // Quality thresholds
  minQualityScore: number;
  minCassiniScore: number;
  minComplianceScore: number;

  // Checkpointing
  checkpointIntervalMs: number;
  enableCheckpointing: boolean;
}

// Default configuration for 25k+/day
const DEFAULT_CONFIG: PipelineConfig = {
  targetProductsPerDay: 25000,
  targetProductsPerHour: 1050,  // ~17.5/minute

  discoveryBatchSize: 50,
  validationBatchSize: 100,
  normalizationBatchSize: 25,
  complianceBatchSize: 100,
  skuGenerationBatchSize: 50,

  maxConcurrentDiscoveries: 3,
  maxConcurrentValidations: 5,
  maxConcurrentNormalizations: 4,

  minQualityScore: 60,
  minCassiniScore: 50,
  minComplianceScore: 80,

  checkpointIntervalMs: 60000,  // 1 minute
  enableCheckpointing: true,
};

// Pipeline stage
export type PipelineStage =
  | 'idle'
  | 'discovering'
  | 'validating'
  | 'normalizing'
  | 'compliance_checking'
  | 'scoring'
  | 'generating_skus'
  | 'optimizing'
  | 'queueing';

// Pipeline metrics
export interface PipelineMetrics {
  status: 'idle' | 'running' | 'paused' | 'error';
  currentStage: PipelineStage;
  startedAt?: Date;
  runningTimeMs: number;

  // Throughput
  productsDiscovered: number;
  productsValidated: number;
  productsNormalized: number;
  productsCompliant: number;
  skusGenerated: number;
  productsQueued: number;

  // Rates
  discoveryRate: number;      // per minute
  processingRate: number;     // per minute
  outputRate: number;         // per minute

  // Efficiency
  cacheHitRate: number;
  validationPassRate: number;
  compliancePassRate: number;
  overallConversionRate: number;

  // Errors
  totalErrors: number;
  errorsByStage: Record<PipelineStage, number>;

  // Projections
  estimatedDailyOutput: number;
  onTrackForTarget: boolean;
  bottleneck?: string;
}

// Product flowing through pipeline
interface PipelineProduct {
  id: string;
  stage: PipelineStage;
  sourceType: 'zik' | 'keepa' | 'manual';
  sourceId: string;

  // Raw data
  rawData: any;

  // Processed data
  keepaData?: any;
  normalizedData?: any;
  complianceResult?: any;
  qualityScore?: number;
  cassiniScore?: number;
  skuData?: any;
  optimizedData?: any;

  // Tracking
  createdAt: Date;
  stageTimings: Record<PipelineStage, number>;
  errors: string[];
  retryCount: number;
}

// Discovery source configuration
export interface DiscoverySource {
  type: 'zik_search' | 'zik_category' | 'zik_seller' | 'manual';
  config: any;
  priority: number;
  quota?: number;  // Max products from this source
}

/**
 * High-Throughput Pipeline Orchestrator
 */
export class HighThroughputOrchestrator extends EventEmitter {
  private config: PipelineConfig;
  private metrics: PipelineMetrics;
  private isRunning = false;
  private isPaused = false;

  // Stage queues
  private discoveryQueue: PipelineProduct[] = [];
  private validationQueue: PipelineProduct[] = [];
  private normalizationQueue: PipelineProduct[] = [];
  private complianceQueue: PipelineProduct[] = [];
  private scoringQueue: PipelineProduct[] = [];
  private skuQueue: PipelineProduct[] = [];
  private optimizationQueue: PipelineProduct[] = [];
  private listingQueue: PipelineProduct[] = [];

  // Active processing counts
  private activeDiscoveries = 0;
  private activeValidations = 0;
  private activeNormalizations = 0;

  // Timing
  private startTime = 0;
  private lastCheckpoint = 0;
  private metricsHistory: Array<{ timestamp: number; produced: number }> = [];

  // Intervals
  private processingInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<PipelineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = this.initializeMetrics();
  }

  /**
   * Start the pipeline
   */
  async start(sources: DiscoverySource[]): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.metrics.status = 'running';
    this.metrics.startedAt = new Date();

    this.emit('started', { config: this.config, sources });

    // Initialize discovery from sources
    await this.initializeDiscovery(sources);

    // Start processing loop
    this.processingInterval = setInterval(() => {
      this.processAllStages();
    }, 100);  // 10 times per second

    // Start metrics collection
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
      this.emit('metrics', this.metrics);
    }, 5000);  // Every 5 seconds
  }

  /**
   * Stop the pipeline
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.metrics.status = 'idle';

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Save checkpoint
    if (this.config.enableCheckpointing) {
      await this.saveCheckpoint();
    }

    this.emit('stopped', { metrics: this.metrics });
  }

  /**
   * Pause the pipeline
   */
  pause(): void {
    this.isPaused = true;
    this.metrics.status = 'paused';
    this.emit('paused');
  }

  /**
   * Resume the pipeline
   */
  resume(): void {
    this.isPaused = false;
    this.metrics.status = 'running';
    this.emit('resumed');
  }

  /**
   * Get current metrics
   */
  getMetrics(): PipelineMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get queue depths
   */
  getQueueDepths(): Record<string, number> {
    return {
      discovery: this.discoveryQueue.length,
      validation: this.validationQueue.length,
      normalization: this.normalizationQueue.length,
      compliance: this.complianceQueue.length,
      scoring: this.scoringQueue.length,
      sku: this.skuQueue.length,
      optimization: this.optimizationQueue.length,
      listing: this.listingQueue.length,
    };
  }

  /**
   * Add products directly (bypass discovery)
   */
  async addProducts(products: Array<{
    id: string;
    title: string;
    asin?: string;
    sourceUrl?: string;
    price?: number;
    category?: string;
  }>): Promise<void> {
    for (const product of products) {
      const pipelineProduct: PipelineProduct = {
        id: product.id,
        stage: 'validating',
        sourceType: 'manual',
        sourceId: product.id,
        rawData: product,
        createdAt: new Date(),
        stageTimings: {} as Record<PipelineStage, number>,
        errors: [],
        retryCount: 0,
      };

      this.validationQueue.push(pipelineProduct);
    }
  }

  // Private methods

  /**
   * Initialize metrics
   */
  private initializeMetrics(): PipelineMetrics {
    return {
      status: 'idle',
      currentStage: 'idle',
      runningTimeMs: 0,
      productsDiscovered: 0,
      productsValidated: 0,
      productsNormalized: 0,
      productsCompliant: 0,
      skusGenerated: 0,
      productsQueued: 0,
      discoveryRate: 0,
      processingRate: 0,
      outputRate: 0,
      cacheHitRate: 0,
      validationPassRate: 0,
      compliancePassRate: 0,
      overallConversionRate: 0,
      totalErrors: 0,
      errorsByStage: {
        idle: 0,
        discovering: 0,
        validating: 0,
        normalizing: 0,
        compliance_checking: 0,
        scoring: 0,
        generating_skus: 0,
        optimizing: 0,
        queueing: 0,
      },
      estimatedDailyOutput: 0,
      onTrackForTarget: false,
    };
  }

  /**
   * Initialize discovery sources
   */
  private async initializeDiscovery(sources: DiscoverySource[]): Promise<void> {
    // Sort by priority
    sources.sort((a, b) => b.priority - a.priority);

    for (const source of sources) {
      // Queue discovery tasks
      if (source.type === 'zik_search') {
        await this.queueZikSearch(source.config, source.quota);
      } else if (source.type === 'zik_category') {
        await this.queueZikCategory(source.config, source.quota);
      }
    }
  }

  /**
   * Queue ZIK search discovery
   */
  private async queueZikSearch(config: {
    query: string;
    minSold?: number;
    maxResults?: number;
  }, quota?: number): Promise<void> {
    const zikCache = getZikCache();

    // Check cache first
    const cached = await zikCache.getSearchResults(config);
    if (cached) {
      this.addDiscoveredProducts(cached, 'zik');
      return;
    }

    // Queue research job
    const queue = getResearchQueue();
    await queue.enqueue('zik_search', config, {
      priority: QueuePriority.HIGH,
    });
  }

  /**
   * Queue ZIK category discovery
   */
  private async queueZikCategory(config: {
    categoryId: string;
    depth?: number;
  }, quota?: number): Promise<void> {
    const queue = getResearchQueue();
    await queue.enqueue('zik_category', config, {
      priority: QueuePriority.NORMAL,
    });
  }

  /**
   * Add discovered products to pipeline
   */
  private addDiscoveredProducts(products: any[], sourceType: 'zik' | 'keepa' | 'manual'): void {
    for (const product of products) {
      const pipelineProduct: PipelineProduct = {
        id: `pp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stage: 'validating',
        sourceType,
        sourceId: product.id || product.asin || product.ebayItemId,
        rawData: product,
        createdAt: new Date(),
        stageTimings: {
          idle: 0,
          discovering: Date.now() - this.startTime,
          validating: 0,
          normalizing: 0,
          compliance_checking: 0,
          scoring: 0,
          generating_skus: 0,
          optimizing: 0,
          queueing: 0,
        },
        errors: [],
        retryCount: 0,
      };

      this.validationQueue.push(pipelineProduct);
      this.metrics.productsDiscovered++;
    }
  }

  /**
   * Process all pipeline stages
   */
  private async processAllStages(): Promise<void> {
    if (!this.isRunning || this.isPaused) return;

    // Process stages in parallel
    await Promise.all([
      this.processValidationStage(),
      this.processNormalizationStage(),
      this.processComplianceStage(),
      this.processScoringStage(),
      this.processSkuGenerationStage(),
      this.processOptimizationStage(),
      this.processListingQueueStage(),
    ]);

    // Checkpoint if needed
    if (
      this.config.enableCheckpointing &&
      Date.now() - this.lastCheckpoint > this.config.checkpointIntervalMs
    ) {
      await this.saveCheckpoint();
      this.lastCheckpoint = Date.now();
    }
  }

  /**
   * Process validation stage (Keepa lookups)
   */
  private async processValidationStage(): Promise<void> {
    if (this.activeValidations >= this.config.maxConcurrentValidations) return;
    if (this.validationQueue.length === 0) return;

    const batch = this.validationQueue.splice(0, this.config.validationBatchSize);
    this.activeValidations++;

    try {
      const keepaCache = getKeepaCache();
      const keepaProcessor = getKeepaProcessor();

      // Extract ASINs
      const asins = batch
        .map(p => p.rawData.asin || this.extractAsin(p.rawData))
        .filter(Boolean) as string[];

      // Check cache
      const cached = await keepaCache.batchGetProducts(asins);

      // Lookup uncached
      const uncachedAsins = asins.filter(asin => !cached.has(asin));
      let lookupResults = new Map<string, any>();

      if (uncachedAsins.length > 0) {
        lookupResults = await keepaProcessor.lookupBatch(uncachedAsins);

        // Cache results
        const toCache = Array.from(lookupResults.entries())
          .map(([asin, data]) => ({ asin, data }));
        await keepaCache.batchSetProducts(toCache);
      }

      // Merge results and move to next stage
      for (const product of batch) {
        const asin = product.rawData.asin || this.extractAsin(product.rawData);
        const keepaData = cached.get(asin) || lookupResults.get(asin);

        if (keepaData) {
          product.keepaData = keepaData;
          product.stage = 'normalizing';
          this.normalizationQueue.push(product);
          this.metrics.productsValidated++;
        } else {
          // Validation failed
          product.errors.push('No Keepa data found');
          this.metrics.errorsByStage.validating++;
        }
      }
    } catch (error) {
      // Return to queue for retry
      for (const product of batch) {
        product.retryCount++;
        if (product.retryCount < 3) {
          this.validationQueue.push(product);
        } else {
          this.metrics.errorsByStage.validating++;
        }
      }
    } finally {
      this.activeValidations--;
    }
  }

  /**
   * Process normalization stage (Claude API)
   */
  private async processNormalizationStage(): Promise<void> {
    if (this.activeNormalizations >= this.config.maxConcurrentNormalizations) return;
    if (this.normalizationQueue.length === 0) return;

    const batch = this.normalizationQueue.splice(0, this.config.normalizationBatchSize);
    this.activeNormalizations++;

    try {
      const normalizationProcessor = getNormalizationProcessor();

      const products = batch.map(p => ({
        id: p.id,
        title: p.rawData.title || p.keepaData?.title,
        brand: p.rawData.brand || p.keepaData?.brand,
        category: p.rawData.category || p.keepaData?.category,
        description: p.rawData.description,
        price: p.keepaData?.buyBoxPrice || p.rawData.price,
        asin: p.rawData.asin,
      }));

      const results = await normalizationProcessor.normalizeBatch(products);

      for (const product of batch) {
        const normalized = results.get(product.id);
        if (normalized) {
          product.normalizedData = normalized;
          product.stage = 'compliance_checking';
          this.complianceQueue.push(product);
          this.metrics.productsNormalized++;
        } else {
          product.errors.push('Normalization failed');
          this.metrics.errorsByStage.normalizing++;
        }
      }
    } catch (error) {
      for (const product of batch) {
        product.retryCount++;
        if (product.retryCount < 3) {
          this.normalizationQueue.push(product);
        } else {
          this.metrics.errorsByStage.normalizing++;
        }
      }
    } finally {
      this.activeNormalizations--;
    }
  }

  /**
   * Process compliance stage
   */
  private async processComplianceStage(): Promise<void> {
    if (this.complianceQueue.length === 0) return;

    const batch = this.complianceQueue.splice(0, this.config.complianceBatchSize);

    try {
      const complianceProcessor = getComplianceProcessor();

      const items = batch.map(p => ({
        id: p.id,
        title: p.normalizedData?.normalizedTitle || p.rawData.title,
        description: p.normalizedData?.description || p.rawData.description,
        category: p.normalizedData?.normalizedCategory,
      }));

      const results = await complianceProcessor.checkBatch(items);

      for (const product of batch) {
        const compliance = results.get(product.id);
        if (compliance) {
          product.complianceResult = compliance;

          if (compliance.isCompliant || compliance.canAutoFix) {
            product.stage = 'scoring';
            this.scoringQueue.push(product);
            this.metrics.productsCompliant++;
          } else {
            product.errors.push(`Compliance failed: ${compliance.riskLevel}`);
            this.metrics.errorsByStage.compliance_checking++;
          }
        }
      }
    } catch (error) {
      this.metrics.errorsByStage.compliance_checking += batch.length;
    }
  }

  /**
   * Process scoring stage
   */
  private async processScoringStage(): Promise<void> {
    if (this.scoringQueue.length === 0) return;

    const batch = this.scoringQueue.splice(0, 50);

    for (const product of batch) {
      try {
        // Calculate quality score
        product.qualityScore = this.calculateQualityScore(product);

        // Calculate Cassini score
        product.cassiniScore = this.calculateCassiniScore(product);

        // Check thresholds
        if (
          product.qualityScore >= this.config.minQualityScore &&
          product.cassiniScore >= this.config.minCassiniScore
        ) {
          product.stage = 'generating_skus';
          this.skuQueue.push(product);
        } else {
          product.errors.push(`Scores below threshold: quality=${product.qualityScore}, cassini=${product.cassiniScore}`);
          this.metrics.errorsByStage.scoring++;
        }
      } catch (error) {
        this.metrics.errorsByStage.scoring++;
      }
    }
  }

  /**
   * Process SKU generation stage
   * Includes pricing qualification ($11 min buy price, $2 min profit)
   */
  private async processSkuGenerationStage(): Promise<void> {
    if (this.skuQueue.length === 0) return;

    const batch = this.skuQueue.splice(0, this.config.skuGenerationBatchSize);

    for (const product of batch) {
      try {
        const sku = this.generateSku(product);

        // No valid cost price
        if (!sku) {
          product.errors.push('No valid cost price available');
          this.metrics.errorsByStage.generating_skus++;
          continue;
        }

        // Failed pricing qualification
        if (!sku.qualified) {
          product.errors.push(`Pricing disqualified: ${sku.disqualifyReason}`);
          this.metrics.errorsByStage.generating_skus++;
          continue;
        }

        product.skuData = sku;
        product.stage = 'optimizing';
        this.optimizationQueue.push(product);
        this.metrics.skusGenerated++;
      } catch (error) {
        this.metrics.errorsByStage.generating_skus++;
      }
    }
  }

  /**
   * Process optimization stage
   */
  private async processOptimizationStage(): Promise<void> {
    if (this.optimizationQueue.length === 0) return;

    const batch = this.optimizationQueue.splice(0, 50);

    // Import optimizer
    const { ListingOptimizer } = await import('@/lib/optimization/listing-optimizer');
    const optimizer = new ListingOptimizer({ tier: 'standard' });

    for (const product of batch) {
      try {
        const result = optimizer.optimizeListing(
          product.normalizedData?.normalizedTitle || product.rawData.title,
          product.normalizedData?.description || product.rawData.description || ''
        );

        product.optimizedData = {
          optimizedTitle: result.title.optimizedTitle,
          optimizedDescription: result.description.optimizedDescription,
          canList: result.canList,
          overallScore: result.overallScore,
        };

        if (result.canList) {
          product.stage = 'queueing';
          this.listingQueue.push(product);
        } else {
          product.errors.push(`Cannot list: ${result.blockers.join(', ')}`);
          this.metrics.errorsByStage.optimizing++;
        }
      } catch (error) {
        this.metrics.errorsByStage.optimizing++;
      }
    }
  }

  /**
   * Process listing queue stage
   */
  private async processListingQueueStage(): Promise<void> {
    if (this.listingQueue.length === 0) return;

    const batch = this.listingQueue.splice(0, 100);

    // Save to database as ready-to-list SKUs
    const skusToInsert = batch.map(product => ({
      normalized_product_id: product.id,
      sku_code: product.skuData.skuCode,
      optimized_title: product.optimizedData.optimizedTitle,
      optimized_description: product.optimizedData.optimizedDescription,
      cost_price: product.skuData.costPrice,
      sell_price: product.skuData.sellPrice,
      net_profit: product.skuData.netProfit,
      price_band: product.skuData.priceBand,
      quality_score: product.qualityScore,
      cassini_score: product.cassiniScore,
      status: 'ready',
      pipeline_data: {
        sourceType: product.sourceType,
        sourceId: product.sourceId,
        processingTimeMs: Date.now() - product.createdAt.getTime(),
        minProfitMet: product.skuData.netProfit >= 2.00,
      },
    }));

    try {
      await supabase
        .from('skus')
        .insert(skusToInsert);

      this.metrics.productsQueued += batch.length;

      // Track for throughput calculation
      this.metricsHistory.push({
        timestamp: Date.now(),
        produced: batch.length,
      });
    } catch (error) {
      this.metrics.errorsByStage.queueing += batch.length;
    }
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(product: PipelineProduct): number {
    let score = 50;

    // Keepa data signals
    if (product.keepaData) {
      const keepa = product.keepaData;

      // Sales rank (lower is better)
      if (keepa.salesRank < 10000) score += 20;
      else if (keepa.salesRank < 50000) score += 15;
      else if (keepa.salesRank < 100000) score += 10;

      // Review count
      if (keepa.reviewCount > 1000) score += 15;
      else if (keepa.reviewCount > 100) score += 10;
      else if (keepa.reviewCount > 10) score += 5;

      // Rating
      if (keepa.rating >= 4.5) score += 10;
      else if (keepa.rating >= 4.0) score += 7;
      else if (keepa.rating >= 3.5) score += 3;
    }

    // Normalization quality
    if (product.normalizedData?.confidenceScore) {
      score += product.normalizedData.confidenceScore * 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate Cassini score
   */
  private calculateCassiniScore(product: PipelineProduct): number {
    let score = 50;

    const title = product.normalizedData?.normalizedTitle || product.rawData.title || '';

    // Title length (75-80 optimal)
    const length = title.length;
    if (length >= 75 && length <= 80) score += 15;
    else if (length >= 60 && length < 75) score += 8;
    else if (length < 40) score -= 10;

    // No spam terms
    const spamTerms = ['l@@k', 'wow', 'amazing', 'best', 'cheap', '!!!'];
    const hasSpam = spamTerms.some(term => title.toLowerCase().includes(term));
    if (!hasSpam) score += 10;

    // Has brand
    if (product.normalizedData?.normalizedBrand) score += 5;

    // Compliance passed
    if (product.complianceResult?.isCompliant) score += 15;

    // Item specifics
    if (product.normalizedData?.specifications) {
      const specCount = Object.keys(product.normalizedData.specifications).length;
      if (specCount >= 10) score += 10;
      else if (specCount >= 5) score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Generate SKU with proper pricing
   */
  private generateSku(product: PipelineProduct): {
    skuCode: string;
    sellPrice: number;
    costPrice: number;
    netProfit: number;
    priceBand: string;
    qualified: boolean;
    disqualifyReason?: string;
  } | null {
    // Import pricing engine
    const {
      calculateSellPrice,
      checkProductQualification,
      DEFAULT_PRICING_CONFIG,
    } = require('@/lib/pricing');

    const category = (product.normalizedData?.normalizedCategory || 'GEN').slice(0, 3).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();

    const costPrice = product.keepaData?.buyBoxPrice || product.rawData.price || 0;

    // Skip products without valid cost price
    if (!costPrice || costPrice <= 0) {
      return null;
    }

    // Get sales volume for high-volume exception check
    const salesPerMonth = product.keepaData?.monthlySales ||
      product.rawData.soldCount ||
      product.rawData.salesPerMonth ||
      0;

    // Check product qualification ($11 min, high-volume exception)
    const qualification = checkProductQualification({
      costPrice,
      salesPerMonth,
    });

    if (!qualification.qualified) {
      return {
        skuCode: `${category}-${timestamp}-${random}`,
        sellPrice: 0,
        costPrice,
        netProfit: 0,
        priceBand: 'disqualified',
        qualified: false,
        disqualifyReason: qualification.reason,
      };
    }

    // Calculate optimal sell price with $2 minimum profit
    const pricing = calculateSellPrice({
      costPrice,
      salesPerMonth,
      competitorLowestPrice: product.rawData.competitorPrice,
    });

    // Determine price band
    let priceBand = 'mid';
    if (pricing.sellPrice < 15) priceBand = 'budget';
    else if (pricing.sellPrice < 30) priceBand = 'low';
    else if (pricing.sellPrice < 75) priceBand = 'mid';
    else if (pricing.sellPrice < 150) priceBand = 'high';
    else priceBand = 'premium';

    return {
      skuCode: `${category}-${timestamp}-${random}`,
      sellPrice: pricing.sellPrice,
      costPrice: pricing.costPrice,
      netProfit: pricing.netProfit,
      priceBand,
      qualified: true,
    };
  }

  /**
   * Extract ASIN from various sources
   */
  private extractAsin(data: any): string | null {
    if (data.asin) return data.asin;
    if (data.amazonUrl) {
      const match = data.amazonUrl.match(/\/dp\/([A-Z0-9]{10})/);
      return match?.[1] || null;
    }
    return null;
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    const now = Date.now();
    this.metrics.runningTimeMs = now - this.startTime;

    // Calculate rates (per minute)
    const oneMinuteAgo = now - 60000;
    const recentProduced = this.metricsHistory
      .filter(m => m.timestamp > oneMinuteAgo)
      .reduce((sum, m) => sum + m.produced, 0);

    this.metrics.outputRate = recentProduced;

    // Estimate daily output
    const hoursRunning = this.metrics.runningTimeMs / (1000 * 60 * 60);
    if (hoursRunning > 0.1) {  // At least 6 minutes
      const hourlyRate = this.metrics.productsQueued / hoursRunning;
      this.metrics.estimatedDailyOutput = Math.round(hourlyRate * 24);
    }

    // Check if on track
    this.metrics.onTrackForTarget = this.metrics.estimatedDailyOutput >= this.config.targetProductsPerDay * 0.9;

    // Calculate conversion rate
    if (this.metrics.productsDiscovered > 0) {
      this.metrics.overallConversionRate = this.metrics.productsQueued / this.metrics.productsDiscovered;
    }

    // Validation pass rate
    if (this.metrics.productsDiscovered > 0) {
      this.metrics.validationPassRate = this.metrics.productsValidated / this.metrics.productsDiscovered;
    }

    // Compliance pass rate
    if (this.metrics.productsNormalized > 0) {
      this.metrics.compliancePassRate = this.metrics.productsCompliant / this.metrics.productsNormalized;
    }

    // Cache hit rate
    const cacheStats = getAllCacheStats();
    this.metrics.cacheHitRate = cacheStats.combined.overallHitRate;

    // Find bottleneck
    const depths = this.getQueueDepths();
    const maxDepth = Math.max(...Object.values(depths));
    if (maxDepth > 100) {
      const bottleneckStage = Object.entries(depths).find(([, v]) => v === maxDepth)?.[0];
      this.metrics.bottleneck = bottleneckStage;
    }

    // Total errors
    this.metrics.totalErrors = Object.values(this.metrics.errorsByStage).reduce((a, b) => a + b, 0);

    // Clean old metrics history
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > now - 300000);
  }

  /**
   * Save checkpoint
   */
  private async saveCheckpoint(): Promise<void> {
    try {
      await supabase
        .from('pipeline_checkpoints')
        .upsert({
          pipeline_id: 'high_throughput_main',
          metrics: this.metrics,
          queue_depths: this.getQueueDepths(),
          timestamp: new Date().toISOString(),
        });
    } catch (error) {
      console.error('[Pipeline] Checkpoint save failed:', error);
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

let orchestrator: HighThroughputOrchestrator | null = null;

export function getOrchestrator(config?: Partial<PipelineConfig>): HighThroughputOrchestrator {
  if (!orchestrator) {
    orchestrator = new HighThroughputOrchestrator(config);
  }
  return orchestrator;
}

/**
 * Quick start for research pipeline
 */
export async function startResearchPipeline(
  sources: DiscoverySource[],
  config?: Partial<PipelineConfig>
): Promise<HighThroughputOrchestrator> {
  const orch = getOrchestrator(config);
  await orch.start(sources);
  return orch;
}

/**
 * Get pipeline status
 */
export function getPipelineStatus(): {
  metrics: PipelineMetrics;
  queueDepths: Record<string, number>;
  cacheStats: any;
  throughputAnalysis: any;
} {
  const orch = getOrchestrator();
  return {
    metrics: orch.getMetrics(),
    queueDepths: orch.getQueueDepths(),
    cacheStats: getAllCacheStats(),
    throughputAnalysis: calculateMaxThroughput(),
  };
}
