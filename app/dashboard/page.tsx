'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface DashboardMetrics {
  revenue: {
    today: number
    yesterday: number
    thisWeek: number
    lastWeek: number
    thisMonth: number
    lastMonth: number
    trend: number
  }
  orders: {
    today: number
    pending: number
    shipped: number
    thisWeek: number
    trend: number
  }
  listings: {
    active: number
    draft: number
    ended: number
    total: number
    newToday: number
  }
  stores: {
    active: number
    total: number
    healthyCount: number
    warningCount: number
  }
  performance: {
    conversionRate: number
    avgOrderValue: number
    sellThroughRate: number
    profitMargin: number
  }
}

interface StorePerformance {
  id: string
  name: string
  revenue: number
  orders: number
  activeListings: number
  healthScore: number
  trend: 'up' | 'down' | 'stable'
}

interface RecentOrder {
  id: string
  buyerUsername: string
  totalAmount: number
  status: string
  storeName: string
  orderDate: string
}

interface Alert {
  id: string
  type: 'warning' | 'error' | 'info' | 'success'
  title: string
  message: string
  timestamp: string
  action?: string
  actionUrl?: string
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [stores, setStores] = useState<StorePerformance[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today')

  const loadData = useCallback(async () => {
    try {
      const [metricsRes, storesRes, ordersRes, alertsRes] = await Promise.all([
        fetch(`/api/dashboard/metrics?range=${timeRange}`),
        fetch('/api/dashboard/stores'),
        fetch('/api/dashboard/orders?limit=10'),
        fetch('/api/notifications/alerts?unread=true&limit=5')
      ])

      if (metricsRes.ok) {
        const data = await metricsRes.json()
        setMetrics(data.metrics)
      }

      if (storesRes.ok) {
        const data = await storesRes.json()
        setStores(data.stores || [])
      }

      if (ordersRes.ok) {
        const data = await ordersRes.json()
        setRecentOrders(data.orders || [])
      }

      if (alertsRes.ok) {
        const data = await alertsRes.json()
        setAlerts(data.alerts || [])
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000)  // Refresh every minute
    return () => clearInterval(interval)
  }, [loadData])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatTrend = (trend: number) => {
    const sign = trend >= 0 ? '+' : ''
    return `${sign}${trend.toFixed(1)}%`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading dashboard...</p>
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
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
              <p className="text-sm text-gray-500">Real-time business metrics and performance</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Time Range Selector */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                {(['today', 'week', 'month'] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                      timeRange === range
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>

              <button
                onClick={loadData}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {alerts.slice(0, 3).map(alert => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg flex items-center justify-between ${
                  alert.type === 'error' ? 'bg-red-50 border border-red-200' :
                  alert.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                  alert.type === 'success' ? 'bg-green-50 border border-green-200' :
                  'bg-blue-50 border border-blue-200'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className={`w-2 h-2 rounded-full ${
                    alert.type === 'error' ? 'bg-red-500' :
                    alert.type === 'warning' ? 'bg-yellow-500' :
                    alert.type === 'success' ? 'bg-green-500' :
                    'bg-blue-500'
                  }`}></span>
                  <div>
                    <p className={`text-sm font-medium ${
                      alert.type === 'error' ? 'text-red-800' :
                      alert.type === 'warning' ? 'text-yellow-800' :
                      alert.type === 'success' ? 'text-green-800' :
                      'text-blue-800'
                    }`}>{alert.title}</p>
                    <p className={`text-xs ${
                      alert.type === 'error' ? 'text-red-600' :
                      alert.type === 'warning' ? 'text-yellow-600' :
                      alert.type === 'success' ? 'text-green-600' :
                      'text-blue-600'
                    }`}>{alert.message}</p>
                  </div>
                </div>
                {alert.action && (
                  <Link
                    href={alert.actionUrl || '#'}
                    className={`text-sm font-medium ${
                      alert.type === 'error' ? 'text-red-700 hover:text-red-800' :
                      alert.type === 'warning' ? 'text-yellow-700 hover:text-yellow-800' :
                      'text-blue-700 hover:text-blue-800'
                    }`}
                  >
                    {alert.action}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Revenue & Orders Row */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          {/* Revenue Card */}
          <div className="col-span-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <p className="text-blue-100">Total Revenue</p>
              <span className={`text-xs px-2 py-1 rounded-full ${
                (metrics?.revenue.trend || 0) >= 0 ? 'bg-green-500' : 'bg-red-500'
              }`}>
                {formatTrend(metrics?.revenue.trend || 0)}
              </span>
            </div>
            <p className="text-4xl font-bold mb-2">{formatCurrency(metrics?.revenue.today || 0)}</p>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-blue-500/30">
              <div>
                <p className="text-blue-200 text-xs">Yesterday</p>
                <p className="text-lg font-semibold">{formatCurrency(metrics?.revenue.yesterday || 0)}</p>
              </div>
              <div>
                <p className="text-blue-200 text-xs">This Week</p>
                <p className="text-lg font-semibold">{formatCurrency(metrics?.revenue.thisWeek || 0)}</p>
              </div>
              <div>
                <p className="text-blue-200 text-xs">This Month</p>
                <p className="text-lg font-semibold">{formatCurrency(metrics?.revenue.thisMonth || 0)}</p>
              </div>
            </div>
          </div>

          {/* Orders Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-500 mb-1">Orders Today</p>
            <p className="text-3xl font-bold text-gray-900">{metrics?.orders.today || 0}</p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pending</span>
                <span className="font-medium text-yellow-600">{metrics?.orders.pending || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Shipped</span>
                <span className="font-medium text-green-600">{metrics?.orders.shipped || 0}</span>
              </div>
            </div>
          </div>

          {/* Listings Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-500 mb-1">Active Listings</p>
            <p className="text-3xl font-bold text-gray-900">{metrics?.listings.active?.toLocaleString() || 0}</p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">New Today</span>
                <span className="font-medium text-blue-600">+{metrics?.listings.newToday || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Drafts</span>
                <span className="font-medium text-gray-600">{metrics?.listings.draft || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Conversion Rate</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {(metrics?.performance.conversionRate || 0).toFixed(2)}%
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Avg Order Value</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(metrics?.performance.avgOrderValue || 0)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Sell-Through Rate</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {(metrics?.performance.sellThroughRate || 0).toFixed(1)}%
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Profit Margin</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {(metrics?.performance.profitMargin || 0).toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Store Performance & Recent Orders */}
        <div className="grid grid-cols-2 gap-6">
          {/* Store Performance */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Store Performance</h3>
              <Link href="/stores" className="text-sm text-blue-600 hover:text-blue-700">View All</Link>
            </div>
            <div className="space-y-3">
              {stores.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No stores configured</p>
              ) : (
                stores.slice(0, 5).map(store => (
                  <div key={store.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${
                        store.healthScore >= 80 ? 'bg-green-500' :
                        store.healthScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{store.name}</p>
                        <p className="text-xs text-gray-500">
                          {store.activeListings.toLocaleString()} listings
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{formatCurrency(store.revenue)}</p>
                      <p className="text-xs text-gray-500">{store.orders} orders</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Orders */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
              <Link href="/sales" className="text-sm text-blue-600 hover:text-blue-700">View All</Link>
            </div>
            <div className="space-y-3">
              {recentOrders.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No recent orders</p>
              ) : (
                recentOrders.slice(0, 5).map(order => (
                  <div key={order.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{order.buyerUsername}</p>
                      <p className="text-xs text-gray-500">{order.storeName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{formatCurrency(order.totalAmount)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        order.status === 'FULFILLED' ? 'bg-green-100 text-green-700' :
                        order.status === 'NOT_STARTED' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-5 gap-4">
          {[
            { href: '/automation/upload', label: 'Upload Products', icon: '📦' },
            { href: '/automation/listings', label: 'Manage Listings', icon: '📋' },
            { href: '/repricing', label: 'Repricing Rules', icon: '💰' },
            { href: '/admin/compliance', label: 'Compliance', icon: '✓' },
            { href: '/admin/scheduler', label: 'Job Scheduler', icon: '⚙️' },
          ].map(action => (
            <Link
              key={action.href}
              href={action.href}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all text-center"
            >
              <span className="text-2xl">{action.icon}</span>
              <p className="text-sm font-medium text-gray-900 mt-2">{action.label}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
