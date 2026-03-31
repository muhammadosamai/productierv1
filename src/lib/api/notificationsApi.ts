import type {
  NotificationCategory,
  NotificationInboxFacetsResponse,
  NotificationInboxResponse,
  NotificationItem,
  NotificationPreference,
  NotificationPreferencePreset,
  NotificationSeverity,
  NotificationUrgency,
} from '@/types/notification'
import { apiJson } from '@/lib/api/core'

export const notificationsApi = {
  list(
    options: {
      limit?: number
      cursor?: string | null
      unreadOnly?: boolean
      includeArchived?: boolean
      includeMuted?: boolean
      includeSnoozed?: boolean
      category?: NotificationCategory
      urgency?: NotificationUrgency
      severity?: NotificationSeverity
      entityType?: string
      type?: string
      productId?: string
    },
    token?: string | null,
  ) {
    return apiJson<NotificationInboxResponse>('/notifications', {
      token,
      query: {
        limit: options.limit,
        cursor: options.cursor ?? undefined,
        unreadOnly: options.unreadOnly,
        includeArchived: options.includeArchived,
        includeMuted: options.includeMuted,
        includeSnoozed: options.includeSnoozed,
        category: options.category,
        urgency: options.urgency,
        severity: options.severity,
        entityType: options.entityType,
        type: options.type,
        productId: options.productId,
      },
    })
  },
  unreadCount(productId?: string, token?: string | null) {
    return apiJson<{ unreadCount: number }>('/notifications/unread-count', {
      token,
      query: {
        productId,
      },
    })
  },
  facets(
    options: {
      unreadOnly?: boolean
      includeArchived?: boolean
      includeMuted?: boolean
      includeSnoozed?: boolean
      category?: NotificationCategory
      urgency?: NotificationUrgency
      severity?: NotificationSeverity
      entityType?: string
      type?: string
      productId?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<NotificationInboxFacetsResponse>('/notifications/facets', {
      token,
      query: {
        unreadOnly: options.unreadOnly,
        includeArchived: options.includeArchived,
        includeMuted: options.includeMuted,
        includeSnoozed: options.includeSnoozed,
        category: options.category,
        urgency: options.urgency,
        severity: options.severity,
        entityType: options.entityType,
        type: options.type,
        productId: options.productId,
      },
    })
  },
  markRead(ids: string[], token?: string | null) {
    return apiJson<{
      success: boolean
      updated: number
      unreadCount: number
      events?: Array<{ type: 'notification_read'; unreadCount: number; updated: number; emittedAt: string }>
    }>('/notifications/read', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  markAllRead(
    filters: {
      productId?: string
      category?: NotificationCategory
      urgency?: NotificationUrgency
      severity?: NotificationSeverity
      entityType?: string
      type?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<{
      success: boolean
      updated: number
      unreadCount: number
      events?: Array<{ type: 'notification_read'; unreadCount: number; updated: number; emittedAt: string }>
    }>('/notifications/read-all', {
      method: 'POST',
      token,
      json: filters,
    })
  },
  archive(ids: string[], token?: string | null) {
    return apiJson<{ success: boolean; archived: number }>('/notifications/archive', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  archiveAll(
    filters: {
      productId?: string
      category?: NotificationCategory
      urgency?: NotificationUrgency
      severity?: NotificationSeverity
      entityType?: string
      type?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<{ success: boolean; archived: number }>('/notifications/archive-all', {
      method: 'POST',
      token,
      json: filters,
    })
  },
  mute(ids: string[], token?: string | null) {
    return apiJson<{ success: boolean; updated: number }>('/notifications/mute', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  unmute(ids: string[], token?: string | null) {
    return apiJson<{ success: boolean; updated: number }>('/notifications/unmute', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  snooze(ids: string[], untilAt: string, token?: string | null) {
    return apiJson<{ success: boolean; updated: number; snoozedUntil: string }>('/notifications/snooze', {
      method: 'POST',
      token,
      json: { ids, untilAt },
    })
  },
  unsnooze(ids: string[], token?: string | null) {
    return apiJson<{ success: boolean; updated: number }>('/notifications/unsnooze', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  getPreferences(
    options: {
      productId?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<{ preferences: NotificationPreference[]; preset?: NotificationPreferencePreset }>('/notifications/preferences', {
      token,
      query: {
        productId: options.productId,
      },
    })
  },
  updatePreferences(
    preferences: NotificationPreference[],
    options: {
      productId?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<{ preferences: NotificationPreference[]; preset?: NotificationPreferencePreset }>('/notifications/preferences', {
      method: 'PUT',
      token,
      json: {
        productId: options.productId,
        preferences,
      },
    })
  },
  adminPublish(
    payload: {
      productId?: string
      action: string
      entityType?: string
      entityId?: string
      entityTitle?: string
      message?: string
      routePath?: string
      recipientUserIds?: string[]
      subjectUserIds?: string[]
      changes?: Array<{ field: string; from: string | null; to: string | null }>
    },
    token?: string | null,
  ) {
    return apiJson<{ success: boolean; published: number; deduped: number; recipientsConsidered: number }>(
      '/notifications/admin/publish',
      {
        method: 'POST',
        token,
        json: payload,
      },
    )
  },
  adminStats(token?: string | null) {
    return apiJson<{
      stats: {
        published: number
        deduped: number
        skippedByPreference: number
        skippedByPermission: number
        skippedBySelfViewOnly: number
        skippedByMembership: number
        skippedByDisabledFlag: number
        publishFailures: number
        readVisibilityFiltered?: number
        readVisibilityRedacted?: number
        actorScopeDenied?: number
        digestEscalationsPublished?: number
        unreadDriftWarnings?: number
        reminderSweeps?: number
        reminderCandidates?: number
        reminderPublished?: number
        reminderCooldownSkipped?: number
        rollupSweeps?: number
        rollupCandidates?: number
        rollupPublished?: number
        rollupAlreadySentToday?: number
        rollupDeduped?: number
        inboxQueries?: number
        inboxSlowOver500ms?: number
        inboxTotalLatencyMs?: number
        inboxAvgLatencyMs?: number
        lastInboxLatencyMs?: number
        channelQuietHoursSuppressed?: number
        emailDispatchAttempts?: number
        emailDispatchFailures?: number
        emailDispatchSuccess?: number
        slackDispatchAttempts?: number
        slackDispatchFailures?: number
        slackDispatchSuccess?: number
      }
    }>('/notifications/admin/stats', { token })
  },
  castItems(items: NotificationItem[] | undefined): NotificationItem[] {
    return Array.isArray(items) ? items : []
  },
}
