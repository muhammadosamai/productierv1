import { Elysia, t } from 'elysia'
import { db } from '../db'
import { issues, issueComments, issueAttachments, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

const issueBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  type: t.Optional(t.Union([
    t.Literal('bug'), t.Literal('ui_issue'), t.Literal('performance'),
    t.Literal('crash'), t.Literal('security'), t.Literal('data_loss'), t.Literal('other'),
  ])),
  module: t.Optional(t.Nullable(t.String())),
  stepsToReproduce: t.Optional(t.Nullable(t.String())),
  expectedBehavior: t.Optional(t.Nullable(t.String())),
  actualBehavior: t.Optional(t.Nullable(t.String())),
  reproducibility: t.Optional(t.Nullable(t.Union([
    t.Literal('always'), t.Literal('sometimes'), t.Literal('rarely'),
    t.Literal('once'), t.Literal('unable_to_reproduce'),
  ]))),
  severity: t.Optional(t.Union([
    t.Literal('critical'), t.Literal('major'), t.Literal('minor'), t.Literal('trivial'),
  ])),
  priority: t.Optional(t.Union([
    t.Literal('critical'), t.Literal('high'), t.Literal('medium'), t.Literal('low'),
  ])),
  status: t.Optional(t.Union([
    t.Literal('open'), t.Literal('in_progress'), t.Literal('resolved'),
    t.Literal('closed'), t.Literal('deferred'),
  ])),
  assignedToUserId: t.Optional(t.Nullable(t.String())),
  appVersion: t.Optional(t.Nullable(t.String())),
  environment: t.Optional(t.Nullable(t.Union([
    t.Literal('production'), t.Literal('staging'), t.Literal('development'), t.Literal('testing'),
  ]))),
  browser: t.Optional(t.Nullable(t.Union([
    t.Literal('chrome'), t.Literal('firefox'), t.Literal('safari'), t.Literal('edge'), t.Literal('other'),
  ]))),
  operatingSystem: t.Optional(t.Nullable(t.Union([
    t.Literal('windows'), t.Literal('macos'), t.Literal('linux'),
    t.Literal('ios'), t.Literal('android'), t.Literal('other'),
  ]))),
  product: t.Optional(t.String()),
  storyId: t.Optional(t.Nullable(t.String())),
  taskId: t.Optional(t.Nullable(t.String())),
  testCycleId: t.Optional(t.Nullable(t.String())),
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

export const issueRoutes = new Elysia({ prefix: '/api/issues' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/issues?product=X&testCycleId=X
  .get('/', async ({ query }) => {
    const all = await db.query.issues.findMany({
      with: {
        reportedBy: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedTo: { columns: { id: true, name: true, email: true, avatar: true } },
        testCycle: { columns: { id: true, name: true } },
      },
      orderBy: (items, { desc }) => [desc(items.createdAt)],
    })
    let filtered = all
    if (query.product) {
      filtered = filtered.filter(i => i.product === query.product)
    }
    if (query.testCycleId) {
      filtered = filtered.filter(i => i.testCycleId === query.testCycleId)
    }
    return filtered
  })

  // POST /api/issues
  .post('/', async ({ body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const [issue] = await db.insert(issues).values({
      title: body.title,
      description: body.description,
      type: body.type || 'bug',
      module: body.module,
      stepsToReproduce: body.stepsToReproduce,
      expectedBehavior: body.expectedBehavior,
      actualBehavior: body.actualBehavior,
      reproducibility: body.reproducibility,
      severity: body.severity || 'minor',
      priority: body.priority || 'medium',
      status: body.status || 'open',
      assignedToUserId: body.assignedToUserId,
      reportedByUserId: user.id,
      appVersion: body.appVersion,
      environment: body.environment,
      browser: body.browser,
      operatingSystem: body.operatingSystem,
      product: body.product || 'Product',
      storyId: body.storyId,
      taskId: body.taskId,
      testCycleId: body.testCycleId,
    }).returning()

    logActivity({
      product: issue!.product,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'issue' as any,
      entityId: issue!.id,
      entityTitle: issue!.title,
      changes: null,
    })

    // Return with relations
    const full = await db.query.issues.findFirst({
      where: eq(issues.id, issue!.id),
      with: {
        reportedBy: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedTo: { columns: { id: true, name: true, email: true, avatar: true } },
      },
    })
    return full
  }, { body: issueBody })

  // GET /api/issues/:id
  .get('/:id', async ({ params: { id }, set }) => {
    const issue = await db.query.issues.findFirst({
      where: eq(issues.id, id),
      with: {
        reportedBy: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedTo: { columns: { id: true, name: true, email: true, avatar: true } },
        testCycle: { columns: { id: true, name: true } },
        comments: { with: { user: true }, orderBy: (c, { desc }) => [desc(c.createdAt)] },
      },
    })
    if (!issue) { set.status = 404; return { error: 'Issue not found' } }
    return issue
  })

  // PUT /api/issues/:id
  .put('/:id', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const existing = await db.query.issues.findFirst({ where: eq(issues.id, id) })
    if (!existing) { set.status = 404; return { error: 'Issue not found' } }

    const [updated] = await db.update(issues).set(body).where(eq(issues.id, id)).returning()

    const changes = computeChanges(existing, updated!, [
      'title', 'description', 'type', 'severity', 'priority', 'status',
      'assignedToUserId', 'module', 'environment', 'browser', 'operatingSystem',
    ])

    if (changes.length > 0) {
      logActivity({
        product: updated!.product,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'issue' as any,
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }

    const full = await db.query.issues.findFirst({
      where: eq(issues.id, id),
      with: {
        reportedBy: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedTo: { columns: { id: true, name: true, email: true, avatar: true } },
      },
    })
    return full
  }, { body: issueBody })

  // DELETE /api/issues/:id
  .delete('/:id', async ({ params: { id }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const [deleted] = await db.delete(issues).where(eq(issues.id, id)).returning()
    if (!deleted) { set.status = 404; return { error: 'Issue not found' } }

    logActivity({
      product: deleted.product,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'issue' as any,
      entityId: deleted.id,
      entityTitle: deleted.title,
      changes: null,
    })

    return { success: true }
  })

  // ============ COMMENTS ============

  // GET /api/issues/:id/comments
  .get('/:id/comments', async ({ params: { id } }) => {
    return db.query.issueComments.findMany({
      where: eq(issueComments.issueId, id),
      with: { user: true },
      orderBy: (c, { desc }) => [desc(c.createdAt)],
    })
  })

  // POST /api/issues/:id/comments
  .post('/:id/comments', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const [comment] = await db.insert(issueComments).values({
      issueId: id,
      userId: user.id,
      content: body.content,
    }).returning()

    return db.query.issueComments.findFirst({
      where: eq(issueComments.id, comment!.id),
      with: { user: true },
    })
  }, { body: t.Object({ content: t.String({ minLength: 1 }) }) })

  // DELETE /api/issues/:id/comments/:commentId
  .delete('/:id/comments/:commentId', async ({ params, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const [deleted] = await db.delete(issueComments)
      .where(eq(issueComments.id, params.commentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Comment not found' } }
    return { success: true }
  })

  // ============ ATTACHMENTS ============

  // GET /api/issues/:id/attachments
  .get('/:id/attachments', async ({ params: { id } }) => {
    return db.query.issueAttachments.findMany({
      where: eq(issueAttachments.issueId, id),
      with: { user: true },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    })
  })

  // POST /api/issues/:id/attachments
  .post('/:id/attachments', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
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

    const [attachment] = await db.insert(issueAttachments).values({
      issueId: id,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      filePath: `/uploads/attachments/${uniqueName}`,
    }).returning()

    return db.query.issueAttachments.findFirst({
      where: eq(issueAttachments.id, attachment!.id),
      with: { user: true },
    })
  })

  // DELETE /api/issues/attachments/:attachmentId
  .delete('/attachments/:attachmentId', async ({ params: { attachmentId }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const [deleted] = await db.delete(issueAttachments)
      .where(eq(issueAttachments.id, attachmentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Attachment not found' } }

    try {
      const fullPath = path.join(process.cwd(), deleted.filePath)
      const { unlink } = await import('fs/promises')
      await unlink(fullPath)
    } catch {}

    return { success: true }
  })
