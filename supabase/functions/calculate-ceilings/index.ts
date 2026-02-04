// Supabase Edge Function: calculate-ceilings
// Recalculates dynamic soft ceilings for all stores based on performance
// Should be run weekly or on-demand

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Store {
  id: string
  store_name: string
  tier_id: string
  current_active_listings: number
  maturity: string
}

interface StoreTier {
  id: string
  tier_name: string
  min_active_listings: number
  max_total_listings: number
  fee_free_listings: number
  subscription_listing_limit: number
  overage_enabled: boolean
  overage_fee: number
}

interface MaturityTier {
  maturity_level: string
  velocity_multiplier: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch all active stores with their tiers
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('*, store_tiers(*)')
      .eq('is_active', true)

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`)
    }

    // Fetch maturity tiers
    const { data: maturityTiers, error: maturityError } = await supabase
      .from('store_maturity_tiers')
      .select('maturity_level, velocity_multiplier')

    if (maturityError) {
      throw new Error(`Failed to fetch maturity tiers: ${maturityError.message}`)
    }

    const maturityMap = new Map(
      (maturityTiers as MaturityTier[]).map(t => [t.maturity_level, t.velocity_multiplier])
    )

    const results: { storeId: string; storeName: string; ceiling: number; change: string }[] = []

    for (const store of stores as (Store & { store_tiers: StoreTier })[]) {
      const tier = store.store_tiers
      if (!tier) continue

      // Get velocity multiplier for store's maturity level
      const velocityMultiplier = maturityMap.get(store.maturity) || 1.0

      // Calculate dynamic ceiling based on:
      // 1. Base ceiling from tier
      // 2. Current performance (listing utilization)
      // 3. Maturity-adjusted capacity

      const baseCeiling = tier.fee_free_listings
      const utilizationRatio = store.current_active_listings / tier.min_active_listings

      // Stores that maintain floor get more headroom
      let performanceBonus = 1.0
      if (utilizationRatio >= 1.0) {
        performanceBonus = 1.1 // 10% bonus for meeting floor
      }
      if (utilizationRatio >= 1.2) {
        performanceBonus = 1.2 // 20% bonus for exceeding floor by 20%
      }

      // Calculate new soft ceiling
      const newCeiling = Math.min(
        Math.floor(baseCeiling * velocityMultiplier * performanceBonus),
        tier.max_total_listings
      )

      const previousCeiling = store.current_soft_ceiling || baseCeiling
      const changePercent = ((newCeiling - previousCeiling) / previousCeiling * 100).toFixed(1)

      // Update store's soft ceiling
      const { error: updateError } = await supabase
        .from('stores')
        .update({
          calculated_soft_ceiling: newCeiling,
          ceiling_last_calculated: new Date().toISOString(),
        })
        .eq('id', store.id)

      if (updateError) {
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          ceiling: newCeiling,
          change: `Error: ${updateError.message}`,
        })
      } else {
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          ceiling: newCeiling,
          change: `${previousCeiling} -> ${newCeiling} (${changePercent}%)`,
        })
      }
    }

    return new Response(
      JSON.stringify({
        message: `Calculated ceilings for ${stores?.length || 0} stores`,
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
