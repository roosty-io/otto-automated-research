import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const text = await file.text()
    const rows = parseCSV(text)

    if (rows.length < 2) {
      return NextResponse.json({ error: 'CSV must have header row and at least one data row' }, { status: 400 })
    }

    const headers = rows[0].map(h => h.toLowerCase().trim())
    const dataRows = rows.slice(1).filter(row => row.some(cell => cell.trim()))

    // Validate required columns
    const requiredColumns = ['sku_code', 'title', 'cost_price', 'sell_price']
    const missingColumns = requiredColumns.filter(col => !headers.includes(col))
    if (missingColumns.length > 0) {
      return NextResponse.json({
        error: `Missing required columns: ${missingColumns.join(', ')}`
      }, { status: 400 })
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as { row: number; error: string }[],
    }

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rowNum = i + 2 // Account for header and 0-index

      try {
        const data: Record<string, any> = {}
        headers.forEach((header, idx) => {
          data[header] = row[idx]?.trim() || ''
        })

        // Validate required fields
        if (!data.sku_code || !data.title || !data.cost_price || !data.sell_price) {
          throw new Error('Missing required fields')
        }

        const costPrice = parseFloat(data.cost_price)
        const sellPrice = parseFloat(data.sell_price)

        if (isNaN(costPrice) || isNaN(sellPrice)) {
          throw new Error('Invalid price format')
        }

        // Check for duplicate SKU code
        const { data: existing } = await supabase
          .from('skus')
          .select('id')
          .eq('sku_code', data.sku_code)
          .single()

        if (existing) {
          throw new Error(`SKU code "${data.sku_code}" already exists`)
        }

        // Create raw product entry
        const { data: rawProduct, error: rawError } = await supabase
          .from('raw_products')
          .insert({
            asin: `IMPORT-${data.sku_code}`,
            title: data.title,
            is_processed: true,
            processed_at: new Date().toISOString(),
            source: 'csv_import',
          })
          .select()
          .single()

        if (rawError) throw new Error(rawError.message)

        // Create normalized product
        const { data: normalizedProduct, error: normError } = await supabase
          .from('normalized_products')
          .insert({
            raw_product_id: rawProduct.id,
            normalized_title: data.title,
            normalized_category: data.category || 'Imported',
            cost_price: costPrice,
            suggested_sell_price: sellPrice,
          })
          .select()
          .single()

        if (normError) throw new Error(normError.message)

        // Parse bullet points if provided
        let bulletPoints: string[] = []
        if (data.bullet_points) {
          bulletPoints = data.bullet_points.split('|').map((b: string) => b.trim()).filter(Boolean)
        }

        // Create SKU
        const { error: skuError } = await supabase
          .from('skus')
          .insert({
            normalized_product_id: normalizedProduct.id,
            pattern_id: data.pattern_id || null,
            sku_code: data.sku_code,
            title: data.title,
            description: data.description || null,
            bullet_points: bulletPoints,
            cost_price: costPrice,
            sell_price: sellPrice,
            status: data.status || 'draft',
          })

        if (skuError) throw new Error(skuError.message)

        results.success++
      } catch (err) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json(results)
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    )
  }
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue

    const row: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim())
        current = ''
      } else if (char !== '\r') {
        current += char
      }
    }
    row.push(current.trim())
    rows.push(row)
  }

  return rows
}
