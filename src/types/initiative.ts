export type InitiativeStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived'
export type InitiativePriority = 'low' | 'medium' | 'high' | 'critical'

export interface InitiativeMember {
  id: string
  initiativeId: string
  userId: string
  assignedByUserId: string | null
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string; email: string; avatar: string | null }
}

export interface InitiativeTeam {
  id: string
  initiativeId: string
  organizationTeamId: string
  assignedByUserId: string | null
  createdAt: string
  updatedAt: string
  team?: {
    id: string
    organizationId: string
    name: string
    key: string
    description: string | null
    leadUserId: string | null
  }
}

export interface Initiative {
  id: string
  title: string
  description: string | null
  status: InitiativeStatus
  period: string | null
  periodStart: string | null
  periodEnd: string | null
  leaderUserId: string | null
  leaderUser?: { id: string; name: string; email: string; avatar: string | null }
  leader?: string | null
  leaderAvatar?: string | null
  members?: InitiativeMember[]
  teams?: InitiativeTeam[]
  priority: InitiativePriority
  productId: string
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
  leaderUserId?: string | null
  memberUserIds?: string[]
  teamIds?: string[]
  priority?: InitiativePriority
  productId?: string
}

export interface InitiativeDeliveryProgressItem {
  id: string
  title: string
  status: string
  startDate: string | null
  endDate: string | null
  totalTasks: number
  doneTasks: number
  progress: number
}

export interface InitiativeInsights {
  initiative: {
    id: string
    title: string
    status: InitiativeStatus
    period: string | null
    periodStart: string | null
    periodEnd: string | null
  }
  overview: {
    storiesCount: number
    storiesCompleted: number
    tasksCount: number
    tasksCompleted: number
    tasksBlocked: number
    tasksOverdue: number
    deliveriesCount: number
    deliveriesCompleted: number
  }
  deliveryProgress: {
    deliveries: InitiativeDeliveryProgressItem[]
    averageProgress: number
  }
  metrics: {
    storyByStatus: Record<string, number>
    taskByStatus: Record<string, number>
    completionRate: number
    throughput14d: number
  }
  timeline: {
    period: {
      label: string | null
      startDate: string | null
      endDate: string | null
      totalDays: number | null
      elapsedDays: number | null
      remainingDays: number | null
      scheduleProgressPercent: number | null
      isOverdue: boolean
    }
    milestones: InitiativeDeliveryProgressItem[]
  }
}
