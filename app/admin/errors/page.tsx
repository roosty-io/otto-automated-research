'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface CircuitBreakerStatus {
  name: string
  state: 'closed' | 'open' | 'half-open'
  failures: number
  lastFailure?: string
  lastSuccess?: string
  nextAttempt?: string
}

interface ServiceHealth {
  name: string
  healthy: boolean
  latency?: number
  error?: string
  lastCheck: string
}

interface ErrorLog {
  id: string
  timestamp: string
  error: string
  stack?: string
  context: {
    operation: string
    service: string
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }
  severity: 'low' | 'medium' | 'high' | 'critical'
  resolved: boolean
}

export default function ErrorsPage() {
  const [circuitBreakers, setCircuitBreakers] = useState<CircuitBreakerStatus[]>([])
  const [healthChecks, setHealthChecks] = useState<ServiceHealth[]>([])
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'errors' | 'circuits'>('overview')
  const [severityFilter, setSeverityFilter] = useState<string>('all')

  const loadData = useCallback(async () => {
    try {
      const [statusRes, errorsRes] = await Promise.all([
        fetch('/api/resilience?action=status'),
        fetch('/api/resilience?action=errors&limit=100')
      ])

      if (statusRes.ok) {
        const data = await statusRes.json()
        setCircuitBreakers(data.circuitBreakers || [])
        setHealthChecks(data.healthChecks || [])
      }

      if (errorsRes.ok) {
        const data = await errorsRes.json()
        setErrors(data.errors || [])
      }
    } catch (err) {
      console.error('Failed to load resilience data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  const resetCircuitBreaker = async (service: string) => {
    try {
      const res = await fetch('/api/resilience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-circuit-breaker', service })
      })

      if (res.ok) {
        await loadData()
      }
    } catch (err) {
      console.error('Failed to reset circuit breaker:', err)
    }
  }

  const getCircuitStateColor = (state: string) => {
    switch (state) {
      case 'closed': return 'bg-green-500'
      case 'open': return 'bg-red-500'
      case 'half-open': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'low': return 'bg-gray-100 text-gray-700 border-gray-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  const filteredErrors = severityFilter === 'all'
    ? errors
    : errors.filter(e => e.severity === severityFilter)

  const errorsByService = errors.reduce((acc, err) => {
    const service = err.context?.service || 'unknown'
    acc[service] = (acc[service] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const criticalCount = errors.filter(e => e.severity === 'critical').length
  const highCount = errors.filter(e => e.severity === 'high').length
  const openCircuits = circuitBreakers.filter(cb => cb.state === 'open').length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading error data...</p>
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
                <h1 className="text-xl font-semibold text-gray-900">Error Tracking & Resilience</h1>
                <p className="text-sm text-gray-500">Monitor errors, circuit breakers, and service health</p>
              </div>
            </div>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Banner */}
        <div className={`mb-6 p-4 rounded-xl ${
          openCircuits > 0 || criticalCount > 0
            ? 'bg-red-50 border border-red-200'
            : highCount > 0
            ? 'bg-yellow-50 border border-yellow-200'
            : 'bg-green-50 border border-green-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                openCircuits > 0 || criticalCount > 0 ? 'bg-red-500' :
                highCount > 0 ? 'bg-yellow-500' : 'bg-green-500'
              }`}></div>
              <span className={`font-medium ${
                openCircuits > 0 || criticalCount > 0 ? 'text-red-800' :
                highCount > 0 ? 'text-yellow-800' : 'text-green-800'
              }`}>
                {openCircuits > 0 || criticalCount > 0
                  ? 'System Issues Detected'
                  : highCount > 0
                  ? 'Some Warnings'
                  : 'All Systems Operational'
                }
              </span>
            </div>
            <div className="flex space-x-4 text-sm">
              <span className="text-red-600">{criticalCount} Critical</span>
              <span className="text-orange-600">{highCount} High</span>
              <span className="text-gray-600">{openCircuits} Open Circuits</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'errors', label: `Errors (${errors.length})` },
              { id: 'circuits', label: 'Circuit Breakers' }
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

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Total Errors (24h)</p>
                <p className="text-2xl font-bold text-gray-900">{errors.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Critical</p>
                <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Open Circuits</p>
                <p className="text-2xl font-bold text-orange-600">{openCircuits}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Healthy Services</p>
                <p className="text-2xl font-bold text-green-600">
                  {healthChecks.filter(h => h.healthy).length}/{healthChecks.length}
                </p>
              </div>
            </div>

            {/* Service Health & Errors by Service */}
            <div className="grid grid-cols-2 gap-6">
              {/* Service Health */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Health</h3>
                <div className="space-y-3">
                  {healthChecks.length === 0 ? (
                    <p className="text-gray-500 text-sm">No health checks recorded</p>
                  ) : (
                    healthChecks.map(health => (
                      <div key={health.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <span className={`w-2 h-2 rounded-full ${health.healthy ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          <span className="font-medium text-gray-900">{health.name}</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm ${health.healthy ? 'text-green-600' : 'text-red-600'}`}>
                            {health.healthy ? 'Healthy' : 'Unhealthy'}
                          </span>
                          {health.latency && (
                            <p className="text-xs text-gray-500">{health.latency}ms</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Errors by Service */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Errors by Service</h3>
                <div className="space-y-3">
                  {Object.entries(errorsByService).length === 0 ? (
                    <p className="text-gray-500 text-sm">No errors recorded</p>
                  ) : (
                    Object.entries(errorsByService)
                      .sort((a, b) => b[1] - a[1])
                      .map(([service, count]) => (
                        <div key={service} className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">{service}</span>
                          <div className="flex items-center space-x-2">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-red-500 h-2 rounded-full"
                                style={{ width: `${Math.min(100, (count / errors.length) * 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Errors Tab */}
        {activeTab === 'errors' && (
          <div className="space-y-4">
            {/* Filter */}
            <div className="flex space-x-2">
              {['all', 'critical', 'high', 'medium', 'low'].map(sev => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    severityFilter === sev
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {sev.charAt(0).toUpperCase() + sev.slice(1)}
                </button>
              ))}
            </div>

            {/* Error List */}
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {filteredErrors.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No errors found
                </div>
              ) : (
                filteredErrors.map(error => (
                  <div key={error.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getSeverityColor(error.severity)}`}>
                          {error.severity}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {error.context?.service}:{error.context?.operation}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(error.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{error.error}</p>
                    {error.stack && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                          Stack trace
                        </summary>
                        <pre className="mt-2 p-2 bg-gray-50 rounded text-gray-600 overflow-x-auto">
                          {error.stack}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Circuit Breakers Tab */}
        {activeTab === 'circuits' && (
          <div className="grid grid-cols-2 gap-4">
            {circuitBreakers.length === 0 ? (
              <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                No circuit breakers active
              </div>
            ) : (
              circuitBreakers.map(cb => (
                <div key={cb.name} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className={`w-3 h-3 rounded-full ${getCircuitStateColor(cb.state)}`}></span>
                      <h3 className="text-lg font-semibold text-gray-900 capitalize">{cb.name}</h3>
                    </div>
                    <span className={`text-sm px-2 py-1 rounded-full ${
                      cb.state === 'closed' ? 'bg-green-100 text-green-700' :
                      cb.state === 'open' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {cb.state}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Failures</span>
                      <span className="font-medium text-gray-900">{cb.failures}</span>
                    </div>
                    {cb.lastFailure && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Last Failure</span>
                        <span className="text-gray-700">{new Date(cb.lastFailure).toLocaleTimeString()}</span>
                      </div>
                    )}
                    {cb.lastSuccess && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Last Success</span>
                        <span className="text-gray-700">{new Date(cb.lastSuccess).toLocaleTimeString()}</span>
                      </div>
                    )}
                    {cb.nextAttempt && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Next Attempt</span>
                        <span className="text-gray-700">{new Date(cb.nextAttempt).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>

                  {cb.state === 'open' && (
                    <button
                      onClick={() => resetCircuitBreaker(cb.name)}
                      className="mt-4 w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      Reset Circuit Breaker
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
