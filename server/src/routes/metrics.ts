import { Elysia } from 'elysia'
import { db } from '../db'
import {
  users,
  tasks,
  stories,
  initiatives,
  deliveries,
  products,
  taskStatusHistory,
  issues,
  consumerFeedbacks,
} from '../db/schema'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { requireOrganizationAccess } from '../lib/authz'
import { HomeScopeResolutionError, resolveMetricsProductScope, type HomeScopeMode } from '../lib/homeScope'
import { withMetricsCache } from '../lib/metricsCache'
import { isSchemaMismatchError, schemaMismatchMessage } from '../lib/schemaMismatch'
import { TEAM_LEAD_KPI_BY_KEY, TEAM_LEAD_KPI_ORDER, type TeamLeadKpiKey, type TeamLeadKpiTargetDirection, type TeamLeadKpiUnit } from '../lib/teamLeadKpis'

// Helper: get date N days ago
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000) }

// Helper: format date as YYYY-MM-DD
function toDateKey(d: Date) { return d.toISOString().slice(0, 10) }

// Helper: format date as YYYY-WXX (ISO week, UTC)
function toWeekKey(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNumber = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber)
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

// Helper: format date as YYYY-MM
function toMonthKey(d: Date) { return d.toISOString().slice(0, 7) }

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function parseQueryNumber(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== 'string') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(parsed, max))
}

function parseGranularity(raw: unknown, fallback: 'day' | 'week' | 'month' = 'week') {
  if (raw !== 'day' && raw !== 'week' && raw !== 'month') return fallback
  return raw
}

function getGranKey(d: Date, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'day') return toDateKey(d)
  if (granularity === 'week') return toWeekKey(d)
  return toMonthKey(d)
}

// Helper: median of sorted numbers
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Helper: percentile
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((sum, value) => sum + value, 0) / arr.length
}

function stdDev(arr: number[]): number {
  if (arr.length <= 1) return 0
  const mean = average(arr)
  const variance = arr.reduce((sum, value) => sum + (value - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function roundTo(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function safePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return (numerator / denominator) * 100
}

function blockedPriorityWeight(priority: unknown): number {
  const value = typeof priority === 'string' ? priority.toLowerCase() : ''
  if (value === 'critical') return 2.2
  if (value === 'high') return 1.6
  if (value === 'low') return 0.7
  return 1
}

function toConfidenceBand(sampleSize: number): 'low' | 'medium' | 'high' {
  if (sampleSize >= 15) return 'high'
  if (sampleSize >= 6) return 'medium'
  return 'low'
}

function toIso(value: Date): string {
  return value.toISOString()
}

function buildMetricsMeta(
  periodDays: number,
  sampleSize: Record<string, number>,
  options?: {
    granularity?: string
    cacheTtl?: number
    endAt?: Date
  },
) {
  const endAt = options?.endAt ?? new Date()
  const startAt = daysAgo(periodDays)
  const totalSample = Object.values(sampleSize).reduce((sum, size) => sum + toNumber(size), 0)
  return {
    generatedAt: toIso(endAt),
    sourceWindow: {
      periodDays,
      granularity: options?.granularity,
      startAt: toIso(startAt),
      endAt: toIso(endAt),
    },
    sampleSize,
    cacheAge: null as number | null,
    cacheTtl: options?.cacheTtl ?? null,
    lowSample: totalSample > 0 && totalSample < 20,
  }
}

function toText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function toNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeDashboardHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const kpi = toRecord(root.kpi)
  const atRiskWork = toRecord(root.atRiskWork)
  const byCategory = toRecord(atRiskWork.byCategory)
  const trend = Array.isArray(atRiskWork.trend) ? atRiskWork.trend : []
  const byOwner = Array.isArray(atRiskWork.byOwner) ? atRiskWork.byOwner : []
  const timeInRisk = toRecord(atRiskWork.timeInRisk)
  return {
    ...root,
    kpi: {
      ...kpi,
      onTimeRatePlanned: toNumber(kpi.onTimeRatePlanned),
      onTimeRateUnplanned: toNumber(kpi.onTimeRateUnplanned),
      onTimeDueCountPlanned: toNumber(kpi.onTimeDueCountPlanned),
      onTimeDueCountUnplanned: toNumber(kpi.onTimeDueCountUnplanned),
      dueDateQualityRate: toNumber(kpi.dueDateQualityRate),
      onTimeRate: toNumber(kpi.onTimeRate),
    },
    atRiskWork: {
      ...atRiskWork,
      total: toNumber(atRiskWork.total),
      delta: toNumber(atRiskWork.delta),
      byCategory: {
        ...byCategory,
        overdue: toNumber(byCategory.overdue),
        blocked: toNumber(byCategory.blocked),
        agingWip: toNumber(byCategory.agingWip),
        missingOwner: toNumber(byCategory.missingOwner),
        missingReviewer: toNumber(byCategory.missingReviewer),
      },
      trend: trend.map((entry) => {
        const row = toRecord(entry)
        return {
          ...row,
          date: toText(row.date),
          total: toNumber(row.total),
          overdue: toNumber(row.overdue),
          blocked: toNumber(row.blocked),
          agingWip: toNumber(row.agingWip),
          missingOwner: toNumber(row.missingOwner),
          missingReviewer: toNumber(row.missingReviewer),
        }
      }),
      byOwner: byOwner.map((entry) => {
        const row = toRecord(entry)
        const ownerTypeRaw = toText(row.ownerType, 'unassigned')
        const ownerType = ownerTypeRaw === 'user' || ownerTypeRaw === 'team' ? ownerTypeRaw : 'unassigned'
        return {
          ...row,
          ownerType,
          ownerId: toNullableText(row.ownerId),
          ownerName: toText(row.ownerName, 'Unassigned'),
          taskCount: toNumber(row.taskCount),
          overdue: toNumber(row.overdue),
          blocked: toNumber(row.blocked),
          agingWip: toNumber(row.agingWip),
          missingOwner: toNumber(row.missingOwner),
          missingReviewer: toNumber(row.missingReviewer),
        }
      }),
      timeInRisk: {
        ...timeInRisk,
        medianDays: toNumber(timeInRisk.medianDays),
        p85Days: toNumber(timeInRisk.p85Days),
        sampleSize: toNumber(timeInRisk.sampleSize),
      },
    },
  }
}

function normalizeThroughputHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const completedOverTime = Array.isArray(root.completedOverTime) ? root.completedOverTime : []
  return {
    ...root,
    totalCompleted: toNumber(root.totalCompleted),
    completedOverTime: completedOverTime.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        date: toText(row.date),
        completed: toNumber(row.completed),
        netFlow: toNumber(row.netFlow),
      }
    }),
  }
}

function normalizeFlowHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const cycleTime = toRecord(root.cycleTime)
  const leadTime = toRecord(root.leadTime)
  const trendSlope = toRecord(root.trendSlope)
  const percentileTrend = Array.isArray(root.percentileTrend) ? root.percentileTrend : []
  return {
    ...root,
    flowEfficiency: toNumber(root.flowEfficiency),
    cycleTime: {
      ...cycleTime,
      median: toNumber(cycleTime.median),
      p85: toNumber(cycleTime.p85),
      p95: toNumber(cycleTime.p95),
      sampleSize: toNumber(cycleTime.sampleSize),
    },
    leadTime: {
      ...leadTime,
      median: toNumber(leadTime.median),
      p85: toNumber(leadTime.p85),
      p95: toNumber(leadTime.p95),
      sampleSize: toNumber(leadTime.sampleSize),
    },
    trendSlope: {
      ...trendSlope,
      cycleP85: toNumber(trendSlope.cycleP85),
      leadP85: toNumber(trendSlope.leadP85),
    },
    percentileTrend: percentileTrend.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        bucket: toText(row.bucket),
        p50Cycle: toNumber(row.p50Cycle),
        p85Cycle: toNumber(row.p85Cycle),
        p95Cycle: toNumber(row.p95Cycle),
        p50Lead: toNumber(row.p50Lead),
        p85Lead: toNumber(row.p85Lead),
        p95Lead: toNumber(row.p95Lead),
        sampleSize: toNumber(row.sampleSize),
      }
    }),
  }
}

function normalizeQualityHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const reviewLoad = Array.isArray(root.reviewLoad) ? root.reviewLoad : []
  const weeklyOutcomes = Array.isArray(root.weeklyOutcomes) ? root.weeklyOutcomes : []
  const reworkByWeek = Array.isArray(root.reworkByWeek) ? root.reworkByWeek : []
  const trend = toRecord(root.trend)
  const reworkStatusRaw = toText(trend.reworkStatus, 'healthy')
  const reopenStatusRaw = toText(trend.reopenStatus, 'healthy')
  const reworkStatus = reworkStatusRaw === 'watch' || reworkStatusRaw === 'breach' ? reworkStatusRaw : 'healthy'
  const reopenStatus = reopenStatusRaw === 'watch' || reopenStatusRaw === 'breach' ? reopenStatusRaw : 'healthy'
  return {
    ...root,
    firstPassRate: toNumber(root.firstPassRate),
    reworkRate: toNumber(root.reworkRate),
    reworkPer100Completed: toNumber(root.reworkPer100Completed),
    reopenRate: toNumber(root.reopenRate),
    reopenPer100Completed: toNumber(root.reopenPer100Completed),
    escapedDefects: toNumber(root.escapedDefects),
    reviewLoad: reviewLoad.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        userId: toText(row.userId),
        name: toText(row.name, 'Unknown'),
        avatar: toNullableText(row.avatar),
        count: toNumber(row.count),
      }
    }),
    weeklyOutcomes: weeklyOutcomes.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        bucket: toText(row.bucket),
        firstPass: toNumber(row.firstPass),
        reopened: toNumber(row.reopened),
        escaped: toNumber(row.escaped),
      }
    }),
    reworkByWeek: reworkByWeek.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        date: toText(row.date),
        count: toNumber(row.count),
      }
    }),
    trend: {
      ...trend,
      reworkSlope: toNumber(trend.reworkSlope),
      reopenSlope: toNumber(trend.reopenSlope),
      reworkThreshold: toNumber(trend.reworkThreshold),
      reopenThreshold: toNumber(trend.reopenThreshold),
      reworkStatus,
      reopenStatus,
    },
  }
}

function normalizeBlockersHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const currentlyBlocked = Array.isArray(root.currentlyBlocked) ? root.currentlyBlocked : []
  const blockedTrend = Array.isArray(root.blockedTrend) ? root.blockedTrend : []
  const unblockFunnel = toRecord(root.unblockFunnel)
  const unblockDistribution = Array.isArray(root.unblockDistribution) ? root.unblockDistribution : []
  const blockReasons = Array.isArray(root.blockReasons) ? root.blockReasons : []
  return {
    ...root,
    blockedCount: toNumber(root.blockedCount),
    weightedBlockedDays: toNumber(root.weightedBlockedDays),
    blockedSlaBreachRate: toNumber(root.blockedSlaBreachRate),
    blockedSlaBreaches: toNumber(root.blockedSlaBreaches),
    avgBlockDuration: toNumber(root.avgBlockDuration),
    medianUnblockDays: toNumber(root.medianUnblockDays),
    unblockSlaDays: toNumber(root.unblockSlaDays),
    unblockSlaHitRate: toNumber(root.unblockSlaHitRate),
    longOpenBreaches: toNumber(root.longOpenBreaches),
    unblockFunnel: {
      ...unblockFunnel,
      blockedTotal: toNumber(unblockFunnel.blockedTotal),
      unblockedWithinSla: toNumber(unblockFunnel.unblockedWithinSla),
      slaBreached: toNumber(unblockFunnel.slaBreached),
    },
    unblockDistribution: unblockDistribution.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        bucket: toText(row.bucket),
        count: toNumber(row.count),
      }
    }),
    blockReasons: blockReasons.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        reason: toText(row.reason, 'Unknown'),
        count: toNumber(row.count),
      }
    }),
    currentlyBlocked: currentlyBlocked.map((entry) => {
      const row = toRecord(entry)
      const assignee = row.assignee == null ? null : toRecord(row.assignee)
      return {
        ...row,
        taskId: toText(row.taskId),
        title: toText(row.title, 'Untitled task'),
        priority: toText(row.priority, 'medium'),
        blockedDays: toNumber(row.blockedDays),
        priorityWeight: toNumber(row.priorityWeight),
        weightedBlockedDays: toNumber(row.weightedBlockedDays),
        assignee: assignee
          ? {
            ...assignee,
            userId: toNullableText(assignee.userId),
            name: toText(assignee.name, 'Unassigned'),
            avatar: toNullableText(assignee.avatar),
          }
          : null,
      }
    }),
    blockedTrend: blockedTrend.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        date: toText(row.date),
        count: toNumber(row.count),
      }
    }),
  }
}

function normalizePredictabilityHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const deliveryMetrics = Array.isArray(root.deliveryMetrics) ? root.deliveryMetrics : []
  const burnupData = Array.isArray(root.burnupData) ? root.burnupData : []
  const estimateData = Array.isArray(root.estimateData) ? root.estimateData : []
  const forecast = toRecord(root.forecast)
  const confidenceBandRaw = toText(forecast.confidenceBand, 'low')
  const confidenceBand = confidenceBandRaw === 'high' || confidenceBandRaw === 'medium'
    ? confidenceBandRaw
    : 'low'
  const confidenceDrivers = toRecord(root.confidenceDrivers)
  const scopeChurn = toRecord(confidenceDrivers.scopeChurn)
  const scheduleVariance = toRecord(confidenceDrivers.scheduleVariance)
  const completionStability = toRecord(confidenceDrivers.completionStability)
  const riskMatrix = Array.isArray(root.riskMatrix) ? root.riskMatrix : []
  return {
    ...root,
    deliveryMetrics: deliveryMetrics.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        deliveryId: toText(row.deliveryId),
        title: toText(row.title, 'Unnamed delivery'),
        planned: toNumber(row.planned),
        completed: toNumber(row.completed),
        predictability: toNumber(row.predictability),
        scheduleVarianceDays: toNumber(row.scheduleVarianceDays),
        scopeAddedAfterStart: toNumber(row.scopeAddedAfterStart),
        confidenceScore: toNumber(row.confidenceScore),
      }
    }),
    burnupData: burnupData.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        date: toText(row.date),
        cumulative: toNumber(row.cumulative),
        total: toNumber(row.total),
      }
    }),
    estimateData: estimateData.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        taskId: toText(row.taskId),
        title: toText(row.title, 'Untitled task'),
        estimate: toNumber(row.estimate),
        actualDays: toNumber(row.actualDays),
      }
    }),
    forecast: {
      ...forecast,
      projectedCompletionDate: toNullableText(forecast.projectedCompletionDate),
      p50Date: toNullableText(forecast.p50Date),
      p85Date: toNullableText(forecast.p85Date),
      confidenceScore: toNumber(forecast.confidenceScore),
      confidenceBand,
      remainingScope: toNumber(forecast.remainingScope),
      avgDeparturePerWeek: toNumber(forecast.avgDeparturePerWeek),
    },
    confidenceDrivers: {
      ...confidenceDrivers,
      scopeChurn: {
        ...scopeChurn,
        value: toNumber(scopeChurn.value),
        penalty: toNumber(scopeChurn.penalty),
        contribution: toNumber(scopeChurn.contribution),
      },
      scheduleVariance: {
        ...scheduleVariance,
        value: toNumber(scheduleVariance.value),
        penalty: toNumber(scheduleVariance.penalty),
        contribution: toNumber(scheduleVariance.contribution),
      },
      completionStability: {
        ...completionStability,
        value: toNumber(completionStability.value),
        baseline: toNumber(completionStability.baseline),
        penalty: toNumber(completionStability.penalty),
        contribution: toNumber(completionStability.contribution),
      },
    },
    onTimeRate: toNumber(root.onTimeRate),
    overdueCount: toNumber(root.overdueCount),
    scopeChangeCount: toNumber(root.scopeChangeCount),
    avgPredictability: toNumber(root.avgPredictability),
    riskMatrix: riskMatrix.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        deliveryId: toText(row.deliveryId),
        title: toText(row.title, 'Unnamed delivery'),
        varianceDays: toNumber(row.varianceDays),
        scopeChange: toNumber(row.scopeChange),
        riskScore: toNumber(row.riskScore),
      }
    }),
  }
}

function normalizeWorkloadMember(entry: unknown): Record<string, unknown> {
  const row = toRecord(entry)
  const byStatusRaw = toRecord(row.byStatus)
  const overdueTasksRaw = Array.isArray(row.overdueTasks) ? row.overdueTasks : []
  const capacityConfidenceRaw = toText(row.capacityConfidence, 'low')
  const sampleConfidenceRaw = toText(row.sampleConfidence, 'low')
  const capacityConfidence = capacityConfidenceRaw === 'high' || capacityConfidenceRaw === 'medium'
    ? capacityConfidenceRaw
    : 'low'
  const sampleConfidence = sampleConfidenceRaw === 'high' || sampleConfidenceRaw === 'medium'
    ? sampleConfidenceRaw
    : 'low'
  return {
    ...row,
    id: toText(row.id),
    name: toText(row.name, 'Unknown'),
    wipCount: toNumber(row.wipCount),
    sampleSize: toNumber(row.sampleSize),
    baseCapacity: toNumber(row.baseCapacity),
    capacity: toNumber(row.capacity),
    calibratedCapacity: toNumber(row.calibratedCapacity),
    loadRatio: toNumber(row.loadRatio),
    loadRatioCalibrated: toNumber(row.loadRatioCalibrated),
    capacityConfidence,
    sampleConfidence,
    overdueCount: toNumber(row.overdueCount),
    completionRate: toNumber(row.completionRate),
    completedCount: toNumber(row.completedCount),
    reviewVsBuildRatio: toNumber(row.reviewVsBuildRatio),
    byStatus: Object.fromEntries(
      Object.entries(byStatusRaw).map(([status, count]) => [status, toNumber(count)]),
    ),
    overdueTasks: overdueTasksRaw.map((task) => {
      const value = toRecord(task)
      return {
        ...value,
        taskId: toText(value.taskId),
        title: toText(value.title, 'Untitled task'),
        dueAt: toText(value.dueAt),
        daysOverdue: toNumber(value.daysOverdue),
      }
    }),
  }
}

function normalizeWorkloadHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const memberWorkloadRaw = Array.isArray(root.memberWorkload) ? root.memberWorkload : []
  const overloadedRaw = Array.isArray(root.overloaded) ? root.overloaded : []
  const idleRaw = Array.isArray(root.idle) ? root.idle : []
  const capacityModel = toRecord(root.capacityModel)
  return {
    ...root,
    overloadThreshold: toNumber(root.overloadThreshold),
    capacityModel: {
      ...capacityModel,
      teamAdjustmentFactor: toNumber(capacityModel.teamAdjustmentFactor),
      roleCapacityFactors: Object.fromEntries(
        Object.entries(toRecord(capacityModel.roleCapacityFactors)).map(([role, value]) => [role, toNumber(value)]),
      ),
    },
    totalMembers: toNumber(root.totalMembers),
    loadBalanceIndex: toNumber(root.loadBalanceIndex),
    memberWorkload: memberWorkloadRaw.map((entry) => normalizeWorkloadMember(entry)),
    overloaded: overloadedRaw.map((entry) => normalizeWorkloadMember(entry)),
    idle: idleRaw.map((entry) => normalizeWorkloadMember(entry)),
  }
}

function normalizeDeliveryRiskBadge(value: unknown): 'on_track' | 'watch' | 'at_risk' {
  if (value === 'watch') return 'watch'
  if (value === 'at_risk') return 'at_risk'
  return 'on_track'
}

function normalizeDeliveriesHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const detailRows = Array.isArray(root.deliveryDetails) ? root.deliveryDetails : []
  const bubblePoints = Array.isArray(root.bubblePoints) ? root.bubblePoints : []
  return {
    ...root,
    activeDeliveries: toNumber(root.activeDeliveries),
    avgProgress: toNumber(root.avgProgress),
    total: toNumber(root.total),
    bubblePoints: bubblePoints.map((entry) => {
      const row = toRecord(entry)
      return {
        ...row,
        deliveryId: toText(row.deliveryId),
        title: toText(row.title, 'Unnamed delivery'),
        scopeChange: toNumber(row.scopeChange),
        varianceDays: toNumber(row.varianceDays),
        totalTasks: toNumber(row.totalTasks),
      }
    }),
    deliveryDetails: detailRows.map((entry) => {
      const row = toRecord(entry)
      const riskBreakdown = toRecord(row.riskBreakdown)
      return {
        ...row,
        id: toText(row.id),
        title: toText(row.title, 'Untitled delivery'),
        status: toText(row.status),
        startDate: toNullableText(row.startDate),
        endDate: toNullableText(row.endDate),
        projectedEndDate: toNullableText(row.projectedEndDate),
        riskBadge: normalizeDeliveryRiskBadge(row.riskBadge),
        riskReasons: Array.isArray(row.riskReasons)
          ? row.riskReasons
            .map((reason) => toText(reason))
            .filter((reason) => reason.length > 0)
          : [],
        riskBreakdown: {
          ...riskBreakdown,
          varianceDays: toNumber(riskBreakdown.varianceDays),
          varianceThresholdDays: toNumber(riskBreakdown.varianceThresholdDays),
          varianceBreach: Boolean(riskBreakdown.varianceBreach),
          scopeAddedAfterStart: toNumber(riskBreakdown.scopeAddedAfterStart),
          scopeThreshold: toNumber(riskBreakdown.scopeThreshold),
          scopeBreach: Boolean(riskBreakdown.scopeBreach),
          blockedPressure: toNumber(riskBreakdown.blockedPressure),
          blockedPressureThreshold: toNumber(riskBreakdown.blockedPressureThreshold),
          blockedPressureBreach: Boolean(riskBreakdown.blockedPressureBreach),
          ruleScore: toNumber(riskBreakdown.ruleScore),
        },
        scheduleVarianceDays: toNumber(row.scheduleVarianceDays),
        scopeAddedAfterStart: toNumber(row.scopeAddedAfterStart),
        totalTasks: toNumber(row.totalTasks),
        completed: toNumber(row.completed),
        blocked: toNumber(row.blocked),
        progress: toNumber(row.progress),
        velocity: toNumber(row.velocity),
        daysRemaining: row.daysRemaining === null ? null : toNumber(row.daysRemaining),
        onTrack: Boolean(row.onTrack),
      }
    }),
  }
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return toNumber(value)
}

function resolveTeamLeadKpiTrendDirection(current: number, previous: number | null): 'up' | 'down' | 'flat' {
  if (previous === null) return 'flat'
  if (Math.abs(current - previous) < 0.001) return 'flat'
  return current > previous ? 'up' : 'down'
}

function shouldWarnTeamLeadKpi(
  value: number,
  unit: TeamLeadKpiUnit,
  targetDirection: TeamLeadKpiTargetDirection,
): boolean {
  if (targetDirection === 'neutral') return false
  if (unit === 'percent') {
    return targetDirection === 'higher' ? value < 70 : value > 35
  }
  if (unit === 'ratio') {
    return targetDirection === 'higher' ? value < 1 : value > 1
  }
  if (unit === 'hours') {
    return targetDirection === 'lower' ? value > 36 : value < 4
  }
  if (unit === 'days') {
    return targetDirection === 'lower' ? value > 5 : value < 1
  }
  return targetDirection === 'lower' ? value > 10 : value < 3
}

function buildTeamLeadKpiValue(
  key: TeamLeadKpiKey,
  value: number,
  previousValue: number | null,
  options: {
    numerator?: number | null
    denominator?: number | null
    supporting?: Record<string, number>
  } = {},
) {
  const definition = TEAM_LEAD_KPI_BY_KEY[key]
  const normalizedValue = roundTo(toNumber(value), 2)
  const normalizedPrevious = previousValue === null ? null : roundTo(toNumber(previousValue), 2)
  const deltaValue = normalizedPrevious === null ? 0 : roundTo(normalizedValue - normalizedPrevious, 2)
  const trendDirection = resolveTeamLeadKpiTrendDirection(normalizedValue, normalizedPrevious)
  return {
    key,
    label: definition.label,
    description: definition.description,
    unit: definition.unit,
    targetDirection: definition.targetDirection,
    value: normalizedValue,
    previousValue: normalizedPrevious,
    deltaValue,
    trendDirection,
    numerator: options.numerator ?? null,
    denominator: options.denominator ?? null,
    warning: shouldWarnTeamLeadKpi(normalizedValue, definition.unit, definition.targetDirection),
    supporting: options.supporting ?? {},
  }
}

function normalizeTeamLeadKpisHomeFields(payload: unknown): Record<string, unknown> {
  const root = toRecord(payload)
  const orderRaw = Array.isArray(root.order) ? root.order : []
  const itemsRaw = toRecord(root.items)
  const order = orderRaw
    .map((entry) => toText(entry))
    .filter((entry): entry is TeamLeadKpiKey => TEAM_LEAD_KPI_ORDER.includes(entry as TeamLeadKpiKey))

  const normalizedItems = Object.fromEntries(
    TEAM_LEAD_KPI_ORDER.map((kpiKey) => {
      const row = toRecord(itemsRaw[kpiKey])
      const supportingRaw = toRecord(row.supporting)
      const unitRaw = toText(row.unit, TEAM_LEAD_KPI_BY_KEY[kpiKey].unit)
      const targetDirectionRaw = toText(row.targetDirection, TEAM_LEAD_KPI_BY_KEY[kpiKey].targetDirection)
      const unit = unitRaw === 'days' || unitRaw === 'hours' || unitRaw === 'ratio' || unitRaw === 'count'
        ? unitRaw
        : 'percent'
      const targetDirection = targetDirectionRaw === 'higher' || targetDirectionRaw === 'neutral'
        ? targetDirectionRaw
        : 'lower'
      return [kpiKey, {
        ...row,
        key: kpiKey,
        label: toText(row.label, TEAM_LEAD_KPI_BY_KEY[kpiKey].label),
        description: toText(row.description, TEAM_LEAD_KPI_BY_KEY[kpiKey].description),
        unit,
        targetDirection,
        value: toNumber(row.value),
        previousValue: toNullableNumber(row.previousValue),
        deltaValue: toNumber(row.deltaValue),
        trendDirection: resolveTeamLeadKpiTrendDirection(toNumber(row.value), toNullableNumber(row.previousValue)),
        numerator: toNullableNumber(row.numerator),
        denominator: toNullableNumber(row.denominator),
        warning: Boolean(row.warning),
        supporting: Object.fromEntries(
          Object.entries(supportingRaw).map(([supportingKey, supportingValue]) => [supportingKey, toNumber(supportingValue)]),
        ),
      }]
    }),
  )

  return {
    ...root,
    order: order.length > 0 ? order : TEAM_LEAD_KPI_ORDER,
    items: normalizedItems,
  }
}

function normalizeProductIds(productIds: string[]): string[] {
  return [...new Set(
    productIds
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )]
}

function buildProductScopeSql(column: string, productIds: string[]) {
  const normalized = normalizeProductIds(productIds)
  if (normalized.length === 0) return sql`false`
  return sql`${sql.raw(column)} in (${sql.join(
    normalized.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`
}

function buildTeamScopeSql(
  ownerColumn: string,
  assigneeColumn: string,
  reviewerColumn: string,
  teamId: string | null,
) {
  if (!teamId) return sql`true`
  return sql`(
    ${sql.raw(ownerColumn)} = ${teamId}::uuid
    or ${sql.raw(assigneeColumn)} && ARRAY[${teamId}::uuid]::uuid[]
    or ${sql.raw(reviewerColumn)} && ARRAY[${teamId}::uuid]::uuid[]
  )`
}

function buildTaskTeamCondition(teamId: string | null) {
  if (!teamId) return null
  return or(
    eq(tasks.ownerTeamId, teamId),
    sql`${tasks.assigneeTeamIds} && ARRAY[${teamId}::uuid]::uuid[]`,
    sql`${tasks.reviewerTeamIds} && ARRAY[${teamId}::uuid]::uuid[]`,
  )
}

function buildProductCondition(column: any, productIds: string[]) {
  const normalized = normalizeProductIds(productIds)
  if (normalized.length === 0) return sql`false`
  if (normalized.length === 1) return eq(column, normalized[0]!)
  return inArray(column, normalized)
}

function buildScopedTaskIdsSql(productIds: string[], teamId: string | null) {
  const productScopeSql = buildProductScopeSql('tasks.product_id', productIds)
  const teamScopeSql = buildTeamScopeSql(
    'tasks.owner_team_id',
    'tasks.assignee_team_ids',
    'tasks.reviewer_team_ids',
    teamId,
  )
  return sql`select tasks.id from tasks where ${productScopeSql} and ${teamScopeSql}`
}

interface MetricsAccessScope {
  mode: HomeScopeMode
  productIds: string[]
  teamId: string | null
  cacheProductId: string | null
}

interface AtRiskSnapshot {
  overdue: number
  blocked: number
  agingWip: number
  missingOwner: number
  missingReviewer: number
  total: number
}

async function computeAtRiskSnapshot(
  productIds: string[],
  teamId: string | null,
  snapshotAt: Date,
): Promise<AtRiskSnapshot> {
  const snapshotIso = snapshotAt.toISOString()
  const productScopeSql = buildProductScopeSql('t.product_id', productIds)
  const historyProductScopeSql = buildProductScopeSql('h.product_id', productIds)
  const teamScopeSql = buildTeamScopeSql(
    't.owner_team_id',
    't.assignee_team_ids',
    't.reviewer_team_ids',
    teamId,
  )
  const [row] = await db.execute(sql`
    with status_snapshot as (
      select
        t.id,
        coalesce(
          (
            select h.to_status
            from task_status_history h
            where h.task_id = t.id
              and h.changed_at <= ${snapshotIso}
              and ${historyProductScopeSql}
            order by h.changed_at desc
            limit 1
          ),
          t.status
        ) as status_at_snapshot,
        t.due_at,
        t.started_at,
        t.created_at,
        t.owner_user_id,
        t.reviewer_user_ids
      from tasks t
      where ${productScopeSql}
        and ${teamScopeSql}
        and t.created_at <= ${snapshotIso}
    )
    select
      count(*) filter (
        where status_at_snapshot not in ('done', 'archived')
          and due_at is not null
          and due_at < ${snapshotIso}
      )::int as overdue,
      count(*) filter (where status_at_snapshot = 'blocked')::int as blocked,
      count(*) filter (
        where status_at_snapshot not in ('done', 'archived')
          and ${snapshotIso}::timestamptz - coalesce(started_at, created_at) > interval '7 days'
      )::int as aging_wip,
      count(*) filter (
        where status_at_snapshot not in ('done', 'archived')
          and owner_user_id is null
      )::int as missing_owner,
      count(*) filter (
        where status_at_snapshot = 'in_review'
          and (reviewer_user_ids is null or cardinality(reviewer_user_ids) = 0)
      )::int as missing_reviewer
    from status_snapshot
  `)

  const overdue = toNumber((row as any)?.overdue)
  const blocked = toNumber((row as any)?.blocked)
  const agingWip = toNumber((row as any)?.aging_wip)
  const missingOwner = toNumber((row as any)?.missing_owner)
  const missingReviewer = toNumber((row as any)?.missing_reviewer)
  return {
    overdue,
    blocked,
    agingWip,
    missingOwner,
    missingReviewer,
    total: overdue + blocked + agingWip + missingOwner + missingReviewer,
  }
}

async function requireMetricsAccess(
  query: Record<string, string | undefined>,
  jwtVerify: (token: string) => Promise<unknown>,
  headers: Record<string, string | undefined>,
  set: any
): Promise<MetricsAccessScope | { error: string }> {
  const queryOrganizationId = typeof query.organizationId === 'string' ? query.organizationId.trim() : ''
  const headerOrganizationId = typeof headers['x-productier-organization-id'] === 'string'
    ? headers['x-productier-organization-id']!.trim()
    : ''
  const organizationId = queryOrganizationId || headerOrganizationId
  if (!organizationId) {
    set.status = 400
    return { error: 'organizationId query parameter is required' }
  }
  if (queryOrganizationId && headerOrganizationId && queryOrganizationId !== headerOrganizationId) {
    set.status = 400
    return { error: 'organizationId does not match scoped organization context' }
  }

  const organizationAccess = await requireOrganizationAccess(
    jwtVerify,
    headers,
    set,
    organizationId,
  )
  if (!organizationAccess) {
    return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
  }
  const user = organizationAccess.user

  try {
    const resolved = await resolveMetricsProductScope(user, {
      organizationId,
      scopeMode: query.scopeMode,
      productId: query.productId,
      teamId: query.teamId,
    })
    const normalizedProductIds = normalizeProductIds(resolved.productIds)
    const cacheProductId = resolved.mode === 'product' && normalizedProductIds.length === 1
      ? normalizedProductIds[0] || null
      : null
    return {
      mode: resolved.mode,
      productIds: normalizedProductIds,
      teamId: resolved.teamId,
      cacheProductId,
    }
  } catch (error) {
    if (error instanceof HomeScopeResolutionError) {
      set.status = error.status
      return { error: error.message }
    }
    if (isSchemaMismatchError(error)) {
      set.status = 503
      return { error: schemaMismatchMessage('Metrics schema') }
    }
    throw error
  }
}

const executiveKpisEnabled = String(
  process.env.EXECUTIVE_KPIS_ENABLED
  ?? process.env.executive_kpis_enabled
  ?? 'true',
).toLowerCase() !== 'false'

