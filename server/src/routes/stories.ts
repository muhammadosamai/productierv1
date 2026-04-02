import { Elysia, t } from 'elysia'
import { db } from '../db'
import { stories, storyComments, storyAttachments, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'
import { generatePublicIdForProduct } from '../lib/publicIds'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

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
  product: t.Optional(t.String()),
  initiative: t.Optional(t.Nullable(t.String())),
  delivery: t.Optional(t.Nullable(t.String())),
  owner: t.Optional(t.Nullable(t.String())),
  ownerAvatar: t.Optional(t.Nullable(t.String())),
  estimate: t.Optional(t.Nullable(t.String())),
  acceptanceCriteria: t.Optional(t.Nullable(t.String())),
})

async function getUserFromHeader(jwtVerify: any, headers: Record<string, string | undefined>) {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const payload = await jwtVerify(token)
  if (!payload?.userId) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId as string) })
  return user || null
}

export const storyRoutes = new Elysia({ prefix: '/api/stories' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/stories
  .get('/', async ({ query }) => {
    const product = query.product
    return db.query.stories.findMany({
      where: product ? eq(stories.product, product) : undefined,
      orderBy: (s, { desc }) => [desc(s.createdAt)],
      with: { tasks: { with: { comments: { with: { user: true } }, attachments: true } }, comments: { with: { user: true } } },
    })
  })

  // POST /api/stories
  .post('/', async ({ body, jwt, headers }) => {
    const product = body.product || 'Product'
    const publicId = await generatePublicIdForProduct(product)
    const [story] = await db.insert(stories).values({
      ...body,
      product,
      publicId,
    }).returning()
    const user = await getUserFromHeader(jwt.verify, headers)
    logActivity({
      product: story!.product,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'created',
      entityType: 'story',
      entityId: story!.id,
      entityTitle: story!.title,
    })
    return story
  }, { body: storyBody })

  // GET /api/stories/:id
  .get('/:id', async ({ params: { id }, set }) => {
    const story = await db.query.stories.findFirst({
      where: eq(stories.id, id),
      with: { tasks: { with: { comments: { with: { user: true } }, attachments: true } }, comments: { with: { user: true } } },
    })
    if (!story) { set.status = 404; return { error: 'Story not found' } }
    return story
  })

  // PUT /api/stories/:id
  .put('/:id', async ({ params: { id }, body, set, jwt, headers }) => {
    const old = await db.query.stories.findFirst({ where: eq(stories.id, id) })
    if (!old) { set.status = 404; return { error: 'Story not found' } }

    // Strip estimate & delivery — these are computed from child tasks
    const { estimate: _est, delivery: _del, ...updateFields } = body
    const [updated] = await db.update(stories)
      .set({ ...updateFields, updatedAt: new Date() })
      .where(eq(stories.id, id))
      .returning()

    const user = await getUserFromHeader(jwt.verify, headers)
    const changes = computeChanges(old, body, ['title', 'status', 'priority', 'type', 'owner', 'initiative', 'description'])
    if (changes.length > 0) {
      logActivity({
        product: updated!.product,
        userName: user?.name || 'System',
        userAvatar: user?.avatar,
        userId: user?.id,
        action: 'updated',
        entityType: 'story',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }
    return updated
  }, { body: t.Partial(storyBody) })

  // DELETE /api/stories/:id
  .delete('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const [deleted] = await db.delete(stories)
      .where(eq(stories.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Story not found' } }

    const user = await getUserFromHeader(jwt.verify, headers)
    logActivity({
      product: deleted.product,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'deleted',
      entityType: 'story',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })
    return { success: true }
  })

  // GET /api/stories/:id/comments
  .get('/:id/comments', async ({ params: { id } }) => {
    return db.query.storyComments.findMany({
      where: eq(storyComments.storyId, id),
      with: { user: true },
      orderBy: (c, { asc }) => [asc(c.createdAt)],
    })
  })

  // POST /api/stories/:id/comments
  .post('/:id/comments', async ({ params: { id }, body, jwt, headers, set }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const [comment] = await db.insert(storyComments).values({
      storyId: id,
      userId: user.id,
      content: body.content,
    }).returning()

    const full = await db.query.storyComments.findFirst({
      where: eq(storyComments.id, comment!.id),
      with: { user: true },
    })
    return full
  }, {
    body: t.Object({ content: t.String({ minLength: 1 }) }),
  })

  // DELETE /api/stories/:id/comments/:commentId
  .delete('/:id/comments/:commentId', async ({ params, set, jwt, headers }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const [deleted] = await db.delete(storyComments)
      .where(eq(storyComments.id, params.commentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Comment not found' } }
    return { success: true }
  })

  // ============ ATTACHMENTS ============

  // GET /api/stories/:id/attachments
  .get('/:id/attachments', async ({ params: { id } }) => {
    const results = await db.query.storyAttachments.findMany({
      where: eq(storyAttachments.storyId, id),
      with: { user: true },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    })
    return results
  })

  // POST /api/stories/:id/attachments (multipart file upload)
  .post('/:id/attachments', async ({ params: { id }, body, set, jwt, headers }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const file = (body as any).file as File
    if (!file) { set.status = 400; return { error: 'No file provided' } }

    const uploadsDir = path.join(process.cwd(), 'uploads', 'attachments')
    await mkdir(uploadsDir, { recursive: true })

    const ext = path.extname(file.name) || ''
    const uniqueName = `${randomUUID()}${ext}`
    const filePath = path.join(uploadsDir, uniqueName)

    const arrayBuffer = await file.arrayBuffer()
    await Bun.write(filePath, arrayBuffer)

    const [attachment] = await db.insert(storyAttachments).values({
      storyId: id,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      filePath: `/uploads/attachments/${uniqueName}`,
    }).returning()

    // Log activity
    const story = await db.query.stories.findFirst({ where: eq(stories.id, id) })
    if (story) {
      logActivity({
        product: story.product,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'story',
        entityId: story.id,
        entityTitle: story.title,
        changes: [{ field: 'attachment', from: null, to: file.name }],
      })
    }

    const result = await db.query.storyAttachments.findFirst({
      where: eq(storyAttachments.id, attachment!.id),
      with: { user: true },
    })
    return result
  })

  // DELETE /api/stories/attachments/:attachmentId
  .delete('/attachments/:attachmentId', async ({ params: { attachmentId }, set, jwt, headers }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const [deleted] = await db.delete(storyAttachments)
      .where(eq(storyAttachments.id, attachmentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Attachment not found' } }

    // Log activity
    const story = await db.query.stories.findFirst({ where: eq(stories.id, deleted.storyId) })
    if (story) {
      logActivity({
        product: story.product,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'story',
        entityId: story.id,
        entityTitle: story.title,
        changes: [{ field: 'attachment', from: deleted.fileName, to: null }],
      })
    }

    // Remove file from disk
    try {
      const fullPath = path.join(process.cwd(), deleted.filePath)
      const { unlink } = await import('fs/promises')
      await unlink(fullPath)
    } catch {}

    return { success: true }
  })
