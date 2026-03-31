import { Elysia, t } from 'elysia'
import { db } from '../db'
import { tasks, taskComments, taskAttachments, stories, deliveries, taskStatusHistory } from '../db/schema'
import { randomUUID } from 'crypto'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { logActivity, computeChanges } from '../lib/logActivity'
import { authPlugin } from '../plugins/auth'
import { getEffectivePagePermissionForUser, isGlobalAdminRole, requireAuth, requireProductPageAction } from '../lib/authz'
import { publicUserColumns } from '../lib/serializers'
import { invalidateMetricsForProduct } from '../lib/metricsCache'
import { getStorage } from '../storage'
import {
  decodeCursor,
  encodeCursor,
  isLegacyListMode,
  parseListQuery,
  parseSort,
  toListEnvelope,
} from '../lib/listContract'
import { removeSearchDocument, upsertTaskSearchDocument } from '../lib/search/searchIndex'
import { isTaskSelfVisible, taskSelfViewCondition } from '../lib/selfViewScope'
import {
  normalizeAssignmentIds,
  resolveProductOrganizationId,
  resolveUserTeamIdsForProduct,
  validateDualAssignmentTargets,
} from '../lib/assignmentTargets'

const TASK_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024
const TASK_ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const
const TASK_ATTACHMENT_ALLOWED_MIME_SET = new Set<string>(TASK_ATTACHMENT_ALLOWED_MIME_TYPES)

function buildTaskAttachmentDownloadPath(attachmentId: string): string {
  return `/api/tasks/attachments/${attachmentId}/download`
}

type TaskInvariantDbClient = Pick<typeof db, 'query' | 'update'>

const taskBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  status: t.Optional(t.Union([
    t.Literal('created'), t.Literal('assigned'), t.Literal('in_progress'),
    t.Literal('in_review'), t.Literal('done'), t.Literal('overdue'), t.Literal('blocked'),
    t.Literal('archived')
  ])),
  priority: t.Optional(t.Union([
    t.Literal('low'), t.Literal('medium'),
    t.Literal('high'), t.Literal('critical')
  ])),
  type: t.Optional(t.Nullable(t.Union([
    t.Literal('design'), t.Literal('development'), t.Literal('testing'),
    t.Literal('review'), t.Literal('research'), t.Literal('fix'),
    t.Literal('documentation'), t.Literal('deployment')
  ]))),
  ownerUserId: t.Optional(t.Nullable(t.String())),
  ownerTeamId: t.Optional(t.Nullable(t.String())),
  assigneeUserIds: t.Optional(t.Nullable(t.Array(t.String()))),
  assigneeTeamIds: t.Optional(t.Nullable(t.Array(t.String()))),
  reviewerUserIds: t.Optional(t.Nullable(t.Array(t.String()))),
  reviewerTeamIds: t.Optional(t.Nullable(t.Array(t.String()))),
  estimateValue: t.Optional(t.Nullable(t.Number())),
  dependent: t.Optional(t.Nullable(t.Array(t.String()))),
  blockedReason: t.Optional(t.Nullable(t.String())),
  parentTaskId: t.Optional(t.Nullable(t.String())),
  deliveryId: t.Optional(t.Nullable(t.String())),
  dueAt: t.Optional(t.Nullable(t.String())),
})

/** Check if a task has any role assigned (owner, assignee, or reviewer) */
function hasAnyRoleAssigned(task: Record<string, any>): boolean {
  return !!(
    task.ownerUserId ||
    task.ownerTeamId ||
    (task.assigneeUserIds && task.assigneeUserIds.length > 0) ||
    (task.assigneeTeamIds && task.assigneeTeamIds.length > 0) ||
    (task.reviewerUserIds && task.reviewerUserIds.length > 0) ||
    (task.reviewerTeamIds && task.reviewerTeamIds.length > 0)
  )
}

async function validateParentTaskLink(input: {
  productId: string
  storyId: string
  parentTaskId?: string | null
  currentTaskId?: string | null
}): Promise<{ ok: true; parentTaskId: string | null } | { ok: false; error: string }> {
  const normalizedParentTaskId = typeof input.parentTaskId === 'string' && input.parentTaskId.trim().length > 0
    ? input.parentTaskId.trim()
    : null
  if (!normalizedParentTaskId) {
    return { ok: true, parentTaskId: null }
  }
  if (input.currentTaskId && normalizedParentTaskId === input.currentTaskId) {
    return { ok: false, error: 'Task cannot be its own parent' }
  }

  const parentTask = await db.query.tasks.findFirst({
    where: eq(tasks.id, normalizedParentTaskId),
    columns: {
      id: true,
      productId: true,
      storyId: true,
      parentTaskId: true,
    },
  })
  if (!parentTask) {
    return { ok: false, error: 'Parent task not found' }
  }
  if (parentTask.productId !== input.productId) {
    return { ok: false, error: 'Parent task must belong to the same product' }
  }
  if (parentTask.storyId !== input.storyId) {
    return { ok: false, error: 'Parent task must belong to the same story' }
  }

  if (input.currentTaskId) {
    const seen = new Set<string>([parentTask.id])
    let cursor = parentTask.parentTaskId
    while (cursor) {
      if (cursor === input.currentTaskId) {
        return { ok: false, error: 'Parent task would create a cycle' }
      }
      if (seen.has(cursor)) break
      seen.add(cursor)
      const ancestor = await db.query.tasks.findFirst({
        where: eq(tasks.id, cursor),
        columns: { parentTaskId: true },
      })
      if (!ancestor) break
      cursor = ancestor.parentTaskId
    }
  }

  return { ok: true, parentTaskId: parentTask.id }
}

