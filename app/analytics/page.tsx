import { supabase } from '@/lib/supabase'
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Package, Store, Target } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getAnalyticsData() {
  const [storesResult, tiersResult, jobsResult] = await Promise.all([
    supabase.from('stores').select('*, store_tiers(*)'),
    supabase.from('store_tiers').select('*').order('target_monthly_profit'),
    supabase.from('listing_jobs').select('*').order('created_at', { ascending: false }).limit(100),
  ])

  const stores = storesResult.data || []
  const tiers = tiersResult.data || []
  const jobs = jobsResult.data || []

  // Calculate metrics
  const activeStores = stores.filter(s => s.is_active).length
  const totalStores = stores.length
  const totalListings = stores.reduce((sum, s) => sum + (s.current_active_listings || 0), 0)

  // Calculate floor progress across all stores
  const storesWithProgress = stores.filter(s => s.is_active && s.store_tiers).map(s => ({
    ...s,
    floorProgress: Math.round((s.current_active_listings / s.store_tiers.min_active_listings) * 100)
  }))

  const avgFloorProgress = storesWithProgress.length > 0
    ? Math.round(storesWithProgress.reduce((sum, s) => sum + s.floorProgress, 0) / storesWithProgress.length)
    : 0

  // Stores by tier
  const storesByTier = tiers.map(tier => ({
    tier: tier.tier_name,
    count: stores.filter(s => s.tier_id === tier.id && s.is_active).length,
    targetProfit: tier.target_monthly_profit,
  }))

  // Stores by maturity
  const maturityLevels = ['new', 'establishing', 'growing', 'mature', 'seasoned']
  const storesByMaturity = maturityLevels.map(level => ({
    level,
    count: stores.filter(s => s.maturity === level && s.is_active).length,
  }))

  // Job stats
  const pendingJobs = jobs.filter(j => j.status === 'pending').length
  const processingJobs = jobs.filter(j => j.status === 'processing').length
  const completedJobs = jobs.filter(j => j.status === 'completed').length
  const failedJobs = jobs.filter(j => j.status === 'failed').length

  // Potential monthly revenue (based on tier targets)
  const potentialRevenue = stores
    .filter(s => s.is_active && s.store_tiers)
    .reduce((sum, s) => sum + (s.store_tiers?.target_monthly_profit || 0), 0)

  return {
    activeStores,
    totalStores,
    totalListings,
    avgFloorProgress,
    storesByTier,
    storesByMaturity,
    potentialRevenue,
    jobStats: { pendingJobs, processingJobs, completedJobs, failedJobs },
  }
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className="p-3 bg-blue-50 rounded-lg">
          <Icon className="h-6 w-6 text-blue-600" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center text-sm">
          {trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500 mr-1" />}
          {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500 mr-1" />}
          <span className={trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'}>
            {trend === 'up' ? 'Increasing' : trend === 'down' ? 'Decreasing' : 'Stable'}
          </span>
        </div>
      )}
    </div>
  )
}

export default async function AnalyticsPage() {
  const data = await getAnalyticsData()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 mt-1">System performance and store metrics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Active Stores"
          value={data.activeStores}
          subtitle={`of ${data.totalStores} total`}
          icon={Store}
        />
        <MetricCard
          title="Total Listings"
          value={data.totalListings.toLocaleString()}
          subtitle="across all stores"
          icon={Package}
        />
        <MetricCard
          title="Avg Floor Progress"
          value={`${data.avgFloorProgress}%`}
          subtitle="toward listing floor"
          icon={Target}
        />
        <MetricCard
          title="Potential Revenue"
          value={`$${data.potentialRevenue.toLocaleString()}`}
          subtitle="monthly target"
          icon={DollarSign}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Stores by Tier */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Stores by Tier</h2>
          <div className="space-y-4">
            {data.storesByTier.map((item) => (
              <div key={item.tier}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{item.tier}</span>
                  <span className="text-gray-500">{item.count} stores</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full"
                    style={{ width: `${data.activeStores > 0 ? (item.count / data.activeStores) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  ${item.targetProfit.toLocaleString()}/mo target each
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Stores by Maturity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Stores by Maturity</h2>
          <div className="space-y-4">
            {data.storesByMaturity.map((item) => (
              <div key={item.level}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium capitalize">{item.level}</span>
                  <span className="text-gray-500">{item.count} stores</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-500 h-3 rounded-full"
                    style={{ width: `${data.activeStores > 0 ? (item.count / data.activeStores) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Job Statistics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <p className="text-3xl font-bold text-yellow-600">{data.jobStats.pendingJobs}</p>
            <p className="text-sm text-gray-600">Pending</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-3xl font-bold text-blue-600">{data.jobStats.processingJobs}</p>
            <p className="text-sm text-gray-600">Processing</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-3xl font-bold text-green-600">{data.jobStats.completedJobs}</p>
            <p className="text-sm text-gray-600">Completed</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-3xl font-bold text-red-600">{data.jobStats.failedJobs}</p>
            <p className="text-sm text-gray-600">Failed</p>
          </div>
        </div>
      </div>
    </div>
  )
}
