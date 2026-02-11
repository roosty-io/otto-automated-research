/**
 * Database Admin Service
 *
 * Provides administrative capabilities for database management:
 * - Table introspection and schema viewing
 * - Data browsing and editing
 * - Query execution
 * - System health monitoring
 */

import { supabase } from '@/lib/supabase'

export interface TableInfo {
  name: string
  schema: string
  rowCount: number
  sizeBytes: number
  columns: ColumnInfo[]
  primaryKey?: string[]
  foreignKeys: ForeignKeyInfo[]
  indexes: IndexInfo[]
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue?: string
  isPrimaryKey: boolean
  isForeignKey: boolean
  references?: {
    table: string
    column: string
  }
}

export interface ForeignKeyInfo {
  name: string
  columns: string[]
  referencedTable: string
  referencedColumns: string[]
  onDelete: string
  onUpdate: string
}

export interface IndexInfo {
  name: string
  columns: string[]
  isUnique: boolean
  isPrimary: boolean
}

export interface QueryResult {
  rows: any[]
  rowCount: number
  fields: string[]
  executionTime: number
  error?: string
}

export interface SystemHealth {
  database: {
    connected: boolean
    latency: number
    activeConnections?: number
    maxConnections?: number
  }
  tables: {
    total: number
    totalRows: number
    totalSize: string
  }
  recentActivity: {
    skusAdded24h: number
    storesAdded24h: number
    jobsProcessed24h: number
    priceChanges24h: number
  }
}

/**
 * Get list of all tables in the database
 */
export async function getTables(): Promise<string[]> {
  // Query information_schema for tables
  const { data, error } = await supabase
    .from('information_schema.tables' as any)
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE')

  if (error) {
    // Fallback to known tables if schema query fails
    return getKnownTables()
  }

  return (data || []).map((t: any) => t.table_name)
}

/**
 * Get known application tables
 */
export function getKnownTables(): string[] {
  return [
    'skus',
    'stores',
    'store_sku_assignments',
    'patterns',
    'research_jobs',
    'sales_records',
    'price_change_log',
    'pruning_log',
    'pruning_reviews',
    'repricing_rules',
    'pending_price_changes',
    'competitor_prices',
    'competitor_price_history',
    'monitoring_queue',
    'listing_queue',
    'listing_status_log',
  ]
}

/**
 * Get detailed information about a table
 */
export async function getTableInfo(tableName: string): Promise<TableInfo | null> {
  try {
    // Get row count
    const { count, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error(`[Admin] Error getting count for ${tableName}:`, countError)
    }

    // Get column info by querying a single row
    const { data: sampleRow } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)
      .single()

    const columns: ColumnInfo[] = []

    if (sampleRow) {
      for (const [key, value] of Object.entries(sampleRow)) {
        columns.push({
          name: key,
          type: inferColumnType(value),
          nullable: value === null,
          isPrimaryKey: key === 'id',
          isForeignKey: key.endsWith('_id') && key !== 'id',
          references: key.endsWith('_id') && key !== 'id'
            ? inferForeignKey(key)
            : undefined,
        })
      }
    }

    return {
      name: tableName,
      schema: 'public',
      rowCount: count || 0,
      sizeBytes: 0, // Would need pg_table_size function
      columns,
      primaryKey: ['id'],
      foreignKeys: [],
      indexes: [],
    }
  } catch (error) {
    console.error(`[Admin] Error getting table info for ${tableName}:`, error)
    return null
  }
}

/**
 * Infer column type from value
 */
function inferColumnType(value: any): string {
  if (value === null) return 'unknown'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'numeric'
  }
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') {
    if (value.match(/^\d{4}-\d{2}-\d{2}/)) return 'timestamp'
    if (value.match(/^[0-9a-f-]{36}$/i)) return 'uuid'
    return 'text'
  }
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'jsonb'
  return 'unknown'
}

/**
 * Infer foreign key reference from column name
 */
function inferForeignKey(columnName: string): { table: string; column: string } | undefined {
  const tableMap: Record<string, string> = {
    'sku_id': 'skus',
    'store_id': 'stores',
    'pattern_id': 'patterns',
    'job_id': 'research_jobs',
    'assignment_id': 'store_sku_assignments',
    'rule_id': 'repricing_rules',
  }

  const table = tableMap[columnName]
  if (table) {
    return { table, column: 'id' }
  }
  return undefined
}

