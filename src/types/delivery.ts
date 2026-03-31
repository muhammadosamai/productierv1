import type { Task } from './backlog'

export type DeliveryStatus = 'initialized' | 'in_progress' | 'overdue' | 'blocked' | 'completed' | 'archived'

export interface DeliveryLinkedRelease {
  id: string
  title: string
  status: string
  version: string | null
}

export interface DeliveryHealthSummary {
  blockedTasks: number
  overdueTasks: number
  scopeAddedAfterStart: number
  projectedEndDate: string | null
  scheduleVarianceDays: number
  confidenceBand: 'low' | 'medium' | 'high'
  riskReasons: string[]
  onTrack: boolean
}

export interface Delivery {
  id: string
  productId: string
  title: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: DeliveryStatus
  createdByUserId: string
  createdAt: string
  updatedAt: string
  // Enriched from API
  createdByUser?: { id: string; name: string; email: string; avatar: string | null }
  initiatives?: Array<{ id: string; title: string; status: string }>
  linkedReleases?: DeliveryLinkedRelease[]
  tasks?: Task[]
  totalTasks?: number
  completedTasks?: number
  progress?: number
  healthSummary?: DeliveryHealthSummary
}

export interface CreateDeliveryPayload {
  title: string
  description?: string | null
  status?: DeliveryStatus
  startDate?: string | null
  endDate?: string | null
  productId?: string
  initiativeIds?: string[]
}
