import type { Issue } from './issue'

export type StoryType = 'feature' | 'bug' | 'improvement' | 'technical_debt' | 'research' | 'infrastructure' | 'testing' | 'documentation'
export type StoryPriority = 'low' | 'medium' | 'high'
export type StoryStatus = 'backlog' | 'drafted' | 'initialized' | 'in_progress' | 'completed' | 'archived'
export type TaskStatus = 'created' | 'assigned' | 'in_progress' | 'in_review' | 'done' | 'overdue' | 'blocked' | 'archived'
export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskType = 'design' | 'development' | 'testing' | 'review' | 'research' | 'fix' | 'documentation' | 'deployment'

export interface Story {
  id: string
  title: string
  description: string | null
  type: StoryType
  priority: StoryPriority
  status: StoryStatus
  product: string
  initiative: string | null
  delivery: string | null
  owner: string | null
  ownerAvatar: string | null
  estimate: string | null
  acceptanceCriteria: string | null
  createdAt: string
  updatedAt: string
  tasks: Task[]
  issues?: Issue[]
  comments?: StoryComment[]
  attachments?: StoryAttachment[]
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

export interface TaskSubtask {
  id: string
  parentTaskId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  type: TaskType | null
  assigneeUserIds: string[] | null
  estimateValue: number | null
  dependent: string[] | null
  blockedReason: string | null
  deliveryId: string | null
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  delivery?: { id: string; title: string } | null
}

export interface Task {
  id: string
  productId: string
  initiativeId: string | null
  storyId: string
  deliveryId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  type: TaskType | null
  ownerUserId: string | null
  assigneeUserIds: string[] | null
  reviewerUserIds: string[] | null
  createdByUserId: string
  estimateValue: number | null
  dependent: string[] | null
  blockedReason: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  /** Calendar date YYYY-MM-DD */
  startDate: string | null
  /** Calendar date YYYY-MM-DD */
  endDate: string | null
  /** Legacy deadline timestamp; may be derived from `endDate` in API responses */
  dueAt: string | null
  comments?: TaskComment[]
  attachments?: TaskAttachment[]
  subtasks?: TaskSubtask[]
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

export interface StoryAttachment {
  id: string
  storyId: string
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
  description?: string
  type?: StoryType
  priority?: StoryPriority
  status?: StoryStatus
  product?: string
  initiative?: string
  delivery?: string
  owner?: string | null
  ownerAvatar?: string | null
  estimate?: string
  acceptanceCriteria?: string
}

export interface CreateTaskSubtaskPayload {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  type?: TaskType | null
  assigneeUserIds?: string[] | null
  estimateValue?: number | null
  dependent?: string[] | null
  blockedReason?: string | null
  deliveryId?: string | null
  dueAt?: string | null
  sortOrder?: number
}

/** Sub-task row while creating the parent task (not yet persisted). */
export interface SubtaskDraftRow {
  localId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  type: TaskType | null
  assigneeUserIds: string[]
  estimateValue: number | null
  dependent: string[]
  blockedReason: string | null
  deliveryId: string | null
  dueAt: string
  sortOrder: number
}

export interface CreateTaskPayload {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  type?: TaskType | null
  ownerUserId?: string | null
  assigneeUserIds?: string[] | null
  reviewerUserIds?: string[] | null
  estimateValue?: number | null
  dependent?: string[] | null
  blockedReason?: string | null
  deliveryId?: string | null
  /** @deprecated Prefer startDate/endDate; still accepted by API for compatibility */
  dueAt?: string | null
  startDate?: string | null
  endDate?: string | null
  subtasks?: CreateTaskSubtaskPayload[]
}

export type UpdateTaskSubtaskPayload = Partial<{
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  type: TaskType | null
  assigneeUserIds: string[] | null
  estimateValue: number | null
  dependent: string[] | null
  blockedReason: string | null
  deliveryId: string | null
  dueAt: string | null
  sortOrder: number
}>
