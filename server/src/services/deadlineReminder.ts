import { db } from '../db'
import { tasks, deliveries } from '../db/schema'
import { and, gte, lte, notInArray } from 'drizzle-orm'
import { sendNotificationIfEnabled } from './notificationEmails'
import { effectiveTaskDeadlineUtcDay } from '../lib/taskDates'

const REMINDER_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000 // 24 hours

const sentReminders = new Set<string>()

function reminderKey(entityType: string, entityId: string, userId: string): string {
  const dateKey = new Date().toISOString().split('T')[0]
  return `${entityType}:${entityId}:${userId}:${dateKey}`
}

async function checkDeadlines() {
  try {
    const now = new Date()
    const lookahead = new Date(now.getTime() + LOOKAHEAD_MS)

    // Tasks with deadline (endDate or legacy dueAt) in the next lookahead window
    const activeTasks = await db.select().from(tasks).where(
      notInArray(tasks.status, ['done', 'archived']),
    )
    const upcomingTasks = activeTasks.filter(t => {
      const d = effectiveTaskDeadlineUtcDay(t)
      if (!d) return false
      return d.getTime() >= now.getTime() && d.getTime() <= lookahead.getTime()
    })

    for (const task of upcomingTasks) {
      const notifyIds = new Set<string>()
      if (task.ownerUserId) notifyIds.add(task.ownerUserId)
      if (task.assigneeUserIds) task.assigneeUserIds.forEach(id => notifyIds.add(id))

      const deadline = effectiveTaskDeadlineUtcDay(task)
      const dueStr = deadline ? deadline.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }) : undefined

      for (const uid of notifyIds) {
        const key = reminderKey('task', task.id, uid)
        if (sentReminders.has(key)) continue
        sentReminders.add(key)

        sendNotificationIfEnabled({
          targetUserId: uid,
          eventType: 'deadline',
          entityType: 'task',
          entityTitle: task.title,
          entityPath: `/tasks?task=${task.id}`,
          details: dueStr,
        }).catch(() => {})
      }
    }

    // Deliveries with upcoming endDate
    const todayStr = now.toISOString().split('T')[0]
    const lookaheadStr = lookahead.toISOString().split('T')[0]

    const upcomingDeliveries = await db.select().from(deliveries)
      .where(and(
        gte(deliveries.endDate, todayStr),
        lte(deliveries.endDate, lookaheadStr),
        notInArray(deliveries.status, ['completed', 'archived']),
      ))

    for (const delivery of upcomingDeliveries) {
      const key = reminderKey('delivery', delivery.id, delivery.createdByUserId)
      if (sentReminders.has(key)) continue
      sentReminders.add(key)

      sendNotificationIfEnabled({
        targetUserId: delivery.createdByUserId,
        eventType: 'deadline',
        entityType: 'delivery',
        entityTitle: delivery.title,
        entityPath: `/deliveries/${delivery.id}`,
        details: delivery.endDate || undefined,
      }).catch(() => {})
    }

    // Clean up old reminder keys daily
    if (sentReminders.size > 10000) {
      sentReminders.clear()
    }
  } catch (err) {
    console.error('[DeadlineReminder] Error checking deadlines:', err)
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export function startDeadlineReminder() {
  console.log('[DeadlineReminder] Starting deadline reminder (every 1 hour)')
  // Initial check after a short delay to let the server start
  setTimeout(checkDeadlines, 10_000)
  intervalId = setInterval(checkDeadlines, REMINDER_INTERVAL_MS)
}

export function stopDeadlineReminder() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
