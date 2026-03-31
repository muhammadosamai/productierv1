<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { fetchScopedMetricsJson } from './api'
import { CHART_COLORS, formatDays, getInitials, percentChange } from './utils'
import type { DashboardMetricsResponse } from '@/types/metrics'
import LineChart from '@/components/charts/LineChart.vue'
import MetricsMetaStrip from './MetricsMetaStrip.vue'
import MetricHelpPopover from './MetricHelpPopover.vue'

const props = defineProps<{ period: number }>()
const authStore = useAuthStore()
const productStore = useProductStore()
const router = useRouter()
const metricsProductId = inject<ComputedRef<string>>(
  'metricsProductId',
  computed(() => productStore.activeProduct?.id || ''),
)
const metricsScopeMode = inject<Ref<'product' | 'all' | 'team'>>('metricsScopeMode', ref('product'))
const metricsTeamId = inject<Ref<string>>('metricsTeamId', ref(''))

const data = ref<DashboardMetricsResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedRiskChip = ref<'all' | 'overdue' | 'blocked' | 'agingWip' | 'missingOwner' | 'missingReviewer'>('all')

const riskChipCount = computed(() => {
  if (!data.value) return 0
  const categories = data.value.atRiskWork.byCategory
  if (selectedRiskChip.value === 'all') return data.value.atRiskWork.total
  return categories[selectedRiskChip.value]
})

const filteredTeam = computed(() => {
  if (!data.value) return []
  if (selectedRiskChip.value === 'all') return data.value.team.workload
  if (selectedRiskChip.value === 'overdue') return data.value.team.workload.filter((member) => member.tasks.overdue > 0)
  if (selectedRiskChip.value === 'blocked') return data.value.team.workload.filter((member) => member.tasks.blocked > 0)
  if (selectedRiskChip.value === 'agingWip') return data.value.team.workload.filter((member) => member.tasks.agingWip > 0)
  if (selectedRiskChip.value === 'missingOwner' || selectedRiskChip.value === 'missingReviewer') return []
  return data.value.team.workload
})

const riskFilterNote = computed(() => {
  if (selectedRiskChip.value === 'missingOwner') return 'Owner gaps are unassigned tasks and cannot be attributed to a specific team member.'
  if (selectedRiskChip.value === 'missingReviewer') return 'Reviewer gaps are task-level review assignments and are not mapped to a single owner.'
  return null
})

const atRiskCompositionTrend = computed(() => {
  if (!data.value) {
    return {
      labels: [] as string[],
      overdue: [] as number[],
      blocked: [] as number[],
      agingWip: [] as number[],
      missingOwner: [] as number[],
      missingReviewer: [] as number[],
    }
  }
  return {
    labels: data.value.atRiskWork.trend.map((point) => point.date),
    overdue: data.value.atRiskWork.trend.map((point) => point.overdue),
    blocked: data.value.atRiskWork.trend.map((point) => point.blocked),
    agingWip: data.value.atRiskWork.trend.map((point) => point.agingWip),
    missingOwner: data.value.atRiskWork.trend.map((point) => point.missingOwner),
    missingReviewer: data.value.atRiskWork.trend.map((point) => point.missingReviewer),
  }
})

