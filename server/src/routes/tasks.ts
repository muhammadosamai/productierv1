import { Elysia, t } from 'elysia'
import { db } from '../db'
import { tasks, taskComments, taskAttachments, taskSubtasks, stories, users, deliveries, taskStatusHistory, products, productMembers } from '../db/schema'
import { randomUUID } from 'crypto'
import path from 'path'
import { eq, and, type InferSelectModel } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'
import { validateAttachmentFileName, validateAttachmentContent } from '../lib/allowedAttachments'
import { sendNotificationIfEnabled } from '../services/notificationEmails'

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

/** Product membership via parent story (product_members.product is the story's product name). */
async function userCanAccessTaskAttachment(
  user: { id: string; role: string } | null,
  taskId: string,
): Promise<boolean> {
  if (!user) return false
  if (user.role === 'super_admin') return true
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { storyId: true },
  })
  if (!task) return false
  const story = await db.query.stories.findFirst({
    where: eq(stories.id, task.storyId),
    columns: { product: true },
  })
  if (!story) return false
  const member = await db.query.productMembers.findFirst({
    where: and(eq(productMembers.product, story.product), eq(productMembers.userId, user.id)),
  })
  return !!member
}

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
    t.Literal('high')
  ])),
  type: t.Optional(t.Nullable(t.Union([
    t.Literal('design'), t.Literal('development'), t.Literal('testing'),
    t.Literal('review'), t.Literal('research'), t.Literal('fix'),
    t.Literal('documentation'), t.Literal('deployment')
  ]))),
  ownerUserId: t.Optional(t.Nullable(t.String())),
  assigneeUserIds: t.Optional(t.Nullable(t.Array(t.String()))),
  reviewerUserIds: t.Optional(t.Nullable(t.Array(t.String()))),
  estimateValue: t.Optional(t.Nullable(t.Number())),
  dependent: t.Optional(t.Nullable(t.Array(t.String()))),
  blockedReason: t.Optional(t.Nullable(t.String())),
  deliveryId: t.Optional(t.Nullable(t.String())),
  dueAt: t.Optional(t.Nullable(t.String())),
})

const taskStatusLiterals = [
  t.Literal('created'), t.Literal('assigned'), t.Literal('in_progress'),
  t.Literal('in_review'), t.Literal('done'), t.Literal('overdue'), t.Literal('blocked'),
  t.Literal('archived'),
]

const taskPriorityLiterals = [
  t.Literal('low'), t.Literal('medium'), t.Literal('high'),
]

const taskTypeLiterals = [
  t.Literal('design'), t.Literal('development'), t.Literal('testing'),
  t.Literal('review'), t.Literal('research'), t.Literal('fix'),
  t.Literal('documentation'), t.Literal('deployment'),
]

const subtaskCreateInput = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  status: t.Optional(t.Union(taskStatusLiterals)),
  priority: t.Optional(t.Union(taskPriorityLiterals)),
  type: t.Optional(t.Nullable(t.Union(taskTypeLiterals))),
  assigneeUserIds: t.Optional(t.Nullable(t.Array(t.String()))),
  estimateValue: t.Optional(t.Nullable(t.Number())),
  dependent: t.Optional(t.Nullable(t.Array(t.String()))),
  blockedReason: t.Optional(t.Nullable(t.String())),
  deliveryId: t.Optional(t.Nullable(t.String())),
  dueAt: t.Optional(t.Nullable(t.String())),
  sortOrder: t.Optional(t.Number()),
})

const createTaskBody = t.Intersect([
  taskBody,
  t.Object({
    subtasks: t.Optional(t.Array(subtaskCreateInput)),
  }),
])

const subtaskUpdateBody = t.Partial(t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Nullable(t.String()),
  status: t.Union(taskStatusLiterals),
  priority: t.Union(taskPriorityLiterals),
  type: t.Nullable(t.Union(taskTypeLiterals)),
  assigneeUserIds: t.Nullable(t.Array(t.String())),
  estimateValue: t.Nullable(t.Number()),
  dependent: t.Nullable(t.Array(t.String())),
  blockedReason: t.Nullable(t.String()),
  deliveryId: t.Nullable(t.String()),
  dueAt: t.Nullable(t.String()),
  sortOrder: t.Number(),
}))

