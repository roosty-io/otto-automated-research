'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StoreTier, StoreWithTier } from '@/lib/database.types'
import { Loader2, Info } from 'lucide-react'

interface Props {
  store: StoreWithTier
  tiers: StoreTier[]
}

export function EditStoreForm({ store, tiers }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    store_name: store.store_name,
    ebay_username: store.ebay_username,
    tier_id: store.tier_id,
    ebay_registration_date: store.ebay_registration_date || '',
    onboarding_date: store.onboarding_date || '',
    notes: store.notes || '',
    is_active: store.is_active,
  })

  const selectedTier = tiers.find((t) => t.id === formData.tier_id)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/stores/${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          ebay_registration_date: formData.ebay_registration_date || null,
          onboarding_date: formData.onboarding_date || null,
          notes: formData.notes || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update store')
      }

      router.push(`/stores/${store.id}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Store Name */}
        <div>
          <label htmlFor="store_name" className="block text-sm font-medium text-gray-700 mb-1">
            Store Name *
          </label>
          <input
            type="text"
            id="store_name"
            required
            value={formData.store_name}
            onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* eBay Username */}
        <div>
          <label htmlFor="ebay_username" className="block text-sm font-medium text-gray-700 mb-1">
            eBay Username *
          </label>
          <input
            type="text"
            id="ebay_username"
            required
            value={formData.ebay_username}
            onChange={(e) => setFormData({ ...formData, ebay_username: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Status Toggle */}
      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="ml-2 text-sm text-gray-700">Store is active</span>
        </label>
        <p className="mt-1 text-sm text-gray-500">
          Inactive stores will not receive new listings
        </p>
      </div>

      {/* Tier Selection */}
      <div>
        <label htmlFor="tier_id" className="block text-sm font-medium text-gray-700 mb-1">
          Store Tier *
        </label>
        <select
          id="tier_id"
          required
          value={formData.tier_id}
          onChange={(e) => setFormData({ ...formData, tier_id: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          {tiers.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.tier_name} - ${tier.target_monthly_profit.toLocaleString()}/mo target
            </option>
          ))}
        </select>

        {/* Tier Info Card */}
        {selectedTier && (
          <div className="mt-3 bg-gray-50 rounded-md p-4 border border-gray-200">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-gray-900">{selectedTier.tier_name} Tier</p>
                <ul className="mt-2 space-y-1 text-gray-600">
                  <li>Floor: {selectedTier.min_active_listings.toLocaleString()} listings</li>
                  <li>Ceiling: {selectedTier.max_total_listings.toLocaleString()} listings</li>
                  <li>Days to floor: {selectedTier.days_to_floor}</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Onboarding Date */}
        <div>
          <label htmlFor="onboarding_date" className="block text-sm font-medium text-gray-700 mb-1">
            Onboarding Date *
          </label>
          <input
            type="date"
            id="onboarding_date"
            required
            value={formData.onboarding_date}
            onChange={(e) => setFormData({ ...formData, onboarding_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-sm text-gray-500">Date store was onboarded to PPME</p>
        </div>

        {/* eBay Registration Date */}
        <div>
          <label htmlFor="ebay_registration_date" className="block text-sm font-medium text-gray-700 mb-1">
            eBay Registration Date
          </label>
          <input
            type="date"
            id="ebay_registration_date"
            value={formData.ebay_registration_date}
            onChange={(e) => setFormData({ ...formData, ebay_registration_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-sm text-gray-500">When the eBay account was created</p>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          placeholder="Any additional notes about this store..."
        />
      </div>

      {/* Submit Button */}
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
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
