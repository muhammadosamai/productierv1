export type SearchEntityType =
  | 'task'
  | 'initiative'
  | 'delivery'
  | 'team_member'
  | 'wiki_asset'

export type SearchMatchKind = 'lexical' | 'semantic' | 'hybrid'

export interface GlobalSearchResult {
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

export interface GlobalSearchResponse {
  items: GlobalSearchResult[]
  nextCursor: string | null
  hasMore: boolean
  totalApprox: number
}
