import { db } from '../db'
import { emailPreferences, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { sendNotificationEmail, getAppUrl } from './email'

type PreferenceKey = 'assignedToMe' | 'statusChanges' | 'newComments' | 'deadlineReminders'

const eventToPreference: Record<string, PreferenceKey> = {
  assigned: 'assignedToMe',
  status_change: 'statusChanges',
  comment: 'newComments',
  deadline: 'deadlineReminders',
}

export async function sendNotificationIfEnabled(params: {
  targetUserId: string
  actorUserId?: string
  eventType: 'assigned' | 'status_change' | 'comment' | 'deadline'
  entityType: string
  entityTitle: string
  entityPath: string
  details?: string
}): Promise<void> {
  try {
    // Don't notify yourself
    if (params.actorUserId && params.actorUserId === params.targetUserId) return

    const prefKey = eventToPreference[params.eventType]
    if (!prefKey) return

    const prefs = await db.query.emailPreferences.findFirst({
      where: eq(emailPreferences.userId, params.targetUserId),
    })

    // Default is true for all preferences when no row exists
    if (prefs && !prefs[prefKey]) return

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, params.targetUserId),
    })
    if (!targetUser) return

    let actorName = 'Someone'
    if (params.actorUserId) {
      const actor = await db.query.users.findFirst({
        where: eq(users.id, params.actorUserId),
      })
      if (actor) actorName = actor.name
    }

    await sendNotificationEmail({
      email: targetUser.email,
      userName: targetUser.name,
      eventType: params.eventType,
      entityType: params.entityType,
      entityTitle: params.entityTitle,
      entityUrl: `${getAppUrl()}${params.entityPath}`,
      actorName,
      details: params.details,
    })
  } catch (err) {
    console.error('[NotificationEmail] Failed:', err)
  }
}
