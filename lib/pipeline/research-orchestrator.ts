/**
 * Research Pipeline Orchestrator
 *
 * Coordinates the flow from demand research through sourcing and validation:
 * 1. ZIK Research → Find products with proven eBay demand
 * 2. Amazon Sourcing → Find supplier sources via Keepa
 * 3. Product Normalization → Clean and standardize data
 * 4. SKU Generation → Create listing-ready products
 */

import { createJob, getJobStats, type JobType } from '@/lib/jobs'
import { rateLimiter } from '@/lib/automation/rate-limiter'
import { supabase } from '@/lib/supabase'

export interface ResearchPipelineOptions {
  // ZIK search options
  query?: string
  category?: string
  minSold?: number
  maxSold?: number
  minPrice?: number
  maxPrice?: number
  dateRange?: '7' | '14' | '30' | '90'

  // Processing options
  maxProducts?: number
  autoSourceFromAmazon?: boolean
  autoNormalize?: boolean
  autoGenerateSkus?: boolean

  // User context
  userId?: string
  sessionId?: string
}

export interface PipelineProgress {
  stage: 'queued' | 'researching' | 'sourcing' | 'normalizing' | 'generating' | 'complete' | 'error'
  progress: number // 0-100
  productsFound: number
  productsSourced: number
  productsNormalized: number
  skusGenerated: number
  errors: string[]
  jobIds: string[]
  startedAt: Date
  updatedAt: Date
}

export interface PipelineResult {
  success: boolean
  pipelineId: string
  progress: PipelineProgress
  products?: any[]
  error?: string
}

/**
 * Start a new research pipeline
 */
