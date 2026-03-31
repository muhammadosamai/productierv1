<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ArrowDown, ArrowUp, TrendingUp } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { fetchScopedMetricsJson } from './api'
import { CHART_COLORS } from './utils'
import type { ThroughputMetricsResponse } from '@/types/metrics'
import LineChart from '@/components/charts/LineChart.vue'
import BarChart from '@/components/charts/BarChart.vue'
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

const data = ref<ThroughputMetricsResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const netFlowTotal = computed(() => {
  if (!data.value) return 0
  return data.value.completedOverTime.reduce((sum, bucket) => sum + bucket.netFlow, 0)
})

const isSmallData = computed(() => (data.value?.completedOverTime.length || 0) <= 8)
const isLargeData = computed(() => (data.value?.completedOverTime.length || 0) > 26)

const orderedTypes = computed(() => {
  if (!data.value) return []
  return Object.entries(data.value.byType).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0].localeCompare(b[0])
  })
})

const typePalette = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.purple,
  CHART_COLORS.sky,
  CHART_COLORS.gray,
]

function colorForType(type: string) {
  let hash = 0
  for (let index = 0; index < type.length; index += 1) {
    hash = (hash * 31 + type.charCodeAt(index)) >>> 0
  }
  return typePalette[hash % typePalette.length] || CHART_COLORS.primary
}

const variabilityBand = computed(() => {
  if (!data.value) {
    return {
      upper: [] as number[],
      lower: [] as number[],
    }
  }
  return {
    upper: data.value.completedOverTime.map((bucket) => Math.round((bucket.rollingMean + bucket.rollingStd) * 10) / 10),
    lower: data.value.completedOverTime.map((bucket) => Math.round((bucket.rollingMean - bucket.rollingStd) * 10) / 10),
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
    const granularity = props.period <= 14 ? 'day' : props.period <= 90 ? 'week' : 'month'
    const result = await fetchScopedMetricsJson<ThroughputMetricsResponse>('throughput', {
      token: authStore.token,
      query: {
        organizationId: productStore.activeProduct?.organizationId || null,
        scopeMode: metricsScopeMode.value,
        productId: metricsScopeMode.value === 'product' ? metricsProductId.value : undefined,
        teamId: metricsScopeMode.value === 'team' ? metricsTeamId.value || undefined : undefined,
        period: String(props.period),
        granularity,
      },
      fallbackMessage: 'Failed to load throughput metrics',
    })

    if (result.error) {
      data.value = null
      error.value = result.error
      return
    }

    data.value = result.data
  } catch (e) {
    console.error('Failed to load throughput metrics', e)
    data.value = null
    error.value = 'Failed to load throughput metrics'
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
      No throughput metrics available for the selected product.
    </div>

    <template v-else>
      <MetricsMetaStrip :meta="data.meta" />

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <p class="text-xs text-gray-400 uppercase tracking-wide">Arrival</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ data.totalCreated }}</p>
          <p class="text-xs text-gray-500 mt-1">Created work in selected period</p>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <p class="text-xs text-gray-400 uppercase tracking-wide">Departure</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ data.totalCompleted }}</p>
          <p class="text-xs text-gray-500 mt-1">Completed work in selected period</p>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center justify-between">
            <p class="text-xs text-gray-400 uppercase tracking-wide">Net Flow</p>
            <MetricHelpPopover metric-key="net_flow" />
          </div>
          <p class="text-2xl font-bold mt-1" :class="netFlowTotal <= 0 ? 'text-emerald-600' : 'text-amber-600'">
            {{ netFlowTotal > 0 ? '+' : '' }}{{ netFlowTotal }}
          </p>
          <p class="text-xs mt-1" :class="netFlowTotal <= 0 ? 'text-emerald-600' : 'text-amber-600'">
            {{ netFlowTotal <= 0 ? 'Healthy backlog trend' : 'Backlog growing faster than completion' }}
          </p>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-1 text-xs text-gray-400 uppercase tracking-wide">
            <TrendingUp :size="13" />
            Stability
          </div>
          <p class="text-sm font-semibold mt-2" :class="data.health.healthy ? 'text-emerald-700' : 'text-amber-700'">
            {{ data.health.healthy ? 'Healthy' : 'Watch' }}
          </p>
          <p class="text-xs text-gray-500 mt-1">{{ data.health.hint }}</p>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            System Balance (Arrival vs Departure)
            <MetricHelpPopover metric-key="system_balance" />
          </h3>
          <span class="text-xs text-gray-400">
            {{ isSmallData ? 'Small sample: exact values emphasized' : isLargeData ? 'Large sample: aggregated buckets' : 'Standard range' }}
          </span>
        </div>
        <LineChart
          v-if="data.completedOverTime.length > 0"
          :labels="data.completedOverTime.map((bucket) => bucket.date)"
          :datasets="[
            { label: 'Rolling Mean - 1σ', data: variabilityBand.lower, borderColor: 'rgba(245,158,11,0.25)', backgroundColor: 'transparent', pointRadius: 0, borderWidth: 1 },
            { label: 'Rolling Mean + 1σ', data: variabilityBand.upper, borderColor: 'rgba(245,158,11,0.25)', backgroundColor: 'rgba(245,158,11,0.15)', fill: '-1', pointRadius: 0, borderWidth: 1 },
            { label: 'Arrival', data: data.completedOverTime.map((bucket) => bucket.arrivalRate), borderColor: CHART_COLORS.primary, backgroundColor: 'transparent', borderDash: [4, 4] },
            { label: 'Departure', data: data.completedOverTime.map((bucket) => bucket.departureRate), borderColor: CHART_COLORS.success, backgroundColor: 'transparent' },
            { label: 'Rolling Net Mean', data: data.completedOverTime.map((bucket) => bucket.rollingMean), borderColor: CHART_COLORS.warning, backgroundColor: 'transparent', pointRadius: 2 },
          ]"
          y-title="Tasks per bucket"
          :height="280"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No throughput data for this period</div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Net Flow by Period</h3>
          <BarChart
            v-if="data.completedOverTime.length > 0"
            :labels="data.completedOverTime.map((bucket) => bucket.date)"
            :datasets="[
              {
                label: 'Net Flow',
                data: data.completedOverTime.map((bucket) => bucket.netFlow),
                backgroundColor: data.completedOverTime.map((bucket) => bucket.netFlow <= 0 ? CHART_COLORS.success : CHART_COLORS.warning),
              },
            ]"
            :height="220"
            :show-legend="false"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No net-flow buckets</div>
          <div class="flex flex-wrap items-center gap-3 sm:gap-4 text-[11px] text-gray-500 mt-3">
            <span class="inline-flex items-center gap-1"><ArrowDown :size="12" class="text-emerald-600" /> negative = healthy drawdown</span>
            <span class="inline-flex items-center gap-1"><ArrowUp :size="12" class="text-amber-600" /> positive = backlog growth</span>
          </div>
        </div>

        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Completed by Type</h3>
          <BarChart
            v-if="orderedTypes.length > 0"
            :labels="orderedTypes.map(([type]) => type)"
            :datasets="[{ label: 'Count', data: orderedTypes.map(([, count]) => count), backgroundColor: orderedTypes.map(([type]) => colorForType(type)) }]"
            :height="220"
            :show-legend="false"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No type breakdown data</div>
        </div>
      </div>
    </template>
  </div>
</template>
