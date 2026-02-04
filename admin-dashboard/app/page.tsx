import { supabase } from '@/lib/supabase'
import { StoreHealth, StoreTier } from '@/lib/database.types'
import Link from 'next/link'
import { Store, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react'

async function getDashboardData() {
  const [tiersResult, storesResult] = await Promise.all([
    supabase.from('store_tiers').select('*').order('target_monthly_profit'),
    supabase.from('stores').select('*, store_tiers(*)').eq('is_active', true),
  ])

  return {
    tiers: tiersResult.data || [],
    stores: storesResult.data || [],
  }
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue'
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color?: 'blue' | 'green' | 'yellow' | 'red'
}) {
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`${colors[color]} rounded-lg p-3`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

function TierCard({ tier, storeCount }: { tier: StoreTier; storeCount: number }) {
  const tierColors: Record<string, string> = {
    Bronze: 'border-amber-600 bg-amber-50',
    Silver: 'border-gray-400 bg-gray-50',
    Gold: 'border-yellow-500 bg-yellow-50',
    Platinum: 'border-purple-500 bg-purple-50',
  }

  return (
    <div className={`border-l-4 ${tierColors[tier.tier_name] || 'border-gray-300 bg-white'} rounded-lg shadow p-4`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg">{tier.tier_name}</h3>
          <p className="text-sm text-gray-500">{tier.subscription_type}</p>
        </div>
        <span className="text-2xl font-bold text-gray-700">{storeCount}</span>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Target Profit</span>
          <span className="font-medium">${tier.target_monthly_profit.toLocaleString()}/mo</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Floor</span>
          <span className="font-medium">{tier.min_active_listings.toLocaleString()} listings</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Ceiling</span>
          <span className="font-medium">{tier.max_total_listings.toLocaleString()} listings</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Overage</span>
          <span className="font-medium">
            {tier.overage_enabled ? `$${tier.overage_fee}/listing` : 'Disabled'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default async function Dashboard() {
  const { tiers, stores } = await getDashboardData()

  const storesByTier = tiers.reduce((acc, tier) => {
    acc[tier.id] = stores.filter((s: any) => s.tier_id === tier.id).length
    return acc
  }, {} as Record<string, number>)

  const totalListings = stores.reduce((sum: number, s: any) => sum + (s.current_active_listings || 0), 0)
  const activeStores = stores.length
  const newStores = stores.filter((s: any) => s.maturity === 'new').length

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">PPME Dashboard</h1>
        <p className="text-gray-500 mt-1">Product Pattern Manufacturing Engine</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Active Stores"
          value={activeStores}
          subtitle={`${newStores} new`}
          icon={Store}
          color="blue"
        />
        <StatCard
          title="Total Listings"
          value={totalListings.toLocaleString()}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Avg Listings/Store"
          value={activeStores > 0 ? Math.round(totalListings / activeStores).toLocaleString() : 0}
          icon={CheckCircle}
          color="yellow"
        />
        <StatCard
          title="System Status"
          value="Healthy"
          icon={AlertCircle}
          color="green"
        />
      </div>

      {/* Tier Overview */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Tier Overview</h2>
          <Link
            href="/stores"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View All Stores
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              storeCount={storesByTier[tier.id] || 0}
            />
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/stores/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Store className="h-4 w-4 mr-2" />
            Add New Store
          </Link>
        </div>
      </div>
    </div>
  )
}
