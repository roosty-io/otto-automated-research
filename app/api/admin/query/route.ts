import { NextRequest, NextResponse } from 'next/server'
import { executeQuery } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/query
 *
 * Execute a read-only SQL query
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sql } = body

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json(
        { error: 'sql query string is required' },
        { status: 400 }
      )
    }

    // Enforce reasonable length limit
    if (sql.length > 10000) {
      return NextResponse.json(
        { error: 'Query too long (max 10000 characters)' },
        { status: 400 }
      )
    }

    const result = await executeQuery(sql)

    return NextResponse.json({
      success: !result.error,
      ...result,
    })
  } catch (error) {
    console.error('[Admin Query API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