const taskHealthLegend = computed(() => {
  if (!data.value) return []
  const totalTasks = Math.max(1, data.value.kpi.totalTasks)
  return [
    {
      key: 'completed',
      label: 'Completed',
      count: Math.round((data.value.kpi.taskCompletionRate / 100) * totalTasks),
      percent: data.value.kpi.taskCompletionRate,
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-700',
    },
    {
      key: 'inProgress',
      label: 'In Progress',
      count: data.value.kpi.inProgressCount,
      percent: (data.value.kpi.inProgressCount / totalTasks) * 100,
      dotClass: 'bg-blue-500',
      textClass: 'text-blue-700',
    },
    {
      key: 'inReview',
      label: 'In Review',
      count: data.value.kpi.inReviewCount,
      percent: (data.value.kpi.inReviewCount / totalTasks) * 100,
      dotClass: 'bg-violet-500',
      textClass: 'text-violet-700',
    },
    {
      key: 'blocked',
      label: 'Blocked',
      count: data.value.kpi.blockedCount,
      percent: (data.value.kpi.blockedCount / totalTasks) * 100,
      dotClass: 'bg-red-500',
      textClass: 'text-red-700',
    },
  ]
})

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    if (metricsScopeMode.value === 'product' && !metricsProductId.value) {
      data.value = null
      return
    }
    if (metricsScopeMode.value === 'team' && !metricsTeamId.value) {
      data.value = null
      return
    }

    const result = await fetchScopedMetricsJson<DashboardMetricsResponse>('dashboard', {
      token: authStore.token,
      query: {
        organizationId: productStore.activeProduct?.organizationId || null,
        scopeMode: metricsScopeMode.value,
        productId: metricsScopeMode.value === 'product' ? metricsProductId.value : undefined,
        teamId: metricsScopeMode.value === 'team' ? metricsTeamId.value || undefined : undefined,
        period: String(props.period),
      },
      fallbackMessage: 'Failed to load overview metrics',
    })

    if (result.error) {
      data.value = null
      error.value = result.error
      return
    }

    data.value = result.data
  } catch (e) {
    console.error('Failed to load overview metrics', e)
    data.value = null
    error.value = 'Failed to load overview metrics'
  } finally {
    loading.value = false
  }
}

watch(
  () => [
    props.period,
    metricsProductId.value,
    metricsScopeMode.value,
    metricsTeamId.value,
    productStore.activeProduct?.organizationId,
    authStore.token,
  ],
  fetchData,
  { immediate: true },
)

function trendIcon(dir: string) {
  if (dir === 'up') return TrendingUp
  if (dir === 'down') return TrendingDown
  return Minus
}
function trendColor(dir: string, positive = true) {
  if (dir === 'flat') return 'text-gray-400'
  if (positive) return dir === 'up' ? 'text-emerald-500' : 'text-red-500'
  return dir === 'up' ? 'text-red-500' : 'text-emerald-500'
}

function riskChipTaskStatus(
  chip: 'all' | 'overdue' | 'blocked' | 'agingWip' | 'missingOwner' | 'missingReviewer',
): 'all' | 'overdue' | 'blocked' | 'in_progress' | 'in_review' {
  if (chip === 'overdue') return 'overdue'
  if (chip === 'blocked') return 'blocked'
  if (chip === 'agingWip') return 'in_progress'
  if (chip === 'missingReviewer') return 'in_review'
  return 'all'
}

function openRiskTasks(
  chip: 'all' | 'overdue' | 'blocked' | 'agingWip' | 'missingOwner' | 'missingReviewer' = selectedRiskChip.value,
) {
  const mappedStatus = riskChipTaskStatus(chip)
  if (mappedStatus === 'all') {
    router.push({ path: '/tasks' })
    return
  }
  router.push({ path: '/tasks', query: { status: mappedStatus } })
}
</script>

