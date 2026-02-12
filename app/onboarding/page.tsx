'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface OnboardingStep {
  id: number
  title: string
  description: string
}

const STEPS: OnboardingStep[] = [
  { id: 1, title: 'Welcome', description: 'Let\'s get your account set up' },
  { id: 2, title: 'Connect eBay', description: 'Link your eBay seller account' },
  { id: 3, title: 'Connect AutoDS', description: 'Link your AutoDS account' },
  { id: 4, title: 'Create Store', description: 'Set up your first store' },
  { id: 5, title: 'Choose Plan', description: 'Select your subscription tier' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<any>(null)

  // Step-specific state
  const [storeName, setStoreName] = useState('')
  const [profitGoal, setProfitGoal] = useState(1000)
  const [selectedTier, setSelectedTier] = useState<string>('starter')

  useEffect(() => {
    fetchUser()
  }, [])

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth?action=user')
      const data = await res.json()
      if (data.success && data.user) {
        setUser(data.user)
        // Resume from last step
        if (data.user.onboarding_step > 0) {
          setCurrentStep(data.user.onboarding_step)
        }
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
    }
  }

  const saveProgress = async (step: number, completed = false) => {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete-onboarding-step',
          step,
          completed
        })
      })
    } catch (err) {
      console.error('Failed to save progress:', err)
    }
  }

  const handleNext = async () => {
    setLoading(true)

    // Save step-specific data
    if (currentStep === 4 && storeName) {
      // Create first store
      try {
        await fetch('/api/stores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_name: storeName,
            profit_target: profitGoal
          })
        })
      } catch (err) {
        console.error('Failed to create store:', err)
      }
    }

    if (currentStep === 5) {
      // Start checkout
      try {
        const res = await fetch('/api/billing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create-checkout',
            tier: selectedTier
          })
        })
        const data = await res.json()
        if (data.success && data.url) {
          // Mark onboarding complete before redirect
          await saveProgress(5, true)
          window.location.href = data.url
          return
        }
      } catch (err) {
        console.error('Failed to start checkout:', err)
      }
    }

    if (currentStep < 5) {
      await saveProgress(currentStep + 1)
      setCurrentStep(currentStep + 1)
    }

    setLoading(false)
  }

  const handleSkip = async () => {
    if (currentStep < 5) {
      await saveProgress(currentStep + 1)
      setCurrentStep(currentStep + 1)
    } else {
      // Skip to dashboard with free plan
      await saveProgress(5, true)
      router.push('/dashboard')
    }
  }

  const handleComplete = async () => {
    await saveProgress(5, true)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Progress Bar */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Step {currentStep} of 5</span>
            <span className="text-sm text-gray-400">{Math.round((currentStep / 5) * 100)}% complete</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 5) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="max-w-xl w-full">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="text-center">
              <div className="text-6xl mb-6">👋</div>
              <h1 className="text-3xl font-bold text-white mb-4">
                Welcome to OTTO Research Labs
              </h1>
              <p className="text-gray-400 text-lg mb-8">
                Let's get your dropshipping automation set up. This will only take a few minutes.
              </p>
              <div className="bg-gray-800 rounded-xl p-6 mb-8">
                <h2 className="font-semibold text-white mb-4">What you'll set up:</h2>
                <ul className="text-left space-y-3 text-gray-300">
                  <li className="flex items-center gap-3">
                    <span className="text-green-400">✓</span>
                    Connect your eBay seller account
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-green-400">✓</span>
                    Link your AutoDS account
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-green-400">✓</span>
                    Create your first store
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-green-400">✓</span>
                    Choose your subscription plan
                  </li>
                </ul>
              </div>
              <button
                onClick={handleNext}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-lg transition"
              >
                Get Started
              </button>
            </div>
          )}

          {/* Step 2: Connect eBay */}
          {currentStep === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Connect your eBay Account</h1>
              <p className="text-gray-400 mb-8">
                We need access to your eBay seller account to manage listings and sync orders.
              </p>

              <div className="bg-gray-800 rounded-xl p-6 mb-6">
                <h3 className="font-semibold text-white mb-4">You'll authorize OTTO to:</h3>
                <ul className="space-y-2 text-gray-300">
                  <li>• Create and manage listings</li>
                  <li>• View and fulfill orders</li>
                  <li>• Access seller metrics</li>
                </ul>
              </div>

              <button
                onClick={handleNext}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-lg transition mb-4"
              >
                Connect eBay Account
              </button>

              <button
                onClick={handleSkip}
                className="w-full py-3 text-gray-400 hover:text-white transition"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* Step 3: Connect AutoDS */}
          {currentStep === 3 && (
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Connect your AutoDS Account</h1>
              <p className="text-gray-400 mb-8">
                Link your AutoDS account to enable automatic product sourcing and order fulfillment.
              </p>

              <div className="bg-gray-800 rounded-xl p-6 mb-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    AutoDS API Key
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your AutoDS API key"
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <p className="text-sm text-gray-500">
                  Find your API key in AutoDS Settings → API
                </p>
              </div>

              <button
                onClick={handleNext}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-lg transition mb-4"
              >
                Connect AutoDS
              </button>

              <button
                onClick={handleSkip}
                className="w-full py-3 text-gray-400 hover:text-white transition"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* Step 4: Create Store */}
          {currentStep === 4 && (
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Create Your First Store</h1>
              <p className="text-gray-400 mb-8">
                Set up your store to start managing products and tracking profits.
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Store Name
                  </label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="My eBay Store"
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Monthly Profit Goal
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {[1000, 2000, 3000, 5000].map(goal => (
                      <button
                        key={goal}
                        onClick={() => setProfitGoal(goal)}
                        className={`py-3 rounded-lg font-medium transition ${
                          profitGoal === goal
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        ${goal.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleNext}
                disabled={!storeName}
                className="w-full mt-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-lg transition disabled:opacity-50"
              >
                Create Store
              </button>
            </div>
          )}

          {/* Step 5: Choose Plan */}
          {currentStep === 5 && (
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h1>
              <p className="text-gray-400 mb-8">
                Start with a 14-day free trial. Cancel anytime.
              </p>

              <div className="space-y-4">
                {[
                  { id: 'starter', name: 'Starter', price: 199, features: ['1 store', '500 listings'] },
                  { id: 'growth', name: 'Growth', price: 299, features: ['3 stores', '2,000 listings'], popular: true },
                  { id: 'professional', name: 'Professional', price: 499, features: ['10 stores', '10,000 listings'] },
                ].map(tier => (
                  <button
                    key={tier.id}
                    onClick={() => setSelectedTier(tier.id)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition ${
                      selectedTier === tier.id
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{tier.name}</span>
                          {tier.popular && (
                            <span className="px-2 py-0.5 bg-blue-600 text-xs rounded">Popular</span>
                          )}
                        </div>
                        <div className="text-gray-400 text-sm mt-1">
                          {tier.features.join(' • ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-white">${tier.price}</div>
                        <div className="text-sm text-gray-500">/month</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={handleNext}
                disabled={loading}
                className="w-full mt-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-lg transition disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Start Free Trial'}
              </button>

              <button
                onClick={handleComplete}
                className="w-full mt-4 py-3 text-gray-400 hover:text-white transition"
              >
                Continue with free plan
              </button>

              <p className="mt-4 text-center text-sm text-gray-500">
                14-day free trial • No credit card required • Cancel anytime
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
