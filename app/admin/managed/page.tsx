'use client'

import { useState, useEffect } from 'react'

interface ManagedServiceMetrics {
  financial: {
    totalRevenue30Days: number
    totalProfit30Days: number
    avgProfitPerStore: number
    projectedMonthlyProfit: number
    storesAtProfitTarget: number
    storesBelowTarget: number
    targetProfitPerStore: number
    profitMargin: number
  }
  rampUp: {
    storesInRampUp: number
    avgRampUpDay: number
    storesCompletedRampUp: number
    onTrackStores: number
    behindScheduleStores: number
    rampUpSuccessRate: number
  }
  operations: {
    totalListings: number
    activeListings: number
    pendingListings: number
    totalOrders: number
    avgOrderValue: number
    returnRate: number
    listingsAddedToday: number
    ordersProcessedToday: number
  }
  compliance: {
    storesAboveThreshold: number
    avgDefectRate: number
    avgLateShipmentRate: number
    avgFeedbackScore: number
    policyViolations: number
    accountsAtRisk: number
  }
  automation: {
    autoListingsEnabled: number
    autoRepricingEnabled: number
    autoPruningEnabled: number
    autoOptimizationEnabled: number
    pendingJobsCount: number
    failedJobsCount: number
  }
}

interface StoreProgress {
  storeId: string
  storeName: string
  rampUpDay: number
  status: 'on_track' | 'ahead' | 'behind' | 'paused' | 'completed'
  currentListings: number
  currentProfit30Days: number
  currentHealthScore: number
  targetListings: number
  listingProgress: number
  profitProgress: number
  projectedProfitAtDay45: number
  daysToReachTarget: number
  blockers: string[]
}

interface FinancialProjection {
  currentMonthProfit: number
  projectedEndOfMonthProfit: number
  projectedQuarterlyProfit: number
  projectedAnnualProfit: number
  profitByStore: Array<{ storeId: string; storeName: string; profit: number; percentOfTotal: number }>
}

