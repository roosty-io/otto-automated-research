'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Subscription {
  tier_id: string
  status: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  trial_end: string | null
}

interface Tier {
  name: string
  priceId: string
  monthlyPrice: number
  features: string[]
}

function BillingContent() {
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')

  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [tiers, setTiers] = useState<Record<string, Tier>>({})
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchBillingData()
  }, [])

  const fetchBillingData = async () => {
    try {
      const res = await fetch('/api/billing?action=status')
      const data = await res.json()

      if (data.success) {
        setSubscription(data.subscription)
        setTiers(data.tiers || {})
      }
    } catch (err) {
      console.error('Failed to fetch billing:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (tier: string) => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-checkout', tier })
      })
      const data = await res.json()
      if (data.success && data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Failed to start checkout:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleManageBilling = async () => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'billing-portal' })
      })
      const data = await res.json()
      if (data.success && data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Failed to open billing portal:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription?')) return

    setActionLoading(true)
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' })
      })
      const data = await res.json()
      if (data.success) {
        fetchBillingData()
      }
    } catch (err) {
      console.error('Failed to cancel:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReactivate = async () => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reactivate' })
      })
      const data = await res.json()
      if (data.success) {
        fetchBillingData()
      }
    } catch (err) {
      console.error('Failed to reactivate:', err)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  const currentTier = subscription?.tier_id ? tiers[subscription.tier_id] : null

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <Link href="/settings" className="text-indigo-600 hover:text-indigo-800 mb-4 inline-block">
          ← Back to Settings
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
        <p className="text-gray-500 mt-1">Manage your subscription and payment methods</p>
      </div>

      {/* Success/Cancel Messages */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800">
          Your subscription has been activated successfully!
        </div>
      )}
      {canceled && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800">
          Checkout was canceled. Your subscription has not changed.
        </div>
      )}

      {/* Current Subscription */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Current Plan</h2>
        </div>
        <div className="p-6">
          {subscription && currentTier ? (
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold text-gray-900">{currentTier.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    subscription.status === 'active' ? 'bg-green-100 text-green-800' :
                    subscription.status === 'trialing' ? 'bg-blue-100 text-blue-800' :
                    subscription.status === 'past_due' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {subscription.status === 'trialing' ? 'Trial' : subscription.status}
                  </span>
                </div>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  ${currentTier.monthlyPrice}<span className="text-lg font-normal text-gray-500">/month</span>
                </p>

                {subscription.trial_end && new Date(subscription.trial_end) > new Date() && (
                  <p className="text-sm text-blue-600 mt-2">
                    Trial ends {new Date(subscription.trial_end).toLocaleDateString()}
                  </p>
                )}

                {subscription.cancel_at_period_end && (
                  <p className="text-sm text-yellow-600 mt-2">
                    Cancels on {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                )}

                <p className="text-sm text-gray-500 mt-2">
                  Next billing: {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleManageBilling}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition disabled:opacity-50"
                >
                  Manage Billing
                </button>
                {subscription.cancel_at_period_end ? (
                  <button
                    onClick={handleReactivate}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition disabled:opacity-50"
                  >
                    Reactivate
                  </button>
                ) : (
                  <button
                    onClick={handleCancelSubscription}
                    disabled={actionLoading}
                    className="px-4 py-2 text-red-600 hover:text-red-800 font-medium transition disabled:opacity-50"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">You're currently on the free plan</p>
              <p className="text-sm text-gray-400">Upgrade to unlock more features</p>
            </div>
          )}
        </div>
      </div>

      {/* Available Plans */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Available Plans</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Object.entries(tiers).map(([key, tier]) => {
              const isCurrent = subscription?.tier_id === key

              return (
                <div
                  key={key}
                  className={`p-6 rounded-xl border-2 ${
                    isCurrent ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                  }`}
                >
                  <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    ${tier.monthlyPrice}
                    <span className="text-sm font-normal text-gray-500">/mo</span>
                  </p>

                  <ul className="mt-4 space-y-2">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-center text-sm text-gray-600">
                        <span className="text-green-500 mr-2">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleUpgrade(key)}
                    disabled={isCurrent || actionLoading}
                    className={`w-full mt-6 py-2 rounded-lg font-medium transition ${
                      isCurrent
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {isCurrent ? 'Current Plan' : 'Upgrade'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Billing FAQ</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-gray-900">How does the free trial work?</h3>
            <p className="text-sm text-gray-500 mt-1">
              You get 14 days free on any paid plan. No credit card required to start.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Can I change plans later?</h3>
            <p className="text-sm text-gray-500 mt-1">
              Yes, you can upgrade or downgrade at any time. Changes take effect immediately with prorated billing.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">What happens when I cancel?</h3>
            <p className="text-sm text-gray-500 mt-1">
              You'll keep access until the end of your current billing period. Your data is preserved if you resubscribe.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function BillingFallback() {
  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-4"></div>
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mt-2"></div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-gray-200 rounded"></div>
          <div className="h-10 w-24 bg-gray-200 rounded"></div>
          <div className="h-4 w-48 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  )
}

export default function BillingSettingsPage() {
  return (
    <Suspense fallback={<BillingFallback />}>
      <BillingContent />
    </Suspense>
  )
}
