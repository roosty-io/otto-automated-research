/**
 * AutoDS Product Upload API
 *
 * POST /api/autods/upload - Upload product(s) to eBay via AutoDS
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  uploadProduct,
  uploadProductsBulk,
  uploadFromSKU,
  type ProductUploadData,
} from '@/lib/automation/autods'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mode = 'single', ...data } = body

    // Single product upload
    if (mode === 'single') {
      const uploadData: ProductUploadData = {
        amazonUrl: data.amazonUrl,
        amazonAsin: data.amazonAsin,
        title: data.title,
        price: data.price,
        markup: data.markup,
        quantity: data.quantity,
        storeId: data.storeId,
        skuId: data.skuId,
      }

      const result = await uploadProduct(uploadData)

      return NextResponse.json({
        success: result.success,
        draftId: result.draftId,
        error: result.error,
      })
    }

    // Upload from SKU
    if (mode === 'sku') {
      const { skuId, storeId, markup } = data

      if (!skuId || !storeId) {
        return NextResponse.json(
          { success: false, error: 'skuId and storeId are required' },
          { status: 400 }
        )
      }

      const result = await uploadFromSKU(skuId, storeId, markup)

      return NextResponse.json({
        success: result.success,
        draftId: result.draftId,
        error: result.error,
      })
    }

    // Bulk upload
    if (mode === 'bulk') {
      const { products, options } = data

      if (!Array.isArray(products) || products.length === 0) {
        return NextResponse.json(
          { success: false, error: 'products array is required' },
          { status: 400 }
        )
      }

      const result = await uploadProductsBulk(products, options)

      return NextResponse.json({
        success: result.successful > 0,
        successful: result.successful,
        failed: result.failed,
        results: result.results,
      })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid mode. Use: single, sku, or bulk' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API] AutoDS upload error:', error)
    return NextResponse.json(
      { success: false, error: 'Upload failed' },
      { status: 500 }
    )
  }
}
