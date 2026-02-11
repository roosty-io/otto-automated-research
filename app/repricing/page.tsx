'use client'

import { useState, useEffect } from 'react'

interface RepricingRule {
  id: string
  name: string
  description?: string
  strategy: string
  enabled: boolean
  priority: number
  conditions: any[]
  adjustment: any
  constraints: any
}

interface PriceAlert {
  assignmentId: string
  sku: string
  ourPrice: number
  lowestPrice: number
  position: number
  competitorCount: number
  priceDiff: number
  priceDiffPercent: number
}

interface MonitoringStats {
  totalMonitored: number
  needsCheck: number
  averageCompetitors: number
  priceAlerts: number
  marketTrends: {
    pricesUp: number
    pricesDown: number
    stable: number
  }
}

interface RepricingStats {
  totalRepriced: number
  priceIncreases: number
  priceDecreases: number
  averageChange: number
  pendingApproval: number
  ruleBreakdown: Record<string, number>
}

type TabType = 'overview' | 'rules' | 'competitors' | 'alerts' | 'history'

export default function RepricingPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [rules, setRules] = useState<RepricingRule[]>([])
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [monitoringStats, setMonitoringStats] = useState<MonitoringStats | null>(null)
  const [repricingStats, setRepricingStats] = useState<RepricingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const [rulesRes, alertsRes, monStatsRes, repStatsRes] = await Promise.all([
        fetch('/api/repricing?type=rules'),
        fetch('/api/repricing/competitors?type=alerts&limit=20'),
        fetch('/api/repricing/competitors?type=stats'),
        fetch('/api/repricing?type=stats'),
      ])

      if (rulesRes.ok) {
        const data = await rulesRes.json()
        setRules(data.rules || [])
      }

      if (alertsRes.ok) {
        const data = await alertsRes.json()
        setAlerts(data.alerts || [])
      }

      if (monStatsRes.ok) {
        const data = await monStatsRes.json()
        setMonitoringStats(data.stats)
      }

      if (repStatsRes.ok) {
        const data = await repStatsRes.json()
        setRepricingStats(data.stats)
      }
    } catch (err) {
      setError('Failed to load repricing data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function runRepricingBatch(dryRun: boolean = true) {
    try {
      const res = await fetch('/api/repricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-batch',
          dryRun,
          maxListings: 1000,
        }),
      })

      const data = await res.json()
      if (data.success) {
        alert(`Repricing ${dryRun ? '(dry run)' : ''} complete!\n\nEvaluated: ${data.result.totalEvaluated}\nChanged: ${data.result.totalChanged}\nApplied: ${data.result.totalApplied}`)
        loadData()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (err) {
      console.error(err)
      alert('Failed to run repricing batch')
    }
  }

  async function runCompetitorMonitoring() {
    try {
      const res = await fetch('/api/repricing/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-monitoring',
          maxListings: 500,
        }),
      })

      const data = await res.json()
      if (data.success) {
        alert(`Competitor monitoring complete!\n\nChecked: ${data.result.totalChecked}\nUpdated: ${data.result.totalUpdated}\nPrice changes detected: ${data.result.priceChangesDetected}`)
        loadData()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (err) {
      console.error(err)
      alert('Failed to run competitor monitoring')
    }
  }

  async function toggleRule(ruleId: string, enabled: boolean) {
    try {
      const res = await fetch('/api/repricing/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId,
          updates: { enabled },
        }),
      })

      const data = await res.json()
      if (data.success) {
        setRules(prev =>
          prev.map(r => (r.id === ruleId ? { ...r, enabled } : r))
        )
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'rules', label: 'Rules' },
    { id: 'competitors', label: 'Competitors' },
    { id: 'alerts', label: 'Price Alerts' },
    { id: 'history', label: 'History' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Repricing</h1>
            <p className="text-gray-600 mt-1">
              Automated price optimization based on competition and rules
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={runCompetitorMonitoring}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
            >
              Check Competitors
            </button>
            <button
              onClick={() => runRepricingBatch(true)}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
            >
              Preview Changes
            </button>
            <button
              onClick={() => runRepricingBatch(false)}
              className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
            >
              Apply Repricing
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.id === 'alerts' && alerts.length > 0 && (
                  <span className="ml-2 bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">
                    {alerts.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading repricing data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewTab
                monitoringStats={monitoringStats}
                repricingStats={repricingStats}
                alertCount={alerts.length}
                ruleCount={rules.filter(r => r.enabled).length}
              />
            )}

            {activeTab === 'rules' && (
              <RulesTab rules={rules} onToggle={toggleRule} onRefresh={loadData} />
            )}

            {activeTab === 'competitors' && (
              <CompetitorsTab stats={monitoringStats} />
            )}

            {activeTab === 'alerts' && (
              <AlertsTab alerts={alerts} onRefresh={loadData} />
            )}

            {activeTab === 'history' && <HistoryTab />}
          </>
        )}
      </div>
    </div>
  )
}

