export const dynamic = 'force-dynamic'

import Link from 'next/link'
import {
  Scissors,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  BarChart3,
  Play,
  Pause,
  RefreshCw,
  ArrowRight,
  Target,
  Zap,
  Eye,
  DollarSign,
} from 'lucide-react'
import { getPruningStats, getAllRules, getPendingReviews, findPruningCandidates } from '@/lib/pruning'
import { PruningActionsPanel } from '@/components/PruningActionsPanel'

async function getPruningData() {
  const [stats, rules, reviews, candidates] = await Promise.all([
    getPruningStats({ daysBack: 30 }).catch(() => ({
      totalPruned: 0,
      totalPaused: 0,
      totalReviewed: 0,
      byRule: {},
      byStore: {},
      recentActions: [],
    })),
    getAllRules().catch(() => []),
    getPendingReviews({ limit: 10 }).catch(() => []),
    findPruningCandidates({ maxListings: 50 }).catch(() => []),
  ])

  return { stats, rules, reviews, candidates }
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

export default async function PruningPage() {
  const { stats, rules, reviews, candidates } = await getPruningData()

  const activeRules = rules.filter((r) => r.isActive).length
  const topRules = Object.entries(stats.byRule)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Automated Pruning</h1>
            <p className="text-gray-500 mt-1">Remove underperforming listings automatically</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/pruning/rules"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Settings className="h-4 w-4 mr-2" />
              Manage Rules
            </Link>
            <Link
              href="/pruning/analytics"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              View Analytics
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Listings Pruned"
          value={stats.totalPruned}
          subtitle="Last 30 days"
          icon={Scissors}
          color="bg-red-500"
        />
        <StatCard
          title="Listings Paused"
          value={stats.totalPaused}
          subtitle="Last 30 days"
          icon={Pause}
          color="bg-yellow-500"
        />
        <StatCard
          title="Pending Reviews"
          value={reviews.length}
          subtitle="Awaiting decision"
          icon={Eye}
          color="bg-blue-500"
        />
        <StatCard
          title="Active Rules"
          value={activeRules}
          subtitle={`of ${rules.length} total`}
          icon={Target}
          color="bg-purple-500"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Candidates Panel */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pruning Candidates</h2>
              <p className="text-sm text-gray-500">
                {candidates.length} listings match pruning rules
              </p>
            </div>
            <button className="inline-flex items-center px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </button>
          </div>

          {candidates.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-4" />
              <p className="text-gray-500">No listings currently match pruning rules</p>
              <p className="text-sm text-gray-400 mt-1">All listings are performing within acceptable thresholds</p>
            </div>
          ) : (
            <div className="space-y-4">
              {candidates.slice(0, 10).map((candidate) => (
                <div
                  key={candidate.listing.assignmentId}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        candidate.recommendedAction === 'prune'
                          ? 'bg-red-100 text-red-700'
                          : candidate.recommendedAction === 'pause'
                          ? 'bg-yellow-100 text-yellow-700'
                          : candidate.recommendedAction === 'review'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {candidate.recommendedAction}
                      </span>
                      <span className="font-medium text-gray-900">
                        {candidate.listing.skuId.slice(0, 8)}...
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>{candidate.listing.daysListed} days listed</span>
                      <span>{candidate.listing.views} views</span>
                      <span>{candidate.listing.sales} sales</span>
                      <span className="text-gray-400">Rule: {candidate.evaluation.ruleName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Scissors className="h-4 w-4" />
                    </button>
                    <button className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg">
                      <Pause className="h-4 w-4" />
                    </button>
                    <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {candidates.length > 10 && (
                <div className="text-center pt-4">
                  <Link
                    href="/pruning/candidates"
                    className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                  >
                    View all {candidates.length} candidates
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl shadow-lg p-6 text-white">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <PruningActionsPanel />
            </div>
          </div>

          {/* Pending Reviews */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Pending Reviews</h3>
              {reviews.length > 0 && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                  {reviews.length}
                </span>
              )}
            </div>

            {reviews.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No pending reviews</p>
            ) : (
              <div className="space-y-3">
                {reviews.slice(0, 5).map((review) => (
                  <div key={review.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {review.skuId.slice(0, 12)}...
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{review.reason}</p>
                    <div className="flex gap-2 mt-2">
                      <button className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200">
                        Approve
                      </button>
                      <button className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {reviews.length > 5 && (
              <Link
                href="/pruning/reviews"
                className="block text-center text-indigo-600 hover:text-indigo-700 text-sm font-medium mt-4"
              >
                View all reviews
              </Link>
            )}
          </div>

          {/* Top Rules */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Triggered Rules</h3>
            {topRules.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No rules triggered yet</p>
            ) : (
              <div className="space-y-3">
                {topRules.map(([ruleName, count], index) => (
                  <div key={ruleName} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-sm text-gray-700">{ruleName}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
            {stats.recentActions.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {stats.recentActions.slice(0, 5).map((action, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      action.action === 'prune'
                        ? 'bg-red-100'
                        : action.action === 'pause'
                        ? 'bg-yellow-100'
                        : 'bg-blue-100'
                    }`}>
                      {action.action === 'prune' ? (
                        <Scissors className={`h-4 w-4 text-red-600`} />
                      ) : action.action === 'pause' ? (
                        <Pause className={`h-4 w-4 text-yellow-600`} />
                      ) : (
                        <Eye className={`h-4 w-4 text-blue-600`} />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{action.ruleName}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(action.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
