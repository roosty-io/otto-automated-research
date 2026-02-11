import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  Store,
  Package,
  TrendingUp,
  DollarSign,
  Settings,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  BarChart3,
} from 'lucide-react'

export const metadata = {
  title: 'My Store | OTTO Research Labs',
  description: 'Manage your eBay store',
}

async function getStoreData() {
  const { data: store } = await supabase
    .from('stores')
    .select('*, store_tiers(*)')
    .limit(1)
    .single()

  const { data: skus } = await supabase
    .from('skus')
    .select('*')
    .eq('status', 'ready')

  return {
    store,
    totalListings: skus?.length || 0,
    metrics: {
      revenue: 4827.50,
      profit: 1543.20,
      orders: 127,
      conversionRate: 3.2,
    },
  }
}

function StoreHealthCard({ store }: { store: any }) {
  const healthChecks = [
    { name: 'eBay Connection', status: 'connected', icon: CheckCircle2 },
    { name: 'AutoDS Sync', status: 'pending', icon: Clock },
    { name: 'Policy Compliance', status: 'ok', icon: CheckCircle2 },
    { name: 'Inventory Sync', status: 'warning', icon: AlertCircle },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'ok':
        return 'text-green-500'
      case 'pending':
        return 'text-blue-500'
      case 'warning':
        return 'text-amber-500'
      case 'error':
        return 'text-red-500'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Store Health</h3>
        <Link href="/settings/integrations" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          Configure
        </Link>
      </div>
      <div className="space-y-3">
        {healthChecks.map((check, index) => (
          <div key={index} className="flex items-center justify-between py-2">
            <div className="flex items-center">
              <check.icon className={`h-5 w-5 mr-3 ${getStatusColor(check.status)}`} />
              <span className="text-sm text-gray-700">{check.name}</span>
            </div>
            <span className={`text-xs font-medium capitalize ${getStatusColor(check.status)}`}>
              {check.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ListingStatsCard({ totalListings }: { totalListings: number }) {
  const listingStats = [
    { label: 'Active', count: totalListings, color: 'text-green-600' },
    { label: 'Pending', count: 5, color: 'text-blue-600' },
    { label: 'Needs Review', count: 3, color: 'text-amber-600' },
    { label: 'Out of Stock', count: 2, color: 'text-red-600' },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Listings</h3>
        <Link href="/products" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {listingStats.map((stat, index) => (
          <div key={index} className="bg-gray-50 rounded-lg p-3">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PerformanceCard({ metrics }: { metrics: any }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Performance (30 days)</h3>
        <Link href="/analytics" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          Details
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center mb-1">
            <DollarSign className="h-4 w-4 text-gray-400 mr-1" />
            <span className="text-sm text-gray-500">Revenue</span>
          </div>
          <p className="text-xl font-bold text-gray-900">${metrics.revenue.toLocaleString()}</p>
        </div>
        <div>
          <div className="flex items-center mb-1">
            <TrendingUp className="h-4 w-4 text-gray-400 mr-1" />
            <span className="text-sm text-gray-500">Profit</span>
          </div>
          <p className="text-xl font-bold text-green-600">${metrics.profit.toLocaleString()}</p>
        </div>
        <div>
          <div className="flex items-center mb-1">
            <Package className="h-4 w-4 text-gray-400 mr-1" />
            <span className="text-sm text-gray-500">Orders</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{metrics.orders}</p>
        </div>
        <div>
          <div className="flex items-center mb-1">
            <BarChart3 className="h-4 w-4 text-gray-400 mr-1" />
            <span className="text-sm text-gray-500">Conversion</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{metrics.conversionRate}%</p>
        </div>
      </div>
    </div>
  )
}

function QuickActionsCard() {
  const actions = [
    { name: 'Add Product', href: '/products/new', icon: Package },
    { name: 'View Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Store Settings', href: '/settings', icon: Settings },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
      <div className="space-y-2">
        {actions.map((action, index) => (
          <Link
            key={index}
            href={action.href}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center">
              <action.icon className="h-5 w-5 text-gray-400 mr-3" />
              <span className="text-sm font-medium text-gray-700">{action.name}</span>
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400" />
          </Link>
        ))}
      </div>
    </div>
  )
}

export default async function MyStorePage() {
  const { store, totalListings, metrics } = await getStoreData()

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Store</h1>
            <p className="text-gray-500 mt-1">
              {store?.store_name || 'Your eBay Store'}
              {store?.store_tiers?.tier_name && (
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  {store.store_tiers.tier_name} Plan
                </span>
              )}
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Settings className="h-4 w-4 mr-2" />
            Store Settings
          </Link>
        </div>
      </div>

      {/* Store Info Banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg p-6 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="h-16 w-16 rounded-xl bg-white/20 flex items-center justify-center">
              <Store className="h-8 w-8 text-white" />
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-bold">{store?.store_name || 'Your Store'}</h2>
              <p className="text-indigo-200">{store?.ebay_username || 'Connect your eBay account'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{totalListings}</p>
            <p className="text-indigo-200">Active Listings</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          <PerformanceCard metrics={metrics} />
          <ListingStatsCard totalListings={totalListings} />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <StoreHealthCard store={store} />
          <QuickActionsCard />
        </div>
      </div>
    </div>
  )
}
