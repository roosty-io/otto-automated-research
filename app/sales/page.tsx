import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { DollarSign, TrendingUp, ShoppingCart, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getSales() {
  const { data } = await supabase
    .from('sales')
    .select('*, stores(store_name, ebay_username), skus(sku_code, title)')
    .order('ebay_order_date', { ascending: false })
    .limit(50)
  return data || []
}

async function getSalesStats() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString()

  // This month's sales
  const { data: thisMonth } = await supabase
    .from('sales')
    .select('sale_price, profit')
    .gte('ebay_order_date', startOfMonth)
    .eq('is_returned', false)

  // Last month's sales
  const { data: lastMonth } = await supabase
    .from('sales')
    .select('sale_price, profit')
    .gte('ebay_order_date', startOfLastMonth)
    .lte('ebay_order_date', endOfLastMonth)
    .eq('is_returned', false)

  // All time totals
  const { count: totalSales } = await supabase
    .from('sales')
    .select('*', { count: 'exact', head: true })
    .eq('is_returned', false)

  const { data: allTime } = await supabase
    .from('sales')
    .select('profit')
    .eq('is_returned', false)

  const thisMonthRevenue = thisMonth?.reduce((sum, s) => sum + (s.sale_price || 0), 0) || 0
  const thisMonthProfit = thisMonth?.reduce((sum, s) => sum + (s.profit || 0), 0) || 0
  const lastMonthRevenue = lastMonth?.reduce((sum, s) => sum + (s.sale_price || 0), 0) || 0
  const lastMonthProfit = lastMonth?.reduce((sum, s) => sum + (s.profit || 0), 0) || 0
  const allTimeProfit = allTime?.reduce((sum, s) => sum + (s.profit || 0), 0) || 0

  const revenueChange = lastMonthRevenue > 0
    ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : 0

  return {
    thisMonthSales: thisMonth?.length || 0,
    thisMonthRevenue,
    thisMonthProfit,
    lastMonthSales: lastMonth?.length || 0,
    lastMonthRevenue,
    lastMonthProfit,
    revenueChange,
    totalSales: totalSales || 0,
    allTimeProfit,
  }
}

export default async function SalesPage() {
  const [sales, stats] = await Promise.all([getSales(), getSalesStats()])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sales</h1>
        <p className="text-gray-500 mt-1">Track and analyze sales performance</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">MTD Sales</p>
              <p className="text-3xl font-bold text-gray-900">{stats.thisMonthSales}</p>
            </div>
            <ShoppingCart className="h-10 w-10 text-blue-500" />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            vs {stats.lastMonthSales} last month
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">MTD Revenue</p>
              <p className="text-3xl font-bold text-gray-900">
                ${stats.thisMonthRevenue.toFixed(2)}
              </p>
            </div>
            <DollarSign className="h-10 w-10 text-green-500" />
          </div>
          <div className="flex items-center mt-2">
            {stats.revenueChange >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-green-500" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-red-500" />
            )}
            <span className={`text-sm ${stats.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {Math.abs(stats.revenueChange).toFixed(1)}% vs last month
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">MTD Profit</p>
              <p className={`text-3xl font-bold ${stats.thisMonthProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${stats.thisMonthProfit.toFixed(2)}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-purple-500" />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            ${stats.lastMonthProfit.toFixed(2)} last month
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">All Time</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalSales}</p>
            </div>
            <Calendar className="h-10 w-10 text-orange-500" />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            ${stats.allTimeProfit.toFixed(2)} total profit
          </p>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Sales</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Store
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Sale Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Profit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No sales recorded yet</p>
                    <p className="text-sm mt-1">Sales will appear here as they come in</p>
                  </td>
                </tr>
              ) : (
                sales.map((sale: any) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{sale.ebay_order_id}</p>
                      {sale.buyer_username && (
                        <p className="text-sm text-gray-500">{sale.buyer_username}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/stores/${sale.store_id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {sale.stores?.store_name}
                      </Link>
                      <p className="text-sm text-gray-500">@{sale.stores?.ebay_username}</p>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/products/skus/${sale.sku_id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {sale.skus?.sku_code}
                      </Link>
                      <p className="text-sm text-gray-500 truncate max-w-xs">
                        {sale.skus?.title}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">${sale.sale_price.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">
                        Fees: ${sale.ebay_fees.toFixed(2)}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className={`font-medium ${sale.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${sale.profit?.toFixed(2) || '0.00'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(sale.ebay_order_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {sale.is_returned ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Returned
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Completed
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
