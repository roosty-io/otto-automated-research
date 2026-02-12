'use client'

import { useState } from 'react'
import Link from 'next/link'

interface UploadItem {
  id: string
  amazonUrl: string
  status: 'pending' | 'processing' | 'success' | 'error'
  title?: string
  price?: number
  error?: string
}

export default function ProductUploadPage() {
  const [storeId, setStoreId] = useState('')
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([])
  const [inputMode, setInputMode] = useState<'url' | 'bulk' | 'sku'>('url')
  const [amazonUrl, setAmazonUrl] = useState('')
  const [bulkUrls, setBulkUrls] = useState('')
  const [skuIds, setSkuIds] = useState('')
  const [markup, setMarkup] = useState(30)
  const [autoPublish, setAutoPublish] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadStores = async () => {
    try {
      const res = await fetch('/api/autods/stores')
      const data = await res.json()
      if (data.success && data.stores) {
        setStores(data.stores)
        if (data.stores.length > 0) {
          setStoreId(data.stores[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to load stores:', err)
    }
  }

  useState(() => {
    loadStores()
  })

  const handleUpload = async () => {
    if (!storeId) {
      setError('Please select a store')
      return
    }

    setUploading(true)
    setError(null)

    try {
      let urls: string[] = []

      if (inputMode === 'url' && amazonUrl) {
        urls = [amazonUrl]
      } else if (inputMode === 'bulk' && bulkUrls) {
        urls = bulkUrls.split('\n').map(u => u.trim()).filter(Boolean)
      }

      if (inputMode === 'sku' && skuIds) {
        // Upload from SKUs
        const ids = skuIds.split('\n').map(id => id.trim()).filter(Boolean)

        const res = await fetch('/api/pipeline/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skuIds: ids,
            storeId,
            options: {
              markup: 1 + markup / 100,
              autoPublish,
            },
          }),
        })

        const data = await res.json()

        if (data.success) {
          setUploadItems(data.results.map((r: any) => ({
            id: r.skuId,
            amazonUrl: `SKU: ${r.skuId}`,
            status: r.success ? 'success' : 'error',
            error: r.error,
          })))
        } else {
          setError(data.error || 'Upload failed')
        }
      } else if (urls.length > 0) {
        // Upload from Amazon URLs
        const items: UploadItem[] = urls.map((url, i) => ({
          id: `upload-${i}`,
          amazonUrl: url,
          status: 'pending' as const,
        }))
        setUploadItems(items)

        for (let i = 0; i < urls.length; i++) {
          setUploadItems(prev =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: 'processing' } : item
            )
          )

          try {
            const res = await fetch('/api/autods/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amazonUrl: urls[i],
                storeId,
                markup: 1 + markup / 100,
                autoPublish,
              }),
            })

            const data = await res.json()

            setUploadItems(prev =>
              prev.map((item, idx) =>
                idx === i
                  ? {
                      ...item,
                      status: data.success ? 'success' : 'error',
                      title: data.title,
                      price: data.price,
                      error: data.error,
                    }
                  : item
              )
            )
          } catch (err) {
            setUploadItems(prev =>
              prev.map((item, idx) =>
                idx === i
                  ? { ...item, status: 'error', error: 'Upload failed' }
                  : item
              )
            )
          }

          // Delay between uploads
          if (i < urls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const successCount = uploadItems.filter(i => i.status === 'success').length
  const errorCount = uploadItems.filter(i => i.status === 'error').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <Link href="/automation" className="text-gray-500 hover:text-gray-700 mr-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Upload Products</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Input Mode Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'url', label: 'Single URL' },
                { id: 'bulk', label: 'Bulk URLs' },
                { id: 'sku', label: 'From SKUs' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setInputMode(tab.id as any)}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    inputMode === tab.id
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Store Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Store
              </label>
              <select
                value={storeId}
                onChange={e => setStoreId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a store...</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Input Fields */}
            {inputMode === 'url' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amazon Product URL
                </label>
                <input
                  type="url"
                  value={amazonUrl}
                  onChange={e => setAmazonUrl(e.target.value)}
                  placeholder="https://www.amazon.com/dp/B0XXXXXXXXX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {inputMode === 'bulk' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amazon URLs (one per line)
                </label>
                <textarea
                  value={bulkUrls}
                  onChange={e => setBulkUrls(e.target.value)}
                  rows={6}
                  placeholder="https://www.amazon.com/dp/B0XXXXXXXXX&#10;https://www.amazon.com/dp/B0YYYYYYYYY&#10;https://www.amazon.com/dp/B0ZZZZZZZZZ"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {bulkUrls.split('\n').filter(Boolean).length} URLs entered
                </p>
              </div>
            )}

            {inputMode === 'sku' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SKU IDs (one per line)
                </label>
                <textarea
                  value={skuIds}
                  onChange={e => setSkuIds(e.target.value)}
                  rows={6}
                  placeholder="Enter validated SKU IDs from your inventory..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {skuIds.split('\n').filter(Boolean).length} SKUs entered
                </p>
              </div>
            )}

            {/* Settings */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Markup Percentage
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={markup}
                    onChange={e => setMarkup(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium text-gray-900 w-12 text-right">
                    {markup}%
                  </span>
                </div>
              </div>

              <div className="flex items-center">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoPublish}
                    onChange={e => setAutoPublish(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Auto-publish after upload
                  </span>
                </label>
              </div>
            </div>

            {/* Upload Button */}
            <button
              onClick={handleUpload}
              disabled={uploading || !storeId}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Start Upload
                </>
              )}
            </button>
          </div>
        </div>

        {/* Upload Results */}
        {uploadItems.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Upload Results</h3>
              <div className="flex items-center space-x-4 text-sm">
                <span className="text-green-600">{successCount} successful</span>
                {errorCount > 0 && <span className="text-red-600">{errorCount} failed</span>}
              </div>
            </div>
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {uploadItems.map(item => (
                <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    {item.status === 'pending' && (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                    )}
                    {item.status === 'processing' && (
                      <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {item.status === 'success' && (
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {item.status === 'error' && (
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.title || item.amazonUrl}
                      </p>
                      {item.error && (
                        <p className="text-xs text-red-600">{item.error}</p>
                      )}
                    </div>
                  </div>
                  {item.price && (
                    <span className="text-sm font-medium text-gray-900">
                      ${item.price.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
