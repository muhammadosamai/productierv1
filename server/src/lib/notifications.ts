import { and, desc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm'
import { db } from '../db'
import {
  consumerFeedbacks,
  featureRequests,
  integrationConnections,
  integrationSyncRuns,
  issues,
  notificationPreferences,
  notifications,
  organizationTeamMembers,
  productMembers,
  products,
  releaseDeployments,
  releases,
  servers,
  storyComments,
  stories,
  tasks,
  testCycleIssues,
  testCycles,
  titles,
  initiatives,
  deliveries,
  userTitles,
  users,
} from '../db/schema'
import { getNotificationsConfig } from '../config/notifications'
import { getEffectivePagePermissionForUser, isGlobalAdminRole, type AuthenticatedUser } from './authz'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_SEVERITIES,
  formatNotificationMessage,
  humanizeNotificationType,
  resolveContractForEvent,
  resolvePageForEntity,
  resolveRouteForEntity,
  type ActivityChange,
  type NotificationCategory,
  type NotificationSeverity,
  type NotificationUrgency,
} from './notificationContracts'

const ASSIGNMENT_CHANGE_FIELDS = new Set([
  'ownerUserId',
  'assigneeUserIds',
  'reviewerUserIds',
  'assignedToUserId',
  'leaderUserId',
  'releaseManagerId',
  'createdByUserId',
])

const ASSIGNMENT_TEAM_CHANGE_FIELDS = new Set([
  'ownerTeamId',
  'assigneeTeamIds',
  'reviewerTeamIds',
  'assignedToTeamId',
])

const MENTION_CHANGE_FIELDS = new Set([
  'mentionUserId',
  'mentionedUserIds',
  'mentions',
])

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
}

const RETRYABLE_PG_CODES = new Set(['40001', '40P01', '53300', '57P03'])
const QUIET_HOURS_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/
const DEDUPE_WINDOW_MS = 15 * 60 * 1000
const REMINDER_CADENCE_VALUES = ['immediate', 'daily', 'weekly'] as const

type ReminderCadence = (typeof REMINDER_CADENCE_VALUES)[number]

export interface NotificationInboxQuery {
  limit?: number
  cursor?: string
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
}

export interface NotificationPreferenceInput {
  productId?: string | null
  category: NotificationCategory
  inAppEnabled?: boolean
  emailEnabled?: boolean
  slackEnabled?: boolean
  quietHoursStart?: string | null
  quietHoursEnd?: string | null
  minimumSeverity?: NotificationSeverity
  reminderCadence?: ReminderCadence
  reminderCooldownMinutes?: number
  reminderDueSoonHours?: number
  reminderOverdueEnabled?: boolean
  reminderDueSoonEnabled?: boolean
  reminderStaleEnabled?: boolean
  reminderReviewSlaEnabled?: boolean
  dailyRollupEnabled?: boolean
}

export interface PublishFromActivityInput {
  id?: string | null
  productId?: string | null
  userId?: string | null
  userName: string
  userAvatar?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  entityTitle?: string | null
  changes?: ActivityChange[] | null
  routePathOverride?: string | null
  subjectUserIds?: string[] | null
}

export interface PublishNotificationInput {
  productId?: string | null
  actorUserId?: string | null
  actorName?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  entityTitle?: string | null
  message?: string | null
  routePath?: string | null
  subjectUserIds?: string[] | null
  recipientUserIds?: string[] | null
  changes?: ActivityChange[] | null
}

interface NotificationCursor {
  createdAt: Date
  id: string
}

interface DefaultPreference {
  productId?: string | null
  category: NotificationCategory
  inAppEnabled: boolean
  emailEnabled: boolean
  slackEnabled: boolean
  quietHoursStart: string | null
  quietHoursEnd: string | null
  minimumSeverity: NotificationSeverity
  reminderCadence: ReminderCadence
  reminderCooldownMinutes: number
  reminderDueSoonHours: number
  reminderOverdueEnabled: boolean
  reminderDueSoonEnabled: boolean
  reminderStaleEnabled: boolean
  reminderReviewSlaEnabled: boolean
  dailyRollupEnabled: boolean
}

type NotificationPersona =
  | 'executive'
  | 'manager'
  | 'developer'
  | 'quality'
  | 'admin'
  | 'viewer'

interface NotificationPreferencePreset {
  persona: NotificationPersona
  source: 'role_only' | 'title_only' | 'role_and_title'
  titleKey: string | null
  titleName: string | null
  defaults: DefaultPreference[]
}

type NotificationRecord = typeof notifications.$inferSelect
type UserRecord = typeof users.$inferSelect
type NotificationContract = ReturnType<typeof resolveContractForEvent>
type EffectivePagePermission = Awaited<ReturnType<typeof getEffectivePagePermissionForUser>>['permission']

interface NotificationReadScopeCaches {
  membershipByProductId: Map<string, boolean>
  pagePermissionByPage: Map<string, EffectivePagePermission>
}

interface ResolvedRecipientPreference {
  inAppEnabled: boolean
  emailEnabled: boolean
  slackEnabled: boolean
  quietHoursStart: string | null
  quietHoursEnd: string | null
  minimumSeverity: NotificationSeverity
  reminderCadence: ReminderCadence
  reminderCooldownMinutes: number
  reminderDueSoonHours: number
  reminderOverdueEnabled: boolean
  reminderDueSoonEnabled: boolean
  reminderStaleEnabled: boolean
  reminderReviewSlaEnabled: boolean
  dailyRollupEnabled: boolean
}

interface ResolvedRecipient {
  user: UserRecord
  preference: ResolvedRecipientPreference
}

const runtimeStats = {
  published: 0,
  deduped: 0,
  skippedByPreference: 0,
  skippedByPermission: 0,
  skippedBySelfViewOnly: 0,
  skippedByMembership: 0,
  skippedByDisabledFlag: 0,
  publishFailures: 0,
  readVisibilityFiltered: 0,
  readVisibilityRedacted: 0,
  actorScopeDenied: 0,
  digestEscalationsPublished: 0,
  unreadDriftWarnings: 0,
  reminderSweeps: 0,
  reminderCandidates: 0,
  reminderPublished: 0,
  reminderCooldownSkipped: 0,
  rollupSweeps: 0,
  rollupCandidates: 0,
  rollupPublished: 0,
  rollupAlreadySentToday: 0,
  rollupDeduped: 0,
  inboxQueries: 0,
  inboxSlowOver500ms: 0,
  inboxTotalLatencyMs: 0,
  lastInboxLatencyMs: 0,
  channelQuietHoursSuppressed: 0,
  emailDispatchAttempts: 0,
  emailDispatchFailures: 0,
  emailDispatchSuccess: 0,
  slackDispatchAttempts: 0,
  slackDispatchFailures: 0,
  slackDispatchSuccess: 0,
}

function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
}

function isNotificationSeverity(value: string): value is NotificationSeverity {
  return (NOTIFICATION_SEVERITIES as readonly string[]).includes(value)
}

function isReminderCadence(value: string): value is ReminderCadence {
  return (REMINDER_CADENCE_VALUES as readonly string[]).includes(value)
}

const PERSONA_CATEGORY_OVERRIDES: Record<
  NotificationPersona,
  Partial<Record<NotificationCategory, Partial<DefaultPreference>>>
> = {
  executive: {
    assignment: { inAppEnabled: false, minimumSeverity: 'high' },
    workflow: { inAppEnabled: false, minimumSeverity: 'high' },
    risk: { inAppEnabled: true, minimumSeverity: 'medium' },
    quality: { inAppEnabled: false, minimumSeverity: 'high' },
    release: { inAppEnabled: true, minimumSeverity: 'medium' },
    admin: { inAppEnabled: true, minimumSeverity: 'medium' },
    integration: { inAppEnabled: false, minimumSeverity: 'high' },
    digest: { inAppEnabled: true, minimumSeverity: 'low' },
  },
  manager: {
    assignment: { inAppEnabled: true, minimumSeverity: 'medium' },
    workflow: { inAppEnabled: true, minimumSeverity: 'low' },
    risk: { inAppEnabled: true, minimumSeverity: 'medium' },
    quality: { inAppEnabled: true, minimumSeverity: 'medium' },
    release: { inAppEnabled: true, minimumSeverity: 'low' },
    admin: { inAppEnabled: true, minimumSeverity: 'medium' },
    integration: { inAppEnabled: true, minimumSeverity: 'medium' },
    digest: { inAppEnabled: true, minimumSeverity: 'low' },
  },
  developer: {
    assignment: { inAppEnabled: true, minimumSeverity: 'low' },
    workflow: { inAppEnabled: true, minimumSeverity: 'low' },
    risk: { inAppEnabled: true, minimumSeverity: 'medium' },
    quality: { inAppEnabled: true, minimumSeverity: 'low' },
    release: { inAppEnabled: true, minimumSeverity: 'medium' },
    admin: { inAppEnabled: true, minimumSeverity: 'high' },
    integration: { inAppEnabled: true, minimumSeverity: 'medium' },
    digest: { inAppEnabled: true, minimumSeverity: 'medium' },
  },
  quality: {
    assignment: { inAppEnabled: true, minimumSeverity: 'medium' },
    workflow: { inAppEnabled: true, minimumSeverity: 'low' },
    risk: { inAppEnabled: true, minimumSeverity: 'medium' },
    quality: { inAppEnabled: true, minimumSeverity: 'low' },
    release: { inAppEnabled: true, minimumSeverity: 'medium' },
    admin: { inAppEnabled: false, minimumSeverity: 'high' },
    integration: { inAppEnabled: false, minimumSeverity: 'high' },
    digest: { inAppEnabled: true, minimumSeverity: 'medium' },
  },
  admin: {
    assignment: { inAppEnabled: true, minimumSeverity: 'medium' },
    workflow: { inAppEnabled: true, minimumSeverity: 'medium' },
    risk: { inAppEnabled: true, minimumSeverity: 'medium' },
    quality: { inAppEnabled: true, minimumSeverity: 'medium' },
    release: { inAppEnabled: true, minimumSeverity: 'medium' },
    admin: { inAppEnabled: true, minimumSeverity: 'low' },
    integration: { inAppEnabled: true, minimumSeverity: 'medium' },
    digest: { inAppEnabled: true, minimumSeverity: 'low' },
  },
  viewer: {
    assignment: { inAppEnabled: false, minimumSeverity: 'high' },
    workflow: { inAppEnabled: false, minimumSeverity: 'high' },
    risk: { inAppEnabled: true, minimumSeverity: 'high' },
    quality: { inAppEnabled: false, minimumSeverity: 'high' },
    release: { inAppEnabled: true, minimumSeverity: 'medium' },
    admin: { inAppEnabled: false, minimumSeverity: 'high' },
    integration: { inAppEnabled: false, minimumSeverity: 'high' },
    digest: { inAppEnabled: true, minimumSeverity: 'low' },
  },
}

