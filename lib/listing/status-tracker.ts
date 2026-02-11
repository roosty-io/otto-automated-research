/**
 * Listing Status Tracker
 *
 * Track and manage listing statuses across stores:
 * - Monitor active, paused, ended listings
 * - Track performance metrics
 * - Handle status transitions
 * - Generate reports
 */

import { supabase } from '@/lib/supabase'

export type ListingStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'out_of_stock'
  | 'ended'
  | 'pruned'
  | 'error'

export interface ListingDetails {
  assignmentId: string
  storeId: string
  storeName: string
  skuId: string
  skuCode: string
  title: string
  status: ListingStatus
  ebayItemId?: string
  listingUrl?: string
  listedAt?: string
  endedAt?: string
  actualPrice?: number
  sellPrice: number
  costPrice: number
  views?: number
  watchers?: number
  sales?: number
  revenue?: number
  profit?: number
  lastSyncAt?: string
  daysListed?: number
}

export interface StatusSummary {
  total: number
  active: number
  paused: number
  draft: number
  ended: number
  outOfStock: number
  error: number
  byStore: Record<string, {
    storeName: string
    active: number
    total: number
  }>
}

export interface PerformanceMetrics {
  totalRevenue: number
  totalProfit: number
  totalSales: number
  avgDaysToSale: number
  conversionRate: number
  profitMargin: number
  topPerformers: Array<{
    skuCode: string
    title: string
    sales: number
    revenue: number
    profit: number
  }>
  underperformers: Array<{
    skuCode: string
    title: string
    daysListed: number
    views: number
    sales: number
  }>
}

/**
 * Get all listings with detailed info
 */
export async function getListings(options: {
  storeId?: string
  status?: ListingStatus | ListingStatus[]
  search?: string
  sortBy?: 'listed_at' | 'sales' | 'revenue' | 'profit' | 'views'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
} = {}): Promise<{ listings: ListingDetails[]; total: number }> {
  const {
    storeId,
    status,
    search,
    sortBy = 'listed_at',
    sortOrder = 'desc',
    limit = 50,
    offset = 0,
  } = options

  let query = supabase
    .from('store_sku_assignments')
    .select(`
      id,
      store_id,
      sku_id,
      listing_status,
      ebay_item_id,
      ebay_listing_url,
      listed_at,
      ended_at,
      actual_price,
      views,
      watchers,
      sales,
      revenue,
      profit,
      last_sync_at,
      stores (
        store_name
      ),
      skus (
        sku_code,
        title,
        listing_title,
        sell_price,
        cost_price
      )
    `, { count: 'exact' })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  if (status) {
    if (Array.isArray(status)) {
      query = query.in('listing_status', status)
    } else {
      query = query.eq('listing_status', status)
    }
  }

  // Map sort field to database column
  const sortField = {
    listed_at: 'listed_at',
    sales: 'sales',
    revenue: 'revenue',
    profit: 'profit',
    views: 'views',
  }[sortBy] || 'listed_at'

  query = query
    .order(sortField, { ascending: sortOrder === 'asc', nullsFirst: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error || !data) {
    console.error('Error fetching listings:', error)
    return { listings: [], total: 0 }
  }

  let listings = (data as any[]).map((row) => {
    const listedAt = row.listed_at ? new Date(row.listed_at) : null
    const now = new Date()
    const daysListed = listedAt
      ? Math.floor((now.getTime() - listedAt.getTime()) / (1000 * 60 * 60 * 24))
      : undefined

    return {
      assignmentId: row.id,
      storeId: row.store_id,
      storeName: row.stores?.store_name || 'Unknown',
      skuId: row.sku_id,
      skuCode: row.skus?.sku_code || '',
      title: row.skus?.listing_title || row.skus?.title || '',
      status: row.listing_status as ListingStatus,
      ebayItemId: row.ebay_item_id,
      listingUrl: row.ebay_listing_url,
      listedAt: row.listed_at,
      endedAt: row.ended_at,
      actualPrice: row.actual_price,
      sellPrice: row.skus?.sell_price || 0,
      costPrice: row.skus?.cost_price || 0,
      views: row.views || 0,
      watchers: row.watchers || 0,
      sales: row.sales || 0,
      revenue: row.revenue || 0,
      profit: row.profit || 0,
      lastSyncAt: row.last_sync_at,
      daysListed,
    }
  })

  // Apply search filter if provided
  if (search) {
    const searchLower = search.toLowerCase()
    listings = listings.filter(
      (l) =>
        l.title.toLowerCase().includes(searchLower) ||
        l.skuCode.toLowerCase().includes(searchLower) ||
        l.ebayItemId?.includes(search)
    )
  }

  return { listings, total: count || 0 }
}

/**
 * Get status summary across all stores
 */
export async function getStatusSummary(storeId?: string): Promise<StatusSummary> {
  let query = supabase
    .from('store_sku_assignments')
    .select(`
      listing_status,
      store_id,
      stores (store_name)
    `)

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data } = await query

  if (!data) {
    return {
      total: 0,
      active: 0,
      paused: 0,
      draft: 0,
      ended: 0,
      outOfStock: 0,
      error: 0,
      byStore: {},
    }
  }

  const summary: StatusSummary = {
    total: data.length,
    active: 0,
    paused: 0,
    draft: 0,
    ended: 0,
    outOfStock: 0,
    error: 0,
    byStore: {},
  }

  for (const row of data as any[]) {
    // Count by status
    switch (row.listing_status) {
      case 'active':
        summary.active++
        break
      case 'paused':
        summary.paused++
        break
      case 'draft':
        summary.draft++
        break
      case 'ended':
      case 'pruned':
        summary.ended++
        break
      case 'out_of_stock':
        summary.outOfStock++
        break
      case 'error':
        summary.error++
        break
    }

    // Count by store
    if (!summary.byStore[row.store_id]) {
      summary.byStore[row.store_id] = {
        storeName: row.stores?.store_name || 'Unknown',
        active: 0,
        total: 0,
      }
    }
    summary.byStore[row.store_id].total++
    if (row.listing_status === 'active') {
      summary.byStore[row.store_id].active++
    }
  }

  return summary
}

