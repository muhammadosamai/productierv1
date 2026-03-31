export type AssetStatus = 'draft' | 'active' | 'deprecated' | 'archived'
export type AssetVisibility = 'public' | 'internal' | 'private'

export interface AssetType {
  id: string
  name: string
  slug: string
  category: string
  icon: string | null
  color: string | null
  productId: string
  createdAt: string
}

export interface Asset {
  id: string
  productId: string
  assetTypeId: string
  title: string
  slug: string | null
  description: string | null
  content: string | null
  status: AssetStatus
  visibility: AssetVisibility
  ownerUserId: string | null
  tags: string[] | null
  parentId: string | null
  sortOrder: number
  createdByUserId: string
  createdAt: string
  updatedAt: string
  assetType?: AssetType
  ownerUser?: { id: string; name: string; email: string; avatar: string | null }
  createdByUser?: { id: string; name: string; email: string; avatar: string | null }
  children?: Asset[]
  sourceRelations?: AssetRelation[]
  targetRelations?: AssetRelation[]
}

export interface AssetRelation {
  id: string
  sourceAssetId: string
  targetAssetId: string
  relationType: string
  createdAt: string
  sourceAsset?: Asset
  targetAsset?: Asset
}

export interface AssetRevision {
  id: string
  assetId: string
  revisionNumber: number
  title: string
  description: string | null
  content: string | null
  status: AssetStatus
  visibility: AssetVisibility
  tags: string[] | null
  changedByUserId: string
  changeSummary: string | null
  createdAt: string
  changedByUser?: { id: string; name: string; email: string; avatar: string | null }
}

export interface AssetRevisionDiffLine {
  type: 'context' | 'add' | 'remove'
  line: string
}

export interface AssetRevisionDiff {
  targetRevisionId: string
  baseRevisionId: string | null
  fields: Array<{ field: string; from: string | null; to: string | null }>
  contentDiff: AssetRevisionDiffLine[]
}

export interface CreateAssetPayload {
  productId: string
  assetTypeId: string
  title: string
  description?: string | null
  content?: string | null
  status?: AssetStatus
  visibility?: AssetVisibility
  ownerUserId?: string | null
  tags?: string[] | null
  parentId?: string | null
  sortOrder?: number
  changeSummary?: string
}

export interface CreateAssetTypePayload {
  name: string
  category?: string
  icon?: string
  color?: string
  productId: string
}