/**
 * Auto-update delivery status based on its tasks:
 * - "initialized" -> no active work started yet
 * - "in_progress" -> active work exists
 * - "blocked"     -> any task is blocked
 * - "overdue"     -> any task is overdue
 * - "completed"   -> all tasks are done
 */
async function autoUpdateDeliveryStatus(deliveryId: string, dbClient: TaskInvariantDbClient = db) {
  const delivery = await dbClient.query.deliveries.findFirst({ where: eq(deliveries.id, deliveryId) })
  if (!delivery) return

  // Skip if delivery is manually archived
  if (delivery.status === 'archived') return

  const taskList = await dbClient.query.tasks.findMany({
    where: eq(tasks.deliveryId, deliveryId),
    columns: { id: true, status: true },
  })

  if (taskList.length === 0) {
    // No tasks — keep as initialized
    if (delivery.status !== 'initialized') {
      await dbClient.update(deliveries).set({ status: 'initialized', updatedAt: new Date() }).where(eq(deliveries.id, deliveryId))
    }
    return
  }

  const hasInProgress = taskList.some(t => t.status === 'in_progress' || t.status === 'in_review')
  const hasBlocked = taskList.some(t => t.status === 'blocked')
  const hasOverdue = taskList.some(t => t.status === 'overdue')
  const allDone = taskList.every(t => t.status === 'done')

  let newStatus: typeof deliveries.$inferSelect['status']

  if (allDone) {
    newStatus = 'completed'
  } else if (hasBlocked) {
    newStatus = 'blocked'
  } else if (hasOverdue) {
    newStatus = 'overdue'
  } else if (hasInProgress) {
    newStatus = 'in_progress'
  } else {
    newStatus = 'initialized'
  }

  if (delivery.status !== newStatus) {
    await dbClient.update(deliveries).set({ status: newStatus, updatedAt: new Date() }).where(eq(deliveries.id, deliveryId))
  }
}

/**
 * Auto-update story's estimate and delivery fields based on child tasks.
 * - estimate = sum of all child tasks' estimateValue (stored as string)
 * - delivery = comma-separated list of unique delivery titles linked via child tasks
 */
async function autoUpdateStoryFromTasks(storyId: string, dbClient: TaskInvariantDbClient = db) {
  const taskList = await dbClient.query.tasks.findMany({
    where: eq(tasks.storyId, storyId),
    columns: { estimateValue: true, deliveryId: true },
  })

  // Sum estimates from all child tasks
  const totalEstimate = taskList.reduce((sum, t) => sum + (t.estimateValue || 0), 0)
  const estimateStr = totalEstimate > 0 ? String(totalEstimate) : null

  // Collect unique delivery names from child tasks
  const uniqueDeliveryIds = [...new Set(taskList.map(t => t.deliveryId).filter(Boolean))] as string[]
  let deliveryStr: string | null = null
  if (uniqueDeliveryIds.length > 0) {
    const deliveryRecords = await Promise.all(
      uniqueDeliveryIds.map(id =>
        dbClient.query.deliveries.findFirst({
          where: eq(deliveries.id, id),
          columns: { title: true },
        })
      )
    )
    const names = deliveryRecords.filter(Boolean).map(d => d!.title)
    deliveryStr = names.length > 0 ? names.join(', ') : null
  }

  await dbClient.update(stories)
    .set({ estimate: estimateStr, delivery: deliveryStr, updatedAt: new Date() })
    .where(eq(stories.id, storyId))
}

