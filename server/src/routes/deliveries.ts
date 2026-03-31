import { Elysia, t } from 'elysia'
import { db } from '../db'
import { deliveries, deliveryInitiatives, releaseDeliveries, releases, tasks } from '../db/schema'
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { logActivity, computeChanges } from '../lib/logActivity'
import { authPlugin } from '../plugins/auth'
import { badRequest, forbidden, notFound, unauthorized } from '../lib/apiErrors'
import { getEffectivePagePermissionForUser, isGlobalAdminRole, requireAuth, requireProductPageAction } from '../lib/authz'
import { publicUserColumns } from '../lib/serializers'
import { invalidateMetricsForProduct } from '../lib/metricsCache'
import { resolveProductIdInput } from '../lib/productResolver'
import {
  decodeCursor,
  encodeCursor,
  isLegacyListMode,
  parseListQuery,
  parseSort,
  toListEnvelope,
} from '../lib/listContract'
import { removeSearchDocument, upsertDeliverySearchDocument } from '../lib/search/searchIndex'
import { deliverySelfViewCondition, isDeliverySelfVisible } from '../lib/selfViewScope'

const deliveryBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  status: t.Optional(t.Union([
    t.Literal('initialized'), t.Literal('in_progress'), t.Literal('overdue'),
    t.Literal('blocked'), t.Literal('completed'), t.Literal('archived')
  ])),
  startDate: t.Optional(t.Nullable(t.String())),
  endDate: t.Optional(t.Nullable(t.String())),
  productId: t.Optional(t.String()),
  product: t.Optional(t.String()),
  initiativeIds: t.Optional(t.Array(t.String())),
})

type DeliveryHealthConfidence = 'low' | 'medium' | 'high'

function buildDeliveryHealthSummary(input: {
  startDate: string | null
  endDate: string | null
  totalTasks: number
  completedTasks: number
  blockedTasks: number
  overdueTasks: number
  scopeAddedAfterStart?: number
  now?: Date
}) {
  const now = input.now ?? new Date()
  const startAt = input.startDate ? new Date(input.startDate) : null
  const plannedEndAt = input.endDate ? new Date(input.endDate) : null
  const totalTasks = Math.max(0, Number(input.totalTasks || 0))
  const completedTasks = Math.max(0, Number(input.completedTasks || 0))
  const blockedTasks = Math.max(0, Number(input.blockedTasks || 0))
  const overdueTasks = Math.max(0, Number(input.overdueTasks || 0))
  const scopeAddedAfterStart = Math.max(0, Number(input.scopeAddedAfterStart || 0))

  const remainingTasks = Math.max(totalTasks - completedTasks, 0)
  const elapsedDays = startAt
    ? Math.max(1, Math.ceil((now.getTime() - startAt.getTime()) / 86400000))
    : null
  const completedPerDay = elapsedDays && completedTasks > 0 ? completedTasks / elapsedDays : 0
  const projectedDaysRemaining = completedPerDay > 0
    ? Math.ceil(remainingTasks / completedPerDay)
    : null

  const projectedEndDate = remainingTasks === 0
    ? now.toISOString()
    : projectedDaysRemaining !== null
      ? new Date(now.getTime() + projectedDaysRemaining * 86400000).toISOString()
      : null

  const scheduleVarianceDays = projectedEndDate && plannedEndAt
    ? Math.round((new Date(projectedEndDate).getTime() - plannedEndAt.getTime()) / 86400000)
    : 0

  const riskReasons: string[] = []
  if (blockedTasks > 0) riskReasons.push(`${blockedTasks} blocked task${blockedTasks === 1 ? '' : 's'}`)
  if (overdueTasks > 0) riskReasons.push(`${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'}`)
  if (scheduleVarianceDays > 0) riskReasons.push(`${scheduleVarianceDays} day schedule slip`)
  if (scopeAddedAfterStart > 0) riskReasons.push(`${scopeAddedAfterStart} scope changes after start`)

  let confidenceBand: DeliveryHealthConfidence = 'high'
  if (riskReasons.length >= 3 || scheduleVarianceDays > 7 || blockedTasks >= 3 || overdueTasks >= 3) {
    confidenceBand = 'low'
  } else if (riskReasons.length > 0) {
    confidenceBand = 'medium'
  }

  const onTrack = blockedTasks === 0 && overdueTasks === 0 && scheduleVarianceDays <= 0
  return {
    blockedTasks,
    overdueTasks,
    scopeAddedAfterStart,
    projectedEndDate,
    scheduleVarianceDays,
    confidenceBand,
    riskReasons,
    onTrack,
  }
}

