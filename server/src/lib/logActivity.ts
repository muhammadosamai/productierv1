import { db } from '../db'
import { activities } from '../db/schema'

interface LogActivityParams {
  product: string
  userName: string
  userAvatar?: string | null
  userId?: string | null
  action: 'created' | 'updated' | 'deleted'
  entityType: 'initiative' | 'story' | 'task' | 'delivery' | 'release'
  entityId?: string | null
  entityTitle: string
  changes?: { field: string; from: string | null; to: string | null }[] | null
}

export async function logActivity(params: LogActivityParams) {
  try {
    await db.insert(activities).values({
      product: params.product,
      userName: params.userName,
      userAvatar: params.userAvatar || null,
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      entityTitle: params.entityTitle,
      changes: params.changes || null,
    })
  } catch (e) {
    console.error('Failed to log activity:', e)
  }
}

/**
 * Compute field-level changes between old and new objects.
 * For array fields (e.g. assigneeUserIds), produces individual
 * added/removed entries per element instead of one stringified change.
 */
export function computeChanges(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  fields: string[]
): { field: string; from: string | null; to: string | null }[] {
  const changes: { field: string; from: string | null; to: string | null }[] = []
  for (const field of fields) {
    if (!(field in newObj)) continue

    const oldVal = oldObj[field]
    const newVal = newObj[field]

    // Handle array fields — produce per-element added/removed changes
    if (Array.isArray(newVal) || Array.isArray(oldVal)) {
      const oldArr: string[] = Array.isArray(oldVal) ? oldVal : []
      const newArr: string[] = Array.isArray(newVal) ? newVal : []
      const oldSet = new Set(oldArr)
      const newSet = new Set(newArr)

      // Added items
      for (const item of newArr) {
        if (!oldSet.has(item)) {
          changes.push({ field, from: null, to: item })
        }
      }
      // Removed items
      for (const item of oldArr) {
        if (!newSet.has(item)) {
          changes.push({ field, from: item, to: null })
        }
      }
      continue
    }

    // Scalar fields
    if (String(newVal ?? '') !== String(oldVal ?? '')) {
      changes.push({
        field,
        from: oldVal != null ? String(oldVal) : null,
        to: newVal != null ? String(newVal) : null,
      })
    }
  }
  return changes
}
