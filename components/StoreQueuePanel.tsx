'use client'

import { useState, useEffect } from 'react'
import {
  RefreshCw,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  AlertTriangle,
  ChevronRight,
  Zap,
} from 'lucide-react'

interface Job {
  id: string
  assignmentId: string
  storeId: string
  skuId: string
  jobType: string
  status: string
  priority: number
  attempts: number
  maxAttempts: number
  lastError?: string
  scheduledFor?: string
  startedAt?: string
  completedAt?: string
  result?: {
    ebayItemId?: string
    listingUrl?: string
    actualPrice?: number
  }
  createdAt: string
}

interface JobStats {
  pending: number
  queued: number
  processing: number
  completed: number
  failed: number
  cancelled: number
  avgProcessingTime: number
  successRate: number
}

interface Props {
  storeId: string
  storeName: string
}

const JOB_TYPE_LABELS: Record<string, string> = {
  create_listing: 'Create Listing',
  update_listing: 'Update Listing',
  end_listing: 'End Listing',
  relist: 'Relist',
  revise_price: 'Revise Price',
  revise_quantity: 'Revise Quantity',
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
  queued: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Play },
  completed: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Pause },
}

export function StoreQueuePanel({ storeId, storeName }: Props) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<JobStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetchJobs()
    fetchStats()
  }, [storeId, statusFilter])

  async function fetchJobs() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        type: 'store',
        storeId,
        limit: '50',
      })

      if (statusFilter !== 'all') {
        params.set('status', statusFilter)
      }

      const response = await fetch(`/api/listing/queue?${params}`)
      const data = await response.json()

      if (data.success) {
        setJobs(data.jobs)
      }
    } catch (error) {
      console.error('Error fetching jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    try {
      const response = await fetch(`/api/listing/queue?type=stats&storeId=${storeId}`)
      const data = await response.json()

      if (data.success) {
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  async function processQueue() {
    setProcessing(true)
    try {
      const response = await fetch('/api/listing/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'process',
          maxConcurrent: 5,
          dryRun: true, // Safe default
        }),
      })

      const data = await response.json()
      if (data.success) {
        // Refresh after processing
        await fetchJobs()
        await fetchStats()
      }
    } catch (error) {
      console.error('Error processing queue:', error)
    } finally {
      setProcessing(false)
    }
  }

  async function cancelJob(jobId: string) {
    try {
      const response = await fetch('/api/listing/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          jobId,
        }),
      })

      const data = await response.json()
      if (data.success) {
        fetchJobs()
        fetchStats()
      }
    } catch (error) {
      console.error('Error cancelling job:', error)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Job Queue</h3>
          <p className="text-sm text-gray-500">Listing automation jobs for {storeName}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchJobs}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={processQueue}
            disabled={processing}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {processing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Process Queue
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-yellow-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-yellow-700">{stats.pending + stats.queued}</p>
            <p className="text-xs text-yellow-600">Pending</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{stats.processing}</p>
            <p className="text-xs text-blue-600">Processing</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{stats.completed}</p>
            <p className="text-xs text-green-600">Completed</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{stats.failed}</p>
            <p className="text-xs text-red-600">Failed</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-gray-700">{stats.avgProcessingTime}s</p>
            <p className="text-xs text-gray-600">Avg Time</p>
          </div>
          <div className="bg-indigo-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-indigo-700">{stats.successRate}%</p>
            <p className="text-xs text-indigo-600">Success Rate</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {['all', 'pending', 'processing', 'completed', 'failed'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              statusFilter === status
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No jobs in queue</p>
          <p className="text-sm text-gray-400 mt-1">Assign SKUs to create listing jobs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const statusStyle = STATUS_STYLES[job.status] || STATUS_STYLES.pending
            const StatusIcon = statusStyle.icon

            return (
              <div
                key={job.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg ${statusStyle.bg} flex items-center justify-center`}>
                      <StatusIcon className={`h-5 w-5 ${statusStyle.text}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">
                          {JOB_TYPE_LABELS[job.jobType] || job.jobType}
                        </p>
                        {job.priority > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                            Priority {job.priority}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        Created {formatDate(job.createdAt)}
                        {job.scheduledFor && ` | Scheduled: ${formatDate(job.scheduledFor)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                      {job.status}
                    </span>

                    {job.attempts > 0 && (
                      <span className="text-xs text-gray-500">
                        Attempt {job.attempts}/{job.maxAttempts}
                      </span>
                    )}

                    {(job.status === 'pending' || job.status === 'queued') && (
                      <button
                        onClick={() => cancelJob(job.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Cancel
                      </button>
                    )}

                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </div>

                {/* Error Message */}
                {job.lastError && (
                  <div className="mt-3 p-3 bg-red-50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{job.lastError}</p>
                    </div>
                  </div>
                )}

                {/* Result */}
                {job.result && job.status === 'completed' && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-4 text-sm">
                      {job.result.ebayItemId && (
                        <span className="text-green-700">
                          Item ID: {job.result.ebayItemId}
                        </span>
                      )}
                      {job.result.actualPrice && (
                        <span className="text-green-700">
                          Price: ${job.result.actualPrice.toFixed(2)}
                        </span>
                      )}
                      {job.result.listingUrl && (
                        <a
                          href={job.result.listingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-700"
                        >
                          View Listing
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Timing Info */}
                {job.startedAt && (
                  <div className="mt-3 text-xs text-gray-400 flex gap-4">
                    <span>Started: {formatDate(job.startedAt)}</span>
                    {job.completedAt && (
                      <span>Completed: {formatDate(job.completedAt)}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
