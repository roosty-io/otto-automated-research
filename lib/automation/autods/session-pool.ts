/**
 * AutoDS Browser Session Pool
 *
 * Manages a pool of authenticated browser sessions for AutoDS automation.
 * Since AutoDS doesn't have a public API, we use Puppeteer-based automation
 * with session pooling to maximize throughput.
 *
 * Features:
 * - Connection pooling with health monitoring
 * - Automatic session refresh and re-authentication
 * - Load balancing across sessions
 * - Session affinity for store-specific operations
 * - Graceful degradation on failures
 */

import { EventEmitter } from 'events';

// Session states
export type SessionState = 'initializing' | 'ready' | 'busy' | 'stale' | 'error' | 'closed';

// Session configuration
export interface SessionConfig {
  id: string;
  email: string;
  password: string;
  proxyUrl?: string;
  userAgent?: string;
  storeAffinity?: string[];  // Store IDs this session should prefer
}

// Session metrics
export interface SessionMetrics {
  requestsHandled: number;
  errorsCount: number;
  avgResponseTimeMs: number;
  lastActivityAt: number;
  uptime: number;
}

// Session wrapper
export interface PooledSession {
  id: string;
  config: SessionConfig;
  state: SessionState;
  browser: any;  // Puppeteer Browser
  page: any;     // Puppeteer Page
  cookies: any[];
  metrics: SessionMetrics;
  createdAt: Date;
  lastUsedAt: Date;
  currentTask?: string;
}

// Pool configuration
export interface PoolConfig {
  minSessions: number;      // Minimum sessions to maintain
  maxSessions: number;      // Maximum concurrent sessions
  sessionTtlMs: number;     // Session lifetime before refresh
  idleTimeoutMs: number;    // Close idle sessions after this time
  healthCheckIntervalMs: number;
  maxRequestsPerSession: number;  // Refresh after N requests
  retryAttempts: number;
  retryDelayMs: number;
}

// Default pool configuration
const DEFAULT_POOL_CONFIG: PoolConfig = {
  minSessions: 2,
  maxSessions: 5,
  sessionTtlMs: 2 * 60 * 60 * 1000,    // 2 hours
  idleTimeoutMs: 30 * 60 * 1000,       // 30 minutes
  healthCheckIntervalMs: 60 * 1000,    // 1 minute
  maxRequestsPerSession: 500,
  retryAttempts: 3,
  retryDelayMs: 2000,
};

// Task types for session operations
export type AutoDsTaskType =
  | 'upload_product'
  | 'publish_draft'
  | 'update_price'
  | 'end_listing'
  | 'sync_sales'
  | 'get_orders'
  | 'bulk_upload'
  | 'bulk_publish';

// Task request
export interface TaskRequest {
  type: AutoDsTaskType;
  storeId?: string;
  payload: any;
  priority?: number;
  timeout?: number;
}

// Task result
export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
  sessionId: string;
  durationMs: number;
}

/**
 * AutoDS Session Pool Manager
 */
