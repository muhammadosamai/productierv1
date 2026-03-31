import { Elysia, t } from 'elysia'
import { db } from '../db'
import { initiatives, stories, storyComments } from '../db/schema'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { logActivity, computeChanges } from '../lib/logActivity'
import { authPlugin } from '../plugins/auth'
import {
  getEffectivePagePermissionForUser,
  isGlobalAdminRole,
  requireAuth,
  requireProductPageAction,
  type PageAction,
} from '../lib/authz'
import { publicUserColumns } from '../lib/serializers'
import { invalidateMetricsForProduct } from '../lib/metricsCache'
import {
  decodeCursor,
  encodeCursor,
  isLegacyListMode,
  parseListQuery,
  parseSort,
  toListEnvelope,
} from '../lib/listContract'
import { removeSearchDocument, upsertStorySearchDocument } from '../lib/search/searchIndex'
import { isStorySelfVisible, storySelfViewCondition } from '../lib/selfViewScope'

const storyBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  type: t.Optional(t.Union([
    t.Literal('feature'), t.Literal('bug'), t.Literal('improvement'),
    t.Literal('technical_debt'), t.Literal('research'), t.Literal('infrastructure'),
    t.Literal('testing'), t.Literal('documentation')
  ])),
  priority: t.Optional(t.Union([
    t.Literal('low'), t.Literal('medium'), t.Literal('high'), t.Literal('critical')
  ])),
  status: t.Optional(t.Union([
    t.Literal('backlog'), t.Literal('drafted'), t.Literal('initialized'),
    t.Literal('in_progress'), t.Literal('completed'), t.Literal('archived')
  ])),
  productId: t.Optional(t.String()),
  initiativeId: t.Optional(t.Nullable(t.String())),
  initiative: t.Optional(t.Nullable(t.String())),
  delivery: t.Optional(t.Nullable(t.String())),
  ownerUserId: t.Optional(t.Nullable(t.String())),
  sortOrder: t.Optional(t.Number()),
  estimate: t.Optional(t.Nullable(t.String())),
  acceptanceCriteria: t.Optional(t.Nullable(t.String())),
})

const storyStatusValue = t.Union([
  t.Literal('backlog'),
  t.Literal('drafted'),
  t.Literal('initialized'),
  t.Literal('in_progress'),
  t.Literal('completed'),
  t.Literal('archived'),
])

async function resolveInitiativeLabel(
  initiativeId: string | null | undefined,
  fallbackLabel: string | null | undefined,
) {
  if (!initiativeId) {
    return fallbackLabel ?? null
  }
  const linked = await db.query.initiatives.findFirst({
    where: eq(initiatives.id, initiativeId),
    columns: { id: true, title: true },
  })
  return linked?.title ?? fallbackLabel ?? null
}

function summarizeComment(content: string): string {
  const normalized = content.trim()
  if (!normalized) return 'Comment added'
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
}

function withSecureTaskAttachmentLinks<T extends {
  tasks?: Array<{
    attachments?: Array<{ id: string; filePath: string }>
  }>
}>(story: T): T {
  if (!Array.isArray(story.tasks)) return story
  return {
    ...story,
    tasks: story.tasks.map((task) => {
      if (!Array.isArray(task.attachments)) return task
      return {
        ...task,
        attachments: task.attachments.map((attachment) => ({
          ...attachment,
          filePath: `/api/tasks/attachments/${attachment.id}/download`,
          downloadUrl: `/api/tasks/attachments/${attachment.id}/download`,
        })),
      }
    }),
  }
}

