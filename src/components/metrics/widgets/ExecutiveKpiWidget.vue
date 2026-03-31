<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import MetricHelpPopover from '@/components/metrics/MetricHelpPopover.vue'
import { EXECUTIVE_KPI_BY_KEY } from '@/components/metrics/executiveKpis'
import { fetchExecutiveKpisShared } from '@/components/metrics/executiveKpiDataset'
import type {
  ExecutiveKpiKey,
  ExecutiveKpisResponse,
  ExecutiveKpiValue,
} from '@/types/metrics'

const props = defineProps<{
  period: number
  kpiKey: ExecutiveKpiKey
}>()

const authStore = useAuthStore()
const productStore = useProductStore()
const metricsProductId = inject<ComputedRef<string>>(
  'metricsProductId',
  computed(() => productStore.activeProduct?.id || ''),
)
const metricsScopeMode = inject<Ref<'product' | 'all' | 'team'>>('metricsScopeMode', ref('product'))
const metricsTeamId = inject<Ref<string>>('metricsTeamId', ref(''))

const data = ref<ExecutiveKpisResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const kpiDefinition = computed(() => EXECUTIVE_KPI_BY_KEY[props.kpiKey])
const kpiValue = computed<ExecutiveKpiValue | null>(() => {
  if (!data.value) return null
  return data.value.kpis?.[props.kpiKey] || null
})

const glossaryKeyByKpi: Record<ExecutiveKpiKey, string> = {
  portfolioHealthScore: 'exec_portfolio_health_score',
  deliveryConfidenceDistribution: 'exec_delivery_confidence_distribution',
  forecastBias: 'exec_forecast_bias',
  scopeVolatilityBurn: 'exec_scope_volatility_burn',
  riskBurndown: 'exec_risk_burndown',
  initiativeExecutionConfidence: 'exec_initiative_execution_confidence',
  qualityCostIndex: 'exec_quality_cost_index',
  throughputStabilityIndex: 'exec_throughput_stability_index',
  crossProductBottleneckHeatmap: 'exec_cross_product_bottleneck_heatmap',
  customerImpactProxy: 'exec_customer_impact_proxy',
}

const trendMeta = computed(() => {
  const value = kpiValue.value?.value ?? 0
  if (props.kpiKey === 'riskBurndown') {
    if (value < 0) return { icon: TrendingDown, className: 'text-emerald-600', text: `${Math.round(value)} tasks vs prior week` }
    if (value > 0) return { icon: TrendingUp, className: 'text-red-500', text: `+${Math.round(value)} tasks vs prior week` }
    return { icon: Minus, className: 'text-gray-400', text: 'No weekly change' }
  }
  if (props.kpiKey === 'forecastBias') {
    if (value > 1) return { icon: TrendingUp, className: 'text-red-500', text: `${value.toFixed(1)}d late bias` }
    if (value < -1) return { icon: TrendingDown, className: 'text-emerald-600', text: `${Math.abs(value).toFixed(1)}d early bias` }
    return { icon: Minus, className: 'text-gray-400', text: 'Balanced forecast bias' }
  }
  if (props.kpiKey === 'qualityCostIndex' || props.kpiKey === 'customerImpactProxy') {
    if (value >= 70) return { icon: AlertTriangle, className: 'text-red-500', text: 'High pressure' }
    if (value >= 40) return { icon: Minus, className: 'text-amber-600', text: 'Moderate pressure' }
    return { icon: TrendingDown, className: 'text-emerald-600', text: 'Low pressure' }
  }
  if (value >= 75) return { icon: TrendingUp, className: 'text-emerald-600', text: 'Healthy range' }
  if (value >= 45) return { icon: Minus, className: 'text-amber-600', text: 'Watch range' }
  return { icon: AlertTriangle, className: 'text-red-500', text: 'At-risk range' }
})

function formatKpiValue(kpi: ExecutiveKpiValue): string {
  const value = Number.isFinite(kpi.value) ? kpi.value : 0
  if (props.kpiKey === 'forecastBias') return `${value > 0 ? '+' : ''}${value.toFixed(1)}d`
  if (props.kpiKey === 'riskBurndown') return `${value > 0 ? '+' : ''}${Math.round(value)}`
  if (kpi.unit === 'percent_high') return `${Math.round(value)}%`
  if (kpi.unit === 'days') return `${value.toFixed(1)}d`
  return `${Math.round(value)}`
}

