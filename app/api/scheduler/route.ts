/**
 * Scheduler API
 *
 * GET /api/scheduler - Get all jobs and their status
 * GET /api/scheduler?action=stats - Get job statistics
 * POST /api/scheduler - Run jobs or single job
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  SCHEDULED_JOBS,
  runScheduledJobs,
  runSingleJob,
  getJobStats,
  getNextRunTime
} from '@/lib/scheduler'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list'
  const jobId = searchParams.get('jobId')

  try {
    if (action === 'list') {
      // Get job statuses from database
      const { data: statuses } = await supabase
        .from('scheduled_jobs')
        .select('*')

      const statusMap = new Map(statuses?.map(s => [s.id, s]) || [])

      // Combine job definitions with statuses
      const jobs = SCHEDULED_JOBS.map(job => {
        const status = statusMap.get(job.id)
        return {
          ...job,
          lastRun: status?.last_run,
          lastStatus: status?.last_status,
          lastDuration: status?.last_duration,
          lastError: status?.last_error,
          nextRun: getNextRunTime(job.schedule).toISOString()
        }
      })

      return NextResponse.json({
        success: true,
        jobs
      })
    }

    if (action === 'stats') {
      const stats = await getJobStats(jobId || undefined)
      return NextResponse.json({
        success: true,
        stats
      })
    }

    if (action === 'health') {
      // Get system health metrics
      const { data: health } = await supabase
        .from('v_system_health')
        .select('*')
        .single()

      const { data: jobHealth } = await supabase
        .from('v_job_health')
        .select('*')

      return NextResponse.json({
        success: true,
        system: health || {},
        jobs: jobHealth || []
      })
    }

    if (action === 'executions') {
      const limit = parseInt(searchParams.get('limit') || '50')
      let query = supabase
        .from('job_executions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit)

      if (jobId) {
        query = query.eq('job_id', jobId)
      }

      const { data: executions } = await query

      return NextResponse.json({
        success: true,
        executions: executions || []
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Scheduler API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      // Allow non-cron requests for manual triggers
      const isManualTrigger = request.headers.get('x-manual-trigger') === 'true'
      if (!isManualTrigger) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    const body = await request.json().catch(() => ({}))
    const { action = 'run', jobId, force = false, jobIds } = body

    if (action === 'run-all') {
      // Run all scheduled jobs (called by external cron)
      console.log('[Scheduler] Running all scheduled jobs...')
      const result = await runScheduledJobs({ force })

      return NextResponse.json({
        success: true,
        ...result
      })
    }

    if (action === 'run-selected') {
      // Run selected jobs
      if (!jobIds || !Array.isArray(jobIds)) {
        return NextResponse.json({
          success: false,
          error: 'jobIds array required'
        }, { status: 400 })
      }

      console.log(`[Scheduler] Running selected jobs: ${jobIds.join(', ')}`)
      const result = await runScheduledJobs({ jobIds, force })

      return NextResponse.json({
        success: true,
        ...result
      })
    }

    if (action === 'run') {
      // Run single job
      if (!jobId) {
        return NextResponse.json({
          success: false,
          error: 'jobId required'
        }, { status: 400 })
      }

      console.log(`[Scheduler] Running job: ${jobId}`)
      const execution = await runSingleJob(jobId, force)

      return NextResponse.json({
        success: true,
        execution
      })
    }

    if (action === 'toggle') {
      // Toggle job enabled/disabled
      if (!jobId) {
        return NextResponse.json({
          success: false,
          error: 'jobId required'
        }, { status: 400 })
      }

      const { enabled } = body
      if (typeof enabled !== 'boolean') {
        return NextResponse.json({
          success: false,
          error: 'enabled boolean required'
        }, { status: 400 })
      }

      await supabase.from('scheduled_jobs').upsert({
        id: jobId,
        config: { enabled }
      }, { onConflict: 'id' })

      return NextResponse.json({
        success: true,
        jobId,
        enabled
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Scheduler API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
