import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  Search,
  ArrowRight,
  Target,
  Activity,
  BarChart3,
  RefreshCw,
} from 'lucide-react'

async function getDashboardData() {
  const [storesResult, skusResult, patternsResult] = await Promise.all([
    supabase.from('stores').select('*, store_tiers(*)').limit(1),
    supabase.from('skus').select('*').eq('status', 'ready'),
    supabase.from('patterns').select('*'),
  ])

  // Calculate some mock metrics for now - will be replaced with real data
  const store = storesResult.data?.[0]
  const totalSkus = skusResult.data?.length || 0
  const totalPatterns = patternsResult.data?.length || 0

  return {
    store,
    totalSkus,
    totalPatterns,
    metrics: {
      revenue: 4827.50,
      revenueChange: 12.5,
      profit: 1543.20,
      profitChange: 8.3,
      activeListings: totalSkus,
      listingsChange: 5,
      conversionRate: 3.2,
      conversionChange: -0.4,
    },
    automationStatus: {
      research: 'active',
      listing: 'idle',
      optimization: 'scheduled',
      pruning: 'idle',
    },
    alerts: [
      { type: 'warning', message: '3 products need price optimization', action: '/products' },
      { type: 'info', message: 'Weekly research report ready', action: '/analytics' },
    ],
    recentActivity: [
      { action: 'Product listed', item: 'Wireless Bluetooth Earbuds', time: '2 hours ago' },
      { action: 'Price optimized', item: 'Phone Stand Holder', time: '4 hours ago' },
      { action: 'Research completed', item: 'Electronics Category', time: '6 hours ago' },
      { action: 'Product pruned', item: 'USB-C Cable 3ft', time: '1 day ago' },
    ],
  }
}

