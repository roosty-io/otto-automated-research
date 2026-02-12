/**
 * AutoDS Drafts API
 *
 * GET /api/autods/drafts - List drafts
 * POST /api/autods/drafts - Publish draft(s)
 * DELETE /api/autods/drafts - Delete draft
 * PATCH /api/autods/drafts - Edit draft
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getDrafts,
  publishDraft,
  publishDraftsBulk,
  deleteDraft,
  editDraft,
} from '@/lib/automation/autods'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId') || undefined
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status') || undefined

    const result = await getDrafts(storeId, { limit, status })

    return NextResponse.json({
      success: result.success,
      drafts: result.drafts,
      totalCount: result.totalCount,
      error: result.error,
    })
  } catch (error) {
    console.error('[API] AutoDS get drafts error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get drafts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { draftIds, draftId, options } = body

    // Bulk publish
    if (Array.isArray(draftIds) && draftIds.length > 0) {
      const result = await publishDraftsBulk(draftIds, options)

      return NextResponse.json({
        success: result.successful > 0,
        successful: result.successful,
        failed: result.failed,
        results: result.results,
      })
    }

    // Single publish
    if (draftId) {
      const result = await publishDraft(draftId)

      return NextResponse.json({
        success: result.success,
        listingId: result.listingId,
        ebayItemId: result.ebayItemId,
        error: result.error,
      })
    }

    return NextResponse.json(
      { success: false, error: 'draftId or draftIds required' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API] AutoDS publish draft error:', error)
    return NextResponse.json(
      { success: false, error: 'Publish failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { draftId } = body

    if (!draftId) {
      return NextResponse.json(
        { success: false, error: 'draftId required' },
        { status: 400 }
      )
    }

    const result = await deleteDraft(draftId)

    return NextResponse.json({
      success: result.success,
      error: result.error,
    })
  } catch (error) {
    console.error('[API] AutoDS delete draft error:', error)
    return NextResponse.json(
      { success: false, error: 'Delete failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { draftId, updates } = body

    if (!draftId || !updates) {
      return NextResponse.json(
        { success: false, error: 'draftId and updates required' },
        { status: 400 }
      )
    }

    const result = await editDraft(draftId, updates)

    return NextResponse.json({
      success: result.success,
      error: result.error,
    })
  } catch (error) {
    console.error('[API] AutoDS edit draft error:', error)
    return NextResponse.json(
      { success: false, error: 'Edit failed' },
      { status: 500 }
    )
  }
}