const supportingRows = computed<Array<{ label: string; value: string }>>(() => {
  const payload = data.value
  if (!payload) return []
  if (props.kpiKey === 'deliveryConfidenceDistribution') {
    const details = payload.details.deliveryConfidenceDistribution
    return [
      { label: 'High confidence', value: `${details.high} (${details.highPercent}%)` },
      { label: 'Medium confidence', value: String(details.medium) },
      { label: 'Low confidence', value: String(details.low) },
    ]
  }
  if (props.kpiKey === 'forecastBias') {
    const details = payload.details.forecastBias
    return [
      { label: 'Direction', value: details.direction },
      { label: 'Late / Early', value: `${details.lateCount} / ${details.earlyCount}` },
      { label: 'By-product slices', value: String(details.byProduct.length) },
    ]
  }
  if (props.kpiKey === 'scopeVolatilityBurn') {
    const details = payload.details.scopeVolatilityBurn
    return [
      { label: 'Scope added after start', value: String(details.totalScopeAddedAfterStart) },
      { label: 'Planned scope baseline', value: String(details.totalPlannedScope) },
      { label: 'Trend buckets', value: String(details.trend.length) },
    ]
  }
  if (props.kpiKey === 'riskBurndown') {
    const details = payload.details.riskBurndown
    return [
      { label: 'Current at-risk', value: String(details.currentAtRisk) },
      { label: 'Previous at-risk', value: String(details.previousAtRisk) },
      { label: 'Initiative slices', value: String(details.byInitiative.length) },
    ]
  }
  if (props.kpiKey === 'initiativeExecutionConfidence') {
    const details = payload.details.initiativeExecutionConfidence
    return [
      { label: 'High / Med / Low', value: `${details.bands.high} / ${details.bands.medium} / ${details.bands.low}` },
      { label: 'Tracked initiatives', value: String(details.items.length) },
    ]
  }
  if (props.kpiKey === 'qualityCostIndex') {
    const details = payload.details.qualityCostIndex
    return [
      { label: 'Rework rate', value: `${Math.round(details.reworkRate)}%` },
      { label: 'Reopen rate', value: `${Math.round(details.reopenRate)}%` },
      { label: 'Escaped defects', value: String(details.escapedDefects) },
    ]
  }
  if (props.kpiKey === 'throughputStabilityIndex') {
    const details = payload.details.throughputStabilityIndex
    return [
      { label: 'Mean departure', value: details.meanDeparture.toFixed(1) },
      { label: 'Std departure', value: details.stdDeparture.toFixed(1) },
      { label: 'CV', value: details.coefficientOfVariation.toFixed(2) },
    ]
  }
  if (props.kpiKey === 'crossProductBottleneckHeatmap') {
    const details = payload.details.crossProductBottleneckHeatmap
    return [
      { label: 'Max bottleneck score', value: String(details.maxScore) },
      { label: 'Products in scope', value: String(details.cells.length) },
    ]
  }
  if (props.kpiKey === 'customerImpactProxy') {
    const details = payload.details.customerImpactProxy
    return [
      { label: 'Critical open feedback', value: String(details.criticalOpenFeedback) },
      { label: 'P85 acknowledge', value: `${details.p85AcknowledgeHours.toFixed(1)}h` },
      { label: 'P85 resolve', value: `${details.p85ResolveHours.toFixed(1)}h` },
    ]
  }
  const details = payload.details.portfolioHealthScore
  return [
    { label: 'Predictability subscore', value: String(details.components.predictabilityScore) },
    { label: 'Quality subscore', value: String(details.components.qualityScore) },
    { label: 'Workload balance score', value: String(details.components.workloadBalanceScore) },
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

    const result = await fetchExecutiveKpisShared({
      token: authStore.token,
      organizationId: productStore.activeProduct?.organizationId || null,
      scopeMode: metricsScopeMode.value,
      productId: metricsProductId.value,
      teamId: metricsTeamId.value || undefined,
      period: props.period,
    })
    if (result.error) {
      data.value = null
      error.value = /not found/i.test(result.error)
        ? 'Executive KPI endpoint is unavailable in this environment.'
        : result.error
      return
    }
    data.value = result.data
  } catch (fetchError) {
    console.error('Failed to load executive KPI metrics', fetchError)
    data.value = null
    error.value = 'Failed to load executive KPI metrics'
  } finally {
    loading.value = false
  }
}

watch(
  () => [
    props.period,
    props.kpiKey,
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
  <div class="h-full p-4">
    <div v-if="loading" class="flex h-full items-center justify-center">
      <div class="h-5 w-5 animate-spin rounded-full border-2 border-[#4857FE] border-t-transparent" />
    </div>

    <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {{ error }}
    </div>

    <div v-else-if="!kpiValue" class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
      KPI data unavailable.
    </div>

    <div v-else class="flex h-full flex-col justify-between gap-3">
      <div class="space-y-1">
        <p class="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          {{ kpiDefinition.label }}
          <MetricHelpPopover :metric-key="glossaryKeyByKpi[props.kpiKey]" />
        </p>
        <p class="text-2xl font-semibold text-gray-900">
          {{ formatKpiValue(kpiValue) }}
        </p>
        <p class="text-xs text-gray-500">
          {{ kpiDefinition.description }}
        </p>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-1.5 text-xs font-medium" :class="trendMeta.className">
          <component :is="trendMeta.icon" :size="14" />
          <span>{{ trendMeta.text }}</span>
        </div>

        <div class="text-[11px] text-gray-500">
          Sample size: <span class="font-medium text-gray-700">{{ kpiValue.sampleSize }}</span>
        </div>

        <div v-if="supportingRows.length > 0" class="space-y-1">
          <div
            v-for="row in supportingRows"
            :key="row.label"
            class="flex items-center justify-between text-[11px] text-gray-500"
          >
            <span class="truncate">{{ row.label }}</span>
            <span class="ml-2 font-medium text-gray-700">{{ row.value }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

