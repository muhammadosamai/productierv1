export const SEARCH_ENTITY_TYPES = [
  'task',
  'initiative',
  'delivery',
  'team_member',
  'wiki_asset',
] as const

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number]
export type SearchDocumentEntityType = SearchEntityType | 'story'

export type SearchMatchKind = 'lexical' | 'semantic' | 'hybrid'

export interface SearchResultItem {
  id: string
  entityType: SearchEntityType
  title: string
  subtitle: string | null
  descriptionSnippet: string | null
  productId: string
  score: number
  matchedBy: SearchMatchKind
  routePath: string
  metadata?: Record<string, unknown>
}

export interface SearchEnvelope {
  items: SearchResultItem[]
  nextCursor: string | null
  hasMore: boolean
  totalApprox: number
}

export interface SearchCandidate extends Omit<SearchResultItem, 'matchedBy' | 'score'> {
  lexicalScore: number
  semanticScore: number
  updatedAt: string | null
  exactTitleMatch?: boolean
  prefixTitleMatch?: boolean
}

export interface SearchQueryInput {
  productId: string
  q: string
  types: SearchEntityType[]
  limit: number
  cursorOffset: number
}

export function isSearchEntityType(value: string): value is SearchEntityType {
  return (SEARCH_ENTITY_TYPES as readonly string[]).includes(value)
}

export function parseSearchTypes(raw: string | undefined | null): SearchEntityType[] {
  if (!raw) return [...SEARCH_ENTITY_TYPES]
  const types = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is SearchEntityType => isSearchEntityType(part))
  return types.length > 0 ? Array.from(new Set(types)) : [...SEARCH_ENTITY_TYPES]
}
