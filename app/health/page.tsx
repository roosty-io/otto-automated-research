import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getStoreHealth() {
  // Try to get from materialized view, fall back to stores table
  const { data: healthData, error: healthError } = await supabase
    .from('mv_store_health')
    .select('*')
    .order('floor_percentage', { ascending: true })

  if (!healthError && healthData && healthData.length > 0) {
    return healthData
  }

  // Fallback: compute from stores directly
  const { data: stores } = await supabase
    .from('stores')
    .select('*, store_tiers(*)')
    .eq('is_active', true)
    .order('store_name')

  if (!stores) return []

  return stores.map((store: any) => {
    const tier = store.store_tiers
    const daysActive = Math.floor(
      (Date.now() - new Date(store.onboarding_date).getTime()) / (1000 * 60 * 60 * 24)
    )
    const floorPercentage = tier
      ? Math.round((store.current_active_listings / tier.min_active_listings) * 100)
      : 0

    return {
      store_id: store.id,
      store_name: store.store_name,
      ebay_username: store.ebay_username,
      tier_name: tier?.tier_name || 'Unknown',
      maturity: store.maturity,
      is_active: store.is_active,
      current_active_listings: store.current_active_listings,
      tier_floor: tier?.min_active_listings || 0,
      tier_ceiling: tier?.max_total_listings || 0,
      tier_profit_target: tier?.target_monthly_profit || 0,
      floor_percentage: floorPercentage,
      days_active: daysActive,
      onboarding_date: store.onboarding_date,
    }
  })
}

function getHealthStatus(floorPercentage: number) {
  if (floorPercentage >= 100) {
    return { status: 'healthy', color: 'green', icon: CheckCircle }
  } else if (floorPercentage >= 75) {
    return { status: 'warning', color: 'yellow', icon: AlertTriangle }
  } else if (floorPercentage >= 50) {
    return { status: 'at-risk', color: 'orange', icon: TrendingDown }
  } else {
    return { status: 'critical', color: 'red', icon: AlertTriangle }
  }
}

export default async function HealthPage() {
  const healthData = await getStoreHealth()

  const criticalStores = healthData.filter((s: any) => s.floor_percentage < 50)
  const atRiskStores = healthData.filter(
    (s: any) => s.floor_percentage >= 50 && s.floor_percentage < 75
  )
  const warningStores = healthData.filter(
    (s: any) => s.floor_percentage >= 75 && s.floor_percentage < 100
  )
  const healthyStores = healthData.filter((s: any) => s.floor_percentage >= 100)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Store Health Monitor</h1>
        <p className="text-gray-500 mt-1">Real-time health status of all active stores</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600">Healthy</p>
              <p className="text-3xl font-bold text-green-700">{healthyStores.length}</p>
            </div>
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <p className="text-sm text-green-600 mt-2">At or above floor</p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-600">Warning</p>
              <p className="text-3xl font-bold text-yellow-700">{warningStores.length}</p>
            </div>
            <Clock className="h-10 w-10 text-yellow-500" />
          </div>
          <p className="text-sm text-yellow-600 mt-2">75-99% of floor</p>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-600">At Risk</p>
              <p className="text-3xl font-bold text-orange-700">{atRiskStores.length}</p>
            </div>
            <TrendingDown className="h-10 w-10 text-orange-500" />
          </div>
          <p className="text-sm text-orange-600 mt-2">50-74% of floor</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600">Critical</p>
              <p className="text-3xl font-bold text-red-700">{criticalStores.length}</p>
            </div>
            <AlertTriangle className="h-10 w-10 text-red-500" />
          </div>
          <p className="text-sm text-red-600 mt-2">Below 50% of floor</p>
        </div>
      </div>

      {/* Critical & At Risk Stores (priority attention) */}
      {(criticalStores.length > 0 || atRiskStores.length > 0) && (
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Stores Requiring Attention</h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              These stores are below 75% of their listing floor
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Store
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Floor Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Listings
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Days Active
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {[...criticalStores, ...atRiskStores].map((store: any) => {
                  const health = getHealthStatus(store.floor_percentage)
                  const Icon = health.icon

                  return (
                    <tr key={store.store_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <Link
                          href={`/stores/${store.store_id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {store.store_name}
                        </Link>
                        <div className="text-sm text-gray-500">@{store.ebay_username}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-${health.color}-100 text-${health.color}-800`}
                        >
                          <Icon className="h-3 w-3" />
                          {health.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2 max-w-[120px]">
                            <div
                              className={`h-2.5 rounded-full ${
                                store.floor_percentage < 50
                                  ? 'bg-red-500'
                                  : store.floor_percentage < 75
                                  ? 'bg-orange-500'
                                  : 'bg-yellow-500'
                              }`}
                              style={{ width: `${Math.min(store.floor_percentage, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{store.floor_percentage}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {store.current_active_listings.toLocaleString()} /{' '}
                        {store.tier_floor.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{store.days_active} days</td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/jobs/new?store=${store.store_id}`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Create Job
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Stores Health */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <Activity className="h-5 w-5 text-gray-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">All Stores</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Store
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Tier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Maturity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Health
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Floor Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Listings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Target Profit
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {healthData.map((store: any) => {
                const health = getHealthStatus(store.floor_percentage)
                const Icon = health.icon

                return (
                  <tr key={store.store_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/stores/${store.store_id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {store.store_name}
                      </Link>
                      <div className="text-sm text-gray-500">@{store.ebay_username}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {store.tier_name}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                        {store.maturity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          health.color === 'green'
                            ? 'bg-green-100 text-green-800'
                            : health.color === 'yellow'
                            ? 'bg-yellow-100 text-yellow-800'
                            : health.color === 'orange'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {health.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2 max-w-[100px]">
                          <div
                            className={`h-2.5 rounded-full ${
                              store.floor_percentage >= 100
                                ? 'bg-green-500'
                                : store.floor_percentage >= 75
                                ? 'bg-yellow-500'
                                : store.floor_percentage >= 50
                                ? 'bg-orange-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(store.floor_percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-600">{store.floor_percentage}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {store.current_active_listings.toLocaleString()} /{' '}
                      {store.tier_floor.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      ${store.tier_profit_target.toLocaleString()}/mo
                    </td>
                  </tr>
                )
              })}
              {healthData.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No active stores found. Add a store to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
