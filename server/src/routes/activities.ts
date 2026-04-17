import { Elysia, t } from 'elysia'
import { db } from '../db'
import { activities } from '../db/schema'
import { eq, desc, and, inArray } from 'drizzle-orm'
import { resolveProductRef } from '../lib/resolveProductRef'

export const activityRoutes = new Elysia({ prefix: '/api/activities' })
  // GET /api/activities?product=X&entityId=Y&entityIds=a,b,c&entityType=task&limit=50
  .get('/', async ({ query }) => {
    const product = query.product
    const entityId = query.entityId
    const entityIds = query.entityIds // comma-separated list of IDs
    const entityType = query.entityType
    const userId = query.userId
    const limit = parseInt(query.limit || '50', 10)

    const conditions = []
    if (product) {
      const pr = await resolveProductRef(product)
      if (!pr.ok) return []
      conditions.push(eq(activities.productId, pr.product.id))
    }
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

    return db.query.activities.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(activities.createdAt)],
      limit,
    })
  })

  // POST /api/activities
  .post('/', async ({ body, set }) => {
    const pr = await resolveProductRef((body as { product: string }).product)
    if (!pr.ok) {
      set.status = 400
      return { error: 'Unknown product' }
    }
    const b = body as {
      userId?: string | null
      userName: string
      userAvatar?: string | null
      action: string
      entityType: string
      entityId?: string | null
      entityTitle: string
      changes?: { field: string; from: string | null; to: string | null }[] | null
    }
    const [activity] = await db.insert(activities).values({
      ...b,
      product: pr.product.name,
      productId: pr.product.id,
    }).returning()
    return activity
  }, {
    body: t.Object({
      product: t.String(),
      userId: t.Optional(t.Nullable(t.String())),
      userName: t.String(),
      userAvatar: t.Optional(t.Nullable(t.String())),
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
