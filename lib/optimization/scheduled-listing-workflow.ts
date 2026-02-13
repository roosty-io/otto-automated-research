/**
 * Scheduled Listing Workflow
 *
 * Manages the draft-to-live listing workflow with a 12-hour delay to work around
 * AutoDS's known "product does not exist" error when listings are published immediately.
 *
 * Workflow:
 * 1. Product is researched and validated
 * 2. Title and description are optimized
 * 3. Product is added to AutoDS as a DRAFT
 * 4. Listing is scheduled to go live 12 hours later
 * 5. Background job activates the listing when scheduled
 *
 * This delay allows AutoDS to sync the product data before listing goes live.
 */

import {
  ListingOptimizer,
  ListingOptimizationResult,
  OptimizationTier,
} from './listing-optimizer';

// Listing states
export type ListingState =
  | 'pending_optimization'
  | 'optimization_complete'
  | 'draft_created'
  | 'scheduled'
  | 'activation_pending'
  | 'active'
  | 'failed'
  | 'blocked'; // Compliance issues prevent listing

// Scheduled listing record
export interface ScheduledListing {
  id: string;
  productId: string;
  sku: string;
  storeId: string;
  state: ListingState;

  // Original content
  originalTitle: string;
  originalDescription: string;

  // Optimized content
  optimizedTitle?: string;
  optimizedDescription?: string;
  optimizationResult?: ListingOptimizationResult;

  // Scheduling
  createdAt: Date;
  draftCreatedAt?: Date;
  scheduledActivationAt?: Date;
  activatedAt?: Date;

  // AutoDS integration
  autodsProductId?: string;
  autodsDraftId?: string;

  // Status tracking
  failureReason?: string;
  blockers?: string[];
  retryCount: number;
  maxRetries: number;

  // Metadata
  tier: OptimizationTier;
  category?: string;
  source: 'manual' | 'pipeline' | 'bulk';
}

// Workflow configuration
export interface WorkflowConfig {
  // Delay before activation (default 12 hours)
  activationDelayMs: number;

  // Optimization settings
  tier: OptimizationTier;
  strictCompliance: boolean;

  // Retry settings
  maxRetries: number;
  retryDelayMs: number;

  // Batch settings
  maxConcurrentDrafts: number;
  batchDelayMs: number;

  // New listing boost strategy
  staggerListings: boolean;
  staggerIntervalMs: number;
}

// Default configuration
const DEFAULT_CONFIG: WorkflowConfig = {
  activationDelayMs: 12 * 60 * 60 * 1000, // 12 hours
  tier: 'standard',
  strictCompliance: true,
  maxRetries: 3,
  retryDelayMs: 5 * 60 * 1000, // 5 minutes
  maxConcurrentDrafts: 10,
  batchDelayMs: 2000, // 2 seconds between drafts
  staggerListings: true,
  staggerIntervalMs: 30 * 60 * 1000, // 30 minutes between activations for boost spread
};

// Workflow result
export interface WorkflowResult {
  success: boolean;
  listing: ScheduledListing;
  message: string;
  nextAction?: 'wait' | 'retry' | 'manual_review' | 'activate';
  nextActionAt?: Date;
}

// Batch workflow result
export interface BatchWorkflowResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  blocked: number;
  listings: WorkflowResult[];
  nextBatchActivationAt?: Date;
}

/**
 * Scheduled Listing Workflow Manager
 */
export class ScheduledListingWorkflow {
  private config: WorkflowConfig;
  private optimizer: ListingOptimizer;
  private pendingListings: Map<string, ScheduledListing> = new Map();

  constructor(config: Partial<WorkflowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.optimizer = new ListingOptimizer({
      tier: this.config.tier,
      strictMode: this.config.strictCompliance,
    });
  }

