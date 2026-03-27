import { Elysia, t } from 'elysia'
import { db } from '../db'
import { favorites, users } from '../db/schema'
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

export const favoriteRoutes = new Elysia({ prefix: '/api/favorites' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/favorites?productId=X
  .get('/', async ({ query, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const productId = query.productId
    if (!productId) { set.status = 400; return { error: 'productId is required' } }

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
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

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
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    await db.delete(favorites).where(
      and(
        eq(favorites.userId, user.id),
        eq(favorites.entityType, params.entityType),
        eq(favorites.entityId, params.entityId),
      )
    )

    return { success: true }
  })
