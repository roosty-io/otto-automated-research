/**
 * Pruning Rules Engine
 *
 * Defines and evaluates rules for when listings should be pruned:
 * - Days without sale thresholds
 * - View-to-sale conversion rates
 * - Competitor undercutting detection
 * - Profit margin requirements
 * - Quality score thresholds
 */

import { supabase } from '@/lib/supabase'

export type RuleOperator =
  | 'gt' // greater than
  | 'gte' // greater than or equal
  | 'lt' // less than
  | 'lte' // less than or equal
  | 'eq' // equal
  | 'neq' // not equal
  | 'in' // in array
  | 'not_in' // not in array

export type RuleAction = 'prune' | 'pause' | 'reprice' | 'review' | 'alert'

export interface PruningRule {
  id: string
  name: string
  description?: string
  isActive: boolean
  priority: number // Higher priority rules evaluated first
  conditions: RuleCondition[]
  action: RuleAction
  actionConfig?: {
    repriceBy?: number // Percentage to reduce price
    alertChannel?: string
    reviewReason?: string
  }
  cooldownDays?: number // Days before rule can trigger again for same listing
  minListingAge?: number // Minimum days listed before rule applies
  createdAt?: string
  updatedAt?: string
}

export interface RuleCondition {
  field: string
  operator: RuleOperator
  value: number | string | boolean | (number | string)[]
  // Optional: only apply during certain periods
  timeWindow?: {
    days: number // Look back period
    aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count'
  }
}

export interface ListingData {
  assignmentId: string
  skuId: string
  storeId: string
  status: string
  daysListed: number
  views: number
  watchers: number
  sales: number
  revenue: number
  profit: number
  margin: number
  sellPrice: number
  costPrice: number
  qualityScore?: number
  competitorLowestPrice?: number
  lastSaleAt?: string
  daysSinceLastSale?: number
}

export interface RuleEvaluation {
  ruleId: string
  ruleName: string
  matches: boolean
  action?: RuleAction
  actionConfig?: PruningRule['actionConfig']
  conditionResults: {
    field: string
    operator: RuleOperator
    expectedValue: any
    actualValue: any
    passed: boolean
  }[]
}

// Default pruning rules
const DEFAULT_RULES: Omit<PruningRule, 'id'>[] = [
  {
    name: 'No Sales - 30 Days',
    description: 'Prune listings with no sales after 30 days',
    isActive: true,
    priority: 100,
    conditions: [
      { field: 'daysListed', operator: 'gte', value: 30 },
      { field: 'sales', operator: 'eq', value: 0 },
    ],
    action: 'prune',
    minListingAge: 30,
  },
  {
    name: 'No Sales - 21 Days Low Views',
    description: 'Prune listings with no sales and very low views after 21 days',
    isActive: true,
    priority: 90,
    conditions: [
      { field: 'daysListed', operator: 'gte', value: 21 },
      { field: 'sales', operator: 'eq', value: 0 },
      { field: 'views', operator: 'lt', value: 50 },
    ],
    action: 'prune',
    minListingAge: 21,
  },
  {
    name: 'Low Conversion Rate',
    description: 'Flag listings with poor view-to-sale conversion',
    isActive: true,
    priority: 80,
    conditions: [
      { field: 'daysListed', operator: 'gte', value: 14 },
      { field: 'views', operator: 'gte', value: 200 },
      { field: 'sales', operator: 'eq', value: 0 },
    ],
    action: 'review',
    actionConfig: { reviewReason: 'High views but no sales - check pricing/listing quality' },
    minListingAge: 14,
  },
  {
    name: 'Negative Margin',
    description: 'Pause listings where cost exceeds selling price',
    isActive: true,
    priority: 100,
    conditions: [
      { field: 'margin', operator: 'lt', value: 0 },
    ],
    action: 'pause',
    minListingAge: 0,
  },
  {
    name: 'Below Minimum Margin',
    description: 'Review listings below 10% margin',
    isActive: true,
    priority: 70,
    conditions: [
      { field: 'margin', operator: 'lt', value: 10 },
      { field: 'margin', operator: 'gte', value: 0 },
      { field: 'daysListed', operator: 'gte', value: 7 },
    ],
    action: 'reprice',
    actionConfig: { repriceBy: 5 }, // Increase price by 5%
    minListingAge: 7,
  },
  {
    name: 'Competitor Undercut',
    description: 'Alert when significantly undercut by competitors',
    isActive: true,
    priority: 85,
    conditions: [
      { field: 'competitorPriceDiff', operator: 'lt', value: -20 }, // 20% or more below our price
    ],
    action: 'reprice',
    actionConfig: { alertChannel: 'pricing' },
    minListingAge: 3,
  },
  {
    name: 'Low Quality Score',
    description: 'Review listings with quality score below 40',
    isActive: true,
    priority: 60,
    conditions: [
      { field: 'qualityScore', operator: 'lt', value: 40 },
      { field: 'daysListed', operator: 'gte', value: 7 },
      { field: 'sales', operator: 'eq', value: 0 },
    ],
    action: 'review',
    actionConfig: { reviewReason: 'Low quality score with no sales' },
    minListingAge: 7,
  },
  {
    name: 'Stale Listing - 45 Days',
    description: 'Prune old listings with no recent sales',
    isActive: true,
    priority: 75,
    conditions: [
      { field: 'daysListed', operator: 'gte', value: 45 },
      { field: 'daysSinceLastSale', operator: 'gte', value: 30 },
    ],
    action: 'prune',
    minListingAge: 45,
  },
]