export default function ManagedServiceAdmin() {
  const [metrics, setMetrics] = useState<ManagedServiceMetrics | null>(null)
  const [stores, setStores] = useState<StoreProgress[]>([])
  const [projection, setProjection] = useState<FinancialProjection | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'stores' | 'financials' | 'compliance'>('overview')
  const [selectedStore, setSelectedStore] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboard()
  }, [])

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/managed?action=dashboard')
      const data = await res.json()

      if (data.success) {
        setMetrics(data.metrics)
        setStores(data.rampUpProgress.stores)
        setProjection(data.projection)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const startRampUp = async (storeId: string) => {
    try {
      const res = await fetch('/api/admin/managed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start-ramp-up', storeId })
      })
      const data = await res.json()
      if (data.success) {
        fetchDashboard()
      }
    } catch (error) {
      console.error('Failed to start ramp-up:', error)
    }
  }

  const pauseStore = async (storeId: string, reason: string) => {
    try {
      const res = await fetch('/api/admin/managed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause-store', storeId, reason })
      })
      if ((await res.json()).success) {
        fetchDashboard()
      }
    } catch (error) {
      console.error('Failed to pause store:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading Managed Service Dashboard...</div>
      </div>
    )
  }

  const totalStores = metrics
    ? metrics.financial.storesAtProfitTarget + metrics.financial.storesBelowTarget
    : 0

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-900 to-blue-900 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Managed Service Command Center</h1>
              <p className="text-gray-300">75+ Stores | Target: $3,000/store/month</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={fetchDashboard}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Refresh
              </button>
              <button className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg">
                Export Report
              </button>
            </div>
          </div>

          {/* Key Metrics Bar */}
          {metrics && (
            <div className="grid grid-cols-5 gap-4 mt-6">
              <QuickStat
                label="Total Profit (30d)"
                value={`$${metrics.financial.totalProfit30Days.toLocaleString()}`}
                target={`$${(totalStores * 3000).toLocaleString()}`}
                progress={(metrics.financial.totalProfit30Days / (totalStores * 3000)) * 100}
              />
              <QuickStat
                label="Avg/Store"
                value={`$${metrics.financial.avgProfitPerStore.toLocaleString()}`}
                target="$3,000"
                progress={(metrics.financial.avgProfitPerStore / 3000) * 100}
              />
              <QuickStat
                label="Stores at Target"
                value={`${metrics.financial.storesAtProfitTarget}/${totalStores}`}
                progress={(metrics.financial.storesAtProfitTarget / totalStores) * 100}
              />
              <QuickStat
                label="On Track"
                value={`${metrics.rampUp.onTrackStores + metrics.rampUp.storesCompletedRampUp}`}
                subtext={`${metrics.rampUp.behindScheduleStores} behind`}
              />
              <QuickStat
                label="Health Score"
                value={`${metrics.compliance.storesAboveThreshold}/${totalStores}`}
                subtext={`${metrics.compliance.accountsAtRisk} at risk`}
              />
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-4 mt-6">
            {(['overview', 'stores', 'financials', 'compliance'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-lg capitalize font-medium ${
                  activeTab === tab
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800/50 hover:bg-gray-700/50 text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'overview' && metrics && (
          <div className="space-y-6">
            {/* Ramp-Up Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Ramp-Up Status</h3>
                <div className="space-y-4">
                  <ProgressRow
                    label="In Ramp-Up"
                    value={metrics.rampUp.storesInRampUp}
                    color="blue"
                  />
                  <ProgressRow
                    label="Completed"
                    value={metrics.rampUp.storesCompletedRampUp}
                    color="green"
                  />
                  <ProgressRow
                    label="On Track"
                    value={metrics.rampUp.onTrackStores}
                    color="emerald"
                  />
                  <ProgressRow
                    label="Behind Schedule"
                    value={metrics.rampUp.behindScheduleStores}
                    color="yellow"
                  />
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="text-sm text-gray-400">Average Ramp-Up Day</div>
                  <div className="text-2xl font-bold">Day {metrics.rampUp.avgRampUpDay} / 45</div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Operations Today</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-700 p-3 rounded-lg">
                    <div className="text-gray-400 text-sm">Listings Added</div>
                    <div className="text-2xl font-bold text-green-400">
                      +{metrics.operations.listingsAddedToday}
                    </div>
                  </div>
                  <div className="bg-gray-700 p-3 rounded-lg">
                    <div className="text-gray-400 text-sm">Orders Processed</div>
                    <div className="text-2xl font-bold text-blue-400">
                      {metrics.operations.ordersProcessedToday}
                    </div>
                  </div>
                  <div className="bg-gray-700 p-3 rounded-lg">
                    <div className="text-gray-400 text-sm">Active Listings</div>
                    <div className="text-2xl font-bold">
                      {metrics.operations.activeListings.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-gray-700 p-3 rounded-lg">
                    <div className="text-gray-400 text-sm">Pending Jobs</div>
                    <div className={`text-2xl font-bold ${
                      metrics.automation.pendingJobsCount > 100 ? 'text-yellow-400' : ''
                    }`}>
                      {metrics.automation.pendingJobsCount}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Financial Snapshot</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Revenue (30d)</span>
                    <span className="font-semibold">${metrics.financial.totalRevenue30Days.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Profit (30d)</span>
                    <span className="font-semibold text-green-400">${metrics.financial.totalProfit30Days.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Profit Margin</span>
                    <span className="font-semibold">{metrics.financial.profitMargin}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Avg Order Value</span>
                    <span className="font-semibold">${metrics.operations.avgOrderValue}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Store Status Grid */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Store Status Overview</h3>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-green-900/50 text-green-400 rounded-full text-sm">
                    {stores.filter(s => s.status === 'ahead').length} Ahead
                  </span>
                  <span className="px-3 py-1 bg-blue-900/50 text-blue-400 rounded-full text-sm">
                    {stores.filter(s => s.status === 'on_track').length} On Track
                  </span>
                  <span className="px-3 py-1 bg-yellow-900/50 text-yellow-400 rounded-full text-sm">
                    {stores.filter(s => s.status === 'behind').length} Behind
                  </span>
                  <span className="px-3 py-1 bg-purple-900/50 text-purple-400 rounded-full text-sm">
                    {stores.filter(s => s.status === 'completed').length} Complete
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-10 gap-2">
                {stores.map(store => (
                  <div
                    key={store.storeId}
                    onClick={() => setSelectedStore(store.storeId)}
                    className={`h-10 rounded cursor-pointer transition-all hover:scale-105 ${
                      store.status === 'ahead' ? 'bg-green-600' :
                      store.status === 'on_track' ? 'bg-blue-600' :
                      store.status === 'completed' ? 'bg-purple-600' :
                      store.status === 'behind' ? 'bg-yellow-600' :
                      'bg-gray-600'
                    }`}
                    title={`${store.storeName} - Day ${store.rampUpDay}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stores' && (
          <div className="space-y-4">
            {/* Store List */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="text-left p-4">Store</th>
                    <th className="text-left p-4">Day</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Listings</th>
                    <th className="text-left p-4">Profit</th>
                    <th className="text-left p-4">Health</th>
                    <th className="text-left p-4">Progress</th>
                    <th className="text-left p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map(store => (
                    <tr key={store.storeId} className="border-t border-gray-700 hover:bg-gray-700/50">
                      <td className="p-4">
                        <div className="font-medium">{store.storeName}</div>
                        {store.blockers.length > 0 && (
                          <div className="text-xs text-red-400">{store.blockers[0]}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="font-mono">{store.rampUpDay}/45</span>
                      </td>
                      <td className="p-4">
                        <StatusBadge status={store.status} />
                      </td>
                      <td className="p-4">
                        <div>{store.currentListings.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">/ {store.targetListings}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-green-400">${store.currentProfit30Days.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">/ $3,000</div>
                      </td>
                      <td className="p-4">
                        <HealthBadge score={store.currentHealthScore} />
                      </td>
                      <td className="p-4 w-32">
                        <div className="bg-gray-600 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              store.profitProgress >= 100 ? 'bg-green-500' :
                              store.profitProgress >= 70 ? 'bg-blue-500' :
                              'bg-yellow-500'
                            }`}
                            style={{ width: `${Math.min(store.profitProgress, 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{store.profitProgress}%</div>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => pauseStore(store.storeId, 'Admin action')}
                            className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                          >
                            Pause
                          </button>
                          <button className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm">
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'financials' && projection && (
          <div className="space-y-6">
            {/* Projections */}
            <div className="grid grid-cols-4 gap-4">
              <ProjectionCard
                label="Current Month"
                value={projection.currentMonthProfit}
                projected={projection.projectedEndOfMonthProfit}
              />
              <ProjectionCard
                label="Projected EOM"
                value={projection.projectedEndOfMonthProfit}
              />
              <ProjectionCard
                label="Projected Quarterly"
                value={projection.projectedQuarterlyProfit}
              />
              <ProjectionCard
                label="Projected Annual"
                value={projection.projectedAnnualProfit}
              />
            </div>

            {/* Profit by Store */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Profit by Store (30d)</h3>
              <div className="space-y-3">
                {projection.profitByStore.slice(0, 20).map((store, i) => (
                  <div key={store.storeId} className="flex items-center gap-4">
                    <span className="w-8 text-gray-400">{i + 1}.</span>
                    <span className="flex-1">{store.storeName}</span>
                    <div className="w-48">
                      <div className="bg-gray-600 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-green-500"
                          style={{ width: `${Math.min(store.percentOfTotal * 3, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-24 text-right text-green-400">
                      ${store.profit.toLocaleString()}
                    </span>
                    <span className="w-16 text-right text-gray-400">
                      {store.percentOfTotal}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'compliance' && metrics && (
          <div className="space-y-6">
            {/* Compliance Overview */}
            <div className="grid grid-cols-4 gap-4">
              <ComplianceCard
                label="Defect Rate"
                value={metrics.compliance.avgDefectRate}
                threshold={2}
                unit="%"
              />
              <ComplianceCard
                label="Late Shipment"
                value={metrics.compliance.avgLateShipmentRate}
                threshold={7}
                unit="%"
              />
              <ComplianceCard
                label="Feedback Score"
                value={metrics.compliance.avgFeedbackScore}
                threshold={95}
                unit="%"
                inverse
              />
              <ComplianceCard
                label="Accounts at Risk"
                value={metrics.compliance.accountsAtRisk}
                threshold={0}
                highlight
              />
            </div>

            {/* At-Risk Stores */}
            {metrics.compliance.accountsAtRisk > 0 && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-400 mb-4">
                  Accounts Requiring Immediate Attention
                </h3>
                <div className="space-y-2">
                  {stores
                    .filter(s => s.currentHealthScore < 50 || s.blockers.length > 0)
                    .slice(0, 10)
                    .map(store => (
                      <div key={store.storeId} className="flex justify-between items-center p-3 bg-gray-800 rounded-lg">
                        <div>
                          <div className="font-medium">{store.storeName}</div>
                          <div className="text-sm text-red-400">{store.blockers.join(', ')}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <HealthBadge score={store.currentHealthScore} />
                          <button className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded">
                            Take Action
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Policy Violations */}
            {metrics.compliance.policyViolations > 0 && (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-yellow-400 mb-4">
                  Policy Violations: {metrics.compliance.policyViolations}
                </h3>
                <p className="text-gray-300">
                  Review and resolve policy violations immediately to prevent account restrictions.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function QuickStat({ label, value, target, progress, subtext }: {
  label: string
  value: string
  target?: string
  progress?: number
  subtext?: string
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {target && (
        <div className="text-sm text-gray-500">Target: {target}</div>
      )}
      {progress !== undefined && (
        <div className="mt-2 bg-gray-700 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
      {subtext && <div className="text-sm text-gray-500 mt-1">{subtext}</div>}
    </div>
  )
}

function ProgressRow({ label, value, color }: {
  label: string
  value: number
  color: string
}) {
  const colors: Record<string, string> = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    emerald: 'text-emerald-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400'
  }

  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      <span className={`text-xl font-bold ${colors[color]}`}>{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ahead: 'bg-green-900/50 text-green-400',
    on_track: 'bg-blue-900/50 text-blue-400',
    behind: 'bg-yellow-900/50 text-yellow-400',
    paused: 'bg-gray-700 text-gray-400',
    completed: 'bg-purple-900/50 text-purple-400'
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.paused}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function HealthBadge({ score }: { score: number }) {
  let color = 'bg-gray-700 text-gray-400'
  if (score >= 80) color = 'bg-green-900/50 text-green-400'
  else if (score >= 60) color = 'bg-blue-900/50 text-blue-400'
  else if (score >= 40) color = 'bg-yellow-900/50 text-yellow-400'
  else color = 'bg-red-900/50 text-red-400'

  return (
    <span className={`px-2 py-1 rounded text-sm font-medium ${color}`}>
      {score}
    </span>
  )
}

function ProjectionCard({ label, value, projected }: {
  label: string
  value: number
  projected?: number
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-3xl font-bold text-green-400 mt-2">
        ${value.toLocaleString()}
      </div>
      {projected && (
        <div className="text-sm text-gray-500 mt-1">
          Projected: ${projected.toLocaleString()}
        </div>
      )}
    </div>
  )
}

function ComplianceCard({ label, value, threshold, unit, inverse, highlight }: {
  label: string
  value: number
  threshold: number
  unit?: string
  inverse?: boolean
  highlight?: boolean
}) {
  const isGood = inverse ? value >= threshold : value <= threshold

  return (
    <div className={`rounded-lg p-6 ${
      highlight && value > 0 ? 'bg-red-900/30 border border-red-700' : 'bg-gray-800'
    }`}>
      <div className="text-sm text-gray-400">{label}</div>
      <div className={`text-3xl font-bold mt-2 ${
        highlight && value > 0 ? 'text-red-400' :
        isGood ? 'text-green-400' : 'text-yellow-400'
      }`}>
        {value}{unit}
      </div>
      <div className="text-sm text-gray-500 mt-1">
        Threshold: {inverse ? '>=' : '<='} {threshold}{unit}
      </div>
    </div>
  )
}
