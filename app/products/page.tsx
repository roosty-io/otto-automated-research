import { supabase } from '@/lib/supabase'
import { Package, Search, Filter } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getProductStats() {
  // Get store count for context
  const { count: storeCount } = await supabase
    .from('stores')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  return {
    storeCount: storeCount || 0,
  }
}

export default async function ProductsPage() {
  const stats = await getProductStats()

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products & Patterns</h1>
          <p className="text-gray-500 mt-1">
            Manage product patterns across {stats.storeCount} active stores
          </p>
        </div>
      </div>

      {/* Coming Soon Banner */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-8 mb-8 text-white">
        <div className="flex items-center mb-4">
          <Package className="h-10 w-10 mr-4" />
          <div>
            <h2 className="text-2xl font-bold">Product Pattern System</h2>
            <p className="opacity-90">Coming Soon</p>
          </div>
        </div>
        <p className="text-lg opacity-90 mb-4">
          The core principle of PPME: &quot;Products are disposable, patterns are permanent.&quot;
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white/20 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Pattern Management</h3>
            <p className="text-sm opacity-90">
              Create and manage product patterns that can be deployed across multiple stores
            </p>
          </div>
          <div className="bg-white/20 rounded-lg p-4">
            <h3 className="font-semibold mb-2">SKU Distribution</h3>
            <p className="text-sm opacity-90">
              Automatically distribute SKUs across stores with max 3 stores per SKU
            </p>
          </div>
          <div className="bg-white/20 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Performance Tracking</h3>
            <p className="text-sm opacity-90">
              Track pattern performance and automatically prune underperforming listings
            </p>
          </div>
        </div>
      </div>

      {/* Placeholder Features */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <Search className="h-5 w-5 text-gray-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Pattern Search</h2>
          </div>
          <p className="text-gray-500 mb-4">
            Search and filter product patterns by category, performance, or store assignment.
          </p>
          <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-500">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Pattern search coming soon</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <Filter className="h-5 w-5 text-gray-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Store Assignments</h2>
          </div>
          <p className="text-gray-500 mb-4">
            View and manage which patterns are assigned to which stores.
          </p>
          <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-500">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Assignment view coming soon</p>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-white rounded-lg shadow p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pattern System Rules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-500">Max Stores per SKU</p>
            <p className="text-2xl font-bold text-gray-900">3</p>
            <p className="text-xs text-gray-400">Enforced by database trigger</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-500">Prune Threshold</p>
            <p className="text-2xl font-bold text-gray-900">14 days</p>
            <p className="text-xs text-gray-400">Without a sale</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-500">Active Stores</p>
            <p className="text-2xl font-bold text-gray-900">{stats.storeCount}</p>
            <p className="text-xs text-gray-400">Ready for patterns</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-500">Pattern Database</p>
            <p className="text-2xl font-bold text-gray-900">Ready</p>
            <p className="text-xs text-gray-400">Tables configured</p>
          </div>
        </div>
      </div>
    </div>
  )
}