export async function startResearchPipeline(
  options: ResearchPipelineOptions
): Promise<PipelineResult> {
  const pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const startedAt = new Date()

  const progress: PipelineProgress = {
    stage: 'queued',
    progress: 0,
    productsFound: 0,
    productsSourced: 0,
    productsNormalized: 0,
    skusGenerated: 0,
    errors: [],
    jobIds: [],
    startedAt,
    updatedAt: startedAt,
  }

  try {
    console.log(`[Pipeline ${pipelineId}] Starting research pipeline...`)

    // Save initial pipeline state
    await savePipelineState(pipelineId, progress)

    // Check rate limits before starting
    const zikLimitStatus = await rateLimiter.check('zik', 'search')
    if (!zikLimitStatus.allowed) {
      return {
        success: false,
        pipelineId,
        progress,
        error: `ZIK rate limit exceeded. Retry after ${zikLimitStatus.retryAfterMs}ms`,
      }
    }

    // Create the ZIK research job
    const researchJob = await createJob('zik_research', {
      pipelineId,
      filters: {
        query: options.query,
        category: options.category,
        minSold: options.minSold || 5,
        maxSold: options.maxSold,
        minPrice: options.minPrice,
        maxPrice: options.maxPrice,
        dateRange: options.dateRange || '30',
      },
      maxResults: options.maxProducts || 50,
      userId: options.userId,
    })

    progress.jobIds.push(researchJob.id)
    progress.stage = 'researching'
    progress.progress = 10
    await savePipelineState(pipelineId, progress)

    console.log(`[Pipeline ${pipelineId}] Created research job: ${researchJob.id}`)

    // If auto-sourcing is enabled, queue the follow-up jobs
    if (options.autoSourceFromAmazon) {
      // These will be triggered when research completes via job handlers
      // Just record the intent
      await supabase.from('pipeline_config').upsert({
        pipeline_id: pipelineId,
        auto_source: true,
        auto_normalize: options.autoNormalize || false,
        auto_generate_skus: options.autoGenerateSkus || false,
      })
    }

    return {
      success: true,
      pipelineId,
      progress,
    }
  } catch (error) {
    console.error(`[Pipeline ${pipelineId}] Error:`, error)

    progress.stage = 'error'
    progress.errors.push(error instanceof Error ? error.message : 'Unknown error')
    await savePipelineState(pipelineId, progress)

    return {
      success: false,
      pipelineId,
      progress,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get pipeline status
 */
export async function getPipelineStatus(pipelineId: string): Promise<PipelineProgress | null> {
  const { data, error } = await supabase
    .from('research_pipelines')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .single()

  if (error || !data) {
    return null
  }

  return {
    stage: data.stage,
    progress: data.progress,
    productsFound: data.products_found,
    productsSourced: data.products_sourced,
    productsNormalized: data.products_normalized,
    skusGenerated: data.skus_generated,
    errors: data.errors || [],
    jobIds: data.job_ids || [],
    startedAt: new Date(data.started_at),
    updatedAt: new Date(data.updated_at),
  }
}

/**
 * Update pipeline progress
 */
export async function updatePipelineProgress(
  pipelineId: string,
  updates: Partial<PipelineProgress>
): Promise<void> {
  const current = await getPipelineStatus(pipelineId)
  if (!current) return

  const updated = { ...current, ...updates, updatedAt: new Date() }
  await savePipelineState(pipelineId, updated)
}

/**
 * Save pipeline state to database
 */
async function savePipelineState(pipelineId: string, progress: PipelineProgress): Promise<void> {
  await supabase.from('research_pipelines').upsert({
    pipeline_id: pipelineId,
    stage: progress.stage,
    progress: progress.progress,
    products_found: progress.productsFound,
    products_sourced: progress.productsSourced,
    products_normalized: progress.productsNormalized,
    skus_generated: progress.skusGenerated,
    errors: progress.errors,
    job_ids: progress.jobIds,
    started_at: progress.startedAt.toISOString(),
    updated_at: progress.updatedAt.toISOString(),
  })
}

/**
 * Continue pipeline after job completion
 * Called by job handlers when a stage completes
 */
export async function continuePipeline(
  pipelineId: string,
  completedStage: 'research' | 'sourcing' | 'normalizing' | 'generating',
  result: { productIds?: string[]; error?: string }
): Promise<void> {
  const progress = await getPipelineStatus(pipelineId)
  if (!progress) return

  const { data: config } = await supabase
    .from('pipeline_config')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .single()

  if (result.error) {
    progress.errors.push(result.error)
    progress.stage = 'error'
    await savePipelineState(pipelineId, progress)
    return
  }

  switch (completedStage) {
    case 'research':
      progress.productsFound = result.productIds?.length || 0
      progress.progress = 25

      if (config?.auto_source && result.productIds?.length) {
        // Queue Amazon sourcing job
        const sourcingJob = await createJob('keepa_lookup', {
          pipelineId,
          productIds: result.productIds,
          action: 'source-for-ebay',
        })
        progress.jobIds.push(sourcingJob.id)
        progress.stage = 'sourcing'
      } else {
        progress.stage = config?.auto_normalize ? 'normalizing' : 'complete'
        progress.progress = config?.auto_normalize ? 50 : 100
      }
      break

    case 'sourcing':
      progress.productsSourced = result.productIds?.length || 0
      progress.progress = 50

      if (config?.auto_normalize && result.productIds?.length) {
        const normalizeJob = await createJob('normalize_products', {
          pipelineId,
          productIds: result.productIds,
        })
        progress.jobIds.push(normalizeJob.id)
        progress.stage = 'normalizing'
      } else {
        progress.stage = config?.auto_generate_skus ? 'generating' : 'complete'
        progress.progress = config?.auto_generate_skus ? 75 : 100
      }
      break

    case 'normalizing':
      progress.productsNormalized = result.productIds?.length || 0
      progress.progress = 75

      if (config?.auto_generate_skus && result.productIds?.length) {
        const skuJob = await createJob('generate_skus', {
          pipelineId,
          productIds: result.productIds,
        })
        progress.jobIds.push(skuJob.id)
        progress.stage = 'generating'
      } else {
        progress.stage = 'complete'
        progress.progress = 100
      }
      break

    case 'generating':
      progress.skusGenerated = result.productIds?.length || 0
      progress.stage = 'complete'
      progress.progress = 100
      break
  }

  await savePipelineState(pipelineId, progress)
  console.log(`[Pipeline ${pipelineId}] Stage ${completedStage} complete, now at ${progress.stage}`)
}

/**
 * Cancel a running pipeline
 */
export async function cancelPipeline(pipelineId: string): Promise<void> {
  const progress = await getPipelineStatus(pipelineId)
  if (!progress) return

  // Mark all pending jobs as cancelled
  for (const jobId of progress.jobIds) {
    await supabase
      .from('automation_jobs')
      .update({ status: 'cancelled' })
      .eq('id', jobId)
      .eq('status', 'pending')
  }

  progress.stage = 'error'
  progress.errors.push('Pipeline cancelled by user')
  await savePipelineState(pipelineId, progress)
}

/**
 * Get all pipelines for a user
 */
export async function getUserPipelines(
  userId: string,
  options: { limit?: number; status?: PipelineProgress['stage'] } = {}
): Promise<PipelineProgress[]> {
  let query = supabase
    .from('research_pipelines')
    .select('*')
    .order('started_at', { ascending: false })

  if (options.status) {
    query = query.eq('stage', options.status)
  }

  if (options.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error || !data) {
    return []
  }

  return data.map((row) => ({
    stage: row.stage,
    progress: row.progress,
    productsFound: row.products_found,
    productsSourced: row.products_sourced,
    productsNormalized: row.products_normalized,
    skusGenerated: row.skus_generated,
    errors: row.errors || [],
    jobIds: row.job_ids || [],
    startedAt: new Date(row.started_at),
    updatedAt: new Date(row.updated_at),
  }))
}

/**
 * Get pipeline statistics
 */
export async function getPipelineStats(): Promise<{
  total: number
  running: number
  completed: number
  failed: number
  totalProducts: number
  totalSkus: number
}> {
  const { data } = await supabase
    .from('research_pipelines')
    .select('stage, products_found, skus_generated')

  if (!data) {
    return { total: 0, running: 0, completed: 0, failed: 0, totalProducts: 0, totalSkus: 0 }
  }

  const runningStages = ['queued', 'researching', 'sourcing', 'normalizing', 'generating']

  return {
    total: data.length,
    running: data.filter((p) => runningStages.includes(p.stage)).length,
    completed: data.filter((p) => p.stage === 'complete').length,
    failed: data.filter((p) => p.stage === 'error').length,
    totalProducts: data.reduce((sum, p) => sum + (p.products_found || 0), 0),
    totalSkus: data.reduce((sum, p) => sum + (p.skus_generated || 0), 0),
  }
}
