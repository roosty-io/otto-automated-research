/**
 * Scraper Monitoring & Error Logging
 *
 * Utilities for tracking scraper health, errors, and metrics
 * Integrates with Sentry for production error tracking
 */

import * as Sentry from '@sentry/nextjs'
import { supabase } from '@/lib/supabase'

export interface ScraperErrorDetails {
  platform: 'autods' | 'zik' | 'ebay' | 'amazon' | 'other'
  operation: string
  errorMessage: string
  errorStack?: string
  errorCode?: string
  url?: string
  selector?: string
  screenshotPath?: string
  requestData?: Record<string, unknown>
  userId?: string
  storeId?: string
}

export interface SelectorFailure {
  platform: 'autods' | 'zik' | 'ebay' | 'amazon' | 'other'
  selectorName: string
  selectorValue: string
}

/**
 * Log a scraper error to the database and Sentry
 */
export async function logScraperError(details: ScraperErrorDetails): Promise<string | null> {
  try {
    // Send to Sentry with context
    Sentry.withScope((scope) => {
      scope.setTag('platform', details.platform)
      scope.setTag('operation', details.operation)
      scope.setContext('scraper', {
        url: details.url,
        selector: details.selector,
        errorCode: details.errorCode,
        userId: details.userId,
        storeId: details.storeId,
      })

      if (details.errorStack) {
        const error = new Error(details.errorMessage)
        error.stack = details.errorStack
        Sentry.captureException(error)
      } else {
        Sentry.captureMessage(details.errorMessage, 'error')
      }
    })

    // Store in database
    const { data, error } = await supabase
      .from('scraper_errors')
      .insert({
        platform: details.platform,
        operation: details.operation,
        error_message: details.errorMessage,
        error_stack: details.errorStack,
        error_code: details.errorCode,
        url: details.url,
        selector: details.selector,
        screenshot_path: details.screenshotPath,
        request_data: details.requestData,
        user_id: details.userId,
        store_id: details.storeId,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[Monitoring] Failed to log error:', error)
      return null
    }

    return data?.id || null
  } catch (err) {
    console.error('[Monitoring] Exception logging error:', err)
    return null
  }
}

/**
 * Track a selector failure
 */
export async function trackSelectorFailure(failure: SelectorFailure): Promise<void> {
  try {
    await supabase.rpc('track_selector_failure', {
      p_platform: failure.platform,
      p_selector_name: failure.selectorName,
      p_selector_value: failure.selectorValue,
    })
  } catch (err) {
    console.error('[Monitoring] Failed to track selector failure:', err)
  }
}

/**
 * Mark a selector as resolved
 */
export async function resolveSelectorFailure(
  platform: string,
  selectorName: string
): Promise<void> {
  try {
    await supabase.rpc('resolve_selector_failure', {
      p_platform: platform,
      p_selector_name: selectorName,
    })
  } catch (err) {
    console.error('[Monitoring] Failed to resolve selector failure:', err)
  }
}

/**
 * Increment a scraper metric
 */
export async function incrementMetric(
  platform: string,
  metricName: string,
  increment: number = 1
): Promise<void> {
  try {
    // Use direct insert/update instead of RPC for more control
    const today = new Date().toISOString().split('T')[0]

    await supabase
      .from('scraper_metrics')
      .upsert(
        {
          platform,
          metric_date: today,
          [metricName]: increment,
        },
        {
          onConflict: 'platform,metric_date',
        }
      )
  } catch (err) {
    console.error('[Monitoring] Failed to increment metric:', err)
  }
}

/**
 * Get recent selector failures
 */
export async function getActiveFailures(): Promise<SelectorFailure[]> {
  try {
    const { data, error } = await supabase
      .from('scraper_selector_failures')
      .select('platform, selector_name, selector_value')
      .eq('status', 'failing')
      .order('last_failed_at', { ascending: false })

    if (error) {
      console.error('[Monitoring] Failed to get failures:', error)
      return []
    }

    return (data || []).map((row) => ({
      platform: row.platform,
      selectorName: row.selector_name,
      selectorValue: row.selector_value,
    }))
  } catch (err) {
    console.error('[Monitoring] Exception getting failures:', err)
    return []
  }
}

/**
 * Get health score trend
 */
export async function getHealthTrend(hours: number = 24): Promise<
  Array<{
    hour: string
    avgHealthScore: number
    checksCount: number
  }>
> {
  try {
    const { data, error } = await supabase.rpc('get_scraper_health_trend', {
      p_hours: hours,
    })

    if (error) {
      console.error('[Monitoring] Failed to get health trend:', error)
      return []
    }

    return (data || []).map((row: { hour: string; avg_health_score: number; checks_count: number }) => ({
      hour: row.hour,
      avgHealthScore: row.avg_health_score,
      checksCount: row.checks_count,
    }))
  } catch (err) {
    console.error('[Monitoring] Exception getting health trend:', err)
    return []
  }
}

/**
 * Get daily metrics for a platform
 */
export async function getDailyMetrics(
  platform: string,
  days: number = 7
): Promise<
  Array<{
    date: string
    totalOperations: number
    successfulOperations: number
    failedOperations: number
    avgResponseTime: number | null
  }>
> {
  try {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data, error } = await supabase
      .from('scraper_metrics')
      .select('metric_date, total_operations, successful_operations, failed_operations, avg_response_time_ms')
      .eq('platform', platform)
      .gte('metric_date', startDate.toISOString().split('T')[0])
      .order('metric_date', { ascending: false })

    if (error) {
      console.error('[Monitoring] Failed to get metrics:', error)
      return []
    }

    return (data || []).map((row) => ({
      date: row.metric_date,
      totalOperations: row.total_operations,
      successfulOperations: row.successful_operations,
      failedOperations: row.failed_operations,
      avgResponseTime: row.avg_response_time_ms,
    }))
  } catch (err) {
    console.error('[Monitoring] Exception getting metrics:', err)
    return []
  }
}

/**
 * Create a monitoring wrapper for scraper operations
 */
export function withMonitoring<T>(
  platform: 'autods' | 'zik' | 'ebay' | 'amazon' | 'other',
  operation: string
) {
  return async function (
    fn: () => Promise<T>,
    context?: { userId?: string; storeId?: string; url?: string }
  ): Promise<T> {
    const startTime = Date.now()

    try {
      const result = await fn()

      // Track success
      await incrementMetric(platform, 'successful_operations')
      await incrementMetric(platform, 'total_operations')

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      // Log error
      await logScraperError({
        platform,
        operation,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        url: context?.url,
        userId: context?.userId,
        storeId: context?.storeId,
      })

      // Track failure
      await incrementMetric(platform, 'failed_operations')
      await incrementMetric(platform, 'total_operations')

      throw error
    }
  }
}

/**
 * Simple console + database logger for scraper events
 */
export const scraperLogger = {
  info: (platform: string, message: string, data?: Record<string, unknown>) => {
    console.log(`[${platform.toUpperCase()}] ${message}`, data || '')
  },

  warn: (platform: string, message: string, data?: Record<string, unknown>) => {
    console.warn(`[${platform.toUpperCase()}] ${message}`, data || '')
  },

  error: async (
    platform: 'autods' | 'zik' | 'ebay' | 'amazon' | 'other',
    operation: string,
    error: Error | string,
    context?: Partial<ScraperErrorDetails>
  ) => {
    const message = error instanceof Error ? error.message : error
    console.error(`[${platform.toUpperCase()}] ${operation} failed:`, message)

    await logScraperError({
      platform,
      operation,
      errorMessage: message,
      errorStack: error instanceof Error ? error.stack : undefined,
      ...context,
    })
  },
}
