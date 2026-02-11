import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Edit,
  Play,
  Package,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  BarChart3,
  List,
  Settings,
} from 'lucide-react'
import { DeleteStoreButton } from '@/components/DeleteStoreButton'
import { ExportButton } from '@/components/ExportButton'
import { StoreListingsPanel } from '@/components/StoreListingsPanel'
import { StoreQueuePanel } from '@/components/StoreQueuePanel'

export const dynamic = 'force-dynamic'

async function getStore(id: string) {
  const { data, error } = await supabase
    .from('stores')
    .select('*, store_tiers(*)')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data
}

async function getStoreStats(storeId: string) {
  // Get assignment stats
  const { data: assignments } = await supabase
    .from('store_sku_assignments')
    .select('listing_status, revenue, profit, sales, views')
    .eq('store_id', storeId)

  const stats = {
    total: 0,
    active: 0,
    draft: 0,
    paused: 0,
    ended: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalSales: 0,
    totalViews: 0,
  }

  if (assignments) {
    for (const a of assignments as any[]) {
      stats.total++
      switch (a.listing_status) {
        case 'active':
          stats.active++
          break
        case 'draft':
          stats.draft++
          break
        case 'paused':
          stats.paused++
          break
        case 'ended':
        case 'pruned':
          stats.ended++
          break
      }
      stats.totalRevenue += a.revenue || 0
      stats.totalProfit += a.profit || 0
      stats.totalSales += a.sales || 0
      stats.totalViews += a.views || 0
    }
  }

  // Get job stats
  const { data: jobs } = await supabase
    .from('listing_jobs')
    .select('status')
    .eq('store_id', storeId)

  const jobStats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  }

  if (jobs) {
    for (const j of jobs as any[]) {
      if (j.status === 'pending' || j.status === 'queued') jobStats.pending++
      else if (j.status === 'processing') jobStats.processing++
      else if (j.status === 'completed') jobStats.completed++
      else if (j.status === 'failed') jobStats.failed++
    }
  }

  return { ...stats, jobs: jobStats }
}

