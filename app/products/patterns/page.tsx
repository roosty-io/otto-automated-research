import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft, Plus, Layers, CheckCircle, XCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getPatterns() {
  const { data } = await supabase
    .from('patterns')
    .select('*')
    .order('pattern_score', { ascending: false })
  return data || []
}

export default async function PatternsPage() {
  const patterns = await getPatterns()

  const activePatterns = patterns.filter((p: any) => p.is_active)
  const validatedPatterns = patterns.filter((p: any) => p.is_validated)

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
          <h1 className="text-3xl font-bold text-gray-900">Patterns</h1>
          <p className="text-gray-500 mt-1">
            {activePatterns.length} active • {validatedPatterns.length} validated
          </p>
        </div>
        <Link
          href="/products/patterns/new"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Pattern
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Pattern
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Price Band
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                SKUs
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Performance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {patterns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No patterns yet</p>
                  <Link href="/products/patterns/new" className="text-blue-600 hover:underline text-sm">
                    Create your first pattern
                  </Link>
                </td>
              </tr>
            ) : (
              patterns.map((pattern: any) => (
                <tr key={pattern.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      href={`/products/patterns/${pattern.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {pattern.category}
                      {pattern.subcategory && ` / ${pattern.subcategory}`}
                    </Link>
                    {pattern.use_case && (
                      <p className="text-sm text-gray-500">{pattern.use_case}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {pattern.price_band}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {pattern.total_skus}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div>
                      <p className="text-gray-900">{pattern.total_sales} sales</p>
                      <p className="text-gray-500">
                        ${pattern.total_profit.toFixed(2)} profit
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          pattern.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {pattern.is_active ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </>
                        )}
                      </span>
                      {pattern.is_validated && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          Validated
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${Math.min(pattern.pattern_score * 10, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {pattern.pattern_score.toFixed(1)}
                      </span>
                    </div>
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
