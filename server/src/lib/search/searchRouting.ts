import type { SearchDocumentEntityType, SearchEntityType } from './searchTypes'

export function pageKeyForSearchType(entityType: SearchDocumentEntityType): string {
  switch (entityType) {
    case 'task':
      return 'tasks'
    case 'story':
      return 'stories'
    case 'initiative':
      return 'initiatives'
    case 'delivery':
      return 'deliveries'
    case 'team_member':
      return 'team'
    case 'wiki_asset':
      return 'wiki'
    default:
      return 'home'
  }
}

export function routePathForSearchType(entityType: SearchEntityType, entityId: string): string {
  const encodedId = encodeURIComponent(entityId)
  switch (entityType) {
    case 'task':
      return `/tasks?task=${encodedId}`
    case 'initiative':
      return `/initiatives/${encodedId}`
    case 'delivery':
      return `/deliveries/${encodedId}`
    case 'team_member':
      return `/team?member=${encodedId}`
    case 'wiki_asset':
      return `/wiki?asset=${encodedId}`
    default:
      return '/home'
  }
}

export function routePathForDocumentType(entityType: SearchDocumentEntityType, entityId: string): string {
  const encodedId = encodeURIComponent(entityId)
  switch (entityType) {
    case 'story':
      return `/stories?story=${encodedId}`
    case 'task':
    case 'initiative':
    case 'delivery':
    case 'team_member':
    case 'wiki_asset':
      return routePathForSearchType(entityType, entityId)
    default:
      return '/home'
  }
}
