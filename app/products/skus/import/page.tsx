import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BulkSkuImport } from '@/components/BulkSkuImport'

export default function ImportSkusPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link
        href="/products/skus"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to SKUs
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Import SKUs</h1>
        <p className="text-gray-500 mt-1">
          Bulk import SKUs from a CSV file
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <BulkSkuImport />
      </div>

      <div className="mt-6 bg-gray-50 rounded-lg p-6">
        <h2 className="font-medium text-gray-900 mb-3">CSV Format</h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p><strong>Required columns:</strong></p>
          <ul className="list-disc list-inside ml-2">
            <li><code>sku_code</code> - Unique identifier for the SKU</li>
            <li><code>title</code> - Product title (max 80 chars for eBay)</li>
            <li><code>cost_price</code> - Your cost per unit</li>
            <li><code>sell_price</code> - Listing price</li>
          </ul>
          <p className="mt-3"><strong>Optional columns:</strong></p>
          <ul className="list-disc list-inside ml-2">
            <li><code>description</code> - Product description</li>
            <li><code>bullet_points</code> - Pipe-separated (|) bullet points</li>
            <li><code>pattern_id</code> - UUID of pattern to assign</li>
            <li><code>category</code> - Product category</li>
            <li><code>status</code> - draft, ready, distributed, or exhausted</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
