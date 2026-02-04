import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Package, Layers, Tag, Plus, TrendingUp, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getPatterns() {
  const { data } = await supabase
    .from('patterns')
    .select('*')
    .order('pattern_score', { ascending: false })
    .limit(20)
  return data || []
}

async function getSkus() {
  const { data } = await supabase
    .from('skus')
    .select('*, patterns(category, price_band)')
    .order('created_at', { ascending: false })
    .limit(20)
  return data || []
}

async function getStats() {
  const [patternsCount, skusCount, activeAssignments, availableSkus] = await Promise.all([
    supabase.from('patterns').select('*', { count: 'exact', head: true }),
    supabase.from('skus').select('*', { count: 'exact', head: true }),
    supabase.from('store_sku_assignments').select('*', { count: 'exact', head: true }).eq('listing_status', 'active'),
    supabase.from('skus').select('*', { count: 'exact', head: true }).eq('status', 'ready').lt('current_store_count', 3),
  ])

  return {
    patterns: patternsCount.count || 0,
    skus: skusCount.count || 0,
    activeListings: activeAssignments.count || 0,
    availableSkus: availableSkus.count || 0,
  }
}

export default async function ProductsPage() {
  const [patterns, skus, stats] = await Promise.all([
    getPatterns(),
    getSkus(),
    getStats(),
  ])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products & Patterns</h1>
          <p className="text-gray-500 mt-1">
            Products are disposable, patterns are permanent
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/products/patterns/new"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
          >
            <Layers className="h-4 w-4 mr-2" />
            New Pattern
          </Link>
          <Link
            href="/products/skus/new"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New SKU
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Patterns</p>
              <p className="text-3xl font-bold text-gray-900">{stats.patterns}</p>
            </div>
            <Layers className="h-10 w-10 text-purple-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total SKUs</p>
              <p className="text-3xl font-bold text-gray-900">{stats.skus}</p>
            </div>
            <Tag className="h-10 w-10 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Listings</p>
              <p className="text-3xl font-bold text-gray-900">{stats.activeListings}</p>
            </div>
            <TrendingUp className="h-10 w-10 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Available SKUs</p>
              <p className="text-3xl font-bold text-gray-900">{stats.availableSkus}</p>
            </div>
            <Package className="h-10 w-10 text-orange-500" />
          </div>
          <p className="text-xs text-gray-400 mt-2">Ready & under 3 stores</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Patterns Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center">
              <Layers className="h-5 w-5 text-gray-500 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Patterns</h2>
            </div>
            <Link href="/products/patterns" className="text-sm text-blue-600 hover:underline">
              View All
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {patterns.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No patterns yet</p>
                <Link href="/products/patterns/new" className="text-blue-600 hover:underline text-sm">
                  Create your first pattern
                </Link>
              </div>
            ) : (
              patterns.slice(0, 5).map((pattern: any) => (
                <Link
                  key={pattern.id}
                  href={`/products/patterns/${pattern.id}`}
                  className="block px-6 py-4 hover:bg-gray-50"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">
                        {pattern.category}
                        {pattern.subcategory && ` / ${pattern.subcategory}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {pattern.use_case || 'General'} • {pattern.price_band}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {pattern.total_skus} SKUs
                      </p>
                      <p className="text-xs text-gray-500">
                        Score: {pattern.pattern_score.toFixed(1)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* SKUs Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center">
              <Tag className="h-5 w-5 text-gray-500 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Recent SKUs</h2>
            </div>
            <Link href="/products/skus" className="text-sm text-blue-600 hover:underline">
              View All
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {skus.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <Tag className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No SKUs yet</p>
                <Link href="/products/skus/new" className="text-blue-600 hover:underline text-sm">
                  Create your first SKU
                </Link>
              </div>
            ) : (
              skus.slice(0, 5).map((sku: any) => (
                <Link
                  key={sku.id}
                  href={`/products/skus/${sku.id}`}
                  className="block px-6 py-4 hover:bg-gray-50"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="font-medium text-gray-900 truncate">{sku.title}</p>
                      <p className="text-sm text-gray-500">{sku.sku_code}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-gray-900">
                        ${sku.sell_price?.toFixed(2)}
                      </p>
                      <div className="flex items-center gap-1 justify-end">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            sku.status === 'ready'
                              ? 'bg-green-100 text-green-800'
                              : sku.status === 'distributed'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {sku.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {sku.current_store_count}/3
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Distribution Rules Info */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-blue-900">SKU Distribution Rules</h3>
            <ul className="mt-2 text-sm text-blue-700 space-y-1">
              <li>• Each SKU can be assigned to a maximum of 3 stores</li>
              <li>• SKUs must be in "ready" status before assignment</li>
              <li>• Assignments are tracked and enforced by database triggers</li>
              <li>• Stale listings (no sale in 14 days) are candidates for pruning</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