/**
 * Get performance metrics for listings
 */
export async function getPerformanceMetrics(options: {
  storeId?: string
  daysBack?: number
} = {}): Promise<PerformanceMetrics> {
  const { storeId, daysBack = 30 } = options

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  let query = supabase
    .from('store_sku_assignments')
    .select(`
      id,
      listed_at,
      sales,
      revenue,
      profit,
      views,
      skus (
        sku_code,
        title,
        listing_title
      )
    `)
    .gte('listed_at', startDate.toISOString())

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data } = await query

  if (!data || data.length === 0) {
    return {
      totalRevenue: 0,
      totalProfit: 0,
      totalSales: 0,
      avgDaysToSale: 0,
      conversionRate: 0,
      profitMargin: 0,
      topPerformers: [],
      underperformers: [],
    }
  }

  const rows = data as any[]

  // Calculate totals
  let totalRevenue = 0
  let totalProfit = 0
  let totalSales = 0
  let totalViews = 0

  for (const row of rows) {
    totalRevenue += row.revenue || 0
    totalProfit += row.profit || 0
    totalSales += row.sales || 0
    totalViews += row.views || 0
  }

  // Calculate rates
  const conversionRate = totalViews > 0 ? (totalSales / totalViews) * 100 : 0
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  // Find top performers (by profit)
  const sortedByProfit = [...rows]
    .filter((r) => r.sales > 0)
    .sort((a, b) => (b.profit || 0) - (a.profit || 0))
    .slice(0, 5)
    .map((r) => ({
      skuCode: r.skus?.sku_code || '',
      title: r.skus?.listing_title || r.skus?.title || '',
      sales: r.sales || 0,
      revenue: r.revenue || 0,
      profit: r.profit || 0,
    }))

  // Find underperformers (listed > 14 days, low/no sales)
  const now = new Date()
  const underperformers = rows
    .filter((r) => {
      const listedAt = r.listed_at ? new Date(r.listed_at) : null
      if (!listedAt) return false
      const daysListed = Math.floor((now.getTime() - listedAt.getTime()) / (1000 * 60 * 60 * 24))
      return daysListed > 14 && (r.sales || 0) === 0
    })
    .sort((a, b) => {
      const aDays = a.listed_at ? Math.floor((now.getTime() - new Date(a.listed_at).getTime()) / (1000 * 60 * 60 * 24)) : 0
      const bDays = b.listed_at ? Math.floor((now.getTime() - new Date(b.listed_at).getTime()) / (1000 * 60 * 60 * 24)) : 0
      return bDays - aDays
    })
    .slice(0, 5)
    .map((r) => ({
      skuCode: r.skus?.sku_code || '',
      title: r.skus?.listing_title || r.skus?.title || '',
      daysListed: r.listed_at
        ? Math.floor((now.getTime() - new Date(r.listed_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      views: r.views || 0,
      sales: r.sales || 0,
    }))

  return {
    totalRevenue,
    totalProfit,
    totalSales,
    avgDaysToSale: 0, // Would need sale timestamps to calculate
    conversionRate: Math.round(conversionRate * 100) / 100,
    profitMargin: Math.round(profitMargin * 100) / 100,
    topPerformers: sortedByProfit,
    underperformers,
  }
}

/**
 * Update listing status
 */
export async function updateListingStatus(
  assignmentId: string,
  newStatus: ListingStatus,
  metadata?: { reason?: string; note?: string }
): Promise<{ success: boolean; error?: string }> {
  const updateData: Record<string, any> = {
    listing_status: newStatus,
    updated_at: new Date().toISOString(),
  }

  if (newStatus === 'ended' || newStatus === 'pruned') {
    updateData.ended_at = new Date().toISOString()
  }

  if (metadata?.note) {
    updateData.status_notes = metadata.note
  }

  const { error } = await supabase
    .from('store_sku_assignments')
    .update(updateData)
    .eq('id', assignmentId)

  if (error) {
    return { success: false, error: error.message }
  }

  // Log the status change
  await supabase.from('listing_status_history').insert({
    assignment_id: assignmentId,
    old_status: null, // Would need to fetch first to get this
    new_status: newStatus,
    reason: metadata?.reason,
    changed_at: new Date().toISOString(),
  })

  return { success: true }
}

/**
 * Bulk update listing statuses
 */
export async function bulkUpdateStatus(
  assignmentIds: string[],
  newStatus: ListingStatus,
  reason?: string
): Promise<{ success: boolean; updated: number; failed: number }> {
  const updateData: Record<string, any> = {
    listing_status: newStatus,
    updated_at: new Date().toISOString(),
  }

  if (newStatus === 'ended' || newStatus === 'pruned') {
    updateData.ended_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('store_sku_assignments')
    .update(updateData)
    .in('id', assignmentIds)
    .select('id')

  if (error) {
    return { success: false, updated: 0, failed: assignmentIds.length }
  }

  const updated = data?.length || 0

  // Log history for all updated
  if (data && data.length > 0) {
    await supabase.from('listing_status_history').insert(
      data.map((row: any) => ({
        assignment_id: row.id,
        new_status: newStatus,
        reason,
        changed_at: new Date().toISOString(),
      }))
    )
  }

  return {
    success: true,
    updated,
    failed: assignmentIds.length - updated,
  }
}

/**
 * Get listings that need attention
 */
export async function getListingsNeedingAttention(storeId?: string): Promise<{
  stale: ListingDetails[]
  underperforming: ListingDetails[]
  errors: ListingDetails[]
  outOfStock: ListingDetails[]
}> {
  const { listings } = await getListings({
    storeId,
    limit: 1000,
  })

  const now = new Date()
  const staleThresholdDays = 45 // Days without activity
  const underperformThresholdDays = 21 // Days listed with no sales

  const stale: ListingDetails[] = []
  const underperforming: ListingDetails[] = []
  const errors: ListingDetails[] = []
  const outOfStock: ListingDetails[] = []

  for (const listing of listings) {
    if (listing.status === 'error') {
      errors.push(listing)
      continue
    }

    if (listing.status === 'out_of_stock') {
      outOfStock.push(listing)
      continue
    }

    if (listing.status !== 'active') {
      continue
    }

    // Check if stale (no sync in a while)
    if (listing.lastSyncAt) {
      const lastSync = new Date(listing.lastSyncAt)
      const daysSinceSync = Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSinceSync > staleThresholdDays) {
        stale.push(listing)
        continue
      }
    }

    // Check if underperforming
    if (listing.daysListed && listing.daysListed > underperformThresholdDays && listing.sales === 0) {
      underperforming.push(listing)
    }
  }

  return {
    stale: stale.slice(0, 20),
    underperforming: underperforming.slice(0, 20),
    errors: errors.slice(0, 20),
    outOfStock: outOfStock.slice(0, 20),
  }
}

/**
 * Get status history for a listing
 */
export async function getStatusHistory(assignmentId: string): Promise<Array<{
  status: ListingStatus
  reason?: string
  changedAt: string
}>> {
  const { data } = await supabase
    .from('listing_status_history')
    .select('new_status, reason, changed_at')
    .eq('assignment_id', assignmentId)
    .order('changed_at', { ascending: false })
    .limit(50)

  if (!data) {
    return []
  }

  return (data as any[]).map((row) => ({
    status: row.new_status,
    reason: row.reason,
    changedAt: row.changed_at,
  }))
}
