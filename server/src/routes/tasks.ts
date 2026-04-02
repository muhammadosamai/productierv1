import { Elysia, t } from 'elysia'
import { db } from '../db'
import { tasks, taskComments, taskAttachments, stories, users, deliveries, taskStatusHistory, products } from '../db/schema'
import { randomUUID } from 'crypto'
import { mkdir } from 'fs/promises'
import path from 'path'
import { eq } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'
import { generatePublicIdForProduct } from '../lib/publicIds'

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
  assigneeUserIds: t.Optional(t.Nullable(t.Array(t.String()))),
  reviewerUserIds: t.Optional(t.Nullable(t.Array(t.String()))),
  estimateValue: t.Optional(t.Nullable(t.Number())),
  dependent: t.Optional(t.Nullable(t.Array(t.String()))),
  blockedReason: t.Optional(t.Nullable(t.String())),
  deliveryId: t.Optional(t.Nullable(t.String())),
  dueAt: t.Optional(t.Nullable(t.String())),
})

/** Check if a task has any role assigned (owner, assignee, or reviewer) */
function hasAnyRoleAssigned(task: Record<string, any>): boolean {
  return !!(
    task.ownerUserId ||
    (task.assigneeUserIds && task.assigneeUserIds.length > 0) ||
    (task.reviewerUserIds && task.reviewerUserIds.length > 0)
  )
}

/**
 * Auto-update delivery status based on its tasks:
 * - "initialized" → no tasks with 'todo' status (all cards are non-todo or no cards)
 * - "pending"     → has tasks, but none are in_progress
 * - "active"      → any task is in_progress
 * - "completed"   → all tasks are done (or review/done — non-active terminal states)
 */
async function autoUpdateDeliveryStatus(deliveryId: string) {
  const delivery = await db.query.deliveries.findFirst({ where: eq(deliveries.id, deliveryId) })
  if (!delivery) return

  // Skip if delivery is manually set to archived or canceled
  if (delivery.status === 'archived' || delivery.status === 'canceled') return

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

  let newStatus: string

  if (allDone) {
    newStatus = 'completed'
  } else if (hasActive) {
    newStatus = 'active'
  } else if (hasCreatedOrAssigned) {
    newStatus = 'pending'
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
      with: { comments: { with: { user: true } }, createdByUser: true },
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

    const { dueAt, ...rest } = body

    // Auto-transition: if any role is assigned at creation, set status to 'assigned'
    const effectiveStatus = hasAnyRoleAssigned(rest) ? 'assigned' : 'created'

    const product = await db.query.products.findFirst({
      where: eq(products.name, story.product),
      columns: { id: true },
    })
    const normalizedProductId = product?.id || story.product
    const publicId = await generatePublicIdForProduct(normalizedProductId)

    const [task] = await db.insert(tasks)
      .values({
        ...rest,
        status: rest.status || effectiveStatus,
        storyId,
        publicId,
        productId: normalizedProductId,
        initiativeId: null, // auto-derive later when initiatives have proper FK
        createdByUserId: user.id,
        dueAt: dueAt ? new Date(dueAt) : null,
      })
      .returning()

    logActivity({
      product: story.product,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'task',
      entityId: task!.id,
      entityTitle: task!.title,
    })

    // Record initial status in history
    await db.insert(taskStatusHistory).values({
      taskId: task!.id,
      productId: task!.productId,
      fromStatus: null,
      toStatus: task!.status,
      changedByUserId: user.id,
    })

    // Auto-update delivery status if task is linked to one
    if (task!.deliveryId) {
      await autoUpdateDeliveryStatus(task!.deliveryId)
    }

    // Auto-update parent story estimate & delivery from child tasks
    await autoUpdateStoryFromTasks(storyId)

    // Auto-compute story status based on child tasks
    await recomputeStoryStatus(storyId)

    return task
  }, { body: taskBody })

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

  // GET /api/tasks/:id/attachments
  .get('/:id/attachments', async ({ params: { id } }) => {
    const results = await db.query.taskAttachments.findMany({
      where: eq(taskAttachments.taskId, id),
      with: { user: true },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    })
    return results
  })

  // POST /api/tasks/:id/attachments (multipart file upload)
  .post('/:id/attachments', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const file = (body as any).file as File
    if (!file) { set.status = 400; return { error: 'No file provided' } }

    // Create uploads/attachments dir
    const uploadsDir = path.join(process.cwd(), 'uploads', 'attachments')
    await mkdir(uploadsDir, { recursive: true })

    // Save file with unique name
    const ext = path.extname(file.name) || ''
    const uniqueName = `${randomUUID()}${ext}`
    const filePath = path.join(uploadsDir, uniqueName)

    const arrayBuffer = await file.arrayBuffer()
    await Bun.write(filePath, arrayBuffer)

    // Insert DB record
    const [attachment] = await db.insert(taskAttachments).values({
      taskId: id,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
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

    // Try to remove file from disk
    try {
      const fullPath = path.join(process.cwd(), deleted.filePath)
      await Bun.write(fullPath, '') // Clear content
      const { unlink } = await import('fs/promises')
      await unlink(fullPath)
    } catch {}

    return { success: true }
  })
