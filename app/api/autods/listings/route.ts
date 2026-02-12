/**
 * AutoDS Listings API
 *
 * GET /api/autods/listings - Get active listings
 * PATCH /api/autods/listings - Update listing (price/quantity)
 * DELETE /api/autods/listings - End listing
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getListings,
  updateListingPrice,
  updateListingQuantity,
  endListing,
  bulkUpdatePrices,
  getListingCounts,
  syncListingsToDatabase,
} from '@/lib/automation/autods'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId') || undefined
    const limit = parseInt(searchParams.get('limit') || '100')
    const status = searchParams.get('status') || undefined
    const countsOnly = searchParams.get('countsOnly') === 'true'

    // Return counts only
    if (countsOnly) {
      const counts = await getListingCounts(storeId)
      return NextResponse.json({
        success: true,
        counts,
      })
    }

    const result = await getListings(storeId, { limit, status })

    return NextResponse.json({
      success: result.success,
      listings: result.listings,
      totalCount: result.totalCount,
      error: result.error,
    })
  } catch (error) {
    console.error('[API] AutoDS get listings error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get listings' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { listingId, updates, bulkUpdates } = body

    // Bulk price updates
    if (Array.isArray(bulkUpdates) && bulkUpdates.length > 0) {
      const result = await bulkUpdatePrices(bulkUpdates)

      return NextResponse.json({
        success: result.successful > 0,
        successful: result.successful,
        failed: result.failed,
      })
    }

    // Single listing update
    if (!listingId || !updates) {
      return NextResponse.json(
        { success: false, error: 'listingId and updates required' },
        { status: 400 }
      )
    }

    let result = { success: true, error: undefined as string | undefined }

    // Update price
    if (updates.price !== undefined) {
      result = await updateListingPrice(listingId, updates.price)
      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error,
        })
      }
    }

    // Update quantity
    if (updates.quantity !== undefined) {
      result = await updateListingQuantity(listingId, updates.quantity)
      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error,
        })
      }
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error('[API] AutoDS update listing error:', error)
    return NextResponse.json(
      { success: false, error: 'Update failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { listingId } = body

    if (!listingId) {
      return NextResponse.json(
        { success: false, error: 'listingId required' },
        { status: 400 }
      )
    }

    const result = await endListing(listingId)

    return NextResponse.json({
      success: result.success,
      error: result.error,
    })
  } catch (error) {
    console.error('[API] AutoDS end listing error:', error)
    return NextResponse.json(
      { success: false, error: 'End listing failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, storeId } = body

    // Sync listings to database
    if (action === 'sync') {
      if (!storeId) {
        return NextResponse.json(
          { success: false, error: 'storeId required for sync' },
          { status: 400 }
        )
      }

      const result = await syncListingsToDatabase(storeId)

      return NextResponse.json({
        success: result.success,
        synced: result.synced,
        errors: result.errors,
      })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API] AutoDS listing action error:', error)
    return NextResponse.json(
      { success: false, error: 'Action failed' },
      { status: 500 }
    )
  }
}
