<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { AlertTriangle, Clock, Zap } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { fetchScopedMetricsJson } from './api'
import { CHART_COLORS, STATUS_CHART_COLORS, formatDays, priorityColor, statusBg, statusLabel } from './utils'
import type { FlowMetricsResponse } from '@/types/metrics'
import LineChart from '@/components/charts/LineChart.vue'
import ScatterChart from '@/components/charts/ScatterChart.vue'
import StackedAreaChart from '@/components/charts/StackedAreaChart.vue'
import MetricsMetaStrip from './MetricsMetaStrip.vue'
import MetricHelpPopover from './MetricHelpPopover.vue'

const props = defineProps<{ period: number }>()
const authStore = useAuthStore()
const productStore = useProductStore()
const metricsProductId = inject<ComputedRef<string>>(
  'metricsProductId',
  computed(() => productStore.activeProduct?.id || ''),
)
const metricsScopeMode = inject<Ref<'product' | 'all' | 'team'>>('metricsScopeMode', ref('product'))
const metricsTeamId = inject<Ref<string>>('metricsTeamId', ref(''))

const data = ref<FlowMetricsResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

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
    const result = await fetchScopedMetricsJson<FlowMetricsResponse>('flow', {
      token: authStore.token,
      query: {
        organizationId: productStore.activeProduct?.organizationId || null,
        scopeMode: metricsScopeMode.value,
        productId: metricsScopeMode.value === 'product' ? metricsProductId.value : undefined,
        teamId: metricsScopeMode.value === 'team' ? metricsTeamId.value || undefined : undefined,
        period: String(props.period),
      },
      fallbackMessage: 'Failed to load flow metrics',
    })

    if (result.error) {
      data.value = null
      error.value = result.error
      return
    }

    data.value = result.data
  } catch (e) {
    console.error('Failed to load flow metrics', e)
    data.value = null
    error.value = 'Failed to load flow metrics'
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

const statusKeys = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'blocked']

const lowSampleBuckets = computed(() => {
  if (!data.value) return 0
  return data.value.percentileTrend.filter((point) => point.sampleSize < 5).length
})

