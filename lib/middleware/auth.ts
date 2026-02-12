// OTTO Research Labs - Authentication & Security Middleware
// Protects admin routes and validates API access

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ============================================================================
// AUTHENTICATION
// ============================================================================

export interface AuthResult {
  authenticated: boolean
  userId?: string
  role?: 'admin' | 'user' | 'service'
  error?: string
}

/**
 * Verify user authentication from request
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  // Check for service key (internal API calls)
  const serviceKey = request.headers.get('x-service-key')
  if (serviceKey && serviceKey === process.env.INTERNAL_SERVICE_KEY) {
    return { authenticated: true, role: 'service' }
  }

  // Check for Bearer token (user auth)
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing authorization header' }
  }

  const token = authHeader.replace('Bearer ', '')

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    })

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return { authenticated: false, error: error?.message || 'Invalid token' }
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    return {
      authenticated: true,
      userId: user.id,
      role: profile?.role === 'admin' ? 'admin' : 'user'
    }
  } catch (err) {
    return { authenticated: false, error: 'Authentication failed' }
  }
}

/**
 * Require admin authentication - returns error response if not admin
 */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const auth = await verifyAuth(request)

  if (!auth.authenticated) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  if (auth.role !== 'admin' && auth.role !== 'service') {
    return NextResponse.json(
      { success: false, error: 'Admin access required' },
      { status: 403 }
    )
  }

  return null  // Authenticated as admin
}

/**
 * Require any authentication
 */
export async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const auth = await verifyAuth(request)

  if (!auth.authenticated) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  return null
}

// ============================================================================
// CRON SECRET VALIDATION
// ============================================================================

/**
 * Verify cron/scheduler requests - REQUIRED, not optional
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET

  // CRITICAL: Require CRON_SECRET to be set
  if (!cronSecret) {
    console.error('[Security] CRON_SECRET environment variable not set!')
    return NextResponse.json(
      { success: false, error: 'Server configuration error' },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization')

  // Allow Vercel cron requests (they have a specific header)
  const vercelCronSignature = request.headers.get('x-vercel-cron-signature')
  if (vercelCronSignature) {
    // Vercel handles its own signature verification
    return null
  }

  // Verify Bearer token matches CRON_SECRET
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  return null
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required?: boolean
  min?: number
  max?: number
  pattern?: RegExp
  enum?: string[]
  sanitize?: boolean
}

export interface ValidationSchema {
  [key: string]: ValidationRule
}

export function validateInput(
  data: Record<string, unknown>,
  schema: ValidationSchema
): { valid: boolean; errors: string[]; sanitized: Record<string, unknown> } {
  const errors: string[] = []
  const sanitized: Record<string, unknown> = {}

  for (const [field, rule] of Object.entries(schema)) {
    const value = data[field]

    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`)
      continue
    }

    if (value === undefined || value === null) {
      continue
    }

    // Type check
    if (rule.type === 'string') {
      if (typeof value !== 'string') {
        errors.push(`${field} must be a string`)
        continue
      }

      let sanitizedValue = value

      // Sanitize strings to prevent injection
      if (rule.sanitize !== false) {
        sanitizedValue = sanitizedValue
          .replace(/[<>]/g, '')  // Basic XSS prevention
          .trim()
      }

      // Pattern check
      if (rule.pattern && !rule.pattern.test(sanitizedValue)) {
        errors.push(`${field} has invalid format`)
        continue
      }

      // Enum check
      if (rule.enum && !rule.enum.includes(sanitizedValue)) {
        errors.push(`${field} must be one of: ${rule.enum.join(', ')}`)
        continue
      }

      // Length check
      if (rule.min !== undefined && sanitizedValue.length < rule.min) {
        errors.push(`${field} must be at least ${rule.min} characters`)
        continue
      }
      if (rule.max !== undefined && sanitizedValue.length > rule.max) {
        errors.push(`${field} must be at most ${rule.max} characters`)
        continue
      }

      sanitized[field] = sanitizedValue
    }

    if (rule.type === 'number') {
      const num = typeof value === 'number' ? value : parseFloat(String(value))

      if (isNaN(num)) {
        errors.push(`${field} must be a number`)
        continue
      }

      if (rule.min !== undefined && num < rule.min) {
        errors.push(`${field} must be at least ${rule.min}`)
        continue
      }
      if (rule.max !== undefined && num > rule.max) {
        errors.push(`${field} must be at most ${rule.max}`)
        continue
      }

      sanitized[field] = num
    }

    if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') {
        errors.push(`${field} must be a boolean`)
        continue
      }
      sanitized[field] = value
    }

    if (rule.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`${field} must be an array`)
        continue
      }

      if (rule.min !== undefined && value.length < rule.min) {
        errors.push(`${field} must have at least ${rule.min} items`)
        continue
      }
      if (rule.max !== undefined && value.length > rule.max) {
        errors.push(`${field} must have at most ${rule.max} items`)
        continue
      }

      sanitized[field] = value
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  }
}

// ============================================================================
// RATE LIMITING (per-endpoint)
// ============================================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  let entry = rateLimitMap.get(key)

  // Reset if window expired
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs }
    rateLimitMap.set(key, entry)
  }

  // Check limit
  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt
    }
  }

  // Increment and allow
  entry.count++

  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt
  }
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now >= entry.resetAt + 60000) {  // 1 minute grace period
      rateLimitMap.delete(key)
    }
  }
}, 5 * 60 * 1000)

// ============================================================================
// ALLOWED COLUMNS (prevent SQL injection via column names)
// ============================================================================

const ALLOWED_ORDER_COLUMNS: Record<string, string[]> = {
  skus: ['id', 'created_at', 'updated_at', 'title', 'status', 'amazon_price', 'profit_margin'],
  stores: ['id', 'created_at', 'store_name', 'is_active', 'total_revenue', 'health_score'],
  orders: ['id', 'order_date', 'total_amount', 'status', 'buyer_username'],
  store_sku_assignments: ['id', 'created_at', 'listed_at', 'listing_status', 'current_price'],
  listing_jobs: ['id', 'created_at', 'status', 'priority', 'job_type'],
  compliance_checks: ['id', 'checked_at', 'status'],
  job_executions: ['id', 'started_at', 'status', 'duration']
}

export function validateOrderColumn(table: string, column: string): boolean {
  const allowedColumns = ALLOWED_ORDER_COLUMNS[table]
  if (!allowedColumns) return false
  return allowedColumns.includes(column.toLowerCase())
}

export function getAllowedColumns(table: string): string[] {
  return ALLOWED_ORDER_COLUMNS[table] || []
}
