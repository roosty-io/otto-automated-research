'use client'

import { useState, useEffect } from 'react'

interface FleetOverview {
  totalStores: number
  activeStores: number
  pausedStores: number
  disabledStores: number
  healthDistribution: {
    excellent: number
    good: number
    fair: number
    poor: number
    critical: number
  }
  metrics: {
    totalListings: number
    totalOrders30Days: number
    totalRevenue30Days: number
    totalProfit30Days: number
    avgHealthScore: number
    avgDefectRate: number
    avgLateShipmentRate: number
    avgFeedbackScore: number
    capacityUtilization: number
    topPerformers: Array<{ storeId: string; storeName: string; revenue: number }>
    underperformers: Array<{ storeId: string; storeName: string; issues: string[] }>
  }
  alerts: Array<{
    id: string
    severity: 'critical' | 'warning' | 'info'
    type: string
    message: string
    storeIds: string[]
    createdAt: string
    acknowledged: boolean
  }>
}

interface RampUpProgress {
  targetProfitPerStore: number
  currentAvgProfit: number
  storesAtTarget: number
  daysToTarget: number
  trajectory: 'on_track' | 'ahead' | 'behind'
}

export default function FleetDashboard() {
  const [overview, setOverview] = useState<FleetOverview | null>(null)
  const [rampUp, setRampUp] = useState<RampUpProgress | null>(null)
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'health' | 'operations' | 'alerts'>('overview')
  const [selectedGroupId] = useState<string>('default-managed-group')

  useEffect(() => {
    fetchFleetData()
  }, [])

  const fetchFleetData = async () => {
    try {
      setLoading(true)

      // Fetch overview
      const overviewRes = await fetch('/api/fleet?action=overview')
      const overviewData = await overviewRes.json()
      if (overviewData.success) {
        setOverview(overviewData.overview)
      }

      // Fetch managed dashboard data
      const dashboardRes = await fetch(`/api/fleet?action=managed-dashboard&groupId=${selectedGroupId}`)
      const dashboardData = await dashboardRes.json()
      if (dashboardData.success) {
        setRampUp(dashboardData.dashboard.rampUpProgress)
        setRecommendations(dashboardData.dashboard.recommendations)
      }
    } catch (error) {
      console.error('Failed to fetch fleet data:', error)
    } finally {
      setLoading(false)
    }
  }

  const runHealthCheck = async () => {
    try {
      const res = await fetch('/api/fleet?action=health-check')
      const data = await res.json()
      if (data.success) {
        fetchFleetData()
      }
    } catch (error) {
      console.error('Health check failed:', error)
    }
  }

  const executeRebalance = async () => {
    try {
      // Get balance analysis first
      const analysisRes = await fetch(`/api/fleet?action=balance-analysis&groupId=${selectedGroupId}`)
      const analysisData = await analysisRes.json()

      if (analysisData.success && analysisData.plan) {
        const executeRes = await fetch('/api/fleet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'execute-rebalance',
            plan: analysisData.plan
          })
        })
        const result = await executeRes.json()
        if (result.success) {
          fetchFleetData()
        }
      }
    } catch (error) {
      console.error('Rebalance failed:', error)
    }
  }

  const rotateSkus = async () => {
    try {
      const res = await fetch('/api/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rotate-skus',
          groupId: selectedGroupId,
          strategy: 'performance'
        })
      })
      const data = await res.json()
      if (data.success) {
        fetchFleetData()
      }
    } catch (error) {
      console.error('Rotation failed:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading Fleet Dashboard...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Fleet Management</h1>
              <p className="text-gray-400">Managed Service Dashboard - 75+ Stores</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={runHealthCheck}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Run Health Check
              </button>
              <button
                onClick={fetchFleetData}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4">
            {(['overview', 'health', 'operations', 'alerts'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg capitalize ${
                  activeTab === tab ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Ramp-Up Progress Banner */}
        {rampUp && (
          <div className={`mb-6 p-4 rounded-lg ${
            rampUp.trajectory === 'ahead' ? 'bg-green-900/50 border border-green-700' :
            rampUp.trajectory === 'on_track' ? 'bg-blue-900/50 border border-blue-700' :
            'bg-yellow-900/50 border border-yellow-700'
          }`}>
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">30-45 Day Ramp-Up Progress</h2>
                <p className="text-gray-300">
                  Target: ${rampUp.targetProfitPerStore.toLocaleString()}/store/month |
                  Current Avg: ${rampUp.currentAvgProfit.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${
                  rampUp.trajectory === 'ahead' ? 'text-green-400' :
                  rampUp.trajectory === 'on_track' ? 'text-blue-400' :
                  'text-yellow-400'
                }`}>
                  {rampUp.trajectory === 'ahead' ? 'Ahead of Schedule' :
                   rampUp.trajectory === 'on_track' ? 'On Track' : 'Behind Target'}
                </div>
                <div className="text-gray-400">
                  Est. {rampUp.daysToTarget} days to target | {rampUp.storesAtTarget} stores at goal
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'overview' && overview && (
          <>
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <MetricCard
                label="Total Stores"
                value={overview.totalStores}
                subtext={`${overview.activeStores} active`}
                color="blue"
              />
              <MetricCard
                label="Total Listings"
                value={overview.metrics.totalListings.toLocaleString()}
                subtext={`${Math.round(overview.metrics.capacityUtilization)}% capacity`}
                color="green"
              />
              <MetricCard
                label="30-Day Revenue"
                value={`$${overview.metrics.totalRevenue30Days.toLocaleString()}`}
                subtext={`${overview.metrics.totalOrders30Days} orders`}
                color="purple"
              />
              <MetricCard
                label="30-Day Profit"
                value={`$${overview.metrics.totalProfit30Days.toLocaleString()}`}
                subtext={`Avg health: ${overview.metrics.avgHealthScore}`}
                color="yellow"
              />
            </div>

            {/* Health Distribution */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4">Store Health Distribution</h3>
                <div className="space-y-2">
                  <HealthBar label="Excellent" count={overview.healthDistribution.excellent} total={overview.totalStores} color="green" />
                  <HealthBar label="Good" count={overview.healthDistribution.good} total={overview.totalStores} color="blue" />
                  <HealthBar label="Fair" count={overview.healthDistribution.fair} total={overview.totalStores} color="yellow" />
                  <HealthBar label="Poor" count={overview.healthDistribution.poor} total={overview.totalStores} color="orange" />
                  <HealthBar label="Critical" count={overview.healthDistribution.critical} total={overview.totalStores} color="red" />
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4">Fleet Metrics</h3>
                <div className="space-y-3">
                  <MetricRow label="Avg Defect Rate" value={`${overview.metrics.avgDefectRate}%`} threshold={2} />
                  <MetricRow label="Avg Late Shipment" value={`${overview.metrics.avgLateShipmentRate}%`} threshold={7} />
                  <MetricRow label="Avg Feedback Score" value={`${overview.metrics.avgFeedbackScore}%`} threshold={95} inverse />
                  <MetricRow label="Avg Health Score" value={overview.metrics.avgHealthScore} threshold={60} inverse />
                </div>
              </div>
            </div>

            {/* Top/Under Performers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4 text-green-400">Top Performers</h3>
                <div className="space-y-2">
                  {overview.metrics.topPerformers.slice(0, 5).map((store, i) => (
                    <div key={store.storeId} className="flex justify-between items-center p-2 bg-gray-700 rounded">
                      <span>{i + 1}. {store.storeName}</span>
                      <span className="text-green-400">${store.revenue.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4 text-red-400">Needs Attention</h3>
                <div className="space-y-2">
                  {overview.metrics.underperformers.slice(0, 5).map((store) => (
                    <div key={store.storeId} className="flex justify-between items-center p-2 bg-gray-700 rounded">
                      <span>{store.storeName}</span>
                      <div className="flex gap-1">
                        {store.issues.map((issue, i) => (
                          <span key={i} className="text-xs bg-red-900 text-red-300 px-2 py-1 rounded">
                            {issue}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'health' && overview && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-4">Health Summary</h3>
              <div className="grid grid-cols-5 gap-4 text-center">
                <div className="bg-green-900/30 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-green-400">{overview.healthDistribution.excellent}</div>
                  <div className="text-gray-400">Excellent</div>
                </div>
                <div className="bg-blue-900/30 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-blue-400">{overview.healthDistribution.good}</div>
                  <div className="text-gray-400">Good</div>
                </div>
                <div className="bg-yellow-900/30 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-yellow-400">{overview.healthDistribution.fair}</div>
                  <div className="text-gray-400">Fair</div>
                </div>
                <div className="bg-orange-900/30 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-orange-400">{overview.healthDistribution.poor}</div>
                  <div className="text-gray-400">Poor</div>
                </div>
                <div className="bg-red-900/30 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-red-400">{overview.healthDistribution.critical}</div>
                  <div className="text-gray-400">Critical</div>
                </div>
              </div>
            </div>

            {recommendations.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Recommendations</h3>
                <ul className="space-y-2">
                  {recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-3 p-3 bg-gray-700 rounded-lg">
                      <span className="text-blue-400 font-bold">{i + 1}.</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'operations' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">Rebalance Fleet</h3>
                <p className="text-gray-400 text-sm mb-4">
                  Automatically redistribute SKUs across stores based on health and capacity
                </p>
                <button
                  onClick={executeRebalance}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  Analyze & Rebalance
                </button>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">Rotate SKUs</h3>
                <p className="text-gray-400 text-sm mb-4">
                  Move underperforming SKUs to fresh stores for better visibility
                </p>
                <button
                  onClick={rotateSkus}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
                >
                  Execute Rotation
                </button>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">Bulk Prune</h3>
                <p className="text-gray-400 text-sm mb-4">
                  Remove stale listings without sales across all stores
                </p>
                <button
                  onClick={async () => {
                    await fetch('/api/fleet', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'bulk-prune',
                        storeIds: [], // Would need to populate
                        daysWithoutSales: 14
                      })
                    })
                    fetchFleetData()
                  }}
                  className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg"
                >
                  Prune Listings
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && overview && (
          <div className="space-y-4">
            {overview.alerts.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <div className="text-gray-400">No active alerts</div>
              </div>
            ) : (
              overview.alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${
                    alert.severity === 'critical' ? 'bg-red-900/30 border-red-700' :
                    alert.severity === 'warning' ? 'bg-yellow-900/30 border-yellow-700' :
                    'bg-blue-900/30 border-blue-700'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold mb-2 ${
                        alert.severity === 'critical' ? 'bg-red-600' :
                        alert.severity === 'warning' ? 'bg-yellow-600' :
                        'bg-blue-600'
                      }`}>
                        {alert.severity.toUpperCase()}
                      </span>
                      <p className="text-white">{alert.message}</p>
                      <p className="text-gray-400 text-sm mt-1">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button className="text-gray-400 hover:text-white">
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function MetricCard({ label, value, subtext, color }: {
  label: string
  value: string | number
  subtext: string
  color: 'blue' | 'green' | 'purple' | 'yellow'
}) {
  const colors = {
    blue: 'bg-blue-900/30 border-blue-700',
    green: 'bg-green-900/30 border-green-700',
    purple: 'bg-purple-900/30 border-purple-700',
    yellow: 'bg-yellow-900/30 border-yellow-700'
  }

  return (
    <div className={`p-4 rounded-lg border ${colors[color]}`}>
      <div className="text-gray-400 text-sm">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-gray-500 text-sm">{subtext}</div>
    </div>
  )
}

function HealthBar({ label, count, total, color }: {
  label: string
  count: number
  total: number
  color: string
}) {
  const percent = total > 0 ? (count / total) * 100 : 0

  const colorClasses: Record<string, string> = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500'
  }

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-gray-400">{label}</span>
      <div className="flex-1 bg-gray-700 rounded-full h-4">
        <div
          className={`h-4 rounded-full ${colorClasses[color]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-12 text-right">{count}</span>
    </div>
  )
}

function MetricRow({ label, value, threshold, inverse }: {
  label: string
  value: string | number
  threshold: number
  inverse?: boolean
}) {
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  const isGood = inverse ? numValue >= threshold : numValue <= threshold

  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      <span className={isGood ? 'text-green-400' : 'text-red-400'}>
        {value}
      </span>
    </div>
  )
}
