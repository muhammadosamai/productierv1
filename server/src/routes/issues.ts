import { Elysia, t } from 'elysia'
import { db } from '../db'
import { issues, issueComments, issueAttachments, users, productMembers } from '../db/schema'
import { eq, sql, and, asc, isNotNull, ne } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'
import { validateAttachmentFileName, validateAttachmentContent } from '../lib/allowedAttachments'
import { sendNotificationIfEnabled } from '../services/notificationEmails'
import { recomputeStoryStatus } from '../lib/storyStatus'
import {
  getAllowedIssueStatusStoredValues,
  mergeIssueFormConfigForProduct,
  normalizeIssueStatusToCanonicalId,
  pickDefaultIssueStatus,
} from '../lib/issueFormConfig'
import { ensureFormConfigsSchema } from '../lib/ensureFormConfigsSchema'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let issueSchemaBootstrapped = false

function optionalUuid(value: string | null | undefined) {
  if (!value) return null
  return UUID_REGEX.test(value) ? value : null
}

async function isProductAdmin(userId: string, product: string): Promise<boolean> {
  const member = await db.query.productMembers.findFirst({
    where: and(eq(productMembers.product, product), eq(productMembers.userId, userId)),
  })
  return member?.role === 'admin'
}

/** Product member admin or super_admin — same bar as invites. */
async function canManageIssueArchive(user: { id: string; role: string } | null, product: string): Promise<boolean> {
  if (!user) return false
  if (user.role === 'super_admin') return true
  return isProductAdmin(user.id, product)
}

/** Resolves issue row or null if missing / archived without admin access. */
async function issueRowForAccess(
  id: string,
  user: { id: string; role: string } | null,
): Promise<{ id: string; product: string; archived: boolean } | null> {
  const row = await db.query.issues.findFirst({
    where: eq(issues.id, id),
    columns: { id: true, product: true, archived: true },
  })
  if (!row) return null
  if (row.archived && !(await canManageIssueArchive(user, row.product))) return null
  return row
}

