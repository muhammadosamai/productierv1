<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Filter,
  Gauge,
  Loader2,
  Users,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { metricsApi } from '@/lib/api'
import { ApiError, organizationTeamsApi, productsApi, type ApiOrganizationTeam } from '@/lib/apiClient'
import type { HomeScopeSelection } from '@/composables/useHomeScope'
import type {
  HomeBriefEntityFocusType,
  HomeBriefMode,
  HomeBriefScope,
  HomeBriefTemplate,
  UserDailyBriefResponse,
} from '@/lib/api/usersApi'
import type {
  BlockersMetricsResponse,
  DashboardMetricsResponse,
  QualityMetricsResponse,
  ThroughputMetricsResponse,
  WorkloadMetricsResponse,
} from '@/types/metrics'
import BarChart from '@/components/charts/BarChart.vue'
import LineChart from '@/components/charts/LineChart.vue'
import AIBriefWidget from '@/components/home/AIBriefWidget.vue'
import HomeEmptyState from '@/components/home/HomeEmptyState.vue'
import HomeKpiCard from '@/components/home/HomeKpiCard.vue'
import HomeSectionHeader from '@/components/home/HomeSectionHeader.vue'

const props = withDefaults(defineProps<{
  organizationId: string | null
  homeScope: HomeScopeSelection
  selectedMemberIds: string[]
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
  embedded?: boolean
}>(), {
  embedded: false,
})

const emit = defineEmits<{
  (event: 'update:selected-member-ids', value: string[]): void
  (event: 'update:brief-mode', value: HomeBriefMode): void
  (event: 'update:brief-scope', value: HomeBriefScope): void
  (event: 'update:brief-product-id', value: string | null): void
  (event: 'update:brief-entity-type', value: HomeBriefEntityFocusType): void
  (event: 'update:brief-entity-id', value: string): void
  (event: 'update:brief-template', value: HomeBriefTemplate): void
}>()

const authStore = useAuthStore()

interface TeamScopeMember {
  userId: string
  userName: string
}

const members = ref<TeamScopeMember[]>([])
const workload = ref<WorkloadMetricsResponse | null>(null)
const dashboard = ref<DashboardMetricsResponse | null>(null)
const blockers = ref<BlockersMetricsResponse | null>(null)
const quality = ref<QualityMetricsResponse | null>(null)
const throughput = ref<ThroughputMetricsResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const scopeTeamsLoading = ref(false)
const availableScopeTeams = ref<ApiOrganizationTeam[]>([])
const selectedScopeTeamId = ref<string | null>(null)

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return [...new Set(normalized)]
}

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

function normalizeWorkloadResponse(payload: WorkloadMetricsResponse): WorkloadMetricsResponse {
  const raw = (payload ?? {}) as WorkloadMetricsResponse
  const normalizeMember = (member: any) => ({
    ...member,
    id: toText(member?.id),
    name: toText(member?.name, 'Unknown'),
    wipCount: toNumber(member?.wipCount),
    capacity: toNumber(member?.capacity),
    loadRatio: toNumber(member?.loadRatio),
    overdueCount: toNumber(member?.overdueCount),
    completionRate: toNumber(member?.completionRate),
    completedCount: toNumber(member?.completedCount),
    overdueTasks: Array.isArray(member?.overdueTasks)
      ? member.overdueTasks.map((task: any) => ({
        ...task,
        taskId: toText(task?.taskId),
        title: toText(task?.title, 'Untitled task'),
        daysOverdue: toNumber(task?.daysOverdue),
      }))
      : [],
  })
  return {
    ...raw,
    memberWorkload: Array.isArray(raw.memberWorkload) ? raw.memberWorkload.map((member) => normalizeMember(member)) : [],
    overloaded: Array.isArray(raw.overloaded) ? raw.overloaded.map((member) => normalizeMember(member)) : [],
    idle: Array.isArray(raw.idle) ? raw.idle.map((member) => normalizeMember(member)) : [],
    overloadThreshold: toNumber(raw.overloadThreshold),
    totalMembers: toNumber(raw.totalMembers),
    loadBalanceIndex: toNumber(raw.loadBalanceIndex),
  }
}

