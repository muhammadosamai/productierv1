import { Elysia, t } from 'elysia'
import { requireAuth, requireProductAccess } from '../lib/authz'
import {
  archiveAllNotifications,
  archiveNotifications,
  getNotificationFacetsForUser,
  getNotificationPreferencePresetForUser,
  getNotificationPreferencesForUser,
  getNotificationRuntimeStats,
  getUnreadNotificationCount,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationsRead,
  muteNotifications,
  publishNotification,
  snoozeNotifications,
  unmuteNotifications,
  unsnoozeNotifications,
  upsertNotificationPreferencesForUser,
} from '../lib/notifications'
import { NOTIFICATION_CATEGORIES, NOTIFICATION_SEVERITIES, NOTIFICATION_URGENCIES } from '../lib/notificationContracts'
import { authPlugin } from '../plugins/auth'

const REMINDER_CADENCE_VALUES = ['immediate', 'daily', 'weekly'] as const

function isNotificationCategory(value: string): value is (typeof NOTIFICATION_CATEGORIES)[number] {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
}

function isNotificationSeverity(value: string): value is (typeof NOTIFICATION_SEVERITIES)[number] {
  return (NOTIFICATION_SEVERITIES as readonly string[]).includes(value)
}

function isReminderCadence(value: string): value is (typeof REMINDER_CADENCE_VALUES)[number] {
  return (REMINDER_CADENCE_VALUES as readonly string[]).includes(value)
}

function isNotificationUrgency(value: string): value is (typeof NOTIFICATION_URGENCIES)[number] {
  return (NOTIFICATION_URGENCIES as readonly string[]).includes(value)
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return undefined
}

function isSchemaMismatchError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && (
    code === '42P01' // undefined_table
    || code === '42703' // undefined_column
    || code === '42704' // undefined_object
  )
}

function schemaMismatchMessage(): string {
  return 'Notification schema is out of date. Run `bun run db:migration:reconcile` and `bun run db:migrate` on the server.'
}

function isPreferenceValidationError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false
  return /^(Invalid notification|Invalid reminder cadence|Invalid quiet hours value)/.test(error.message)
}

function buildReadSyncEvent(unreadCount: number, updated: number) {
  return {
    type: 'notification_read' as const,
    unreadCount,
    updated,
    emittedAt: new Date().toISOString(),
  }
}

