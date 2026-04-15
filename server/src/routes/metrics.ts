import { Elysia } from 'elysia'
import { db } from '../db'
import { users, tasks, stories, initiatives, deliveries, productMembers, taskStatusHistory } from '../db/schema'
import { resolveProductByScope, denormMatchValues, type ProductScopeRow } from '../lib/resolveProductScope'

function matchesProductDenorm(value: string | null | undefined, scopeRow: ProductScopeRow | null): boolean {
  if (!scopeRow) return true
  if (value == null) return false
  return denormMatchValues(scopeRow).includes(String(value))
}

// Helper: get date N days ago
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000) }

// Helper: format date as YYYY-MM-DD
function toDateKey(d: Date) { return d.toISOString().slice(0, 10) }

// Helper: format date as YYYY-WXX (ISO week)
function toWeekKey(d: Date) {
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

// Helper: format date as YYYY-MM
function toMonthKey(d: Date) { return d.toISOString().slice(0, 7) }

function groupByDate(dates: Date[], granularity: string): string {
  const d = new Date(dates[0] || new Date())
  if (granularity === 'day') return toDateKey(d)
  if (granularity === 'week') return toWeekKey(d)
  return toMonthKey(d)
}

function getGranKey(d: Date, granularity: string): string {
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

export const metricsRoutes = new Elysia({ prefix: '/api/metrics' })

  // ==================== OVERVIEW ====================
  .get('/dashboard', async ({ query }) => {
    const scopeRow = (query.product || '').trim()
      ? await resolveProductByScope((query.product || '').trim())
      : null
    const period = parseInt(query.period as string || '30')
    const since = daysAgo(period)
    const prevSince = daysAgo(period * 2)

    const allTasks = await db.select().from(tasks)
    const allStories = await db.select().from(stories)
    const allInitiatives = await db.select().from(initiatives)
    const allDeliveries = await db.select().from(deliveries)
    const allUsers = await db.select().from(users)

    const ft = allTasks.filter(t => matchesProductDenorm(t.productId, scopeRow))
    const fs = allStories.filter(s => matchesProductDenorm(s.product, scopeRow))
    const fi = allInitiatives.filter(i => matchesProductDenorm(i.product, scopeRow))
    const fd = allDeliveries.filter(d => matchesProductDenorm(d.productId, scopeRow))

    // Current period
    const tasksCompletedCurr = ft.filter(t => t.completedAt && new Date(t.completedAt) >= since).length
    const storiesCompletedCurr = fs.filter(s => s.status === 'completed').length
    const tasksDoneCurr = ft.filter(t => t.status === 'done').length
    const tasksCompletedPrev = ft.filter(t => t.completedAt && new Date(t.completedAt) >= prevSince && new Date(t.completedAt) < since).length

    // Completion rates
    const taskCompletionRate = ft.length > 0 ? Math.round((tasksDoneCurr / ft.length) * 100) : 0
    const storyCompletionRate = fs.length > 0 ? Math.round((fs.filter(s => s.status === 'completed').length / fs.length) * 100) : 0
    const initCompletionRate = fi.length > 0 ? Math.round((fi.filter(i => i.status === 'completed').length / fi.length) * 100) : 0
    const delivCompletionRate = fd.length > 0 ? Math.round((fd.filter(d => d.status === 'completed').length / fd.length) * 100) : 0

    // Cycle time & lead time (for completed tasks)
    const completedTasks = ft.filter(t => t.completedAt && t.startedAt)
    const cycleTimes = completedTasks.map(t => (new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()) / 86400000)
    const leadTimes = ft.filter(t => t.completedAt).map(t => (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 86400000)
    const avgCycleTime = cycleTimes.length > 0 ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length * 10) / 10 : 0
    const avgLeadTime = leadTimes.length > 0 ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length * 10) / 10 : 0

    // Blocked / overdue
    const blockedCount = ft.filter(t => t.status === 'blocked').length
    const overdueCount = ft.filter(t => t.status === 'overdue').length
    const inProgressCount = ft.filter(t => t.status === 'in_progress').length
    const inReviewCount = ft.filter(t => t.status === 'in_review').length

    // On-time completion: tasks completed before/on dueAt
    const tasksWithDue = ft.filter(t => t.completedAt && t.dueAt)
    const onTimeCount = tasksWithDue.filter(t => new Date(t.completedAt!) <= new Date(t.dueAt!)).length
    const onTimeRate = tasksWithDue.length > 0 ? Math.round((onTimeCount / tasksWithDue.length) * 100) : 100

    // Sparkline: tasks completed per week for last 8 weeks
    const sparkline: number[] = []
    for (let i = 7; i >= 0; i--) {
      const weekStart = daysAgo((i + 1) * 7)
      const weekEnd = daysAgo(i * 7)
      sparkline.push(ft.filter(t => t.completedAt && new Date(t.completedAt) >= weekStart && new Date(t.completedAt) < weekEnd).length)
    }

    // Team workload for overview table
    const teamWorkload = allUsers.map(u => {
      const userTasks = ft.filter(t => t.ownerUserId === u.id || (t.assigneeUserIds && t.assigneeUserIds.includes(u.id)))
      return {
        id: u.id, name: u.name, avatar: u.avatar, role: u.role,
        tasks: { total: userTasks.length, completed: userTasks.filter(t => t.status === 'done').length, inProgress: userTasks.filter(t => t.status === 'in_progress').length, overdue: userTasks.filter(t => t.status === 'overdue').length },
        stories: fs.filter(s => s.owner === u.name).length,
        completionRate: userTasks.length > 0 ? Math.round((userTasks.filter(t => t.status === 'done').length / userTasks.length) * 100) : 0,
      }
    }).filter(u => u.tasks.total > 0 || u.stories > 0).sort((a, b) => b.tasks.total - a.tasks.total)

    return {
      kpi: {
        tasksCompleted: { current: tasksCompletedCurr, previous: tasksCompletedPrev },
        storiesCompleted: storiesCompletedCurr,
        taskCompletionRate, storyCompletionRate, initCompletionRate, delivCompletionRate,
        avgCycleTime, avgLeadTime, onTimeRate,
        blockedCount, overdueCount, inProgressCount, inReviewCount,
        totalTasks: ft.length, totalStories: fs.length, totalInitiatives: fi.length, totalDeliveries: fd.length,
      },
      sparkline,
      team: { workload: teamWorkload, totalMembers: teamWorkload.length },
    }
  })

  // ==================== THROUGHPUT ====================
  .get('/throughput', async ({ query }) => {
    const scopeRow = (query.product || '').trim()
      ? await resolveProductByScope((query.product || '').trim())
      : null
    const period = parseInt(query.period as string || '90')
    const granularity = (query.granularity as string) || 'week'
    const since = daysAgo(period)

    const allTasks = await db.select().from(tasks)
    const allUsers = await db.select().from(users)
    const ft = allTasks.filter(t => matchesProductDenorm(t.productId, scopeRow))

    // Completed over time
    const completedByPeriod: Record<string, number> = {}
    const createdByPeriod: Record<string, number> = {}

    ft.filter(t => t.completedAt && new Date(t.completedAt) >= since).forEach(t => {
      const key = getGranKey(new Date(t.completedAt!), granularity)
      completedByPeriod[key] = (completedByPeriod[key] || 0) + 1
    })

    ft.filter(t => new Date(t.createdAt) >= since).forEach(t => {
      const key = getGranKey(new Date(t.createdAt), granularity)
      createdByPeriod[key] = (createdByPeriod[key] || 0) + 1
    })

    // Merge keys and sort
    const allKeys = [...new Set([...Object.keys(completedByPeriod), ...Object.keys(createdByPeriod)])].sort()
    const completedOverTime = allKeys.map(k => ({ date: k, completed: completedByPeriod[k] || 0, created: createdByPeriod[k] || 0 }))

    // By assignee
    const byAssignee: Record<string, { name: string; avatar: string | null; count: number }> = {}
    ft.filter(t => t.completedAt && new Date(t.completedAt) >= since).forEach(t => {
      const uid = t.ownerUserId || t.createdByUserId
      if (!byAssignee[uid]) {
        const u = allUsers.find(u => u.id === uid)
        byAssignee[uid] = { name: u?.name || 'Unknown', avatar: u?.avatar || null, count: 0 }
      }
      byAssignee[uid].count++
    })
    const completedByAssignee = Object.entries(byAssignee).map(([id, d]) => ({ userId: id, ...d })).sort((a, b) => b.count - a.count)

    // By type
    const byType: Record<string, number> = {}
    ft.filter(t => t.completedAt && new Date(t.completedAt) >= since).forEach(t => {
      const type = t.type || 'untyped'
      byType[type] = (byType[type] || 0) + 1
    })

    return { completedOverTime, completedByAssignee, byType, totalCompleted: ft.filter(t => t.completedAt && new Date(t.completedAt) >= since).length }
  })

  // ==================== FLOW ====================
  .get('/flow', async ({ query }) => {
    const scopeRow = (query.product || '').trim()
      ? await resolveProductByScope((query.product || '').trim())
      : null
    const period = parseInt(query.period as string || '90')
    const since = daysAgo(period)

    const allTasks = await db.select().from(tasks)
    const ft = allTasks.filter(t => matchesProductDenorm(t.productId, scopeRow))
    const history = await db.select().from(taskStatusHistory)
    const fh = history.filter(h => matchesProductDenorm(h.productId, scopeRow))

    // Cycle time scatter (completed tasks)
    const completedWithStart = ft.filter(t => t.completedAt && t.startedAt && new Date(t.completedAt) >= since)
    const cycleTimeData = completedWithStart.map(t => ({
      taskId: t.id, title: t.title, priority: t.priority,
      cycleTimeDays: Math.round(((new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()) / 86400000) * 10) / 10,
      completedAt: t.completedAt,
    }))
    const ctValues = cycleTimeData.map(d => d.cycleTimeDays)

    // Lead time
    const completedAll = ft.filter(t => t.completedAt && new Date(t.completedAt) >= since)
    const leadTimeData = completedAll.map(t => ({
      taskId: t.id, title: t.title,
      leadTimeDays: Math.round(((new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 86400000) * 10) / 10,
    }))
    const ltValues = leadTimeData.map(d => d.leadTimeDays)

    // Aging WIP
    const now = Date.now()
    const wipTasks = ft.filter(t => !['done', 'archived'].includes(t.status))
    const agingWip = wipTasks.map(t => ({
      taskId: t.id, title: t.title, status: t.status, priority: t.priority,
      ageDays: Math.round(((now - new Date(t.startedAt || t.createdAt).getTime()) / 86400000) * 10) / 10,
    })).sort((a, b) => b.ageDays - a.ageDays)

    // CFD: cumulative count per status over time (from history)
    const cfdDates: string[] = []
    const statusKeys = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'blocked']
    const dayCount = Math.min(period, 90)

    // Build daily snapshots from current status + history
    const cfd: { date: string; [key: string]: number | string }[] = []
    for (let i = dayCount; i >= 0; i -= (dayCount > 30 ? 7 : 1)) {
      const day = daysAgo(i)
      const dayKey = toDateKey(day)
      const dayEnd = day.getTime()

      // For each task, find its status at this point in time
      const snapshot: Record<string, number> = {}
      statusKeys.forEach(s => { snapshot[s] = 0 })

      ft.forEach(t => {
        if (new Date(t.createdAt).getTime() > dayEnd) return // task didn't exist yet
        // Find last history entry before this date
        const taskHistory = fh.filter(h => h.taskId === t.id && new Date(h.changedAt).getTime() <= dayEnd)
          .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
        const statusAtDate = taskHistory.length > 0 ? taskHistory[0].toStatus : t.status
        if (snapshot[statusAtDate] !== undefined) snapshot[statusAtDate]++
      })

      cfd.push({ date: dayKey, ...snapshot })
    }

    // Flow efficiency: time in active states / total lead time
    let flowEfficiency = 0
    if (completedWithStart.length > 0) {
      const totalLead = completedAll.reduce((s, t) => s + (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()), 0)
      const totalActive = completedWithStart.reduce((s, t) => s + (new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()), 0)
      flowEfficiency = totalLead > 0 ? Math.round((totalActive / totalLead) * 100) : 0
    }

    return {
      cycleTime: { data: cycleTimeData, median: Math.round(median(ctValues) * 10) / 10, p85: Math.round(percentile(ctValues, 85) * 10) / 10, average: ctValues.length > 0 ? Math.round((ctValues.reduce((a, b) => a + b, 0) / ctValues.length) * 10) / 10 : 0 },
      leadTime: { data: leadTimeData, median: Math.round(median(ltValues) * 10) / 10, p85: Math.round(percentile(ltValues, 85) * 10) / 10, average: ltValues.length > 0 ? Math.round((ltValues.reduce((a, b) => a + b, 0) / ltValues.length) * 10) / 10 : 0 },
      agingWip,
      cfd,
      flowEfficiency,
      wipCount: wipTasks.length,
    }
  })

  // ==================== QUALITY ====================
  .get('/quality', async ({ query }) => {
    const scopeRow = (query.product || '').trim()
      ? await resolveProductByScope((query.product || '').trim())
      : null
    const period = parseInt(query.period as string || '90')
    const since = daysAgo(period)

    const allTasks = await db.select().from(tasks)
    const ft = allTasks.filter(t => matchesProductDenorm(t.productId, scopeRow))
    const history = await db.select().from(taskStatusHistory)
    const fh = history.filter(h => matchesProductDenorm(h.productId, scopeRow))

    // Rework: tasks that went from in_review/done back to in_progress
    const reworkTransitions = fh.filter(h =>
      (h.fromStatus === 'in_review' || h.fromStatus === 'done') &&
      (h.toStatus === 'in_progress' || h.toStatus === 'assigned') &&
      new Date(h.changedAt) >= since
    )
    const reworkTaskIds = new Set(reworkTransitions.map(h => h.taskId))

    // First-pass: tasks that went in_review → done without bouncing back
    const completedInPeriod = ft.filter(t => t.completedAt && new Date(t.completedAt) >= since)
    const firstPassCount = completedInPeriod.filter(t => !reworkTaskIds.has(t.id)).length
    const firstPassRate = completedInPeriod.length > 0 ? Math.round((firstPassCount / completedInPeriod.length) * 100) : 100
    const reworkRate = completedInPeriod.length > 0 ? Math.round((reworkTaskIds.size / completedInPeriod.length) * 100) : 0

    // Bug rate
    const completedBugs = completedInPeriod.filter(t => t.type === 'fix').length
    const bugRate = completedInPeriod.length > 0 ? Math.round((completedBugs / completedInPeriod.length) * 100) : 0

    // Review load by reviewer
    const allUsers = await db.select().from(users)
    const inReviewTasks = ft.filter(t => t.status === 'in_review')
    const reviewLoad: { userId: string; name: string; avatar: string | null; count: number }[] = []
    const reviewerMap: Record<string, number> = {}
    inReviewTasks.forEach(t => {
      (t.reviewerUserIds || []).forEach(rid => {
        if (rid) reviewerMap[rid] = (reviewerMap[rid] || 0) + 1
      })
    })
    Object.entries(reviewerMap).forEach(([uid, count]) => {
      const u = allUsers.find(u => u.id === uid)
      reviewLoad.push({ userId: uid, name: u?.name || 'Unknown', avatar: u?.avatar || null, count })
    })
    reviewLoad.sort((a, b) => b.count - a.count)

    // Reworked tasks detail
    const reworkedTasks = ft.filter(t => reworkTaskIds.has(t.id)).map(t => ({
      taskId: t.id, title: t.title, status: t.status, priority: t.priority,
      reworkCount: reworkTransitions.filter(h => h.taskId === t.id).length,
    }))

    // Rework trend by week
    const reworkByWeek: Record<string, number> = {}
    reworkTransitions.forEach(h => {
      const key = toWeekKey(new Date(h.changedAt))
      reworkByWeek[key] = (reworkByWeek[key] || 0) + 1
    })

    return {
      firstPassRate, reworkRate, bugRate,
      totalCompleted: completedInPeriod.length,
      reworkCount: reworkTaskIds.size,
      reviewLoad, reworkedTasks,
      reworkByWeek: Object.entries(reworkByWeek).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    }
  })

  // ==================== BLOCKERS ====================
  .get('/blockers', async ({ query }) => {
    const scopeRow = (query.product || '').trim()
      ? await resolveProductByScope((query.product || '').trim())
      : null
    const period = parseInt(query.period as string || '90')
    const since = daysAgo(period)

    const allTasks = await db.select().from(tasks)
    const allUsers = await db.select().from(users)
    const ft = allTasks.filter(t => matchesProductDenorm(t.productId, scopeRow))
    const history = await db.select().from(taskStatusHistory)
    const fh = history.filter(h => matchesProductDenorm(h.productId, scopeRow))

    // Currently blocked
    const now = Date.now()
    const blockedTasks = ft.filter(t => t.status === 'blocked').map(t => {
      // Find when it became blocked
      const blockedEntry = fh.filter(h => h.taskId === t.id && h.toStatus === 'blocked')
        .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())[0]
      const blockedSince = blockedEntry ? new Date(blockedEntry.changedAt) : new Date(t.updatedAt)
      const owner = allUsers.find(u => u.id === t.ownerUserId)

      return {
        taskId: t.id, title: t.title, priority: t.priority,
        blockedReason: t.blockedReason || 'No reason provided',
        blockedDays: Math.round(((now - blockedSince.getTime()) / 86400000) * 10) / 10,
        assignee: owner ? { name: owner.name, avatar: owner.avatar } : null,
      }
    }).sort((a, b) => b.blockedDays - a.blockedDays)

    // Block reasons aggregation
    const reasonMap: Record<string, number> = {}
    ft.filter(t => t.blockedReason).forEach(t => {
      const reason = t.blockedReason || 'Unknown'
      reasonMap[reason] = (reasonMap[reason] || 0) + 1
    })
    const blockReasons = Object.entries(reasonMap).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)

    // Block duration from history (completed block cycles)
    const blockEntries = fh.filter(h => h.toStatus === 'blocked' && new Date(h.changedAt) >= since)
    const unblockEntries = fh.filter(h => h.fromStatus === 'blocked' && new Date(h.changedAt) >= since)
    const blockDurations: number[] = []
    blockEntries.forEach(be => {
      const unblock = unblockEntries.find(ue => ue.taskId === be.taskId && new Date(ue.changedAt) > new Date(be.changedAt))
      if (unblock) {
        blockDurations.push((new Date(unblock.changedAt).getTime() - new Date(be.changedAt).getTime()) / 86400000)
      }
    })
    const avgBlockDuration = blockDurations.length > 0 ? Math.round((blockDurations.reduce((a, b) => a + b, 0) / blockDurations.length) * 10) / 10 : 0

    // Bottleneck stages: tasks per status weighted by age
    const statusAging: Record<string, { count: number; avgAge: number }> = {}
    ft.filter(t => !['done', 'archived'].includes(t.status)).forEach(t => {
      if (!statusAging[t.status]) statusAging[t.status] = { count: 0, avgAge: 0 }
      statusAging[t.status].count++
      statusAging[t.status].avgAge += (now - new Date(t.startedAt || t.createdAt).getTime()) / 86400000
    })
    Object.values(statusAging).forEach(v => { v.avgAge = v.count > 0 ? Math.round((v.avgAge / v.count) * 10) / 10 : 0 })

    // Blocked trend over time
    const blockedByWeek: Record<string, number> = {}
    blockEntries.forEach(h => {
      const key = toWeekKey(new Date(h.changedAt))
      blockedByWeek[key] = (blockedByWeek[key] || 0) + 1
    })

    return {
      currentlyBlocked: blockedTasks,
      blockedCount: blockedTasks.length,
      avgBlockDuration,
      blockReasons,
      bottleneckStages: statusAging,
      blockedTrend: Object.entries(blockedByWeek).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    }
  })

  // ==================== PREDICTABILITY ====================
  .get('/predictability', async ({ query }) => {
    const scopeRow = (query.product || '').trim()
      ? await resolveProductByScope((query.product || '').trim())
      : null
    const period = parseInt(query.period as string || '90')
    const since = daysAgo(period)

    const allTasks = await db.select().from(tasks)
    const allDeliveries = await db.select().from(deliveries)
    const ft = allTasks.filter(t => matchesProductDenorm(t.productId, scopeRow))
    const fd = allDeliveries.filter(d => matchesProductDenorm(d.productId, scopeRow))

    // Per-delivery planned vs completed
    const deliveryMetrics = fd.map(d => {
      const delivTasks = ft.filter(t => t.deliveryId === d.id)
      const completed = delivTasks.filter(t => t.status === 'done').length
      return {
        deliveryId: d.id, title: d.title, status: d.status,
        planned: delivTasks.length, completed,
        predictability: delivTasks.length > 0 ? Math.round((completed / delivTasks.length) * 100) : 0,
      }
    })

    // Burnup: cumulative completed over time
    const completedTasks = ft.filter(t => t.completedAt && new Date(t.completedAt) >= since)
      .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime())
    const burnupData: { date: string; cumulative: number; total: number }[] = []
    let cumulative = 0
    const dayStep = period > 60 ? 7 : 1
    for (let i = period; i >= 0; i -= dayStep) {
      const day = daysAgo(i)
      const dayEnd = day.getTime()
      const completed = ft.filter(t => t.completedAt && new Date(t.completedAt).getTime() <= dayEnd).length
      const total = ft.filter(t => new Date(t.createdAt).getTime() <= dayEnd).length
      burnupData.push({ date: toDateKey(day), cumulative: completed, total })
    }

    // Estimate accuracy (scatter data)
    const estimateData = ft.filter(t => t.estimateValue && t.completedAt && t.startedAt).map(t => ({
      taskId: t.id, title: t.title,
      estimate: t.estimateValue!,
      actualDays: Math.round(((new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()) / 86400000) * 10) / 10,
    }))

    // On-time completion
    const tasksWithDue = ft.filter(t => t.completedAt && t.dueAt)
    const onTimeCount = tasksWithDue.filter(t => new Date(t.completedAt!) <= new Date(t.dueAt!)).length
    const onTimeRate = tasksWithDue.length > 0 ? Math.round((onTimeCount / tasksWithDue.length) * 100) : 100
    const overdueCount = ft.filter(t => t.status === 'overdue' || (t.dueAt && !t.completedAt && new Date(t.dueAt) < new Date())).length

    // Scope change: tasks created after their delivery started
    let scopeChangeCount = 0
    fd.forEach(d => {
      if (!d.startDate) return
      const startDate = new Date(d.startDate)
      const addedAfter = ft.filter(t => t.deliveryId === d.id && new Date(t.createdAt) > startDate).length
      scopeChangeCount += addedAfter
    })

    return {
      deliveryMetrics, burnupData, estimateData,
      onTimeRate, overdueCount, scopeChangeCount,
      avgPredictability: deliveryMetrics.length > 0 ? Math.round(deliveryMetrics.reduce((s, d) => s + d.predictability, 0) / deliveryMetrics.length) : 0,
    }
  })

  // ==================== WORKLOAD ====================
  .get('/workload', async ({ query }) => {
    const scopeRow = (query.product || '').trim()
      ? await resolveProductByScope((query.product || '').trim())
      : null

    const allTasks = await db.select().from(tasks)
    const allUsers = await db.select().from(users)
    const ft = allTasks.filter(t => matchesProductDenorm(t.productId, scopeRow))

    const memberWorkload = allUsers.map(u => {
      const userTasks = ft.filter(t => t.ownerUserId === u.id || (t.assigneeUserIds && t.assigneeUserIds.includes(u.id)))
      const wipTasks = userTasks.filter(t => !['done', 'archived'].includes(t.status))
      const now = Date.now()

      // Status breakdown
      const byStatus: Record<string, number> = {}
      userTasks.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1 })

      // Review load
      const reviewTasks = ft.filter(t => t.status === 'in_review' && t.reviewerUserIds && t.reviewerUserIds.includes(u.id))

      // Overdue
      const overdueTasks = userTasks.filter(t => t.dueAt && !t.completedAt && new Date(t.dueAt) < new Date() && t.status !== 'done')

      return {
        id: u.id, name: u.name, avatar: u.avatar, role: u.role,
        totalTasks: userTasks.length,
        wipCount: wipTasks.length,
        completedCount: userTasks.filter(t => t.status === 'done').length,
        byStatus,
        reviewLoad: reviewTasks.length,
        overdueCount: overdueTasks.length,
        overdueTasks: overdueTasks.map(t => ({ taskId: t.id, title: t.title, dueAt: t.dueAt, daysOverdue: Math.round(((now - new Date(t.dueAt!).getTime()) / 86400000) * 10) / 10 })),
        completionRate: userTasks.length > 0 ? Math.round((userTasks.filter(t => t.status === 'done').length / userTasks.length) * 100) : 0,
      }
    }).filter(u => u.totalTasks > 0).sort((a, b) => b.wipCount - a.wipCount)

    // Identify overloaded (WIP > 5) and idle (WIP === 0 but has tasks)
    const overloaded = memberWorkload.filter(m => m.wipCount > 5)
    const idle = memberWorkload.filter(m => m.wipCount === 0)

    return { memberWorkload, overloaded, idle, totalMembers: memberWorkload.length }
  })

  // ==================== DELIVERIES METRICS ====================
  .get('/deliveries-metrics', async ({ query }) => {
    const scopeRow = (query.product || '').trim()
      ? await resolveProductByScope((query.product || '').trim())
      : null

    const allTasks = await db.select().from(tasks)
    const allDeliveries = await db.select().from(deliveries)
    const ft = allTasks.filter(t => matchesProductDenorm(t.productId, scopeRow))
    const fd = allDeliveries.filter(d => matchesProductDenorm(d.productId, scopeRow))

    const now = Date.now()
    const deliveryDetails = fd.map(d => {
      const delivTasks = ft.filter(t => t.deliveryId === d.id)
      const completed = delivTasks.filter(t => t.status === 'done').length
      const blocked = delivTasks.filter(t => t.status === 'blocked').length

      // Velocity: tasks completed per week
      const completedDates = delivTasks.filter(t => t.completedAt).map(t => new Date(t.completedAt!).getTime())
      let velocity = 0
      if (completedDates.length > 0 && d.startDate) {
        const startMs = new Date(d.startDate).getTime()
        const weeks = Math.max(1, (now - startMs) / (7 * 86400000))
        velocity = Math.round((completed / weeks) * 10) / 10
      }

      // Days remaining
      let daysRemaining = null
      if (d.endDate) {
        daysRemaining = Math.round(((new Date(d.endDate).getTime() - now) / 86400000) * 10) / 10
      }

      return {
        id: d.id, title: d.title, status: d.status,
        startDate: d.startDate, endDate: d.endDate,
        totalTasks: delivTasks.length, completed, blocked,
        progress: delivTasks.length > 0 ? Math.round((completed / delivTasks.length) * 100) : 0,
        velocity, daysRemaining,
        onTrack: d.status !== 'overdue' && d.status !== 'blocked',
      }
    })

    // Status distribution
    const byStatus: Record<string, number> = {}
    fd.forEach(d => { byStatus[d.status] = (byStatus[d.status] || 0) + 1 })

    const activeDeliveries = fd.filter(d => d.status === 'in_progress').length
    const avgProgress = deliveryDetails.length > 0 ? Math.round(deliveryDetails.reduce((s, d) => s + d.progress, 0) / deliveryDetails.length) : 0

    return { deliveryDetails, byStatus, activeDeliveries, avgProgress, total: fd.length }
  })