/** Issue attachments: authenticated product member (or super_admin); archived needs archive manager. */
async function userCanAccessIssueAttachments(
  user: { id: string; role: string } | null,
  issueId: string,
): Promise<boolean> {
  if (!user) return false
  const row = await db.query.issues.findFirst({
    where: eq(issues.id, issueId),
    columns: { id: true, product: true, archived: true },
  })
  if (!row) return false
  if (row.archived && !(await canManageIssueArchive(user, row.product))) return false
  if (user.role === 'super_admin') return true
  const member = await db.query.productMembers.findFirst({
    where: and(eq(productMembers.product, row.product), eq(productMembers.userId, user.id)),
  })
  return !!member
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
  status varchar(64) NOT NULL DEFAULT 'a64cad55-e8d5-5903-9096-31b2ee5f5b5c',
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

  await db.execute(sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;`)

  // Legacy: issues.status was issue_status enum; migrate to varchar for custom statuses.
  await db.execute(sql`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'issues' AND column_name = 'status'
      AND udt_name = 'issue_status'
  ) THEN
    ALTER TABLE issues ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE issues ALTER COLUMN status TYPE varchar(64) USING (status::text);
    ALTER TABLE issues ALTER COLUMN status SET DEFAULT 'a64cad55-e8d5-5903-9096-31b2ee5f5b5c';
  END IF;
END $$;
`)

  issueSchemaBootstrapped = true
}

const issueBodyShared = {
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
  status: t.Optional(t.Nullable(t.String({ maxLength: 64 }))),
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
} as const

const issueCreateBody = t.Object({
  title: t.String({ minLength: 1 }),
  ...issueBodyShared,
})

/** Partial update: all fields optional (e.g. status-only from the detail panel). */
const issueUpdateBody = t.Object({
  title: t.Optional(t.String({ minLength: 1 })),
  archived: t.Optional(t.Boolean()),
  ...issueBodyShared,
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
    await ensureFormConfigsSchema()
  })

  // GET /api/issues?product=X&testCycleId=X&includeArchived=true (admins only, requires product when not super_admin)
  .get('/', async ({ query, headers, jwt: jwtInstance }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    const productFilter = query.product?.trim()
    const wantsArchived = String(query.includeArchived ?? '') === 'true'

    let includeArchived = false
    if (wantsArchived && user) {
      if (user.role === 'super_admin') {
        includeArchived = true
      } else if (productFilter && (await isProductAdmin(user.id, productFilter))) {
        includeArchived = true
      }
    }

    const conditions = []
    if (productFilter) conditions.push(eq(issues.product, productFilter))
    if (query.testCycleId) conditions.push(eq(issues.testCycleId, query.testCycleId))
    if (!includeArchived) conditions.push(eq(issues.archived, false))

    const all = await db.query.issues.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: {
        reportedBy: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedTo: { columns: { id: true, name: true, email: true, avatar: true } },
        testCycle: { columns: { id: true, name: true } },
        story: { columns: { id: true, title: true, status: true } },
      },
      orderBy: (items, { desc }) => [desc(items.createdAt)],
    })
    return all
  })

  // POST /api/issues
  .post('/', async ({ body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const product = body.product || 'Product'
    const merged = await mergeIssueFormConfigForProduct(product)
    const allowedList = getAllowedIssueStatusStoredValues(merged)
    const allowedSet = new Set(allowedList)

    let statusVal: string
    if (body.status != null && body.status !== '') {
      const raw = String(body.status).trim()
      if (!allowedSet.has(raw)) {
        set.status = 400
        return { error: `Invalid status for this product. Allowed: ${allowedList.join(', ')}` }
      }
      statusVal = normalizeIssueStatusToCanonicalId(merged, raw) ?? raw
    } else {
      statusVal = pickDefaultIssueStatus(merged)
    }

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
      status: statusVal,
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
        story: { columns: { id: true, title: true, status: true } },
      },
    })

    // Trigger story status recompute if linked to a story
    if (storyId) recomputeStoryStatus(storyId).catch(() => {})

    return full
  }, { body: issueCreateBody })

  // GET /api/issues/by-story/:storyId
  .get('/by-story/:storyId', async ({ params: { storyId } }) => {
    return db.query.issues.findMany({
      where: and(eq(issues.storyId, storyId), eq(issues.archived, false)),
      with: {
        reportedBy: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedTo: { columns: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: (items, { desc }) => [desc(items.createdAt)],
    })
  })

  // GET /api/issues/distinct-modules?product=X — non-null module names for autocomplete (must be before /:id)
  .get('/distinct-modules', async ({ query, set, headers, jwt: jwtInstance }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const product = query.product?.trim()
    if (!product) {
      set.status = 400
      return { error: 'product query parameter is required' }
    }
    const rows = await db
      .select({ module: issues.module })
      .from(issues)
      .where(
        and(
          eq(issues.product, product),
          eq(issues.archived, false),
          isNotNull(issues.module),
          ne(sql`trim(${issues.module})`, ''),
        ),
      )
      .groupBy(issues.module)
      .orderBy(asc(issues.module))
      .limit(200)
    return rows.map(r => r.module as string)
  })

  // GET /api/issues/:id
  .get('/:id', async ({ params: { id }, set, headers, jwt: jwtInstance }) => {
    const issue = await db.query.issues.findFirst({
      where: eq(issues.id, id),
      with: {
        reportedBy: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedTo: { columns: { id: true, name: true, email: true, avatar: true } },
        testCycle: { columns: { id: true, name: true } },
        story: { columns: { id: true, title: true, status: true } },
        comments: { with: { user: true }, orderBy: (c, { desc }) => [desc(c.createdAt)] },
      },
    })
    if (!issue) { set.status = 404; return { error: 'Issue not found' } }
    if (issue.archived) {
      const user = await getUserFromHeader(jwtInstance.verify, headers)
      if (!(await canManageIssueArchive(user, issue.product))) {
        set.status = 404
        return { error: 'Issue not found' }
      }
    }
    return issue
  })

  // PUT /api/issues/:id
  .put('/:id', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const existing = await db.query.issues.findFirst({ where: eq(issues.id, id) })
    if (!existing) { set.status = 404; return { error: 'Issue not found' } }

    const canArchive = await canManageIssueArchive(user, existing.product)

    if (existing.archived && !canArchive) {
      set.status = 403
      return { error: 'Cannot modify an archived issue' }
    }

    if ('archived' in body && body.archived !== existing.archived && !canArchive) {
      set.status = 403
      return { error: 'Only product admins can change archive status' }
    }

    const merged = await mergeIssueFormConfigForProduct(existing.product)
    const allowedList = getAllowedIssueStatusStoredValues(merged)

    if (body.status !== undefined && body.status !== null) {
      const raw = String(body.status).trim()
      if (!allowedList.includes(raw)) {
        set.status = 400
        return { error: `Invalid status for this product. Allowed: ${allowedList.join(', ')}` }
      }
    }

    const updatePayload: Record<string, any> = { ...body }
    if (body.status !== undefined && body.status !== null) {
      const raw = String(body.status).trim()
      updatePayload.status = normalizeIssueStatusToCanonicalId(merged, raw) ?? raw
    }
    if ('assignedToUserId' in updatePayload) updatePayload.assignedToUserId = optionalUuid(updatePayload.assignedToUserId)
    if ('storyId' in updatePayload) updatePayload.storyId = optionalUuid(updatePayload.storyId)
    if ('taskId' in updatePayload) updatePayload.taskId = optionalUuid(updatePayload.taskId)
    if ('testCycleId' in updatePayload) updatePayload.testCycleId = optionalUuid(updatePayload.testCycleId)

    const [updated] = await db.update(issues).set(updatePayload).where(eq(issues.id, id)).returning()

    const changes = computeChanges(existing, updated!, [
      'title', 'description', 'type', 'severity', 'priority', 'status',
      'assignedToUserId', 'module', 'environment', 'browser', 'operatingSystem', 'archived',
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
        story: { columns: { id: true, title: true, status: true } },
      },
    })

    // Trigger story status recompute
    const affectedStoryId = updatePayload.storyId ?? existing.storyId
    if (affectedStoryId) recomputeStoryStatus(affectedStoryId).catch(() => {})
    // If storyId was cleared, recompute the old story too
    if ('storyId' in updatePayload && updatePayload.storyId !== existing.storyId && existing.storyId) {
      recomputeStoryStatus(existing.storyId).catch(() => {})
    }

    return full
  }, { body: issueUpdateBody })

  // DELETE /api/issues/:id
  .delete('/:id', async ({ params: { id }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const existingDel = await db.query.issues.findFirst({ where: eq(issues.id, id) })
    if (!existingDel) { set.status = 404; return { error: 'Issue not found' } }
    if (existingDel.archived && !(await canManageIssueArchive(user, existingDel.product))) {
      set.status = 403
      return { error: 'Only product admins can delete archived issues' }
    }

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

    // Recompute story status if this issue was linked to a story
    if (deleted.storyId) recomputeStoryStatus(deleted.storyId).catch(() => {})

    return { success: true }
  })

  // ============ COMMENTS ============

  // GET /api/issues/:id/comments
  .get('/:id/comments', async ({ params: { id }, set, headers, jwt: jwtInstance }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!(await issueRowForAccess(id, user))) {
      set.status = 404
      return { error: 'Issue not found' }
    }
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

    const accessible = await issueRowForAccess(id, user)
    if (!accessible) {
      set.status = 404
      return { error: 'Issue not found' }
    }

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

    if (!(await issueRowForAccess(params.id, user))) {
      set.status = 404
      return { error: 'Issue not found' }
    }

    const [deleted] = await db.delete(issueComments)
      .where(eq(issueComments.id, params.commentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Comment not found' } }
    return { success: true }
  })

  // ============ ATTACHMENTS ============

  // GET /api/issues/attachments/:attachmentId/download — stream file with correct name/type (avoids SPA /uploads → .htm)
  .get('/attachments/:attachmentId/download', async ({ params: { attachmentId }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const att = await db.query.issueAttachments.findFirst({ where: eq(issueAttachments.id, attachmentId) })
    if (!att || !(await userCanAccessIssueAttachments(user, att.issueId))) {
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

  // GET /api/issues/:id/attachments
  .get('/:id/attachments', async ({ params: { id }, set, headers, jwt: jwtInstance }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!(await userCanAccessIssueAttachments(user, id))) {
      set.status = 404
      return { error: 'Issue not found' }
    }
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

    if (!(await userCanAccessIssueAttachments(user, id))) {
      set.status = 404
      return { error: 'Issue not found' }
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

    const [attachment] = await db.insert(issueAttachments).values({
      issueId: id,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: contentCheck.mime,
      filePath: `/uploads/attachments/${uniqueName}`,
    }).returning()

    const issueForLog = await db.query.issues.findFirst({ where: eq(issues.id, id) })
    if (issueForLog) {
      logActivity({
        product: issueForLog.product,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'issue' as any,
        entityId: issueForLog.id,
        entityTitle: issueForLog.title,
        changes: [{ field: 'attachment', from: null, to: file.name }],
      })
    }

    return db.query.issueAttachments.findFirst({
      where: eq(issueAttachments.id, attachment!.id),
      with: { user: true },
    })
  })

  // DELETE /api/issues/attachments/:attachmentId
  .delete('/attachments/:attachmentId', async ({ params: { attachmentId }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const att = await db.query.issueAttachments.findFirst({ where: eq(issueAttachments.id, attachmentId) })
    if (!att || !(await userCanAccessIssueAttachments(user, att.issueId))) {
      set.status = 404
      return { error: 'Attachment not found' }
    }

    const [deleted] = await db.delete(issueAttachments)
      .where(eq(issueAttachments.id, attachmentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Attachment not found' } }

    const issueForLog = await db.query.issues.findFirst({ where: eq(issues.id, deleted.issueId) })
    if (issueForLog) {
      logActivity({
        product: issueForLog.product,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'issue' as any,
        entityId: issueForLog.id,
        entityTitle: issueForLog.title,
        changes: [{ field: 'attachment', from: deleted.fileName, to: null }],
      })
    }

    try {
      const rel = deleted.filePath.replace(/^\/+/, '')
      const fullPath = path.join(process.cwd(), rel)
      const { unlink } = await import('fs/promises')
      await unlink(fullPath)
    } catch {}

    return { success: true }
  })
