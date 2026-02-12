'use client'

import { useState, useEffect } from 'react'

interface BottleneckReport {
  timestamp: string
  overallScore: number
  readyForScale: boolean
  criticalIssues: Issue[]
  warnings: Issue[]
  recommendations: Recommendation[]
  capacityAnalysis: CapacityAnalysis
  performanceMetrics: PerformanceMetrics
  scalabilityAssessment: ScalabilityAssessment
  costProjections: CostProjection
  revenueProjections: RevenueProjection
}

interface Issue {
  id: string
  category: string
  severity: string
  title: string
  description: string
  impact: string
  suggestedFix: string
  effortEstimate: string
  priorityScore: number
}

interface Recommendation {
  id: string
  category: string
  title: string
  description: string
  benefit: string
  implementation: string
  priority: string
  estimatedROI: string
}

interface CapacityAnalysis {
  currentUsers: number
  maxUsersAtCurrentScale: number
  currentStores: number
  maxStoresAtCurrentScale: number
  databaseUtilization: number
  bottleneckComponents: string[]
}

interface PerformanceMetrics {
  avgAPIResponseTime: number
  p95APIResponseTime: number
  errorRate: number
  uptime: number
}

interface ScalabilityAssessment {
  horizontalScalingReady: boolean
  cachingImplemented: boolean
  queueSystemAdequate: boolean
  monitoringAdequate: boolean
  scores: Record<string, number>
}

interface CostProjection {
  current: { monthly: number; perUser: number }
  at1000Users: { monthly: number; perUser: number }
  at5000Users: { monthly: number; perUser: number }
  at10000Users: { monthly: number; perUser: number }
}

interface RevenueProjection {
  currentMRR: number
  projectedMRRAt1000Users: number
  projectedMRRAt5000Users: number
  projectedARR: number
  ltvCacRatio: number
}

interface AcquisitionAssessment {
  score: number
  readyForAcquisition: boolean
  valuationEstimate: number
  strengths: string[]
  gaps: string[]
  actionItems: string[]
}

