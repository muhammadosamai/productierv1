<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { AlertTriangle, Target, TrendingUp } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { fetchScopedMetricsJson } from './api'
import { CHART_COLORS } from './utils'
import type { PredictabilityMetricsResponse } from '@/types/metrics'
import LineChart from '@/components/charts/LineChart.vue'
import BarChart from '@/components/charts/BarChart.vue'
import ScatterChart from '@/components/charts/ScatterChart.vue'
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

const data = ref<PredictabilityMetricsResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const forecastBadgeClass = computed(() => {
  if (!data.value) return 'bg-gray-100 text-gray-600'
  if (data.value.forecast.confidenceBand === 'high') return 'bg-emerald-50 text-emerald-700'
  if (data.value.forecast.confidenceBand === 'medium') return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
})

const burnupSeries = computed(() => {
  if (!data.value) {
    return {
      labels: [] as string[],
      completed: [] as number[],
      scope: [] as number[],
    }
  }
  return {
    labels: data.value.burnupData.map((point) => point.date),
    completed: data.value.burnupData.map((point) => point.cumulative),
    scope: data.value.burnupData.map((point) => point.total),
  }
})

const forecastSpreadDays = computed(() => {
  if (!data.value?.forecast.p50Date || !data.value?.forecast.p85Date) return null
  const p50 = new Date(data.value.forecast.p50Date).getTime()
  const p85 = new Date(data.value.forecast.p85Date).getTime()
  if (!Number.isFinite(p50) || !Number.isFinite(p85)) return null
  return Math.max(0, Math.round((p85 - p50) / 86400000))
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

    const result = await fetchScopedMetricsJson<PredictabilityMetricsResponse>('predictability', {
      token: authStore.token,
      query: {
        organizationId: productStore.activeProduct?.organizationId || null,
        scopeMode: metricsScopeMode.value,
        productId: metricsScopeMode.value === 'product' ? metricsProductId.value : undefined,
        teamId: metricsScopeMode.value === 'team' ? metricsTeamId.value || undefined : undefined,
        period: String(props.period),
      },
      fallbackMessage: 'Failed to load predictability metrics',
    })

    if (result.error) {
      data.value = null
      error.value = result.error
      return
    }

    data.value = result.data
  } catch (e) {
    console.error('Failed to load predictability metrics', e)
    data.value = null
    error.value = 'Failed to load predictability metrics'
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
      No predictability metrics available for the selected product.
    </div>

    <template v-else>
      <MetricsMetaStrip :meta="data.meta" />

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Target :size="14" class="text-[#4857FE]" />
            <span class="text-xs font-medium text-gray-400 uppercase">Avg Predictability</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.avgPredictability }}%</div>
          <div class="text-xs text-gray-400 mt-1">Planned vs completed scope</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <TrendingUp :size="14" class="text-emerald-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Forecast Confidence</span>
            <MetricHelpPopover metric-key="predictability_confidence" />
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.forecast.confidenceScore }}%</div>
          <span class="inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize" :class="forecastBadgeClass">
            {{ data.forecast.confidenceBand }}
          </span>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <TrendingUp :size="14" class="text-blue-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Projected Completion</span>
          </div>
          <div class="text-sm font-semibold text-gray-900">
            {{ data.forecast.projectedCompletionDate ? new Date(data.forecast.projectedCompletionDate).toLocaleDateString() : '—' }}
          </div>
          <div class="text-xs text-gray-500 mt-1">P50: {{ data.forecast.p50Date ? new Date(data.forecast.p50Date).toLocaleDateString() : '—' }}</div>
          <div class="text-xs text-gray-500">P85: {{ data.forecast.p85Date ? new Date(data.forecast.p85Date).toLocaleDateString() : '—' }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <AlertTriangle :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Scope Volatility</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.scopeChangeCount }}</div>
          <div class="text-xs text-gray-400 mt-1">Tasks added after start</div>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Burnup with Forecast Context</h3>
        <LineChart
          v-if="burnupSeries.labels.length > 0"
          :labels="burnupSeries.labels"
          :datasets="[
            { label: 'Completed (cumulative)', data: burnupSeries.completed, borderColor: CHART_COLORS.success, backgroundColor: CHART_COLORS.successLight, fill: true },
            { label: 'Total Scope', data: burnupSeries.scope, borderColor: CHART_COLORS.gray, borderDash: [5, 5] },
          ]"
          y-title="Tasks"
          :height="280"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No burnup data available</div>
        <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div class="rounded-lg bg-blue-50 px-3 py-2">
            <p class="text-blue-700">P50 completion</p>
            <p class="font-semibold text-blue-700 mt-0.5">{{ data.forecast.p50Date ? new Date(data.forecast.p50Date).toLocaleDateString() : '—' }}</p>
          </div>
          <div class="rounded-lg bg-amber-50 px-3 py-2">
            <p class="text-amber-700">P85 completion</p>
            <p class="font-semibold text-amber-700 mt-0.5">{{ data.forecast.p85Date ? new Date(data.forecast.p85Date).toLocaleDateString() : '—' }}</p>
          </div>
          <div class="rounded-lg bg-gray-50 px-3 py-2">
            <p class="text-gray-600">Uncertainty spread</p>
            <p class="font-semibold text-gray-700 mt-0.5">{{ forecastSpreadDays !== null ? `${forecastSpreadDays} days` : '—' }}</p>
          </div>
        </div>
        <p class="mt-2 text-[11px] text-gray-500">
          Forecast dates come from throughput-derived projection and represent confidence ranges, not committed delivery dates.
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Delivery Risk Matrix (Variance x Scope x Risk)</h3>
          <ScatterChart
            v-if="data.riskMatrix.length > 0"
            :datasets="[{
              label: 'Deliveries',
              data: data.riskMatrix.map((point) => ({ x: point.scopeChange, y: point.varianceDays, r: Math.max(4, Math.min(18, point.riskScore / 2)), label: point.title })),
              backgroundColor: 'rgba(245,158,11,0.6)',
            }]"
            x-title="Scope Change Count"
            y-title="Schedule Variance (days)"
            :height="240"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No risk matrix data</div>
        </div>

        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Planned vs Completed by Delivery</h3>
          <BarChart
            v-if="data.deliveryMetrics.length > 0"
            :labels="data.deliveryMetrics.map((delivery) => delivery.title.length > 20 ? delivery.title.slice(0, 20) + '...' : delivery.title)"
            :datasets="[
              { label: 'Planned', data: data.deliveryMetrics.map((delivery) => delivery.planned), backgroundColor: CHART_COLORS.primaryLight },
              { label: 'Completed', data: data.deliveryMetrics.map((delivery) => delivery.completed), backgroundColor: CHART_COLORS.success },
            ]"
            :height="240"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No delivery data</div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Delivery Predictability and Confidence</h3>
        </div>
        <div v-if="data.deliveryMetrics.length > 0" class="overflow-x-auto">
          <table class="w-full text-xs min-w-[780px]">
            <thead>
              <tr class="border-b border-gray-50 text-left text-gray-400">
                <th class="px-5 py-3 font-medium">Delivery</th>
                <th class="px-5 py-3 font-medium text-center">Predictability</th>
                <th class="px-5 py-3 font-medium text-center">Variance</th>
                <th class="px-5 py-3 font-medium text-center">Scope Added</th>
                <th class="px-5 py-3 font-medium text-center">Confidence</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="delivery in data.deliveryMetrics" :key="delivery.deliveryId" class="border-b border-gray-50 hover:bg-gray-50/50">
                <td class="px-5 py-3 font-medium max-w-[260px] truncate">
                  <router-link :to="`/deliveries/${delivery.deliveryId}`" class="text-[#4857FE] hover:text-[#3E4BDE]">
                    {{ delivery.title }}
                  </router-link>
                </td>
                <td class="px-5 py-3 text-center">{{ delivery.predictability }}%</td>
                <td class="px-5 py-3 text-center" :class="delivery.scheduleVarianceDays > 0 ? 'text-red-600' : 'text-emerald-600'">
                  {{ delivery.scheduleVarianceDays > 0 ? '+' : '' }}{{ delivery.scheduleVarianceDays }}d
                </td>
                <td class="px-5 py-3 text-center">{{ delivery.scopeAddedAfterStart }}</td>
                <td class="px-5 py-3 text-center">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
                    :class="delivery.confidenceScore >= 75 ? 'bg-emerald-50 text-emerald-700' : delivery.confidenceScore >= 45 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'">
                    {{ delivery.confidenceScore }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="px-5 py-10 text-center text-sm text-gray-400">No deliveries found</div>
      </div>
    </template>
  </div>
</template>
