import { db } from '../db'
import { activities } from '../db/schema'
import { publishNotificationsFromActivity } from './notifications'

export type ActivityEntityType =
  | 'initiative'
  | 'story'
  | 'task'
  | 'delivery'
  | 'release'
  | 'issue'
  | 'test_cycle'
  | 'test_cycle_issue'
  | 'feature_request'
  | 'consumer_feedback'
  | 'user'
  | 'title'
  | 'product'
  | 'organization'
  | 'organization_invite'
  | 'organization_member'
  | 'server'
  | 'integration_connection'
  | 'integration_sync'
  | 'wiki_asset'
  | 'wiki_revision'

interface LogActivityParams {
  productId?: string | null
  product?: string | null
  userName: string
  userAvatar?: string | null
  userId?: string | null
  action: 'created' | 'updated' | 'deleted' | 'connected' | 'tested' | 'synced' | 'restored' | 'failed'
  entityType: ActivityEntityType
  entityId?: string | null
  entityTitle: string
  changes?: { field: string; from: string | null; to: string | null }[] | null
  routePathOverride?: string | null
  subjectUserIds?: string[] | null
}

type ActivityChangeRecord = { field: string; from: string | null; to: string | null }

function sanitizeActivityChanges(
  changes: { field: string; from: string | null; to: string | null }[] | null | undefined
): ActivityChangeRecord[] | null {
  if (!Array.isArray(changes) || changes.length === 0) return null

  const sanitized: ActivityChangeRecord[] = []
  const seen = new Set<string>()
  for (const change of changes) {
    if (!change || typeof change.field !== 'string') continue
    const field = change.field.trim()
    if (!field) continue

    const from = change.from == null ? null : String(change.from)
    const to = change.to == null ? null : String(change.to)
    if (from === to) continue

    const key = `${field}|${from || ''}|${to || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    sanitized.push({ field, from, to })
    if (sanitized.length >= 100) break
  }

  return sanitized.length > 0 ? sanitized : null
}

function sanitizeSubjectUserIds(subjectUserIds: string[] | null | undefined): string[] | null {
  if (!Array.isArray(subjectUserIds) || subjectUserIds.length === 0) return null
  const cleaned = subjectUserIds
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0)
  const unique = Array.from(new Set(cleaned))
  return unique.length > 0 ? unique : null
}

export async function logActivity(params: LogActivityParams) {
  try {
    const resolvedProductId = params.productId ?? params.product ?? null
    const changes = sanitizeActivityChanges(params.changes || null)
    const subjectUserIds = sanitizeSubjectUserIds(params.subjectUserIds || null)

    const [activity] = await db.insert(activities).values({
      productId: resolvedProductId,
      userName: params.userName,
      userAvatar: params.userAvatar || null,
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      entityTitle: params.entityTitle,
      changes,
    }).returning()

    await publishNotificationsFromActivity({
      id: activity?.id || null,
      productId: resolvedProductId,
      userId: params.userId || null,
      userName: params.userName,
      userAvatar: params.userAvatar || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      entityTitle: params.entityTitle,
      changes,
      routePathOverride: params.routePathOverride || null,
      subjectUserIds,
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
