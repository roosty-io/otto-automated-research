import { supabase } from '@/lib/supabase'
import { AddStoreForm } from '@/components/AddStoreForm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

async function getTiers() {
  const { data } = await supabase
    .from('store_tiers')
    .select('*')
    .order('target_monthly_profit')

  return data || []
}

export default async function NewStorePage() {
  const tiers = await getTiers()

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <Link
          href="/stores"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Stores
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Add New Store</h1>
        <p className="text-gray-500 mt-1">
          Add a new eBay store to the PPME system
        </p>
      </div>

      <div className="bg-white shadow rounded-lg">
        <AddStoreForm tiers={tiers} />
      </div>
    </div>
  )
}
