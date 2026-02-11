/**
 * Repricing Rules Engine
 *
 * Defines and evaluates rules for automated price optimization:
 * - Competitor-based repricing
 * - Margin protection rules
 * - Velocity-based pricing
 * - Time-based adjustments
 * - Inventory-level pricing
 */

import { supabase } from '@/lib/supabase'

export type RepricingStrategy =
  | 'match_lowest' // Match the lowest competitor price
  | 'beat_lowest' // Beat lowest by a percentage/amount
  | 'stay_above' // Stay above a price point
  | 'target_margin' // Maintain target margin
  | 'velocity_based' // Adjust based on sales velocity
  | 'time_decay' // Reduce price over time
  | 'demand_based' // Adjust based on views/watchers

export type PriceAdjustmentType = 'percentage' | 'fixed' | 'formula'

export interface RepricingRule {
  id: string
  name: string
  description?: string
  isActive: boolean
  priority: number
  strategy: RepricingStrategy
  conditions: RepricingCondition[]
  adjustment: PriceAdjustment
  constraints: PriceConstraints
  schedule?: RepricingSchedule
  createdAt?: string
  updatedAt?: string
}

export interface RepricingCondition {
  field: string
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between'
  value: number | string | [number, number]
}

export interface PriceAdjustment {
  type: PriceAdjustmentType
  value: number // Percentage or fixed amount
  direction: 'increase' | 'decrease' | 'set'
  reference?: 'current_price' | 'cost_price' | 'competitor_lowest' | 'competitor_avg' | 'msrp'
}

export interface PriceConstraints {
  minPrice?: number
  maxPrice?: number
  minMargin?: number // Minimum margin percentage
  maxMargin?: number // Maximum margin percentage
  minMarkup?: number // Minimum markup over cost
  maxPriceChange?: number // Max change per adjustment (percentage)
  cooldownHours?: number // Hours between adjustments
}

export interface RepricingSchedule {
  enabled: boolean
  frequency: 'hourly' | 'daily' | 'weekly'
  timezone?: string
  activeHours?: { start: number; end: number } // 0-23
  activeDays?: number[] // 0-6, 0 = Sunday
}

export interface ListingPriceData {
  assignmentId: string
  skuId: string
  storeId: string
  currentPrice: number
  costPrice: number
  msrp?: number
  competitorLowest?: number
  competitorAvg?: number
  competitorCount?: number
  daysListed: number
  views: number
  watchers: number
  sales: number
  lastSaleAt?: string
  lastPriceChange?: string
  currentMargin: number
  salesVelocity: number // Sales per day
  viewVelocity: number // Views per day
}

export interface RepricingRecommendation {
  assignmentId: string
  skuId: string
  currentPrice: number
  recommendedPrice: number
  priceChange: number
  priceChangePercent: number
  ruleId: string
  ruleName: string
  strategy: RepricingStrategy
  reason: string
  newMargin: number
  constraints: {
    appliedMin: boolean
    appliedMax: boolean
    appliedMargin: boolean
    appliedCooldown: boolean
  }
}