export const metricsRoutes = new Elysia({ prefix: '/api/metrics' })
  .use(authPlugin)

  // ==================== OVERVIEW ====================
  .get('/dashboard', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 30, 7, 365)
    const teamLimit = parseQueryNumber(query.teamLimit, 50, 5, 200)
    const cacheTtl = parseQueryNumber(query.cacheTtl, 120, 30, 1800)

    const computeDashboard = async () => {
        const since = daysAgo(period)
        const prevSince = daysAgo(period * 2)
        const sinceIso = since.toISOString()
        const prevSinceIso = prevSince.toISOString()

        const taskScopeFilter = sql`where ${buildProductScopeSql('product_id', productIds)} and ${buildTeamScopeSql(
          'owner_team_id',
          'assignee_team_ids',
          'reviewer_team_ids',
          teamId,
        )}`
        const storyFilterPrefix = sql`${buildProductScopeSql('product', productIds)} and`

    const taskAggRows = await db.execute(sql`
      select
        count(*)::int as total_tasks,
        count(*) filter (where status = 'done')::int as tasks_done,
        count(*) filter (where status not in ('done', 'archived'))::int as active_tasks,
        count(*) filter (where status = 'blocked')::int as blocked_count,
        count(*) filter (where status = 'overdue')::int as overdue_count,
        count(*) filter (where status = 'in_progress')::int as in_progress_count,
        count(*) filter (where status = 'in_review')::int as in_review_count,
        count(*) filter (where completed_at is not null and completed_at >= ${sinceIso})::int as tasks_completed_curr,
        count(*) filter (where completed_at is not null and completed_at >= ${prevSinceIso} and completed_at < ${sinceIso})::int as tasks_completed_prev,
        avg(extract(epoch from (completed_at - started_at)) / 86400.0)
          filter (where completed_at is not null and started_at is not null) as avg_cycle_time,
        avg(extract(epoch from (completed_at - created_at)) / 86400.0)
          filter (where completed_at is not null) as avg_lead_time,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and due_at >= created_at
            and completed_at >= ${sinceIso}
            and completed_at <= due_at
        )::int as on_time_count_curr,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and due_at >= created_at
            and completed_at >= ${sinceIso}
        )::int as tasks_with_due_curr,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and due_at >= created_at
            and completed_at >= ${sinceIso}
            and created_at < ${sinceIso}
            and completed_at <= due_at
        )::int as on_time_count_planned_curr,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and due_at >= created_at
            and completed_at >= ${sinceIso}
            and created_at < ${sinceIso}
        )::int as tasks_with_due_planned_curr,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and due_at >= created_at
            and completed_at >= ${sinceIso}
            and created_at >= ${sinceIso}
            and completed_at <= due_at
        )::int as on_time_count_unplanned_curr,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and due_at >= created_at
            and completed_at >= ${sinceIso}
            and created_at >= ${sinceIso}
        )::int as tasks_with_due_unplanned_curr,
        count(*) filter (
          where completed_at is not null
            and completed_at >= ${sinceIso}
            and due_at is not null
            and due_at >= created_at
        )::int as valid_due_completed_curr,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and due_at >= created_at
            and completed_at >= ${prevSinceIso}
            and completed_at < ${sinceIso}
            and completed_at <= due_at
        )::int as on_time_count_prev,
        count(*) filter (
          where completed_at is not null
            and due_at is not null
            and due_at >= created_at
            and completed_at >= ${prevSinceIso}
            and completed_at < ${sinceIso}
        )::int as tasks_with_due_prev
      from tasks
      ${taskScopeFilter}
    `)
    const taskAgg = (taskAggRows[0] as any) || {}
    const totalTasks = toNumber(taskAgg.total_tasks)
    const tasksDoneCurr = toNumber(taskAgg.tasks_done)
    const tasksCompletedCurr = toNumber(taskAgg.tasks_completed_curr)
    const tasksCompletedPrev = toNumber(taskAgg.tasks_completed_prev)
    const blockedCount = toNumber(taskAgg.blocked_count)
    const overdueCount = toNumber(taskAgg.overdue_count)
    const activeTaskCount = toNumber(taskAgg.active_tasks)
    const inProgressCount = toNumber(taskAgg.in_progress_count)
    const inReviewCount = toNumber(taskAgg.in_review_count)
    const avgCycleTime = Math.round(toNumber(taskAgg.avg_cycle_time) * 10) / 10
    const avgLeadTime = Math.round(toNumber(taskAgg.avg_lead_time) * 10) / 10
    const onTimeCountCurr = toNumber(taskAgg.on_time_count_curr)
    const tasksWithDueCountCurr = toNumber(taskAgg.tasks_with_due_curr)
    const onTimeCountPrev = toNumber(taskAgg.on_time_count_prev)
    const tasksWithDueCountPrev = toNumber(taskAgg.tasks_with_due_prev)
    const onTimeCountPlannedCurr = toNumber(taskAgg.on_time_count_planned_curr)
    const tasksWithDueCountPlannedCurr = toNumber(taskAgg.tasks_with_due_planned_curr)
    const onTimeCountUnplannedCurr = toNumber(taskAgg.on_time_count_unplanned_curr)
    const tasksWithDueCountUnplannedCurr = toNumber(taskAgg.tasks_with_due_unplanned_curr)
    const validDueCompletedCurr = toNumber(taskAgg.valid_due_completed_curr)

    const [storyAgg] = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
    }).from(stories).where(buildProductCondition(stories.productId, productIds))

    const [initiativeAgg] = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
    }).from(initiatives).where(buildProductCondition(initiatives.productId, productIds))

    const [deliveryAgg] = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
    }).from(deliveries).where(buildProductCondition(deliveries.productId, productIds))

    const totalStories = Number(storyAgg?.total ?? 0)
    const storiesCompletedCurr = Number(storyAgg?.completed ?? 0)
    const totalInitiatives = Number(initiativeAgg?.total ?? 0)
    const completedInitiatives = Number(initiativeAgg?.completed ?? 0)
    const totalDeliveries = Number(deliveryAgg?.total ?? 0)
    const completedDeliveries = Number(deliveryAgg?.completed ?? 0)

    const taskCompletionRate = totalTasks > 0 ? Math.round((tasksDoneCurr / totalTasks) * 100) : 0
    const storyCompletionRate = totalStories > 0 ? Math.round((storiesCompletedCurr / totalStories) * 100) : 0
    const initCompletionRate = totalInitiatives > 0 ? Math.round((completedInitiatives / totalInitiatives) * 100) : 0
    const delivCompletionRate = totalDeliveries > 0 ? Math.round((completedDeliveries / totalDeliveries) * 100) : 0
    const onTimeRate = tasksWithDueCountCurr > 0 ? Math.round((onTimeCountCurr / tasksWithDueCountCurr) * 100) : 100
    const onTimeRatePrev = tasksWithDueCountPrev > 0 ? Math.round((onTimeCountPrev / tasksWithDueCountPrev) * 100) : onTimeRate
    const onTimeRatePlanned = tasksWithDueCountPlannedCurr > 0
      ? Math.round((onTimeCountPlannedCurr / tasksWithDueCountPlannedCurr) * 100)
      : 100
    const onTimeRateUnplanned = tasksWithDueCountUnplannedCurr > 0
      ? Math.round((onTimeCountUnplannedCurr / tasksWithDueCountUnplannedCurr) * 100)
      : 100
    const dueDateQualityRate = tasksCompletedCurr > 0
      ? Math.round((validDueCompletedCurr / tasksCompletedCurr) * 100)
      : 100

    const [agingWipRow] = await db.execute(sql`
      select
        count(*) filter (
          where status not in ('done', 'archived')
            and now() - coalesce(started_at, created_at) > interval '7 days'
        )::int as value
      from tasks
      where ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)
    const agingWipCount = toNumber((agingWipRow as any)?.value)
    const blockerRatio = totalTasks > 0 ? Math.round((blockedCount / totalTasks) * 100) : 0
    const overdueRatio = totalTasks > 0 ? Math.round((overdueCount / totalTasks) * 100) : 0
    const agingWipRatio = activeTaskCount > 0 ? Math.round((agingWipCount / activeTaskCount) * 100) : 0
    const trendDirection = onTimeRate === onTimeRatePrev
      ? 'flat'
      : onTimeRate > onTimeRatePrev
        ? 'up'
        : 'down'

    const snapshotNow = new Date()
    const atRiskCurrent = await computeAtRiskSnapshot(productIds, teamId, snapshotNow)
    const atRiskPrevious = await computeAtRiskSnapshot(productIds, teamId, since)
    const atRiskDelta = atRiskCurrent.total - atRiskPrevious.total
    const atRiskTrend = [
      {
        date: toDateKey(since),
        total: atRiskPrevious.total,
        overdue: atRiskPrevious.overdue,
        blocked: atRiskPrevious.blocked,
        agingWip: atRiskPrevious.agingWip,
        missingOwner: atRiskPrevious.missingOwner,
        missingReviewer: atRiskPrevious.missingReviewer,
      },
      {
        date: toDateKey(snapshotNow),
        total: atRiskCurrent.total,
        overdue: atRiskCurrent.overdue,
        blocked: atRiskCurrent.blocked,
        agingWip: atRiskCurrent.agingWip,
        missingOwner: atRiskCurrent.missingOwner,
        missingReviewer: atRiskCurrent.missingReviewer,
      },
    ]

    const atRiskOwnerRows = await db.execute(sql`
      with latest_block as (
        select task_id, max(changed_at) as blocked_at
        from task_status_history
        where to_status = 'blocked'
          and ${buildProductScopeSql('product_id', productIds)}
        group by task_id
      )
      select
        t.id,
        t.status,
        t.due_at,
        t.started_at,
        t.created_at,
        t.updated_at,
        t.owner_user_id,
        t.owner_team_id,
        t.reviewer_user_ids,
        u.name as owner_user_name,
        ot.name as owner_team_name,
        lb.blocked_at
      from tasks t
      left join users u on u.id = t.owner_user_id
      left join organization_teams ot on ot.id = t.owner_team_id
      left join latest_block lb on lb.task_id = t.id
      where ${buildProductScopeSql('t.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
        and t.status not in ('done', 'archived')
    `)

    const nowMs = snapshotNow.getTime()
    const ownerRollups = new Map<string, {
      ownerType: 'user' | 'team' | 'unassigned'
      ownerId: string | null
      ownerName: string
      taskCount: number
      overdue: number
      blocked: number
      agingWip: number
      missingOwner: number
      missingReviewer: number
    }>()
    const riskDurationsDays: number[] = []

    for (const row of atRiskOwnerRows as any[]) {
      const dueAt = row.due_at ? new Date(row.due_at).getTime() : null
      const startedAt = row.started_at ? new Date(row.started_at).getTime() : null
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : nowMs
      const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : createdAt
      const blockedAt = row.blocked_at ? new Date(row.blocked_at).getTime() : null
      const status = String(row.status || '')
      const reviewerIds = Array.isArray(row.reviewer_user_ids) ? row.reviewer_user_ids : []

      const overdue = dueAt !== null && dueAt < nowMs
      const blocked = status === 'blocked'
      const agingWip = nowMs - (startedAt ?? createdAt) > 7 * 86400000
      const missingOwner = !row.owner_user_id
      const missingReviewer = status === 'in_review' && reviewerIds.length === 0
      const risky = overdue || blocked || agingWip || missingOwner || missingReviewer
      if (!risky) continue

      const riskStarts: number[] = []
      if (overdue && dueAt !== null) riskStarts.push(dueAt)
      if (blocked) riskStarts.push(blockedAt ?? updatedAt)
      if (agingWip) riskStarts.push((startedAt ?? createdAt) + 7 * 86400000)
      if (missingOwner || missingReviewer) riskStarts.push(createdAt)
      const riskSince = riskStarts.length > 0 ? Math.min(...riskStarts) : createdAt
      riskDurationsDays.push(roundTo(Math.max(0, (nowMs - riskSince) / 86400000)))

      const ownerUserId = typeof row.owner_user_id === 'string' ? row.owner_user_id : null
      const ownerTeamId = typeof row.owner_team_id === 'string' ? row.owner_team_id : null
      const ownerType: 'user' | 'team' | 'unassigned' = ownerUserId
        ? 'user'
        : ownerTeamId
          ? 'team'
          : 'unassigned'
      const ownerId = ownerUserId ?? ownerTeamId
      const ownerName = ownerType === 'user'
        ? toText(row.owner_user_name, 'Unknown user')
        : ownerType === 'team'
          ? toText(row.owner_team_name, 'Unknown team')
          : 'Unassigned'
      const key = `${ownerType}:${ownerId ?? 'none'}`
      const current = ownerRollups.get(key) ?? {
        ownerType,
        ownerId,
        ownerName,
        taskCount: 0,
        overdue: 0,
        blocked: 0,
        agingWip: 0,
        missingOwner: 0,
        missingReviewer: 0,
      }
      current.taskCount += 1
      if (overdue) current.overdue += 1
      if (blocked) current.blocked += 1
      if (agingWip) current.agingWip += 1
      if (missingOwner) current.missingOwner += 1
      if (missingReviewer) current.missingReviewer += 1
      ownerRollups.set(key, current)
    }

    const atRiskByOwner = [...ownerRollups.values()]
      .sort((a, b) => b.taskCount - a.taskCount || b.blocked - a.blocked || a.ownerName.localeCompare(b.ownerName))
      .slice(0, Math.max(5, Math.min(teamLimit, 30)))
    const timeInRisk = {
      medianDays: roundTo(percentile(riskDurationsDays, 50)),
      p85Days: roundTo(percentile(riskDurationsDays, 85)),
      sampleSize: riskDurationsDays.length,
    }

    const sparkWeeks = Math.max(2, Math.min(26, Math.ceil(period / 7)))
    const sparkHorizonDays = sparkWeeks * 7
    const sparkRows = await db.execute(sql`
      select date_trunc('week', completed_at) as week_start, count(*)::int as value
      from tasks
      where completed_at is not null
        and completed_at >= ${daysAgo(sparkHorizonDays).toISOString()}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by week_start
      order by week_start asc
    `)
    const sparkMap = new Map<string, number>()
    for (const row of sparkRows as any[]) {
      const weekKey = toWeekKey(new Date(row.week_start))
      sparkMap.set(weekKey, toNumber(row.value))
    }
    const sparkline: number[] = []
    for (let i = sparkWeeks - 1; i >= 0; i--) {
      const key = toWeekKey(daysAgo(i * 7))
      sparkline.push(sparkMap.get(key) || 0)
    }

        const teamRows = await db.execute(sql`
      with relevant_tasks as (
        select status, started_at, created_at, owner_user_id, assignee_user_ids, owner_team_id, assignee_team_ids
        from tasks
        ${taskScopeFilter}
      ),
      task_users as (
        select owner_user_id as user_id, status, started_at, created_at
        from relevant_tasks
        where owner_user_id is not null
        union all
        select unnest(assignee_user_ids) as user_id, status, started_at, created_at
        from relevant_tasks
        where assignee_user_ids is not null
        union all
        select otm.user_id as user_id, rt.status, rt.started_at, rt.created_at
        from relevant_tasks rt
        inner join organization_team_members otm
          on otm.organization_team_id = rt.owner_team_id
        where rt.owner_team_id is not null
        union all
        select otm.user_id as user_id, rt.status, rt.started_at, rt.created_at
        from relevant_tasks rt
        cross join lateral unnest(rt.assignee_team_ids) as assignee_team(team_id)
        inner join organization_team_members otm
          on otm.organization_team_id = assignee_team.team_id
        where rt.assignee_team_ids is not null
      ),
      task_agg as (
        select
          user_id,
          count(*)::int as total,
          count(*) filter (where status = 'done')::int as completed,
          count(*) filter (where status = 'in_progress')::int as in_progress,
          count(*) filter (where status = 'overdue')::int as overdue,
          count(*) filter (where status = 'blocked')::int as blocked,
          count(*) filter (
            where status not in ('done', 'archived')
              and now() - coalesce(started_at, created_at) > interval '7 days'
          )::int as aging_wip
        from task_users
        group by user_id
      ),
      story_agg as (
        select owner_user_id as user_id, count(*)::int as stories
        from backlog_items
        where ${storyFilterPrefix} owner_user_id is not null
        group by owner_user_id
      )
      select
        u.id,
        u.name,
        u.avatar,
        u.role,
        coalesce(t.total, 0) as total,
        coalesce(t.completed, 0) as completed,
        coalesce(t.in_progress, 0) as in_progress,
        coalesce(t.overdue, 0) as overdue,
        coalesce(t.blocked, 0) as blocked,
        coalesce(t.aging_wip, 0) as aging_wip,
        coalesce(s.stories, 0) as stories
      from users u
      left join task_agg t on t.user_id = u.id
      left join story_agg s on s.user_id = u.id
      where coalesce(t.total, 0) > 0 or coalesce(s.stories, 0) > 0
      order by coalesce(t.total, 0) desc, u.name asc
      limit ${teamLimit}
    `)

        const teamWorkload = (teamRows as any[]).map(row => {
      const total = toNumber(row.total)
      const completed = toNumber(row.completed)
      return {
        id: row.id as string,
        name: row.name as string,
        avatar: (row.avatar ?? null) as string | null,
        role: row.role as string,
        tasks: {
          total,
          completed,
          inProgress: toNumber(row.in_progress),
          overdue: toNumber(row.overdue),
          blocked: toNumber(row.blocked),
          agingWip: toNumber(row.aging_wip),
        },
        stories: toNumber(row.stories),
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      }
    })

        return {
      kpi: {
        tasksCompleted: { current: tasksCompletedCurr, previous: tasksCompletedPrev },
        storiesCompleted: storiesCompletedCurr,
        taskCompletionRate, storyCompletionRate, initCompletionRate, delivCompletionRate,
        avgCycleTime, avgLeadTime,
        onTimeRate,
        onTimeRatePlanned,
        onTimeRateUnplanned,
        onTimeDueCountPlanned: tasksWithDueCountPlannedCurr,
        onTimeDueCountUnplanned: tasksWithDueCountUnplannedCurr,
        dueDateQualityRate,
        blockedCount, overdueCount, inProgressCount, inReviewCount,
        totalTasks, totalStories, totalInitiatives, totalDeliveries,
      },
      flowHealth: {
        blockerRatio,
        overdueRatio,
        agingWipRatio,
        onTimeRate,
        trendDirection,
        activeTaskCount,
        agingWipCount,
      },
      atRiskWork: {
        total: atRiskCurrent.total,
        delta: atRiskDelta,
        byCategory: {
          overdue: atRiskCurrent.overdue,
          blocked: atRiskCurrent.blocked,
          agingWip: atRiskCurrent.agingWip,
          missingOwner: atRiskCurrent.missingOwner,
          missingReviewer: atRiskCurrent.missingReviewer,
        },
        trend: atRiskTrend,
        byOwner: atRiskByOwner,
        timeInRisk,
      },
      sparkline,
      team: { workload: teamWorkload, totalMembers: teamWorkload.length },
      meta: buildMetricsMeta(period, {
        tasks: totalTasks,
        completedCurrent: tasksCompletedCurr,
        teamMembers: teamWorkload.length,
        atRisk: atRiskCurrent.total,
        atRiskOwners: atRiskByOwner.length,
        atRiskTimeSamples: timeInRisk.sampleSize,
      }, { cacheTtl }),
      }
    }

    const payload = access.cacheProductId
      ? await withMetricsCache(
        { endpoint: 'dashboard', productId: access.cacheProductId, period, extra: { teamLimit } },
        cacheTtl,
        computeDashboard,
      )
      : await computeDashboard()

    return normalizeDashboardHomeFields(payload)
  })

  // ==================== THROUGHPUT ====================
  .get('/throughput', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 7, 365)
    const granularity = parseGranularity(query.granularity, 'week')
    const cacheTtl = parseQueryNumber(query.cacheTtl, 120, 30, 1800)

    const computeThroughput = async () => {
        const since = daysAgo(period)
        const sinceIso = since.toISOString()
        const completedRows = await db.execute(sql`
      select completed_at
      from tasks
      where completed_at is not null
        and completed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)
        const createdRows = await db.execute(sql`
      select created_at
      from tasks
      where created_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)

        const completedByPeriod: Record<string, number> = {}
        const createdByPeriod: Record<string, number> = {}
        for (const row of completedRows as any[]) {
          const key = getGranKey(new Date(row.completed_at), granularity)
          completedByPeriod[key] = (completedByPeriod[key] || 0) + 1
        }
        for (const row of createdRows as any[]) {
          const key = getGranKey(new Date(row.created_at), granularity)
          createdByPeriod[key] = (createdByPeriod[key] || 0) + 1
        }

        const allKeys = [...new Set([
          ...Object.keys(completedByPeriod),
          ...Object.keys(createdByPeriod),
        ])].sort()
        const rawBuckets = allKeys.map(date => ({
          date,
          completed: completedByPeriod[date] || 0,
          created: createdByPeriod[date] || 0,
        }))
        const netFlowValues = rawBuckets.map(bucket => bucket.created - bucket.completed)
        const rollingWindow = 4
        const completedOverTime = rawBuckets.map((bucket, index) => {
          const from = Math.max(0, index - (rollingWindow - 1))
          const slice = netFlowValues.slice(from, index + 1)
          const mean = Math.round(average(slice) * 10) / 10
          const deviation = Math.round(stdDev(slice) * 10) / 10
          return {
            ...bucket,
            arrivalRate: bucket.created,
            departureRate: bucket.completed,
            netFlow: bucket.created - bucket.completed,
            rollingMean: mean,
            rollingStd: deviation,
          }
        })

        const byTypeRows = await db.execute(sql`
      select coalesce(type::text, 'untyped') as task_type, count(*)::int as count
      from tasks
      where completed_at is not null
        and completed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by task_type
      order by count desc
    `)
        const byType: Record<string, number> = {}
        for (const row of byTypeRows as any[]) {
          byType[String(row.task_type)] = toNumber(row.count)
        }

        const totalCompleted = (completedRows as any[]).length
        const totalCreated = (createdRows as any[]).length
        const netFlowAverage = average(completedOverTime.map(bucket => bucket.netFlow))
        const healthy = netFlowAverage <= 0
        const healthHint = healthy
          ? 'Arrival is balanced with or below departure.'
          : 'Arrival is outpacing departure; backlog drift risk is rising.'

        return {
          completedOverTime,
          byType,
          totalCompleted,
          totalCreated,
          health: {
            healthy,
            hint: healthHint,
          },
          meta: buildMetricsMeta(period, {
            completedEvents: totalCompleted,
            createdEvents: totalCreated,
            buckets: completedOverTime.length,
          }, {
            granularity,
            cacheTtl,
          }),
        }
    }

    const payload = access.cacheProductId
      ? await withMetricsCache(
        { endpoint: 'throughput', productId: access.cacheProductId, period, granularity },
        cacheTtl,
        computeThroughput,
      )
      : await computeThroughput()

    return normalizeThroughputHomeFields(payload)
  })

  // ==================== FLOW ====================
  .get('/flow', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const sampleLimit = parseQueryNumber(query.sampleLimit, 400, 100, 2000)
    const wipLimit = parseQueryNumber(query.wipLimit, 200, 50, 500)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()
    const taskTeamCondition = buildTaskTeamCondition(teamId)
    const scopedTaskIdsSql = buildScopedTaskIdsSql(productIds, teamId)

    const completedWithStart = await db.select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
    }).from(tasks).where(and(
      sql`${tasks.completedAt} is not null`,
      sql`${tasks.startedAt} is not null`,
      sql`${tasks.completedAt} >= ${sinceIso}`,
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    )).orderBy(desc(tasks.completedAt)).limit(sampleLimit)

    const cycleTimeData = completedWithStart.map(t => ({
      taskId: t.id,
      title: t.title,
      priority: t.priority,
      cycleTimeDays: Math.round(((new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()) / 86400000) * 10) / 10,
      completedAt: t.completedAt,
    }))
    const ctValues = cycleTimeData.map(d => d.cycleTimeDays)

    const completedAll = await db.select({
      id: tasks.id,
      title: tasks.title,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
      startedAt: tasks.startedAt,
    }).from(tasks).where(and(
      sql`${tasks.completedAt} is not null`,
      sql`${tasks.completedAt} >= ${sinceIso}`,
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    )).orderBy(desc(tasks.completedAt)).limit(sampleLimit)

    const leadTimeData = completedAll.map(t => ({
      taskId: t.id,
      title: t.title,
      leadTimeDays: Math.round(((new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 86400000) * 10) / 10,
      completedAt: t.completedAt,
    }))
    const ltValues = leadTimeData.map(d => d.leadTimeDays)

    const now = Date.now()
    const wipTasks = await db.select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      startedAt: tasks.startedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    }).from(tasks).where(and(
      sql`${tasks.status} not in ('done', 'archived')`,
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    )).orderBy(desc(tasks.updatedAt)).limit(wipLimit)

    const agingWip = wipTasks.map(t => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      ageDays: Math.round(((now - new Date(t.startedAt || t.createdAt).getTime()) / 86400000) * 10) / 10,
    })).sort((a, b) => b.ageDays - a.ageDays)

    const statusKeys = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'blocked']
    const dayCount = Math.min(period, 90)
    const dayStep = dayCount > 30 ? 7 : 1
    const cfdHorizonStart = daysAgo(dayCount + 30)
    const cfdHorizonStartIso = cfdHorizonStart.toISOString()

    const cfdTasks = await db.select({
      id: tasks.id,
      createdAt: tasks.createdAt,
      status: tasks.status,
    }).from(tasks).where(and(
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    ))

    const cfdHistory = await db.select({
      taskId: taskStatusHistory.taskId,
      toStatus: taskStatusHistory.toStatus,
      changedAt: taskStatusHistory.changedAt,
    }).from(taskStatusHistory).where(and(
      sql`${taskStatusHistory.changedAt} >= ${cfdHorizonStartIso}`,
      buildProductCondition(taskStatusHistory.productId, productIds),
      ...(teamId ? [sql`${taskStatusHistory.taskId} in (${scopedTaskIdsSql})`] : []),
    )).orderBy(taskStatusHistory.taskId, taskStatusHistory.changedAt)

    const historyByTask = new Map<string, Array<{ changedAtMs: number; toStatus: string }>>()
    for (const entry of cfdHistory) {
      const list = historyByTask.get(entry.taskId) || []
      list.push({
        changedAtMs: new Date(entry.changedAt).getTime(),
        toStatus: entry.toStatus,
      })
      historyByTask.set(entry.taskId, list)
    }

    const statusAt = (taskId: string, defaultStatus: string, atMs: number) => {
      const history = historyByTask.get(taskId)
      if (!history || history.length === 0) return defaultStatus
      let low = 0
      let high = history.length - 1
      let answer = defaultStatus
      while (low <= high) {
        const mid = (low + high) >> 1
        const current = history[mid]!
        if (current.changedAtMs <= atMs) {
          answer = current.toStatus
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      return answer
    }

    const cfd: { date: string; [key: string]: number | string }[] = []
    for (let i = dayCount; i >= 0; i -= dayStep) {
      const day = daysAgo(i)
      const dayEnd = day.getTime()
      const snapshot: Record<string, number> = {}
      for (const key of statusKeys) snapshot[key] = 0

      for (const task of cfdTasks) {
        if (new Date(task.createdAt).getTime() > dayEnd) continue
        const status = statusAt(task.id, task.status, dayEnd)
        if (snapshot[status] !== undefined) snapshot[status] += 1
      }
      cfd.push({ date: toDateKey(day), ...snapshot })
    }

    let flowEfficiency = 0
    if (completedWithStart.length > 0) {
      const totalLead = completedAll.reduce(
        (sum, task) => sum + (new Date(task.completedAt!).getTime() - new Date(task.createdAt).getTime()),
        0,
      )
      const totalActive = completedWithStart.reduce(
        (sum, task) => sum + (new Date(task.completedAt!).getTime() - new Date(task.startedAt!).getTime()),
        0,
      )
      flowEfficiency = totalLead > 0 ? Math.round((totalActive / totalLead) * 100) : 0
    }

    const percentileBucketMap = new Map<string, { cycle: number[]; lead: number[] }>()
    for (const point of cycleTimeData) {
      if (!point.completedAt) continue
      const bucket = toWeekKey(new Date(point.completedAt))
      const entry = percentileBucketMap.get(bucket) || { cycle: [], lead: [] }
      entry.cycle.push(point.cycleTimeDays)
      percentileBucketMap.set(bucket, entry)
    }
    for (const point of leadTimeData) {
      if (!point.completedAt) continue
      const bucket = toWeekKey(new Date(point.completedAt))
      const entry = percentileBucketMap.get(bucket) || { cycle: [], lead: [] }
      entry.lead.push(point.leadTimeDays)
      percentileBucketMap.set(bucket, entry)
    }
    const percentileTrend = [...percentileBucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, values]) => ({
        bucket,
        p50Cycle: Math.round(percentile(values.cycle, 50) * 10) / 10,
        p85Cycle: Math.round(percentile(values.cycle, 85) * 10) / 10,
        p95Cycle: Math.round(percentile(values.cycle, 95) * 10) / 10,
        p50Lead: Math.round(percentile(values.lead, 50) * 10) / 10,
        p85Lead: Math.round(percentile(values.lead, 85) * 10) / 10,
        p95Lead: Math.round(percentile(values.lead, 95) * 10) / 10,
        sampleSize: Math.max(values.cycle.length, values.lead.length),
      }))
    const cycleSlope = percentileTrend.length > 1
      ? Math.round((percentileTrend[percentileTrend.length - 1]!.p85Cycle - percentileTrend[0]!.p85Cycle) * 10) / 10
      : 0
    const leadSlope = percentileTrend.length > 1
      ? Math.round((percentileTrend[percentileTrend.length - 1]!.p85Lead - percentileTrend[0]!.p85Lead) * 10) / 10
      : 0

    return normalizeFlowHomeFields({
      cycleTime: {
        data: cycleTimeData,
        median: Math.round(median(ctValues) * 10) / 10,
        p85: Math.round(percentile(ctValues, 85) * 10) / 10,
        p95: Math.round(percentile(ctValues, 95) * 10) / 10,
        average: ctValues.length > 0 ? Math.round((ctValues.reduce((a, b) => a + b, 0) / ctValues.length) * 10) / 10 : 0,
        sampleSize: ctValues.length,
      },
      leadTime: {
        data: leadTimeData,
        median: Math.round(median(ltValues) * 10) / 10,
        p85: Math.round(percentile(ltValues, 85) * 10) / 10,
        p95: Math.round(percentile(ltValues, 95) * 10) / 10,
        average: ltValues.length > 0 ? Math.round((ltValues.reduce((a, b) => a + b, 0) / ltValues.length) * 10) / 10 : 0,
        sampleSize: ltValues.length,
      },
      percentileTrend,
      agingWip,
      cfd,
      flowEfficiency,
      wipCount: wipTasks.length,
      trendSlope: {
        cycleP85: cycleSlope,
        leadP85: leadSlope,
      },
      meta: buildMetricsMeta(period, {
        completedWithStart: completedWithStart.length,
        completedAll: completedAll.length,
        wip: wipTasks.length,
        trendBuckets: percentileTrend.length,
      }),
    })
  })

  // ==================== QUALITY ====================
  .get('/quality', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()
    const taskTeamCondition = buildTaskTeamCondition(teamId)
    const scopedTaskIdsSql = buildScopedTaskIdsSql(productIds, teamId)

    const reworkTransitions = await db.select({
      taskId: taskStatusHistory.taskId,
      fromStatus: taskStatusHistory.fromStatus,
      toStatus: taskStatusHistory.toStatus,
      changedAt: taskStatusHistory.changedAt,
    }).from(taskStatusHistory).where(and(
      sql`${taskStatusHistory.changedAt} >= ${sinceIso}`,
      or(
        eq(taskStatusHistory.fromStatus, 'in_review'),
        eq(taskStatusHistory.fromStatus, 'done'),
      ),
      or(
        eq(taskStatusHistory.toStatus, 'in_progress'),
        eq(taskStatusHistory.toStatus, 'assigned'),
      ),
      buildProductCondition(taskStatusHistory.productId, productIds),
      ...(teamId ? [sql`${taskStatusHistory.taskId} in (${scopedTaskIdsSql})`] : []),
    ))
    const reworkTaskIds = new Set(reworkTransitions.map(h => h.taskId))

    const completedInPeriod = await db.select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      type: tasks.type,
    }).from(tasks).where(and(
      sql`${tasks.completedAt} is not null`,
      sql`${tasks.completedAt} >= ${sinceIso}`,
      buildProductCondition(tasks.productId, productIds),
      ...(taskTeamCondition ? [taskTeamCondition] : []),
    ))

    const firstPassCount = completedInPeriod.filter(t => !reworkTaskIds.has(t.id)).length
    const firstPassRate = completedInPeriod.length > 0 ? Math.round((firstPassCount / completedInPeriod.length) * 100) : 100
    const reworkRate = completedInPeriod.length > 0 ? Math.round((reworkTaskIds.size / completedInPeriod.length) * 100) : 0

    // "fix" is the closest bug-fix task type in the current task taxonomy.
    const completedBugs = completedInPeriod.filter(t => t.type === 'fix').length
    const bugRate = completedInPeriod.length > 0 ? Math.round((completedBugs / completedInPeriod.length) * 100) : 0

    const reviewLoadRows = await db.execute(sql`
      select
        r.reviewer_id as user_id,
        u.name as user_name,
        u.avatar as user_avatar,
        count(*)::int as count
      from tasks t
      cross join lateral unnest(t.reviewer_user_ids) as r(reviewer_id)
      left join users u on u.id = r.reviewer_id
      where t.status = 'in_review'
        and ${buildProductScopeSql('t.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
      group by r.reviewer_id, u.name, u.avatar
      order by count desc, u.name asc
    `)
    const reviewLoad = (reviewLoadRows as any[]).map(row => ({
      userId: row.user_id as string,
      name: (row.user_name ?? 'Unknown') as string,
      avatar: (row.user_avatar ?? null) as string | null,
      count: toNumber(row.count),
    }))

    const reworkCountByTask = new Map<string, number>()
    for (const entry of reworkTransitions) {
      reworkCountByTask.set(entry.taskId, (reworkCountByTask.get(entry.taskId) || 0) + 1)
    }
    const reworkedTaskRows = reworkTaskIds.size > 0
      ? await db.select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
      }).from(tasks).where(inArray(tasks.id, [...reworkTaskIds]))
      : []
    const reworkedTasks = reworkedTaskRows.map(t => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      reworkCount: reworkCountByTask.get(t.id) || 0,
    }))

    const reworkByWeek: Record<string, number> = {}
    reworkTransitions.forEach(h => {
      const key = toWeekKey(new Date(h.changedAt))
      reworkByWeek[key] = (reworkByWeek[key] || 0) + 1
    })

    const reopenTransitions = reworkTransitions.filter(transition =>
      transition.fromStatus === 'done' && (transition.toStatus === 'in_progress' || transition.toStatus === 'assigned')
    )
    const reopenRate = completedInPeriod.length > 0
      ? Math.round((reopenTransitions.length / completedInPeriod.length) * 100)
      : 0
    const reworkPer100Completed = completedInPeriod.length > 0
      ? roundTo((reworkTransitions.length / completedInPeriod.length) * 100, 1)
      : 0
    const reopenPer100Completed = completedInPeriod.length > 0
      ? roundTo((reopenTransitions.length / completedInPeriod.length) * 100, 1)
      : 0

    const escapedIssuesRows = await db.execute(sql`
      select date_trunc('week', created_at) as week_start, count(*)::int as count
      from issues
      where created_at >= ${sinceIso}
        and delivery_id is not null
        and ${buildProductScopeSql('product_id', productIds)}
      group by week_start
      order by week_start asc
    `)
    const escapedByWeek: Record<string, number> = {}
    for (const row of escapedIssuesRows as any[]) {
      escapedByWeek[toWeekKey(new Date(row.week_start))] = toNumber(row.count)
    }
    const escapedDefects = Object.values(escapedByWeek).reduce((sum, count) => sum + count, 0)

    const firstPassByPriorityMap = new Map<string, { firstPass: number; total: number }>()
    const firstPassByTypeMap = new Map<string, { firstPass: number; total: number }>()
    for (const task of completedInPeriod) {
      const priority = task.priority || 'unknown'
      const type = String(task.type || 'untyped')
      const isFirstPass = !reworkTaskIds.has(task.id)

      const priorityEntry = firstPassByPriorityMap.get(priority) || { firstPass: 0, total: 0 }
      priorityEntry.total += 1
      if (isFirstPass) priorityEntry.firstPass += 1
      firstPassByPriorityMap.set(priority, priorityEntry)

      const typeEntry = firstPassByTypeMap.get(type) || { firstPass: 0, total: 0 }
      typeEntry.total += 1
      if (isFirstPass) typeEntry.firstPass += 1
      firstPassByTypeMap.set(type, typeEntry)
    }
    const firstPassByPriority = [...firstPassByPriorityMap.entries()].map(([priority, values]) => ({
      priority,
      firstPass: values.firstPass,
      total: values.total,
    }))
    const firstPassByType = [...firstPassByTypeMap.entries()].map(([type, values]) => ({
      type,
      firstPass: values.firstPass,
      total: values.total,
    }))

    const weekKeys = [...new Set([
      ...Object.keys(reworkByWeek),
      ...Object.keys(escapedByWeek),
    ])].sort()
    const completedByWeekRows = await db.execute(sql`
      select date_trunc('week', completed_at) as week_start, count(*)::int as count
      from tasks
      where completed_at is not null
        and completed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by week_start
      order by week_start asc
    `)
    const completedByWeek: Record<string, number> = {}
    for (const row of completedByWeekRows as any[]) {
      completedByWeek[toWeekKey(new Date(row.week_start))] = toNumber(row.count)
      if (!weekKeys.includes(toWeekKey(new Date(row.week_start)))) {
        weekKeys.push(toWeekKey(new Date(row.week_start)))
      }
    }
    weekKeys.sort()

    const weeklyOutcomes = weekKeys.map((bucket) => {
      const reopened = reworkByWeek[bucket] || 0
      const escaped = escapedByWeek[bucket] || 0
      const completed = completedByWeek[bucket] || 0
      const firstPass = Math.max(0, completed - reopened)
      return {
        bucket,
        firstPass,
        reopened,
        escaped,
      }
    })
    const reopenControlPoints = weeklyOutcomes.map((point) => {
      const denominator = Math.max(1, point.firstPass + point.reopened)
      return {
        bucket: point.bucket,
        rate: Math.round((point.reopened / denominator) * 100),
        count: point.reopened,
      }
    })
    const weeklyReworkRates = weekKeys.map((bucket) => {
      const denominator = Math.max(1, completedByWeek[bucket] || 0)
      return ((reworkByWeek[bucket] || 0) / denominator) * 100
    })
    const weeklyReopenRates = weekKeys.map((bucket) => {
      const denominator = Math.max(1, completedByWeek[bucket] || 0)
      const reopened = weeklyOutcomes.find((point) => point.bucket === bucket)?.reopened || 0
      return (reopened / denominator) * 100
    })
    const reworkSlope = weeklyReworkRates.length > 1
      ? roundTo(weeklyReworkRates[weeklyReworkRates.length - 1]! - weeklyReworkRates[0]!)
      : 0
    const reopenSlope = weeklyReopenRates.length > 1
      ? roundTo(weeklyReopenRates[weeklyReopenRates.length - 1]! - weeklyReopenRates[0]!)
      : 0
    const reworkThreshold = 12
    const reopenThreshold = 10
    const thresholdStatus = (value: number, threshold: number): 'healthy' | 'watch' | 'breach' => {
      if (value <= threshold) return 'healthy'
      if (value <= threshold * 1.3) return 'watch'
      return 'breach'
    }

    return normalizeQualityHomeFields({
      firstPassRate, reworkRate, bugRate,
      reopenRate,
      reworkPer100Completed,
      reopenPer100Completed,
      reopenCount: reopenTransitions.length,
      escapedDefects,
      totalCompleted: completedInPeriod.length,
      reworkCount: reworkTaskIds.size,
      reworkEventCount: reworkTransitions.length,
      reviewLoad, reworkedTasks,
      firstPassByPriority,
      firstPassByType,
      weeklyOutcomes,
      reopenControl: {
        targetRate: 10,
        points: reopenControlPoints,
      },
      trend: {
        reworkSlope,
        reopenSlope,
        reworkThreshold,
        reopenThreshold,
        reworkStatus: thresholdStatus(reworkPer100Completed, reworkThreshold),
        reopenStatus: thresholdStatus(reopenPer100Completed, reopenThreshold),
      },
      taxonomyNote: 'Bug rate is based on task type and reopen transitions. Escaped defects are issues linked to deliveries.',
      reworkByWeek: Object.entries(reworkByWeek).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
      meta: buildMetricsMeta(period, {
        completed: completedInPeriod.length,
        reworkEvents: reworkTransitions.length,
        reviewers: reviewLoad.length,
        escapedDefects,
      }),
    })
  })

  // ==================== BLOCKERS ====================
  .get('/blockers', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const blockedLimit = parseQueryNumber(query.limit, 100, 10, 300)
    const unblockSlaDays = parseQueryNumber(query.slaDays, 3, 1, 30)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()
    const scopedTaskIdsSql = buildScopedTaskIdsSql(productIds, teamId)

    const now = Date.now()
    const blockedRows = await db.execute(sql`
      with latest_block as (
        select task_id, max(changed_at) as blocked_at
        from task_status_history
        where to_status = 'blocked'
          and ${buildProductScopeSql('product_id', productIds)}
          and task_id in (${scopedTaskIdsSql})
        group by task_id
      )
      select
        t.id as task_id,
        t.title,
        t.priority,
        t.blocked_reason,
        coalesce(lb.blocked_at, t.updated_at) as blocked_since,
        u.id as assignee_id,
        u.name as assignee_name,
        u.avatar as assignee_avatar
      from tasks t
      left join latest_block lb on lb.task_id = t.id
      left join users u on u.id = t.owner_user_id
      where t.status = 'blocked'
        and ${buildProductScopeSql('t.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
      order by coalesce(lb.blocked_at, t.updated_at) asc
      limit ${blockedLimit}
    `)
    const blockedTasks = (blockedRows as any[]).map(row => {
      const blockedSince = new Date(row.blocked_since)
      const priority = String(row.priority || 'medium')
      const blockedDays = Math.round(((now - blockedSince.getTime()) / 86400000) * 10) / 10
      const priorityWeight = blockedPriorityWeight(priority)
      return {
        taskId: row.task_id as string,
        title: row.title as string,
        priority,
        blockedReason: (row.blocked_reason || 'No reason provided') as string,
        blockedDays,
        priorityWeight,
        weightedBlockedDays: roundTo(blockedDays * priorityWeight),
        assignee: row.assignee_name
          ? {
              userId: (row.assignee_id ?? null) as string | null,
              name: row.assignee_name as string,
              avatar: (row.assignee_avatar ?? null) as string | null,
            }
          : null,
      }
    }).sort((a, b) => b.blockedDays - a.blockedDays)

    const reasonRows = await db.execute(sql`
      select blocked_reason as reason, count(*)::int as count
      from tasks
      where blocked_reason is not null
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by blocked_reason
      order by count desc
    `)
    const blockReasons = (reasonRows as any[]).map(row => ({
      reason: String(row.reason),
      count: toNumber(row.count),
    }))

    const transitions = await db.select({
      taskId: taskStatusHistory.taskId,
      fromStatus: taskStatusHistory.fromStatus,
      toStatus: taskStatusHistory.toStatus,
      changedAt: taskStatusHistory.changedAt,
    }).from(taskStatusHistory).where(and(
      sql`${taskStatusHistory.changedAt} >= ${sinceIso}`,
      buildProductCondition(taskStatusHistory.productId, productIds),
      ...(teamId ? [sql`${taskStatusHistory.taskId} in (${scopedTaskIdsSql})`] : []),
    )).orderBy(taskStatusHistory.taskId, taskStatusHistory.changedAt)

    const transitionsByTask = new Map<string, typeof transitions>()
    for (const transition of transitions) {
      const existing = transitionsByTask.get(transition.taskId)
      if (existing) existing.push(transition)
      else transitionsByTask.set(transition.taskId, [transition])
    }
    const blockDurations: number[] = []
    for (const taskTransitions of transitionsByTask.values()) {
      let blockedAt: Date | null = null
      for (const transition of taskTransitions) {
        if (transition.toStatus === 'blocked') {
          blockedAt = new Date(transition.changedAt)
          continue
        }
        if (blockedAt && transition.fromStatus === 'blocked') {
          const unblockedAt = new Date(transition.changedAt)
          blockDurations.push((unblockedAt.getTime() - blockedAt.getTime()) / 86400000)
          blockedAt = null
        }
      }
    }
    const avgBlockDuration = blockDurations.length > 0
      ? Math.round((blockDurations.reduce((a, b) => a + b, 0) / blockDurations.length) * 10) / 10
      : 0
    const medianUnblockDays = Math.round(percentile(blockDurations, 50) * 10) / 10
    const unblockedWithinSla = blockDurations.filter(duration => duration <= unblockSlaDays).length
    const unblockSlaHitRate = blockDurations.length > 0
      ? Math.round((unblockedWithinSla / blockDurations.length) * 100)
      : 100
    const longOpenBreaches = blockedTasks.filter(task => task.blockedDays > unblockSlaDays).length
    const weightedBlockedDays = roundTo(
      blockedTasks.reduce((sum, task) => sum + toNumber((task as any).weightedBlockedDays), 0),
    )
    const blockedSlaBreaches = longOpenBreaches
    const blockedSlaBreachRate = blockedTasks.length > 0
      ? roundTo((blockedSlaBreaches / blockedTasks.length) * 100, 1)
      : 0

    const unblockDistributionBuckets: Record<string, number> = {
      '<1d': 0,
      '1-3d': 0,
      '3-7d': 0,
      '>7d': 0,
    }
    for (const duration of blockDurations) {
      if (duration < 1) unblockDistributionBuckets['<1d'] += 1
      else if (duration <= 3) unblockDistributionBuckets['1-3d'] += 1
      else if (duration <= 7) unblockDistributionBuckets['3-7d'] += 1
      else unblockDistributionBuckets['>7d'] += 1
    }
    const unblockDistribution = Object.entries(unblockDistributionBuckets).map(([bucket, count]) => ({ bucket, count }))

    const bottleneckRows = await db.execute(sql`
      select
        status,
        count(*)::int as count,
        avg(extract(epoch from (now() - coalesce(started_at, created_at))) / 86400.0) as avg_age
      from tasks
      where status not in ('done', 'archived')
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by status
    `)
    const statusAging: Record<string, { count: number; avgAge: number }> = {}
    for (const row of bottleneckRows as any[]) {
      statusAging[String(row.status)] = {
        count: toNumber(row.count),
        avgAge: Math.round(toNumber(row.avg_age) * 10) / 10,
      }
    }

    const blockEntriesRows = await db.execute(sql`
      select date_trunc('week', changed_at) as week_start, count(*)::int as count
      from task_status_history
      where to_status = 'blocked'
        and changed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and task_id in (${scopedTaskIdsSql})
      group by week_start
      order by week_start asc
    `)
    const blockedByWeek = (blockEntriesRows as any[]).map(row => ({
      date: toWeekKey(new Date(row.week_start)),
      count: toNumber(row.count),
    }))

    return normalizeBlockersHomeFields({
      currentlyBlocked: blockedTasks,
      blockedCount: blockedTasks.length,
      weightedBlockedDays,
      blockedSlaBreaches,
      blockedSlaBreachRate,
      avgBlockDuration,
      medianUnblockDays,
      unblockSlaDays,
      unblockSlaHitRate,
      longOpenBreaches,
      unblockDistribution,
      unblockFunnel: {
        blockedTotal: blockDurations.length + blockedTasks.length,
        unblockedWithinSla,
        slaBreached: Math.max(0, blockDurations.length - unblockedWithinSla) + longOpenBreaches,
      },
      blockReasons,
      bottleneckStages: statusAging,
      blockedTrend: blockedByWeek,
      meta: buildMetricsMeta(period, {
        blockedNow: blockedTasks.length,
        blockEvents: blockDurations.length,
        reasons: blockReasons.length,
      }),
    })
  })

  // ==================== PREDICTABILITY ====================
  .get('/predictability', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const estimateLimit = parseQueryNumber(query.estimateLimit, 300, 50, 1000)
    const cacheTtl = parseQueryNumber(query.cacheTtl, 180, 30, 1800)

    const computePredictability = async () => {
        const since = daysAgo(period)
        const sinceIso = since.toISOString()
        const deliveryRows = await db.execute(sql`
      select
        d.id as delivery_id,
        d.title,
        d.status,
        d.start_date,
        d.end_date,
        count(t.id)::int as planned,
        count(t.id) filter (where t.status = 'done')::int as completed,
        count(t.id) filter (where d.start_date is not null and t.created_at > d.start_date)::int as scope_added_after_start
      from deliveries d
      left join tasks t on t.delivery_id = d.id
        and ${buildProductScopeSql('t.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
      where ${buildProductScopeSql('d.product_id', productIds)}
        and
        (
          d.created_at >= ${sinceIso}
          or d.status in ('initialized', 'in_progress', 'blocked', 'overdue')
        )
      group by d.id, d.title, d.status, d.start_date, d.end_date
      order by d.created_at desc
    `)
        const deliveryMetrics = (deliveryRows as any[]).map(row => {
          const planned = toNumber(row.planned)
          const completed = toNumber(row.completed)
          const scopeAddedAfterStart = toNumber(row.scope_added_after_start)
          let projectedEndDate: string | null = null
          let scheduleVarianceDays = 0
          if (row.start_date && planned > 0 && completed > 0) {
            const startMs = new Date(row.start_date).getTime()
            const elapsedWeeks = Math.max(1, (Date.now() - startMs) / (7 * 86400000))
            const completionPerWeek = completed / elapsedWeeks
            const remaining = Math.max(0, planned - completed)
            const projectedMs = Date.now() + (remaining / Math.max(completionPerWeek, 0.1)) * 7 * 86400000
            projectedEndDate = new Date(projectedMs).toISOString()
            if (row.end_date) {
              scheduleVarianceDays = Math.round(((projectedMs - new Date(row.end_date).getTime()) / 86400000) * 10) / 10
            }
          } else if (row.end_date) {
            projectedEndDate = new Date(row.end_date).toISOString()
          }
          const confidenceScore = Math.max(0, Math.min(100, Math.round(
            (planned > 0 ? (completed / planned) * 70 : 0) +
            (scopeAddedAfterStart === 0 ? 20 : Math.max(0, 20 - scopeAddedAfterStart * 2)) +
            (scheduleVarianceDays <= 0 ? 10 : Math.max(0, 10 - Math.abs(scheduleVarianceDays)))
          )))
          return {
            deliveryId: row.delivery_id as string,
            title: row.title as string,
            status: row.status as string,
            planned,
            completed,
            predictability: planned > 0 ? Math.round((completed / planned) * 100) : 0,
            projectedEndDate,
            scheduleVarianceDays,
            scopeAddedAfterStart,
            confidenceScore,
          }
        })

        const [createdBefore] = await db.execute(sql`
      select count(*)::int as value
      from tasks
      where created_at < ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)
        const [completedBefore] = await db.execute(sql`
      select count(*)::int as value
      from tasks
      where completed_at is not null
        and completed_at < ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)

        const createdByDayRows = await db.execute(sql`
      select date(created_at) as bucket, count(*)::int as value
      from tasks
      where created_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by bucket
    `)
        const completedByDayRows = await db.execute(sql`
      select date(completed_at) as bucket, count(*)::int as value
      from tasks
      where completed_at is not null
        and completed_at >= ${sinceIso}
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      group by bucket
    `)
        const createdMap = new Map<string, number>()
        const completedMap = new Map<string, number>()
        for (const row of createdByDayRows as any[]) {
          createdMap.set(toDateKey(new Date(row.bucket)), toNumber(row.value))
        }
        for (const row of completedByDayRows as any[]) {
          completedMap.set(toDateKey(new Date(row.bucket)), toNumber(row.value))
        }

        const dailyBurnup: { date: string; cumulative: number; total: number }[] = []
        const dayStep = period > 60 ? 7 : 1
        let cumulativeTotal = toNumber((createdBefore as any)?.value)
        let cumulativeCompleted = toNumber((completedBefore as any)?.value)
        for (let i = period; i >= 0; i -= 1) {
          const day = daysAgo(i)
          const key = toDateKey(day)
          cumulativeTotal += createdMap.get(key) || 0
          cumulativeCompleted += completedMap.get(key) || 0
          dailyBurnup.push({
            date: key,
            cumulative: cumulativeCompleted,
            total: cumulativeTotal,
          })
        }
        const burnupData = dailyBurnup.filter((_, index) =>
          index === dailyBurnup.length - 1 || index % dayStep === 0
        )

        const latestBurnup = burnupData[burnupData.length - 1] || { cumulative: 0, total: 0 }
        const remainingScope = Math.max(0, latestBurnup.total - latestBurnup.cumulative)
        const weeklyCompletedSeries: number[] = []
        const completedByWeekMap = new Map<string, number>()
        for (const row of completedByDayRows as any[]) {
          const key = toWeekKey(new Date(row.bucket))
          completedByWeekMap.set(key, (completedByWeekMap.get(key) || 0) + toNumber(row.value))
        }
        for (const count of completedByWeekMap.values()) weeklyCompletedSeries.push(count)
        const avgDeparturePerWeek = Math.round(average(weeklyCompletedSeries) * 10) / 10
        const departureStd = stdDev(weeklyCompletedSeries)
        const weeksToComplete = avgDeparturePerWeek > 0 ? remainingScope / avgDeparturePerWeek : null
        const projectedCompletionDate = weeksToComplete !== null
          ? new Date(Date.now() + weeksToComplete * 7 * 86400000).toISOString()
          : null
        const p50Date = projectedCompletionDate
        const p85BufferWeeks = weeksToComplete !== null
          ? Math.max(1, (departureStd / Math.max(avgDeparturePerWeek, 0.1)) * 2)
          : null
        const p85Date = p85BufferWeeks !== null
          ? new Date(Date.now() + (weeksToComplete! + p85BufferWeeks) * 7 * 86400000).toISOString()
          : null
        let confidenceScore = Math.max(0, Math.min(100, Math.round(
          100 - (Math.min(100, (departureStd / Math.max(avgDeparturePerWeek, 1)) * 100))
        )))
        let confidenceBand: 'high' | 'medium' | 'low' = confidenceScore >= 75
          ? 'high'
          : confidenceScore >= 45
            ? 'medium'
            : 'low'

        const estimateRows = await db.execute(sql`
      select
        id as task_id,
        title,
        estimate_value as estimate,
        round(extract(epoch from (completed_at - started_at)) / 86400.0, 1) as actual_days
      from tasks
      where estimate_value is not null
        and completed_at is not null
        and started_at is not null
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      order by completed_at desc
      limit ${estimateLimit}
    `)
        const estimateData = (estimateRows as any[]).map(row => ({
          taskId: row.task_id as string,
          title: row.title as string,
          estimate: toNumber(row.estimate),
          actualDays: toNumber(row.actual_days),
        }))

        const [onTimeAgg] = await db.execute(sql`
      select
        count(*) filter (where completed_at is not null and due_at is not null and completed_at <= due_at)::int as on_time_count,
        count(*) filter (where completed_at is not null and due_at is not null)::int as due_completed_count,
        count(*) filter (
          where status = 'overdue'
            or (due_at is not null and completed_at is null and due_at < now())
        )::int as overdue_count
      from tasks
      where 1 = 1
        and ${buildProductScopeSql('product_id', productIds)}
        and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
    `)
        const onTimeCount = toNumber((onTimeAgg as any)?.on_time_count)
        const dueCompletedCount = toNumber((onTimeAgg as any)?.due_completed_count)
        const overdueCount = toNumber((onTimeAgg as any)?.overdue_count)
        const onTimeRate = dueCompletedCount > 0
          ? Math.round((onTimeCount / dueCompletedCount) * 100)
          : 100

        const [scopeChangeRow] = await db.execute(sql`
      select count(*)::int as value
      from tasks t
      join deliveries d on d.id = t.delivery_id
      where d.start_date is not null
        and t.created_at > d.start_date
        and ${buildProductScopeSql('d.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
    `)
        const scopeChangeCount = toNumber((scopeChangeRow as any)?.value)
        const avgPositiveVarianceDays = deliveryMetrics.length > 0
          ? roundTo(average(deliveryMetrics.map((delivery) => Math.max(0, delivery.scheduleVarianceDays))))
          : 0
        const scopeChurnPenalty = Math.min(35, Math.round(scopeChangeCount * 1.5))
        const variancePenalty = Math.min(35, Math.round(avgPositiveVarianceDays * 3))
        const completionStabilityPenalty = Math.min(
          30,
          Math.round((departureStd / Math.max(avgDeparturePerWeek, 1)) * 30),
        )
        const confidenceDrivers = {
          scopeChurn: {
            value: scopeChangeCount,
            penalty: scopeChurnPenalty,
            contribution: 35 - scopeChurnPenalty,
          },
          scheduleVariance: {
            value: avgPositiveVarianceDays,
            penalty: variancePenalty,
            contribution: 35 - variancePenalty,
          },
          completionStability: {
            value: roundTo(departureStd),
            baseline: avgDeparturePerWeek,
            penalty: completionStabilityPenalty,
            contribution: 30 - completionStabilityPenalty,
          },
        }
        confidenceScore = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              confidenceDrivers.scopeChurn.contribution
                + confidenceDrivers.scheduleVariance.contribution
                + confidenceDrivers.completionStability.contribution,
            ),
          ),
        )
        confidenceBand = confidenceScore >= 75 ? 'high' : confidenceScore >= 45 ? 'medium' : 'low'
        const riskMatrix = deliveryMetrics.map((delivery) => ({
          deliveryId: delivery.deliveryId,
          title: delivery.title,
          varianceDays: delivery.scheduleVarianceDays,
          scopeChange: delivery.scopeAddedAfterStart,
          riskScore: Math.max(0, Math.round(Math.abs(delivery.scheduleVarianceDays) * 2 + delivery.scopeAddedAfterStart * 3)),
        }))

        return {
          deliveryMetrics, burnupData, estimateData,
          forecast: {
            projectedCompletionDate,
            p50Date,
            p85Date,
            confidenceScore,
            confidenceBand,
            remainingScope,
            avgDeparturePerWeek,
          },
          confidenceDrivers,
          riskMatrix,
          onTimeRate, overdueCount, scopeChangeCount,
          avgPredictability: deliveryMetrics.length > 0 ? Math.round(deliveryMetrics.reduce((s, d) => s + d.predictability, 0) / deliveryMetrics.length) : 0,
          meta: buildMetricsMeta(period, {
            deliveries: deliveryMetrics.length,
            burnupPoints: burnupData.length,
            estimatePoints: estimateData.length,
            riskPoints: riskMatrix.length,
          }, { cacheTtl }),
        }
    }

    const payload = access.cacheProductId
      ? await withMetricsCache(
        { endpoint: 'predictability', productId: access.cacheProductId, period, extra: { estimateLimit } },
        cacheTtl,
        computePredictability,
      )
      : await computePredictability()

    return normalizePredictabilityHomeFields(payload)
  })

  // ==================== WORKLOAD ====================
  .get('/workload', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()
    const now = Date.now()
    const overloadWipThreshold = access.cacheProductId
      ? Number((await db.select({
        overloadWipThreshold: products.metricsOverloadWipThreshold,
      }).from(products).where(eq(products.id, access.cacheProductId)))[0]?.overloadWipThreshold ?? 5)
      : 5
    const roleCapacityFactors: Record<string, number> = {
      super_admin: 0.9,
      admin: 0.9,
      product_admin: 0.95,
      product_manager: 0.9,
      business_analyst: 0.95,
      developer: 1.15,
      viewer: 0.75,
    }

    const memberRows = await db.execute(sql`
      with relevant_tasks as (
        select id, title, status, due_at, completed_at, created_at, owner_user_id, assignee_user_ids, reviewer_user_ids, owner_team_id, assignee_team_ids, reviewer_team_ids
        from tasks
        where ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
          and (status not in ('done', 'archived') or coalesce(completed_at, created_at) >= ${sinceIso})
      ),
      task_users as (
        select id, title, status, due_at, completed_at, owner_user_id as user_id
        from relevant_tasks
        where owner_user_id is not null
        union all
        select id, title, status, due_at, completed_at, unnest(assignee_user_ids) as user_id
        from relevant_tasks
        where assignee_user_ids is not null
        union all
        select rt.id, rt.title, rt.status, rt.due_at, rt.completed_at, otm.user_id as user_id
        from relevant_tasks rt
        inner join organization_team_members otm
          on otm.organization_team_id = rt.owner_team_id
        where rt.owner_team_id is not null
        union all
        select rt.id, rt.title, rt.status, rt.due_at, rt.completed_at, otm.user_id as user_id
        from relevant_tasks rt
        cross join lateral unnest(rt.assignee_team_ids) as assignee_team(team_id)
        inner join organization_team_members otm
          on otm.organization_team_id = assignee_team.team_id
        where rt.assignee_team_ids is not null
      ),
      task_stats as (
        select
          user_id,
          count(*)::int as total_tasks,
          count(*) filter (where status = 'done')::int as completed_count,
          count(*) filter (where status not in ('done', 'archived'))::int as wip_count,
          count(*) filter (
            where due_at is not null
              and completed_at is null
              and due_at < now()
              and status <> 'done'
          )::int as overdue_count
        from task_users
        group by user_id
      ),
      review_stats as (
        select user_id, count(*)::int as review_load
        from (
          select unnest(reviewer_user_ids) as user_id
          from relevant_tasks
          where status = 'in_review'
            and reviewer_user_ids is not null
          union all
          select otm.user_id
          from relevant_tasks rt
          cross join lateral unnest(rt.reviewer_team_ids) as reviewer_team(team_id)
          inner join organization_team_members otm
            on otm.organization_team_id = reviewer_team.team_id
          where rt.status = 'in_review'
            and rt.reviewer_team_ids is not null
        ) review_users
        group by user_id
      )
      select
        u.id,
        u.name,
        u.avatar,
        u.role,
        coalesce(ts.total_tasks, 0) as total_tasks,
        coalesce(ts.completed_count, 0) as completed_count,
        coalesce(ts.wip_count, 0) as wip_count,
        coalesce(ts.overdue_count, 0) as overdue_count,
        coalesce(rs.review_load, 0) as review_load
      from users u
      left join task_stats ts on ts.user_id = u.id
      left join review_stats rs on rs.user_id = u.id
      where coalesce(ts.total_tasks, 0) > 0
      order by coalesce(ts.wip_count, 0) desc, u.name asc
    `)
    const teamMemberCount = (memberRows as any[]).length
    const teamAdjustmentFactor = teamMemberCount <= 3 ? 0.9 : teamMemberCount >= 10 ? 1.1 : 1

    const byStatusRows = await db.execute(sql`
      with relevant_tasks as (
        select status, owner_user_id, assignee_user_ids, owner_team_id, assignee_team_ids
        from tasks
        where ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
          and (status not in ('done', 'archived') or coalesce(completed_at, created_at) >= ${sinceIso})
      ),
      task_users as (
        select owner_user_id as user_id, status
        from relevant_tasks
        where owner_user_id is not null
        union all
        select unnest(assignee_user_ids) as user_id, status
        from relevant_tasks
        where assignee_user_ids is not null
        union all
        select otm.user_id as user_id, rt.status
        from relevant_tasks rt
        inner join organization_team_members otm
          on otm.organization_team_id = rt.owner_team_id
        where rt.owner_team_id is not null
        union all
        select otm.user_id as user_id, rt.status
        from relevant_tasks rt
        cross join lateral unnest(rt.assignee_team_ids) as assignee_team(team_id)
        inner join organization_team_members otm
          on otm.organization_team_id = assignee_team.team_id
        where rt.assignee_team_ids is not null
      )
      select user_id, status, count(*)::int as count
      from task_users
      group by user_id, status
    `)
    const byStatusMap = new Map<string, Record<string, number>>()
    for (const row of byStatusRows as any[]) {
      const userId = row.user_id as string
      const status = String(row.status)
      const count = toNumber(row.count)
      const current = byStatusMap.get(userId) || {}
      current[status] = count
      byStatusMap.set(userId, current)
    }

    const overdueRows = await db.execute(sql`
      with relevant_tasks as (
        select id, title, status, due_at, completed_at, created_at, owner_user_id, assignee_user_ids, owner_team_id, assignee_team_ids
        from tasks
        where ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
          and (status not in ('done', 'archived') or coalesce(completed_at, created_at) >= ${sinceIso})
      ),
      task_users as (
        select id, title, status, due_at, completed_at, owner_user_id as user_id
        from relevant_tasks
        where owner_user_id is not null
        union all
        select id, title, status, due_at, completed_at, unnest(assignee_user_ids) as user_id
        from relevant_tasks
        where assignee_user_ids is not null
        union all
        select rt.id, rt.title, rt.status, rt.due_at, rt.completed_at, otm.user_id as user_id
        from relevant_tasks rt
        inner join organization_team_members otm
          on otm.organization_team_id = rt.owner_team_id
        where rt.owner_team_id is not null
        union all
        select rt.id, rt.title, rt.status, rt.due_at, rt.completed_at, otm.user_id as user_id
        from relevant_tasks rt
        cross join lateral unnest(rt.assignee_team_ids) as assignee_team(team_id)
        inner join organization_team_members otm
          on otm.organization_team_id = assignee_team.team_id
        where rt.assignee_team_ids is not null
      )
      select user_id, id as task_id, title, due_at
      from task_users
      where due_at is not null
        and completed_at is null
        and due_at < now()
        and status <> 'done'
      order by due_at asc
    `)
    const overdueByUser = new Map<string, Array<{ taskId: string; title: string; dueAt: string; daysOverdue: number }>>()
    for (const row of overdueRows as any[]) {
      const userId = row.user_id as string
      const dueAt = new Date(row.due_at)
      const list = overdueByUser.get(userId) || []
      if (list.length < 20) {
        list.push({
          taskId: row.task_id as string,
          title: row.title as string,
          dueAt: dueAt.toISOString(),
          daysOverdue: Math.round(((now - dueAt.getTime()) / 86400000) * 10) / 10,
        })
      }
      overdueByUser.set(userId, list)
    }

    const memberWorkload = (memberRows as any[]).map(row => {
      const totalTasks = toNumber(row.total_tasks)
      const completedCount = toNumber(row.completed_count)
      const wipCount = toNumber(row.wip_count)
      const overdueCount = toNumber(row.overdue_count)
      const sampleSize = totalTasks
      const roleKey = String(row.role || '').toLowerCase()
      const roleFactor = roleCapacityFactors[roleKey] ?? 1
      const baseCapacity = overloadWipThreshold
      const calibratedCapacity = Math.max(1, roundTo(baseCapacity * roleFactor * teamAdjustmentFactor))
      const loadRatioCalibrated = calibratedCapacity > 0 ? roundTo(wipCount / calibratedCapacity, 2) : wipCount
      const sampleConfidence = toConfidenceBand(sampleSize)
      const capacityConfidence = roleCapacityFactors[roleKey] !== undefined
        ? toConfidenceBand(sampleSize)
        : (sampleSize >= 15 ? 'medium' : 'low')
      const buildLoad = Math.max(1, wipCount - toNumber(row.review_load))
      return {
        id: row.id as string,
        name: row.name as string,
        avatar: (row.avatar ?? null) as string | null,
        role: row.role as string,
        totalTasks,
        wipCount,
        completedCount,
        byStatus: byStatusMap.get(row.id as string) || {},
        reviewLoad: toNumber(row.review_load),
        overdueCount,
        overdueTasks: overdueByUser.get(row.id as string) || [],
        completionRate: totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0,
        sampleSize,
        baseCapacity,
        capacity: calibratedCapacity,
        calibratedCapacity,
        loadRatio: loadRatioCalibrated,
        loadRatioCalibrated,
        capacityConfidence,
        sampleConfidence,
        reviewVsBuildRatio: Math.round((toNumber(row.review_load) / buildLoad) * 100) / 100,
      }
    })

    const overloaded = memberWorkload.filter(member => member.loadRatioCalibrated > 1)
    const idle = memberWorkload.filter(member => member.wipCount === 0)
    const loadRatios = memberWorkload.map(member => member.loadRatioCalibrated)
    const meanLoad = average(loadRatios)
    const loadBalanceIndex = meanLoad > 0
      ? Math.round((stdDev(loadRatios) / meanLoad) * 100)
      : 0

    return normalizeWorkloadHomeFields({
      memberWorkload,
      overloaded,
      idle,
      overloadThreshold: overloadWipThreshold,
      capacityModel: {
        teamAdjustmentFactor,
        roleCapacityFactors,
      },
      totalMembers: memberWorkload.length,
      loadBalanceIndex,
      meta: buildMetricsMeta(period, {
        members: memberWorkload.length,
        activeTasks: memberWorkload.reduce((sum, member) => sum + member.wipCount, 0),
        overdueTasks: memberWorkload.reduce((sum, member) => sum + member.overdueCount, 0),
      }),
    })
  })

  // ==================== DELIVERIES METRICS ====================
  .get('/deliveries-metrics', async ({ query, jwt, headers, set }) => {
    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 180, 30, 365)
    const cacheTtl = parseQueryNumber(query.cacheTtl, 180, 30, 1800)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()

    const computeDeliveryMetrics = async () => {
        const now = Date.now()
        const detailRows = await db.execute(sql`
      select
        d.id,
        d.title,
        d.status,
        d.start_date,
        d.end_date,
        count(t.id)::int as total_tasks,
        count(t.id) filter (where t.status = 'done')::int as completed,
        count(t.id) filter (where t.status = 'blocked')::int as blocked,
        count(t.id) filter (where d.start_date is not null and t.created_at > d.start_date)::int as scope_added_after_start
      from deliveries d
      left join tasks t on t.delivery_id = d.id
        and ${buildProductScopeSql('t.product_id', productIds)}
        and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
      where ${buildProductScopeSql('d.product_id', productIds)}
        and (
          d.created_at >= ${sinceIso}
          or d.status in ('initialized', 'in_progress', 'blocked', 'overdue')
        )
      group by d.id, d.title, d.status, d.start_date, d.end_date
      order by d.created_at desc
    `)

        const deliveryDetails = (detailRows as any[]).map(row => {
          const totalTasks = toNumber(row.total_tasks)
          const completed = toNumber(row.completed)
          const blocked = toNumber(row.blocked)
          const scopeAddedAfterStart = toNumber(row.scope_added_after_start)

          let velocity = 0
          if (row.start_date) {
            const startMs = new Date(row.start_date).getTime()
            const weeks = Math.max(1, (now - startMs) / (7 * 86400000))
            velocity = Math.round((completed / weeks) * 10) / 10
          }

          const daysRemaining = row.end_date
            ? Math.round(((new Date(row.end_date).getTime() - now) / 86400000) * 10) / 10
            : null
          const remaining = Math.max(0, totalTasks - completed)
          const projectedEndDate = velocity > 0
            ? new Date(now + (remaining / velocity) * 7 * 86400000).toISOString()
            : row.end_date
              ? new Date(row.end_date).toISOString()
              : null
          const scheduleVarianceDays = row.end_date && projectedEndDate
            ? Math.round(((new Date(projectedEndDate).getTime() - new Date(row.end_date).getTime()) / 86400000) * 10) / 10
            : 0

          const varianceThresholdDays = 7
          const varianceWatchThresholdDays = 2
          const scopeThreshold = 1
          const blockedPressureThreshold = 15
          const blockedPressure = totalTasks > 0
            ? roundTo((blocked / totalTasks) * 100, 1)
            : (blocked > 0 ? 100 : 0)
          const varianceBreach = scheduleVarianceDays > varianceThresholdDays
          const varianceWatch = scheduleVarianceDays > varianceWatchThresholdDays
          const scopeBreach = scopeAddedAfterStart >= scopeThreshold
          const blockedPressureBreach = blockedPressure >= blockedPressureThreshold
          const ruleScore = (varianceBreach ? 50 : varianceWatch ? 25 : 0)
            + (scopeBreach ? 20 : 0)
            + (blockedPressureBreach ? 30 : 0)

          const riskReasons: string[] = []
          if (varianceBreach) {
            riskReasons.push(`Variance ${scheduleVarianceDays > 0 ? '+' : ''}${scheduleVarianceDays}d exceeds ${varianceThresholdDays}d threshold`)
          } else if (varianceWatch) {
            riskReasons.push(`Variance ${scheduleVarianceDays > 0 ? '+' : ''}${scheduleVarianceDays}d is above watch threshold (${varianceWatchThresholdDays}d)`)
          }
          if (scopeBreach) riskReasons.push(`Scope added after start: ${scopeAddedAfterStart} task(s)`)
          if (blockedPressureBreach) riskReasons.push(`Blocked pressure ${blockedPressure}% exceeds ${blockedPressureThreshold}% threshold`)
          if (riskReasons.length === 0) riskReasons.push('No major risk signals')
          const riskBadge =
            varianceBreach || blockedPressureBreach ? 'at_risk' :
              varianceWatch || scopeBreach ? 'watch' :
                'on_track'

          return {
            id: row.id as string,
            title: row.title as string,
            status: row.status as string,
            startDate: row.start_date as string | null,
            endDate: row.end_date as string | null,
            projectedEndDate,
            scheduleVarianceDays,
            scopeAddedAfterStart,
            riskBadge,
            riskReasons,
            riskBreakdown: {
              varianceDays: scheduleVarianceDays,
              varianceThresholdDays,
              varianceBreach,
              scopeAddedAfterStart,
              scopeThreshold,
              scopeBreach,
              blockedPressure,
              blockedPressureThreshold,
              blockedPressureBreach,
              ruleScore,
            },
            totalTasks,
            completed,
            blocked,
            progress: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
            velocity,
            daysRemaining,
            onTrack: riskBadge === 'on_track',
          }
        })

        const byStatus: Record<string, number> = {}
        for (const delivery of deliveryDetails) {
          byStatus[delivery.status] = (byStatus[delivery.status] || 0) + 1
        }

        const total = deliveryDetails.length
        const activeDeliveries = byStatus.in_progress || 0
        const avgProgress = total > 0
          ? Math.round(deliveryDetails.reduce((sum, d) => sum + d.progress, 0) / total)
          : 0
        const bubblePoints = deliveryDetails.map((delivery) => ({
          deliveryId: delivery.id,
          title: delivery.title,
          scopeChange: delivery.scopeAddedAfterStart,
          varianceDays: delivery.scheduleVarianceDays,
          totalTasks: delivery.totalTasks,
        }))

        return {
          deliveryDetails,
          byStatus,
          bubblePoints,
          activeDeliveries,
          avgProgress,
          total,
          meta: buildMetricsMeta(period, {
            deliveries: total,
            tasks: deliveryDetails.reduce((sum, delivery) => sum + delivery.totalTasks, 0),
            activeDeliveries,
          }, { cacheTtl }),
        }
    }

    const payload = access.cacheProductId
      ? await withMetricsCache(
        { endpoint: 'deliveries-metrics', productId: access.cacheProductId, period },
        cacheTtl,
        computeDeliveryMetrics,
      )
      : await computeDeliveryMetrics()

    return normalizeDeliveriesHomeFields(payload)
  })

  // ==================== EXECUTIVE KPI DASHBOARD ====================
  .get('/executive-kpis', async ({ query, jwt, headers, set }) => {
    if (!executiveKpisEnabled) {
      set.status = 404
      return { error: 'Not found' }
    }

    const access = await requireMetricsAccess(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if ('error' in access) return access
    const productIds = access.productIds
    const teamId = access.teamId
    const period = parseQueryNumber(query.period, 90, 14, 365)
    const cacheTtl = parseQueryNumber(query.cacheTtl, 180, 30, 1800)
    const since = daysAgo(period)
    const sinceIso = since.toISOString()

    const computeExecutiveKpis = async () => {
      const productRows = await db.select({
        id: products.id,
        name: products.name,
      }).from(products).where(buildProductCondition(products.id, productIds))
      const productNameById = new Map(productRows.map((row) => [row.id, row.name]))

      const taskSummaryRows = await db.execute(sql`
        select
          count(*) filter (where status not in ('done', 'archived'))::int as open_tasks,
          count(*) filter (where status = 'blocked')::int as blocked_open,
          count(*) filter (where status = 'overdue')::int as overdue_open,
          count(*) filter (
            where status not in ('done', 'archived')
              and now() - coalesce(started_at, created_at) > interval '7 days'
          )::int as aging_wip_open
        from tasks
        where ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      `)
      const taskSummary = (taskSummaryRows[0] as any) || {}
      const openTasks = toNumber(taskSummary.open_tasks)
      const blockedOpen = toNumber(taskSummary.blocked_open)

      const deliveryRows = await db.execute(sql`
        select
          d.id as delivery_id,
          d.product_id,
          p.name as product_name,
          d.title,
          d.status,
          d.start_date,
          d.end_date,
          d.created_at,
          count(t.id)::int as planned,
          count(t.id) filter (where t.status = 'done')::int as completed,
          count(t.id) filter (
            where d.start_date is not null and t.created_at > d.start_date
          )::int as scope_added_after_start
        from deliveries d
        left join tasks t on t.delivery_id = d.id
          and ${buildProductScopeSql('t.product_id', productIds)}
          and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
        left join products p on p.id = d.product_id
        where ${buildProductScopeSql('d.product_id', productIds)}
          and (
            d.created_at >= ${sinceIso}
            or d.status in ('initialized', 'in_progress', 'blocked', 'overdue')
          )
        group by d.id, d.product_id, p.name, d.title, d.status, d.start_date, d.end_date, d.created_at
        order by d.created_at desc
      `)

      const deliverySignals = (deliveryRows as any[]).map((row) => {
        const planned = toNumber(row.planned)
        const completed = toNumber(row.completed)
        const scopeAddedAfterStart = toNumber(row.scope_added_after_start)
        let projectedEndDate: string | null = null
        let scheduleVarianceDays = 0
        if (row.start_date && planned > 0 && completed > 0) {
          const startMs = new Date(row.start_date).getTime()
          const elapsedWeeks = Math.max(1, (Date.now() - startMs) / (7 * 86400000))
          const completionPerWeek = completed / elapsedWeeks
          const remaining = Math.max(0, planned - completed)
          const projectedMs = Date.now() + (remaining / Math.max(completionPerWeek, 0.1)) * 7 * 86400000
          projectedEndDate = new Date(projectedMs).toISOString()
          if (row.end_date) {
            scheduleVarianceDays = roundTo((projectedMs - new Date(row.end_date).getTime()) / 86400000, 1)
          }
        } else if (row.end_date) {
          projectedEndDate = new Date(row.end_date).toISOString()
        }
        const confidenceScore = clamp(Math.round(
          (planned > 0 ? (completed / planned) * 70 : 0)
          + (scopeAddedAfterStart === 0 ? 20 : Math.max(0, 20 - scopeAddedAfterStart * 2))
          + (scheduleVarianceDays <= 0 ? 10 : Math.max(0, 10 - Math.abs(scheduleVarianceDays))),
        ))
        const predictability = planned > 0 ? clamp(Math.round((completed / planned) * 100)) : 0
        return {
          deliveryId: row.delivery_id as string,
          productId: row.product_id as string,
          productName: String(row.product_name || productNameById.get(row.product_id as string) || 'Unnamed product'),
          title: String(row.title || 'Unnamed delivery'),
          status: String(row.status || ''),
          createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
          planned,
          completed,
          predictability,
          projectedEndDate,
          scheduleVarianceDays,
          scopeAddedAfterStart,
          confidenceScore,
        }
      })

      const deliveryConfidenceBands = {
        high: deliverySignals.filter((row) => row.confidenceScore >= 75).length,
        medium: deliverySignals.filter((row) => row.confidenceScore >= 45 && row.confidenceScore < 75).length,
        low: deliverySignals.filter((row) => row.confidenceScore < 45).length,
      }
      const deliveryCount = deliverySignals.length
      const highConfidencePercent = deliveryCount > 0
        ? Math.round((deliveryConfidenceBands.high / deliveryCount) * 100)
        : 0

      const meanVarianceDays = deliverySignals.length > 0
        ? roundTo(average(deliverySignals.map((row) => row.scheduleVarianceDays)), 1)
        : 0
      const lateCount = deliverySignals.filter((row) => row.scheduleVarianceDays > 1).length
      const earlyCount = deliverySignals.filter((row) => row.scheduleVarianceDays < -1).length
      const onTimeCount = Math.max(0, deliverySignals.length - lateCount - earlyCount)
      const forecastBiasDirection = meanVarianceDays > 1
        ? 'late'
        : meanVarianceDays < -1
          ? 'early'
          : 'balanced'

      const forecastByProductMap = new Map<string, { sumVariance: number; late: number; early: number; onTime: number; deliveries: number }>()
      for (const row of deliverySignals) {
        const current = forecastByProductMap.get(row.productId) || { sumVariance: 0, late: 0, early: 0, onTime: 0, deliveries: 0 }
        current.sumVariance += row.scheduleVarianceDays
        current.deliveries += 1
        if (row.scheduleVarianceDays > 1) current.late += 1
        else if (row.scheduleVarianceDays < -1) current.early += 1
        else current.onTime += 1
        forecastByProductMap.set(row.productId, current)
      }
      const forecastByProduct = [...forecastByProductMap.entries()].map(([productId, stats]) => ({
        productId,
        productName: productNameById.get(productId) || 'Unnamed product',
        meanVarianceDays: stats.deliveries > 0 ? roundTo(stats.sumVariance / stats.deliveries, 1) : 0,
        lateCount: stats.late,
        earlyCount: stats.early,
        onTimeCount: stats.onTime,
        deliveries: stats.deliveries,
      }))

      const forecastByTeam: Array<{
        teamId: string
        teamName: string
        meanVarianceDays: number
        lateCount: number
        earlyCount: number
        onTimeCount: number
        deliveries: number
      }> = []
      if (deliverySignals.length > 0) {
        const deliveryIds = [...new Set(deliverySignals.map((row) => row.deliveryId))]
        const deliveryIdSql = sql.join(deliveryIds.map((id) => sql`${id}::uuid`), sql`, `)
        const teamRows = await db.execute(sql`
          select
            t.delivery_id,
            t.owner_team_id,
            ot.name as team_name,
            count(*)::int as task_count
          from tasks t
          left join organization_teams ot on ot.id = t.owner_team_id
          where t.owner_team_id is not null
            and t.delivery_id in (${deliveryIdSql})
            and ${buildProductScopeSql('t.product_id', productIds)}
            and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
          group by t.delivery_id, t.owner_team_id, ot.name
        `)
        const primaryTeamByDelivery = new Map<string, { teamId: string; teamName: string; taskCount: number }>()
        for (const row of teamRows as any[]) {
          const deliveryId = String(row.delivery_id || '')
          const candidate = {
            teamId: String(row.owner_team_id || ''),
            teamName: String(row.team_name || 'Unassigned team'),
            taskCount: toNumber(row.task_count),
          }
          const current = primaryTeamByDelivery.get(deliveryId)
          if (!current || candidate.taskCount > current.taskCount) {
            primaryTeamByDelivery.set(deliveryId, candidate)
          }
        }
        const byTeamMap = new Map<string, { teamName: string; sumVariance: number; late: number; early: number; onTime: number; deliveries: number }>()
        for (const signal of deliverySignals) {
          const team = primaryTeamByDelivery.get(signal.deliveryId)
          if (!team?.teamId) continue
          const current = byTeamMap.get(team.teamId) || {
            teamName: team.teamName,
            sumVariance: 0,
            late: 0,
            early: 0,
            onTime: 0,
            deliveries: 0,
          }
          current.sumVariance += signal.scheduleVarianceDays
          current.deliveries += 1
          if (signal.scheduleVarianceDays > 1) current.late += 1
          else if (signal.scheduleVarianceDays < -1) current.early += 1
          else current.onTime += 1
          byTeamMap.set(team.teamId, current)
        }
        for (const [teamId, stats] of byTeamMap.entries()) {
          forecastByTeam.push({
            teamId,
            teamName: stats.teamName,
            meanVarianceDays: stats.deliveries > 0 ? roundTo(stats.sumVariance / stats.deliveries, 1) : 0,
            lateCount: stats.late,
            earlyCount: stats.early,
            onTimeCount: stats.onTime,
            deliveries: stats.deliveries,
          })
        }
      }

      const volatilityTrendMap = new Map<string, { scopeAdded: number; planned: number; onTrack: number; atRisk: number }>()
      for (const signal of deliverySignals) {
        const bucket = toWeekKey(signal.createdAt)
        const current = volatilityTrendMap.get(bucket) || { scopeAdded: 0, planned: 0, onTrack: 0, atRisk: 0 }
        current.scopeAdded += signal.scopeAddedAfterStart
        current.planned += signal.planned
        const isAtRisk = signal.scheduleVarianceDays > 2 || signal.scopeAddedAfterStart > 0 || signal.confidenceScore < 45
        if (isAtRisk) current.atRisk += 1
        else current.onTrack += 1
        volatilityTrendMap.set(bucket, current)
      }
      const scopeVolatilityTrend = [...volatilityTrendMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([bucket, stats]) => ({
          bucket,
          scopeAddedAfterStart: stats.scopeAdded,
          scopeChangeRate: roundTo(safePercent(stats.scopeAdded, Math.max(1, stats.planned)), 1),
          onTrackCount: stats.onTrack,
          atRiskCount: stats.atRisk,
        }))
      const totalScopeAdded = deliverySignals.reduce((sum, row) => sum + row.scopeAddedAfterStart, 0)
      const totalPlannedScope = deliverySignals.reduce((sum, row) => sum + row.planned, 0)
      const volatilityStressScore = clamp(Math.round(safePercent(totalScopeAdded, Math.max(1, totalPlannedScope))))

      const riskTrendWeeks = Math.max(2, Math.min(12, Math.ceil(period / 7)))
      const riskBurndownTrend: Array<{ bucket: string; totalAtRisk: number }> = []
      for (let index = riskTrendWeeks - 1; index >= 0; index -= 1) {
        const snapshotDate = daysAgo(index * 7)
        const snapshot = await computeAtRiskSnapshot(productIds, teamId, snapshotDate)
        riskBurndownTrend.push({
          bucket: toWeekKey(snapshotDate),
          totalAtRisk: snapshot.total,
        })
      }
      const currentAtRisk = riskBurndownTrend[riskBurndownTrend.length - 1]?.totalAtRisk ?? 0
      const previousAtRisk = riskBurndownTrend[riskBurndownTrend.length - 2]?.totalAtRisk ?? currentAtRisk
      const riskBurndownDelta = currentAtRisk - previousAtRisk

      const riskBurndownByProduct = await Promise.all(productRows.map(async (row) => {
        const current = await computeAtRiskSnapshot([row.id], teamId, new Date())
        const previous = await computeAtRiskSnapshot([row.id], teamId, daysAgo(7))
        return {
          productId: row.id,
          productName: row.name,
          totalAtRisk: current.total,
          delta: current.total - previous.total,
        }
      }))

      const computeInitiativeRiskSnapshot = async (snapshotDate: Date) => {
        const snapshotIso = snapshotDate.toISOString()
        const rows = await db.execute(sql`
          with status_snapshot as (
            select
              t.initiative_id,
              coalesce(
                (
                  select h.to_status
                  from task_status_history h
                  where h.task_id = t.id
                    and h.changed_at <= ${snapshotIso}
                    and ${buildProductScopeSql('h.product_id', productIds)}
                  order by h.changed_at desc
                  limit 1
                ),
                t.status
              ) as status_at_snapshot,
              t.due_at,
              t.started_at,
              t.created_at,
              t.owner_user_id,
              t.reviewer_user_ids
            from tasks t
            where ${buildProductScopeSql('t.product_id', productIds)}
              and ${buildTeamScopeSql('t.owner_team_id', 't.assignee_team_ids', 't.reviewer_team_ids', teamId)}
              and t.created_at <= ${snapshotIso}
              and t.initiative_id is not null
          )
          select
            initiative_id,
            count(*) filter (
              where status_at_snapshot not in ('done', 'archived')
                and due_at is not null
                and due_at < ${snapshotIso}
            )::int as overdue,
            count(*) filter (where status_at_snapshot = 'blocked')::int as blocked,
            count(*) filter (
              where status_at_snapshot not in ('done', 'archived')
                and ${snapshotIso}::timestamptz - coalesce(started_at, created_at) > interval '7 days'
            )::int as aging_wip,
            count(*) filter (
              where status_at_snapshot not in ('done', 'archived')
                and owner_user_id is null
            )::int as missing_owner,
            count(*) filter (
              where status_at_snapshot = 'in_review'
                and (reviewer_user_ids is null or cardinality(reviewer_user_ids) = 0)
            )::int as missing_reviewer
          from status_snapshot
          group by initiative_id
        `)
        const result = new Map<string, number>()
        for (const row of rows as any[]) {
          const total = toNumber(row.overdue)
            + toNumber(row.blocked)
            + toNumber(row.aging_wip)
            + toNumber(row.missing_owner)
            + toNumber(row.missing_reviewer)
          result.set(String(row.initiative_id || ''), total)
        }
        return result
      }

      const initiativeRiskCurrent = await computeInitiativeRiskSnapshot(new Date())
      const initiativeRiskPrevious = await computeInitiativeRiskSnapshot(daysAgo(7))
      const initiativeIds = [...new Set([...initiativeRiskCurrent.keys(), ...initiativeRiskPrevious.keys()])].filter(Boolean)
      const initiativeTitleById = new Map<string, string>()
      if (initiativeIds.length > 0) {
        const initiativeIdSql = sql.join(initiativeIds.map((id) => sql`${id}::uuid`), sql`, `)
        const initiativeRows = await db.execute(sql`
          select id, title
          from initiatives
          where id in (${initiativeIdSql})
        `)
        for (const row of initiativeRows as any[]) {
          initiativeTitleById.set(String(row.id || ''), String(row.title || 'Untitled initiative'))
        }
      }
      const riskBurndownByInitiative = initiativeIds
        .map((initiativeId) => {
          const totalAtRisk = initiativeRiskCurrent.get(initiativeId) || 0
          const previous = initiativeRiskPrevious.get(initiativeId) || 0
          return {
            initiativeId,
            initiativeTitle: initiativeTitleById.get(initiativeId) || 'Untitled initiative',
            totalAtRisk,
            delta: totalAtRisk - previous,
          }
        })
        .sort((left, right) => right.totalAtRisk - left.totalAtRisk)
        .slice(0, 16)

      const scopedTaskIdsSql = buildScopedTaskIdsSql(productIds, teamId)
      const [completedTasksRow] = await db.execute(sql`
        select count(*)::int as value
        from tasks
        where completed_at is not null
          and completed_at >= ${sinceIso}
          and ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
      `)
      const completedTasks = toNumber((completedTasksRow as any)?.value)
      const reworkTransitions = await db.select({
        taskId: taskStatusHistory.taskId,
        fromStatus: taskStatusHistory.fromStatus,
        toStatus: taskStatusHistory.toStatus,
      }).from(taskStatusHistory).where(and(
        sql`${taskStatusHistory.changedAt} >= ${sinceIso}`,
        or(
          eq(taskStatusHistory.fromStatus, 'in_review'),
          eq(taskStatusHistory.fromStatus, 'done'),
        ),
        or(
          eq(taskStatusHistory.toStatus, 'in_progress'),
          eq(taskStatusHistory.toStatus, 'assigned'),
        ),
        buildProductCondition(taskStatusHistory.productId, productIds),
        ...(teamId ? [sql`${taskStatusHistory.taskId} in (${scopedTaskIdsSql})`] : []),
      ))
      const reworkTaskIds = new Set(reworkTransitions.map((entry) => entry.taskId))
      const reopenTransitions = reworkTransitions.filter((entry) =>
        entry.fromStatus === 'done' && (entry.toStatus === 'in_progress' || entry.toStatus === 'assigned'),
      )
      const reworkRate = completedTasks > 0
        ? Math.round((reworkTaskIds.size / completedTasks) * 100)
        : 0
      const reopenRate = completedTasks > 0
        ? Math.round((reopenTransitions.length / completedTasks) * 100)
        : 0
      const [escapedDefectsRow] = await db.execute(sql`
        select count(*)::int as value
        from issues
        where created_at >= ${sinceIso}
          and delivery_id is not null
          and ${buildProductScopeSql('product_id', productIds)}
      `)
      const escapedDefects = toNumber((escapedDefectsRow as any)?.value)
      const escapedDefectsPer100Completed = roundTo(safePercent(escapedDefects, Math.max(1, completedTasks)), 1)
      const qualityCostIndex = clamp(Math.round(
        (0.45 * reworkRate)
        + (0.35 * reopenRate)
        + (0.20 * escapedDefectsPer100Completed),
      ))
      const qualityScore = clamp(Math.round(
        (100 - reworkRate * 0.5 - reopenRate * 0.5) - (escapedDefectsPer100Completed * 0.1),
      ))

      const throughputWeeks = Math.max(4, Math.min(26, Math.ceil(period / 7)))
      const throughputRows = await db.execute(sql`
        select date_trunc('week', completed_at) as week_start, count(*)::int as value
        from tasks
        where completed_at is not null
          and completed_at >= ${daysAgo(throughputWeeks * 7).toISOString()}
          and ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
        group by week_start
        order by week_start asc
      `)
      const throughputMap = new Map<string, number>()
      for (const row of throughputRows as any[]) {
        throughputMap.set(toWeekKey(new Date(row.week_start)), toNumber(row.value))
      }
      const throughputSeries: Array<{ bucket: string; completed: number; rollingMean: number; rollingStd: number }> = []
      const values: number[] = []
      for (let i = throughputWeeks - 1; i >= 0; i -= 1) {
        const bucket = toWeekKey(daysAgo(i * 7))
        const completed = throughputMap.get(bucket) || 0
        values.push(completed)
        const windowValues = values.slice(Math.max(0, values.length - 4))
        throughputSeries.push({
          bucket,
          completed,
          rollingMean: roundTo(average(windowValues), 1),
          rollingStd: roundTo(stdDev(windowValues), 1),
        })
      }
      const throughputMean = average(values)
      const throughputStd = stdDev(values)
      const throughputCv = throughputMean > 0 ? throughputStd / throughputMean : 1
      const throughputStabilityIndex = clamp(Math.round(100 - Math.min(100, throughputCv * 100)))

      const productTaskRows = await db.execute(sql`
        select
          product_id,
          count(*) filter (where status not in ('done', 'archived'))::int as open_tasks,
          count(*) filter (where status = 'blocked')::int as blocked_open
        from tasks
        where ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
        group by product_id
      `)
      const productTaskMap = new Map<string, { openTasks: number; blockedOpen: number }>()
      for (const row of productTaskRows as any[]) {
        productTaskMap.set(String(row.product_id || ''), {
          openTasks: toNumber(row.open_tasks),
          blockedOpen: toNumber(row.blocked_open),
        })
      }

      const productUserRows = await db.execute(sql`
        with relevant_tasks as (
          select product_id, owner_user_id, assignee_user_ids, owner_team_id, assignee_team_ids, reviewer_team_ids
          from tasks
          where ${buildProductScopeSql('product_id', productIds)}
            and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
            and status not in ('done', 'archived')
        ),
        task_users as (
          select product_id, owner_user_id as user_id
          from relevant_tasks
          where owner_user_id is not null
          union all
          select product_id, unnest(assignee_user_ids) as user_id
          from relevant_tasks
          where assignee_user_ids is not null
        )
        select product_id, user_id, count(*)::int as open_count
        from task_users
        group by product_id, user_id
      `)

      const openCountsByUser = new Map<string, number>()
      const perProductUserLoads = new Map<string, number[]>()
      for (const row of productUserRows as any[]) {
        const userId = String(row.user_id || '')
        const productId = String(row.product_id || '')
        const openCount = toNumber(row.open_count)
        openCountsByUser.set(userId, (openCountsByUser.get(userId) || 0) + openCount)
        const current = perProductUserLoads.get(productId) || []
        current.push(openCount)
        perProductUserLoads.set(productId, current)
      }

      const loadValues = [...openCountsByUser.values()]
      const meanLoad = average(loadValues)
      const loadBalanceIndex = meanLoad > 0
        ? Math.round((stdDev(loadValues) / meanLoad) * 100)
        : 0
      const overloadedMembers = loadValues.filter((value) => value > 5).length

      const bottleneckCells = productRows.map((product) => {
        const productStats = productTaskMap.get(product.id) || { openTasks: 0, blockedOpen: 0 }
        const userLoads = perProductUserLoads.get(product.id) || []
        const activeMembers = userLoads.length
        const overloadedForProduct = userLoads.filter((count) => count > 5).length
        const blockedPressure = safePercent(productStats.blockedOpen, Math.max(1, productStats.openTasks))
        const overloadPressure = safePercent(overloadedForProduct, Math.max(1, activeMembers))
        const bottleneckScore = clamp(Math.round((0.55 * blockedPressure) + (0.45 * overloadPressure)))
        return {
          productId: product.id,
          productName: product.name,
          blockedCount: productStats.blockedOpen,
          openTaskCount: productStats.openTasks,
          activeMembers,
          overloadedMembers: overloadedForProduct,
          blockedPressure: roundTo(blockedPressure, 1),
          overloadPressure: roundTo(overloadPressure, 1),
          bottleneckScore,
        }
      }).sort((left, right) => right.bottleneckScore - left.bottleneckScore)
      const maxBottleneckScore = bottleneckCells[0]?.bottleneckScore ?? 0

      const initiativeRows = await db.select({
        id: initiatives.id,
        title: initiatives.title,
        status: initiatives.status,
      }).from(initiatives).where(buildProductCondition(initiatives.productId, productIds))

      const deliverySignalById = new Map(deliverySignals.map((row) => [row.deliveryId, row]))
      const initiativeDeliveryRows = await db.execute(sql`
        select di.initiative_id, di.delivery_id
        from delivery_initiatives di
        inner join deliveries d on d.id = di.delivery_id
        where ${buildProductScopeSql('d.product_id', productIds)}
      `)
      const deliveryIdsByInitiative = new Map<string, string[]>()
      for (const row of initiativeDeliveryRows as any[]) {
        const initiativeId = String(row.initiative_id || '')
        const deliveryId = String(row.delivery_id || '')
        const current = deliveryIdsByInitiative.get(initiativeId) || []
        current.push(deliveryId)
        deliveryIdsByInitiative.set(initiativeId, current)
      }
      const initiativeBlockerRows = await db.execute(sql`
        select
          initiative_id,
          count(*) filter (where status = 'blocked')::int as blocked_count,
          count(*) filter (where status not in ('done', 'archived'))::int as open_count
        from tasks
        where initiative_id is not null
          and ${buildProductScopeSql('product_id', productIds)}
          and ${buildTeamScopeSql('owner_team_id', 'assignee_team_ids', 'reviewer_team_ids', teamId)}
        group by initiative_id
      `)
      const initiativeBlockerMap = new Map<string, { blocked: number; open: number }>()
      for (const row of initiativeBlockerRows as any[]) {
        initiativeBlockerMap.set(String(row.initiative_id || ''), {
          blocked: toNumber(row.blocked_count),
          open: toNumber(row.open_count),
        })
      }
      const initiativeStatusScore = (status: string): number => {
        const normalized = status.trim().toLowerCase()
        if (normalized === 'completed') return 100
        if (normalized === 'in_progress' || normalized === 'active') return 65
        if (normalized === 'blocked') return 35
        if (normalized === 'overdue') return 25
        return 50
      }
      const initiativeConfidenceItems = initiativeRows.map((row) => {
        const linkedDeliveries = deliveryIdsByInitiative.get(row.id) || []
        const linkedPredictabilityValues = linkedDeliveries
          .map((deliveryId) => deliverySignalById.get(deliveryId)?.predictability ?? null)
          .filter((value): value is number => typeof value === 'number')
        const linkedPredictabilityScore = linkedPredictabilityValues.length > 0
          ? roundTo(average(linkedPredictabilityValues), 1)
          : 50
        const blockerStats = initiativeBlockerMap.get(row.id) || { blocked: 0, open: 0 }
        const blockerRatio = safePercent(blockerStats.blocked, Math.max(1, blockerStats.open))
        const blockerPenalty = Math.min(40, Math.round(blockerRatio))
        const score = clamp(Math.round(
          (0.4 * initiativeStatusScore(String(row.status || '')))
          + (0.6 * linkedPredictabilityScore)
          - blockerPenalty,
        ))
        return {
          initiativeId: row.id,
          title: row.title,
          status: row.status,
          linkedDeliveries: linkedDeliveries.length,
          linkedPredictabilityScore,
          blockerRatio: roundTo(blockerRatio, 1),
          score,
        }
      })
      const initiativeExecutionConfidence = initiativeConfidenceItems.length > 0
        ? Math.round(average(initiativeConfidenceItems.map((item) => item.score)))
        : 0
      const initiativeBands = {
        high: initiativeConfidenceItems.filter((item) => item.score >= 75).length,
        medium: initiativeConfidenceItems.filter((item) => item.score >= 45 && item.score < 75).length,
        low: initiativeConfidenceItems.filter((item) => item.score < 45).length,
      }

      const feedbackRows = await db.select({
        id: consumerFeedbacks.id,
        priority: consumerFeedbacks.priority,
        status: consumerFeedbacks.status,
        createdAt: consumerFeedbacks.createdAt,
        acknowledgedAt: consumerFeedbacks.acknowledgedAt,
        resolvedAt: consumerFeedbacks.resolvedAt,
      }).from(consumerFeedbacks).where(and(
        buildProductCondition(consumerFeedbacks.productId, productIds),
        sql`${consumerFeedbacks.createdAt} >= ${sinceIso}`,
      ))
      const openFeedbackStatuses = new Set(['new', 'acknowledged', 'investigating'])
      const criticalOpenFeedback = feedbackRows.filter((row) =>
        row.priority === 'critical' && openFeedbackStatuses.has(String(row.status || '')),
      ).length
      const totalOpenFeedback = feedbackRows.filter((row) =>
        openFeedbackStatuses.has(String(row.status || '')),
      ).length
      const acknowledgeHours = feedbackRows
        .filter((row) => row.acknowledgedAt)
        .map((row) => (new Date(row.acknowledgedAt!).getTime() - new Date(row.createdAt).getTime()) / 3600000)
        .filter((value) => Number.isFinite(value) && value >= 0)
      const resolveHours = feedbackRows
        .filter((row) => row.resolvedAt)
        .map((row) => (new Date(row.resolvedAt!).getTime() - new Date(row.createdAt).getTime()) / 3600000)
        .filter((value) => Number.isFinite(value) && value >= 0)
      const p85AcknowledgeHours = acknowledgeHours.length > 0 ? roundTo(percentile(acknowledgeHours, 85), 1) : 0
      const p85ResolveHours = resolveHours.length > 0 ? roundTo(percentile(resolveHours, 85), 1) : 0
      const criticalBacklogPressure = Math.min(100, safePercent(criticalOpenFeedback, Math.max(1, totalOpenFeedback)))
      const acknowledgeSlaHours = 24
      const resolveSlaHours = 120
      const acknowledgePressure = Math.min(100, safePercent(p85AcknowledgeHours, acknowledgeSlaHours))
      const resolvePressure = Math.min(100, safePercent(p85ResolveHours, resolveSlaHours))
      const customerImpactProxy = clamp(Math.round(
        (0.50 * criticalBacklogPressure)
        + (0.25 * acknowledgePressure)
        + (0.25 * resolvePressure),
      ))
      const customerImpactTrendMap = new Map<string, { criticalCount: number; acknowledgeHours: number[]; resolveHours: number[] }>()
      for (const row of feedbackRows) {
        const bucket = toWeekKey(new Date(row.createdAt))
        const current = customerImpactTrendMap.get(bucket) || { criticalCount: 0, acknowledgeHours: [], resolveHours: [] }
        if (row.priority === 'critical') current.criticalCount += 1
        if (row.acknowledgedAt) {
          const hours = (new Date(row.acknowledgedAt).getTime() - new Date(row.createdAt).getTime()) / 3600000
          if (Number.isFinite(hours) && hours >= 0) current.acknowledgeHours.push(hours)
        }
        if (row.resolvedAt) {
          const hours = (new Date(row.resolvedAt).getTime() - new Date(row.createdAt).getTime()) / 3600000
          if (Number.isFinite(hours) && hours >= 0) current.resolveHours.push(hours)
        }
        customerImpactTrendMap.set(bucket, current)
      }
      const customerImpactTrend = [...customerImpactTrendMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([bucket, stats]) => ({
          bucket,
          criticalCount: stats.criticalCount,
          avgAcknowledgeHours: stats.acknowledgeHours.length > 0 ? roundTo(average(stats.acknowledgeHours), 1) : 0,
          avgResolveHours: stats.resolveHours.length > 0 ? roundTo(average(stats.resolveHours), 1) : 0,
        }))

      const predictabilityScore = deliverySignals.length > 0
        ? Math.round(average(deliverySignals.map((row) => row.predictability)))
        : 0
      const blockedPer100Open = openTasks > 0
        ? roundTo((blockedOpen / openTasks) * 100, 1)
        : 0
      const blockerScore = clamp(Math.round(100 - Math.min(100, blockedPer100Open)))
      const workloadBalanceScore = clamp(Math.round(100 - Math.min(100, loadBalanceIndex)))
      const portfolioHealthScore = clamp(Math.round(
        (0.35 * predictabilityScore)
        + (0.25 * qualityScore)
        + (0.20 * blockerScore)
        + (0.20 * workloadBalanceScore),
      ))

      return {
        kpis: {
          portfolioHealthScore: {
            value: portfolioHealthScore,
            unit: 'score',
            sampleSize: deliverySignals.length + completedTasks + loadValues.length,
          },
          deliveryConfidenceDistribution: {
            value: highConfidencePercent,
            unit: 'percent_high',
            sampleSize: deliveryCount,
          },
          forecastBias: {
            value: meanVarianceDays,
            unit: 'days',
            direction: forecastBiasDirection,
            sampleSize: deliveryCount,
          },
          scopeVolatilityBurn: {
            value: volatilityStressScore,
            unit: 'score',
            sampleSize: deliveryCount,
          },
          riskBurndown: {
            value: riskBurndownDelta,
            unit: 'delta_tasks',
            sampleSize: currentAtRisk,
          },
          initiativeExecutionConfidence: {
            value: initiativeExecutionConfidence,
            unit: 'score',
            sampleSize: initiativeConfidenceItems.length,
          },
          qualityCostIndex: {
            value: qualityCostIndex,
            unit: 'cost_index',
            sampleSize: completedTasks,
          },
          throughputStabilityIndex: {
            value: throughputStabilityIndex,
            unit: 'score',
            sampleSize: throughputSeries.length,
          },
          crossProductBottleneckHeatmap: {
            value: maxBottleneckScore,
            unit: 'score',
            sampleSize: bottleneckCells.length,
          },
          customerImpactProxy: {
            value: customerImpactProxy,
            unit: 'score',
            sampleSize: feedbackRows.length,
          },
        },
        details: {
          deliveryConfidenceDistribution: {
            ...deliveryConfidenceBands,
            total: deliveryCount,
            highPercent: highConfidencePercent,
          },
          forecastBias: {
            meanVarianceDays,
            direction: forecastBiasDirection,
            lateCount,
            earlyCount,
            onTimeCount,
            byProduct: forecastByProduct,
            byTeam: forecastByTeam,
          },
          scopeVolatilityBurn: {
            score: volatilityStressScore,
            totalScopeAddedAfterStart: totalScopeAdded,
            totalPlannedScope,
            trend: scopeVolatilityTrend,
          },
          riskBurndown: {
            delta: riskBurndownDelta,
            currentAtRisk,
            previousAtRisk,
            trend: riskBurndownTrend,
            byProduct: riskBurndownByProduct,
            byInitiative: riskBurndownByInitiative,
          },
          initiativeExecutionConfidence: {
            averageScore: initiativeExecutionConfidence,
            bands: initiativeBands,
            items: initiativeConfidenceItems
              .sort((left, right) => right.score - left.score)
              .slice(0, 20),
          },
          qualityCostIndex: {
            score: qualityCostIndex,
            reworkRate,
            reopenRate,
            escapedDefects,
            escapedDefectsPer100Completed,
          },
          throughputStabilityIndex: {
            score: throughputStabilityIndex,
            meanDeparture: roundTo(throughputMean, 1),
            stdDeparture: roundTo(throughputStd, 1),
            coefficientOfVariation: roundTo(throughputCv, 2),
            trend: throughputSeries,
          },
          crossProductBottleneckHeatmap: {
            maxScore: maxBottleneckScore,
            cells: bottleneckCells,
          },
          customerImpactProxy: {
            score: customerImpactProxy,
            criticalOpenFeedback,
            totalOpenFeedback,
            p85AcknowledgeHours,
            p85ResolveHours,
            acknowledgeSlaHours,
            resolveSlaHours,
            trend: customerImpactTrend,
          },
          portfolioHealthScore: {
            score: portfolioHealthScore,
            components: {
              predictabilityScore,
              qualityScore,
              blockerScore,
              workloadBalanceScore,
              blockedPer100Open,
              loadBalanceIndex,
            },
          },
        },
        meta: buildMetricsMeta(period, {
          deliveries: deliverySignals.length,
          tasksOpen: openTasks,
          initiatives: initiativeRows.length,
          feedback: feedbackRows.length,
        }, { cacheTtl }),
      }
    }

    const payload = access.cacheProductId
      ? await withMetricsCache(
        { endpoint: 'executive-kpis', productId: access.cacheProductId, period },
        cacheTtl,
        computeExecutiveKpis,
      )
      : await computeExecutiveKpis()

    return payload
  })
