'use client'

import { useState } from 'react'
import { Database, Loader2, CheckCircle, XCircle } from 'lucide-react'

export function SeedDataButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleSeed() {
    if (!confirm('This will create sample patterns, SKUs, and stores for testing. Continue?')) {
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        const parts = [
          `${data.results?.patterns?.created || 0} patterns`,
          `${data.results?.skus?.created || 0} SKUs`,
          data.results?.stores?.created ? `${data.results.stores.created} stores` : (data.results?.stores?.skipped || data.results?.stores?.error || 'stores skipped'),
        ]
        const errors = data.results?.skus?.errors
        setResult({
          success: data.results?.skus?.created > 0 || data.results?.patterns?.created > 0,
          message: `Created: ${parts.join(', ')}${errors ? ` | Errors: ${errors.join('; ')}` : ''}`,
        })
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to seed data',
        })
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to seed data',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleSeed}
        disabled={loading}
        className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Seeding...
          </>
        ) : (
          <>
            <Database className="h-4 w-4 mr-2" />
            Seed Sample Data
          </>
        )}
      </button>
      {result && (
        <div className={`flex items-center text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
          {result.success ? (
            <CheckCircle className="h-4 w-4 mr-1" />
          ) : (
            <XCircle className="h-4 w-4 mr-1" />
          )}
          {result.message}
        </div>
      )}
    </div>
  )
}
