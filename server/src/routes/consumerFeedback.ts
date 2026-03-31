import { Elysia, t } from 'elysia'
import { db } from '../db'
import { consumerFeedbacks, consumerFeedbackComments, consumerFeedbackAttachments, users } from '../db/schema'
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { maskEmail } from '../lib/serializers'
import { requireAuth, requireProductPageAction } from '../lib/authz'
import { computeChanges, logActivity } from '../lib/logActivity'
import { badRequest } from '../lib/apiErrors'
import { isUuid } from '../lib/productResolver'
import {
  decodeCursor,
  encodeCursor,
  isLegacyListMode,
  parseListQuery,
  parseSort,
  toListEnvelope,
} from '../lib/listContract'

export const consumerFeedbackRoutes = new Elysia({ prefix: '/api/consumer-feedbacks' })
  .use(authPlugin)

  // GET /api/consumer-feedbacks?productId=X
  .get('/', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = query.productId
    if (!productId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }
    if (!isUuid(productId)) {
      return badRequest(set, 'Invalid productId query parameter')
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'feedbacks',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const parsedList = parseListQuery(query as Record<string, unknown>, {
      defaultLimit: 30,
      maxLimit: 100,
    })
    const legacyMode = isLegacyListMode(parsedList)
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const qTerm = q.length > 0 ? q : null

    if (legacyMode) {
      const items = await db.query.consumerFeedbacks.findMany({
        where: and(
          eq(consumerFeedbacks.productId, productId),
          ...(qTerm
            ? [or(
              ilike(consumerFeedbacks.title, `%${qTerm}%`),
              ilike(consumerFeedbacks.description, `%${qTerm}%`),
            )!]
            : []),
        ),
        orderBy: [desc(consumerFeedbacks.createdAt)],
        with: {
          assignedToUser: { columns: { id: true, name: true, avatar: true } },
          attachments: { columns: { id: true, fileName: true, fileType: true, mimeType: true, filePath: true } },
          comments: { columns: { id: true } },
        },
      })
      return items.map(i => ({
        id: i.id,
        productId: i.productId,
        title: i.title,
        description: i.description,
        type: i.type,
        status: i.status,
        priority: i.priority,
        storyId: i.storyId,
        assignedToUserId: i.assignedToUserId,
        tags: i.tags,
        upvoteCount: i.upvoteCount,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        assignedToUser: i.assignedToUser,
        commentCount: i.comments.length,
        attachmentCount: i.attachments.length,
      }))
    }

    const sort = parseSort(parsedList.sort, ['createdAt', 'updatedAt'] as const, {
      field: 'createdAt',
      direction: 'desc',
      raw: 'createdAt:desc',
    })
    const cursor = decodeCursor(parsedList.cursor)
    const baseConditions = [eq(consumerFeedbacks.productId, productId)]
    if (qTerm) {
      baseConditions.push(or(
        ilike(consumerFeedbacks.title, `%${qTerm}%`),
        ilike(consumerFeedbacks.description, `%${qTerm}%`),
      )!)
    }

    const conditions = [...baseConditions]
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt)
      if (!Number.isNaN(cursorDate.getTime())) {
        if (sort.field === 'updatedAt') {
          if (sort.direction === 'desc') {
            conditions.push(sql`(${consumerFeedbacks.updatedAt} < ${cursorDate} OR (${consumerFeedbacks.updatedAt} = ${cursorDate} AND ${consumerFeedbacks.id} < ${cursor.id}))`)
          } else {
            conditions.push(sql`(${consumerFeedbacks.updatedAt} > ${cursorDate} OR (${consumerFeedbacks.updatedAt} = ${cursorDate} AND ${consumerFeedbacks.id} > ${cursor.id}))`)
          }
        } else if (sort.direction === 'desc') {
          conditions.push(sql`(${consumerFeedbacks.createdAt} < ${cursorDate} OR (${consumerFeedbacks.createdAt} = ${cursorDate} AND ${consumerFeedbacks.id} < ${cursor.id}))`)
        } else {
          conditions.push(sql`(${consumerFeedbacks.createdAt} > ${cursorDate} OR (${consumerFeedbacks.createdAt} = ${cursorDate} AND ${consumerFeedbacks.id} > ${cursor.id}))`)
        }
      }
    }

    const orderField = sort.field === 'updatedAt' ? consumerFeedbacks.updatedAt : consumerFeedbacks.createdAt
    const rows = await db.query.consumerFeedbacks.findMany({
      where: and(...conditions),
      orderBy: sort.direction === 'desc'
        ? [desc(orderField as any), desc(consumerFeedbacks.id)]
        : [asc(orderField as any), asc(consumerFeedbacks.id)],
      limit: parsedList.limit + 1,
      with: {
        assignedToUser: { columns: { id: true, name: true, avatar: true } },
      },
    })

    const hasMore = rows.length > parsedList.limit
    const items = hasMore ? rows.slice(0, parsedList.limit) : rows
    const ids = items.map(item => item.id)
    const commentCounts = ids.length > 0
      ? await db.select({
        feedbackId: consumerFeedbackComments.feedbackId,
        count: sql<number>`count(*)::int`,
      }).from(consumerFeedbackComments)
        .where(inArray(consumerFeedbackComments.feedbackId, ids))
        .groupBy(consumerFeedbackComments.feedbackId)
      : []
    const attachmentCounts = ids.length > 0
      ? await db.select({
        feedbackId: consumerFeedbackAttachments.feedbackId,
        count: sql<number>`count(*)::int`,
      }).from(consumerFeedbackAttachments)
        .where(inArray(consumerFeedbackAttachments.feedbackId, ids))
        .groupBy(consumerFeedbackAttachments.feedbackId)
      : []
    const commentsMap = new Map<string, number>()
    for (const row of commentCounts) commentsMap.set(row.feedbackId, Number(row.count ?? 0))
    const attachmentsMap = new Map<string, number>()
    for (const row of attachmentCounts) attachmentsMap.set(row.feedbackId, Number(row.count ?? 0))

    const enrichedItems = items.map(i => ({
      id: i.id,
      productId: i.productId,
      title: i.title,
      description: i.description,
      type: i.type,
      status: i.status,
      priority: i.priority,
      storyId: i.storyId,
      assignedToUserId: i.assignedToUserId,
      tags: i.tags,
      upvoteCount: i.upvoteCount,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      assignedToUser: i.assignedToUser,
      commentCount: commentsMap.get(i.id) || 0,
      attachmentCount: attachmentsMap.get(i.id) || 0,
    }))

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor({
        id: items[items.length - 1]!.id,
        createdAt: new Date(
          sort.field === 'updatedAt'
            ? items[items.length - 1]!.updatedAt
            : items[items.length - 1]!.createdAt,
        ).toISOString(),
      })
      : null

    let totalApprox: number | undefined
    if (!parsedList.cursor) {
      const [countRow] = await db.select({
        value: sql<number>`count(*)::int`,
      }).from(consumerFeedbacks).where(and(...baseConditions))
      totalApprox = Number(countRow?.value ?? 0)
    }

    return toListEnvelope({
      items: enrichedItems,
      hasMore,
      nextCursor,
      totalApprox,
    })
  }, {
    query: t.Object({
      productId: t.Optional(t.String()),
      q: t.Optional(t.String()),
      sort: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
      paged: t.Optional(t.String()),
    }),
  })

  // GET /api/consumer-feedbacks/:id
  .get('/:id', async ({ params, jwt, headers, set }) => {
    if (!isUuid(params.id)) {
      return badRequest(set, 'Invalid feedback id')
    }
    const item = await db.query.consumerFeedbacks.findFirst({
      where: eq(consumerFeedbacks.id, params.id),
      with: {
        assignedToUser: { columns: { id: true, name: true, avatar: true } },
        attachments: true,
        comments: {
          with: { user: { columns: { id: true, name: true, avatar: true } } },
          orderBy: [sql`created_at ASC`],
        },
      },
    })
    if (!item) { set.status = 404; return { error: 'Not found' } }

    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: item.productId,
      page: 'feedbacks',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    return {
      ...item,
      reporterEmail: maskEmail(item.reporterEmail),
      reporterDevice: null,
      reporterBrowser: null,
      reporterOs: null,
      pageUrl: null,
    }
  })

  // POST /api/consumer-feedbacks (public - no auth required for external users)
  .post('/', async ({ body, set }) => {
    if (!isUuid(body.productId)) {
      return badRequest(set, 'Invalid productId')
    }
    const [created] = await db.insert(consumerFeedbacks).values({
      productId: body.productId,
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
      productId: t.String(),
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

  // PUT /api/consumer-feedbacks/:id (auth required - internal team)
  .put('/:id', async ({ params, body, jwt, headers, set }) => {
    if (!isUuid(params.id)) {
      return badRequest(set, 'Invalid feedback id')
    }
    if (body.assignedToUserId !== undefined && body.assignedToUserId !== null && !isUuid(body.assignedToUserId)) {
      return badRequest(set, 'Invalid assignedToUserId')
    }
    if (body.storyId !== undefined && body.storyId !== null && !isUuid(body.storyId)) {
      return badRequest(set, 'Invalid storyId')
    }

    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.consumerFeedbacks.findFirst({
      where: eq(consumerFeedbacks.id, params.id),
    })
    if (!existing) { set.status = 404; return { error: 'Not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'feedbacks',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const updateData: Record<string, any> = {}
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) updateData[k] = v
    }

    const [updated] = await db.update(consumerFeedbacks)
      .set(updateData)
      .where(eq(consumerFeedbacks.id, params.id))
      .returning()

    if (!updated) { set.status = 404; return { error: 'Not found' } }

    const changes = computeChanges(existing as Record<string, any>, body as Record<string, any>, [
      'title',
      'description',
      'type',
      'status',
      'priority',
      'assignedToUserId',
      'tags',
      'storyId',
    ])
    if (changes.length > 0) {
      const subjectUserIds = [existing.assignedToUserId, updated.assignedToUserId]
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
      logActivity({
        productId: updated.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'consumer_feedback',
        entityId: updated.id,
        entityTitle: updated.title,
        changes,
        routePathOverride: '/feedbacks',
        subjectUserIds,
      })
    }

    return updated
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      description: t.Optional(t.Nullable(t.String())),
      type: t.Optional(t.Union([
        t.Literal('bug'),
        t.Literal('feature'),
        t.Literal('enhancement'),
      ])),
      status: t.Optional(t.Union([
        t.Literal('new'),
        t.Literal('acknowledged'),
        t.Literal('investigating'),
        t.Literal('resolved'),
        t.Literal('wont_fix'),
        t.Literal('duplicate'),
      ])),
      priority: t.Optional(t.Union([
        t.Literal('low'),
        t.Literal('medium'),
        t.Literal('high'),
        t.Literal('critical'),
      ])),
      assignedToUserId: t.Optional(t.Nullable(t.String())),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
      storyId: t.Optional(t.Nullable(t.String())),
    }),
  })

  // DELETE /api/consumer-feedbacks/:id
  .delete('/:id', async ({ params, jwt, headers, set }) => {
    if (!isUuid(params.id)) {
      return badRequest(set, 'Invalid feedback id')
    }
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.consumerFeedbacks.findFirst({
      where: eq(consumerFeedbacks.id, params.id),
    })
    if (!existing) { set.status = 404; return { error: 'Not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'feedbacks',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    await db.delete(consumerFeedbacks).where(eq(consumerFeedbacks.id, params.id))
    const subjectUserIds = existing.assignedToUserId ? [existing.assignedToUserId] : []
    logActivity({
      productId: existing.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'consumer_feedback',
      entityId: existing.id,
      entityTitle: existing.title,
      routePathOverride: '/feedbacks',
      subjectUserIds,
    })
    return { success: true }
  })

  // POST /api/consumer-feedbacks/:id/comments (internal team comment)
  .post('/:id/comments', async ({ params, body, jwt, headers, set }) => {
    if (!isUuid(params.id)) {
      return badRequest(set, 'Invalid feedback id')
    }
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const feedback = await db.query.consumerFeedbacks.findFirst({
      where: eq(consumerFeedbacks.id, params.id),
    })
    if (!feedback) { set.status = 404; return { error: 'Not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: feedback.productId,
      page: 'feedbacks',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [comment] = await db.insert(consumerFeedbackComments).values({
      feedbackId: params.id,
      userId: user.id,
      content: body.content,
      isInternal: body.isInternal ? 1 : 0,
    }).returning()

    const subjectUserIds = [feedback.assignedToUserId]
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    logActivity({
      productId: feedback.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'updated',
      entityType: 'consumer_feedback',
      entityId: feedback.id,
      entityTitle: feedback.title,
      changes: [{
        field: 'comment',
        from: null,
        to: body.content.length > 80 ? `${body.content.slice(0, 80)}...` : body.content,
      }],
      routePathOverride: '/feedbacks',
      subjectUserIds,
    })

    return { ...comment, user: { id: user.id, name: user.name, avatar: user.avatar } }
  }, {
    body: t.Object({
      content: t.String({ minLength: 1 }),
      isInternal: t.Optional(t.Boolean()),
    }),
  })