function normalizeDashboardResponse(payload: DashboardMetricsResponse): DashboardMetricsResponse {
  const raw = (payload ?? {}) as DashboardMetricsResponse
  return {
    ...raw,
    atRiskWork: {
      ...(raw.atRiskWork ?? { total: 0, delta: 0, byCategory: { overdue: 0, blocked: 0, agingWip: 0, missingOwner: 0, missingReviewer: 0 }, trend: [] }),
      total: toNumber(raw.atRiskWork?.total),
      byCategory: {
        ...(raw.atRiskWork?.byCategory ?? {}),
        overdue: toNumber(raw.atRiskWork?.byCategory?.overdue),
        blocked: toNumber(raw.atRiskWork?.byCategory?.blocked),
        agingWip: toNumber(raw.atRiskWork?.byCategory?.agingWip),
        missingOwner: toNumber(raw.atRiskWork?.byCategory?.missingOwner),
        missingReviewer: toNumber(raw.atRiskWork?.byCategory?.missingReviewer),
      },
      trend: Array.isArray(raw.atRiskWork?.trend)
        ? raw.atRiskWork.trend.map((point) => ({
          ...point,
          date: toText(point.date),
          total: toNumber(point.total),
          blocked: toNumber(point.blocked),
          overdue: toNumber(point.overdue),
          agingWip: toNumber(point.agingWip),
          missingOwner: toNumber(point.missingOwner),
          missingReviewer: toNumber(point.missingReviewer),
        }))
        : [],
    },
  }
}

function normalizeBlockersResponse(payload: BlockersMetricsResponse): BlockersMetricsResponse {
  const raw = (payload ?? {}) as BlockersMetricsResponse
  return {
    ...raw,
    currentlyBlocked: Array.isArray(raw.currentlyBlocked)
      ? raw.currentlyBlocked.map((task) => ({
        ...task,
        taskId: toText(task.taskId),
        title: toText(task.title, 'Untitled task'),
        blockedDays: toNumber(task.blockedDays),
        assignee: task.assignee
          ? {
            ...task.assignee,
            userId: task.assignee.userId || null,
            name: toText(task.assignee.name, 'Unassigned'),
          }
          : null,
      }))
      : [],
    blockedTrend: Array.isArray(raw.blockedTrend)
      ? raw.blockedTrend.map((point) => ({
        ...point,
        date: toText(point.date),
        count: toNumber(point.count),
      }))
      : [],
  }
}

function normalizeQualityResponse(payload: QualityMetricsResponse): QualityMetricsResponse {
  const raw = (payload ?? {}) as QualityMetricsResponse
  return {
    ...raw,
    firstPassRate: toNumber(raw.firstPassRate),
    reworkRate: toNumber(raw.reworkRate),
    reopenRate: toNumber(raw.reopenRate),
    escapedDefects: toNumber(raw.escapedDefects),
    reviewLoad: Array.isArray(raw.reviewLoad)
      ? raw.reviewLoad.map((row) => ({
        ...row,
        userId: toText(row.userId),
        name: toText(row.name, 'Unknown'),
        count: toNumber(row.count),
      }))
      : [],
    weeklyOutcomes: Array.isArray(raw.weeklyOutcomes)
      ? raw.weeklyOutcomes.map((point) => ({
        ...point,
        bucket: toText(point.bucket),
        firstPass: toNumber(point.firstPass),
        reopened: toNumber(point.reopened),
        escaped: toNumber(point.escaped),
      }))
      : [],
  }
}

function normalizeThroughputResponse(payload: ThroughputMetricsResponse): ThroughputMetricsResponse {
  const raw = (payload ?? {}) as ThroughputMetricsResponse
  return {
    ...raw,
    totalCompleted: toNumber(raw.totalCompleted),
    completedOverTime: Array.isArray(raw.completedOverTime)
      ? raw.completedOverTime.map((point) => ({
        ...point,
        date: toText(point.date),
        completed: toNumber(point.completed),
        netFlow: toNumber(point.netFlow),
      }))
      : [],
  }
}

const canManageAllTeams = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase()
  return role === 'super_admin' || role === 'admin' || role === 'product_admin' || role === 'product_manager'
})