async function fetchTaskWithSubtasks(taskId: string) {
  return db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: {
      subtasks: {
        orderBy: (s, { asc }) => [asc(s.sortOrder), asc(s.createdAt)],
        with: {
          delivery: { columns: { id: true, title: true } },
        },
      },
    },
  })
}

function effectiveSubtaskStatus(input: { status?: string; assigneeUserIds?: string[] | null }) {
  if (input.status) return input.status
  const ids = input.assigneeUserIds
  return ids && ids.length > 0 ? 'assigned' : 'created'
}

/** Check if a task has any role assigned (owner, assignee, or reviewer) */
function hasAnyRoleAssigned(task: Record<string, any>): boolean {
  return !!(
    task.ownerUserId ||
    (task.assigneeUserIds && task.assigneeUserIds.length > 0) ||
    (task.reviewerUserIds && task.reviewerUserIds.length > 0)
  )
}

type DeliveryStatus = InferSelectModel<typeof deliveries>['status']

/**
 * Auto-update delivery status based on its tasks (matches `delivery_status` enum):
 * - "initialized" → no tasks, or tasks exist but none are actively in progress
 * - "in_progress" → any task is in_progress, in_review, overdue, or blocked
 * - "completed"   → all tasks are done
 */
async function autoUpdateDeliveryStatus(deliveryId: string) {
  const delivery = await db.query.deliveries.findFirst({ where: eq(deliveries.id, deliveryId) })
  if (!delivery) return

  // Skip if delivery is manually set to archived
  if (delivery.status === 'archived') return

  const taskList = await db.query.tasks.findMany({
    where: eq(tasks.deliveryId, deliveryId),
    columns: { id: true, status: true },
  })

  if (taskList.length === 0) {
    // No tasks — keep as initialized
    if (delivery.status !== 'initialized') {
      await db.update(deliveries).set({ status: 'initialized', updatedAt: new Date() }).where(eq(deliveries.id, deliveryId))
    }
    return
  }

  const hasCreatedOrAssigned = taskList.some(t => t.status === 'created' || t.status === 'assigned')
  const hasActive = taskList.some(t => t.status === 'in_progress' || t.status === 'in_review' || t.status === 'overdue' || t.status === 'blocked')
  const allDone = taskList.every(t => t.status === 'done')

  let newStatus: DeliveryStatus

  if (allDone) {
    newStatus = 'completed'
  } else if (hasActive) {
    newStatus = 'in_progress'
  } else if (hasCreatedOrAssigned) {
    newStatus = 'initialized'
  } else {
    newStatus = 'initialized'
  }

  if (delivery.status !== newStatus) {
    await db.update(deliveries).set({ status: newStatus, updatedAt: new Date() }).where(eq(deliveries.id, deliveryId))
  }
}

/**
 * Auto-update story's estimate and delivery fields based on child tasks.
 * - estimate = sum of all child tasks' estimateValue (stored as string)
 * - delivery = comma-separated list of unique delivery titles linked via child tasks
 */
