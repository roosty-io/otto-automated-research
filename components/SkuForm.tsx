'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, DollarSign } from 'lucide-react'

interface Pattern {
  id: string
  category: string
  subcategory: string | null
  price_band: string
}

interface Props {
  patterns: Pattern[]
  sku?: {
    id: string
    pattern_id: string | null
    sku_code: string
    title: string
    description: string | null
    bullet_points: string[]
    cost_price: number
    sell_price: number
    status: string
  }
  preselectedPatternId?: string
}

export function SkuForm({ patterns, sku, preselectedPatternId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    pattern_id: sku?.pattern_id || preselectedPatternId || '',
    sku_code: sku?.sku_code || '',
    title: sku?.title || '',
    description: sku?.description || '',
    bullet_points: sku?.bullet_points?.join('\n') || '',
    cost_price: sku?.cost_price?.toString() || '',
    sell_price: sku?.sell_price?.toString() || '',
    status: sku?.status || 'draft',
  })

  const costPrice = parseFloat(formData.cost_price) || 0
  const sellPrice = parseFloat(formData.sell_price) || 0
  const ebayFees = sellPrice * 0.13 // Approximate eBay fees
  const expectedProfit = sellPrice - costPrice - ebayFees
  const margin = sellPrice > 0 ? (expectedProfit / sellPrice) * 100 : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const url = sku ? `/api/skus/${sku.id}` : '/api/skus'
      const method = sku ? 'PUT' : 'POST'

      const bulletPoints = formData.bullet_points
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b.length > 0)

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern_id: formData.pattern_id || null,
          sku_code: formData.sku_code,
          title: formData.title,
          description: formData.description || null,
          bullet_points: bulletPoints,
          cost_price: parseFloat(formData.cost_price),
          sell_price: parseFloat(formData.sell_price),
          status: formData.status,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save SKU')
      }

      router.push(`/products/skus/${data.id}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Generate SKU code from title
  function generateSkuCode() {
    if (!formData.title) return
    const code = formData.title
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 20)
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    setFormData({ ...formData, sku_code: `${code}-${suffix}` })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Pattern Selection */}
      <div>
        <label htmlFor="pattern_id" className="block text-sm font-medium text-gray-700 mb-1">
          Pattern
        </label>
        <select
          id="pattern_id"
          value={formData.pattern_id}
          onChange={(e) => setFormData({ ...formData, pattern_id: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">No pattern (unassigned)</option>
          {patterns.map((pattern) => (
            <option key={pattern.id} value={pattern.id}>
              {pattern.category}
              {pattern.subcategory && ` / ${pattern.subcategory}`} ({pattern.price_band})
            </option>
          ))}
        </select>
      </div>

      {/* SKU Code */}
      <div>
        <label htmlFor="sku_code" className="block text-sm font-medium text-gray-700 mb-1">
          SKU Code *
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="sku_code"
            required
            value={formData.sku_code}
            onChange={(e) => setFormData({ ...formData, sku_code: e.target.value.toUpperCase() })}
            placeholder="e.g., ELEC-HEADPHONE-A1B2"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            disabled={!!sku} // Can't change SKU code after creation
          />
          {!sku && (
            <button
              type="button"
              onClick={generateSkuCode}
              className="px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50"
            >
              Generate
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Title *
        </label>
        <input
          type="text"
          id="title"
          required
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Product title for eBay listing"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="mt-1 text-sm text-gray-500">
          {formData.title.length}/80 characters (eBay limit)
        </p>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="description"
          rows={4}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Detailed product description..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Bullet Points */}
      <div>
        <label htmlFor="bullet_points" className="block text-sm font-medium text-gray-700 mb-1">
          Bullet Points
        </label>
        <textarea
          id="bullet_points"
          rows={5}
          value={formData.bullet_points}
          onChange={(e) => setFormData({ ...formData, bullet_points: e.target.value })}
          placeholder="Enter each bullet point on a new line..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="mt-1 text-sm text-gray-500">One bullet point per line</p>
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="cost_price" className="block text-sm font-medium text-gray-700 mb-1">
            Cost Price *
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="number"
              id="cost_price"
              required
              min="0"
              step="0.01"
              value={formData.cost_price}
              onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
              placeholder="0.00"
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="sell_price" className="block text-sm font-medium text-gray-700 mb-1">
            Sell Price *
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="number"
              id="sell_price"
              required
              min="0"
              step="0.01"
              value={formData.sell_price}
              onChange={(e) => setFormData({ ...formData, sell_price: e.target.value })}
              placeholder="0.00"
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Profit Calculator */}
      {(costPrice > 0 || sellPrice > 0) && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Profit Calculation</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Cost</p>
              <p className="font-medium">${costPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-gray-500">eBay Fees (~13%)</p>
              <p className="font-medium text-red-600">-${ebayFees.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-gray-500">Expected Profit</p>
              <p className={`font-medium ${expectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${expectedProfit.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Margin</p>
              <p className={`font-medium ${margin >= 20 ? 'text-green-600' : margin >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                {margin.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
          Status
        </label>
        <select
          id="status"
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="draft">Draft - Not ready for distribution</option>
          <option value="ready">Ready - Available for store assignment</option>
          <option value="distributed">Distributed - Assigned to max stores</option>
          <option value="exhausted">Exhausted - No longer available</option>
        </select>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-4 pt-4 border-t">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {loading ? 'Saving...' : sku ? 'Save Changes' : 'Create SKU'}
        </button>
      </div>
    </form>
  )
}
