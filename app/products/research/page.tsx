import Link from 'next/link'
import { ArrowLeft, Search, Sparkles } from 'lucide-react'
import { ProductResearchForm } from '@/components/ProductResearchForm'

export default function ProductResearchPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        href="/products"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Products
      </Link>

      <div className="mb-8">
        <div className="flex items-center mb-2">
          <Search className="h-8 w-8 text-blue-500 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">Product Research</h1>
        </div>
        <p className="text-gray-500">
          Add products from Amazon or enter manually to create SKUs
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <ProductResearchForm />
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <Sparkles className="h-5 w-5 text-blue-500 mt-0.5 mr-3" />
          <div>
            <h3 className="font-medium text-blue-900">How it works</h3>
            <ol className="mt-2 text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Enter an Amazon ASIN or product URL</li>
              <li>Fill in or adjust product details and pricing</li>
              <li>Optionally assign to a pattern</li>
              <li>Create SKU - it will be ready for store assignment</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
