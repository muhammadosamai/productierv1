import { and, eq, gte, inArray } from 'drizzle-orm'
import postgres from 'postgres'
import { getNotificationsConfig } from '../config/notifications'
import { getDatabaseConfig } from '../config/database'
import { db } from '../db'
import { issues, notifications, releases, stories, tasks } from '../db/schema'
import type { ActivityChange } from './notificationContracts'
import { publishNotification, recordDailyRollupSweepStats, recordReminderSweepStats } from './notifications'

const ACTIVE_TASK_STATUSES = [
  'created',
  'assigned',
  'in_progress',
  'in_review',
  'blocked',
  'overdue',
] as const
const ACTIVE_STORY_STATUSES = ['backlog', 'drafted', 'initialized', 'in_progress'] as const
const ACTIVE_RELEASE_STATUSES = ['planned', 'in_progress', 'failed'] as const
const ACTIVE_ISSUE_STATUSES = ['open', 'in_progress', 'deferred'] as const
const DAILY_ROLLUP_TYPE = 'digest.daily_cross_view'
const REMINDER_SCHEDULER_LOCK_NAMESPACE = 32941
const REMINDER_SCHEDULER_LOCK_RESOURCE = 1

type ReminderKind =
  | 'overdue'
  | 'due_soon'
  | 'stale_in_progress'
  | 'review_sla'
  | 'blocked_dependency'
  | 'unassigned_work'
  | 'release_risk'
  | 'release_failure'

const REMINDER_TYPE_BY_KIND: Record<ReminderKind, string> = {
  overdue: 'task.updated.reminder_overdue',
  due_soon: 'task.updated.reminder_due_soon',
  stale_in_progress: 'task.updated.reminder_stale_in_progress',
  review_sla: 'task.updated.reminder_review_sla',
  blocked_dependency: 'task.updated.reminder_blocked_dependency',
  unassigned_work: 'task.updated.reminder_unassigned_work',
  release_risk: 'release.updated.reminder_release_risk',
  release_failure: 'release.updated.reminder_release_failure',
}

type ReminderSignal = {
  kind: ReminderKind
  message: string
}

export interface ReminderSweepStats {
  scannedTasks: number
  scannedReleases: number
  candidates: number
  cooldownSkipped: number
  published: number
  deduped: number
}

export interface DailyRollupSweepStats {
  candidates: number
  alreadySentToday: number
  published: number
  deduped: number
}

function asTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function asIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function toRecipients(task: {
  ownerUserId: string | null
  assigneeUserIds: string[] | null
  reviewerUserIds: string[] | null
}): string[] {
  return Array.from(new Set([
    task.ownerUserId,
    ...(task.assigneeUserIds || []),
    ...(task.reviewerUserIds || []),
  ].filter((value): value is string => !!value)))
}

function buildTaskReminderSignals(
  task: {
    title: string
    dueAt: Date | null
    updatedAt: Date
    status: string
    ownerUserId: string | null
    assigneeUserIds: string[] | null
    blockedReason: string | null
  },
  nowMs: number,
  config: ReturnType<typeof getNotificationsConfig>
): ReminderSignal[] {
  const signals: ReminderSignal[] = []
  const title = task.title.trim() || 'Task'
  const dueAtMs = asTimestamp(task.dueAt)
  const updatedAtMs = asTimestamp(task.updatedAt) || nowMs

  if (dueAtMs != null && dueAtMs < nowMs) {
    const daysOverdue = Math.max(1, Math.floor((nowMs - dueAtMs) / 86400000))
    signals.push({
      kind: 'overdue',
      message: `${title} is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.`,
    })
  } else if (
    dueAtMs != null
    && dueAtMs >= nowMs
    && dueAtMs <= nowMs + config.reminderDueSoonHours * 3600000
    && (task.status === 'created' || task.status === 'assigned' || task.status === 'in_progress')
  ) {
    const hoursUntilDue = Math.max(1, Math.ceil((dueAtMs - nowMs) / 3600000))
    signals.push({
      kind: 'due_soon',
      message: `${title} is due in ${hoursUntilDue} hour${hoursUntilDue === 1 ? '' : 's'}.`,
    })
  }

  if (
    task.status === 'in_progress'
    && updatedAtMs <= nowMs - config.reminderStaleInProgressHours * 3600000
  ) {
    signals.push({
      kind: 'stale_in_progress',
      message: `${title} has not moved in progress recently and needs attention.`,
    })
  }

  if (
    task.status === 'in_review'
    && updatedAtMs <= nowMs - config.reminderReviewSlaHours * 3600000
  ) {
    signals.push({
      kind: 'review_sla',
      message: `${title} has been waiting in review beyond SLA.`,
    })
  }

  if (task.status === 'blocked' || (task.blockedReason || '').trim().length > 0) {
    signals.push({
      kind: 'blocked_dependency',
      message: `${title} is blocked and needs dependency follow-up.`,
    })
  }

  const assigneeCount = (task.assigneeUserIds || []).length
  if (!task.ownerUserId && assigneeCount === 0 && task.status !== 'archived' && task.status !== 'done') {
    signals.push({
      kind: 'unassigned_work',
      message: `${title} has no owner or assignee.`,
    })
  }

  return signals
}

