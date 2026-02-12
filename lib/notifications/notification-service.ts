/**
 * Notification Service
 *
 * Handles all notification delivery:
 * - Email notifications
 * - Webhook callbacks
 * - In-app notifications
 * - Alert management
 */

import { supabase } from '@/lib/supabase'

export type NotificationType =
  | 'price_alert'
  | 'low_stock'
  | 'order_received'
  | 'listing_ended'
  | 'job_completed'
  | 'error'
  | 'pruning_action'
  | 'system'

export type NotificationChannel = 'email' | 'webhook' | 'in_app'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  priority: NotificationPriority
  channels: NotificationChannel[]
  data?: Record<string, any>
  userId?: string
  storeId?: string
  read: boolean
  createdAt: string
  sentAt?: string
  deliveredAt?: string
}

export interface NotificationPreferences {
  userId: string
  email?: string
  webhookUrl?: string
  enabledTypes: NotificationType[]
  enabledChannels: NotificationChannel[]
  quietHoursStart?: string
  quietHoursEnd?: string
  dailyDigest: boolean
  instantAlerts: boolean
}

export interface WebhookPayload {
  event: string
  timestamp: string
  data: Record<string, any>
  signature?: string
}

export interface AlertRule {
  id: string
  name: string
  type: NotificationType
  conditions: AlertCondition[]
  channels: NotificationChannel[]
  priority: NotificationPriority
  enabled: boolean
  cooldownMinutes: number
  lastTriggered?: string
}

export interface AlertCondition {
  field: string
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'contains'
  value: any
}

/**
 * Send a notification
 */
export async function sendNotification(notification: {
  type: NotificationType
  title: string
  message: string
  priority?: NotificationPriority
  channels?: NotificationChannel[]
  data?: Record<string, any>
  userId?: string
  storeId?: string
}): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  const {
    type,
    title,
    message,
    priority = 'normal',
    channels = ['in_app'],
    data,
    userId,
    storeId,
  } = notification

  try {
    // Create notification record
    const { data: notif, error } = await supabase
      .from('notifications')
      .insert({
        type,
        title,
        message,
        priority,
        channels,
        data,
        user_id: userId,
        store_id: storeId,
        read: false,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    // Send to each channel
    const deliveryPromises: Promise<void>[] = []

    if (channels.includes('email')) {
      deliveryPromises.push(sendEmailNotification(notif))
    }

    if (channels.includes('webhook')) {
      deliveryPromises.push(sendWebhookNotification(notif))
    }

    await Promise.allSettled(deliveryPromises)

    // Update sent timestamp
    await supabase
      .from('notifications')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', notif.id)

    return { success: true, notificationId: notif.id }
  } catch (error) {
    console.error('[Notification] Send error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Send email notification
 */
async function sendEmailNotification(notification: any): Promise<void> {
  // Get user preferences
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('email')
    .eq('user_id', notification.user_id)
    .single()

  if (!prefs?.email) {
    console.log('[Notification] No email configured for user')
    return
  }

  // In production, integrate with email service (SendGrid, SES, etc.)
  // For now, log the email that would be sent
  console.log('[Notification] Would send email:', {
    to: prefs.email,
    subject: notification.title,
    body: notification.message,
    priority: notification.priority,
  })

  // Example SendGrid integration:
  // const sgMail = require('@sendgrid/mail')
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  // await sgMail.send({
  //   to: prefs.email,
  //   from: 'notifications@otto.app',
  //   subject: notification.title,
  //   text: notification.message,
  //   html: generateEmailTemplate(notification),
  // })
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(notification: any): Promise<void> {
  // Get user webhook URL
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('webhook_url')
    .eq('user_id', notification.user_id)
    .single()

  if (!prefs?.webhook_url) {
    console.log('[Notification] No webhook configured for user')
    return
  }

  const payload: WebhookPayload = {
    event: notification.type,
    timestamp: new Date().toISOString(),
    data: {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      ...notification.data,
    },
  }

  // Sign the payload
  payload.signature = await generateWebhookSignature(payload)

  try {
    const response = await fetch(prefs.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': payload.signature || '',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error('[Notification] Webhook delivery failed:', response.status)
    }

    // Log webhook delivery
    await supabase.from('webhook_logs').insert({
      notification_id: notification.id,
      webhook_url: prefs.webhook_url,
      status: response.ok ? 'delivered' : 'failed',
      status_code: response.status,
      payload,
    })
  } catch (error) {
    console.error('[Notification] Webhook error:', error)

    await supabase.from('webhook_logs').insert({
      notification_id: notification.id,
      webhook_url: prefs.webhook_url,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      payload,
    })
  }
}

/**
 * Generate webhook signature
 */
async function generateWebhookSignature(payload: WebhookPayload): Promise<string> {
  const secret = process.env.WEBHOOK_SECRET || 'default-secret'
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(payload))

  // In production, use crypto.subtle or similar
  // For now, return a simple hash
  const hash = Array.from(data).reduce((h, b) => (h * 31 + b) >>> 0, 0)
  return `sha256=${hash.toString(16)}`
}

/**
 * Get notifications for a user
 */
export async function getNotifications(options: {
  userId?: string
  storeId?: string
  unreadOnly?: boolean
  type?: NotificationType
  limit?: number
  offset?: number
}): Promise<{ notifications: Notification[]; total: number }> {
  const { userId, storeId, unreadOnly = false, type, limit = 50, offset = 0 } = options

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (userId) query = query.eq('user_id', userId)
  if (storeId) query = query.eq('store_id', storeId)
  if (unreadOnly) query = query.eq('read', false)
  if (type) query = query.eq('type', type)

  const { data, count, error } = await query

  if (error) {
    console.error('[Notification] Get error:', error)
    return { notifications: [], total: 0 }
  }

  const notifications: Notification[] = (data || []).map(n => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    priority: n.priority,
    channels: n.channels,
    data: n.data,
    userId: n.user_id,
    storeId: n.store_id,
    read: n.read,
    createdAt: n.created_at,
    sentAt: n.sent_at,
    deliveredAt: n.delivered_at,
  }))

  return { notifications, total: count || 0 }
}

/**
 * Mark notifications as read
 */
export async function markAsRead(notificationIds: string[]): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .in('id', notificationIds)

  return { success: !error }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(userId: string): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)

  return { success: !error }
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferences | null> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return null
  }

  return {
    userId: data.user_id,
    email: data.email,
    webhookUrl: data.webhook_url,
    enabledTypes: data.enabled_types || [],
    enabledChannels: data.enabled_channels || ['in_app'],
    quietHoursStart: data.quiet_hours_start,
    quietHoursEnd: data.quiet_hours_end,
    dailyDigest: data.daily_digest || false,
    instantAlerts: data.instant_alerts !== false,
  }
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<{ success: boolean; error?: string }> {
  const updates: Record<string, any> = {}

  if (preferences.email !== undefined) updates.email = preferences.email
  if (preferences.webhookUrl !== undefined) updates.webhook_url = preferences.webhookUrl
  if (preferences.enabledTypes !== undefined) updates.enabled_types = preferences.enabledTypes
  if (preferences.enabledChannels !== undefined) updates.enabled_channels = preferences.enabledChannels
  if (preferences.quietHoursStart !== undefined) updates.quiet_hours_start = preferences.quietHoursStart
  if (preferences.quietHoursEnd !== undefined) updates.quiet_hours_end = preferences.quietHoursEnd
  if (preferences.dailyDigest !== undefined) updates.daily_digest = preferences.dailyDigest
  if (preferences.instantAlerts !== undefined) updates.instant_alerts = preferences.instantAlerts

  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Create an alert rule
 */
export async function createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<{ success: boolean; ruleId?: string }> {
  const { data, error } = await supabase
    .from('alert_rules')
    .insert({
      name: rule.name,
      type: rule.type,
      conditions: rule.conditions,
      channels: rule.channels,
      priority: rule.priority,
      enabled: rule.enabled,
      cooldown_minutes: rule.cooldownMinutes,
    })
    .select()
    .single()

  if (error) {
    return { success: false }
  }

  return { success: true, ruleId: data.id }
}

/**
 * Get alert rules
 */
export async function getAlertRules(): Promise<AlertRule[]> {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return []
  }

  return (data || []).map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    conditions: r.conditions,
    channels: r.channels,
    priority: r.priority,
    enabled: r.enabled,
    cooldownMinutes: r.cooldown_minutes,
    lastTriggered: r.last_triggered,
  }))
}

