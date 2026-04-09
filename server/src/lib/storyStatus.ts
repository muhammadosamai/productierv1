import { db } from '../db'
import { stories, tasks, issues } from '../db/schema'
import { eq } from 'drizzle-orm'

/**
 * Auto-recomputes a story's status based on its child tasks AND linked issues.
 *
 * Rules (in priority order):
 *   archived  → skip (manual only, never overridden)
 *   backlog   → no tasks and no linked issues
 *   completed → all tasks done/archived AND all linked issues resolved/closed
 *   in_progress → any task in_progress/in_review OR any issue in_progress
 *   initialized → at least one task is assigned to a user
 *   drafted   → tasks exist but none assigned (and no qualifying issues above)
 */
export async function recomputeStoryStatus(storyId: string) {
  const story = await db.query.stories.findFirst({
    where: eq(stories.id, storyId),
    columns: { status: true },
  })
  if (!story || story.status === 'archived') return

  const [taskList, issueList] = await Promise.all([
    db.query.tasks.findMany({
      where: eq(tasks.storyId, storyId),
      columns: { status: true, ownerUserId: true, assigneeUserIds: true },
    }),
    db.query.issues.findMany({
      where: eq(issues.storyId, storyId),
      columns: { status: true },
    }),
  ])

  let newStatus: string

  if (taskList.length === 0 && issueList.length === 0) {
    newStatus = 'backlog'
  } else {
    const allTasksDone = taskList.length === 0 || taskList.every(t => t.status === 'done' || t.status === 'archived')
    const allIssuesDone = issueList.length === 0 || issueList.every(i => i.status === 'resolved' || i.status === 'closed')

    const anyTaskInProgress = taskList.some(t => t.status === 'in_progress' || t.status === 'in_review')
    const anyIssueInProgress = issueList.some(i => i.status === 'in_progress')

    const anyTaskAssigned = taskList.some(t =>
      t.ownerUserId || (t.assigneeUserIds && t.assigneeUserIds.length > 0)
    )

    if (allTasksDone && allIssuesDone) {
      newStatus = 'completed'
    } else if (anyTaskInProgress || anyIssueInProgress) {
      newStatus = 'in_progress'
    } else if (anyTaskAssigned) {
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