function buildReleaseReminderSignals(
  release: {
    title: string
    status: string
    updatedAt: Date
    plannedAt: Date | null
    startedAt: Date | null
  },
  nowMs: number,
): ReminderSignal[] {
  const signals: ReminderSignal[] = []
  const title = release.title.trim() || 'Release'
  const updatedAtMs = asTimestamp(release.updatedAt) || nowMs
  const plannedAtMs = asTimestamp(release.plannedAt)
  const startedAtMs = asTimestamp(release.startedAt)
  const normalizedStatus = (release.status || '').toLowerCase()

  if (normalizedStatus === 'failed') {
    signals.push({
      kind: 'release_failure',
      message: `${title} has a failed release and requires immediate action.`,
    })
    return signals
  }

  if (normalizedStatus === 'planned' && plannedAtMs != null && plannedAtMs < nowMs) {
    signals.push({
      kind: 'release_risk',
      message: `${title} is still planned beyond its target date and may slip.`,
    })
  }

  if (normalizedStatus === 'in_progress') {
    const baseline = startedAtMs ?? updatedAtMs
    if (baseline <= nowMs - 72 * 3600000) {
      signals.push({
        kind: 'release_risk',
        message: `${title} has been in progress for an extended period and is at risk.`,
      })
    }
  }

  return signals
}

function toReleaseRecipients(release: {
  createdByUserId: string | null
  releaseManagerId: string | null
}): string[] {
  return Array.from(new Set([
    release.createdByUserId,
    release.releaseManagerId,
  ].filter((value): value is string => !!value)))
}

