'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, AlertCircle, CheckCircle, Download, Loader2 } from 'lucide-react'

interface ImportResult {
  success: number
  failed: number
  errors: { row: number; error: string }[]
}

export function BulkSkuImport() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }

    setFile(selectedFile)
    setError(null)
    setResult(null)

    // Preview first 5 rows
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const rows = text.split('\n').map(row => parseCSVRow(row))
      setPreview(rows.slice(0, 6)) // Header + 5 rows
    }
    reader.readAsText(selectedFile)
  }

  function parseCSVRow(row: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < row.length; i++) {
      const char = row[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  async function handleImport() {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/skus/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Import failed')
      }

      setResult(data)
      if (data.success > 0) {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  function downloadTemplate() {
    const template = `sku_code,title,description,cost_price,sell_price,pattern_id,status
EXAMPLE-SKU-001,Example Product Title,Product description here,15.99,29.99,,ready
EXAMPLE-SKU-002,Another Product,Another description,10.50,24.99,,draft`

    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sku_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Template Download */}
      <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center">
          <FileText className="h-5 w-5 text-blue-500 mr-3" />
          <div>
            <p className="font-medium text-blue-900">CSV Template</p>
            <p className="text-sm text-blue-700">Download the template to see required columns</p>
          </div>
        </div>
        <button
          onClick={downloadTemplate}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-md hover:bg-blue-50"
        >
          <Download className="h-4 w-4 mr-1" />
          Download
        </button>
      </div>

      {/* File Upload */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
        {file ? (
          <div>
            <p className="font-medium text-gray-900">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-gray-900">Click to upload CSV</p>
            <p className="text-sm text-gray-500">or drag and drop</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-900 mb-2">Preview</h3>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {preview[0]?.map((header, i) => (
                    <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {preview.slice(1).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-2 text-gray-600 truncate max-w-xs">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`p-4 rounded-lg border ${result.failed > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center mb-2">
            <CheckCircle className={`h-5 w-5 mr-2 ${result.failed > 0 ? 'text-yellow-500' : 'text-green-500'}`} />
            <span className="font-medium">
              Import Complete: {result.success} succeeded, {result.failed} failed
            </span>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 text-sm">
              <p className="font-medium text-gray-700">Errors:</p>
              <ul className="list-disc list-inside text-gray-600 mt-1">
                {result.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>Row {err.row}: {err.error}</li>
                ))}
                {result.errors.length > 5 && (
                  <li>...and {result.errors.length - 5} more errors</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Import Button */}
      {file && !result && (
        <div className="flex justify-end">
          <button
            onClick={handleImport}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import SKUs
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
