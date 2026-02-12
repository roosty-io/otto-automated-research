// OTTO Research Labs - Batch Database Operations
// Optimized batch inserts, updates, and queries to prevent N+1 issues

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// BATCH INSERT
// ============================================================================

export interface BatchInsertResult<T> {
  success: boolean
  insertedCount: number
  failedCount: number
  data?: T[]
  errors?: string[]
}

/**
 * Batch insert with chunking to avoid payload limits
 */
export async function batchInsert<T extends Record<string, unknown>>(
  table: string,
  records: T[],
  options: {
    chunkSize?: number
    onConflict?: string  // Column name for upsert
    ignoreDuplicates?: boolean
    returning?: boolean
  } = {}
): Promise<BatchInsertResult<T>> {
  const {
    chunkSize = 100,
    onConflict,
    ignoreDuplicates = false,
    returning = false
  } = options

  if (records.length === 0) {
    return { success: true, insertedCount: 0, failedCount: 0 }
  }

  const allData: T[] = []
  const errors: string[] = []
  let insertedCount = 0
  let failedCount = 0

  // Process in chunks
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize)

    try {
      let query = supabase.from(table)

      if (onConflict) {
        query = query.upsert(chunk, {
          onConflict,
          ignoreDuplicates
        }) as any
      } else {
        query = query.insert(chunk) as any
      }

      if (returning) {
        query = query.select() as any
      }

      const { data, error } = await query

      if (error) {
        errors.push(`Chunk ${Math.floor(i / chunkSize) + 1}: ${error.message}`)
        failedCount += chunk.length
      } else {
        insertedCount += chunk.length
        if (data) {
          allData.push(...(data as T[]))
        }
      }
    } catch (err) {
      errors.push(`Chunk ${Math.floor(i / chunkSize) + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      failedCount += chunk.length
    }
  }

  return {
    success: failedCount === 0,
    insertedCount,
    failedCount,
    data: returning ? allData : undefined,
    errors: errors.length > 0 ? errors : undefined
  }
}

// ============================================================================
// BATCH UPDATE
// ============================================================================

export interface BatchUpdateResult {
  success: boolean
  updatedCount: number
  failedCount: number
  errors?: string[]
}

/**
 * Batch update by IDs
 */
export async function batchUpdateByIds<T extends Record<string, unknown>>(
  table: string,
  ids: string[],
  updates: Partial<T>,
  options: {
    chunkSize?: number
    idColumn?: string
  } = {}
): Promise<BatchUpdateResult> {
  const { chunkSize = 100, idColumn = 'id' } = options

  if (ids.length === 0) {
    return { success: true, updatedCount: 0, failedCount: 0 }
  }

  const errors: string[] = []
  let updatedCount = 0
  let failedCount = 0

  // Process in chunks
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)

    try {
      const { error, count } = await supabase
        .from(table)
        .update(updates)
        .in(idColumn, chunk)

      if (error) {
        errors.push(`Chunk ${Math.floor(i / chunkSize) + 1}: ${error.message}`)
        failedCount += chunk.length
      } else {
        updatedCount += count || chunk.length
      }
    } catch (err) {
      errors.push(`Chunk ${Math.floor(i / chunkSize) + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      failedCount += chunk.length
    }
  }

  return {
    success: failedCount === 0,
    updatedCount,
    failedCount,
    errors: errors.length > 0 ? errors : undefined
  }
}

// ============================================================================
// BATCH QUERY (prevent N+1)
// ============================================================================

/**
 * Fetch related records in batch to prevent N+1 queries
 */
export async function fetchRelated<T>(
  table: string,
  foreignKey: string,
  ids: string[],
  options: {
    select?: string
    orderBy?: string
    ascending?: boolean
  } = {}
): Promise<Map<string, T[]>> {
  const { select = '*', orderBy, ascending = true } = options

  if (ids.length === 0) {
    return new Map()
  }

  // Remove duplicates
  const uniqueIds = [...new Set(ids)]

  let query = supabase
    .from(table)
    .select(select)
    .in(foreignKey, uniqueIds)

  if (orderBy) {
    query = query.order(orderBy, { ascending })
  }

  const { data, error } = await query

  if (error || !data) {
    console.error(`[BatchQuery] Failed to fetch ${table}:`, error)
    return new Map()
  }

  // Group by foreign key
  const grouped = new Map<string, T[]>()
  for (const record of data as any[]) {
    const key = record[foreignKey]
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(record as T)
  }

  return grouped
}

/**
 * Fetch single related record per ID
 */
export async function fetchRelatedSingle<T>(
  table: string,
  foreignKey: string,
  ids: string[],
  options: {
    select?: string
  } = {}
): Promise<Map<string, T>> {
  const { select = '*' } = options

  if (ids.length === 0) {
    return new Map()
  }

  const uniqueIds = [...new Set(ids)]

  const { data, error } = await supabase
    .from(table)
    .select(select)
    .in(foreignKey, uniqueIds)

  if (error || !data) {
    console.error(`[BatchQuery] Failed to fetch ${table}:`, error)
    return new Map()
  }

  const mapped = new Map<string, T>()
  for (const record of data as any[]) {
    mapped.set(record[foreignKey], record as T)
  }

  return mapped
}

