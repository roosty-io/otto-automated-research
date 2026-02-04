'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

interface Props {
  pattern?: {
    id: string
    category: string
    subcategory: string | null
    use_case: string | null
    price_band: string
    is_active: boolean
    is_validated: boolean
  }
}

const priceBands = [
  '$0-$25',
  '$25-$50',
  '$50-$100',
  '$100-$200',
  '$200-$500',
  '$500+',
]

const commonCategories = [
  'Electronics',
  'Home & Garden',
  'Clothing & Accessories',
  'Sports & Outdoors',
  'Toys & Games',
  'Health & Beauty',
  'Automotive',
  'Office Supplies',
  'Pet Supplies',
  'Kitchen',
]

export function PatternForm({ pattern }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    category: pattern?.category || '',
    subcategory: pattern?.subcategory || '',
    use_case: pattern?.use_case || '',
    price_band: pattern?.price_band || '$25-$50',
    is_active: pattern?.is_active ?? true,
    is_validated: pattern?.is_validated ?? false,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const url = pattern ? `/api/patterns/${pattern.id}` : '/api/patterns'
      const method = pattern ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          subcategory: formData.subcategory || null,
          use_case: formData.use_case || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save pattern')
      }

      router.push(`/products/patterns/${data.id}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Category */}
      <div>
        <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
          Category *
        </label>
        <input
          type="text"
          id="category"
          required
          list="categories"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          placeholder="e.g., Electronics, Home & Garden"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <datalist id="categories">
          {commonCategories.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>
      </div>

      {/* Subcategory */}
      <div>
        <label htmlFor="subcategory" className="block text-sm font-medium text-gray-700 mb-1">
          Subcategory
        </label>
        <input
          type="text"
          id="subcategory"
          value={formData.subcategory}
          onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
          placeholder="e.g., Wireless Headphones, Kitchen Appliances"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Use Case */}
      <div>
        <label htmlFor="use_case" className="block text-sm font-medium text-gray-700 mb-1">
          Use Case
        </label>
        <input
          type="text"
          id="use_case"
          value={formData.use_case}
          onChange={(e) => setFormData({ ...formData, use_case: e.target.value })}
          placeholder="e.g., Gaming, Office, Travel"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="mt-1 text-sm text-gray-500">
          Describes the primary use case or target audience
        </p>
      </div>

      {/* Price Band */}
      <div>
        <label htmlFor="price_band" className="block text-sm font-medium text-gray-700 mb-1">
          Price Band *
        </label>
        <select
          id="price_band"
          required
          value={formData.price_band}
          onChange={(e) => setFormData({ ...formData, price_band: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          {priceBands.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </select>
      </div>

      {/* Status Toggles */}
      {pattern && (
        <div className="space-y-4">
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Pattern is active</span>
            </label>
            <p className="mt-1 text-sm text-gray-500 ml-6">
              Inactive patterns won&apos;t accept new SKUs
            </p>
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_validated}
                onChange={(e) => setFormData({ ...formData, is_validated: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Pattern is validated</span>
            </label>
            <p className="mt-1 text-sm text-gray-500 ml-6">
              Validated patterns have proven performance
            </p>
          </div>
        </div>
      )}

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
          {loading ? 'Saving...' : pattern ? 'Save Changes' : 'Create Pattern'}
        </button>
      </div>
    </form>
  )
}
