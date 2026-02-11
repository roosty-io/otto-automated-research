import { NextRequest, NextResponse } from 'next/server'
import {
  createListingJob,
  createBulkListingJobs,
  getProcessableJobs,
  getJob,
  cancelJob,
  getJobStats,
  getStoreJobs,
  cleanupOldJobs,
  processBatch,
  getProcessorStatus,
} from '@/lib/listing'

/**
 * POST /api/listing/queue
 *
 * Manage listing job queue
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'create': {
        // Create a single job
        const { assignmentId, storeId, skuId, jobType, priority, scheduledFor } = body

        if (!assignmentId || !storeId || !skuId || !jobType) {
          return NextResponse.json(
            { error: 'assignmentId, storeId, skuId, and jobType are required' },
            { status: 400 }
          )
        }

        const result = await createListingJob({
          assignmentId,
          storeId,
          skuId,
          jobType,
          priority,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        })

        return NextResponse.json({
          success: result.success,
          job: result.job,
          error: result.error,
        })
      }

      case 'bulk_create': {
        // Create multiple jobs
        const { jobs } = body

        if (!jobs || !Array.isArray(jobs)) {
          return NextResponse.json(
            { error: 'jobs array is required' },
            { status: 400 }
          )
        }

        const result = await createBulkListingJobs(
          jobs.map((j: any) => ({
            assignmentId: j.assignmentId,
            storeId: j.storeId,
            skuId: j.skuId,
            jobType: j.jobType,
            priority: j.priority,
            scheduledFor: j.scheduledFor ? new Date(j.scheduledFor) : undefined,
          }))
        )

        return NextResponse.json({
          success: result.success,
          created: result.created,
          failed: result.failed,
          errors: result.errors,
        })
      }

      case 'cancel': {
        // Cancel a job
        const { jobId } = body

        if (!jobId) {
          return NextResponse.json(
            { error: 'jobId is required' },
            { status: 400 }
          )
        }

        const result = await cancelJob(jobId)

        return NextResponse.json({
          success: result.success,
          error: result.error,
        })
      }

      case 'process': {
        // Manually trigger batch processing
        const { maxConcurrent, dryRun } = body

        const result = await processBatch({
          maxConcurrent,
          dryRun: dryRun ?? true, // Default to dry run for safety
        })

        return NextResponse.json({
          success: true,
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
          duration: result.duration,
          results: result.results,
        })
      }

      case 'cleanup': {
        // Clean up old completed jobs
        const { daysOld = 30 } = body

        const deleted = await cleanupOldJobs(daysOld)

        return NextResponse.json({
          success: true,
          deleted,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Listing Queue] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/listing/queue
 *
 * Get queue info and jobs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'status'
    const storeId = searchParams.get('storeId') || undefined
    const jobId = searchParams.get('jobId') || undefined
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 50
    const offset = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!)
      : 0

    switch (type) {
      case 'status': {
        // Get processor status
        const status = await getProcessorStatus()

        return NextResponse.json({
          success: true,
          status,
        })
      }

      case 'stats': {
        // Get job statistics
        const stats = await getJobStats(storeId)

        return NextResponse.json({
          success: true,
          stats,
        })
      }

      case 'job': {
        // Get single job
        if (!jobId) {
          return NextResponse.json(
            { error: 'jobId is required' },
            { status: 400 }
          )
        }

        const job = await getJob(jobId)

        if (!job) {
          return NextResponse.json(
            { error: 'Job not found' },
            { status: 404 }
          )
        }

        return NextResponse.json({
          success: true,
          job,
        })
      }

      case 'processable': {
        // Get jobs ready for processing
        const jobs = await getProcessableJobs({ storeId, limit })

        return NextResponse.json({
          success: true,
          jobs,
          count: jobs.length,
        })
      }

      case 'store': {
        // Get jobs for a store
        if (!storeId) {
          return NextResponse.json(
            { error: 'storeId is required' },
            { status: 400 }
          )
        }

        const statusFilter = searchParams.get('status')
        const statuses = statusFilter ? statusFilter.split(',') as any[] : undefined

        const result = await getStoreJobs(storeId, { status: statuses, limit, offset })

        return NextResponse.json({
          success: true,
          ...result,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Listing Queue] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