// Default repricing rules
const DEFAULT_RULES: Omit<RepricingRule, 'id'>[] = [
  {
    name: 'Beat Competitor by 2%',
    description: 'When competitors are lower, beat their price by 2%',
    isActive: true,
    priority: 100,
    strategy: 'beat_lowest',
    conditions: [
      { field: 'competitorLowest', operator: 'lt', value: 'currentPrice' },
      { field: 'competitorCount', operator: 'gte', value: 1 },
    ],
    adjustment: {
      type: 'percentage',
      value: 2,
      direction: 'decrease',
      reference: 'competitor_lowest',
    },
    constraints: {
      minMargin: 15,
      maxPriceChange: 10,
      cooldownHours: 24,
    },
  },
  {
    name: 'Increase Price When No Competition',
    description: 'Raise price by 5% when no competitors found',
    isActive: true,
    priority: 90,
    strategy: 'target_margin',
    conditions: [
      { field: 'competitorCount', operator: 'eq', value: 0 },
      { field: 'currentMargin', operator: 'lt', value: 40 },
    ],
    adjustment: {
      type: 'percentage',
      value: 5,
      direction: 'increase',
      reference: 'current_price',
    },
    constraints: {
      maxMargin: 50,
      maxPriceChange: 10,
      cooldownHours: 48,
    },
  },
  {
    name: 'Slow Mover Price Decay',
    description: 'Reduce price by 3% for items with no sales after 14 days',
    isActive: true,
    priority: 80,
    strategy: 'time_decay',
    conditions: [
      { field: 'daysListed', operator: 'gte', value: 14 },
      { field: 'sales', operator: 'eq', value: 0 },
      { field: 'views', operator: 'gte', value: 50 },
    ],
    adjustment: {
      type: 'percentage',
      value: 3,
      direction: 'decrease',
      reference: 'current_price',
    },
    constraints: {
      minMargin: 10,
      maxPriceChange: 5,
      cooldownHours: 72,
    },
  },
  {
    name: 'High Demand Price Increase',
    description: 'Increase price by 5% for items with high view velocity',
    isActive: true,
    priority: 85,
    strategy: 'demand_based',
    conditions: [
      { field: 'viewVelocity', operator: 'gte', value: 20 }, // 20+ views per day
      { field: 'watchers', operator: 'gte', value: 5 },
      { field: 'salesVelocity', operator: 'lt', value: 0.5 }, // Less than 1 sale per 2 days
    ],
    adjustment: {
      type: 'percentage',
      value: 5,
      direction: 'increase',
      reference: 'current_price',
    },
    constraints: {
      maxMargin: 45,
      maxPriceChange: 8,
      cooldownHours: 48,
    },
  },
  {
    name: 'Fast Seller Premium',
    description: 'Increase price by 8% for items selling fast',
    isActive: true,
    priority: 95,
    strategy: 'velocity_based',
    conditions: [
      { field: 'salesVelocity', operator: 'gte', value: 1 }, // 1+ sale per day
      { field: 'currentMargin', operator: 'lt', value: 35 },
    ],
    adjustment: {
      type: 'percentage',
      value: 8,
      direction: 'increase',
      reference: 'current_price',
    },
    constraints: {
      maxMargin: 45,
      maxPriceChange: 10,
      cooldownHours: 24,
    },
  },
  {
    name: 'Match Competitor Average',
    description: 'Align with average competitor price when significantly higher',
    isActive: true,
    priority: 75,
    strategy: 'match_lowest',
    conditions: [
      { field: 'competitorAvg', operator: 'lt', value: 'currentPrice' },
      { field: 'competitorCount', operator: 'gte', value: 3 },
    ],
    adjustment: {
      type: 'percentage',
      value: 0,
      direction: 'set',
      reference: 'competitor_avg',
    },
    constraints: {
      minMargin: 12,
      maxPriceChange: 15,
      cooldownHours: 48,
    },
  },
  {
    name: 'Protect Minimum Margin',
    description: 'Increase price if margin falls below 10%',
    isActive: true,
    priority: 100,
    strategy: 'target_margin',
    conditions: [
      { field: 'currentMargin', operator: 'lt', value: 10 },
    ],
    adjustment: {
      type: 'formula',
      value: 15, // Target 15% margin
      direction: 'set',
      reference: 'cost_price',
    },
    constraints: {
      minMargin: 15,
      maxPriceChange: 20,
    },
  },
]

/**
 * Get all active repricing rules
 */
