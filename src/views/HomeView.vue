<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  CalendarClock,
  Clock3,
  Gauge,
  ListChecks,
  Loader2,
  ShieldAlert,
  TimerReset,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/lib/api'
import {
  buildHomeActivityEntityRoute,
  buildHomeTaskRoute,
  buildHomeUserRoute,
} from '@/lib/homeEntityRouting'
import type { HomeScopeSelection } from '@/composables/useHomeScope'
import type {
  HomeBriefEntityFocusType,
  HomeBriefMode,
  HomeBriefScope,
  HomeBriefTemplate,
  UserDailyBriefResponse,
} from '@/lib/api/usersApi'
import type {
  HomeActivityItem,
  HomeDashboardResponse,
  HomeNeedsAttentionGroup,
  HomeNeedsAttentionGroupKey,
  HomeRiskBand,
  HomeTaskSummary,
} from '@/types/home'
import DoughnutChart from '@/components/charts/DoughnutChart.vue'
import BarChart from '@/components/charts/BarChart.vue'
import TaskStatusIcon from '@/components/shared/TaskStatusIcon.vue'
import AIBriefWidget from '@/components/home/AIBriefWidget.vue'
import HomeEmptyState from '@/components/home/HomeEmptyState.vue'
import HomeKpiCard from '@/components/home/HomeKpiCard.vue'
import HomeSectionHeader from '@/components/home/HomeSectionHeader.vue'

type FocusFilter = 'all' | 'overdue' | 'in_progress' | 'in_review' | 'blocked'

type LocalHomeTask = {
  id: string
  title: string
  status: string
  priority: string
  product: string
  productId: string
  dueAt: string | null
  blockedReason: string | null
  ageDays: number
}

type HomeViewData = HomeDashboardResponse & {
  tasks: LocalHomeTask[]
  blockedTasks: LocalHomeTask[]
}

const props = defineProps<{
  organizationId: string | null
  homeScope: HomeScopeSelection
  dailyBriefEnabled: boolean
  briefLoading: boolean
  dailyBrief: UserDailyBriefResponse | null
  briefError: string | null
  briefMode: HomeBriefMode
  briefScope: HomeBriefScope
  briefProductId: string | null
  briefEntityType: HomeBriefEntityFocusType
  briefEntityId: string
  briefTemplate: HomeBriefTemplate
  briefProducts: Array<{ id: string; name: string }>
  allowAllProductsBriefScope: boolean
}>()

const emit = defineEmits<{
  (event: 'update:brief-mode', value: HomeBriefMode): void
  (event: 'update:brief-scope', value: HomeBriefScope): void
  (event: 'update:brief-product-id', value: string | null): void
  (event: 'update:brief-entity-type', value: HomeBriefEntityFocusType): void
  (event: 'update:brief-entity-id', value: string): void
  (event: 'update:brief-template', value: HomeBriefTemplate): void
}>()

const router = useRouter()
const authStore = useAuthStore()

const loading = ref(true)
const homeData = ref<HomeViewData | null>(null)
const taskFilter = ref<FocusFilter>('all')

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
})

const currentDateLabel = computed(() =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }),
)

const filteredTasks = computed(() => {
  if (!homeData.value) return []
  if (taskFilter.value === 'all') return homeData.value.tasks
  return homeData.value.tasks.filter((task) => task.status === taskFilter.value)
})

const upcomingDeadlineItems = computed(() => {
  if (!homeData.value) return []
  const withDueDate = homeData.value.upcomingDeadlines.filter((item) => Boolean(item.dueAt))
  return withDueDate.length > 0 ? withDueDate : homeData.value.upcomingDeadlines
})

const reviewSlaHitRate = computed(() => {
  if (!homeData.value) return 100
  const total = homeData.value.reviewQueueHealth.total
  if (total <= 0) return 100
  const safe = total - homeData.value.reviewQueueHealth.slaBreachCount
  return Math.max(0, Math.round((safe / total) * 100))
})

const personalWipLoadPct = computed(() => {
  if (!homeData.value) return 0
  const limit = homeData.value.personalWip.limit || 1
  return Math.round((homeData.value.personalWip.current / limit) * 100)
})

const riskBandOrder: HomeRiskBand[] = [
  'overdue',
  'due_today',
  'due_48h',
  'blocked',
  'unassigned_or_stalled',
]

