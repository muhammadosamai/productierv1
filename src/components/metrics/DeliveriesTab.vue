<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { CheckCircle2, Package, TrendingUp } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { enumValueLabel } from '@/composables/useDomainOptions'
import { fetchScopedMetricsJson } from './api'
import { CHART_COLORS, formatDate } from './utils'
import type { DeliveriesMetricsResponse } from '@/types/metrics'
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

const data = ref<DeliveriesMetricsResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedRiskBadge = ref<'all' | 'on_track' | 'watch' | 'at_risk'>('all')

const filteredDeliveries = computed(() => {
  if (!data.value) return []
  if (selectedRiskBadge.value === 'all') return data.value.deliveryDetails
  return data.value.deliveryDetails.filter((delivery) => delivery.riskBadge === selectedRiskBadge.value)
})

function riskBadgeLabel(value: string): string {
  return enumValueLabel(value)
}

const timelineSeries = computed(() => {
  const now = Date.now()
  const labels = filteredDeliveries.value.map((delivery) =>
    delivery.title.length > 18 ? `${delivery.title.slice(0, 18)}...` : delivery.title
  )
  const plannedDays = filteredDeliveries.value.map((delivery) => {
    if (!delivery.endDate) return 0
    return Math.round((new Date(delivery.endDate).getTime() - now) / 86400000)
  })
  const projectedDays = filteredDeliveries.value.map((delivery) => {
    if (!delivery.projectedEndDate) return 0
    return Math.round((new Date(delivery.projectedEndDate).getTime() - now) / 86400000)
  })
  return { labels, plannedDays, projectedDays }
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
    const result = await fetchScopedMetricsJson<DeliveriesMetricsResponse>('deliveries', {
      token: authStore.token,
      query: {
        organizationId: productStore.activeProduct?.organizationId || null,
        scopeMode: metricsScopeMode.value,
        productId: metricsScopeMode.value === 'product' ? metricsProductId.value : undefined,
        teamId: metricsScopeMode.value === 'team' ? metricsTeamId.value || undefined : undefined,
        period: String(props.period),
      },
      fallbackMessage: 'Failed to load deliveries metrics',
    })

    if (result.error) {
      data.value = null
      error.value = result.error
      return
    }

    data.value = result.data
  } catch (e) {
    console.error('Failed to load deliveries metrics', e)
    data.value = null
    error.value = 'Failed to load deliveries metrics'
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
      No deliveries metrics available for the selected product.
    </div>

    <template v-else>
      <MetricsMetaStrip :meta="data.meta" />

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Package :size="14" class="text-[#4857FE]" />
            <span class="text-xs font-medium text-gray-400 uppercase">Total Deliveries</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.total }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <TrendingUp :size="14" class="text-blue-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Active</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.activeDeliveries }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <CheckCircle2 :size="14" class="text-emerald-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Avg Progress</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.avgProgress }}%</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Package :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">At Risk</span>
            <MetricHelpPopover metric-key="schedule_variance" />
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.deliveryDetails.filter((delivery) => delivery.riskBadge === 'at_risk').length }}</div>
          <div class="text-xs text-gray-400 mt-1">Based on variance/scope/blockers</div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex flex-wrap gap-2 mb-4">
            <button type="button" class="px-2.5 py-1 rounded-full text-xs border" :class="selectedRiskBadge === 'all' ? 'bg-[#4857FE] border-[#4857FE] text-white' : 'bg-white border-gray-200 text-gray-600'" @click="selectedRiskBadge = 'all'">
              All ({{ data.deliveryDetails.length }})
            </button>
            <button type="button" class="px-2.5 py-1 rounded-full text-xs border" :class="selectedRiskBadge === 'on_track' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-emerald-200 text-emerald-700'" @click="selectedRiskBadge = 'on_track'">
              On Track ({{ data.deliveryDetails.filter((delivery) => delivery.riskBadge === 'on_track').length }})
            </button>
            <button type="button" class="px-2.5 py-1 rounded-full text-xs border" :class="selectedRiskBadge === 'watch' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-200 text-amber-700'" @click="selectedRiskBadge = 'watch'">
              Watch ({{ data.deliveryDetails.filter((delivery) => delivery.riskBadge === 'watch').length }})
            </button>
            <button type="button" class="px-2.5 py-1 rounded-full text-xs border" :class="selectedRiskBadge === 'at_risk' ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-red-200 text-red-700'" @click="selectedRiskBadge = 'at_risk'">
              At Risk ({{ data.deliveryDetails.filter((delivery) => delivery.riskBadge === 'at_risk').length }})
            </button>
          </div>
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Schedule Variance by Delivery (days)</h3>
          <BarChart
            v-if="filteredDeliveries.length > 0"
            :labels="filteredDeliveries.map((delivery) => delivery.title.length > 18 ? delivery.title.slice(0, 18) + '...' : delivery.title)"
            :datasets="[
              {
                label: 'Variance',
                data: filteredDeliveries.map((delivery) => delivery.scheduleVarianceDays),
                backgroundColor: filteredDeliveries.map((delivery) => delivery.scheduleVarianceDays > 0 ? CHART_COLORS.danger : CHART_COLORS.success),
              },
            ]"
            :height="230"
            :show-legend="false"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No delivery schedule data for this filter</div>
        </div>

        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Scope Volatility vs Variance (bubble = scope size)</h3>
          <ScatterChart
            v-if="filteredDeliveries.length > 0"
            :datasets="[{
              label: 'Deliveries',
              data: filteredDeliveries.map((delivery) => ({
                x: delivery.scopeAddedAfterStart,
                y: delivery.scheduleVarianceDays,
                r: Math.max(4, Math.min(18, Math.sqrt(Math.max(1, delivery.totalTasks)) * 2)),
                label: delivery.title,
              })),
              backgroundColor: 'rgba(72,87,254,0.55)',
            }]"
            x-title="Scope added after start"
            y-title="Schedule variance (days)"
            :height="230"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No volatility points for this filter</div>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Planned vs Projected Timeline (days from today)</h3>
        <BarChart
          v-if="timelineSeries.labels.length > 0"
          :labels="timelineSeries.labels"
          :datasets="[
            { label: 'Planned end', data: timelineSeries.plannedDays, backgroundColor: CHART_COLORS.primaryLight },
            { label: 'Projected end', data: timelineSeries.projectedDays, backgroundColor: CHART_COLORS.warning },
          ]"
          :height="240"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No timeline data for this filter</div>
        <p class="text-[11px] text-gray-500 mt-2">Positive values are days remaining; negative values are days past due.</p>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-gray-700">Delivery Risk Detail</h3>
        <div v-for="delivery in filteredDeliveries" :key="delivery.id" class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
            <div class="flex items-center gap-3">
              <router-link :to="`/deliveries/${delivery.id}`" class="text-sm font-semibold text-[#4857FE] hover:text-[#3E4BDE] truncate">
                {{ delivery.title }}
              </router-link>
              <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium capitalize"
                :class="delivery.riskBadge === 'on_track' ? 'bg-emerald-50 text-emerald-700' : delivery.riskBadge === 'watch' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'">
                {{ riskBadgeLabel(delivery.riskBadge) }}
              </span>
            </div>
            <div class="text-xs text-gray-500">
              Planned: {{ delivery.endDate ? formatDate(delivery.endDate) : '—' }} · Projected:
              {{ delivery.projectedEndDate ? formatDate(delivery.projectedEndDate) : '—' }}
            </div>
          </div>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div class="rounded-lg bg-gray-50 px-3 py-2">
              <p class="text-gray-500">Variance</p>
              <p class="font-semibold" :class="delivery.scheduleVarianceDays > 0 ? 'text-red-600' : 'text-emerald-600'">
                {{ delivery.scheduleVarianceDays > 0 ? '+' : '' }}{{ delivery.scheduleVarianceDays }} days
              </p>
            </div>
            <div class="rounded-lg bg-gray-50 px-3 py-2">
              <p class="text-gray-500">Scope Added</p>
              <p class="font-semibold text-gray-700">{{ delivery.scopeAddedAfterStart }}</p>
            </div>
            <div class="rounded-lg bg-gray-50 px-3 py-2">
              <p class="text-gray-500">Progress</p>
              <p class="font-semibold text-gray-700">{{ delivery.progress }}%</p>
            </div>
            <div class="rounded-lg bg-gray-50 px-3 py-2">
              <p class="text-gray-500">Velocity</p>
              <p class="font-semibold text-gray-700">{{ delivery.velocity }} tasks/week</p>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <span v-for="reason in delivery.riskReasons" :key="reason" class="inline-flex px-2 py-1 rounded-md text-[11px] bg-gray-50 text-gray-600">
              {{ reason }}
            </span>
          </div>
        </div>
        <div v-if="filteredDeliveries.length === 0" class="text-center py-10 text-sm text-gray-400">No deliveries found for this filter</div>
      </div>
    </template>
  </div>
</template>
