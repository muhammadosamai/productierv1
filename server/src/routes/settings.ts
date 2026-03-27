import { Elysia, t } from 'elysia'
import { db } from '../db'
import { userSettings, users } from '../db/schema'
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

export const settingsRoutes = new Elysia({ prefix: '/api/settings' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/settings/:key — Get a single setting by key
  .get('/:key', async ({ params: { key }, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const setting = await db.query.userSettings.findFirst({
      where: and(
        eq(userSettings.userId, user.id),
        eq(userSettings.key, key),
      ),
    })

    return { key, value: setting?.value ?? null }
  })

  // GET /api/settings — Get all settings for the current user
  .get('/', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const settings = await db.select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))

    const result: Record<string, any> = {}
    for (const s of settings) {
      result[s.key] = s.value
    }
    return result
  })

  // PUT /api/settings/:key — Upsert a setting
  .put('/:key', async ({ params: { key }, body, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const existing = await db.query.userSettings.findFirst({
      where: and(
        eq(userSettings.userId, user.id),
        eq(userSettings.key, key),
      ),
    })

    if (existing) {
      await db.update(userSettings)
        .set({ value: body.value, updatedAt: new Date() })
        .where(eq(userSettings.id, existing.id))
    } else {
      await db.insert(userSettings).values({
        userId: user.id,
        key,
        value: body.value,
      })
    }

    return { key, value: body.value }
  }, {
    body: t.Object({
      value: t.Any(),
    }),
  })