const percentileDatasets = computed(() => {
  if (!data.value) return []
  return [
    { label: 'Cycle p50', data: data.value.percentileTrend.map((point) => point.p50Cycle), borderColor: CHART_COLORS.primary, backgroundColor: 'transparent' },
    { label: 'Cycle p85', data: data.value.percentileTrend.map((point) => point.p85Cycle), borderColor: CHART_COLORS.warning, backgroundColor: 'transparent' },
    { label: 'Cycle p95', data: data.value.percentileTrend.map((point) => point.p95Cycle), borderColor: CHART_COLORS.danger, backgroundColor: 'transparent' },
    { label: 'Lead p50', data: data.value.percentileTrend.map((point) => point.p50Lead), borderColor: CHART_COLORS.sky, backgroundColor: 'transparent', borderDash: [4, 4] },
    { label: 'Lead p85', data: data.value.percentileTrend.map((point) => point.p85Lead), borderColor: CHART_COLORS.purple, backgroundColor: 'transparent', borderDash: [4, 4] },
    { label: 'Lead p95', data: data.value.percentileTrend.map((point) => point.p95Lead), borderColor: CHART_COLORS.gray, backgroundColor: 'transparent', borderDash: [4, 4] },
  ]
})
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
      No flow metrics available for the selected product.
    </div>

    <template v-else>
      <MetricsMetaStrip :meta="data.meta" />

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-blue-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Median Cycle</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ formatDays(data.cycleTime.median) }}</div>
          <div class="text-[11px] text-gray-400 mt-1">n={{ data.cycleTime.sampleSize }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">P85 Cycle</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ formatDays(data.cycleTime.p85) }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">P95 Cycle</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ formatDays(data.cycleTime.p95) }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-sky-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Median Lead</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ formatDays(data.leadTime.median) }}</div>
          <div class="text-[11px] text-gray-400 mt-1">n={{ data.leadTime.sampleSize }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-violet-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">P85 Lead</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ formatDays(data.leadTime.p85) }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-gray-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">P95 Lead</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ formatDays(data.leadTime.p95) }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Zap :size="14" class="text-emerald-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Flow Efficiency</span>
            <MetricHelpPopover metric-key="flow_efficiency" />
          </div>
          <div class="text-xl font-bold text-gray-900">{{ data.flowEfficiency }}%</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <AlertTriangle :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">WIP Count</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ data.wipCount }}</div>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
        <div class="flex items-center gap-2 mb-4">
          <h3 class="text-sm font-semibold text-gray-700">Percentile Trend (Cycle/Lead)</h3>
          <MetricHelpPopover metric-key="cycle_percentiles" />
        </div>
        <LineChart
          v-if="data.percentileTrend.length > 0"
          :labels="data.percentileTrend.map((point) => point.bucket)"
          :datasets="percentileDatasets"
          y-title="Days"
          :height="260"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No percentile trend data</div>
        <p class="text-[11px] text-gray-500 mt-3">
          Trend slope p85 cycle: {{ data.trendSlope.cycleP85 > 0 ? '+' : '' }}{{ data.trendSlope.cycleP85 }}d
          · p85 lead: {{ data.trendSlope.leadP85 > 0 ? '+' : '' }}{{ data.trendSlope.leadP85 }}d
        </p>
        <p class="text-[11px] text-gray-500 mt-1">
          {{ lowSampleBuckets > 0 ? `${lowSampleBuckets} bucket(s) have fewer than 5 samples; percentile swings may be noisy.` : 'All buckets have at least 5 samples.' }}
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Cycle vs Lead Distribution</h3>
          <ScatterChart
            v-if="data.cycleTime.data.length > 0"
            :datasets="[
              {
                label: 'Cycle Time',
                data: data.cycleTime.data.map((point, index) => ({ x: index + 1, y: point.cycleTimeDays || 0 })),
                backgroundColor: 'rgba(72,87,254,0.5)',
              },
              {
                label: 'Lead Time',
                data: data.leadTime.data.map((point, index) => ({ x: index + 1, y: point.leadTimeDays || 0 })),
                backgroundColor: 'rgba(124,58,237,0.45)',
              },
            ]"
            x-title="Task #"
            y-title="Days"
            :height="260"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No completed tasks with cycle-time samples</div>
        </div>

        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Cumulative Flow Diagram</h3>
          <StackedAreaChart
            v-if="data.cfd.length > 0"
            :labels="data.cfd.map((row) => String(row.date))"
            :datasets="statusKeys.map(status => ({
              label: statusLabel(status),
              data: (data?.cfd ?? []).map((row) => Number(row[status] || 0)),
              borderColor: STATUS_CHART_COLORS[status] || '#9CA3AF',
              backgroundColor: (STATUS_CHART_COLORS[status] || '#9CA3AF') + '40',
            }))"
            :height="260"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No CFD data available</div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Aging Work In Progress</h3>
        </div>
        <div v-if="data.agingWip.length > 0" class="overflow-x-auto">
          <table class="w-full text-xs min-w-[680px]">
            <thead>
              <tr class="border-b border-gray-50 text-left text-gray-400">
                <th class="px-5 py-3 font-medium">Task</th>
                <th class="px-5 py-3 font-medium">Status</th>
                <th class="px-5 py-3 font-medium">Priority</th>
                <th class="px-5 py-3 font-medium text-right">Age</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in data.agingWip.slice(0, 15)" :key="task.taskId" class="border-b border-gray-50 hover:bg-gray-50/50">
                <td class="px-5 py-3 font-medium max-w-[300px] truncate">
                  <router-link :to="`/tasks?task=${task.taskId}`" class="text-[#4857FE] hover:text-[#3E4BDE]">
                    {{ task.title }}
                  </router-link>
                </td>
                <td class="px-5 py-3">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium" :class="statusBg(String(task.status))">{{ statusLabel(String(task.status)) }}</span>
                </td>
                <td class="px-5 py-3">
                  <span class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: priorityColor(String(task.priority)) }" />
                    <span class="text-gray-600 capitalize">{{ task.priority }}</span>
                  </span>
                </td>
                <td class="px-5 py-3 text-right font-medium" :class="task.ageDays > 14 ? 'text-red-600' : task.ageDays > 7 ? 'text-amber-600' : 'text-gray-600'">
                  {{ formatDays(task.ageDays) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="px-5 py-10 text-center text-sm text-gray-400">No work in progress</div>
      </div>
    </template>
  </div>
</template>
