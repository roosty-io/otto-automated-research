/**
 * Admin Module
 *
 * Database administration and system monitoring tools.
 */

export {
  type TableInfo,
  type ColumnInfo,
  type ForeignKeyInfo,
  type IndexInfo,
  type QueryResult,
  type SystemHealth,
  getTables,
  getKnownTables,
  getTableInfo,
  getTableData,
  insertRow,
  updateRow,
  deleteRow,
  executeQuery,
  getSystemHealth,
  getTableStats,
  exportTableData,
  bulkDelete,
  getActivityLogs,
} from './database-service'
