<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { fetchScopedMetricsJson } from '@/components/metrics/api'
import { TEAM_LEAD_KPI_BY_KEY } from '@/components/metrics/teamLeadKpis'
import type { TeamLeadKpiKey, TeamLeadKpisResponse, TeamLeadKpiValue } from '@/types/metrics'

const props = defineProps<{
  period: number
  kpiKey: TeamLeadKpiKey
}>()

const authStore = useAuthStore()
const productStore = useProductStore()
const metricsProductId = inject<ComputedRef<string>>(
  'metricsProductId',
  computed(() => productStore.activeProduct?.id || ''),
)
const metricsScopeMode = inject<Ref<'product' | 'all' | 'team'>>('metricsScopeMode', ref('product'))
const metricsTeamId = inject<Ref<string>>('metricsTeamId', ref(''))

const data = ref<TeamLeadKpisResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const kpiDefinition = computed(() => TEAM_LEAD_KPI_BY_KEY[props.kpiKey])
const kpiValue = computed<TeamLeadKpiValue | null>(() => {
  if (!data.value) return null
  return data.value.items?.[props.kpiKey] || null
})

function formatKpiValue(kpi: TeamLeadKpiValue): string {
  const value = Number.isFinite(kpi.value) ? kpi.value : 0
  if (kpi.unit === 'percent') return `${Math.round(value)}%`
  if (kpi.unit === 'ratio') return value.toFixed(2)
  if (kpi.unit === 'hours') return `${value.toFixed(1)}h`
  if (kpi.unit === 'days') return `${value.toFixed(1)}d`
  return `${Math.round(value)}`
}

function formatDelta(kpi: TeamLeadKpiValue): string {
  const delta = Number.isFinite(kpi.deltaValue) ? kpi.deltaValue : 0
  if (Math.abs(delta) < 0.01) return 'No change'
  const prefix = delta > 0 ? '+' : ''
  if (kpi.unit === 'percent') return `${prefix}${Math.round(delta)}pp`
  if (kpi.unit === 'ratio') return `${prefix}${delta.toFixed(2)}`
  if (kpi.unit === 'hours') return `${prefix}${delta.toFixed(1)}h`
  if (kpi.unit === 'days') return `${prefix}${delta.toFixed(1)}d`
  return `${prefix}${Math.round(delta)}`
}

const trendMeta = computed(() => {
  const kpi = kpiValue.value
  if (!kpi) {
    return {
      icon: Minus,
      className: 'text-gray-400',
      text: 'No trend',
    }
  }
  if (kpi.trendDirection === 'up') {
    return {
      icon: TrendingUp,
      className: 'text-emerald-600',
      text: `Up ${formatDelta(kpi)}`,
    }
  }
  if (kpi.trendDirection === 'down') {
    return {
      icon: TrendingDown,
      className: 'text-red-500',
      text: `Down ${formatDelta(kpi)}`,
    }
  }
  return {
    icon: Minus,
    className: 'text-gray-400',
    text: formatDelta(kpi),
  }
})

const supportingRows = computed(() => {
  const supporting = kpiValue.value?.supporting || {}
  return Object.entries(supporting).slice(0, 2)
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

    const result = await fetchScopedMetricsJson<TeamLeadKpisResponse>('teamLeadKpis', {
      token: authStore.token,
      query: {
        organizationId: productStore.activeProduct?.organizationId || null,
        scopeMode: metricsScopeMode.value,
        productId: metricsScopeMode.value === 'product' ? metricsProductId.value : undefined,
        teamId: metricsScopeMode.value === 'team' ? metricsTeamId.value || undefined : undefined,
        period: String(props.period),
      },
      fallbackMessage: 'Failed to load team lead KPI metrics',
    })

    if (result.error) {
      data.value = null
      error.value = result.error
      return
    }
    data.value = result.data
  } catch (fetchError) {
    console.error('Failed to load team lead KPI metrics', fetchError)
    data.value = null
    error.value = 'Failed to load team lead KPI metrics'
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
        <p class="text-xs font-medium uppercase tracking-wide text-gray-400">
          {{ kpiDefinition.label }}
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

        <div v-if="kpiValue.warning" class="flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle :size="14" />
          <span>Needs attention</span>
        </div>

        <div v-if="supportingRows.length > 0" class="space-y-1">
          <div
            v-for="[supportingKey, supportingValue] in supportingRows"
            :key="supportingKey"
            class="flex items-center justify-between text-[11px] text-gray-500"
          >
            <span class="truncate">{{ supportingKey }}</span>
            <span class="ml-2 font-medium text-gray-700">{{ Number(supportingValue).toFixed(1) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
