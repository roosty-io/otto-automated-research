import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SkuForm } from '@/components/SkuForm'

export const dynamic = 'force-dynamic'

async function getPatterns() {
  const { data } = await supabase
    .from('patterns')
    .select('id, category, subcategory, price_band')
    .eq('is_active', true)
    .order('category')
  return data || []
}

export default async function NewSkuPage({
  searchParams,
}: {
  searchParams: { pattern?: string }
}) {
  const patterns = await getPatterns()

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link
        href="/products/skus"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to SKUs
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">New SKU</h1>
        <p className="text-gray-500 mt-1">
          Create a new SKU for distribution to stores
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <SkuForm patterns={patterns} preselectedPatternId={searchParams.pattern} />
      </div>
    </div>
  )
}