const riskBandMeta: Record<HomeRiskBand, { label: string; color: string }> = {
  overdue: { label: 'Overdue', color: '#EF4444' },
  due_today: { label: 'Due Today', color: '#F97316' },
  due_48h: { label: 'Due In 48h', color: '#F59E0B' },
  blocked: { label: 'Blocked', color: '#8B5CF6' },
  unassigned_or_stalled: { label: 'Unassigned/Stalled', color: '#0EA5E9' },
}

const riskBandLabels = computed(() => riskBandOrder.map((band) => riskBandMeta[band].label))
const riskBandValues = computed(() => {
  if (!homeData.value) return riskBandOrder.map(() => 0)
  return riskBandOrder.map((band) => homeData.value?.riskTimeline.totalsByBand[band] || 0)
})
const riskBandColors = computed(() => riskBandOrder.map((band) => riskBandMeta[band].color))

const attentionGroups = computed(() => {
  if (!homeData.value) return [] as HomeNeedsAttentionGroup[]
  const groups = homeData.value.needsAttention.groups
  const keys: HomeNeedsAttentionGroupKey[] = ['overdue', 'blockedOwned', 'reviewWaiting', 'dueSoon', 'staleInProgress']
  return keys
    .map((key) => groups[key])
    .filter((group) => group.count > 0)
    .sort((a, b) => b.count - a.count)
})

const statusColorMap: Record<string, { color: string; label: string }> = {
  created: { color: '#D1D5DB', label: 'Created' },
  assigned: { color: '#0EA5E9', label: 'Assigned' },
  in_progress: { color: '#F59E0B', label: 'In Progress' },
  in_review: { color: '#8B5CF6', label: 'In Review' },
  done: { color: '#10B981', label: 'Done' },
  blocked: { color: '#EF4444', label: 'Blocked' },
  overdue: { color: '#DC2626', label: 'Overdue' },
  archived: { color: '#6B7280', label: 'Archived' },
}

const doughnutLabels = computed(() => {
  if (!homeData.value) return []
  return Object.keys(homeData.value.tasksByStatus).map((status) => statusColorMap[status]?.label || formatLabel(status))
})

const doughnutData = computed(() => {
  if (!homeData.value) return []
  return Object.values(homeData.value.tasksByStatus)
})

const doughnutColors = computed(() => {
  if (!homeData.value) return []
  return Object.keys(homeData.value.tasksByStatus).map((status) => statusColorMap[status]?.color || '#9CA3AF')
})

const statusEntries = computed(() => {
  if (!homeData.value || !homeData.value.totalTasks) return []
  const total = homeData.value.totalTasks
  return Object.entries(homeData.value.tasksByStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status,
      label: statusColorMap[status]?.label || formatLabel(status),
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: statusColorMap[status]?.color || '#9CA3AF',
    }))
})

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
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

function normalizeTaskSummary(task: unknown): HomeTaskSummary {
  const row = toRecord(task)
  const status = toText(row.status, 'created')
  const priority = toText(row.priority, 'medium')
  return {
    id: toText(row.id),
    title: toText(row.title, 'Untitled task'),
    status: status as HomeTaskSummary['status'],
    priority: priority as HomeTaskSummary['priority'],
    productId: toText(row.productId),
    product: toText(row.product, 'Unassigned product'),
    dueAt: toNullableText(row.dueAt),
    storyTitle: toText(row.storyTitle),
    blockedReason: toNullableText(row.blockedReason),
    assigneeCoverage: toText(row.assigneeCoverage, 'assigned') === 'unassigned' ? 'unassigned' : 'assigned',
    ageDays: toNumber(row.ageDays),
    updatedAt: toText(row.updatedAt, new Date().toISOString()),
  }
}

