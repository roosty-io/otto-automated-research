/**
 * Store Pipeline Test Endpoint
 *
 * Runs a controlled test of the research pipeline for a specific store.
 * Used for validating the system before scaling to production.
 *
 * POST /api/test/store-pipeline
 * {
 *   storeId?: string,       // Store to associate results with (optional for test)
 *   testConfig: {
 *     category: string,     // Product category to search
 *     query?: string,       // Optional search query
 *     maxProducts: number,  // Number of products to process
 *     stages: 'research_only' | 'research_sku' | 'full_pipeline',
 *     priceRange?: { min: number, max: number },
 *     minSold?: number,
 *   }
 * }
 *
 * GET /api/test/store-pipeline?pipelineId=xxx
 * Returns test progress and results
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  startResearchPipeline,
  getPipelineStatus,
  type ResearchPipelineOptions,
} from '@/lib/pipeline'

export interface TestConfig {
  category: string
  query?: string
  maxProducts: number
  stages: 'research_only' | 'research_sku' | 'full_pipeline'
  priceRange?: { min: number; max: number }
  minSold?: number
  dateRange?: '7' | '14' | '30' | '90'
}

interface TestRunResult {
  testId: string
  pipelineId: string
  storeId?: string
  config: TestConfig
  status: 'started' | 'running' | 'completed' | 'failed'
  startedAt: string
  progress?: {
    stage: string
    percent: number
    productsFound: number
    productsSourced: number
    skusGenerated: number
  }
  results?: {
    totalProducts: number
    qualifiedProducts: number
    skusCreated: number
    avgCassiniScore?: number
    pricingStats?: {
      avgBuyPrice: number
      avgSellPrice: number
      avgProfit: number
    }
  }
  errors?: string[]
}

// In-memory test run tracking (for active tests)
const activeTests = new Map<string, TestRunResult>()

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { storeId, testConfig } = body as { storeId?: string; testConfig: TestConfig }

    // Validate test config
    if (!testConfig?.category) {
      return NextResponse.json({ error: 'testConfig.category is required' }, { status: 400 })
    }

    if (!testConfig.maxProducts || testConfig.maxProducts < 1 || testConfig.maxProducts > 100) {
      return NextResponse.json(
        { error: 'testConfig.maxProducts must be between 1 and 100' },
        { status: 400 }
      )
    }

    // Validate store exists if provided
    if (storeId) {
      const { data: store, error } = await supabase
        .from('stores')
        .select('id, store_name, is_active')
        .eq('id', storeId)
        .single()

      if (error || !store) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 })
      }

      if (!store.is_active) {
        return NextResponse.json({ error: 'Store is not active' }, { status: 400 })
      }
    }

    // Map stages config to pipeline options
    const stageOptions = {
      research_only: {
        autoSourceFromAmazon: true,
        autoNormalize: false,
        autoGenerateSkus: false,
      },
      research_sku: {
        autoSourceFromAmazon: true,
        autoNormalize: true,
        autoGenerateSkus: true,
      },
      full_pipeline: {
        autoSourceFromAmazon: true,
        autoNormalize: true,
        autoGenerateSkus: true,
      },
    }

    // Build pipeline options
    const pipelineOptions: ResearchPipelineOptions = {
      category: testConfig.category,
      query: testConfig.query,
      maxProducts: testConfig.maxProducts,
      minPrice: testConfig.priceRange?.min,
      maxPrice: testConfig.priceRange?.max,
      minSold: testConfig.minSold ?? 5,
      dateRange: testConfig.dateRange ?? '30',
      storeId,
      testMode: true,
      ...stageOptions[testConfig.stages],
      // Enable Cassini for all tests
      cassiniOptimization: {
        enabled: true,
        minCassiniScore: 50,
        prioritizeByVisibility: true,
        optimizeTitles: true,
        targetTopRatedPlus: false,
      },
    }

    // Start the pipeline
    const result = await startResearchPipeline(pipelineOptions)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to start pipeline', pipelineId: result.pipelineId },
        { status: 500 }
      )
    }

    // Create test run record
    const testId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const testRun: TestRunResult = {
      testId,
      pipelineId: result.pipelineId,
      storeId,
      config: testConfig,
      status: 'started',
      startedAt: new Date().toISOString(),
      progress: {
        stage: result.progress.stage,
        percent: result.progress.progress,
        productsFound: 0,
        productsSourced: 0,
        skusGenerated: 0,
      },
    }

    // Track active test
    activeTests.set(testId, testRun)

    // Save test run to database
    await supabase.from('test_runs').insert({
      test_id: testId,
      pipeline_id: result.pipelineId,
      store_id: storeId || null,
      config: testConfig,
      status: 'started',
      started_at: testRun.startedAt,
    })

    console.log(`[Test ${testId}] Started pipeline ${result.pipelineId} for store ${storeId || 'none'}`)

    return NextResponse.json({
      success: true,
      testId,
      pipelineId: result.pipelineId,
      storeId,
      message: `Test started: ${testConfig.maxProducts} ${testConfig.category} products (${testConfig.stages})`,
      checkStatusUrl: `/api/test/store-pipeline?testId=${testId}`,
    })
  } catch (error) {
    console.error('[Test Store Pipeline] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const testId = searchParams.get('testId')
    const pipelineId = searchParams.get('pipelineId')

    // If no parameters, return list of recent tests
    if (!testId && !pipelineId) {
      const { data: recentTests } = await supabase
        .from('test_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10)

      return NextResponse.json({
        success: true,
        tests: recentTests || [],
        activeTests: Array.from(activeTests.values()),
      })
    }

    // Look up by testId first
    let targetPipelineId = pipelineId
    let testRecord: TestRunResult | undefined

    if (testId) {
      // Check in-memory first
      testRecord = activeTests.get(testId)

      // Fall back to database
      if (!testRecord) {
        const { data } = await supabase
          .from('test_runs')
          .select('*')
          .eq('test_id', testId)
          .single()

        if (data) {
          targetPipelineId = data.pipeline_id
          testRecord = {
            testId: data.test_id,
            pipelineId: data.pipeline_id,
            storeId: data.store_id,
            config: data.config,
            status: data.status,
            startedAt: data.started_at,
            results: data.results,
            errors: data.errors,
          }
        }
      } else {
        targetPipelineId = testRecord.pipelineId
      }
    }

    if (!targetPipelineId) {
      return NextResponse.json({ error: 'Test or pipeline not found' }, { status: 404 })
    }

    // Get current pipeline status
    const progress = await getPipelineStatus(targetPipelineId)
    if (!progress) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
    }

    // Build response
    const response: TestRunResult = testRecord || {
      testId: testId || `pipeline-${targetPipelineId}`,
      pipelineId: targetPipelineId,
      config: { category: 'unknown', maxProducts: 0, stages: 'research_only' },
      status: 'running',
      startedAt: progress.startedAt.toISOString(),
    }

    // Update progress
    response.progress = {
      stage: progress.stage,
      percent: progress.progress,
      productsFound: progress.productsFound,
      productsSourced: progress.productsSourced,
      skusGenerated: progress.skusGenerated,
    }

    // Update status based on pipeline stage
    if (progress.stage === 'complete') {
      response.status = 'completed'

      // Gather results
      response.results = {
        totalProducts: progress.productsFound,
        qualifiedProducts: progress.productsSourced,
        skusCreated: progress.skusGenerated,
        avgCassiniScore: progress.cassiniMetrics?.avgCassiniScore,
      }

      // Update database
      await supabase
        .from('test_runs')
        .update({
          status: 'completed',
          results: response.results,
          completed_at: new Date().toISOString(),
        })
        .eq('pipeline_id', targetPipelineId)

      // Remove from active tests
      if (testId) activeTests.delete(testId)
    } else if (progress.stage === 'error') {
      response.status = 'failed'
      response.errors = progress.errors

      await supabase
        .from('test_runs')
        .update({
          status: 'failed',
          errors: progress.errors,
          completed_at: new Date().toISOString(),
        })
        .eq('pipeline_id', targetPipelineId)

      if (testId) activeTests.delete(testId)
    } else {
      response.status = 'running'
    }

    // Update in-memory tracking
    if (testId && activeTests.has(testId)) {
      activeTests.set(testId, response)
    }

    return NextResponse.json({
      success: true,
      test: response,
    })
  } catch (error) {
    console.error('[Test Store Pipeline] GET Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