export default function GrowthAnalysisDashboard() {
  const [report, setReport] = useState<BottleneckReport | null>(null)
  const [acquisition, setAcquisition] = useState<AcquisitionAssessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'capacity' | 'acquisition'>('overview')

  useEffect(() => {
    fetchAnalysis()
  }, [])

  const fetchAnalysis = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/system/growth?action=full')
      const data = await res.json()

      if (data.success) {
        setReport(data.bottlenecks)
        setAcquisition(data.acquisition)
      }
    } catch (error) {
      console.error('Failed to fetch analysis:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Analyzing System for Growth...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 to-purple-900 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Growth & Scalability Analysis</h1>
              <p className="text-gray-300">Target: 5,000+ Users | $50M+ Acquisition</p>
            </div>
            <div className="flex gap-4 items-center">
              {report && (
                <div className={`text-2xl font-bold px-4 py-2 rounded-lg ${
                  report.overallScore >= 70 ? 'bg-green-900/50 text-green-400' :
                  report.overallScore >= 50 ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-red-900/50 text-red-400'
                }`}>
                  Score: {report.overallScore}/100
                </div>
              )}
              <button
                onClick={fetchAnalysis}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Re-analyze
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-6">
            {(['overview', 'issues', 'capacity', 'acquisition'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-lg capitalize font-medium ${
                  activeTab === tab
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800/50 hover:bg-gray-700/50 text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'overview' && report && (
          <div className="space-y-6">
            {/* Status Banner */}
            <div className={`p-6 rounded-lg ${
              report.readyForScale
                ? 'bg-green-900/30 border border-green-700'
                : 'bg-yellow-900/30 border border-yellow-700'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`text-4xl ${report.readyForScale ? 'text-green-400' : 'text-yellow-400'}`}>
                  {report.readyForScale ? '✓' : '!'}
                </div>
                <div>
                  <h2 className="text-xl font-bold">
                    {report.readyForScale
                      ? 'System Ready for Scale'
                      : 'System Needs Improvements Before Scale'}
                  </h2>
                  <p className="text-gray-300">
                    {report.criticalIssues.length} critical issues, {report.warnings.length} warnings
                  </p>
                </div>
              </div>
            </div>

            {/* Scalability Scores */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Scalability Scores</h3>
              <div className="grid grid-cols-4 gap-4">
                {Object.entries(report.scalabilityAssessment.scores).map(([key, value]) => (
                  <div key={key} className="bg-gray-700 rounded-lg p-4">
                    <div className="text-gray-400 capitalize text-sm">{key}</div>
                    <div className={`text-2xl font-bold ${
                      value >= 70 ? 'text-green-400' :
                      value >= 50 ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {value}%
                    </div>
                    <div className="mt-2 bg-gray-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          value >= 70 ? 'bg-green-500' :
                          value >= 50 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-4 gap-4">
              <MetricCard
                label="API Response Time"
                value={`${report.performanceMetrics.avgAPIResponseTime}ms`}
                target="< 200ms"
                good={report.performanceMetrics.avgAPIResponseTime < 200}
              />
              <MetricCard
                label="P95 Response"
                value={`${report.performanceMetrics.p95APIResponseTime}ms`}
                target="< 500ms"
                good={report.performanceMetrics.p95APIResponseTime < 500}
              />
              <MetricCard
                label="Error Rate"
                value={`${report.performanceMetrics.errorRate}%`}
                target="< 1%"
                good={report.performanceMetrics.errorRate < 1}
              />
              <MetricCard
                label="Uptime"
                value={`${report.performanceMetrics.uptime}%`}
                target="> 99.9%"
                good={report.performanceMetrics.uptime > 99.9}
              />
            </div>

            {/* Top Recommendations */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Priority Recommendations</h3>
              <div className="space-y-3">
                {report.recommendations.slice(0, 5).map(rec => (
                  <div key={rec.id} className="flex items-start gap-4 p-4 bg-gray-700 rounded-lg">
                    <PriorityBadge priority={rec.priority} />
                    <div className="flex-1">
                      <div className="font-medium">{rec.title}</div>
                      <div className="text-gray-400 text-sm">{rec.description}</div>
                      <div className="text-green-400 text-sm mt-1">{rec.estimatedROI}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'issues' && report && (
          <div className="space-y-6">
            {/* Critical Issues */}
            {report.criticalIssues.length > 0 && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-400 mb-4">
                  Critical Issues ({report.criticalIssues.length})
                </h3>
                <div className="space-y-4">
                  {report.criticalIssues.map(issue => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {report.warnings.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-yellow-400 mb-4">
                  Warnings ({report.warnings.length})
                </h3>
                <div className="space-y-4">
                  {report.warnings.map(issue => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))}
                </div>
              </div>
            )}

            {/* All Recommendations */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">All Recommendations</h3>
              <div className="space-y-3">
                {report.recommendations.map(rec => (
                  <div key={rec.id} className="p-4 bg-gray-700 rounded-lg">
                    <div className="flex items-start gap-4">
                      <PriorityBadge priority={rec.priority} />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div className="font-medium">{rec.title}</div>
                          <span className="text-xs bg-gray-600 px-2 py-1 rounded">{rec.category}</span>
                        </div>
                        <div className="text-gray-400 text-sm mt-1">{rec.description}</div>
                        <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Benefit: </span>
                            <span className="text-green-400">{rec.benefit}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">ROI: </span>
                            <span className="text-blue-400">{rec.estimatedROI}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-gray-400 text-xs">
                          Implementation: {rec.implementation}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'capacity' && report && (
          <div className="space-y-6">
            {/* Capacity Overview */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Current Capacity</h3>
                <div className="space-y-4">
                  <CapacityBar
                    label="Users"
                    current={report.capacityAnalysis.currentUsers}
                    max={report.capacityAnalysis.maxUsersAtCurrentScale}
                  />
                  <CapacityBar
                    label="Stores"
                    current={report.capacityAnalysis.currentStores}
                    max={report.capacityAnalysis.maxStoresAtCurrentScale}
                  />
                  <CapacityBar
                    label="Database"
                    current={report.capacityAnalysis.databaseUtilization}
                    max={100}
                    unit="%"
                  />
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Bottleneck Components</h3>
                <ul className="space-y-2">
                  {report.capacityAnalysis.bottleneckComponents.map((component, i) => (
                    <li key={i} className="flex items-center gap-2 text-yellow-400">
                      <span>!</span>
                      {component}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Cost Projections */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Cost Projections</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left p-2">Scale</th>
                      <th className="text-right p-2">Monthly Cost</th>
                      <th className="text-right p-2">Per User</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-700">
                      <td className="p-2">Current</td>
                      <td className="text-right p-2">${report.costProjections.current.monthly.toLocaleString()}</td>
                      <td className="text-right p-2">${report.costProjections.current.perUser}</td>
                    </tr>
                    <tr className="border-t border-gray-700">
                      <td className="p-2">At 1,000 Users</td>
                      <td className="text-right p-2">${report.costProjections.at1000Users.monthly.toLocaleString()}</td>
                      <td className="text-right p-2">${report.costProjections.at1000Users.perUser}</td>
                    </tr>
                    <tr className="border-t border-gray-700">
                      <td className="p-2">At 5,000 Users</td>
                      <td className="text-right p-2">${report.costProjections.at5000Users.monthly.toLocaleString()}</td>
                      <td className="text-right p-2">${report.costProjections.at5000Users.perUser}</td>
                    </tr>
                    <tr className="border-t border-gray-700">
                      <td className="p-2">At 10,000 Users</td>
                      <td className="text-right p-2">${report.costProjections.at10000Users.monthly.toLocaleString()}</td>
                      <td className="text-right p-2">${report.costProjections.at10000Users.perUser}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Revenue Projections */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Revenue Projections</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-700 p-4 rounded-lg">
                  <div className="text-gray-400 text-sm">Current MRR</div>
                  <div className="text-2xl font-bold text-green-400">
                    ${report.revenueProjections.currentMRR.toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <div className="text-gray-400 text-sm">MRR at 1k Users</div>
                  <div className="text-2xl font-bold">
                    ${report.revenueProjections.projectedMRRAt1000Users.toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <div className="text-gray-400 text-sm">MRR at 5k Users</div>
                  <div className="text-2xl font-bold">
                    ${report.revenueProjections.projectedMRRAt5000Users.toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <div className="text-gray-400 text-sm">Projected ARR</div>
                  <div className="text-2xl font-bold text-purple-400">
                    ${(report.revenueProjections.projectedARR / 1000000).toFixed(1)}M
                  </div>
                </div>
              </div>
              <div className="mt-4 p-4 bg-gray-700 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-gray-400">LTV:CAC Ratio: </span>
                    <span className={`text-xl font-bold ${
                      report.revenueProjections.ltvCacRatio >= 3 ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      {report.revenueProjections.ltvCacRatio.toFixed(1)}x
                    </span>
                  </div>
                  <div className="text-gray-400 text-sm">
                    Target: 3x+ for healthy SaaS
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'acquisition' && acquisition && (
          <div className="space-y-6">
            {/* Acquisition Score */}
            <div className={`p-8 rounded-lg ${
              acquisition.readyForAcquisition
                ? 'bg-gradient-to-r from-green-900/50 to-blue-900/50 border border-green-700'
                : 'bg-gradient-to-r from-yellow-900/50 to-orange-900/50 border border-yellow-700'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-300">Acquisition Readiness Score</div>
                  <div className="text-5xl font-bold mt-2">{acquisition.score}/100</div>
                  <div className={`mt-2 ${acquisition.readyForAcquisition ? 'text-green-400' : 'text-yellow-400'}`}>
                    {acquisition.readyForAcquisition
                      ? 'Ready for acquisition discussions'
                      : 'Additional work needed before acquisition'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-gray-300">Estimated Valuation</div>
                  <div className="text-5xl font-bold text-green-400 mt-2">
                    ${(acquisition.valuationEstimate / 1000000).toFixed(1)}M
                  </div>
                  <div className="text-gray-400 mt-2">
                    Based on 12x ARR multiple
                  </div>
                </div>
              </div>
            </div>

            {/* Strengths & Gaps */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-green-900/20 border border-green-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-green-400 mb-4">Strengths</h3>
                <ul className="space-y-2">
                  {acquisition.strengths.map((strength, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-400 mb-4">Gaps to Address</h3>
                <ul className="space-y-2">
                  {acquisition.gaps.map((gap, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-400">!</span>
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Action Items */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Action Items for Acquisition</h3>
              <div className="space-y-3">
                {acquisition.actionItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 bg-gray-700 rounded-lg">
                    <span className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Target Timeline */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Target: AutoDS Acquisition at $50M+ by September 2026</h3>
              <div className="space-y-4">
                <TimelineItem
                  quarter="Q1 2026"
                  target="500 Users"
                  mrr="$100k MRR"
                />
                <TimelineItem
                  quarter="Q2 2026"
                  target="1,500 Users"
                  mrr="$375k MRR"
                />
                <TimelineItem
                  quarter="Q3 2026"
                  target="3,500 Users"
                  mrr="$875k MRR"
                  highlight
                />
                <TimelineItem
                  quarter="Q4 2026"
                  target="5,000+ Users"
                  mrr="$1.5M+ MRR"
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function MetricCard({ label, value, target, good }: {
  label: string
  value: string
  target: string
  good: boolean
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-gray-400 text-sm">{label}</div>
      <div className={`text-2xl font-bold ${good ? 'text-green-400' : 'text-yellow-400'}`}>
        {value}
      </div>
      <div className="text-gray-500 text-sm">Target: {target}</div>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    immediate: 'bg-red-600',
    short_term: 'bg-orange-600',
    medium_term: 'bg-yellow-600',
    long_term: 'bg-blue-600'
  }

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[priority] || colors.medium_term}`}>
      {priority.replace('_', ' ')}
    </span>
  )
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex justify-between items-start">
        <div className="font-medium">{issue.title}</div>
        <span className={`px-2 py-1 rounded text-xs ${
          issue.severity === 'critical' ? 'bg-red-600' :
          issue.severity === 'high' ? 'bg-orange-600' :
          'bg-yellow-600'
        }`}>
          {issue.severity}
        </span>
      </div>
      <p className="text-gray-400 text-sm mt-1">{issue.description}</p>
      <div className="mt-2 text-sm">
        <span className="text-gray-500">Impact: </span>
        <span className="text-red-400">{issue.impact}</span>
      </div>
      <div className="mt-2 text-sm">
        <span className="text-gray-500">Fix: </span>
        <span className="text-green-400">{issue.suggestedFix}</span>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Effort: {issue.effortEstimate} | Priority Score: {issue.priorityScore}/10
      </div>
    </div>
  )
}

function CapacityBar({ label, current, max, unit = '' }: {
  label: string
  current: number
  max: number
  unit?: string
}) {
  const percent = (current / max) * 100

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span>{current.toLocaleString()}{unit} / {max.toLocaleString()}{unit}</span>
      </div>
      <div className="bg-gray-700 rounded-full h-3">
        <div
          className={`h-3 rounded-full ${
            percent >= 80 ? 'bg-red-500' :
            percent >= 60 ? 'bg-yellow-500' :
            'bg-green-500'
          }`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

function TimelineItem({ quarter, target, mrr, highlight }: {
  quarter: string
  target: string
  mrr: string
  highlight?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-lg ${
      highlight ? 'bg-purple-900/30 border border-purple-700' : 'bg-gray-700'
    }`}>
      <div className="w-24 font-bold">{quarter}</div>
      <div className="flex-1">{target}</div>
      <div className="text-green-400 font-bold">{mrr}</div>
      {highlight && <span className="text-purple-400 text-sm">Acquisition Target</span>}
    </div>
  )
}
