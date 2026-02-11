'use client'

import { useState } from 'react'
import { Play, Zap, RefreshCw } from 'lucide-react'

export function PruningActionsPanel() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    totalMatched?: number
    actionsTaken?: { prune: number; pause: number; review: number }
    dryRun?: boolean
  } | null>(null)

  async function runDryRun() {
    setRunning(true)
    setResult(null)

    try {
      const response = await fetch('/api/pruning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          dryRun: true,
          maxListings: 500,
        }),
      })

      const data = await response.json()
      setResult({
        success: data.success,
        totalMatched: data.result?.totalMatched,
        actionsTaken: data.result?.actionsTaken,
        dryRun: true,
      })
    } catch (error) {
      setResult({ success: false })
    } finally {
      setRunning(false)
    }
  }

  async function runPruning() {
    if (!confirm('This will execute real pruning actions. Are you sure?')) {
      return
    }

    setRunning(true)
    setResult(null)

    try {
      const response = await fetch('/api/pruning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          dryRun: false,
          maxListings: 500,
        }),
      })

      const data = await response.json()
      setResult({
        success: data.success,
        totalMatched: data.result?.totalMatched,
        actionsTaken: data.result?.actionsTaken,
        dryRun: false,
      })
    } catch (error) {
      setResult({ success: false })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={runDryRun}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/20 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50"
      >
        {running ? (
          <RefreshCw className="h-5 w-5 animate-spin" />
        ) : (
          <Play className="h-5 w-5" />
        )}
        <span className="font-medium">Preview (Dry Run)</span>
      </button>

      <button
        onClick={runPruning}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white rounded-lg text-indigo-600 hover:bg-white/90 transition-colors disabled:opacity-50"
      >
        {running ? (
          <RefreshCw className="h-5 w-5 animate-spin" />
        ) : (
          <Zap className="h-5 w-5" />
        )}
        <span className="font-medium">Run Pruning Now</span>
      </button>

      {result && (
        <div className={`p-3 rounded-lg text-sm ${
          result.success ? 'bg-green-500/20' : 'bg-red-500/20'
        }`}>
          {result.success ? (
            <>
              <p className="font-medium">
                {result.dryRun ? 'Preview Complete' : 'Pruning Complete'}
              </p>
              {result.totalMatched !== undefined && (
                <p className="text-white/80 text-xs mt-1">
                  {result.totalMatched} listings matched
                  {result.actionsTaken && (
                    <>
                      {' - '}
                      {result.actionsTaken.prune} pruned,
                      {' '}{result.actionsTaken.pause} paused,
                      {' '}{result.actionsTaken.review} for review
                    </>
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="font-medium">Error running pruning</p>
          )}
        </div>
      )}
    </div>
  )
}