export default async function StoreDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const store = await getStore(params.id)

  if (!store) {
    notFound()
  }

  const stats = await getStoreStats(params.id)
  const tier = store.store_tiers
  const daysActive = Math.floor(
    (Date.now() - new Date(store.onboarding_date).getTime()) / (1000 * 60 * 60 * 24)
  )
  const floorProgress = tier
    ? Math.round((store.current_active_listings / tier.min_active_listings) * 100)
    : 0

  const activeTab = searchParams.tab || 'overview'

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/stores"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Stores
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{store.store_name}</h1>
            <p className="text-gray-500 mt-1">@{store.ebay_username}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/stores/${store.id}/edit`}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
            <DeleteStoreButton storeId={store.id} storeName={store.store_name} />
          </div>
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex gap-4 mb-6">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            store.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {store.is_active ? 'Active' : 'Inactive'}
        </span>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 capitalize">
          {store.maturity}
        </span>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
          {tier?.tier_name || 'Unknown'} Tier
        </span>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-t-xl shadow-sm border-b">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'listings', label: 'Listings', icon: List },
            { id: 'queue', label: 'Job Queue', icon: Clock },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <Link
                key={tab.id}
                href={`/stores/${store.id}?tab=${tab.id}`}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.id === 'listings' && stats.total > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-gray-100">
                    {stats.total}
                  </span>
                )}
                {tab.id === 'queue' && stats.jobs.pending > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
                    {stats.jobs.pending}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-xl shadow-sm">
        {activeTab === 'overview' && (
          <div className="p-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-white/20 rounded-lg flex items-center justify-center">
                    <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-white/80">Active Listings</p>
                    <p className="text-3xl font-bold">{stats.active.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-between text-sm text-white/70">
                  <span>{stats.draft} draft</span>
                  <span>{stats.paused} paused</span>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-500">Floor Progress</p>
                <div className="mt-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-2xl font-bold text-gray-900">{floorProgress}%</span>
                    <span className="text-gray-500 self-end">
                      {store.current_active_listings} / {tier?.min_active_listings}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        floorProgress >= 100
                          ? 'bg-green-500'
                          : floorProgress >= 50
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(floorProgress, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  ${stats.totalRevenue.toLocaleString()}
                </p>
                <div className="mt-2 flex items-center text-sm">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-green-600">${stats.totalProfit.toLocaleString()} profit</span>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-500">Performance</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalSales}</p>
                <p className="text-sm text-gray-500">sales from {stats.totalViews.toLocaleString()} views</p>
              </div>
            </div>

            {/* Job Queue Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Queue Status</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <Clock className="h-5 w-5 text-yellow-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-yellow-700">{stats.jobs.pending}</p>
                    <p className="text-xs text-yellow-600">Pending</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <Play className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-blue-700">{stats.jobs.processing}</p>
                    <p className="text-xs text-blue-600">Processing</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-green-700">{stats.jobs.completed}</p>
                    <p className="text-xs text-green-600">Completed</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <XCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-red-700">{stats.jobs.failed}</p>
                    <p className="text-xs text-red-600">Failed</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Listing Distribution</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Active</span>
                      <span className="font-medium">{stats.active}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${stats.total ? (stats.active / stats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Draft</span>
                      <span className="font-medium">{stats.draft}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-gray-400 h-2 rounded-full"
                        style={{ width: `${stats.total ? (stats.draft / stats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Paused</span>
                      <span className="font-medium">{stats.paused}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full"
                        style={{ width: `${stats.total ? (stats.paused / stats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Ended</span>
                      <span className="font-medium">{stats.ended}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full"
                        style={{ width: `${stats.total ? (stats.ended / stats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tier Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Tier Configuration</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Tier</dt>
                    <dd className="font-medium">{tier?.tier_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Subscription</dt>
                    <dd className="font-medium">{tier?.subscription_type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Floor (Min)</dt>
                    <dd className="font-medium">{tier?.min_active_listings?.toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Ceiling (Max)</dt>
                    <dd className="font-medium">{tier?.max_total_listings?.toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Days to Floor</dt>
                    <dd className="font-medium">{tier?.days_to_floor} days</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Target Profit</dt>
                    <dd className="font-medium">${tier?.target_monthly_profit?.toLocaleString()}/mo</dd>
                  </div>
                </dl>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Store Details</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">eBay Username</dt>
                    <dd className="font-medium">@{store.ebay_username}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Registration Date</dt>
                    <dd className="font-medium">
                      {store.ebay_registration_date
                        ? new Date(store.ebay_registration_date).toLocaleDateString()
                        : 'Not set'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Onboarding Date</dt>
                    <dd className="font-medium">
                      {new Date(store.onboarding_date).toLocaleDateString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Days Active</dt>
                    <dd className="font-medium">{daysActive} days</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Maturity</dt>
                    <dd className="font-medium capitalize">{store.maturity}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/stores/${store.id}?tab=listings`}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Manage Listings
                </Link>
                <Link
                  href={`/stores/${store.id}?tab=queue`}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  View Job Queue
                </Link>
                <Link
                  href={`/products/skus?assignTo=${store.id}`}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Assign SKUs
                </Link>
                <ExportButton storeId={store.id} storeName={store.store_name} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'listings' && (
          <div className="p-6">
            <StoreListingsPanel storeId={store.id} storeName={store.store_name} />
          </div>
        )}

        {activeTab === 'queue' && (
          <div className="p-6">
            <StoreQueuePanel storeId={store.id} storeName={store.store_name} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-6">
            <div className="max-w-2xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Store Settings</h3>

              {/* Soft Ceiling */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h4 className="font-medium text-gray-900 mb-2">Soft Ceiling Override</h4>
                <p className="text-sm text-gray-500 mb-4">
                  Set a custom maximum listing limit for this store, overriding the tier default.
                </p>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    defaultValue={store.current_soft_ceiling || ''}
                    placeholder={tier?.max_total_listings?.toString() || '10000'}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    Update
                  </button>
                </div>
              </div>

              {/* Automation Settings */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h4 className="font-medium text-gray-900 mb-2">Automation</h4>
                <div className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      defaultChecked={store.auto_list_enabled}
                      className="h-4 w-4 text-indigo-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Auto-list assigned SKUs</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      defaultChecked={store.auto_prune_enabled}
                      className="h-4 w-4 text-indigo-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Auto-prune underperforming listings</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      defaultChecked={store.auto_reprice_enabled}
                      className="h-4 w-4 text-indigo-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Auto-reprice based on competition</span>
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h4 className="font-medium text-gray-900 mb-2">Notes</h4>
                <textarea
                  defaultValue={store.notes || ''}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Add notes about this store..."
                />
                <button className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  Save Notes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
