/**
 * eBay Inventory API
 *
 * GET /api/ebay/inventory?storeId=xxx - Get inventory items
 * POST /api/ebay/inventory - Create listing (with compliance check)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getInventoryManager, getPoliciesManager, type ListingData } from '@/lib/integrations/ebay'
import { performComplianceCheck } from '@/lib/compliance'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('storeId')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  if (!storeId) {
    return NextResponse.json(
      { success: false, error: 'storeId is required' },
      { status: 400 }
    )
  }

  try {
    const manager = getInventoryManager(storeId)
    const { items, total } = await manager.getInventoryItems({ limit, offset })

    return NextResponse.json({
      success: true,
      items,
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('[eBay Inventory] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get inventory' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      storeId,
      sku,
      title,
      description,
      price,
      quantity,
      categoryId,
      condition = 'NEW',
      images,
      brand,
      mpn,
      upc,
      aspects,
    } = body

    if (!storeId || !sku || !title || !price || !categoryId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: storeId, sku, title, price, categoryId' },
        { status: 400 }
      )
    }

    // Run compliance check before creating listing
    const skipCompliance = body.skipCompliance === true
    if (!skipCompliance) {
      const complianceResult = await performComplianceCheck({
        storeId,
        title,
        description: description || title,
        category: categoryId,
        sellPrice: price,
        costPrice: body.costPrice
      })

      if (complianceResult.decision === 'blocked') {
        return NextResponse.json({
          success: false,
          error: 'Listing blocked by compliance check',
          compliance: {
            passed: false,
            score: complianceResult.score,
            decision: complianceResult.decision,
            riskLevel: complianceResult.riskLevel,
            violations: complianceResult.violations,
            recommendations: complianceResult.recommendations
          }
        }, { status: 400 })
      }

      // Include compliance warning if review required
      if (complianceResult.decision === 'review_required') {
        console.warn(`[eBay Inventory] Listing ${sku} requires review:`, complianceResult.violations)
      }
    }

    // Get or create default policies
    const policiesManager = getPoliciesManager(storeId)
    const policies = await policiesManager.ensureDefaultPolicies()

    if (!policies.paymentPolicyId || !policies.returnPolicyId || !policies.fulfillmentPolicyId) {
      return NextResponse.json(
        { success: false, error: 'Failed to get listing policies' },
        { status: 500 }
      )
    }

    const listingData: ListingData = {
      sku,
      title,
      description: description || title,
      price,
      quantity: quantity || 1,
      categoryId,
      condition,
      images: images || [],
      brand,
      mpn,
      upc,
      aspects,
      paymentPolicyId: policies.paymentPolicyId,
      returnPolicyId: policies.returnPolicyId,
      fulfillmentPolicyId: policies.fulfillmentPolicyId,
    }

    const manager = getInventoryManager(storeId)
    const result = await manager.createListing(listingData)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.errors?.join(', ') || 'Failed to create listing' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      listingId: result.listingId,
      offerId: result.offerId,
      sku: result.sku,
    })
  } catch (error) {
    console.error('[eBay Inventory] Create error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create listing' },
      { status: 500 }
    )
  }
}