<template>
  <div class="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
    <div v-if="loading" class="flex items-center justify-center py-16 sm:py-20">
      <div class="w-6 h-6 border-2 border-[#4857FE] border-t-transparent rounded-full animate-spin" />
    </div>
    <div v-else-if="error" class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>
    <div v-else-if="!data" class="rounded-xl border border-gray-100 bg-white px-4 py-10 text-center text-sm text-gray-400">
      No overview metrics available for the selected product.
    </div>

    <template v-else>
      <MetricsMetaStrip :meta="data.meta" />

      <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            At-Risk Work Summary
            <MetricHelpPopover metric-key="at_risk_work" />
          </h3>
          <span class="text-xs" :class="data.atRiskWork.delta > 0 ? 'text-red-600' : data.atRiskWork.delta < 0 ? 'text-emerald-600' : 'text-gray-500'">
            Delta {{ data.atRiskWork.delta > 0 ? '+' : '' }}{{ data.atRiskWork.delta }} vs prior
          </span>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="px-3 py-1.5 rounded-full text-xs font-medium border"
            :class="selectedRiskChip === 'all' ? 'bg-[#4857FE] text-white border-[#4857FE]' : 'bg-white text-gray-600 border-gray-200'"
            @click="selectedRiskChip = 'all'"
          >
            All ({{ data.atRiskWork.total }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-full text-xs font-medium border"
            :class="selectedRiskChip === 'overdue' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-600 border-red-200'"
            @click="selectedRiskChip = 'overdue'"
          >
            Overdue ({{ data.atRiskWork.byCategory.overdue }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-full text-xs font-medium border"
            :class="selectedRiskChip === 'blocked' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-200'"
            @click="selectedRiskChip = 'blocked'"
          >
            Blocked ({{ data.atRiskWork.byCategory.blocked }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-full text-xs font-medium border"
            :class="selectedRiskChip === 'agingWip' ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-violet-700 border-violet-200'"
            @click="selectedRiskChip = 'agingWip'"
          >
            Aging WIP ({{ data.atRiskWork.byCategory.agingWip }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-full text-xs font-medium border"
            :class="selectedRiskChip === 'missingOwner' ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-sky-700 border-sky-200'"
            @click="selectedRiskChip = 'missingOwner'"
          >
            Owner Gaps ({{ data.atRiskWork.byCategory.missingOwner }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-full text-xs font-medium border"
            :class="selectedRiskChip === 'missingReviewer' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-indigo-700 border-indigo-200'"
            @click="selectedRiskChip = 'missingReviewer'"
          >
            Reviewer Gaps ({{ data.atRiskWork.byCategory.missingReviewer }})
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-3">
          Selected risk workload: <span class="font-semibold text-gray-700">{{ riskChipCount }}</span>
        </p>
        <button
          type="button"
          class="mt-2 text-xs font-medium text-[#4857FE] hover:text-[#3E4BDE]"
          @click="openRiskTasks()"
        >
          Open selected risk tasks
        </button>
        <div class="mt-4">
          <LineChart
            v-if="atRiskCompositionTrend.labels.length > 0"
            :labels="atRiskCompositionTrend.labels"
            :datasets="[
              { label: 'Overdue', data: atRiskCompositionTrend.overdue, borderColor: CHART_COLORS.danger, backgroundColor: CHART_COLORS.dangerLight, fill: false, pointRadius: 2 },
              { label: 'Blocked', data: atRiskCompositionTrend.blocked, borderColor: CHART_COLORS.warning, backgroundColor: 'transparent', pointRadius: 2 },
              { label: 'Aging WIP', data: atRiskCompositionTrend.agingWip, borderColor: CHART_COLORS.purple, backgroundColor: 'transparent', pointRadius: 2 },
              { label: 'Owner Gaps', data: atRiskCompositionTrend.missingOwner, borderColor: CHART_COLORS.sky, backgroundColor: 'transparent', borderDash: [4, 4], pointRadius: 2 },
              { label: 'Reviewer Gaps', data: atRiskCompositionTrend.missingReviewer, borderColor: CHART_COLORS.primary, backgroundColor: 'transparent', borderDash: [4, 4], pointRadius: 2 },
            ]"
            :height="180"
            y-title="Tasks"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Tasks Completed</span>
            <div class="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 :size="14" class="text-emerald-500" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.kpi.tasksCompleted.current }}</div>
          <div class="flex items-center gap-1 mt-1">
            <component
              :is="trendIcon(percentChange(data.kpi.tasksCompleted.current, data.kpi.tasksCompleted.previous).direction)"
              :size="12"
              :class="trendColor(percentChange(data.kpi.tasksCompleted.current, data.kpi.tasksCompleted.previous).direction)"
            />
            <span class="text-xs" :class="trendColor(percentChange(data.kpi.tasksCompleted.current, data.kpi.tasksCompleted.previous).direction)">
              {{ percentChange(data.kpi.tasksCompleted.current, data.kpi.tasksCompleted.previous).value }}%
            </span>
            <span class="text-xs text-gray-400">vs prev period</span>
          </div>
        </div>

        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Avg Cycle Time</span>
            <div class="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <Clock :size="14" class="text-blue-500" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ formatDays(data.kpi.avgCycleTime) }}</div>
          <div class="text-xs text-gray-400 mt-1">Lead time: {{ formatDays(data.kpi.avgLeadTime) }}</div>
        </div>

        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
              On-Time Rate
              <MetricHelpPopover metric-key="on_time_rate" />
            </span>
            <div class="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
              <Target :size="14" class="text-violet-500" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.kpi.onTimeRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">{{ data.kpi.overdueCount }} overdue</div>
        </div>

        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Blocked</span>
            <div class="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle :size="14" class="text-red-500" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.kpi.blockedCount }}</div>
          <div class="text-xs text-gray-400 mt-1">{{ data.kpi.inReviewCount }} in review</div>
          <button
            type="button"
            class="mt-2 text-xs font-medium text-[#4857FE] hover:text-[#3E4BDE]"
            @click="openRiskTasks('blocked')"
          >
            Open blocked tasks
          </button>
        </div>

        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Completion</span>
            <div class="w-7 h-7 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
              <BarChart3 :size="14" class="text-[#4857FE]" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.kpi.taskCompletionRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">{{ data.kpi.totalTasks }} total tasks</div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Weekly Throughput</h3>
          <LineChart
            :labels="data.sparkline.map((_, index) => `W${index + 1}`)"
            :datasets="[{ label: 'Completed', data: data.sparkline, borderColor: CHART_COLORS.primary, backgroundColor: CHART_COLORS.primaryLight, fill: true }]"
            :height="180"
            :show-legend="false"
          />
        </div>

        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-7 h-7 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
              <Zap :size="14" class="text-[#4857FE]" />
            </div>
            <h3 class="text-sm font-semibold text-gray-700">Flow Health</h3>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="rounded-lg bg-red-50 px-3 py-2">
              <p class="text-[11px] text-red-700 uppercase tracking-wide">Blocker Ratio</p>
              <p class="text-lg font-semibold text-red-700 mt-1">{{ data.flowHealth.blockerRatio }}%</p>
              <button
                type="button"
                class="mt-2 text-[11px] font-medium text-red-700 underline-offset-2 hover:underline"
                @click="openRiskTasks('blocked')"
              >
                Open blocked tasks
              </button>
            </div>
            <div class="rounded-lg bg-amber-50 px-3 py-2">
              <p class="text-[11px] text-amber-700 uppercase tracking-wide">Overdue Ratio</p>
              <p class="text-lg font-semibold text-amber-700 mt-1">{{ data.flowHealth.overdueRatio }}%</p>
              <button
                type="button"
                class="mt-2 text-[11px] font-medium text-amber-700 underline-offset-2 hover:underline"
                @click="openRiskTasks('overdue')"
              >
                Open overdue tasks
              </button>
            </div>
            <div class="rounded-lg bg-violet-50 px-3 py-2">
              <p class="text-[11px] text-violet-700 uppercase tracking-wide">Aging WIP Ratio</p>
              <p class="text-lg font-semibold text-violet-700 mt-1">{{ data.flowHealth.agingWipRatio }}%</p>
              <button
                type="button"
                class="mt-2 text-[11px] font-medium text-violet-700 underline-offset-2 hover:underline"
                @click="openRiskTasks('agingWip')"
              >
                Open aging WIP tasks
              </button>
            </div>
          </div>
          <div class="mt-4 flex items-center justify-between">
            <div class="flex items-center gap-1">
              <component :is="trendIcon(data.flowHealth.trendDirection)" :size="12" :class="trendColor(data.flowHealth.trendDirection)" />
              <span class="text-xs" :class="trendColor(data.flowHealth.trendDirection)">
                On-time trend {{ data.flowHealth.trendDirection }}
              </span>
            </div>
            <span class="text-xs text-gray-500">On-time rate {{ data.flowHealth.onTimeRate }}%</span>
          </div>
          <p class="mt-2 text-[11px] text-gray-400">
            Aging WIP tasks: {{ data.flowHealth.agingWipCount }} / {{ data.flowHealth.activeTaskCount }} active
          </p>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-3">Task Health</h3>
        <div class="flex rounded-full h-4 overflow-hidden bg-gray-100">
          <div class="bg-emerald-500 transition-all" :style="{ width: data.kpi.taskCompletionRate + '%' }" />
          <div class="bg-blue-500 transition-all" :style="{ width: (data.kpi.inProgressCount / Math.max(1, data.kpi.totalTasks) * 100) + '%' }" />
          <div class="bg-violet-500 transition-all" :style="{ width: (data.kpi.inReviewCount / Math.max(1, data.kpi.totalTasks) * 100) + '%' }" />
          <div class="bg-red-500 transition-all" :style="{ width: (data.kpi.blockedCount / Math.max(1, data.kpi.totalTasks) * 100) + '%' }" />
        </div>
        <div class="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <p
            v-for="segment in taskHealthLegend"
            :key="segment.key"
            class="flex items-center justify-between text-[11px] text-gray-600"
          >
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full" :class="segment.dotClass" />
              {{ segment.label }}
            </span>
            <span :class="['font-semibold', segment.textClass]">
              {{ segment.count }} ({{ Math.round(segment.percent) }}%)
            </span>
          </p>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Team Workload</h3>
        </div>
        <div v-if="filteredTeam.length > 0" class="overflow-x-auto">
        <table class="w-full text-xs min-w-[900px]">
          <thead>
            <tr class="border-b border-gray-50 text-left text-gray-400">
              <th class="px-5 py-3 font-medium">Member</th>
              <th class="px-5 py-3 font-medium text-center">Total</th>
              <th class="px-5 py-3 font-medium text-center">Completed</th>
              <th class="px-5 py-3 font-medium text-center">In Progress</th>
              <th class="px-5 py-3 font-medium text-center">Blocked</th>
              <th class="px-5 py-3 font-medium text-center">Aging WIP</th>
              <th class="px-5 py-3 font-medium text-center">Overdue</th>
              <th class="px-5 py-3 font-medium text-center">Stories</th>
              <th class="px-5 py-3 font-medium text-center">Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in filteredTeam" :key="member.id" class="border-b border-gray-50 hover:bg-gray-50/50">
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <img v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                  <div v-else class="w-6 h-6 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-semibold text-[#4857FE]">
                    {{ getInitials(member.name) }}
                  </div>
                  <span class="font-medium text-gray-700">{{ member.name }}</span>
                </div>
              </td>
              <td class="px-5 py-3 text-center text-gray-600">{{ member.tasks.total }}</td>
              <td class="px-5 py-3 text-center text-emerald-600 font-medium">{{ member.tasks.completed }}</td>
              <td class="px-5 py-3 text-center text-blue-600">{{ member.tasks.inProgress }}</td>
              <td class="px-5 py-3 text-center text-amber-600">{{ member.tasks.blocked }}</td>
              <td class="px-5 py-3 text-center text-violet-600">{{ member.tasks.agingWip }}</td>
              <td class="px-5 py-3 text-center">
                <span v-if="member.tasks.overdue > 0" class="text-red-600 font-medium">{{ member.tasks.overdue }}</span>
                <span v-else class="text-gray-300">0</span>
              </td>
              <td class="px-5 py-3 text-center text-gray-600">{{ member.stories }}</td>
              <td class="px-5 py-3 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                  :class="member.completionRate >= 70 ? 'bg-emerald-50 text-emerald-700' : member.completionRate >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'">
                  {{ member.completionRate }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        <div v-else class="px-5 py-10 text-center text-sm text-gray-400">
          {{ riskFilterNote || 'No team members match the selected at-risk filter.' }}
        </div>
      </div>
    </template>
  </div>
</template>