function OverviewTab({
  monitoringStats,
  repricingStats,
  alertCount,
  ruleCount,
}: {
  monitoringStats: MonitoringStats | null
  repricingStats: RepricingStats | null
  alertCount: number
  ruleCount: number
}) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Rules"
          value={ruleCount.toString()}
          subtitle="Repricing rules enabled"
          color="blue"
        />
        <StatCard
          title="Monitored Listings"
          value={monitoringStats?.totalMonitored.toLocaleString() || '0'}
          subtitle={`${monitoringStats?.needsCheck || 0} need update`}
          color="green"
        />
        <StatCard
          title="Price Alerts"
          value={alertCount.toString()}
          subtitle="Listings needing attention"
          color="red"
        />
        <StatCard
          title="Avg Competitors"
          value={monitoringStats?.averageCompetitors.toString() || '0'}
          subtitle="Per listing"
          color="purple"
        />
      </div>

      {/* Repricing Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Repricing Activity (30 days)
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Repriced</span>
              <span className="font-semibold">
                {repricingStats?.totalRepriced.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Price Increases</span>
              <span className="font-semibold text-green-600">
                {repricingStats?.priceIncreases.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Price Decreases</span>
              <span className="font-semibold text-red-600">
                {repricingStats?.priceDecreases.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Avg Change</span>
              <span className="font-semibold">
                {repricingStats?.averageChange
                  ? `${repricingStats.averageChange > 0 ? '+' : ''}${repricingStats.averageChange.toFixed(1)}%`
                  : '0%'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Pending Approval</span>
              <span className="font-semibold text-yellow-600">
                {repricingStats?.pendingApproval || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Market Trends
          </h3>
          {monitoringStats?.marketTrends ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Prices Going Up</span>
                <div className="flex items-center">
                  <div
                    className="h-2 bg-green-500 rounded-full mr-2"
                    style={{
                      width: `${
                        (monitoringStats.marketTrends.pricesUp /
                          (monitoringStats.marketTrends.pricesUp +
                            monitoringStats.marketTrends.pricesDown +
                            monitoringStats.marketTrends.stable || 1)) *
                        100
                      }px`,
                    }}
                  ></div>
                  <span className="font-semibold">
                    {monitoringStats.marketTrends.pricesUp}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Prices Going Down</span>
                <div className="flex items-center">
                  <div
                    className="h-2 bg-red-500 rounded-full mr-2"
                    style={{
                      width: `${
                        (monitoringStats.marketTrends.pricesDown /
                          (monitoringStats.marketTrends.pricesUp +
                            monitoringStats.marketTrends.pricesDown +
                            monitoringStats.marketTrends.stable || 1)) *
                        100
                      }px`,
                    }}
                  ></div>
                  <span className="font-semibold">
                    {monitoringStats.marketTrends.pricesDown}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Stable Prices</span>
                <div className="flex items-center">
                  <div
                    className="h-2 bg-gray-400 rounded-full mr-2"
                    style={{
                      width: `${
                        (monitoringStats.marketTrends.stable /
                          (monitoringStats.marketTrends.pricesUp +
                            monitoringStats.marketTrends.pricesDown +
                            monitoringStats.marketTrends.stable || 1)) *
                        100
                      }px`,
                    }}
                  ></div>
                  <span className="font-semibold">
                    {monitoringStats.marketTrends.stable}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No market data available yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string
  value: string
  subtitle: string
  color: 'blue' | 'green' | 'red' | 'purple'
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <p className="text-sm text-gray-600">{title}</p>
      <p className={`text-3xl font-bold mt-1 ${colorClasses[color]}`}>{value}</p>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  )
}

function RulesTab({
  rules,
  onToggle,
  onRefresh,
}: {
  rules: RepricingRule[]
  onToggle: (id: string, enabled: boolean) => void
  onRefresh: () => void
}) {
  const strategyLabels: Record<string, string> = {
    match_lowest: 'Match Lowest',
    beat_lowest: 'Beat Lowest',
    stay_above: 'Stay Above',
    target_margin: 'Target Margin',
    velocity_based: 'Velocity Based',
    time_decay: 'Time Decay',
    demand_based: 'Demand Based',
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Repricing Rules</h3>
        <button
          onClick={onRefresh}
          className="text-blue-600 hover:text-blue-700 text-sm"
        >
          Refresh
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
          <p className="text-gray-500">No repricing rules configured</p>
          <p className="text-sm text-gray-400 mt-1">
            Rules will be created automatically when you run repricing for the first time
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`bg-white rounded-xl p-4 border ${
                rule.enabled ? 'border-green-200' : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-medium text-gray-900">{rule.name}</h4>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        rule.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {strategyLabels[rule.strategy] || rule.strategy}
                    </span>
                  </div>
                  {rule.description && (
                    <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>Priority: {rule.priority}</span>
                    <span>Conditions: {rule.conditions?.length || 0}</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={e => onToggle(rule.id, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CompetitorsTab({ stats }: { stats: MonitoringStats | null }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h4 className="text-sm text-gray-600">Total Monitored</h4>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {stats?.totalMonitored.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h4 className="text-sm text-gray-600">Needs Update</h4>
          <p className="text-2xl font-bold text-yellow-600 mt-1">
            {stats?.needsCheck.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h4 className="text-sm text-gray-600">Avg Competitors</h4>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {stats?.averageCompetitors || 0}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Competitor Price Monitoring
        </h3>
        <p className="text-gray-600">
          The competitor monitoring system tracks prices from other sellers on eBay.
          When competitor prices change, listings are automatically evaluated
          against your repricing rules.
        </p>
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            <strong>Auto-monitoring:</strong> Listings are checked every 24 hours
            by default. High-velocity items are checked more frequently.
          </p>
        </div>
      </div>
    </div>
  )
}

function AlertsTab({
  alerts,
  onRefresh,
}: {
  alerts: PriceAlert[]
  onRefresh: () => void
}) {
  async function handleQuickReprice(alert: PriceAlert, strategy: 'match' | 'beat') {
    const newPrice =
      strategy === 'match'
        ? alert.lowestPrice
        : Math.round((alert.lowestPrice * 0.99) * 100) / 100

    try {
      const res = await fetch('/api/repricing/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-price',
          assignmentId: alert.assignmentId,
          price: newPrice,
          reason: strategy === 'match' ? 'Match competitor' : 'Beat competitor',
        }),
      })

      const data = await res.json()
      if (data.success) {
        onRefresh()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">
          Price Alerts ({alerts.length})
        </h3>
        <button
          onClick={onRefresh}
          className="text-blue-600 hover:text-blue-700 text-sm"
        >
          Refresh
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
          <p className="text-gray-500">No price alerts</p>
          <p className="text-sm text-gray-400 mt-1">
            All your listings are competitively priced
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4 text-sm font-medium text-gray-600">
                  SKU
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-600">
                  Our Price
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-600">
                  Lowest
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-600">
                  Diff
                </th>
                <th className="text-center p-4 text-sm font-medium text-gray-600">
                  Position
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {alerts.map(alert => (
                <tr key={alert.assignmentId} className="hover:bg-gray-50">
                  <td className="p-4">
                    <span className="font-mono text-sm">{alert.sku}</span>
                  </td>
                  <td className="p-4 text-right">
                    ${alert.ourPrice.toFixed(2)}
                  </td>
                  <td className="p-4 text-right text-green-600">
                    ${alert.lowestPrice.toFixed(2)}
                  </td>
                  <td className="p-4 text-right">
                    <span
                      className={
                        alert.priceDiff > 0 ? 'text-red-600' : 'text-green-600'
                      }
                    >
                      {alert.priceDiff > 0 ? '+' : ''}${alert.priceDiff.toFixed(2)}
                      <span className="text-xs ml-1">
                        ({alert.priceDiffPercent.toFixed(1)}%)
                      </span>
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        alert.position <= 3
                          ? 'bg-green-100 text-green-700'
                          : alert.position <= 5
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      #{alert.position} of {alert.competitorCount}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleQuickReprice(alert, 'match')}
                        className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
                      >
                        Match
                      </button>
                      <button
                        onClick={() => handleQuickReprice(alert, 'beat')}
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                      >
                        Beat
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HistoryTab() {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    setLoading(true)
    try {
      const res = await fetch('/api/repricing/prices?type=pending&limit=50')
      if (res.ok) {
        const data = await res.json()
        setHistory(data.pending || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Pending Price Changes
      </h3>

      {history.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
          <p className="text-gray-500">No pending price changes</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4">
            <p className="text-gray-600">{history.length} pending changes</p>
          </div>
        </div>
      )}
    </div>
  )
}