// Auto-compute story status based on child task states
// backlog → no tasks
// drafted → tasks exist but none assigned
// initialized → at least one task assigned to a user
// in_progress → at least one task in_progress/in_review
// completed → all tasks done
// (archived is manual only)
async function recomputeStoryStatus(storyId: string, dbClient: TaskInvariantDbClient = db) {
  const story = await dbClient.query.stories.findFirst({
    where: eq(stories.id, storyId),
    columns: { status: true },
  })
  if (!story || story.status === 'archived') return // don't override archive

  const taskList = await dbClient.query.tasks.findMany({
    where: eq(tasks.storyId, storyId),
    columns: {
      status: true,
      ownerUserId: true,
      ownerTeamId: true,
      assigneeUserIds: true,
      assigneeTeamIds: true,
    },
  })

  let newStatus: typeof stories.$inferSelect['status']

  if (taskList.length === 0) {
    newStatus = 'backlog'
  } else {
    const allDone = taskList.every(t => t.status === 'done' || t.status === 'archived')
    const anyInProgress = taskList.some(t => t.status === 'in_progress' || t.status === 'in_review')
    const anyAssigned = taskList.some(t =>
      t.ownerUserId ||
      t.ownerTeamId ||
      (t.assigneeUserIds && t.assigneeUserIds.length > 0) ||
      (t.assigneeTeamIds && t.assigneeTeamIds.length > 0)
    )

    if (allDone) {
      newStatus = 'completed'
    } else if (anyInProgress) {
      newStatus = 'in_progress'
    } else if (anyAssigned) {
      newStatus = 'initialized'
    } else {
      newStatus = 'drafted'
    }
  }

  if (newStatus !== story.status) {
    await dbClient.update(stories)
      .set({ status: newStatus as any, updatedAt: new Date() })
      .where(eq(stories.id, storyId))
  }
}

