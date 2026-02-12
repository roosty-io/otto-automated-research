'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ScheduledJob {
  id: string
  name: string
  description: string
  endpoint: string
  schedule: string
  enabled: boolean
  lastRun?: string
  lastStatus?: string
  lastDuration?: number
  lastError?: string
  nextRun?: string
  retryCount: number
  maxRetries: number
  timeout: number
}

interface JobExecution {
  id: string
  job_id: string
  job_name: string
  started_at: string
  completed_at?: string
  status: string
  duration?: number
  error?: string
  retry_attempt: number
}

interface SystemHealth {
  active_stores: number
  ready_skus: number
  active_listings: number
  pending_jobs: number
  processing_jobs: number
  running_cron_jobs: number
  failed_jobs_1h: number
  revenue_24h: number
  orders_24h: number
}

export default function SchedulerAdminPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [executions, setExecutions] = useState<JobExecution[]>([])
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'jobs' | 'executions' | 'health'>('jobs')

  const loadData = useCallback(async () => {
    try {
      const [jobsRes, execRes, healthRes] = await Promise.all([
        fetch('/api/scheduler?action=list'),
        fetch('/api/scheduler?action=executions&limit=30'),
        fetch('/api/scheduler?action=health')
      ])

      const jobsData = await jobsRes.json()
      const execData = await execRes.json()
      const healthData = await healthRes.json()

      if (jobsData.success) setJobs(jobsData.jobs)
      if (execData.success) setExecutions(execData.executions)
      if (healthData.success) setHealth(healthData.system)
    } catch (err) {
      console.error('Failed to load scheduler data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)  // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [loadData])

  const runJob = async (jobId: string) => {
    setRunningJobs(prev => new Set([...prev, jobId]))

    try {
      const res = await fetch('/api/scheduler', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Manual-Trigger': 'true'
        },
        body: JSON.stringify({ action: 'run', jobId, force: true })
      })

      const data = await res.json()
      if (data.success) {
        await loadData()
      }
    } catch (err) {
      console.error('Failed to run job:', err)
    } finally {
      setRunningJobs(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
    }
  }

  const runAllJobs = async () => {
    try {
      const res = await fetch('/api/scheduler', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Manual-Trigger': 'true'
        },
        body: JSON.stringify({ action: 'run-all', force: true })
      })

      const data = await res.json()
      if (data.success) {
        await loadData()
      }
    } catch (err) {
      console.error('Failed to run all jobs:', err)
    }
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-700'
      case 'failed': case 'timeout': return 'bg-red-100 text-red-700'
      case 'running': return 'bg-blue-100 text-blue-700'
      case 'retrying': return 'bg-yellow-100 text-yellow-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatSchedule = (schedule: string) => {
    const parts = schedule.split(' ')
    const minute = parts[0]
    const hour = parts[1]

    if (minute.startsWith('*/')) {
      return `Every ${minute.slice(2)} minutes`
    }
    if (minute === '0' && hour === '*') {
      return 'Every hour'
    }
    if (minute === '0' && hour.startsWith('*/')) {
      return `Every ${hour.slice(2)} hours`
    }
    if (minute === '0' && !hour.includes('*')) {
      return `Daily at ${hour}:00`
    }
    return schedule
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500">Loading scheduler...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Link href="/admin" className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Job Scheduler</h1>
                <p className="text-sm text-gray-500">Manage scheduled jobs and monitor executions</p>
              </div>
            </div>
            <button
              onClick={runAllJobs}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Run All Jobs
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Health Overview */}
        {health && (
          <div className="grid grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Active Stores</p>
              <p className="text-2xl font-bold text-gray-900">{health.active_stores}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Active Listings</p>
              <p className="text-2xl font-bold text-blue-600">{health.active_listings?.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Pending Jobs</p>
              <p className="text-2xl font-bold text-yellow-600">{health.pending_jobs}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Failed (1h)</p>
              <p className={`text-2xl font-bold ${health.failed_jobs_1h > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {health.failed_jobs_1h}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Revenue (24h)</p>
              <p className="text-2xl font-bold text-green-600">${health.revenue_24h?.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            {[
              { id: 'jobs', label: 'Scheduled Jobs' },
              { id: 'executions', label: 'Recent Executions' },
              { id: 'health', label: 'System Health' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Jobs Tab */}
        {activeTab === 'jobs' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Schedule</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Run</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {jobs.map(job => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <p className="text-sm font-medium text-gray-900">{job.name}</p>
                      <p className="text-xs text-gray-500">{job.description}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {formatSchedule(job.schedule)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {job.lastRun
                        ? new Date(job.lastRun).toLocaleString()
                        : 'Never'
                      }
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(job.lastStatus)}`}>
                        {job.lastStatus || 'pending'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {formatDuration(job.lastDuration)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {job.nextRun
                        ? new Date(job.nextRun).toLocaleTimeString()
                        : '-'
                      }
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => runJob(job.id)}
                        disabled={runningJobs.has(job.id)}
                        className="px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                      >
                        {runningJobs.has(job.id) ? 'Running...' : 'Run Now'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Executions Tab */}
        {activeTab === 'executions' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {executions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No executions recorded yet
                    </td>
                  </tr>
                ) : (
                  executions.map(exec => (
                    <tr key={exec.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">
                        {exec.job_name}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(exec.started_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(exec.status)}`}>
                          {exec.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {formatDuration(exec.duration)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {exec.retry_attempt > 0 ? `#${exec.retry_attempt}` : '-'}
                      </td>
                      <td className="px-4 py-4 text-sm text-red-500 max-w-xs truncate">
                        {exec.error || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Health Tab */}
        {activeTab === 'health' && health && (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">System Metrics</h3>
              <div className="space-y-4">
                {[
                  { label: 'Active Stores', value: health.active_stores },
                  { label: 'Ready SKUs', value: health.ready_skus?.toLocaleString() },
                  { label: 'Active Listings', value: health.active_listings?.toLocaleString() },
                  { label: 'Pending Jobs', value: health.pending_jobs },
                  { label: 'Processing Jobs', value: health.processing_jobs },
                  { label: 'Running Cron Jobs', value: health.running_cron_jobs }
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">{item.label}</span>
                    <span className="text-sm font-medium text-gray-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">24-Hour Summary</h3>
              <div className="space-y-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-700">${health.revenue_24h?.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600">Orders</p>
                  <p className="text-2xl font-bold text-blue-700">{health.orders_24h}</p>
                </div>
                <div className={`p-4 rounded-lg ${health.failed_jobs_1h > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${health.failed_jobs_1h > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    Failed Jobs (Last Hour)
                  </p>
                  <p className={`text-2xl font-bold ${health.failed_jobs_1h > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                    {health.failed_jobs_1h}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
