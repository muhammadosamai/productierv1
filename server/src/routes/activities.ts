import { Elysia, t } from 'elysia'
import { db } from '../db'
import { activities } from '../db/schema'
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireProductPageAction } from '../lib/authz'
import {
  decodeCursor,
  encodeCursor,
  isLegacyListMode,
  parseListQuery,
  parseSort,
  toListEnvelope,
} from '../lib/listContract'

export const activityRoutes = new Elysia({ prefix: '/api/activities' })
  .use(authPlugin)
  // GET /api/activities?productId=X&entityId=Y&entityIds=a,b,c&entityType=task&limit=50
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
      page: 'overview',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const entityId = query.entityId
    const entityIds = query.entityIds // comma-separated list of IDs
    const entityType = query.entityType
    const userId = query.userId
    const parsedList = parseListQuery(query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 200,
    })
    const legacyMode = isLegacyListMode(parsedList)
    const sort = parseSort(parsedList.sort, ['createdAt'] as const, {
      field: 'createdAt',
      direction: 'desc',
      raw: 'createdAt:desc',
    })
    const cursor = legacyMode ? null : decodeCursor(parsedList.cursor)
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const qTerm = q.length > 0 ? q : null

    const conditions = []
    if (productId) conditions.push(eq(activities.productId, productId))
    if (userId) conditions.push(eq(activities.userId, userId))

    // Support multiple entity IDs (e.g. story + all its child task IDs)
    if (entityIds) {
      const ids = entityIds.split(',').filter(Boolean)
      if (ids.length > 0) {
        conditions.push(inArray(activities.entityId, ids))
      }
    } else if (entityId) {
      conditions.push(eq(activities.entityId, entityId))
    }

    if (entityType) conditions.push(eq(activities.entityType, entityType))
    if (qTerm) {
      conditions.push(or(
        ilike(activities.entityTitle, `%${qTerm}%`),
        ilike(activities.userName, `%${qTerm}%`),
      )!)
    }
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt)
      if (!Number.isNaN(cursorDate.getTime())) {
        if (sort.direction === 'desc') {
          conditions.push(sql`(${activities.createdAt} < ${cursorDate} OR (${activities.id} < ${cursor.id} AND ${activities.createdAt} = ${cursorDate}))`)
        } else {
          conditions.push(sql`(${activities.createdAt} > ${cursorDate} OR (${activities.id} > ${cursor.id} AND ${activities.createdAt} = ${cursorDate}))`)
        }
      }
    }

    const fetchLimit = legacyMode ? parsedList.limit : parsedList.limit + 1
    const results = await db.query.activities.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: sort.direction === 'desc'
        ? [desc(activities.createdAt), desc(activities.id)]
        : [asc(activities.createdAt), asc(activities.id)],
      limit: fetchLimit,
    })

    // Minimize actor data exposure in activity streams.
    const masked = results.map(item => ({
      ...item,
      userId: null,
    }))

    if (legacyMode) {
      return masked
    }

    const hasMore = masked.length > parsedList.limit
    const items = hasMore ? masked.slice(0, parsedList.limit) : masked
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor({
        id: items[items.length - 1]!.id,
        createdAt: new Date(items[items.length - 1]!.createdAt).toISOString(),
      })
      : null

    let totalApprox: number | undefined
    if (!parsedList.cursor) {
      const [countRow] = await db.select({
        value: sql<number>`count(*)::int`,
      }).from(activities).where(conditions.length > 0 ? and(...conditions.filter(c => c !== undefined)) : undefined)
      totalApprox = Number(countRow?.value ?? 0)
    }

    return toListEnvelope({
      items,
      hasMore,
      nextCursor,
      totalApprox,
    })
  })

  // POST /api/activities
  .post('/', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: body.productId,
      page: 'overview',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [activity] = await db.insert(activities).values({
      productId: body.productId,
      userId: user.id,
      userName: user.name,
      userAvatar: user.avatar || null,
      action: body.action,
      entityType: body.entityType,
      entityId: body.entityId || null,
      entityTitle: body.entityTitle,
      changes: body.changes || null,
    }).returning()
    return activity
  }, {
    body: t.Object({
      productId: t.String(),
      action: t.String(),
      entityType: t.String(),
      entityId: t.Optional(t.Nullable(t.String())),
      entityTitle: t.String(),
      changes: t.Optional(t.Nullable(t.Array(t.Object({
        field: t.String(),
        from: t.Nullable(t.String()),
        to: t.Nullable(t.String()),
      })))),
    }),
  })
