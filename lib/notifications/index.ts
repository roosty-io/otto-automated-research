/**
 * Notifications Module
 *
 * Notification delivery and alert management.
 */

export {
  type NotificationType,
  type NotificationChannel,
  type NotificationPriority,
  type Notification,
  type NotificationPreferences,
  type WebhookPayload,
  type AlertRule,
  type AlertCondition,
  sendNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  createAlertRule,
  getAlertRules,
  checkAlerts,
  getUnreadCount,
  cleanupOldNotifications,
  sendBatchNotifications,
} from './notification-service'
