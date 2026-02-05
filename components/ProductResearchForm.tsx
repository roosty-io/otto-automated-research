'use client'

import { useState } from 'react'
import { Loader2, Search, Plus, DollarSign, Package, Tag } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ProductData {
  title: string
  description: string
  bullet_points: string[]
  cost_price: number
  sell_price: number
  pattern_id: string
  // For display only (not stored in DB)
  asin_reference: string
}

interface Pattern {
  id: string
  category: string
  subcategory: string
}

export function ProductResearchForm() {
  const router = useRouter()
  const [step, setStep] = useState<'input' | 'details' | 'saving'>('input')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [amazonInput, setAmazonInput] = useState('')
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [product, setProduct] = useState<ProductData>({
    title: '',
    description: '',
    bullet_points: ['', '', '', '', ''],
    cost_price: 0,
    sell_price: 0,
    pattern_id: '',
    asin_reference: '',
  })

  // Extract ASIN from Amazon URL or direct input
  function extractAsin(input: string): string | null {
    const trimmed = input.trim()

    // Direct ASIN (10 alphanumeric characters starting with B)
    if (/^B[A-Z0-9]{9}$/i.test(trimmed)) {
      return trimmed.toUpperCase()
    }

    // Amazon URL patterns
    const patterns = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/ASIN\/([A-Z0-9]{10})/i,
      /amazon\.[a-z.]+\/.*?([A-Z0-9]{10})/i,
    ]

    for (const pattern of patterns) {
      const match = trimmed.match(pattern)
      if (match) return match[1].toUpperCase()
    }

    return null
  }

  async function handleLookup() {
    const asin = extractAsin(amazonInput)

    if (!asin) {
      setError('Please enter a valid ASIN or Amazon product URL')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Fetch patterns for dropdown
      const patternsRes = await fetch('/api/patterns')
      if (patternsRes.ok) {
        const patternsData = await patternsRes.json()
        setPatterns(patternsData)
      }

      // For now, we'll just set up the form with the ASIN reference
      // In production, you would call an Amazon API or scraping service
      setProduct(prev => ({
        ...prev,
        asin_reference: asin,
      }))

      setStep('details')
    } catch (err) {
      setError('Failed to lookup product. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleSkipLookup() {
    // Go directly to manual entry
    setLoading(true)
    fetch('/api/patterns')
      .then(res => res.json())
      .then(data => setPatterns(data))
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        setStep('details')
      })
  }

  function updateBulletPoint(index: number, value: string) {
    setProduct(prev => ({
      ...prev,
      bullet_points: prev.bullet_points.map((bp, i) => i === index ? value : bp),
    }))
  }

  function calculateProfit(): { profit: number; margin: number } {
    const profit = product.sell_price - product.cost_price
    const margin = product.sell_price > 0 ? (profit / product.sell_price) * 100 : 0
    return { profit, margin }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!product.title.trim()) {
      setError('Title is required')
      return
    }
    if (product.cost_price <= 0) {
      setError('Cost price must be greater than 0')
      return
    }
    if (product.sell_price <= 0) {
      setError('Sell price must be greater than 0')
      return
    }

    setStep('saving')
    setLoading(true)
    setError('')

    try {
      // Generate normalized_product_id from title
      const normalizedId = product.title.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) + '-' + Date.now().toString(36)

      // Generate sku_code
      const skuCode = 'SKU-' + Date.now().toString(36).toUpperCase()

      const skuData = {
        normalized_product_id: normalizedId,
        sku_code: skuCode,
        title: product.title.trim(),
        description: product.description.trim() || null,
        bullet_points: product.bullet_points.filter(bp => bp.trim()),
        cost_price: product.cost_price,
        sell_price: product.sell_price,
        pattern_id: product.pattern_id || null,
        status: 'ready',
      }

      const res = await fetch('/api/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skuData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create SKU')
      }

      const newSku = await res.json()
      router.push(`/products/skus/${newSku.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product')
      setStep('details')
    } finally {
      setLoading(false)
    }
  }

  const { profit, margin } = calculateProfit()

  if (step === 'input') {
    return (
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amazon ASIN or Product URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={amazonInput}
              onChange={(e) => setAmazonInput(e.target.value)}
              placeholder="B0XXXXXXXXX or https://amazon.com/dp/..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleLookup}
              disabled={loading || !amazonInput.trim()}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Lookup
                </>
              )}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>

        <button
          onClick={handleSkipLookup}
          disabled={loading}
          className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4 mr-2" />
          Enter Product Manually
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {product.asin_reference && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
          <div className="flex items-center text-sm text-gray-600">
            <Package className="h-4 w-4 mr-2" />
            ASIN Reference: <span className="font-mono ml-1">{product.asin_reference}</span>
            <a
              href={`https://www.amazon.com/dp/${product.asin_reference}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-blue-600 hover:underline"
            >
              View on Amazon
            </a>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={product.title}
          onChange={(e) => setProduct(prev => ({ ...prev, title: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Product title for eBay listing"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={product.description}
          onChange={(e) => setProduct(prev => ({ ...prev, description: e.target.value }))}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Product description..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Bullet Points
        </label>
        <div className="space-y-2">
          {product.bullet_points.map((bp, index) => (
            <input
              key={index}
              type="text"
              value={bp}
              onChange={(e) => updateBulletPoint(index, e.target.value)}
              placeholder={`Bullet point ${index + 1}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cost Price <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="number"
              step="0.01"
              min="0"
              value={product.cost_price || ''}
              onChange={(e) => setProduct(prev => ({ ...prev, cost_price: parseFloat(e.target.value) || 0 }))}
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sell Price <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="number"
              step="0.01"
              min="0"
              value={product.sell_price || ''}
              onChange={(e) => setProduct(prev => ({ ...prev, sell_price: parseFloat(e.target.value) || 0 }))}
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {(product.cost_price > 0 || product.sell_price > 0) && (
        <div className={`p-3 rounded-md ${margin >= 30 ? 'bg-green-50 border border-green-200' : margin >= 20 ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Profit:</span>
            <span className={`font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${profit.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-600">Margin:</span>
            <span className={`font-medium ${margin >= 30 ? 'text-green-600' : margin >= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
              {margin.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          <Tag className="inline h-4 w-4 mr-1" />
          Pattern (Optional)
        </label>
        <select
          value={product.pattern_id}
          onChange={(e) => setProduct(prev => ({ ...prev, pattern_id: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">No pattern</option>
          {patterns.map(p => (
            <option key={p.id} value={p.id}>
              {p.category} {p.subcategory ? `> ${p.subcategory}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={() => setStep('input')}
          disabled={loading}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating SKU...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Create SKU
            </>
          )}
        </button>
      </div>
    </form>
  )
}
