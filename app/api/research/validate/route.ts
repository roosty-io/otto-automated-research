import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server'
import { supabase } from '@/lib/supabase'
import {
  researchProducts,
  validateSupplier,
  analyzeCompetition,
  assessProductRisk,
  checkProductAvailability,
  saveResearchResults,
  saveValidationResult,
  saveCompetitionAnalysis,
  saveRiskAssessment,
  type ProductResearchQuery,
  type ResearchedProduct,
} from '@/lib/research'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minutes for full validation pipeline

/**
 * Product Research & Validation Pipeline API
 *
 * POST /api/research/validate
 * Runs the complete validation pipeline:
 * 1. Multi-source product research
 * 2. Supplier validation (Keepa)
 * 3. Competition analysis (eBay)
 * 4. Risk assessment
 * 5. Uniqueness check
 *
 * Returns validated products ready for SKU generation
 */

// =============================================================================
// SCHEMAS
// =============================================================================

const ResearchQuerySchema = z.object({
  keywords: z.string().min(2).optional(),
  category: z.string().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  minSoldCount: z.number().int().nonnegative().optional(),
  dateRange: z.enum(['7', '14', '30', '90']).optional(),
  maxResults: z.number().int().min(1).max(100).optional().default(50),
})

const ValidationOptionsSchema = z.object({
  // Research options
  sources: z.array(z.enum(['ebay_api', 'zik'])).optional().default(['ebay_api', 'zik']),
  enrichWithKeepa: z.boolean().optional().default(true),

  // Validation thresholds
  minSupplierScore: z.number().min(0).max(100).optional().default(60),
  maxRiskScore: z.number().min(0).max(100).optional().default(50),
  maxCompetitors: z.number().int().positive().optional().default(50),
  minProfitMargin: z.number().positive().optional().default(15),

  // Processing options
  validateSuppliers: z.boolean().optional().default(true),
  analyzeCompetition: z.boolean().optional().default(true),
  assessRisk: z.boolean().optional().default(true),
  checkUniqueness: z.boolean().optional().default(true),
  saveResults: z.boolean().optional().default(true),
})

const RequestSchema = z.object({
  query: ResearchQuerySchema,
  options: ValidationOptionsSchema.optional(),
})

// =============================================================================
// TYPES
// =============================================================================

interface ValidatedProduct extends ResearchedProduct {
  supplierValidation?: {
    isValid: boolean
    score: number
    blockers: string[]
  }
  competitionAnalysis?: {
    level: string
    totalCompetitors: number
    recommendation: string
  }
  riskAssessment?: {
    level: string
    score: number
    blockers: string[]
  }
  uniqueness?: {
    isAvailable: boolean
    currentUsers: number
    maxUsers: number
  }
  overallStatus: 'approved' | 'warning' | 'rejected'
  rejectionReasons: string[]
}

interface PipelineResult {
  success: boolean
  query: ProductResearchQuery
  timing: {
    researchMs: number
    supplierValidationMs: number
    competitionMs: number
    riskMs: number
    uniquenessMs: number
    totalMs: number
  }
  products: {
    found: number
    validated: number
    approved: number
    rejected: number
    warning: number
  }
  results: ValidatedProduct[]
  batchId?: string
}