async function requireStoryProductAccess(
  storyId: string,
  action: PageAction,
  jwtVerify: (token: string) => Promise<any>,
  headers: Record<string, string | undefined>,
  set: { status?: number | string }
) {
  const story = await db.query.stories.findFirst({
    where: eq(stories.id, storyId),
    columns: { id: true, productId: true, ownerUserId: true, title: true },
  })
  if (!story) {
    set.status = 404
    return null
  }
  const access = await requireProductPageAction(jwtVerify, headers, set, {
    productId: story.productId,
    page: 'stories',
    action,
  })
  if (!access) return null
  const { permission } = await getEffectivePagePermissionForUser(access.user, 'stories')
  if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly && !isStorySelfVisible(access.user.id, story)) {
    set.status = 404
    return null
  }
  return story
}

export const storyRoutes = new Elysia({ prefix: '/api/stories' })
  .use(authPlugin)

  // GET /api/stories?productId=...
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
      page: 'stories',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'stories')

    const parsedList = parseListQuery(query as Record<string, unknown>, {
      defaultLimit: 40,
      maxLimit: 100,
    })
    const legacyMode = isLegacyListMode(parsedList)
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const qTerm = q.length > 0 ? q : null

    if (!legacyMode) {
      const sort = parseSort(parsedList.sort, ['createdAt', 'updatedAt', 'sortOrder'] as const, {
        field: 'sortOrder',
        direction: 'asc',
        raw: 'sortOrder:asc',
      })
      const cursor = decodeCursor(parsedList.cursor)

      const conditions = [eq(stories.productId, productId)]
      if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly) {
        conditions.push(storySelfViewCondition(access.user.id))
      }
      if (qTerm) {
        conditions.push(or(
          ilike(stories.title, `%${qTerm}%`),
          ilike(stories.description, `%${qTerm}%`),
        )!)
      }
      if (cursor) {
        if (sort.field === 'sortOrder') {
          const cursorOrder = Number.parseInt(cursor.createdAt, 10)
          if (Number.isFinite(cursorOrder)) {
            if (sort.direction === 'desc') {
              conditions.push(sql`(${stories.sortOrder} < ${cursorOrder} OR (${stories.sortOrder} = ${cursorOrder} AND ${stories.id} < ${cursor.id}))`)
            } else {
              conditions.push(sql`(${stories.sortOrder} > ${cursorOrder} OR (${stories.sortOrder} = ${cursorOrder} AND ${stories.id} > ${cursor.id}))`)
            }
          }
        } else {
          const cursorDate = new Date(cursor.createdAt)
          if (!Number.isNaN(cursorDate.getTime())) {
            if (sort.field === 'updatedAt') {
              if (sort.direction === 'desc') {
                conditions.push(sql`(${stories.updatedAt} < ${cursorDate} OR (${stories.updatedAt} = ${cursorDate} AND ${stories.id} < ${cursor.id}))`)
              } else {
                conditions.push(sql`(${stories.updatedAt} > ${cursorDate} OR (${stories.updatedAt} = ${cursorDate} AND ${stories.id} > ${cursor.id}))`)
              }
            } else if (sort.direction === 'desc') {
              conditions.push(sql`(${stories.createdAt} < ${cursorDate} OR (${stories.createdAt} = ${cursorDate} AND ${stories.id} < ${cursor.id}))`)
            } else {
              conditions.push(sql`(${stories.createdAt} > ${cursorDate} OR (${stories.createdAt} = ${cursorDate} AND ${stories.id} > ${cursor.id}))`)
            }
          }
        }
      }

      const orderField = sort.field === 'updatedAt'
        ? stories.updatedAt
        : sort.field === 'sortOrder'
          ? stories.sortOrder
          : stories.createdAt
      const rows = await db.select({
        id: stories.id,
        title: stories.title,
        description: stories.description,
        type: stories.type,
        priority: stories.priority,
        status: stories.status,
        productId: stories.productId,
        initiativeId: stories.initiativeId,
        initiative: stories.initiative,
        delivery: stories.delivery,
        ownerUserId: stories.ownerUserId,
        sortOrder: stories.sortOrder,
        estimate: stories.estimate,
        acceptanceCriteria: stories.acceptanceCriteria,
        createdAt: stories.createdAt,
        updatedAt: stories.updatedAt,
      }).from(stories)
        .where(and(...conditions))
        .orderBy(
          sort.direction === 'desc' ? desc(orderField) : asc(orderField),
          sort.direction === 'desc' ? desc(stories.id) : asc(stories.id),
        )
        .limit(parsedList.limit + 1)

      const hasMore = rows.length > parsedList.limit
      const items = hasMore ? rows.slice(0, parsedList.limit) : rows
      const nextCursor = hasMore && items.length > 0
        ? encodeCursor({
          id: items[items.length - 1]!.id,
          createdAt: sort.field === 'sortOrder'
            ? String(items[items.length - 1]!.sortOrder)
            : new Date(
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
        }).from(stories).where(and(
          eq(stories.productId, productId),
          ...(!isGlobalAdminRole(access.user.role) && permission.selfViewOnly
            ? [storySelfViewCondition(access.user.id)]
            : []),
          ...(qTerm
            ? [or(
              ilike(stories.title, `%${qTerm}%`),
              ilike(stories.description, `%${qTerm}%`),
            )!]
            : []),
        ))
        totalApprox = Number(countRow?.value ?? 0)
      }

      return toListEnvelope({
        items,
        hasMore,
        nextCursor,
        totalApprox,
      })
    }

    const storiesRows = await db.query.stories.findMany({
      where: and(
        eq(stories.productId, productId),
        ...(!isGlobalAdminRole(access.user.role) && permission.selfViewOnly
          ? [storySelfViewCondition(access.user.id)]
          : []),
      ),
      orderBy: (s, { asc, desc }) => [asc(s.sortOrder), desc(s.createdAt)],
      with: {
        ownerUser: { columns: publicUserColumns },
        tasks: {
          with: {
            comments: { with: { user: { columns: publicUserColumns } } },
            attachments: true,
          },
        },
        comments: { with: { user: { columns: publicUserColumns } } },
      },
    })

    return storiesRows.map((story) => withSecureTaskAttachmentLinks(story))
  })

  // POST /api/stories
  .post('/', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = body.productId
    if (!productId) {
      set.status = 400
      return { error: 'productId is required' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'stories',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const targetStatus = body.status ?? 'backlog'
    const [sortRow] = await db.select({
      value: sql<number>`coalesce(max(${stories.sortOrder}), 0)::int`,
    }).from(stories).where(and(
      eq(stories.productId, productId),
      eq(stories.status, targetStatus),
    ))
    const initiativeLabel = await resolveInitiativeLabel(body.initiativeId, body.initiative)
    const payload = {
      ...body,
      productId,
      status: targetStatus,
      sortOrder: Number(sortRow?.value ?? 0) + 1,
      initiative: initiativeLabel,
    }
    const [story] = await db.insert(stories).values(payload).returning()
    logActivity({
      productId: story!.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'story',
      entityId: story!.id,
      entityTitle: story!.title,
    })
    await upsertStorySearchDocument(story!.id)
    await invalidateMetricsForProduct(story!.productId)
    return story
  }, { body: storyBody })

  .put('/reorder', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = typeof body.productId === 'string' && body.productId.trim()
      ? body.productId.trim()
      : ''
    if (!productId) {
      set.status = 400
      return { error: 'productId is required' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'stories',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const providedIds = [...new Set(body.orderedStoryIds.map((id) => id.trim()).filter(Boolean))]
    if (providedIds.length === 0) {
      set.status = 400
      return { error: 'orderedStoryIds must include at least one id' }
    }

    const scopedStories = await db.select({
      id: stories.id,
      status: stories.status,
      sortOrder: stories.sortOrder,
    }).from(stories).where(and(
      eq(stories.productId, productId),
      eq(stories.status, body.status),
    )).orderBy(asc(stories.sortOrder), asc(stories.id))

    if (scopedStories.length === 0) {
      return { success: true, updated: 0 }
    }

    const scopedIds = new Set(scopedStories.map((entry) => entry.id))
    const knownProvidedIds = providedIds.filter((id) => scopedIds.has(id))
    if (knownProvidedIds.length === 0) {
      set.status = 400
      return { error: 'No provided story ids match the selected status scope' }
    }

    const remainingIds = scopedStories
      .map((entry) => entry.id)
      .filter((id) => !knownProvidedIds.includes(id))
    const finalOrder = [...knownProvidedIds, ...remainingIds]

    await db.transaction(async (tx) => {
      for (let index = 0; index < finalOrder.length; index += 1) {
        await tx.update(stories)
          .set({ sortOrder: index + 1, updatedAt: new Date() })
          .where(and(
            eq(stories.id, finalOrder[index]!),
            eq(stories.productId, productId),
          ))
      }
    })

    return {
      success: true,
      updated: finalOrder.length,
    }
  }, {
    body: t.Object({
      productId: t.String(),
      status: storyStatusValue,
      orderedStoryIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
    }),
  })

  // GET /api/stories/:id
  .get('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const allowedStory = await requireStoryProductAccess(id, 'read', jwt.verify, headers, set)
    if (!allowedStory) return set.status === 404 ? { error: 'Story not found' } : { error: 'Forbidden' }

    const story = await db.query.stories.findFirst({
      where: eq(stories.id, id),
      with: {
        ownerUser: { columns: publicUserColumns },
        tasks: {
          with: {
            comments: { with: { user: { columns: publicUserColumns } } },
            attachments: true,
          },
        },
        comments: { with: { user: { columns: publicUserColumns } } },
      },
    })
    if (!story) { set.status = 404; return { error: 'Story not found' } }
    return withSecureTaskAttachmentLinks(story)
  })

  // PUT /api/stories/:id
  .put('/:id', async ({ params: { id }, body, set, jwt, headers }) => {
    const old = await db.query.stories.findFirst({ where: eq(stories.id, id) })
    if (!old) { set.status = 404; return { error: 'Story not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: old.productId,
      page: 'stories',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const user = access.user

    // Strip estimate & delivery — these are computed from child tasks
    const { estimate: _est, delivery: _del, sortOrder: requestedSortOrder, ...updateFields } = body
    const nextStatus = body.status ?? old.status
    const statusChanged = nextStatus !== old.status
    const [sortRow] = statusChanged && requestedSortOrder === undefined
      ? await db.select({
        value: sql<number>`coalesce(max(${stories.sortOrder}), 0)::int`,
      }).from(stories).where(and(
        eq(stories.productId, old.productId),
        eq(stories.status, nextStatus),
      ))
      : [{ value: null as number | null }]
    const resolvedInitiative = Object.prototype.hasOwnProperty.call(body, 'initiativeId')
      ? await resolveInitiativeLabel(body.initiativeId ?? null, body.initiative ?? null)
      : body.initiative
    const [updated] = await db.update(stories)
      .set({
        ...updateFields,
        ...(requestedSortOrder !== undefined
          ? { sortOrder: requestedSortOrder }
          : statusChanged
            ? { sortOrder: Number(sortRow?.value ?? 0) + 1 }
            : {}),
        ...(resolvedInitiative !== undefined ? { initiative: resolvedInitiative } : {}),
        updatedAt: new Date(),
      })
      .where(eq(stories.id, id))
      .returning()

    const changes = computeChanges(old, body, ['title', 'status', 'priority', 'type', 'ownerUserId', 'initiativeId', 'initiative', 'description'])
    if (changes.length > 0) {
      logActivity({
        productId: updated!.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'story',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }
    await upsertStorySearchDocument(updated!.id)
    await invalidateMetricsForProduct(updated!.productId)
    return updated
  }, { body: t.Partial(storyBody) })

  // DELETE /api/stories/:id
  .delete('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const existing = await db.query.stories.findFirst({
      where: eq(stories.id, id),
      columns: { id: true, productId: true },
    })
    if (!existing) { set.status = 404; return { error: 'Story not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'stories',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const user = access.user

    const [deleted] = await db.delete(stories)
      .where(eq(stories.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Story not found' } }

    logActivity({
      productId: deleted.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'story',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })
    await removeSearchDocument('story', deleted.id)
    await invalidateMetricsForProduct(deleted.productId)
    return { success: true }
  })

  // GET /api/stories/:id/comments
  .get('/:id/comments', async ({ params: { id }, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const allowedStory = await requireStoryProductAccess(id, 'read', jwt.verify, headers, set)
    if (!allowedStory) return set.status === 404 ? { error: 'Story not found' } : { error: 'Forbidden' }

    return db.query.storyComments.findMany({
      where: eq(storyComments.storyId, id),
      with: { user: { columns: publicUserColumns } },
      orderBy: (c, { asc }) => [asc(c.createdAt)],
    })
  })

  // POST /api/stories/:id/comments
  .post('/:id/comments', async ({ params: { id }, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const allowedStory = await requireStoryProductAccess(id, 'create', jwt.verify, headers, set)
    if (!allowedStory) return set.status === 404 ? { error: 'Story not found' } : { error: 'Forbidden' }

    const [comment] = await db.insert(storyComments).values({
      storyId: id,
      userId: user.id,
      content: body.content,
    }).returning()

    const commentSummary = summarizeComment(body.content)
    const subjectUserIds = [allowedStory.ownerUserId, comment?.userId].filter((value, index, all) =>
      !!value && all.indexOf(value) === index
    ) as string[]
    logActivity({
      productId: allowedStory.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'story',
      entityId: allowedStory.id,
      entityTitle: allowedStory.title || `Story ${allowedStory.id}`,
      changes: [
        { field: 'commentId', from: null, to: comment?.id || null },
        { field: 'commentPreview', from: null, to: commentSummary },
      ],
      routePathOverride: `/stories/${allowedStory.id}`,
      subjectUserIds: subjectUserIds.length > 0 ? subjectUserIds : null,
    })

    const full = await db.query.storyComments.findFirst({
      where: eq(storyComments.id, comment!.id),
      with: { user: { columns: publicUserColumns } },
    })
    return full
  }, {
    body: t.Object({ content: t.String({ minLength: 1 }) }),
  })

  // DELETE /api/stories/:id/comments/:commentId
  .delete('/:id/comments/:commentId', async ({ params, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const allowedStory = await requireStoryProductAccess(params.id, 'delete', jwt.verify, headers, set)
    if (!allowedStory) return set.status === 404 ? { error: 'Story not found' } : { error: 'Forbidden' }

    const existing = await db.query.storyComments.findFirst({
      where: eq(storyComments.id, params.commentId),
      columns: { id: true, userId: true, storyId: true, content: true },
    })
    if (!existing || existing.storyId !== params.id) {
      set.status = 404
      return { error: 'Comment not found' }
    }

    if (existing.userId !== user.id && !isGlobalAdminRole(user.role)) {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const [deleted] = await db.delete(storyComments)
      .where(eq(storyComments.id, params.commentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Comment not found' } }

    const removedSummary = summarizeComment(existing.content || '')
    const subjectUserIds = [allowedStory.ownerUserId, existing.userId].filter((value, index, all) =>
      !!value && all.indexOf(value) === index
    ) as string[]
    logActivity({
      productId: allowedStory.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'story',
      entityId: allowedStory.id,
      entityTitle: allowedStory.title || `Story ${allowedStory.id}`,
      changes: [
        { field: 'commentId', from: existing.id, to: null },
        { field: 'commentPreview', from: removedSummary, to: null },
      ],
      routePathOverride: `/stories/${allowedStory.id}`,
      subjectUserIds: subjectUserIds.length > 0 ? subjectUserIds : null,
    })
    return { success: true }
  })
