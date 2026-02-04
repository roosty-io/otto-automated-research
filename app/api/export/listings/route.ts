import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Export assignments as CSV for AutoDS or manual upload
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('store_id')
  const status = searchParams.get('status') || 'active'
  const format = searchParams.get('format') || 'csv'

  try {
    let query = supabase
      .from('store_sku_assignments')
      .select(`
        id,
        listing_status,
        listed_at,
        stores(store_name, ebay_username),
        skus(
          sku_code,
          title,
          description,
          bullet_points,
          cost_price,
          sell_price,
          patterns(category, subcategory)
        )
      `)
      .order('created_at', { ascending: false })

    if (storeId) {
      query = query.eq('store_id', storeId)
    }
    if (status !== 'all') {
      query = query.eq('listing_status', status)
    }

    const { data, error } = await query.limit(1000)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (format === 'json') {
      return NextResponse.json(data)
    }

    // Generate CSV
    const csvRows: string[] = []

    // Header row - AutoDS compatible format
    csvRows.push([
      'SKU',
      'Title',
      'Description',
      'Price',
      'Cost',
      'Category',
      'Store',
      'Status',
      'Listed Date'
    ].join(','))

    // Data rows
    for (const assignment of data || []) {
      const sku = assignment.skus as any
      const store = assignment.stores as any
      const pattern = sku?.patterns as any

      const description = sku?.description || ''
      const bulletPoints = sku?.bullet_points?.join(' • ') || ''
      const fullDescription = [description, bulletPoints].filter(Boolean).join('\n\n')

      csvRows.push([
        escapeCSV(sku?.sku_code || ''),
        escapeCSV(sku?.title || ''),
        escapeCSV(fullDescription),
        sku?.sell_price?.toFixed(2) || '0.00',
        sku?.cost_price?.toFixed(2) || '0.00',
        escapeCSV([pattern?.category, pattern?.subcategory].filter(Boolean).join(' > ')),
        escapeCSV(store?.store_name || ''),
        assignment.listing_status,
        assignment.listed_at ? new Date(assignment.listed_at).toISOString().split('T')[0] : ''
      ].join(','))
    }

    const csv = csvRows.join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="listings_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 }
    )
  }
}

function escapeCSV(value: string): string {
  if (!value) return ''
  // If value contains comma, newline, or quote, wrap in quotes and escape existing quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
