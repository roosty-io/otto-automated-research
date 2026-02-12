'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface OverviewMetrics {
  totalStores: number
  activeListings: number
  totalSales: number
  totalProfit: number
  period: string
}

interface ScraperMetrics {
  healthScore: number
  healthTrend: Array<{ hour: string; score: number }>
  recentErrors: number
  failingSelectors: number
  lastCheck: string | null
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  components?: Array<{
    name: string
    status: string
    latencyMs?: number
    error?: string
  }>
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<OverviewMetrics | null>(null)
  const [scrapers, setScrapers] = useState<ScraperMetrics | null>(null)
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('24h')

  useEffect(() => {
    fetchMetrics()
  }, [period])

  async function fetchMetrics() {
    setLoading(true)
    try {
      const [overviewRes, scrapersRes, healthRes] = await Promise.all([
        fetch(`/api/admin/metrics?type=overview&period=${period}`),
        fetch('/api/admin/metrics?type=scrapers'),
        fetch('/api/health?verbose=true'),
      ])

      const overviewData = await overviewRes.json()
      const scrapersData = await scrapersRes.json()
      const healthData = await healthRes.json()

      if (overviewData.success) setOverview(overviewData.metrics)
      if (scrapersData.success) setScrapers(scrapersData.metrics)
      setHealth(healthData)
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800'
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800'
      case 'unhealthy':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/admin" className="text-indigo-600 hover:text-indigo-800 text-sm mb-2 inline-block">
              Back to Admin
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Validation Dashboard</h1>
            <p className="text-gray-500 mt-1">System health and metrics monitoring</p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-4 py-2 border rounded-lg bg-white"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <button
              onClick={fetchMetrics}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* System Health Banner */}
        {health && (
          <div className={`mb-6 p-4 rounded-xl ${getStatusColor(health.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  health.status === 'healthy' ? 'bg-green-500' :
                  health.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                }`}></div>
                <span className="font-medium">
                  System Status: {health.status.charAt(0).toUpperCase() + health.status.slice(1)}
                </span>
              </div>
              <span className="text-sm opacity-75">
                Last checked: {new Date(health.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}

        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="text-sm font-medium text-gray-500 mb-1">Total Stores</div>
              <div className="text-3xl font-bold text-gray-900">{overview.totalStores}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="text-sm font-medium text-gray-500 mb-1">Active Listings</div>
              <div className="text-3xl font-bold text-gray-900">{overview.activeListings.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="text-sm font-medium text-gray-500 mb-1">Total Sales</div>
              <div className="text-3xl font-bold text-gray-900">{overview.totalSales.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="text-sm font-medium text-gray-500 mb-1">Est. Profit</div>
              <div className="text-3xl font-bold text-green-600">${overview.totalProfit.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Scraper Health */}
        {scrapers && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Scraper Health</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">Health Score</div>
                  <div className={`text-4xl font-bold ${getHealthScoreColor(scrapers.healthScore)}`}>
                    {scrapers.healthScore}%
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">Recent Errors (24h)</div>
                  <div className={`text-3xl font-bold ${scrapers.recentErrors > 10 ? 'text-red-600' : 'text-gray-900'}`}>
                    {scrapers.recentErrors}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">Failing Selectors</div>
                  <div className={`text-3xl font-bold ${scrapers.failingSelectors > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {scrapers.failingSelectors}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">Last Check</div>
                  <div className="text-lg text-gray-900">
                    {scrapers.lastCheck
                      ? new Date(scrapers.lastCheck).toLocaleTimeString()
                      : 'Never'}
                  </div>
                </div>
              </div>

              {/* Health Trend Mini Chart */}
              {scrapers.healthTrend.length > 0 && (
                <div className="mt-6">
                  <div className="text-sm font-medium text-gray-500 mb-2">24-Hour Trend</div>
                  <div className="flex items-end gap-1 h-16">
                    {scrapers.healthTrend.map((point, i) => (
                      <div
                        key={i}
                        className={`flex-1 ${getHealthScoreColor(point.score).replace('text-', 'bg-').replace('-600', '-200')}`}
                        style={{ height: `${point.score}%` }}
                        title={`${new Date(point.hour).toLocaleTimeString()}: ${point.score}%`}
                      ></div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-4">
                <a
                  href="/api/health/scrapers?screenshot=true"
                  target="_blank"
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
                >
                  Run Health Check
                </a>
                <Link
                  href="/admin/scrapers"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
                >
                  View Details
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Component Health */}
        {health?.components && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Component Status</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {health.components.map((component) => (
                <div key={component.name} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      component.status === 'healthy' ? 'bg-green-500' :
                      component.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></div>
                    <span className="font-medium text-gray-900 capitalize">
                      {component.name.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {component.latencyMs && (
                      <span className="text-sm text-gray-500">
                        {component.latencyMs}ms
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(component.status)}`}>
                      {component.status}
                    </span>
                    {component.error && (
                      <span className="text-sm text-red-600">{component.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
