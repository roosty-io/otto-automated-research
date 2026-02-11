import { NextRequest, NextResponse } from 'next/server'
import {
  getTables,
  getTableStats,
  getTableInfo,
  getTableData,
  insertRow,
  updateRow,
  deleteRow,
  bulkDelete,
  exportTableData,
} from '@/lib/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/tables
 *
 * Get table list, stats, info, or data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'list'
    const tableName = searchParams.get('table')

    switch (action) {
      case 'list': {
        const tables = await getTables()
        return NextResponse.json({
          success: true,
          tables,
        })
      }

      case 'stats': {
        const stats = await getTableStats()
        return NextResponse.json({
          success: true,
          stats,
        })
      }

      case 'info': {
        if (!tableName) {
          return NextResponse.json(
            { error: 'table parameter is required' },
            { status: 400 }
          )
        }

        const info = await getTableInfo(tableName)
        return NextResponse.json({
          success: true,
          info,
        })
      }

      case 'data': {
        if (!tableName) {
          return NextResponse.json(
            { error: 'table parameter is required' },
            { status: 400 }
          )
        }

        const page = parseInt(searchParams.get('page') || '1')
        const pageSize = parseInt(searchParams.get('pageSize') || '50')
        const orderBy = searchParams.get('orderBy') || 'created_at'
        const orderDirection = (searchParams.get('orderDirection') || 'desc') as 'asc' | 'desc'

        // Parse filters from query params
        const filters: Record<string, any> = {}
        for (const [key, value] of searchParams.entries()) {
          if (key.startsWith('filter_')) {
            filters[key.replace('filter_', '')] = value
          }
        }

        const result = await getTableData(tableName, {
          page,
          pageSize,
          orderBy,
          orderDirection,
          filters,
        })

        return NextResponse.json({
          success: true,
          ...result,
        })
      }

      case 'export': {
        if (!tableName) {
          return NextResponse.json(
            { error: 'table parameter is required' },
            { status: 400 }
          )
        }

        const format = (searchParams.get('format') || 'json') as 'json' | 'csv'
        const limit = parseInt(searchParams.get('limit') || '10000')

        const exportResult = await exportTableData(tableName, { format, limit })

        return new NextResponse(exportResult.data, {
          headers: {
            'Content-Type': exportResult.mimeType,
            'Content-Disposition': `attachment; filename="${exportResult.filename}"`,
          },
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Admin Tables API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/tables
 *
 * Insert, update, or delete rows
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, table, data, id, ids } = body

    if (!table) {
      return NextResponse.json(
        { error: 'table is required' },
        { status: 400 }
      )
    }

    switch (action) {
      case 'insert': {
        if (!data) {
          return NextResponse.json(
            { error: 'data is required for insert' },
            { status: 400 }
          )
        }

        const result = await insertRow(table, data)
        return NextResponse.json(result)
      }

      case 'update': {
        if (!id || !data) {
          return NextResponse.json(
            { error: 'id and data are required for update' },
            { status: 400 }
          )
        }

        const result = await updateRow(table, id, data)
        return NextResponse.json(result)
      }

      case 'delete': {
        if (!id) {
          return NextResponse.json(
            { error: 'id is required for delete' },
            { status: 400 }
          )
        }

        const result = await deleteRow(table, id)
        return NextResponse.json(result)
      }

      case 'bulk-delete': {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
          return NextResponse.json(
            { error: 'ids array is required for bulk delete' },
            { status: 400 }
          )
        }

        const result = await bulkDelete(table, ids)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Admin Tables API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
