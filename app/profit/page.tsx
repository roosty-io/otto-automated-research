'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ProfitMetrics {
  period: string
  revenue: number
  cost: number
  grossProfit: number
  fees: number
  netProfit: number
  profitMargin: number
  orderCount: number
  avgOrderValue: number
  avgProfitPerOrder: number
  sellThroughRate: number
  returnRate: number
}

interface ProfitProjection {
  currentPace: {
    dailyProfit: number
    weeklyProfit: number
    monthlyProfit: number
    yearlyProfit: number
  }
  projectedMonthEnd: number
  projectedYearEnd: number
  goalProgress: number
  daysToGoal: number | null
  onTrack: boolean
  requiredDailyProfit: number
  recommendation: string
}

interface ROIMetrics {
  totalInvestment: number
  totalProfit: number
  roi: number
  paybackDays: number | null
  profitPerDollarInvested: number
}

interface ProfitBreakdown {
  byStore: Array<{
    storeId: string
    storeName: string
    revenue: number
    profit: number
    profitMargin: number
    contribution: number
  }>
  topProducts: Array<{
    skuId: string
    title: string
    revenue: number
    profit: number
    profitMargin: number
    unitsSold: number
  }>
  profitTrend: Array<{
    date: string
    revenue: number
    profit: number
    profitMargin: number
  }>
}

