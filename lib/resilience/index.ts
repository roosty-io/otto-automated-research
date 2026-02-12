// OTTO Research Labs - Resilience & Error Handling
// Circuit breakers, retry logic, and graceful degradation

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TYPES
// ============================================================================

export interface RetryConfig {
  maxRetries: number
  baseDelay: number  // ms
  maxDelay: number  // ms
  backoffMultiplier: number
  retryableErrors?: string[]
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void
}

export interface CircuitBreakerConfig {
  name: string
  failureThreshold: number  // Number of failures before opening
  resetTimeout: number  // ms to wait before half-open
  halfOpenRequests: number  // Requests to allow in half-open state
  monitorWindow: number  // ms to track failures
}

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerStatus {
  name: string
  state: CircuitState
  failures: number
  lastFailure?: string
  lastSuccess?: string
  nextAttempt?: string
}

export interface ErrorContext {
  operation: string
  service: string
  input?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface LoggedError {
  id: string
  timestamp: string
  error: string
  stack?: string
  context: ErrorContext
  severity: 'low' | 'medium' | 'high' | 'critical'
  resolved: boolean
}

// ============================================================================
// DEFAULT CONFIGS
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'NetworkError',
    'FetchError',
    '429',  // Rate limited
    '500',  // Server error
    '502',  // Bad gateway
    '503',  // Service unavailable
    '504',  // Gateway timeout
  ]
}

export const CIRCUIT_BREAKER_CONFIGS: Record<string, CircuitBreakerConfig> = {
  ebay: {
    name: 'ebay',
    failureThreshold: 5,
    resetTimeout: 60000,  // 1 minute
    halfOpenRequests: 2,
    monitorWindow: 300000  // 5 minutes
  },
  autods: {
    name: 'autods',
    failureThreshold: 3,
    resetTimeout: 120000,  // 2 minutes
    halfOpenRequests: 1,
    monitorWindow: 300000
  },
  keepa: {
    name: 'keepa',
    failureThreshold: 5,
    resetTimeout: 60000,
    halfOpenRequests: 2,
    monitorWindow: 300000
  },
  supabase: {
    name: 'supabase',
    failureThreshold: 10,
    resetTimeout: 30000,  // 30 seconds
    halfOpenRequests: 3,
    monitorWindow: 60000
  }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failures: number = 0
  private lastFailureTime?: Date
  private lastSuccessTime?: Date
  private halfOpenAttempts: number = 0
  private failureTimestamps: number[] = []

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition
    this.checkState()

    if (this.state === 'open') {
      throw new CircuitOpenError(this.config.name)
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure(error as Error)
      throw error
    }
  }

  private checkState(): void {
    // Clean old failures outside monitoring window
    const now = Date.now()
    this.failureTimestamps = this.failureTimestamps.filter(
      ts => now - ts < this.config.monitorWindow
    )
    this.failures = this.failureTimestamps.length

    if (this.state === 'open') {
      const timeSinceLastFailure = this.lastFailureTime
        ? now - this.lastFailureTime.getTime()
        : Infinity

      if (timeSinceLastFailure >= this.config.resetTimeout) {
        this.state = 'half-open'
        this.halfOpenAttempts = 0
        console.log(`[CircuitBreaker:${this.config.name}] Transitioning to half-open`)
      }
    }
  }

  private onSuccess(): void {
    this.lastSuccessTime = new Date()

    if (this.state === 'half-open') {
      this.halfOpenAttempts++
      if (this.halfOpenAttempts >= this.config.halfOpenRequests) {
        this.state = 'closed'
        this.failures = 0
        this.failureTimestamps = []
        console.log(`[CircuitBreaker:${this.config.name}] Circuit closed`)
      }
    }
  }

  private onFailure(error: Error): void {
    const now = Date.now()
    this.failures++
    this.failureTimestamps.push(now)
    this.lastFailureTime = new Date()

    if (this.state === 'half-open') {
      this.state = 'open'
      console.log(`[CircuitBreaker:${this.config.name}] Circuit reopened after half-open failure`)
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open'
      console.log(`[CircuitBreaker:${this.config.name}] Circuit opened after ${this.failures} failures`)
    }
  }

  getStatus(): CircuitBreakerStatus {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailureTime?.toISOString(),
      lastSuccess: this.lastSuccessTime?.toISOString(),
      nextAttempt: this.state === 'open' && this.lastFailureTime
        ? new Date(this.lastFailureTime.getTime() + this.config.resetTimeout).toISOString()
        : undefined
    }
  }

  reset(): void {
    this.state = 'closed'
    this.failures = 0
    this.failureTimestamps = []
    this.halfOpenAttempts = 0
    console.log(`[CircuitBreaker:${this.config.name}] Circuit manually reset`)
  }
}

