'use client'

import { useState, useEffect } from 'react'

interface ComplianceStats {
  totalChecks: number
  passed: number
  blocked: number
  reviewRequired: number
  topViolations: Array<{ type: string; count: number }>
  averageScore: number
  checksByDay: Array<{ date: string; count: number; passRate: number }>
}

interface ComplianceHistory {
  id: string
  skuId: string | null
  storeId: string | null
  checkType: string
  status: string
  details: Record<string, unknown>
  checkedAt: string
}

export default function ComplianceDashboard({ storeId }: { storeId?: string }) {
  const [stats, setStats] = useState<ComplianceStats | null>(null)
  const [history, setHistory] = useState<ComplianceHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'test'>('overview')
  const [testTitle, setTestTitle] = useState('')
  const [testDescription, setTestDescription] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    loadData()
  }, [storeId])

  const loadData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (storeId) params.set('storeId', storeId)

      const [statsRes, historyRes] = await Promise.all([
        fetch(`/api/compliance?action=stats&${params}`),
        fetch(`/api/compliance?action=history&${params}&limit=20`)
      ])

      const statsData = await statsRes.json()
      const historyData = await historyRes.json()

      if (statsData.success) setStats(statsData.stats)
      if (historyData.success) setHistory(historyData.history)
    } catch (err) {
      console.error('Failed to load compliance data:', err)
    } finally {
      setLoading(false)
    }
  }

  const runTest = async () => {
    if (!testTitle.trim()) return

    try {
      setTesting(true)
      setTestResult(null)

      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check',
          title: testTitle,
          description: testDescription,
          storeId
        })
      })

      const data = await res.json()
      if (data.success) {
        setTestResult(data.result)
      }
    } catch (err) {
      console.error('Test failed:', err)
    } finally {
      setTesting(false)
    }
  }

  const sanitizeTitle = async () => {
    if (!testTitle.trim()) return

    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sanitize',
          title: testTitle
        })
      })

      const data = await res.json()
      if (data.success && data.sanitized !== testTitle) {
        setTestTitle(data.sanitized)
      }
    } catch (err) {
      console.error('Sanitize failed:', err)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'text-green-600 bg-green-50'
      case 'failed': return 'text-red-600 bg-red-50'
      case 'warning': return 'text-yellow-600 bg-yellow-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'safe': return 'text-green-600'
      case 'low_risk': return 'text-blue-600'
      case 'medium_risk': return 'text-yellow-600'
      case 'high_risk': return 'text-orange-600'
      case 'critical': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getViolationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      vero_brand: 'VeRO Brand',
      blacklisted_word: 'Blacklisted Word',
      restricted_category: 'Restricted Category',
      title_format: 'Title Format',
      price_issue: 'Price Issue',
      price_gouging: 'Price Gouging',
      low_margin: 'Low Margin'
    }
    return labels[type] || type
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-sm text-gray-500">Loading compliance data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'history', label: 'Check History' },
            { id: 'test', label: 'Test Compliance' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Total Checks</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalChecks.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Passed</p>
              <p className="text-2xl font-bold text-green-600">{stats.passed.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">
                {stats.totalChecks > 0 ? ((stats.passed / stats.totalChecks) * 100).toFixed(1) : 0}%
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Blocked</p>
              <p className="text-2xl font-bold text-red-600">{stats.blocked.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">
                {stats.totalChecks > 0 ? ((stats.blocked / stats.totalChecks) * 100).toFixed(1) : 0}%
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Avg. Score</p>
              <p className="text-2xl font-bold text-blue-600">{stats.averageScore.toFixed(0)}</p>
              <p className="text-xs text-gray-400 mt-1">out of 100</p>
            </div>
          </div>

          {/* Top Violations */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Violations</h3>
            {stats.topViolations.length === 0 ? (
              <p className="text-gray-500 text-sm">No violations recorded</p>
            ) : (
              <div className="space-y-3">
                {stats.topViolations.slice(0, 5).map((v, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{getViolationTypeLabel(v.type)}</span>
                    <div className="flex items-center">
                      <div className="w-32 bg-gray-200 rounded-full h-2 mr-3">
                        <div
                          className="bg-red-500 h-2 rounded-full"
                          style={{
                            width: `${Math.min(100, (v.count / (stats.topViolations[0]?.count || 1)) * 100)}%`
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-12 text-right">{v.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pass Rate by Day */}
          {stats.checksByDay.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Pass Rate</h3>
              <div className="flex items-end space-x-1 h-32">
                {stats.checksByDay.slice(-14).map((day, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-green-500 rounded-t"
                      style={{ height: `${day.passRate}%` }}
                      title={`${day.date}: ${day.passRate.toFixed(1)}% (${day.count} checks)`}
                    ></div>
                    <span className="text-xs text-gray-400 mt-1 transform -rotate-45 origin-top-left">
                      {new Date(day.date).getDate()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk Level</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Violations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No compliance checks recorded yet
                  </td>
                </tr>
              ) : (
                history.map(check => (
                  <tr key={check.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(check.checkedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(check.status)}`}>
                        {check.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {(check.details as any)?.score || 'N/A'}
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium ${getRiskColor((check.details as any)?.riskLevel || 'unknown')}`}>
                      {((check.details as any)?.riskLevel || 'unknown').replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(check.details as any)?.violationCount || 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Test Tab */}
      {activeTab === 'test' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Listing Compliance</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={testTitle}
                    onChange={e => setTestTitle(e.target.value)}
                    placeholder="Enter product title to test..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={sanitizeTitle}
                    className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Auto-Fix
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={testDescription}
                  onChange={e => setTestDescription(e.target.value)}
                  placeholder="Enter product description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={runTest}
                disabled={testing || !testTitle.trim()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? 'Checking...' : 'Run Compliance Check'}
              </button>
            </div>
          </div>

          {/* Test Results */}
          {testResult && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Results</h3>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className={`p-3 rounded-lg ${testResult.passed ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className="text-sm text-gray-500">Decision</p>
                  <p className={`text-lg font-bold ${testResult.passed ? 'text-green-600' : 'text-red-600'}`}>
                    {testResult.decision.replace('_', ' ').toUpperCase()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50">
                  <p className="text-sm text-gray-500">Score</p>
                  <p className="text-lg font-bold text-gray-900">{testResult.score}/100</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50">
                  <p className="text-sm text-gray-500">Risk Level</p>
                  <p className={`text-lg font-bold ${getRiskColor(testResult.riskLevel)}`}>
                    {testResult.riskLevel.replace('_', ' ')}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50">
                  <p className="text-sm text-gray-500">Violations</p>
                  <p className="text-lg font-bold text-gray-900">{testResult.violations.length}</p>
                </div>
              </div>

              {/* Violations List */}
              {testResult.violations.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Violations Found</h4>
                  <div className="space-y-2">
                    {testResult.violations.map((v: any, idx: number) => (
                      <div key={idx} className="p-3 bg-red-50 rounded-lg border border-red-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-red-800">
                            {getViolationTypeLabel(v.type)}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            v.severity === 'critical' ? 'bg-red-200 text-red-800' :
                            v.severity === 'high' ? 'bg-orange-200 text-orange-800' :
                            v.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                            'bg-gray-200 text-gray-800'
                          }`}>
                            {v.severity}
                          </span>
                        </div>
                        <p className="text-sm text-red-700">{v.message}</p>
                        {v.matched && (
                          <p className="text-xs text-red-500 mt-1">Matched: "{v.matched}"</p>
                        )}
                        {v.actionRequired && (
                          <p className="text-xs text-gray-600 mt-1">Action: {v.actionRequired}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {testResult.recommendations.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Recommendations</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {testResult.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="text-sm text-gray-600">{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
