import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const category = searchParams.get('category')
  const active = searchParams.get('active')
  const validated = searchParams.get('validated')

  let query = supabase
    .from('patterns')
    .select('*')
    .order('pattern_score', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }
  if (active !== null) {
    query = query.eq('is_active', active === 'true')
  }
  if (validated !== null) {
    query = query.eq('is_validated', validated === 'true')
  }

  const { data, error } = await query.limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { category, subcategory, use_case, price_band } = body

    if (!category || !price_band) {
      return NextResponse.json(
        { error: 'category and price_band are required' },
        { status: 400 }
      )
    }

    // Check if pattern already exists
    const { data: existing } = await supabase
      .from('patterns')
      .select('id')
      .eq('category', category)
      .eq('subcategory', subcategory || '')
      .eq('use_case', use_case || '')
      .eq('price_band', price_band)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'A pattern with this combination already exists' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('patterns')
      .insert({
        category,
        subcategory: subcategory || null,
        use_case: use_case || null,
        price_band,
        is_active: true,
        is_validated: false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