export const taskRoutes = new Elysia({ prefix: '/api/tasks' })
  .use(authPlugin)

  // GET /api/tasks?productId=X[&storyId=&status=&q=&limit=&cursor=&sort=]
  .get('/', async ({ query, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = query.productId as string | undefined
    if (!productId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId,
      page: 'tasks',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'tasks')
    const selfVisibleTeamIds = !isGlobalAdminRole(access.user.role) && permission.selfViewOnly
      ? await resolveUserTeamIdsForProduct(productId, access.user.id)
      : []

    const parsedList = parseListQuery(query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100,
    })
    const legacyMode = isLegacyListMode(parsedList)
    const sort = parseSort(parsedList.sort, ['createdAt', 'updatedAt'] as const, {
      field: 'updatedAt',
      direction: 'desc',
      raw: 'updatedAt:desc',
    })
    const cursor = legacyMode ? null : decodeCursor(parsedList.cursor)
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const qTerm = q.length > 0 ? q : null

    const baseConditions = [eq(tasks.productId, productId)]
    if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly) {
      baseConditions.push(taskSelfViewCondition(access.user.id, selfVisibleTeamIds))
    }
    if (typeof query.storyId === 'string' && query.storyId) {
      baseConditions.push(eq(tasks.storyId, query.storyId))
    }
    if (typeof query.deliveryId === 'string' && query.deliveryId) {
      baseConditions.push(eq(tasks.deliveryId, query.deliveryId))
    }
    if (typeof query.status === 'string' && query.status) {
      baseConditions.push(eq(tasks.status, query.status as any))
    }
    if (qTerm) {
      baseConditions.push(or(
        ilike(tasks.title, `%${qTerm}%`),
        ilike(tasks.description, `%${qTerm}%`),
        ilike(tasks.blockedReason, `%${qTerm}%`),
      )!)
    }

    const conditions = [...baseConditions]
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt)
      if (!Number.isNaN(cursorDate.getTime())) {
        if (sort.field === 'updatedAt') {
          if (sort.direction === 'desc') {
            conditions.push(sql`(${tasks.updatedAt} < ${cursorDate} OR (${tasks.updatedAt} = ${cursorDate} AND ${tasks.id} < ${cursor.id}))`)
          } else {
            conditions.push(sql`(${tasks.updatedAt} > ${cursorDate} OR (${tasks.updatedAt} = ${cursorDate} AND ${tasks.id} > ${cursor.id}))`)
          }
        } else if (sort.direction === 'desc') {
          conditions.push(sql`(${tasks.createdAt} < ${cursorDate} OR (${tasks.createdAt} = ${cursorDate} AND ${tasks.id} < ${cursor.id}))`)
        } else {
          conditions.push(sql`(${tasks.createdAt} > ${cursorDate} OR (${tasks.createdAt} = ${cursorDate} AND ${tasks.id} > ${cursor.id}))`)
        }
      }
    }

    const orderField = sort.field === 'updatedAt' ? tasks.updatedAt : tasks.createdAt
    const baseLimit = legacyMode ? 100 : parsedList.limit
    const rows = await db.select({
      id: tasks.id,
      productId: tasks.productId,
      initiativeId: tasks.initiativeId,
      storyId: tasks.storyId,
      parentTaskId: tasks.parentTaskId,
      deliveryId: tasks.deliveryId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      type: tasks.type,
      ownerUserId: tasks.ownerUserId,
      ownerTeamId: tasks.ownerTeamId,
      assigneeUserIds: tasks.assigneeUserIds,
      assigneeTeamIds: tasks.assigneeTeamIds,
      reviewerUserIds: tasks.reviewerUserIds,
      reviewerTeamIds: tasks.reviewerTeamIds,
      createdByUserId: tasks.createdByUserId,
      estimateValue: tasks.estimateValue,
      dependent: tasks.dependent,
      blockedReason: tasks.blockedReason,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
      dueAt: tasks.dueAt,
    }).from(tasks)
      .where(and(...conditions))
      .orderBy(
        sort.direction === 'desc' ? desc(orderField) : asc(orderField),
        sort.direction === 'desc' ? desc(tasks.id) : asc(tasks.id),
      )
      .limit(legacyMode ? baseLimit : baseLimit + 1)

    if (legacyMode) {
      return rows
    }

    const hasMore = rows.length > baseLimit
    const items = hasMore ? rows.slice(0, baseLimit) : rows
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
      }).from(tasks).where(and(...baseConditions))
      totalApprox = Number(countRow?.value ?? 0)
    }

    return toListEnvelope({
      items,
      hasMore,
      nextCursor,
      totalApprox,
    })
  })

  // GET /api/tasks/by-story/:storyId
  .get('/by-story/:storyId', async ({ params: { storyId }, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const story = await db.query.stories.findFirst({
      where: eq(stories.id, storyId),
      columns: { id: true, productId: true },
    })
    if (!story) { set.status = 404; return { error: 'Story not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: story.productId,
      page: 'tasks',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'tasks')
    const selfVisibleTeamIds = !isGlobalAdminRole(access.user.role) && permission.selfViewOnly
      ? await resolveUserTeamIdsForProduct(story.productId, access.user.id)
      : []

    return db.query.tasks.findMany({
      where: !isGlobalAdminRole(access.user.role) && permission.selfViewOnly
        ? and(eq(tasks.storyId, storyId), taskSelfViewCondition(access.user.id, selfVisibleTeamIds))
        : eq(tasks.storyId, storyId),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
      with: {
        comments: { with: { user: { columns: publicUserColumns } } },
        createdByUser: { columns: publicUserColumns },
      },
    })
  })

  // POST /api/tasks/by-story/:storyId
  .post('/by-story/:storyId', async ({ params: { storyId }, body, set, jwt: jwtInstance, headers }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const story = await db.query.stories.findFirst({
      where: eq(stories.id, storyId),
    })
    if (!story) { set.status = 404; return { error: 'Story not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: story.productId,
      page: 'tasks',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const { dueAt, parentTaskId, ...rest } = body
    const normalizedAssigneeUserIds = normalizeAssignmentIds(rest.assigneeUserIds)
    const normalizedAssigneeTeamIds = normalizeAssignmentIds(rest.assigneeTeamIds)
    const normalizedReviewerUserIds = normalizeAssignmentIds(rest.reviewerUserIds)
    const normalizedReviewerTeamIds = normalizeAssignmentIds(rest.reviewerTeamIds)
    const parentTaskValidation = await validateParentTaskLink({
      productId: story.productId,
      storyId,
      parentTaskId,
    })
    if (!parentTaskValidation.ok) {
      set.status = 400
      return { error: parentTaskValidation.error }
    }
    const organizationId = await resolveProductOrganizationId(story.productId)
    const assignmentValidation = await validateDualAssignmentTargets({
      organizationId,
      userIds: [rest.ownerUserId, ...normalizedAssigneeUserIds, ...normalizedReviewerUserIds],
      teamIds: [rest.ownerTeamId, ...normalizedAssigneeTeamIds, ...normalizedReviewerTeamIds],
    })
    if (!assignmentValidation.ok) {
      set.status = assignmentValidation.status || 400
      return { error: assignmentValidation.error || 'Invalid assignment targets' }
    }

    // Auto-transition: if any role is assigned at creation, set status to 'assigned'
    const effectiveStatus = hasAnyRoleAssigned({
      ...rest,
      assigneeUserIds: normalizedAssigneeUserIds,
      assigneeTeamIds: normalizedAssigneeTeamIds,
      reviewerUserIds: normalizedReviewerUserIds,
      reviewerTeamIds: normalizedReviewerTeamIds,
    }) ? 'assigned' : 'created'

    const task = await db.transaction(async (tx) => {
      const [createdTask] = await tx.insert(tasks)
        .values({
          ...rest,
          status: rest.status || effectiveStatus,
          storyId,
          productId: story.productId,
          initiativeId: null, // auto-derive later when initiatives have proper FK
          createdByUserId: user.id,
          parentTaskId: parentTaskValidation.parentTaskId,
          ownerUserId: rest.ownerUserId || null,
          ownerTeamId: rest.ownerTeamId || null,
          assigneeUserIds: normalizedAssigneeUserIds.length > 0 ? normalizedAssigneeUserIds : null,
          assigneeTeamIds: normalizedAssigneeTeamIds.length > 0 ? normalizedAssigneeTeamIds : null,
          reviewerUserIds: normalizedReviewerUserIds.length > 0 ? normalizedReviewerUserIds : null,
          reviewerTeamIds: normalizedReviewerTeamIds.length > 0 ? normalizedReviewerTeamIds : null,
          dueAt: dueAt ? new Date(dueAt) : null,
        })
        .returning()

      // Record initial status in history
      await tx.insert(taskStatusHistory).values({
        taskId: createdTask!.id,
        productId: createdTask!.productId,
        fromStatus: null,
        toStatus: createdTask!.status,
        changedByUserId: user.id,
      })

      // Keep aggregate delivery/story invariants in the same write transaction.
      if (createdTask!.deliveryId) {
        await autoUpdateDeliveryStatus(createdTask!.deliveryId, tx)
      }
      await autoUpdateStoryFromTasks(storyId, tx)
      await recomputeStoryStatus(storyId, tx)

      return createdTask!
    })

    logActivity({
      productId: story.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'task',
      entityId: task.id,
      entityTitle: task.title,
    })

    await upsertTaskSearchDocument(task.id)
    await invalidateMetricsForProduct(task.productId)

    return task
  }, { body: taskBody })

  // PUT /api/tasks/:id
  .put('/:id', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const old = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
    if (!old) { set.status = 404; return { error: 'Task not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: old.productId,
      page: 'tasks',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const user = access.user

    const { dueAt, parentTaskId, ...rest } = body
    const updateData: Record<string, any> = { ...rest, updatedAt: new Date() }
    const organizationId = await resolveProductOrganizationId(old.productId)

    const candidateOwnerUserId = rest.ownerUserId !== undefined ? rest.ownerUserId : old.ownerUserId
    const candidateOwnerTeamId = rest.ownerTeamId !== undefined ? rest.ownerTeamId : old.ownerTeamId
    const candidateAssigneeUserIds = rest.assigneeUserIds !== undefined
      ? normalizeAssignmentIds(rest.assigneeUserIds)
      : normalizeAssignmentIds(old.assigneeUserIds)
    const candidateAssigneeTeamIds = rest.assigneeTeamIds !== undefined
      ? normalizeAssignmentIds(rest.assigneeTeamIds)
      : normalizeAssignmentIds(old.assigneeTeamIds)
    const candidateReviewerUserIds = rest.reviewerUserIds !== undefined
      ? normalizeAssignmentIds(rest.reviewerUserIds)
      : normalizeAssignmentIds(old.reviewerUserIds)
    const candidateReviewerTeamIds = rest.reviewerTeamIds !== undefined
      ? normalizeAssignmentIds(rest.reviewerTeamIds)
      : normalizeAssignmentIds(old.reviewerTeamIds)

    const assignmentValidation = await validateDualAssignmentTargets({
      organizationId,
      userIds: [candidateOwnerUserId, ...candidateAssigneeUserIds, ...candidateReviewerUserIds],
      teamIds: [candidateOwnerTeamId, ...candidateAssigneeTeamIds, ...candidateReviewerTeamIds],
    })
    if (!assignmentValidation.ok) {
      set.status = assignmentValidation.status || 400
      return { error: assignmentValidation.error || 'Invalid assignment targets' }
    }

    const resolvedParentTaskId = parentTaskId === undefined
      ? old.parentTaskId
      : parentTaskId
    const parentTaskValidation = await validateParentTaskLink({
      productId: old.productId,
      storyId: old.storyId,
      parentTaskId: resolvedParentTaskId,
      currentTaskId: old.id,
    })
    if (!parentTaskValidation.ok) {
      set.status = 400
      return { error: parentTaskValidation.error }
    }

    if (dueAt !== undefined) {
      updateData.dueAt = dueAt ? new Date(dueAt) : null
    }
    if (rest.ownerUserId !== undefined) {
      updateData.ownerUserId = rest.ownerUserId || null
    }
    if (rest.ownerTeamId !== undefined) {
      updateData.ownerTeamId = rest.ownerTeamId || null
    }
    if (rest.assigneeUserIds !== undefined) {
      updateData.assigneeUserIds = candidateAssigneeUserIds.length > 0 ? candidateAssigneeUserIds : null
    }
    if (rest.assigneeTeamIds !== undefined) {
      updateData.assigneeTeamIds = candidateAssigneeTeamIds.length > 0 ? candidateAssigneeTeamIds : null
    }
    if (rest.reviewerUserIds !== undefined) {
      updateData.reviewerUserIds = candidateReviewerUserIds.length > 0 ? candidateReviewerUserIds : null
    }
    if (rest.reviewerTeamIds !== undefined) {
      updateData.reviewerTeamIds = candidateReviewerTeamIds.length > 0 ? candidateReviewerTeamIds : null
    }
    if (parentTaskId !== undefined) {
      updateData.parentTaskId = parentTaskValidation.parentTaskId
    }

    // Auto-set lifecycle timestamps on status transitions
    if (body.status === 'in_progress' && old.status !== 'in_progress') {
      updateData.startedAt = new Date()
    }
    if (body.status === 'done' && old.status !== 'done') {
      updateData.completedAt = new Date()
    }
    if (body.status && body.status !== 'done' && old.status === 'done') {
      updateData.completedAt = null
    }

    // Auto-transition: if task is 'created' and a role field is now set, move to 'assigned'
    if (!body.status && old.status === 'created') {
      const merged = { ...old, ...updateData }
      if (hasAnyRoleAssigned(merged)) {
        updateData.status = 'assigned'
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [updatedTask] = await tx.update(tasks)
        .set(updateData)
        .where(eq(tasks.id, id))
        .returning()

      // Record status transition in history
      const effectiveNewStatus = updatedTask!.status
      if (effectiveNewStatus !== old.status) {
        await tx.insert(taskStatusHistory).values({
          taskId: id,
          productId: updatedTask!.productId,
          fromStatus: old.status,
          toStatus: effectiveNewStatus,
          changedByUserId: user?.id || null,
        })
      }

      // Keep delivery/story invariant updates in the same transaction as the task write.
      if (updatedTask!.deliveryId && (body.status || body.deliveryId !== undefined)) {
        await autoUpdateDeliveryStatus(updatedTask!.deliveryId, tx)
      }
      if (old.deliveryId && old.deliveryId !== updatedTask!.deliveryId) {
        await autoUpdateDeliveryStatus(old.deliveryId, tx)
      }
      if (body.estimateValue !== undefined || body.deliveryId !== undefined) {
        await autoUpdateStoryFromTasks(updatedTask!.storyId, tx)
      }
      await recomputeStoryStatus(updatedTask!.storyId, tx)

      return updatedTask!
    })

    const changes = computeChanges(old, body, [
      'title',
      'status',
      'priority',
      'type',
      'description',
      'blockedReason',
      'ownerUserId',
      'ownerTeamId',
      'assigneeUserIds',
      'assigneeTeamIds',
      'reviewerUserIds',
      'reviewerTeamIds',
      'estimateValue',
      'dueAt',
      'dependent',
      'parentTaskId',
    ])
    if (changes.length > 0) {
      logActivity({
        productId: updated.productId,
        userName: user?.name || 'System',
        userAvatar: user?.avatar,
        userId: user?.id,
        action: 'updated',
        entityType: 'task',
        entityId: updated.id,
        entityTitle: updated.title,
        changes,
      })
    }

    await upsertTaskSearchDocument(updated.id)
    await invalidateMetricsForProduct(updated.productId)

    return updated
  }, { body: t.Partial(taskBody) })

  // DELETE /api/tasks/:id
  .delete('/:id', async ({ params: { id }, set, jwt: jwtInstance, headers }) => {
    const existing = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
      columns: { id: true, productId: true },
    })
    if (!existing) { set.status = 404; return { error: 'Task not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: existing.productId,
      page: 'tasks',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const deleted = await db.transaction(async (tx) => {
      const [deletedTask] = await tx.delete(tasks)
        .where(eq(tasks.id, id))
        .returning()
      if (!deletedTask) return null

      // Keep aggregate delivery/story state in sync in the same transaction as deletion.
      if (deletedTask.deliveryId) {
        await autoUpdateDeliveryStatus(deletedTask.deliveryId, tx)
      }
      await autoUpdateStoryFromTasks(deletedTask.storyId, tx)
      await recomputeStoryStatus(deletedTask.storyId, tx)
      return deletedTask
    })
    if (!deleted) { set.status = 404; return { error: 'Task not found' } }

    const user = access.user
    logActivity({
      productId: deleted.productId,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'deleted',
      entityType: 'task',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })

    await removeSearchDocument('task', deleted.id)

    await invalidateMetricsForProduct(deleted.productId)

    return { success: true }
  })

  // GET /api/tasks/:id/comments
  .get('/:id/comments', async ({ params: { id }, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
      columns: {
        id: true,
        productId: true,
        ownerUserId: true,
        ownerTeamId: true,
        createdByUserId: true,
        assigneeUserIds: true,
        assigneeTeamIds: true,
        reviewerUserIds: true,
        reviewerTeamIds: true,
      },
    })
    if (!task) { set.status = 404; return { error: 'Task not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: task.productId,
      page: 'tasks',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'tasks')
    if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly) {
      const selfVisibleTeamIds = await resolveUserTeamIdsForProduct(task.productId, access.user.id)
      if (!isTaskSelfVisible(access.user.id, task, selfVisibleTeamIds)) {
        set.status = 404
        return { error: 'Task not found' }
      }
    }

    return db.query.taskComments.findMany({
      where: eq(taskComments.taskId, id),
      orderBy: (c, { asc }) => [asc(c.createdAt)],
      with: { user: { columns: publicUserColumns } },
    })
  })

  // POST /api/tasks/:id/comments
  .post('/:id/comments', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
    if (!task) { set.status = 404; return { error: 'Task not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: task.productId,
      page: 'tasks',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [comment] = await db.insert(taskComments)
      .values({
        taskId: id,
        userId: user.id,
        content: body.content,
      })
      .returning()

    const commentSummary = body.content.length > 80 ? body.content.slice(0, 80) + '…' : body.content
    const subjectUserIds = Array.from(new Set([
      task.ownerUserId,
      ...(task.assigneeUserIds || []),
      ...(task.reviewerUserIds || []),
      comment?.userId || null,
    ].filter((value): value is string => !!value)))

    logActivity({
      productId: task.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'task',
      entityId: task.id,
      entityTitle: task.title,
      changes: [
        { field: 'commentId', from: null, to: comment?.id || null },
        { field: 'commentPreview', from: null, to: commentSummary },
      ],
      routePathOverride: `/tasks/${task.id}`,
      subjectUserIds,
    })

    return comment
  }, { body: t.Object({ content: t.String({ minLength: 1 }) }) })

  // DELETE /api/tasks/comments/:commentId
  .delete('/comments/:commentId', async ({ params: { commentId }, set, jwt: jwtInstance, headers }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.taskComments.findFirst({
      where: eq(taskComments.id, commentId),
      columns: { id: true, taskId: true, userId: true, content: true },
    })
    if (!existing) { set.status = 404; return { error: 'Comment not found' } }

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, existing.taskId),
      columns: {
        id: true,
        title: true,
        productId: true,
        ownerUserId: true,
        assigneeUserIds: true,
        reviewerUserIds: true,
      },
    })
    if (!task) { set.status = 404; return { error: 'Task not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: task.productId,
      page: 'tasks',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    if (existing.userId !== user.id && !isGlobalAdminRole(user.role)) {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const [deleted] = await db.delete(taskComments)
      .where(eq(taskComments.id, commentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Comment not found' } }

    if (task && user) {
      const removedSummary = existing.content.length > 80 ? existing.content.slice(0, 80) + '…' : existing.content
      const subjectUserIds = Array.from(new Set([
        task.ownerUserId,
        ...(task.assigneeUserIds || []),
        ...(task.reviewerUserIds || []),
        existing.userId,
      ].filter((value): value is string => !!value)))
      logActivity({
        productId: task.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'deleted',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
        changes: [
          { field: 'commentId', from: existing.id, to: null },
          { field: 'commentPreview', from: removedSummary, to: null },
        ],
        routePathOverride: `/tasks/${task.id}`,
        subjectUserIds,
      })
    }

    return { success: true }
  })

  // ============ ATTACHMENTS ============

  // GET /api/tasks/:id/attachments
  .get('/:id/attachments', async ({ params: { id }, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
      columns: {
        id: true,
        productId: true,
        ownerUserId: true,
        ownerTeamId: true,
        createdByUserId: true,
        assigneeUserIds: true,
        assigneeTeamIds: true,
        reviewerUserIds: true,
        reviewerTeamIds: true,
      },
    })
    if (!task) { set.status = 404; return { error: 'Task not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: task.productId,
      page: 'tasks',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const { permission } = await getEffectivePagePermissionForUser(access.user, 'tasks')
    if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly) {
      const selfVisibleTeamIds = await resolveUserTeamIdsForProduct(task.productId, access.user.id)
      if (!isTaskSelfVisible(access.user.id, task, selfVisibleTeamIds)) {
        set.status = 404
        return { error: 'Task not found' }
      }
    }

    const results = await db.query.taskAttachments.findMany({
      where: eq(taskAttachments.taskId, id),
      with: { user: { columns: publicUserColumns } },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    })
    return results.map((attachment) => ({
      ...attachment,
      filePath: buildTaskAttachmentDownloadPath(attachment.id),
      downloadUrl: buildTaskAttachmentDownloadPath(attachment.id),
    }))
  })

  // GET /api/tasks/attachments/:attachmentId/download
  .get('/attachments/:attachmentId/download', async ({ params: { attachmentId }, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const attachment = await db.query.taskAttachments.findFirst({
      where: eq(taskAttachments.id, attachmentId),
      columns: {
        id: true,
        taskId: true,
        fileName: true,
        mimeType: true,
        filePath: true,
      },
    })
    if (!attachment) {
      set.status = 404
      return { error: 'Attachment not found' }
    }

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, attachment.taskId),
      columns: {
        id: true,
        productId: true,
        ownerUserId: true,
        ownerTeamId: true,
        createdByUserId: true,
        assigneeUserIds: true,
        assigneeTeamIds: true,
        reviewerUserIds: true,
        reviewerTeamIds: true,
      },
    })
    if (!task) {
      set.status = 404
      return { error: 'Task not found' }
    }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: task.productId,
      page: 'tasks',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const { permission } = await getEffectivePagePermissionForUser(access.user, 'tasks')
    if (!isGlobalAdminRole(access.user.role) && permission.selfViewOnly) {
      const selfVisibleTeamIds = await resolveUserTeamIdsForProduct(task.productId, access.user.id)
      if (!isTaskSelfVisible(access.user.id, task, selfVisibleTeamIds)) {
        set.status = 404
        return { error: 'Attachment not found' }
      }
    }

    const storage = getStorage()
    const file = await storage.readByPublicPath(attachment.filePath)
    if (!file) {
      set.status = 404
      return { error: 'Attachment file not found' }
    }

    const safeFilename = (attachment.fileName || 'attachment.bin').replace(/["\\\r\n]/g, '_')
    const responseHeaders = new Headers()
    responseHeaders.set('content-type', file.contentType || attachment.mimeType || 'application/octet-stream')
    responseHeaders.set('content-disposition', `attachment; filename="${safeFilename}"`)
    responseHeaders.set('content-length', String(file.bytes.byteLength))
    responseHeaders.set('cache-control', 'private, max-age=0, no-store')
    const responseBytes = Uint8Array.from(file.bytes)
    return new Response(responseBytes.buffer, {
      status: 200,
      headers: responseHeaders,
    })
  })

  // POST /api/tasks/:id/attachments (multipart file upload)
  .post('/:id/attachments', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
      columns: {
        id: true,
        productId: true,
        title: true,
        ownerUserId: true,
        assigneeUserIds: true,
        reviewerUserIds: true,
      },
    })
    if (!task) { set.status = 404; return { error: 'Task not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: task.productId,
      page: 'tasks',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const file = (body as any).file as File
    if (!file) { set.status = 400; return { error: 'No file provided' } }
    const mimeType = (file.type || '').trim().toLowerCase()
    if (!mimeType || !TASK_ATTACHMENT_ALLOWED_MIME_SET.has(mimeType)) {
      set.status = 415
      return { error: 'Unsupported attachment file type' }
    }
    if (file.size > TASK_ATTACHMENT_MAX_SIZE_BYTES) {
      set.status = 413
      return { error: `Attachment exceeds ${Math.floor(TASK_ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB limit` }
    }

    // Save file with unique name
    const extIndex = file.name.lastIndexOf('.')
    const ext = extIndex >= 0 ? file.name.slice(extIndex) : ''
    const uniqueName = `${randomUUID()}${ext}`
    const storage = getStorage()
    const saved = await storage.saveFile({
      namespace: 'attachments',
      filename: uniqueName,
      contentType: mimeType,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })

    // Insert DB record
    const [attachment] = await db.insert(taskAttachments).values({
      taskId: id,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      filePath: saved.publicPath,
    }).returning()

    // Log activity
    if (task) {
      const subjectUserIds = Array.from(new Set([
        task.ownerUserId,
        ...(task.assigneeUserIds || []),
        ...(task.reviewerUserIds || []),
        user.id,
      ].filter((value): value is string => !!value)))
      logActivity({
        productId: task.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'created',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
        changes: [
          { field: 'attachmentId', from: null, to: attachment?.id || null },
          { field: 'attachmentName', from: null, to: file.name },
          { field: 'attachmentMimeType', from: null, to: mimeType || null },
        ],
        routePathOverride: `/tasks/${task.id}`,
        subjectUserIds,
      })
    }

    // Return with user info
    const result = await db.query.taskAttachments.findFirst({
      where: eq(taskAttachments.id, attachment!.id),
      with: { user: { columns: publicUserColumns } },
    })

    return result ? {
      ...result,
      filePath: buildTaskAttachmentDownloadPath(result.id),
      downloadUrl: buildTaskAttachmentDownloadPath(result.id),
    } : null
  }, {
    body: t.Object({
      file: t.File({ maxSize: '10m', type: [...TASK_ATTACHMENT_ALLOWED_MIME_TYPES] }),
    }),
  })

  // DELETE /api/tasks/attachments/:attachmentId
  .delete('/attachments/:attachmentId', async ({ params: { attachmentId }, set, jwt: jwtInstance, headers }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.taskAttachments.findFirst({
      where: eq(taskAttachments.id, attachmentId),
      columns: { id: true, taskId: true, userId: true },
    })
    if (!existing) { set.status = 404; return { error: 'Attachment not found' } }

    const taskForAccess = await db.query.tasks.findFirst({
      where: eq(tasks.id, existing.taskId),
      columns: { id: true, productId: true },
    })
    if (!taskForAccess) { set.status = 404; return { error: 'Task not found' } }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: taskForAccess.productId,
      page: 'tasks',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    if (existing.userId !== user.id && !isGlobalAdminRole(user.role)) {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const [deleted] = await db.delete(taskAttachments)
      .where(eq(taskAttachments.id, attachmentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Attachment not found' } }

    // Log activity
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, deleted.taskId) })
    if (task) {
      const subjectUserIds = Array.from(new Set([
        task.ownerUserId,
        ...(task.assigneeUserIds || []),
        ...(task.reviewerUserIds || []),
        existing.userId,
      ].filter((value): value is string => !!value)))
      logActivity({
        productId: task.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'deleted',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
        changes: [
          { field: 'attachmentId', from: deleted.id, to: null },
          { field: 'attachmentName', from: deleted.fileName, to: null },
        ],
        routePathOverride: `/tasks/${task.id}`,
        subjectUserIds,
      })
    }

    const storage = getStorage()
    await storage.deleteByPublicPath(deleted.filePath)

    return { success: true }
  })
