import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Plus, Search, Filter } from 'lucide-react'
import { StoreTable } from '@/components/StoreTable'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getStoresData() {
  const [storesResult, tiersResult] = await Promise.all([
    supabase
      .from('stores')
      .select('*, store_tiers(*)')
      .order('created_at', { ascending: false }),
    supabase.from('store_tiers').select('*').order('target_monthly_profit'),
  ])

  return {
    stores: storesResult.data || [],
    tiers: tiersResult.data || [],
  }
}

export default async function StoresPage() {
  const { stores, tiers } = await getStoresData()

  const activeCount = stores.filter((s) => s.is_active).length
  const inactiveCount = stores.filter((s) => !s.is_active).length

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Stores</h1>
          <p className="text-gray-500 mt-1">
            {activeCount} active, {inactiveCount} inactive
          </p>
        </div>
        <Link
          href="/stores/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Store
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search stores..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            {tiers.map((tier) => (
              <button
                key={tier.id}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                {tier.tier_name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Store Table */}
      <StoreTable stores={stores} />
    </div>
  )
}
