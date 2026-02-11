/**
 * Store-SKU Assignment Service
 *
 * Handles intelligent assignment of SKUs to stores based on:
 * - Store capacity and tier limits
 * - SKU availability (max 3 stores per SKU)
 * - Store maturity and velocity
 * - Distribution rules
 */

import { supabase } from '@/lib/supabase'

export interface StoreInfo {
  id: string
  storeName: string
  tierId: string
  tierName: string
  isActive: boolean
  currentActiveListings: number
  softCeiling: number | null
  maxTotalListings: number
  dailyTarget: number
  availableSlots: number
}

export interface SkuInfo {
  id: string
  skuCode: string
  title: string
  costPrice: number
  sellPrice: number
  expectedProfit: number
  status: string
  currentStoreCount: number
  maxStoreCount: number
  qualityScore: number | null
}

export interface AssignmentResult {
  success: boolean
  assignmentId?: string
  error?: string
  storeId: string
  skuId: string
}

export interface BulkAssignmentResult {
  success: boolean
  assigned: AssignmentResult[]
  failed: AssignmentResult[]
  totalProcessed: number
}

/**
 * Get stores with available listing capacity
 */
export async function getEligibleStores(options: {
  minAvailableSlots?: number
  tierId?: string
  excludeStoreIds?: string[]
} = {}): Promise<StoreInfo[]> {
  const { minAvailableSlots = 1, tierId, excludeStoreIds = [] } = options

  let query = supabase
    .from('stores')
    .select(`
      id,
      store_name,
      tier_id,
      is_active,
      current_active_listings,
      current_soft_ceiling,
      store_tiers (
        tier_name,
        max_total_listings,
        min_active_listings
      )
    `)
    .eq('is_active', true)

  if (tierId) {
    query = query.eq('tier_id', tierId)
  }

  if (excludeStoreIds.length > 0) {
    query = query.not('id', 'in', `(${excludeStoreIds.join(',')})`)
  }

  const { data: stores, error } = await query

  if (error || !stores) {
    console.error('Error fetching stores:', error)
    return []
  }

  // Calculate available slots for each store
  return (stores as any[])
    .map((store) => {
      const tier = store.store_tiers
      const maxListings = store.current_soft_ceiling || tier?.max_total_listings || 10000
      const availableSlots = maxListings - store.current_active_listings

      return {
        id: store.id,
        storeName: store.store_name,
        tierId: store.tier_id,
        tierName: tier?.tier_name || 'Unknown',
        isActive: store.is_active,
        currentActiveListings: store.current_active_listings,
        softCeiling: store.current_soft_ceiling,
        maxTotalListings: tier?.max_total_listings || 10000,
        dailyTarget: Math.ceil((tier?.min_active_listings || 5000) / 45), // days_to_floor
        availableSlots,
      }
    })
    .filter((store) => store.availableSlots >= minAvailableSlots)
    .sort((a, b) => b.availableSlots - a.availableSlots) // Most capacity first
}

/**
 * Get SKUs available for assignment
 */
export async function getAvailableSkus(options: {
  limit?: number
  minQualityScore?: number
  priceBand?: string
  excludeSkuIds?: string[]
} = {}): Promise<SkuInfo[]> {
  const { limit = 100, minQualityScore, priceBand, excludeSkuIds = [] } = options

  let query = supabase
    .from('skus')
    .select(`
      id,
      sku_code,
      title,
      listing_title,
      cost_price,
      sell_price,
      expected_profit,
      status,
      current_store_count,
      max_store_count,
      price_band,
      listing_readiness,
      normalized_products (
        quality_score
      )
    `)
    .eq('status', 'ready')
    .lt('current_store_count', 3) // Max 3 stores per SKU
    .order('created_at', { ascending: false })
    .limit(limit)

  if (priceBand) {
    query = query.eq('price_band', priceBand)
  }

  if (excludeSkuIds.length > 0) {
    query = query.not('id', 'in', `(${excludeSkuIds.join(',')})`)
  }

  const { data: skus, error } = await query

  if (error || !skus) {
    console.error('Error fetching SKUs:', error)
    return []
  }

  return (skus as any[])
    .map((sku) => ({
      id: sku.id,
      skuCode: sku.sku_code,
      title: sku.listing_title || sku.title,
      costPrice: sku.cost_price,
      sellPrice: sku.sell_price,
      expectedProfit: sku.expected_profit,
      status: sku.status,
      currentStoreCount: sku.current_store_count,
      maxStoreCount: sku.max_store_count,
      qualityScore: sku.normalized_products?.quality_score || sku.listing_readiness,
    }))
    .filter((sku) => {
      if (minQualityScore && sku.qualityScore) {
        return sku.qualityScore >= minQualityScore
      }
      return true
    })
}