const containerClass = computed(() =>
  props.embedded ? 'h-full p-2 sm:p-3 lg:p-4' : 'p-3 sm:p-4 lg:p-5',
)

const teamScopeOptions = computed(() => {
  const userId = authStore.user?.id || ''
  const teams = availableScopeTeams.value.filter((team) => {
    if (canManageAllTeams.value) return true
    const leadUserIds = Array.isArray(team.leadUserIds)
      ? team.leadUserIds.filter((entry): entry is string => typeof entry === 'string')
      : []
    const isLead = team.leadUserId === userId || leadUserIds.includes(userId)
    const isMember = Array.isArray(team.members)
      && team.members.some((member) => member?.userId === userId)
    return isLead || isMember
  })
  return [...teams].sort((a, b) => a.name.localeCompare(b.name))
})

const selectedScopeTeamName = computed(() =>
  teamScopeOptions.value.find((team) => team.id === selectedScopeTeamId.value)?.name || '',
)

const effectiveScope = computed(() => {
  if (selectedScopeTeamId.value) {
    return {
      scopeMode: 'team' as const,
      productId: null,
      teamId: selectedScopeTeamId.value,
    }
  }
  return {
    scopeMode: props.homeScope.scopeMode,
    productId: props.homeScope.productId,
    teamId: null,
  }
})

const effectiveScopeSummary = computed(() => {
  if (effectiveScope.value.scopeMode === 'team') {
    return selectedScopeTeamName.value
      ? `Scoped to team: ${selectedScopeTeamName.value}`
      : 'Select a team to apply team scope.'
  }
  if (effectiveScope.value.scopeMode === 'product') {
    return 'Using the current Home global product scope.'
  }
  return 'Using the current Home global all-products scope.'
})

const allMemberIds = computed(() => members.value.map((member) => member.userId))
const explicitSelectedIds = computed(() => normalizeIds(props.selectedMemberIds))

const effectiveSelectedIds = computed(() => {
  if (explicitSelectedIds.value.length === 0) return allMemberIds.value
  const allowed = new Set(allMemberIds.value)
  return explicitSelectedIds.value.filter((id) => allowed.has(id))
})

const selectedIdSet = computed(() => new Set(effectiveSelectedIds.value))
const selectedMembers = computed(() => members.value.filter((member) => selectedIdSet.value.has(member.userId)))
const selectedMemberNames = computed(() => new Set(selectedMembers.value.map((member) => member.userName)))
const allMembersSelected = computed(() =>
  explicitSelectedIds.value.length === 0 || effectiveSelectedIds.value.length === allMemberIds.value.length,
)

const filteredWorkloadMembers = computed(() => {
  const rows = workload.value?.memberWorkload || []
  return rows.filter((member) => selectedIdSet.value.has(member.id))
})

const filteredBlockedTasks = computed(() => {
  const rows = blockers.value?.currentlyBlocked || []
  if (allMembersSelected.value) return rows
  return rows.filter((task) => {
    const assignee = task.assignee
    if (assignee?.userId) return selectedIdSet.value.has(assignee.userId)
    if (assignee?.name) return selectedMemberNames.value.has(assignee.name)
    return false
  })
})

const capacityKpis = computed(() => {
  const rows = filteredWorkloadMembers.value
  const selectedCount = rows.length
  const overloaded = rows.filter((member) => member.loadRatio > 1).length
  const idle = rows.filter((member) => member.loadRatio < 0.45).length
  const totalWip = rows.reduce((sum, member) => sum + member.wipCount, 0)
  const totalCapacity = rows.reduce((sum, member) => sum + member.capacity, 0)
  const utilizationPct = totalCapacity > 0 ? Math.round((totalWip / totalCapacity) * 100) : 0
  const mean = selectedCount > 0 ? rows.reduce((sum, member) => sum + member.loadRatio, 0) / selectedCount : 0
  const variance = selectedCount > 0
    ? rows.reduce((sum, member) => sum + (member.loadRatio - mean) ** 2, 0) / selectedCount
    : 0
  const std = Math.sqrt(variance)
  const balanceIndex = Math.max(0, Math.min(100, Math.round((1 - Math.min(1, std)) * 100)))
  return { selectedCount, overloaded, idle, utilizationPct, balanceIndex }
})

