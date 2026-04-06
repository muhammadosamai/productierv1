import { Elysia, t } from 'elysia'
import { db } from '../db'
import { deliveries, deliveryInitiatives, tasks, users, initiatives } from '../db/schema'
import { eq, count } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'
import { sendNotificationIfEnabled } from '../services/notificationEmails'

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

const deliveryBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  status: t.Optional(t.Union([
    t.Literal('initialized'), t.Literal('in_progress'), t.Literal('overdue'),
    t.Literal('blocked'), t.Literal('completed'), t.Literal('archived')
  ])),
  startDate: t.Optional(t.Nullable(t.String())),
  endDate: t.Optional(t.Nullable(t.String())),
  productId: t.Optional(t.String()),
  initiativeIds: t.Optional(t.Array(t.String())),
})

export const deliveryRoutes = new Elysia({ prefix: '/api/deliveries' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/deliveries?product=X
  .get('/', async ({ query }) => {
    const product = query.product
    const results = await db.query.deliveries.findMany({
      where: product ? eq(deliveries.productId, product) : undefined,
      orderBy: (d, { desc }) => [desc(d.createdAt)],
      with: {
        createdByUser: {
          columns: { id: true, name: true, email: true, avatar: true },
        },
        deliveryInitiatives: {
          with: {
            initiative: {
              columns: { id: true, title: true, status: true },
            },
          },
        },
      },
    })

    // Enrich with task counts
    const enriched = await Promise.all(results.map(async (d) => {
      const taskList = await db.query.tasks.findMany({
        where: eq(tasks.deliveryId, d.id),
        columns: { id: true, status: true },
      })
      return {
        ...d,
        initiatives: d.deliveryInitiatives.map(di => di.initiative),
        deliveryInitiatives: undefined,
        totalTasks: taskList.length,
        completedTasks: taskList.filter(t => t.status === 'done').length,
        progress: taskList.length > 0
          ? Math.round((taskList.filter(t => t.status === 'done').length / taskList.length) * 100)
          : 0,
      }
    }))
    return enriched
  })

  // GET /api/deliveries/:id
  .get('/:id', async ({ params: { id }, set }) => {
    const delivery = await db.query.deliveries.findFirst({
      where: eq(deliveries.id, id),
      with: {
        createdByUser: {
          columns: { id: true, name: true, email: true, avatar: true },
        },
        deliveryInitiatives: {
          with: {
            initiative: {
              columns: { id: true, title: true, status: true },
            },
          },
        },
        tasks: {
          with: {
            createdByUser: {
              columns: { id: true, name: true, email: true, avatar: true },
            },
            story: {
              columns: { id: true, title: true },
            },
            comments: true,
          },
          orderBy: (t, { asc }) => [asc(t.createdAt)],
        },
      },
    })
    if (!delivery) { set.status = 404; return { error: 'Delivery not found' } }
    return {
      ...delivery,
      initiatives: delivery.deliveryInitiatives.map(di => di.initiative),
      deliveryInitiatives: undefined,
      totalTasks: delivery.tasks.length,
      completedTasks: delivery.tasks.filter(t => t.status === 'done').length,
      progress: delivery.tasks.length > 0
        ? Math.round((delivery.tasks.filter(t => t.status === 'done').length / delivery.tasks.length) * 100)
        : 0,
    }
  })

  // POST /api/deliveries
  .post('/', async ({ body, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) return { error: 'Unauthorized' }

    const { initiativeIds, ...deliveryData } = body

    // Auto-prepend #N counter to the title
    const productId = deliveryData.productId || ''
    const [countResult] = await db.select({ total: count() }).from(deliveries).where(eq(deliveries.productId, productId))
    const nextNumber = (countResult?.total || 0) + 1
    const numberedTitle = `#${nextNumber} ${deliveryData.title}`

    const [delivery] = await db.insert(deliveries).values({
      ...deliveryData,
      title: numberedTitle,
      status: deliveryData.status ?? 'initialized',
      createdByUserId: user.id,
    }).returning()

    // Insert join table rows for initiatives
    if (initiativeIds && initiativeIds.length > 0) {
      await db.insert(deliveryInitiatives).values(
        initiativeIds.map(initId => ({
          deliveryId: delivery!.id,
          initiativeId: initId,
        }))
      )
    }

    logActivity({
      product: delivery!.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'delivery',
      entityId: delivery!.id,
      entityTitle: delivery!.title,
    })
    return delivery
  }, { body: deliveryBody })

  // PUT /api/deliveries/:id
  .put('/:id', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const old = await db.query.deliveries.findFirst({ where: eq(deliveries.id, id) })
    if (!old) { set.status = 404; return { error: 'Delivery not found' } }

    const { initiativeIds, ...deliveryData } = body
    const [updated] = await db.update(deliveries)
      .set({ ...deliveryData, updatedAt: new Date() })
      .where(eq(deliveries.id, id))
      .returning()

    // Update initiative links if provided
    if (initiativeIds !== undefined) {
      await db.delete(deliveryInitiatives).where(eq(deliveryInitiatives.deliveryId, id))
      if (initiativeIds.length > 0) {
        await db.insert(deliveryInitiatives).values(
          initiativeIds.map(initId => ({
            deliveryId: id,
            initiativeId: initId,
          }))
        )
      }
    }

    const user = await getUserFromHeader(jwtInstance.verify, headers)
    const changes = computeChanges(old, deliveryData, ['title', 'status', 'description', 'startDate', 'endDate'])
    if (changes.length > 0) {
      logActivity({
        product: updated!.productId,
        userName: user?.name || 'System',
        userAvatar: user?.avatar,
        userId: user?.id,
        action: 'updated',
        entityType: 'delivery',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }

    // Notification: status changed — notify the creator
    if (body.status && body.status !== old.status && old.createdByUserId) {
      sendNotificationIfEnabled({
        targetUserId: old.createdByUserId,
        actorUserId: user?.id,
        eventType: 'status_change',
        entityType: 'delivery',
        entityTitle: updated!.title,
        entityPath: `/deliveries/${updated!.id}`,
        details: body.status,
      }).catch(() => {})
    }

    return updated
  }, { body: t.Partial(deliveryBody) })

  // DELETE /api/deliveries/:id
  .delete('/:id', async ({ params: { id }, set, jwt: jwtInstance, headers }) => {
    const [deleted] = await db.delete(deliveries)
      .where(eq(deliveries.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Delivery not found' } }

    const user = await getUserFromHeader(jwtInstance.verify, headers)
    logActivity({
      product: deleted.productId,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'deleted',
      entityType: 'delivery',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })
    return { success: true }
  })
