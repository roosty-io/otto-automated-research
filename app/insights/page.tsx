'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  Target,
  DollarSign,
  Users,
  Package,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  Sparkles,
  BarChart3,
  Layers,
  Zap,
  ChevronRight,
} from 'lucide-react'

interface Pattern {
  type: string
  name: string
  confidence: number
  productCount: number
  priority: 'high' | 'medium' | 'low'
  description?: string
  insights?: string[]
  actionItems?: string[]
  metrics?: {
    avgMargin?: number
    avgScore?: number
  }
}

interface InsightsData {
  patterns: Pattern[]
  summary: {
    totalPatternsFound: number
    highPriorityCount: number
    topOpportunities: string[]
    analysisDate: string
    productsAnalyzed: number
  }
}

const PATTERN_ICONS: Record<string, React.ElementType> = {
  trending_niche: TrendingUp,
  price_gap: DollarSign,
  low_competition: Target,
  brand_opportunity: Package,
  margin_opportunity: BarChart3,
  bundle_potential: Layers,
  demand_spike: Zap,
  seasonal: Sparkles,
}

const PATTERN_COLORS: Record<string, string> = {
  trending_niche: 'bg-blue-500',
  price_gap: 'bg-green-500',
  low_competition: 'bg-purple-500',
  brand_opportunity: 'bg-orange-500',
  margin_opportunity: 'bg-pink-500',
  bundle_potential: 'bg-indigo-500',
  demand_spike: 'bg-yellow-500',
  seasonal: 'bg-teal-500',
}

const PRIORITY_STYLES = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-gray-100 text-gray-700 border-gray-200',
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null)

  useEffect(() => {
    fetchInsights()
  }, [])

  async function fetchInsights() {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/processing/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minConfidence: 0.5,
          minProducts: 2,
          lookbackDays: 30,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch insights')
      }

      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Analyzing product data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-700 font-medium">Error loading insights</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={fetchInsights}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const patterns = data?.patterns || []
  const summary = data?.summary

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Research Insights</h1>
          <p className="text-gray-500 mt-1">AI-detected patterns and opportunities in your product data</p>
        </div>
        <button
          onClick={fetchInsights}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Analysis
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Lightbulb className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Patterns Found</p>
                <p className="text-2xl font-bold text-gray-900">{summary.totalPatternsFound}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Zap className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">High Priority</p>
                <p className="text-2xl font-bold text-gray-900">{summary.highPriorityCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Package className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Products Analyzed</p>
                <p className="text-2xl font-bold text-gray-900">{summary.productsAnalyzed}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Last Analysis</p>
                <p className="text-lg font-bold text-gray-900">
                  {new Date(summary.analysisDate).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Opportunities */}
      {summary?.topOpportunities && summary.topOpportunities.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg p-6 mb-8 text-white">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Top Opportunities
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {summary.topOpportunities.map((opportunity, index) => (
              <div
                key={index}
                className="bg-white/20 backdrop-blur-sm rounded-lg p-4 flex items-center gap-3"
              >
                <span className="text-2xl font-bold text-white/80">#{index + 1}</span>
                <span className="text-sm font-medium">{opportunity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {patterns.length === 0 ? (
          <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Lightbulb className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Patterns Detected Yet</h3>
            <p className="text-gray-500 mb-4">
              Add more products to your pipeline to enable pattern detection
            </p>
            <Link
              href="/research"
              className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Start Research <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </div>
        ) : (
          patterns.map((pattern, index) => {
            const Icon = PATTERN_ICONS[pattern.type] || Lightbulb
            const colorClass = PATTERN_COLORS[pattern.type] || 'bg-gray-500'

            return (
              <div
                key={index}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedPattern(selectedPattern?.name === pattern.name ? null : pattern)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-12 w-12 rounded-lg ${colorClass} flex items-center justify-center`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{pattern.name}</h3>
                      <p className="text-sm text-gray-500">{pattern.type.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full border ${PRIORITY_STYLES[pattern.priority]}`}>
                    {pattern.priority}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">{pattern.productCount}</p>
                    <p className="text-xs text-gray-500">Products</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">{pattern.confidence}%</p>
                    <p className="text-xs text-gray-500">Confidence</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">
                      {pattern.metrics?.avgMargin ? `${Math.round(pattern.metrics.avgMargin)}%` : '-'}
                    </p>
                    <p className="text-xs text-gray-500">Avg Margin</p>
                  </div>
                </div>

                {pattern.description && (
                  <p className="text-sm text-gray-600 mb-4">{pattern.description}</p>
                )}

                {/* Expanded Content */}
                {selectedPattern?.name === pattern.name && (
                  <div className="border-t border-gray-100 pt-4 mt-4">
                    {pattern.insights && pattern.insights.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Insights</h4>
                        <ul className="space-y-1">
                          {pattern.insights.map((insight, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                              <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                              {insight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {pattern.actionItems && pattern.actionItems.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Recommended Actions</h4>
                        <ul className="space-y-1">
                          {pattern.actionItems.map((action, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                              <Target className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    Click to {selectedPattern?.name === pattern.name ? 'collapse' : 'expand'}
                  </span>
                  <Link
                    href={`/products?pattern=${pattern.type}`}
                    className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Products <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
