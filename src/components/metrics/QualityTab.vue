<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { Bug, CheckCircle2, Eye, RefreshCw } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { fetchScopedMetricsJson } from './api'
import { CHART_COLORS, priorityColor, statusBg, statusLabel } from './utils'
import type { QualityMetricsResponse } from '@/types/metrics'
import BarChart from '@/components/charts/BarChart.vue'
import LineChart from '@/components/charts/LineChart.vue'
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

const data = ref<QualityMetricsResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const qualityRateTrend = computed(() => {
  if (!data.value) {
    return {
      labels: [] as string[],
      reopenRates: [] as number[],
      reworkRates: [] as number[],
      targets: [] as number[],
    }
  }
  const reworkByWeekMap = new Map(data.value.reworkByWeek.map((point) => [point.date, point.count]))
  const labels = data.value.weeklyOutcomes.map((point) => point.bucket)
  const reopenRates = data.value.weeklyOutcomes.map((point) => {
    const denominator = Math.max(1, point.firstPass + point.reopened)
    return Math.round((point.reopened / denominator) * 100)
  })
  const reworkRates = data.value.weeklyOutcomes.map((point) => {
    const denominator = Math.max(1, point.firstPass + point.reopened)
    const reworkEvents = reworkByWeekMap.get(point.bucket) || 0
    return Math.round((reworkEvents / denominator) * 100)
  })
  return {
    labels,
    reopenRates,
    reworkRates,
    targets: labels.map(() => data.value?.reopenControl.targetRate ?? 0),
  }
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
    const result = await fetchScopedMetricsJson<QualityMetricsResponse>('quality', {
      token: authStore.token,
      query: {
        organizationId: productStore.activeProduct?.organizationId || null,
        scopeMode: metricsScopeMode.value,
        productId: metricsScopeMode.value === 'product' ? metricsProductId.value : undefined,
        teamId: metricsScopeMode.value === 'team' ? metricsTeamId.value || undefined : undefined,
        period: String(props.period),
      },
      fallbackMessage: 'Failed to load quality metrics',
    })

    if (result.error) {
      data.value = null
      error.value = result.error
      return
    }

    data.value = result.data
  } catch (e) {
    console.error('Failed to load quality metrics', e)
    data.value = null
    error.value = 'Failed to load quality metrics'
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
      No quality metrics available for the selected product.
    </div>

    <template v-else>
      <MetricsMetaStrip :meta="data.meta" />

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <CheckCircle2 :size="14" class="text-emerald-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">First-Pass Rate</span>
            <MetricHelpPopover metric-key="first_pass_rate" />
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.firstPassRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">n={{ data.totalCompleted }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <RefreshCw :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Rework Rate</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.reworkRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">{{ data.reworkCount }} tasks / {{ data.totalCompleted }} completed</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Bug :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Reopen Rate</span>
            <MetricHelpPopover metric-key="reopen_rate" />
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.reopenRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">{{ data.reopenCount }} events / {{ data.totalCompleted }} completed</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Bug :size="14" class="text-violet-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Escaped Defects</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.escapedDefects }}</div>
          <div class="text-xs text-gray-400 mt-1">Issues linked to deliveries</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Eye :size="14" class="text-blue-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">In Review</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.reviewLoad.reduce((sum, reviewer) => sum + reviewer.count, 0) }}</div>
          <div class="text-xs text-gray-400 mt-1">Current queue load</div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Weekly Quality Outcomes</h3>
          <BarChart
            v-if="data.weeklyOutcomes.length > 0"
            :labels="data.weeklyOutcomes.map((point) => point.bucket)"
            :datasets="[
              { label: 'First Pass', data: data.weeklyOutcomes.map((point) => point.firstPass), backgroundColor: CHART_COLORS.success },
              { label: 'Reopened', data: data.weeklyOutcomes.map((point) => point.reopened), backgroundColor: CHART_COLORS.warning },
              { label: 'Escaped', data: data.weeklyOutcomes.map((point) => point.escaped), backgroundColor: CHART_COLORS.danger },
            ]"
            :stacked="true"
            :height="230"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No weekly quality outcomes</div>
        </div>

        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Rework vs Reopen Control</h3>
          <LineChart
            v-if="qualityRateTrend.labels.length > 0"
            :labels="qualityRateTrend.labels"
            :datasets="[
              { label: 'Reopen Rate', data: qualityRateTrend.reopenRates, borderColor: CHART_COLORS.warning, backgroundColor: CHART_COLORS.warningLight, fill: true },
              { label: 'Rework Rate', data: qualityRateTrend.reworkRates, borderColor: CHART_COLORS.primary, backgroundColor: 'transparent', borderDash: [4, 4] },
              { label: 'Target', data: qualityRateTrend.targets, borderColor: CHART_COLORS.gray, backgroundColor: 'transparent', borderDash: [5, 5], pointRadius: 0 },
            ]"
            y-title="%"
            :height="230"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No quality control points</div>
          <p class="text-[11px] text-gray-500 mt-2">
            Denominator per bucket = completed tasks (first pass + reopened) in that week.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">First Pass Yield by Priority</h3>
          <BarChart
            v-if="data.firstPassByPriority.length > 0"
            :labels="data.firstPassByPriority.map((row) => row.priority)"
            :datasets="[
              { label: 'First Pass', data: data.firstPassByPriority.map((row) => row.firstPass), backgroundColor: CHART_COLORS.success },
              { label: 'Total', data: data.firstPassByPriority.map((row) => row.total), backgroundColor: CHART_COLORS.primaryLight },
            ]"
            :height="230"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No priority breakdown</div>
        </div>

        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">First Pass Yield by Type</h3>
          <BarChart
            v-if="data.firstPassByType.length > 0"
            :labels="data.firstPassByType.map((row) => row.type)"
            :datasets="[
              { label: 'First Pass', data: data.firstPassByType.map((row) => row.firstPass), backgroundColor: CHART_COLORS.success },
              { label: 'Total', data: data.firstPassByType.map((row) => row.total), backgroundColor: CHART_COLORS.primaryLight },
            ]"
            :height="230"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No type breakdown</div>
        </div>
      </div>

      <p class="text-xs text-gray-500 bg-white border border-gray-100 rounded-lg px-3 py-2">
        {{ data.taxonomyNote }}
      </p>

      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Reworked Tasks</h3>
        </div>
        <div v-if="data.reworkedTasks.length > 0" class="overflow-x-auto">
          <table class="w-full text-xs min-w-[720px]">
            <thead>
              <tr class="border-b border-gray-50 text-left text-gray-400">
                <th class="px-5 py-3 font-medium">Task</th>
                <th class="px-5 py-3 font-medium">Status</th>
                <th class="px-5 py-3 font-medium">Priority</th>
                <th class="px-5 py-3 font-medium text-right">Rework Count</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in data.reworkedTasks" :key="task.taskId" class="border-b border-gray-50 hover:bg-gray-50/50">
                <td class="px-5 py-3 font-medium max-w-[320px] truncate">
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
                <td class="px-5 py-3 text-right">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">{{ task.reworkCount }}x</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="px-5 py-10 text-center text-sm text-gray-400">No reworked tasks in this period</div>
      </div>
    </template>
  </div>
</template>
