<script setup lang="ts">
import { ref, watch } from 'vue'
import { TrendingUp } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { getInitials, CHART_COLORS } from './utils'
import LineChart from '@/components/charts/LineChart.vue'
import BarChart from '@/components/charts/BarChart.vue'

const props = defineProps<{ period: number }>()
const productStore = useProductStore()

const data = ref<any>(null)
const loading = ref(true)

async function fetchData() {
  loading.value = true
  try {
    const product = productStore.activeProduct?.name || ''
    const granularity = props.period <= 14 ? 'day' : props.period <= 90 ? 'week' : 'month'
    const res = await fetch(`/api/metrics/throughput?product=${encodeURIComponent(product)}&period=${props.period}&granularity=${granularity}`)
    data.value = await res.json()
  } catch (e) { console.error('Failed to load throughput metrics', e) }
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
      <!-- Total Completed KPI -->
      <div class="bg-white rounded-xl p-5 border border-gray-100 flex items-center gap-4">
        <div class="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
          <TrendingUp :size="18" class="text-emerald-500" />
        </div>
        <div>
          <div class="text-2xl font-bold text-gray-900">{{ data.totalCompleted }}</div>
          <div class="text-xs text-gray-400">Tasks completed in period</div>
        </div>
      </div>

      <!-- Created vs Completed over time -->
      <div class="bg-white rounded-xl p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Created vs Completed Over Time</h3>
        <LineChart
          v-if="data.completedOverTime.length > 0"
          :labels="data.completedOverTime.map((d: any) => d.date)"
          :datasets="[
            { label: 'Completed', data: data.completedOverTime.map((d: any) => d.completed), borderColor: CHART_COLORS.success, backgroundColor: CHART_COLORS.successLight, fill: true },
            { label: 'Created', data: data.completedOverTime.map((d: any) => d.created), borderColor: CHART_COLORS.primary, backgroundColor: 'transparent', borderDash: [5, 5] },
          ]"
          :height="280"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No throughput data for this period</div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <!-- By Type -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Completed by Type</h3>
          <BarChart
            v-if="Object.keys(data.byType).length > 0"
            :labels="Object.keys(data.byType)"
            :datasets="[{ label: 'Count', data: Object.values(data.byType) as number[], backgroundColor: [CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.purple, CHART_COLORS.sky] }]"
            :height="220"
            :show-legend="false"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No data</div>
        </div>

        <!-- Top Contributors -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Top Contributors</h3>
          <BarChart
            v-if="data.completedByAssignee.length > 0"
            :labels="data.completedByAssignee.slice(0, 8).map((a: any) => a.name.split(' ')[0])"
            :datasets="[{ label: 'Completed', data: data.completedByAssignee.slice(0, 8).map((a: any) => a.count), backgroundColor: CHART_COLORS.primary }]"
            :height="220"
            :show-legend="false"
            :horizontal="true"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No data</div>
        </div>
      </div>

      <!-- Contributors Table -->
      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">All Contributors</h3>
        </div>
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-gray-50 text-left text-gray-400">
              <th class="px-5 py-3 font-medium">#</th>
              <th class="px-5 py-3 font-medium">Member</th>
              <th class="px-5 py-3 font-medium text-right">Completed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(a, idx) in data.completedByAssignee" :key="a.userId" class="border-b border-gray-50 hover:bg-gray-50/50">
              <td class="px-5 py-3 text-gray-400">{{ Number(idx) + 1 }}</td>
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <UploadAssetImg v-if="a.avatar" :src="a.avatar" class="w-6 h-6 rounded-full object-cover" />
                  <div v-else class="w-6 h-6 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-semibold text-[#4857FE]">
                    {{ getInitials(a.name) }}
                  </div>
                  <span class="font-medium text-gray-700">{{ a.name }}</span>
                </div>
              </td>
              <td class="px-5 py-3 text-right font-semibold text-gray-700">{{ a.count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
