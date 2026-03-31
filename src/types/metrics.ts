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

export interface AtRiskOwnerRollup {
  ownerType: 'user' | 'team' | 'unassigned'
  ownerId: string | null
  ownerName: string
  taskCount: number
  overdue: number
  blocked: number
  agingWip: number
  missingOwner: number
  missingReviewer: number
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
    onTimeRatePlanned: number
    onTimeRateUnplanned: number
    onTimeDueCountPlanned: number
    onTimeDueCountUnplanned: number
    dueDateQualityRate: number
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
    byOwner: AtRiskOwnerRollup[]
    timeInRisk: {
      medianDays: number
      p85Days: number
      sampleSize: number
    }
  }
  sparkline: number[]
  team: {
    workload: DashboardTeamWorkloadMember[]
    totalMembers: number
  }
  meta: MetricsMeta
}

export interface ExecutiveKpiValue {
  value: number
  unit: string
  sampleSize: number
  direction?: 'late' | 'early' | 'balanced'
}

export type ExecutiveKpiKey =
  | 'portfolioHealthScore'
  | 'deliveryConfidenceDistribution'
  | 'forecastBias'
  | 'scopeVolatilityBurn'
  | 'riskBurndown'
  | 'initiativeExecutionConfidence'
  | 'qualityCostIndex'
  | 'throughputStabilityIndex'
  | 'crossProductBottleneckHeatmap'
  | 'customerImpactProxy'

export interface ExecutiveKpiSummary {
  portfolioHealthScore: ExecutiveKpiValue
  deliveryConfidenceDistribution: ExecutiveKpiValue
  forecastBias: ExecutiveKpiValue
  scopeVolatilityBurn: ExecutiveKpiValue
  riskBurndown: ExecutiveKpiValue
  initiativeExecutionConfidence: ExecutiveKpiValue
  qualityCostIndex: ExecutiveKpiValue
  throughputStabilityIndex: ExecutiveKpiValue
  crossProductBottleneckHeatmap: ExecutiveKpiValue
  customerImpactProxy: ExecutiveKpiValue
}

