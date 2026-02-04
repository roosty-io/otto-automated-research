import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { EditStoreForm } from '@/components/EditStoreForm'

export const dynamic = 'force-dynamic'

async function getStore(id: string) {
  const { data, error } = await supabase
    .from('stores')
    .select('*, store_tiers(*)')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data
}

async function getTiers() {
  const { data } = await supabase
    .from('store_tiers')
    .select('*')
    .order('target_monthly_profit')
  return data || []
}

export default async function EditStorePage({
  params,
}: {
  params: { id: string }
}) {
  const [store, tiers] = await Promise.all([
    getStore(params.id),
    getTiers(),
  ])

  if (!store) {
    notFound()
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          href={`/stores/${store.id}`}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Store
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Edit Store</h1>
        <p className="text-gray-500 mt-1">Update {store.store_name} settings</p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <EditStoreForm store={store} tiers={tiers} />
      </div>
    </div>
  )
}
