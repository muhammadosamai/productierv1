import { Elysia, t } from 'elysia'
import { db } from '../db'
import { servers } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { badRequest, forbidden, notFound, unauthorized } from '../lib/apiErrors'
import { requireAuth, requireProductPageAction } from '../lib/authz'
import { computeChanges, logActivity } from '../lib/logActivity'

const serverBody = t.Object({
  name: t.String({ minLength: 1 }),
  environment: t.Union([t.Literal('dev'), t.Literal('stage'), t.Literal('prod')]),
  host: t.Optional(t.Nullable(t.String())),
  port: t.Optional(t.Nullable(t.Number())),
  protocol: t.Optional(t.Nullable(t.String())),
  region: t.Optional(t.Nullable(t.String())),
  provider: t.Optional(t.Nullable(t.String())),
  instanceId: t.Optional(t.Nullable(t.String())),
  productId: t.String(),
})

export const serverRoutes = new Elysia({ prefix: '/api/servers' })
  .use(authPlugin)

  .get('/', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return unauthorized(set)

    const productId = query.productId
    if (!productId) {
      return badRequest(set, 'productId query parameter is required')
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'integrations',
      action: 'read',
    })
    if (!access) return set.status === 401 ? unauthorized(set) : forbidden(set)

    const conditions = [eq(servers.productId, productId)]
    if (query.environment) {
      const env = query.environment as 'dev' | 'stage' | 'prod'
      conditions.push(eq(servers.environment, env))
    }

    const results = await db.query.servers.findMany({
      where: and(...conditions),
      orderBy: (s, { asc }) => [asc(s.name)],
    })
    return results
  })

  .post('/', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return unauthorized(set)

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: body.productId,
      page: 'integrations',
      action: 'create',
    })
    if (!access) return set.status === 401 ? unauthorized(set) : forbidden(set)

    const [server] = await db.insert(servers).values({
      name: body.name,
      environment: body.environment,
      host: body.host || null,
      port: body.port || null,
      protocol: body.protocol || null,
      region: body.region || null,
      provider: body.provider || null,
      instanceId: body.instanceId || null,
      productId: body.productId,
    }).returning()

    logActivity({
      productId: body.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'server',
      entityId: server!.id,
      entityTitle: server!.name,
      changes: [
        { field: 'environment', from: null, to: server?.environment || null },
        { field: 'host', from: null, to: server?.host || null },
        { field: 'provider', from: null, to: server?.provider || null },
      ],
      routePathOverride: '/integrations',
    })

    return server
  }, { body: serverBody })

  .put('/:id', async ({ params: { id }, body, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return unauthorized(set)

    const existing = await db.query.servers.findFirst({
      where: eq(servers.id, id),
      columns: {
        id: true,
        productId: true,
        name: true,
        environment: true,
        host: true,
        port: true,
        protocol: true,
        region: true,
        provider: true,
        instanceId: true,
      },
    })
    if (!existing) return notFound(set, 'Server not found')

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'integrations',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? unauthorized(set) : forbidden(set)

    const [updated] = await db.update(servers)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(servers.id, id))
      .returning()
    if (!updated) return notFound(set, 'Server not found')

    const changes = computeChanges(existing, body, [
      'name',
      'environment',
      'host',
      'port',
      'protocol',
      'region',
      'provider',
      'instanceId',
    ])
    if (changes.length > 0) {
      logActivity({
        productId: existing.productId,
        userName: access.user.name,
        userAvatar: access.user.avatar,
        userId: access.user.id,
        action: 'updated',
        entityType: 'server',
        entityId: existing.id,
        entityTitle: updated.name,
        changes,
        routePathOverride: '/integrations',
      })
    }

    return updated
  }, { body: t.Partial(serverBody) })

  .delete('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return unauthorized(set)

    const existing = await db.query.servers.findFirst({
      where: eq(servers.id, id),
      columns: { id: true, productId: true, name: true, environment: true },
    })
    if (!existing) return notFound(set, 'Server not found')

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'integrations',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? unauthorized(set) : forbidden(set)

    const [deleted] = await db.delete(servers)
      .where(eq(servers.id, id))
      .returning()
    if (!deleted) return notFound(set, 'Server not found')

    logActivity({
      productId: existing.productId,
      userName: access.user.name,
      userAvatar: access.user.avatar,
      userId: access.user.id,
      action: 'deleted',
      entityType: 'server',
      entityId: existing.id,
      entityTitle: existing.name,
      changes: [
        { field: 'environment', from: existing.environment, to: null },
      ],
      routePathOverride: '/integrations',
    })

    return { success: true }
  })
