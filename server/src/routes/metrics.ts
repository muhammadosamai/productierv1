import { Elysia } from 'elysia'
import { db } from '../db'
import { users, tasks, stories, initiatives, deliveries, products, taskStatusHistory, issues } from '../db/schema'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { requireOrganizationAccess } from '../lib/authz'
import { HomeScopeResolutionError, resolveMetricsProductScope, type HomeScopeMode } from '../lib/homeScope'
import { withMetricsCache } from '../lib/metricsCache'
import { isSchemaMismatchError, schemaMismatchMessage } from '../lib/schemaMismatch'

// Helper: get date N days ago
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000) }

// Helper: format date as YYYY-MM-DD
function toDateKey(d: Date) { return d.toISOString().slice(0, 10) }

// Helper: format date as YYYY-WXX (ISO week, UTC)
function toWeekKey(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNumber = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber)
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

// Helper: format date as YYYY-MM
function toMonthKey(d: Date) { return d.toISOString().slice(0, 7) }

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function parseQueryNumber(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== 'string') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(parsed, max))
}

function parseGranularity(raw: unknown, fallback: 'day' | 'week' | 'month' = 'week') {
  if (raw !== 'day' && raw !== 'week' && raw !== 'month') return fallback
  return raw
}

function getGranKey(d: Date, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'day') return toDateKey(d)
  if (granularity === 'week') return toWeekKey(d)
  return toMonthKey(d)
}

// Helper: median of sorted numbers
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Helper: percentile
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((sum, value) => sum + value, 0) / arr.length
}

function stdDev(arr: number[]): number {
  if (arr.length <= 1) return 0
  const mean = average(arr)
  const variance = arr.reduce((sum, value) => sum + (value - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function toIso(value: Date): string {
  return value.toISOString()
}

function buildMetricsMeta(
  periodDays: number,
  sampleSize: Record<string, number>,
  options?: {
    granularity?: string
    cacheTtl?: number
    endAt?: Date
  },
) {
  const endAt = options?.endAt ?? new Date()
  const startAt = daysAgo(periodDays)
  const totalSample = Object.values(sampleSize).reduce((sum, size) => sum + toNumber(size), 0)
  return {
    generatedAt: toIso(endAt),
    sourceWindow: {
      periodDays,
      granularity: options?.granularity,
      startAt: toIso(startAt),
      endAt: toIso(endAt),
    },
    sampleSize,
    cacheAge: null as number | null,
    cacheTtl: options?.cacheTtl ?? null,
    lowSample: totalSample > 0 && totalSample < 20,
  }
}

function toText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function toNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeDashboardHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const kpi = toRecord(root.kpi)
  const atRiskWork = toRecord(root.atRiskWork)
  const byCategory = toRecord(atRiskWork.byCategory)
  const trend = Array.isArray(atRiskWork.trend) ? atRiskWork.trend : []
  return {
    ...root,
    kpi: {
      ...kpi,
      onTimeRate: toNumber(kpi.onTimeRate),
    },
    atRiskWork: {
      ...atRiskWork,
      total: toNumber(atRiskWork.total),
      delta: toNumber(atRiskWork.delta),
      byCategory: {
        ...byCategory,
        overdue: toNumber(byCategory.overdue),
        blocked: toNumber(byCategory.blocked),
        agingWip: toNumber(byCategory.agingWip),
        missingOwner: toNumber(byCategory.missingOwner),
        missingReviewer: toNumber(byCategory.missingReviewer),
      },
      trend: trend.map((entry) => {
        const row = toRecord(entry)
        return {
          ...row,
          date: toText(row.date),
          total: toNumber(row.total),
          overdue: toNumber(row.overdue),
          blocked: toNumber(row.blocked),
          agingWip: toNumber(row.agingWip),
          missingOwner: toNumber(row.missingOwner),
          missingReviewer: toNumber(row.missingReviewer),
        }
      }),
    },
  }
}

function normalizeThroughputHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const completedOverTime = Array.isArray(root.completedOverTime) ? root.completedOverTime : []
  return {
    ...root,
    totalCompleted: toNumber(root.totalCompleted),
    completedOverTime: completedOverTime.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        date: toText(row.date),
        completed: toNumber(row.completed),
        netFlow: toNumber(row.netFlow),
      }
    }),
  }
}

function normalizeFlowHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const cycleTime = toRecord(root.cycleTime)
  const leadTime = toRecord(root.leadTime)
  const trendSlope = toRecord(root.trendSlope)
  const percentileTrend = Array.isArray(root.percentileTrend) ? root.percentileTrend : []
  return {
    ...root,
    flowEfficiency: toNumber(root.flowEfficiency),
    cycleTime: {
      ...cycleTime,
      p85: toNumber(cycleTime.p85),
    },
    leadTime: {
      ...leadTime,
      p85: toNumber(leadTime.p85),
    },
    trendSlope: {
      ...trendSlope,
      cycleP85: toNumber(trendSlope.cycleP85),
      leadP85: toNumber(trendSlope.leadP85),
    },
    percentileTrend: percentileTrend.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        bucket: toText(row.bucket),
        p85Cycle: toNumber(row.p85Cycle),
        p85Lead: toNumber(row.p85Lead),
      }
    }),
  }
}

function normalizeQualityHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const reviewLoad = Array.isArray(root.reviewLoad) ? root.reviewLoad : []
  const weeklyOutcomes = Array.isArray(root.weeklyOutcomes) ? root.weeklyOutcomes : []
  const reworkByWeek = Array.isArray(root.reworkByWeek) ? root.reworkByWeek : []
  return {
    ...root,
    firstPassRate: toNumber(root.firstPassRate),
    reworkRate: toNumber(root.reworkRate),
    reopenRate: toNumber(root.reopenRate),
    escapedDefects: toNumber(root.escapedDefects),
    reviewLoad: reviewLoad.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        userId: toText(row.userId),
        name: toText(row.name, 'Unknown'),
        avatar: toNullableText(row.avatar),
        count: toNumber(row.count),
      }
    }),
    weeklyOutcomes: weeklyOutcomes.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        bucket: toText(row.bucket),
        firstPass: toNumber(row.firstPass),
        reopened: toNumber(row.reopened),
        escaped: toNumber(row.escaped),
      }
    }),
    reworkByWeek: reworkByWeek.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        date: toText(row.date),
        count: toNumber(row.count),
      }
    }),
  }
}

function normalizeBlockersHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const currentlyBlocked = Array.isArray(root.currentlyBlocked) ? root.currentlyBlocked : []
  const blockedTrend = Array.isArray(root.blockedTrend) ? root.blockedTrend : []
  return {
    ...root,
    currentlyBlocked: currentlyBlocked.map((entry) => {
      const row = toRecord(entry)
      const assignee = row.assignee == null ? null : toRecord(row.assignee)
      return {
        ...row,
        taskId: toText(row.taskId),
        title: toText(row.title, 'Untitled task'),
        blockedDays: toNumber(row.blockedDays),
        assignee: assignee
          ? {
            ...assignee,
            userId: toNullableText(assignee.userId),
            name: toText(assignee.name, 'Unassigned'),
            avatar: toNullableText(assignee.avatar),
          }
          : null,
      }
    }),
    blockedTrend: blockedTrend.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        date: toText(row.date),
        count: toNumber(row.count),
      }
    }),
  }
}

function normalizePredictabilityHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const riskMatrix = Array.isArray(root.riskMatrix) ? root.riskMatrix : []
  return {
    ...root,
    avgPredictability: toNumber(root.avgPredictability),
    riskMatrix: riskMatrix.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        deliveryId: toText(row.deliveryId),
        title: toText(row.title, 'Unnamed delivery'),
        varianceDays: toNumber(row.varianceDays),
        scopeChange: toNumber(row.scopeChange),
        riskScore: toNumber(row.riskScore),
      }
    }),
  }
}

function normalizeWorkloadMember(entry: unknown): Record<string, unknown> {
  const row = toRecord(entry)
  const byStatusRaw = toRecord(row.byStatus)
  const overdueTasksRaw = Array.isArray(row.overdueTasks) ? row.overdueTasks : []
  return {
    ...row,
    id: toText(row.id),
    name: toText(row.name, 'Unknown'),
    wipCount: toNumber(row.wipCount),
    capacity: toNumber(row.capacity),
    loadRatio: toNumber(row.loadRatio),
    overdueCount: toNumber(row.overdueCount),
    completionRate: toNumber(row.completionRate),
    completedCount: toNumber(row.completedCount),
    byStatus: Object.fromEntries(
      Object.entries(byStatusRaw).map(([status, count]) => [status, toNumber(count)]),
    ),
    overdueTasks: overdueTasksRaw.map((task) => {
      const value = toRecord(task)
      return {
        ...value,
        taskId: toText(value.taskId),
        title: toText(value.title, 'Untitled task'),
        dueAt: toText(value.dueAt),
        daysOverdue: toNumber(value.daysOverdue),
      }
    }),
  }
}

function normalizeWorkloadHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const memberWorkloadRaw = Array.isArray(root.memberWorkload) ? root.memberWorkload : []
  const overloadedRaw = Array.isArray(root.overloaded) ? root.overloaded : []
  const idleRaw = Array.isArray(root.idle) ? root.idle : []
  return {
    ...root,
    overloadThreshold: toNumber(root.overloadThreshold),
    totalMembers: toNumber(root.totalMembers),
    loadBalanceIndex: toNumber(root.loadBalanceIndex),
    memberWorkload: memberWorkloadRaw.map((entry) => normalizeWorkloadMember(entry)),
    overloaded: overloadedRaw.map((entry) => normalizeWorkloadMember(entry)),
    idle: idleRaw.map((entry) => normalizeWorkloadMember(entry)),
  }
}

function normalizeDeliveryRiskBadge(value: unknown): 'on_track' | 'watch' | 'at_risk' {
  if (value === 'watch') return 'watch'
  if (value === 'at_risk') return 'at_risk'
  return 'on_track'
}

function normalizeDeliveriesHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const detailRows = Array.isArray(root.deliveryDetails) ? root.deliveryDetails : []
  return {
    ...root,
    activeDeliveries: toNumber(root.activeDeliveries),
    deliveryDetails: detailRows.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        id: toText(row.id),
        title: toText(row.title, 'Untitled delivery'),
        riskBadge: normalizeDeliveryRiskBadge(row.riskBadge),
        scheduleVarianceDays: toNumber(row.scheduleVarianceDays),
        scopeAddedAfterStart: toNumber(row.scopeAddedAfterStart),
        progress: toNumber(row.progress),
      }
    }),
  }
}

function normalizeProductIds(productIds: string[]): string[] {
  return [...new Set(
    productIds
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )]
}

function buildProductScopeSql(column: string, productIds: string[]) {
  const normalized = normalizeProductIds(productIds)
  if (normalized.length === 0) return sql`false`
  return sql`${sql.raw(column)} in (${sql.join(
    normalized.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`
}

function buildTeamScopeSql(
  ownerColumn: string,
  assigneeColumn: string,
  reviewerColumn: string,
  teamId: string | null,
) {
  if (!teamId) return sql`true`
  return sql`(
    ${sql.raw(ownerColumn)} = ${teamId}::uuid
    or ${sql.raw(assigneeColumn)} && ARRAY[${teamId}::uuid]::uuid[]
    or ${sql.raw(reviewerColumn)} && ARRAY[${teamId}::uuid]::uuid[]
  )`
}

function buildTaskTeamCondition(teamId: string | null) {
  if (!teamId) return null
  return or(
    eq(tasks.ownerTeamId, teamId),
    sql`${tasks.assigneeTeamIds} && ARRAY[${teamId}::uuid]::uuid[]`,
    sql`${tasks.reviewerTeamIds} && ARRAY[${teamId}::uuid]::uuid[]`,
  )
}

function buildProductCondition(column: any, productIds: string[]) {
  const normalized = normalizeProductIds(productIds)
  if (normalized.length === 0) return sql`false`
  if (normalized.length === 1) return eq(column, normalized[0]!)
  return inArray(column, normalized)
}

function buildScopedTaskIdsSql(productIds: string[], teamId: string | null) {
  const productScopeSql = buildProductScopeSql('tasks.product_id', productIds)
  const teamScopeSql = buildTeamScopeSql(
    'tasks.owner_team_id',
    'tasks.assignee_team_ids',
    'tasks.reviewer_team_ids',
    teamId,
  )
  return sql`select tasks.id from tasks where ${productScopeSql} and ${teamScopeSql}`
}

interface MetricsAccessScope {
  mode: HomeScopeMode
  productIds: string[]
  teamId: string | null
  cacheProductId: string | null
}

interface AtRiskSnapshot {
  overdue: number
  blocked: number
  agingWip: number
  missingOwner: number
  missingReviewer: number
  total: number
}

async function computeAtRiskSnapshot(
  productIds: string[],
  teamId: string | null,
  snapshotAt: Date,
): Promise<AtRiskSnapshot> {
  const snapshotIso = snapshotAt.toISOString()
  const productScopeSql = buildProductScopeSql('t.product_id', productIds)
  const historyProductScopeSql = buildProductScopeSql('h.product_id', productIds)
  const teamScopeSql = buildTeamScopeSql(
    't.owner_team_id',
    't.assignee_team_ids',
    't.reviewer_team_ids',
    teamId,
  )
  const [row] = await db.execute(sql`
    with status_snapshot as (
      select
        t.id,
        coalesce(
          (
            select h.to_status
            from task_status_history h
            where h.task_id = t.id
              and h.changed_at <= ${snapshotIso}
              and ${historyProductScopeSql}
            order by h.changed_at desc
            limit 1
          ),
          t.status
        ) as status_at_snapshot,
        t.due_at,
        t.started_at,
        t.created_at,
        t.owner_user_id,
        t.reviewer_user_ids
      from tasks t
      where ${productScopeSql}
        and ${teamScopeSql}
        and t.created_at <= ${snapshotIso}
    )
    select
      count(*) filter (
        where status_at_snapshot not in ('done', 'archived')
          and due_at is not null
          and due_at < ${snapshotIso}
      )::int as overdue,
      count(*) filter (where status_at_snapshot = 'blocked')::int as blocked,
      count(*) filter (
        where status_at_snapshot not in ('done', 'archived')
          and ${snapshotIso}::timestamptz - coalesce(started_at, created_at) > interval '7 days'
      )::int as aging_wip,
      count(*) filter (
        where status_at_snapshot not in ('done', 'archived')
          and owner_user_id is null
      )::int as missing_owner,
      count(*) filter (
        where status_at_snapshot = 'in_review'
          and (reviewer_user_ids is null or cardinality(reviewer_user_ids) = 0)
      )::int as missing_reviewer
    from status_snapshot
  `)

  const overdue = toNumber((row as any)?.overdue)
  const blocked = toNumber((row as any)?.blocked)
  const agingWip = toNumber((row as any)?.aging_wip)
  const missingOwner = toNumber((row as any)?.missing_owner)
  const missingReviewer = toNumber((row as any)?.missing_reviewer)
  return {
    overdue,
    blocked,
    agingWip,
    missingOwner,
    missingReviewer,
    total: overdue + blocked + agingWip + missingOwner + missingReviewer,
  }
}

async function requireMetricsAccess(
  query: Record<string, string | undefined>,
  jwtVerify: (token: string) => Promise<unknown>,
  headers: Record<string, string | undefined>,
  set: any
): Promise<MetricsAccessScope | { error: string }> {
  const queryOrganizationId = typeof query.organizationId === 'string' ? query.organizationId.trim() : ''
  const headerOrganizationId = typeof headers['x-productier-organization-id'] === 'string'
    ? headers['x-productier-organization-id']!.trim()
    : ''
  const organizationId = queryOrganizationId || headerOrganizationId
  if (!organizationId) {
    set.status = 400
    return { error: 'organizationId query parameter is required' }
  }
  if (queryOrganizationId && headerOrganizationId && queryOrganizationId !== headerOrganizationId) {
    set.status = 400
    return { error: 'organizationId does not match scoped organization context' }
  }

  const organizationAccess = await requireOrganizationAccess(
    jwtVerify,
    headers,
    set,
    organizationId,
  )
  if (!organizationAccess) {
    return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
  }
  const user = organizationAccess.user

  try {
    const resolved = await resolveMetricsProductScope(user, {
      organizationId,
      scopeMode: query.scopeMode,
      productId: query.productId,
      teamId: query.teamId,
    })
    const normalizedProductIds = normalizeProductIds(resolved.productIds)
    const cacheProductId = resolved.mode === 'product' && normalizedProductIds.length === 1
      ? normalizedProductIds[0] || null
      : null
    return {
      mode: resolved.mode,
      productIds: normalizedProductIds,
      teamId: resolved.teamId,
      cacheProductId,
    }
  } catch (error) {
    if (error instanceof HomeScopeResolutionError) {
      set.status = error.status
      return { error: error.message }
    }
    if (isSchemaMismatchError(error)) {
      set.status = 503
      return { error: schemaMismatchMessage('Metrics schema') }
    }
    throw error
  }
}

