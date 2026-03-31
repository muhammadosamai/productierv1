import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { consumerFeedbacks, products } from '../db/schema'
import { badRequest, notFound } from '../lib/apiErrors'
import { logActivity } from '../lib/logActivity'
import { isUuid } from '../lib/productResolver'

function retiredPayload() {
  return {
    error: 'Legacy tenant route is retired. Use /api/organizations/:organizationId/... endpoints.',
  }
}

export const consumerFeedbackPublicRoutes = new Elysia({ prefix: '/api/consumer-feedbacks' })
  .post('/', async ({ body, set }) => {
    const productId = body.productId.trim()
    if (!isUuid(productId)) {
      return badRequest(set, 'Invalid productId')
    }

    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
      columns: { id: true },
    })
    if (!product) {
      return notFound(set, 'Product not found')
    }

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

    logActivity({
      productId: created.productId,
      userName: body.reporterName || 'External Reporter',
      userAvatar: null,
      userId: null,
      action: 'created',
      entityType: 'consumer_feedback',
      entityId: created.id,
      entityTitle: created.title,
      routePathOverride: '/feedbacks',
      subjectUserIds: created.assignedToUserId ? [created.assignedToUserId] : [],
    })

    return {
      id: created.id,
      productId: created.productId,
      status: created.status,
      createdAt: created.createdAt,
      message: 'Feedback submitted successfully',
    }
  }, {
    body: t.Object({
      productId: t.String({ minLength: 1 }),
      title: t.String({ minLength: 1 }),
      description: t.Optional(t.Nullable(t.String())),
      type: t.Optional(t.Union([
        t.Literal('bug'),
        t.Literal('feature'),
        t.Literal('enhancement'),
      ])),
      priority: t.Optional(t.Union([
        t.Literal('low'),
        t.Literal('medium'),
        t.Literal('high'),
        t.Literal('critical'),
      ])),
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
  .all('/', ({ request, set }) => {
    if (request.method.toUpperCase() === 'POST') return
    set.status = 410
    return retiredPayload()
  })
  .all('/*', ({ set }) => {
    set.status = 410
    return retiredPayload()
  })