  /**
   * Start the workflow for a single product
   */
  async startWorkflow(input: {
    productId: string;
    sku: string;
    storeId: string;
    title: string;
    description: string;
    category?: string;
    source?: 'manual' | 'pipeline' | 'bulk';
    productName?: string;
    features?: string[];
    specifications?: Record<string, string>;
  }): Promise<WorkflowResult> {
    // Create listing record
    const listing: ScheduledListing = {
      id: generateId(),
      productId: input.productId,
      sku: input.sku,
      storeId: input.storeId,
      state: 'pending_optimization',
      originalTitle: input.title,
      originalDescription: input.description,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      tier: this.config.tier,
      category: input.category,
      source: input.source || 'pipeline',
    };

    this.pendingListings.set(listing.id, listing);

    // Step 1: Optimize listing
    const optimizationResult = this.optimizer.optimizeListing(
      input.title,
      input.description,
      {
        productName: input.productName,
        features: input.features,
        specifications: input.specifications,
      }
    );

    listing.optimizedTitle = optimizationResult.title.optimizedTitle;
    listing.optimizedDescription = optimizationResult.description.optimizedDescription;
    listing.optimizationResult = optimizationResult;

    // Check if listing can proceed
    if (!optimizationResult.canList) {
      listing.state = 'blocked';
      listing.blockers = optimizationResult.blockers;

      return {
        success: false,
        listing,
        message: `Listing blocked due to compliance issues: ${optimizationResult.blockers.join('; ')}`,
        nextAction: 'manual_review',
      };
    }

    listing.state = 'optimization_complete';

    // Step 2: Create draft in AutoDS (simulated - actual implementation would call AutoDS API)
    try {
      const draftResult = await this.createAutoDsDraft(listing);
      listing.autodsDraftId = draftResult.draftId;
      listing.autodsProductId = draftResult.productId;
      listing.draftCreatedAt = new Date();
      listing.state = 'draft_created';
    } catch (error) {
      listing.state = 'failed';
      listing.failureReason = `Failed to create draft: ${error instanceof Error ? error.message : 'Unknown error'}`;
      listing.retryCount++;

      if (listing.retryCount < listing.maxRetries) {
        return {
          success: false,
          listing,
          message: listing.failureReason,
          nextAction: 'retry',
          nextActionAt: new Date(Date.now() + this.config.retryDelayMs),
        };
      }

      return {
        success: false,
        listing,
        message: listing.failureReason,
        nextAction: 'manual_review',
      };
    }

    // Step 3: Schedule activation
    const activationTime = new Date(Date.now() + this.config.activationDelayMs);

    // Apply staggering if enabled
    if (this.config.staggerListings) {
      const existingScheduled = Array.from(this.pendingListings.values())
        .filter(l => l.state === 'scheduled')
        .length;
      const staggerOffset = existingScheduled * this.config.staggerIntervalMs;
      activationTime.setTime(activationTime.getTime() + staggerOffset);
    }

    listing.scheduledActivationAt = activationTime;
    listing.state = 'scheduled';

    return {
      success: true,
      listing,
      message: `Listing scheduled for activation at ${activationTime.toISOString()}`,
      nextAction: 'wait',
      nextActionAt: activationTime,
    };
  }

  /**
   * Process batch of products
   */
  async startBatchWorkflow(inputs: Array<{
    productId: string;
    sku: string;
    storeId: string;
    title: string;
    description: string;
    category?: string;
    productName?: string;
    features?: string[];
  }>): Promise<BatchWorkflowResult> {
    const results: WorkflowResult[] = [];
    let successful = 0;
    let failed = 0;
    let blocked = 0;
    let nextActivation: Date | undefined;

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];

      // Add delay between drafts to avoid rate limiting
      if (i > 0) {
        await sleep(this.config.batchDelayMs);
      }

      // Respect concurrent draft limit
      const activeDrafts = Array.from(this.pendingListings.values())
        .filter(l => l.state === 'draft_created' || l.state === 'scheduled')
        .length;

