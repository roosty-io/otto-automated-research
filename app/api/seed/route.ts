import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Seed sample data for testing
export async function POST() {
  try {
    const results: Record<string, any> = {}

    // 1. Create sample patterns - use insert and handle duplicates gracefully
    const patternsToCreate = [
      { category: 'Electronics', subcategory: 'Phone Accessories', target_margin: 35, notes: 'High demand, quick turnover' },
      { category: 'Electronics', subcategory: 'Computer Accessories', target_margin: 30, notes: 'Good for tech stores' },
      { category: 'Home & Garden', subcategory: 'Kitchen Tools', target_margin: 40, notes: 'Evergreen category' },
      { category: 'Home & Garden', subcategory: 'Organization', target_margin: 35, notes: 'Steady sellers' },
      { category: 'Sports & Outdoors', subcategory: 'Fitness', target_margin: 30, notes: 'Seasonal peaks in Jan' },
    ]

    // Insert patterns one by one to handle duplicates gracefully
    let patternsCreated = 0
    for (const pattern of patternsToCreate) {
      const { error } = await supabase
        .from('patterns')
        .insert(pattern)

      if (!error) {
        patternsCreated++
      }
      // Ignore duplicate errors
    }
    results.patterns = { created: patternsCreated }

    // Get all patterns for SKU assignment
    const { data: allPatterns } = await supabase
      .from('patterns')
      .select('id, category, subcategory')

    results.patternsFound = allPatterns?.length || 0

    // 2. Create sample SKUs
    const skusToCreate = [
      {
        title: 'Universal Phone Car Mount Holder',
        description: 'Adjustable car phone mount with 360° rotation. Fits phones 4-7 inches.',
        bullet_points: ['360° rotation', 'One-hand operation', 'Strong suction cup', 'Fits 4-7 inch phones', 'Dashboard or windshield mount'],
        cost_price: 8.50,
        sell_price: 24.99,
        source_asin: 'B0EXAMPLE01',
        status: 'ready',
        pattern_id: allPatterns?.find(p => p.subcategory === 'Phone Accessories')?.id || null,
      },
      {
        title: 'USB-C to USB-A Adapter 4-Pack',
        description: 'High-speed USB-C male to USB-A female adapter. Compatible with laptops, tablets, and phones.',
        bullet_points: ['USB 3.0 speed', '4-pack value', 'Compact design', 'Universal compatibility', 'Durable aluminum build'],
        cost_price: 5.20,
        sell_price: 15.99,
        source_asin: 'B0EXAMPLE02',
        status: 'ready',
        pattern_id: allPatterns?.find(p => p.subcategory === 'Computer Accessories')?.id || null,
      },
      {
        title: 'Silicone Kitchen Utensil Set 10-Piece',
        description: 'Heat-resistant silicone cooking utensils. Non-stick safe with wooden handles.',
        bullet_points: ['Heat resistant to 480°F', '10 essential utensils', 'Non-stick safe', 'Wooden handles', 'Dishwasher safe'],
        cost_price: 12.00,
        sell_price: 34.99,
        source_asin: 'B0EXAMPLE03',
        status: 'ready',
        pattern_id: allPatterns?.find(p => p.subcategory === 'Kitchen Tools')?.id || null,
      },
      {
        title: 'Drawer Organizer Set 8-Pack',
        description: 'Adjustable drawer dividers for kitchen, office, or bedroom organization.',
        bullet_points: ['8 different sizes', 'Interlocking design', 'Clear acrylic material', 'Easy to clean', 'Fits standard drawers'],
        cost_price: 9.75,
        sell_price: 28.99,
        source_asin: 'B0EXAMPLE04',
        status: 'ready',
        pattern_id: allPatterns?.find(p => p.subcategory === 'Organization')?.id || null,
      },
      {
        title: 'Resistance Bands Set with Handles',
        description: 'Complete resistance band set with 5 bands, handles, door anchor, and ankle straps.',
        bullet_points: ['5 resistance levels', 'Includes handles', 'Door anchor included', 'Ankle straps', 'Carry bag included'],
        cost_price: 11.50,
        sell_price: 32.99,
        source_asin: 'B0EXAMPLE05',
        status: 'ready',
        pattern_id: allPatterns?.find(p => p.subcategory === 'Fitness')?.id || null,
      },
      {
        title: 'Wireless Charging Pad Fast Charger',
        description: '15W fast wireless charger compatible with iPhone and Android. LED indicator.',
        bullet_points: ['15W fast charging', 'iPhone/Android compatible', 'LED charging indicator', 'Slim design', 'Overcharge protection'],
        cost_price: 7.80,
        sell_price: 22.99,
        source_asin: 'B0EXAMPLE06',
        status: 'ready',
        pattern_id: allPatterns?.find(p => p.subcategory === 'Phone Accessories')?.id || null,
      },
      {
        title: 'Laptop Stand Adjustable Aluminum',
        description: 'Ergonomic laptop stand with 6 height levels. Fits laptops 10-17 inches.',
        bullet_points: ['6 height adjustments', 'Aluminum construction', 'Ventilated design', 'Fits 10-17 inch laptops', 'Foldable for travel'],
        cost_price: 14.25,
        sell_price: 39.99,
        source_asin: 'B0EXAMPLE07',
        status: 'ready',
        pattern_id: allPatterns?.find(p => p.subcategory === 'Computer Accessories')?.id || null,
      },
      {
        title: 'Vegetable Chopper Dicer 12-in-1',
        description: 'Multi-function vegetable cutter with interchangeable blades. Container included.',
        bullet_points: ['12 blade options', 'Container catches food', 'Stainless steel blades', 'Non-slip base', 'Hand guard included'],
        cost_price: 15.50,
        sell_price: 44.99,
        source_asin: 'B0EXAMPLE08',
        status: 'ready',
        pattern_id: allPatterns?.find(p => p.subcategory === 'Kitchen Tools')?.id || null,
      },
    ]

    // Insert SKUs one by one to get better error handling
    let skusCreated = 0
    const skuErrors: string[] = []

    for (const sku of skusToCreate) {
      const { data, error } = await supabase
        .from('skus')
        .insert(sku)
        .select()

      if (error) {
        skuErrors.push(`${sku.title.substring(0, 20)}: ${error.message}`)
      } else if (data) {
        skusCreated++
      }
    }

    results.skus = {
      created: skusCreated,
      errors: skuErrors.length > 0 ? skuErrors : undefined
    }

    // 3. Create sample stores if none exist
    const { data: existingStores } = await supabase
      .from('stores')
      .select('id')
      .limit(1)

    if (!existingStores || existingStores.length === 0) {
      // Get tier IDs
      const { data: tiers } = await supabase
        .from('store_tiers')
        .select('id, tier_name')

      const bronzeTier = tiers?.find(t => t.tier_name === 'Bronze')?.id
      const silverTier = tiers?.find(t => t.tier_name === 'Silver')?.id

      if (!bronzeTier || !silverTier) {
        results.stores = { error: 'Store tiers not found in database' }
      } else {
        const storesToCreate = [
          {
            store_name: 'TechDeals247',
            ebay_username: 'techdeals247',
            tier_id: silverTier,
            maturity_level: 'establishing',
            current_active_listings: 150,
            store_opened_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
            notes: 'Electronics focused store',
          },
          {
            store_name: 'HomeEssentials Plus',
            ebay_username: 'homeessentials_plus',
            tier_id: bronzeTier,
            maturity_level: 'new',
            current_active_listings: 45,
            store_opened_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
            notes: 'Home goods store',
          },
          {
            store_name: 'FitGear Direct',
            ebay_username: 'fitgeardirect',
            tier_id: bronzeTier,
            maturity_level: 'growing',
            current_active_listings: 85,
            store_opened_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
            notes: 'Sports & fitness store',
          },
        ]

        const { data: stores, error: storeError } = await supabase
          .from('stores')
          .insert(storesToCreate)
          .select()

        if (storeError) {
          results.stores = { error: storeError.message }
        } else {
          results.stores = { created: stores?.length || 0 }
        }
      }
    } else {
      results.stores = { skipped: 'Stores already exist' }
    }

    return NextResponse.json({
      success: true,
      message: 'Sample data created',
      results,
    })

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to seed data' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to seed sample data',
    warning: 'This will create sample patterns, SKUs, and stores for testing',
  })
}
