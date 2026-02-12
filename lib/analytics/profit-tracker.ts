// OTTO Research Labs - Profit Tracking & Goal System
// Core "stickiness" feature - tracks profit goals, projections, and ROI

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// TYPES
// ============================================================================

export interface ProfitGoal {
  id: string
  userId: string
  storeId?: string
  targetMonthlyProfit: number
  targetMonthlyRevenue: number
  targetProfitMargin: number
  startDate: string
  targetDate?: string
  status: 'active' | 'achieved' | 'missed' | 'paused'
  createdAt: string
}

export interface ProfitMetrics {
  period: 'today' | 'week' | 'month' | 'quarter' | 'year'
  revenue: number
  cost: number
  grossProfit: number
  fees: number  // eBay fees, payment processing
  netProfit: number
  profitMargin: number
  orderCount: number
  avgOrderValue: number
  avgProfitPerOrder: number
  sellThroughRate: number
  returnRate: number
}

export interface ProfitProjection {
  currentPace: {
    dailyProfit: number
    weeklyProfit: number
    monthlyProfit: number
    yearlyProfit: number
  }
  projectedMonthEnd: number
  projectedYearEnd: number
  goalProgress: number  // 0-100%
  daysToGoal: number | null
  onTrack: boolean
  requiredDailyProfit: number  // To hit goal
  recommendation: string
}

export interface ProfitBreakdown {
  byStore: Array<{
    storeId: string
    storeName: string
    revenue: number
    profit: number
    profitMargin: number
    contribution: number  // % of total profit
  }>
  byCategory: Array<{
    category: string
    revenue: number
    profit: number
    profitMargin: number
    orderCount: number
  }>
  topProducts: Array<{
    skuId: string
    title: string
    revenue: number
    profit: number
    profitMargin: number
    unitsSold: number
  }>
  profitTrend: Array<{
    date: string
    revenue: number
    profit: number
    profitMargin: number
  }>
}

export interface ROIMetrics {
  totalInvestment: number  // Subscription + inventory
  totalProfit: number
  roi: number  // Percentage
  paybackDays: number | null
  profitPerDollarInvested: number
  breakdownByMonth: Array<{
    month: string
    investment: number
    revenue: number
    profit: number
    cumulativeROI: number
  }>
}

// ============================================================================
// PROFIT CALCULATIONS
// ============================================================================

const EBAY_FVF_RATE = 0.1299  // 12.99% final value fee
const PAYMENT_PROCESSING_RATE = 0.029  // 2.9% payment processing
const PAYMENT_FIXED_FEE = 0.30  // $0.30 per transaction

function calculateFees(revenue: number, orderCount: number): number {
  const fvf = revenue * EBAY_FVF_RATE
  const paymentPercentage = revenue * PAYMENT_PROCESSING_RATE
  const paymentFixed = orderCount * PAYMENT_FIXED_FEE
  return fvf + paymentPercentage + paymentFixed
}

function calculateNetProfit(revenue: number, cost: number, orderCount: number): number {
  const fees = calculateFees(revenue, orderCount)
  return revenue - cost - fees
}

// ============================================================================
// METRICS RETRIEVAL
// ============================================================================

export async function getProfitMetrics(
  userId: string,
  period: ProfitMetrics['period'],
  storeId?: string
): Promise<ProfitMetrics> {
  const now = new Date()
  let startDate: Date

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'week':
      startDate = new Date(now)
      startDate.setDate(startDate.getDate() - 7)
      break
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'quarter':
      startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      break
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1)
      break
  }

  // Fetch orders with cost data
  let query = supabase
    .from('orders')
    .select(`
      id,
      total_amount,
      item_cost,
      status,
      order_date,
      store_id
    `)
    .gte('order_date', startDate.toISOString())
    .not('status', 'eq', 'CANCELLED')

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data: orders, error } = await query

  if (error || !orders) {
    console.error('[ProfitTracker] Failed to fetch orders:', error)
    return getEmptyMetrics(period)
  }

  // Calculate metrics
  const revenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const cost = orders.reduce((sum, o) => sum + (o.item_cost || 0), 0)
  const orderCount = orders.length
  const grossProfit = revenue - cost
  const fees = calculateFees(revenue, orderCount)
  const netProfit = grossProfit - fees
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0
  const avgProfitPerOrder = orderCount > 0 ? netProfit / orderCount : 0

  // Calculate sell-through rate (would need inventory data)
  const sellThroughRate = 0  // Placeholder

  // Calculate return rate
  const returnedOrders = orders.filter(o => o.status === 'RETURNED').length
  const returnRate = orderCount > 0 ? (returnedOrders / orderCount) * 100 : 0

  return {
    period,
    revenue,
    cost,
    grossProfit,
    fees,
    netProfit,
    profitMargin,
    orderCount,
    avgOrderValue,
    avgProfitPerOrder,
    sellThroughRate,
    returnRate
  }
}

