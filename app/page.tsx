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
  Database,
  Cpu,
  Boxes,
  ShoppingCart,
  Sparkles,
  ArrowDown,
  Lightbulb,
} from 'lucide-react'
import { getPipelineStats } from '@/lib/pipeline'
import { getJobStats } from '@/lib/jobs'

async function getDashboardData() {
  // Fetch real data in parallel
  const [
    storesResult,
    rawProductsResult,
    normalizedResult,
    skusResult,
    pipelineStats,
    jobStats,
  ] = await Promise.all([
    supabase.from('stores').select('*, store_tiers(*)').limit(1),
    supabase.from('raw_products').select('id, source, is_processed, created_at').limit(1000),
    supabase.from('normalized_products').select('id, quality_score, sku_id').limit(1000),
    supabase.from('skus').select('id, status, suggested_price, cost_price').limit(1000),
    getPipelineStats().catch(() => ({ total: 0, running: 0, completed: 0, failed: 0, totalProducts: 0, totalSkus: 0 })),
    getJobStats().catch(() => ({ pending: 0, processing: 0, completed: 0, failed: 0 })),
  ])

  const store = storesResult.data?.[0]
  const rawProducts = rawProductsResult.data || []
  const normalizedProducts = normalizedResult.data || []
  const skus = skusResult.data || []

  // Calculate real metrics
  const totalRaw = rawProducts.length
  const totalProcessed = rawProducts.filter((p: any) => p.is_processed).length
  const totalNormalized = normalizedProducts.length
  const totalSkus = skus.length
  const readySkus = skus.filter((s: any) => s.status === 'ready').length
  const listedSkus = skus.filter((s: any) => s.status === 'listed').length

  // Calculate average quality score
  const qualityScores = normalizedProducts
    .map((p: any) => p.quality_score)
    .filter((s: any) => s != null) as number[]
  const avgQualityScore = qualityScores.length > 0
    ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
    : 0

  // Calculate average margin
  const margins = skus
    .filter((s: any) => s.suggested_price && s.cost_price && s.cost_price > 0)
    .map((s: any) => ((s.suggested_price - s.cost_price) / s.suggested_price) * 100)
  const avgMargin = margins.length > 0
    ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length * 10) / 10
    : 0

  // Source breakdown
  const bySource: Record<string, number> = {}
  rawProducts.forEach((p: any) => {
    const source = p.source || 'unknown'
    bySource[source] = (bySource[source] || 0) + 1
  })

  return {
    store,
    pipeline: {
      raw: totalRaw,
      processed: totalProcessed,
      normalized: totalNormalized,
      skus: totalSkus,
      ready: readySkus,
      listed: listedSkus,
    },
    pipelineStats,
    jobStats,
    metrics: {
      avgQualityScore,
      avgMargin,
      conversionRate: totalNormalized > 0 ? Math.round((totalSkus / totalNormalized) * 100) : 0,
    },
    sources: bySource,
    automationStatus: {
      research: jobStats.processing > 0 ? 'active' : jobStats.pending > 0 ? 'scheduled' : 'idle',
      listing: pipelineStats.running > 0 ? 'active' : 'idle',
      optimization: 'scheduled',
      pruning: 'idle',
    },
    alerts: generateAlerts(totalRaw, totalProcessed, totalNormalized, readySkus, jobStats),
  }
}

function generateAlerts(raw: number, processed: number, normalized: number, ready: number, jobs: any) {
  const alerts: { type: string; message: string; action: string }[] = []

  if (raw > 0 && processed < raw * 0.5) {
    alerts.push({
      type: 'warning',
      message: `${raw - processed} products pending processing`,
      action: '/products',
    })
  }

  if (ready > 0 && ready >= 10) {
    alerts.push({
      type: 'info',
      message: `${ready} SKUs ready for listing`,
      action: '/products/skus',
    })
  }

  if (jobs.failed > 0) {
    alerts.push({
      type: 'warning',
      message: `${jobs.failed} jobs failed - review needed`,
      action: '/jobs',
    })
  }

  if (normalized === 0 && raw === 0) {
    alerts.push({
      type: 'info',
      message: 'Start research to discover new products',
      action: '/research',
    })
  }

  return alerts
}

