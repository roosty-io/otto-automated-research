// OTTO Research Labs - Growth Analysis API
// System health, bottleneck analysis, and acquisition readiness

import { NextRequest, NextResponse } from 'next/server'
import {
  analyzeGrowthBottlenecks,
  assessAcquisitionReadiness
} from '@/lib/system/growth-analysis'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'bottlenecks'

    if (action === 'bottlenecks') {
      const report = await analyzeGrowthBottlenecks()
      return NextResponse.json({
        success: true,
        report
      })
    }

    if (action === 'acquisition') {
      const assessment = await assessAcquisitionReadiness()
      return NextResponse.json({
        success: true,
        assessment
      })
    }

    if (action === 'full') {
      const [bottlenecks, acquisition] = await Promise.all([
        analyzeGrowthBottlenecks(),
        assessAcquisitionReadiness()
      ])

      return NextResponse.json({
        success: true,
        bottlenecks,
        acquisition
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('[Growth API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
