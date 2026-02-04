import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Edit, Play } from 'lucide-react'
import { DeleteStoreButton } from '@/components/DeleteStoreButton'
import { ExportButton } from '@/components/ExportButton'

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

export default async function StoreDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const store = await getStore(params.id)

  if (!store) {
    notFound()
  }

  const tier = store.store_tiers
  const daysActive = Math.floor(
    (Date.now() - new Date(store.onboarding_date).getTime()) / (1000 * 60 * 60 * 24)
  )
  const floorProgress = tier
    ? Math.round((store.current_active_listings / tier.min_active_listings) * 100)
    : 0

  return (
    <div className="p-8">
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
      <div className="flex gap-4 mb-8">
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Active Listings</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">
            {store.current_active_listings.toLocaleString()}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            of {tier?.min_active_listings.toLocaleString()} floor
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Floor Progress</p>
          <div className="mt-2">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-semibold">{floorProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full ${
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

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Days Active</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{daysActive}</p>
          <p className="text-sm text-gray-400 mt-1">
            Since {new Date(store.onboarding_date).toLocaleDateString()}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Profit Target</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">
            ${tier?.target_monthly_profit.toLocaleString() || 0}
          </p>
          <p className="text-sm text-gray-400 mt-1">per month</p>
        </div>
      </div>

      {/* Tier Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tier Configuration</h2>
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
              <dt className="text-gray-500">Floor (Min Listings)</dt>
              <dd className="font-medium">{tier?.min_active_listings.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Ceiling (Max Listings)</dt>
              <dd className="font-medium">{tier?.max_total_listings.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Days to Floor</dt>
              <dd className="font-medium">{tier?.days_to_floor} days</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Overage Fee</dt>
              <dd className="font-medium">
                {tier?.overage_enabled
                  ? `$${tier.overage_fee}/listing`
                  : 'Disabled'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Store Details</h2>
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
              <dt className="text-gray-500">Maturity Level</dt>
              <dd className="font-medium capitalize">{store.maturity}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="font-medium">
                {new Date(store.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Notes */}
      {store.notes && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
          <p className="text-gray-600 whitespace-pre-wrap">{store.notes}</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/jobs/new?store=${store.id}`}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            <Play className="h-4 w-4 mr-2" />
            Create Onboarding Job
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            View Jobs
          </Link>
          <Link
            href="/products"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            View Listings
          </Link>
          <ExportButton storeId={store.id} storeName={store.store_name} />
        </div>
      </div>
    </div>
  )
}