// Circuit breaker instances
const circuitBreakers: Map<string, CircuitBreaker> = new Map()

export function getCircuitBreaker(name: string): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    const config = CIRCUIT_BREAKER_CONFIGS[name] || {
      name,
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenRequests: 2,
      monitorWindow: 300000
    }
    circuitBreakers.set(name, new CircuitBreaker(config))
  }
  return circuitBreakers.get(name)!
}

export function getAllCircuitBreakerStatuses(): CircuitBreakerStatus[] {
  return Array.from(circuitBreakers.values()).map(cb => cb.getStatus())
}

export class CircuitOpenError extends Error {
  constructor(public service: string) {
    super(`Circuit breaker open for service: ${service}`)
    this.name = 'CircuitOpenError'
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const opts: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      const errorString = String(error)

      // Check if error is retryable
      const isRetryable = opts.retryableErrors?.some(e =>
        errorString.includes(e)
      ) ?? true

      if (!isRetryable || attempt >= opts.maxRetries) {
        throw error
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt)
      const jitter = baseDelay * 0.2 * Math.random()
      const delay = Math.min(baseDelay + jitter, opts.maxDelay)

      if (opts.onRetry) {
        opts.onRetry(attempt + 1, lastError, delay)
      }

      console.log(`[Retry] Attempt ${attempt + 1}/${opts.maxRetries}, waiting ${delay}ms`)
      await sleep(delay)
    }
  }

  throw lastError
}

export async function withCircuitBreaker<T>(
  service: string,
  fn: () => Promise<T>,
  retryConfig?: Partial<RetryConfig>
): Promise<T> {
  const cb = getCircuitBreaker(service)

  return cb.execute(async () => {
    if (retryConfig) {
      return withRetry(fn, retryConfig)
    }
    return fn()
  })
}

// ============================================================================
// ERROR LOGGING
// ============================================================================

export async function logError(
  error: Error,
  context: ErrorContext,
  severity: LoggedError['severity'] = 'medium'
): Promise<string> {
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const logEntry: LoggedError = {
    id: errorId,
    timestamp: new Date().toISOString(),
    error: error.message,
    stack: error.stack,
    context,
    severity,
    resolved: false
  }

  // Log to console
  console.error(`[Error:${severity}] ${context.service}:${context.operation}`, {
    errorId,
    error: error.message,
    context
  })

  // Log to database
  try {
    await supabase.from('system_logs').insert({
      type: 'error',
      action: `${context.service}:${context.operation}`,
      details: {
        errorId,
        error: error.message,
        stack: error.stack,
        context,
        severity
      }
    })
  } catch (logError) {
    console.error('Failed to log error to database:', logError)
  }

  // Create alert for high severity errors
  if (severity === 'high' || severity === 'critical') {
    await createErrorAlert(logEntry)
  }

  return errorId
}

async function createErrorAlert(error: LoggedError): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      type: 'system_alert',
      title: `${error.severity.toUpperCase()}: ${error.context.service} Error`,
      message: error.error,
      category: 'system',
      severity: error.severity === 'critical' ? 'critical' : 'warning',
      metadata: {
        errorId: error.id,
        operation: error.context.operation,
        service: error.context.service
      }
    })
  } catch (e) {
    console.error('Failed to create error alert:', e)
  }
}

