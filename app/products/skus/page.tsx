import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Tag,
  Upload,
  TrendingUp,
  DollarSign,
  Package,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  Search,
  BarChart3,
  Boxes,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getSkus() {
  const { data } = await supabase
    .from('skus')
    .select(`
      *,
      patterns(category, subcategory, price_band),
      normalized_products(normalized_title, normalized_category, quality_score)
    `)
    .order('created_at', { ascending: false })
  return data || []
}

async function getSkuStats(skus: any[]) {
  const total = skus.length
  const ready = skus.filter((s) => s.status === 'ready').length
  const needsReview = skus.filter((s) => s.status === 'needs_review').length
  const listed = skus.filter((s) => s.status === 'listed').length
  const paused = skus.filter((s) => s.status === 'paused').length

  const totalRevenue = skus.reduce((sum, s) => sum + (s.total_sales || 0) * (s.sell_price || 0), 0)
  const totalProfit = skus.reduce((sum, s) => sum + (s.total_profit || 0), 0)

  const margins = skus
    .filter((s) => s.sell_price && s.cost_price && s.cost_price > 0)
    .map((s) => ((s.sell_price - s.cost_price) / s.sell_price) * 100)
  const avgMargin = margins.length > 0
    ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length * 10) / 10
    : 0

  // Price band distribution
  const byPriceBand: Record<string, number> = {}
  skus.forEach((s) => {
    const band = s.price_band || 'unknown'
    byPriceBand[band] = (byPriceBand[band] || 0) + 1
  })

  // Status distribution
  const byStatus: Record<string, number> = {
    ready,
    needs_review: needsReview,
    listed,
    paused,
  }

  return {
    total,
    ready,
    needsReview,
    listed,
    paused,
    totalRevenue,
    totalProfit,
    avgMargin,
    byPriceBand,
    byStatus,
  }
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: 'bg-green-100 text-green-800',
    needs_review: 'bg-yellow-100 text-yellow-800',
    listed: 'bg-blue-100 text-blue-800',
    paused: 'bg-gray-100 text-gray-800',
    exhausted: 'bg-red-100 text-red-800',
  }

  const icons: Record<string, React.ElementType> = {
    ready: CheckCircle2,
    needs_review: AlertTriangle,
    listed: Package,
    paused: Clock,
    exhausted: AlertTriangle,
  }

  const Icon = icons[status] || Tag
  const style = styles[status] || 'bg-gray-100 text-gray-800'

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      <Icon className="h-3 w-3" />
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function QualityBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-sm">-</span>

  let color = 'bg-gray-100 text-gray-800'
  let label = 'F'

  if (score >= 85) {
    color = 'bg-green-100 text-green-800'
    label = 'A'
  } else if (score >= 70) {
    color = 'bg-blue-100 text-blue-800'
    label = 'B'
  } else if (score >= 55) {
    color = 'bg-yellow-100 text-yellow-800'
    label = 'C'
  } else if (score >= 40) {
    color = 'bg-orange-100 text-orange-800'
    label = 'D'
  } else {
    color = 'bg-red-100 text-red-800'
    label = 'F'
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label} ({score})
    </span>
  )
}

export default async function SkusPage() {
  const skus = await getSkus()
  const stats = await getSkuStats(skus)

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <Link
        href="/products"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Products
      </Link>

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SKU Management</h1>
          <p className="text-gray-500 mt-1">
            {stats.total} total SKUs • {stats.ready} ready for listing
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/api/processing/generate-sku"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Generate SKUs
          </Link>
          <Link
            href="/products/skus/import"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Link>
          <Link
            href="/products/skus/new"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New SKU
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          title="Total SKUs"
          value={stats.total}
          icon={Boxes}
          color="bg-indigo-500"
        />
        <StatCard
          title="Ready"
          value={stats.ready}
          subtitle="Available for listing"
          icon={CheckCircle2}
          color="bg-green-500"
        />
        <StatCard
          title="Needs Review"
          value={stats.needsReview}
          icon={AlertTriangle}
          color="bg-yellow-500"
        />
        <StatCard
          title="Avg Margin"
          value={`${stats.avgMargin}%`}
          icon={TrendingUp}
          color="bg-purple-500"
        />
        <StatCard
          title="Total Profit"
          value={`$${stats.totalProfit.toFixed(2)}`}
          icon={DollarSign}
          color="bg-emerald-500"
        />
      </div>

      {/* Quick Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Quick Filters:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded-full font-medium">
              All ({stats.total})
            </button>
            <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200">
              Ready ({stats.ready})
            </button>
            <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200">
              Needs Review ({stats.needsReview})
            </button>
            <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200">
              Listed ({stats.listed})
            </button>
          </div>
          <div className="ml-auto">
            <div className="relative">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search SKUs..."
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SKU Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU / Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pricing
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quality
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Store Usage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Performance
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {skus.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <Boxes className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No SKUs Created Yet</h3>
                  <p className="text-gray-500 mb-4">Generate SKUs from your normalized products</p>
                  <div className="flex gap-3 justify-center">
                    <Link
                      href="/api/processing/generate-sku"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                    >
                      Generate SKUs
                    </Link>
                    <Link
                      href="/products/skus/new"
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      Create Manually
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              skus.map((sku: any) => {
                const margin = sku.sell_price && sku.cost_price
                  ? Math.round(((sku.sell_price - sku.cost_price) / sku.sell_price) * 100)
                  : 0
                const qualityScore = sku.normalized_products?.quality_score || sku.listing_readiness

                return (
                  <tr key={sku.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/products/skus/${sku.id}`}
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        {sku.sku_code}
                      </Link>
                      <p className="text-sm text-gray-500 truncate max-w-xs mt-1">
                        {sku.listing_title || sku.title || sku.normalized_products?.normalized_title || 'Untitled'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {sku.patterns ? (
                        <div>
                          <p className="text-gray-900">{sku.patterns.category}</p>
                          {sku.patterns.subcategory && (
                            <p className="text-gray-500 text-xs">{sku.patterns.subcategory}</p>
                          )}
                        </div>
                      ) : sku.normalized_products?.normalized_category ? (
                        <p className="text-gray-900">{sku.normalized_products.normalized_category}</p>
                      ) : (
                        <span className="text-gray-400">Uncategorized</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="space-y-1">
                        <p className="font-semibold text-gray-900">
                          ${(sku.sell_price || sku.suggested_price || 0).toFixed(2)}
                        </p>
                        <p className="text-gray-500 text-xs">
                          Cost: ${(sku.cost_price || 0).toFixed(2)}
                        </p>
                        <p className={`text-xs font-medium ${margin >= 30 ? 'text-green-600' : margin >= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {margin}% margin
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <QualityBadge score={qualityScore} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              (sku.current_store_count || 0) >= 3
                                ? 'bg-red-500'
                                : (sku.current_store_count || 0) >= 2
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${((sku.current_store_count || 0) / 3) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-600">
                          {sku.current_store_count || 0}/3
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={sku.status} />
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="space-y-1">
                        <p className="text-gray-900">{sku.total_sales || 0} sales</p>
                        <p className={`text-xs font-medium ${(sku.total_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${(sku.total_profit || 0).toFixed(2)} profit
                        </p>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Price Band Distribution */}
      {skus.length > 0 && (
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">SKU Distribution by Price Band</h3>
          <div className="grid grid-cols-5 gap-4">
            {['budget', 'low', 'mid', 'high', 'premium'].map((band) => {
              const count = stats.byPriceBand[band] || 0
              const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0

              return (
                <div key={band} className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-500 capitalize">{band}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
                  <p className="text-xs text-gray-400">{percentage}%</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
