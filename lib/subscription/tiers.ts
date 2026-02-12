// OTTO Research Labs - Subscription Tier System
// Controls feature access, limits, and profit targets per tier

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

export interface SubscriptionTier {
  id: string
  name: string
  monthlyPrice: number
  targetProfit: number  // Minimum expected monthly net profit
  features: TierFeatures
  limits: TierLimits
  profitMultiplier: number  // Expected ROI (profit / subscription cost)
}

export interface TierFeatures {
  // Core Features
  maxStores: number
  maxListingsPerStore: number
  maxTotalListings: number

  // Automation
  autoReplenishment: boolean
  autoPruning: boolean
  autoRepricing: boolean
  smartPricing: boolean  // AI-powered pricing

  // Research
  keepaLookups: number  // per day
  zikResearchQueries: number  // per day
  competitorMonitoring: boolean
  trendAnalysis: boolean

  // Listing Speed
  listingsPerHour: number
  priorityQueue: boolean
  instantPublish: boolean

  // Compliance
  autoComplianceCheck: boolean
  manualReviewBypass: boolean  // Skip manual review for low-risk

  // Support
  supportLevel: 'community' | 'email' | 'priority' | 'dedicated'
  apiAccess: boolean
  webhooks: boolean

  // Analytics
  basicAnalytics: boolean
  advancedAnalytics: boolean
  customReports: boolean
  profitProjections: boolean

  // Multi-store
  bulkOperations: boolean
  storeGrouping: boolean
  crossStoreAnalytics: boolean
}

export interface TierLimits {
  maxDailyListings: number
  maxDailyOrders: number  // For processing
  maxResearchQueries: number
  maxApiCalls: number
  storageGb: number
  dataRetentionDays: number
}

