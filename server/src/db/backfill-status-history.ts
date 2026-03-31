import { db } from '.'
import { tasks, activities, taskStatusHistory } from './schema'

async function backfill() {
  console.log('Backfilling task status history...')

  // 1. Get all activities with status changes
  const allActivities = await db.select().from(activities)
  const statusChanges = allActivities
    .filter(a => a.entityType === 'task' && a.action === 'updated' && a.changes)
    .filter(a => {
      const changes = a.changes as { field: string; from: string | null; to: string | null }[]
      return changes.some(c => c.field === 'status')
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  console.log(`Found ${statusChanges.length} status change activities`)

  // Get all tasks for productId lookup
  const allTasks = await db.select().from(tasks)
  const taskMap = new Map(allTasks.map(t => [t.id, t]))

  let inserted = 0

  // 2. Insert history rows from activities
  for (const activity of statusChanges) {
    const changes = activity.changes as { field: string; from: string | null; to: string | null }[]
    const statusChange = changes.find(c => c.field === 'status')
    if (!statusChange || !activity.entityId) continue

    const task = taskMap.get(activity.entityId)
    if (!task) continue

    try {
      await db.insert(taskStatusHistory).values({
        taskId: activity.entityId,
        productId: task.productId,
        fromStatus: statusChange.from as any,
        toStatus: statusChange.to as any,
        changedByUserId: activity.userId || null,
        changedAt: activity.createdAt,
      })
      inserted++
    } catch (e) {
      // Skip duplicates or invalid statuses
    }
  }

  console.log(`Inserted ${inserted} history rows from activities`)

  // 3. For tasks with no history yet, insert initial row
  const existingHistory = await db.select().from(taskStatusHistory)
  const taskIdsWithHistory = new Set(existingHistory.map(h => h.taskId))

  let initialInserted = 0
  for (const task of allTasks) {
    if (!taskIdsWithHistory.has(task.id)) {
      try {
        await db.insert(taskStatusHistory).values({
          taskId: task.id,
          productId: task.productId,
          fromStatus: null,
          toStatus: task.status,
          changedByUserId: task.createdByUserId,
          changedAt: task.createdAt,
        })
        initialInserted++
      } catch (e) {
        // Skip errors
      }
    }
  }

  console.log(`Inserted ${initialInserted} initial status rows for tasks without history`)
  console.log('Backfill complete!')
  process.exit(0)
}

backfill().catch(e => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