/**
 * Assign a single SKU to a store
 */
export async function assignSkuToStore(
  skuId: string,
  storeId: string,
  options: { priority?: number; autoList?: boolean } = {}
): Promise<AssignmentResult> {
  const { priority = 0, autoList = false } = options

  try {
    // Check if assignment already exists
    const { data: existing } = await supabase
      .from('store_sku_assignments')
      .select('id')
      .eq('store_id', storeId)
      .eq('sku_id', skuId)
      .single()

    if (existing) {
      return {
        success: false,
        error: 'Assignment already exists',
        storeId,
        skuId,
      }
    }

    // Check SKU availability
    const { data: sku } = await supabase
      .from('skus')
      .select('current_store_count, max_store_count, status')
      .eq('id', skuId)
      .single()

    if (!sku) {
      return { success: false, error: 'SKU not found', storeId, skuId }
    }

    if ((sku as any).current_store_count >= (sku as any).max_store_count) {
      return { success: false, error: 'SKU at max store limit', storeId, skuId }
    }

    if ((sku as any).status !== 'ready') {
      return { success: false, error: 'SKU not ready for assignment', storeId, skuId }
    }

    // Check store capacity
    const { data: store } = await supabase
      .from('stores')
      .select('current_active_listings, current_soft_ceiling, store_tiers(max_total_listings)')
      .eq('id', storeId)
      .single()

    if (!store) {
      return { success: false, error: 'Store not found', storeId, skuId }
    }

    const storeData = store as any
    const maxListings = storeData.current_soft_ceiling || storeData.store_tiers?.max_total_listings || 10000

    if (storeData.current_active_listings >= maxListings) {
      return { success: false, error: 'Store at listing capacity', storeId, skuId }
    }

    // Create the assignment
    const { data: assignment, error: assignError } = await supabase
      .from('store_sku_assignments')
      .insert({
        store_id: storeId,
        sku_id: skuId,
        listing_status: autoList ? 'active' : 'draft',
        listed_at: autoList ? new Date().toISOString() : null,
      })
      .select('id')
      .single()

    if (assignError || !assignment) {
      return {
        success: false,
        error: assignError?.message || 'Failed to create assignment',
        storeId,
        skuId,
      }
    }

    // Update SKU store count
    await supabase
      .from('skus')
      .update({
        current_store_count: (sku as any).current_store_count + 1,
        status: (sku as any).current_store_count + 1 >= (sku as any).max_store_count ? 'distributed' : 'ready',
      })
      .eq('id', skuId)

    // Update store listing count if auto-listing
    if (autoList) {
      await supabase
        .from('stores')
        .update({
          current_active_listings: storeData.current_active_listings + 1,
        })
        .eq('id', storeId)
    }

    // Add to distribution queue if not auto-listing
    if (!autoList) {
      await supabase.from('distribution_queue').insert({
        sku_id: skuId,
        store_id: storeId,
        priority,
        assignment_id: (assignment as any).id,
      })
    }

    return {
      success: true,
      assignmentId: (assignment as any).id,
      storeId,
      skuId,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      storeId,
      skuId,
    }
  }
}

/**
 * Bulk assign SKUs to stores with intelligent distribution
 */
