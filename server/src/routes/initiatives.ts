import { Elysia, t } from 'elysia'
import { db } from '../db'
import { initiatives, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

const initiativeBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  status: t.Optional(t.Union([
    t.Literal('planning'), t.Literal('active'),
    t.Literal('paused'), t.Literal('completed')
  ])),
  period: t.Optional(t.Nullable(t.String())),
  periodStart: t.Optional(t.Nullable(t.String())),
  periodEnd: t.Optional(t.Nullable(t.String())),
  leader: t.Optional(t.Nullable(t.String())),
  leaderAvatar: t.Optional(t.Nullable(t.String())),
  priority: t.Optional(t.Union([
    t.Literal('low'), t.Literal('medium'),
    t.Literal('high')
  ])),
  product: t.Optional(t.String()),
})

async function getUserFromHeader(jwtVerify: any, headers: Record<string, string | undefined>) {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const payload = await jwtVerify(token)
  if (!payload?.userId) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId as string) })
  return user || null
}

export const initiativeRoutes = new Elysia({ prefix: '/api/initiatives' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/initiatives
  .get('/', async ({ query }) => {
    const product = query.product
    return db.query.initiatives.findMany({
      where: product ? eq(initiatives.product, product) : undefined,
      orderBy: (items, { desc }) => [desc(items.createdAt)],
    })
  })

  // POST /api/initiatives
  .post('/', async ({ body, jwt, headers }) => {
    const [initiative] = await db.insert(initiatives).values(body).returning()
    const user = await getUserFromHeader(jwt.verify, headers)
    logActivity({
      product: initiative!.product,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'created',
      entityType: 'initiative',
      entityId: initiative!.id,
      entityTitle: initiative!.title,
    })
    return initiative
  }, { body: initiativeBody })

  // GET /api/initiatives/:id
  .get('/:id', async ({ params: { id }, set }) => {
    const initiative = await db.query.initiatives.findFirst({
      where: eq(initiatives.id, id),
    })
    if (!initiative) { set.status = 404; return { error: 'Initiative not found' } }
    return initiative
  })

  // PUT /api/initiatives/:id
  .put('/:id', async ({ params: { id }, body, set, jwt, headers }) => {
    // Fetch old version for change tracking
    const old = await db.query.initiatives.findFirst({ where: eq(initiatives.id, id) })
    if (!old) { set.status = 404; return { error: 'Initiative not found' } }

    const [updated] = await db.update(initiatives)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(initiatives.id, id))
      .returning()

    const user = await getUserFromHeader(jwt.verify, headers)
    const changes = computeChanges(old, body, ['title', 'status', 'priority', 'leader', 'description', 'periodStart', 'periodEnd'])
    if (changes.length > 0) {
      logActivity({
        product: updated!.product,
        userName: user?.name || 'System',
        userAvatar: user?.avatar,
        userId: user?.id,
        action: 'updated',
        entityType: 'initiative',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }
    return updated
  }, { body: t.Partial(initiativeBody) })

  // DELETE /api/initiatives/:id
  .delete('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const [deleted] = await db.delete(initiatives)
      .where(eq(initiatives.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Initiative not found' } }

    const user = await getUserFromHeader(jwt.verify, headers)
    logActivity({
      product: deleted.product,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'deleted',
      entityType: 'initiative',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })
    return { success: true }
  })
