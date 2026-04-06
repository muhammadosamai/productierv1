import { Elysia, t } from 'elysia'
import { db } from '../db'
import { issues, issueComments, issueAttachments, users } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'
import { sendNotificationIfEnabled } from '../services/notificationEmails'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let issueSchemaBootstrapped = false

function optionalUuid(value: string | null | undefined) {
  if (!value) return null
  return UUID_REGEX.test(value) ? value : null
}

async function ensureIssueSchema() {
  if (issueSchemaBootstrapped) return

  await db.execute(sql`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_type') THEN
    CREATE TYPE issue_type AS ENUM ('bug', 'ui_issue', 'performance', 'crash', 'security', 'data_loss', 'other');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_severity') THEN
    CREATE TYPE issue_severity AS ENUM ('blocker', 'critical', 'major', 'minor', 'trivial');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_status') THEN
    CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'deferred');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_priority') THEN
    CREATE TYPE issue_priority AS ENUM ('high', 'medium', 'low');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_reproducibility') THEN
    CREATE TYPE issue_reproducibility AS ENUM ('always', 'sometimes', 'rarely', 'once', 'unable_to_reproduce');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_environment') THEN
    CREATE TYPE issue_environment AS ENUM ('production', 'staging', 'development', 'testing');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_browser') THEN
    CREATE TYPE issue_browser AS ENUM ('chrome', 'firefox', 'safari', 'edge', 'other');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_os') THEN
    CREATE TYPE issue_os AS ENUM ('windows', 'macos', 'linux', 'ios', 'android', 'other');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  public_id varchar(32),
  title varchar(255) NOT NULL,
  description text,
  type issue_type NOT NULL DEFAULT 'bug',
  module varchar(255),
  steps_to_reproduce text,
  expected_behavior text,
  actual_behavior text,
  reproducibility issue_reproducibility,
  severity issue_severity NOT NULL DEFAULT 'minor',
  priority issue_priority NOT NULL DEFAULT 'medium',
  status issue_status NOT NULL DEFAULT 'open',
  assigned_to_user_id uuid,
  reported_by_user_id uuid NOT NULL,
  app_version varchar(50),
  environment issue_environment,
  browser issue_browser,
  operating_system issue_os,
  product varchar(255) NOT NULL,
  story_id uuid,
  task_id uuid,
  test_cycle_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS issue_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  issue_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS issue_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  issue_id uuid NOT NULL,
  user_id uuid NOT NULL,
  file_name varchar(500) NOT NULL,
  file_size integer NOT NULL,
  mime_type varchar(255) NOT NULL,
  file_path varchar(1000) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_comments_issue_id_issues_id_fk') THEN
    ALTER TABLE issue_comments
      ADD CONSTRAINT issue_comments_issue_id_issues_id_fk
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_comments_user_id_users_id_fk') THEN
    ALTER TABLE issue_comments
      ADD CONSTRAINT issue_comments_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_attachments_issue_id_issues_id_fk') THEN
    ALTER TABLE issue_attachments
      ADD CONSTRAINT issue_attachments_issue_id_issues_id_fk
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_attachments_user_id_users_id_fk') THEN
    ALTER TABLE issue_attachments
      ADD CONSTRAINT issue_attachments_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS issues_public_id_unique
  ON issues(public_id)
  WHERE public_id IS NOT NULL;
`)

  issueSchemaBootstrapped = true
}

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
    t.Literal('blocker'), t.Literal('critical'), t.Literal('major'), t.Literal('minor'), t.Literal('trivial'),
  ])),
  priority: t.Optional(t.Union([
    t.Literal('high'), t.Literal('medium'), t.Literal('low'),
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
  .onBeforeHandle(async () => {
    await ensureIssueSchema()
  })

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

    const product = body.product || 'Product'
    const assignedToUserId = optionalUuid(body.assignedToUserId)
    const storyId = optionalUuid(body.storyId)
    const taskId = optionalUuid(body.taskId)
    const testCycleId = optionalUuid(body.testCycleId)

    let issue: typeof issues.$inferSelect | null = null

    const [inserted] = await db.insert(issues).values({
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
      assignedToUserId,
      reportedByUserId: user.id,
      appVersion: body.appVersion,
      environment: body.environment,
      browser: body.browser,
      operatingSystem: body.operatingSystem,
      product,
      storyId,
      taskId,
      testCycleId,
    }).returning()
    issue = inserted || null

    if (!issue) {
      set.status = 500
      return { error: 'Failed to create issue' }
    }

    logActivity({
      product: issue.product,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'issue' as any,
      entityId: issue.id,
      entityTitle: issue.title,
      changes: null,
    })

    // Return with relations
    const full = await db.query.issues.findFirst({
      where: eq(issues.id, issue.id),
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

    const updatePayload: Record<string, any> = { ...body }
    if ('assignedToUserId' in updatePayload) updatePayload.assignedToUserId = optionalUuid(updatePayload.assignedToUserId)
    if ('storyId' in updatePayload) updatePayload.storyId = optionalUuid(updatePayload.storyId)
    if ('taskId' in updatePayload) updatePayload.taskId = optionalUuid(updatePayload.taskId)
    if ('testCycleId' in updatePayload) updatePayload.testCycleId = optionalUuid(updatePayload.testCycleId)

    const [updated] = await db.update(issues).set(updatePayload).where(eq(issues.id, id)).returning()

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

    // Notification: assignee changed
    if (body.assignedToUserId && body.assignedToUserId !== existing.assignedToUserId) {
      const assigneeId = optionalUuid(body.assignedToUserId)
      if (assigneeId) {
        sendNotificationIfEnabled({
          targetUserId: assigneeId,
          actorUserId: user.id,
          eventType: 'assigned',
          entityType: 'issue',
          entityTitle: updated!.title,
          entityPath: `/issues?issue=${updated!.id}`,
        }).catch(() => {})
      }
    }

    // Notification: status changed
    if (body.status && body.status !== existing.status) {
      const notifyIds = new Set<string>()
      if (existing.assignedToUserId) notifyIds.add(existing.assignedToUserId)
      if (existing.reportedByUserId) notifyIds.add(existing.reportedByUserId)
      for (const uid of notifyIds) {
        sendNotificationIfEnabled({
          targetUserId: uid,
          actorUserId: user.id,
          eventType: 'status_change',
          entityType: 'issue',
          entityTitle: updated!.title,
          entityPath: `/issues?issue=${updated!.id}`,
          details: body.status,
        }).catch(() => {})
      }
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

    const issue = await db.query.issues.findFirst({ where: eq(issues.id, id) })

    const [comment] = await db.insert(issueComments).values({
      issueId: id,
      userId: user.id,
      content: body.content,
    }).returning()

    // Notify assignee and reporter about the comment
    if (issue) {
      const notifyIds = new Set<string>()
      if (issue.assignedToUserId) notifyIds.add(issue.assignedToUserId)
      if (issue.reportedByUserId) notifyIds.add(issue.reportedByUserId)
      const preview = body.content.length > 100 ? body.content.slice(0, 100) + '...' : body.content
      for (const uid of notifyIds) {
        sendNotificationIfEnabled({
          targetUserId: uid,
          actorUserId: user.id,
          eventType: 'comment',
          entityType: 'issue',
          entityTitle: issue.title,
          entityPath: `/issues?issue=${issue.id}`,
          details: preview,
        }).catch(() => {})
      }
    }

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