function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  prefix = '',
  suffix = '',
}: {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  icon: React.ElementType
  prefix?: string
  suffix?: string
}) {
  const isPositive = change && change > 0
  const isNegative = change && change < 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Icon className="h-5 w-5 text-white" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center text-sm font-medium ${
            isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-500'
          }`}>
            {isPositive ? (
              <TrendingUp className="h-4 w-4 mr-1" />
            ) : isNegative ? (
              <TrendingDown className="h-4 w-4 mr-1" />
            ) : null}
            {isPositive && '+'}{change}{suffix || '%'}
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">
        {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix && !change ? suffix : ''}
      </p>
      {changeLabel && (
        <p className="text-xs text-gray-400 mt-1">{changeLabel}</p>
      )}
    </div>
  )
}

function AutomationStatusCard({
  status,
}: {
  status: { research: string; listing: string; optimization: string; pruning: string }
}) {
  const getStatusColor = (s: string) => {
    switch (s) {
      case 'active': return 'bg-green-100 text-green-700'
      case 'scheduled': return 'bg-blue-100 text-blue-700'
      case 'idle': return 'bg-gray-100 text-gray-600'
      case 'error': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'active': return <Activity className="h-4 w-4" />
      case 'scheduled': return <Clock className="h-4 w-4" />
      case 'idle': return <RefreshCw className="h-4 w-4" />
      default: return <RefreshCw className="h-4 w-4" />
    }
  }

  const automations = [
    { name: 'Research', status: status.research, icon: Search },
    { name: 'Listing', status: status.listing, icon: Package },
    { name: 'Optimization', status: status.optimization, icon: BarChart3 },
    { name: 'Pruning', status: status.pruning, icon: Target },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Automation Status</h3>
        <Link href="/automation" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center">
          Manage <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {automations.map((auto) => (
          <div key={auto.name} className="flex items-center p-3 bg-gray-50 rounded-lg">
            <auto.icon className="h-5 w-5 text-gray-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{auto.name}</p>
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${getStatusColor(auto.status)}`}>
                {getStatusIcon(auto.status)}
                {auto.status.charAt(0).toUpperCase() + auto.status.slice(1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AlertsCard({
  alerts,
}: {
  alerts: Array<{ type: string; message: string; action: string }>
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Alerts & Actions</h3>
        <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-1 rounded-full">
          {alerts.length} new
        </span>
      </div>
      <div className="space-y-3">
        {alerts.map((alert, index) => (
          <Link
            key={index}
            href={alert.action}
            className="flex items-start p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
          >
            {alert.type === 'warning' ? (
              <AlertTriangle className="h-5 w-5 text-amber-500 mr-3 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-blue-500 mr-3 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{alert.message}</p>
              <p className="text-xs text-gray-400 mt-0.5">Click to view</p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
          </Link>
        ))}
        {alerts.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">No new alerts</p>
        )}
      </div>
    </div>
  )
}

function RecentActivityCard({
  activities,
}: {
  activities: Array<{ action: string; item: string; time: string }>
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        <Link href="/analytics" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center">
          View all <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </div>
      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div key={index} className="flex items-start">
            <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <Zap className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">{activity.action}</p>
              <p className="text-sm text-gray-500">{activity.item}</p>
            </div>
            <span className="text-xs text-gray-400">{activity.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuickActionsCard() {
  const actions = [
    { name: 'Start Research', href: '/research', icon: Search, color: 'bg-indigo-600 hover:bg-indigo-700' },
    { name: 'Add Product', href: '/products/new', icon: Package, color: 'bg-purple-600 hover:bg-purple-700' },
    { name: 'Policy Check', href: '/policy', icon: CheckCircle2, color: 'bg-emerald-600 hover:bg-emerald-700' },
  ]

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
      <div className="grid grid-cols-3 gap-3">
        {actions.map((action) => (
          <Link
            key={action.name}
            href={action.href}
            className={`flex flex-col items-center justify-center p-4 rounded-lg ${action.color} text-white transition-all hover:scale-105`}
          >
            <action.icon className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium text-center">{action.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function ProgressToGoal({ current, target }: { current: number; target: number }) {
  const percentage = Math.min((current / target) * 100, 100)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Monthly Goal</h3>
        <span className="text-sm text-gray-500">{percentage.toFixed(0)}% complete</span>
      </div>
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-3xl font-bold text-gray-900">${current.toLocaleString()}</span>
          <span className="text-sm text-gray-500">of ${target.toLocaleString()}</span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <p className="text-sm text-gray-500">
        ${(target - current).toLocaleString()} remaining to reach your monthly profit goal
      </p>
    </div>
  )
}

export default async function Dashboard() {
  const { metrics, automationStatus, alerts, recentActivity } = await getDashboardData()

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-500 mt-1">Here&apos;s what&apos;s happening with your store today</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Revenue (30d)"
          value={metrics.revenue.toFixed(2)}
          change={metrics.revenueChange}
          changeLabel="vs last month"
          icon={DollarSign}
          prefix="$"
        />
        <MetricCard
          title="Profit (30d)"
          value={metrics.profit.toFixed(2)}
          change={metrics.profitChange}
          changeLabel="vs last month"
          icon={TrendingUp}
          prefix="$"
        />
        <MetricCard
          title="Active Listings"
          value={metrics.activeListings}
          change={metrics.listingsChange}
          changeLabel="new this week"
          icon={Package}
        />
        <MetricCard
          title="Conversion Rate"
          value={`${metrics.conversionRate}%`}
          change={metrics.conversionChange}
          changeLabel="vs last month"
          icon={Target}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Progress to Goal - spans 2 columns */}
        <div className="lg:col-span-2">
          <ProgressToGoal current={metrics.profit} target={5000} />
        </div>
        {/* Quick Actions */}
        <QuickActionsCard />
      </div>

      {/* Secondary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Automation Status */}
        <AutomationStatusCard status={automationStatus} />
        {/* Alerts */}
        <AlertsCard alerts={alerts} />
        {/* Recent Activity */}
        <RecentActivityCard activities={recentActivity} />
      </div>
    </div>
  )
}
