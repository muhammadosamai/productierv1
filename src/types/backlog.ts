export type StoryType = 'feature' | 'bug' | 'improvement' | 'technical_debt' | 'research' | 'infrastructure' | 'testing' | 'documentation'
export type StoryPriority = 'low' | 'medium' | 'high' | 'critical'
export type StoryStatus = 'backlog' | 'drafted' | 'initialized' | 'in_progress' | 'completed' | 'archived'
export type TaskStatus = 'created' | 'assigned' | 'in_progress' | 'in_review' | 'done' | 'overdue' | 'blocked' | 'archived'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type TaskType = 'design' | 'development' | 'testing' | 'review' | 'research' | 'fix' | 'documentation' | 'deployment'

export interface Story {
  id: string
  title: string
  description: string | null
  type: StoryType
  priority: StoryPriority
  status: StoryStatus
  productId: string
  initiativeId: string | null
  initiative?: string | null
  delivery: string | null
  ownerUserId: string | null
  ownerUser?: { id: string; name: string; email: string; avatar: string | null }
  owner?: string | null
  ownerAvatar?: string | null
  sortOrder: number
  estimate: string | null
  acceptanceCriteria: string | null
  createdAt: string
  updatedAt: string
  tasks: Task[]
  comments?: StoryComment[]
}

export interface StoryComment {
  id: string
  storyId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string; email: string; avatar: string | null }
}

export interface Task {
  id: string
  productId: string
  initiativeId: string | null
  storyId: string
  parentTaskId?: string | null
  deliveryId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  type: TaskType | null
  ownerUserId: string | null
  ownerTeamId?: string | null
  assigneeUserIds: string[] | null
  assigneeTeamIds?: string[] | null
  reviewerUserIds: string[] | null
  reviewerTeamIds?: string[] | null
  createdByUserId: string
  estimateValue: number | null
  dependent: string[] | null
  blockedReason: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  dueAt: string | null
  comments?: TaskComment[]
  attachments?: TaskAttachment[]
  createdByUser?: { id: string; name: string; email: string; avatar: string | null }
}

export interface TaskComment {
  id: string
  taskId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string; email: string; avatar: string | null }
}

export interface TaskAttachment {
  id: string
  taskId: string
  userId: string
  fileName: string
  fileSize: number
  mimeType: string
  filePath: string
  createdAt: string
  user?: { id: string; name: string; email: string; avatar: string | null }
}

export interface CreateStoryPayload {
  title: string
  description?: string | null
  type?: StoryType
  priority?: StoryPriority
  status?: StoryStatus
  productId?: string
  initiativeId?: string | null
  initiative?: string | null
  delivery?: string | null
  ownerUserId?: string | null
  estimate?: string | null
  acceptanceCriteria?: string | null
}

export interface CreateTaskPayload {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  type?: TaskType | null
  parentTaskId?: string | null
  ownerUserId?: string | null
  ownerTeamId?: string | null
  assigneeUserIds?: string[] | null
  assigneeTeamIds?: string[] | null
  reviewerUserIds?: string[] | null
  reviewerTeamIds?: string[] | null
  estimateValue?: number | null
  dependent?: string[] | null
  blockedReason?: string | null
  deliveryId?: string | null
  dueAt?: string | null
}