/**
 * Get all active pruning rules
 */
export async function getActiveRules(): Promise<PruningRule[]> {
  const { data: dbRules, error } = await supabase
    .from('pruning_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false })

  if (error || !dbRules || dbRules.length === 0) {
    // Return default rules with generated IDs
    return DEFAULT_RULES.map((rule, index) => ({
      ...rule,
      id: `default_${index}`,
    }))
  }

  return (dbRules as any[]).map(mapRuleFromDb)
}

/**
 * Get all rules (active and inactive)
 */
export async function getAllRules(): Promise<PruningRule[]> {
  const { data: dbRules, error } = await supabase
    .from('pruning_rules')
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
 * Create a new pruning rule
 */
export async function createRule(
  rule: Omit<PruningRule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; rule?: PruningRule; error?: string }> {
  const { data, error } = await supabase
    .from('pruning_rules')
    .insert({
      name: rule.name,
      description: rule.description,
      is_active: rule.isActive,
      priority: rule.priority,
      conditions: rule.conditions,
      action: rule.action,
      action_config: rule.actionConfig,
      cooldown_days: rule.cooldownDays,
      min_listing_age: rule.minListingAge,
    })
    .select()
    .single()

  if (error || !data) {
    return { success: false, error: error?.message || 'Failed to create rule' }
  }

  return { success: true, rule: mapRuleFromDb(data) }
}

/**
 * Update an existing rule
 */
export async function updateRule(
  id: string,
  updates: Partial<Omit<PruningRule, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<{ success: boolean; error?: string }> {
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive
  if (updates.priority !== undefined) updateData.priority = updates.priority
  if (updates.conditions !== undefined) updateData.conditions = updates.conditions
  if (updates.action !== undefined) updateData.action = updates.action
  if (updates.actionConfig !== undefined) updateData.action_config = updates.actionConfig
  if (updates.cooldownDays !== undefined) updateData.cooldown_days = updates.cooldownDays
  if (updates.minListingAge !== undefined) updateData.min_listing_age = updates.minListingAge

  const { error } = await supabase
    .from('pruning_rules')
    .update(updateData)
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Delete a rule
 */
export async function deleteRule(id: string): Promise<{ success: boolean; error?: string }> {
  // Don't allow deleting default rules
  if (id.startsWith('default_')) {
    return { success: false, error: 'Cannot delete default rules' }
  }

  const { error } = await supabase.from('pruning_rules').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Evaluate a single condition against listing data
 */
function evaluateCondition(condition: RuleCondition, listing: ListingData): {
  passed: boolean
  actualValue: any
} {
  const actualValue = (listing as any)[condition.field]

  if (actualValue === undefined || actualValue === null) {
    return { passed: false, actualValue }
  }

  let passed = false

  switch (condition.operator) {
    case 'gt':
      passed = actualValue > condition.value
      break
    case 'gte':
      passed = actualValue >= condition.value
      break
    case 'lt':
      passed = actualValue < condition.value
      break
    case 'lte':
      passed = actualValue <= condition.value
      break
    case 'eq':
      passed = actualValue === condition.value
      break
    case 'neq':
      passed = actualValue !== condition.value
      break
    case 'in':
      passed = Array.isArray(condition.value) && condition.value.includes(actualValue)
      break
    case 'not_in':
      passed = Array.isArray(condition.value) && !condition.value.includes(actualValue)
      break
  }

  return { passed, actualValue }
}

/**
 * Evaluate a rule against a listing
 */
export function evaluateRule(rule: PruningRule, listing: ListingData): RuleEvaluation {
  // Check minimum listing age
  if (rule.minListingAge && listing.daysListed < rule.minListingAge) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matches: false,
      conditionResults: [],
    }
  }

  const conditionResults = rule.conditions.map((condition) => {
    const { passed, actualValue } = evaluateCondition(condition, listing)
    return {
      field: condition.field,
      operator: condition.operator,
      expectedValue: condition.value,
      actualValue,
      passed,
    }
  })

  // All conditions must pass for rule to match
  const matches = conditionResults.every((r) => r.passed)

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    matches,
    action: matches ? rule.action : undefined,
    actionConfig: matches ? rule.actionConfig : undefined,
    conditionResults,
  }
}

/**
 * Evaluate all rules against a listing
 * Returns the first matching rule (highest priority)
 */
export function evaluateAllRules(
  rules: PruningRule[],
  listing: ListingData
): RuleEvaluation | null {
  // Rules should already be sorted by priority (highest first)
  for (const rule of rules) {
    const evaluation = evaluateRule(rule, listing)
    if (evaluation.matches) {
      return evaluation
    }
  }

  return null
}

/**
 * Calculate derived fields for listing data
 */
export function enrichListingData(
  listing: Partial<ListingData> & { assignmentId: string }
): ListingData {
  const sellPrice = listing.sellPrice || 0
  const costPrice = listing.costPrice || 0
  const margin = sellPrice > 0 ? ((sellPrice - costPrice) / sellPrice) * 100 : 0

  const competitorPriceDiff = listing.competitorLowestPrice && sellPrice > 0
    ? ((listing.competitorLowestPrice - sellPrice) / sellPrice) * 100
    : undefined

  return {
    assignmentId: listing.assignmentId,
    skuId: listing.skuId || '',
    storeId: listing.storeId || '',
    status: listing.status || 'unknown',
    daysListed: listing.daysListed || 0,
    views: listing.views || 0,
    watchers: listing.watchers || 0,
    sales: listing.sales || 0,
    revenue: listing.revenue || 0,
    profit: listing.profit || 0,
    margin,
    sellPrice,
    costPrice,
    qualityScore: listing.qualityScore,
    competitorLowestPrice: listing.competitorLowestPrice,
    lastSaleAt: listing.lastSaleAt,
    daysSinceLastSale: listing.daysSinceLastSale,
    ...(competitorPriceDiff !== undefined && { competitorPriceDiff }),
  } as ListingData
}

// Helper to map database row to PruningRule
function mapRuleFromDb(row: any): PruningRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    priority: row.priority,
    conditions: row.conditions,
    action: row.action,
    actionConfig: row.action_config,
    cooldownDays: row.cooldown_days,
    minListingAge: row.min_listing_age,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