/**
 * Get paginated data from a table
 */
export async function getTableData(
  tableName: string,
  options: {
    page?: number
    pageSize?: number
    orderBy?: string
    orderDirection?: 'asc' | 'desc'
    filters?: Record<string, any>
  } = {}
): Promise<{
  data: any[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}> {
  const {
    page = 1,
    pageSize = 50,
    orderBy = 'created_at',
    orderDirection = 'desc',
    filters = {},
  } = options

  const offset = (page - 1) * pageSize

  // Get total count
  let countQuery = supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      countQuery = countQuery.eq(key, value)
    }
  }

  const { count } = await countQuery

  // Get data
  let dataQuery = supabase
    .from(tableName)
    .select('*')
    .range(offset, offset + pageSize - 1)
    .order(orderBy, { ascending: orderDirection === 'asc' })

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      dataQuery = dataQuery.eq(key, value)
    }
  }

  const { data, error } = await dataQuery

  if (error) {
    console.error(`[Admin] Error fetching data from ${tableName}:`, error)
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
    }
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  }
}

/**
 * Insert a new row into a table
 */
export async function insertRow(
  tableName: string,
  data: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .insert(data)
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Update a row in a table
 */
export async function updateRow(
  tableName: string,
  id: string,
  data: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Delete a row from a table
 */
export async function deleteRow(
  tableName: string,
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Execute a raw SQL query (read-only)
 */
export async function executeQuery(sql: string): Promise<QueryResult> {
  const startTime = Date.now()

  // Security: Only allow SELECT queries
  const normalizedSql = sql.trim().toLowerCase()
  if (!normalizedSql.startsWith('select')) {
    return {
      rows: [],
      rowCount: 0,
      fields: [],
      executionTime: 0,
      error: 'Only SELECT queries are allowed for security reasons',
    }
  }

  // Prevent dangerous operations
  const forbidden = ['delete', 'drop', 'truncate', 'update', 'insert', 'alter', 'create']
  for (const word of forbidden) {
    if (normalizedSql.includes(word)) {
      return {
        rows: [],
        rowCount: 0,
        fields: [],
        executionTime: 0,
        error: `Query contains forbidden keyword: ${word}`,
      }
    }
  }

  try {
    // Use RPC if available, otherwise fallback to simulating
    const { data, error } = await supabase.rpc('execute_sql', { query: sql })

    if (error) {
      // If RPC doesn't exist, provide helpful error
      return {
        rows: [],
        rowCount: 0,
        fields: [],
        executionTime: Date.now() - startTime,
        error: `Query execution not available: ${error.message}. Use table browser instead.`,
      }
    }

    const rows = data || []
    const fields = rows.length > 0 ? Object.keys(rows[0]) : []

    return {
      rows,
      rowCount: rows.length,
      fields,
      executionTime: Date.now() - startTime,
    }
  } catch (error) {
    return {
      rows: [],
      rowCount: 0,
      fields: [],
      executionTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get system health metrics
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const startTime = Date.now()

  // Test database connection
  const { error: pingError } = await supabase
    .from('skus')
    .select('id', { count: 'exact', head: true })

  const latency = Date.now() - startTime

  // Get table counts
  const tables = getKnownTables()
  let totalRows = 0

  const tableCounts = await Promise.all(
    tables.slice(0, 5).map(async (table) => {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      return count || 0
    })
  )

  totalRows = tableCounts.reduce((sum, count) => sum + count, 0)

  // Get recent activity
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [skusResult, storesResult, jobsResult, priceResult] = await Promise.all([
    supabase
      .from('skus')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString()),
    supabase
      .from('stores')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString()),
    supabase
      .from('research_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('updated_at', yesterday.toISOString()),
    supabase
      .from('price_change_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString()),
  ])

  return {
    database: {
      connected: !pingError,
      latency,
    },
    tables: {
      total: tables.length,
      totalRows,
      totalSize: 'N/A',
    },
    recentActivity: {
      skusAdded24h: skusResult.count || 0,
      storesAdded24h: storesResult.count || 0,
      jobsProcessed24h: jobsResult.count || 0,
      priceChanges24h: priceResult.count || 0,
    },
  }
}

/**
 * Get table statistics
 */
export async function getTableStats(): Promise<Array<{
  name: string
  rowCount: number
  lastModified?: string
}>> {
  const tables = getKnownTables()
  const stats: Array<{
    name: string
    rowCount: number
    lastModified?: string
  }> = []

  for (const table of tables) {
    try {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })

      // Try to get last modified
      const { data: lastRow } = await supabase
        .from(table)
        .select('updated_at, created_at')
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .single()

      stats.push({
        name: table,
        rowCount: count || 0,
        lastModified: lastRow?.updated_at || lastRow?.created_at,
      })
    } catch {
      stats.push({
        name: table,
        rowCount: 0,
      })
    }
  }

  return stats.sort((a, b) => b.rowCount - a.rowCount)
}

/**
 * Export table data to JSON
 */
export async function exportTableData(
  tableName: string,
  options: {
    format?: 'json' | 'csv'
    limit?: number
  } = {}
): Promise<{ data: string; filename: string; mimeType: string }> {
  const { format = 'json', limit = 10000 } = options

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(limit)

  if (error || !data) {
    throw new Error(`Failed to export: ${error?.message || 'No data'}`)
  }

  const timestamp = new Date().toISOString().split('T')[0]

  if (format === 'csv') {
    const headers = data.length > 0 ? Object.keys(data[0]).join(',') : ''
    const rows = data.map(row =>
      Object.values(row)
        .map(v => JSON.stringify(v ?? ''))
        .join(',')
    )
    return {
      data: [headers, ...rows].join('\n'),
      filename: `${tableName}_${timestamp}.csv`,
      mimeType: 'text/csv',
    }
  }

  return {
    data: JSON.stringify(data, null, 2),
    filename: `${tableName}_${timestamp}.json`,
    mimeType: 'application/json',
  }
}

/**
 * Bulk delete rows from a table
 */
export async function bulkDelete(
  tableName: string,
  ids: string[]
): Promise<{ success: boolean; deleted: number; error?: string }> {
  try {
    const { error, count } = await supabase
      .from(tableName)
      .delete()
      .in('id', ids)

    if (error) {
      return { success: false, deleted: 0, error: error.message }
    }

    return { success: true, deleted: count || ids.length }
  } catch (error) {
    return {
      success: false,
      deleted: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get database activity logs
 */
export async function getActivityLogs(options: {
  limit?: number
  type?: string
} = {}): Promise<any[]> {
  const { limit = 100, type } = options

  // Combine logs from different sources
  const logs: any[] = []

  // Price change logs
  const { data: priceChanges } = await supabase
    .from('price_change_log')
    .select('id, created_at, sku_id, previous_price, new_price, rule_name')
    .order('created_at', { ascending: false })
    .limit(Math.floor(limit / 3))

  for (const log of priceChanges || []) {
    logs.push({
      id: log.id,
      type: 'price_change',
      timestamp: log.created_at,
      description: `Price changed for SKU ${log.sku_id}: $${log.previous_price} → $${log.new_price}`,
      details: log,
    })
  }

  // Pruning logs
  const { data: pruningLogs } = await supabase
    .from('pruning_log')
    .select('id, created_at, sku_id, action, reason')
    .order('created_at', { ascending: false })
    .limit(Math.floor(limit / 3))

  for (const log of pruningLogs || []) {
    logs.push({
      id: log.id,
      type: 'pruning',
      timestamp: log.created_at,
      description: `${log.action} action on SKU ${log.sku_id}: ${log.reason}`,
      details: log,
    })
  }

  // Research job completions
  const { data: jobs } = await supabase
    .from('research_jobs')
    .select('id, updated_at, name, status, items_found')
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(Math.floor(limit / 3))

  for (const job of jobs || []) {
    logs.push({
      id: job.id,
      type: 'job_completed',
      timestamp: job.updated_at,
      description: `Job "${job.name}" completed with ${job.items_found || 0} items`,
      details: job,
    })
  }

  // Sort all logs by timestamp
  logs.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  // Filter by type if specified
  if (type) {
    return logs.filter(l => l.type === type).slice(0, limit)
  }

  return logs.slice(0, limit)
}
