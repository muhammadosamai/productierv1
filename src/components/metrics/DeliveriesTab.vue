<script setup lang="ts">
import { ref, watch } from 'vue'
import { Package, TrendingUp, CheckCircle2 } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { statusBg, statusLabel, formatDate, CHART_COLORS } from './utils'
import DoughnutChart from '@/components/charts/DoughnutChart.vue'
import BarChart from '@/components/charts/BarChart.vue'

const props = defineProps<{ period: number }>()
const productStore = useProductStore()

const data = ref<any>(null)
const loading = ref(true)

async function fetchData() {
  loading.value = true
  try {
    const product = productStore.activeProduct?.name || ''
    const res = await fetch(`/api/metrics/deliveries-metrics?product=${encodeURIComponent(product)}`)
    data.value = await res.json()
  } catch (e) { console.error('Failed to load deliveries metrics', e) }
  loading.value = false
}

watch(() => [props.period, productStore.activeProduct?.name], fetchData, { immediate: true })
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
            <Package :size="14" class="text-[#4857FE]" />
            <span class="text-xs font-medium text-gray-400 uppercase">Total Deliveries</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.total }}</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <TrendingUp :size="14" class="text-blue-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Active</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.activeDeliveries }}</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <CheckCircle2 :size="14" class="text-emerald-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Avg Progress</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.avgProgress }}%</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Package :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">On Track</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.deliveryDetails.filter((d: any) => d.onTrack).length }}</div>
          <div class="text-xs text-gray-400 mt-1">of {{ data.total }} deliveries</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <!-- Status Distribution Donut -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Status Distribution</h3>
          <DoughnutChart
            v-if="Object.keys(data.byStatus).length > 0"
            :labels="Object.keys(data.byStatus).map((s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()))"
            :data="Object.values(data.byStatus) as number[]"
            :colors="Object.keys(data.byStatus).map((s: string) => {
              const c: Record<string, string> = { completed: '#10B981', in_progress: '#3B82F6', planning: '#9CA3AF', blocked: '#EF4444', overdue: '#EF4444' }
              return c[s] || '#9CA3AF'
            })"
            :height="220"
            center-label="Deliveries"
            :center-value="data.total"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No deliveries</div>
        </div>

        <!-- Velocity per Delivery -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Velocity (tasks/week)</h3>
          <BarChart
            v-if="data.deliveryDetails.length > 0"
            :labels="data.deliveryDetails.map((d: any) => d.title.length > 18 ? d.title.slice(0, 18) + '...' : d.title)"
            :datasets="[{ label: 'Velocity', data: data.deliveryDetails.map((d: any) => d.velocity), backgroundColor: CHART_COLORS.primary }]"
            :height="220"
            :show-legend="false"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No delivery data</div>
        </div>
      </div>

      <!-- Delivery Cards -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-gray-700">All Deliveries</h3>
        <div v-for="d in data.deliveryDetails" :key="d.id" class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <h4 class="text-sm font-semibold text-gray-800">{{ d.title }}</h4>
              <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium capitalize"
                :class="d.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : d.status === 'in_progress' ? 'bg-blue-50 text-blue-700' : d.status === 'overdue' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'">
                {{ d.status?.replace(/_/g, ' ') }}
              </span>
            </div>
            <div class="flex items-center gap-4 text-xs text-gray-400">
              <span v-if="d.startDate">{{ formatDate(d.startDate) }}</span>
              <span v-if="d.startDate && d.endDate">→</span>
              <span v-if="d.endDate">{{ formatDate(d.endDate) }}</span>
              <span v-if="d.daysRemaining !== null" class="font-medium"
                :class="d.daysRemaining < 0 ? 'text-red-500' : d.daysRemaining < 7 ? 'text-amber-500' : 'text-gray-500'">
                {{ d.daysRemaining < 0 ? Math.abs(Math.round(d.daysRemaining)) + 'd overdue' : Math.round(d.daysRemaining) + 'd left' }}
              </span>
            </div>
          </div>
          <!-- Progress Bar -->
          <div class="flex items-center gap-3">
            <div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all"
                :class="d.progress >= 80 ? 'bg-emerald-500' : d.progress >= 40 ? 'bg-blue-500' : 'bg-amber-500'"
                :style="{ width: d.progress + '%' }" />
            </div>
            <span class="text-xs font-semibold text-gray-600 w-10 text-right">{{ d.progress }}%</span>
          </div>
          <div class="flex gap-4 mt-2 text-[10px] text-gray-400">
            <span>{{ d.completed }}/{{ d.totalTasks }} tasks</span>
            <span v-if="d.blocked > 0" class="text-red-500">{{ d.blocked }} blocked</span>
            <span v-if="d.velocity > 0">{{ d.velocity }} tasks/week</span>
          </div>
        </div>
        <div v-if="data.deliveryDetails.length === 0" class="text-center py-10 text-sm text-gray-400">No deliveries found</div>
      </div>
    </template>
  </div>
</template>
