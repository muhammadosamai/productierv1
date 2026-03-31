import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RouteLocationRaw } from 'vue-router'
import { ApiError, notificationsApi } from '@/lib/apiClient'
import { buildHomeActivityEntityRoute } from '@/lib/homeEntityRouting'
import type {
  NotificationCategory,
  NotificationItem,
  NotificationPreference,
  NotificationPreferencePreset,
  NotificationSeverity,
  NotificationTypeFacet,
  NotificationUrgency,
} from '@/types/notification'
import { useAuthStore } from './auth'

const DEFAULT_INBOX_LIMIT = 20

const PAGE_FALLBACK_ROUTES: Record<string, string> = {
  home: '/home',
  settings: '/settings/profile',
  tasks: '/tasks',
  stories: '/stories',
  initiatives: '/initiatives',
  deliveries: '/deliveries',
  releases: '/releases',
  issues: '/issues',
  test_cycles: '/test-cycles',
  integrations: '/integrations',
  team: '/team',
  users: '/users',
}

const ENTITY_FALLBACK_ROUTES: Record<string, string> = {
  task: '/tasks',
  story: '/stories',
  initiative: '/initiatives',
  delivery: '/deliveries',
  release: '/releases',
  issue: '/issues',
  test_cycle: '/test-cycles',
  test_cycle_issue: '/issues',
  feature_request: '/feature-requests',
  consumer_feedback: '/feedbacks',
  user: '/users',
  title: '/settings/organization/titles',
  integration_connection: '/integrations',
  integration_sync: '/integrations',
}

type InboxFetchOptions = {
  reset?: boolean
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
  limit?: number
}

type InboxMutationFilters = {
  productId?: string
  category?: NotificationCategory
  urgency?: NotificationUrgency
  severity?: NotificationSeverity
  entityType?: string
  type?: string
}

