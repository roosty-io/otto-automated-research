'use client'

import { useState, useEffect } from 'react'

interface ProfitMetrics {
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
  avgOrderValue: number
  totalOrders: number
  change: {
    totalRevenue?: number
    grossProfit?: number
    totalOrders?: number
  }
}

interface PerformanceMetrics {
  totalListings: number
  activeListings: number
  totalViews: number
  totalWatchers: number
  conversionRate: number
  sellThroughRate: number
  avgDaysToSell: number
}

interface StoreRanking {
  storeId: string
  storeName: string
  revenue: number
  profit: number
  orders: number
  trend: 'up' | 'down' | 'stable'
  rank: number
}

interface SKUPerformance {
  skuId: string
  sku: string
  title: string
  revenue: number
  profit: number
  unitsSold: number
  rank: number
}

interface Forecast {
  projected: number
  confidence: 'high' | 'medium' | 'low'
  dailyAverage: number
  trend: number
}

type Period = 'week' | 'month' | 'quarter' | 'year'

export default function AdvancedAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [profit, setProfit] = useState<ProfitMetrics | null>(null)
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null)
  const [rankings, setRankings] = useState<StoreRanking[]>([])
  const [topSkus, setTopSkus] = useState<SKUPerformance[]>([])
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [period])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics/advanced?type=dashboard&period=${period}`)
      if (res.ok) {
        const data = await res.json()
        setProfit(data.dashboard.profit)
        setPerformance(data.dashboard.performance)
        setRankings(data.dashboard.rankings)
        setTopSkus(data.dashboard.topSkus)
        setForecast(data.dashboard.forecast)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const periods: { id: Period; label: string }[] = [
    { id: 'week', label: '7 Days' },
    { id: 'month', label: '30 Days' },
    { id: 'quarter', label: '90 Days' },
    { id: 'year', label: '1 Year' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600 mt-1">
              Performance insights and revenue tracking
            </p>
          </div>
          <div className="flex gap-2">
            {periods.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  period === p.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Revenue"
                value={`$${profit?.totalRevenue.toLocaleString() || 0}`}
                change={profit?.change.totalRevenue}
                subtitle={`${profit?.totalOrders || 0} orders`}
              />
              <MetricCard
                title="Gross Profit"
                value={`$${profit?.grossProfit.toLocaleString() || 0}`}
                change={profit?.change.grossProfit}
                subtitle={`${profit?.grossMargin.toFixed(1) || 0}% margin`}
              />
              <MetricCard
                title="Net Profit"
                value={`$${profit?.netProfit.toLocaleString() || 0}`}
                subtitle={`${profit?.netMargin.toFixed(1) || 0}% margin`}
              />
              <MetricCard
                title="Avg Order"
                value={`$${profit?.avgOrderValue.toFixed(2) || 0}`}
                change={profit?.change.totalOrders}
                subtitle="Per order"
              />
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-600">Active Listings</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {performance?.activeListings.toLocaleString() || 0}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  of {performance?.totalListings.toLocaleString() || 0} total
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-600">Views</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">
                  {performance?.totalViews.toLocaleString() || 0}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {performance?.totalWatchers || 0} watchers
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-600">Conversion Rate</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {performance?.conversionRate.toFixed(2) || 0}%
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {performance?.sellThroughRate.toFixed(1) || 0}% sell-through
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-600">Avg Days to Sell</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">
                  {performance?.avgDaysToSell || 0}
                </p>
                <p className="text-sm text-gray-500 mt-1">days average</p>
              </div>
            </div>

            {/* Forecast */}
            {forecast && (
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-blue-100 text-sm">30-Day Forecast</p>
                    <p className="text-3xl font-bold mt-1">
                      ${forecast.projected.toLocaleString()}
                    </p>
                    <p className="text-blue-100 mt-2">
                      ${forecast.dailyAverage.toFixed(0)}/day avg
                      {forecast.trend !== 0 && (
                        <span className={forecast.trend > 0 ? '' : 'text-red-200'}>
                          {' '}({forecast.trend > 0 ? '+' : ''}{forecast.trend.toFixed(1)}% trend)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      forecast.confidence === 'high'
                        ? 'bg-green-400/30 text-green-100'
                        : forecast.confidence === 'medium'
                          ? 'bg-yellow-400/30 text-yellow-100'
                          : 'bg-red-400/30 text-red-100'
                    }`}>
                      {forecast.confidence} confidence
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Store Rankings & Top SKUs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Store Rankings */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Store Rankings</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {rankings.length > 0 ? rankings.map(store => (
                    <div key={store.storeId} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                          #{store.rank}
                        </span>
                        <div>
                          <p className="font-medium text-gray-900">{store.storeName}</p>
                          <p className="text-sm text-gray-500">{store.orders} orders</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          ${store.revenue.toLocaleString()}
                        </p>
                        <p className="text-sm text-green-600">
                          ${store.profit.toLocaleString()} profit
                        </p>
                      </div>
                      <span className={`ml-2 ${
                        store.trend === 'up'
                          ? 'text-green-500'
                          : store.trend === 'down'
                            ? 'text-red-500'
                            : 'text-gray-400'
                      }`}>
                        {store.trend === 'up' ? '↑' : store.trend === 'down' ? '↓' : '→'}
                      </span>
                    </div>
                  )) : (
                    <div className="p-8 text-center text-gray-500">
                      No store data available
                    </div>
                  )}
                </div>
              </div>

              {/* Top SKUs */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Top Performing SKUs</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {topSkus.length > 0 ? topSkus.map(sku => (
                    <div key={sku.skuId} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-600">
                          #{sku.rank}
                        </span>
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-gray-900">{sku.sku}</p>
                          <p className="text-sm text-gray-500 truncate max-w-[200px]">
                            {sku.title}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          ${sku.revenue.toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-500">
                          {sku.unitsSold} units
                        </p>
                      </div>
                    </div>
                  )) : (
                    <div className="p-8 text-center text-gray-500">
                      No SKU data available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  change,
  subtitle,
}: {
  title: string
  value: string
  change?: number
  subtitle: string
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex justify-between items-start">
        <p className="text-sm text-gray-600">{title}</p>
        {change !== undefined && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            change > 0
              ? 'bg-green-100 text-green-700'
              : change < 0
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
          }`}>
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  )
}