// ============================================================================
// TIER CONFIGURATIONS
// ============================================================================

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 199,
    targetProfit: 1000,
    profitMultiplier: 5,  // 5x return on subscription
    features: {
      maxStores: 1,
      maxListingsPerStore: 500,
      maxTotalListings: 500,
      autoReplenishment: true,
      autoPruning: true,
      autoRepricing: true,
      smartPricing: false,
      keepaLookups: 100,
      zikResearchQueries: 50,
      competitorMonitoring: false,
      trendAnalysis: false,
      listingsPerHour: 20,
      priorityQueue: false,
      instantPublish: false,
      autoComplianceCheck: true,
      manualReviewBypass: false,
      supportLevel: 'email',
      apiAccess: false,
      webhooks: false,
      basicAnalytics: true,
      advancedAnalytics: false,
      customReports: false,
      profitProjections: true,
      bulkOperations: false,
      storeGrouping: false,
      crossStoreAnalytics: false
    },
    limits: {
      maxDailyListings: 50,
      maxDailyOrders: 100,
      maxResearchQueries: 100,
      maxApiCalls: 1000,
      storageGb: 5,
      dataRetentionDays: 30
    }
  },

  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyPrice: 299,
    targetProfit: 2000,
    profitMultiplier: 6.7,
    features: {
      maxStores: 3,
      maxListingsPerStore: 1000,
      maxTotalListings: 2000,
      autoReplenishment: true,
      autoPruning: true,
      autoRepricing: true,
      smartPricing: true,
      keepaLookups: 300,
      zikResearchQueries: 150,
      competitorMonitoring: true,
      trendAnalysis: false,
      listingsPerHour: 50,
      priorityQueue: true,
      instantPublish: false,
      autoComplianceCheck: true,
      manualReviewBypass: true,
      supportLevel: 'priority',
      apiAccess: false,
      webhooks: true,
      basicAnalytics: true,
      advancedAnalytics: true,
      customReports: false,
      profitProjections: true,
      bulkOperations: true,
      storeGrouping: false,
      crossStoreAnalytics: false
    },
    limits: {
      maxDailyListings: 150,
      maxDailyOrders: 300,
      maxResearchQueries: 300,
      maxApiCalls: 5000,
      storageGb: 20,
      dataRetentionDays: 90
    }
  },

  professional: {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 499,
    targetProfit: 3000,
    profitMultiplier: 6,
    features: {
      maxStores: 5,
      maxListingsPerStore: 2000,
      maxTotalListings: 5000,
      autoReplenishment: true,
      autoPruning: true,
      autoRepricing: true,
      smartPricing: true,
      keepaLookups: 1000,
      zikResearchQueries: 500,
      competitorMonitoring: true,
      trendAnalysis: true,
      listingsPerHour: 100,
      priorityQueue: true,
      instantPublish: true,
      autoComplianceCheck: true,
      manualReviewBypass: true,
      supportLevel: 'priority',
      apiAccess: true,
      webhooks: true,
      basicAnalytics: true,
      advancedAnalytics: true,
      customReports: true,
      profitProjections: true,
      bulkOperations: true,
      storeGrouping: true,
      crossStoreAnalytics: true
    },
    limits: {
      maxDailyListings: 400,
      maxDailyOrders: 1000,
      maxResearchQueries: 1000,
      maxApiCalls: 20000,
      storageGb: 50,
      dataRetentionDays: 180
    }
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 999,
    targetProfit: 7500,
    profitMultiplier: 7.5,
    features: {
      maxStores: 25,
      maxListingsPerStore: 5000,
      maxTotalListings: 50000,
      autoReplenishment: true,
      autoPruning: true,
      autoRepricing: true,
      smartPricing: true,
      keepaLookups: 5000,
      zikResearchQueries: 2000,
      competitorMonitoring: true,
      trendAnalysis: true,
      listingsPerHour: 500,
      priorityQueue: true,
      instantPublish: true,
      autoComplianceCheck: true,
      manualReviewBypass: true,
      supportLevel: 'dedicated',
      apiAccess: true,
      webhooks: true,
      basicAnalytics: true,
      advancedAnalytics: true,
      customReports: true,
      profitProjections: true,
      bulkOperations: true,
      storeGrouping: true,
      crossStoreAnalytics: true
    },
    limits: {
      maxDailyListings: 2000,
      maxDailyOrders: 5000,
      maxResearchQueries: 5000,
      maxApiCalls: 100000,
      storageGb: 200,
      dataRetentionDays: 365
    }
  },

  // Special tier for managed service (internal use)
  managed_service: {
    id: 'managed_service',
    name: 'Managed Service',
    monthlyPrice: 0,  // Internal
    targetProfit: 3000,  // $3k per store target
    profitMultiplier: 0,  // N/A for internal
    features: {
      maxStores: 100,
      maxListingsPerStore: 10000,
      maxTotalListings: 100000,
      autoReplenishment: true,
      autoPruning: true,
      autoRepricing: true,
      smartPricing: true,
      keepaLookups: 10000,
      zikResearchQueries: 5000,
      competitorMonitoring: true,
      trendAnalysis: true,
      listingsPerHour: 1000,
      priorityQueue: true,
      instantPublish: true,
      autoComplianceCheck: true,
      manualReviewBypass: true,
      supportLevel: 'dedicated',
      apiAccess: true,
      webhooks: true,
      basicAnalytics: true,
      advancedAnalytics: true,
      customReports: true,
      profitProjections: true,
      bulkOperations: true,
      storeGrouping: true,
      crossStoreAnalytics: true
    },
    limits: {
      maxDailyListings: 10000,
      maxDailyOrders: 20000,
      maxResearchQueries: 20000,
      maxApiCalls: 500000,
      storageGb: 1000,
      dataRetentionDays: 730  // 2 years
    }
  }
}

// ============================================================================
// TIER ACCESS CONTROL
// ============================================================================

export interface UserSubscription {
  userId: string
  tierId: string
  tier: SubscriptionTier
  status: 'active' | 'trial' | 'past_due' | 'cancelled' | 'paused'
  trialEndsAt?: string
  currentPeriodStart: string
  currentPeriodEnd: string
  overrides?: Partial<TierFeatures & TierLimits>  // Admin overrides
}