      if (activeDrafts >= this.config.maxConcurrentDrafts) {
        // Wait for some drafts to be processed
        await sleep(this.config.retryDelayMs);
      }

      const result = await this.startWorkflow({
        ...input,
        source: 'bulk',
      });

      results.push(result);

      if (result.success) {
        successful++;
        if (!nextActivation || (result.nextActionAt && result.nextActionAt < nextActivation)) {
          nextActivation = result.nextActionAt;
        }
      } else if (result.listing.state === 'blocked') {
        blocked++;
      } else {
        failed++;
      }
    }

    return {
      totalProcessed: inputs.length,
      successful,
      failed,
      blocked,
      listings: results,
      nextBatchActivationAt: nextActivation,
    };
  }

  /**
   * Check and activate listings that are ready
   */
  async processScheduledActivations(): Promise<{
    activated: number;
    failed: number;
    pending: number;
    results: WorkflowResult[];
  }> {
    const now = new Date();
    const results: WorkflowResult[] = [];
    let activated = 0;
    let failed = 0;
    let pending = 0;

    for (const [id, listing] of this.pendingListings) {
      if (listing.state !== 'scheduled') continue;

      if (!listing.scheduledActivationAt || listing.scheduledActivationAt > now) {
        pending++;
        continue;
      }

      // Time to activate
      listing.state = 'activation_pending';

      try {
        await this.activateAutoDsListing(listing);
        listing.state = 'active';
        listing.activatedAt = new Date();
        activated++;

        results.push({
          success: true,
          listing,
          message: 'Listing activated successfully',
        });

        // Remove from pending after successful activation
        this.pendingListings.delete(id);
      } catch (error) {
        listing.state = 'failed';
        listing.failureReason = `Activation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        listing.retryCount++;
        failed++;

        if (listing.retryCount < listing.maxRetries) {
          // Reschedule
          listing.state = 'scheduled';
          listing.scheduledActivationAt = new Date(Date.now() + this.config.retryDelayMs);

          results.push({
            success: false,
            listing,
            message: listing.failureReason,
            nextAction: 'retry',
            nextActionAt: listing.scheduledActivationAt,
          });
        } else {
          results.push({
            success: false,
            listing,
            message: listing.failureReason,
            nextAction: 'manual_review',
          });
        }
      }
    }

    return { activated, failed, pending, results };
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(): {
    total: number;
    byState: Record<ListingState, number>;
    nextActivation?: Date;
    blockedListings: ScheduledListing[];
  } {
    const byState: Record<ListingState, number> = {
      pending_optimization: 0,
      optimization_complete: 0,
      draft_created: 0,
      scheduled: 0,
      activation_pending: 0,
      active: 0,
      failed: 0,
      blocked: 0,
    };

    let nextActivation: Date | undefined;
    const blockedListings: ScheduledListing[] = [];

    for (const listing of this.pendingListings.values()) {
      byState[listing.state]++;

      if (listing.state === 'blocked') {
        blockedListings.push(listing);
      }

      if (listing.state === 'scheduled' && listing.scheduledActivationAt) {
        if (!nextActivation || listing.scheduledActivationAt < nextActivation) {
          nextActivation = listing.scheduledActivationAt;
        }
      }
    }

    return {
      total: this.pendingListings.size,
      byState,
      nextActivation,
      blockedListings,
    };
  }

  /**
   * Get listing by ID
   */
  getListing(id: string): ScheduledListing | undefined {
    return this.pendingListings.get(id);
  }

  /**
   * Cancel a scheduled listing
   */
  cancelListing(id: string): boolean {
    const listing = this.pendingListings.get(id);
    if (!listing) return false;

    if (listing.state === 'active') {
      return false; // Can't cancel active listing
    }

    this.pendingListings.delete(id);
    return true;
  }

  /**
   * Retry a failed listing
   */
  async retryListing(id: string): Promise<WorkflowResult | null> {
    const listing = this.pendingListings.get(id);
    if (!listing || listing.state !== 'failed') return null;

    listing.retryCount = 0;
    listing.state = 'pending_optimization';
    listing.failureReason = undefined;

    return this.startWorkflow({
      productId: listing.productId,
      sku: listing.sku,
      storeId: listing.storeId,
      title: listing.originalTitle,
      description: listing.originalDescription,
      category: listing.category,
      source: listing.source,
    });
  }

  /**
   * Force activate a listing (bypass delay)
   */
  async forceActivate(id: string): Promise<WorkflowResult | null> {
    const listing = this.pendingListings.get(id);
    if (!listing) return null;

    if (listing.state === 'blocked') {
      return {
        success: false,
        listing,
        message: 'Cannot force activate blocked listing. Resolve compliance issues first.',
        nextAction: 'manual_review',
      };
    }

    try {
      await this.activateAutoDsListing(listing);
      listing.state = 'active';
      listing.activatedAt = new Date();
      this.pendingListings.delete(id);

      return {
        success: true,
        listing,
        message: 'Listing force activated successfully',
      };
    } catch (error) {
      listing.failureReason = `Force activation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;

      return {
        success: false,
        listing,
        message: listing.failureReason,
        nextAction: 'manual_review',
      };
    }
  }

  /**
   * Create draft in AutoDS (placeholder - implement actual API call)
   */
  private async createAutoDsDraft(listing: ScheduledListing): Promise<{
    draftId: string;
    productId: string;
  }> {
    // TODO: Implement actual AutoDS API integration
    // This would call AutoDS API to:
    // 1. Create product with optimized title and description
    // 2. Set status to draft/unpublished
    // 3. Return the AutoDS product ID and draft ID

    // Simulated response
    return {
      draftId: `draft_${listing.id}`,
      productId: `autods_${listing.productId}`,
    };
  }

  /**
   * Activate listing in AutoDS (placeholder - implement actual API call)
   */
  private async activateAutoDsListing(listing: ScheduledListing): Promise<void> {
    // TODO: Implement actual AutoDS API integration
    // This would call AutoDS API to:
    // 1. Change listing status from draft to active/published
    // 2. Trigger the actual eBay listing creation

    // Simulated - in real implementation:
    // await autodsApi.activateListing(listing.autodsDraftId);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WorkflowConfig>): void {
    this.config = { ...this.config, ...config };
    this.optimizer = new ListingOptimizer({
      tier: this.config.tier,
      strictMode: this.config.strictCompliance,
    });
  }

  /**
   * Export pending listings for persistence
   */
  exportPendingListings(): ScheduledListing[] {
    return Array.from(this.pendingListings.values());
  }

  /**
   * Import listings (for persistence recovery)
   */
  importListings(listings: ScheduledListing[]): void {
    for (const listing of listings) {
      this.pendingListings.set(listing.id, listing);
    }
  }
}

// Helper functions
function generateId(): string {
  return `sl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Convenience function to create workflow instance
export function createScheduledWorkflow(config?: Partial<WorkflowConfig>): ScheduledListingWorkflow {
  return new ScheduledListingWorkflow(config);
}

// Job types for background processing
export interface ScheduledListingJob {
  type: 'create_draft' | 'activate_listing' | 'process_batch' | 'check_activations';
  listingId?: string;
  listingIds?: string[];
  scheduledAt: Date;
  priority: number;
}

/**
 * Generate activation jobs from pending listings
 */
export function generateActivationJobs(workflow: ScheduledListingWorkflow): ScheduledListingJob[] {
  const status = workflow.getWorkflowStatus();
  const jobs: ScheduledListingJob[] = [];

  // Generate check activations job
  if (status.byState.scheduled > 0 && status.nextActivation) {
    jobs.push({
      type: 'check_activations',
      scheduledAt: status.nextActivation,
      priority: 1,
    });
  }

  return jobs;
}
