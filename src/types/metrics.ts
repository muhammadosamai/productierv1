import type { TaskPriority, TaskStatus } from './backlog'

export type MetricsGranularity = 'day' | 'week' | 'month'
export type MetricsConfidenceBand = 'low' | 'medium' | 'high'
export type DeliveryRiskBadge = 'on_track' | 'watch' | 'at_risk'

export interface MetricsMeta {
  generatedAt: string
  sourceWindow: {
    periodDays: number
    granularity?: MetricsGranularity | 'rolling'
    startAt: string
    endAt: string
  }
  sampleSize: Record<string, number>
  cacheAge: number | null
  cacheTtl: number | null
  lowSample: boolean
}

export interface DashboardTeamWorkloadMember {
  id: string
  name: string
  avatar: string | null
  role: string
  tasks: {
    total: number
    completed: number
    inProgress: number
    overdue: number
    blocked: number
    agingWip: number
  }
  stories: number
  completionRate: number
}

export interface DashboardMetricsResponse {
  kpi: {
    tasksCompleted: { current: number; previous: number }
    storiesCompleted: number
    taskCompletionRate: number
    storyCompletionRate: number
    initCompletionRate: number
    delivCompletionRate: number
    avgCycleTime: number
    avgLeadTime: number
    onTimeRate: number
    blockedCount: number
    overdueCount: number
    inProgressCount: number
    inReviewCount: number
    totalTasks: number
    totalStories: number
    totalInitiatives: number
    totalDeliveries: number
  }
  flowHealth: {
    blockerRatio: number
    overdueRatio: number
    agingWipRatio: number
    onTimeRate: number
    trendDirection: 'up' | 'down' | 'flat'
    activeTaskCount: number
    agingWipCount: number
  }
  atRiskWork: {
    total: number
    delta: number
    byCategory: {
      overdue: number
      blocked: number
      agingWip: number
      missingOwner: number
      missingReviewer: number
    }
    trend: Array<{
      date: string
      total: number
      overdue: number
      blocked: number
      agingWip: number
      missingOwner: number
      missingReviewer: number
    }>
  }
  sparkline: number[]
  team: {
    workload: DashboardTeamWorkloadMember[]
    totalMembers: number
  }
  meta: MetricsMeta
}

export interface ThroughputBucket {
  date: string
  created: number
  completed: number
  arrivalRate: number
  departureRate: number
  netFlow: number
  rollingMean: number
  rollingStd: number
}

export interface ThroughputMetricsResponse {
  completedOverTime: ThroughputBucket[]
  byType: Record<string, number>
  totalCompleted: number
  totalCreated: number
  health: {
    healthy: boolean
    hint: string
  }
  meta: MetricsMeta
}

export interface PredictabilityDeliveryMetric {
  deliveryId: string
  title: string
  status: string
  planned: number
  completed: number
  predictability: number
  projectedEndDate: string | null
  scheduleVarianceDays: number
  scopeAddedAfterStart: number
  confidenceScore: number
}

export interface PredictabilityRiskPoint {
  deliveryId: string
  title: string
  varianceDays: number
  scopeChange: number
  riskScore: number
}

export interface PredictabilityMetricsResponse {
  deliveryMetrics: PredictabilityDeliveryMetric[]
  burnupData: Array<{ date: string; cumulative: number; total: number }>
  estimateData: Array<{ taskId: string; title: string; estimate: number; actualDays: number }>
  forecast: {
    projectedCompletionDate: string | null
    p50Date: string | null
    p85Date: string | null
    confidenceScore: number
    confidenceBand: MetricsConfidenceBand
    remainingScope: number
    avgDeparturePerWeek: number
  }
  riskMatrix: PredictabilityRiskPoint[]
  onTimeRate: number
  overdueCount: number
  scopeChangeCount: number
  avgPredictability: number
  meta: MetricsMeta
}

export interface FlowTimePoint {
  taskId: string
  title: string
  priority?: TaskPriority | string
  cycleTimeDays?: number
  leadTimeDays?: number
  completedAt?: string | null
}

export interface FlowPercentilePoint {
  bucket: string
  p50Cycle: number
  p85Cycle: number
  p95Cycle: number
  p50Lead: number
  p85Lead: number
  p95Lead: number
  sampleSize: number
}