function normalizeProductId(value?: string | null): string | null {
  if (!value) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeReminderCadence(value: unknown): 'immediate' | 'daily' | 'weekly' {
  if (value === 'immediate' || value === 'daily' || value === 'weekly') return value
  return 'daily'
}

function normalizeNotificationPreference(
  preference: NotificationPreference,
  scopedProductId: string | null
): NotificationPreference {
  const reminderCooldownMinutes = Number(preference.reminderCooldownMinutes)
  const reminderDueSoonHours = Number(preference.reminderDueSoonHours)
  return {
    ...preference,
    productId: preference.productId ?? scopedProductId,
    slackEnabled: Boolean(preference.slackEnabled),
    reminderCadence: normalizeReminderCadence(preference.reminderCadence),
    reminderCooldownMinutes: Number.isFinite(reminderCooldownMinutes)
      ? Math.max(15, reminderCooldownMinutes)
      : 720,
    reminderDueSoonHours: Number.isFinite(reminderDueSoonHours)
      ? Math.max(1, reminderDueSoonHours)
      : 48,
    reminderOverdueEnabled: preference.reminderOverdueEnabled ?? true,
    reminderDueSoonEnabled: preference.reminderDueSoonEnabled ?? true,
    reminderStaleEnabled: preference.reminderStaleEnabled ?? true,
    reminderReviewSlaEnabled: preference.reminderReviewSlaEnabled ?? true,
    dailyRollupEnabled: preference.dailyRollupEnabled ?? true,
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function mergeById(existing: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
  const byId = new Map(existing.map((item) => [item.id, item]))
  for (const item of incoming) {
    byId.set(item.id, item)
  }
  return Array.from(byId.values()).sort((left, right) => {
    if (left.createdAt === right.createdAt) return right.id.localeCompare(left.id)
    return right.createdAt.localeCompare(left.createdAt)
  })
}

function itemMatchesFilters(item: NotificationItem, filters: InboxMutationFilters): boolean {
  if (filters.productId && String(item.productId || '') !== filters.productId) return false
  if (filters.category && item.category !== filters.category) return false
  if (filters.urgency && item.urgency !== filters.urgency) return false
  if (filters.severity && item.severity !== filters.severity) return false
  if (filters.entityType && String(item.entityType || '') !== filters.entityType) return false
  if (filters.type && String(item.type || '') !== filters.type) return false
  return true
}

function toRouteLocation(path: string, query: Record<string, string> = {}): RouteLocationRaw {
  const queryEntries = Object.entries(query).filter(([, value]) => value.trim().length > 0)
  if (queryEntries.length === 0) return path
  return {
    path,
    query: Object.fromEntries(queryEntries),
  }
}

function normalizeNotificationRoutePath(routePath: string): RouteLocationRaw | null {
  const trimmed = routePath.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed, 'https://productier.local')
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/'
    const query: Record<string, string> = {}
    for (const [key, value] of parsed.searchParams.entries()) {
      query[key] = value
    }

    if (normalizedPath === '/users' && query.focusUser && !query.user) {
      query.user = query.focusUser
      delete query.focusUser
    }

    const storyMatch = normalizedPath.match(/^\/stories\/([^/]+)$/)
    if (storyMatch) return toRouteLocation('/stories', { ...query, story: storyMatch[1] || '' })

    const taskMatch = normalizedPath.match(/^\/tasks\/([^/]+)$/)
    if (taskMatch) return toRouteLocation('/tasks', { ...query, task: taskMatch[1] || '' })

    const issueMatch = normalizedPath.match(/^\/issues\/([^/]+)$/)
    if (issueMatch) return toRouteLocation('/issues', { ...query, issue: issueMatch[1] || '' })

    const testCycleIssueMatch = normalizedPath.match(/^\/test-cycles\/issues\/([^/]+)$/)
    if (testCycleIssueMatch) {
      return toRouteLocation('/issues', { ...query, issue: testCycleIssueMatch[1] || '' })
    }

    const userMatch = normalizedPath.match(/^\/users\/([^/]+)$/)
    if (userMatch) return toRouteLocation('/users', { ...query, user: userMatch[1] || '' })

    return toRouteLocation(normalizedPath, query)
  } catch {
    return null
  }
}

function resolveNotificationRoute(notification: NotificationItem): RouteLocationRaw {
  const normalizedRouteFromPayload = normalizeNotificationRoutePath(notification.routePath || '')
  if (normalizedRouteFromPayload) return normalizedRouteFromPayload

  const entityRoute = buildHomeActivityEntityRoute(notification.entityType, notification.entityId)
  if (entityRoute) return entityRoute

  const entityType = (notification.entityType || '').trim()
  const entityBaseRoute = ENTITY_FALLBACK_ROUTES[entityType]
  if (entityBaseRoute) return entityBaseRoute

  const pageRoute = PAGE_FALLBACK_ROUTES[(notification.page || '').trim()]
  return pageRoute || '/home'
}

export const useNotificationsStore = defineStore('notifications', () => {
  const authStore = useAuthStore()

  const items = ref<NotificationItem[]>([])
  const unreadCount = ref(0)
  const nextCursor = ref<string | null>(null)
  const loadingInbox = ref(false)
  const loadingCount = ref(false)
  const loadingPreferences = ref(false)
  const savingPreferences = ref(false)
  const preferences = ref<NotificationPreference[]>([])
  const preferenceScopeProductId = ref<string | null>(null)
  const preferencePreset = ref<NotificationPreferencePreset | null>(null)
  const filteredUnreadCount = ref(0)
  const typeFacets = ref<NotificationTypeFacet[]>([])
  const error = ref<string | null>(null)

  const hasUnread = computed(() => unreadCount.value > 0)
  const hasMore = computed(() => !!nextCursor.value)

  function reset() {
    items.value = []
    unreadCount.value = 0
    nextCursor.value = null
    preferences.value = []
    preferenceScopeProductId.value = null
    preferencePreset.value = null
    filteredUnreadCount.value = 0
    typeFacets.value = []
    error.value = null
  }

  async function fetchUnreadCount(productId?: string) {
    if (!authStore.token) return
    loadingCount.value = true
    try {
      const payload = await notificationsApi.unreadCount(productId, authStore.token)
      unreadCount.value = Number(payload.unreadCount || 0)
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to fetch unread notifications count')
    } finally {
      loadingCount.value = false
    }
  }

  async function fetchInbox(options: InboxFetchOptions = {}) {
    if (!authStore.token) return
    const shouldReset = options.reset !== false
    if (shouldReset) {
      nextCursor.value = null
    }

    loadingInbox.value = true
    error.value = null
    try {
      const payload = await notificationsApi.list({
        limit: options.limit || DEFAULT_INBOX_LIMIT,
        cursor: shouldReset ? null : nextCursor.value,
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
      }, authStore.token)

      const incomingItems = notificationsApi.castItems(payload.items)
      items.value = shouldReset ? incomingItems : mergeById(items.value, incomingItems)
      nextCursor.value = payload.nextCursor || null
      unreadCount.value = Number(payload.unreadCount || 0)
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to fetch notifications inbox')
    } finally {
      loadingInbox.value = false
    }
  }

  async function fetchFacets(options: Omit<InboxFetchOptions, 'reset' | 'limit'> = {}) {
    if (!authStore.token) return
    try {
      const payload = await notificationsApi.facets({
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
      }, authStore.token)
      filteredUnreadCount.value = Number(payload.filteredUnreadCount || 0)
      typeFacets.value = Array.isArray(payload.typeFacets)
        ? payload.typeFacets.map((facet) => ({
          type: String(facet.type || ''),
          label: String(facet.label || facet.type || ''),
          count: Number(facet.count || 0),
        })).filter((facet) => facet.type.length > 0)
        : []
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to load notification facets')
    }
  }

  async function fetchMore(options: Omit<InboxFetchOptions, 'reset'> = {}) {
    if (!nextCursor.value || loadingInbox.value) return
    await fetchInbox({
      ...options,
      reset: false,
    })
  }

  function markReadLocally(ids: string[]) {
    if (ids.length === 0) return
    const nowIso = new Date().toISOString()
    const idSet = new Set(ids)
    let marked = 0
    items.value = items.value.map((item) => {
      if (!idSet.has(item.id) || item.readAt) return item
      marked += 1
      return {
        ...item,
        readAt: nowIso,
      }
    })
    if (marked > 0) {
      unreadCount.value = Math.max(0, unreadCount.value - marked)
    }
  }

  async function markRead(ids: string[]) {
    if (!authStore.token || ids.length === 0) return
    markReadLocally(ids)
    try {
      const payload = await notificationsApi.markRead(ids, authStore.token)
      unreadCount.value = Number(payload.unreadCount || 0)
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to mark notifications as read')
      await fetchUnreadCount()
      await fetchInbox({ reset: true })
    }
  }

  async function markAllRead(
    filters: InboxMutationFilters = {},
  ) {
    if (!authStore.token) return
    const nowIso = new Date().toISOString()
    let newlyMarked = 0
    items.value = items.value.map((item) => {
      if (!itemMatchesFilters(item, filters) || item.readAt) return item
      newlyMarked += 1
      return {
        ...item,
        readAt: nowIso,
      }
    })
    if (newlyMarked > 0) {
      unreadCount.value = Math.max(0, unreadCount.value - newlyMarked)
    }
    try {
      const payload = await notificationsApi.markAllRead(filters, authStore.token)
      unreadCount.value = Number(payload.unreadCount || 0)
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to mark all notifications as read')
      await fetchUnreadCount(filters.productId)
      await fetchInbox({
        reset: true,
        productId: filters.productId,
        category: filters.category,
        urgency: filters.urgency,
        severity: filters.severity,
        entityType: filters.entityType,
        type: filters.type,
      })
    }
  }

  async function archive(ids: string[]) {
    if (!authStore.token || ids.length === 0) return
    const idSet = new Set(ids)
    const removedUnread = items.value.reduce((count, item) =>
      count + (!item.readAt && idSet.has(item.id) ? 1 : 0), 0,
    )
    items.value = items.value.filter((item) => !idSet.has(item.id))
    if (removedUnread > 0) {
      unreadCount.value = Math.max(0, unreadCount.value - removedUnread)
    }
    try {
      await notificationsApi.archive(ids, authStore.token)
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to archive notifications')
      await fetchInbox({ reset: true })
    }
  }

  async function archiveAll(
    filters: InboxMutationFilters = {},
  ) {
    if (!authStore.token) return
    const removedUnread = items.value.reduce((count, item) =>
      count + (!item.readAt && itemMatchesFilters(item, filters) ? 1 : 0), 0,
    )
    items.value = items.value.filter((item) => !itemMatchesFilters(item, filters))
    if (removedUnread > 0) {
      unreadCount.value = Math.max(0, unreadCount.value - removedUnread)
    }
    if (items.value.length === 0) {
      nextCursor.value = null
    }
    try {
      await notificationsApi.archiveAll(filters, authStore.token)
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to archive all notifications')
      await fetchInbox({
        reset: true,
        productId: filters.productId,
        category: filters.category,
        urgency: filters.urgency,
        severity: filters.severity,
        entityType: filters.entityType,
        type: filters.type,
      })
    }
  }

  async function fetchPreferences(productId?: string | null) {
    if (!authStore.token) return
    loadingPreferences.value = true
    error.value = null
    const scopedProductId = normalizeProductId(productId)
    try {
      const payload = await notificationsApi.getPreferences({
        productId: scopedProductId || undefined,
      }, authStore.token)
      const nextPreferences = Array.isArray(payload.preferences) ? payload.preferences : []
      preferences.value = nextPreferences.map((preference) => normalizeNotificationPreference(preference, scopedProductId))
      preferenceScopeProductId.value = scopedProductId
      preferencePreset.value = payload.preset ?? null
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to load notification preferences')
    } finally {
      loadingPreferences.value = false
    }
  }

  async function savePreferences(nextPreferences: NotificationPreference[], productId?: string | null) {
    if (!authStore.token) return
    savingPreferences.value = true
    error.value = null
    const scopedProductId = productId === undefined
      ? preferenceScopeProductId.value
      : normalizeProductId(productId)
    const payloadPreferences = nextPreferences.map((preference) => ({
      ...preference,
      productId: scopedProductId,
      slackEnabled: Boolean(preference.slackEnabled),
    }))
    try {
      const payload = await notificationsApi.updatePreferences(payloadPreferences, {
        productId: scopedProductId || undefined,
      }, authStore.token)
      const responsePreferences = Array.isArray(payload.preferences) ? payload.preferences : payloadPreferences
      preferences.value = responsePreferences.map((preference) => normalizeNotificationPreference(preference, scopedProductId))
      preferenceScopeProductId.value = scopedProductId
      preferencePreset.value = payload.preset ?? preferencePreset.value
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to save notification preferences')
      throw err
    } finally {
      savingPreferences.value = false
    }
  }

  async function applyPresetDefaults(productId?: string | null) {
    if (!preferencePreset.value) return
    await savePreferences(preferencePreset.value.defaults, productId)
  }

  return {
    items,
    unreadCount,
    nextCursor,
    loadingInbox,
    loadingCount,
    loadingPreferences,
    savingPreferences,
    preferences,
    preferenceScopeProductId,
    preferencePreset,
    filteredUnreadCount,
    typeFacets,
    error,
    hasUnread,
    hasMore,
    reset,
    fetchUnreadCount,
    fetchInbox,
    fetchFacets,
    fetchMore,
    markRead,
    markAllRead,
    archive,
    archiveAll,
    fetchPreferences,
    savePreferences,
    applyPresetDefaults,
    resolveNotificationRoute,
  }
})