export const metricsRoutes = new Elysia({ prefix: '/api/metrics' })
  .use(authPlugin)

  // ==================== OVERVIEW ====================
  .get('/dashboard', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 30, 7, 365)
    const teamLimit = parseQueryNumber(query.teamLimit, 50, 5, 200)
    const cacheTtl = parseQueryNumber(query.cacheTtl, 120, 30, 1800)

    const computeDashboard = async () => {
        const since = daysAgo(period)
        const prevSince = daysAgo(period * 2)
        const sinceIso = since.toISOString()
        const prevSinceIso = prevSince.toISOString()

        const taskScopeFilter = sql`where ${buildProductScopeSql('product_id', productIds)} and ${buildTeamScopeSql(
          'owner_team_id',
          'assignee_team_ids',
          'reviewer_team_ids',
          teamId,
        )}`
        const storyFilterPrefix = sql`${buildProductScopeSql('product', productIds)} and`

    const taskAggRows = await db.execute(sql`
      select
        count(*)::int as total_tasks,
        count(*) filter (where status = 'done')::int as tasks_done,
        count(*) filter (where status not in ('done', 'archived'))::int as active_tasks,
        count(*) filter (where status = 'blocked')::int as blocked_count,
        count(*) filter (where status = 'overdue')::int as overdue_count,
        count(*) filter (where status = 'in_progress')::int as in_progress_count,
        count(*) filter (where status = 'in_review')::int as in_review_count,
        count(*) filter (where completed_at is not null and completed_at >= ${sinceIso})::int as tasks_completed_curr,
        count(*) filter (where completed_at is not null and completed_at >= ${prevSinceIso} and completed_at < ${sinceIso})::int as tasks_completed_prev,
        avg(extract(epoch from (completed_at - started_at)) / 86400.0)
          filter (where completed_at is not null and started_at is not null) as avg_cycle_time,
        avg(extract(epoch from (completed_at - created_at)) / 86400.0)
          filter (where completed_at is not null) as avg_lead_time,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and completed_at >= ${sinceIso}
            and completed_at <= due_at
        )::int as on_time_count_curr,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and completed_at >= ${sinceIso}
        )::int as tasks_with_due_curr,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and completed_at >= ${prevSinceIso}
            and completed_at < ${sinceIso}
            and completed_at <= due_at
        )::int as on_time_count_prev,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and completed_at >= ${prevSinceIso}
            and completed_at < ${sinceIso}
        )::int as tasks_with_due_prev
      from tasks
      ${taskScopeFilter}
    `)
    const taskAgg = (taskAggRows[0] as any) || {}
    const totalTasks = toNumber(taskAgg.total_tasks)
    const tasksDoneCurr = toNumber(taskAgg.tasks_done)
    const tasksCompletedCurr = toNumber(taskAgg.tasks_completed_curr)
    const tasksCompletedPrev = toNumber(taskAgg.tasks_completed_prev)
    const blockedCount = toNumber(taskAgg.blocked_count)
    const overdueCount = toNumber(taskAgg.overdue_count)
    const activeTaskCount = toNumber(taskAgg.active_tasks)
    const inProgressCount = toNumber(taskAgg.in_progress_count)
    const inReviewCount = toNumber(taskAgg.in_review_count)
    const avgCycleTime = Math.round(toNumber(taskAgg.avg_cycle_time) * 10) / 10
    const avgLeadTime = Math.round(toNumber(taskAgg.avg_lead_time) * 10) / 10
    const onTimeCountCurr = toNumber(taskAgg.on_time_count_curr)
    const tasksWithDueCountCurr = toNumber(taskAgg.tasks_with_due_curr)
    const onTimeCountPrev = toNumber(taskAgg.on_time_count_prev)
    const tasksWithDueCountPrev = toNumber(taskAgg.tasks_with_due_prev)

    const [storyAgg] = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
    }).from(stories).where(buildProductCondition(stories.productId, productIds))

    const [initiativeAgg] = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
    }).from(initiatives).where(buildProductCondition(initiatives.productId, productIds))

    const [deliveryAgg] = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
    }).from(deliveries).where(buildProductCondition(deliveries.productId, productIds))

    const totalStories = Number(storyAgg?.total ?? 0)
    const storiesCompletedCurr = Number(storyAgg?.completed ?? 0)
    const totalInitiatives = Number(initiativeAgg?.total ?? 0)
    const completedInitiatives = Number(initiativeAgg?.completed ?? 0)
    const totalDeliveries = Number(deliveryAgg?.total ?? 0)
    const completedDeliveries = Number(deliveryAgg?.completed ?? 0)

    const taskCompletionRate = totalTasks > 0 ? Math.round((tasksDoneCurr / totalTasks) * 100) : 0
    const storyCompletionRate = totalStories > 0 ? Math.round((storiesCompletedCurr / totalStories) * 100) : 0
    const initCompletionRate = totalInitiatives > 0 ? Math.round((completedInitiatives / totalInitiatives) * 100) : 0
    const delivCompletionRate = totalDeliveries > 0 ? Math.round((completedDeliveries / totalDeliveries) * 100) : 0
    const onTimeRate = tasksWithDueCountCurr > 0 ? Math.round((onTimeCountCurr / tasksWithDueCountCurr) * 100) : 100
    const onTimeRatePrev = tasksWithDueCountPrev > 0 ? Math.round((onTimeCountPrev / tasksWithDueCountPrev) * 100) : onTimeRate

    const [agingWipRow] = await db.execute(sql`
      select
        count(*) filter (
          where status not in ('done', 'archived')
            and now() - coalesce(started_at, created_at) > interval '7 days'
        )::int as value
      from tasks
      where ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)
    const agingWipCount = toNumber((agingWipRow as any)?.value)
    const blockerRatio = totalTasks > 0 ? Math.round((blockedCount / totalTasks) * 100) : 0
    const overdueRatio = totalTasks > 0 ? Math.round((overdueCount / totalTasks) * 100) : 0
    const agingWipRatio = activeTaskCount > 0 ? Math.round((agingWipCount / activeTaskCount) * 100) : 0
    const trendDirection = onTimeRate === onTimeRatePrev
      ? 'flat'
      : onTimeRate > onTimeRatePrev
        ? 'up'
        : 'down'

    const snapshotNow = new Date()
    const atRiskCurrent = await computeAtRiskSnapshot(productIds, teamId, snapshotNow)
    const atRiskPrevious = await computeAtRiskSnapshot(productIds, teamId, since)
    const atRiskDelta = atRiskCurrent.total - atRiskPrevious.total
    const atRiskTrend = [
      {
        date: toDateKey(since),
        total: atRiskPrevious.total,
        overdue: atRiskPrevious.overdue,
        blocked: atRiskPrevious.blocked,
        agingWip: atRiskPrevious.agingWip,
        missingOwner: atRiskPrevious.missingOwner,
        missingReviewer: atRiskPrevious.missingReviewer,
      },
      {
        date: toDateKey(snapshotNow),
        total: atRiskCurrent.total,
        overdue: atRiskCurrent.overdue,
        blocked: atRiskCurrent.blocked,
        agingWip: atRiskCurrent.agingWip,
        missingOwner: atRiskCurrent.missingOwner,
        missingReviewer: atRiskCurrent.missingReviewer,
      },
    ]

    const sparkWeeks = Math.max(2, Math.min(26, Math.ceil(period / 7)))
    const sparkHorizonDays = sparkWeeks * 7
    const sparkRows = await db.execute(sql`
      select date_trunc('week', completed_at) as week_start, count(*)::int as value
      from tasks
      where completed_at is not null
        and completed_at >= ${daysAgo(sparkHorizonDays).toISOString()}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by week_start
      order by week_start asc
    `)
    const sparkMap = new Map<string, number>()
    for (const row of sparkRows as any[]) {
      const weekKey = toWeekKey(new Date(row.week_start))
      sparkMap.set(weekKey, toNumber(row.value))
    }
    const sparkline: number[] = []
    for (let i = sparkWeeks - 1; i >= 0; i--) {
      const key = toWeekKey(daysAgo(i * 7))
      sparkline.push(sparkMap.get(key) || 0)
    }

        const teamRows = await db.execute(sql`
      with relevant_tasks as (
        select status, started_at, created_at, owner_user_id, assignee_user_ids, owner_team_id, assignee_team_ids
        from tasks
        ${taskScopeFilter}
      ),
      task_users as (
        select owner_user_id as user_id, status, started_at, created_at
        from relevant_tasks
        where owner_user_id is not null
        union all
        select unnest(assignee_user_ids) as user_id, status, started_at, created_at
        from relevant_tasks
        where assignee_user_ids is not null
        union all
        select otm.user_id as user_id, rt.status, rt.started_at, rt.created_at
        from relevant_tasks rt
        inner join organization_team_members otm
          on otm.organization_team_id = rt.owner_team_id
        where rt.owner_team_id is not null
        union all
        select otm.user_id as user_id, rt.status, rt.started_at, rt.created_at
        from relevant_tasks rt
        cross join lateral unnest(rt.assignee_team_ids) as assignee_team(team_id)
        inner join organization_team_members otm
          on otm.organization_team_id = assignee_team.team_id
        where rt.assignee_team_ids is not null
      ),
      task_agg as (
        select
          user_id,
          count(*)::int as total,
          count(*) filter (where status = 'done')::int as completed,
          count(*) filter (where status = 'in_progress')::int as in_progress,
          count(*) filter (where status = 'overdue')::int as overdue,
          count(*) filter (where status = 'blocked')::int as blocked,
          count(*) filter (
            where status not in ('done', 'archived')
              and now() - coalesce(started_at, created_at) > interval '7 days'
          )::int as aging_wip
        from task_users
        group by user_id
      ),
      story_agg as (
        select owner_user_id as user_id, count(*)::int as stories
        from backlog_items
        where ${storyFilterPrefix} owner_user_id is not null
        group by owner_user_id
      )
      select
        u.id,
        u.name,
        u.avatar,
        u.role,
        coalesce(t.total, 0) as total,
        coalesce(t.completed, 0) as completed,
        coalesce(t.in_progress, 0) as in_progress,
        coalesce(t.overdue, 0) as overdue,
        coalesce(t.blocked, 0) as blocked,
        coalesce(t.aging_wip, 0) as aging_wip,
        coalesce(s.stories, 0) as stories
      from users u
      left join task_agg t on t.user_id = u.id
      left join story_agg s on s.user_id = u.id
      where coalesce(t.total, 0) > 0 or coalesce(s.stories, 0) > 0
      order by coalesce(t.total, 0) desc, u.name asc
      limit ${teamLimit}
    `)

        const teamWorkload = (teamRows as any[]).map(row => {
      const total = toNumber(row.total)
      const completed = toNumber(row.completed)
      return {
        id: row.id as string,
        name: row.name as string,
        avatar: (row.avatar ?? null) as string | null,
        role: row.role as string,
        tasks: {
          total,
          completed,
          inProgress: toNumber(row.in_progress),
          overdue: toNumber(row.overdue),
          blocked: toNumber(row.blocked),
          agingWip: toNumber(row.aging_wip),
        },
        stories: toNumber(row.stories),
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      }
    })

        return {
      kpi: {
        tasksCompleted: { current: tasksCompletedCurr, previous: tasksCompletedPrev },
        storiesCompleted: storiesCompletedCurr,
        taskCompletionRate, storyCompletionRate, initCompletionRate, delivCompletionRate,
        avgCycleTime, avgLeadTime, onTimeRate,
        blockedCount, overdueCount, inProgressCount, inReviewCount,
        totalTasks, totalStories, totalInitiatives, totalDeliveries,
      },
      flowHealth: {
        blockerRatio,
        overdueRatio,
        agingWipRatio,
        onTimeRate,
        trendDirection,
        activeTaskCount,
        agingWipCount,
      },
      atRiskWork: {
        total: atRiskCurrent.total,
        delta: atRiskDelta,
        byCategory: {
          overdue: atRiskCurrent.overdue,
          blocked: atRiskCurrent.blocked,
          agingWip: atRiskCurrent.agingWip,
          missingOwner: atRiskCurrent.missingOwner,
          missingReviewer: atRiskCurrent.missingReviewer,
        },
        trend: atRiskTrend,
      },
      sparkline,
      team: { workload: teamWorkload, totalMembers: teamWorkload.length },
      meta: buildMetricsMeta(period, {
        tasks: totalTasks,
        completedCurrent: tasksCompletedCurr,
        teamMembers: teamWorkload.length,
        atRisk: atRiskCurrent.total,
      }, { cacheTtl }),
      }
    }

    const payload = access.cacheProductId
      ? await withMetricsCache(
        { endpoint: 'dashboard', productId: access.cacheProductId, period, extra: { teamLimit } },
        cacheTtl,
        computeDashboard,
      )
      : await computeDashboard()

    return normalizeDashboardHomeFields(payload)
  })

  // ==================== THROUGHPUT ====================
  .get('/throughput', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 7, 365)
    const granularity = parseGranularity(query.granularity, 'week')
    const cacheTtl = parseQueryNumber(query.cacheTtl, 120, 30, 1800)

    const computeThroughput = async () => {
        const since = daysAgo(period)
        const sinceIso = since.toISOString()
        const completedRows = await db.execute(sql`
      select completed_at
      from tasks
      where completed_at is not null
        and completed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)
        const createdRows = await db.execute(sql`
      select created_at
      from tasks
      where created_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)

        const completedByPeriod: Record<string, number> = {}
        const createdByPeriod: Record<string, number> = {}
        for (const row of completedRows as any[]) {
          const key = getGranKey(new Date(row.completed_at), granularity)
          completedByPeriod[key] = (completedByPeriod[key] || 0) + 1
        }
        for (const row of createdRows as any[]) {
          const key = getGranKey(new Date(row.created_at), granularity)
          createdByPeriod[key] = (createdByPeriod[key] || 0) + 1
        }

        const allKeys = [...new Set([
          ...Object.keys(completedByPeriod),
          ...Object.keys(createdByPeriod),
        ])].sort()
        const rawBuckets = allKeys.map(date => ({
          date,
          completed: completedByPeriod[date] || 0,
          created: createdByPeriod[date] || 0,
        }))
        const netFlowValues = rawBuckets.map(bucket => bucket.created - bucket.completed)
        const rollingWindow = 4
        const completedOverTime = rawBuckets.map((bucket, index) => {
          const from = Math.max(0, index - (rollingWindow - 1))
          const slice = netFlowValues.slice(from, index + 1)
          const mean = Math.round(average(slice) * 10) / 10
          const deviation = Math.round(stdDev(slice) * 10) / 10
          return {
            ...bucket,
            arrivalRate: bucket.created,
            departureRate: bucket.completed,
            netFlow: bucket.created - bucket.completed,
            rollingMean: mean,
            rollingStd: deviation,
          }
        })

        const byTypeRows = await db.execute(sql`
      select coalesce(type::text, 'untyped') as task_type, count(*)::int as count
      from tasks
      where completed_at is not null
        and completed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by task_type
      order by count desc
    `)
        const byType: Record<string, number> = {}
        for (const row of byTypeRows as any[]) {
          byType[String(row.task_type)] = toNumber(row.count)
        }

        const totalCompleted = (completedRows as any[]).length
        const totalCreated = (createdRows as any[]).length
        const netFlowAverage = average(completedOverTime.map(bucket => bucket.netFlow))
        const healthy = netFlowAverage <= 0
        const healthHint = healthy
          ? 'Arrival is balanced with or below departure.'
          : 'Arrival is outpacing departure; backlog drift risk is rising.'

        return {
          completedOverTime,
          byType,
          totalCompleted,
          totalCreated,
          health: {
            healthy,
            hint: healthHint,
          },
          meta: buildMetricsMeta(period, {
            completedEvents: totalCompleted,
            createdEvents: totalCreated,
            buckets: completedOverTime.length,
          }, {
            granularity,
            cacheTtl,
          }),
        }
    }

    const payload = access.cacheProductId
      ? await withMetricsCache(
        { endpoint: 'throughput', productId: access.cacheProductId, period, granularity },
        cacheTtl,
        computeThroughput,
      )
      : await computeThroughput()

    return normalizeThroughputHomeFields(payload)
  })

  // ==================== FLOW ====================
  .get('/flow', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const sampleLimit = parseQueryNumber(query.sampleLimit, 400, 100, 2000)
    const wipLimit = parseQueryNumber(query.wipLimit, 200, 50, 500)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()
    const taskTeamCondition = buildTaskTeamCondition(teamId)
    const scopedTaskIdsSql = buildScopedTaskIdsSql(productIds, teamId)

    const completedWithStart = await db.select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
    }).from(tasks).where(and(
      sql`${tasks.completedAt} is not null`,
      sql`${tasks.startedAt} is not null`,
      sql`${tasks.completedAt} >= ${sinceIso}`,
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    )).orderBy(desc(tasks.completedAt)).limit(sampleLimit)

    const cycleTimeData = completedWithStart.map(t => ({
      taskId: t.id,
      title: t.title,
      priority: t.priority,
      cycleTimeDays: Math.round(((new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()) / 86400000) * 10) / 10,
      completedAt: t.completedAt,
    }))
    const ctValues = cycleTimeData.map(d => d.cycleTimeDays)

    const completedAll = await db.select({
      id: tasks.id,
      title: tasks.title,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
      startedAt: tasks.startedAt,
    }).from(tasks).where(and(
      sql`${tasks.completedAt} is not null`,
      sql`${tasks.completedAt} >= ${sinceIso}`,
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    )).orderBy(desc(tasks.completedAt)).limit(sampleLimit)

    const leadTimeData = completedAll.map(t => ({
      taskId: t.id,
      title: t.title,
      leadTimeDays: Math.round(((new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 86400000) * 10) / 10,
      completedAt: t.completedAt,
    }))
    const ltValues = leadTimeData.map(d => d.leadTimeDays)

    const now = Date.now()
    const wipTasks = await db.select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      startedAt: tasks.startedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    }).from(tasks).where(and(
      sql`${tasks.status} not in ('done', 'archived')`,
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    )).orderBy(desc(tasks.updatedAt)).limit(wipLimit)

    const agingWip = wipTasks.map(t => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      ageDays: Math.round(((now - new Date(t.startedAt || t.createdAt).getTime()) / 86400000) * 10) / 10,
    })).sort((a, b) => b.ageDays - a.ageDays)

    const statusKeys = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'blocked']
    const dayCount = Math.min(period, 90)
    const dayStep = dayCount > 30 ? 7 : 1
    const cfdHorizonStart = daysAgo(dayCount + 30)
    const cfdHorizonStartIso = cfdHorizonStart.toISOString()

    const cfdTasks = await db.select({
      id: tasks.id,
      createdAt: tasks.createdAt,
      status: tasks.status,
    }).from(tasks).where(and(
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    ))

    const cfdHistory = await db.select({
      taskId: taskStatusHistory.taskId,
      toStatus: taskStatusHistory.toStatus,
      changedAt: taskStatusHistory.changedAt,
    }).from(taskStatusHistory).where(and(
      sql`${taskStatusHistory.changedAt} >= ${cfdHorizonStartIso}`,
      buildProductCondition(taskStatusHistory.productId, productIds),
      ...(teamId ? [sql`${taskStatusHistory.taskId} in (${scopedTaskIdsSql})`] : []),
    )).orderBy(taskStatusHistory.taskId, taskStatusHistory.changedAt)

    const historyByTask = new Map<string, Array<{ changedAtMs: number; toStatus: string }>>()
    for (const entry of cfdHistory) {
      const list = historyByTask.get(entry.taskId) || []
      list.push({
        changedAtMs: new Date(entry.changedAt).getTime(),
        toStatus: entry.toStatus,
      })
      historyByTask.set(entry.taskId, list)
    }

    const statusAt = (taskId: string, defaultStatus: string, atMs: number) => {
      const history = historyByTask.get(taskId)
      if (!history || history.length === 0) return defaultStatus
      let low = 0
      let high = history.length - 1
      let answer = defaultStatus
      while (low <= high) {
        const mid = (low + high) >> 1
        const current = history[mid]!
        if (current.changedAtMs <= atMs) {
          answer = current.toStatus
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      return answer
    }

    const cfd: { date: string; [key: string]: number | string }[] = []
    for (let i = dayCount; i >= 0; i -= dayStep) {
      const day = daysAgo(i)
      const dayEnd = day.getTime()
      const snapshot: Record<string, number> = {}
      for (const key of statusKeys) snapshot[key] = 0

      for (const task of cfdTasks) {
        if (new Date(task.createdAt).getTime() > dayEnd) continue
        const status = statusAt(task.id, task.status, dayEnd)
        if (snapshot[status] !== undefined) snapshot[status] += 1
      }
      cfd.push({ date: toDateKey(day), ...snapshot })
    }

    let flowEfficiency = 0
    if (completedWithStart.length > 0) {
      const totalLead = completedAll.reduce(
        (sum, task) => sum + (new Date(task.completedAt!).getTime() - new Date(task.createdAt).getTime()),
        0,
      )
      const totalActive = completedWithStart.reduce(
        (sum, task) => sum + (new Date(task.completedAt!).getTime() - new Date(task.startedAt!).getTime()),
        0,
      )
      flowEfficiency = totalLead > 0 ? Math.round((totalActive / totalLead) * 100) : 0
    }

    const percentileBucketMap = new Map<string, { cycle: number[]; lead: number[] }>()
    for (const point of cycleTimeData) {
      if (!point.completedAt) continue
      const bucket = toWeekKey(new Date(point.completedAt))
      const entry = percentileBucketMap.get(bucket) || { cycle: [], lead: [] }
      entry.cycle.push(point.cycleTimeDays)
      percentileBucketMap.set(bucket, entry)
    }
    for (const point of leadTimeData) {
      if (!point.completedAt) continue
      const bucket = toWeekKey(new Date(point.completedAt))
      const entry = percentileBucketMap.get(bucket) || { cycle: [], lead: [] }
      entry.lead.push(point.leadTimeDays)
      percentileBucketMap.set(bucket, entry)
    }
    const percentileTrend = [...percentileBucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, values]) => ({
        bucket,
        p50Cycle: Math.round(percentile(values.cycle, 50) * 10) / 10,
        p85Cycle: Math.round(percentile(values.cycle, 85) * 10) / 10,
        p95Cycle: Math.round(percentile(values.cycle, 95) * 10) / 10,
        p50Lead: Math.round(percentile(values.lead, 50) * 10) / 10,
        p85Lead: Math.round(percentile(values.lead, 85) * 10) / 10,
        p95Lead: Math.round(percentile(values.lead, 95) * 10) / 10,
        sampleSize: Math.max(values.cycle.length, values.lead.length),
      }))
    const cycleSlope = percentileTrend.length > 1
      ? Math.round((percentileTrend[percentileTrend.length - 1]!.p85Cycle - percentileTrend[0]!.p85Cycle) * 10) / 10
      : 0
    const leadSlope = percentileTrend.length > 1
      ? Math.round((percentileTrend[percentileTrend.length - 1]!.p85Lead - percentileTrend[0]!.p85Lead) * 10) / 10
      : 0

    return normalizeFlowHomeFields({
      cycleTime: {
        data: cycleTimeData,
        median: Math.round(median(ctValues) * 10) / 10,
        p85: Math.round(percentile(ctValues, 85) * 10) / 10,
        p95: Math.round(percentile(ctValues, 95) * 10) / 10,
        average: ctValues.length > 0 ? Math.round((ctValues.reduce((a, b) => a + b, 0) / ctValues.length) * 10) / 10 : 0,
      },
      leadTime: {
        data: leadTimeData,
        median: Math.round(median(ltValues) * 10) / 10,
        p85: Math.round(percentile(ltValues, 85) * 10) / 10,
        p95: Math.round(percentile(ltValues, 95) * 10) / 10,
        average: ltValues.length > 0 ? Math.round((ltValues.reduce((a, b) => a + b, 0) / ltValues.length) * 10) / 10 : 0,
      },
      percentileTrend,
      agingWip,
      cfd,
      flowEfficiency,
      wipCount: wipTasks.length,
      trendSlope: {
        cycleP85: cycleSlope,
        leadP85: leadSlope,
      },
      meta: buildMetricsMeta(period, {
        completedWithStart: completedWithStart.length,
        completedAll: completedAll.length,
        wip: wipTasks.length,
        trendBuckets: percentileTrend.length,
      }),
    })
  })

  // ==================== QUALITY ====================
  .get('/quality', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()
    const taskTeamCondition = buildTaskTeamCondition(teamId)
    const scopedTaskIdsSql = buildScopedTaskIdsSql(productIds, teamId)

    const reworkTransitions = await db.select({
      taskId: taskStatusHistory.taskId,
      fromStatus: taskStatusHistory.fromStatus,
      toStatus: taskStatusHistory.toStatus,
      changedAt: taskStatusHistory.changedAt,
    }).from(taskStatusHistory).where(and(
      sql`${taskStatusHistory.changedAt} >= ${sinceIso}`,
      or(
        eq(taskStatusHistory.fromStatus, 'in_review'),
        eq(taskStatusHistory.fromStatus, 'done'),
      ),
      or(
        eq(taskStatusHistory.toStatus, 'in_progress'),
        eq(taskStatusHistory.toStatus, 'assigned'),
      ),
      buildProductCondition(taskStatusHistory.productId, productIds),
      ...(teamId ? [sql`${taskStatusHistory.taskId} in (${scopedTaskIdsSql})`] : []),
    ))
    const reworkTaskIds = new Set(reworkTransitions.map(h => h.taskId))

    const completedInPeriod = await db.select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      type: tasks.type,
    }).from(tasks).where(and(
      sql`${tasks.completedAt} is not null`,
      sql`${tasks.completedAt} >= ${sinceIso}`,
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    ))

    const firstPassCount = completedInPeriod.filter(t => !reworkTaskIds.has(t.id)).length
    const firstPassRate = completedInPeriod.length > 0 ? Math.round((firstPassCount / completedInPeriod.length) * 100) : 100
    const reworkRate = completedInPeriod.length > 0 ? Math.round((reworkTaskIds.size / completedInPeriod.length) * 100) : 0

    // "fix" is the closest bug-fix task type in the current task taxonomy.
    const completedBugs = completedInPeriod.filter(t => t.type === 'fix').length
    const bugRate = completedInPeriod.length > 0 ? Math.round((completedBugs / completedInPeriod.length) * 100) : 0

    const reviewLoadRows = await db.execute(sql`
      select
        r.reviewer_id as user_id,
        u.name as user_name,
        u.avatar as user_avatar,
        count(*)::int as count
      from tasks t
      cross join lateral unnest(t.reviewer_user_ids) as r(reviewer_id)
      left join users u on u.id = r.reviewer_id
      where t.status = 'in_review'
        and ${buildProductScopeSql('t.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
      group by r.reviewer_id, u.name, u.avatar
      order by count desc, u.name asc
    `)
    const reviewLoad = (reviewLoadRows as any[]).map(row => ({
      userId: row.user_id as string,
      name: (row.user_name ?? 'Unknown') as string,
      avatar: (row.user_avatar ?? null) as string | null,
      count: toNumber(row.count),
    }))

    const reworkCountByTask = new Map<string, number>()
    for (const entry of reworkTransitions) {
      reworkCountByTask.set(entry.taskId, (reworkCountByTask.get(entry.taskId) || 0) + 1)
    }
    const reworkedTaskRows = reworkTaskIds.size > 0
      ? await db.select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
      }).from(tasks).where(inArray(tasks.id, [...reworkTaskIds]))
      : []
    const reworkedTasks = reworkedTaskRows.map(t => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      reworkCount: reworkCountByTask.get(t.id) || 0,
    }))

    const reworkByWeek: Record<string, number> = {}
    reworkTransitions.forEach(h => {
      const key = toWeekKey(new Date(h.changedAt))
      reworkByWeek[key] = (reworkByWeek[key] || 0) + 1
    })

    const reopenTransitions = reworkTransitions.filter(transition =>
      transition.fromStatus === 'done' && (transition.toStatus === 'in_progress' || transition.toStatus === 'assigned')
    )
    const reopenRate = completedInPeriod.length > 0
      ? Math.round((reopenTransitions.length / completedInPeriod.length) * 100)
      : 0

    const escapedIssuesRows = await db.execute(sql`
      select date_trunc('week', created_at) as week_start, count(*)::int as count
      from issues
      where created_at >= ${sinceIso}
        and delivery_id is not null
        and ${buildProductScopeSql('product_id', productIds)}
      group by week_start
      order by week_start asc
    `)
    const escapedByWeek: Record<string, number> = {}
    for (const row of escapedIssuesRows as any[]) {
      escapedByWeek[toWeekKey(new Date(row.week_start))] = toNumber(row.count)
    }
    const escapedDefects = Object.values(escapedByWeek).reduce((sum, count) => sum + count, 0)

    const firstPassByPriorityMap = new Map<string, { firstPass: number; total: number }>()
    const firstPassByTypeMap = new Map<string, { firstPass: number; total: number }>()
    for (const task of completedInPeriod) {
      const priority = task.priority || 'unknown'
      const type = String(task.type || 'untyped')
      const isFirstPass = !reworkTaskIds.has(task.id)

      const priorityEntry = firstPassByPriorityMap.get(priority) || { firstPass: 0, total: 0 }
      priorityEntry.total += 1
      if (isFirstPass) priorityEntry.firstPass += 1
      firstPassByPriorityMap.set(priority, priorityEntry)

      const typeEntry = firstPassByTypeMap.get(type) || { firstPass: 0, total: 0 }
      typeEntry.total += 1
      if (isFirstPass) typeEntry.firstPass += 1
      firstPassByTypeMap.set(type, typeEntry)
    }
    const firstPassByPriority = [...firstPassByPriorityMap.entries()].map(([priority, values]) => ({
      priority,
      firstPass: values.firstPass,
      total: values.total,
    }))
    const firstPassByType = [...firstPassByTypeMap.entries()].map(([type, values]) => ({
      type,
      firstPass: values.firstPass,
      total: values.total,
    }))

    const weekKeys = [...new Set([
      ...Object.keys(reworkByWeek),
      ...Object.keys(escapedByWeek),
    ])].sort()
    const completedByWeekRows = await db.execute(sql`
      select date_trunc('week', completed_at) as week_start, count(*)::int as count
      from tasks
      where completed_at is not null
        and completed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by week_start
      order by week_start asc
    `)
    const completedByWeek: Record<string, number> = {}
    for (const row of completedByWeekRows as any[]) {
      completedByWeek[toWeekKey(new Date(row.week_start))] = toNumber(row.count)
      if (!weekKeys.includes(toWeekKey(new Date(row.week_start)))) {
        weekKeys.push(toWeekKey(new Date(row.week_start)))
      }
    }
    weekKeys.sort()

    const weeklyOutcomes = weekKeys.map((bucket) => {
      const reopened = reworkByWeek[bucket] || 0
      const escaped = escapedByWeek[bucket] || 0
      const completed = completedByWeek[bucket] || 0
      const firstPass = Math.max(0, completed - reopened)
      return {
        bucket,
        firstPass,
        reopened,
        escaped,
      }
    })
    const reopenControlPoints = weeklyOutcomes.map((point) => {
      const denominator = Math.max(1, point.firstPass + point.reopened)
      return {
        bucket: point.bucket,
        rate: Math.round((point.reopened / denominator) * 100),
        count: point.reopened,
      }
    })

    return normalizeQualityHomeFields({
      firstPassRate, reworkRate, bugRate,
      reopenRate,
      reopenCount: reopenTransitions.length,
      escapedDefects,
      totalCompleted: completedInPeriod.length,
      reworkCount: reworkTaskIds.size,
      reworkEventCount: reworkTransitions.length,
      reviewLoad, reworkedTasks,
      firstPassByPriority,
      firstPassByType,
      weeklyOutcomes,
      reopenControl: {
        targetRate: 10,
        points: reopenControlPoints,
      },
      taxonomyNote: 'Bug rate is based on task type and reopen transitions. Escaped defects are issues linked to deliveries.',
      reworkByWeek: Object.entries(reworkByWeek).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
      meta: buildMetricsMeta(period, {
        completed: completedInPeriod.length,
        reworkEvents: reworkTransitions.length,
        reviewers: reviewLoad.length,
        escapedDefects,
      }),
    })
  })

  // ==================== BLOCKERS ====================
  .get('/blockers', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const blockedLimit = parseQueryNumber(query.limit, 100, 10, 300)
    const unblockSlaDays = parseQueryNumber(query.slaDays, 3, 1, 30)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()
    const scopedTaskIdsSql = buildScopedTaskIdsSql(productIds, teamId)

    const now = Date.now()
    const blockedRows = await db.execute(sql`
      with latest_block as (
        select task_id, max(changed_at) as blocked_at
        from task_status_history
        where to_status = 'blocked'
          and ${buildProductScopeSql('product_id', productIds)}
          and task_id in (${scopedTaskIdsSql})
        group by task_id
      )
      select
        t.id as task_id,
        t.title,
        t.priority,
        t.blocked_reason,
        coalesce(lb.blocked_at, t.updated_at) as blocked_since,
        u.id as assignee_id,
        u.name as assignee_name,
        u.avatar as assignee_avatar
      from tasks t
      left join latest_block lb on lb.task_id = t.id
      left join users u on u.id = t.owner_user_id
      where t.status = 'blocked'
        and ${buildProductScopeSql('t.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
      order by coalesce(lb.blocked_at, t.updated_at) asc
      limit ${blockedLimit}
    `)
    const blockedTasks = (blockedRows as any[]).map(row => {
      const blockedSince = new Date(row.blocked_since)
      return {
        taskId: row.task_id as string,
        title: row.title as string,
        priority: row.priority as string,
        blockedReason: (row.blocked_reason || 'No reason provided') as string,
        blockedDays: Math.round(((now - blockedSince.getTime()) / 86400000) * 10) / 10,
        assignee: row.assignee_name
          ? {
              userId: (row.assignee_id ?? null) as string | null,
              name: row.assignee_name as string,
              avatar: (row.assignee_avatar ?? null) as string | null,
            }
          : null,
      }
    }).sort((a, b) => b.blockedDays - a.blockedDays)

    const reasonRows = await db.execute(sql`
      select blocked_reason as reason, count(*)::int as count
      from tasks
      where blocked_reason is not null
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by blocked_reason
      order by count desc
    `)
    const blockReasons = (reasonRows as any[]).map(row => ({
      reason: String(row.reason),
      count: toNumber(row.count),
    }))

    const transitions = await db.select({
      taskId: taskStatusHistory.taskId,
      fromStatus: taskStatusHistory.fromStatus,
      toStatus: taskStatusHistory.toStatus,
      changedAt: taskStatusHistory.changedAt,
    }).from(taskStatusHistory).where(and(
      sql`${taskStatusHistory.changedAt} >= ${sinceIso}`,
      buildProductCondition(taskStatusHistory.productId, productIds),
      ...(teamId ? [sql`${taskStatusHistory.taskId} in (${scopedTaskIdsSql})`] : []),
    )).orderBy(taskStatusHistory.taskId, taskStatusHistory.changedAt)

    const transitionsByTask = new Map<string, typeof transitions>()
    for (const transition of transitions) {
      const existing = transitionsByTask.get(transition.taskId)
      if (existing) existing.push(transition)
      else transitionsByTask.set(transition.taskId, [transition])
    }
    const blockDurations: number[] = []
    for (const taskTransitions of transitionsByTask.values()) {
      let blockedAt: Date | null = null
      for (const transition of taskTransitions) {
        if (transition.toStatus === 'blocked') {
          blockedAt = new Date(transition.changedAt)
          continue
        }
        if (blockedAt && transition.fromStatus === 'blocked') {
          const unblockedAt = new Date(transition.changedAt)
          blockDurations.push((unblockedAt.getTime() - blockedAt.getTime()) / 86400000)
          blockedAt = null
        }
      }
    }
    const avgBlockDuration = blockDurations.length > 0
      ? Math.round((blockDurations.reduce((a, b) => a + b, 0) / blockDurations.length) * 10) / 10
      : 0
    const medianUnblockDays = Math.round(percentile(blockDurations, 50) * 10) / 10
    const unblockedWithinSla = blockDurations.filter(duration => duration <= unblockSlaDays).length
    const unblockSlaHitRate = blockDurations.length > 0
      ? Math.round((unblockedWithinSla / blockDurations.length) * 100)
      : 100
    const longOpenBreaches = blockedTasks.filter(task => task.blockedDays > unblockSlaDays).length

    const unblockDistributionBuckets: Record<string, number> = {
      '<1d': 0,
      '1-3d': 0,
      '3-7d': 0,
      '>7d': 0,
    }
    for (const duration of blockDurations) {
      if (duration < 1) unblockDistributionBuckets['<1d'] += 1
      else if (duration <= 3) unblockDistributionBuckets['1-3d'] += 1
      else if (duration <= 7) unblockDistributionBuckets['3-7d'] += 1
      else unblockDistributionBuckets['>7d'] += 1
    }
    const unblockDistribution = Object.entries(unblockDistributionBuckets).map(([bucket, count]) => ({ bucket, count }))

    const bottleneckRows = await db.execute(sql`
      select
        status,
        count(*)::int as count,
        avg(extract(epoch from (now() - coalesce(started_at, created_at))) / 86400.0) as avg_age
      from tasks
      where status not in ('done', 'archived')
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by status
    `)
    const statusAging: Record<string, { count: number; avgAge: number }> = {}
    for (const row of bottleneckRows as any[]) {
      statusAging[String(row.status)] = {
        count: toNumber(row.count),
        avgAge: Math.round(toNumber(row.avg_age) * 10) / 10,
      }
    }

    const blockEntriesRows = await db.execute(sql`
      select date_trunc('week', changed_at) as week_start, count(*)::int as count
      from task_status_history
      where to_status = 'blocked'
        and changed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and task_id in (${scopedTaskIdsSql})
      group by week_start
      order by week_start asc
    `)
    const blockedByWeek = (blockEntriesRows as any[]).map(row => ({
      date: toWeekKey(new Date(row.week_start)),
      count: toNumber(row.count),
    }))

    return normalizeBlockersHomeFields({
      currentlyBlocked: blockedTasks,
      blockedCount: blockedTasks.length,
      avgBlockDuration,
      medianUnblockDays,
      unblockSlaDays,
      unblockSlaHitRate,
      longOpenBreaches,
      unblockDistribution,
      unblockFunnel: {
        blockedTotal: blockDurations.length + blockedTasks.length,
        unblockedWithinSla,
        slaBreached: Math.max(0, blockDurations.length - unblockedWithinSla) + longOpenBreaches,
      },
      blockReasons,
      bottleneckStages: statusAging,
      blockedTrend: blockedByWeek,
      meta: buildMetricsMeta(period, {
        blockedNow: blockedTasks.length,
        blockEvents: blockDurations.length,
        reasons: blockReasons.length,
      }),
    })
  })

  // ==================== PREDICTABILITY ====================
  .get('/predictability', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const estimateLimit = parseQueryNumber(query.estimateLimit, 300, 50, 1000)
    const cacheTtl = parseQueryNumber(query.cacheTtl, 180, 30, 1800)

    const computePredictability = async () => {
        const since = daysAgo(period)
        const sinceIso = since.toISOString()
        const deliveryRows = await db.execute(sql`
      select
        d.id as delivery_id,
        d.title,
        d.status,
        d.start_date,
        d.end_date,
        count(t.id)::int as planned,
        count(t.id) filter (where t.status = 'done')::int as completed,
        count(t.id) filter (where d.start_date is not null and t.created_at > d.start_date)::int as scope_added_after_start
      from deliveries d
      left join tasks t on t.delivery_id = d.id
        and ${buildProductScopeSql('t.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
      where ${buildProductScopeSql('d.product_id', productIds)}
        and
        (
          d.created_at >= ${sinceIso}
          or d.status in ('initialized', 'in_progress', 'blocked', 'overdue')
        )
      group by d.id, d.title, d.status, d.start_date, d.end_date
      order by d.created_at desc
    `)
        const deliveryMetrics = (deliveryRows as any[]).map(row => {
          const planned = toNumber(row.planned)
          const completed = toNumber(row.completed)
          const scopeAddedAfterStart = toNumber(row.scope_added_after_start)
          let projectedEndDate: string | null = null
          let scheduleVarianceDays = 0
          if (row.start_date && planned > 0 && completed > 0) {
            const startMs = new Date(row.start_date).getTime()
            const elapsedWeeks = Math.max(1, (Date.now() - startMs) / (7 * 86400000))
            const completionPerWeek = completed / elapsedWeeks
            const remaining = Math.max(0, planned - completed)
            const projectedMs = Date.now() + (remaining / Math.max(completionPerWeek, 0.1)) * 7 * 86400000
            projectedEndDate = new Date(projectedMs).toISOString()
            if (row.end_date) {
              scheduleVarianceDays = Math.round(((projectedMs - new Date(row.end_date).getTime()) / 86400000) * 10) / 10
            }
          } else if (row.end_date) {
            projectedEndDate = new Date(row.end_date).toISOString()
          }
          const confidenceScore = Math.max(0, Math.min(100, Math.round(
            (planned > 0 ? (completed / planned) * 70 : 0) +
            (scopeAddedAfterStart === 0 ? 20 : Math.max(0, 20 - scopeAddedAfterStart * 2)) +
            (scheduleVarianceDays <= 0 ? 10 : Math.max(0, 10 - Math.abs(scheduleVarianceDays)))
          )))
          return {
            deliveryId: row.delivery_id as string,
            title: row.title as string,
            status: row.status as string,
            planned,
            completed,
            predictability: planned > 0 ? Math.round((completed / planned) * 100) : 0,
            projectedEndDate,
            scheduleVarianceDays,
            scopeAddedAfterStart,
            confidenceScore,
          }
        })

        const [createdBefore] = await db.execute(sql`
      select count(*)::int as value
      from tasks
      where created_at < ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)
        const [completedBefore] = await db.execute(sql`
      select count(*)::int as value
      from tasks
      where completed_at is not null
        and completed_at < ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)

        const createdByDayRows = await db.execute(sql`
      select date(created_at) as bucket, count(*)::int as value
      from tasks
      where created_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by bucket
    `)
        const completedByDayRows = await db.execute(sql`
      select date(completed_at) as bucket, count(*)::int as value
      from tasks
      where completed_at is not null
        and completed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by bucket
    `)
        const createdMap = new Map<string, number>()
        const completedMap = new Map<string, number>()
        for (const row of createdByDayRows as any[]) {
          createdMap.set(toDateKey(new Date(row.bucket)), toNumber(row.value))
        }
        for (const row of completedByDayRows as any[]) {
          completedMap.set(toDateKey(new Date(row.bucket)), toNumber(row.value))
        }

        const dailyBurnup: { date: string; cumulative: number; total: number }[] = []
        const dayStep = period > 60 ? 7 : 1
        let cumulativeTotal = toNumber((createdBefore as any)?.value)
        let cumulativeCompleted = toNumber((completedBefore as any)?.value)
        for (let i = period; i >= 0; i -= 1) {
          const day = daysAgo(i)
          const key = toDateKey(day)
          cumulativeTotal += createdMap.get(key) || 0
          cumulativeCompleted += completedMap.get(key) || 0
          dailyBurnup.push({
            date: key,
            cumulative: cumulativeCompleted,
            total: cumulativeTotal,
          })
        }
        const burnupData = dailyBurnup.filter((_, index) =>
          index === dailyBurnup.length - 1 || index % dayStep === 0
        )

        const latestBurnup = burnupData[burnupData.length - 1] || { cumulative: 0, total: 0 }
        const remainingScope = Math.max(0, latestBurnup.total - latestBurnup.cumulative)
        const weeklyCompletedSeries: number[] = []
        const completedByWeekMap = new Map<string, number>()
        for (const row of completedByDayRows as any[]) {
          const key = toWeekKey(new Date(row.bucket))
          completedByWeekMap.set(key, (completedByWeekMap.get(key) || 0) + toNumber(row.value))
        }
        for (const count of completedByWeekMap.values()) weeklyCompletedSeries.push(count)
        const avgDeparturePerWeek = Math.round(average(weeklyCompletedSeries) * 10) / 10
        const departureStd = stdDev(weeklyCompletedSeries)
        const weeksToComplete = avgDeparturePerWeek > 0 ? remainingScope / avgDeparturePerWeek : null
        const projectedCompletionDate = weeksToComplete !== null
          ? new Date(Date.now() + weeksToComplete * 7 * 86400000).toISOString()
          : null
        const p50Date = projectedCompletionDate
        const p85BufferWeeks = weeksToComplete !== null
          ? Math.max(1, (departureStd / Math.max(avgDeparturePerWeek, 0.1)) * 2)
          : null
        const p85Date = p85BufferWeeks !== null
          ? new Date(Date.now() + (weeksToComplete! + p85BufferWeeks) * 7 * 86400000).toISOString()
          : null
        const confidenceScore = Math.max(0, Math.min(100, Math.round(
          100 - (Math.min(100, (departureStd / Math.max(avgDeparturePerWeek, 1)) * 100))
        )))
        const confidenceBand = confidenceScore >= 75 ? 'high' : confidenceScore >= 45 ? 'medium' : 'low'

        const estimateRows = await db.execute(sql`
      select
        id as task_id,
        title,
        estimate_value as estimate,
        round(extract(epoch from (completed_at - started_at)) / 86400.0, 1) as actual_days
      from tasks
      where estimate_value is not null
        and completed_at is not null
        and started_at is not null
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      order by completed_at desc
      limit ${estimateLimit}
    `)
        const estimateData = (estimateRows as any[]).map(row => ({
          taskId: row.task_id as string,
          title: row.title as string,
          estimate: toNumber(row.estimate),
          actualDays: toNumber(row.actual_days),
        }))

        const [onTimeAgg] = await db.execute(sql`
      select
        count(*) filter (where completed_at is not null and due_at is not null and completed_at <= due_at)::int as on_time_count,
        count(*) filter (where completed_at is not null and due_at is not null)::int as due_completed_count,
        count(*) filter (
          where status = 'overdue'
            or (due_at is not null and completed_at is null and due_at < now())
        )::int as overdue_count
      from tasks
      where 1 = 1
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)
        const onTimeCount = toNumber((onTimeAgg as any)?.on_time_count)
        const dueCompletedCount = toNumber((onTimeAgg as any)?.due_completed_count)
        const overdueCount = toNumber((onTimeAgg as any)?.overdue_count)
        const onTimeRate = dueCompletedCount > 0
          ? Math.round((onTimeCount / dueCompletedCount) * 100)
          : 100

        const [scopeChangeRow] = await db.execute(sql`
      select count(*)::int as value
      from tasks t
      join deliveries d on d.id = t.delivery_id
      where d.start_date is not null
        and t.created_at > d.start_date
        and ${buildProductScopeSql('d.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
    `)
        const scopeChangeCount = toNumber((scopeChangeRow as any)?.value)
        const riskMatrix = deliveryMetrics.map((delivery) => ({
          deliveryId: delivery.deliveryId,
          title: delivery.title,
          varianceDays: delivery.scheduleVarianceDays,
          scopeChange: delivery.scopeAddedAfterStart,
          riskScore: Math.max(0, Math.round(Math.abs(delivery.scheduleVarianceDays) * 2 + delivery.scopeAddedAfterStart * 3)),
        }))

        return {
          deliveryMetrics, burnupData, estimateData,
          forecast: {
            projectedCompletionDate,
            p50Date,
            p85Date,
            confidenceScore,
            confidenceBand,
            remainingScope,
            avgDeparturePerWeek,
          },
          riskMatrix,
          onTimeRate, overdueCount, scopeChangeCount,
          avgPredictability: deliveryMetrics.length > 0 ? Math.round(deliveryMetrics.reduce((s, d) => s + d.predictability, 0) / deliveryMetrics.length) : 0,
          meta: buildMetricsMeta(period, {
            deliveries: deliveryMetrics.length,
            burnupPoints: burnupData.length,
            estimatePoints: estimateData.length,
            riskPoints: riskMatrix.length,
          }, { cacheTtl }),
        }
    }

    const payload = access.cacheProductId
      ? await withMetricsCache(
        { endpoint: 'predictability', productId: access.cacheProductId, period, extra: { estimateLimit } },
        cacheTtl,
        computePredictability,
      )
      : await computePredictability()

    return normalizePredictabilityHomeFields(payload)
  })

  // ==================== WORKLOAD ====================
  .get('/workload', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()
    const now = Date.now()
    const overloadWipThreshold = access.cacheProductId
      ? Number((await db.select({
        overloadWipThreshold: products.metricsOverloadWipThreshold,
      }).from(products).where(eq(products.id, access.cacheProductId)))[0]?.overloadWipThreshold ?? 5)
      : 5

    const memberRows = await db.execute(sql`
      with relevant_tasks as (
        select id, title, status, due_at, completed_at, created_at, owner_user_id, assignee_user_ids, reviewer_user_ids, owner_team_id, assignee_team_ids, reviewer_team_ids
        from tasks
        where ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
          and (status not in ('done', 'archived') or coalesce(completed_at, created_at) >= ${sinceIso})
      ),
      task_users as (
        select id, title, status, due_at, completed_at, owner_user_id as user_id
        from relevant_tasks
        where owner_user_id is not null
        union all
        select id, title, status, due_at, completed_at, unnest(assignee_user_ids) as user_id
        from relevant_tasks
        where assignee_user_ids is not null
        union all
        select rt.id, rt.title, rt.status, rt.due_at, rt.completed_at, otm.user_id as user_id
        from relevant_tasks rt
        inner join organization_team_members otm
          on otm.organization_team_id = rt.owner_team_id
        where rt.owner_team_id is not null
        union all
        select rt.id, rt.title, rt.status, rt.due_at, rt.completed_at, otm.user_id as user_id
        from relevant_tasks rt
        cross join lateral unnest(rt.assignee_team_ids) as assignee_team(team_id)
        inner join organization_team_members otm
          on otm.organization_team_id = assignee_team.team_id
        where rt.assignee_team_ids is not null
      ),
      task_stats as (
        select
          user_id,
          count(*)::int as total_tasks,
          count(*) filter (where status = 'done')::int as completed_count,
          count(*) filter (where status not in ('done', 'archived'))::int as wip_count,
          count(*) filter (
            where due_at is not null
              and completed_at is null
              and due_at < now()
              and status <> 'done'
          )::int as overdue_count
        from task_users
        group by user_id
      ),
      review_stats as (
        select user_id, count(*)::int as review_load
        from (
          select unnest(reviewer_user_ids) as user_id
          from relevant_tasks
          where status = 'in_review'
            and reviewer_user_ids is not null
          union all
          select otm.user_id
          from relevant_tasks rt
          cross join lateral unnest(rt.reviewer_team_ids) as reviewer_team(team_id)
          inner join organization_team_members otm
            on otm.organization_team_id = reviewer_team.team_id
          where rt.status = 'in_review'
            and rt.reviewer_team_ids is not null
        ) review_users
        group by user_id
      )
      select
        u.id,
        u.name,
        u.avatar,
        u.role,
        coalesce(ts.total_tasks, 0) as total_tasks,
        coalesce(ts.completed_count, 0) as completed_count,
        coalesce(ts.wip_count, 0) as wip_count,
        coalesce(ts.overdue_count, 0) as overdue_count,
        coalesce(rs.review_load, 0) as review_load
      from users u
      left join task_stats ts on ts.user_id = u.id
      left join review_stats rs on rs.user_id = u.id
      where coalesce(ts.total_tasks, 0) > 0
      order by coalesce(ts.wip_count, 0) desc, u.name asc
    `)

    const byStatusRows = await db.execute(sql`
      with relevant_tasks as (
        select status, owner_user_id, assignee_user_ids, owner_team_id, assignee_team_ids
        from tasks
        where ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
          and (status not in ('done', 'archived') or coalesce(completed_at, created_at) >= ${sinceIso})
      ),
      task_users as (
        select owner_user_id as user_id, status
        from relevant_tasks
        where owner_user_id is not null
        union all
        select unnest(assignee_user_ids) as user_id, status
        from relevant_tasks
        where assignee_user_ids is not null
        union all
        select otm.user_id as user_id, rt.status
        from relevant_tasks rt
        inner join organization_team_members otm
          on otm.organization_team_id = rt.owner_team_id
        where rt.owner_team_id is not null
        union all
        select otm.user_id as user_id, rt.status
        from relevant_tasks rt
        cross join lateral unnest(rt.assignee_team_ids) as assignee_team(team_id)
        inner join organization_team_members otm
          on otm.organization_team_id = assignee_team.team_id
        where rt.assignee_team_ids is not null
      )
      select user_id, status, count(*)::int as count
      from task_users
      group by user_id, status
    `)
    const byStatusMap = new Map<string, Record<string, number>>()
    for (const row of byStatusRows as any[]) {
      const userId = row.user_id as string
      const status = String(row.status)
      const count = toNumber(row.count)
      const current = byStatusMap.get(userId) || {}
      current[status] = count
      byStatusMap.set(userId, current)
    }

    const overdueRows = await db.execute(sql`
      with relevant_tasks as (
        select id, title, status, due_at, completed_at, created_at, owner_user_id, assignee_user_ids, owner_team_id, assignee_team_ids
        from tasks
        where ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
          and (status not in ('done', 'archived') or coalesce(completed_at, created_at) >= ${sinceIso})
      ),
      task_users as (
        select id, title, status, due_at, completed_at, owner_user_id as user_id
        from relevant_tasks
        where owner_user_id is not null
        union all
        select id, title, status, due_at, completed_at, unnest(assignee_user_ids) as user_id
        from relevant_tasks
        where assignee_user_ids is not null
        union all
        select rt.id, rt.title, rt.status, rt.due_at, rt.completed_at, otm.user_id as user_id
        from relevant_tasks rt
        inner join organization_team_members otm
          on otm.organization_team_id = rt.owner_team_id
        where rt.owner_team_id is not null
        union all
        select rt.id, rt.title, rt.status, rt.due_at, rt.completed_at, otm.user_id as user_id
        from relevant_tasks rt
        cross join lateral unnest(rt.assignee_team_ids) as assignee_team(team_id)
        inner join organization_team_members otm
          on otm.organization_team_id = assignee_team.team_id
        where rt.assignee_team_ids is not null
      )
      select user_id, id as task_id, title, due_at
      from task_users
      where due_at is not null
        and completed_at is null
        and due_at < now()
        and status <> 'done'
      order by due_at asc
    `)
    const overdueByUser = new Map<string, Array<{ taskId: string; title: string; dueAt: string; daysOverdue: number }>>()
    for (const row of overdueRows as any[]) {
      const userId = row.user_id as string
      const dueAt = new Date(row.due_at)
      const list = overdueByUser.get(userId) || []
      if (list.length < 20) {
        list.push({
          taskId: row.task_id as string,
          title: row.title as string,
          dueAt: dueAt.toISOString(),
          daysOverdue: Math.round(((now - dueAt.getTime()) / 86400000) * 10) / 10,
        })
      }
      overdueByUser.set(userId, list)
    }

    const memberWorkload = (memberRows as any[]).map(row => {
      const totalTasks = toNumber(row.total_tasks)
      const completedCount = toNumber(row.completed_count)
      const wipCount = toNumber(row.wip_count)
      const overdueCount = toNumber(row.overdue_count)
      const capacity = overloadWipThreshold
      const loadRatio = capacity > 0 ? Math.round((wipCount / capacity) * 100) / 100 : wipCount
      const buildLoad = Math.max(1, wipCount - toNumber(row.review_load))
      return {
        id: row.id as string,
        name: row.name as string,
        avatar: (row.avatar ?? null) as string | null,
        role: row.role as string,
        totalTasks,
        wipCount,
        completedCount,
        byStatus: byStatusMap.get(row.id as string) || {},
        reviewLoad: toNumber(row.review_load),
        overdueCount,
        overdueTasks: overdueByUser.get(row.id as string) || [],
        completionRate: totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0,
        capacity,
        loadRatio,
        reviewVsBuildRatio: Math.round((toNumber(row.review_load) / buildLoad) * 100) / 100,
      }
    })

    const overloaded = memberWorkload.filter(member => member.wipCount > overloadWipThreshold)
    const idle = memberWorkload.filter(member => member.wipCount === 0)
    const loadRatios = memberWorkload.map(member => member.loadRatio)
    const meanLoad = average(loadRatios)
    const loadBalanceIndex = meanLoad > 0
      ? Math.round((stdDev(loadRatios) / meanLoad) * 100)
      : 0

    return normalizeWorkloadHomeFields({
      memberWorkload,
      overloaded,
      idle,
      overloadThreshold: overloadWipThreshold,
      totalMembers: memberWorkload.length,
      loadBalanceIndex,
      meta: buildMetricsMeta(period, {
        members: memberWorkload.length,
        activeTasks: memberWorkload.reduce((sum, member) => sum + member.wipCount, 0),
        overdueTasks: memberWorkload.reduce((sum, member) => sum + member.overdueCount, 0),
      }),
    })
  })

  // ==================== DELIVERIES METRICS ====================
  .get('/deliveries-metrics', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 180, 30, 365)
    const cacheTtl = parseQueryNumber(query.cacheTtl, 180, 30, 1800)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()

    const computeDeliveryMetrics = async () => {
        const now = Date.now()
        const detailRows = await db.execute(sql`
      select
        d.id,
        d.title,
        d.status,
        d.start_date,
        d.end_date,
        count(t.id)::int as total_tasks,
        count(t.id) filter (where t.status = 'done')::int as completed,
        count(t.id) filter (where t.status = 'blocked')::int as blocked,
        count(t.id) filter (where d.start_date is not null and t.created_at > d.start_date)::int as scope_added_after_start
      from deliveries d
      left join tasks t on t.delivery_id = d.id
        and ${buildProductScopeSql('t.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
      where ${buildProductScopeSql('d.product_id', productIds)}
        and (
          d.created_at >= ${sinceIso}
          or d.status in ('initialized', 'in_progress', 'blocked', 'overdue')
        )
      group by d.id, d.title, d.status, d.start_date, d.end_date
      order by d.created_at desc
    `)

        const deliveryDetails = (detailRows as any[]).map(row => {
          const totalTasks = toNumber(row.total_tasks)
          const completed = toNumber(row.completed)
          const blocked = toNumber(row.blocked)
          const scopeAddedAfterStart = toNumber(row.scope_added_after_start)

          let velocity = 0
          if (row.start_date) {
            const startMs = new Date(row.start_date).getTime()
            const weeks = Math.max(1, (now - startMs) / (7 * 86400000))
            velocity = Math.round((completed / weeks) * 10) / 10
          }

          const daysRemaining = row.end_date
            ? Math.round(((new Date(row.end_date).getTime() - now) / 86400000) * 10) / 10
            : null
          const remaining = Math.max(0, totalTasks - completed)
          const projectedEndDate = velocity > 0
            ? new Date(now + (remaining / velocity) * 7 * 86400000).toISOString()
            : row.end_date
              ? new Date(row.end_date).toISOString()
              : null
          const scheduleVarianceDays = row.end_date && projectedEndDate
            ? Math.round(((new Date(projectedEndDate).getTime() - new Date(row.end_date).getTime()) / 86400000) * 10) / 10
            : 0

          const riskReasons: string[] = []
          if (scheduleVarianceDays > 7) riskReasons.push('Projected end exceeds planned end by >7 days')
          if (scopeAddedAfterStart > 0) riskReasons.push('Scope added after delivery start')
          if (blocked > 0) riskReasons.push('Blocked tasks present')
          if (riskReasons.length === 0) riskReasons.push('No major risk signals')
          const riskBadge =
            scheduleVarianceDays > 7 || blocked > 0 ? 'at_risk' :
              scheduleVarianceDays > 2 || scopeAddedAfterStart > 0 ? 'watch' :
                'on_track'

          return {
            id: row.id as string,
            title: row.title as string,
            status: row.status as string,
            startDate: row.start_date as string | null,
            endDate: row.end_date as string | null,
            projectedEndDate,
            scheduleVarianceDays,
            scopeAddedAfterStart,
            riskBadge,
            riskReasons,
            totalTasks,
            completed,
            blocked,
            progress: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
            velocity,
            daysRemaining,
            onTrack: riskBadge === 'on_track',
          }
        })

        const byStatus: Record<string, number> = {}
        for (const delivery of deliveryDetails) {
          byStatus[delivery.status] = (byStatus[delivery.status] || 0) + 1
        }

        const total = deliveryDetails.length
        const activeDeliveries = byStatus.in_progress || 0
        const avgProgress = total > 0
          ? Math.round(deliveryDetails.reduce((sum, d) => sum + d.progress, 0) / total)
          : 0
        const bubblePoints = deliveryDetails.map((delivery) => ({
          deliveryId: delivery.id,
          title: delivery.title,
          scopeChange: delivery.scopeAddedAfterStart,
          varianceDays: delivery.scheduleVarianceDays,
          totalTasks: delivery.totalTasks,
        }))

        return {
          deliveryDetails,
          byStatus,
          bubblePoints,
          activeDeliveries,
          avgProgress,
          total,
          meta: buildMetricsMeta(period, {
            deliveries: total,
            tasks: deliveryDetails.reduce((sum, delivery) => sum + delivery.totalTasks, 0),
            activeDeliveries,
          }, { cacheTtl }),
        }
    }

    const payload = access.cacheProductId
      ? await withMetricsCache(
        { endpoint: 'deliveries-metrics', productId: access.cacheProductId, period },
        cacheTtl,
        computeDeliveryMetrics,
      )
      : await computeDeliveryMetrics()

    return normalizeDeliveriesHomeFields(payload)
  })
