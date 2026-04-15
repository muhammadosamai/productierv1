import { Elysia, t } from 'elysia'
import { db } from '../db'
import { featureRequests, featureRequestUpvotes, featureRequestComments, featureRequestAttachments, users } from '../db/schema'
import { eq, desc, and, count, sql } from 'drizzle-orm'
import { resolveProductByScope, whereDenormProductMatches, denormalizedProductScopeValue } from '../lib/resolveProductScope'
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

export const featureRequestRoutes = new Elysia({ prefix: '/api/feature-requests' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/feature-requests?product=X&sort=votes|newest|oldest
  .get('/', async ({ query }) => {
    const product = query.product?.trim()
    const scopeRow = product ? await resolveProductByScope(product) : null
    const sort = query.sort || 'votes'

    const items = await db.query.featureRequests.findMany({
      where: scopeRow ? whereDenormProductMatches(featureRequests.productId, scopeRow) : undefined,
      orderBy: sort === 'votes'
        ? [desc(featureRequests.upvoteCount), desc(featureRequests.createdAt)]
        : sort === 'oldest'
          ? [sql`${featureRequests.createdAt} ASC`]
          : [desc(featureRequests.createdAt)],
      with: {
        createdByUser: {
          columns: { id: true, name: true, email: true, avatar: true },
        },
        upvotes: {
          columns: { userId: true },
        },
        comments: {
          columns: { id: true },
        },
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
      product: t.Optional(t.String()),
      sort: t.Optional(t.String()),
    }),
  })

  // GET /api/feature-requests/:id
  .get('/:id', async ({ params, set }) => {
    const item = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, params.id),
      with: {
        createdByUser: {
          columns: { id: true, name: true, email: true, avatar: true },
        },
        upvotes: {
          with: {
            user: { columns: { id: true, name: true, email: true, avatar: true } },
          },
        },
        comments: {
          with: {
            user: { columns: { id: true, name: true, email: true, avatar: true } },
          },
          orderBy: [sql`created_at ASC`],
        },
        attachments: true,
      },
    })

    if (!item) {
      set.status = 404
      return { error: 'Feature request not found' }
    }

    return {
      ...item,
      upvoterIds: item.upvotes.map(u => u.userId),
    }
  })

  // POST /api/feature-requests
  .post('/', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const sr = await resolveProductByScope(body.productId)
    const productId = sr ? denormalizedProductScopeValue(sr) : body.productId

    const [created] = await db.insert(featureRequests).values({
      productId,
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
      status: t.Optional(t.String()),
      category: t.Optional(t.String()),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
    }),
  })

  // PUT /api/feature-requests/:id
  .put('/:id', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
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

    if (!updated) {
      set.status = 404
      return { error: 'Feature request not found' }
    }

    return updated
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      description: t.Optional(t.Nullable(t.String())),
      status: t.Optional(t.String()),
      category: t.Optional(t.String()),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
    }),
  })

  // DELETE /api/feature-requests/:id
  .delete('/:id', async ({ params, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    await db.delete(featureRequests).where(eq(featureRequests.id, params.id))
    return { success: true }
  })

  // POST /api/feature-requests/:id/upvote — Toggle upvote
  .post('/:id/upvote', async ({ params, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    // Check if already upvoted
    const existing = await db.query.featureRequestUpvotes.findFirst({
      where: and(
        eq(featureRequestUpvotes.featureRequestId, params.id),
        eq(featureRequestUpvotes.userId, user.id),
      ),
    })

    if (existing) {
      // Remove upvote
      await db.delete(featureRequestUpvotes).where(eq(featureRequestUpvotes.id, existing.id))
      await db.update(featureRequests)
        .set({ upvoteCount: sql`GREATEST(upvote_count - 1, 0)` })
        .where(eq(featureRequests.id, params.id))
      return { upvoted: false }
    } else {
      // Add upvote
      await db.insert(featureRequestUpvotes).values({
        featureRequestId: params.id,
        userId: user.id,
      })
      await db.update(featureRequests)
        .set({ upvoteCount: sql`upvote_count + 1` })
        .where(eq(featureRequests.id, params.id))
      return { upvoted: true }
    }
  })

  // POST /api/feature-requests/:id/comments
  .post('/:id/comments', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const [comment] = await db.insert(featureRequestComments).values({
      featureRequestId: params.id,
      userId: user.id,
      content: body.content,
    }).returning()

    return {
      ...comment,
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
    }
  }, {
    body: t.Object({
      content: t.String({ minLength: 1 }),
    }),
  })