/**
 * Get user's subscription and tier
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return null
  }

  const tier = SUBSCRIPTION_TIERS[data.tier_id] || SUBSCRIPTION_TIERS.starter

  return {
    userId: data.user_id,
    tierId: data.tier_id,
    tier,
    status: data.status,
    trialEndsAt: data.trial_ends_at,
    currentPeriodStart: data.current_period_start,
    currentPeriodEnd: data.current_period_end,
    overrides: data.overrides
  }
}

/**
 * Check if user has access to a feature
 */
export async function hasFeature(
  userId: string,
  feature: keyof TierFeatures
): Promise<boolean> {
  const subscription = await getUserSubscription(userId)

  if (!subscription || subscription.status === 'cancelled') {
    return false
  }

  // Check for admin override
  if (subscription.overrides && feature in subscription.overrides) {
    return Boolean(subscription.overrides[feature as keyof typeof subscription.overrides])
  }

  return Boolean(subscription.tier.features[feature])
}

/**
 * Get user's limit for a specific resource
 */
export async function getLimit(
  userId: string,
  limit: keyof TierLimits
): Promise<number> {
  const subscription = await getUserSubscription(userId)

  if (!subscription || subscription.status === 'cancelled') {
    return 0
  }

  // Check for admin override
  if (subscription.overrides && limit in subscription.overrides) {
    return Number(subscription.overrides[limit as keyof typeof subscription.overrides]) || 0
  }

  return subscription.tier.limits[limit]
}

/**
 * Check if user is within their usage limits
 */
export async function checkUsageLimit(
  userId: string,
  limitType: keyof TierLimits,
  currentUsage: number
): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  const limit = await getLimit(userId, limitType)

  return {
    allowed: currentUsage < limit,
    limit,
    remaining: Math.max(0, limit - currentUsage)
  }
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

export interface UsageRecord {
  userId: string
  date: string
  listingsCreated: number
  ordersProcessed: number
  researchQueries: number
  apiCalls: number
  keepaLookups: number
}

/**
 * Get user's current daily usage
 */
export async function getDailyUsage(userId: string): Promise<UsageRecord> {
  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('usage_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single()

  if (!data) {
    return {
      userId,
      date: today,
      listingsCreated: 0,
      ordersProcessed: 0,
      researchQueries: 0,
      apiCalls: 0,
      keepaLookups: 0
    }
  }

  return {
    userId: data.user_id,
    date: data.date,
    listingsCreated: data.listings_created || 0,
    ordersProcessed: data.orders_processed || 0,
    researchQueries: data.research_queries || 0,
    apiCalls: data.api_calls || 0,
    keepaLookups: data.keepa_lookups || 0
  }
}

/**
 * Increment usage counter
 */
export async function incrementUsage(
  userId: string,
  field: 'listings_created' | 'orders_processed' | 'research_queries' | 'api_calls' | 'keepa_lookups',
  amount: number = 1
): Promise<{ success: boolean; newValue: number }> {
  const today = new Date().toISOString().split('T')[0]

  // Upsert usage record
  const { data, error } = await supabase.rpc('increment_usage', {
    p_user_id: userId,
    p_date: today,
    p_field: field,
    p_amount: amount
  })

  if (error) {
    console.error('[Subscription] Failed to increment usage:', error)
    return { success: false, newValue: 0 }
  }

  return { success: true, newValue: data || 0 }
}

/**
 * Check if action is allowed within limits
 */
export async function canPerformAction(
  userId: string,
  action: 'create_listing' | 'process_order' | 'research_query' | 'api_call' | 'keepa_lookup',
  count: number = 1
): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  const subscription = await getUserSubscription(userId)

  if (!subscription) {
    return { allowed: false, reason: 'No active subscription' }
  }

  if (subscription.status === 'cancelled') {
    return { allowed: false, reason: 'Subscription cancelled' }
  }

  if (subscription.status === 'past_due') {
    return { allowed: false, reason: 'Payment past due' }
  }

  const usage = await getDailyUsage(userId)

  const limitMap: Record<string, { usage: number; limit: keyof TierLimits }> = {
    create_listing: { usage: usage.listingsCreated, limit: 'maxDailyListings' },
    process_order: { usage: usage.ordersProcessed, limit: 'maxDailyOrders' },
    research_query: { usage: usage.researchQueries, limit: 'maxResearchQueries' },
    api_call: { usage: usage.apiCalls, limit: 'maxApiCalls' },
    keepa_lookup: { usage: usage.keepaLookups, limit: 'maxResearchQueries' }
  }

  const check = limitMap[action]
  if (!check) {
    return { allowed: true }
  }

  const limit = await getLimit(userId, check.limit)
  const newUsage = check.usage + count

  if (newUsage > limit) {
    return {
      allowed: false,
      reason: `Daily limit reached (${limit})`,
      remaining: Math.max(0, limit - check.usage)
    }
  }

  return {
    allowed: true,
    remaining: limit - newUsage
  }
}