function baselineDefaultPreference(category: NotificationCategory): DefaultPreference {
  return {
    category,
    inAppEnabled: true,
    emailEnabled: false,
    slackEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    minimumSeverity: 'low',
    reminderCadence: 'daily',
    reminderCooldownMinutes: 720,
    reminderDueSoonHours: 48,
    reminderOverdueEnabled: true,
    reminderDueSoonEnabled: true,
    reminderStaleEnabled: true,
    reminderReviewSlaEnabled: true,
    dailyRollupEnabled: true,
  }
}

function normalizeTitleHint(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

function inferPersona(role: string, titleKey: string | null, titleName: string | null): {
  persona: NotificationPersona
  source: 'role_only' | 'title_only' | 'role_and_title'
} {
  const normalizedRole = role.trim().toLowerCase()
  const normalizedTitleKey = normalizeTitleHint(titleKey)
  const normalizedTitleName = normalizeTitleHint(titleName)
  const titleHint = `${normalizedTitleKey} ${normalizedTitleName}`

  const hasExecutiveHint = /(executive|director|vp|cxo|chief|head_)/.test(titleHint)
  const hasManagerHint = /(product_manager|project_manager|manager|owner|lead|pm)/.test(titleHint)
  const hasQualityHint = /(qa|quality|tester|test_engineer)/.test(titleHint)
  const hasDeveloperHint = /(developer|engineer|swe|programmer|architect)/.test(titleHint)

  if (hasExecutiveHint) {
    return { persona: 'executive', source: normalizedRole ? 'role_and_title' : 'title_only' }
  }
  if (hasQualityHint) {
    return { persona: 'quality', source: normalizedRole ? 'role_and_title' : 'title_only' }
  }
  if (hasManagerHint) {
    return { persona: 'manager', source: normalizedRole ? 'role_and_title' : 'title_only' }
  }
  if (hasDeveloperHint) {
    return { persona: 'developer', source: normalizedRole ? 'role_and_title' : 'title_only' }
  }

  if (normalizedRole === 'super_admin' || normalizedRole === 'admin' || normalizedRole === 'product_admin') {
    return { persona: 'admin', source: 'role_only' }
  }
  if (normalizedRole === 'product_manager' || normalizedRole === 'business_analyst') {
    return { persona: 'manager', source: 'role_only' }
  }
  if (normalizedRole === 'developer') {
    return { persona: 'developer', source: 'role_only' }
  }
  if (normalizedRole === 'viewer') {
    return { persona: 'viewer', source: 'role_only' }
  }
  return { persona: 'manager', source: 'role_only' }
}

function defaultPreferenceForPersona(category: NotificationCategory, persona: NotificationPersona): DefaultPreference {
  const baseline = baselineDefaultPreference(category)
  const overrides = PERSONA_CATEGORY_OVERRIDES[persona]?.[category]
  if (!overrides) return baseline
  return {
    ...baseline,
    ...overrides,
  }
}

function buildPersonaDefaults(persona: NotificationPersona): DefaultPreference[] {
  return NOTIFICATION_CATEGORIES.map((category) => defaultPreferenceForPersona(category, persona))
}

async function resolveNotificationPreferencePresetForUser(userId: string): Promise<NotificationPreferencePreset> {
  const rows = await db
    .select({
      role: users.role,
      titleKey: titles.key,
      titleName: titles.name,
    })
    .from(users)
    .leftJoin(userTitles, eq(userTitles.userId, users.id))
    .leftJoin(titles, eq(titles.id, userTitles.titleId))
    .where(eq(users.id, userId))
    .limit(1)

  const row = rows[0]
  const role = row?.role || 'viewer'
  const titleKey = row?.titleKey || null
  const titleName = row?.titleName || null
  const inferred = inferPersona(role, titleKey, titleName)

  return {
    persona: inferred.persona,
    source: inferred.source,
    titleKey,
    titleName,
    defaults: buildPersonaDefaults(inferred.persona),
  }
}

function normalizeChanges(changes: ActivityChange[] | null | undefined): ActivityChange[] {
  if (!Array.isArray(changes)) return []
  const normalized: ActivityChange[] = []
  for (const item of changes) {
    if (!item || typeof item.field !== 'string') continue
    normalized.push({
      field: item.field,
      from: item.from == null ? null : String(item.from),
      to: item.to == null ? null : String(item.to),
    })
  }
  return normalized
}

function parseUuidCandidates(value: string | null): string[] {
  if (!value) return []
  const trimmed = value.trim()
  if (!trimmed) return []

  const candidates = new Set<string>()
  if (/^[0-9a-fA-F-]{32,36}$/.test(trimmed)) {
    candidates.add(trimmed)
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (inner) {
      for (const token of inner.split(',')) {
        const next = token.replace(/["']/g, '').trim()
        if (/^[0-9a-fA-F-]{32,36}$/.test(next)) {
          candidates.add(next)
        }
      }
    }
  }

  return Array.from(candidates)
}

function extractSubjectUserIdsFromChanges(changes: ActivityChange[]): Set<string> {
  const subjectUserIds = new Set<string>()

  for (const change of changes) {
    if (!ASSIGNMENT_CHANGE_FIELDS.has(change.field)) continue

    for (const candidate of parseUuidCandidates(change.to)) {
      subjectUserIds.add(candidate)
    }
    for (const candidate of parseUuidCandidates(change.from)) {
      subjectUserIds.add(candidate)
    }
  }

  return subjectUserIds
}

function extractSubjectTeamIdsFromChanges(changes: ActivityChange[]): Set<string> {
  const subjectTeamIds = new Set<string>()

  for (const change of changes) {
    if (!ASSIGNMENT_TEAM_CHANGE_FIELDS.has(change.field)) continue

    for (const candidate of parseUuidCandidates(change.to)) {
      subjectTeamIds.add(candidate)
    }
    for (const candidate of parseUuidCandidates(change.from)) {
      subjectTeamIds.add(candidate)
    }
  }

  return subjectTeamIds
}

function extractMentionedUserIdsFromChanges(changes: ActivityChange[]): Set<string> {
  const mentionedUserIds = new Set<string>()

  for (const change of changes) {
    if (!MENTION_CHANGE_FIELDS.has(change.field)) continue
    for (const candidate of parseUuidCandidates(change.to)) {
      mentionedUserIds.add(candidate)
    }
  }

  return mentionedUserIds
}

function hashInput(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function buildDedupeKey(params: {
  action: string
  entityType?: string | null
  entityId?: string | null
  category: NotificationCategory
  severity: NotificationSeverity
  changes: ActivityChange[]
  occurredAt: Date
}): string {
  const windowBucket = Math.floor(params.occurredAt.getTime() / DEDUPE_WINDOW_MS)
  const fingerprint = hashInput(JSON.stringify({
    action: params.action,
    entityType: params.entityType || null,
    entityId: params.entityId || null,
    category: params.category,
    severity: params.severity,
    changes: params.changes,
    windowBucket,
  }))
  return `${params.entityType || 'entity'}:${params.action}:${windowBucket}:${fingerprint}`
}

function severityAtLeast(eventSeverity: NotificationSeverity, minimumSeverity: NotificationSeverity): boolean {
  return SEVERITY_RANK[eventSeverity] >= SEVERITY_RANK[minimumSeverity]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string') return false
  return RETRYABLE_PG_CODES.has(code)
}

function parseCursor(rawCursor: string | undefined): NotificationCursor | null {
  if (!rawCursor) return null
  const [createdAtRaw, id] = rawCursor.split('|')
  if (!createdAtRaw || !id) return null
  const createdAt = new Date(createdAtRaw)
  if (Number.isNaN(createdAt.getTime())) return null
  return { createdAt, id }
}

function buildCursorFromRecord(record: NotificationRecord): string {
  return `${record.createdAt.toISOString()}|${record.id}`
}

function validateQuietHours(value: string | null | undefined): string | null {
  if (value == null) return null
  const normalized = value.trim()
  if (!normalized) return null
  if (!QUIET_HOURS_REGEX.test(normalized)) {
    throw new Error(`Invalid quiet hours value "${value}". Expected HH:MM (24h).`)
  }
  return normalized
}

function parseClockMinutes(value: string | null | undefined): number | null {
  const normalized = validateQuietHours(value)
  if (!normalized) return null
  const [hour, minute] = normalized.split(':').map((part) => Number(part))
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  return hour * 60 + minute
}

function isWithinQuietHours(start: string | null, end: string | null, now = new Date()): boolean {
  const startMinutes = parseClockMinutes(start)
  const endMinutes = parseClockMinutes(end)
  if (startMinutes == null || endMinutes == null) return false
  if (startMinutes === endMinutes) return false

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  }
  // Overnight quiet hours window.
  return currentMinutes >= startMinutes || currentMinutes < endMinutes
}

async function dispatchWebhookWithRetry(
  kind: 'email' | 'slack',
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const config = getNotificationsConfig()
  let attempt = 0

  while (true) {
    if (kind === 'email') {
      runtimeStats.emailDispatchAttempts += 1
    } else {
      runtimeStats.slackDispatchAttempts += 1
    }

    try {
      const controller = new AbortController()
      const timeoutHandle = setTimeout(() => controller.abort(), config.channelTimeoutMs)
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Webhook response ${response.status}`)
        }
      } finally {
        clearTimeout(timeoutHandle)
      }

      if (kind === 'email') {
        runtimeStats.emailDispatchSuccess += 1
      } else {
        runtimeStats.slackDispatchSuccess += 1
      }
      return
    } catch (error) {
      if (attempt >= config.publishRetries) {
        if (kind === 'email') {
          runtimeStats.emailDispatchFailures += 1
        } else {
          runtimeStats.slackDispatchFailures += 1
        }
        console.error('Failed to dispatch notification channel payload', {
          kind,
          webhookUrl,
          error,
        })
        return
      }
      attempt += 1
      await sleep(100 * attempt)
    }
  }
}

async function dispatchNotificationChannels(input: {
  recipient: UserRecord
  preference: ResolvedRecipientPreference
  productId: string | null
  category: NotificationCategory
  severity: NotificationSeverity
  urgency: string
  type: string
  message: string
  routePath: string | null
  entityType: string | null | undefined
  entityId: string | null | undefined
  entityTitle: string | null | undefined
}): Promise<void> {
  const config = getNotificationsConfig()
  if (isWithinQuietHours(input.preference.quietHoursStart, input.preference.quietHoursEnd)) {
    runtimeStats.channelQuietHoursSuppressed += 1
    return
  }

  const commonPayload = {
    recipientUserId: input.recipient.id,
    recipientEmail: input.recipient.email,
    recipientName: input.recipient.name,
    productId: input.productId,
    category: input.category,
    severity: input.severity,
    urgency: input.urgency,
    type: input.type,
    message: input.message,
    routePath: input.routePath,
    entityType: input.entityType || null,
    entityId: input.entityId || null,
    entityTitle: input.entityTitle || null,
    occurredAt: new Date().toISOString(),
  }

  const channelDispatches: Promise<void>[] = []
  if (config.emailChannelEnabled && config.emailWebhookUrl && input.preference.emailEnabled) {
    channelDispatches.push(dispatchWebhookWithRetry('email', config.emailWebhookUrl, {
      channel: 'email',
      subject: `[${String(input.severity).toUpperCase()}] Productier notification`,
      ...commonPayload,
    }))
  }
  if (config.slackChannelEnabled && config.slackWebhookUrl && input.preference.slackEnabled) {
    channelDispatches.push(dispatchWebhookWithRetry('slack', config.slackWebhookUrl, {
      channel: 'slack',
      text: `${input.message} (${input.category}/${input.severity})`,
      ...commonPayload,
    }))
  }
  if (channelDispatches.length === 0) return

  await Promise.all(channelDispatches)
}

async function insertNotificationWithRetry(values: typeof notifications.$inferInsert): Promise<'inserted' | 'deduped'> {
  const config = getNotificationsConfig()
  let attempt = 0

  while (true) {
    try {
      const inserted = await db
        .insert(notifications)
        .values(values)
        .onConflictDoNothing({
          target: [notifications.recipientUserId, notifications.dedupeKey],
        })
        .returning({ id: notifications.id })

      if (inserted.length === 0) return 'deduped'
      return 'inserted'
    } catch (error) {
      if (attempt >= config.publishRetries || !isRetryableError(error)) {
        throw error
      }
      attempt += 1
      await sleep(50 * attempt)
    }
  }
}

async function resolveTeamMemberUserIds(teamIds: Iterable<string>): Promise<Set<string>> {
  const uniqueTeamIds = Array.from(new Set(Array.from(teamIds).filter(Boolean)))
  if (uniqueTeamIds.length === 0) return new Set<string>()

  const memberships = await db.query.organizationTeamMembers.findMany({
    where: inArray(organizationTeamMembers.organizationTeamId, uniqueTeamIds),
    columns: { userId: true },
  })

  return new Set(memberships.map((membership) => membership.userId).filter(Boolean))
}

async function resolveEntityStakeholderUserIds(
  entityType: string | null | undefined,
  entityId: string | null | undefined
): Promise<Set<string>> {
  const result = new Set<string>()
  if (!entityType || !entityId) return result

  if (entityType === 'task') {
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, entityId),
      columns: {
        ownerUserId: true,
        ownerTeamId: true,
        createdByUserId: true,
        assigneeUserIds: true,
        assigneeTeamIds: true,
        reviewerUserIds: true,
        reviewerTeamIds: true,
      },
    })
    if (!task) return result
    if (task.ownerUserId) result.add(task.ownerUserId)
    if (task.createdByUserId) result.add(task.createdByUserId)
    for (const id of task.assigneeUserIds || []) if (id) result.add(id)
    for (const id of task.reviewerUserIds || []) if (id) result.add(id)
    const taskTeamIds = [
      task.ownerTeamId,
      ...(task.assigneeTeamIds || []),
      ...(task.reviewerTeamIds || []),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)
    const teamMemberUserIds = await resolveTeamMemberUserIds(taskTeamIds)
    for (const userId of teamMemberUserIds) result.add(userId)
    return result
  }

  if (entityType === 'story') {
    const story = await db.query.stories.findFirst({
      where: eq(stories.id, entityId),
      columns: { ownerUserId: true },
    })
    if (story?.ownerUserId) result.add(story.ownerUserId)

    const comments = await db.query.storyComments.findMany({
      where: eq(storyComments.storyId, entityId),
      columns: { userId: true },
    })
    for (const comment of comments) {
      if (comment.userId) result.add(comment.userId)
    }

    return result
  }

  if (entityType === 'initiative') {
    const initiative = await db.query.initiatives.findFirst({
      where: eq(initiatives.id, entityId),
      columns: { leaderUserId: true },
    })
    if (initiative?.leaderUserId) result.add(initiative.leaderUserId)
    return result
  }

  if (entityType === 'delivery') {
    const delivery = await db.query.deliveries.findFirst({
      where: eq(deliveries.id, entityId),
      columns: { createdByUserId: true },
    })
    if (delivery?.createdByUserId) result.add(delivery.createdByUserId)
    return result
  }

  if (entityType === 'release') {
    const release = await db.query.releases.findFirst({
      where: eq(releases.id, entityId),
      columns: { createdByUserId: true, releaseManagerId: true },
    })
    if (release?.createdByUserId) result.add(release.createdByUserId)
    if (release?.releaseManagerId) result.add(release.releaseManagerId)

    const deployments = await db.query.releaseDeployments.findMany({
      where: eq(releaseDeployments.releaseId, entityId),
      columns: { deployedByUserId: true },
    })
    for (const deployment of deployments) {
      if (deployment.deployedByUserId) result.add(deployment.deployedByUserId)
    }

    return result
  }

  if (entityType === 'issue') {
    const issue = await db.query.issues.findFirst({
      where: eq(issues.id, entityId),
      columns: { reportedByUserId: true, assignedToUserId: true, assignedToTeamId: true },
    })
    if (issue?.reportedByUserId) result.add(issue.reportedByUserId)
    if (issue?.assignedToUserId) result.add(issue.assignedToUserId)
    if (issue?.assignedToTeamId) {
      const teamMemberUserIds = await resolveTeamMemberUserIds([issue.assignedToTeamId])
      for (const userId of teamMemberUserIds) result.add(userId)
    }
    return result
  }

  if (entityType === 'test_cycle') {
    const cycle = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, entityId),
      columns: { createdByUserId: true },
    })
    if (cycle?.createdByUserId) result.add(cycle.createdByUserId)
    return result
  }

  if (entityType === 'test_cycle_issue') {
    const issue = await db.query.testCycleIssues.findFirst({
      where: eq(testCycleIssues.id, entityId),
      columns: { reportedByUserId: true, assignedToUserId: true, assignedToTeamId: true },
    })
    if (issue?.reportedByUserId) result.add(issue.reportedByUserId)
    if (issue?.assignedToUserId) result.add(issue.assignedToUserId)
    if (issue?.assignedToTeamId) {
      const teamMemberUserIds = await resolveTeamMemberUserIds([issue.assignedToTeamId])
      for (const userId of teamMemberUserIds) result.add(userId)
    }
    return result
  }

  if (entityType === 'feature_request') {
    const request = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, entityId),
      columns: { createdByUserId: true },
    })
    if (request?.createdByUserId) result.add(request.createdByUserId)
    return result
  }

  if (entityType === 'consumer_feedback') {
    const feedback = await db.query.consumerFeedbacks.findFirst({
      where: eq(consumerFeedbacks.id, entityId),
      columns: { assignedToUserId: true },
    })
    if (feedback?.assignedToUserId) result.add(feedback.assignedToUserId)
    return result
  }

  if (entityType === 'integration_connection') {
    const connection = await db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, entityId),
      columns: { connectedByUserId: true },
    })
    if (connection?.connectedByUserId) result.add(connection.connectedByUserId)
    return result
  }

  if (entityType === 'integration_sync') {
    const run = await db.query.integrationSyncRuns.findFirst({
      where: eq(integrationSyncRuns.id, entityId),
      columns: { requestedByUserId: true },
    })
    if (run?.requestedByUserId) result.add(run.requestedByUserId)
    return result
  }

  if (entityType === 'user') {
    result.add(entityId)
    return result
  }

  if (entityType === 'product') {
    const product = await db.query.products.findFirst({
      where: eq(products.id, entityId),
      columns: { createdByUserId: true },
    })
    if (product?.createdByUserId) result.add(product.createdByUserId)
    return result
  }

  if (entityType === 'server') {
    const server = await db.query.servers.findFirst({
      where: eq(servers.id, entityId),
      columns: { productId: true },
    })
    if (!server?.productId) return result
    const admins = await resolveProductAdminUserIds(server.productId)
    for (const adminId of admins) {
      result.add(adminId)
    }
    return result
  }

  return result
}

async function resolveReviewerUserIds(
  entityType: string | null | undefined,
  entityId: string | null | undefined
): Promise<Set<string>> {
  const result = new Set<string>()
  if (!entityType || !entityId) return result

  if (entityType === 'task') {
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, entityId),
      columns: { reviewerUserIds: true, reviewerTeamIds: true },
    })
    for (const reviewerId of task?.reviewerUserIds || []) {
      if (reviewerId) result.add(reviewerId)
    }
    const teamReviewers = await resolveTeamMemberUserIds(task?.reviewerTeamIds || [])
    for (const reviewerId of teamReviewers) {
      if (reviewerId) result.add(reviewerId)
    }
    return result
  }

  if (entityType === 'test_cycle_issue') {
    const issue = await db.query.testCycleIssues.findFirst({
      where: eq(testCycleIssues.id, entityId),
      columns: { assignedToUserId: true, assignedToTeamId: true },
    })
    if (issue?.assignedToUserId) result.add(issue.assignedToUserId)
    const teamReviewers = await resolveTeamMemberUserIds(issue?.assignedToTeamId ? [issue.assignedToTeamId] : [])
    for (const reviewerId of teamReviewers) {
      if (reviewerId) result.add(reviewerId)
    }
    return result
  }

  if (entityType === 'issue') {
    const issue = await db.query.issues.findFirst({
      where: eq(issues.id, entityId),
      columns: { assignedToUserId: true, assignedToTeamId: true },
    })
    if (issue?.assignedToUserId) result.add(issue.assignedToUserId)
    const teamReviewers = await resolveTeamMemberUserIds(issue?.assignedToTeamId ? [issue.assignedToTeamId] : [])
    for (const reviewerId of teamReviewers) {
      if (reviewerId) result.add(reviewerId)
    }
    return result
  }

  return result
}

async function resolvePlatformAdminUserIds(): Promise<Set<string>> {
  const result = new Set<string>()
  const platformAdmins = await db.query.users.findMany({
    where: inArray(users.role, ['admin', 'super_admin']),
    columns: { id: true, isActive: true },
  })
  for (const admin of platformAdmins) {
    if (admin.isActive) result.add(admin.id)
  }
  return result
}

async function resolveProductAdminUserIds(productId: string): Promise<Set<string>> {
  const result = new Set<string>()

  const memberships = await db.query.productMembers.findMany({
    where: eq(productMembers.productId, productId),
    columns: { userId: true, role: true },
  })
  for (const membership of memberships) {
    const normalizedRole = (membership.role || '').trim().toLowerCase()
    if (normalizedRole === 'admin' || normalizedRole === 'owner' || normalizedRole === 'lead') {
      result.add(membership.userId)
    }
  }

  const platformAdmins = await resolvePlatformAdminUserIds()
  for (const adminId of platformAdmins) {
    result.add(adminId)
  }

  return result
}

async function resolvePolicyDrivenRecipientIds(input: {
  productId?: string | null
  entityType?: string | null
  entityId?: string | null
  actorUserId?: string | null
  contract: NotificationContract
  changes: ActivityChange[]
  subjectUserIds: Set<string>
}): Promise<Set<string>> {
  const result = new Set<string>()
  const contractType = input.contract.type.toLowerCase()
  const isAssignmentEvent = input.contract.category === 'assignment' || contractType.includes('assignment')
  const isReviewEvent = contractType.includes('handoff') || contractType.includes('review')
  const isGovernanceEvent = input.contract.category === 'admin'
  const isHighSeverityRiskOrRelease = (
    (input.contract.category === 'risk' || input.contract.category === 'release')
    && severityAtLeast(input.contract.severity, 'high')
  )
  const mentionedUserIds = extractMentionedUserIdsFromChanges(input.changes)

  let stakeholdersCache: Set<string> | null = null
  let adminsCache: Set<string> | null = null
  let reviewersCache: Set<string> | null = null

  const addMany = (values: Iterable<string>) => {
    for (const value of values) {
      if (value) result.add(value)
    }
  }
  const getStakeholders = async () => {
    if (!stakeholdersCache) {
      stakeholdersCache = await resolveEntityStakeholderUserIds(input.entityType, input.entityId)
    }
    return stakeholdersCache
  }
  const getProductAdmins = async () => {
    if (!adminsCache) {
      adminsCache = input.productId
        ? await resolveProductAdminUserIds(input.productId)
        : await resolvePlatformAdminUserIds()
    }
    return adminsCache
  }
  const getReviewers = async () => {
    if (!reviewersCache) {
      reviewersCache = await resolveReviewerUserIds(input.entityType, input.entityId)
    }
    return reviewersCache
  }

  if (mentionedUserIds.size > 0) {
    addMany(mentionedUserIds)
  }

  if (isAssignmentEvent) {
    addMany(input.subjectUserIds)
    if (result.size === 0) {
      addMany(await getStakeholders())
    }
  }

  if (isReviewEvent) {
    addMany(await getReviewers())
    if (result.size === 0) {
      addMany(input.subjectUserIds)
    }
  }

  if (isGovernanceEvent) {
    addMany(input.subjectUserIds)
    addMany(await getProductAdmins())
  }

  if (isHighSeverityRiskOrRelease) {
    addMany(input.subjectUserIds)
    addMany(await getStakeholders())
    addMany(await getProductAdmins())
  }

  if (result.size === 0) {
    addMany(input.subjectUserIds)
  }
  if (result.size === 0 && (
    input.contract.category === 'workflow'
    || input.contract.category === 'quality'
    || input.contract.category === 'assignment'
  )) {
    addMany(await getStakeholders())
  }
  if (result.size === 0 && input.contract.category === 'integration') {
    addMany(await getProductAdmins())
  }

  if (input.actorUserId) {
    result.delete(input.actorUserId)
  }

  return result
}

function shouldEscalateToExecutiveDigest(contract: NotificationContract): boolean {
  if (!['risk', 'release', 'admin'].includes(contract.category)) return false
  return severityAtLeast(contract.severity, 'high')
}

async function resolveExecutiveDigestCandidateUserIds(productId: string): Promise<Set<string>> {
  const membershipRows = await db.query.productMembers.findMany({
    where: eq(productMembers.productId, productId),
    columns: { userId: true },
  })
  const memberIds = Array.from(new Set(membershipRows.map((row) => row.userId)))
  if (memberIds.length === 0) return new Set<string>()

  const userRows = await db.query.users.findMany({
    where: inArray(users.id, memberIds),
    columns: { id: true, role: true, isActive: true },
  })
  const titleRows = await db
    .select({
      userId: userTitles.userId,
      titleKey: titles.key,
      titleName: titles.name,
    })
    .from(userTitles)
    .innerJoin(titles, eq(titles.id, userTitles.titleId))
    .where(inArray(userTitles.userId, memberIds))

  const titleByUser = new Map<string, { titleKey: string | null; titleName: string | null }>()
  for (const row of titleRows) {
    if (!titleByUser.has(row.userId)) {
      titleByUser.set(row.userId, {
        titleKey: row.titleKey || null,
        titleName: row.titleName || null,
      })
    }
  }

  const candidates = new Set<string>()
  for (const user of userRows) {
    if (!user.isActive) continue
    const title = titleByUser.get(user.id)
    const persona = inferPersona(user.role, title?.titleKey || null, title?.titleName || null)
    if (persona.persona === 'executive') {
      candidates.add(user.id)
    }
  }
  return candidates
}

async function publishExecutivePortfolioDigestSnapshot(input: {
  productId: string
  actorUserId?: string | null
  actorName?: string | null
  eligibleRecipients: ResolvedRecipient[]
  dayBucket: string
}): Promise<number> {
  if (input.eligibleRecipients.length === 0) return 0

  const dayStart = new Date(`${input.dayBucket}T00:00:00.000Z`)
  const daySignals = await db.query.notifications.findMany({
    where: and(
      eq(notifications.productId, input.productId),
      inArray(notifications.category, ['risk', 'release', 'admin']),
      inArray(notifications.severity, ['high', 'critical']),
      gte(notifications.createdAt, dayStart),
    ),
    columns: {
      category: true,
    },
  })

  const countByCategory = daySignals.reduce<Record<string, number>>((acc, row) => {
    const key = row.category || 'workflow'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const totalSignals = daySignals.length
  if (totalSignals <= 0) return 0

  const digestMessage = `Executive portfolio digest: ${totalSignals} high-severity risk/release/admin signals today.`
  let published = 0
  for (const recipient of input.eligibleRecipients) {
    try {
      const status = await insertNotificationWithRetry({
        recipientUserId: recipient.user.id,
        actorUserId: input.actorUserId || null,
        productId: input.productId,
        page: 'home',
        routePath: '/home',
        category: 'digest',
        type: 'digest.executive_portfolio_daily',
        severity: 'high',
        urgency: 'watch',
        entityType: null,
        entityId: null,
        entityTitle: null,
        message: digestMessage,
        payload: {
          digestBucket: input.dayBucket,
          source: 'portfolio_risk_summary',
          counts: countByCategory,
        },
        subjectUserIds: [],
        dedupeKey: `digest:portfolio:${input.dayBucket}:${input.productId}`,
        readAt: null,
        archivedAt: null,
        mutedAt: null,
        snoozedUntil: null,
      })
      if (status === 'inserted') {
        published += 1
        await dispatchNotificationChannels({
          recipient: recipient.user,
          preference: recipient.preference,
          productId: input.productId,
          category: 'digest',
          severity: 'high',
          urgency: 'watch',
          type: 'digest.executive_portfolio_daily',
          message: digestMessage,
          routePath: '/home',
          entityType: null,
          entityId: null,
          entityTitle: null,
        })
      }
    } catch (error) {
      runtimeStats.publishFailures += 1
      console.error('Failed to publish executive portfolio digest', {
        recipientUserId: recipient.user.id,
        productId: input.productId,
        error,
      })
    }
  }

  return published
}

async function publishExecutiveDigestEscalations(input: {
  productId: string
  actorUserId?: string | null
  actorName?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  entityTitle?: string | null
  contract: NotificationContract
  routePath: string | null
  subjectUserIds: Set<string>
  changes: ActivityChange[]
}): Promise<number> {
  if (!shouldEscalateToExecutiveDigest(input.contract)) return 0

  const candidateUserIds = await resolveExecutiveDigestCandidateUserIds(input.productId)
  if (input.actorUserId) {
    candidateUserIds.delete(input.actorUserId)
  }
  if (candidateUserIds.size === 0) return 0

  const eligibleRecipients = await resolveEligibleRecipients({
    candidateUserIds: Array.from(candidateUserIds),
    productId: input.productId,
    category: 'digest',
    severity: input.contract.severity,
    type: input.contract.type,
    page: 'home',
    subjectUserIds: input.subjectUserIds,
    entityType: input.entityType,
  })
  if (eligibleRecipients.length === 0) return 0

  const now = new Date()
  const dayBucket = now.toISOString().slice(0, 10)
  const digestMessage = `Executive digest: ${formatNotificationMessage({
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityTitle: input.entityTitle,
    type: input.contract.type,
    category: input.contract.category,
    changes: input.changes,
  })}`

  let published = 0
  for (const recipient of eligibleRecipients) {
    try {
      const status = await insertNotificationWithRetry({
        recipientUserId: recipient.user.id,
        actorUserId: input.actorUserId || null,
        productId: input.productId,
        page: 'home',
        routePath: input.routePath,
        category: 'digest',
        type: 'digest.executive_escalation',
        severity: input.contract.severity,
        urgency: input.contract.severity === 'critical' ? 'action_required' : 'watch',
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        entityTitle: input.entityTitle || null,
        message: digestMessage,
        payload: {
          sourceCategory: input.contract.category,
          digestBucket: dayBucket,
          changes: input.changes,
        },
        subjectUserIds: Array.from(input.subjectUserIds),
        dedupeKey: `digest:${dayBucket}:${input.contract.category}:${input.entityType || 'entity'}:${input.entityId || 'aggregate'}`,
        readAt: null,
        archivedAt: null,
        mutedAt: null,
        snoozedUntil: null,
      })
      if (status === 'inserted') {
        published += 1
        await dispatchNotificationChannels({
          recipient: recipient.user,
          preference: recipient.preference,
          productId: input.productId,
          category: 'digest',
          severity: input.contract.severity,
          urgency: input.contract.severity === 'critical' ? 'action_required' : 'watch',
          type: 'digest.executive_escalation',
          message: digestMessage,
          routePath: input.routePath,
          entityType: input.entityType,
          entityId: input.entityId,
          entityTitle: input.entityTitle,
        })
      }
    } catch (error) {
      runtimeStats.publishFailures += 1
      console.error('Failed to publish executive digest escalation', {
        recipientUserId: recipient.user.id,
        productId: input.productId,
        error,
      })
    }
  }

  const portfolioPublished = await publishExecutivePortfolioDigestSnapshot({
    productId: input.productId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    eligibleRecipients,
    dayBucket,
  })

  runtimeStats.digestEscalationsPublished += published + portfolioPublished
  return published + portfolioPublished
}

function isSelfViewOnlyAllowed(userId: string, subjectUserIds: Set<string>, entityType: string | null | undefined): boolean {
  if (subjectUserIds.has(userId)) return true
  if (entityType === 'user') return true
  return false
}

function toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
  return user as AuthenticatedUser
}

async function userHasProductMembership(
  user: AuthenticatedUser,
  productId: string,
  cache: Map<string, boolean>
): Promise<boolean> {
  if (isGlobalAdminRole(user.role)) return true

  const cached = cache.get(productId)
  if (cached !== undefined) return cached

  const membership = await db.query.productMembers.findFirst({
    where: and(
      eq(productMembers.productId, productId),
      eq(productMembers.userId, user.id),
    ),
    columns: { id: true },
  })
  const hasMembership = !!membership
  cache.set(productId, hasMembership)
  return hasMembership
}

async function getPagePermission(
  user: AuthenticatedUser,
  page: string,
  cache: Map<string, EffectivePagePermission>
): Promise<EffectivePagePermission> {
  const cached = cache.get(page)
  if (cached) return cached

  const { permission } = await getEffectivePagePermissionForUser(user, page)
  cache.set(page, permission)
  return permission
}

function redactNotification(record: NotificationRecord): NotificationRecord {
  return {
    ...record,
    actorUserId: null,
    routePath: null,
    entityType: null,
    entityId: null,
    entityTitle: null,
    message: 'You no longer have access to view full notification details.',
    payload: null,
    subjectUserIds: null,
  }
}

async function canActorPublishInProductScope(
  actorUserId: string,
  productId: string
): Promise<boolean> {
  const actor = await db.query.users.findFirst({
    where: eq(users.id, actorUserId),
    columns: { id: true, role: true },
  })
  if (!actor) return false
  if (isGlobalAdminRole(actor.role)) return true

  const membership = await db.query.productMembers.findFirst({
    where: and(
      eq(productMembers.productId, productId),
      eq(productMembers.userId, actor.id),
    ),
    columns: { id: true },
  })
  return !!membership
}

async function evaluateReadScopeForNotification(
  user: AuthenticatedUser,
  record: NotificationRecord,
  caches: NotificationReadScopeCaches
): Promise<{ allowed: boolean; redacted: boolean }> {
  if (record.productId) {
    const hasMembership = await userHasProductMembership(user, record.productId, caches.membershipByProductId)
    if (!hasMembership) {
      runtimeStats.readVisibilityFiltered += 1
      return { allowed: false, redacted: false }
    }
  }

  const permission = await getPagePermission(user, record.page, caches.pagePermissionByPage)
  if (!permission.visible) {
    runtimeStats.readVisibilityRedacted += 1
    return { allowed: true, redacted: true }
  }

  if (
    permission.selfViewOnly
    && !isSelfViewOnlyAllowed(user.id, new Set(record.subjectUserIds || []), record.entityType)
  ) {
    runtimeStats.readVisibilityFiltered += 1
    return { allowed: false, redacted: false }
  }

  return { allowed: true, redacted: false }
}

async function filterNotificationsForReadScope(
  user: AuthenticatedUser,
  rows: NotificationRecord[],
  caches: NotificationReadScopeCaches
): Promise<NotificationRecord[]> {
  if (rows.length === 0) return rows

  const visibleRows: NotificationRecord[] = []
  for (const row of rows) {
    const decision = await evaluateReadScopeForNotification(user, row, caches)
    if (!decision.allowed) continue
    visibleRows.push(decision.redacted ? redactNotification(row) : row)
  }
  return visibleRows
}

async function resolveReadableNotificationIds(
  user: AuthenticatedUser,
  rows: NotificationRecord[],
  caches: NotificationReadScopeCaches
): Promise<string[]> {
  const readableIds: string[] = []
  for (const row of rows) {
    const decision = await evaluateReadScopeForNotification(user, row, caches)
    if (!decision.allowed) continue
    readableIds.push(row.id)
  }
  return readableIds
}

function isReminderTypeAllowed(type: string, preference: ResolvedRecipientPreference): boolean {
  const normalized = type.toLowerCase()
  if (normalized.includes('reminder_overdue')) return preference.reminderOverdueEnabled
  if (normalized.includes('reminder_due_soon')) return preference.reminderDueSoonEnabled
  if (normalized.includes('reminder_stale_in_progress')) return preference.reminderStaleEnabled
  if (normalized.includes('reminder_review_sla')) return preference.reminderReviewSlaEnabled
  return true
}

function isDailyRollupTypeAllowed(type: string, preference: ResolvedRecipientPreference): boolean {
  const normalized = type.toLowerCase()
  if (!normalized.includes('digest.daily_cross_view')) return true
  return preference.dailyRollupEnabled
}

async function resolveEligibleRecipients(input: {
  candidateUserIds: string[]
  productId?: string | null
  category: NotificationCategory
  severity: NotificationSeverity
  type: string
  page: string
  subjectUserIds: Set<string>
  entityType?: string | null
}): Promise<ResolvedRecipient[]> {
  if (input.candidateUserIds.length === 0) return []

  const uniqueUserIds = Array.from(new Set(input.candidateUserIds)).sort((left, right) =>
    left.localeCompare(right)
  )
  const usersInScope = await db.query.users.findMany({
    where: inArray(users.id, uniqueUserIds),
  })
  if (usersInScope.length === 0) return []

  const membershipByUserId = new Set<string>()
  if (input.productId) {
    const memberships = await db.query.productMembers.findMany({
      where: and(
        eq(productMembers.productId, input.productId),
        inArray(productMembers.userId, uniqueUserIds),
      ),
      columns: { userId: true },
    })
    for (const membership of memberships) {
      membershipByUserId.add(membership.userId)
    }
  }

  const preferenceRows = await db
    .select({
      userId: notificationPreferences.userId,
      productId: notificationPreferences.productId,
      inAppEnabled: notificationPreferences.inAppEnabled,
      emailEnabled: notificationPreferences.emailEnabled,
      slackEnabled: notificationPreferences.slackEnabled,
      quietHoursStart: notificationPreferences.quietHoursStart,
      quietHoursEnd: notificationPreferences.quietHoursEnd,
      minimumSeverity: notificationPreferences.minimumSeverity,
      reminderCadence: notificationPreferences.reminderCadence,
      reminderCooldownMinutes: notificationPreferences.reminderCooldownMinutes,
      reminderDueSoonHours: notificationPreferences.reminderDueSoonHours,
      reminderOverdueEnabled: notificationPreferences.reminderOverdueEnabled,
      reminderDueSoonEnabled: notificationPreferences.reminderDueSoonEnabled,
      reminderStaleEnabled: notificationPreferences.reminderStaleEnabled,
      reminderReviewSlaEnabled: notificationPreferences.reminderReviewSlaEnabled,
      dailyRollupEnabled: notificationPreferences.dailyRollupEnabled,
    })
    .from(notificationPreferences)
    .where(and(
      eq(notificationPreferences.category, input.category),
      inArray(notificationPreferences.userId, uniqueUserIds),
      input.productId
        ? or(
          eq(notificationPreferences.productId, input.productId),
          isNull(notificationPreferences.productId),
        )
        : isNull(notificationPreferences.productId),
    ))
  const titleRows = await db
    .select({
      userId: userTitles.userId,
      titleKey: titles.key,
      titleName: titles.name,
    })
    .from(userTitles)
    .innerJoin(titles, eq(titles.id, userTitles.titleId))
    .where(inArray(userTitles.userId, uniqueUserIds))

  const titleByUserId = new Map<string, { titleKey: string | null; titleName: string | null }>()
  for (const row of titleRows) {
    if (titleByUserId.has(row.userId)) continue
    titleByUserId.set(row.userId, {
      titleKey: row.titleKey || null,
      titleName: row.titleName || null,
    })
  }

  const preferenceScopeByUserId = new Map<
    string,
    {
      productScoped?: typeof preferenceRows[number]
      global?: typeof preferenceRows[number]
    }
  >()
  for (const row of preferenceRows) {
    const scope = preferenceScopeByUserId.get(row.userId) || {}
    if (input.productId && row.productId === input.productId) {
      scope.productScoped = row
    } else if (!row.productId) {
      scope.global = row
    }
    preferenceScopeByUserId.set(row.userId, scope)
  }

  const eligibleUsers: ResolvedRecipient[] = []
  const usersSorted = [...usersInScope].sort((left, right) => left.id.localeCompare(right.id))
  for (const user of usersSorted) {
    if (!user.isActive) continue

    if (input.productId && user.role !== 'super_admin' && !membershipByUserId.has(user.id)) {
      runtimeStats.skippedByMembership += 1
      continue
    }

    const titleInfo = titleByUserId.get(user.id)
    const fallbackPersona = inferPersona(
      user.role,
      titleInfo?.titleKey || null,
      titleInfo?.titleName || null,
    ).persona
    const defaultPreference = defaultPreferenceForPersona(input.category, fallbackPersona)
    const scopedPreference = preferenceScopeByUserId.get(user.id)
    const preferenceRow = scopedPreference?.productScoped || scopedPreference?.global
    const resolvedPreference: ResolvedRecipientPreference = {
      inAppEnabled: preferenceRow?.inAppEnabled ?? defaultPreference.inAppEnabled,
      emailEnabled: preferenceRow?.emailEnabled ?? defaultPreference.emailEnabled,
      slackEnabled: preferenceRow?.slackEnabled ?? defaultPreference.slackEnabled,
      quietHoursStart: preferenceRow?.quietHoursStart ?? defaultPreference.quietHoursStart,
      quietHoursEnd: preferenceRow?.quietHoursEnd ?? defaultPreference.quietHoursEnd,
      minimumSeverity: (preferenceRow?.minimumSeverity || defaultPreference.minimumSeverity) as NotificationSeverity,
      reminderCadence: isReminderCadence(preferenceRow?.reminderCadence || '')
        ? preferenceRow?.reminderCadence as ReminderCadence
        : defaultPreference.reminderCadence,
      reminderCooldownMinutes: Number.isFinite(preferenceRow?.reminderCooldownMinutes)
        ? Math.max(15, Number(preferenceRow?.reminderCooldownMinutes))
        : defaultPreference.reminderCooldownMinutes,
      reminderDueSoonHours: Number.isFinite(preferenceRow?.reminderDueSoonHours)
        ? Math.max(1, Number(preferenceRow?.reminderDueSoonHours))
        : defaultPreference.reminderDueSoonHours,
      reminderOverdueEnabled: preferenceRow?.reminderOverdueEnabled ?? defaultPreference.reminderOverdueEnabled,
      reminderDueSoonEnabled: preferenceRow?.reminderDueSoonEnabled ?? defaultPreference.reminderDueSoonEnabled,
      reminderStaleEnabled: preferenceRow?.reminderStaleEnabled ?? defaultPreference.reminderStaleEnabled,
      reminderReviewSlaEnabled: preferenceRow?.reminderReviewSlaEnabled ?? defaultPreference.reminderReviewSlaEnabled,
      dailyRollupEnabled: preferenceRow?.dailyRollupEnabled ?? defaultPreference.dailyRollupEnabled,
    }

    if (!resolvedPreference.inAppEnabled) {
      runtimeStats.skippedByPreference += 1
      continue
    }
    if (!severityAtLeast(input.severity, resolvedPreference.minimumSeverity)) {
      runtimeStats.skippedByPreference += 1
      continue
    }
    if (!isReminderTypeAllowed(input.type, resolvedPreference)) {
      runtimeStats.skippedByPreference += 1
      continue
    }
    if (!isDailyRollupTypeAllowed(input.type, resolvedPreference)) {
      runtimeStats.skippedByPreference += 1
      continue
    }

    const { permission } = await getEffectivePagePermissionForUser(toAuthenticatedUser(user), input.page)
    if (!permission.visible) {
      runtimeStats.skippedByPermission += 1
      continue
    }
    if (permission.selfViewOnly && !isSelfViewOnlyAllowed(user.id, input.subjectUserIds, input.entityType)) {
      runtimeStats.skippedBySelfViewOnly += 1
      continue
    }

    eligibleUsers.push({
      user,
      preference: resolvedPreference,
    })
  }

  return eligibleUsers
}

async function publishInternal(input: PublishNotificationInput & { activityId?: string | null }): Promise<{
  published: number
  deduped: number
  recipientsConsidered: number
}> {
  const config = getNotificationsConfig()
  if (!config.enabled || config.rolloutMode === 'off') {
    runtimeStats.skippedByDisabledFlag += 1
    return { published: 0, deduped: 0, recipientsConsidered: 0 }
  }

  if (input.productId && input.actorUserId) {
    const actorCanPublish = await canActorPublishInProductScope(input.actorUserId, input.productId)
    if (!actorCanPublish) {
      runtimeStats.actorScopeDenied += 1
      return { published: 0, deduped: 0, recipientsConsidered: 0 }
    }
  }

  const changes = normalizeChanges(input.changes)
  const contract = resolveContractForEvent({
    action: input.action,
    entityType: input.entityType || null,
    changes,
  })
  const page = resolvePageForEntity(input.entityType)
  const routePath = input.routePath || resolveRouteForEntity(input.entityType, input.entityId)

  const subjectUserIds = extractSubjectUserIdsFromChanges(changes)
  const subjectTeamIds = extractSubjectTeamIdsFromChanges(changes)
  for (const id of input.subjectUserIds || []) {
    if (id) subjectUserIds.add(id)
  }
  if (subjectTeamIds.size > 0) {
    const teamMemberUserIds = await resolveTeamMemberUserIds(subjectTeamIds)
    for (const userId of teamMemberUserIds) {
      subjectUserIds.add(userId)
    }
  }

  const explicitRecipientIds = new Set<string>((input.recipientUserIds || []).filter(Boolean) as string[])
  const candidateRecipients = explicitRecipientIds.size > 0
    ? explicitRecipientIds
    : await resolvePolicyDrivenRecipientIds({
      productId: input.productId,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.actorUserId,
      contract,
      changes,
      subjectUserIds,
    })

  if (candidateRecipients.size === 0) {
    return { published: 0, deduped: 0, recipientsConsidered: 0 }
  }

  const eligibleRecipients = await resolveEligibleRecipients({
    candidateUserIds: Array.from(candidateRecipients),
    productId: input.productId,
    category: contract.category,
    severity: contract.severity,
    type: contract.type,
    page,
    subjectUserIds,
    entityType: input.entityType,
  })
  if (eligibleRecipients.length === 0) {
    return { published: 0, deduped: 0, recipientsConsidered: candidateRecipients.size }
  }

  const message = (input.message || '').trim() || formatNotificationMessage({
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityTitle: input.entityTitle,
    type: contract.type,
    category: contract.category,
    changes,
  })
  const occurredAt = new Date()

  const dedupeKey = buildDedupeKey({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    category: contract.category,
    severity: contract.severity,
    changes,
    occurredAt,
  })

  let published = 0
  let deduped = 0
  for (const recipient of eligibleRecipients) {
    const values: typeof notifications.$inferInsert = {
      recipientUserId: recipient.user.id,
      actorUserId: input.actorUserId || null,
      productId: input.productId || null,
      page,
      routePath,
      category: contract.category,
      type: contract.type,
      severity: contract.severity,
      urgency: contract.urgency,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      entityTitle: input.entityTitle || null,
      message,
      payload: {
        source: input.activityId ? 'activity' : 'direct',
        changes,
      },
      subjectUserIds: Array.from(subjectUserIds),
      dedupeKey,
      readAt: null,
      archivedAt: null,
      mutedAt: null,
      snoozedUntil: null,
    }

    if (config.rolloutMode === 'shadow') {
      published += 1
      continue
    }

    try {
      const status = await insertNotificationWithRetry(values)
      if (status === 'inserted') {
        published += 1
        await dispatchNotificationChannels({
          recipient: recipient.user,
          preference: recipient.preference,
          productId: input.productId || null,
          category: contract.category,
          severity: contract.severity,
          urgency: contract.urgency,
          type: contract.type,
          message,
          routePath,
          entityType: input.entityType,
          entityId: input.entityId,
          entityTitle: input.entityTitle,
        })
      } else {
        deduped += 1
      }
    } catch (error) {
      runtimeStats.publishFailures += 1
      console.error('Failed to publish notification', {
        recipientUserId: recipient.user.id,
        entityType: input.entityType,
        entityId: input.entityId,
        error,
      })
    }
  }

  if (config.rolloutMode !== 'shadow' && input.productId) {
    await publishExecutiveDigestEscalations({
      productId: input.productId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityTitle: input.entityTitle,
      contract,
      routePath,
      subjectUserIds,
      changes,
    })
  }

  runtimeStats.published += published
  runtimeStats.deduped += deduped
  return { published, deduped, recipientsConsidered: candidateRecipients.size }
}

export async function publishNotificationsFromActivity(input: PublishFromActivityInput): Promise<{
  published: number
  deduped: number
  recipientsConsidered: number
}> {
  return publishInternal({
    activityId: input.id || null,
    productId: input.productId || null,
    actorUserId: input.userId || null,
    actorName: input.userName,
    action: input.action,
    entityType: input.entityType || null,
    entityId: input.entityId || null,
    entityTitle: input.entityTitle || null,
    routePath: input.routePathOverride || null,
    subjectUserIds: input.subjectUserIds || null,
    changes: input.changes || null,
  })
}

export async function publishNotification(input: PublishNotificationInput): Promise<{
  published: number
  deduped: number
  recipientsConsidered: number
}> {
  return publishInternal({
    ...input,
    activityId: null,
  })
}

export async function listNotificationsForUser(
  user: AuthenticatedUser,
  query: NotificationInboxQuery
): Promise<{ items: NotificationRecord[]; nextCursor: string | null }> {
  const config = getNotificationsConfig()
  const cappedLimit = Math.max(1, Math.min(query.limit || 25, config.maxInboxPageSize))
  const startedAt = Date.now()
  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }

  let cursor = parseCursor(query.cursor)
  const pageFetchLimit = Math.max(cappedLimit * 2, 50)
  const collected: NotificationRecord[] = []
  const seenIds = new Set<string>()
  let exhausted = false
  let loops = 0

  while (!exhausted && collected.length < cappedLimit + 1) {
    loops += 1
    if (loops > 20) break
    const now = new Date()

    const filters = [eq(notifications.recipientUserId, user.id)]
    if (!query.includeArchived) {
      filters.push(isNull(notifications.archivedAt))
    }
    if (!query.includeMuted) {
      filters.push(isNull(notifications.mutedAt))
    }
    if (!query.includeSnoozed) {
      filters.push(or(
        isNull(notifications.snoozedUntil),
        lt(notifications.snoozedUntil, now),
      )!)
    }
    if (query.unreadOnly) {
      filters.push(isNull(notifications.readAt))
    }
    if (query.productId) {
      filters.push(eq(notifications.productId, query.productId))
    }
    if (query.category && isNotificationCategory(query.category)) {
      filters.push(eq(notifications.category, query.category))
    }
    if (query.urgency) {
      filters.push(eq(notifications.urgency, query.urgency))
    }
    if (query.severity) {
      filters.push(eq(notifications.severity, query.severity))
    }
    if (query.entityType) {
      filters.push(eq(notifications.entityType, query.entityType))
    }
    if (query.type) {
      filters.push(eq(notifications.type, query.type))
    }
    if (cursor) {
      filters.push(or(
        lt(notifications.createdAt, cursor.createdAt),
        and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id)),
      )!)
    }

    const rows = await db.query.notifications.findMany({
      where: and(...filters),
      orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
      limit: pageFetchLimit,
    })
    if (rows.length === 0) break

    const filteredRows = await filterNotificationsForReadScope(user, rows, caches)
    for (const row of filteredRows) {
      if (seenIds.has(row.id)) continue
      seenIds.add(row.id)
      collected.push(row)
      if (collected.length >= cappedLimit + 1) break
    }

    const lastRow = rows[rows.length - 1]
    cursor = lastRow ? { createdAt: lastRow.createdAt, id: lastRow.id } : null
    exhausted = rows.length < pageFetchLimit
  }

  const hasMore = collected.length > cappedLimit
  const items = hasMore ? collected.slice(0, cappedLimit) : collected
  const nextCursor = hasMore ? buildCursorFromRecord(items[items.length - 1]!) : null

  const latencyMs = Date.now() - startedAt
  runtimeStats.inboxQueries += 1
  runtimeStats.inboxTotalLatencyMs += latencyMs
  runtimeStats.lastInboxLatencyMs = latencyMs
  if (latencyMs > 500) {
    runtimeStats.inboxSlowOver500ms += 1
  }

  return { items, nextCursor }
}

export interface NotificationTypeFacet {
  type: string
  label: string
  count: number
}

async function countVisibleNotificationsForQuery(
  user: AuthenticatedUser,
  query: NotificationInboxQuery
): Promise<number> {
  let cursor: string | undefined
  let total = 0
  let loops = 0
  do {
    loops += 1
    if (loops > 100) break
    const page = await listNotificationsForUser(user, {
      ...query,
      limit: 100,
      cursor,
    })
    total += page.items.length
    cursor = page.nextCursor || undefined
  } while (cursor)
  return total
}

async function collectTypeFacetCounts(
  user: AuthenticatedUser,
  query: NotificationInboxQuery
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  let cursor: string | undefined
  let loops = 0

  do {
    loops += 1
    if (loops > 100) break
    const page = await listNotificationsForUser(user, {
      ...query,
      limit: 100,
      cursor,
      type: undefined,
    })
    for (const item of page.items) {
      const type = String(item.type || '').trim()
      if (!type) continue
      counts.set(type, (counts.get(type) || 0) + 1)
    }
    cursor = page.nextCursor || undefined
  } while (cursor)

  return counts
}

export async function getNotificationFacetsForUser(
  user: AuthenticatedUser,
  query: NotificationInboxQuery
): Promise<{ filteredUnreadCount: number; typeFacets: NotificationTypeFacet[] }> {
  const filteredUnreadCount = await countVisibleNotificationsForQuery(user, {
    ...query,
    unreadOnly: true,
    cursor: undefined,
    limit: undefined,
  })

  const typeCounts = await collectTypeFacetCounts(user, {
    ...query,
    cursor: undefined,
    limit: undefined,
    type: undefined,
  })
  const typeFacets = Array.from(typeCounts.entries())
    .map(([type, count]) => ({
      type,
      label: humanizeNotificationType(type),
      count,
    }))
    .sort((left, right) => {
      if (left.count === right.count) return left.label.localeCompare(right.label)
      return right.count - left.count
    })

  return {
    filteredUnreadCount,
    typeFacets,
  }
}

export async function getUnreadNotificationCount(user: AuthenticatedUser, productId?: string): Promise<number> {
  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }

  let cursor: NotificationCursor | null = null
  const pageFetchLimit = 250
  let count = 0
  let loops = 0
  let exhausted = false

  while (!exhausted) {
    loops += 1
    if (loops > 50) break
    const now = new Date()

    const whereParts: any[] = [
      eq(notifications.recipientUserId, user.id),
      isNull(notifications.archivedAt),
      isNull(notifications.mutedAt),
      or(
        isNull(notifications.snoozedUntil),
        lt(notifications.snoozedUntil, now),
      ),
      isNull(notifications.readAt),
      productId ? eq(notifications.productId, productId) : undefined,
      cursor
        ? or(
          lt(notifications.createdAt, cursor.createdAt),
          and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id)),
        )
        : undefined,
    ]

    const rows: NotificationRecord[] = await db.query.notifications.findMany({
      where: and(...whereParts),
      orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
      limit: pageFetchLimit,
    })
    if (rows.length === 0) break

    const readableIds = await resolveReadableNotificationIds(user, rows, caches)
    count += readableIds.length

    const lastRow: NotificationRecord | undefined = rows[rows.length - 1]
    cursor = lastRow ? { createdAt: lastRow.createdAt, id: lastRow.id } : null
    exhausted = rows.length < pageFetchLimit
  }

  return count
}

function normalizeNotificationIds(ids: string[]): string[] {
  const cleaned = ids.map((id) => id.trim()).filter(Boolean)
  return Array.from(new Set(cleaned))
}

async function logUnreadDriftIfNeeded(params: {
  userId: string
  unreadBefore: number
  unreadAfter: number
  updatedCount: number
}) {
  const config = getNotificationsConfig()
  const expectedDelta = params.updatedCount
  const actualDelta = Math.max(0, params.unreadBefore - params.unreadAfter)
  const drift = Math.abs(expectedDelta - actualDelta)
  if (drift >= config.unreadDriftWarnThreshold) {
    runtimeStats.unreadDriftWarnings += 1
    console.warn('Notification unread count drift detected', {
      userId: params.userId,
      unreadBefore: params.unreadBefore,
      unreadAfter: params.unreadAfter,
      expectedDelta,
      actualDelta,
      drift,
    })
  }
}

export async function markNotificationsRead(user: AuthenticatedUser, notificationIds: string[]): Promise<{
  updated: number
  unreadCount: number
}> {
  const ids = normalizeNotificationIds(notificationIds)
  if (ids.length === 0) {
    return { updated: 0, unreadCount: await getUnreadNotificationCount(user) }
  }

  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }
  const unreadBefore = await getUnreadNotificationCount(user)
  const candidateRows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, ids),
      isNull(notifications.readAt),
    ),
  })
  const readableIds = await resolveReadableNotificationIds(user, candidateRows, caches)
  if (readableIds.length === 0) {
    return { updated: 0, unreadCount: await getUnreadNotificationCount(user) }
  }

  const now = new Date()
  const updatedRows = await db
    .update(notifications)
    .set({
      readAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, readableIds),
      isNull(notifications.readAt),
    ))
    .returning({ id: notifications.id })

  const unreadCount = await getUnreadNotificationCount(user)
  await logUnreadDriftIfNeeded({
    userId: user.id,
    unreadBefore,
    unreadAfter: unreadCount,
    updatedCount: updatedRows.length,
  })

  return { updated: updatedRows.length, unreadCount }
}

export async function markAllNotificationsRead(user: AuthenticatedUser, options?: {
  productId?: string
  category?: NotificationCategory
  urgency?: NotificationUrgency
  severity?: NotificationSeverity
  entityType?: string
  type?: string
}): Promise<{ updated: number; unreadCount: number }> {
  const unreadBefore = await getUnreadNotificationCount(user, options?.productId)
  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }
  const candidateRows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.recipientUserId, user.id),
      isNull(notifications.readAt),
      options?.productId ? eq(notifications.productId, options.productId) : undefined,
      options?.category ? eq(notifications.category, options.category) : undefined,
      options?.urgency ? eq(notifications.urgency, options.urgency) : undefined,
      options?.severity ? eq(notifications.severity, options.severity) : undefined,
      options?.entityType ? eq(notifications.entityType, options.entityType) : undefined,
      options?.type ? eq(notifications.type, options.type) : undefined,
    ),
  })
  const readableIds = await resolveReadableNotificationIds(user, candidateRows, caches)
  if (readableIds.length === 0) {
    return { updated: 0, unreadCount: await getUnreadNotificationCount(user, options?.productId) }
  }

  const now = new Date()

  const whereParts = [
    eq(notifications.recipientUserId, user.id),
    isNull(notifications.readAt),
    options?.productId ? eq(notifications.productId, options.productId) : undefined,
    options?.category ? eq(notifications.category, options.category) : undefined,
    options?.urgency ? eq(notifications.urgency, options.urgency) : undefined,
    options?.severity ? eq(notifications.severity, options.severity) : undefined,
    options?.entityType ? eq(notifications.entityType, options.entityType) : undefined,
    options?.type ? eq(notifications.type, options.type) : undefined,
    inArray(notifications.id, readableIds),
  ]

  const updatedRows = await db
    .update(notifications)
    .set({
      readAt: now,
      updatedAt: now,
    })
    .where(and(...whereParts))
    .returning({ id: notifications.id })

  const unreadCount = await getUnreadNotificationCount(user, options?.productId)
  await logUnreadDriftIfNeeded({
    userId: user.id,
    unreadBefore,
    unreadAfter: unreadCount,
    updatedCount: updatedRows.length,
  })

  return { updated: updatedRows.length, unreadCount }
}

export async function archiveNotifications(user: AuthenticatedUser, notificationIds: string[]): Promise<{ archived: number }> {
  const ids = normalizeNotificationIds(notificationIds)
  if (ids.length === 0) return { archived: 0 }

  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }
  const candidateRows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, ids),
      isNull(notifications.archivedAt),
    ),
  })
  const readableIds = await resolveReadableNotificationIds(user, candidateRows, caches)
  if (readableIds.length === 0) return { archived: 0 }

  const now = new Date()
  const updatedRows = await db
    .update(notifications)
    .set({
      archivedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, readableIds),
      isNull(notifications.archivedAt),
    ))
    .returning({ id: notifications.id })

  return { archived: updatedRows.length }
}

export async function archiveAllNotifications(user: AuthenticatedUser, options?: {
  productId?: string
  category?: NotificationCategory
  urgency?: NotificationUrgency
  severity?: NotificationSeverity
  entityType?: string
  type?: string
}): Promise<{ archived: number }> {
  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }
  const candidateRows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.recipientUserId, user.id),
      isNull(notifications.archivedAt),
      options?.productId ? eq(notifications.productId, options.productId) : undefined,
      options?.category ? eq(notifications.category, options.category) : undefined,
      options?.urgency ? eq(notifications.urgency, options.urgency) : undefined,
      options?.severity ? eq(notifications.severity, options.severity) : undefined,
      options?.entityType ? eq(notifications.entityType, options.entityType) : undefined,
      options?.type ? eq(notifications.type, options.type) : undefined,
    ),
  })
  const readableIds = await resolveReadableNotificationIds(user, candidateRows, caches)
  if (readableIds.length === 0) return { archived: 0 }

  const now = new Date()

  const whereParts = [
    eq(notifications.recipientUserId, user.id),
    isNull(notifications.archivedAt),
    options?.productId ? eq(notifications.productId, options.productId) : undefined,
    options?.category ? eq(notifications.category, options.category) : undefined,
    options?.urgency ? eq(notifications.urgency, options.urgency) : undefined,
    options?.entityType ? eq(notifications.entityType, options.entityType) : undefined,
    options?.type ? eq(notifications.type, options.type) : undefined,
    inArray(notifications.id, readableIds),
  ]

  const updatedRows = await db
    .update(notifications)
    .set({
      archivedAt: now,
      updatedAt: now,
    })
    .where(and(...whereParts))
    .returning({ id: notifications.id })

  return { archived: updatedRows.length }
}

export async function muteNotifications(user: AuthenticatedUser, notificationIds: string[]): Promise<{ updated: number }> {
  const ids = normalizeNotificationIds(notificationIds)
  if (ids.length === 0) return { updated: 0 }

  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }
  const candidateRows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, ids),
      isNull(notifications.archivedAt),
    ),
  })
  const readableIds = await resolveReadableNotificationIds(user, candidateRows, caches)
  if (readableIds.length === 0) return { updated: 0 }

  const now = new Date()
  const updatedRows = await db.update(notifications)
    .set({
      mutedAt: now,
      snoozedUntil: null,
      updatedAt: now,
    })
    .where(and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, readableIds),
      isNull(notifications.archivedAt),
    ))
    .returning({ id: notifications.id })

  return { updated: updatedRows.length }
}

export async function unmuteNotifications(user: AuthenticatedUser, notificationIds: string[]): Promise<{ updated: number }> {
  const ids = normalizeNotificationIds(notificationIds)
  if (ids.length === 0) return { updated: 0 }

  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }
  const candidateRows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, ids),
    ),
  })
  const readableIds = await resolveReadableNotificationIds(user, candidateRows, caches)
  if (readableIds.length === 0) return { updated: 0 }

  const updatedRows = await db.update(notifications)
    .set({
      mutedAt: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, readableIds),
    ))
    .returning({ id: notifications.id })

  return { updated: updatedRows.length }
}

export async function snoozeNotifications(
  user: AuthenticatedUser,
  notificationIds: string[],
  untilAt: Date
): Promise<{ updated: number }> {
  const ids = normalizeNotificationIds(notificationIds)
  if (ids.length === 0) return { updated: 0 }

  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }
  const candidateRows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, ids),
      isNull(notifications.archivedAt),
    ),
  })
  const readableIds = await resolveReadableNotificationIds(user, candidateRows, caches)
  if (readableIds.length === 0) return { updated: 0 }

  const updatedRows = await db.update(notifications)
    .set({
      snoozedUntil: untilAt,
      mutedAt: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, readableIds),
      isNull(notifications.archivedAt),
    ))
    .returning({ id: notifications.id })

  return { updated: updatedRows.length }
}

export async function unsnoozeNotifications(user: AuthenticatedUser, notificationIds: string[]): Promise<{ updated: number }> {
  const ids = normalizeNotificationIds(notificationIds)
  if (ids.length === 0) return { updated: 0 }

  const caches: NotificationReadScopeCaches = {
    membershipByProductId: new Map(),
    pagePermissionByPage: new Map(),
  }
  const candidateRows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, ids),
    ),
  })
  const readableIds = await resolveReadableNotificationIds(user, candidateRows, caches)
  if (readableIds.length === 0) return { updated: 0 }

  const updatedRows = await db.update(notifications)
    .set({
      snoozedUntil: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(notifications.recipientUserId, user.id),
      inArray(notifications.id, readableIds),
    ))
    .returning({ id: notifications.id })

  return { updated: updatedRows.length }
}

function normalizePreferenceProductId(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function getNotificationPreferencesForUser(
  userId: string,
  productId?: string | null,
): Promise<DefaultPreference[]> {
  const normalizedProductId = normalizePreferenceProductId(productId)
  const preset = await resolveNotificationPreferencePresetForUser(userId)
  const defaultsByCategory = new Map(preset.defaults.map((item) => [item.category, item]))
  const rows = await db.query.notificationPreferences.findMany({
    where: and(
      eq(notificationPreferences.userId, userId),
      normalizedProductId
        ? or(
          eq(notificationPreferences.productId, normalizedProductId),
          isNull(notificationPreferences.productId),
        )
        : isNull(notificationPreferences.productId),
    ),
  })

  const globalByCategory = new Map<string, typeof rows[number]>()
  const productByCategory = new Map<string, typeof rows[number]>()
  for (const row of rows) {
    if (normalizedProductId && row.productId === normalizedProductId) {
      productByCategory.set(row.category, row)
    } else if (!row.productId) {
      globalByCategory.set(row.category, row)
    }
  }

  return NOTIFICATION_CATEGORIES.map((category) => {
    const existing = productByCategory.get(category) || globalByCategory.get(category)
    if (!existing) {
      return {
        ...(defaultsByCategory.get(category) || baselineDefaultPreference(category)),
        productId: normalizedProductId ?? null,
      }
    }

    return {
      productId: existing.productId || null,
      category,
      inAppEnabled: existing.inAppEnabled,
      emailEnabled: existing.emailEnabled,
      slackEnabled: existing.slackEnabled,
      quietHoursStart: existing.quietHoursStart || null,
      quietHoursEnd: existing.quietHoursEnd || null,
      minimumSeverity: existing.minimumSeverity,
      reminderCadence: isReminderCadence(existing.reminderCadence || '')
        ? existing.reminderCadence as ReminderCadence
        : 'daily',
      reminderCooldownMinutes: Number.isFinite(existing.reminderCooldownMinutes)
        ? Math.max(15, Number(existing.reminderCooldownMinutes))
        : 720,
      reminderDueSoonHours: Number.isFinite(existing.reminderDueSoonHours)
        ? Math.max(1, Number(existing.reminderDueSoonHours))
        : 48,
      reminderOverdueEnabled: existing.reminderOverdueEnabled ?? true,
      reminderDueSoonEnabled: existing.reminderDueSoonEnabled ?? true,
      reminderStaleEnabled: existing.reminderStaleEnabled ?? true,
      reminderReviewSlaEnabled: existing.reminderReviewSlaEnabled ?? true,
      dailyRollupEnabled: existing.dailyRollupEnabled ?? true,
    }
  })
}

export async function getNotificationPreferencePresetForUser(userId: string): Promise<NotificationPreferencePreset> {
  return resolveNotificationPreferencePresetForUser(userId)
}

export async function upsertNotificationPreferencesForUser(
  userId: string,
  inputs: NotificationPreferenceInput[],
  productId?: string | null,
): Promise<DefaultPreference[]> {
  const normalizedProductId = normalizePreferenceProductId(productId)
  if (inputs.length === 0) {
    return getNotificationPreferencesForUser(userId, normalizedProductId)
  }

  const preset = await resolveNotificationPreferencePresetForUser(userId)
  const defaultsByCategory = new Map(preset.defaults.map((item) => [item.category, item]))

  for (const input of inputs) {
    if (!isNotificationCategory(input.category)) {
      throw new Error(`Invalid notification category "${input.category}"`)
    }
    if (input.minimumSeverity && !isNotificationSeverity(input.minimumSeverity)) {
      throw new Error(`Invalid notification severity "${input.minimumSeverity}"`)
    }
    if (input.reminderCadence && !isReminderCadence(input.reminderCadence)) {
      throw new Error(`Invalid reminder cadence "${input.reminderCadence}"`)
    }

    const quietHoursStart = validateQuietHours(input.quietHoursStart)
    const quietHoursEnd = validateQuietHours(input.quietHoursEnd)
    const defaults = defaultsByCategory.get(input.category) || baselineDefaultPreference(input.category)
    const reminderCooldownMinutes = Number.isFinite(input.reminderCooldownMinutes)
      ? Math.max(15, Math.floor(Number(input.reminderCooldownMinutes)))
      : defaults.reminderCooldownMinutes
    const reminderDueSoonHours = Number.isFinite(input.reminderDueSoonHours)
      ? Math.max(1, Math.floor(Number(input.reminderDueSoonHours)))
      : defaults.reminderDueSoonHours
    const now = new Date()
    const existing = await db.query.notificationPreferences.findFirst({
      where: and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.category, input.category),
        normalizedProductId
          ? eq(notificationPreferences.productId, normalizedProductId)
          : isNull(notificationPreferences.productId),
      ),
    })

    if (existing) {
      await db
        .update(notificationPreferences)
        .set({
          inAppEnabled: input.inAppEnabled ?? defaults.inAppEnabled,
          emailEnabled: input.emailEnabled ?? defaults.emailEnabled,
          slackEnabled: input.slackEnabled ?? defaults.slackEnabled,
          quietHoursStart,
          quietHoursEnd,
          minimumSeverity: input.minimumSeverity || defaults.minimumSeverity,
          reminderCadence: input.reminderCadence || defaults.reminderCadence,
          reminderCooldownMinutes,
          reminderDueSoonHours,
          reminderOverdueEnabled: input.reminderOverdueEnabled ?? defaults.reminderOverdueEnabled,
          reminderDueSoonEnabled: input.reminderDueSoonEnabled ?? defaults.reminderDueSoonEnabled,
          reminderStaleEnabled: input.reminderStaleEnabled ?? defaults.reminderStaleEnabled,
          reminderReviewSlaEnabled: input.reminderReviewSlaEnabled ?? defaults.reminderReviewSlaEnabled,
          dailyRollupEnabled: input.dailyRollupEnabled ?? defaults.dailyRollupEnabled,
          updatedAt: now,
        })
        .where(eq(notificationPreferences.id, existing.id))
    } else {
      await db.insert(notificationPreferences).values({
        userId,
        productId: normalizedProductId,
        category: input.category,
        inAppEnabled: input.inAppEnabled ?? defaults.inAppEnabled,
        emailEnabled: input.emailEnabled ?? defaults.emailEnabled,
        slackEnabled: input.slackEnabled ?? defaults.slackEnabled,
        quietHoursStart,
        quietHoursEnd,
        minimumSeverity: input.minimumSeverity || defaults.minimumSeverity,
        reminderCadence: input.reminderCadence || defaults.reminderCadence,
        reminderCooldownMinutes,
        reminderDueSoonHours,
        reminderOverdueEnabled: input.reminderOverdueEnabled ?? defaults.reminderOverdueEnabled,
        reminderDueSoonEnabled: input.reminderDueSoonEnabled ?? defaults.reminderDueSoonEnabled,
        reminderStaleEnabled: input.reminderStaleEnabled ?? defaults.reminderStaleEnabled,
        reminderReviewSlaEnabled: input.reminderReviewSlaEnabled ?? defaults.reminderReviewSlaEnabled,
        dailyRollupEnabled: input.dailyRollupEnabled ?? defaults.dailyRollupEnabled,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  return getNotificationPreferencesForUser(userId, normalizedProductId)
}

export async function seedDefaultNotificationPreferencesForUser(userId: string): Promise<void> {
  const preset = await resolveNotificationPreferencePresetForUser(userId)
  const defaultsByCategory = new Map(preset.defaults.map((item) => [item.category, item]))
  const now = new Date()
  for (const category of NOTIFICATION_CATEGORIES) {
    const defaults = defaultsByCategory.get(category) || baselineDefaultPreference(category)
    const existing = await db.query.notificationPreferences.findFirst({
      where: and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.category, category),
        isNull(notificationPreferences.productId),
      ),
      columns: { id: true },
    })
    if (existing) continue

    await db.insert(notificationPreferences).values({
        userId,
        productId: null,
        category,
        inAppEnabled: defaults.inAppEnabled,
        emailEnabled: defaults.emailEnabled,
        slackEnabled: defaults.slackEnabled,
        quietHoursStart: defaults.quietHoursStart,
        quietHoursEnd: defaults.quietHoursEnd,
        minimumSeverity: defaults.minimumSeverity,
        reminderCadence: defaults.reminderCadence,
        reminderCooldownMinutes: defaults.reminderCooldownMinutes,
        reminderDueSoonHours: defaults.reminderDueSoonHours,
        reminderOverdueEnabled: defaults.reminderOverdueEnabled,
        reminderDueSoonEnabled: defaults.reminderDueSoonEnabled,
        reminderStaleEnabled: defaults.reminderStaleEnabled,
        reminderReviewSlaEnabled: defaults.reminderReviewSlaEnabled,
        dailyRollupEnabled: defaults.dailyRollupEnabled,
        createdAt: now,
        updatedAt: now,
      })
  }
}

export function recordReminderSweepStats(input: {
  candidates: number
  published: number
  cooldownSkipped: number
}) {
  runtimeStats.reminderSweeps += 1
  runtimeStats.reminderCandidates += Math.max(0, Number(input.candidates || 0))
  runtimeStats.reminderPublished += Math.max(0, Number(input.published || 0))
  runtimeStats.reminderCooldownSkipped += Math.max(0, Number(input.cooldownSkipped || 0))
}

export function recordDailyRollupSweepStats(input: {
  candidates: number
  alreadySentToday: number
  published: number
  deduped: number
}) {
  runtimeStats.rollupSweeps += 1
  runtimeStats.rollupCandidates += Math.max(0, Number(input.candidates || 0))
  runtimeStats.rollupAlreadySentToday += Math.max(0, Number(input.alreadySentToday || 0))
  runtimeStats.rollupPublished += Math.max(0, Number(input.published || 0))
  runtimeStats.rollupDeduped += Math.max(0, Number(input.deduped || 0))
}

export function getNotificationRuntimeStats() {
  const inboxAvgLatencyMs = runtimeStats.inboxQueries > 0
    ? runtimeStats.inboxTotalLatencyMs / runtimeStats.inboxQueries
    : 0
  return {
    ...runtimeStats,
    inboxAvgLatencyMs,
  }
}
