/**
 * SKU Listing Pipeline API
 *
 * End-to-end pipeline for listing SKUs to eBay via AutoDS.
 * This is the main entry point for the LIST stage of the flywheel.
 *
 * POST /api/pipeline/list - Start listing pipeline for SKU(s)
 */

import { NextRequest, NextResponse } from 'next/server'
import { uploadFromSKU, publishDraft, type UploadResult, type PublishResult } from '@/lib/automation/autods'
import { supabase } from '@/lib/supabase'

interface ListingPipelineResult {
  skuId: string
  success: boolean
  stage: 'upload' | 'publish' | 'complete'
  draftId?: string
  listingId?: string
  ebayItemId?: string
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { skuIds, storeId, options = {} } = body

    if (!skuIds || !Array.isArray(skuIds) || skuIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'skuIds array required' },
        { status: 400 }
      )
    }

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId required' },
        { status: 400 }
      )
    }

    const {
      markup = 1.3,           // 30% markup default
      autoPublish = false,    // Whether to auto-publish after upload
      delayBetween = 2000,    // Delay between operations
    } = options

    console.log(`[Pipeline] Starting listing pipeline for ${skuIds.length} SKUs...`)
    const results: ListingPipelineResult[] = []

    for (const skuId of skuIds) {
      console.log(`[Pipeline] Processing SKU: ${skuId}`)
      const result: ListingPipelineResult = {
        skuId,
        success: false,
        stage: 'upload',
      }

      try {
        // Check if SKU exists and is validated
        const { data: sku } = await supabase
          .from('skus')
          .select('*')
          .eq('id', skuId)
          .single()

        if (!sku) {
          result.error = 'SKU not found'
          results.push(result)
          continue
        }

        if (sku.validation_status !== 'validated') {
          result.error = `SKU not validated (status: ${sku.validation_status})`
          results.push(result)
          continue
        }

        // Check if already listed
        const { data: existing } = await supabase
          .from('store_sku_assignments')
          .select('id, listing_status')
          .eq('sku_id', skuId)
          .eq('store_id', storeId)
          .single()

        if (existing && ['active', 'pending'].includes(existing.listing_status)) {
          result.error = `SKU already listed (status: ${existing.listing_status})`
          results.push(result)
          continue
        }

        // Stage 1: Upload to AutoDS as draft
        console.log(`[Pipeline] Uploading SKU ${skuId} to AutoDS...`)
        const uploadResult: UploadResult = await uploadFromSKU(skuId, storeId, markup)

        if (!uploadResult.success) {
          result.error = uploadResult.error || 'Upload failed'
          results.push(result)
          continue
        }

        result.draftId = uploadResult.draftId
        result.stage = 'publish'

        // Create/update assignment record
        await supabase
          .from('store_sku_assignments')
          .upsert({
            sku_id: skuId,
            store_id: storeId,
            autods_draft_id: uploadResult.draftId,
            listing_status: autoPublish ? 'pending_publish' : 'draft',
            markup_percentage: (markup - 1) * 100,
            created_at: new Date().toISOString(),
          }, {
            onConflict: 'sku_id,store_id',
          })

        // Stage 2: Publish if auto-publish enabled
        if (autoPublish && uploadResult.draftId) {
          console.log(`[Pipeline] Publishing draft ${uploadResult.draftId}...`)

          // Wait a bit for draft to be fully processed
          await new Promise(resolve => setTimeout(resolve, 3000))

          const publishResult: PublishResult = await publishDraft(uploadResult.draftId)

          if (!publishResult.success) {
            result.error = publishResult.error || 'Publish failed'
            await supabase
              .from('store_sku_assignments')
              .update({
                listing_status: 'publish_failed',
                publish_error: result.error,
              })
              .eq('sku_id', skuId)
              .eq('store_id', storeId)

            results.push(result)
            continue
          }

          result.listingId = publishResult.listingId
          result.ebayItemId = publishResult.ebayItemId
          result.stage = 'complete'

          // Update assignment with listing info
          await supabase
            .from('store_sku_assignments')
            .update({
              autods_listing_id: publishResult.listingId,
              ebay_listing_id: publishResult.ebayItemId,
              listing_status: 'active',
              published_at: new Date().toISOString(),
            })
            .eq('sku_id', skuId)
            .eq('store_id', storeId)
        } else {
          result.stage = 'complete'
        }

        result.success = true
        results.push(result)

        console.log(`[Pipeline] SKU ${skuId} processed successfully`)
      } catch (error) {
        result.error = error instanceof Error ? error.message : 'Pipeline error'
        results.push(result)
        console.error(`[Pipeline] Error processing SKU ${skuId}:`, error)
      }

      // Delay between SKUs
      if (skuIds.indexOf(skuId) < skuIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetween))
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    console.log(`[Pipeline] Complete: ${successful} successful, ${failed} failed`)

    return NextResponse.json({
      success: successful > 0,
      successful,
      failed,
      results,
    })
  } catch (error) {
    console.error('[Pipeline] Listing error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Pipeline failed',
      },
      { status: 500 }
    )
  }
}