const executionKpis = computed(() => {
  const rows = filteredWorkloadMembers.value
  const blockedCount = filteredBlockedTasks.value.length
  const overdueCount = rows.reduce((sum, member) => sum + member.overdueCount, 0)
  const duePressureCount = rows.filter((member) => member.loadRatio >= 0.85 || member.overdueCount > 0).length
  const completionRate = rows.length > 0
    ? Math.round(rows.reduce((sum, member) => sum + member.completionRate, 0) / rows.length)
    : 0
  return { blockedCount, overdueCount, duePressureCount, completionRate }
})

const dashboardAtRiskTotal = computed(() => dashboard.value?.atRiskWork.total ?? 0)

const qualityKpis = computed(() => ({
  firstPassRate: quality.value?.firstPassRate ?? 0,
  reworkRate: quality.value?.reworkRate ?? 0,
  reopenRate: quality.value?.reopenRate ?? 0,
  escapedDefects: quality.value?.escapedDefects ?? 0,
}))

const flowKpis = computed(() => {
  const points = throughput.value?.completedOverTime || []
  const totalCompleted = throughput.value?.totalCompleted ?? 0
  const averageCompleted = points.length > 0
    ? Number((points.reduce((sum, point) => sum + point.completed, 0) / points.length).toFixed(1))
    : 0
  const latestNetFlow = points.length > 0 ? points[points.length - 1]?.netFlow ?? 0 : 0
  return { totalCompleted, averageCompleted, latestNetFlow }
})

const reviewLoadByUserId = computed(() => {
  const map = new Map<string, number>()
  for (const row of quality.value?.reviewLoad || []) {
    map.set(row.userId, row.count)
  }
  return map
})

const selectedThroughputShare = computed(() => {
  const totalCompleted = workload.value?.memberWorkload.reduce((sum, member) => sum + member.completedCount, 0) || 0
  if (totalCompleted <= 0) return 1
  const selectedCompleted = filteredWorkloadMembers.value.reduce((sum, member) => sum + member.completedCount, 0)
  return Math.max(0, Math.min(1, selectedCompleted / totalCompleted))
})

const chartMembers = computed(() => {
  return [...filteredWorkloadMembers.value]
    .sort((a, b) => b.wipCount - a.wipCount)
    .slice(0, 10)
})

const overduePreview = computed(() => {
  const list: Array<{ taskId: string; title: string; assignee: string; daysOverdue: number }> = []
  for (const member of filteredWorkloadMembers.value) {
    for (const task of member.overdueTasks) {
      list.push({
        taskId: task.taskId,
        title: task.title,
        assignee: member.name,
        daysOverdue: task.daysOverdue,
      })
    }
  }
  return list
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 10)
})

const blockersTrend = computed(() => ({
  labels: (blockers.value?.blockedTrend || []).map((point) => point.date),
  values: (blockers.value?.blockedTrend || []).map((point) => point.count),
}))

const throughputTrend = computed(() => {
  const points = throughput.value?.completedOverTime || []
  return {
    labels: points.map((point) => point.date),
    productCompleted: points.map((point) => point.completed),
    selectedEstimate: points.map((point) => Number((point.completed * selectedThroughputShare.value).toFixed(1))),
  }
})

const qualityTrend = computed(() => {
  const points = quality.value?.weeklyOutcomes || []
  return {
    labels: points.map((point) => point.bucket),
    firstPass: points.map((point) => point.firstPass),
    reopened: points.map((point) => point.reopened),
    escaped: points.map((point) => point.escaped),
  }
})

const filteredReviewLoad = computed(() => {
  const rows = quality.value?.reviewLoad || []
  if (allMembersSelected.value) return rows
  return rows.filter((row) => selectedIdSet.value.has(row.userId))
})

function emitSelected(next: string[]) {
  const normalized = normalizeIds(next)
  if (normalized.length === 0 || normalized.length === allMemberIds.value.length) {
    emit('update:selected-member-ids', [])
    return
  }
  emit('update:selected-member-ids', normalized)
}

function clearFilter() {
  emit('update:selected-member-ids', [])
}

function clearTeamScope() {
  selectedScopeTeamId.value = null
}

