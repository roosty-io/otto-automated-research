/**
 * API Request Validation using Zod
 *
 * Centralized validation schemas for API endpoints
 */

import { z } from 'zod'
import { NextResponse } from 'next/server'

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

export const UUIDSchema = z.string().uuid()

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const DateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

// =============================================================================
// BILLING SCHEMAS
// =============================================================================

export const BillingActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create-checkout'),
    tier: z.enum(['lite', 'starter', 'growth', 'professional', 'enterprise']),
  }),
  z.object({
    action: z.literal('billing-portal'),
  }),
  z.object({
    action: z.literal('cancel'),
  }),
  z.object({
    action: z.literal('reactivate'),
  }),
])

export const BillingStatusQuerySchema = z.object({
  action: z.literal('status').optional(),
})

// =============================================================================
// AUTODS SCHEMAS
// =============================================================================

export const AutoDSAuthSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
})

export const AutoDSListingsQuerySchema = z.object({
  storeId: z.string().optional(),
  status: z.enum(['active', 'ended', 'out_of_stock', 'error']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})

export const AutoDSUploadSchema = z.object({
  storeId: z.string().min(1, 'Store ID is required'),
  products: z.array(z.object({
    sourceUrl: z.string().url('Invalid source URL'),
    title: z.string().min(1).optional(),
    price: z.number().positive().optional(),
    quantity: z.number().int().positive().optional(),
  })).min(1, 'At least one product is required').max(50, 'Maximum 50 products per request'),
})

export const AutoDSPriceUpdateSchema = z.object({
  listingId: z.string().min(1),
  newPrice: z.number().positive('Price must be positive'),
})

// =============================================================================
// ZIK SCHEMAS
// =============================================================================

export const ZikSearchSchema = z.object({
  query: z.string().min(1).optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  minSold: z.coerce.number().int().nonnegative().optional(),
  dateRange: z.enum(['7', '14', '30', '90']).optional(),
  maxResults: z.coerce.number().int().min(1).max(500).default(100),
})

// =============================================================================
// STORE SCHEMAS
// =============================================================================

export const CreateStoreSchema = z.object({
  name: z.string().min(1, 'Store name is required').max(100),
  platform: z.enum(['ebay', 'amazon', 'shopify', 'wix']),
  externalId: z.string().optional(),
  credentials: z.object({
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
  }).optional(),
})

export const UpdateStoreSchema = CreateStoreSchema.partial().extend({
  storeId: z.string().uuid(),
})

// =============================================================================
// SKU SCHEMAS
// =============================================================================

export const CreateSKUSchema = z.object({
  asin: z.string().min(1).optional(),
  upc: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  brand: z.string().optional(),
  category: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourcePlatform: z.enum(['amazon', 'walmart', 'aliexpress', 'other']).optional(),
  sourcePrice: z.number().positive().optional(),
  targetPrice: z.number().positive().optional(),
  targetMargin: z.number().positive().optional(),
  notes: z.string().optional(),
})

export const BulkCreateSKUsSchema = z.object({
  skus: z.array(CreateSKUSchema).min(1).max(100),
})

// =============================================================================
// WEBHOOK SCHEMAS
// =============================================================================

export const StripeWebhookEventSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.record(z.unknown()),
  }),
})

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details: z.ZodIssue[] }

/**
 * Validate request body with a Zod schema
 */
export async function validateRequestBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<ValidationResult<T>> {
  try {
    const body = await request.json()
    const result = schema.safeParse(body)

    if (!result.success) {
      return {
        success: false,
        error: 'Validation failed',
        details: result.error.issues,
      }
    }

    return { success: true, data: result.data }
  } catch (error) {
    return {
      success: false,
      error: 'Invalid JSON body',
      details: [],
    }
  }
}

/**
 * Validate query parameters with a Zod schema
 */
export function validateQueryParams<T>(
  url: URL | string,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  const searchParams = typeof url === 'string' ? new URL(url).searchParams : url.searchParams
  const params = Object.fromEntries(searchParams.entries())

  const result = schema.safeParse(params)

  if (!result.success) {
    return {
      success: false,
      error: 'Invalid query parameters',
      details: result.error.issues,
    }
  }

  return { success: true, data: result.data }
}

/**
 * Create an error response for validation failures
 */
export function validationErrorResponse(
  error: string,
  details: z.ZodIssue[],
  status: number = 400
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error,
      validation: details.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    },
    { status }
  )
}

/**
 * Middleware-style validation wrapper for API routes
 */
export function withValidation<T>(
  schema: z.ZodSchema<T>,
  handler: (data: T, request: Request) => Promise<NextResponse>
) {
  return async (request: Request): Promise<NextResponse> => {
    const validation = await validateRequestBody(request, schema)

    if (!validation.success) {
      return validationErrorResponse(validation.error, validation.details)
    }

    return handler(validation.data, request)
  }
}
