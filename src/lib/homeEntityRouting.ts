import type { RouteLocationRaw } from 'vue-router'
import type { SearchEntityType } from '@/types/search'

type NullableString = string | null | undefined

function hasValue(value: NullableString): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeEntityType(entityType: NullableString): string {
  return String(entityType || '').trim().toLowerCase()
}

export function buildHomeTaskRoute(taskId: NullableString): RouteLocationRaw | null {
  if (!hasValue(taskId)) return null
  return { path: '/tasks', query: { task: taskId } }
}

export function buildHomeStoryRoute(storyId: NullableString): RouteLocationRaw | null {
  if (!hasValue(storyId)) return null
  return { path: '/stories', query: { story: storyId } }
}

export function buildHomeUserRoute(userId: NullableString): RouteLocationRaw | null {
  if (!hasValue(userId)) return null
  return { path: '/users', query: { user: userId } }
}

export function buildHomeActivityEntityRoute(
  entityType: NullableString,
  entityId: NullableString,
): RouteLocationRaw | null {
  const normalizedType = normalizeEntityType(entityType)

  switch (normalizedType) {
    case 'task':
      return buildHomeTaskRoute(entityId)
    case 'story':
      return buildHomeStoryRoute(entityId)
    case 'initiative':
      return hasValue(entityId) ? { path: `/initiatives/${entityId}` } : null
    case 'delivery':
      return hasValue(entityId) ? { path: `/deliveries/${entityId}` } : null
    case 'release':
      return hasValue(entityId) ? { path: `/releases/${entityId}` } : null
    case 'test_cycle':
      return hasValue(entityId) ? { path: `/test-cycles/${entityId}` } : null
    case 'issue':
      return { path: '/issues' }
    case 'team_member':
    case 'user':
      return buildHomeUserRoute(entityId)
    case 'integration_connection':
    case 'integration_sync':
      return { path: '/integrations' }
    case 'wiki_asset':
    case 'wiki_revision':
      return { path: '/wiki' }
    default:
      return null
  }
}

export function buildGlobalSearchEntityRoute(
  entityType: SearchEntityType,
  entityId: string,
): RouteLocationRaw {
  const id = entityId
  switch (entityType) {
    case 'task':
      return { path: '/tasks', query: { task: id } }
    case 'initiative':
      return { path: `/initiatives/${id}` }
    case 'delivery':
      return { path: `/deliveries/${id}` }
    case 'team_member':
      return { path: '/users', query: { user: id } }
    case 'wiki_asset':
      return { path: '/wiki', query: { asset: id } }
    default:
      return { path: '/home' }
  }
}
