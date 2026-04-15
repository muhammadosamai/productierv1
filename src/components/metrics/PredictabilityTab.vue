<script setup lang="ts">
import { ref, watch } from 'vue'
import { Target, TrendingUp, AlertTriangle, Layers } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { CHART_COLORS } from './utils'
import LineChart from '@/components/charts/LineChart.vue'
import BarChart from '@/components/charts/BarChart.vue'
import ScatterChart from '@/components/charts/ScatterChart.vue'

const props = defineProps<{ period: number }>()
const productStore = useProductStore()

const data = ref<any>(null)
const loading = ref(true)
const selectedDelivery = ref<string>('')

async function fetchData() {
  loading.value = true
  try {
    const product = productStore.activeProductScopeForApi || ''
    const res = await fetch(`/api/metrics/predictability?product=${encodeURIComponent(product)}&period=${props.period}`)
    data.value = await res.json()
    if (data.value.deliveryMetrics.length > 0 && !selectedDelivery.value) {
      selectedDelivery.value = data.value.deliveryMetrics[0].deliveryId
    }
  } catch (e) { console.error('Failed to load predictability metrics', e) }
  loading.value = false
}

watch(() => [props.period, productStore.activeProductScopeForApi], fetchData, { immediate: true })
</script>

<template>
  <div class="p-8 space-y-6">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-[#4857FE] border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else-if="data">
      <!-- KPI Cards -->
      <div class="grid grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Target :size="14" class="text-[#4857FE]" />
            <span class="text-xs font-medium text-gray-400 uppercase">Avg Predictability</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.avgPredictability }}%</div>
          <div class="text-xs text-gray-400 mt-1">planned vs completed</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <TrendingUp :size="14" class="text-emerald-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">On-Time Rate</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.onTimeRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">tasks delivered on time</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <AlertTriangle :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Overdue</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.overdueCount }}</div>
          <div class="text-xs text-gray-400 mt-1">tasks past due date</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Layers :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Scope Change</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.scopeChangeCount }}</div>
          <div class="text-xs text-gray-400 mt-1">tasks added after start</div>
        </div>
      </div>

      <!-- Burnup Chart -->
      <div class="bg-white rounded-xl p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Burnup Chart</h3>
        <LineChart
          v-if="data.burnupData.length > 0"
          :labels="data.burnupData.map((d: any) => d.date)"
          :datasets="[
            { label: 'Completed (cumulative)', data: data.burnupData.map((d: any) => d.cumulative), borderColor: CHART_COLORS.success, backgroundColor: CHART_COLORS.successLight, fill: true },
            { label: 'Total Scope', data: data.burnupData.map((d: any) => d.total), borderColor: CHART_COLORS.gray, borderDash: [5, 5] },
          ]"
          :height="280"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No burnup data available</div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <!-- Planned vs Completed per Delivery -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Planned vs Completed by Delivery</h3>
          <BarChart
            v-if="data.deliveryMetrics.length > 0"
            :labels="data.deliveryMetrics.map((d: any) => d.title.length > 20 ? d.title.slice(0, 20) + '...' : d.title)"
            :datasets="[
              { label: 'Planned', data: data.deliveryMetrics.map((d: any) => d.planned), backgroundColor: CHART_COLORS.primaryLight },
              { label: 'Completed', data: data.deliveryMetrics.map((d: any) => d.completed), backgroundColor: CHART_COLORS.success },
            ]"
            :height="240"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No delivery data</div>
        </div>

        <!-- Estimate vs Actual Scatter -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Estimate vs Actual</h3>
          <ScatterChart
            v-if="data.estimateData.length > 0"
            :datasets="[{
              label: 'Tasks',
              data: data.estimateData.map((d: any) => ({ x: d.estimate, y: d.actualDays })),
              backgroundColor: 'rgba(72,87,254,0.5)',
            }]"
            x-title="Estimate (points)"
            y-title="Actual (days)"
            :height="240"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No estimate data available</div>
        </div>
      </div>

      <!-- Delivery Predictability Table -->
      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Delivery Predictability</h3>
        </div>
        <div v-if="data.deliveryMetrics.length > 0">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-gray-50 text-left text-gray-400">
                <th class="px-5 py-3 font-medium">Delivery</th>
                <th class="px-5 py-3 font-medium text-center">Planned</th>
                <th class="px-5 py-3 font-medium text-center">Completed</th>
                <th class="px-5 py-3 font-medium text-center">Predictability</th>
                <th class="px-5 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in data.deliveryMetrics" :key="d.deliveryId" class="border-b border-gray-50 hover:bg-gray-50/50">
                <td class="px-5 py-3 text-gray-700 font-medium max-w-[250px] truncate">{{ d.title }}</td>
                <td class="px-5 py-3 text-center text-gray-600">{{ d.planned }}</td>
                <td class="px-5 py-3 text-center text-emerald-600 font-medium">{{ d.completed }}</td>
                <td class="px-5 py-3 text-center">
                  <div class="flex items-center gap-2 justify-center">
                    <div class="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div class="h-full rounded-full transition-all"
                        :class="d.predictability >= 80 ? 'bg-emerald-500' : d.predictability >= 50 ? 'bg-amber-500' : 'bg-red-500'"
                        :style="{ width: d.predictability + '%' }" />
                    </div>
                    <span class="text-xs font-medium" :class="d.predictability >= 80 ? 'text-emerald-600' : d.predictability >= 50 ? 'text-amber-600' : 'text-red-600'">
                      {{ d.predictability }}%
                    </span>
                  </div>
                </td>
                <td class="px-5 py-3 text-center">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium capitalize"
                    :class="d.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : d.status === 'in_progress' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'">
                    {{ d.status?.replace(/_/g, ' ') }}
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
