import { Elysia, t } from 'elysia'
import { db } from '../db'
import {
  deliveries,
  deliveryInitiatives,
  initiativeMembers,
  initiativeTeams,
  initiatives,
  organizationTeams,
  productMembers,
  products,
  stories,
  tasks,
} from '../db/schema'
import { and, eq, inArray, or } from 'drizzle-orm'
import { logActivity, computeChanges } from '../lib/logActivity'
import { authPlugin } from '../plugins/auth'
import { getEffectivePagePermissionForUser, isGlobalAdminRole, requireAuth, requireProductPageAction } from '../lib/authz'
import { invalidateMetricsForProduct } from '../lib/metricsCache'
import { publicUserColumns } from '../lib/serializers'
import { removeSearchDocument, upsertInitiativeSearchDocument } from '../lib/search/searchIndex'
import { resolveUserTeamIdsForProduct } from '../lib/assignmentTargets'
import {
  initiativeSelfViewCondition,
  isInitiativeSelfVisible,
} from '../lib/selfViewScope'

const initiativeBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  status: t.Optional(t.Union([
    t.Literal('planning'), t.Literal('active'),
    t.Literal('paused'), t.Literal('completed'), t.Literal('archived')
  ])),
  period: t.Optional(t.Nullable(t.String())),
  periodStart: t.Optional(t.Nullable(t.String())),
  periodEnd: t.Optional(t.Nullable(t.String())),
  leaderUserId: t.Optional(t.Nullable(t.String())),
  memberUserIds: t.Optional(t.Array(t.String())),
  teamIds: t.Optional(t.Array(t.String())),
  priority: t.Optional(t.Union([
    t.Literal('low'), t.Literal('medium'),
    t.Literal('high'), t.Literal('critical')
  ])),
  productId: t.Optional(t.String()),
})

const DAY_MS = 24 * 60 * 60 * 1000
type InitiativeAssignmentWriter = Pick<typeof db, 'delete' | 'insert'>

function normalizeIdList(values?: Array<string | null | undefined> | null): string[] {
  const deduped = (values || [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0)
  return [...new Set(deduped)]
}

async function validateInitiativeAssignments(input: {
  productId: string
  memberUserIds?: Array<string | null | undefined> | null
  teamIds?: Array<string | null | undefined> | null
}): Promise<{
  ok: boolean
  status?: number
  error?: string
  memberUserIds: string[]
  teamIds: string[]
}> {
  const memberUserIds = normalizeIdList(input.memberUserIds)
  const teamIds = normalizeIdList(input.teamIds)

  if (memberUserIds.length > 0) {
    const memberRows = await db.query.productMembers.findMany({
      where: and(
        eq(productMembers.productId, input.productId),
        inArray(productMembers.userId, memberUserIds),
      ),
      columns: { userId: true },
    })
    if (memberRows.length !== memberUserIds.length) {
      return {
        ok: false,
        status: 400,
        error: 'Assigned members must belong to this product',
        memberUserIds,
        teamIds,
      }
    }
  }

  if (teamIds.length > 0) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, input.productId),
      columns: { organizationId: true },
    })
    if (!product?.organizationId) {
      return {
        ok: false,
        status: 400,
        error: 'Assigned teams require an organization-scoped product',
        memberUserIds,
        teamIds,
      }
    }
    const teamRows = await db.query.organizationTeams.findMany({
      where: and(
        eq(organizationTeams.organizationId, product.organizationId),
        inArray(organizationTeams.id, teamIds),
      ),
      columns: { id: true },
    })
    if (teamRows.length !== teamIds.length) {
      return {
        ok: false,
        status: 400,
        error: 'Assigned teams must belong to the product organization',
        memberUserIds,
        teamIds,
      }
    }
  }

  return { ok: true, memberUserIds, teamIds }
}

async function syncInitiativeAssignments(
  tx: InitiativeAssignmentWriter,
  input: {
    initiativeId: string
    actorUserId: string
    memberUserIds?: string[]
    teamIds?: string[]
  },
) {
  if (input.memberUserIds !== undefined) {
    await tx.delete(initiativeMembers).where(eq(initiativeMembers.initiativeId, input.initiativeId))
    if (input.memberUserIds.length > 0) {
      await tx.insert(initiativeMembers).values(
        input.memberUserIds.map((userId) => ({
          initiativeId: input.initiativeId,
          userId,
          assignedByUserId: input.actorUserId,
        })),
      ).onConflictDoNothing()
    }
  }

  if (input.teamIds !== undefined) {
    await tx.delete(initiativeTeams).where(eq(initiativeTeams.initiativeId, input.initiativeId))
    if (input.teamIds.length > 0) {
      await tx.insert(initiativeTeams).values(
        input.teamIds.map((organizationTeamId) => ({
          initiativeId: input.initiativeId,
          organizationTeamId,
          assignedByUserId: input.actorUserId,
        })),
      ).onConflictDoNothing()
    }
  }
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysInclusive(start: Date, end: Date): number {
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1)
}

