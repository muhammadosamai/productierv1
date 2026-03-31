<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  Gauge,
  Loader2,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { metricsApi } from '@/lib/api'
import { ApiError } from '@/lib/apiClient'
import type { HomeScopeSelection } from '@/composables/useHomeScope'
import type {
  HomeBriefEntityFocusType,
  HomeBriefMode,
  HomeBriefScope,
  HomeBriefTemplate,
  UserDailyBriefResponse,
} from '@/lib/api/usersApi'
import type {
  DashboardMetricsResponse,
  DeliveriesMetricsResponse,
  FlowMetricsResponse,
  PredictabilityMetricsResponse,
  QualityMetricsResponse,
  WorkloadMetricsResponse,
} from '@/types/metrics'
import { enumValueLabel } from '@/composables/useDomainOptions'
import LineChart from '@/components/charts/LineChart.vue'
import BarChart from '@/components/charts/BarChart.vue'
import AIBriefWidget from '@/components/home/AIBriefWidget.vue'
import HomeEmptyState from '@/components/home/HomeEmptyState.vue'
import HomeKpiCard from '@/components/home/HomeKpiCard.vue'
import HomeSectionHeader from '@/components/home/HomeSectionHeader.vue'

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

const authStore = useAuthStore()

const loading = ref(false)
const error = ref<string | null>(null)

const dashboard = ref<DashboardMetricsResponse | null>(null)
const predictability = ref<PredictabilityMetricsResponse | null>(null)
const deliveries = ref<DeliveriesMetricsResponse | null>(null)
const workload = ref<WorkloadMetricsResponse | null>(null)
const quality = ref<QualityMetricsResponse | null>(null)
const flow = ref<FlowMetricsResponse | null>(null)

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

function normalizeDashboardResponse(payload: DashboardMetricsResponse): DashboardMetricsResponse {
  const raw = (payload ?? {}) as DashboardMetricsResponse
  return {
    ...raw,
    kpi: {
      ...(raw.kpi ?? {} as DashboardMetricsResponse['kpi']),
      onTimeRate: toNumber(raw.kpi?.onTimeRate),
    },
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
        ? raw.atRiskWork.trend.map((entry) => ({
          ...entry,
          date: toText(entry.date),
          total: toNumber(entry.total),
          blocked: toNumber(entry.blocked),
          overdue: toNumber(entry.overdue),
          agingWip: toNumber(entry.agingWip),
          missingOwner: toNumber(entry.missingOwner),
          missingReviewer: toNumber(entry.missingReviewer),
        }))
        : [],
    },
  }
}

function normalizePredictabilityResponse(payload: PredictabilityMetricsResponse): PredictabilityMetricsResponse {
  const raw = (payload ?? {}) as PredictabilityMetricsResponse
  return {
    ...raw,
    avgPredictability: toNumber(raw.avgPredictability),
    riskMatrix: Array.isArray(raw.riskMatrix)
      ? raw.riskMatrix.map((row) => ({
        ...row,
        deliveryId: toText(row.deliveryId),
        title: toText(row.title, 'Unnamed delivery'),
        varianceDays: toNumber(row.varianceDays),
        scopeChange: toNumber(row.scopeChange),
        riskScore: toNumber(row.riskScore),
      }))
      : [],
  }
}

function normalizeDeliveriesResponse(payload: DeliveriesMetricsResponse): DeliveriesMetricsResponse {
  const raw = (payload ?? {}) as DeliveriesMetricsResponse
  return {
    ...raw,
    activeDeliveries: toNumber(raw.activeDeliveries),
    deliveryDetails: Array.isArray(raw.deliveryDetails)
      ? raw.deliveryDetails.map((row) => ({
        ...row,
        id: toText(row.id),
        title: toText(row.title, 'Untitled delivery'),
        scheduleVarianceDays: toNumber(row.scheduleVarianceDays),
        scopeAddedAfterStart: toNumber(row.scopeAddedAfterStart),
        progress: toNumber(row.progress),
        riskBadge: row.riskBadge === 'watch' || row.riskBadge === 'at_risk' ? row.riskBadge : 'on_track',
      }))
      : [],
  }
}

