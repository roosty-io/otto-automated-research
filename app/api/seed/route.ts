import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Seed sample data for testing
export async function POST() {
  try {
    const results: Record<string, any> = {}

    // 1. Create sample patterns - use insert and handle duplicates gracefully
    const patternsToCreate = [
      { category: 'Electronics', subcategory: 'Phone Accessories', price_band: '$15-30', use_case: 'Daily carry' },
      { category: 'Electronics', subcategory: 'Computer Accessories', price_band: '$10-40', use_case: 'Home office' },
      { category: 'Home & Garden', subcategory: 'Kitchen Tools', price_band: '$20-50', use_case: 'Cooking' },
      { category: 'Home & Garden', subcategory: 'Organization', price_band: '$15-35', use_case: 'Storage' },
      { category: 'Sports & Outdoors', subcategory: 'Fitness', price_band: '$20-40', use_case: 'Home workout' },
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

    // 2. Create sample SKUs (need to create raw_products and normalized_products first)
    const skuData = [
      {
        sku_code: 'ELEC-PHN-001',
        title: 'Universal Phone Car Mount Holder',
        description: 'Adjustable car phone mount with 360° rotation. Fits phones 4-7 inches.',
        bullet_points: ['360° rotation', 'One-hand operation', 'Strong suction cup', 'Fits 4-7 inch phones', 'Dashboard or windshield mount'],
        cost_price: 8.50,
        sell_price: 24.99,
        subcategory: 'Phone Accessories',
      },
      {
        sku_code: 'ELEC-CMP-001',
        title: 'USB-C to USB-A Adapter 4-Pack',
        description: 'High-speed USB-C male to USB-A female adapter. Compatible with laptops, tablets, and phones.',
        bullet_points: ['USB 3.0 speed', '4-pack value', 'Compact design', 'Universal compatibility', 'Durable aluminum build'],
        cost_price: 5.20,
        sell_price: 15.99,
        subcategory: 'Computer Accessories',
      },
      {
        sku_code: 'HOME-KIT-001',
        title: 'Silicone Kitchen Utensil Set 10-Piece',
        description: 'Heat-resistant silicone cooking utensils. Non-stick safe with wooden handles.',
        bullet_points: ['Heat resistant to 480°F', '10 essential utensils', 'Non-stick safe', 'Wooden handles', 'Dishwasher safe'],
        cost_price: 12.00,
        sell_price: 34.99,
        subcategory: 'Kitchen Tools',
      },
      {
        sku_code: 'HOME-ORG-001',
        title: 'Drawer Organizer Set 8-Pack',
        description: 'Adjustable drawer dividers for kitchen, office, or bedroom organization.',
        bullet_points: ['8 different sizes', 'Interlocking design', 'Clear acrylic material', 'Easy to clean', 'Fits standard drawers'],
        cost_price: 9.75,
        sell_price: 28.99,
        subcategory: 'Organization',
      },
      {
        sku_code: 'SPRT-FIT-001',
        title: 'Resistance Bands Set with Handles',
        description: 'Complete resistance band set with 5 bands, handles, door anchor, and ankle straps.',
        bullet_points: ['5 resistance levels', 'Includes handles', 'Door anchor included', 'Ankle straps', 'Carry bag included'],
        cost_price: 11.50,
        sell_price: 32.99,
        subcategory: 'Fitness',
      },
      {
        sku_code: 'ELEC-PHN-002',
        title: 'Wireless Charging Pad Fast Charger',
        description: '15W fast wireless charger compatible with iPhone and Android. LED indicator.',
        bullet_points: ['15W fast charging', 'iPhone/Android compatible', 'LED charging indicator', 'Slim design', 'Overcharge protection'],
        cost_price: 7.80,
        sell_price: 22.99,
        subcategory: 'Phone Accessories',
      },
      {
        sku_code: 'ELEC-CMP-002',
        title: 'Laptop Stand Adjustable Aluminum',
        description: 'Ergonomic laptop stand with 6 height levels. Fits laptops 10-17 inches.',
        bullet_points: ['6 height adjustments', 'Aluminum construction', 'Ventilated design', 'Fits 10-17 inch laptops', 'Foldable for travel'],
        cost_price: 14.25,
        sell_price: 39.99,
        subcategory: 'Computer Accessories',
      },
      {
        sku_code: 'HOME-KIT-002',
        title: 'Vegetable Chopper Dicer 12-in-1',
        description: 'Multi-function vegetable cutter with interchangeable blades. Container included.',
        bullet_points: ['12 blade options', 'Container catches food', 'Stainless steel blades', 'Non-slip base', 'Hand guard included'],
        cost_price: 15.50,
        sell_price: 44.99,
        subcategory: 'Kitchen Tools',
      },
    ]

    // Insert SKUs one by one, creating required raw_products and normalized_products first
    let skusCreated = 0
    const skuErrors: string[] = []

    for (const item of skuData) {
      try {
        // 1. Create raw_product
        const { data: rawProduct, error: rawError } = await supabase
          .from('raw_products')
          .insert({
            asin: `SEED-${item.sku_code}`,
            title: item.title,
            is_processed: true,
            processed_at: new Date().toISOString(),
            source: 'seed',
          })
          .select()
          .single()

        if (rawError) {
          skuErrors.push(`${item.title.substring(0, 20)}: raw_product - ${rawError.message}`)
          continue
        }

        // 2. Create normalized_product
        const { data: normalizedProduct, error: normError } = await supabase
          .from('normalized_products')
          .insert({
            raw_product_id: rawProduct.id,
            normalized_title: item.title,
            normalized_category: item.subcategory,
            cost_price: item.cost_price,
            suggested_sell_price: item.sell_price,
          })
          .select()
          .single()

        if (normError) {
          skuErrors.push(`${item.title.substring(0, 20)}: normalized_product - ${normError.message}`)
          continue
        }

        // 3. Create SKU
        const { error: skuError } = await supabase
          .from('skus')
          .insert({
            normalized_product_id: normalizedProduct.id,
            pattern_id: allPatterns?.find(p => p.subcategory === item.subcategory)?.id || null,
            sku_code: item.sku_code,
            title: item.title,
            description: item.description,
            bullet_points: item.bullet_points,
            cost_price: item.cost_price,
            sell_price: item.sell_price,
            status: 'ready',
          })

        if (skuError) {
          skuErrors.push(`${item.title.substring(0, 20)}: sku - ${skuError.message}`)
        } else {
          skusCreated++
        }
      } catch (err) {
        skuErrors.push(`${item.title.substring(0, 20)}: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