export async function getRecentErrors(
  limit: number = 50,
  severity?: LoggedError['severity']
): Promise<LoggedError[]> {
  let query = supabase
    .from('system_logs')
    .select('*')
    .eq('type', 'error')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (severity) {
    query = query.contains('details', { severity })
  }

  const { data } = await query

  return (data || []).map(row => ({
    id: row.details?.errorId || row.id,
    timestamp: row.created_at,
    error: row.details?.error || 'Unknown error',
    stack: row.details?.stack,
    context: row.details?.context || { operation: 'unknown', service: 'unknown' },
    severity: row.details?.severity || 'medium',
    resolved: row.details?.resolved || false
  }))
}

// ============================================================================
// RATE LIMIT HANDLING
// ============================================================================

interface RateLimitState {
  requests: number
  windowStart: number
  retryAfter?: number
}

const rateLimitStates: Map<string, RateLimitState> = new Map()

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  let state = rateLimitStates.get(key)

  // Reset window if expired
  if (!state || now - state.windowStart >= windowMs) {
    state = { requests: 0, windowStart: now }
    rateLimitStates.set(key, state)
  }

  // Check if rate limited
  if (state.requests >= limit) {
    const retryAfter = Math.ceil((state.windowStart + windowMs - now) / 1000)
    return { allowed: false, retryAfter }
  }

  // Increment and allow
  state.requests++
  return { allowed: true }
}

export function recordRateLimitResponse(key: string, retryAfterSeconds: number): void {
  const state = rateLimitStates.get(key) || { requests: 0, windowStart: Date.now() }
  state.retryAfter = Date.now() + retryAfterSeconds * 1000
  rateLimitStates.set(key, state)
}

export async function waitForRateLimit(key: string): Promise<void> {
  const state = rateLimitStates.get(key)
  if (state?.retryAfter && state.retryAfter > Date.now()) {
    const waitTime = state.retryAfter - Date.now()
    console.log(`[RateLimit:${key}] Waiting ${waitTime}ms`)
    await sleep(waitTime)
  }
}

// ============================================================================
// GRACEFUL DEGRADATION
// ============================================================================

export interface FallbackResult<T> {
  data: T
  source: 'primary' | 'fallback' | 'cache'
  error?: string
}

export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  options: {
    timeout?: number
    cacheKey?: string
    cacheTtl?: number
  } = {}
): Promise<FallbackResult<T>> {
  const { timeout = 10000 } = options

  try {
    // Try primary with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const result = await Promise.race([
      primary(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ])

    clearTimeout(timeoutId)

    return { data: result, source: 'primary' }
  } catch (primaryError) {
    console.warn('[Fallback] Primary failed, trying fallback:', primaryError)

    try {
      const result = await fallback()
      return {
        data: result,
        source: 'fallback',
        error: (primaryError as Error).message
      }
    } catch (fallbackError) {
      throw new Error(
        `Both primary and fallback failed. Primary: ${(primaryError as Error).message}, Fallback: ${(fallbackError as Error).message}`
      )
    }
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export interface ServiceHealth {
  name: string
  healthy: boolean
  latency?: number
  error?: string
  lastCheck: string
}

export async function checkServiceHealth(
  name: string,
  healthCheck: () => Promise<boolean>
): Promise<ServiceHealth> {
  const startTime = Date.now()
  const lastCheck = new Date().toISOString()

  try {
    const healthy = await Promise.race([
      healthCheck(),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      )
    ])

    return {
      name,
      healthy,
      latency: Date.now() - startTime,
      lastCheck
    }
  } catch (error) {
    return {
      name,
      healthy: false,
      latency: Date.now() - startTime,
      error: (error as Error).message,
      lastCheck
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  CircuitBreaker,
  sleep
}
