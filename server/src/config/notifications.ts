import { readEnv } from './env'
import {
  readPublicBooleanEnv,
  readPublicEnumEnv,
  readPublicNumberEnv,
} from './publicRuntimeConfig'

export type NotificationsRolloutMode = 'on' | 'shadow' | 'off'

export interface NotificationsConfig {
  enabled: boolean
  rolloutMode: NotificationsRolloutMode
  publishRetries: number
  maxInboxPageSize: number
  unreadDriftWarnThreshold: number
  emailChannelEnabled: boolean
  emailWebhookUrl: string | null
  slackChannelEnabled: boolean
  slackWebhookUrl: string | null
  channelTimeoutMs: number
  reminderSchedulerEnabled: boolean
  reminderIntervalMs: number
  reminderCooldownMinutes: number
  reminderDueSoonHours: number
  reminderStaleInProgressHours: number
  reminderReviewSlaHours: number
  dailyRollupEnabled: boolean
  dailyRollupHourUtc: number
}

let cachedNotificationsConfig: NotificationsConfig | null = null

type NotificationsNumberName =
  | 'NOTIFICATIONS_PUBLISH_RETRIES'
  | 'NOTIFICATIONS_MAX_INBOX_PAGE_SIZE'
  | 'NOTIFICATIONS_UNREAD_DRIFT_WARN_THRESHOLD'
  | 'NOTIFICATIONS_CHANNEL_TIMEOUT_MS'
  | 'NOTIFICATIONS_REMINDER_INTERVAL_MS'
  | 'NOTIFICATIONS_REMINDER_COOLDOWN_MINUTES'
  | 'NOTIFICATIONS_REMINDER_DUE_SOON_HOURS'
  | 'NOTIFICATIONS_REMINDER_STALE_IN_PROGRESS_HOURS'
  | 'NOTIFICATIONS_REMINDER_REVIEW_SLA_HOURS'
  | 'NOTIFICATIONS_DAILY_ROLLUP_HOUR_UTC'

function readPositiveInteger(name: NotificationsNumberName, fallback: number): number {
  const value = readPublicNumberEnv(name)
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name} value "${value}". Expected a positive integer.`)
  }
  return value
}

function readHourInteger(name: 'NOTIFICATIONS_DAILY_ROLLUP_HOUR_UTC', fallback: number): number {
  const value = readPublicNumberEnv(name)
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 0 || value > 23) {
    throw new Error(`Invalid ${name} value "${value}". Expected an integer between 0 and 23.`)
  }
  return value
}

export function getNotificationsConfig(): NotificationsConfig {
  if (cachedNotificationsConfig) return cachedNotificationsConfig

  const enabled = readPublicBooleanEnv('NOTIFICATIONS_ENABLED') ?? true
  const rolloutMode = readPublicEnumEnv(
    'NOTIFICATIONS_ROLLOUT_MODE',
    ['on', 'shadow', 'off'] as const,
  ) ?? 'on'
  const publishRetries = readPositiveInteger('NOTIFICATIONS_PUBLISH_RETRIES', 2)
  const maxInboxPageSize = readPositiveInteger('NOTIFICATIONS_MAX_INBOX_PAGE_SIZE', 100)
  const unreadDriftWarnThreshold = readPositiveInteger('NOTIFICATIONS_UNREAD_DRIFT_WARN_THRESHOLD', 25)
  const emailChannelEnabled = readPublicBooleanEnv('NOTIFICATIONS_EMAIL_CHANNEL_ENABLED') ?? false
  const emailWebhookUrl = readEnv('NOTIFICATIONS_EMAIL_WEBHOOK_URL') || null
  const slackChannelEnabled = readPublicBooleanEnv('NOTIFICATIONS_SLACK_CHANNEL_ENABLED') ?? false
  const slackWebhookUrl = readEnv('NOTIFICATIONS_SLACK_WEBHOOK_URL') || null
  const channelTimeoutMs = readPositiveInteger('NOTIFICATIONS_CHANNEL_TIMEOUT_MS', 4000)
  const reminderSchedulerEnabled = readPublicBooleanEnv('NOTIFICATIONS_REMINDER_SCHEDULER_ENABLED') ?? false
  const reminderIntervalMs = readPositiveInteger('NOTIFICATIONS_REMINDER_INTERVAL_MS', 15 * 60 * 1000)
  const reminderCooldownMinutes = readPositiveInteger('NOTIFICATIONS_REMINDER_COOLDOWN_MINUTES', 12 * 60)
  const reminderDueSoonHours = readPositiveInteger('NOTIFICATIONS_REMINDER_DUE_SOON_HOURS', 48)
  const reminderStaleInProgressHours = readPositiveInteger('NOTIFICATIONS_REMINDER_STALE_IN_PROGRESS_HOURS', 7 * 24)
  const reminderReviewSlaHours = readPositiveInteger('NOTIFICATIONS_REMINDER_REVIEW_SLA_HOURS', 24)
  const dailyRollupEnabled = readPublicBooleanEnv('NOTIFICATIONS_DAILY_ROLLUP_ENABLED') ?? false
  const dailyRollupHourUtc = readHourInteger('NOTIFICATIONS_DAILY_ROLLUP_HOUR_UTC', 8)

  cachedNotificationsConfig = {
    enabled,
    rolloutMode,
    publishRetries,
    maxInboxPageSize,
    unreadDriftWarnThreshold,
    emailChannelEnabled,
    emailWebhookUrl,
    slackChannelEnabled,
    slackWebhookUrl,
    channelTimeoutMs,
    reminderSchedulerEnabled,
    reminderIntervalMs,
    reminderCooldownMinutes,
    reminderDueSoonHours,
    reminderStaleInProgressHours,
    reminderReviewSlaHours,
    dailyRollupEnabled,
    dailyRollupHourUtc,
  }
  return cachedNotificationsConfig
}

export function resetNotificationsConfigCacheForTests() {
  cachedNotificationsConfig = null
}
