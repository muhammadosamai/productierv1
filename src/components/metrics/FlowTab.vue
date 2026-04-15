<script setup lang="ts">
import { ref, watch } from 'vue'
import { Clock, Zap, AlertTriangle } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { formatDays, statusBg, statusLabel, priorityColor, CHART_COLORS, STATUS_CHART_COLORS } from './utils'
import ScatterChart from '@/components/charts/ScatterChart.vue'
import StackedAreaChart from '@/components/charts/StackedAreaChart.vue'

const props = defineProps<{ period: number }>()
const productStore = useProductStore()

const data = ref<any>(null)
const loading = ref(true)

async function fetchData() {
  loading.value = true
  try {
    const product = productStore.activeProductScopeForApi || ''
    const res = await fetch(`/api/metrics/flow?product=${encodeURIComponent(product)}&period=${props.period}`)
    data.value = await res.json()
  } catch (e) { console.error('Failed to load flow metrics', e) }
  loading.value = false
}

watch(() => [props.period, productStore.activeProductScopeForApi], fetchData, { immediate: true })

const statusKeys = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'blocked']
</script>

<template>
  <div class="p-8 space-y-6">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-[#4857FE] border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else-if="data">
      <!-- Summary Cards -->
      <div class="grid grid-cols-5 gap-4">
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-blue-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Median Cycle</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ formatDays(data.cycleTime.median) }}</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-violet-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">P85 Cycle</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ formatDays(data.cycleTime.p85) }}</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Median Lead</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ formatDays(data.leadTime.median) }}</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Zap :size="14" class="text-emerald-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Flow Efficiency</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ data.flowEfficiency }}%</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <AlertTriangle :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">WIP Count</span>
          </div>
          <div class="text-xl font-bold text-gray-900">{{ data.wipCount }}</div>
        </div>
      </div>

      <!-- Cycle Time Scatter -->
      <div class="bg-white rounded-xl p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Cycle Time Distribution</h3>
        <ScatterChart
          v-if="data.cycleTime.data.length > 0"
          :datasets="[{
            label: 'Cycle Time (days)',
            data: data.cycleTime.data.map((d: any, i: number) => ({ x: i + 1, y: d.cycleTimeDays })),
            backgroundColor: 'rgba(72,87,254,0.5)',
          }]"
          x-title="Task #"
          y-title="Days"
          :height="260"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No completed tasks with cycle time data</div>
      </div>

      <!-- CFD -->
      <div class="bg-white rounded-xl p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Cumulative Flow Diagram</h3>
        <StackedAreaChart
          v-if="data.cfd.length > 0"
          :labels="data.cfd.map((d: any) => d.date)"
          :datasets="statusKeys.map(s => ({
            label: s.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
            data: data.cfd.map((d: any) => d[s] || 0),
            borderColor: STATUS_CHART_COLORS[s] || '#9CA3AF',
            backgroundColor: (STATUS_CHART_COLORS[s] || '#9CA3AF') + '40',
          }))"
          :height="300"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No CFD data available</div>
      </div>

      <!-- Aging WIP Table -->
      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Aging Work In Progress</h3>
        </div>
        <div v-if="data.agingWip.length > 0">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-gray-50 text-left text-gray-400">
                <th class="px-5 py-3 font-medium">Task</th>
                <th class="px-5 py-3 font-medium">Status</th>
                <th class="px-5 py-3 font-medium">Priority</th>
                <th class="px-5 py-3 font-medium text-right">Age</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in data.agingWip.slice(0, 15)" :key="t.taskId" class="border-b border-gray-50 hover:bg-gray-50/50">
                <td class="px-5 py-3 text-gray-700 font-medium max-w-[300px] truncate">{{ t.title }}</td>
                <td class="px-5 py-3">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium" :class="statusBg(t.status)">{{ statusLabel(t.status) }}</span>
                </td>
                <td class="px-5 py-3">
                  <span class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: priorityColor(t.priority) }" />
                    <span class="text-gray-600 capitalize">{{ t.priority }}</span>
                  </span>
                </td>
                <td class="px-5 py-3 text-right font-medium" :class="t.ageDays > 14 ? 'text-red-600' : t.ageDays > 7 ? 'text-amber-600' : 'text-gray-600'">
                  {{ formatDays(t.ageDays) }}
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