export async function getActiveRepricingRules(): Promise<RepricingRule[]> {
  const { data: dbRules, error } = await supabase
    .from('repricing_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false })

  if (error || !dbRules || dbRules.length === 0) {
    return DEFAULT_RULES.map((rule, index) => ({
      ...rule,
      id: `default_${index}`,
    }))
  }

  return (dbRules as any[]).map(mapRuleFromDb)
}

/**
 * Get all repricing rules
 */
export async function getAllRepricingRules(): Promise<RepricingRule[]> {
  const { data: dbRules, error } = await supabase
    .from('repricing_rules')
    .select('*')
    .order('priority', { ascending: false })

  if (error || !dbRules || dbRules.length === 0) {
    return DEFAULT_RULES.map((rule, index) => ({
      ...rule,
      id: `default_${index}`,
    }))
  }

  return (dbRules as any[]).map(mapRuleFromDb)
}

/**
 * Create a new repricing rule
 */
export async function createRepricingRule(
  rule: Omit<RepricingRule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; rule?: RepricingRule; error?: string }> {
  const { data, error } = await supabase
    .from('repricing_rules')
    .insert({
      name: rule.name,
      description: rule.description,
      is_active: rule.isActive,
      priority: rule.priority,
      strategy: rule.strategy,
      conditions: rule.conditions,
      adjustment: rule.adjustment,
      constraints: rule.constraints,
      schedule: rule.schedule,
    })
    .select()
    .single()

  if (error || !data) {
    return { success: false, error: error?.message || 'Failed to create rule' }
  }

  return { success: true, rule: mapRuleFromDb(data) }
}

/**
 * Update an existing repricing rule
 */
export async function updateRepricingRule(
  id: string,
  updates: Partial<Omit<RepricingRule, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<{ success: boolean; error?: string }> {
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive
  if (updates.priority !== undefined) updateData.priority = updates.priority
  if (updates.strategy !== undefined) updateData.strategy = updates.strategy
  if (updates.conditions !== undefined) updateData.conditions = updates.conditions
  if (updates.adjustment !== undefined) updateData.adjustment = updates.adjustment
  if (updates.constraints !== undefined) updateData.constraints = updates.constraints
  if (updates.schedule !== undefined) updateData.schedule = updates.schedule

  const { error } = await supabase
    .from('repricing_rules')
    .update(updateData)
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Delete a repricing rule
 */
export async function deleteRepricingRule(id: string): Promise<{ success: boolean; error?: string }> {
  if (id.startsWith('default_')) {
    return { success: false, error: 'Cannot delete default rules' }
  }

  const { error } = await supabase.from('repricing_rules').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Evaluate a condition against listing data
 */
function evaluateCondition(condition: RepricingCondition, listing: ListingPriceData): boolean {
  let actualValue = (listing as any)[condition.field]
  let compareValue = condition.value

  // Handle string references (e.g., 'currentPrice')
  if (typeof compareValue === 'string' && compareValue in listing) {
    compareValue = (listing as any)[compareValue]
  }

  if (actualValue === undefined || actualValue === null) {
    return false
  }

  switch (condition.operator) {
    case 'gt':
      return actualValue > (compareValue as number)
    case 'gte':
      return actualValue >= (compareValue as number)
    case 'lt':
      return actualValue < (compareValue as number)
    case 'lte':
      return actualValue <= (compareValue as number)
    case 'eq':
      return actualValue === compareValue
    case 'neq':
      return actualValue !== compareValue
    case 'between':
      if (Array.isArray(compareValue)) {
        return actualValue >= compareValue[0] && actualValue <= compareValue[1]
      }
      return false
    default:
      return false
  }
}

/**
 * Calculate the new price based on adjustment
 */
function calculateNewPrice(
  listing: ListingPriceData,
  adjustment: PriceAdjustment
): number {
  let basePrice: number

  // Determine base price based on reference
  switch (adjustment.reference) {
    case 'cost_price':
      basePrice = listing.costPrice
      break
    case 'competitor_lowest':
      basePrice = listing.competitorLowest || listing.currentPrice
      break
    case 'competitor_avg':
      basePrice = listing.competitorAvg || listing.currentPrice
      break
    case 'msrp':
      basePrice = listing.msrp || listing.currentPrice
      break
    case 'current_price':
    default:
      basePrice = listing.currentPrice
  }

  let newPrice: number

  switch (adjustment.type) {
    case 'percentage':
      if (adjustment.direction === 'increase') {
        newPrice = basePrice * (1 + adjustment.value / 100)
      } else if (adjustment.direction === 'decrease') {
        newPrice = basePrice * (1 - adjustment.value / 100)
      } else {
        newPrice = basePrice
      }
      break

    case 'fixed':
      if (adjustment.direction === 'increase') {
        newPrice = basePrice + adjustment.value
      } else if (adjustment.direction === 'decrease') {
        newPrice = basePrice - adjustment.value
      } else {
        newPrice = adjustment.value
      }
      break

    case 'formula':
      // For margin-based formula: price = cost / (1 - targetMargin/100)
      if (adjustment.reference === 'cost_price') {
        const targetMargin = adjustment.value / 100
        newPrice = listing.costPrice / (1 - targetMargin)
      } else {
        newPrice = basePrice
      }
      break

    default:
      newPrice = basePrice
  }

  return Math.round(newPrice * 100) / 100 // Round to 2 decimal places
}

/**
 * Apply constraints to the calculated price
 */
function applyConstraints(
  listing: ListingPriceData,
  newPrice: number,
  constraints: PriceConstraints
): { price: number; applied: { min: boolean; max: boolean; margin: boolean; change: boolean } } {
  let finalPrice = newPrice
  const applied = { min: false, max: false, margin: false, change: false }

  // Apply min price constraint
  if (constraints.minPrice && finalPrice < constraints.minPrice) {
    finalPrice = constraints.minPrice
    applied.min = true
  }

  // Apply max price constraint
  if (constraints.maxPrice && finalPrice > constraints.maxPrice) {
    finalPrice = constraints.maxPrice
    applied.max = true
  }

  // Apply min margin constraint
  if (constraints.minMargin && listing.costPrice > 0) {
    const minPriceForMargin = listing.costPrice / (1 - constraints.minMargin / 100)
    if (finalPrice < minPriceForMargin) {
      finalPrice = Math.round(minPriceForMargin * 100) / 100
      applied.margin = true
    }
  }

  // Apply max margin constraint
  if (constraints.maxMargin && listing.costPrice > 0) {
    const maxPriceForMargin = listing.costPrice / (1 - constraints.maxMargin / 100)
    if (finalPrice > maxPriceForMargin) {
      finalPrice = Math.round(maxPriceForMargin * 100) / 100
      applied.margin = true
    }
  }

  // Apply max price change constraint
  if (constraints.maxPriceChange) {
    const maxChange = listing.currentPrice * (constraints.maxPriceChange / 100)
    const actualChange = Math.abs(finalPrice - listing.currentPrice)
    if (actualChange > maxChange) {
      if (finalPrice > listing.currentPrice) {
        finalPrice = listing.currentPrice + maxChange
      } else {
        finalPrice = listing.currentPrice - maxChange
      }
      finalPrice = Math.round(finalPrice * 100) / 100
      applied.change = true
    }
  }

  return { price: finalPrice, applied }
}

/**
 * Evaluate a repricing rule against a listing
 */
export function evaluateRepricingRule(
  rule: RepricingRule,
  listing: ListingPriceData
): RepricingRecommendation | null {
  // Check if all conditions are met
  for (const condition of rule.conditions) {
    if (!evaluateCondition(condition, listing)) {
      return null
    }
  }

  // Calculate new price
  const rawNewPrice = calculateNewPrice(listing, rule.adjustment)

  // Apply constraints
  const { price: finalPrice, applied } = applyConstraints(listing, rawNewPrice, rule.constraints)

  // Skip if no actual change
  if (Math.abs(finalPrice - listing.currentPrice) < 0.01) {
    return null
  }

  // Calculate new margin
  const newMargin = listing.costPrice > 0
    ? ((finalPrice - listing.costPrice) / finalPrice) * 100
    : 0

  // Generate reason
  const reason = generateReason(rule, listing, finalPrice)

  return {
    assignmentId: listing.assignmentId,
    skuId: listing.skuId,
    currentPrice: listing.currentPrice,
    recommendedPrice: finalPrice,
    priceChange: Math.round((finalPrice - listing.currentPrice) * 100) / 100,
    priceChangePercent: Math.round(((finalPrice - listing.currentPrice) / listing.currentPrice) * 10000) / 100,
    ruleId: rule.id,
    ruleName: rule.name,
    strategy: rule.strategy,
    reason,
    newMargin: Math.round(newMargin * 10) / 10,
    constraints: {
      appliedMin: applied.min,
      appliedMax: applied.max,
      appliedMargin: applied.margin,
      appliedCooldown: false, // Cooldown is checked separately
    },
  }
}

/**
 * Generate a human-readable reason for the price change
 */
function generateReason(
  rule: RepricingRule,
  listing: ListingPriceData,
  newPrice: number
): string {
  const direction = newPrice > listing.currentPrice ? 'increase' : 'decrease'
  const change = Math.abs(newPrice - listing.currentPrice).toFixed(2)
  const pct = Math.abs(((newPrice - listing.currentPrice) / listing.currentPrice) * 100).toFixed(1)

  switch (rule.strategy) {
    case 'beat_lowest':
      return `Beat competitor price ($${listing.competitorLowest?.toFixed(2)}) - ${direction} by $${change} (${pct}%)`
    case 'match_lowest':
      return `Match competitor pricing - ${direction} by $${change} (${pct}%)`
    case 'target_margin':
      return `Adjust to target margin - ${direction} by $${change} (${pct}%)`
    case 'velocity_based':
      return `Sales velocity adjustment (${listing.salesVelocity.toFixed(2)}/day) - ${direction} by $${change} (${pct}%)`
    case 'time_decay':
      return `Time-based decay (${listing.daysListed} days) - ${direction} by $${change} (${pct}%)`
    case 'demand_based':
      return `Demand-based adjustment (${listing.viewVelocity.toFixed(1)} views/day) - ${direction} by $${change} (${pct}%)`
    default:
      return `Price ${direction} by $${change} (${pct}%)`
  }
}

/**
 * Evaluate all rules against a listing and return the best recommendation
 */
export function evaluateAllRepricingRules(
  rules: RepricingRule[],
  listing: ListingPriceData
): RepricingRecommendation | null {
  // Rules are sorted by priority (highest first)
  for (const rule of rules) {
    const recommendation = evaluateRepricingRule(rule, listing)
    if (recommendation) {
      return recommendation
    }
  }
  return null
}

/**
 * Enrich listing data with calculated fields
 */
export function enrichListingPriceData(
  listing: Partial<ListingPriceData> & { assignmentId: string }
): ListingPriceData {
  const currentPrice = listing.currentPrice || 0
  const costPrice = listing.costPrice || 0
  const currentMargin = currentPrice > 0 ? ((currentPrice - costPrice) / currentPrice) * 100 : 0

  const daysListed = listing.daysListed || 1
  const salesVelocity = daysListed > 0 ? (listing.sales || 0) / daysListed : 0
  const viewVelocity = daysListed > 0 ? (listing.views || 0) / daysListed : 0

  return {
    assignmentId: listing.assignmentId,
    skuId: listing.skuId || '',
    storeId: listing.storeId || '',
    currentPrice,
    costPrice,
    msrp: listing.msrp,
    competitorLowest: listing.competitorLowest,
    competitorAvg: listing.competitorAvg,
    competitorCount: listing.competitorCount || 0,
    daysListed,
    views: listing.views || 0,
    watchers: listing.watchers || 0,
    sales: listing.sales || 0,
    lastSaleAt: listing.lastSaleAt,
    lastPriceChange: listing.lastPriceChange,
    currentMargin,
    salesVelocity,
    viewVelocity,
  }
}

// Helper to map database row to RepricingRule
function mapRuleFromDb(row: any): RepricingRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    priority: row.priority,
    strategy: row.strategy,
    conditions: row.conditions,
    adjustment: row.adjustment,
    constraints: row.constraints,
    schedule: row.schedule,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Get default repricing rules templates
 */
export function getDefaultRepricingRules(): Omit<RepricingRule, 'id' | 'createdAt' | 'updatedAt'>[] {
  return [
    {
      name: 'Beat Lowest Competitor',
      description: 'Automatically beat the lowest competitor price by 1%',
      isActive: true,
      priority: 1,
      strategy: 'beat_lowest',
      conditions: [
        { field: 'competitorCount', operator: 'gte', value: 1 },
        { field: 'currentMargin', operator: 'gte', value: 10 },
      ],
      adjustment: {
        type: 'percentage',
        value: 1,
        direction: 'decrease',
        reference: 'competitor_lowest',
      },
      constraints: {
        minMargin: 8,
        maxPriceChange: 15,
        cooldownHours: 24,
      },
    },
    {
      name: 'Match Low Competitors',
      description: 'Match the lowest price when margin is healthy',
      isActive: true,
      priority: 2,
      strategy: 'match_lowest',
      conditions: [
        { field: 'competitorCount', operator: 'gte', value: 3 },
        { field: 'currentMargin', operator: 'gte', value: 15 },
      ],
      adjustment: {
        type: 'fixed',
        value: 0,
        direction: 'set',
        reference: 'competitor_lowest',
      },
      constraints: {
        minMargin: 10,
        maxPriceChange: 20,
        cooldownHours: 12,
      },
    },
    {
      name: 'Slow Seller Price Decay',
      description: 'Gradually reduce price on slow-selling items',
      isActive: true,
      priority: 3,
      strategy: 'time_decay',
      conditions: [
        { field: 'daysListed', operator: 'gte', value: 30 },
        { field: 'salesVelocity', operator: 'lt', value: 0.1 },
      ],
      adjustment: {
        type: 'percentage',
        value: 3,
        direction: 'decrease',
        reference: 'current_price',
      },
      constraints: {
        minMargin: 5,
        maxPriceChange: 10,
        cooldownHours: 168, // Weekly
      },
    },
    {
      name: 'High Velocity Price Increase',
      description: 'Increase price on fast-selling items',
      isActive: true,
      priority: 4,
      strategy: 'velocity_based',
      conditions: [
        { field: 'salesVelocity', operator: 'gte', value: 1 },
        { field: 'currentMargin', operator: 'lt', value: 30 },
      ],
      adjustment: {
        type: 'percentage',
        value: 5,
        direction: 'increase',
        reference: 'current_price',
      },
      constraints: {
        maxMargin: 40,
        maxPriceChange: 10,
        cooldownHours: 48,
      },
    },
    {
      name: 'Target Margin Protection',
      description: 'Ensure minimum margin is maintained',
      isActive: true,
      priority: 5,
      strategy: 'target_margin',
      conditions: [
        { field: 'currentMargin', operator: 'lt', value: 10 },
      ],
      adjustment: {
        type: 'percentage',
        value: 15,
        direction: 'set',
        reference: 'cost_price',
      },
      constraints: {
        minMargin: 10,
        maxPriceChange: 25,
        cooldownHours: 24,
      },
    },
    {
      name: 'High Demand Premium',
      description: 'Increase price for items with many watchers',
      isActive: false,
      priority: 6,
      strategy: 'demand_based',
      conditions: [
        { field: 'watchers', operator: 'gte', value: 10 },
        { field: 'viewVelocity', operator: 'gte', value: 5 },
      ],
      adjustment: {
        type: 'percentage',
        value: 8,
        direction: 'increase',
        reference: 'current_price',
      },
      constraints: {
        maxMargin: 50,
        maxPriceChange: 15,
        cooldownHours: 72,
      },
    },
    {
      name: 'Stay Above Floor',
      description: 'Never drop below minimum profitable price',
      isActive: true,
      priority: 10,
      strategy: 'stay_above',
      conditions: [],
      adjustment: {
        type: 'percentage',
        value: 5,
        direction: 'set',
        reference: 'cost_price',
      },
      constraints: {
        minMargin: 5,
      },
    },
  ]
}
