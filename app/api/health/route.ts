import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * System Health Check API
 *
 * GET /api/health
 * Returns overall system health status
 *
 * Query params:
 * - verbose: 'true' for detailed component status
 */

interface ComponentHealth {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  latencyMs?: number
  error?: string
  details?: Record<string, unknown>
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  version: string
  environment: string
  components?: ComponentHealth[]
  uptime?: number
}

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now()

  try {
    // Simple query to check database connectivity
    const { data, error } = await supabase
      .from('stores')
      .select('count')
      .limit(1)

    if (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error.message,
      }
    }

    const latency = Date.now() - start

    return {
      name: 'database',
      status: latency > 5000 ? 'degraded' : 'healthy',
      latencyMs: latency,
    }
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function checkSupabaseAuth(): Promise<ComponentHealth> {
  const start = Date.now()

  try {
    // Check if Supabase URL is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return {
        name: 'supabase_auth',
        status: 'unhealthy',
        error: 'NEXT_PUBLIC_SUPABASE_URL not configured',
      }
    }

    // Attempt a simple auth check
    const { data, error } = await supabase.auth.getSession()

    if (error && error.message !== 'Auth session missing!') {
      return {
        name: 'supabase_auth',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error.message,
      }
    }

    return {
      name: 'supabase_auth',
      status: 'healthy',
      latencyMs: Date.now() - start,
    }
  } catch (error) {
    return {
      name: 'supabase_auth',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function checkStripe(): Promise<ComponentHealth> {
  const start = Date.now()

  try {
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return {
        name: 'stripe',
        status: 'degraded',
        details: { configured: false },
        error: 'STRIPE_SECRET_KEY not configured',
      }
    }

    // Import Stripe lazily
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    // Simple API check
    const balance = await stripe.balance.retrieve()

    return {
      name: 'stripe',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        available: balance.available.length > 0,
      },
    }
  } catch (error) {
    return {
      name: 'stripe',
      status: 'degraded', // Degraded, not unhealthy - app can work without billing
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function checkEnvironment(): Promise<ComponentHealth> {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]

  const optional = [
    'STRIPE_SECRET_KEY',
    'AUTODS_EMAIL',
    'ZIK_EMAIL',
    'SENTRY_DSN',
  ]

  const missing = required.filter((key) => !process.env[key])
  const missingOptional = optional.filter((key) => !process.env[key])

  if (missing.length > 0) {
    return {
      name: 'environment',
      status: 'unhealthy',
      error: `Missing required env vars: ${missing.join(', ')}`,
      details: {
        missingRequired: missing,
        missingOptional,
      },
    }
  }

  return {
    name: 'environment',
    status: missingOptional.length > 2 ? 'degraded' : 'healthy',
    details: {
      configured: required.length,
      missingOptional,
    },
  }
}

function determineOverallStatus(components: ComponentHealth[]): HealthCheckResponse['status'] {
  const hasUnhealthy = components.some((c) => c.status === 'unhealthy')
  const hasDegraded = components.some((c) => c.status === 'degraded')

  if (hasUnhealthy) return 'unhealthy'
  if (hasDegraded) return 'degraded'
  return 'healthy'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const verbose = searchParams.get('verbose') === 'true'

  const startTime = Date.now()

  try {
    // Run health checks in parallel
    const [database, auth, stripe, env] = await Promise.all([
      checkDatabase(),
      checkSupabaseAuth(),
      checkStripe(),
      checkEnvironment(),
    ])

    const components = [database, auth, stripe, env]
    const status = determineOverallStatus(components)

    const response: HealthCheckResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
    }

    // Include component details if verbose
    if (verbose) {
      response.components = components
    }

    // Return appropriate HTTP status
    const httpStatus = status === 'unhealthy' ? 503 : status === 'degraded' ? 200 : 200

    return NextResponse.json(response, { status: httpStatus })
  } catch (error) {
    console.error('[Health] Error:', error)

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        environment: process.env.NODE_ENV || 'development',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    )
  }
}