/**
 * Check and trigger alerts
 */
export async function checkAlerts(context: {
  type: NotificationType
  data: Record<string, any>
}): Promise<number> {
  const { type, data } = context
  let triggeredCount = 0

  // Get active rules for this type
  const { data: rules } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('type', type)
    .eq('enabled', true)

  for (const rule of rules || []) {
    // Check cooldown
    if (rule.last_triggered) {
      const lastTriggered = new Date(rule.last_triggered)
      const cooldownEnd = new Date(lastTriggered.getTime() + rule.cooldown_minutes * 60000)
      if (new Date() < cooldownEnd) {
        continue
      }
    }

    // Evaluate conditions
    const allConditionsMet = evaluateConditions(rule.conditions, data)

    if (allConditionsMet) {
      // Trigger notification
      await sendNotification({
        type,
        title: rule.name,
        message: formatAlertMessage(rule, data),
        priority: rule.priority,
        channels: rule.channels,
        data,
      })

      // Update last triggered
      await supabase
        .from('alert_rules')
        .update({ last_triggered: new Date().toISOString() })
        .eq('id', rule.id)

      triggeredCount++
    }
  }

  return triggeredCount
}

function evaluateConditions(conditions: AlertCondition[], data: Record<string, any>): boolean {
  for (const condition of conditions) {
    const value = data[condition.field]

    switch (condition.operator) {
      case 'gt':
        if (!(value > condition.value)) return false
        break
      case 'gte':
        if (!(value >= condition.value)) return false
        break
      case 'lt':
        if (!(value < condition.value)) return false
        break
      case 'lte':
        if (!(value <= condition.value)) return false
        break
      case 'eq':
        if (value !== condition.value) return false
        break
      case 'neq':
        if (value === condition.value) return false
        break
      case 'contains':
        if (!String(value).includes(String(condition.value))) return false
        break
    }
  }
  return true
}

function formatAlertMessage(rule: any, data: Record<string, any>): string {
  let message = `Alert: ${rule.name}\n\n`

  for (const [key, value] of Object.entries(data)) {
    message += `${key}: ${value}\n`
  }

  return message
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)

  return count || 0
}

/**
 * Delete old notifications
 */
export async function cleanupOldNotifications(daysToKeep: number = 30): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

  const { count, error } = await supabase
    .from('notifications')
    .delete()
    .lt('created_at', cutoffDate.toISOString())
    .eq('read', true)

  if (error) {
    console.error('[Notification] Cleanup error:', error)
    return 0
  }

  return count || 0
}

/**
 * Send batch notifications (for daily digest, etc.)
 */
export async function sendBatchNotifications(notifications: Array<{
  type: NotificationType
  title: string
  message: string
  userId?: string
}>): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const notif of notifications) {
    const result = await sendNotification(notif)
    if (result.success) {
      sent++
    } else {
      failed++
    }
  }

  return { sent, failed }
}
