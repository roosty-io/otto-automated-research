'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ApiEndpoint {
  name: string
  endpoint: string
  method: string
  description: string
  category: string
}

interface HealthCheckResult {
  name: string
  endpoint: string
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  latency: number
  lastChecked: string
  error?: string
}

const API_ENDPOINTS: ApiEndpoint[] = [
  // Core APIs
  { name: 'Database Health', endpoint: '/api/admin/health?type=health', method: 'GET', description: 'Database connection status', category: 'Core' },
  { name: 'System Status', endpoint: '/api/system/status', method: 'GET', description: 'Overall system health', category: 'Core' },
  { name: 'Dashboard Stats', endpoint: '/api/dashboard/stats', method: 'GET', description: 'Dashboard statistics', category: 'Core' },

  // Store APIs
  { name: 'Stores List', endpoint: '/api/stores', method: 'GET', description: 'List all stores', category: 'Stores' },
  { name: 'Dashboard Stores', endpoint: '/api/dashboard/stores', method: 'GET', description: 'Store performance', category: 'Stores' },

  // Product APIs
  { name: 'SKUs List', endpoint: '/api/skus', method: 'GET', description: 'List SKUs', category: 'Products' },
  { name: 'Compliance Check', endpoint: '/api/compliance?action=stats', method: 'GET', description: 'Compliance statistics', category: 'Products' },
  { name: 'Policy Check', endpoint: '/api/policy-check', method: 'GET', description: 'Policy validation', category: 'Products' },

  // Automation APIs
  { name: 'AutoDS Auth', endpoint: '/api/autods/auth', method: 'GET', description: 'AutoDS connection', category: 'Automation' },
  { name: 'AutoDS Stores', endpoint: '/api/autods/stores', method: 'GET', description: 'AutoDS store list', category: 'Automation' },
  { name: 'Scheduler Status', endpoint: '/api/scheduler?action=list', method: 'GET', description: 'Job scheduler', category: 'Automation' },

  // External APIs
  { name: 'Keepa Status', endpoint: '/api/keepa/status', method: 'GET', description: 'Keepa API connection', category: 'External' },
  { name: 'eBay Auth', endpoint: '/api/ebay/auth', method: 'GET', description: 'eBay API status', category: 'External' },

  // Analytics
  { name: 'Notifications', endpoint: '/api/notifications', method: 'GET', description: 'Notifications system', category: 'Analytics' },
  { name: 'Repricing', endpoint: '/api/repricing', method: 'GET', description: 'Repricing rules', category: 'Analytics' },
]

export default function ApiHealthPage() {
  const [results, setResults] = useState<HealthCheckResult[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [filter, setFilter] = useState<string>('all')

  const checkHealth = useCallback(async () => {
    setChecking(true)
    const newResults: HealthCheckResult[] = []

    for (const api of API_ENDPOINTS) {
      const startTime = Date.now()
      let status: HealthCheckResult['status'] = 'unknown'
      let error: string | undefined

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        const res = await fetch(api.endpoint, {
          method: api.method,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (res.ok) {
          status = 'healthy'
        } else if (res.status >= 500) {
          status = 'down'
          error = `HTTP ${res.status}`
        } else {
          status = 'degraded'
          error = `HTTP ${res.status}`
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          status = 'down'
          error = 'Timeout'
        } else {
          status = 'down'
          error = err instanceof Error ? err.message : 'Unknown error'
        }
      }

      const latency = Date.now() - startTime

      newResults.push({
        name: api.name,
        endpoint: api.endpoint,
        status,
        latency,
        lastChecked: new Date().toISOString(),
        error
      })
    }

    setResults(newResults)
    setLoading(false)
    setChecking(false)
  }, [])

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 60000)
    return () => clearInterval(interval)
  }, [checkHealth])

  const categories = ['all', ...Array.from(new Set(API_ENDPOINTS.map(e => e.category)))]

  const filteredEndpoints = filter === 'all'
    ? API_ENDPOINTS
    : API_ENDPOINTS.filter(e => e.category === filter)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <span className="w-3 h-3 rounded-full bg-green-500"></span>
        )
      case 'degraded':
        return (
          <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
        )
      case 'down':
        return (
          <span className="w-3 h-3 rounded-full bg-red-500"></span>
        )
      default:
        return (
          <span className="w-3 h-3 rounded-full bg-gray-300"></span>
        )
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50'
      case 'degraded': return 'text-yellow-600 bg-yellow-50'
      case 'down': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const healthyCount = results.filter(r => r.status === 'healthy').length
  const degradedCount = results.filter(r => r.status === 'degraded').length
  const downCount = results.filter(r => r.status === 'down').length
  const overallStatus = downCount > 0 ? 'down' : degradedCount > 0 ? 'degraded' : 'healthy'

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
                <h1 className="text-xl font-semibold text-gray-900">API Health Monitor</h1>
                <p className="text-sm text-gray-500">Real-time API endpoint monitoring</p>
              </div>
            </div>
            <button
              onClick={checkHealth}
              disabled={checking}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {checking ? 'Checking...' : 'Refresh All'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Overview */}
        <div className={`mb-6 p-6 rounded-xl ${
          overallStatus === 'healthy' ? 'bg-green-50 border border-green-200' :
          overallStatus === 'degraded' ? 'bg-yellow-50 border border-yellow-200' :
          'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                overallStatus === 'healthy' ? 'bg-green-500' :
                overallStatus === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
              }`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className={`text-xl font-bold ${
                  overallStatus === 'healthy' ? 'text-green-800' :
                  overallStatus === 'degraded' ? 'text-yellow-800' : 'text-red-800'
                }`}>
                  {overallStatus === 'healthy' ? 'All Systems Operational' :
                   overallStatus === 'degraded' ? 'Partial Degradation' : 'Service Disruption'}
                </h2>
                <p className={`text-sm ${
                  overallStatus === 'healthy' ? 'text-green-600' :
                  overallStatus === 'degraded' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  Last checked: {results[0]?.lastChecked ? new Date(results[0].lastChecked).toLocaleTimeString() : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex space-x-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{healthyCount}</p>
                <p className="text-sm text-gray-500">Healthy</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">{degradedCount}</p>
                <p className="text-sm text-gray-500">Degraded</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{downCount}</p>
                <p className="text-sm text-gray-500">Down</p>
              </div>
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="mb-6 flex space-x-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === cat
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Endpoints Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Checking API health...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEndpoints.map(api => {
              const result = results.find(r => r.endpoint === api.endpoint)
              return (
                <div
                  key={api.endpoint}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(result?.status || 'unknown')}
                      <h3 className="text-sm font-medium text-gray-900">{api.name}</h3>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(result?.status || 'unknown')}`}>
                      {result?.status || 'checking'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{api.description}</p>
                  <div className="flex items-center justify-between text-xs">
                    <code className="text-gray-400 bg-gray-50 px-1 py-0.5 rounded">
                      {api.method} {api.endpoint}
                    </code>
                    {result?.latency && (
                      <span className={`font-medium ${
                        result.latency < 200 ? 'text-green-600' :
                        result.latency < 500 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {result.latency}ms
                      </span>
                    )}
                  </div>
                  {result?.error && (
                    <p className="mt-2 text-xs text-red-600">{result.error}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