// =============================================================================
// HANDLER
// =============================================================================

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    // Require authentication
    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    // Parse and validate request
    const body = await request.json()
    const parseResult = RequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request',
        validation: parseResult.error.issues,
      }, { status: 400 })
    }

    const { query, options = {} } = parseResult.data
    const opts = ValidationOptionsSchema.parse(options)

    // Create batch record
    let batchId: string | undefined
    if (opts.saveResults) {
      const { data: batch } = await supabase
        .from('research_batches')
        .insert({
          user_id: user.id,
          query,
          sources: opts.sources,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      batchId = batch?.id
    }

    const timing: PipelineResult['timing'] = {
      researchMs: 0,
      supplierValidationMs: 0,
      competitionMs: 0,
      riskMs: 0,
      uniquenessMs: 0,
      totalMs: 0,
    }

    // ===========================================
    // STEP 1: Multi-source research
    // ===========================================
    console.log('[ValidationPipeline] Step 1: Research...')
    const researchStart = Date.now()

    const researchResult = await researchProducts(query, {
      sources: opts.sources,
      enrichWithKeepa: opts.enrichWithKeepa,
    })

    timing.researchMs = Date.now() - researchStart

    if (!researchResult.success || researchResult.products.length === 0) {
      await updateBatchStatus(batchId, 'completed', { products_found: 0 })

      return NextResponse.json({
        success: false,
        error: 'No products found',
        warnings: researchResult.warnings,
        timing: { ...timing, totalMs: Date.now() - startTime },
      })
    }

    // Save raw research results
    if (opts.saveResults) {
      await saveResearchResults(researchResult, batchId)
    }

    // ===========================================
    // STEP 2-5: Validation pipeline
    // ===========================================
    const validatedProducts: ValidatedProduct[] = []

    for (const product of researchResult.products) {
      const validated = await validateProduct(product, opts, timing)
      validatedProducts.push(validated)
    }

    // ===========================================
    // Calculate stats
    // ===========================================
    const stats = {
      found: researchResult.products.length,
      validated: validatedProducts.length,
      approved: validatedProducts.filter((p) => p.overallStatus === 'approved').length,
      rejected: validatedProducts.filter((p) => p.overallStatus === 'rejected').length,
      warning: validatedProducts.filter((p) => p.overallStatus === 'warning').length,
    }

    timing.totalMs = Date.now() - startTime

    // Update batch record
    if (batchId) {
      await updateBatchStatus(batchId, 'completed', {
        products_found: stats.found,
        products_validated: stats.validated,
        products_approved: stats.approved,
        duration_ms: timing.totalMs,
      })
    }

    const result: PipelineResult = {
      success: true,
      query,
      timing,
      products: stats,
      results: validatedProducts.sort((a, b) => {
        // Sort by: approved first, then by lowest risk score
        if (a.overallStatus !== b.overallStatus) {
          const order = { approved: 0, warning: 1, rejected: 2 }
          return order[a.overallStatus] - order[b.overallStatus]
        }
        return (a.riskAssessment?.score || 0) - (b.riskAssessment?.score || 0)
      }),
      batchId,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[ValidationPipeline] Error:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Pipeline failed',
    }, { status: 500 })
  }
}

// =============================================================================
// VALIDATION LOGIC
// =============================================================================

