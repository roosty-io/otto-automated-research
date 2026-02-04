'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StoreTier } from '@/lib/database.types'
import { Loader2, Info } from 'lucide-react'

interface Props {
  tiers: StoreTier[]
}

export function AddStoreForm({ tiers }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    store_name: '',
    ebay_username: '',
    tier_id: tiers[0]?.id || '',
    ebay_registration_date: '',
    notes: '',
  })

  const selectedTier = tiers.find((t) => t.id === formData.tier_id)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          ebay_registration_date: formData.ebay_registration_date || null,
          notes: formData.notes || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create store')
      }

      router.push('/stores')
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
            placeholder="My eBay Store"
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
            placeholder="ebay_seller_123"
          />
        </div>
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
                <p className="font-medium text-gray-900">{selectedTier.tier_name} Tier Details</p>
                <ul className="mt-2 space-y-1 text-gray-600">
                  <li>Subscription: {selectedTier.subscription_type}</li>
                  <li>Floor: {selectedTier.min_active_listings.toLocaleString()} listings</li>
                  <li>Ceiling: {selectedTier.max_total_listings.toLocaleString()} listings</li>
                  <li>Days to reach floor: {selectedTier.days_to_floor}</li>
                  <li>
                    Overage:{' '}
                    {selectedTier.overage_enabled
                      ? `$${selectedTier.overage_fee}/listing after ${selectedTier.subscription_listing_limit.toLocaleString()}`
                      : 'Disabled'}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
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
        <p className="mt-1 text-sm text-gray-500">
          When was this eBay account created? (Optional)
        </p>
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
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {loading ? 'Creating...' : 'Create Store'}
        </button>
      </div>
    </form>
  )
}