export async function bulkAssignSkus(options: {
  skuIds?: string[]
  storeIds?: string[]
  maxPerStore?: number
  maxPerSku?: number
  strategy?: 'round_robin' | 'fill_first' | 'balanced'
} = {}): Promise<BulkAssignmentResult> {
  const {
    strategy = 'balanced',
    maxPerStore = 100,
    maxPerSku = 3,
  } = options

  // Get available stores
  const stores = options.storeIds
    ? await getEligibleStores({ minAvailableSlots: 1 })
        .then((s) => s.filter((store) => options.storeIds!.includes(store.id)))
    : await getEligibleStores({ minAvailableSlots: 1 })

  if (stores.length === 0) {
    return {
      success: false,
      assigned: [],
      failed: [],
      totalProcessed: 0,
    }
  }

  // Get available SKUs
  const skus = options.skuIds
    ? await getAvailableSkus({ limit: 1000 })
        .then((s) => s.filter((sku) => options.skuIds!.includes(sku.id)))
    : await getAvailableSkus({ limit: 500 })

  if (skus.length === 0) {
    return {
      success: false,
      assigned: [],
      failed: [],
      totalProcessed: 0,
    }
  }

  const assigned: AssignmentResult[] = []
  const failed: AssignmentResult[] = []

  // Track assignments per store and SKU
  const storeAssignmentCounts: Record<string, number> = {}
  const skuAssignmentCounts: Record<string, number> = {}

  stores.forEach((s) => (storeAssignmentCounts[s.id] = 0))
  skus.forEach((s) => (skuAssignmentCounts[s.id] = s.currentStoreCount))

  // Assign based on strategy
  for (const sku of skus) {
    if (skuAssignmentCounts[sku.id] >= maxPerSku) continue

    // Find eligible stores for this SKU
    let eligibleStores = stores.filter((store) => {
      const storeCount = storeAssignmentCounts[store.id]
      return storeCount < maxPerStore && store.availableSlots > storeCount
    })

    if (eligibleStores.length === 0) continue

    // Sort stores based on strategy
    if (strategy === 'fill_first') {
      // Fill stores with most capacity first
      eligibleStores.sort((a, b) => b.availableSlots - a.availableSlots)
    } else if (strategy === 'round_robin') {
      // Distribute evenly
      eligibleStores.sort((a, b) => storeAssignmentCounts[a.id] - storeAssignmentCounts[b.id])
    } else {
      // Balanced: consider both capacity and current load
      eligibleStores.sort((a, b) => {
        const aScore = (a.availableSlots / a.maxTotalListings) - (storeAssignmentCounts[a.id] / maxPerStore)
        const bScore = (b.availableSlots / b.maxTotalListings) - (storeAssignmentCounts[b.id] / maxPerStore)
        return bScore - aScore
      })
    }

    // Assign to best store
    const targetStore = eligibleStores[0]
    const result = await assignSkuToStore(sku.id, targetStore.id)

    if (result.success) {
      assigned.push(result)
      storeAssignmentCounts[targetStore.id]++
      skuAssignmentCounts[sku.id]++
    } else {
      failed.push(result)
    }
  }

  return {
    success: failed.length === 0,
    assigned,
    failed,
    totalProcessed: assigned.length + failed.length,
  }
}

/**
 * Get assignment statistics for a store
 */
export async function getStoreAssignmentStats(storeId: string): Promise<{
  total: number
  active: number
  draft: number
  paused: number
  ended: number
  totalRevenue: number
  totalProfit: number
}> {
  const { data: assignments } = await supabase
    .from('store_sku_assignments')
    .select('listing_status, revenue, profit')
    .eq('store_id', storeId)

  if (!assignments) {
    return { total: 0, active: 0, draft: 0, paused: 0, ended: 0, totalRevenue: 0, totalProfit: 0 }
  }

  return {
    total: assignments.length,
    active: assignments.filter((a: any) => a.listing_status === 'active').length,
    draft: assignments.filter((a: any) => a.listing_status === 'draft').length,
    paused: assignments.filter((a: any) => a.listing_status === 'paused').length,
    ended: assignments.filter((a: any) => a.listing_status === 'ended' || a.listing_status === 'pruned').length,
    totalRevenue: assignments.reduce((sum: number, a: any) => sum + (a.revenue || 0), 0),
    totalProfit: assignments.reduce((sum: number, a: any) => sum + (a.profit || 0), 0),
  }
}

/**
 * Remove assignment (unassign SKU from store)
 */
export async function removeAssignment(assignmentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Get assignment details
    const { data: assignment } = await supabase
      .from('store_sku_assignments')
      .select('store_id, sku_id, listing_status')
      .eq('id', assignmentId)
      .single()

    if (!assignment) {
      return { success: false, error: 'Assignment not found' }
    }

    const assignmentData = assignment as any

    // Delete the assignment
    const { error: deleteError } = await supabase
      .from('store_sku_assignments')
      .delete()
      .eq('id', assignmentId)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Update SKU store count
    await supabase.rpc('decrement_sku_store_count', { sku_id: assignmentData.sku_id })

    // Update store listing count if was active
    if (assignmentData.listing_status === 'active') {
      await supabase.rpc('decrement_store_listing_count', { store_id: assignmentData.store_id })
    }

    // Remove from distribution queue
    await supabase
      .from('distribution_queue')
      .delete()
      .eq('assignment_id', assignmentId)

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
