import { Elysia, t } from 'elysia'
import { db } from '../db'
import { featureRequests, featureRequestUpvotes, featureRequestComments } from '../db/schema'
import { eq, desc, and, sql } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireProductPageAction } from '../lib/authz'
import { publicUserColumns } from '../lib/serializers'

export const featureRequestRoutes = new Elysia({ prefix: '/api/feature-requests' })
  .use(authPlugin)

  // GET /api/feature-requests?productId=X&sort=votes|newest|oldest
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

    const sort = query.sort || 'votes'
    const items = await db.query.featureRequests.findMany({
      where: eq(featureRequests.productId, productId),
      orderBy: sort === 'votes'
        ? [desc(featureRequests.upvoteCount), desc(featureRequests.createdAt)]
        : sort === 'oldest'
          ? [sql`${featureRequests.createdAt} ASC`]
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
  }, {
    query: t.Object({
      productId: t.Optional(t.String()),
      sort: t.Optional(t.String()),
    }),
  })

  // GET /api/feature-requests/:id
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

    if (!item) {
      set.status = 404
      return { error: 'Feature request not found' }
    }

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

  // POST /api/feature-requests
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

    // Auto-upvote by creator
    await db.insert(featureRequestUpvotes).values({
      featureRequestId: created.id,
      userId: user.id,
    })
    await db.update(featureRequests)
      .set({ upvoteCount: 1 })
      .where(eq(featureRequests.id, created.id))

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

  // PUT /api/feature-requests/:id
  .put('/:id', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      columns: { id: true, productId: true, createdByUserId: true },
    })
    if (!existing) {
      set.status = 404
      return { error: 'Feature request not found' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'feature-requests',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

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

    if (!updated) {
      set.status = 404
      return { error: 'Feature request not found' }
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

  // DELETE /api/feature-requests/:id
  .delete('/:id', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      columns: { id: true, productId: true, createdByUserId: true },
    })
    if (!existing) {
      set.status = 404
      return { error: 'Feature request not found' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'feature-requests',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    await db.delete(featureRequests).where(eq(featureRequests.id, params.id))
    return { success: true }
  })

  // POST /api/feature-requests/:id/upvote — Toggle upvote
  .post('/:id/upvote', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const item = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      columns: { id: true, productId: true },
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

  // POST /api/feature-requests/:id/comments
  .post('/:id/comments', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const item = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      columns: { id: true, productId: true },
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

    return {
      ...comment,
      user: { id: user.id, name: user.name, avatar: user.avatar },
    }
  }, {
    body: t.Object({
      content: t.String({ minLength: 1 }),
    }),
  })