export const notificationRoutes = new Elysia({ prefix: '/api/notifications' })
  .use(authPlugin)

  .get('/', async ({ query, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const limit = query.limit ? Number(query.limit) : undefined
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      set.status = 400
      return { error: 'limit must be a positive number' }
    }

    const category = query.category?.trim()
    if (category && !isNotificationCategory(category)) {
      set.status = 400
      return { error: `Unsupported category "${category}"` }
    }
    const urgency = query.urgency?.trim()
    if (urgency && !isNotificationUrgency(urgency)) {
      set.status = 400
      return { error: `Unsupported urgency "${urgency}"` }
    }
    const severity = query.severity?.trim()
    if (severity && !isNotificationSeverity(severity)) {
      set.status = 400
      return { error: `Unsupported severity "${severity}"` }
    }
    const entityType = query.entityType?.trim()
    if (query.entityType !== undefined && !entityType) {
      set.status = 400
      return { error: 'entityType must be a non-empty string when provided' }
    }
    const type = query.type?.trim()
    if (query.type !== undefined && !type) {
      set.status = 400
      return { error: 'type must be a non-empty string when provided' }
    }

    const unreadOnly = parseBoolean(query.unreadOnly)
    if (query.unreadOnly !== undefined && unreadOnly === undefined) {
      set.status = 400
      return { error: 'unreadOnly must be a boolean' }
    }

    const includeArchived = parseBoolean(query.includeArchived)
    if (query.includeArchived !== undefined && includeArchived === undefined) {
      set.status = 400
      return { error: 'includeArchived must be a boolean' }
    }

    const includeMuted = parseBoolean(query.includeMuted)
    if (query.includeMuted !== undefined && includeMuted === undefined) {
      set.status = 400
      return { error: 'includeMuted must be a boolean' }
    }

    const includeSnoozed = parseBoolean(query.includeSnoozed)
    if (query.includeSnoozed !== undefined && includeSnoozed === undefined) {
      set.status = 400
      return { error: 'includeSnoozed must be a boolean' }
    }

    if (query.productId) {
      const access = await requireProductAccess(jwtInstance.verify, headers, set, query.productId)
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const result = await listNotificationsForUser(user, {
      limit,
      cursor: query.cursor,
      unreadOnly,
      includeArchived,
      includeMuted,
      includeSnoozed,
      category: category as any,
      urgency: urgency as any,
      severity: severity as any,
      entityType,
      type,
      productId: query.productId,
    })
    const unreadCount = await getUnreadNotificationCount(user, query.productId)

    return {
      items: result.items,
      nextCursor: result.nextCursor,
      unreadCount,
    }
  }, {
    query: t.Object({
      limit: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
      unreadOnly: t.Optional(t.String()),
      includeArchived: t.Optional(t.String()),
      includeMuted: t.Optional(t.String()),
      includeSnoozed: t.Optional(t.String()),
      category: t.Optional(t.String()),
      urgency: t.Optional(t.String()),
      severity: t.Optional(t.String()),
      entityType: t.Optional(t.String()),
      type: t.Optional(t.String()),
      productId: t.Optional(t.String()),
    }),
  })

  .get('/facets', async ({ query, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const category = query.category?.trim()
    if (category && !isNotificationCategory(category)) {
      set.status = 400
      return { error: `Unsupported category "${category}"` }
    }
    const urgency = query.urgency?.trim()
    if (urgency && !isNotificationUrgency(urgency)) {
      set.status = 400
      return { error: `Unsupported urgency "${urgency}"` }
    }
    const severity = query.severity?.trim()
    if (severity && !isNotificationSeverity(severity)) {
      set.status = 400
      return { error: `Unsupported severity "${severity}"` }
    }
    const entityType = query.entityType?.trim()
    if (query.entityType !== undefined && !entityType) {
      set.status = 400
      return { error: 'entityType must be a non-empty string when provided' }
    }
    const type = query.type?.trim()
    if (query.type !== undefined && !type) {
      set.status = 400
      return { error: 'type must be a non-empty string when provided' }
    }

    const unreadOnly = parseBoolean(query.unreadOnly)
    if (query.unreadOnly !== undefined && unreadOnly === undefined) {
      set.status = 400
      return { error: 'unreadOnly must be a boolean' }
    }

    const includeArchived = parseBoolean(query.includeArchived)
    if (query.includeArchived !== undefined && includeArchived === undefined) {
      set.status = 400
      return { error: 'includeArchived must be a boolean' }
    }

    const includeMuted = parseBoolean(query.includeMuted)
    if (query.includeMuted !== undefined && includeMuted === undefined) {
      set.status = 400
      return { error: 'includeMuted must be a boolean' }
    }

    const includeSnoozed = parseBoolean(query.includeSnoozed)
    if (query.includeSnoozed !== undefined && includeSnoozed === undefined) {
      set.status = 400
      return { error: 'includeSnoozed must be a boolean' }
    }

    if (query.productId) {
      const access = await requireProductAccess(jwtInstance.verify, headers, set, query.productId)
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const facets = await getNotificationFacetsForUser(user, {
      unreadOnly,
      includeArchived,
      includeMuted,
      includeSnoozed,
      category: category as any,
      urgency: urgency as any,
      severity: severity as any,
      entityType,
      type,
      productId: query.productId,
    })

    return facets
  }, {
    query: t.Object({
      unreadOnly: t.Optional(t.String()),
      includeArchived: t.Optional(t.String()),
      includeMuted: t.Optional(t.String()),
      includeSnoozed: t.Optional(t.String()),
      category: t.Optional(t.String()),
      urgency: t.Optional(t.String()),
      severity: t.Optional(t.String()),
      entityType: t.Optional(t.String()),
      type: t.Optional(t.String()),
      productId: t.Optional(t.String()),
    }),
  })

  .get('/unread-count', async ({ query, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    if (query.productId) {
      const access = await requireProductAccess(jwtInstance.verify, headers, set, query.productId)
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const unreadCount = await getUnreadNotificationCount(user, query.productId)
    return { unreadCount }
  }, {
    query: t.Object({
      productId: t.Optional(t.String()),
    }),
  })

  .post('/read', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      set.status = 400
      return { error: 'ids must contain at least one notification id' }
    }

    const result = await markNotificationsRead(user, body.ids)
    return {
      success: true,
      updated: result.updated,
      unreadCount: result.unreadCount,
      events: [buildReadSyncEvent(result.unreadCount, result.updated)],
    }
  }, {
    body: t.Object({
      ids: t.Array(t.String()),
    }),
  })

  .post('/read-all', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const category = body.category?.trim()
    if (category && !isNotificationCategory(category)) {
      set.status = 400
      return { error: `Unsupported category "${category}"` }
    }
    const urgency = body.urgency?.trim()
    if (urgency && !isNotificationUrgency(urgency)) {
      set.status = 400
      return { error: `Unsupported urgency "${urgency}"` }
    }
    const severity = body.severity?.trim()
    if (severity && !isNotificationSeverity(severity)) {
      set.status = 400
      return { error: `Unsupported severity "${severity}"` }
    }
    const entityType = body.entityType?.trim()
    if (body.entityType !== undefined && !entityType) {
      set.status = 400
      return { error: 'entityType must be a non-empty string when provided' }
    }
    const type = body.type?.trim()
    if (body.type !== undefined && !type) {
      set.status = 400
      return { error: 'type must be a non-empty string when provided' }
    }

    if (body.productId) {
      const access = await requireProductAccess(jwtInstance.verify, headers, set, body.productId)
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const result = await markAllNotificationsRead(user, {
      productId: body.productId || undefined,
      category: category as any,
      urgency: urgency as any,
      severity: severity as any,
      entityType,
      type,
    })
    return {
      success: true,
      updated: result.updated,
      unreadCount: result.unreadCount,
      events: [buildReadSyncEvent(result.unreadCount, result.updated)],
    }
  }, {
    body: t.Object({
      productId: t.Optional(t.String()),
      category: t.Optional(t.String()),
      urgency: t.Optional(t.String()),
      severity: t.Optional(t.String()),
      entityType: t.Optional(t.String()),
      type: t.Optional(t.String()),
    }),
  })

  .post('/archive', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      set.status = 400
      return { error: 'ids must contain at least one notification id' }
    }

    const result = await archiveNotifications(user, body.ids)
    return {
      success: true,
      archived: result.archived,
    }
  }, {
    body: t.Object({
      ids: t.Array(t.String()),
    }),
  })

  .post('/archive-all', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const category = body.category?.trim()
    if (category && !isNotificationCategory(category)) {
      set.status = 400
      return { error: `Unsupported category "${category}"` }
    }
    const urgency = body.urgency?.trim()
    if (urgency && !isNotificationUrgency(urgency)) {
      set.status = 400
      return { error: `Unsupported urgency "${urgency}"` }
    }
    const severity = body.severity?.trim()
    if (severity && !isNotificationSeverity(severity)) {
      set.status = 400
      return { error: `Unsupported severity "${severity}"` }
    }
    const entityType = body.entityType?.trim()
    if (body.entityType !== undefined && !entityType) {
      set.status = 400
      return { error: 'entityType must be a non-empty string when provided' }
    }
    const type = body.type?.trim()
    if (body.type !== undefined && !type) {
      set.status = 400
      return { error: 'type must be a non-empty string when provided' }
    }

    if (body.productId) {
      const access = await requireProductAccess(jwtInstance.verify, headers, set, body.productId)
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const result = await archiveAllNotifications(user, {
      productId: body.productId || undefined,
      category: category as any,
      urgency: urgency as any,
      severity: severity as any,
      entityType,
      type,
    })
    return {
      success: true,
      archived: result.archived,
    }
  }, {
    body: t.Object({
      productId: t.Optional(t.String()),
      category: t.Optional(t.String()),
      urgency: t.Optional(t.String()),
      severity: t.Optional(t.String()),
      entityType: t.Optional(t.String()),
      type: t.Optional(t.String()),
    }),
  })

  .post('/mute', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      set.status = 400
      return { error: 'ids must contain at least one notification id' }
    }

    const result = await muteNotifications(user, body.ids)
    return {
      success: true,
      updated: result.updated,
    }
  }, {
    body: t.Object({
      ids: t.Array(t.String()),
    }),
  })

  .post('/unmute', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      set.status = 400
      return { error: 'ids must contain at least one notification id' }
    }

    const result = await unmuteNotifications(user, body.ids)
    return {
      success: true,
      updated: result.updated,
    }
  }, {
    body: t.Object({
      ids: t.Array(t.String()),
    }),
  })

  .post('/snooze', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      set.status = 400
      return { error: 'ids must contain at least one notification id' }
    }

    const untilAt = new Date(body.untilAt)
    if (Number.isNaN(untilAt.getTime())) {
      set.status = 400
      return { error: 'untilAt must be a valid ISO timestamp' }
    }
    if (untilAt.getTime() <= Date.now()) {
      set.status = 400
      return { error: 'untilAt must be in the future' }
    }

    const result = await snoozeNotifications(user, body.ids, untilAt)
    return {
      success: true,
      updated: result.updated,
      snoozedUntil: untilAt.toISOString(),
    }
  }, {
    body: t.Object({
      ids: t.Array(t.String()),
      untilAt: t.String(),
    }),
  })

  .post('/unsnooze', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      set.status = 400
      return { error: 'ids must contain at least one notification id' }
    }

    const result = await unsnoozeNotifications(user, body.ids)
    return {
      success: true,
      updated: result.updated,
    }
  }, {
    body: t.Object({
      ids: t.Array(t.String()),
    }),
  })

  .get('/preferences', async ({ query, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    const scopedProductId = typeof query.productId === 'string' && query.productId.trim().length > 0
      ? query.productId.trim()
      : undefined
    if (scopedProductId) {
      const access = await requireProductAccess(jwtInstance.verify, headers, set, scopedProductId)
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    try {
      const [preferences, preset] = await Promise.all([
        getNotificationPreferencesForUser(user.id, scopedProductId),
        getNotificationPreferencePresetForUser(user.id),
      ])
      return {
        preferences,
        preset: {
          persona: preset.persona,
          source: preset.source,
          titleKey: preset.titleKey,
          titleName: preset.titleName,
          defaults: preset.defaults,
        },
      }
    } catch (error) {
      if (isSchemaMismatchError(error)) {
        set.status = 503
        return { error: schemaMismatchMessage() }
      }
      throw error
    }
  }, {
    query: t.Object({
      productId: t.Optional(t.String()),
    }),
  })

  .put('/preferences', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const scopedProductId = typeof body.productId === 'string' && body.productId.trim().length > 0
      ? body.productId.trim()
      : undefined
    if (body.productId !== undefined && body.productId !== null && !scopedProductId) {
      set.status = 400
      return { error: 'productId must be a non-empty string when provided' }
    }
    if (scopedProductId) {
      const access = await requireProductAccess(jwtInstance.verify, headers, set, scopedProductId)
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const preferences = body.preferences || []
    if (!Array.isArray(preferences) || preferences.length === 0) {
      set.status = 400
      return { error: 'preferences must contain at least one entry' }
    }

    for (const preference of preferences) {
      if (!preference || !isNotificationCategory(preference.category)) {
        set.status = 400
        return { error: `Unsupported category "${preference?.category || ''}"` }
      }
      if (preference.minimumSeverity && !isNotificationSeverity(preference.minimumSeverity)) {
        set.status = 400
        return { error: `Unsupported minimumSeverity "${preference.minimumSeverity}"` }
      }
      if (preference.reminderCadence && !isReminderCadence(preference.reminderCadence)) {
        set.status = 400
        return { error: `Unsupported reminderCadence "${preference.reminderCadence}"` }
      }
      if (
        preference.reminderCooldownMinutes !== undefined
        && (!Number.isFinite(preference.reminderCooldownMinutes) || preference.reminderCooldownMinutes < 15)
      ) {
        set.status = 400
        return { error: 'reminderCooldownMinutes must be a number >= 15' }
      }
      if (
        preference.reminderDueSoonHours !== undefined
        && (!Number.isFinite(preference.reminderDueSoonHours) || preference.reminderDueSoonHours < 1)
      ) {
        set.status = 400
        return { error: 'reminderDueSoonHours must be a number >= 1' }
      }
    }

    try {
      const updated = await upsertNotificationPreferencesForUser(user.id, preferences as any, scopedProductId)
      const preset = await getNotificationPreferencePresetForUser(user.id)
      return {
        preferences: updated,
        preset: {
          persona: preset.persona,
          source: preset.source,
          titleKey: preset.titleKey,
          titleName: preset.titleName,
          defaults: preset.defaults,
        },
      }
    } catch (error) {
      if (isSchemaMismatchError(error)) {
        set.status = 503
        return { error: schemaMismatchMessage() }
      }
      if (isPreferenceValidationError(error)) {
        set.status = 400
        return { error: error.message, code: 'BAD_REQUEST' as const }
      }
      throw error
    }
  }, {
    body: t.Object({
      productId: t.Optional(t.Nullable(t.String())),
      preferences: t.Array(
        t.Object({
          category: t.String(),
          inAppEnabled: t.Optional(t.Boolean()),
          emailEnabled: t.Optional(t.Boolean()),
          slackEnabled: t.Optional(t.Boolean()),
          quietHoursStart: t.Optional(t.Nullable(t.String())),
          quietHoursEnd: t.Optional(t.Nullable(t.String())),
          minimumSeverity: t.Optional(t.String()),
          reminderCadence: t.Optional(t.String()),
          reminderCooldownMinutes: t.Optional(t.Number()),
          reminderDueSoonHours: t.Optional(t.Number()),
          reminderOverdueEnabled: t.Optional(t.Boolean()),
          reminderDueSoonEnabled: t.Optional(t.Boolean()),
          reminderStaleEnabled: t.Optional(t.Boolean()),
          reminderReviewSlaEnabled: t.Optional(t.Boolean()),
          dailyRollupEnabled: t.Optional(t.Boolean()),
        }),
      ),
    }),
  })

  .post('/admin/publish', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    let authorized = user.role === 'super_admin' || user.role === 'admin'
    if (!authorized && body.productId) {
      const productAccess = await requireProductAccess(jwtInstance.verify, headers, set, body.productId, ['owner', 'admin'])
      authorized = !!productAccess
      if (!authorized && set.status === 401) return { error: 'Unauthorized' }
    }

    if (!authorized) {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const publishResult = await publishNotification({
      productId: body.productId || null,
      actorUserId: user.id,
      actorName: user.name,
      action: body.action,
      entityType: body.entityType || null,
      entityId: body.entityId || null,
      entityTitle: body.entityTitle || null,
      message: body.message || null,
      routePath: body.routePath || null,
      recipientUserIds: body.recipientUserIds || null,
      subjectUserIds: body.subjectUserIds || null,
      changes: body.changes || null,
    })

    return {
      success: true,
      ...publishResult,
    }
  }, {
    body: t.Object({
      productId: t.Optional(t.String()),
      action: t.String(),
      entityType: t.Optional(t.String()),
      entityId: t.Optional(t.String()),
      entityTitle: t.Optional(t.String()),
      message: t.Optional(t.String()),
      routePath: t.Optional(t.String()),
      recipientUserIds: t.Optional(t.Array(t.String())),
      subjectUserIds: t.Optional(t.Array(t.String())),
      changes: t.Optional(
        t.Array(
          t.Object({
            field: t.String(),
            from: t.Nullable(t.String()),
            to: t.Nullable(t.String()),
          }),
        ),
      ),
    }),
  })

  .get('/admin/stats', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    return {
      stats: getNotificationRuntimeStats(),
    }
  })