function normalizeWorkloadResponse(payload: WorkloadMetricsResponse): WorkloadMetricsResponse {
  const raw = (payload ?? {}) as WorkloadMetricsResponse
  return {
    ...raw,
    overloaded: Array.isArray(raw.overloaded)
      ? raw.overloaded.map((member) => ({
        ...member,
        id: toText(member.id),
        name: toText(member.name, 'Unknown'),
        wipCount: toNumber(member.wipCount),
        capacity: toNumber(member.capacity),
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
    reviewLoad: Array.isArray(raw.reviewLoad)
      ? raw.reviewLoad.map((row) => ({
        ...row,
        userId: toText(row.userId),
        name: toText(row.name, 'Unknown'),
        count: toNumber(row.count),
      }))
      : [],
    reworkByWeek: Array.isArray(raw.reworkByWeek)
      ? raw.reworkByWeek.map((row) => ({
        ...row,
        date: toText(row.date),
        count: toNumber(row.count),
      }))
      : [],
  }
}

function normalizeFlowResponse(payload: FlowMetricsResponse): FlowMetricsResponse {
  const raw = (payload ?? {}) as FlowMetricsResponse
  return {
    ...raw,
    flowEfficiency: toNumber(raw.flowEfficiency),
    cycleTime: {
      ...(raw.cycleTime ?? {} as FlowMetricsResponse['cycleTime']),
      p85: toNumber(raw.cycleTime?.p85),
    },
    leadTime: {
      ...(raw.leadTime ?? {} as FlowMetricsResponse['leadTime']),
      p85: toNumber(raw.leadTime?.p85),
    },
    trendSlope: {
      ...(raw.trendSlope ?? {} as FlowMetricsResponse['trendSlope']),
      cycleP85: toNumber(raw.trendSlope?.cycleP85),
      leadP85: toNumber(raw.trendSlope?.leadP85),
    },
    percentileTrend: Array.isArray(raw.percentileTrend)
      ? raw.percentileTrend.map((row) => ({
        ...row,
        bucket: toText(row.bucket),
        p85Cycle: toNumber(row.p85Cycle),
        p85Lead: toNumber(row.p85Lead),
      }))
      : [],
  }
}

const riskTrend = computed(() => {
  const trend = dashboard.value?.atRiskWork.trend || []
  return {
    labels: trend.map((entry) => entry.date),
    totals: trend.map((entry) => entry.total),
    blocked: trend.map((entry) => entry.blocked),
    overdue: trend.map((entry) => entry.overdue),
  }
})

const portfolioMix = computed<{ labels: string[]; values: number[] }>(() => {
  const categories = dashboard.value?.atRiskWork.byCategory
  if (!categories) return { labels: [] as string[], values: [] as number[] }
  const entries: Array<[string, number]> = [
    ['Overdue', Number(categories.overdue ?? 0)],
    ['Blocked', Number(categories.blocked ?? 0)],
    ['Aging WIP', Number(categories.agingWip ?? 0)],
    ['Missing Owner', Number(categories.missingOwner ?? 0)],
    ['Missing Reviewer', Number(categories.missingReviewer ?? 0)],
  ]
  return {
    labels: entries.map(([label]) => String(label)),
    values: entries.map(([, value]) => Number(value)),
  }
})

const atRiskDeliveries = computed(() => {
  const rows = deliveries.value?.deliveryDetails || []
  return [...rows]
    .filter((item) => item.riskBadge !== 'on_track')
    .sort((a, b) => Math.abs(b.scheduleVarianceDays) - Math.abs(a.scheduleVarianceDays))
})

const deliveryRiskSummary = computed(() => {
  const rows = deliveries.value?.deliveryDetails || []
  const onTrack = rows.filter((row) => row.riskBadge === 'on_track').length
  const watch = rows.filter((row) => row.riskBadge === 'watch').length
  const atRisk = rows.filter((row) => row.riskBadge === 'at_risk').length
  return { onTrack, watch, atRisk }
})

const overloadedMembers = computed(() => {
  const rows = workload.value?.overloaded || []
  return [...rows].sort((a, b) => b.wipCount - a.wipCount)
})

const loadPressureChart = computed(() => {
  const rows = overloadedMembers.value.slice(0, 10)
  return {
    labels: rows.map((member) => member.name),
    wip: rows.map((member) => member.wipCount),
    capacity: rows.map((member) => member.capacity),
  }
})

const riskMatrixRows = computed(() => {
  const rows = predictability.value?.riskMatrix || []
  return [...rows].sort((a, b) => b.riskScore - a.riskScore).slice(0, 12)
})

const percentileTrend = computed(() => {
  const rows = flow.value?.percentileTrend || []
  return {
    labels: rows.map((row) => row.bucket),
    cycleP85: rows.map((row) => row.p85Cycle),
    leadP85: rows.map((row) => row.p85Lead),
  }
})

const reworkTrend = computed(() => {
  const rows = quality.value?.reworkByWeek || []
  return {
    labels: rows.map((row) => row.date),
    values: rows.map((row) => row.count),
  }
})

const reviewBottlenecks = computed(() => {
  const rows = quality.value?.reviewLoad || []
  return [...rows].sort((a, b) => b.count - a.count).slice(0, 10)
})

const executiveCards = computed(() => ({
  atRiskWork: dashboard.value?.atRiskWork.total ?? 0,
  onTimeRate: dashboard.value?.kpi.onTimeRate ?? 0,
  predictability: predictability.value?.avgPredictability ?? 0,
  flowEfficiency: flow.value?.flowEfficiency ?? 0,
  firstPassRate: quality.value?.firstPassRate ?? 0,
  reworkRate: quality.value?.reworkRate ?? 0,
  overloadCount: overloadedMembers.value.length,
  activeDeliveries: deliveries.value?.activeDeliveries ?? 0,
}))

const executionEfficiency = computed(() => ({
  cycleP85: flow.value?.cycleTime.p85 ?? 0,
  leadP85: flow.value?.leadTime.p85 ?? 0,
  cycleTrend: flow.value?.trendSlope.cycleP85 ?? 0,
  leadTrend: flow.value?.trendSlope.leadP85 ?? 0,
}))

async function fetchExecutiveSummary() {
  loading.value = true
  error.value = null
  try {
    if (props.homeScope.scopeMode === 'product' && !props.homeScope.productId) {
      dashboard.value = null
      predictability.value = null
      deliveries.value = null
      workload.value = null
      quality.value = null
      flow.value = null
      return
    }
    const organizationId = typeof props.organizationId === 'string' ? props.organizationId.trim() : ''
    const scopeQuery = {
      organizationId: organizationId || undefined,
      scopeMode: props.homeScope.scopeMode,
      productId: props.homeScope.productId,
    }

    const [dashboardData, predictabilityData, deliveryData, workloadData, qualityData, flowData] = await Promise.all([
      metricsApi.dashboard({ ...scopeQuery, period: '90' }, authStore.token),
      metricsApi.predictability({ ...scopeQuery, period: '90' }, authStore.token),
      metricsApi.deliveries({ ...scopeQuery, period: '90' }, authStore.token),
      metricsApi.workload({ ...scopeQuery, period: '90' }, authStore.token),
      metricsApi.quality({ ...scopeQuery, period: '90' }, authStore.token),
      metricsApi.flow({ ...scopeQuery, period: '90' }, authStore.token),
    ])

    dashboard.value = normalizeDashboardResponse(dashboardData)
    predictability.value = normalizePredictabilityResponse(predictabilityData)
    deliveries.value = normalizeDeliveriesResponse(deliveryData)
    workload.value = normalizeWorkloadResponse(workloadData)
    quality.value = normalizeQualityResponse(qualityData)
    flow.value = normalizeFlowResponse(flowData)
  } catch (err) {
    dashboard.value = null
    predictability.value = null
    deliveries.value = null
    workload.value = null
    quality.value = null
    flow.value = null
    if (err instanceof ApiError) {
      error.value = err.message || 'Unable to load executive overview.'
    } else {
      error.value = 'Unable to load executive overview.'
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [
    props.organizationId,
    props.homeScope.scopeMode,
    props.homeScope.productId,
    authStore.token,
  ],
  () => {
    fetchExecutiveSummary()
  },
  { immediate: true },
)

function pct(value: number): string {
  return `${Math.round(value)}%`
}

function riskBadgeLabel(value: string): string {
  return enumValueLabel(value)
}
</script>

<template>
  <div class="p-3 sm:p-4 lg:p-5">
    <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
      <Loader2 :size="18" class="mr-2 animate-spin" />
      Loading executive overview...
    </div>

    <div v-else-if="error" class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-else class="space-y-4">
      <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <HomeKpiCard label="At-Risk Work" :value="executiveCards.atRiskWork" detail="Current at-risk portfolio count" tone="danger">
          <template #icon><AlertTriangle :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="On-Time Rate" :value="pct(executiveCards.onTimeRate)" detail="Dashboard delivery punctuality" tone="primary">
          <template #icon><Gauge :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Predictability" :value="pct(executiveCards.predictability)" detail="Average predictability score" tone="primary">
          <template #icon><TrendingUp :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Flow Efficiency" :value="pct(executiveCards.flowEfficiency)" detail="Active flow conversion efficiency" tone="success">
          <template #icon><TrendingUp :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="First Pass Rate" :value="pct(executiveCards.firstPassRate)" detail="Quality at first review pass" tone="success">
          <template #icon><ShieldAlert :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Rework Rate" :value="pct(executiveCards.reworkRate)" detail="Rework burden in period window" tone="warning">
          <template #icon><ShieldAlert :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Overloaded Members" :value="executiveCards.overloadCount" detail="Workforce stress concentration" tone="danger">
          <template #icon><Users :size="13" /></template>
        </HomeKpiCard>
        <HomeKpiCard label="Active Deliveries" :value="executiveCards.activeDeliveries" detail="Current portfolio throughput scope" tone="purple">
          <template #icon><TrendingUp :size="13" /></template>
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
            title="Portfolio Health"
            description="At-risk trend and composition across risk categories (snapshot trend view)."
          />
          <LineChart
            v-if="riskTrend.labels.length > 0"
            :labels="riskTrend.labels"
            :datasets="[
              { label: 'Total At Risk', data: riskTrend.totals, borderColor: '#4857FE', backgroundColor: 'rgba(72,87,254,0.08)', fill: true },
              { label: 'Blocked', data: riskTrend.blocked, borderColor: '#F59E0B', backgroundColor: 'transparent' },
              { label: 'Overdue', data: riskTrend.overdue, borderColor: '#EF4444', backgroundColor: 'transparent' },
            ]"
            :height="220"
            y-title="Tasks"
          />
          <HomeEmptyState v-else message="No portfolio risk trend available." />
          <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">On Track</p>
              <p class="text-lg font-semibold text-emerald-700">{{ deliveryRiskSummary.onTrack }}</p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Watch</p>
              <p class="text-lg font-semibold text-amber-700">{{ deliveryRiskSummary.watch }}</p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">At Risk</p>
              <p class="text-lg font-semibold text-red-700">{{ deliveryRiskSummary.atRisk }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Risk Mix & Delivery Watchlist"
            description="Top delivery risks by schedule variance and scope stress."
          />
          <BarChart
            v-if="portfolioMix.labels.length > 0"
            :labels="portfolioMix.labels"
            :datasets="[
              { label: 'Tasks', data: portfolioMix.values, backgroundColor: ['#EF4444', '#F59E0B', '#8B5CF6', '#0EA5E9', '#6366F1'] },
            ]"
            :height="170"
            :show-legend="false"
          />
          <HomeEmptyState v-else message="No at-risk category composition available." />
          <div v-if="atRiskDeliveries.length > 0" class="mt-3 space-y-2">
            <div
              v-for="delivery in atRiskDeliveries.slice(0, 8)"
              :key="delivery.id"
              class="rounded-lg border border-gray-100 px-3 py-2"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-sm font-medium text-gray-800">{{ delivery.title }}</p>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  :class="delivery.riskBadge === 'at_risk' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'"
                >
                  {{ riskBadgeLabel(delivery.riskBadge) }}
                </span>
              </div>
              <p class="mt-0.5 text-xs text-gray-400">
                Variance: {{ delivery.scheduleVarianceDays }}d • Scope added: {{ delivery.scopeAddedAfterStart }} • Progress: {{ delivery.progress }}%
              </p>
            </div>
          </div>
          <HomeEmptyState v-else message="No at-risk deliveries in this period." />
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Execution Efficiency"
            description="Cycle/lead-time percentile movement and trend direction."
          />
          <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Cycle P85</p>
              <p class="text-lg font-semibold text-gray-800">{{ executionEfficiency.cycleP85.toFixed(1) }}d</p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Lead P85</p>
              <p class="text-lg font-semibold text-gray-800">{{ executionEfficiency.leadP85.toFixed(1) }}d</p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Cycle Trend</p>
              <p class="text-lg font-semibold" :class="executionEfficiency.cycleTrend > 0 ? 'text-red-700' : 'text-emerald-700'">
                {{ executionEfficiency.cycleTrend.toFixed(2) }}
              </p>
            </div>
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Lead Trend</p>
              <p class="text-lg font-semibold" :class="executionEfficiency.leadTrend > 0 ? 'text-red-700' : 'text-emerald-700'">
                {{ executionEfficiency.leadTrend.toFixed(2) }}
              </p>
            </div>
          </div>
          <LineChart
            v-if="percentileTrend.labels.length > 0"
            :labels="percentileTrend.labels"
            :datasets="[
              { label: 'Cycle P85', data: percentileTrend.cycleP85, borderColor: '#4857FE', backgroundColor: 'transparent' },
              { label: 'Lead P85', data: percentileTrend.leadP85, borderColor: '#7C5CFC', backgroundColor: 'transparent' },
            ]"
            :height="210"
            y-title="Days"
          />
          <HomeEmptyState v-else message="No flow percentile trend data available." />
        </div>

        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Quality Signal"
            description="Rework trend and review bottleneck concentration."
          />
          <LineChart
            v-if="reworkTrend.labels.length > 0"
            :labels="reworkTrend.labels"
            :datasets="[
              { label: 'Rework Events', data: reworkTrend.values, borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.10)', fill: true },
            ]"
            :height="190"
            y-title="Count"
          />
          <HomeEmptyState v-else message="No rework trend data available for this period." />
          <div v-if="reviewBottlenecks.length > 0" class="mt-3 space-y-2">
            <div
              v-for="row in reviewBottlenecks.slice(0, 8)"
              :key="row.userId"
              class="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
            >
              <p class="text-sm font-medium text-gray-700">{{ row.name }}</p>
              <span class="rounded-full bg-[#4857FE]/10 px-2 py-0.5 text-xs font-semibold text-[#4857FE]">
                {{ row.count }}
              </span>
            </div>
          </div>
          <HomeEmptyState v-else message="No review bottleneck records available." />
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
          <HomeSectionHeader
            title="Workforce Risk"
            description="Overload concentration and capacity pressure by member."
          />
          <BarChart
            v-if="loadPressureChart.labels.length > 0"
            :labels="loadPressureChart.labels"
            :datasets="[
              { label: 'WIP', data: loadPressureChart.wip, backgroundColor: '#7C5CFC' },
              { label: 'Capacity', data: loadPressureChart.capacity, backgroundColor: '#CBD5E1' },
            ]"
            :height="220"
          />
          <HomeEmptyState v-else message="No overloaded members at this time." />
        </div>

        <div class="rounded-xl border border-gray-100 bg-white">
          <div class="border-b border-gray-100 px-4 py-3">
            <h3 class="text-sm font-semibold text-gray-700">Predictability Risk Matrix</h3>
          </div>
          <div v-if="riskMatrixRows.length > 0" class="overflow-x-auto">
            <table class="min-w-[760px] w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th class="px-4 py-3 font-medium">Delivery</th>
                  <th class="px-4 py-3 font-medium">Variance (days)</th>
                  <th class="px-4 py-3 font-medium">Scope Change</th>
                  <th class="px-4 py-3 font-medium">Risk Score</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in riskMatrixRows" :key="row.deliveryId" class="border-b border-gray-50 text-gray-700">
                  <td class="px-4 py-3 font-medium">{{ row.title }}</td>
                  <td class="px-4 py-3">{{ row.varianceDays }}</td>
                  <td class="px-4 py-3">{{ row.scopeChange }}</td>
                  <td class="px-4 py-3">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold"
                      :class="row.riskScore >= 75 ? 'bg-red-50 text-red-700' : row.riskScore >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'"
                    >
                      {{ row.riskScore }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="px-4 py-8 text-center text-sm text-gray-400">
            No predictability risk points available.
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