// ============================================================================
// PROFIT TARGET TRACKING
// ============================================================================

export interface ProfitTargetStatus {
  userId: string
  tierId: string
  targetProfit: number
  currentProfit: number
  progressPercent: number
  onTrack: boolean
  daysRemaining: number
  projectedProfit: number
  recommendation: string
}

/**
 * Get user's profit target status
 */
export async function getProfitTargetStatus(userId: string): Promise<ProfitTargetStatus | null> {
  const subscription = await getUserSubscription(userId)

  if (!subscription) {
    return null
  }

  // Get current month's profit
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const daysRemaining = daysInMonth - dayOfMonth

  const { data: orders } = await supabase
    .from('orders')
    .select('net_profit')
    .gte('order_date', monthStart.toISOString())
    .not('status', 'eq', 'CANCELLED')

  const currentProfit = (orders || []).reduce((sum, o) => sum + (o.net_profit || 0), 0)
  const dailyProfit = dayOfMonth > 0 ? currentProfit / dayOfMonth : 0
  const projectedProfit = currentProfit + (dailyProfit * daysRemaining)

  const targetProfit = subscription.tier.targetProfit
  const progressPercent = (currentProfit / targetProfit) * 100
  const expectedProgress = (dayOfMonth / daysInMonth) * 100
  const onTrack = progressPercent >= expectedProgress * 0.85

  let recommendation = ''
  if (progressPercent >= 100) {
    recommendation = 'Excellent! You\'ve exceeded your profit target. Consider upgrading for more capacity.'
  } else if (onTrack) {
    recommendation = 'On track to hit your profit target. Keep up the momentum!'
  } else if (projectedProfit >= targetProfit * 0.8) {
    recommendation = 'Slightly behind target. Add more listings or optimize pricing to catch up.'
  } else {
    recommendation = 'Significantly behind target. Review your strategy or contact support for help.'
  }

  return {
    userId,
    tierId: subscription.tierId,
    targetProfit,
    currentProfit,
    progressPercent: Math.min(progressPercent, 100),
    onTrack,
    daysRemaining,
    projectedProfit,
    recommendation
  }
}

// ============================================================================
// ADMIN OVERRIDES
// ============================================================================

/**
 * Set admin override for a user
 */
export async function setUserOverride(
  userId: string,
  overrides: Partial<TierFeatures & TierLimits>
): Promise<boolean> {
  const { error } = await supabase
    .from('user_subscriptions')
    .update({ overrides })
    .eq('user_id', userId)

  if (error) {
    console.error('[Subscription] Failed to set override:', error)
    return false
  }

  return true
}

/**
 * Clear all overrides for a user
 */
export async function clearUserOverrides(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_subscriptions')
    .update({ overrides: null })
    .eq('user_id', userId)

  return !error
}

// ============================================================================
// TIER UPGRADE/DOWNGRADE
// ============================================================================

export async function upgradeTier(userId: string, newTierId: string): Promise<boolean> {
  const tier = SUBSCRIPTION_TIERS[newTierId]
  if (!tier) {
    return false
  }

  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      tier_id: newTierId,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)

  return !error
}

// ============================================================================
// EXPORTS
// ============================================================================

export { SUBSCRIPTION_TIERS as tiers }
