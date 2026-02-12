/**
 * AutoDS Sync Cron Job
 *
 * Scheduled job to sync listings and sales data from AutoDS.
 * Runs periodically (e.g., every hour via Vercel cron or external scheduler).
 *
 * GET /api/cron/autods-sync
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { syncListingsToDatabase, syncSalesData } from '@/lib/automation/autods'
import { supabase } from '@/lib/supabase'

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Cron] Starting AutoDS sync...')
    const startTime = Date.now()
    const results = {
      listings: { synced: 0, errors: 0 },
      sales: { synced: 0, errors: 0 },
      stores: [] as string[],
    }

    // Get all active stores
    const { data: stores } = await supabase
      .from('stores')
      .select('id, name, autods_store_id')
      .eq('status', 'active')
      .not('autods_store_id', 'is', null)

    if (!stores || stores.length === 0) {
      console.log('[Cron] No active stores found')
      return NextResponse.json({
        success: true,
        message: 'No active stores to sync',
        results,
      })
    }

    // Sync each store
    for (const store of stores) {
      console.log(`[Cron] Syncing store: ${store.name}`)
      results.stores.push(store.name)

      // Sync listings
      try {
        const listingResult = await syncListingsToDatabase(store.autods_store_id)
        results.listings.synced += listingResult.synced
        results.listings.errors += listingResult.errors
      } catch (error) {
        console.error(`[Cron] Listing sync error for ${store.name}:`, error)
        results.listings.errors++
      }

      // Sync sales
      try {
        const salesResult = await syncSalesData(store.autods_store_id, {
          daysBack: 1, // Only sync recent orders
        })
        results.sales.synced += salesResult.synced
        results.sales.errors += salesResult.errors
      } catch (error) {
        console.error(`[Cron] Sales sync error for ${store.name}:`, error)
        results.sales.errors++
      }

      // Small delay between stores to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const duration = Date.now() - startTime
    console.log(`[Cron] AutoDS sync complete in ${duration}ms`)

    // Log sync result
    await supabase.from('system_logs').insert({
      type: 'cron',
      action: 'autods_sync',
      details: {
        duration,
        stores: results.stores.length,
        listings: results.listings,
        sales: results.sales,
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      duration,
      results,
    })
  } catch (error) {
    console.error('[Cron] AutoDS sync error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      },
      { status: 500 }
    )
  }
}
