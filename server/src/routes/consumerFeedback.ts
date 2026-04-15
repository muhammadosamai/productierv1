import { Elysia, t } from 'elysia'
import { db } from '../db'
import { consumerFeedbacks, consumerFeedbackComments, consumerFeedbackAttachments, users } from '../db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { resolveProductByScope, whereDenormProductMatches, denormalizedProductScopeValue } from '../lib/resolveProductScope'
import { jwt } from '@elysiajs/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

async function getUserFromHeader(jwtVerify: any, headers: Record<string, string | undefined>) {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const payload = await jwtVerify(token)
  if (!payload?.userId) return null
  return await db.query.users.findFirst({ where: eq(users.id, payload.userId as string) }) || null
}

export const consumerFeedbackRoutes = new Elysia({ prefix: '/api/consumer-feedbacks' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/consumer-feedbacks?product=X
  .get('/', async ({ query }) => {
    const product = query.product?.trim()
    const scopeRow = product ? await resolveProductByScope(product) : null
    const items = await db.query.consumerFeedbacks.findMany({
      where: scopeRow ? whereDenormProductMatches(consumerFeedbacks.productId, scopeRow) : undefined,
      orderBy: [desc(consumerFeedbacks.createdAt)],
      with: {
        assignedToUser: { columns: { id: true, name: true, email: true, avatar: true } },
        attachments: { columns: { id: true, fileName: true, fileType: true, mimeType: true, filePath: true } },
        comments: { columns: { id: true } },
      },
    })
    return items.map(i => ({
      ...i,
      commentCount: i.comments.length,
      attachmentCount: i.attachments.length,
      comments: undefined,
    }))
  }, {
    query: t.Object({ product: t.Optional(t.String()) }),
  })

  // GET /api/consumer-feedbacks/:id
  .get('/:id', async ({ params, set }) => {
    const item = await db.query.consumerFeedbacks.findFirst({
      where: eq(consumerFeedbacks.id, params.id),
      with: {
        assignedToUser: { columns: { id: true, name: true, email: true, avatar: true } },
        attachments: true,
        comments: {
          with: { user: { columns: { id: true, name: true, email: true, avatar: true } } },
          orderBy: [sql`created_at ASC`],
        },
      },
    })
    if (!item) { set.status = 404; return { error: 'Not found' } }
    return item
  })

  // POST /api/consumer-feedbacks (public - no auth required for external users)
  .post('/', async ({ body }) => {
    const sr = await resolveProductByScope(body.productId)
    const productId = sr ? denormalizedProductScopeValue(sr) : body.productId

    const [created] = await db.insert(consumerFeedbacks).values({
      productId,
      title: body.title,
      description: body.description || null,
      type: (body.type as any) || 'bug',
      priority: (body.priority as any) || 'medium',
      reporterName: body.reporterName || null,
      reporterEmail: body.reporterEmail || null,
      reporterDevice: body.reporterDevice || null,
      reporterBrowser: body.reporterBrowser || null,
      reporterOs: body.reporterOs || null,
      appVersion: body.appVersion || null,
      pageUrl: body.pageUrl || null,
      stepsToReproduce: body.stepsToReproduce || null,
      expectedBehavior: body.expectedBehavior || null,
      actualBehavior: body.actualBehavior || null,
      tags: body.tags || null,
    }).returning()
    return created
  }, {
    body: t.Object({
      productId: t.String(),
      title: t.String({ minLength: 1 }),
      description: t.Optional(t.Nullable(t.String())),
      type: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      reporterName: t.Optional(t.Nullable(t.String())),
      reporterEmail: t.Optional(t.Nullable(t.String())),
      reporterDevice: t.Optional(t.Nullable(t.String())),
      reporterBrowser: t.Optional(t.Nullable(t.String())),
      reporterOs: t.Optional(t.Nullable(t.String())),
      appVersion: t.Optional(t.Nullable(t.String())),
      pageUrl: t.Optional(t.Nullable(t.String())),
      stepsToReproduce: t.Optional(t.Nullable(t.String())),
      expectedBehavior: t.Optional(t.Nullable(t.String())),
      actualBehavior: t.Optional(t.Nullable(t.String())),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
    }),
  })

  // PUT /api/consumer-feedbacks/:id (auth required - internal team)
  .put('/:id', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const updateData: Record<string, any> = {}
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) updateData[k] = v
    }

    const [updated] = await db.update(consumerFeedbacks)
      .set(updateData)
      .where(eq(consumerFeedbacks.id, params.id))
      .returning()

    if (!updated) { set.status = 404; return { error: 'Not found' } }
    return updated
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      description: t.Optional(t.Nullable(t.String())),
      type: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      assignedToUserId: t.Optional(t.Nullable(t.String())),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
      storyId: t.Optional(t.Nullable(t.String())),
    }),
  })

  // DELETE /api/consumer-feedbacks/:id
  .delete('/:id', async ({ params, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }
    await db.delete(consumerFeedbacks).where(eq(consumerFeedbacks.id, params.id))
    return { success: true }
  })

  // POST /api/consumer-feedbacks/:id/comments (internal team comment)
  .post('/:id/comments', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }
    const [comment] = await db.insert(consumerFeedbackComments).values({
      feedbackId: params.id,
      userId: user.id,
      content: body.content,
      isInternal: body.isInternal ? 1 : 0,
    }).returning()
    return { ...comment, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } }
  }, {
    body: t.Object({
      content: t.String({ minLength: 1 }),
      isInternal: t.Optional(t.Boolean()),
    }),
  })
