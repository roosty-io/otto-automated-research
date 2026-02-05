import { NextRequest, NextResponse } from 'next/server'
import { checkPolicy, getPolicyStats, PolicyCheckInput } from '@/lib/policy'

// POST - Check a single product for policy compliance
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, description, category, bulletPoints, costPrice, sellPrice } = body

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      )
    }

    const input: PolicyCheckInput = {
      title,
      description,
      category,
      bulletPoints,
      costPrice: costPrice ? parseFloat(costPrice) : undefined,
      sellPrice: sellPrice ? parseFloat(sellPrice) : undefined,
    }

    const result = checkPolicy(input)

    return NextResponse.json(result)
  } catch (err) {
    console.error('Policy check error:', err)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}

// POST bulk - Check multiple products at once
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { products } = body

    if (!Array.isArray(products)) {
      return NextResponse.json(
        { error: 'Products array is required' },
        { status: 400 }
      )
    }

    if (products.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 products per request' },
        { status: 400 }
      )
    }

    const results = products.map((product: any, index: number) => {
      try {
        const input: PolicyCheckInput = {
          title: product.title || '',
          description: product.description,
          category: product.category,
          bulletPoints: product.bulletPoints,
          costPrice: product.costPrice ? parseFloat(product.costPrice) : undefined,
          sellPrice: product.sellPrice ? parseFloat(product.sellPrice) : undefined,
        }

        const result = checkPolicy(input)
        return {
          index,
          title: product.title,
          ...result,
        }
      } catch (err) {
        return {
          index,
          title: product.title,
          error: 'Failed to check product',
        }
      }
    })

    const summary = {
      total: products.length,
      approved: results.filter((r: any) => r.decision === 'approved').length,
      blocked: results.filter((r: any) => r.decision === 'blocked').length,
      reviewRequired: results.filter((r: any) => r.decision === 'review_required').length,
      errors: results.filter((r: any) => r.error).length,
    }

    return NextResponse.json({
      summary,
      results,
    })
  } catch (err) {
    console.error('Bulk policy check error:', err)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}

// GET - Get policy database stats
export async function GET() {
  const stats = getPolicyStats()

  return NextResponse.json({
    stats,
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
  })
}
