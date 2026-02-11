'use client'

import { useState } from 'react'
import {
  Shield,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Package,
  ArrowRight,
  FileText,
  RefreshCw,
} from 'lucide-react'

export default function PolicyCheckPage() {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    bulletPoints: '',
    costPrice: '',
    sellPrice: '',
  })
  const [result, setResult] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/policy-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          bulletPoints: formData.bulletPoints.split('\n').filter(Boolean),
          costPrice: parseFloat(formData.costPrice) || 0,
          sellPrice: parseFloat(formData.sellPrice) || 0,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Policy check failed')
      }
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const getDecisionConfig = (decision: string) => {
    switch (decision) {
      case 'approved':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'Approved',
        }
      case 'review_required':
        return {
          icon: AlertTriangle,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'Review Required',
        }
      case 'blocked':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'Blocked',
        }
      default:
        return {
          icon: Info,
          color: 'text-gray-600',
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'Unknown',
        }
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'block':
        return 'bg-red-100 text-red-700'
      case 'warning':
        return 'bg-amber-100 text-amber-700'
      case 'info':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Policy Compliance Check</h1>
        <p className="text-gray-500 mt-1">
          Verify products against eBay policies before listing
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-8 flex items-start">
        <Shield className="h-5 w-5 text-indigo-600 mr-3 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-indigo-800">Protect your eBay account</p>
          <p className="text-sm text-indigo-700 mt-1">
            Our policy checker scans for VeRO brand violations, prohibited words, restricted categories,
            and pricing issues to keep your account safe.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Details</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g., Wireless Bluetooth Earbuds with Charging Case"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Product description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bullet Points (one per line)
              </label>
              <textarea
                value={formData.bulletPoints}
                onChange={(e) => setFormData({ ...formData, bulletPoints: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="High quality audio&#10;30-hour battery life&#10;Comfortable fit"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cost Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.costPrice}
                  onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sell Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sellPrice}
                  onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !formData.title}
              className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  Check Policy Compliance
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="space-y-6">
          {result ? (
            <>
              {/* Decision Card */}
              <div className={`rounded-xl border p-6 ${getDecisionConfig(result.decision).bg} ${getDecisionConfig(result.decision).border}`}>
                <div className="flex items-center mb-4">
                  {(() => {
                    const config = getDecisionConfig(result.decision)
                    const Icon = config.icon
                    return (
                      <>
                        <Icon className={`h-8 w-8 ${config.color}`} />
                        <div className="ml-4">
                          <h3 className={`text-xl font-bold ${config.color}`}>{config.text}</h3>
                          <p className="text-sm text-gray-600">Compliance Score: {result.score}/100</p>
                        </div>
                      </>
                    )
                  })()}
                </div>
                <div className="w-full h-3 bg-white rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      result.score >= 80 ? 'bg-green-500' : result.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${result.score}%` }}
                  />
                </div>
              </div>

              {/* Flags */}
              {result.flags && result.flags.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Issues Found</h3>
                  <div className="space-y-3">
                    {result.flags.map((flag: any, index: number) => (
                      <div key={index} className="flex items-start p-3 bg-gray-50 rounded-lg">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${getSeverityColor(flag.severity)}`}>
                          {flag.severity.toUpperCase()}
                        </span>
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900">{flag.type}</p>
                          <p className="text-sm text-gray-500 mt-0.5">{flag.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {result.recommendations && result.recommendations.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h3>
                  <ul className="space-y-2">
                    {result.recommendations.map((rec: string, index: number) => (
                      <li key={index} className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-indigo-600 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <Shield className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Results Yet</h3>
              <p className="text-sm text-gray-500">
                Enter product details and click &quot;Check Policy Compliance&quot; to see results
              </p>
            </div>
          )}

          {/* Quick Tips */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-6 text-white">
            <h3 className="text-lg font-semibold mb-4">Policy Quick Tips</h3>
            <ul className="space-y-3">
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-sm text-gray-300">Avoid mentioning brand names unless you&apos;re an authorized seller</span>
              </li>
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-sm text-gray-300">Never use words like &quot;authentic&quot;, &quot;genuine&quot;, or &quot;OEM&quot; for non-branded items</span>
              </li>
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-sm text-gray-300">Maintain at least 20% profit margin for sustainable business</span>
              </li>
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-sm text-gray-300">Check restricted categories before listing health or safety products</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
