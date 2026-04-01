import { Elysia, t } from 'elysia'
import { db } from '../db'
import { formConfigs, customFieldValues, users } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { getDefaultConfig } from '../lib/builtInFields'

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

export const formConfigRoutes = new Elysia({ prefix: '/api/form-configs' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/form-configs/:product/:entityType
  .get('/:product/:entityType', async ({ params: { product, entityType } }) => {
    const existing = await db.query.formConfigs.findFirst({
      where: and(
        eq(formConfigs.product, product),
        eq(formConfigs.entityType, entityType),
      ),
    })

    if (existing) return existing.config

    // Return default config
    return getDefaultConfig(entityType)
  })

  // PUT /api/form-configs/:product/:entityType
  .put('/:product/:entityType', async ({ params: { product, entityType }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    // Only admin roles can save form configs
    if (!['super_admin', 'admin', 'product_admin'].includes(user.role)) {
      set.status = 403
      return { error: 'Only admins can modify form configurations' }
    }

    // Upsert
    const existing = await db.query.formConfigs.findFirst({
      where: and(
        eq(formConfigs.product, product),
        eq(formConfigs.entityType, entityType),
      ),
    })

    if (existing) {
      const [updated] = await db.update(formConfigs)
        .set({ config: body.config, updatedByUserId: user.id })
        .where(eq(formConfigs.id, existing.id))
        .returning()
      return updated!.config
    }

    const [created] = await db.insert(formConfigs).values({
      product,
      entityType,
      config: body.config,
      updatedByUserId: user.id,
    }).returning()

    return created!.config
  }, {
    body: t.Object({
      config: t.Any(),
    }),
  })

// Custom field values routes
export const customFieldRoutes = new Elysia({ prefix: '/api/custom-fields' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/custom-fields/:entityType/:entityId
  .get('/:entityType/:entityId', async ({ params: { entityType, entityId } }) => {
    const rows = await db.select().from(customFieldValues)
      .where(and(
        eq(customFieldValues.entityType, entityType),
        eq(customFieldValues.entityId, entityId),
      ))

    const values: Record<string, any> = {}
    for (const row of rows) {
      values[row.fieldKey] = row.value
    }
    return values
  })

  // PUT /api/custom-fields/:entityType/:entityId
  .put('/:entityType/:entityId', async ({ params: { entityType, entityId }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const values = body.values as Record<string, any>

    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined) {
        // Delete
        await db.delete(customFieldValues)
          .where(and(
            eq(customFieldValues.entityType, entityType),
            eq(customFieldValues.entityId, entityId),
            eq(customFieldValues.fieldKey, key),
          ))
      } else {
        // Upsert
        const existing = await db.query.customFieldValues.findFirst({
          where: and(
            eq(customFieldValues.entityType, entityType),
            eq(customFieldValues.entityId, entityId),
            eq(customFieldValues.fieldKey, key),
          ),
        })

        if (existing) {
          await db.update(customFieldValues)
            .set({ value })
            .where(eq(customFieldValues.id, existing.id))
        } else {
          await db.insert(customFieldValues).values({
            entityType,
            entityId,
            fieldKey: key,
            value,
          })
        }
      }
    }

    return { success: true }
  }, {
    body: t.Object({
      values: t.Any(),
    }),
  })