export interface ExecutiveKpisResponse {
  kpis: ExecutiveKpiSummary
  details: {
    portfolioHealthScore: {
      score: number
      components: {
        predictabilityScore: number
        qualityScore: number
        blockerScore: number
        workloadBalanceScore: number
        blockedPer100Open: number
        loadBalanceIndex: number
      }
    }
    deliveryConfidenceDistribution: {
      high: number
      medium: number
      low: number
      total: number
      highPercent: number
    }
    forecastBias: {
      meanVarianceDays: number
      direction: 'late' | 'early' | 'balanced'
      lateCount: number
      earlyCount: number
      onTimeCount: number
      byProduct: Array<{
        productId: string
        productName: string
        meanVarianceDays: number
        lateCount: number
        earlyCount: number
        onTimeCount: number
        deliveries: number
      }>
      byTeam: Array<{
        teamId: string
        teamName: string
        meanVarianceDays: number
        lateCount: number
        earlyCount: number
        onTimeCount: number
        deliveries: number
      }>
    }
    scopeVolatilityBurn: {
      score: number
      totalScopeAddedAfterStart: number
      totalPlannedScope: number
      trend: Array<{
        bucket: string
        scopeAddedAfterStart: number
        scopeChangeRate: number
        onTrackCount: number
        atRiskCount: number
      }>
    }
    riskBurndown: {
      delta: number
      currentAtRisk: number
      previousAtRisk: number
      trend: Array<{
        bucket: string
        totalAtRisk: number
      }>
      byProduct: Array<{
        productId: string
        productName: string
        totalAtRisk: number
        delta: number
      }>
      byInitiative: Array<{
        initiativeId: string
        initiativeTitle: string
        totalAtRisk: number
        delta: number
      }>
    }
    initiativeExecutionConfidence: {
      averageScore: number
      bands: {
        high: number
        medium: number
        low: number
      }
      items: Array<{
        initiativeId: string
        title: string
        status: string
        linkedDeliveries: number
        linkedPredictabilityScore: number
        blockerRatio: number
        score: number
      }>
    }
    qualityCostIndex: {
      score: number
      reworkRate: number
      reopenRate: number
      escapedDefects: number
      escapedDefectsPer100Completed: number
    }
    throughputStabilityIndex: {
      score: number
      meanDeparture: number
      stdDeparture: number
      coefficientOfVariation: number
      trend: Array<{
        bucket: string
        completed: number
        rollingMean: number
        rollingStd: number
      }>
    }
    crossProductBottleneckHeatmap: {
      maxScore: number
      cells: Array<{
        productId: string
        productName: string
        blockedCount: number
        openTaskCount: number
        activeMembers: number
        overloadedMembers: number
        blockedPressure: number
        overloadPressure: number
        bottleneckScore: number
      }>
    }
    customerImpactProxy: {
      score: number
      criticalOpenFeedback: number
      totalOpenFeedback: number
      p85AcknowledgeHours: number
      p85ResolveHours: number
      acknowledgeSlaHours: number
      resolveSlaHours: number
      trend: Array<{
        bucket: string
        criticalCount: number
        avgAcknowledgeHours: number
        avgResolveHours: number
      }>
    }
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
  confidenceDrivers: {
    scopeChurn: {
      value: number
      penalty: number
      contribution: number
    }
    scheduleVariance: {
      value: number
      penalty: number
      contribution: number
    }
    completionStability: {
      value: number
      baseline: number
      penalty: number
      contribution: number
    }
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
    sampleSize: number
  }
  leadTime: {
    data: FlowTimePoint[]
    median: number
    p85: number
    p95: number
    average: number
    sampleSize: number
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
  reworkPer100Completed: number
  bugRate: number
  reopenRate: number
  reopenPer100Completed: number
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
  trend: {
    reworkSlope: number
    reopenSlope: number
    reworkThreshold: number
    reopenThreshold: number
    reworkStatus: 'healthy' | 'watch' | 'breach'
    reopenStatus: 'healthy' | 'watch' | 'breach'
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
    priorityWeight: number
    weightedBlockedDays: number
    assignee: { userId: string | null; name: string; avatar: string | null } | null
  }>
  blockedCount: number
  weightedBlockedDays: number
  blockedSlaBreachRate: number
  blockedSlaBreaches: number
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
  sampleSize: number
  baseCapacity: number
  capacity: number
  calibratedCapacity: number
  loadRatio: number
  loadRatioCalibrated: number
  capacityConfidence: MetricsConfidenceBand
  sampleConfidence: MetricsConfidenceBand
  reviewVsBuildRatio: number
}

export interface WorkloadMetricsResponse {
  memberWorkload: WorkloadMemberMetric[]
  overloaded: WorkloadMemberMetric[]
  idle: WorkloadMemberMetric[]
  overloadThreshold: number
  capacityModel: {
    teamAdjustmentFactor: number
    roleCapacityFactors: Record<string, number>
  }
  totalMembers: number
  loadBalanceIndex: number
  meta: MetricsMeta
}

export interface DeliveryRiskBreakdown {
  varianceDays: number
  varianceThresholdDays: number
  varianceBreach: boolean
  scopeAddedAfterStart: number
  scopeThreshold: number
  scopeBreach: boolean
  blockedPressure: number
  blockedPressureThreshold: number
  blockedPressureBreach: boolean
  ruleScore: number
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
  riskBreakdown: DeliveryRiskBreakdown
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

export type TeamLeadKpiKey =
  | 'review_sla_adherence'
  | 'review_queue_age'
  | 'aging_wip_index'
  | 'dependency_delay_index'
  | 'commitment_reliability_iteration'
  | 'context_switch_pressure'
  | 'execution_focus_ratio'
  | 'defect_leakage_by_delivery'
  | 'handoff_latency'
  | 'overload_forecast_2w'
  | 'assignee_concentration_risk'

export type TeamLeadKpiUnit = 'percent' | 'days' | 'hours' | 'ratio' | 'count'
export type TeamLeadKpiTrendDirection = 'up' | 'down' | 'flat'
export type TeamLeadKpiTargetDirection = 'higher' | 'lower' | 'neutral'

export interface TeamLeadKpiValue {
  key: TeamLeadKpiKey
  label: string
  description: string
  unit: TeamLeadKpiUnit
  targetDirection: TeamLeadKpiTargetDirection
  value: number
  previousValue: number | null
  deltaValue: number
  trendDirection: TeamLeadKpiTrendDirection
  numerator: number | null
  denominator: number | null
  warning: boolean
  supporting: Record<string, number>
}

export interface TeamLeadKpisResponse {
  order: TeamLeadKpiKey[]
  items: Record<TeamLeadKpiKey, TeamLeadKpiValue>
  meta: MetricsMeta
}
