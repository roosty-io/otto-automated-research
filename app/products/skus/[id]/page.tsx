import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Edit, Store, Tag, DollarSign, TrendingUp } from 'lucide-react'
import { AssignSkuButton } from '@/components/AssignSkuButton'

export const dynamic = 'force-dynamic'

async function getSku(id: string) {
  const { data, error } = await supabase
    .from('skus')
    .select('*, patterns(*), store_sku_assignments(*, stores(id, store_name, ebay_username))')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data
}

async function getAvailableStores(skuId: string) {
  // Get stores that don't already have this SKU assigned
  const { data: assignments } = await supabase
    .from('store_sku_assignments')
    .select('store_id')
    .eq('sku_id', skuId)

  const assignedStoreIds = assignments?.map((a) => a.store_id) || []

  let query = supabase
    .from('stores')
    .select('id, store_name, ebay_username, current_active_listings, store_tiers(tier_name)')
    .eq('is_active', true)
    .order('store_name')

  if (assignedStoreIds.length > 0) {
    query = query.not('id', 'in', `(${assignedStoreIds.join(',')})`)
  }

  const { data } = await query
  return data || []
}

export default async function SkuDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const sku = await getSku(params.id)

  if (!sku) {
    notFound()
  }

  const availableStores = await getAvailableStores(params.id)
  const canAssignMore = sku.current_store_count < 3 && sku.status === 'ready'

  return (
    <div className="p-8">
      <Link
        href="/products/skus"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to SKUs
      </Link>

      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{sku.sku_code}</h1>
          <p className="text-gray-500 mt-1">{sku.title}</p>
        </div>
        <Link
          href={`/products/skus/${sku.id}/edit`}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
        >
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Link>
      </div>

      {/* Status Badges */}
      <div className="flex gap-4 mb-8">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            sku.status === 'ready'
              ? 'bg-green-100 text-green-800'
              : sku.status === 'distributed'
              ? 'bg-blue-100 text-blue-800'
              : sku.status === 'exhausted'
              ? 'bg-red-100 text-red-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {sku.status}
        </span>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
          {sku.current_store_count}/3 stores
        </span>
        {sku.patterns && (
          <Link
            href={`/products/patterns/${sku.pattern_id}`}
            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 hover:bg-blue-200"
          >
            {sku.patterns.category}
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Sell Price</p>
              <p className="text-2xl font-bold text-gray-900">${sku.sell_price.toFixed(2)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-500" />
          </div>
          <p className="text-sm text-gray-500 mt-2">Cost: ${sku.cost_price.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Expected Profit</p>
              <p className={`text-2xl font-bold ${sku.expected_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${sku.expected_profit?.toFixed(2) || '0.00'}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-500" />
          </div>
          <p className="text-sm text-gray-500 mt-2">After ~13% eBay fees</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Sales</p>
              <p className="text-2xl font-bold text-gray-900">{sku.total_sales}</p>
            </div>
            <Tag className="h-8 w-8 text-purple-500" />
          </div>
          <p className="text-sm text-gray-500 mt-2">Revenue: ${sku.total_revenue.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Profit</p>
              <p className={`text-2xl font-bold ${sku.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${sku.total_profit.toFixed(2)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-500" />
          </div>
          {sku.avg_days_to_sale && (
            <p className="text-sm text-gray-500 mt-2">Avg {sku.avg_days_to_sale} days to sale</p>
          )}
        </div>
      </div>

      {/* Description */}
      {sku.description && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
          <p className="text-gray-600 whitespace-pre-wrap">{sku.description}</p>
        </div>
      )}

      {/* Bullet Points */}
      {sku.bullet_points && sku.bullet_points.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Bullet Points</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            {sku.bullet_points.map((point: string, i: number) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Store Assignments */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center">
            <Store className="h-5 w-5 text-gray-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Store Assignments</h2>
          </div>
          {canAssignMore && availableStores.length > 0 && (
            <AssignSkuButton skuId={sku.id} skuCode={sku.sku_code} stores={availableStores} />
          )}
        </div>

        {sku.store_sku_assignments && sku.store_sku_assignments.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {sku.store_sku_assignments.map((assignment: any) => (
              <div key={assignment.id} className="px-6 py-4">
                <div className="flex justify-between items-start">
                  <div>
                    <Link
                      href={`/stores/${assignment.store_id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {assignment.stores?.store_name}
                    </Link>
                    <p className="text-sm text-gray-500">@{assignment.stores?.ebay_username}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        assignment.listing_status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : assignment.listing_status === 'paused'
                          ? 'bg-yellow-100 text-yellow-800'
                          : assignment.listing_status === 'ended'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {assignment.listing_status}
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      {assignment.sales_count} sales • ${assignment.profit.toFixed(2)} profit
                    </p>
                  </div>
                </div>
                {assignment.ebay_listing_id && (
                  <p className="text-xs text-gray-400 mt-2">
                    eBay: {assignment.ebay_listing_id}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-gray-500">
            <Store className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Not assigned to any stores yet</p>
            {!canAssignMore && sku.status !== 'ready' && (
              <p className="text-sm mt-1">Change status to &quot;ready&quot; to enable assignment</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
