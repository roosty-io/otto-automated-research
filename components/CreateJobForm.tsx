'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Store = {
  id: string
  store_name: string
  ebay_username: string
  current_active_listings: number
  store_tiers: {
    tier_name: string
    min_active_listings: number
    max_total_listings: number
  } | null
}

type CreateJobFormProps = {
  stores: Store[]
  preselectedStoreId?: string
}

const jobTypes = [
  { value: 'managed_onboarding', label: 'Managed Onboarding', description: 'Initial store setup with managed listings' },
  { value: 'self_service_onboarding', label: 'Self-Service Onboarding', description: 'Customer-managed initial listings' },
  { value: 'managed_replenishment', label: 'Managed Replenishment', description: 'Replenish listings to maintain floor' },
  { value: 'self_service_topup', label: 'Self-Service Top-up', description: 'Customer-initiated listing addition' },
  { value: 'bulk_import', label: 'Bulk Import', description: 'Import multiple listings at once' },
  { value: 'escalation', label: 'Escalation', description: 'Priority handling for underperforming stores' },
  { value: 'pruning', label: 'Pruning', description: 'Remove stale listings' },
]

export function CreateJobForm({ stores, preselectedStoreId }: CreateJobFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    store_id: preselectedStoreId || '',
    job_type: 'managed_onboarding',
    job_name: '',
    target_listing_count: 100,
    priority: 5,
    scheduled_for: '',
  })

  const selectedStore = stores.find((s) => s.id === formData.store_id)
  const selectedJobType = jobTypes.find((j) => j.value === formData.job_type)

  // Auto-generate job name based on store and job type
  const generateJobName = () => {
    if (selectedStore && selectedJobType) {
      const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return `${selectedStore.store_name} - ${selectedJobType.label} - ${date}`
    }
    return ''
  }

  // Calculate suggested target based on job type and store
  const getSuggestedTarget = () => {
    if (!selectedStore) return 100

    const tier = selectedStore.store_tiers
    const current = selectedStore.current_active_listings
    const floor = tier?.min_active_listings || 500
    const ceiling = tier?.max_total_listings || 2000

    switch (formData.job_type) {
      case 'managed_onboarding':
      case 'self_service_onboarding':
        // Target to reach floor
        return Math.max(floor - current, 50)
      case 'managed_replenishment':
      case 'self_service_topup':
        // Replenish back to floor + buffer
        return Math.max(Math.round(floor * 1.1) - current, 25)
      case 'bulk_import':
        return 500
      case 'escalation':
        // Aggressive push to floor
        return Math.max(floor - current + 100, 100)
      case 'pruning':
        // Usually a percentage of current
        return Math.round(current * 0.1)
      default:
        return 100
    }
  }

  const handleStoreChange = (storeId: string) => {
    setFormData((prev) => ({
      ...prev,
      store_id: storeId,
      job_name: '', // Reset job name to regenerate
    }))
  }

  const handleJobTypeChange = (jobType: string) => {
    setFormData((prev) => ({
      ...prev,
      job_type: jobType,
      job_name: '', // Reset job name to regenerate
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const jobName = formData.job_name || generateJobName()

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          job_name: jobName,
          scheduled_for: formData.scheduled_for || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create job')
      }

      router.push('/jobs')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Store Selection */}
      <div>
        <label htmlFor="store_id" className="block text-sm font-medium text-gray-700 mb-1">
          Store *
        </label>
        <select
          id="store_id"
          value={formData.store_id}
          onChange={(e) => handleStoreChange(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select a store...</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.store_name} (@{store.ebay_username}) - {store.current_active_listings.toLocaleString()} listings
            </option>
          ))}
        </select>
        {selectedStore && (
          <p className="mt-1 text-sm text-gray-500">
            {selectedStore.store_tiers?.tier_name} tier | Floor: {selectedStore.store_tiers?.min_active_listings.toLocaleString()} | Ceiling: {selectedStore.store_tiers?.max_total_listings.toLocaleString()}
          </p>
        )}
      </div>

      {/* Job Type */}
      <div>
        <label htmlFor="job_type" className="block text-sm font-medium text-gray-700 mb-1">
          Job Type *
        </label>
        <select
          id="job_type"
          value={formData.job_type}
          onChange={(e) => handleJobTypeChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          {jobTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        {selectedJobType && (
          <p className="mt-1 text-sm text-gray-500">{selectedJobType.description}</p>
        )}
      </div>

      {/* Job Name */}
      <div>
        <label htmlFor="job_name" className="block text-sm font-medium text-gray-700 mb-1">
          Job Name
        </label>
        <input
          type="text"
          id="job_name"
          value={formData.job_name}
          onChange={(e) => setFormData((prev) => ({ ...prev, job_name: e.target.value }))}
          placeholder={generateJobName() || 'Auto-generated based on store and type'}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="mt-1 text-sm text-gray-500">Leave blank to auto-generate</p>
      </div>

      {/* Target Listing Count */}
      <div>
        <label htmlFor="target_listing_count" className="block text-sm font-medium text-gray-700 mb-1">
          Target Listing Count *
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            id="target_listing_count"
            value={formData.target_listing_count}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, target_listing_count: parseInt(e.target.value) || 0 }))
            }
            min="1"
            max="10000"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          {selectedStore && (
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, target_listing_count: getSuggestedTarget() }))}
              className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
            >
              Use suggested ({getSuggestedTarget()})
            </button>
          )}
        </div>
      </div>

      {/* Priority */}
      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
          Priority (1-10)
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            id="priority"
            value={formData.priority}
            onChange={(e) => setFormData((prev) => ({ ...prev, priority: parseInt(e.target.value) }))}
            min="1"
            max="10"
            className="flex-1"
          />
          <span className="text-sm font-medium w-8 text-center">{formData.priority}</span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {formData.priority <= 3 ? 'Low priority' : formData.priority <= 7 ? 'Normal priority' : 'High priority'}
        </p>
      </div>

      {/* Scheduled For */}
      <div>
        <label htmlFor="scheduled_for" className="block text-sm font-medium text-gray-700 mb-1">
          Schedule For (Optional)
        </label>
        <input
          type="datetime-local"
          id="scheduled_for"
          value={formData.scheduled_for}
          onChange={(e) => setFormData((prev) => ({ ...prev, scheduled_for: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="mt-1 text-sm text-gray-500">Leave empty to start immediately</p>
      </div>

      {/* Summary */}
      {selectedStore && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Job Summary</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Store:</dt>
              <dd className="font-medium">{selectedStore.store_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Type:</dt>
              <dd className="font-medium">{selectedJobType?.label}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Target:</dt>
              <dd className="font-medium">{formData.target_listing_count.toLocaleString()} listings</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">After completion:</dt>
              <dd className="font-medium">
                {(selectedStore.current_active_listings + formData.target_listing_count).toLocaleString()} total listings
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading || !formData.store_id}
          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creating Job...' : 'Create Job'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