export default function ProfitDashboardPage() {
  const [metrics, setMetrics] = useState<ProfitMetrics | null>(null)
  const [projection, setProjection] = useState<ProfitProjection | null>(null)
  const [roi, setROI] = useState<ROIMetrics | null>(null)
  const [breakdown, setBreakdown] = useState<ProfitBreakdown | null>(null)
  const [alerts, setAlerts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'quarter'>('month')
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [goalTarget, setGoalTarget] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/profit?action=dashboard`)
      const data = await res.json()

      if (data.success) {
        setMetrics(data.metrics)
        setProjection(data.projection)
        setROI(data.roi)
        setBreakdown(data.breakdown)
        setAlerts(data.alerts || [])
      }
    } catch (err) {
      console.error('Failed to load profit data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const createGoal = async () => {
    const target = parseFloat(goalTarget)
    if (isNaN(target) || target <= 0) return

    try {
      const res = await fetch('/api/profit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-goal',
          targetMonthlyProfit: target
        })
      })

      const data = await res.json()
      if (data.success) {
        setShowGoalModal(false)
        setGoalTarget('')
        loadData()
      }
    } catch (err) {
      console.error('Failed to create goal:', err)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatPercent = (value: number) => `${value.toFixed(1)}%`

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading profit data...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Profit Tracker</h1>
              <p className="text-sm text-gray-500">Track your profit goals and ROI</p>
            </div>
            <button
              onClick={() => setShowGoalModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              Set Profit Goal
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {alerts.map((alert, idx) => (
              <div key={idx} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center">
                <span className="text-yellow-600 mr-3">⚠️</span>
                <p className="text-sm text-yellow-800">{alert}</p>
              </div>
            ))}
          </div>
        )}

        {/* Goal Progress Card */}
        {projection && projection.goalProgress > 0 && (
          <div className={`mb-6 p-6 rounded-xl ${
            projection.onTrack ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className={`text-lg font-semibold ${projection.onTrack ? 'text-green-800' : 'text-orange-800'}`}>
                  Monthly Goal Progress
                </h2>
                <p className={`text-sm ${projection.onTrack ? 'text-green-600' : 'text-orange-600'}`}>
                  {projection.recommendation}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${projection.onTrack ? 'text-green-700' : 'text-orange-700'}`}>
                  {formatPercent(projection.goalProgress)}
                </p>
                <p className="text-sm text-gray-500">
                  {projection.daysToGoal !== null && projection.daysToGoal > 0
                    ? `${projection.daysToGoal} days to goal`
                    : 'Goal achieved!'
                  }
                </p>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className={`h-4 rounded-full ${projection.onTrack ? 'bg-green-500' : 'bg-orange-500'}`}
                style={{ width: `${Math.min(projection.goalProgress, 100)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Main Metrics */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          {/* Net Profit */}
          <div className="col-span-2 bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-6 text-white">
            <p className="text-green-100 text-sm">Net Profit (This Month)</p>
            <p className="text-4xl font-bold mt-2">{formatCurrency(metrics?.netProfit || 0)}</p>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-green-500/30">
              <div>
                <p className="text-green-200 text-xs">Revenue</p>
                <p className="text-lg font-semibold">{formatCurrency(metrics?.revenue || 0)}</p>
              </div>
              <div>
                <p className="text-green-200 text-xs">Costs</p>
                <p className="text-lg font-semibold">{formatCurrency(metrics?.cost || 0)}</p>
              </div>
              <div>
                <p className="text-green-200 text-xs">eBay Fees</p>
                <p className="text-lg font-semibold">{formatCurrency(metrics?.fees || 0)}</p>
              </div>
            </div>
          </div>

          {/* Profit Margin */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-500">Profit Margin</p>
            <p className={`text-3xl font-bold mt-2 ${
              (metrics?.profitMargin || 0) >= 20 ? 'text-green-600' :
              (metrics?.profitMargin || 0) >= 10 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {formatPercent(metrics?.profitMargin || 0)}
            </p>
            <p className="text-xs text-gray-400 mt-2">Target: 20%+</p>
          </div>

          {/* Orders */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-500">Orders</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{metrics?.orderCount || 0}</p>
            <p className="text-xs text-gray-400 mt-2">
              Avg: {formatCurrency(metrics?.avgOrderValue || 0)}/order
            </p>
          </div>
        </div>

        {/* Projections */}
        {projection && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Daily Pace</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(projection.currentPace.dailyProfit)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Weekly Pace</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(projection.currentPace.weeklyProfit)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Projected Month</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(projection.projectedMonthEnd)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Projected Year</p>
              <p className="text-xl font-bold text-purple-600">{formatCurrency(projection.projectedYearEnd)}</p>
            </div>
          </div>
        )}

        {/* ROI Card */}
        {roi && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Return on Investment</h3>
            <div className="grid grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-500">Total Investment</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(roi.totalInvestment)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Profit</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(roi.totalProfit)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ROI</p>
                <p className={`text-2xl font-bold ${roi.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(roi.roi)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payback Period</p>
                <p className="text-2xl font-bold text-gray-900">
                  {roi.paybackDays ? `${roi.paybackDays} days` : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-6">
          {/* By Store */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Profit by Store</h3>
            <div className="space-y-3">
              {breakdown?.byStore.length === 0 ? (
                <p className="text-gray-500 text-sm">No store data yet</p>
              ) : (
                breakdown?.byStore.slice(0, 5).map(store => (
                  <div key={store.storeId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{store.storeName}</p>
                      <p className="text-xs text-gray-500">{formatPercent(store.contribution)} of total</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">{formatCurrency(store.profit)}</p>
                      <p className="text-xs text-gray-500">{formatPercent(store.profitMargin)} margin</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Profit Products</h3>
            <div className="space-y-3">
              {breakdown?.topProducts.length === 0 ? (
                <p className="text-gray-500 text-sm">No product data yet</p>
              ) : (
                breakdown?.topProducts.slice(0, 5).map(product => (
                  <div key={product.skuId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{product.title}</p>
                      <p className="text-xs text-gray-500">{product.unitsSold} sold</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-bold text-green-600">{formatCurrency(product.profit)}</p>
                      <p className="text-xs text-gray-500">{formatPercent(product.profitMargin)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl text-white">
          <h3 className="text-lg font-semibold mb-2">Increase Your Profits</h3>
          <p className="text-blue-100 text-sm mb-4">Take action to hit your profit goals faster</p>
          <div className="flex space-x-4">
            <Link
              href="/automation/upload"
              className="px-4 py-2 bg-white/20 rounded-lg text-sm font-medium hover:bg-white/30"
            >
              Add More Listings
            </Link>
            <Link
              href="/repricing"
              className="px-4 py-2 bg-white/20 rounded-lg text-sm font-medium hover:bg-white/30"
            >
              Optimize Prices
            </Link>
            <Link
              href="/pruning"
              className="px-4 py-2 bg-white/20 rounded-lg text-sm font-medium hover:bg-white/30"
            >
              Remove Losers
            </Link>
          </div>
        </div>
      </main>

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Set Monthly Profit Goal</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Monthly Profit
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  value={goalTarget}
                  onChange={e => setGoalTarget(e.target.value)}
                  placeholder="5000"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                This is your net profit target after all costs and fees
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowGoalModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createGoal}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Set Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
