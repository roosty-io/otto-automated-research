import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CreateJobForm } from '@/components/CreateJobForm'

export const dynamic = 'force-dynamic'

async function getStores() {
  const { data } = await supabase
    .from('stores')
    .select('id, store_name, ebay_username, current_active_listings, is_active, store_tiers(tier_name, min_active_listings, max_total_listings)')
    .eq('is_active', true)
    .order('store_name')

  return data || []
}

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: { store?: string }
}) {
  const stores = await getStores()

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link
        href="/jobs"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Jobs
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create New Job</h1>
        <p className="text-gray-500 mt-1">Schedule a listing job for a store</p>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <CreateJobForm stores={stores} preselectedStoreId={searchParams.store} />
      </div>
    </div>
  )
}
