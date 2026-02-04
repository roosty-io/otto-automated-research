'use client'

import { useState } from 'react'
import { Loader2, RefreshCw, Package, Activity, CheckCircle, XCircle } from 'lucide-react'

type JobResult = {
  success: boolean
  message: string
  details?: Record<string, unknown>
}

export function CronJobTriggers() {
  const [loading, setLoading] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, JobResult>>({})

  async function runJob(jobType: string, endpoint: string, dryRun = false) {
    setLoading(jobType)
    setResults((prev) => ({ ...prev, [jobType]: undefined as any }))

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })

      const data = await res.json()

      setResults((prev) => ({
        ...prev,
        [jobType]: {
          success: res.ok,
          message: data.message || data.error || 'Unknown result',
          details: data,
        },
      }))
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [jobType]: {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to run job',
        },
      }))
    } finally {
      setLoading(null)
    }
  }

  const jobs = [
    {
      id: 'health',
      name: 'Update Store Health',
      description: 'Update maturity levels based on store age',
      endpoint: '/api/cron/update-store-health',
      icon: Activity,
      color: 'blue',
    },
    {
      id: 'replenishment',
      name: 'Auto Replenishment',
      description: 'Create jobs for stores below floor',
      endpoint: '/api/cron/auto-replenishment',
      icon: Package,
      color: 'green',
      hasDryRun: true,
    },
  ]

  return (
    <div className="space-y-4">
      {jobs.map((job) => {
        const Icon = job.icon
        const result = results[job.id]
        const isLoading = loading === job.id || loading === `${job.id}-dry`

        return (
          <div
            key={job.id}
            className="flex items-start justify-between p-4 bg-gray-50 rounded-lg"
          >
            <div className="flex items-start">
              <div className={`p-2 rounded-lg bg-${job.color}-100 mr-4`}>
                <Icon className={`h-5 w-5 text-${job.color}-600`} />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{job.name}</h3>
                <p className="text-sm text-gray-500">{job.description}</p>
                {result && (
                  <div
                    className={`mt-2 flex items-center text-sm ${
                      result.success ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 mr-1" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-1" />
                    )}
                    {result.message}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {job.hasDryRun && (
                <button
                  onClick={() => runJob(`${job.id}-dry`, job.endpoint, true)}
                  disabled={isLoading}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  {loading === `${job.id}-dry` ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Dry Run
                </button>
              )}
              <button
                onClick={() => runJob(job.id, job.endpoint, false)}
                disabled={isLoading}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading === job.id ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Run Now
              </button>
            </div>
          </div>
        )
      })}

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>Scheduled runs:</strong> These tasks run automatically daily via Vercel Cron.
          Store health updates at 6:00 AM UTC, auto-replenishment at 7:00 AM UTC.
        </p>
      </div>
    </div>
  )
}