export interface FlowMetricsResponse {
  cycleTime: {
    data: FlowTimePoint[]
    median: number
    p85: number
    p95: number
    average: number
  }
  leadTime: {
    data: FlowTimePoint[]
    median: number
    p85: number
    p95: number
    average: number
  }
  percentileTrend: FlowPercentilePoint[]
  agingWip: Array<{
    taskId: string
    title: string
    status: TaskStatus | string
    priority: TaskPriority | string
    ageDays: number
  }>
  cfd: Array<{ date: string } & Record<string, number | string>>
  flowEfficiency: number
  wipCount: number
  trendSlope: {
    cycleP85: number
    leadP85: number
  }
  meta: MetricsMeta
}

export interface QualityMetricsResponse {
  firstPassRate: number
  reworkRate: number
  bugRate: number
  reopenRate: number
  reopenCount: number
  escapedDefects: number
  totalCompleted: number
  reworkCount: number
  reworkEventCount: number
  reviewLoad: Array<{ userId: string; name: string; avatar: string | null; count: number }>
  reworkedTasks: Array<{
    taskId: string
    title: string
    status: TaskStatus | string
    priority: TaskPriority | string
    reworkCount: number
  }>
  firstPassByPriority: Array<{ priority: string; firstPass: number; total: number }>
  firstPassByType: Array<{ type: string; firstPass: number; total: number }>
  weeklyOutcomes: Array<{ bucket: string; firstPass: number; reopened: number; escaped: number }>
  reopenControl: {
    targetRate: number
    points: Array<{ bucket: string; rate: number; count: number }>
  }
  reworkByWeek: Array<{ date: string; count: number }>
  taxonomyNote: string
  meta: MetricsMeta
}

export interface BlockersMetricsResponse {
  currentlyBlocked: Array<{
    taskId: string
    title: string
    priority: TaskPriority | string
    blockedReason: string
    blockedDays: number
    assignee: { userId: string | null; name: string; avatar: string | null } | null
  }>
  blockedCount: number
  avgBlockDuration: number
  medianUnblockDays: number
  unblockSlaDays: number
  unblockSlaHitRate: number
  longOpenBreaches: number
  unblockDistribution: Array<{ bucket: string; count: number }>
  unblockFunnel: {
    blockedTotal: number
    unblockedWithinSla: number
    slaBreached: number
  }
  blockReasons: Array<{ reason: string; count: number }>
  bottleneckStages: Record<string, { count: number; avgAge: number }>
  blockedTrend: Array<{ date: string; count: number }>
  meta: MetricsMeta
}

export interface WorkloadMemberMetric {
  id: string
  name: string
  avatar: string | null
  role: string
  totalTasks: number
  wipCount: number
  completedCount: number
  byStatus: Record<string, number>
  reviewLoad: number
  overdueCount: number
  overdueTasks: Array<{ taskId: string; title: string; dueAt: string; daysOverdue: number }>
  completionRate: number
  capacity: number
  loadRatio: number
  reviewVsBuildRatio: number
}

export interface WorkloadMetricsResponse {
  memberWorkload: WorkloadMemberMetric[]
  overloaded: WorkloadMemberMetric[]
  idle: WorkloadMemberMetric[]
  overloadThreshold: number
  totalMembers: number
  loadBalanceIndex: number
  meta: MetricsMeta
}

export interface DeliveryMetricsDetail {
  id: string
  title: string
  status: string
  startDate: string | null
  endDate: string | null
  projectedEndDate: string | null
  scheduleVarianceDays: number
  scopeAddedAfterStart: number
  riskBadge: DeliveryRiskBadge
  riskReasons: string[]
  totalTasks: number
  completed: number
  blocked: number
  progress: number
  velocity: number
  daysRemaining: number | null
  onTrack: boolean
}

export interface DeliveriesMetricsResponse {
  deliveryDetails: DeliveryMetricsDetail[]
  byStatus: Record<string, number>
  bubblePoints: Array<{
    deliveryId: string
    title: string
    scopeChange: number
    varianceDays: number
    totalTasks: number
  }>
  activeDeliveries: number
  avgProgress: number
  total: number
  meta: MetricsMeta
}