function toggleMember(userId: string) {
  const base = explicitSelectedIds.value.length === 0 ? [...allMemberIds.value] : [...explicitSelectedIds.value]
  const next = new Set(base)
  if (next.has(userId)) next.delete(userId)
  else next.add(userId)
  emitSelected([...next])
}

function sanitizeSelectedScopeTeam() {
  if (!selectedScopeTeamId.value) return
  const available = new Set(teamScopeOptions.value.map((team) => team.id))
  if (!available.has(selectedScopeTeamId.value)) {
    selectedScopeTeamId.value = null
  }
}

async function fetchTeamScopeOptions() {
  const organizationId = typeof props.organizationId === 'string' ? props.organizationId.trim() : ''
  if (!organizationId || !authStore.token) {
    availableScopeTeams.value = []
    selectedScopeTeamId.value = null
    return
  }

  scopeTeamsLoading.value = true
  try {
    const payload = await organizationTeamsApi.list(
      organizationId,
      { includeMembers: true },
      authStore.token,
    )
    availableScopeTeams.value = Array.isArray(payload) ? payload : []
  } catch {
    availableScopeTeams.value = []
  } finally {
    scopeTeamsLoading.value = false
    sanitizeSelectedScopeTeam()
  }
}

async function fetchTeamSummary() {
  loading.value = true
  error.value = null
  try {
    if (effectiveScope.value.scopeMode === 'product' && !effectiveScope.value.productId) {
      members.value = []
      workload.value = null
      dashboard.value = null
      blockers.value = null
      quality.value = null
      throughput.value = null
      return
    }

    const organizationId = typeof props.organizationId === 'string' ? props.organizationId.trim() : ''
    const scopeQuery = {
      organizationId: organizationId || undefined,
      scopeMode: effectiveScope.value.scopeMode,
      productId: effectiveScope.value.productId,
      teamId: effectiveScope.value.teamId,
    }
    const shouldFetchProductMembers = scopeQuery.scopeMode === 'product' && Boolean(scopeQuery.productId)
    const productScopeId = shouldFetchProductMembers ? scopeQuery.productId : null

    const [memberRows, workloadData, dashboardData, blockersData, qualityData, throughputData] = await Promise.all([
      productScopeId && organizationId
        ? productsApi.getMembers(organizationId, productScopeId, authStore.token)
        : Promise.resolve([]),
      metricsApi.workload({ ...scopeQuery, period: '30' }, authStore.token),
      metricsApi.dashboard({ ...scopeQuery, period: '30' }, authStore.token),
      metricsApi.blockers({ ...scopeQuery, period: '30' }, authStore.token),
      metricsApi.quality({ ...scopeQuery, period: '30' }, authStore.token),
      metricsApi.throughput({ ...scopeQuery, period: '30', granularity: 'week' }, authStore.token),
    ])

    const normalizedWorkload = normalizeWorkloadResponse(workloadData)
    const fallbackMembers = normalizedWorkload.memberWorkload.map((member) => ({
      userId: member.id,
      userName: member.name,
    }))
    const normalizedMembers = memberRows.length > 0
      ? memberRows.map((member) => ({
        userId: member.userId,
        userName: member.userName,
      }))
      : fallbackMembers
    const deduped = new Map<string, TeamScopeMember>()
    for (const member of normalizedMembers) {
      if (!deduped.has(member.userId)) {
        deduped.set(member.userId, member)
      }
    }

    members.value = [...deduped.values()]
    workload.value = normalizedWorkload
    dashboard.value = normalizeDashboardResponse(dashboardData)
    blockers.value = normalizeBlockersResponse(blockersData)
    quality.value = normalizeQualityResponse(qualityData)
    throughput.value = normalizeThroughputResponse(throughputData)
  } catch (err) {
    members.value = []
    workload.value = null
    dashboard.value = null
    blockers.value = null
    quality.value = null
    throughput.value = null
    if (err instanceof ApiError) {
      error.value = err.message || 'Unable to load team summary.'
    } else {
      error.value = 'Unable to load team summary.'
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [
    props.organizationId,
    authStore.token,
  ],
  () => {
    fetchTeamScopeOptions()
  },
  { immediate: true },
)

watch(
  () => [
    props.homeScope.scopeMode,
    props.homeScope.productId,
    selectedScopeTeamId.value,
    authStore.token,
  ],
  () => {
    fetchTeamSummary()
  },
  { immediate: true },
)

watch(teamScopeOptions, () => {
  sanitizeSelectedScopeTeam()
})

watch(allMemberIds, (memberIds) => {
  if (memberIds.length === 0 || explicitSelectedIds.value.length === 0) return
  const valid = explicitSelectedIds.value.filter((id) => memberIds.includes(id))
  if (valid.length !== explicitSelectedIds.value.length) {
    emitSelected(valid)
  }
}, { immediate: true })

function formatPct(value: number): string {
  return `${Math.round(value)}%`
}

function loadRatioClass(value: number): string {
  if (value > 1) return 'text-red-600'
  if (value >= 0.85) return 'text-amber-600'
  return 'text-emerald-600'
}
</script>

<template>
  <div :class="containerClass">
    <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
      <Loader2 :size="18" class="mr-2 animate-spin" />
      Loading team KPIs...
    </div>

    <div v-else-if="error" class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-else class="space-y-4">
      <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
        <HomeSectionHeader
          title="Team Scope"
          description="Scope Team View by team first, then refine by member."
        >
          <template #actions>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:border-[#4857FE]/30 hover:text-[#4857FE]"
                @click="clearTeamScope"
              >
                <Filter :size="12" />
                All Teams
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:border-[#4857FE]/30 hover:text-[#4857FE]"
                @click="clearFilter"
              >
                <Filter :size="12" />
                {{ allMembersSelected ? 'All Members' : 'Reset Members' }}
              </button>
            </div>
          </template>
        </HomeSectionHeader>
        <div class="grid gap-3 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Team Scope</p>
            <select
              class="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#4857FE] focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
              :value="selectedScopeTeamId || ''"
              :disabled="scopeTeamsLoading || teamScopeOptions.length === 0"
              @change="selectedScopeTeamId = ($event.target as HTMLSelectElement).value || null"
            >
              <option value="">
                {{ scopeTeamsLoading ? 'Loading teams...' : 'All teams in current Home scope' }}
              </option>
              <option
                v-for="team in teamScopeOptions"
                :key="team.id"
                :value="team.id"
              >
                {{ team.name }}
              </option>
            </select>
            <p class="mt-1.5 text-xs text-gray-500">
              {{ effectiveScopeSummary }}
            </p>
          </div>

          <div>
            <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Member Filter</p>
            <div class="mt-1.5 flex flex-wrap gap-2">
              <button
                v-for="member in members"
                :key="member.userId"
                type="button"
                class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                :class="selectedIdSet.has(member.userId)
                  ? 'border-[#4857FE] bg-[#4857FE] text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-[#4857FE]/30 hover:text-[#4857FE]'"
                @click="toggleMember(member.userId)"
              >
                {{ member.userName }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <HomeKpiCard label="Members In Scope" :value="capacityKpis.selectedCount" detail="Current filter size" tone="primary">
          <template #icon><Users :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Overloaded" :value="capacityKpis.overloaded" detail="Load ratio above 1.00" tone="danger">
          <template #icon><AlertTriangle :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Idle" :value="capacityKpis.idle" detail="Load ratio below 0.45" tone="warning">
          <template #icon><Gauge :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Utilization" :value="`${capacityKpis.utilizationPct}%`" detail="WIP vs configured capacity" tone="primary">
          <template #icon><BarChart3 :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Load Balance Index" :value="capacityKpis.balanceIndex" detail="Higher means more balanced" tone="success">
          <template #icon><CheckCircle2 :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Blocked Tasks" :value="executionKpis.blockedCount" detail="In selected member slice" tone="danger">
          <template #icon><AlertTriangle :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Overdue Tasks" :value="executionKpis.overdueCount" detail="Due-date pressure indicator" tone="warning">
          <template #icon><Filter :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard
          label="Due Pressure"
          :value="executionKpis.duePressureCount"
          :detail="`${dashboardAtRiskTotal} at-risk work items in scope`"
          tone="purple"
        >
          <template #icon><Gauge :size="13" /></template>
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
            title="Capacity & Balance"
            description="WIP, capacity, and utilization shape for selected members."
          />
          <BarChart
            v-if="chartMembers.length > 0"
            :labels="chartMembers.map((member) => member.name)"
            :datasets="[
              { label: 'WIP', data: chartMembers.map((member) => member.wipCount), backgroundColor: '#4857FE' },
              { label: 'Capacity', data: chartMembers.map((member) => member.capacity), backgroundColor: '#CBD5E1' },
            ]"
            :height="230"
          />
          <HomeEmptyState v-else message="No member workload data for the selected filter." />
        </div>

        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Execution Risk"
            description="Blocked trend and top overdue tasks for immediate standup actions."
          />
          <LineChart
            v-if="blockersTrend.labels.length > 0"
            :labels="blockersTrend.labels"
            :datasets="[
              {
                label: 'Blocked Tasks',
                data: blockersTrend.values,
                borderColor: '#EF4444',
                backgroundColor: 'rgba(239,68,68,0.10)',
                fill: true,
              },
            ]"
            :height="210"
            y-title="Tasks"
          />
          <HomeEmptyState v-else message="No blockers trend data available for this period." />
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Most Overdue Tasks"
            description="Prioritized by delay duration inside the selected member slice."
          />
          <div v-if="overduePreview.length > 0" class="space-y-2">
            <div
              v-for="task in overduePreview"
              :key="task.taskId"
              class="rounded-lg border border-gray-100 px-3 py-2"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-sm font-medium text-gray-800">{{ task.title }}</p>
                <span class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {{ task.daysOverdue.toFixed(1) }}d
                </span>
              </div>
              <p class="mt-0.5 text-xs text-gray-400">{{ task.assignee }}</p>
            </div>
          </div>
          <HomeEmptyState v-else message="No overdue tasks for the selected members." />
        </div>

        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Current Blockers"
            description="Active blocker queue scoped by member filter."
          />
          <div v-if="filteredBlockedTasks.length > 0" class="space-y-2">
            <div
              v-for="task in filteredBlockedTasks.slice(0, 10)"
              :key="task.taskId"
              class="rounded-lg border border-gray-100 px-3 py-2"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-sm font-medium text-gray-800">{{ task.title }}</p>
                <span class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                  {{ task.blockedDays.toFixed(1) }}d blocked
                </span>
              </div>
              <p class="mt-0.5 text-xs text-gray-400">
                {{ task.assignee?.name || 'Unassigned' }}
              </p>
            </div>
          </div>
          <HomeEmptyState v-else message="No blockers for the selected members." />
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Quality Signal"
            description="First-pass, rework, reopen, and escaped-defect indicators."
          />
          <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">First Pass</p>
              <p class="text-lg font-semibold text-emerald-700">{{ formatPct(qualityKpis.firstPassRate) }}</p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Rework</p>
              <p class="text-lg font-semibold text-amber-700">{{ formatPct(qualityKpis.reworkRate) }}</p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Reopen</p>
              <p class="text-lg font-semibold text-orange-700">{{ formatPct(qualityKpis.reopenRate) }}</p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Escaped</p>
              <p class="text-lg font-semibold text-red-700">{{ qualityKpis.escapedDefects }}</p>
            </div>
          </div>
          <LineChart
            v-if="qualityTrend.labels.length > 0"
            :labels="qualityTrend.labels"
            :datasets="[
              { label: 'First Pass', data: qualityTrend.firstPass, borderColor: '#10B981', backgroundColor: 'transparent' },
              { label: 'Reopened', data: qualityTrend.reopened, borderColor: '#F59E0B', backgroundColor: 'transparent' },
              { label: 'Escaped', data: qualityTrend.escaped, borderColor: '#EF4444', backgroundColor: 'transparent' },
            ]"
            :height="210"
            y-title="Count"
          />
          <HomeEmptyState v-else message="No weekly quality outcomes available for this period." />
        </div>

        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Flow & Throughput"
            description="Product throughput trend plus selected-member estimated share."
          />
          <div class="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Total Completed</p>
              <p class="text-lg font-semibold text-gray-800">{{ flowKpis.totalCompleted }}</p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Avg / Bucket</p>
              <p class="text-lg font-semibold text-gray-800">{{ flowKpis.averageCompleted }}</p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Latest Net Flow</p>
              <p class="text-lg font-semibold" :class="flowKpis.latestNetFlow >= 0 ? 'text-red-700' : 'text-emerald-700'">
                {{ flowKpis.latestNetFlow }}
              </p>
            </div>
          </div>
          <LineChart
            v-if="throughputTrend.labels.length > 0"
            :labels="throughputTrend.labels"
            :datasets="[
              { label: 'Product Completed', data: throughputTrend.productCompleted, borderColor: '#4857FE', backgroundColor: 'rgba(72,87,254,0.08)', fill: true },
              { label: 'Selected (Estimated)', data: throughputTrend.selectedEstimate, borderColor: '#7C5CFC', backgroundColor: 'transparent' },
            ]"
            :height="210"
            y-title="Completed"
          />
          <HomeEmptyState v-else message="No throughput trend available for this period." />
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="rounded-xl border border-gray-100 bg-white">
          <div class="border-b border-gray-100 px-4 py-3">
            <h3 class="text-sm font-semibold text-gray-700">Team Member Snapshot</h3>
          </div>
          <div v-if="filteredWorkloadMembers.length > 0" class="overflow-x-auto">
            <table class="min-w-[860px] w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th class="px-4 py-3 font-medium">Member</th>
                  <th class="px-4 py-3 font-medium">WIP</th>
                  <th class="px-4 py-3 font-medium">Capacity</th>
                  <th class="px-4 py-3 font-medium">Load Ratio</th>
                  <th class="px-4 py-3 font-medium">Overdue</th>
                  <th class="px-4 py-3 font-medium">Completion</th>
                  <th class="px-4 py-3 font-medium">Review Load</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="member in filteredWorkloadMembers"
                  :key="member.id"
                  class="border-b border-gray-50 text-gray-700"
                >
                  <td class="px-4 py-3 font-medium">{{ member.name }}</td>
                  <td class="px-4 py-3">{{ member.wipCount }}</td>
                  <td class="px-4 py-3">{{ member.capacity }}</td>
                  <td class="px-4 py-3">
                    <span :class="loadRatioClass(member.loadRatio)">
                      {{ member.loadRatio.toFixed(2) }}
                    </span>
                  </td>
                  <td class="px-4 py-3">{{ member.overdueCount }}</td>
                  <td class="px-4 py-3">{{ member.completionRate }}%</td>
                  <td class="px-4 py-3">{{ reviewLoadByUserId.get(member.id) || 0 }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="px-4 py-8 text-center text-sm text-gray-400">
            No team members in the current filter.
          </div>
        </div>

        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Review Load Distribution"
            description="Reviewer queue counts for selected members (quality endpoint scope)."
          />
          <div v-if="filteredReviewLoad.length > 0" class="space-y-2">
            <div
              v-for="row in filteredReviewLoad.slice(0, 10)"
              :key="row.userId"
              class="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
            >
              <p class="text-sm font-medium text-gray-700">{{ row.name }}</p>
              <span class="rounded-full bg-[#4857FE]/10 px-2 py-0.5 text-xs font-semibold text-[#4857FE]">
                {{ row.count }}
              </span>
            </div>
          </div>
          <HomeEmptyState v-else message="No reviewer load data for the selected members." />
        </div>
      </section>

      <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
        <h3 class="text-sm font-semibold text-gray-700">What Needs Attention</h3>
        <ul class="mt-2 space-y-1.5 text-sm text-gray-600">
          <li class="flex items-start gap-2">
            <AlertTriangle :size="14" class="mt-0.5 text-amber-500" />
            <span>Rebalance members with load ratio above 1.00 and prioritize overdue task recovery.</span>
          </li>
          <li class="flex items-start gap-2">
            <Users :size="14" class="mt-0.5 text-[#4857FE]" />
            <span>Use member slicing to run focused standups for pods or owner groups.</span>
          </li>
          <li class="flex items-start gap-2">
            <CheckCircle2 :size="14" class="mt-0.5 text-emerald-500" />
            <span>Track first-pass and throughput direction together to reduce rework drag.</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
