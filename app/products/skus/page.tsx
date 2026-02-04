import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft, Plus, Tag } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getSkus() {
  const { data } = await supabase
    .from('skus')
    .select('*, patterns(category, subcategory, price_band)')
    .order('created_at', { ascending: false })
  return data || []
}

export default async function SkusPage() {
  const skus = await getSkus()

  const readySkus = skus.filter((s: any) => s.status === 'ready')
  const availableSkus = skus.filter((s: any) => s.status === 'ready' && s.current_store_count < 3)

  return (
    <div className="p-8">
      <Link
        href="/products"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Products
      </Link>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SKUs</h1>
          <p className="text-gray-500 mt-1">
            {readySkus.length} ready • {availableSkus.length} available for assignment
          </p>
        </div>
        <Link
          href="/products/skus/new"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          New SKU
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                SKU
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Pattern
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Profit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Stores
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Sales
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {skus.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  <Tag className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No SKUs yet</p>
                  <Link href="/products/skus/new" className="text-blue-600 hover:underline text-sm">
                    Create your first SKU
                  </Link>
                </td>
              </tr>
            ) : (
              skus.map((sku: any) => (
                <tr key={sku.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      href={`/products/skus/${sku.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {sku.sku_code}
                    </Link>
                    <p className="text-sm text-gray-500 truncate max-w-xs">{sku.title}</p>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {sku.patterns ? (
                      <Link
                        href={`/products/patterns/${sku.pattern_id}`}
                        className="text-gray-900 hover:text-blue-600"
                      >
                        {sku.patterns.category}
                        {sku.patterns.subcategory && ` / ${sku.patterns.subcategory}`}
                      </Link>
                    ) : (
                      <span className="text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <p className="font-medium text-gray-900">${sku.sell_price.toFixed(2)}</p>
                    <p className="text-gray-500">Cost: ${sku.cost_price.toFixed(2)}</p>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <p className={`font-medium ${sku.expected_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${sku.expected_profit?.toFixed(2) || '0.00'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-12 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className={`h-2 rounded-full ${
                            sku.current_store_count >= 3
                              ? 'bg-red-500'
                              : sku.current_store_count >= 2
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                          style={{ width: `${(sku.current_store_count / 3) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600">
                        {sku.current_store_count}/3
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        sku.status === 'ready'
                          ? 'bg-green-100 text-green-800'
                          : sku.status === 'distributed'
                          ? 'bg-blue-100 text-blue-800'
                          : sku.status === 'exhausted'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {sku.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <p className="text-gray-900">{sku.total_sales} sales</p>
                    <p className="text-gray-500">${sku.total_profit.toFixed(2)}</p>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
