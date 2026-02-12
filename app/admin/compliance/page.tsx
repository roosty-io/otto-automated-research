'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import ComplianceDashboard from '@/components/compliance/ComplianceDashboard'

interface Store {
  id: string
  storeName: string
  isActive: boolean
}

export default function ComplianceAdminPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStores()
  }, [])

  const loadStores = async () => {
    try {
      const res = await fetch('/api/stores')
      const data = await res.json()
      if (data.success && data.stores) {
        setStores(data.stores)
      }
    } catch (err) {
      console.error('Failed to load stores:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Link href="/admin" className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Compliance Center</h1>
                <p className="text-sm text-gray-500">Monitor policy compliance and violations</p>
              </div>
            </div>

            {/* Store Filter */}
            <div className="flex items-center space-x-3">
              <label className="text-sm text-gray-500">Store:</label>
              <select
                value={selectedStore}
                onChange={e => setSelectedStore(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Stores</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.storeName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Protected Brands</p>
                <p className="text-3xl font-bold mt-1">270+</p>
                <p className="text-green-100 text-xs mt-2">VeRO brands blocked</p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-100 text-sm">Blacklisted Terms</p>
                <p className="text-3xl font-bold mt-1">200+</p>
                <p className="text-yellow-100 text-xs mt-2">Policy violations detected</p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-sm">Restricted Categories</p>
                <p className="text-3xl font-bold mt-1">50+</p>
                <p className="text-red-100 text-xs mt-2">Categories monitored</p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Compliance Dashboard */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <ComplianceDashboard storeId={selectedStore || undefined} />
        </div>

        {/* Policy Quick Reference */}
        <div className="mt-8 grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">VeRO Brand Categories</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Athletic', count: 17, color: 'bg-red-100 text-red-700' },
                { name: 'Luxury Fashion', count: 25, color: 'bg-purple-100 text-purple-700' },
                { name: 'Technology', count: 40, color: 'bg-blue-100 text-blue-700' },
                { name: 'Entertainment', count: 27, color: 'bg-pink-100 text-pink-700' },
                { name: 'Watches', count: 15, color: 'bg-yellow-100 text-yellow-700' },
                { name: 'Automotive', count: 13, color: 'bg-green-100 text-green-700' },
                { name: 'Cosmetics', count: 12, color: 'bg-orange-100 text-orange-700' },
                { name: 'Fashion', count: 21, color: 'bg-indigo-100 text-indigo-700' }
              ].map(cat => (
                <div key={cat.name} className={`p-2 rounded-lg ${cat.color}`}>
                  <p className="text-sm font-medium">{cat.name}</p>
                  <p className="text-xs">{cat.count} brands</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Compliance Rules</h3>
            <div className="space-y-3">
              {[
                { rule: 'No VeRO brand names in titles or descriptions', severity: 'Critical' },
                { rule: 'No counterfeit/replica terminology', severity: 'Critical' },
                { rule: 'No external URLs or contact info', severity: 'Critical' },
                { rule: 'No prohibited items (weapons, drugs, etc.)', severity: 'Critical' },
                { rule: 'Proper title formatting (no ALL CAPS)', severity: 'Warning' },
                { rule: 'Sustainable profit margins (>15%)', severity: 'Warning' },
                { rule: 'No price gouging (>5x markup)', severity: 'Warning' }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                  <span className="text-sm text-gray-700">{item.rule}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    item.severity === 'Critical' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {item.severity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
