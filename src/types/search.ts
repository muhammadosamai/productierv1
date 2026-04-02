export type SearchEntityType = 'story' | 'task' | 'issue' | 'initiative' | 'wiki'

export interface SearchQuickItem {
  id: string
  publicId: string | null
  title: string
  subtitle: string | null
  product: string
  status?: string | null
  updatedAt?: string | null
  entityType: SearchEntityType
  href: string
}

export interface SearchQuickResponse {
  query: string
  groups: {
    stories: SearchQuickItem[]
    tasks: SearchQuickItem[]
    issues: SearchQuickItem[]
    initiatives: SearchQuickItem[]
    wikiAssets: SearchQuickItem[]
  }
  filters: {
    text: string
    status?: string
    type?: string
    assigneeMe?: boolean
  }
}