async function fetchInitiativeWithDetails(id: string) {
  return db.query.initiatives.findFirst({
    where: eq(initiatives.id, id),
    with: {
      leaderUser: { columns: publicUserColumns },
      members: {
        with: {
          user: { columns: publicUserColumns },
        },
      },
      teams: {
        with: {
          team: {
            columns: {
              id: true,
              name: true,
              key: true,
              description: true,
              leadUserId: true,
              organizationId: true,
            },
          },
        },
      },
    },
  })
}

export const initiativeRoutes = new Elysia({ prefix: '/api/initiatives' })
  .use(authPlugin)

  // GET /api/initiatives
  .get('/', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = query.productId
    if (!productId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'initiatives',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'initiatives')
    const selfVisibleTeamIds = !isGlobalAdminRole(access.user.role) && permission.selfViewOnly
      ? await resolveUserTeamIdsForProduct(productId, access.user.id)
      : []

    const pagedFlag = String((query as Record<string, unknown>).paged ?? '').toLowerCase()
    const paged = pagedFlag === '1' || pagedFlag === 'true'
    const requestedLimit = Number.parseInt(String((query as Record<string, unknown>).limit ?? '50'), 10)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 50
    const requestedOffset = Number.parseInt(String((query as Record<string, unknown>).cursor ?? '0'), 10)
    const offset = Number.isFinite(requestedOffset) && requestedOffset > 0
      ? requestedOffset
      : 0

    const rows = await db.query.initiatives.findMany({
      where: and(
        eq(initiatives.productId, productId),
        ...(!isGlobalAdminRole(access.user.role) && permission.selfViewOnly
          ? [initiativeSelfViewCondition(access.user.id, selfVisibleTeamIds)]
          : []),
      ),
      orderBy: (items, { desc }) => [desc(items.createdAt)],
      limit: paged ? limit + 1 : undefined,
      offset: paged ? offset : undefined,
      with: {
        leaderUser: { columns: publicUserColumns },
      },
    })

    if (!paged) return rows

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    return {
      items,
      nextCursor: hasMore ? String(offset + items.length) : null,
      hasMore,
      totalApprox: offset + items.length + (hasMore ? 1 : 0),
    }
  })

  // POST /api/initiatives
  .post('/', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = body.productId
    if (!productId) {
      set.status = 400
      return { error: 'productId is required' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'initiatives',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const assignmentValidation = await validateInitiativeAssignments({
      productId,
      memberUserIds: body.memberUserIds,
      teamIds: body.teamIds,
    })
    if (!assignmentValidation.ok) {
      set.status = assignmentValidation.status || 400
      return { error: assignmentValidation.error || 'Invalid initiative assignments' }
    }

    const leaderUserId = body.leaderUserId || null
    const payload = {
      title: body.title,
      description: body.description || null,
      status: body.status || 'planning',
      period: body.period || null,
      periodStart: body.periodStart || null,
      periodEnd: body.periodEnd || null,
      leaderUserId,
      priority: body.priority || 'medium',
      productId,
    }
    const initiative = await db.transaction(async (tx) => {
      const [created] = await tx.insert(initiatives).values(payload).returning()
      if (!created) return null
      await syncInitiativeAssignments(tx, {
        initiativeId: created.id,
        actorUserId: access.user.id,
        memberUserIds: assignmentValidation.memberUserIds,
        teamIds: assignmentValidation.teamIds,
      })
      return created
    })
    if (!initiative) {
      set.status = 500
      return { error: 'Failed to create initiative' }
    }

    logActivity({
      productId: initiative.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'initiative',
      entityId: initiative.id,
      entityTitle: initiative.title,
    })
    await upsertInitiativeSearchDocument(initiative.id)
    await invalidateMetricsForProduct(initiative.productId)
    const created = await fetchInitiativeWithDetails(initiative.id)
    return created || initiative
  }, { body: initiativeBody })

  // GET /api/initiatives/:id/insights
  .get('/:id/insights', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const initiative = await fetchInitiativeWithDetails(id)
    if (!initiative) { set.status = 404; return { error: 'Initiative not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: initiative.productId,
      page: 'initiatives',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'initiatives')
    const selfVisibleTeamIds = !isGlobalAdminRole(access.user.role) && permission.selfViewOnly
      ? await resolveUserTeamIdsForProduct(initiative.productId, access.user.id)
      : []
    if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly && !isInitiativeSelfVisible(access.user.id, initiative, selfVisibleTeamIds)) {
      set.status = 404
      return { error: 'Initiative not found' }
    }

    const linkedStories = await db.query.stories.findMany({
      where: or(
        eq(stories.initiativeId, initiative.id),
        eq(stories.initiative, initiative.title),
      ),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    })

    const storyIds = linkedStories.map((s) => s.id)
    const taskFromStories = storyIds.length > 0
      ? await db.query.tasks.findMany({
        where: inArray(tasks.storyId, storyIds),
      })
      : []
    const taskFromInitiative = await db.query.tasks.findMany({
      where: eq(tasks.initiativeId, initiative.id),
    })

    const allTasksMap = new Map<string, typeof taskFromStories[number]>()
    for (const item of taskFromStories) allTasksMap.set(item.id, item)
    for (const item of taskFromInitiative) allTasksMap.set(item.id, item)
    const linkedTasks = Array.from(allTasksMap.values())

    const links = await db.query.deliveryInitiatives.findMany({
      where: eq(deliveryInitiatives.initiativeId, initiative.id),
      with: {
        delivery: true,
      },
      orderBy: (di, { desc }) => [desc(di.id)],
    })

    const linkedDeliveries = links
      .map((link) => link.delivery)
      .filter((delivery): delivery is NonNullable<typeof delivery> => Boolean(delivery))

    const now = new Date()
    const days14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const overdueTasks = linkedTasks.filter((task) => {
      if (!task.dueAt) return false
      if (task.status === 'done' || task.status === 'archived') return false
      return new Date(task.dueAt) < now
    })

    const completedRecentTasks = linkedTasks.filter((task) => {
      if (!task.completedAt) return false
      return new Date(task.completedAt) >= days14
    })

    const storyByStatus = linkedStories.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})

    const taskByStatus = linkedTasks.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})

    const tasksDone = linkedTasks.filter((task) => task.status === 'done').length
    const storiesDone = linkedStories.filter((story) => story.status === 'completed').length
    const tasksBlocked = linkedTasks.filter((task) => task.status === 'blocked').length

    const deliveriesWithProgress = linkedDeliveries.map((delivery) => {
      const deliveryTasks = linkedTasks.filter((task) => task.deliveryId === delivery.id)
      const doneTasks = deliveryTasks.filter((task) => task.status === 'done').length
      const totalTasks = deliveryTasks.length
      const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
      return {
        id: delivery.id,
        title: delivery.title,
        status: delivery.status,
        startDate: delivery.startDate,
        endDate: delivery.endDate,
        totalTasks,
        doneTasks,
        progress,
      }
    })

    const periodStartDate = toDateOrNull(initiative.periodStart)
    const periodEndDate = toDateOrNull(initiative.periodEnd)
    let totalDays: number | null = null
    let elapsedDays: number | null = null
    let remainingDays: number | null = null
    let scheduleProgressPercent: number | null = null
    if (periodStartDate && periodEndDate && periodEndDate.getTime() >= periodStartDate.getTime()) {
      totalDays = daysInclusive(periodStartDate, periodEndDate)
      if (now.getTime() < periodStartDate.getTime()) {
        elapsedDays = 0
      } else if (now.getTime() > periodEndDate.getTime()) {
        elapsedDays = totalDays
      } else {
        elapsedDays = Math.min(totalDays, daysInclusive(periodStartDate, now))
      }
      remainingDays = Math.max(totalDays - elapsedDays, 0)
      scheduleProgressPercent = totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : null
    }
    const timelineMilestones = [...deliveriesWithProgress].sort((left, right) => {
      const leftDate = toDateOrNull(left.startDate || left.endDate)
      const rightDate = toDateOrNull(right.startDate || right.endDate)
      if (!leftDate && !rightDate) return left.title.localeCompare(right.title)
      if (!leftDate) return 1
      if (!rightDate) return -1
      return leftDate.getTime() - rightDate.getTime()
    })
    const isOverdue = Boolean(
      periodEndDate
      && now.getTime() > periodEndDate.getTime()
      && initiative.status !== 'completed'
      && initiative.status !== 'archived',
    )

    return {
      initiative: {
        id: initiative.id,
        title: initiative.title,
        status: initiative.status,
        period: initiative.period,
        periodStart: initiative.periodStart,
        periodEnd: initiative.periodEnd,
      },
      overview: {
        storiesCount: linkedStories.length,
        storiesCompleted: storiesDone,
        tasksCount: linkedTasks.length,
        tasksCompleted: tasksDone,
        tasksBlocked,
        tasksOverdue: overdueTasks.length,
        deliveriesCount: linkedDeliveries.length,
        deliveriesCompleted: linkedDeliveries.filter((d) => d.status === 'completed').length,
      },
      deliveryProgress: {
        deliveries: deliveriesWithProgress,
        averageProgress: deliveriesWithProgress.length > 0
          ? Math.round(deliveriesWithProgress.reduce((sum, item) => sum + item.progress, 0) / deliveriesWithProgress.length)
          : 0,
      },
      metrics: {
        storyByStatus,
        taskByStatus,
        completionRate: linkedTasks.length > 0 ? Math.round((tasksDone / linkedTasks.length) * 100) : 0,
        throughput14d: completedRecentTasks.length,
      },
      timeline: {
        period: {
          label: initiative.period,
          startDate: initiative.periodStart,
          endDate: initiative.periodEnd,
          totalDays,
          elapsedDays,
          remainingDays,
          scheduleProgressPercent,
          isOverdue,
        },
        milestones: timelineMilestones,
      },
    }
  })

  // GET /api/initiatives/:id
  .get('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const initiative = await fetchInitiativeWithDetails(id)
    if (!initiative) { set.status = 404; return { error: 'Initiative not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: initiative.productId,
      page: 'initiatives',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'initiatives')
    const selfVisibleTeamIds = !isGlobalAdminRole(access.user.role) && permission.selfViewOnly
      ? await resolveUserTeamIdsForProduct(initiative.productId, access.user.id)
      : []
    if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly && !isInitiativeSelfVisible(access.user.id, initiative, selfVisibleTeamIds)) {
      set.status = 404
      return { error: 'Initiative not found' }
    }
    return initiative
  })

  // PUT /api/initiatives/:id
  .put('/:id', async ({ params: { id }, body, set, jwt, headers }) => {
    // Fetch old version for change tracking
    const old = await db.query.initiatives.findFirst({ where: eq(initiatives.id, id) })
    if (!old) { set.status = 404; return { error: 'Initiative not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: old.productId,
      page: 'initiatives',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const user = access.user

    const shouldSyncMembers = body.memberUserIds !== undefined
    const shouldSyncTeams = body.teamIds !== undefined
    let assignmentValidation: Awaited<ReturnType<typeof validateInitiativeAssignments>> | null = null
    if (shouldSyncMembers || shouldSyncTeams) {
      assignmentValidation = await validateInitiativeAssignments({
        productId: old.productId,
        memberUserIds: body.memberUserIds,
        teamIds: body.teamIds,
      })
      if (!assignmentValidation.ok) {
        set.status = assignmentValidation.status || 400
        return { error: assignmentValidation.error || 'Invalid initiative assignments' }
      }
    }

    const leaderUserId = body.leaderUserId || null
    const {
      productId: _productId,
      memberUserIds: _memberUserIds,
      teamIds: _teamIds,
      ...rest
    } = body
    const updated = await db.transaction(async (tx) => {
      const [updatedRow] = await tx.update(initiatives)
        .set({
          ...rest,
          leaderUserId: body.leaderUserId !== undefined ? leaderUserId : undefined,
          updatedAt: new Date(),
        })
        .where(eq(initiatives.id, id))
        .returning()
      if (!updatedRow) return null
      if (assignmentValidation) {
        await syncInitiativeAssignments(tx, {
          initiativeId: updatedRow.id,
          actorUserId: user.id,
          memberUserIds: shouldSyncMembers ? assignmentValidation.memberUserIds : undefined,
          teamIds: shouldSyncTeams ? assignmentValidation.teamIds : undefined,
        })
      }
      return updatedRow
    })
    if (!updated) { set.status = 404; return { error: 'Initiative not found' } }

    const changes = computeChanges(old, body, ['title', 'status', 'priority', 'leaderUserId', 'description', 'periodStart', 'periodEnd'])
    if (changes.length > 0) {
      logActivity({
        productId: updated.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'initiative',
        entityId: updated.id,
        entityTitle: updated.title,
        changes,
      })
    }
    await upsertInitiativeSearchDocument(updated.id)
    await invalidateMetricsForProduct(updated.productId)
    const full = await fetchInitiativeWithDetails(updated.id)
    return full || updated
  }, { body: t.Partial(initiativeBody) })

  // DELETE /api/initiatives/:id
  .delete('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const existing = await db.query.initiatives.findFirst({
      where: eq(initiatives.id, id),
      columns: { id: true, productId: true },
    })
    if (!existing) { set.status = 404; return { error: 'Initiative not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'initiatives',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const user = access.user

    const [deleted] = await db.delete(initiatives)
      .where(eq(initiatives.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Initiative not found' } }

    logActivity({
      productId: deleted.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'initiative',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })
    await removeSearchDocument('initiative', deleted.id)
    await invalidateMetricsForProduct(deleted.productId)
    return { success: true }
  })