export class AutoDsSessionPool extends EventEmitter {
  private sessions: Map<string, PooledSession> = new Map();
  private sessionConfigs: SessionConfig[] = [];
  private config: PoolConfig;
  private taskQueue: Array<{
    request: TaskRequest;
    resolve: (result: TaskResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(configs: SessionConfig[], poolConfig: Partial<PoolConfig> = {}) {
    super();
    this.sessionConfigs = configs;
    this.config = { ...DEFAULT_POOL_CONFIG, ...poolConfig };
  }

  /**
   * Initialize the pool
   */
  async initialize(): Promise<void> {
    this.isRunning = true;

    // Create minimum sessions
    const initPromises: Promise<void>[] = [];
    for (let i = 0; i < Math.min(this.config.minSessions, this.sessionConfigs.length); i++) {
      initPromises.push(this.createSession(this.sessionConfigs[i]));
    }

    await Promise.allSettled(initPromises);

    // Start health checks
    this.startHealthChecks();

    // Start task processor
    this.processTaskQueue();

    this.emit('initialized', { sessionCount: this.sessions.size });
  }

  /**
   * Execute a task
   */
  async execute(request: TaskRequest): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ request, resolve, reject });
      this.processTaskQueue();
    });
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeBatch(requests: TaskRequest[]): Promise<TaskResult[]> {
    const promises = requests.map(request => this.execute(request));
    return Promise.all(promises);
  }

  /**
   * Get pool status
   */
  getStatus(): {
    totalSessions: number;
    readySessions: number;
    busySessions: number;
    errorSessions: number;
    queuedTasks: number;
    metrics: {
      totalRequests: number;
      totalErrors: number;
      avgResponseTimeMs: number;
    };
  } {
    let readySessions = 0;
    let busySessions = 0;
    let errorSessions = 0;
    let totalRequests = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;

    for (const session of this.sessions.values()) {
      switch (session.state) {
        case 'ready': readySessions++; break;
        case 'busy': busySessions++; break;
        case 'error': errorSessions++; break;
      }

      totalRequests += session.metrics.requestsHandled;
      totalErrors += session.metrics.errorsCount;
      totalResponseTime += session.metrics.avgResponseTimeMs * session.metrics.requestsHandled;
    }

    return {
      totalSessions: this.sessions.size,
      readySessions,
      busySessions,
      errorSessions,
      queuedTasks: this.taskQueue.length,
      metrics: {
        totalRequests,
        totalErrors,
        avgResponseTimeMs: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      },
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Close all sessions
    const closePromises = Array.from(this.sessions.values()).map(session =>
      this.closeSession(session.id)
    );

    await Promise.allSettled(closePromises);

    this.emit('shutdown');
  }

  // Private methods

  /**
   * Create a new session
   */
  private async createSession(config: SessionConfig): Promise<void> {
    const sessionId = config.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const session: PooledSession = {
      id: sessionId,
      config,
      state: 'initializing',
      browser: null,
      page: null,
      cookies: [],
      metrics: {
        requestsHandled: 0,
        errorsCount: 0,
        avgResponseTimeMs: 0,
        lastActivityAt: Date.now(),
        uptime: 0,
      },
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    try {
      // Initialize browser
      await this.initializeBrowser(session);

      // Authenticate
      await this.authenticate(session);

      session.state = 'ready';
      this.emit('session_ready', { sessionId });

    } catch (error) {
      session.state = 'error';
      this.emit('session_error', { sessionId, error });
      throw error;
    }
  }

  /**
   * Initialize Puppeteer browser
   */
  private async initializeBrowser(session: PooledSession): Promise<void> {
    const puppeteer = await import('puppeteer-extra');
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;

    puppeteer.default.use(StealthPlugin());

    const launchOptions: any = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    };

    // Add proxy if configured
    if (session.config.proxyUrl) {
      launchOptions.args.push(`--proxy-server=${session.config.proxyUrl}`);
    }

    session.browser = await puppeteer.default.launch(launchOptions);
    session.page = await session.browser.newPage();

    // Set user agent if configured
    if (session.config.userAgent) {
      await session.page.setUserAgent(session.config.userAgent);
    }

    // Set viewport
    await session.page.setViewport({ width: 1920, height: 1080 });

    // Enable request interception for optimization
    await session.page.setRequestInterception(true);
    session.page.on('request', (request: any) => {
      // Block unnecessary resources
      const blockedTypes = ['image', 'stylesheet', 'font', 'media'];
      if (blockedTypes.includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
  }

  /**
   * Authenticate with AutoDS
   */
  private async authenticate(session: PooledSession): Promise<void> {
    const { page, config } = session;

    // Check for existing cookies
    if (session.cookies.length > 0) {
      await page.setCookie(...session.cookies);

      // Verify session is still valid
      await page.goto('https://app.autods.com/dashboard', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Check if we're on dashboard (authenticated)
      const url = page.url();
      if (url.includes('/dashboard')) {
        return; // Session still valid
      }
    }

    // Need to login
    await page.goto('https://app.autods.com/login', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Fill login form
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.type('input[type="email"], input[name="email"]', config.email);
    await page.type('input[type="password"], input[name="password"]', config.password);

    // Click login button
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    // Verify login success
    const url = page.url();
    if (url.includes('/login')) {
      throw new Error('Login failed - still on login page');
    }

    // Save cookies
    session.cookies = await page.cookies();

    this.emit('session_authenticated', { sessionId: session.id });
  }

  /**
   * Get a session for a task
   */
  private async getSessionForTask(request: TaskRequest): Promise<PooledSession | null> {
    // If store-specific, prefer sessions with affinity
    if (request.storeId) {
      for (const session of this.sessions.values()) {
        if (
          session.state === 'ready' &&
          session.config.storeAffinity?.includes(request.storeId)
        ) {
          return session;
        }
      }
    }

    // Get any ready session
    for (const session of this.sessions.values()) {
      if (session.state === 'ready') {
        return session;
      }
    }

    // Try to create a new session if under max
    if (this.sessions.size < this.config.maxSessions) {
      const unusedConfig = this.sessionConfigs.find(
        config => !Array.from(this.sessions.values()).some(s => s.config.id === config.id)
      );

      if (unusedConfig) {
        try {
          await this.createSession(unusedConfig);
          return this.getSessionForTask(request);
        } catch {
          // Couldn't create session
        }
      }
    }

    return null;
  }

  /**
   * Process the task queue
   */
  private async processTaskQueue(): Promise<void> {
    if (!this.isRunning || this.taskQueue.length === 0) return;

    // Sort by priority
    this.taskQueue.sort((a, b) => (b.request.priority || 0) - (a.request.priority || 0));

    // Process as many tasks as we have sessions
    const processing: Promise<void>[] = [];

    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0];
      const session = await this.getSessionForTask(task.request);

      if (!session) {
        // No available sessions, wait
        break;
      }

      // Remove from queue and process
      this.taskQueue.shift();
      processing.push(this.processTask(session, task));
    }

    await Promise.allSettled(processing);
  }

  /**
   * Process a single task
   */
  private async processTask(
    session: PooledSession,
    task: {
      request: TaskRequest;
      resolve: (result: TaskResult) => void;
      reject: (error: Error) => void;
    }
  ): Promise<void> {
    const startTime = Date.now();
    session.state = 'busy';
    session.currentTask = task.request.type;

    try {
      // Execute the task
      const result = await this.executeTask(session, task.request);

      // Update metrics
      session.metrics.requestsHandled++;
      session.lastUsedAt = new Date();
      session.metrics.lastActivityAt = Date.now();

      const duration = Date.now() - startTime;
      session.metrics.avgResponseTimeMs =
        (session.metrics.avgResponseTimeMs * (session.metrics.requestsHandled - 1) + duration) /
        session.metrics.requestsHandled;

      session.state = 'ready';
      session.currentTask = undefined;

      task.resolve({
        success: true,
        data: result,
        sessionId: session.id,
        durationMs: duration,
      });

      // Check if session needs refresh
      if (session.metrics.requestsHandled >= this.config.maxRequestsPerSession) {
        this.refreshSession(session.id);
      }

    } catch (error) {
      session.metrics.errorsCount++;
      session.state = 'ready';
      session.currentTask = undefined;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      task.resolve({
        success: false,
        error: errorMessage,
        sessionId: session.id,
        durationMs: Date.now() - startTime,
      });

      // Check if session is broken
      if (session.metrics.errorsCount > 5) {
        this.refreshSession(session.id);
      }
    }

    // Process more tasks
    this.processTaskQueue();
  }

  /**
   * Execute a specific task type
   */
  private async executeTask(session: PooledSession, request: TaskRequest): Promise<any> {
    const { page } = session;
    const { type, payload } = request;

    switch (type) {
      case 'upload_product':
        return this.uploadProduct(page, payload);

      case 'publish_draft':
        return this.publishDraft(page, payload);

      case 'update_price':
        return this.updatePrice(page, payload);

      case 'end_listing':
        return this.endListing(page, payload);

      case 'sync_sales':
        return this.syncSales(page, payload);

      case 'get_orders':
        return this.getOrders(page, payload);

      case 'bulk_upload':
        return this.bulkUpload(page, payload);

      case 'bulk_publish':
        return this.bulkPublish(page, payload);

      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }

  // AutoDS automation methods

  private async uploadProduct(page: any, payload: {
    storeId: string;
    title: string;
    description: string;
    price: number;
    sourceUrl: string;
    images?: string[];
  }): Promise<{ productId: string; draftId: string }> {
    // Navigate to upload page
    await page.goto(`https://app.autods.com/products/add?store=${payload.storeId}`, {
      waitUntil: 'networkidle2',
    });

    // Fill product form
    await page.waitForSelector('input[name="title"]', { timeout: 10000 });
    await page.type('input[name="title"]', payload.title);

    // Set price
    await page.type('input[name="price"]', payload.price.toString());

    // Add source URL
    await page.type('input[name="sourceUrl"]', payload.sourceUrl);

    // Fill description if present
    if (payload.description) {
      const descriptionEditor = await page.$('[data-testid="description-editor"]');
      if (descriptionEditor) {
        await descriptionEditor.type(payload.description);
      }
    }

    // Submit form
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    // Extract product ID from URL or page
    const url = page.url();
    const productIdMatch = url.match(/products\/(\d+)/);

    return {
      productId: productIdMatch?.[1] || 'unknown',
      draftId: `draft_${Date.now()}`,
    };
  }

  private async publishDraft(page: any, payload: {
    draftId: string;
    storeId: string;
  }): Promise<{ listingId: string; ebayItemId: string }> {
    // Navigate to drafts
    await page.goto(`https://app.autods.com/drafts?store=${payload.storeId}`, {
      waitUntil: 'networkidle2',
    });

    // Find and select draft
    await page.waitForSelector(`[data-draft-id="${payload.draftId}"]`, { timeout: 10000 });
    await page.click(`[data-draft-id="${payload.draftId}"] input[type="checkbox"]`);

    // Click publish button
    await page.click('[data-action="publish"]');

    // Wait for publish confirmation
    await page.waitForSelector('.publish-success', { timeout: 60000 });

    // Get listing details
    const listingInfo = await page.evaluate(() => {
      const successElement = document.querySelector('.publish-success');
      return {
        listingId: successElement?.getAttribute('data-listing-id'),
        ebayItemId: successElement?.getAttribute('data-ebay-item-id'),
      };
    });

    return {
      listingId: listingInfo.listingId || 'unknown',
      ebayItemId: listingInfo.ebayItemId || 'unknown',
    };
  }

  private async updatePrice(page: any, payload: {
    listingId: string;
    newPrice: number;
  }): Promise<{ success: boolean }> {
    await page.goto(`https://app.autods.com/listings/${payload.listingId}`, {
      waitUntil: 'networkidle2',
    });

    // Update price field
    await page.waitForSelector('input[name="price"]', { timeout: 10000 });
    await page.$eval('input[name="price"]', (el: any) => el.value = '');
    await page.type('input[name="price"]', payload.newPrice.toString());

    // Save
    await page.click('button[type="submit"]');
    await page.waitForSelector('.save-success', { timeout: 30000 });

    return { success: true };
  }

  private async endListing(page: any, payload: {
    listingId: string;
    reason?: string;
  }): Promise<{ success: boolean }> {
    await page.goto(`https://app.autods.com/listings/${payload.listingId}`, {
      waitUntil: 'networkidle2',
    });

    // Click end listing button
    await page.click('[data-action="end-listing"]');

    // Confirm
    await page.waitForSelector('.confirm-dialog', { timeout: 5000 });
    await page.click('.confirm-dialog button.confirm');

    await page.waitForSelector('.end-success', { timeout: 30000 });

    return { success: true };
  }

  private async syncSales(page: any, payload: {
    storeId: string;
    dateRange?: { from: string; to: string };
  }): Promise<{ orders: any[] }> {
    await page.goto(`https://app.autods.com/orders?store=${payload.storeId}`, {
      waitUntil: 'networkidle2',
    });

    // Wait for orders to load
    await page.waitForSelector('.orders-table', { timeout: 10000 });

    // Extract orders
    const orders = await page.evaluate(() => {
      const rows = document.querySelectorAll('.orders-table tr');
      return Array.from(rows).slice(1).map((row: any) => ({
        orderId: row.querySelector('[data-field="orderId"]')?.textContent,
        itemTitle: row.querySelector('[data-field="title"]')?.textContent,
        salePrice: row.querySelector('[data-field="salePrice"]')?.textContent,
        profit: row.querySelector('[data-field="profit"]')?.textContent,
        status: row.querySelector('[data-field="status"]')?.textContent,
        date: row.querySelector('[data-field="date"]')?.textContent,
      }));
    });

    return { orders };
  }

  private async getOrders(page: any, payload: {
    storeId: string;
    status?: string;
  }): Promise<{ orders: any[] }> {
    return this.syncSales(page, payload);
  }

  private async bulkUpload(page: any, payload: {
    storeId: string;
    products: Array<{
      title: string;
      description: string;
      price: number;
      sourceUrl: string;
    }>;
  }): Promise<{ uploadedCount: number; failedCount: number }> {
    let uploadedCount = 0;
    let failedCount = 0;

    for (const product of payload.products) {
      try {
        await this.uploadProduct(page, {
          storeId: payload.storeId,
          ...product,
        });
        uploadedCount++;
      } catch {
        failedCount++;
      }
    }

    return { uploadedCount, failedCount };
  }

  private async bulkPublish(page: any, payload: {
    storeId: string;
    draftIds: string[];
  }): Promise<{ publishedCount: number; failedCount: number }> {
    let publishedCount = 0;
    let failedCount = 0;

    for (const draftId of payload.draftIds) {
      try {
        await this.publishDraft(page, {
          storeId: payload.storeId,
          draftId,
        });
        publishedCount++;
      } catch {
        failedCount++;
      }
    }

    return { publishedCount, failedCount };
  }

  /**
   * Refresh a session
   */
  private async refreshSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Close old browser
    await this.closeSession(sessionId);

    // Create new session with same config
    await this.createSession(session.config);
  }

  /**
   * Close a session
   */
  private async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = 'closed';

    try {
      if (session.browser) {
        await session.browser.close();
      }
    } catch {
      // Ignore close errors
    }

    this.sessions.delete(sessionId);
    this.emit('session_closed', { sessionId });
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      const now = Date.now();

      for (const session of this.sessions.values()) {
        // Check for stale sessions
        const sessionAge = now - session.createdAt.getTime();
        if (sessionAge > this.config.sessionTtlMs) {
          this.refreshSession(session.id);
          continue;
        }

        // Check for idle sessions
        const idleTime = now - session.metrics.lastActivityAt;
        if (
          idleTime > this.config.idleTimeoutMs &&
          this.sessions.size > this.config.minSessions
        ) {
          await this.closeSession(session.id);
          continue;
        }

        // Health check ready sessions
        if (session.state === 'ready') {
          try {
            // Quick page health check
            await session.page.evaluate(() => document.readyState);
          } catch {
            session.state = 'error';
            this.refreshSession(session.id);
          }
        }
      }
    }, this.config.healthCheckIntervalMs);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let sessionPool: AutoDsSessionPool | null = null;

export async function getAutodsSessionPool(
  configs?: SessionConfig[],
  poolConfig?: Partial<PoolConfig>
): Promise<AutoDsSessionPool> {
  if (!sessionPool) {
    if (!configs || configs.length === 0) {
      throw new Error('Session configurations required for initial pool creation');
    }

    sessionPool = new AutoDsSessionPool(configs, poolConfig);
    await sessionPool.initialize();
  }

  return sessionPool;
}

export function shutdownSessionPool(): Promise<void> {
  if (sessionPool) {
    return sessionPool.shutdown();
  }
  return Promise.resolve();
}