// ============================================================================
// AGGREGATION QUERIES
// ============================================================================

/**
 * Get counts grouped by a column
 */
export async function getCountsByColumn(
  table: string,
  groupByColumn: string,
  filter?: { column: string; value: unknown }
): Promise<Map<string, number>> {
  // Use RPC for better performance on large tables
  try {
    let query = supabase
      .from(table)
      .select(groupByColumn)

    if (filter) {
      query = query.eq(filter.column, filter.value)
    }

    const { data, error } = await query

    if (error || !data) {
      return new Map()
    }

    const counts = new Map<string, number>()
    for (const record of data as any[]) {
      const key = String(record[groupByColumn] || 'null')
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    return counts
  } catch {
    return new Map()
  }
}

/**
 * Get aggregated metrics for dashboard (single query)
 */
export async function getDashboardMetrics(storeId?: string): Promise<{
  activeListings: number
  pendingJobs: number
  todayOrders: number
  todayRevenue: number
}> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Run all queries in parallel
  const [listingsResult, jobsResult, ordersResult] = await Promise.all([
    // Active listings count
    supabase
      .from('store_sku_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('listing_status', 'active')
      .then(r => storeId
        ? supabase.from('store_sku_assignments')
            .select('*', { count: 'exact', head: true })
            .eq('listing_status', 'active')
            .eq('store_id', storeId)
        : r
      ),

    // Pending jobs count
    supabase
      .from('listing_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),

    // Today's orders with revenue
    supabase
      .from('orders')
      .select('total_amount')
      .gte('order_date', today.toISOString())
  ])

  const orders = ordersResult.data || []
  const todayRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

  return {
    activeListings: listingsResult.count || 0,
    pendingJobs: jobsResult.count || 0,
    todayOrders: orders.length,
    todayRevenue
  }
}

// ============================================================================
// TRANSACTION-LIKE OPERATIONS
// ============================================================================

/**
 * Execute multiple operations atomically (best-effort, not true transactions)
 * If any operation fails, attempts rollback of previous operations
 */
export async function executeWithRollback<T>(
  operations: Array<{
    execute: () => Promise<T>
    rollback: (result: T) => Promise<void>
  }>
): Promise<{ success: boolean; results: T[]; error?: string }> {
  const results: T[] = []
  const completedOps: Array<{ result: T; rollback: (result: T) => Promise<void> }> = []

  for (const op of operations) {
    try {
      const result = await op.execute()
      results.push(result)
      completedOps.push({ result, rollback: op.rollback })
    } catch (error) {
      // Attempt rollback of completed operations
      console.error('[Rollback] Operation failed, rolling back...')

      for (const completed of completedOps.reverse()) {
        try {
          await completed.rollback(completed.result)
        } catch (rollbackError) {
          console.error('[Rollback] Rollback failed:', rollbackError)
        }
      }

      return {
        success: false,
        results,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  return { success: true, results }
}

// ============================================================================
// OPTIMIZED STORE SKU ASSIGNMENT
// ============================================================================

/**
 * Assign multiple SKUs to a store in a single batch operation
 */
export async function batchAssignSkusToStore(
  storeId: string,
  skuIds: string[],
  options: {
    markup?: number
    listingStatus?: string
  } = {}
): Promise<BatchInsertResult<unknown>> {
  const { markup = 1.3, listingStatus = 'pending' } = options

  if (skuIds.length === 0) {
    return { success: true, insertedCount: 0, failedCount: 0 }
  }

  // Fetch SKU data for pricing
  const { data: skus } = await supabase
    .from('skus')
    .select('id, amazon_price, ebay_price')
    .in('id', skuIds)

  if (!skus || skus.length === 0) {
    return { success: false, insertedCount: 0, failedCount: skuIds.length, errors: ['No SKUs found'] }
  }

  // Build assignment records
  const assignments = skus.map(sku => ({
    store_id: storeId,
    sku_id: sku.id,
    listing_status: listingStatus,
    current_price: sku.ebay_price || (sku.amazon_price ? sku.amazon_price * markup : null),
    created_at: new Date().toISOString()
  }))

  // Batch insert with conflict handling
  return batchInsert('store_sku_assignments', assignments, {
    onConflict: 'store_id,sku_id',
    ignoreDuplicates: true,
    chunkSize: 50
  })
}

/**
 * Update listing statuses in batch
 */
export async function batchUpdateListingStatus(
  assignmentIds: string[],
  status: string,
  additionalData?: Record<string, unknown>
): Promise<BatchUpdateResult> {
  const updates = {
    listing_status: status,
    updated_at: new Date().toISOString(),
    ...additionalData
  }

  return batchUpdateByIds('store_sku_assignments', assignmentIds, updates)
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  supabase
}
