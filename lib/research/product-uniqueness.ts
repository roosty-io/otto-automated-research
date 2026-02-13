/**
 * Product Uniqueness Enforcement
 *
 * Ensures max N users per product to maintain:
 * - Fair distribution of products across users
 * - Reduced internal competition
 * - Better margins for all users
 * - Decreased unique product discovery requirements at scale
 *
 * Default: Max 6 users per SKU (internal, not public)
 *
 * Scale considerations:
 * - At 10,000+ users, system needs 150k+ products/month
 * - 6 users per product reduces discovery needs by 50%
 * - Enables more efficient product circulation
 */

import { supabase } from '../supabase'

// =============================================================================
// TYPES
// =============================================================================

export interface ProductAvailability {
  skuId: string
  skuCode: string
  title: string
  maxUsers: number
  currentUsers: number
  availableSlots: number
  isAvailable: boolean
  currentHolders: Array<{
    userId: string
    storeId: string
    assignedAt: string
  }>
  nextAvailableAt?: string // If all slots used, when does first assignment expire
}

export interface AssignmentResult {
  success: boolean
  skuId: string
  userId: string
  storeId: string
  slotNumber: number
  message: string
  expiresAt?: string
}

export interface UniquenessConfig {
  maxUsersPerSku: number // Default: 3
  reservationDurationHours: number // How long to hold a slot (default: 72 hours)
  cooldownAfterPruneHours: number // How long before slot can be reassigned (default: 24 hours)
  prioritizeHighPerformers: boolean // Give priority to high-performing users (default: true)
}

const DEFAULT_CONFIG: UniquenessConfig = {
  maxUsersPerSku: 6, // Increased from 3 to reduce unique product discovery requirements
  reservationDurationHours: 72,
  cooldownAfterPruneHours: 24,
  prioritizeHighPerformers: true,
}

// =============================================================================
// AVAILABILITY CHECKS
// =============================================================================

export async function checkProductAvailability(
  skuId: string,
  config: Partial<UniquenessConfig> = {}
): Promise<ProductAvailability> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  try {
    // Get SKU details
    const { data: sku } = await supabase
      .from('skus')
      .select('id, sku_code, title, max_store_count, current_store_count')
      .eq('id', skuId)
      .single()

    if (!sku) {
      return {
        skuId,
        skuCode: '',
        title: '',
        maxUsers: cfg.maxUsersPerSku,
        currentUsers: 0,
        availableSlots: 0,
        isAvailable: false,
        currentHolders: [],
      }
    }

    // Get current assignments
    const { data: assignments } = await supabase
      .from('store_sku_assignments')
      .select(`
        id,
        store_id,
        created_at,
        listing_status,
        store:stores(user_id)
      `)
      .eq('sku_id', skuId)
      .in('listing_status', ['active', 'paused', 'draft'])
      .order('created_at', { ascending: true })

    const maxUsers = sku.max_store_count || cfg.maxUsersPerSku

    // Group by user to count unique users
    const userAssignments = new Map<string, { storeId: string; assignedAt: string }>()
    for (const assignment of assignments || []) {
      const userId = (assignment.store as any)?.user_id
      if (userId && !userAssignments.has(userId)) {
        userAssignments.set(userId, {
          storeId: assignment.store_id,
          assignedAt: assignment.created_at,
        })
      }
    }

    const currentUsers = userAssignments.size
    const availableSlots = Math.max(0, maxUsers - currentUsers)
    const isAvailable = availableSlots > 0

    const currentHolders = Array.from(userAssignments.entries()).map(([userId, data]) => ({
      userId,
      storeId: data.storeId,
      assignedAt: data.assignedAt,
    }))

    return {
      skuId,
      skuCode: sku.sku_code,
      title: sku.title,
      maxUsers,
      currentUsers,
      availableSlots,
      isAvailable,
      currentHolders,
    }
  } catch (error) {
    console.error('[ProductUniqueness] Availability check error:', error)
    throw error
  }
}

export async function batchCheckAvailability(
  skuIds: string[],
  config?: Partial<UniquenessConfig>
): Promise<ProductAvailability[]> {
  return Promise.all(skuIds.map((id) => checkProductAvailability(id, config)))
}

// =============================================================================
// SLOT ASSIGNMENT
// =============================================================================