export const deliveryRoutes = new Elysia({ prefix: '/api/deliveries' })
  .use(authPlugin)

  // GET /api/deliveries?productId=X
  .get('/', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return unauthorized(set)

    const productId = await resolveProductIdInput((query as any).productId || (query as any).product)
    if (!productId) {
      return badRequest(set, 'productId query parameter is required')
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'deliveries',
      action: 'read',
    })
    if (!access) return set.status === 401 ? unauthorized(set) : forbidden(set)
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'deliveries')

    const parsedList = parseListQuery(query as Record<string, unknown>, {
      defaultLimit: 30,
      maxLimit: 100,
    })
    const legacyMode = isLegacyListMode(parsedList)
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const qTerm = q.length > 0 ? q : null
    const sort = parseSort(parsedList.sort, ['createdAt', 'updatedAt', 'title'] as const, {
      field: 'createdAt',
      direction: 'desc',
      raw: 'createdAt:desc',
    })
    const cursor = legacyMode ? null : decodeCursor(parsedList.cursor)

    const conditions = [eq(deliveries.productId, productId)]
    if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly) {
      conditions.push(deliverySelfViewCondition(access.user.id))
    }
    if (qTerm) {
      conditions.push(or(
        ilike(deliveries.title, `%${qTerm}%`),
        ilike(deliveries.description, `%${qTerm}%`),
      )!)
    }
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt)
      if (!Number.isNaN(cursorDate.getTime())) {
        if (sort.field === 'updatedAt') {
          if (sort.direction === 'desc') {
            conditions.push(sql`(${deliveries.updatedAt} < ${cursorDate} OR (${deliveries.updatedAt} = ${cursorDate} AND ${deliveries.id} < ${cursor.id}))`)
          } else {
            conditions.push(sql`(${deliveries.updatedAt} > ${cursorDate} OR (${deliveries.updatedAt} = ${cursorDate} AND ${deliveries.id} > ${cursor.id}))`)
          }
        } else if (sort.direction === 'desc') {
          conditions.push(sql`(${deliveries.createdAt} < ${cursorDate} OR (${deliveries.createdAt} = ${cursorDate} AND ${deliveries.id} < ${cursor.id}))`)
        } else {
          conditions.push(sql`(${deliveries.createdAt} > ${cursorDate} OR (${deliveries.createdAt} = ${cursorDate} AND ${deliveries.id} > ${cursor.id}))`)
        }
      }
    }

    const orderField = sort.field === 'updatedAt'
      ? deliveries.updatedAt
      : sort.field === 'title'
        ? deliveries.title
        : deliveries.createdAt
    const baseLimit = legacyMode ? 100 : parsedList.limit
    const rows = await db.query.deliveries.findMany({
      where: and(...conditions),
      orderBy: sort.direction === 'desc'
        ? [desc(orderField as any), desc(deliveries.id)]
        : [asc(orderField as any), asc(deliveries.id)],
      limit: legacyMode ? baseLimit : baseLimit + 1,
      with: {
        createdByUser: {
          columns: publicUserColumns,
        },
        deliveryInitiatives: {
          with: {
            initiative: {
              columns: { id: true, title: true, status: true },
            },
          },
        },
      },
    })

    const hasMore = !legacyMode && rows.length > baseLimit
    const resultRows = hasMore ? rows.slice(0, baseLimit) : rows
    const deliveryIds = resultRows.map(row => row.id)

    const nowIso = new Date().toISOString()
    const taskCountsRows = deliveryIds.length > 0
      ? await db.select({
        deliveryId: tasks.deliveryId,
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
        blocked: sql<number>`count(*) filter (where ${tasks.status} = 'blocked' or ${tasks.blockedReason} is not null)::int`,
        overdue: sql<number>`count(*) filter (where ${tasks.status} not in ('done', 'archived') and ${tasks.dueAt} is not null and ${tasks.dueAt} < ${nowIso})::int`,
      }).from(tasks)
        .where(inArray(tasks.deliveryId, deliveryIds))
        .groupBy(tasks.deliveryId)
      : []
    const taskCountMap = new Map<string, { total: number; completed: number; blocked: number; overdue: number }>()
    for (const row of taskCountsRows) {
      if (!row.deliveryId) continue
      taskCountMap.set(row.deliveryId, {
        total: Number(row.total ?? 0),
        completed: Number(row.completed ?? 0),
        blocked: Number(row.blocked ?? 0),
        overdue: Number(row.overdue ?? 0),
      })
    }

    const releaseRows = deliveryIds.length > 0
      ? await db.select({
        deliveryId: releaseDeliveries.deliveryId,
        releaseId: releases.id,
        title: releases.title,
        status: releases.status,
        version: releases.version,
      }).from(releaseDeliveries)
        .innerJoin(releases, eq(releases.id, releaseDeliveries.releaseId))
        .where(inArray(releaseDeliveries.deliveryId, deliveryIds))
        .orderBy(desc(releases.createdAt))
      : []
    const linkedReleaseMap = new Map<string, Array<{ id: string; title: string; status: string; version: string | null }>>()
    for (const row of releaseRows) {
      const list = linkedReleaseMap.get(row.deliveryId) || []
      list.push({
        id: row.releaseId,
        title: row.title,
        status: row.status,
        version: row.version,
      })
      linkedReleaseMap.set(row.deliveryId, list)
    }

    const enriched = resultRows.map((row) => {
      const counts = taskCountMap.get(row.id) || { total: 0, completed: 0, blocked: 0, overdue: 0 }
      const healthSummary = buildDeliveryHealthSummary({
        startDate: row.startDate,
        endDate: row.endDate,
        totalTasks: counts.total,
        completedTasks: counts.completed,
        blockedTasks: counts.blocked,
        overdueTasks: counts.overdue,
      })
      return {
        ...row,
        initiatives: row.deliveryInitiatives.map(di => di.initiative),
        deliveryInitiatives: undefined,
        linkedReleases: linkedReleaseMap.get(row.id) || [],
        totalTasks: counts.total,
        completedTasks: counts.completed,
        progress: counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0,
        healthSummary,
      }
    })

    if (legacyMode) {
      return enriched
    }

    const nextCursor = hasMore && resultRows.length > 0
      ? encodeCursor({
        id: resultRows[resultRows.length - 1]!.id,
        createdAt: new Date(
          sort.field === 'updatedAt'
            ? resultRows[resultRows.length - 1]!.updatedAt
            : resultRows[resultRows.length - 1]!.createdAt,
        ).toISOString(),
      })
      : null

    let totalApprox: number | undefined
    if (!parsedList.cursor) {
      const [countRow] = await db.select({
        value: sql<number>`count(*)::int`,
      }).from(deliveries).where(and(
        eq(deliveries.productId, productId),
        ...(!isGlobalAdminRole(access.user.role) && permission.selfViewOnly
          ? [deliverySelfViewCondition(access.user.id)]
          : []),
        ...(qTerm
          ? [or(
            ilike(deliveries.title, `%${qTerm}%`),
            ilike(deliveries.description, `%${qTerm}%`),
          )!]
          : []),
      ))
      totalApprox = Number(countRow?.value ?? 0)
    }

    return toListEnvelope({
      items: enriched,
      hasMore,
      nextCursor,
      totalApprox,
    })
  })

  // GET /api/deliveries/:id
  .get('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return unauthorized(set)

    const existing = await db.query.deliveries.findFirst({
      where: eq(deliveries.id, id),
      columns: { id: true, productId: true, createdByUserId: true },
    })
    if (!existing) return notFound(set, 'Delivery not found')

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'deliveries',
      action: 'read',
    })
    if (!access) return set.status === 401 ? unauthorized(set) : forbidden(set)
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'deliveries')
    if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly && !isDeliverySelfVisible(access.user.id, existing)) {
      return notFound(set, 'Delivery not found')
    }

    const delivery = await db.query.deliveries.findFirst({
      where: eq(deliveries.id, id),
      with: {
        createdByUser: {
          columns: publicUserColumns,
        },
        deliveryInitiatives: {
          with: {
            initiative: {
              columns: { id: true, title: true, status: true },
            },
          },
        },
        tasks: {
          with: {
            createdByUser: {
              columns: publicUserColumns,
            },
            story: {
              columns: { id: true, title: true },
            },
            comments: true,
          },
          orderBy: (t, { asc }) => [asc(t.createdAt)],
        },
      },
    })
    if (!delivery) return notFound(set, 'Delivery not found')
    const linkedReleases = await db.select({
      id: releases.id,
      title: releases.title,
      status: releases.status,
      version: releases.version,
    }).from(releaseDeliveries)
      .innerJoin(releases, eq(releases.id, releaseDeliveries.releaseId))
      .where(eq(releaseDeliveries.deliveryId, id))
      .orderBy(desc(releases.createdAt))

    const nowIso = new Date().toISOString()
    const blockedTasks = delivery.tasks.filter((task) =>
      task.status === 'blocked' || Boolean(task.blockedReason),
    ).length
    const overdueTasks = delivery.tasks.filter((task) =>
      task.status !== 'done' &&
      task.status !== 'archived' &&
      task.dueAt &&
      new Date(task.dueAt).toISOString() < nowIso,
    ).length
    const scopeAddedAfterStart = delivery.startDate
      ? delivery.tasks.filter((task) => {
        if (!task.createdAt) return false
        return new Date(task.createdAt).getTime() > new Date(delivery.startDate!).getTime()
      }).length
      : 0
    const completedTasks = delivery.tasks.filter(t => t.status === 'done').length
    const healthSummary = buildDeliveryHealthSummary({
      startDate: delivery.startDate,
      endDate: delivery.endDate,
      totalTasks: delivery.tasks.length,
      completedTasks,
      blockedTasks,
      overdueTasks,
      scopeAddedAfterStart,
    })
    return {
      ...delivery,
      initiatives: delivery.deliveryInitiatives.map(di => di.initiative),
      deliveryInitiatives: undefined,
      linkedReleases,
      totalTasks: delivery.tasks.length,
      completedTasks,
      progress: delivery.tasks.length > 0
        ? Math.round((completedTasks / delivery.tasks.length) * 100)
        : 0,
      healthSummary,
    }
  })

  // POST /api/deliveries
  .post('/', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return unauthorized(set)

    const { initiativeIds, ...deliveryData } = body
    const productId = await resolveProductIdInput(deliveryData.productId || (deliveryData as any).product)
    if (!productId) {
      return badRequest(set, 'productId is required')
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'deliveries',
      action: 'create',
    })
    if (!access) return set.status === 401 ? unauthorized(set) : forbidden(set)

    const [countResult] = await db.select({ total: count() }).from(deliveries).where(eq(deliveries.productId, productId))
    const nextNumber = (countResult?.total || 0) + 1
    const numberedTitle = `#${nextNumber} ${deliveryData.title}`

    const { product: _product, ...restDeliveryData } = deliveryData as any
    const [delivery] = await db.insert(deliveries).values({
      ...restDeliveryData,
      productId,
      title: numberedTitle,
      status: deliveryData.status ?? 'initialized',
      createdByUserId: user.id,
    }).returning()

    if (initiativeIds && initiativeIds.length > 0) {
      await db.insert(deliveryInitiatives).values(
        initiativeIds.map(initId => ({
          deliveryId: delivery!.id,
          initiativeId: initId,
        }))
      )
    }

    logActivity({
      productId: delivery!.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'delivery',
      entityId: delivery!.id,
      entityTitle: delivery!.title,
    })
    await upsertDeliverySearchDocument(delivery!.id)
    await invalidateMetricsForProduct(delivery!.productId)
    return delivery
  }, { body: deliveryBody })

  // PUT /api/deliveries/:id
  .put('/:id', async ({ params: { id }, body, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return unauthorized(set)

    const old = await db.query.deliveries.findFirst({ where: eq(deliveries.id, id) })
    if (!old) return notFound(set, 'Delivery not found')

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: old.productId,
      page: 'deliveries',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? unauthorized(set) : forbidden(set)

    const { initiativeIds, ...deliveryData } = body
    const { product: _product, productId: _productId, ...restDeliveryData } = deliveryData as any
    const [updated] = await db.update(deliveries)
      .set({ ...restDeliveryData, updatedAt: new Date() })
      .where(eq(deliveries.id, id))
      .returning()

    if (initiativeIds !== undefined) {
      await db.delete(deliveryInitiatives).where(eq(deliveryInitiatives.deliveryId, id))
      if (initiativeIds.length > 0) {
        await db.insert(deliveryInitiatives).values(
          initiativeIds.map(initId => ({
            deliveryId: id,
            initiativeId: initId,
          }))
        )
      }
    }

    const changes = computeChanges(old, deliveryData, ['title', 'status', 'description', 'startDate', 'endDate'])
    if (changes.length > 0) {
      logActivity({
        productId: updated!.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'delivery',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }
    await upsertDeliverySearchDocument(updated!.id)
    await invalidateMetricsForProduct(updated!.productId)
    return updated
  }, { body: t.Partial(deliveryBody) })

  // DELETE /api/deliveries/:id
  .delete('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return unauthorized(set)

    const existing = await db.query.deliveries.findFirst({
      where: eq(deliveries.id, id),
      columns: { id: true, productId: true },
    })
    if (!existing) return notFound(set, 'Delivery not found')

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'deliveries',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? unauthorized(set) : forbidden(set)

    const [deleted] = await db.delete(deliveries)
      .where(eq(deliveries.id, id))
      .returning()
    if (!deleted) return notFound(set, 'Delivery not found')

    logActivity({
      productId: deleted.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'delivery',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })
    await removeSearchDocument('delivery', deleted.id)
    await invalidateMetricsForProduct(deleted.productId)
    return { success: true }
  })
