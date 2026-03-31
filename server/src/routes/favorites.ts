import { Elysia, t } from 'elysia'
import { db } from '../db'
import { favorites } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireProductPageAction } from '../lib/authz'
import { logActivity, type ActivityEntityType } from '../lib/logActivity'
import { badRequest } from '../lib/apiErrors'
import { isUuid } from '../lib/productResolver'

const FAVORITE_ACTIVITY_ENTITY_TYPES = new Set<ActivityEntityType>([
  'task',
  'story',
  'initiative',
  'delivery',
  'release',
  'issue',
  'test_cycle',
  'test_cycle_issue',
  'feature_request',
  'consumer_feedback',
  'wiki_asset',
  'wiki_revision',
])

function resolveFavoriteEntityType(rawEntityType: string): ActivityEntityType | null {
  const normalized = rawEntityType.trim().toLowerCase()
  return FAVORITE_ACTIVITY_ENTITY_TYPES.has(normalized as ActivityEntityType)
    ? normalized as ActivityEntityType
    : null
}

function resolveFavoriteRoutePath(entityType: string, entityId: string): string | null {
  const routes: Partial<Record<ActivityEntityType, string>> = {
    task: '/tasks',
    story: '/stories',
    initiative: '/initiatives',
    delivery: '/deliveries',
    release: '/releases',
    issue: '/issues',
    test_cycle: '/test-cycles',
    test_cycle_issue: '/issues',
    feature_request: '/feedback/feature-requests',
    consumer_feedback: '/feedback/consumer-feedback',
    wiki_asset: '/wiki',
    wiki_revision: '/wiki',
  }
  const prefix = routes[entityType as ActivityEntityType]
  if (!prefix) return null
  return `${prefix}/${entityId}`
}

export const favoriteRoutes = new Elysia({ prefix: '/api/favorites' })
  .use(authPlugin)

  // GET /api/favorites?productId=X
  .get('/', async ({ query, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = query.productId
    if (!productId) { set.status = 400; return { error: 'productId is required' } }
    if (!isUuid(productId)) return badRequest(set, 'Invalid productId')
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId,
      page: 'home',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    return db.select().from(favorites).where(
      and(
        eq(favorites.userId, user.id),
        eq(favorites.productId, productId),
      )
    )
  }, {
    query: t.Object({
      productId: t.String(),
    }),
  })

  // POST /api/favorites
  .post('/', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!isUuid(body.entityId)) return badRequest(set, 'Invalid entityId')
    if (!isUuid(body.productId)) return badRequest(set, 'Invalid productId')
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: body.productId,
      page: 'home',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    // Check if already exists
    const existing = await db.select().from(favorites).where(
      and(
        eq(favorites.userId, user.id),
        eq(favorites.entityType, body.entityType),
        eq(favorites.entityId, body.entityId),
      )
    )

    if (existing.length > 0) {
      return existing[0]
    }

    const [created] = await db.insert(favorites).values({
      userId: user.id,
      entityType: body.entityType,
      entityId: body.entityId,
      productId: body.productId,
    }).returning()

    const activityEntityType = resolveFavoriteEntityType(body.entityType)
    if (activityEntityType) {
      logActivity({
        productId: body.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: activityEntityType,
        entityId: body.entityId,
        entityTitle: `${body.entityType} ${body.entityId}`,
        changes: [{ field: 'favoriteState', from: null, to: 'starred' }],
        routePathOverride: resolveFavoriteRoutePath(activityEntityType, body.entityId),
        subjectUserIds: [user.id],
      })
    }

    return created
  }, {
    body: t.Object({
      entityType: t.String(),
      entityId: t.String(),
      productId: t.String(),
    }),
  })

  // DELETE /api/favorites/:entityType/:entityId
  .delete('/:entityType/:entityId', async ({ params, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!isUuid(params.entityId)) return badRequest(set, 'Invalid entityId')
    const existing = await db.query.favorites.findFirst({
      where: and(
        eq(favorites.userId, user.id),
        eq(favorites.entityType, params.entityType),
        eq(favorites.entityId, params.entityId),
      ),
      columns: { id: true, productId: true, entityType: true, entityId: true },
    })
    if (!existing) return { success: true }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: existing.productId,
      page: 'home',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    await db.delete(favorites).where(
      and(
        eq(favorites.userId, user.id),
        eq(favorites.entityType, params.entityType),
        eq(favorites.entityId, params.entityId),
      )
    )

    const activityEntityType = resolveFavoriteEntityType(existing.entityType)
    if (activityEntityType) {
      logActivity({
        productId: existing.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: activityEntityType,
        entityId: existing.entityId,
        entityTitle: `${existing.entityType} ${existing.entityId}`,
        changes: [{ field: 'favoriteState', from: 'starred', to: null }],
        routePathOverride: resolveFavoriteRoutePath(activityEntityType, existing.entityId),
        subjectUserIds: [user.id],
      })
    }

    return { success: true }
  })