async function autoUpdateStoryFromTasks(storyId: string) {
  const taskList = await db.query.tasks.findMany({
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
        db.query.deliveries.findFirst({
          where: eq(deliveries.id, id),
          columns: { title: true },
        })
      )
    )
    const names = deliveryRecords.filter(Boolean).map(d => d!.title)
    deliveryStr = names.length > 0 ? names.join(', ') : null
  }

  await db.update(stories)
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
async function recomputeStoryStatus(storyId: string) {
  const story = await db.query.stories.findFirst({
    where: eq(stories.id, storyId),
    columns: { status: true },
  })
  if (!story || story.status === 'archived') return // don't override archive

  const taskList = await db.query.tasks.findMany({
    where: eq(tasks.storyId, storyId),
    columns: { status: true, ownerUserId: true, assigneeUserIds: true },
  })

  let newStatus: string

  if (taskList.length === 0) {
    newStatus = 'backlog'
  } else {
    const allDone = taskList.every(t => t.status === 'done' || t.status === 'archived')
    const anyInProgress = taskList.some(t => t.status === 'in_progress' || t.status === 'in_review')
    const anyAssigned = taskList.some(t =>
      t.ownerUserId || (t.assigneeUserIds && t.assigneeUserIds.length > 0)
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
    await db.update(stories)
      .set({ status: newStatus as any, updatedAt: new Date() })
      .where(eq(stories.id, storyId))
  }
}

export const taskRoutes = new Elysia({ prefix: '/api/tasks' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/tasks/by-story/:storyId
  .get('/by-story/:storyId', async ({ params: { storyId } }) => {
    return db.query.tasks.findMany({
      where: eq(tasks.storyId, storyId),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
      with: {
        comments: { with: { user: true } },
        createdByUser: true,
        subtasks: {
          orderBy: (s, { asc }) => [asc(s.sortOrder), asc(s.createdAt)],
          with: {
            delivery: { columns: { id: true, title: true } },
          },
        },
      },
    })
  })

  // POST /api/tasks/by-story/:storyId
  .post('/by-story/:storyId', async ({ params: { storyId }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const story = await db.query.stories.findFirst({
      where: eq(stories.id, storyId),
    })
    if (!story) { set.status = 404; return { error: 'Story not found' } }

    const { dueAt, subtasks: subtasksPayload, ...rest } = body

    // Auto-transition: if any role is assigned at creation, set status to 'assigned'
    const effectiveStatus = hasAnyRoleAssigned(rest) ? 'assigned' : 'created'

    const product = await db.query.products.findFirst({
      where: eq(products.name, story.product),
      columns: { id: true },
    })
    const normalizedProductId = product?.id || story.product

    const [task] = await db.insert(tasks)
      .values({
        ...rest,
        status: rest.status || effectiveStatus,
        storyId,
        publicId: null,
        productId: normalizedProductId,
        initiativeId: null,
        createdByUserId: user.id,
        dueAt: dueAt ? new Date(dueAt) : null,
      })
      .returning()

    if (!task) {
      set.status = 500
      return { error: 'Failed to create task' }
    }

    logActivity({
      product: story.product,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'task',
      entityId: task.id,
      entityTitle: task.title,
    })

    // Record initial status in history
    await db.insert(taskStatusHistory).values({
      taskId: task.id,
      productId: task.productId,
      fromStatus: null,
      toStatus: task.status,
      changedByUserId: user.id,
    })

    // Auto-update delivery status if task is linked to one
    if (task.deliveryId) {
      await autoUpdateDeliveryStatus(task.deliveryId)
    }

    // Auto-update parent story estimate & delivery from child tasks
    await autoUpdateStoryFromTasks(storyId)

    // Auto-compute story status based on child tasks
    await recomputeStoryStatus(storyId)

    if (subtasksPayload && subtasksPayload.length > 0) {
      for (let i = 0; i < subtasksPayload.length; i++) {
        const st = subtasksPayload[i]
        const subStatus = effectiveSubtaskStatus({ status: st.status, assigneeUserIds: st.assigneeUserIds }) as any
        await db.insert(taskSubtasks).values({
          parentTaskId: task.id,
          title: st.title,
          description: st.description ?? null,
          status: subStatus,
          priority: (st.priority ?? 'medium') as any,
          type: st.type ?? null,
          assigneeUserIds: st.assigneeUserIds ?? null,
          estimateValue: st.estimateValue ?? null,
          dependent: st.dependent ?? null,
          blockedReason: st.blockedReason ?? null,
          deliveryId: st.deliveryId ?? null,
          dueAt: st.dueAt ? new Date(st.dueAt) : null,
          sortOrder: st.sortOrder ?? i,
        })
      }
    }

    const full = await fetchTaskWithSubtasks(task.id)
    return full || task
  }, { body: createTaskBody })

  // PUT /api/tasks/:id
  .put('/:id', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const old = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
    if (!old) { set.status = 404; return { error: 'Task not found' } }

    const { dueAt, ...rest } = body
    const updateData: Record<string, any> = { ...rest, updatedAt: new Date() }

    if (dueAt !== undefined) {
      updateData.dueAt = dueAt ? new Date(dueAt) : null
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

    const [updated] = await db.update(tasks)
      .set(updateData)
      .where(eq(tasks.id, id))
      .returning()

    const user = await getUserFromHeader(jwtInstance.verify, headers)

    // Record status transition in history
    const effectiveNewStatus = updated!.status
    if (effectiveNewStatus !== old.status) {
      await db.insert(taskStatusHistory).values({
        taskId: id,
        productId: updated!.productId,
        fromStatus: old.status,
        toStatus: effectiveNewStatus,
        changedByUserId: user?.id || null,
      })
    }

    const changes = computeChanges(old, body, ['title', 'status', 'priority', 'type', 'description', 'blockedReason', 'ownerUserId', 'assigneeUserIds', 'reviewerUserIds', 'estimateValue', 'dueAt', 'dependent'])
    if (changes.length > 0) {
      logActivity({
        product: updated!.productId,
        userName: user?.name || 'System',
        userAvatar: user?.avatar,
        userId: user?.id,
        action: 'updated',
        entityType: 'task',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }

    // Notification: assignee changed
    if (body.ownerUserId && body.ownerUserId !== old.ownerUserId) {
      sendNotificationIfEnabled({
        targetUserId: body.ownerUserId,
        actorUserId: user?.id,
        eventType: 'assigned',
        entityType: 'task',
        entityTitle: updated!.title,
        entityPath: `/tasks?task=${updated!.id}`,
      }).catch(() => {})
    }
    if (body.assigneeUserIds) {
      const oldIds = new Set(old.assigneeUserIds || [])
      for (const uid of body.assigneeUserIds) {
        if (!oldIds.has(uid)) {
          sendNotificationIfEnabled({
            targetUserId: uid,
            actorUserId: user?.id,
            eventType: 'assigned',
            entityType: 'task',
            entityTitle: updated!.title,
            entityPath: `/tasks?task=${updated!.id}`,
          }).catch(() => {})
        }
      }
    }

    // Notification: status changed
    if (body.status && body.status !== old.status) {
      const notifyIds = new Set<string>()
      if (old.ownerUserId) notifyIds.add(old.ownerUserId)
      if (old.assigneeUserIds) old.assigneeUserIds.forEach(id => notifyIds.add(id))
      for (const uid of notifyIds) {
        sendNotificationIfEnabled({
          targetUserId: uid,
          actorUserId: user?.id,
          eventType: 'status_change',
          entityType: 'task',
          entityTitle: updated!.title,
          entityPath: `/tasks?task=${updated!.id}`,
          details: body.status,
        }).catch(() => {})
      }
    }

    // Auto-update parent delivery status based on task statuses
    if (updated!.deliveryId && (body.status || body.deliveryId !== undefined)) {
      await autoUpdateDeliveryStatus(updated!.deliveryId)
    }
    // If task was moved away from a previous delivery, update old delivery too
    if (old.deliveryId && old.deliveryId !== updated!.deliveryId) {
      await autoUpdateDeliveryStatus(old.deliveryId)
    }

    // Auto-update parent story estimate & delivery if relevant fields changed
    if (body.estimateValue !== undefined || body.deliveryId !== undefined) {
      await autoUpdateStoryFromTasks(updated!.storyId)
    }

    // Auto-compute story status based on child task states
    await recomputeStoryStatus(updated!.storyId)

    return updated
  }, { body: t.Partial(taskBody) })

  // DELETE /api/tasks/:id
  .delete('/:id', async ({ params: { id }, set, jwt: jwtInstance, headers }) => {
    const [deleted] = await db.delete(tasks)
      .where(eq(tasks.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Task not found' } }

    const user = await getUserFromHeader(jwtInstance.verify, headers)
    logActivity({
      product: deleted.productId,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'deleted',
      entityType: 'task',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })

    // Auto-update delivery status after task removal
    if (deleted.deliveryId) {
      await autoUpdateDeliveryStatus(deleted.deliveryId)
    }

    // Auto-update parent story estimate & delivery after task removal
    await autoUpdateStoryFromTasks(deleted.storyId)

    // Auto-compute story status based on remaining child tasks
    await recomputeStoryStatus(deleted.storyId)

    return { success: true }
  })

  // POST /api/tasks/:id/subtasks
  .post('/:id/subtasks', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const parent = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
    if (!parent) { set.status = 404; return { error: 'Task not found' } }

    const siblings = await db.query.taskSubtasks.findMany({
      where: eq(taskSubtasks.parentTaskId, id),
      columns: { sortOrder: true },
    })
    const defaultSort = siblings.length ? Math.max(...siblings.map(s => s.sortOrder)) + 1 : 0

    const [created] = await db.insert(taskSubtasks)
      .values({
        parentTaskId: id,
        title: body.title,
        description: body.description ?? null,
        status: effectiveSubtaskStatus({ status: body.status, assigneeUserIds: body.assigneeUserIds }) as any,
        priority: (body.priority ?? 'medium') as any,
        type: body.type ?? null,
        assigneeUserIds: body.assigneeUserIds ?? null,
        estimateValue: body.estimateValue ?? null,
        dependent: body.dependent ?? null,
        blockedReason: body.blockedReason ?? null,
        deliveryId: body.deliveryId ?? null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        sortOrder: body.sortOrder ?? defaultSort,
      })
      .returning()

    return db.query.taskSubtasks.findFirst({
      where: eq(taskSubtasks.id, created!.id),
      with: {
        delivery: { columns: { id: true, title: true } },
      },
    })
  }, { body: subtaskCreateInput })

  // PUT /api/tasks/:id/subtasks/:subtaskId
  .put('/:id/subtasks/:subtaskId', async ({ params: { id, subtaskId }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const existing = await db.query.taskSubtasks.findFirst({ where: eq(taskSubtasks.id, subtaskId) })
    if (!existing || existing.parentTaskId !== id) {
      set.status = 404
      return { error: 'Subtask not found' }
    }

    const updatePayload: Record<string, any> = { updatedAt: new Date() }
    if (body.title !== undefined) updatePayload.title = body.title
    if (body.description !== undefined) updatePayload.description = body.description
    if (body.priority !== undefined) updatePayload.priority = body.priority
    if (body.type !== undefined) updatePayload.type = body.type
    if (body.sortOrder !== undefined) updatePayload.sortOrder = body.sortOrder
    if (body.assigneeUserIds !== undefined) updatePayload.assigneeUserIds = body.assigneeUserIds
    if (body.estimateValue !== undefined) updatePayload.estimateValue = body.estimateValue
    if (body.dependent !== undefined) updatePayload.dependent = body.dependent
    if (body.blockedReason !== undefined) updatePayload.blockedReason = body.blockedReason
    if (body.deliveryId !== undefined) updatePayload.deliveryId = body.deliveryId
    if (body.dueAt !== undefined) updatePayload.dueAt = body.dueAt ? new Date(body.dueAt) : null

    if (body.status !== undefined) {
      updatePayload.status = body.status
    } else if (body.assigneeUserIds !== undefined) {
      const nextIds = body.assigneeUserIds
      const hasNext = nextIds && nextIds.length > 0
      if (existing.status === 'created' && hasNext) {
        updatePayload.status = 'assigned'
      } else if (existing.status === 'assigned' && !hasNext) {
        updatePayload.status = 'created'
      }
    }

    if (body.status === 'in_progress' && existing.status !== 'in_progress') {
      updatePayload.startedAt = new Date()
    }
    if (body.status === 'done' && existing.status !== 'done') {
      updatePayload.completedAt = new Date()
    }
    if (body.status && body.status !== 'done' && existing.status === 'done') {
      updatePayload.completedAt = null
    }

    const [updated] = await db.update(taskSubtasks)
      .set(updatePayload)
      .where(eq(taskSubtasks.id, subtaskId))
      .returning()

    return db.query.taskSubtasks.findFirst({
      where: eq(taskSubtasks.id, updated!.id),
      with: {
        delivery: { columns: { id: true, title: true } },
      },
    })
  }, { body: subtaskUpdateBody })

  // DELETE /api/tasks/:id/subtasks/:subtaskId
  .delete('/:id/subtasks/:subtaskId', async ({ params: { id, subtaskId }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const existing = await db.query.taskSubtasks.findFirst({ where: eq(taskSubtasks.id, subtaskId) })
    if (!existing || existing.parentTaskId !== id) {
      set.status = 404
      return { error: 'Subtask not found' }
    }

    await db.delete(taskSubtasks).where(eq(taskSubtasks.id, subtaskId))
    return { success: true }
  })

  // GET /api/tasks/:id/comments
  .get('/:id/comments', async ({ params: { id } }) => {
    return db.query.taskComments.findMany({
      where: eq(taskComments.taskId, id),
      orderBy: (c, { asc }) => [asc(c.createdAt)],
      with: { user: true },
    })
  })

  // POST /api/tasks/:id/comments
  .post('/:id/comments', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
    if (!task) { set.status = 404; return { error: 'Task not found' } }

    const [comment] = await db.insert(taskComments)
      .values({
        taskId: id,
        userId: user.id,
        content: body.content,
      })
      .returning()

    logActivity({
      product: task.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'updated',
      entityType: 'task',
      entityId: task.id,
      entityTitle: task.title,
      changes: [{ field: 'comment', from: null, to: body.content.length > 80 ? body.content.slice(0, 80) + '…' : body.content }],
    })

    // Notify task owner and assignees about the comment
    const commentNotifyIds = new Set<string>()
    if (task.ownerUserId) commentNotifyIds.add(task.ownerUserId)
    if (task.assigneeUserIds) task.assigneeUserIds.forEach(uid => commentNotifyIds.add(uid))
    const preview = body.content.length > 100 ? body.content.slice(0, 100) + '...' : body.content
    for (const uid of commentNotifyIds) {
      sendNotificationIfEnabled({
        targetUserId: uid,
        actorUserId: user.id,
        eventType: 'comment',
        entityType: 'task',
        entityTitle: task.title,
        entityPath: `/tasks?task=${task.id}`,
        details: preview,
      }).catch(() => {})
    }

    return comment
  }, { body: t.Object({ content: t.String({ minLength: 1 }) }) })

  // DELETE /api/tasks/comments/:commentId
  .delete('/comments/:commentId', async ({ params: { commentId }, set, jwt: jwtInstance, headers }) => {
    const [deleted] = await db.delete(taskComments)
      .where(eq(taskComments.id, commentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Comment not found' } }

    const user = await getUserFromHeader(jwtInstance.verify, headers)
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, deleted.taskId) })
    if (task && user) {
      logActivity({
        product: task.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
        changes: [{ field: 'comment', from: deleted.content.length > 80 ? deleted.content.slice(0, 80) + '…' : deleted.content, to: null }],
      })
    }

    return { success: true }
  })

  // ============ ATTACHMENTS ============

  // GET /api/tasks/attachments/:attachmentId/download
  .get('/attachments/:attachmentId/download', async ({ params: { attachmentId }, set }) => {
    const att = await db.query.taskAttachments.findFirst({ where: eq(taskAttachments.id, attachmentId) })
    if (!att) {
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

  // GET /api/tasks/:id/attachments
  .get('/:id/attachments', async ({ params: { id } }) => {
    return db.query.taskAttachments.findMany({
      where: eq(taskAttachments.taskId, id),
      with: { user: true },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    })
  })

  // POST /api/tasks/:id/attachments (multipart file upload)
  .post('/:id/attachments', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    if (!(await userCanAccessTaskAttachment(user, id))) {
      set.status = 404
      return { error: 'Task not found' }
    }

    const file = (body as any).file as File
    if (!file) { set.status = 400; return { error: 'No file provided' } }

    const typeCheck = validateAttachmentFileName(file.name)
    if (!typeCheck.ok) { set.status = 400; return { error: typeCheck.error } }

    const uploadsDir = path.join(process.cwd(), 'uploads', 'attachments')

    // Save file with unique name
    const ext = path.extname(file.name) || ''
    const uniqueName = `${randomUUID()}${ext}`
    const filePath = path.join(uploadsDir, uniqueName)

    const arrayBuffer = await file.arrayBuffer()
    const contentCheck = await validateAttachmentContent(arrayBuffer, file.name)
    if (!contentCheck.ok) { set.status = 400; return { error: contentCheck.error } }

    await Bun.write(filePath, arrayBuffer)

    // Insert DB record
    const [attachment] = await db.insert(taskAttachments).values({
      taskId: id,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: contentCheck.mime,
      filePath: `/uploads/attachments/${uniqueName}`,
    }).returning()

    // Log activity
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
    if (task) {
      logActivity({
        product: task.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
        changes: [{ field: 'attachment', from: null, to: file.name }],
      })
    }

    // Return with user info
    const result = await db.query.taskAttachments.findFirst({
      where: eq(taskAttachments.id, attachment!.id),
      with: { user: true },
    })

    return result
  })

  // DELETE /api/tasks/attachments/:attachmentId
  .delete('/attachments/:attachmentId', async ({ params: { attachmentId }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const existing = await db.query.taskAttachments.findFirst({
      where: eq(taskAttachments.id, attachmentId),
    })
    if (!existing || !(await userCanAccessTaskAttachment(user, existing.taskId))) {
      set.status = 404
      return { error: 'Attachment not found' }
    }

    const [deleted] = await db.delete(taskAttachments)
      .where(eq(taskAttachments.id, attachmentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Attachment not found' } }

    // Log activity
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, deleted.taskId) })
    if (task) {
      logActivity({
        product: task.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
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
