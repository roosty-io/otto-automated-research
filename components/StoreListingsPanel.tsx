'use client'

import { useState, useEffect } from 'react'
import {
  Search,
  Filter,
  MoreVertical,
  ExternalLink,
  Pause,
  Play,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
  Eye,
  DollarSign,
  ShoppingCart,
} from 'lucide-react'

interface Listing {
  assignmentId: string
  storeId: string
  storeName: string
  skuId: string
  skuCode: string
  title: string
  status: string
  ebayItemId?: string
  listingUrl?: string
  listedAt?: string
  actualPrice?: number
  sellPrice: number
  costPrice: number
  views: number
  watchers: number
  sales: number
  revenue: number
  profit: number
  daysListed?: number
}

interface Props {
  storeId: string
  storeName: string
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  active: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
  paused: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Pause },
  ended: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
  pruned: { bg: 'bg-red-100', text: 'text-red-700', icon: Trash2 },
  error: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
}

export function StoreListingsPanel({ storeId, storeName }: Props) {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set())
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetchListings()
  }, [storeId, statusFilter])

  async function fetchListings() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        type: 'listings',
        storeId,
        limit: '100',
      })

      if (statusFilter !== 'all') {
        params.set('status', statusFilter)
      }

      const response = await fetch(`/api/listing/status?${params}`)
      const data = await response.json()

      if (data.success) {
        setListings(data.listings)
        setTotal(data.total)
      }
    } catch (error) {
      console.error('Error fetching listings:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(assignmentIds: string[], newStatus: string) {
    try {
      const response = await fetch('/api/listing/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_update',
          assignmentIds,
          status: newStatus,
        }),
      })

      const data = await response.json()
      if (data.success) {
        fetchListings()
        setSelectedListings(new Set())
      }
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const filteredListings = listings.filter((listing) =>
    search
      ? listing.title.toLowerCase().includes(search.toLowerCase()) ||
        listing.skuCode.toLowerCase().includes(search.toLowerCase())
      : true
  )

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedListings)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedListings(newSelection)
  }

  const toggleSelectAll = () => {
    if (selectedListings.size === filteredListings.length) {
      setSelectedListings(new Set())
    } else {
      setSelectedListings(new Set(filteredListings.map((l) => l.assignmentId)))
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Listings</h3>
          <p className="text-sm text-gray-500">{total} total listings for {storeName}</p>
        </div>
        <button
          onClick={fetchListings}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search listings..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {['all', 'active', 'draft', 'paused', 'ended'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                statusFilter === status
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedListings.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-indigo-700">
            {selectedListings.size} listings selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleStatusChange(Array.from(selectedListings), 'active')}
              className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200"
            >
              <Play className="h-4 w-4 inline mr-1" />
              Activate
            </button>
            <button
              onClick={() => handleStatusChange(Array.from(selectedListings), 'paused')}
              className="px-3 py-1.5 text-sm font-medium text-yellow-700 bg-yellow-100 rounded-lg hover:bg-yellow-200"
            >
              <Pause className="h-4 w-4 inline mr-1" />
              Pause
            </button>
            <button
              onClick={() => handleStatusChange(Array.from(selectedListings), 'ended')}
              className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
            >
              <Trash2 className="h-4 w-4 inline mr-1" />
              End
            </button>
          </div>
        </div>
      )}

      {/* Listings Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No listings found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">
                  <input
                    type="checkbox"
                    checked={selectedListings.size === filteredListings.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 text-indigo-600 rounded"
                  />
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performance
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Days
                </th>
                <th className="text-right py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredListings.map((listing) => {
                const statusStyle = STATUS_STYLES[listing.status] || STATUS_STYLES.draft
                const StatusIcon = statusStyle.icon

                return (
                  <tr key={listing.assignmentId} className="hover:bg-gray-50">
                    <td className="py-4 px-4">
                      <input
                        type="checkbox"
                        checked={selectedListings.has(listing.assignmentId)}
                        onChange={() => toggleSelection(listing.assignmentId)}
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="max-w-xs">
                        <p className="font-medium text-gray-900 truncate">{listing.title}</p>
                        <p className="text-sm text-gray-500">
                          {listing.skuCode}
                          {listing.ebayItemId && (
                            <a
                              href={listing.listingUrl || `https://www.ebay.com/itm/${listing.ebayItemId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-indigo-600 hover:text-indigo-700"
                            >
                              <ExternalLink className="h-3 w-3 inline" />
                            </a>
                          )}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {listing.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-medium text-gray-900">
                          ${(listing.actualPrice || listing.sellPrice).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Cost: ${listing.costPrice.toFixed(2)}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center text-gray-600">
                          <Eye className="h-4 w-4 mr-1" />
                          {listing.views}
                        </span>
                        <span className="flex items-center text-gray-600">
                          <ShoppingCart className="h-4 w-4 mr-1" />
                          {listing.sales}
                        </span>
                        <span className="flex items-center text-green-600">
                          <DollarSign className="h-4 w-4 mr-0.5" />
                          {listing.profit.toFixed(0)}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-500">
                      {listing.daysListed !== undefined ? `${listing.daysListed}d` : '-'}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button className="text-gray-400 hover:text-gray-600">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
