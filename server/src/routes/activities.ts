import { Elysia, t } from 'elysia'
import { db } from '../db'
import { activities } from '../db/schema'
import { eq, desc, and, inArray } from 'drizzle-orm'
import { resolveProductByScope, whereDenormProductMatches } from '../lib/resolveProductScope'

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
    if (product?.trim()) {
      const scopeRow = await resolveProductByScope(product.trim())
      if (scopeRow) conditions.push(whereDenormProductMatches(activities.product, scopeRow))
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
  .post('/', async ({ body }) => {
    const [activity] = await db.insert(activities).values(body).returning()
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