function normalizeHomePayload(payload: HomeDashboardResponse | null | undefined): HomeViewData {
  const raw = toRecord(payload)
  const actionScoreRaw = toRecord(raw.actionScore)
  const statsRaw = toRecord(raw.stats)
  const needsAttentionRaw = toRecord(raw.needsAttention)
  const groupsRaw = toRecord(needsAttentionRaw.groups)
  const riskTimelineRaw = toRecord(raw.riskTimeline)
  const reviewQueueRaw = toRecord(raw.reviewQueueHealth)
  const reviewBucketsRaw = toRecord(reviewQueueRaw.buckets)
  const personalWipRaw = toRecord(raw.personalWip)
  const personalByStatusRaw = toRecord(personalWipRaw.byStatus)
  const agingWorkRaw = toRecord(raw.agingWork)
  const agingBucketsRaw = toRecord(agingWorkRaw.buckets)
  const tasksByStatusRaw = toRecord(raw.tasksByStatus)
  const riskBands: HomeRiskBand[] = ['overdue', 'due_today', 'due_48h', 'blocked', 'unassigned_or_stalled']
  const riskTotalsByBandRaw = toRecord(riskTimelineRaw.totalsByBand)

  const normalizeGroup = (key: HomeNeedsAttentionGroupKey, fallbackLabel: string): HomeNeedsAttentionGroup => {
    const groupRaw = toRecord(groupsRaw[key])
    const tasksRaw = Array.isArray(groupRaw.tasks) ? groupRaw.tasks : []
    return {
      key,
      label: toText(groupRaw.label, fallbackLabel),
      count: toNumber(groupRaw.count),
      tasks: tasksRaw.map((task) => normalizeTaskSummary(task)),
    }
  }

  const normalizedPayload: HomeDashboardResponse = {
    actionScore: {
      current: toNumber(actionScoreRaw.current),
      target: toNumber(actionScoreRaw.target),
      delta: actionScoreRaw.delta == null ? null : toNumber(actionScoreRaw.delta),
      sampleSize: toNumber(actionScoreRaw.sampleSize),
      status: (() => {
        const status = toText(actionScoreRaw.status, 'healthy')
        return status === 'warning' || status === 'critical' ? status : 'healthy'
      })(),
      reasons: Array.isArray(actionScoreRaw.reasons)
        ? actionScoreRaw.reasons.map((reason) => {
          const row = toRecord(reason)
          return {
            key: toText(row.key),
            label: toText(row.label),
            count: toNumber(row.count),
            weight: toNumber(row.weight),
          }
        })
        : [],
    },
    stats: {
      totalAssigned: toNumber(statsRaw.totalAssigned),
      totalCompleted: toNumber(statsRaw.totalCompleted),
      completionRate: toNumber(statsRaw.completionRate),
      overdueItems: toNumber(statsRaw.overdueItems),
      blockedCount: toNumber(statsRaw.blockedCount),
      dueSoonCount: toNumber(statsRaw.dueSoonCount),
      reviewQueueCount: toNumber(statsRaw.reviewQueueCount),
      staleCount: toNumber(statsRaw.staleCount),
      activeCount: toNumber(statsRaw.activeCount),
    },
    needsAttention: {
      total: toNumber(needsAttentionRaw.total),
      groups: {
        overdue: normalizeGroup('overdue', 'Overdue'),
        blockedOwned: normalizeGroup('blockedOwned', 'Blocked (My Scope)'),
        reviewWaiting: normalizeGroup('reviewWaiting', 'Waiting For My Review'),
        dueSoon: normalizeGroup('dueSoon', 'Due In 48h'),
        staleInProgress: normalizeGroup('staleInProgress', 'Stale In Progress'),
      },
    },
    riskTimeline: {
      days: Array.isArray(riskTimelineRaw.days)
        ? riskTimelineRaw.days.map((day) => {
          const row = toRecord(day)
          return {
            date: toText(row.date),
            dayNum: toNumber(row.dayNum),
            dayName: toText(row.dayName),
            isToday: Boolean(row.isToday),
          }
        })
        : [],
      bands: Array.isArray(riskTimelineRaw.bands)
        ? (riskTimelineRaw.bands
          .filter((band): band is HomeRiskBand => (
            band === 'overdue'
            || band === 'due_today'
            || band === 'due_48h'
            || band === 'blocked'
            || band === 'unassigned_or_stalled'
          )))
        : riskBands,
      cells: Array.isArray(riskTimelineRaw.cells)
        ? riskTimelineRaw.cells.map((cell) => {
          const row = toRecord(cell)
          return {
            date: toText(row.date),
            band: (toText(row.band, 'overdue') as HomeRiskBand),
            count: toNumber(row.count),
          }
        })
        : [],
      totalsByBand: {
        overdue: toNumber(riskTotalsByBandRaw.overdue),
        due_today: toNumber(riskTotalsByBandRaw.due_today),
        due_48h: toNumber(riskTotalsByBandRaw.due_48h),
        blocked: toNumber(riskTotalsByBandRaw.blocked),
        unassigned_or_stalled: toNumber(riskTotalsByBandRaw.unassigned_or_stalled),
      },
    },
    upcomingDeadlines: Array.isArray(raw.upcomingDeadlines)
      ? raw.upcomingDeadlines.map((deadline) => {
        const row = toRecord(deadline)
        return {
          ...normalizeTaskSummary(deadline),
          type: 'task' as const,
          riskReason: toText(row.riskReason),
          suggestedAction: toText(row.suggestedAction),
          daysAtRisk: toNumber(row.daysAtRisk),
          reviewAgeHours: row.reviewAgeHours == null ? undefined : toNumber(row.reviewAgeHours),
        }
      })
      : [],
    reviewQueueHealth: {
      total: toNumber(reviewQueueRaw.total),
      slaTargetHours: toNumber(reviewQueueRaw.slaTargetHours),
      buckets: {
        lt24: toNumber(reviewBucketsRaw.lt24),
        between24And72: toNumber(reviewBucketsRaw.between24And72),
        gt72: toNumber(reviewBucketsRaw.gt72),
      },
      slaBreachCount: toNumber(reviewQueueRaw.slaBreachCount),
      items: Array.isArray(reviewQueueRaw.items)
        ? reviewQueueRaw.items.map((item) => {
          const row = toRecord(item)
          return {
            ...normalizeTaskSummary(item),
            reviewAgeHours: toNumber(row.reviewAgeHours),
          }
        })
        : [],
    },
    personalWip: {
      current: toNumber(personalWipRaw.current),
      limit: toNumber(personalWipRaw.limit),
      status: (() => {
        const status = toText(personalWipRaw.status, 'healthy')
        return status === 'warning' || status === 'over_limit' ? status : 'healthy'
      })(),
      byStatus: Object.fromEntries(
        Object.entries(personalByStatusRaw).map(([status, count]) => [status, toNumber(count)]),
      ),
    },
    agingWork: {
      buckets: {
        gt7: toNumber(agingBucketsRaw.gt7),
        gt14: toNumber(agingBucketsRaw.gt14),
        gt30: toNumber(agingBucketsRaw.gt30),
      },
      oldest: Array.isArray(agingWorkRaw.oldest)
        ? agingWorkRaw.oldest.map((task) => ({
          ...normalizeTaskSummary(task),
          ageDays: toNumber(toRecord(task).ageDays),
        }))
        : [],
    },
    tasksByStatus: Object.fromEntries(
      Object.entries(tasksByStatusRaw).map(([status, count]) => [status, toNumber(count)]),
    ),
    totalTasks: toNumber(raw.totalTasks),
    activities: Array.isArray(raw.activities)
      ? raw.activities.map((activity) => {
        const row = toRecord(activity)
        return {
          id: toText(row.id),
          productId: toNullableText(row.productId),
          userId: toNullableText(row.userId),
          userName: toText(row.userName, 'Unknown user'),
          userAvatar: toNullableText(row.userAvatar),
          action: toText(row.action, 'updated'),
          entityType: toText(row.entityType, 'task'),
          entityId: toNullableText(row.entityId),
          entityTitle: toText(row.entityTitle),
          changes: Array.isArray(row.changes)
            ? row.changes.map((change) => {
              const changeRow = toRecord(change)
              return {
                field: toText(changeRow.field),
                from: toNullableText(changeRow.from),
                to: toNullableText(changeRow.to),
              }
            })
            : null,
          createdAt: toText(row.createdAt, new Date().toISOString()),
        }
      })
      : [],
    generatedAt: toText(raw.generatedAt, new Date().toISOString()),
  }

  const taskMap = new Map<string, LocalHomeTask>()
  const blockedTaskMap = new Map<string, LocalHomeTask>()

  const pushTask = (task: Partial<HomeTaskSummary> | null | undefined) => {
    if (!task || typeof task.id !== 'string' || !task.id.trim()) return
    taskMap.set(task.id, {
      id: task.id,
      title: typeof task.title === 'string' && task.title.trim() ? task.title : 'Untitled task',
      status: typeof task.status === 'string' ? task.status : 'created',
      priority: typeof task.priority === 'string' ? task.priority : 'medium',
      product: typeof task.product === 'string' && task.product.trim() ? task.product : 'Unassigned product',
      productId: typeof task.productId === 'string' ? task.productId : '',
      dueAt: typeof task.dueAt === 'string' ? task.dueAt : null,
      blockedReason: typeof task.blockedReason === 'string' ? task.blockedReason : null,
      ageDays: typeof task.ageDays === 'number' ? task.ageDays : 0,
    })
  }

  const groups = normalizedPayload.needsAttention.groups
  if (groups) {
    const keys: HomeNeedsAttentionGroupKey[] = ['overdue', 'blockedOwned', 'reviewWaiting', 'dueSoon', 'staleInProgress']
    for (const key of keys) {
      for (const task of groups[key]?.tasks || []) {
        pushTask(task)
      }
    }
    for (const task of groups.blockedOwned?.tasks || []) {
      blockedTaskMap.set(task.id, {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        product: task.product,
        productId: task.productId,
        dueAt: task.dueAt,
        blockedReason: task.blockedReason,
        ageDays: task.ageDays,
      })
    }
  }

  for (const deadline of normalizedPayload.upcomingDeadlines || []) {
    pushTask(deadline)
  }

  return {
    ...normalizedPayload,
    tasks: Array.from(taskMap.values()),
    blockedTasks: Array.from(blockedTaskMap.values()),
  }
}