export async function assignProductToUser(
  skuId: string,
  userId: string,
  storeId: string,
  config: Partial<UniquenessConfig> = {}
): Promise<AssignmentResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  try {
    // Check current availability
    const availability = await checkProductAvailability(skuId, cfg)

    // Check if user already has this product
    const existingHolder = availability.currentHolders.find((h) => h.userId === userId)
    if (existingHolder) {
      return {
        success: false,
        skuId,
        userId,
        storeId,
        slotNumber: 0,
        message: 'User already has this product assigned',
      }
    }

    // Check if slots available
    if (!availability.isAvailable) {
      return {
        success: false,
        skuId,
        userId,
        storeId,
        slotNumber: 0,
        message: `Product at capacity (${availability.currentUsers}/${availability.maxUsers} users)`,
      }
    }

    // Assign the slot
    const slotNumber = availability.currentUsers + 1

    // Create reservation with expiry
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + cfg.reservationDurationHours)

    // Insert assignment record
    const { data: assignment, error } = await supabase
      .from('store_sku_assignments')
      .insert({
        sku_id: skuId,
        store_id: storeId,
        listing_status: 'draft',
        slot_number: slotNumber,
        reservation_expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      throw error
    }

    // Update SKU current_store_count
    await supabase
      .from('skus')
      .update({ current_store_count: slotNumber })
      .eq('id', skuId)

    // Log the assignment for analytics
    await logAssignmentEvent(skuId, userId, storeId, 'assigned', slotNumber)

    return {
      success: true,
      skuId,
      userId,
      storeId,
      slotNumber,
      message: `Slot ${slotNumber} assigned successfully`,
      expiresAt: expiresAt.toISOString(),
    }
  } catch (error) {
    console.error('[ProductUniqueness] Assignment error:', error)
    return {
      success: false,
      skuId,
      userId,
      storeId,
      slotNumber: 0,
      message: error instanceof Error ? error.message : 'Assignment failed',
    }
  }
}