function getEmptyMetrics(period: ProfitMetrics['period']): ProfitMetrics {
  return {
    period,
    revenue: 0,
    cost: 0,
    grossProfit: 0,
    fees: 0,
    netProfit: 0,
    profitMargin: 0,
    orderCount: 0,
    avgOrderValue: 0,
    avgProfitPerOrder: 0,
    sellThroughRate: 0,
    returnRate: 0
  }
}

// ============================================================================
// PROFIT PROJECTIONS
// ============================================================================

export async function getProfitProjection(
  userId: string,
  goalId?: string
): Promise<ProfitProjection> {
  // Get current month's metrics
  const monthMetrics = await getProfitMetrics(userId, 'month')

  // Get today's date info
  const now = new Date()
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const remainingDays = daysInMonth - dayOfMonth

  // Calculate daily average
  const dailyProfit = dayOfMonth > 0 ? monthMetrics.netProfit / dayOfMonth : 0
  const dailyRevenue = dayOfMonth > 0 ? monthMetrics.revenue / dayOfMonth : 0

  // Project month and year end
  const projectedMonthEnd = monthMetrics.netProfit + (dailyProfit * remainingDays)
  const daysRemainingInYear = Math.ceil((new Date(now.getFullYear(), 11, 31).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const projectedYearEnd = monthMetrics.netProfit + (dailyProfit * daysRemainingInYear)

  // Get active goal
  let goal: ProfitGoal | null = null
  if (goalId) {
    const { data } = await supabase
      .from('profit_goals')
      .select('*')
      .eq('id', goalId)
      .single()
    goal = data
  } else {
    const { data } = await supabase
      .from('profit_goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    goal = data
  }

  // Calculate goal progress
  let goalProgress = 0
  let onTrack = true
  let daysToGoal: number | null = null
  let requiredDailyProfit = 0
  let recommendation = ''

  if (goal) {
    goalProgress = (monthMetrics.netProfit / goal.targetMonthlyProfit) * 100
    const expectedProgress = (dayOfMonth / daysInMonth) * 100
    onTrack = goalProgress >= expectedProgress * 0.9  // Within 10% of expected

    if (dailyProfit > 0) {
      const remaining = goal.targetMonthlyProfit - monthMetrics.netProfit
      daysToGoal = remaining > 0 ? Math.ceil(remaining / dailyProfit) : 0
    }

    requiredDailyProfit = remainingDays > 0
      ? (goal.targetMonthlyProfit - monthMetrics.netProfit) / remainingDays
      : 0

    // Generate recommendation
    if (goalProgress >= 100) {
      recommendation = 'Congratulations! You\'ve hit your profit goal. Consider increasing your target.'
    } else if (onTrack) {
      recommendation = 'You\'re on track to hit your goal. Keep up the momentum!'
    } else if (requiredDailyProfit <= dailyProfit * 1.5) {
      recommendation = `Increase daily output by ${((requiredDailyProfit / dailyProfit - 1) * 100).toFixed(0)}% to hit your goal.`
    } else {
      recommendation = 'Consider adding more listings or improving conversion rates to catch up.'
    }
  } else {
    recommendation = 'Set a profit goal to track your progress and get personalized recommendations.'
  }

  return {
    currentPace: {
      dailyProfit,
      weeklyProfit: dailyProfit * 7,
      monthlyProfit: dailyProfit * 30,
      yearlyProfit: dailyProfit * 365
    },
    projectedMonthEnd,
    projectedYearEnd,
    goalProgress: Math.min(goalProgress, 100),
    daysToGoal,
    onTrack,
    requiredDailyProfit,
    recommendation
  }
}

// ============================================================================
// PROFIT BREAKDOWN
// ============================================================================

export async function getProfitBreakdown(
  userId: string,
  period: 'month' | 'quarter' | 'year' = 'month'
): Promise<ProfitBreakdown> {
  const now = new Date()
  let startDate: Date

  switch (period) {
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'quarter':
      startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      break
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1)
      break
  }

  // Fetch orders with store and SKU data
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id,
      total_amount,
      item_cost,
      order_date,
      store_id,
      stores(store_name),
      order_items(
        sku_id,
        quantity,
        unit_price,
        skus(title, category)
      )
    `)
    .gte('order_date', startDate.toISOString())
    .not('status', 'eq', 'CANCELLED')

  if (!orders || orders.length === 0) {
    return {
      byStore: [],
      byCategory: [],
      topProducts: [],
      profitTrend: []
    }
  }

  // Group by store
  const storeMap = new Map<string, { name: string; revenue: number; cost: number; orders: number }>()
  for (const order of orders) {
    const storeId = order.store_id
    const storeName = (order.stores as any)?.store_name || 'Unknown'
    const existing = storeMap.get(storeId) || { name: storeName, revenue: 0, cost: 0, orders: 0 }
    existing.revenue += order.total_amount || 0
    existing.cost += order.item_cost || 0
    existing.orders++
    storeMap.set(storeId, existing)
  }

  const totalProfit = Array.from(storeMap.values()).reduce((sum, s) => {
    return sum + calculateNetProfit(s.revenue, s.cost, s.orders)
  }, 0)

  const byStore = Array.from(storeMap.entries()).map(([storeId, data]) => {
    const profit = calculateNetProfit(data.revenue, data.cost, data.orders)
    return {
      storeId,
      storeName: data.name,
      revenue: data.revenue,
      profit,
      profitMargin: data.revenue > 0 ? (profit / data.revenue) * 100 : 0,
      contribution: totalProfit > 0 ? (profit / totalProfit) * 100 : 0
    }
  }).sort((a, b) => b.profit - a.profit)

  // Group by category (from order items)
  const categoryMap = new Map<string, { revenue: number; cost: number; orders: number }>()
  for (const order of orders) {
    const items = (order.order_items as any[]) || []
    for (const item of items) {
      const category = item.skus?.category || 'Uncategorized'
      const existing = categoryMap.get(category) || { revenue: 0, cost: 0, orders: 0 }
      existing.revenue += (item.unit_price || 0) * (item.quantity || 1)
      existing.orders++
      categoryMap.set(category, existing)
    }
  }

  const byCategory = Array.from(categoryMap.entries()).map(([category, data]) => {
    const profit = calculateNetProfit(data.revenue, data.cost, data.orders)
    return {
      category,
      revenue: data.revenue,
      profit,
      profitMargin: data.revenue > 0 ? (profit / data.revenue) * 100 : 0,
      orderCount: data.orders
    }
  }).sort((a, b) => b.profit - a.profit).slice(0, 10)

  // Top products by profit
  const productMap = new Map<string, { title: string; revenue: number; cost: number; units: number }>()
  for (const order of orders) {
    const items = (order.order_items as any[]) || []
    for (const item of items) {
      const skuId = item.sku_id
      const title = item.skus?.title || 'Unknown'
      const existing = productMap.get(skuId) || { title, revenue: 0, cost: 0, units: 0 }
      existing.revenue += (item.unit_price || 0) * (item.quantity || 1)
      existing.units += item.quantity || 1
      productMap.set(skuId, existing)
    }
  }

  const topProducts = Array.from(productMap.entries()).map(([skuId, data]) => {
    const profit = calculateNetProfit(data.revenue, data.cost, 1)
    return {
      skuId,
      title: data.title,
      revenue: data.revenue,
      profit,
      profitMargin: data.revenue > 0 ? (profit / data.revenue) * 100 : 0,
      unitsSold: data.units
    }
  }).sort((a, b) => b.profit - a.profit).slice(0, 20)

  // Profit trend by day
  const dayMap = new Map<string, { revenue: number; cost: number; orders: number }>()
  for (const order of orders) {
    const day = order.order_date.split('T')[0]
    const existing = dayMap.get(day) || { revenue: 0, cost: 0, orders: 0 }
    existing.revenue += order.total_amount || 0
    existing.cost += order.item_cost || 0
    existing.orders++
    dayMap.set(day, existing)
  }

  const profitTrend = Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => {
      const profit = calculateNetProfit(data.revenue, data.cost, data.orders)
      return {
        date,
        revenue: data.revenue,
        profit,
        profitMargin: data.revenue > 0 ? (profit / data.revenue) * 100 : 0
      }
    })

  return {
    byStore,
    byCategory,
    topProducts,
    profitTrend
  }
}

// ============================================================================
// ROI TRACKING
// ============================================================================

export async function getROIMetrics(userId: string): Promise<ROIMetrics> {
  // Get user subscription info
  const { data: user } = await supabase
    .from('users')
    .select('subscription_start, monthly_fee')
    .eq('id', userId)
    .single()

  const subscriptionStart = user?.subscription_start
    ? new Date(user.subscription_start)
    : new Date()
  const monthlyFee = user?.monthly_fee || 500  // Default $500/month

  // Calculate months active
  const now = new Date()
  const monthsActive = Math.max(1, Math.ceil(
    (now.getTime() - subscriptionStart.getTime()) / (1000 * 60 * 60 * 24 * 30)
  ))

  // Total investment (subscription fees)
  const totalInvestment = monthlyFee * monthsActive

  // Get all-time profit
  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, item_cost')
    .gte('order_date', subscriptionStart.toISOString())
    .not('status', 'eq', 'CANCELLED')

  let totalRevenue = 0
  let totalCost = 0
  const orderCount = orders?.length || 0

  for (const order of orders || []) {
    totalRevenue += order.total_amount || 0
    totalCost += order.item_cost || 0
  }

  const totalProfit = calculateNetProfit(totalRevenue, totalCost, orderCount)
  const netROI = totalInvestment > 0 ? ((totalProfit - totalInvestment) / totalInvestment) * 100 : 0
  const profitPerDollar = totalInvestment > 0 ? totalProfit / totalInvestment : 0

  // Calculate payback period
  const monthlyProfit = totalProfit / monthsActive
  const paybackDays = monthlyProfit > 0
    ? Math.ceil((totalInvestment / monthlyProfit) * 30)
    : null

  // Monthly breakdown (simplified)
  const breakdownByMonth: ROIMetrics['breakdownByMonth'] = []
  let cumulativeProfit = 0
  let cumulativeInvestment = 0

  for (let i = 0; i < monthsActive; i++) {
    const monthDate = new Date(subscriptionStart)
    monthDate.setMonth(monthDate.getMonth() + i)
    const monthStr = monthDate.toISOString().slice(0, 7)

    cumulativeInvestment += monthlyFee
    const avgMonthlyProfit = monthlyProfit  // Simplified
    cumulativeProfit += avgMonthlyProfit

    breakdownByMonth.push({
      month: monthStr,
      investment: monthlyFee,
      revenue: totalRevenue / monthsActive,  // Averaged
      profit: avgMonthlyProfit,
      cumulativeROI: cumulativeInvestment > 0
        ? ((cumulativeProfit - cumulativeInvestment) / cumulativeInvestment) * 100
        : 0
    })
  }

  return {
    totalInvestment,
    totalProfit,
    roi: netROI,
    paybackDays,
    profitPerDollarInvested: profitPerDollar,
    breakdownByMonth
  }
}

// ============================================================================
// GOAL MANAGEMENT
// ============================================================================

export async function createProfitGoal(
  userId: string,
  goal: {
    targetMonthlyProfit: number
    targetMonthlyRevenue?: number
    targetProfitMargin?: number
    storeId?: string
  }
): Promise<ProfitGoal | null> {
  const { data, error } = await supabase
    .from('profit_goals')
    .insert({
      user_id: userId,
      store_id: goal.storeId,
      target_monthly_profit: goal.targetMonthlyProfit,
      target_monthly_revenue: goal.targetMonthlyRevenue || goal.targetMonthlyProfit * 4,  // Assume 25% margin
      target_profit_margin: goal.targetProfitMargin || 25,
      start_date: new Date().toISOString(),
      status: 'active'
    })
    .select()
    .single()

  if (error) {
    console.error('[ProfitTracker] Failed to create goal:', error)
    return null
  }

  return {
    id: data.id,
    userId: data.user_id,
    storeId: data.store_id,
    targetMonthlyProfit: data.target_monthly_profit,
    targetMonthlyRevenue: data.target_monthly_revenue,
    targetProfitMargin: data.target_profit_margin,
    startDate: data.start_date,
    status: data.status,
    createdAt: data.created_at
  }
}

export async function updateGoalStatus(
  goalId: string,
  status: ProfitGoal['status']
): Promise<boolean> {
  const { error } = await supabase
    .from('profit_goals')
    .update({ status })
    .eq('id', goalId)

  return !error
}

// ============================================================================
// ALERTS & NOTIFICATIONS
// ============================================================================

export async function checkProfitAlerts(userId: string): Promise<string[]> {
  const alerts: string[] = []

  const projection = await getProfitProjection(userId)
  const metrics = await getProfitMetrics(userId, 'month')

  // Alert: Behind on goal
  if (!projection.onTrack && projection.goalProgress > 0) {
    alerts.push(`You're ${(100 - projection.goalProgress).toFixed(0)}% behind your profit goal. ${projection.recommendation}`)
  }

  // Alert: Profit margin too low
  if (metrics.profitMargin < 15 && metrics.orderCount > 10) {
    alerts.push(`Your profit margin is ${metrics.profitMargin.toFixed(1)}%. Consider raising prices or finding better suppliers.`)
  }

  // Alert: High return rate
  if (metrics.returnRate > 5) {
    alerts.push(`Your return rate is ${metrics.returnRate.toFixed(1)}%. Review product quality and descriptions.`)
  }

  // Alert: No sales today
  const todayMetrics = await getProfitMetrics(userId, 'today')
  if (todayMetrics.orderCount === 0 && new Date().getHours() >= 18) {
    alerts.push('No sales today. Check listing visibility and pricing.')
  }

  return alerts
}
