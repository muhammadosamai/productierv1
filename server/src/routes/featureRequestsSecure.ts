import { Elysia, t } from 'elysia'
import { db } from '../db'
import { featureRequests, featureRequestUpvotes, featureRequestComments } from '../db/schema'
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { isGlobalAdminRole, requireAuth, requireProductPageAction } from '../lib/authz'
import { publicUserColumns } from '../lib/serializers'
import { computeChanges, logActivity } from '../lib/logActivity'
import {
  decodeCursor,
  encodeCursor,
  isLegacyListMode,
  parseListQuery,
  toListEnvelope,
} from '../lib/listContract'

export const featureRequestRoutes = new Elysia({ prefix: '/api/feature-requests' })
  .use(authPlugin)

  .get('/', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = query.productId
    if (!productId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'feature-requests',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const parsedList = parseListQuery(query as Record<string, unknown>, {
      defaultLimit: 30,
      maxLimit: 100,
    })
    const legacyMode = isLegacyListMode(parsedList)
    const sort = (typeof query.sort === 'string' ? query.sort : 'votes').toLowerCase()
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const qTerm = q.length > 0 ? q : null

    if (legacyMode) {
      const items = await db.query.featureRequests.findMany({
        where: and(
          eq(featureRequests.productId, productId),
          ...(qTerm
            ? [or(
              ilike(featureRequests.title, `%${qTerm}%`),
              ilike(featureRequests.description, `%${qTerm}%`),
            )!]
            : []),
        ),
        orderBy: sort === 'votes'
          ? [desc(featureRequests.upvoteCount), desc(featureRequests.createdAt)]
          : sort === 'oldest'
            ? [asc(featureRequests.createdAt)]
            : [desc(featureRequests.createdAt)],
        with: {
          createdByUser: { columns: publicUserColumns },
          upvotes: { columns: { userId: true } },
          comments: { columns: { id: true } },
        },
      })

      return items.map(item => ({
        ...item,
        upvoterIds: item.upvotes.map(u => u.userId),
        commentCount: item.comments.length,
        upvotes: undefined,
        comments: undefined,
      }))
    }

    const cursor = decodeCursor(parsedList.cursor)
    const conditions = [eq(featureRequests.productId, productId)]
    if (qTerm) {
      conditions.push(or(
        ilike(featureRequests.title, `%${qTerm}%`),
        ilike(featureRequests.description, `%${qTerm}%`),
      )!)
    }
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt)
      if (!Number.isNaN(cursorDate.getTime())) {
        if (sort === 'oldest') {
          conditions.push(sql`(${featureRequests.createdAt} > ${cursorDate} OR (${featureRequests.createdAt} = ${cursorDate} AND ${featureRequests.id} > ${cursor.id}))`)
        } else {
          conditions.push(sql`(${featureRequests.createdAt} < ${cursorDate} OR (${featureRequests.createdAt} = ${cursorDate} AND ${featureRequests.id} < ${cursor.id}))`)
        }
      }
    }

    const rows = await db.select({
      id: featureRequests.id,
      productId: featureRequests.productId,
      title: featureRequests.title,
      description: featureRequests.description,
      status: featureRequests.status,
      category: featureRequests.category,
      upvoteCount: featureRequests.upvoteCount,
      createdByUserId: featureRequests.createdByUserId,
      tags: featureRequests.tags,
      createdAt: featureRequests.createdAt,
      updatedAt: featureRequests.updatedAt,
    }).from(featureRequests)
      .where(and(...conditions))
      .orderBy(
        sort === 'oldest' ? asc(featureRequests.createdAt) : desc(featureRequests.createdAt),
        sort === 'oldest' ? asc(featureRequests.id) : desc(featureRequests.id),
      )
      .limit(parsedList.limit + 1)

    const hasMore = rows.length > parsedList.limit
    const items = hasMore ? rows.slice(0, parsedList.limit) : rows
    const ids = items.map(item => item.id)

    const upvotes = ids.length > 0
      ? await db.select({
        featureRequestId: featureRequestUpvotes.featureRequestId,
        userId: featureRequestUpvotes.userId,
      }).from(featureRequestUpvotes).where(inArray(featureRequestUpvotes.featureRequestId, ids))
      : []
    const comments = ids.length > 0
      ? await db.select({
        featureRequestId: featureRequestComments.featureRequestId,
        count: sql<number>`count(*)::int`,
      }).from(featureRequestComments)
        .where(inArray(featureRequestComments.featureRequestId, ids))
        .groupBy(featureRequestComments.featureRequestId)
      : []

    const upvotersByItem = new Map<string, string[]>()
    for (const upvote of upvotes) {
      const current = upvotersByItem.get(upvote.featureRequestId) || []
      current.push(upvote.userId)
      upvotersByItem.set(upvote.featureRequestId, current)
    }
    const commentsByItem = new Map<string, number>()
    for (const comment of comments) {
      commentsByItem.set(comment.featureRequestId, Number(comment.count ?? 0))
    }

    const enrichedItems = items.map(item => ({
      ...item,
      upvoterIds: upvotersByItem.get(item.id) || [],
      commentCount: commentsByItem.get(item.id) || 0,
    }))

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor({
        id: items[items.length - 1]!.id,
        createdAt: new Date(items[items.length - 1]!.createdAt).toISOString(),
      })
      : null

    let totalApprox: number | undefined
    if (!parsedList.cursor) {
      const [countRow] = await db.select({
        value: sql<number>`count(*)::int`,
      }).from(featureRequests).where(and(
        eq(featureRequests.productId, productId),
        ...(qTerm
          ? [or(
            ilike(featureRequests.title, `%${qTerm}%`),
            ilike(featureRequests.description, `%${qTerm}%`),
          )!]
          : []),
      ))
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
      sort: t.Optional(t.String()),
      q: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
      paged: t.Optional(t.String()),
    }),
  })

  .get('/:id', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const item = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      with: {
        createdByUser: { columns: publicUserColumns },
        upvotes: {
          with: { user: { columns: publicUserColumns } },
        },
        comments: {
          with: { user: { columns: publicUserColumns } },
          orderBy: [sql`created_at ASC`],
        },
        attachments: true,
      },
    })
    if (!item) { set.status = 404; return { error: 'Feature request not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: item.productId,
      page: 'feature-requests',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    return {
      ...item,
      upvoterIds: item.upvotes.map(u => u.userId),
    }
  })

  .post('/', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: body.productId,
      page: 'feature-requests',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [created] = await db.insert(featureRequests).values({
      productId: body.productId,
      title: body.title,
      description: body.description || null,
      status: (body.status as any) || 'open',
      category: (body.category as any) || 'enhancement',
      createdByUserId: user.id,
      tags: body.tags || null,
    }).returning()

    await db.insert(featureRequestUpvotes).values({
      featureRequestId: created.id,
      userId: user.id,
    })
    await db.update(featureRequests).set({ upvoteCount: 1 }).where(eq(featureRequests.id, created.id))

    logActivity({
      productId: created.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'feature_request',
      entityId: created.id,
      entityTitle: created.title,
      routePathOverride: '/feature-requests',
      subjectUserIds: [created.createdByUserId],
    })

    return created
  }, {
    body: t.Object({
      productId: t.String(),
      title: t.String({ minLength: 1 }),
      description: t.Optional(t.Nullable(t.String())),
      status: t.Optional(t.Union([
        t.Literal('open'),
        t.Literal('under_review'),
        t.Literal('planned'),
        t.Literal('in_progress'),
        t.Literal('completed'),
        t.Literal('declined'),
      ])),
      category: t.Optional(t.Union([
        t.Literal('enhancement'),
        t.Literal('new_feature'),
        t.Literal('integration'),
        t.Literal('ux_improvement'),
        t.Literal('performance'),
        t.Literal('other'),
      ])),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
    }),
  })

  .put('/:id', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      columns: {
        id: true,
        productId: true,
        createdByUserId: true,
        title: true,
        description: true,
        status: true,
        category: true,
        tags: true,
      },
    })
    if (!existing) { set.status = 404; return { error: 'Feature request not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'feature-requests',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    if (existing.createdByUserId !== user.id && !isGlobalAdminRole(user.role)) {
      const adminAccess = await requireProductPageAction(jwt.verify, headers, set, {
        productId: existing.productId,
        page: 'feature-requests',
        action: 'edit',
        requiredProductRoles: ['admin', 'owner'],
      })
      if (!adminAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const updateData: Record<string, any> = {}
    if (body.title !== undefined) updateData.title = body.title
    if (body.description !== undefined) updateData.description = body.description
    if (body.status !== undefined) updateData.status = body.status
    if (body.category !== undefined) updateData.category = body.category
    if (body.tags !== undefined) updateData.tags = body.tags

    const [updated] = await db.update(featureRequests)
      .set(updateData)
      .where(eq(featureRequests.id, params.id))
      .returning()
    if (!updated) { set.status = 404; return { error: 'Feature request not found' } }

    const changes = computeChanges(existing as Record<string, any>, body as Record<string, any>, [
      'title',
      'description',
      'status',
      'category',
      'tags',
    ])
    if (changes.length > 0) {
      logActivity({
        productId: updated.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'feature_request',
        entityId: updated.id,
        entityTitle: updated.title,
        changes,
        routePathOverride: '/feature-requests',
        subjectUserIds: [updated.createdByUserId],
      })
    }

    return updated
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      description: t.Optional(t.Nullable(t.String())),
      status: t.Optional(t.Union([
        t.Literal('open'),
        t.Literal('under_review'),
        t.Literal('planned'),
        t.Literal('in_progress'),
        t.Literal('completed'),
        t.Literal('declined'),
      ])),
      category: t.Optional(t.Union([
        t.Literal('enhancement'),
        t.Literal('new_feature'),
        t.Literal('integration'),
        t.Literal('ux_improvement'),
        t.Literal('performance'),
        t.Literal('other'),
      ])),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
    }),
  })

  .delete('/:id', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      columns: { id: true, productId: true, createdByUserId: true, title: true },
    })
    if (!existing) { set.status = 404; return { error: 'Feature request not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'feature-requests',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    if (existing.createdByUserId !== user.id && !isGlobalAdminRole(user.role)) {
      const adminAccess = await requireProductPageAction(jwt.verify, headers, set, {
        productId: existing.productId,
        page: 'feature-requests',
        action: 'delete',
        requiredProductRoles: ['admin', 'owner'],
      })
      if (!adminAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    await db.delete(featureRequests).where(eq(featureRequests.id, params.id))
    logActivity({
      productId: existing.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'feature_request',
      entityId: existing.id,
      entityTitle: existing.title,
      routePathOverride: '/feature-requests',
      subjectUserIds: [existing.createdByUserId],
    })
    return { success: true }
  })

  .post('/:id/upvote', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const item = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      columns: { id: true, productId: true, title: true, createdByUserId: true },
    })
    if (!item) { set.status = 404; return { error: 'Feature request not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: item.productId,
      page: 'feature-requests',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const existing = await db.query.featureRequestUpvotes.findFirst({
      where: and(
        eq(featureRequestUpvotes.featureRequestId, params.id),
        eq(featureRequestUpvotes.userId, user.id),
      ),
    })

    if (existing) {
      await db.delete(featureRequestUpvotes).where(eq(featureRequestUpvotes.id, existing.id))
      await db.update(featureRequests)
        .set({ upvoteCount: sql`GREATEST(upvote_count - 1, 0)` })
        .where(eq(featureRequests.id, params.id))
      return { upvoted: false }
    }

    await db.insert(featureRequestUpvotes).values({
      featureRequestId: params.id,
      userId: user.id,
    })
    await db.update(featureRequests)
      .set({ upvoteCount: sql`upvote_count + 1` })
      .where(eq(featureRequests.id, params.id))
    return { upvoted: true }
  })

  .post('/:id/comments', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const item = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      columns: { id: true, productId: true, title: true, createdByUserId: true },
    })
    if (!item) { set.status = 404; return { error: 'Feature request not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: item.productId,
      page: 'feature-requests',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [comment] = await db.insert(featureRequestComments).values({
      featureRequestId: params.id,
      userId: user.id,
      content: body.content,
    }).returning()

    logActivity({
      productId: item.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'updated',
      entityType: 'feature_request',
      entityId: item.id,
      entityTitle: item.title,
      changes: [{
        field: 'comment',
        from: null,
        to: body.content.length > 80 ? `${body.content.slice(0, 80)}...` : body.content,
      }],
      routePathOverride: '/feature-requests',
      subjectUserIds: [item.createdByUserId],
    })

    return {
      ...comment,
      user: { id: user.id, name: user.name, avatar: user.avatar },
    }
  }, {
    body: t.Object({
      content: t.String({ minLength: 1 }),
    }),
  })