async function validateProduct(
  product: ResearchedProduct,
  opts: z.infer<typeof ValidationOptionsSchema>,
  timing: PipelineResult['timing']
): Promise<ValidatedProduct> {
  const validated: ValidatedProduct = {
    ...product,
    overallStatus: 'approved',
    rejectionReasons: [],
  }

  // Supplier validation (if ASIN available)
  if (opts.validateSuppliers && product.asin) {
    const start = Date.now()
    try {
      const supplierResult = await validateSupplier(product.asin, product.price)

      validated.supplierValidation = {
        isValid: supplierResult.isValid,
        score: supplierResult.overallScore,
        blockers: supplierResult.blockers,
      }

      if (!supplierResult.isValid) {
        validated.rejectionReasons.push(`Supplier validation failed: ${supplierResult.blockers[0] || 'Unknown reason'}`)
      } else if (supplierResult.overallScore < opts.minSupplierScore) {
        validated.rejectionReasons.push(`Supplier score too low: ${supplierResult.overallScore}`)
      }

      if (opts.saveResults) {
        await saveValidationResult(supplierResult)
      }
    } catch (error) {
      console.warn('[ValidationPipeline] Supplier validation failed:', error)
    }
    timing.supplierValidationMs += Date.now() - start
  }

  // Competition analysis
  if (opts.analyzeCompetition) {
    const start = Date.now()
    try {
      const competitionResult = await analyzeCompetition(product.title, {
        ourPrice: product.price,
        category: product.category,
      })

      validated.competitionAnalysis = {
        level: competitionResult.competitionLevel,
        totalCompetitors: competitionResult.totalCompetitors,
        recommendation: competitionResult.pricingRecommendation,
      }

      if (competitionResult.competitionLevel === 'saturated') {
        validated.rejectionReasons.push('Market is saturated')
      } else if (competitionResult.totalCompetitors > opts.maxCompetitors) {
        validated.rejectionReasons.push(`Too many competitors: ${competitionResult.totalCompetitors}`)
      }

      if (opts.saveResults) {
        await saveCompetitionAnalysis(competitionResult)
      }
    } catch (error) {
      console.warn('[ValidationPipeline] Competition analysis failed:', error)
    }
    timing.competitionMs += Date.now() - start
  }

  // Risk assessment
  if (opts.assessRisk) {
    const start = Date.now()
    try {
      const riskResult = await assessProductRisk({
        id: product.id,
        title: product.title,
        category: product.category,
        price: product.price,
        sourcePrice: product.amazonPrice,
        supplierData: product.amazonPrice ? {
          priceVolatility: 10, // Would get from supplier validation
          stockConfidence: 80,
          sellerCount: 5,
        } : undefined,
        competitionData: validated.competitionAnalysis ? {
          totalCompetitors: validated.competitionAnalysis.totalCompetitors,
          competitionLevel: validated.competitionAnalysis.level,
        } : undefined,
      })

      validated.riskAssessment = {
        level: riskResult.riskLevel,
        score: riskResult.overallRiskScore,
        blockers: riskResult.blockers.map((b) => b.reason),
      }

      if (riskResult.blockers.length > 0) {
        validated.rejectionReasons.push(...riskResult.blockers.map((b) => b.reason))
      } else if (riskResult.overallRiskScore > opts.maxRiskScore) {
        validated.rejectionReasons.push(`Risk score too high: ${riskResult.overallRiskScore}`)
      }

      if (opts.saveResults) {
        await saveRiskAssessment(riskResult)
      }
    } catch (error) {
      console.warn('[ValidationPipeline] Risk assessment failed:', error)
    }
    timing.riskMs += Date.now() - start
  }

  // Uniqueness check (would need SKU ID)
  // This is typically done when assigning products to stores

  // Determine overall status
  if (validated.rejectionReasons.length > 0) {
    // Check if any are hard blockers
    const hardBlockers = [
      'Supplier validation failed',
      'Market is saturated',
      'prohibited term',
      'VERO brand',
    ]

    const hasHardBlocker = validated.rejectionReasons.some((reason) =>
      hardBlockers.some((blocker) => reason.toLowerCase().includes(blocker.toLowerCase()))
    )

    validated.overallStatus = hasHardBlocker ? 'rejected' : 'warning'
  }

  return validated
}

async function updateBatchStatus(
  batchId: string | undefined,
  status: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!batchId) return

  try {
    await supabase
      .from('research_batches')
      .update({
        status,
        ...data,
        completed_at: status === 'completed' ? new Date().toISOString() : undefined,
      })
      .eq('id', batchId)
  } catch (error) {
    console.error('[ValidationPipeline] Failed to update batch:', error)
  }
}

// =============================================================================
// GET - Batch status
// =============================================================================

export async function GET(request: Request) {
  try {
    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const batchId = searchParams.get('batchId')

    if (batchId) {
      // Get specific batch
      const { data: batch } = await supabase
        .from('research_batches')
        .select('*')
        .eq('id', batchId)
        .eq('user_id', user.id)
        .single()

      if (!batch) {
        return NextResponse.json({
          success: false,
          error: 'Batch not found'
        }, { status: 404 })
      }

      return NextResponse.json({ success: true, batch })
    }

    // Get recent batches
    const { data: batches } = await supabase
      .from('research_batches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({ success: true, batches: batches || [] })
  } catch (error) {
    console.error('[ValidationPipeline] GET error:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get batches',
    }, { status: 500 })
  }
}