export async function releaseProductSlot(
  skuId: string,
  storeId: string,
  reason: 'pruned' | 'ended' | 'manual' | 'expired'
): Promise<{ success: boolean; message: string }> {
  try {
    // Get the assignment
    const { data: assignment } = await supabase
      .from('store_sku_assignments')
      .select('id, slot_number, store:stores(user_id)')
      .eq('sku_id', skuId)
      .eq('store_id', storeId)
      .single()

    if (!assignment) {
      return { success: false, message: 'Assignment not found' }
    }

    // Update assignment status
    await supabase
      .from('store_sku_assignments')
      .update({
        listing_status: reason === 'pruned' ? 'pruned' : 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)

    // Recalculate current_store_count
    const { count } = await supabase
      .from('store_sku_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('sku_id', skuId)
      .in('listing_status', ['active', 'paused', 'draft'])

    await supabase
      .from('skus')
      .update({ current_store_count: count || 0 })
      .eq('id', skuId)

    // Log the release
    await logAssignmentEvent(
      skuId,
      (assignment.store as any)?.user_id,
      storeId,
      'released',
      assignment.slot_number,
      reason
    )

    return { success: true, message: `Slot released (${reason})` }
  } catch (error) {
    console.error('[ProductUniqueness] Release error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Release failed',
    }
  }
}

// =============================================================================
// WAITLIST MANAGEMENT
// =============================================================================

export interface WaitlistEntry {
  id: string
  skuId: string
  userId: string
  storeId: string
  position: number
  priority: number // Higher = more priority
  requestedAt: string
  notifiedAt?: string
}

export async function joinWaitlist(
  skuId: string,
  userId: string,
  storeId: string
): Promise<{ success: boolean; position: number; message: string }> {
  try {
    // Check if already on waitlist
    const { data: existing } = await supabase
      .from('sku_waitlist')
      .select('id, position')
      .eq('sku_id', skuId)
      .eq('user_id', userId)
      .single()

    if (existing) {
      return {
        success: true,
        position: existing.position,
        message: 'Already on waitlist',
      }
    }

    // Calculate priority based on user performance
    const priority = await calculateUserPriority(userId)

    // Get current waitlist length
    const { count } = await supabase
      .from('sku_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('sku_id', skuId)

    const position = (count || 0) + 1

    // Add to waitlist
    await supabase.from('sku_waitlist').insert({
      sku_id: skuId,
      user_id: userId,
      store_id: storeId,
      position,
      priority,
      requested_at: new Date().toISOString(),
    })

    return {
      success: true,
      position,
      message: `Added to waitlist at position ${position}`,
    }
  } catch (error) {
    console.error('[ProductUniqueness] Waitlist join error:', error)
    return {
      success: false,
      position: 0,
      message: error instanceof Error ? error.message : 'Failed to join waitlist',
    }
  }
}

export async function processWaitlist(skuId: string): Promise<AssignmentResult | null> {
  try {
    // Check if slot available
    const availability = await checkProductAvailability(skuId)

    if (!availability.isAvailable) {
      return null
    }

    // Get next in waitlist (ordered by priority then position)
    const { data: nextEntry } = await supabase
      .from('sku_waitlist')
      .select('*')
      .eq('sku_id', skuId)
      .order('priority', { ascending: false })
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (!nextEntry) {
      return null
    }

    // Attempt assignment
    const result = await assignProductToUser(
      skuId,
      nextEntry.user_id,
      nextEntry.store_id
    )

    if (result.success) {
      // Remove from waitlist
      await supabase
        .from('sku_waitlist')
        .delete()
        .eq('id', nextEntry.id)

      // Reorder remaining waitlist
      await reorderWaitlist(skuId)
    }

    return result
  } catch (error) {
    console.error('[ProductUniqueness] Waitlist processing error:', error)
    return null
  }
}

async function reorderWaitlist(skuId: string): Promise<void> {
  const { data: entries } = await supabase
    .from('sku_waitlist')
    .select('id')
    .eq('sku_id', skuId)
    .order('priority', { ascending: false })
    .order('requested_at', { ascending: true })

  if (!entries) return

  for (let i = 0; i < entries.length; i++) {
    await supabase
      .from('sku_waitlist')
      .update({ position: i + 1 })
      .eq('id', entries[i].id)
  }
}

async function calculateUserPriority(userId: string): Promise<number> {
  try {
    // Get user's performance metrics
    const { data: metrics } = await supabase
      .from('store_daily_metrics')
      .select('gross_profit, orders_count')
      .eq('user_id', userId)
      .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

    if (!metrics || metrics.length === 0) {
      return 50 // Default priority for new users
    }

    const totalProfit = metrics.reduce((sum, m) => sum + (m.gross_profit || 0), 0)
    const totalOrders = metrics.reduce((sum, m) => sum + (m.orders_count || 0), 0)

    // Priority based on performance (0-100)
    let priority = 50

    if (totalProfit > 5000) priority += 20
    else if (totalProfit > 1000) priority += 10

    if (totalOrders > 100) priority += 15
    else if (totalOrders > 30) priority += 10

    return Math.min(100, priority)
  } catch (error) {
    return 50
  }
}

// =============================================================================
// ANALYTICS
// =============================================================================

async function logAssignmentEvent(
  skuId: string,
  userId: string | undefined,
  storeId: string,
  action: 'assigned' | 'released' | 'expired' | 'transferred',
  slotNumber: number,
  reason?: string
): Promise<void> {
  try {
    await supabase.from('sku_assignment_events').insert({
      sku_id: skuId,
      user_id: userId,
      store_id: storeId,
      action,
      slot_number: slotNumber,
      reason,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[ProductUniqueness] Failed to log event:', error)
  }
}

export async function getProductDistributionStats(): Promise<{
  totalSkus: number
  fullyDistributed: number
  partiallyDistributed: number
  unassigned: number
  avgSlotsUsed: number
}> {
  try {
    const { data: skus } = await supabase
      .from('skus')
      .select('id, max_store_count, current_store_count')
      .eq('status', 'ready')

    if (!skus) {
      return {
        totalSkus: 0,
        fullyDistributed: 0,
        partiallyDistributed: 0,
        unassigned: 0,
        avgSlotsUsed: 0,
      }
    }

    let fullyDistributed = 0
    let partiallyDistributed = 0
    let unassigned = 0
    let totalSlotsUsed = 0

    for (const sku of skus) {
      const maxSlots = sku.max_store_count || 3
      const usedSlots = sku.current_store_count || 0

      totalSlotsUsed += usedSlots

      if (usedSlots === 0) {
        unassigned++
      } else if (usedSlots >= maxSlots) {
        fullyDistributed++
      } else {
        partiallyDistributed++
      }
    }

    return {
      totalSkus: skus.length,
      fullyDistributed,
      partiallyDistributed,
      unassigned,
      avgSlotsUsed: skus.length > 0 ? Math.round((totalSlotsUsed / skus.length) * 10) / 10 : 0,
    }
  } catch (error) {
    console.error('[ProductUniqueness] Stats error:', error)
    throw error
  }
}
