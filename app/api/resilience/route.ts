import { NextRequest, NextResponse } from 'next/server'
import {
  getAllCircuitBreakerStatuses,
  getCircuitBreaker,
  getRecentErrors,
  checkServiceHealth
} from '@/lib/resilience'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'status'

  try {
    if (action === 'status') {
      // Get circuit breaker statuses
      const circuitBreakers = getAllCircuitBreakerStatuses()

      // Check core service health
      const healthChecks = await Promise.all([
        checkServiceHealth('database', async () => {
          const { error } = await supabase.from('stores').select('id').limit(1)
          return !error
        }),
        checkServiceHealth('api', async () => {
          return true  // API is running if this executes
        })
      ])

      return NextResponse.json({
        success: true,
        circuitBreakers,
        healthChecks,
        timestamp: new Date().toISOString()
      })
    }

    if (action === 'errors') {
      const limit = parseInt(searchParams.get('limit') || '50')
      const severity = searchParams.get('severity') as any

      const errors = await getRecentErrors(limit, severity)

      return NextResponse.json({
        success: true,
        errors,
        total: errors.length
      })
    }

    if (action === 'circuit-breaker') {
      const service = searchParams.get('service')
      if (!service) {
        return NextResponse.json({
          success: false,
          error: 'Service name required'
        }, { status: 400 })
      }

      const cb = getCircuitBreaker(service)
      return NextResponse.json({
        success: true,
        status: cb.getStatus()
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Resilience API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, service } = body

    if (action === 'reset-circuit-breaker') {
      if (!service) {
        return NextResponse.json({
          success: false,
          error: 'Service name required'
        }, { status: 400 })
      }

      const cb = getCircuitBreaker(service)
      cb.reset()

      return NextResponse.json({
        success: true,
        message: `Circuit breaker for ${service} reset`,
        status: cb.getStatus()
      })
    }

    if (action === 'test-circuit') {
      if (!service) {
        return NextResponse.json({
          success: false,
          error: 'Service name required'
        }, { status: 400 })
      }

      // Simulate a test call
      const cb = getCircuitBreaker(service)
      const status = cb.getStatus()

      return NextResponse.json({
        success: true,
        status
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Resilience API] POST Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