async function tryAcquireSchedulerLock(sqlClient: postgres.Sql): Promise<boolean> {
  try {
    const rows = await sqlClient<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${REMINDER_SCHEDULER_LOCK_NAMESPACE}, ${REMINDER_SCHEDULER_LOCK_RESOURCE}) AS acquired
    `
    return Boolean(rows[0]?.acquired)
  } catch (error) {
    console.warn('[notifications:reminders] distributed lock acquisition failed', error)
    return false
  }
}

async function releaseSchedulerLock(sqlClient: postgres.Sql): Promise<void> {
  try {
    const rows = await sqlClient<{ released: boolean }[]>`
      SELECT pg_advisory_unlock(${REMINDER_SCHEDULER_LOCK_NAMESPACE}, ${REMINDER_SCHEDULER_LOCK_RESOURCE}) AS released
    `
    if (!rows[0]?.released) {
      console.warn('[notifications:reminders] distributed lock release returned false')
    }
  } catch (error) {
    console.warn('[notifications:reminders] distributed lock release failed', error)
  }
}

async function hasRecentReminder(params: {
  recipientUserId: string
  entityType: string
  entityId: string
  type: string
  since: Date
}): Promise<boolean> {
  const existing = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.recipientUserId, params.recipientUserId),
      eq(notifications.entityType, params.entityType),
      eq(notifications.entityId, params.entityId),
      eq(notifications.type, params.type),
      gte(notifications.createdAt, params.since),
    ),
    columns: { id: true },
  })
  return !!existing
}

export async function runTaskReminderSweep(now = new Date()): Promise<ReminderSweepStats> {
  const config = getNotificationsConfig()
  if (!config.enabled || config.rolloutMode === 'off' || !config.reminderSchedulerEnabled) {
    return {
      scannedTasks: 0,
      scannedReleases: 0,
      candidates: 0,
      cooldownSkipped: 0,
      published: 0,
      deduped: 0,
    }
  }

  const nowMs = now.getTime()
  const cooldownSince = new Date(nowMs - config.reminderCooldownMinutes * 60000)
  const taskRows = await db.query.tasks.findMany({
    where: inArray(tasks.status, [...ACTIVE_TASK_STATUSES]),
    columns: {
      id: true,
      productId: true,
      title: true,
      status: true,
      dueAt: true,
      updatedAt: true,
      createdByUserId: true,
      ownerUserId: true,
      assigneeUserIds: true,
      reviewerUserIds: true,
      blockedReason: true,
    },
  })

  const releaseRows = await db.query.releases.findMany({
    columns: {
      id: true,
      productId: true,
      title: true,
      status: true,
      plannedAt: true,
      startedAt: true,
      updatedAt: true,
      createdByUserId: true,
      releaseManagerId: true,
    },
  })

  const stats: ReminderSweepStats = {
    scannedTasks: taskRows.length,
    scannedReleases: releaseRows.length,
    candidates: 0,
    cooldownSkipped: 0,
    published: 0,
    deduped: 0,
  }

  for (const task of taskRows) {
    const recipients = toRecipients(task)
    if (recipients.length === 0 && task.createdByUserId) {
      recipients.push(task.createdByUserId)
    }
    if (recipients.length === 0) continue

    const signals = buildTaskReminderSignals(task, nowMs, config)
    if (signals.length === 0) continue

    for (const signal of signals) {
      const expectedType = REMINDER_TYPE_BY_KIND[signal.kind]
      const recipientsToNotify: string[] = []
      for (const recipientUserId of recipients) {
        const recent = await hasRecentReminder({
          recipientUserId,
          entityType: 'task',
          entityId: task.id,
          type: expectedType,
          since: cooldownSince,
        })
        if (recent) {
          stats.cooldownSkipped += 1
          continue
        }
        recipientsToNotify.push(recipientUserId)
      }

      if (recipientsToNotify.length === 0) continue
      stats.candidates += recipientsToNotify.length

      const changes: ActivityChange[] = [
        { field: 'reminderKind', from: null, to: signal.kind },
      ]
      const dueAtIso = asIsoString(task.dueAt)
      if (dueAtIso) {
        changes.push({ field: 'dueAt', from: null, to: dueAtIso })
      }

      const result = await publishNotification({
        productId: task.productId,
        actorUserId: null,
        actorName: 'System',
        action: 'updated',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
        message: signal.message,
        routePath: `/tasks/${task.id}`,
        recipientUserIds: recipientsToNotify,
        subjectUserIds: recipients,
        changes,
      })

      stats.published += result.published
      stats.deduped += result.deduped
    }
  }

  for (const release of releaseRows) {
    const recipients = toReleaseRecipients(release)
    if (recipients.length === 0) continue
    const signals = buildReleaseReminderSignals(release, nowMs)
    if (signals.length === 0) continue

    for (const signal of signals) {
      const expectedType = REMINDER_TYPE_BY_KIND[signal.kind]
      const recipientsToNotify: string[] = []
      for (const recipientUserId of recipients) {
        const recent = await hasRecentReminder({
          recipientUserId,
          entityType: 'release',
          entityId: release.id,
          type: expectedType,
          since: cooldownSince,
        })
        if (recent) {
          stats.cooldownSkipped += 1
          continue
        }
        recipientsToNotify.push(recipientUserId)
      }
      if (recipientsToNotify.length === 0) continue
      stats.candidates += recipientsToNotify.length

      const result = await publishNotification({
        productId: release.productId,
        actorUserId: null,
        actorName: 'System',
        action: 'updated',
        entityType: 'release',
        entityId: release.id,
        entityTitle: release.title,
        message: signal.message,
        routePath: `/releases/${release.id}`,
        recipientUserIds: recipientsToNotify,
        subjectUserIds: recipients,
        changes: [
          { field: 'reminderKind', from: null, to: signal.kind },
          { field: 'status', from: null, to: release.status },
        ],
      })

      stats.published += result.published
      stats.deduped += result.deduped
    }
  }

  recordReminderSweepStats({
    candidates: stats.candidates,
    published: stats.published,
    cooldownSkipped: stats.cooldownSkipped,
  })

  return stats
}

type RollupSummary = {
  taskCount: number
  overdueTasks: number
  blockedTasks: number
  reviewQueue: number
  activeStories: number
  atRiskReleases: number
  failedReleases: number
  openIssues: number
}

function buildDailyRollupMessage(summary: RollupSummary): string {
  const parts: string[] = []
  if (summary.overdueTasks > 0) parts.push(`${summary.overdueTasks} overdue task${summary.overdueTasks === 1 ? '' : 's'}`)
  if (summary.blockedTasks > 0) parts.push(`${summary.blockedTasks} blocked task${summary.blockedTasks === 1 ? '' : 's'}`)
  if (summary.reviewQueue > 0) parts.push(`${summary.reviewQueue} review item${summary.reviewQueue === 1 ? '' : 's'}`)
  if (summary.failedReleases > 0) parts.push(`${summary.failedReleases} failed release${summary.failedReleases === 1 ? '' : 's'}`)
  if (summary.atRiskReleases > 0) parts.push(`${summary.atRiskReleases} at-risk release${summary.atRiskReleases === 1 ? '' : 's'}`)
  if (summary.openIssues > 0) parts.push(`${summary.openIssues} open issue${summary.openIssues === 1 ? '' : 's'}`)
  if (summary.activeStories > 0) parts.push(`${summary.activeStories} active stor${summary.activeStories === 1 ? 'y' : 'ies'}`)
  if (parts.length === 0) return 'Daily rollup: no priority alerts today.'
  return `Daily rollup: ${parts.slice(0, 4).join(', ')}.`
}

function preferredRollupRoute(summary: RollupSummary): string {
  if (summary.overdueTasks > 0 || summary.blockedTasks > 0 || summary.reviewQueue > 0) return '/tasks'
  if (summary.failedReleases > 0 || summary.atRiskReleases > 0) return '/releases'
  if (summary.openIssues > 0) return '/issues'
  if (summary.activeStories > 0) return '/stories'
  return '/home'
}

export async function runDailyCrossViewRollupSweep(now = new Date()): Promise<DailyRollupSweepStats> {
  const config = getNotificationsConfig()
  if (
    !config.enabled
    || config.rolloutMode === 'off'
    || !config.reminderSchedulerEnabled
    || !config.dailyRollupEnabled
  ) {
    return { candidates: 0, alreadySentToday: 0, published: 0, deduped: 0 }
  }
  if (now.getUTCHours() < config.dailyRollupHourUtc) {
    return { candidates: 0, alreadySentToday: 0, published: 0, deduped: 0 }
  }

  const dayBucket = now.toISOString().slice(0, 10)
  const dayStart = new Date(`${dayBucket}T00:00:00.000Z`)
  const nowMs = now.getTime()

  const [taskRows, storyRows, releaseRows, issueRows] = await Promise.all([
    db.query.tasks.findMany({
      where: inArray(tasks.status, [...ACTIVE_TASK_STATUSES]),
      columns: {
        status: true,
        dueAt: true,
        ownerUserId: true,
        assigneeUserIds: true,
        reviewerUserIds: true,
      },
    }),
    db.query.stories.findMany({
      where: inArray(stories.status, [...ACTIVE_STORY_STATUSES]),
      columns: {
        status: true,
        ownerUserId: true,
      },
    }),
    db.query.releases.findMany({
      where: inArray(releases.status, [...ACTIVE_RELEASE_STATUSES]),
      columns: {
        status: true,
        createdByUserId: true,
        releaseManagerId: true,
      },
    }),
    db.query.issues.findMany({
      where: inArray(issues.status, [...ACTIVE_ISSUE_STATUSES]),
      columns: {
        assignedToUserId: true,
      },
    }),
  ])

  const summaryByUserId = new Map<string, RollupSummary>()
  const ensureSummary = (userId: string): RollupSummary => {
    const existing = summaryByUserId.get(userId)
    if (existing) return existing
    const created: RollupSummary = {
      taskCount: 0,
      overdueTasks: 0,
      blockedTasks: 0,
      reviewQueue: 0,
      activeStories: 0,
      atRiskReleases: 0,
      failedReleases: 0,
      openIssues: 0,
    }
    summaryByUserId.set(userId, created)
    return created
  }

  for (const task of taskRows) {
    const recipients = Array.from(new Set([
      task.ownerUserId,
      ...(task.assigneeUserIds || []),
      ...(task.reviewerUserIds || []),
    ].filter((value): value is string => !!value)))
    if (recipients.length === 0) continue
    const status = (task.status || '').toLowerCase()
    const dueAtMs = asTimestamp(task.dueAt)
    for (const userId of recipients) {
      const summary = ensureSummary(userId)
      summary.taskCount += 1
      if (status === 'blocked') summary.blockedTasks += 1
      if (status === 'in_review') summary.reviewQueue += 1
      if (dueAtMs != null && dueAtMs < nowMs) summary.overdueTasks += 1
    }
  }

  for (const story of storyRows) {
    const ownerUserId = story.ownerUserId || null
    if (!ownerUserId) continue
    const summary = ensureSummary(ownerUserId)
    summary.activeStories += 1
  }

  for (const release of releaseRows) {
    const recipients = Array.from(new Set([
      release.createdByUserId,
      release.releaseManagerId,
    ].filter((value): value is string => !!value)))
    if (recipients.length === 0) continue
    const status = (release.status || '').toLowerCase()
    for (const userId of recipients) {
      const summary = ensureSummary(userId)
      if (status === 'failed') summary.failedReleases += 1
      else summary.atRiskReleases += 1
    }
  }

  for (const issue of issueRows) {
    const assignedToUserId = issue.assignedToUserId || null
    if (!assignedToUserId) continue
    const summary = ensureSummary(assignedToUserId)
    summary.openIssues += 1
  }

  const stats: DailyRollupSweepStats = {
    candidates: 0,
    alreadySentToday: 0,
    published: 0,
    deduped: 0,
  }

  for (const [userId, summary] of summaryByUserId.entries()) {
    const actionableCount = summary.overdueTasks
      + summary.blockedTasks
      + summary.reviewQueue
      + summary.atRiskReleases
      + summary.failedReleases
      + summary.openIssues
      + summary.activeStories
    if (actionableCount <= 0) continue
    stats.candidates += 1

    const alreadySent = await hasRecentReminder({
      recipientUserId: userId,
      entityType: 'product',
      entityId: userId,
      type: DAILY_ROLLUP_TYPE,
      since: dayStart,
    })
    if (alreadySent) {
      stats.alreadySentToday += 1
      continue
    }

    const result = await publishNotification({
      productId: null,
      actorUserId: null,
      actorName: 'System',
      action: 'updated',
      entityType: 'product',
      entityId: userId,
      entityTitle: 'Daily rollup',
      message: buildDailyRollupMessage(summary),
      routePath: preferredRollupRoute(summary),
      recipientUserIds: [userId],
      subjectUserIds: [userId],
      changes: [
        { field: 'reminderKind', from: null, to: 'daily_cross_view_rollup' },
        { field: 'rollupDate', from: null, to: dayBucket },
      ],
    })

    stats.published += result.published
    stats.deduped += result.deduped
  }

  recordDailyRollupSweepStats({
    candidates: stats.candidates,
    alreadySentToday: stats.alreadySentToday,
    published: stats.published,
    deduped: stats.deduped,
  })

  return stats
}

export function startNotificationReminderScheduler(): () => void {
  const config = getNotificationsConfig()
  if (!config.enabled || config.rolloutMode === 'off' || !config.reminderSchedulerEnabled) {
    return () => {}
  }

  const schedulerLockClient = postgres(getDatabaseConfig().url, { max: 1 })
  let running = false
  const runSweep = async () => {
    if (running) return
    running = true
    let lockAcquired = false
    try {
      lockAcquired = await tryAcquireSchedulerLock(schedulerLockClient)
      if (!lockAcquired) return

      const result = await runTaskReminderSweep(new Date())
      const rollup = await runDailyCrossViewRollupSweep(new Date())
      if (result.candidates > 0 || result.published > 0 || result.cooldownSkipped > 0) {
        console.log('[notifications:reminders] sweep', result)
      }
      if (rollup.candidates > 0 || rollup.published > 0 || rollup.alreadySentToday > 0) {
        console.log('[notifications:rollup] sweep', rollup)
      }
    } catch (error) {
      console.error('[notifications:reminders] sweep failed', error)
    } finally {
      if (lockAcquired) {
        await releaseSchedulerLock(schedulerLockClient)
      }
      running = false
    }
  }

  void runSweep()
  const intervalHandle = setInterval(() => {
    void runSweep()
  }, config.reminderIntervalMs)

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    clearInterval(intervalHandle)
    void schedulerLockClient.end({ timeout: 5 })
  }
}
