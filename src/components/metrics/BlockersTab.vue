<script setup lang="ts">
import { ref, watch } from 'vue'
import { AlertTriangle, Clock, BarChart3 } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { formatDays, statusBg, statusLabel, priorityColor, getInitials, CHART_COLORS } from './utils'
import BarChart from '@/components/charts/BarChart.vue'
import LineChart from '@/components/charts/LineChart.vue'

const props = defineProps<{ period: number }>()
const productStore = useProductStore()

const data = ref<any>(null)
const loading = ref(true)

async function fetchData() {
  loading.value = true
  try {
    const product = productStore.activeProductApiRef
    const res = await fetch(`/api/metrics/blockers?product=${encodeURIComponent(product)}&period=${props.period}`)
    data.value = await res.json()
  } catch (e) { console.error('Failed to load blockers metrics', e) }
  loading.value = false
}

watch(() => [props.period, productStore.activeProductApiRef], fetchData, { immediate: true })
</script>

<template>
  <div class="p-8 space-y-6">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-[#4857FE] border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else-if="data">
      <!-- KPI Cards -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <AlertTriangle :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Currently Blocked</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.blockedCount }}</div>
          <div class="text-xs text-gray-400 mt-1">tasks blocked right now</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Avg Block Duration</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ formatDays(data.avgBlockDuration) }}</div>
          <div class="text-xs text-gray-400 mt-1">average time blocked</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <BarChart3 :size="14" class="text-violet-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Block Reasons</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.blockReasons.length }}</div>
          <div class="text-xs text-gray-400 mt-1">distinct reasons</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <!-- Block Reasons -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Block Reasons</h3>
          <BarChart
            v-if="data.blockReasons.length > 0"
            :labels="data.blockReasons.map((r: any) => r.reason.length > 30 ? r.reason.slice(0, 30) + '...' : r.reason)"
            :datasets="[{ label: 'Count', data: data.blockReasons.map((r: any) => r.count), backgroundColor: CHART_COLORS.danger }]"
            :height="220"
            :show-legend="false"
            :horizontal="true"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No block reasons recorded</div>
        </div>

        <!-- Blocked Trend -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Block Events Over Time</h3>
          <LineChart
            v-if="data.blockedTrend.length > 0"
            :labels="data.blockedTrend.map((d: any) => d.date)"
            :datasets="[{ label: 'Block Events', data: data.blockedTrend.map((d: any) => d.count), borderColor: CHART_COLORS.danger, backgroundColor: CHART_COLORS.dangerLight, fill: true }]"
            :height="220"
            :show-legend="false"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No block events in this period</div>
        </div>
      </div>

      <!-- Bottleneck Stages -->
      <div class="bg-white rounded-xl p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Bottleneck Analysis</h3>
        <div v-if="Object.keys(data.bottleneckStages).length > 0" class="space-y-3">
          <div v-for="(info, status) in data.bottleneckStages" :key="status" class="flex items-center gap-3">
            <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium w-24 justify-center" :class="statusBg(status as string)">
              {{ statusLabel(status as string) }}
            </span>
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <div class="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full bg-[#4857FE] rounded-full transition-all"
                    :style="{ width: `${Math.min(100, (info as any).count * 10)}%`, opacity: (info as any).avgAge > 10 ? 1 : 0.6 }" />
                </div>
                <span class="text-xs text-gray-600 w-16 text-right">{{ (info as any).count }} tasks</span>
                <span class="text-xs font-medium w-20 text-right" :class="(info as any).avgAge > 14 ? 'text-red-600' : (info as any).avgAge > 7 ? 'text-amber-600' : 'text-gray-500'">
                  ~{{ formatDays((info as any).avgAge) }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-10 text-sm text-gray-400">No active tasks</div>
      </div>

      <!-- Blocked Tasks Table -->
      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Currently Blocked Tasks</h3>
        </div>
        <div v-if="data.currentlyBlocked.length > 0">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-gray-50 text-left text-gray-400">
                <th class="px-5 py-3 font-medium">Task</th>
                <th class="px-5 py-3 font-medium">Priority</th>
                <th class="px-5 py-3 font-medium">Reason</th>
                <th class="px-5 py-3 font-medium">Assignee</th>
                <th class="px-5 py-3 font-medium text-right">Blocked For</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in data.currentlyBlocked" :key="t.taskId" class="border-b border-gray-50 hover:bg-gray-50/50">
                <td class="px-5 py-3 text-gray-700 font-medium max-w-[200px] truncate">{{ t.title }}</td>
                <td class="px-5 py-3">
                  <span class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: priorityColor(t.priority) }" />
                    <span class="text-gray-600 capitalize">{{ t.priority }}</span>
                  </span>
                </td>
                <td class="px-5 py-3 text-gray-500 max-w-[200px] truncate">{{ t.blockedReason }}</td>
                <td class="px-5 py-3">
                  <div v-if="t.assignee" class="flex items-center gap-1.5">
                    <UploadAssetImg v-if="t.assignee.avatar" :src="t.assignee.avatar" class="w-5 h-5 rounded-full object-cover" />
                    <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[9px] font-semibold text-[#4857FE]">
                      {{ getInitials(t.assignee.name) }}
                    </div>
                    <span class="text-gray-600">{{ t.assignee.name.split(' ')[0] }}</span>
                  </div>
                  <span v-else class="text-gray-300">—</span>
                </td>
                <td class="px-5 py-3 text-right font-medium" :class="t.blockedDays > 7 ? 'text-red-600' : t.blockedDays > 3 ? 'text-amber-600' : 'text-gray-600'">
                  {{ formatDays(t.blockedDays) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="px-5 py-10 text-center text-sm text-gray-400">No tasks are currently blocked</div>
      </div>
    </template>
  </div>
</template>
