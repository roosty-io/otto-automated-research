import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Update store health cron job
// Updates store maturity levels based on days active
// Can be triggered via Vercel Cron or external service

export async function GET(request: NextRequest) {
  // Check for authorization
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return runHealthUpdate()
}

export async function POST() {
  return runHealthUpdate()
}

async function runHealthUpdate() {
  try {
    // Fetch all active stores
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true)

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`)
    }

    // Fetch maturity tiers
    const { data: maturityTiers, error: tiersError } = await supabase
      .from('store_maturity_tiers')
      .select('*')
      .order('min_days')

    if (tiersError) {
      throw new Error(`Failed to fetch maturity tiers: ${tiersError.message}`)
    }

    const results: { storeId: string; storeName: string; action: string }[] = []

    for (const store of stores || []) {
      const daysActive = Math.floor(
        (Date.now() - new Date(store.onboarding_date).getTime()) / (1000 * 60 * 60 * 24)
      )

      // Find appropriate maturity level
      const newMaturity = determineMaturityLevel(daysActive, maturityTiers || [])

      if (newMaturity && newMaturity !== store.maturity) {
        // Update store maturity
        const { error: updateError } = await supabase
          .from('stores')
          .update({
            maturity: newMaturity,
            maturity_updated_at: new Date().toISOString(),
          })
          .eq('id', store.id)

        if (updateError) {
          results.push({
            storeId: store.id,
            storeName: store.store_name,
            action: `Error updating maturity: ${updateError.message}`,
          })
        } else {
          results.push({
            storeId: store.id,
            storeName: store.store_name,
            action: `Maturity updated: ${store.maturity} -> ${newMaturity}`,
          })
        }
      } else {
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          action: `No change (${store.maturity}, ${daysActive} days)`,
        })
      }
    }

    const updatedCount = results.filter(r => r.action.includes('updated')).length

    return NextResponse.json({
      success: true,
      message: `Processed ${stores?.length || 0} stores, updated ${updatedCount}`,
      storesProcessed: stores?.length || 0,
      storesUpdated: updatedCount,
      results,
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

function determineMaturityLevel(daysActive: number, tiers: any[]): string | null {
  for (const tier of tiers) {
    const minOk = daysActive >= tier.min_days
    const maxOk = tier.max_days === null || daysActive <= tier.max_days

    if (minOk && maxOk) {
      return tier.maturity_level
    }
  }

  // Default to 'new' if no tier matches
  return 'new'
}
