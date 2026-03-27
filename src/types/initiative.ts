export type InitiativeStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived'
export type InitiativePriority = 'low' | 'medium' | 'high' | 'critical'

export interface Initiative {
  id: string
  title: string
  description: string | null
  status: InitiativeStatus
  period: string | null
  periodStart: string | null
  periodEnd: string | null
  leader: string | null
  leaderAvatar: string | null
  priority: InitiativePriority
  product: string
  createdAt: string
  updatedAt: string
}

export interface CreateInitiativePayload {
  title: string
  description?: string
  status?: InitiativeStatus
  period?: string
  periodStart?: string
  periodEnd?: string
  leader?: string
  leaderAvatar?: string
  priority?: InitiativePriority
  product?: string
}
