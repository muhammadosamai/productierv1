import type { TaskPriority, TaskStatus } from './backlog'

export type HomeActionScoreStatus = 'healthy' | 'warning' | 'critical'
export type HomeRiskBand = 'overdue' | 'due_today' | 'due_48h' | 'blocked' | 'unassigned_or_stalled'
export type HomeNeedsAttentionGroupKey = 'overdue' | 'blockedOwned' | 'reviewWaiting' | 'dueSoon' | 'staleInProgress'
export type HomeAssigneeCoverage = 'assigned' | 'unassigned'
export type HomePersonalWipStatus = 'healthy' | 'warning' | 'over_limit'

export interface HomeActionScoreReason {
  key: string
  label: string
  count: number
  weight: number
}

export interface HomeActionScore {
  current: number
  target: number
  delta: number | null
  sampleSize: number
  status: HomeActionScoreStatus
  reasons: HomeActionScoreReason[]
}

export interface HomeStats {
  totalAssigned: number
  totalCompleted: number
  completionRate: number
  overdueItems: number
  blockedCount: number
  dueSoonCount: number
  reviewQueueCount: number
  staleCount: number
  activeCount: number
}

export interface HomeTaskSummary {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  productId: string
  product: string
  dueAt: string | null
  storyTitle: string
  blockedReason: string | null
  assigneeCoverage: HomeAssigneeCoverage
  ageDays: number
  updatedAt: string
}

export interface HomeNeedsAttentionGroup {
  key: HomeNeedsAttentionGroupKey
  label: string
  count: number
  tasks: HomeTaskSummary[]
}

export interface HomeNeedsAttention {
  total: number
  groups: Record<HomeNeedsAttentionGroupKey, HomeNeedsAttentionGroup>
}

export interface HomeActivityChange {
  field: string
  from: string | null
  to: string | null
}

export interface HomeActivityItem {
  id: string
  productId: string | null
  userId: string | null
  userName: string
  userAvatar: string | null
  action: string
  entityType: string
  entityId: string | null
  entityTitle: string
  changes: HomeActivityChange[] | null
  createdAt: string
}

export interface HomeRiskTimelineDay {
  date: string
  dayNum: number
  dayName: string
  isToday: boolean
}

export interface HomeRiskTimelineCell {
  date: string
  band: HomeRiskBand
  count: number
}

export interface HomeRiskTimeline {
  days: HomeRiskTimelineDay[]
  bands: HomeRiskBand[]
  cells: HomeRiskTimelineCell[]
  totalsByBand: Record<HomeRiskBand, number>
}

export interface HomeUpcomingDeadline {
  type: 'task'
  riskReason: string
  suggestedAction: string
  daysAtRisk: number
  reviewAgeHours?: number
}

export interface HomeReviewQueueItem extends HomeTaskSummary {
  reviewAgeHours: number
}

export interface HomeReviewQueueHealth {
  total: number
  slaTargetHours: number
  buckets: {
    lt24: number
    between24And72: number
    gt72: number
  }
  slaBreachCount: number
  items: HomeReviewQueueItem[]
}

export interface HomePersonalWip {
  current: number
  limit: number
  status: HomePersonalWipStatus
  byStatus: Record<string, number>
}

export interface HomeAgingWork {
  buckets: {
    gt7: number
    gt14: number
    gt30: number
  }
  oldest: Array<HomeTaskSummary & { ageDays: number }>
}

export interface HomeDashboardResponse {
  actionScore: HomeActionScore
  stats: HomeStats
  needsAttention: HomeNeedsAttention
  riskTimeline: HomeRiskTimeline
  upcomingDeadlines: Array<HomeTaskSummary & HomeUpcomingDeadline>
  reviewQueueHealth: HomeReviewQueueHealth
  personalWip: HomePersonalWip
  agingWork: HomeAgingWork
  tasksByStatus: Record<string, number>
  totalTasks: number
  activities: HomeActivityItem[]
  generatedAt: string
}
