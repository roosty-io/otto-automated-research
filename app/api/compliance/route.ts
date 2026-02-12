import { NextRequest, NextResponse } from 'next/server'
import {
  performComplianceCheck,
  batchComplianceCheck,
  getComplianceHistory,
  getComplianceStats,
  sanitizeTitle,
  ComplianceCheckRequest
} from '@/lib/compliance'

// GET /api/compliance - Get compliance history and stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'stats'
    const storeId = searchParams.get('storeId')
    const skuId = searchParams.get('skuId')
    const days = parseInt(searchParams.get('days') || '30', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    if (action === 'stats') {
      const stats = await getComplianceStats(storeId || undefined, days)
      return NextResponse.json({
        success: true,
        stats
      })
    }

    if (action === 'history') {
      const history = await getComplianceHistory({
        storeId: storeId || undefined,
        skuId: skuId || undefined,
        limit
      })
      return NextResponse.json({
        success: true,
        history
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use "stats" or "history".'
    }, { status: 400 })
  } catch (error) {
    console.error('Compliance GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch compliance data'
    }, { status: 500 })
  }
}

// POST /api/compliance - Perform compliance check
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action = 'check', ...data } = body

    // Single compliance check
    if (action === 'check') {
      const checkRequest: ComplianceCheckRequest = {
        skuId: data.skuId,
        storeId: data.storeId,
        title: data.title,
        description: data.description,
        category: data.category,
        bulletPoints: data.bulletPoints,
        costPrice: data.costPrice,
        sellPrice: data.sellPrice,
        sourceUrl: data.sourceUrl,
        marketPrice: data.marketPrice,
        competitorPrices: data.competitorPrices
      }

      if (!checkRequest.title) {
        return NextResponse.json({
          success: false,
          error: 'Title is required'
        }, { status: 400 })
      }

      const result = await performComplianceCheck(checkRequest)
      return NextResponse.json({
        success: true,
        result
      })
    }

    // Batch compliance check
    if (action === 'batch') {
      const items = data.items as ComplianceCheckRequest[]

      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Items array is required for batch check'
        }, { status: 400 })
      }

      if (items.length > 100) {
        return NextResponse.json({
          success: false,
          error: 'Maximum 100 items per batch'
        }, { status: 400 })
      }

      const { results, summary } = await batchComplianceCheck(items, {
        stopOnBlock: data.stopOnBlock,
        maxConcurrent: data.maxConcurrent || 10
      })

      return NextResponse.json({
        success: true,
        results,
        summary
      })
    }

    // Sanitize title
    if (action === 'sanitize') {
      const { title } = data

      if (!title) {
        return NextResponse.json({
          success: false,
          error: 'Title is required'
        }, { status: 400 })
      }

      const result = sanitizeTitle(title)
      return NextResponse.json({
        success: true,
        original: title,
        sanitized: result.sanitized,
        changes: result.changes,
        isClean: result.changes.length === 0
      })
    }

    // Quick check (just pass/fail)
    if (action === 'quick') {
      const checkRequest: ComplianceCheckRequest = {
        title: data.title,
        description: data.description
      }

      if (!checkRequest.title) {
        return NextResponse.json({
          success: false,
          error: 'Title is required'
        }, { status: 400 })
      }

      const result = await performComplianceCheck(checkRequest)
      return NextResponse.json({
        success: true,
        passed: result.passed,
        score: result.score,
        decision: result.decision,
        riskLevel: result.riskLevel,
        violationCount: result.violations.length
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use "check", "batch", "sanitize", or "quick".'
    }, { status: 400 })
  } catch (error) {
    console.error('Compliance POST error:', error)
    return NextResponse.json({
      success: false,
      error: 'Compliance check failed'
    }, { status: 500 })
  }
}
