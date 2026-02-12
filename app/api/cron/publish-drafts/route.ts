/**
 * Auto-Publish Drafts Cron Job
 *
 * Automatically publishes approved drafts to eBay.
 * Runs periodically to process queued drafts.
 *
 * GET /api/cron/publish-drafts
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { publishDraftsBulk } from '@/lib/automation/autods'
import { supabase } from '@/lib/supabase'

const CRON_SECRET = process.env.CRON_SECRET
const BATCH_SIZE = 10 // Publish 10 drafts at a time

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

    console.log('[Cron] Starting draft publishing...')
    const startTime = Date.now()

    // Get approved drafts pending publish
    const { data: pendingDrafts } = await supabase
      .from('store_sku_assignments')
      .select('id, autods_draft_id, sku_id, store_id')
      .eq('listing_status', 'approved')
      .not('autods_draft_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (!pendingDrafts || pendingDrafts.length === 0) {
      console.log('[Cron] No pending drafts to publish')
      return NextResponse.json({
        success: true,
        message: 'No pending drafts',
        published: 0,
      })
    }

    console.log(`[Cron] Publishing ${pendingDrafts.length} drafts...`)

    const draftIds = pendingDrafts.map(d => d.autods_draft_id).filter(Boolean) as string[]

    // Publish drafts
    const result = await publishDraftsBulk(draftIds, {
      delayBetween: 3000, // 3 seconds between each
      stopOnError: false,
    })

    // Update database with results
    for (let i = 0; i < result.results.length; i++) {
      const publishResult = result.results[i]
      const draft = pendingDrafts[i]

      if (publishResult.success) {
        await supabase
          .from('store_sku_assignments')
          .update({
            listing_status: 'active',
            ebay_listing_id: publishResult.ebayItemId,
            autods_listing_id: publishResult.listingId,
            published_at: new Date().toISOString(),
          })
          .eq('id', draft.id)
      } else {
        await supabase
          .from('store_sku_assignments')
          .update({
            listing_status: 'publish_failed',
            publish_error: publishResult.error,
          })
          .eq('id', draft.id)
      }
    }

    const duration = Date.now() - startTime
    console.log(`[Cron] Draft publishing complete in ${duration}ms`)

    // Log result
    await supabase.from('system_logs').insert({
      type: 'cron',
      action: 'publish_drafts',
      details: {
        duration,
        attempted: draftIds.length,
        successful: result.successful,
        failed: result.failed,
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      duration,
      published: result.successful,
      failed: result.failed,
    })
  } catch (error) {
    console.error('[Cron] Draft publishing error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Publishing failed',
      },
      { status: 500 }
    )
  }
}
