// Supabase Edge Function: update-store-health
// This function updates store maturity levels and recalculates ceilings
// Should be run daily via cron

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Store {
  id: string
  store_name: string
  ebay_username: string
  onboarding_date: string
  maturity: string
  current_active_listings: number
  tier_id: string
}

interface MaturityTier {
  maturity_level: string
  min_days: number
  max_days: number | null
  velocity_multiplier: number
  daily_cap: number
  monthly_cap: number
  profit_target_percentage: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

    for (const store of stores as Store[]) {
      const daysActive = Math.floor(
        (Date.now() - new Date(store.onboarding_date).getTime()) / (1000 * 60 * 60 * 24)
      )

      // Find appropriate maturity level
      const newMaturity = determineMaturityLevel(daysActive, maturityTiers as MaturityTier[])

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

    // Refresh materialized view for store health
    await supabase.rpc('refresh_store_health_mv')

    return new Response(
      JSON.stringify({
        message: `Processed ${stores?.length || 0} stores`,
        storesProcessed: stores?.length || 0,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

function determineMaturityLevel(daysActive: number, tiers: MaturityTier[]): string | null {
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
