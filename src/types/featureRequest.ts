export type FeatureRequestStatus = 'open' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined'
export type FeatureRequestCategory = 'enhancement' | 'new_feature' | 'integration' | 'ux_improvement' | 'performance' | 'other'

export interface FeatureRequest {
  id: string
  productId: string
  title: string
  description: string | null
  status: FeatureRequestStatus
  category: FeatureRequestCategory
  createdByUserId: string
  storyId: string | null
  tags: string[] | null
  upvoteCount: number
  createdAt: string
  updatedAt: string
  createdByUser?: { id: string; name: string; email: string; avatar: string | null }
  upvoterIds?: string[]
  commentCount?: number
  comments?: FeatureRequestComment[]
  attachments?: FeatureRequestAttachment[]
}

export interface FeatureRequestComment {
  id: string
  featureRequestId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string; email: string; avatar: string | null }
}

export interface FeatureRequestAttachment {
  id: string
  featureRequestId: string
  userId: string
  fileName: string
  fileSize: number
  mimeType: string
  filePath: string
  createdAt: string
}

export interface CreateFeatureRequestPayload {
  productId: string
  title: string
  description?: string | null
  category?: FeatureRequestCategory
  tags?: string[] | null
}