function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  prefix = '',
  suffix = '',
  gradient = 'from-indigo-500 to-purple-600',
}: {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  icon: React.ElementType
  prefix?: string
  suffix?: string
  gradient?: string
}) {
  const isPositive = change && change > 0
  const isNegative = change && change < 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
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

function PipelineFunnel({
  pipeline,
}: {
  pipeline: { raw: number; processed: number; normalized: number; skus: number; ready: number; listed: number }
}) {
  const stages = [
    { name: 'Discovered', count: pipeline.raw, icon: Search, color: 'bg-blue-500' },
    { name: 'Processed', count: pipeline.processed, icon: Cpu, color: 'bg-indigo-500' },
    { name: 'Normalized', count: pipeline.normalized, icon: Sparkles, color: 'bg-purple-500' },
    { name: 'SKUs Created', count: pipeline.skus, icon: Boxes, color: 'bg-pink-500' },
    { name: 'Ready to List', count: pipeline.ready, icon: Package, color: 'bg-orange-500' },
    { name: 'Listed', count: pipeline.listed, icon: ShoppingCart, color: 'bg-green-500' },
  ]

  const maxCount = Math.max(...stages.map(s => s.count), 1)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Product Pipeline</h3>
        <Link href="/products" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center">
          View all <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </div>
      <div className="space-y-4">
        {stages.map((stage, index) => {
          const percentage = Math.round((stage.count / maxCount) * 100)
          const conversionRate = index > 0 && stages[index - 1].count > 0
            ? Math.round((stage.count / stages[index - 1].count) * 100)
            : null

          return (
            <div key={stage.name}>
              {index > 0 && (
                <div className="flex items-center justify-center my-2">
                  <ArrowDown className="h-4 w-4 text-gray-300" />
                  {conversionRate !== null && (
                    <span className="text-xs text-gray-400 ml-2">{conversionRate}%</span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className={`h-10 w-10 rounded-lg ${stage.color} flex items-center justify-center flex-shrink-0`}>
                  <stage.icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{stage.name}</span>
                    <span className="text-sm font-semibold text-gray-900">{stage.count.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded-full transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function JobQueueStatus({ stats }: { stats: { pending: number; processing: number; completed: number; failed: number } }) {
  const total = stats.pending + stats.processing + stats.completed + stats.failed

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Job Queue</h3>
        <Link href="/jobs" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center">
          Manage <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-yellow-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">Pending</span>
          </div>
          <p className="text-2xl font-bold text-yellow-900 mt-1">{stats.pending}</p>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">Processing</span>
          </div>
          <p className="text-2xl font-bold text-blue-900 mt-1">{stats.processing}</p>
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">Completed</span>
          </div>
          <p className="text-2xl font-bold text-green-900 mt-1">{stats.completed}</p>
        </div>
        <div className="p-3 bg-red-50 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-sm font-medium text-red-800">Failed</span>
          </div>
          <p className="text-2xl font-bold text-red-900 mt-1">{stats.failed}</p>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Success rate</span>
            <span className="font-medium text-gray-900">
              {stats.completed + stats.failed > 0
                ? Math.round((stats.completed / (stats.completed + stats.failed)) * 100)
                : 100}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function DataSourcesCard({ sources }: { sources: Record<string, number> }) {
  const sourceConfig: Record<string, { name: string; color: string; icon: React.ElementType }> = {
    zik: { name: 'ZIK Analytics', color: 'bg-blue-500', icon: BarChart3 },
    keepa: { name: 'Keepa/Amazon', color: 'bg-orange-500', icon: Database },
    manual: { name: 'Manual Import', color: 'bg-gray-500', icon: Package },
    unknown: { name: 'Other', color: 'bg-gray-400', icon: Database },
  }

  const total = Object.values(sources).reduce((a, b) => a + b, 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Sources</h3>
      {total === 0 ? (
        <div className="text-center py-8">
          <Database className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No products discovered yet</p>
          <Link href="/research" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium mt-2 inline-block">
            Start researching
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(sources).map(([source, count]) => {
            const config = sourceConfig[source] || sourceConfig.unknown
            const percentage = Math.round((count / total) * 100)

            return (
              <div key={source} className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg ${config.color} flex items-center justify-center`}>
                  <config.icon className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{config.name}</span>
                    <span className="text-sm text-gray-500">{count} ({percentage}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${config.color} rounded-full`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
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
        {alerts.length > 0 && (
          <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-1 rounded-full">
            {alerts.length} new
          </span>
        )}
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
              <Lightbulb className="h-5 w-5 text-blue-500 mr-3 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{alert.message}</p>
              <p className="text-xs text-gray-400 mt-0.5">Click to view</p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
          </Link>
        ))}
        {alerts.length === 0 && (
          <div className="text-center py-6">
            <CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">All caught up!</p>
          </div>
        )}
      </div>
    </div>
  )
}

function QuickActionsCard() {
  const actions = [
    { name: 'Start Research', href: '/research', icon: Search, color: 'bg-indigo-600 hover:bg-indigo-700' },
    { name: 'View SKUs', href: '/products/skus', icon: Boxes, color: 'bg-purple-600 hover:bg-purple-700' },
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

export default async function Dashboard() {
  const { pipeline, pipelineStats, jobStats, metrics, sources, automationStatus, alerts } = await getDashboardData()

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">OTTO Research Labs</h1>
        <p className="text-gray-500 mt-1">Your automated dropshipping research pipeline</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Products Discovered"
          value={pipeline.raw}
          changeLabel="Total in pipeline"
          icon={Search}
          gradient="from-blue-500 to-indigo-600"
        />
        <MetricCard
          title="SKUs Ready"
          value={pipeline.ready}
          changeLabel={`${pipeline.skus} total SKUs`}
          icon={Boxes}
          gradient="from-purple-500 to-pink-600"
        />
        <MetricCard
          title="Avg Quality Score"
          value={metrics.avgQualityScore}
          changeLabel="Across all products"
          icon={Target}
          suffix="/100"
          gradient="from-emerald-500 to-teal-600"
        />
        <MetricCard
          title="Avg Margin"
          value={`${metrics.avgMargin}%`}
          changeLabel="Expected profit margin"
          icon={DollarSign}
          gradient="from-orange-500 to-red-600"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Pipeline Funnel - spans 2 columns */}
        <div className="lg:col-span-2">
          <PipelineFunnel pipeline={pipeline} />
        </div>
        {/* Quick Actions */}
        <QuickActionsCard />
      </div>

      {/* Secondary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Job Queue */}
        <JobQueueStatus stats={jobStats} />
        {/* Data Sources */}
        <DataSourcesCard sources={sources} />
        {/* Automation Status */}
        <AutomationStatusCard status={automationStatus} />
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertsCard alerts={alerts} />
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
          <h3 className="text-lg font-semibold mb-4">Pipeline Statistics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-indigo-100 text-sm">Total Pipelines</p>
              <p className="text-3xl font-bold">{pipelineStats.total}</p>
            </div>
            <div>
              <p className="text-indigo-100 text-sm">Running Now</p>
              <p className="text-3xl font-bold">{pipelineStats.running}</p>
            </div>
            <div>
              <p className="text-indigo-100 text-sm">Completed</p>
              <p className="text-3xl font-bold">{pipelineStats.completed}</p>
            </div>
            <div>
              <p className="text-indigo-100 text-sm">Products Found</p>
              <p className="text-3xl font-bold">{pipelineStats.totalProducts}</p>
            </div>
          </div>
          <Link
            href="/research"
            className="mt-4 inline-flex items-center text-sm font-medium text-white hover:text-indigo-100"
          >
            Start new research <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </div>
      </div>
    </div>
  )
}