async function fetchHomeData() {
  if (!authStore.user?.id) return
  if (!props.organizationId) {
    homeData.value = null
    loading.value = false
    return
  }
  loading.value = true
  try {
    const payload = await usersApi.getHome(
      authStore.user.id,
      {
        organizationId: props.organizationId,
        scopeMode: props.homeScope.scopeMode,
        productId: props.homeScope.productId,
      },
      authStore.token,
    )
    homeData.value = normalizeHomePayload(payload)
  } catch {
    homeData.value = null
  } finally {
    loading.value = false
  }
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function priorityClass(priority: string): string {
  if (priority === 'critical') return 'bg-red-100 text-red-700'
  if (priority === 'high') return 'bg-orange-100 text-orange-700'
  if (priority === 'medium') return 'bg-emerald-100 text-emerald-700'
  if (priority === 'low') return 'bg-sky-100 text-sky-700'
  return 'bg-gray-100 text-gray-600'
}

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function formatDate(value: string | null): string {
  const parsed = parseDate(value)
  if (!parsed) return 'Due date TBD'
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDueMeta(task: Pick<LocalHomeTask, 'dueAt' | 'product'>): string {
  const product = task.product.trim().length > 0 ? task.product : 'Unknown product'
  return `${formatDate(task.dueAt)} • ${product}`
}

function formatRiskReason(reason: string, fallback: string): string {
  const primary = reason.trim()
  if (primary.length > 0) return primary
  const secondary = fallback.trim()
  if (secondary.length > 0) return secondary
  return 'Needs due-date clarification and owner follow-up.'
}

function formatRelativeTime(value: string): string {
  const now = new Date().getTime()
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return 'Recently'
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function isPastDue(value: string | null): boolean {
  const parsed = parseDate(value)
  if (!parsed) return false
  return parsed.getTime() < Date.now()
}

function setTaskFilter(value: string) {
  if (value === 'all' || value === 'overdue' || value === 'in_progress' || value === 'in_review' || value === 'blocked') {
    taskFilter.value = value
  }
}

function navigateToRoute(route: ReturnType<typeof buildHomeTaskRoute>) {
  if (!route) return
  router.push(route)
}

function navigateToTask(taskId: string | null | undefined) {
  navigateToRoute(buildHomeTaskRoute(taskId))
}

function navigateToUser(userId: string | null | undefined) {
  navigateToRoute(buildHomeUserRoute(userId))
}

function navigateToActivityEntity(activity: Pick<HomeActivityItem, 'entityType' | 'entityId'>) {
  navigateToRoute(buildHomeActivityEntityRoute(activity.entityType, activity.entityId))
}

function isTaskClickable(taskId: string | null | undefined): boolean {
  return Boolean(buildHomeTaskRoute(taskId))
}

function isUserClickable(userId: string | null | undefined): boolean {
  return Boolean(buildHomeUserRoute(userId))
}

function isActivityClickable(activity: Pick<HomeActivityItem, 'entityType' | 'entityId'>): boolean {
  return Boolean(buildHomeActivityEntityRoute(activity.entityType, activity.entityId))
}

function getInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed
    .split(/\s+/)
    .map((chunk) => chunk[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

watch(
  () => [
    authStore.user?.id,
    authStore.token,
    props.organizationId,
    props.homeScope.scopeMode,
    props.homeScope.productId,
  ],
  () => {
    fetchHomeData()
  },
  { immediate: true },
)
</script>

<template>
  <div class="h-full bg-[#F8FAFF]">
    <div class="w-full space-y-4 p-3 sm:p-4 lg:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">
            {{ greeting }}, {{ authStore.user?.name?.split(' ')[0] || 'there' }}
          </h1>
          <p class="mt-0.5 text-sm text-gray-400">Your execution summary for today</p>
        </div>
        <div class="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
          <Clock3 :size="16" class="text-gray-400" />
          <span class="text-sm font-medium text-gray-700">{{ currentDateLabel }}</span>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-20">
        <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
      </div>

      <template v-else-if="homeData">
        <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <HomeKpiCard
            label="Action Score"
            :value="`${homeData.actionScore.current}%`"
            :detail="`${homeData.actionScore.status.toUpperCase()} • target ${homeData.actionScore.target}%`"
            tone="primary"
          >
            <template #icon><Gauge :size="13" /></template>
          </HomeKpiCard>

          <HomeKpiCard
            label="Overdue"
            :value="homeData.stats.overdueItems"
            detail="Past due active work items"
            tone="danger"
          >
            <template #icon><AlertTriangle :size="13" /></template>
          </HomeKpiCard>

          <HomeKpiCard
            label="Due In 48h"
            :value="homeData.stats.dueSoonCount"
            detail="Upcoming deadline pressure"
            tone="warning"
          >
            <template #icon><CalendarClock :size="13" /></template>
          </HomeKpiCard>

          <HomeKpiCard
            label="Review SLA Breaches"
            :value="homeData.reviewQueueHealth.slaBreachCount"
            :detail="`${reviewSlaHitRate}% SLA hit rate`"
            tone="purple"
          >
            <template #icon><ShieldAlert :size="13" /></template>
          </HomeKpiCard>

          <HomeKpiCard
            label="Personal WIP"
            :value="`${homeData.personalWip.current}/${homeData.personalWip.limit}`"
            :detail="`${personalWipLoadPct}% of configured capacity`"
            :tone="personalWipLoadPct > 100 ? 'danger' : personalWipLoadPct > 80 ? 'warning' : 'success'"
          >
            <template #icon><ListChecks :size="13" /></template>
          </HomeKpiCard>

          <HomeKpiCard
            label="Stale In Progress"
            :value="homeData.stats.staleCount"
            detail="Long-running work requiring nudges"
            tone="warning"
          >
            <template #icon><TimerReset :size="13" /></template>
          </HomeKpiCard>
        </section>

        <AIBriefWidget
          v-if="props.dailyBriefEnabled"
          :loading="props.briefLoading"
          :brief="props.dailyBrief"
          :error-message="props.briefError"
          :mode="props.briefMode"
          :scope="props.briefScope"
          :product-id="props.briefProductId"
          :entity-type="props.briefEntityType"
          :entity-id="props.briefEntityId"
          :template="props.briefTemplate"
          :products="props.briefProducts"
          :allow-all-products-scope="props.allowAllProductsBriefScope"
          @update:mode="emit('update:brief-mode', $event)"
          @update:scope="emit('update:brief-scope', $event)"
          @update:product-id="emit('update:brief-product-id', $event)"
          @update:entity-type="emit('update:brief-entity-type', $event)"
          @update:entity-id="emit('update:brief-entity-id', $event)"
          @update:template="emit('update:brief-template', $event)"
        />

        <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Execution Pressure"
              description="Risk mix across overdue, due soon, blocked, and stalled work."
            />
            <BarChart
              :labels="riskBandLabels"
              :datasets="[
                {
                  label: 'Tasks',
                  data: riskBandValues,
                  backgroundColor: riskBandColors,
                },
              ]"
              :height="220"
              :show-legend="false"
            />
          </div>

          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Upcoming Deadlines"
              description="Focus window for this week and near-term due items."
            />
            <div v-if="upcomingDeadlineItems.length > 0" class="space-y-2">
              <button
                v-for="item in upcomingDeadlineItems.slice(0, 8)"
                :key="item.id"
                type="button"
                class="w-full rounded-lg border border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
                @click="navigateToTask(item.id)"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium text-gray-800">{{ item.title }}</p>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize" :class="priorityClass(item.priority)">
                    {{ item.priority }}
                  </span>
                </div>
                <p class="mt-1 truncate text-xs text-gray-500">{{ formatRiskReason(item.riskReason, item.suggestedAction) }}</p>
                <p class="mt-1 text-[11px]" :class="isPastDue(item.dueAt) ? 'text-red-600' : 'text-gray-400'">
                  {{ formatDueMeta(item) }}
                </p>
              </button>
            </div>
            <HomeEmptyState v-else message="No upcoming deadlines in the current horizon." />
          </div>
        </section>

        <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Quality & Review"
              description="Review queue SLA distribution and waiting review backlog."
            />
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">&lt;24h</p>
                <p class="text-lg font-semibold text-gray-800">{{ homeData.reviewQueueHealth.buckets.lt24 }}</p>
              </div>
              <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">24-72h</p>
                <p class="text-lg font-semibold text-gray-800">{{ homeData.reviewQueueHealth.buckets.between24And72 }}</p>
              </div>
              <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">&gt;72h</p>
                <p class="text-lg font-semibold text-red-600">{{ homeData.reviewQueueHealth.buckets.gt72 }}</p>
              </div>
            </div>
            <div class="mt-3 flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
              <span class="text-gray-500">SLA target</span>
              <span class="font-semibold text-gray-800">{{ homeData.reviewQueueHealth.slaTargetHours }}h</span>
            </div>
          </div>

          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Review Queue Items"
              description="Tasks currently waiting on your review lane."
            />
            <div v-if="homeData.reviewQueueHealth.items.length > 0" class="space-y-2">
              <button
                v-for="item in homeData.reviewQueueHealth.items.slice(0, 8)"
                :key="item.id"
                type="button"
                class="w-full rounded-lg border border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
                @click="navigateToTask(item.id)"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium text-gray-800">{{ item.title }}</p>
                  <span class="text-[11px]" :class="item.reviewAgeHours > homeData.reviewQueueHealth.slaTargetHours ? 'text-red-600 font-semibold' : 'text-gray-400'">
                    {{ item.reviewAgeHours }}h
                  </span>
                </div>
                <p class="mt-1 text-[11px] text-gray-400">{{ item.product }}</p>
              </button>
            </div>
            <HomeEmptyState v-else message="No tasks in review queue right now." />
          </div>
        </section>

        <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Flow Hygiene"
              description="Aging distribution highlights where work is getting stuck."
            />
            <div class="grid grid-cols-3 gap-2">
              <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">&gt;7d</p>
                <p class="text-lg font-semibold text-gray-800">{{ homeData.agingWork.buckets.gt7 }}</p>
              </div>
              <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">&gt;14d</p>
                <p class="text-lg font-semibold text-amber-700">{{ homeData.agingWork.buckets.gt14 }}</p>
              </div>
              <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">&gt;30d</p>
                <p class="text-lg font-semibold text-red-600">{{ homeData.agingWork.buckets.gt30 }}</p>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="[status, count] in Object.entries(homeData.personalWip.byStatus)"
                :key="status"
                class="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600"
              >
                {{ formatLabel(status) }}: {{ count }}
              </span>
            </div>
          </div>

          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Oldest Active Work"
              description="The oldest tasks are the strongest candidates for unblock/split actions."
            />
            <div v-if="homeData.agingWork.oldest.length > 0" class="space-y-2">
              <button
                v-for="task in homeData.agingWork.oldest.slice(0, 8)"
                :key="task.id"
                type="button"
                class="w-full rounded-lg border border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
                @click="navigateToTask(task.id)"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium text-gray-800">{{ task.title }}</p>
                  <span class="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    {{ task.ageDays }}d
                  </span>
                </div>
                <p class="mt-1 text-[11px] text-gray-400">{{ task.product }}</p>
              </button>
            </div>
            <HomeEmptyState v-else message="No aging tasks beyond baseline thresholds." />
          </div>
        </section>

        <section class="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Task Status Mix"
              description="Distribution across current lifecycle states."
            />
            <DoughnutChart
              :labels="doughnutLabels"
              :data="doughnutData"
              :colors="doughnutColors"
              :center-value="homeData.totalTasks"
              center-label="Tasks"
              :height="210"
            />
            <div class="mt-3 space-y-1.5">
              <div v-for="entry in statusEntries" :key="entry.status" class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: entry.color }"></span>
                  <span class="text-gray-600">{{ entry.label }}</span>
                </div>
                <span class="text-gray-400">{{ entry.count }} ({{ entry.pct }}%)</span>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Needs Attention"
              description="Breakdown by urgency category and queue type."
            />
            <div v-if="attentionGroups.length > 0" class="space-y-2">
              <div
                v-for="group in attentionGroups"
                :key="group.key"
                class="rounded-lg border border-gray-100 px-3 py-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-medium text-gray-800">{{ group.label }}</p>
                  <span class="rounded-full bg-[#4857FE]/10 px-2 py-0.5 text-[10px] font-semibold text-[#4857FE]">
                    {{ group.count }}
                  </span>
                </div>
                <p class="mt-1 truncate text-[11px] text-gray-400">
                  {{ group.tasks[0]?.title || 'No task preview' }}
                </p>
              </div>
            </div>
            <HomeEmptyState v-else message="No immediate risk clusters at the moment." />
          </div>

          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="My Focus Queue"
              description="Filter your immediate task queue by work state."
            >
              <template #actions>
                <button
                  type="button"
                  class="text-xs font-medium text-[#4857FE] hover:underline"
                  @click="router.push('/tasks')"
                >
                  Open full list
                </button>
              </template>
            </HomeSectionHeader>
            <div class="mb-2 flex flex-wrap gap-1.5">
              <button
                v-for="filter in ['all', 'overdue', 'in_progress', 'in_review', 'blocked']"
                :key="filter"
                type="button"
                class="rounded-full border px-2 py-1 text-[11px]"
                :class="taskFilter === filter ? 'border-[#4857FE] bg-[#4857FE] text-white' : 'border-gray-200 bg-white text-gray-600'"
                @click="setTaskFilter(filter)"
              >
                {{ formatLabel(filter) }}
              </button>
            </div>
            <div v-if="filteredTasks.length > 0" class="space-y-2">
              <button
                v-for="task in filteredTasks.slice(0, 8)"
                :key="task.id"
                type="button"
                class="w-full rounded-lg border border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
                :disabled="!isTaskClickable(task.id)"
                @click="navigateToTask(task.id)"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium text-gray-800">{{ task.title }}</p>
                  <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize" :class="priorityClass(task.priority)">
                    {{ task.priority }}
                  </span>
                </div>
                <div class="mt-1.5 flex items-center justify-between text-[11px] text-gray-400">
                  <span class="inline-flex items-center gap-1">
                    <TaskStatusIcon :status="task.status as any" class="h-3.5 w-3.5" />
                    {{ formatLabel(task.status) }}
                  </span>
                  <span :class="isPastDue(task.dueAt) ? 'font-semibold text-red-600' : ''">{{ formatDate(task.dueAt) }}</span>
                </div>
              </button>
            </div>
            <HomeEmptyState v-else message="No tasks in this focus filter." />
          </div>
        </section>

        <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Recent Activity"
              description="Latest updates linked to your task and review scope."
            />
            <div v-if="homeData.activities.length > 0" class="space-y-2">
              <div
                v-for="activity in homeData.activities.slice(0, 10)"
                :key="activity.id"
                class="rounded-lg border border-gray-100 px-3 py-2"
              >
                <div class="flex items-start gap-2.5">
                  <button
                    type="button"
                    class="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-gray-100 bg-gray-100"
                    :disabled="!isUserClickable(activity.userId)"
                    @click="navigateToUser(activity.userId)"
                  >
                    <img v-if="activity.userAvatar" :src="activity.userAvatar" class="h-full w-full object-cover" />
                    <span v-else class="inline-flex h-full w-full items-center justify-center text-[10px] font-semibold text-gray-500">
                      {{ getInitials(activity.userName) }}
                    </span>
                  </button>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-gray-700">
                      <button
                        type="button"
                        class="font-semibold text-gray-800 hover:text-[#4857FE] disabled:hover:text-gray-800"
                        :disabled="!isUserClickable(activity.userId)"
                        @click="navigateToUser(activity.userId)"
                      >
                        {{ activity.userName }}
                      </button>
                      <span class="mx-1 text-gray-400">{{ activity.action }}</span>
                      <button
                        type="button"
                        class="font-medium text-gray-700 hover:text-[#4857FE] disabled:hover:text-gray-700"
                        :disabled="!isActivityClickable(activity)"
                        @click="navigateToActivityEntity(activity)"
                      >
                        {{ activity.entityTitle || formatLabel(activity.entityType) }}
                      </button>
                    </p>
                    <p class="text-[11px] text-gray-400">{{ formatRelativeTime(activity.createdAt) }}</p>
                  </div>
                </div>
              </div>
            </div>
            <HomeEmptyState v-else message="No recent activity available." />
          </div>

          <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <HomeSectionHeader
              title="Blockers"
              description="Blocked tasks in your ownership/review scope."
            />
            <div v-if="homeData.blockedTasks.length > 0" class="space-y-2">
              <button
                v-for="task in homeData.blockedTasks.slice(0, 10)"
                :key="task.id"
                type="button"
                class="w-full rounded-lg border border-gray-100 px-3 py-2 text-left hover:bg-red-50/30"
                :disabled="!isTaskClickable(task.id)"
                @click="navigateToTask(task.id)"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium text-gray-800">{{ task.title }}</p>
                  <span class="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Blocked</span>
                </div>
                <p class="mt-1 truncate text-[11px] text-gray-500">{{ task.blockedReason || 'No blocker reason provided' }}</p>
                <p class="mt-1 text-[11px] text-gray-400">{{ task.product }}</p>
              </button>
            </div>
            <HomeEmptyState v-else message="No blocked tasks in your current scope." />
          </div>
        </section>
      </template>

      <div v-else class="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500">
        Unable to load homepage KPIs right now.
      </div>
    </div>
  </div>
</template>
