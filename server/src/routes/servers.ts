import { Elysia, t } from 'elysia'
import { db } from '../db'
import { servers, users } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

async function getUserFromHeader(jwtVerify: any, headers: Record<string, string | undefined>) {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const payload = await jwtVerify(token)
  if (!payload?.userId) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId as string) })
  return user || null
}

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
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/servers?product=X&environment=Y
  .get('/', async ({ query }) => {
    const conditions = []
    if (query.product) conditions.push(eq(servers.productId, query.product))
    if (query.environment) {
      const env = query.environment as 'dev' | 'stage' | 'prod'
      conditions.push(eq(servers.environment, env))
    }

    const results = await db.query.servers.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (s, { asc }) => [asc(s.name)],
    })
    return results
  })

  // POST /api/servers
  .post('/', async ({ body, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) return { error: 'Unauthorized' }

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

    return server
  }, { body: serverBody })

  // PUT /api/servers/:id
  .put('/:id', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) return { error: 'Unauthorized' }

    const [updated] = await db.update(servers)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(servers.id, id))
      .returning()

    if (!updated) { set.status = 404; return { error: 'Server not found' } }
    return updated
  }, { body: t.Partial(serverBody) })

  // DELETE /api/servers/:id
  .delete('/:id', async ({ params: { id }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) return { error: 'Unauthorized' }

    const [deleted] = await db.delete(servers)
      .where(eq(servers.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Server not found' } }
    return { success: true }
  })
