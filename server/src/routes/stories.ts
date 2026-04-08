import { Elysia, t } from 'elysia'
import { db } from '../db'
import { stories, storyComments, storyAttachments, users, productMembers } from '../db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'
import { validateAttachmentFileName, validateAttachmentContent } from '../lib/allowedAttachments'
import { sendNotificationIfEnabled } from '../services/notificationEmails'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

// Drop the non-partial unique constraint that blocks multiple NULL public_ids.
let storySchemaBootstrapped = false
async function bootstrapStorySchema() {
  if (storySchemaBootstrapped) return
  try {
    await db.execute(sql`
      ALTER TABLE backlog_items
        DROP CONSTRAINT IF EXISTS backlog_items_public_id_unique;
    `)
  } catch { /* ignore if constraint doesn't exist */ }
  storySchemaBootstrapped = true
}

const storyBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  type: t.Optional(t.Union([
    t.Literal('feature'), t.Literal('bug'), t.Literal('improvement'),
    t.Literal('technical_debt'), t.Literal('research'), t.Literal('infrastructure'),
    t.Literal('testing'), t.Literal('documentation')
  ])),
  priority: t.Optional(t.Union([
    t.Literal('low'), t.Literal('medium'), t.Literal('high')
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

async function userCanAccessStoryProduct(
  user: { id: string; role: string } | null,
  storyProduct: string,
): Promise<boolean> {
  if (!user) return false
  if (user.role === 'super_admin') return true
  const member = await db.query.productMembers.findFirst({
    where: and(eq(productMembers.product, storyProduct), eq(productMembers.userId, user.id)),
  })
  return !!member
}

export const storyRoutes = new Elysia({ prefix: '/api/stories' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/stories
  .get('/', async ({ query }) => {
    const product = query.product
    return db.query.stories.findMany({
      where: product ? eq(stories.product, product) : undefined,
      orderBy: (s, { desc }) => [desc(s.createdAt)],
      with: {
        tasks: {
          with: {
            comments: { with: { user: true } },
            attachments: true,
            subtasks: {
              orderBy: (s, { asc }) => [asc(s.sortOrder), asc(s.createdAt)],
              with: {
                delivery: { columns: { id: true, title: true } },
              },
            },
          },
        },
        comments: { with: { user: true } },
      },
    })
  })

  // POST /api/stories
  .post('/', async ({ body, jwt, headers }) => {
    await bootstrapStorySchema()
    const product = body.product || 'Product'

    const [story] = await db.insert(stories).values({
      ...body,
      product,
    }).returning()

    if (!story) {
      throw new Error('Failed to create story')
    }

    const user = await getUserFromHeader(jwt.verify, headers)
    logActivity({
      product: story.product,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'created',
      entityType: 'story',
      entityId: story.id,
      entityTitle: story.title,
    })
    return story
  }, { body: storyBody })

  // GET /api/stories/attachments/:attachmentId/download — authenticated stream (avoids SPA host serving HTML for /api/uploads)
  .get('/attachments/:attachmentId/download', async ({ params: { attachmentId }, set, jwt, headers }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const att = await db.query.storyAttachments.findFirst({ where: eq(storyAttachments.id, attachmentId) })
    if (!att) {
      set.status = 404
      return { error: 'Attachment not found' }
    }

    const story = await db.query.stories.findFirst({
      where: eq(stories.id, att.storyId),
      columns: { product: true },
    })
    if (!story || !(await userCanAccessStoryProduct(user, story.product))) {
      set.status = 404
      return { error: 'Attachment not found' }
    }

    const rel = att.filePath.replace(/^\/+/, '')
    const diskPath = path.join(process.cwd(), rel)
    const file = Bun.file(diskPath)
    if (!(await file.exists())) {
      set.status = 404
      return { error: 'File not found' }
    }

    const safeName = att.fileName.replace(/[\r\n"]/g, '_') || 'attachment'
    const utfName = encodeURIComponent(att.fileName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    set.headers['Content-Type'] = att.mimeType || 'application/octet-stream'
    set.headers['Content-Disposition'] =
      `attachment; filename="${safeName}"; filename*=UTF-8''${utfName}`

    return file
  })

  // GET /api/stories/:id
  .get('/:id', async ({ params: { id }, set }) => {
    const story = await db.query.stories.findFirst({
      where: eq(stories.id, id),
      with: {
        tasks: {
          with: {
            comments: { with: { user: true } },
            attachments: true,
            subtasks: {
              orderBy: (s, { asc }) => [asc(s.sortOrder), asc(s.createdAt)],
              with: {
                delivery: { columns: { id: true, title: true } },
              },
            },
          },
        },
        comments: { with: { user: true } },
      },
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

    // Notification: owner changed (owner is a name string, resolve to user)
    if (body.owner && body.owner !== old.owner) {
      const ownerUser = await db.query.users.findFirst({ where: eq(users.name, body.owner) })
      if (ownerUser) {
        sendNotificationIfEnabled({
          targetUserId: ownerUser.id,
          actorUserId: user?.id,
          eventType: 'assigned',
          entityType: 'story',
          entityTitle: updated!.title,
          entityPath: `/stories?story=${updated!.id}`,
        }).catch(() => {})
      }
    }

    // Notification: status changed — notify owner
    if (body.status && body.status !== old.status && old.owner) {
      const ownerUser = await db.query.users.findFirst({ where: eq(users.name, old.owner) })
      if (ownerUser) {
        sendNotificationIfEnabled({
          targetUserId: ownerUser.id,
          actorUserId: user?.id,
          eventType: 'status_change',
          entityType: 'story',
          entityTitle: updated!.title,
          entityPath: `/stories?story=${updated!.id}`,
          details: body.status,
        }).catch(() => {})
      }
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

    const story = await db.query.stories.findFirst({ where: eq(stories.id, id) })

    const [comment] = await db.insert(storyComments).values({
      storyId: id,
      userId: user.id,
      content: body.content,
    }).returning()

    // Notify story owner about the comment
    if (story?.owner) {
      const ownerUser = await db.query.users.findFirst({ where: eq(users.name, story.owner) })
      if (ownerUser) {
        const preview = body.content.length > 100 ? body.content.slice(0, 100) + '...' : body.content
        sendNotificationIfEnabled({
          targetUserId: ownerUser.id,
          actorUserId: user.id,
          eventType: 'comment',
          entityType: 'story',
          entityTitle: story.title,
          entityPath: `/stories?story=${story.id}`,
          details: preview,
        }).catch(() => {})
      }
    }

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
    return db.query.storyAttachments.findMany({
      where: eq(storyAttachments.storyId, id),
      with: { user: true },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    })
  })

  // POST /api/stories/:id/attachments (multipart file upload)
  .post('/:id/attachments', async ({ params: { id }, body, set, jwt, headers }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const storyRow = await db.query.stories.findFirst({
      where: eq(stories.id, id),
      columns: { product: true },
    })
    if (!storyRow || !(await userCanAccessStoryProduct(user, storyRow.product))) {
      set.status = 404
      return { error: 'Story not found' }
    }

    const file = (body as any).file as File
    if (!file) { set.status = 400; return { error: 'No file provided' } }

    const typeCheck = validateAttachmentFileName(file.name)
    if (!typeCheck.ok) { set.status = 400; return { error: typeCheck.error } }

    const uploadsDir = path.join(process.cwd(), 'uploads', 'attachments')

    const ext = path.extname(file.name) || ''
    const uniqueName = `${randomUUID()}${ext}`
    const filePath = path.join(uploadsDir, uniqueName)

    const arrayBuffer = await file.arrayBuffer()
    const contentCheck = await validateAttachmentContent(arrayBuffer, file.name)
    if (!contentCheck.ok) { set.status = 400; return { error: contentCheck.error } }

    await Bun.write(filePath, arrayBuffer)

    const [attachment] = await db.insert(storyAttachments).values({
      storyId: id,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: contentCheck.mime,
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

    const existing = await db.query.storyAttachments.findFirst({
      where: eq(storyAttachments.id, attachmentId),
    })
    if (!existing) {
      set.status = 404
      return { error: 'Attachment not found' }
    }
    const storyForAccess = await db.query.stories.findFirst({
      where: eq(stories.id, existing.storyId),
      columns: { product: true },
    })
    if (!storyForAccess || !(await userCanAccessStoryProduct(user, storyForAccess.product))) {
      set.status = 404
      return { error: 'Attachment not found' }
    }

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

    // Remove file from disk (filePath is like /uploads/attachments/...)
    try {
      const rel = deleted.filePath.replace(/^\/+/, '')
      const fullPath = path.join(process.cwd(), rel)
      const { unlink } = await import('fs/promises')
      await unlink(fullPath)
    } catch {}

    return { success: true }
  })
