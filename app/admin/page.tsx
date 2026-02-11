'use client'

import { useState, useEffect } from 'react'

interface TableStat {
  name: string
  rowCount: number
  lastModified?: string
}

interface SystemHealth {
  database: {
    connected: boolean
    latency: number
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

interface ActivityLog {
  id: string
  type: string
  timestamp: string
  description: string
}

type TabType = 'overview' | 'tables' | 'query' | 'activity'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [tableStats, setTableStats] = useState<TableStat[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const [healthRes, statsRes, activityRes] = await Promise.all([
        fetch('/api/admin/health?type=health'),
        fetch('/api/admin/tables?action=stats'),
        fetch('/api/admin/health?type=activity&limit=20'),
      ])

      if (healthRes.ok) {
        const data = await healthRes.json()
        setHealth(data.health)
      }

      if (statsRes.ok) {
        const data = await statsRes.json()
        setTableStats(data.stats || [])
      }

      if (activityRes.ok) {
        const data = await activityRes.json()
        setActivityLogs(data.logs || [])
      }
    } catch (err) {
      setError('Failed to load admin data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tables', label: 'Tables' },
    { id: 'query', label: 'Query' },
    { id: 'activity', label: 'Activity' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Database Admin</h1>
            <p className="text-gray-600 mt-1">
              Manage database tables and monitor system health
            </p>
          </div>
          <button
            onClick={loadData}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading admin data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewTab
                health={health}
                tableStats={tableStats}
                activityLogs={activityLogs}
              />
            )}

            {activeTab === 'tables' && (
              <TablesTab stats={tableStats} onRefresh={loadData} />
            )}

            {activeTab === 'query' && <QueryTab />}

            {activeTab === 'activity' && (
              <ActivityTab logs={activityLogs} onRefresh={loadData} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OverviewTab({
  health,
  tableStats,
  activityLogs,
}: {
  health: SystemHealth | null
  tableStats: TableStat[]
  activityLogs: ActivityLog[]
}) {
  return (
    <div className="space-y-6">
      {/* Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">Database</p>
            <span
              className={`w-3 h-3 rounded-full ${
                health?.database.connected ? 'bg-green-500' : 'bg-red-500'
              }`}
            ></span>
          </div>
          <p className="text-2xl font-bold mt-1">
            {health?.database.connected ? 'Connected' : 'Disconnected'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {health?.database.latency}ms latency
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Tables</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {health?.tables.total || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {health?.tables.totalRows.toLocaleString() || 0} total rows
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">SKUs Added (24h)</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {health?.recentActivity.skusAdded24h || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {health?.recentActivity.storesAdded24h || 0} stores added
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Jobs Processed (24h)</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {health?.recentActivity.jobsProcessed24h || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {health?.recentActivity.priceChanges24h || 0} price changes
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Tables */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Table Sizes
          </h3>
          <div className="space-y-3">
            {tableStats.slice(0, 8).map(stat => (
              <div key={stat.name} className="flex justify-between items-center">
                <span className="font-mono text-sm text-gray-700">
                  {stat.name}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {stat.rowCount.toLocaleString()} rows
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {activityLogs.slice(0, 6).map(log => (
              <div key={log.id} className="flex items-start gap-3">
                <span
                  className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                    log.type === 'price_change'
                      ? 'bg-green-500'
                      : log.type === 'pruning'
                        ? 'bg-red-500'
                        : 'bg-blue-500'
                  }`}
                ></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">
                    {log.description}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TablesTab({
  stats,
  onRefresh,
}: {
  stats: TableStat[]
  onRefresh: () => void
}) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableData, setTableData] = useState<any[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  })
  const [loadingData, setLoadingData] = useState(false)

  async function loadTableData(table: string, page = 1) {
    setLoadingData(true)
    setSelectedTable(table)

    try {
      const res = await fetch(
        `/api/admin/tables?action=data&table=${table}&page=${page}&pageSize=${pagination.pageSize}`
      )
      if (res.ok) {
        const data = await res.json()
        setTableData(data.data || [])
        setPagination({
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages: data.totalPages,
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingData(false)
    }
  }

  async function handleExport(table: string, format: 'json' | 'csv') {
    window.open(
      `/api/admin/tables?action=export&table=${table}&format=${format}`,
      '_blank'
    )
  }

  async function handleDelete(id: string) {
    if (!selectedTable || !confirm('Are you sure you want to delete this row?')) {
      return
    }

    try {
      const res = await fetch('/api/admin/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          table: selectedTable,
          id,
        }),
      })

      if (res.ok) {
        loadTableData(selectedTable, pagination.page)
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Table List */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Tables</h3>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {stats.map(stat => (
              <button
                key={stat.name}
                onClick={() => loadTableData(stat.name)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                  selectedTable === stat.name
                    ? 'bg-blue-100 text-blue-700'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="flex justify-between">
                  <span className="font-mono">{stat.name}</span>
                  <span className="text-gray-500">
                    {stat.rowCount.toLocaleString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Table Data */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200">
          {selectedTable ? (
            <div>
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {selectedTable}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {pagination.total.toLocaleString()} rows
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExport(selectedTable, 'json')}
                    className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => handleExport(selectedTable, 'csv')}
                    className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              {loadingData ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                </div>
              ) : tableData.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(tableData[0]).slice(0, 6).map(col => (
                            <th
                              key={col}
                              className="text-left p-3 font-medium text-gray-600"
                            >
                              {col}
                            </th>
                          ))}
                          <th className="text-right p-3 font-medium text-gray-600">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {tableData.map((row, idx) => (
                          <tr key={row.id || idx} className="hover:bg-gray-50">
                            {Object.entries(row)
                              .slice(0, 6)
                              .map(([key, value]) => (
                                <td key={key} className="p-3 max-w-xs truncate">
                                  {formatValue(value)}
                                </td>
                              ))}
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleDelete(row.id)}
                                className="text-red-600 hover:text-red-700 text-xs"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {pagination.totalPages > 1 && (
                    <div className="p-4 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-sm text-gray-500">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            loadTableData(selectedTable, pagination.page - 1)
                          }
                          disabled={pagination.page <= 1}
                          className="px-3 py-1 text-sm bg-gray-100 rounded disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() =>
                            loadTableData(selectedTable, pagination.page + 1)
                          }
                          disabled={pagination.page >= pagination.totalPages}
                          className="px-3 py-1 text-sm bg-gray-100 rounded disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No data in this table
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              Select a table to view data
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function QueryTab() {
  const [sql, setSql] = useState(
    'SELECT * FROM skus ORDER BY created_at DESC LIMIT 10'
  )
  const [result, setResult] = useState<any>(null)
  const [executing, setExecuting] = useState(false)

  async function executeQuery() {
    setExecuting(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      })

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ error: 'Failed to execute query' })
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-4">SQL Query (Read-Only)</h3>
        <div className="space-y-4">
          <textarea
            value={sql}
            onChange={e => setSql(e.target.value)}
            className="w-full h-32 font-mono text-sm p-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter SELECT query..."
          />
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              Only SELECT queries are allowed for security
            </p>
            <button
              onClick={executeQuery}
              disabled={executing}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {executing ? 'Executing...' : 'Execute'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Results</h3>
            {result.executionTime !== undefined && (
              <span className="text-sm text-gray-500">
                {result.executionTime}ms | {result.rowCount} rows
              </span>
            )}
          </div>

          {result.error ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg">
              {result.error}
            </div>
          ) : result.rows && result.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {result.fields.map((field: string) => (
                      <th
                        key={field}
                        className="text-left p-3 font-medium text-gray-600"
                      >
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.rows.map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {result.fields.map((field: string) => (
                        <td key={field} className="p-3 max-w-xs truncate">
                          {formatValue(row[field])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-gray-500 text-center py-4">
              Query returned no results
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActivityTab({
  logs,
  onRefresh,
}: {
  logs: ActivityLog[]
  onRefresh: () => void
}) {
  const [filter, setFilter] = useState<string>('all')

  const filteredLogs =
    filter === 'all' ? logs : logs.filter(l => l.type === filter)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          {['all', 'price_change', 'pruning', 'job_completed'].map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-3 py-1 rounded-full text-sm ${
                filter === type
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {type === 'all'
                ? 'All'
                : type
                    .split('_')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')}
            </button>
          ))}
        </div>
        <button
          onClick={onRefresh}
          className="text-blue-600 hover:text-blue-700 text-sm"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="divide-y divide-gray-100">
          {filteredLogs.length > 0 ? (
            filteredLogs.map(log => (
              <div key={log.id} className="p-4 flex items-start gap-4">
                <span
                  className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${
                    log.type === 'price_change'
                      ? 'bg-green-500'
                      : log.type === 'pruning'
                        ? 'bg-red-500'
                        : 'bg-blue-500'
                  }`}
                ></span>
                <div className="flex-1">
                  <p className="text-gray-900">{log.description}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {new Date(log.timestamp).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                  {log.type.replace('_', ' ')}
                </span>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500">
              No activity logs found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(value).toLocaleString()
  }
  return String(value)
}
