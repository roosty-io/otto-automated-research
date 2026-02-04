'use client'

import Link from 'next/link'
import { StoreWithTier, StoreMaturity } from '@/lib/database.types'
import { MoreHorizontal, Edit, Trash2, Eye } from 'lucide-react'
import { useState } from 'react'

const maturityColors: Record<StoreMaturity, string> = {
  new: 'bg-blue-100 text-blue-800',
  establishing: 'bg-yellow-100 text-yellow-800',
  growing: 'bg-green-100 text-green-800',
  mature: 'bg-purple-100 text-purple-800',
  seasoned: 'bg-indigo-100 text-indigo-800',
}

const tierColors: Record<string, string> = {
  Bronze: 'bg-amber-100 text-amber-800',
  Silver: 'bg-gray-200 text-gray-800',
  Gold: 'bg-yellow-100 text-yellow-800',
  Platinum: 'bg-purple-100 text-purple-800',
}

export function StoreTable({ stores }: { stores: StoreWithTier[] }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Store
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tier
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Maturity
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Listings
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Floor Progress
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {stores.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                No stores found.{' '}
                <Link href="/stores/new" className="text-blue-600 hover:underline">
                  Add your first store
                </Link>
              </td>
            </tr>
          ) : (
            stores.map((store) => {
              const floorProgress = store.store_tiers
                ? Math.round(
                    (store.current_active_listings / store.store_tiers.min_active_listings) * 100
                  )
                : 0

              return (
                <tr key={store.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="font-medium text-gray-900">{store.store_name}</div>
                      <div className="text-sm text-gray-500">@{store.ebay_username}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        tierColors[store.store_tiers?.tier_name || ''] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {store.store_tiers?.tier_name || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        maturityColors[store.maturity]
                      }`}
                    >
                      {store.maturity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      <span className="font-medium">{store.current_active_listings.toLocaleString()}</span>
                      <span className="text-gray-500">
                        {' '}
                        / {store.store_tiers?.min_active_listings.toLocaleString() || '?'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-full bg-gray-200 rounded-full h-2 mr-2 max-w-[100px]">
                        <div
                          className={`h-2 rounded-full ${
                            floorProgress >= 100
                              ? 'bg-green-500'
                              : floorProgress >= 50
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(floorProgress, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-500">{floorProgress}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        store.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {store.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === store.id ? null : store.id)}
                        className="p-1 rounded hover:bg-gray-100"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                      {openMenu === store.id && (
                        <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                          <div className="py-1">
                            <Link
                              href={`/stores/${store.id}`}
                              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                            <Link
                              href={`/stores/${store.id}/edit`}
                              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Store
                            </Link>
                            <button className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-gray-100">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Store
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
