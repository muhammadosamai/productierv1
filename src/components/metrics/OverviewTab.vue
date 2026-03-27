<script setup lang="ts">
import { ref, watch, inject, type Ref } from 'vue'
import {
  TrendingUp, TrendingDown, Minus, CheckCircle2, Clock, AlertTriangle,
  BarChart3, Target, Zap, Users,
} from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { percentChange, statusBg, statusLabel, getInitials, formatDays, CHART_COLORS } from './utils'
import LineChart from '@/components/charts/LineChart.vue'

const props = defineProps<{ period: number }>()
const productStore = useProductStore()

const data = ref<any>(null)
const loading = ref(true)

async function fetchData() {
  loading.value = true
  try {
    const product = productStore.activeProduct?.name || ''
    const res = await fetch(`/api/metrics/dashboard?product=${encodeURIComponent(product)}&period=${props.period}`)
    data.value = await res.json()
  } catch (e) { console.error('Failed to load overview metrics', e) }
  loading.value = false
}

watch(() => [props.period, productStore.activeProduct?.name], fetchData, { immediate: true })

function trendIcon(dir: string) {
  if (dir === 'up') return TrendingUp
  if (dir === 'down') return TrendingDown
  return Minus
}
function trendColor(dir: string, positive = true) {
  if (dir === 'flat') return 'text-gray-400'
  if (positive) return dir === 'up' ? 'text-emerald-500' : 'text-red-500'
  return dir === 'up' ? 'text-red-500' : 'text-emerald-500'
}
</script>

<template>
  <div class="p-8 space-y-6">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-[#4857FE] border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else-if="data">
      <!-- KPI Cards -->
      <div class="grid grid-cols-5 gap-4">
        <!-- Tasks Completed -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Tasks Completed</span>
            <div class="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 :size="14" class="text-emerald-500" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.kpi.tasksCompleted.current }}</div>
          <div class="flex items-center gap-1 mt-1">
            <component
              :is="trendIcon(percentChange(data.kpi.tasksCompleted.current, data.kpi.tasksCompleted.previous).direction)"
              :size="12"
              :class="trendColor(percentChange(data.kpi.tasksCompleted.current, data.kpi.tasksCompleted.previous).direction)"
            />
            <span class="text-xs" :class="trendColor(percentChange(data.kpi.tasksCompleted.current, data.kpi.tasksCompleted.previous).direction)">
              {{ percentChange(data.kpi.tasksCompleted.current, data.kpi.tasksCompleted.previous).value }}%
            </span>
            <span class="text-xs text-gray-400">vs prev period</span>
          </div>
        </div>

        <!-- Avg Cycle Time -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Avg Cycle Time</span>
            <div class="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <Clock :size="14" class="text-blue-500" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ formatDays(data.kpi.avgCycleTime) }}</div>
          <div class="text-xs text-gray-400 mt-1">Lead time: {{ formatDays(data.kpi.avgLeadTime) }}</div>
        </div>

        <!-- On-Time Rate -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">On-Time Rate</span>
            <div class="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
              <Target :size="14" class="text-violet-500" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.kpi.onTimeRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">{{ data.kpi.overdueCount }} overdue</div>
        </div>

        <!-- Blocked -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Blocked</span>
            <div class="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle :size="14" class="text-red-500" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.kpi.blockedCount }}</div>
          <div class="text-xs text-gray-400 mt-1">{{ data.kpi.inReviewCount }} in review</div>
        </div>

        <!-- Completion Rate -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Completion</span>
            <div class="w-7 h-7 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
              <BarChart3 :size="14" class="text-[#4857FE]" />
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.kpi.taskCompletionRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">{{ data.kpi.totalTasks }} total tasks</div>
        </div>
      </div>

      <!-- Sparkline + Completion Rates -->
      <div class="grid grid-cols-2 gap-4">
        <!-- Throughput Sparkline -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Weekly Throughput</h3>
          <LineChart
            :labels="data.sparkline.map((_: number, i: number) => `W${i + 1}`)"
            :datasets="[{ label: 'Completed', data: data.sparkline, borderColor: CHART_COLORS.primary, backgroundColor: CHART_COLORS.primaryLight, fill: true }]"
            :height="180"
            :show-legend="false"
          />
        </div>

        <!-- Completion Rate Rings -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Completion Rates</h3>
          <div class="grid grid-cols-4 gap-4">
            <div v-for="item in [
              { label: 'Tasks', rate: data.kpi.taskCompletionRate, color: '#4857FE' },
              { label: 'Stories', rate: data.kpi.storyCompletionRate, color: '#10B981' },
              { label: 'Initiatives', rate: data.kpi.initCompletionRate, color: '#8B5CF6' },
              { label: 'Deliveries', rate: data.kpi.delivCompletionRate, color: '#F59E0B' },
            ]" :key="item.label" class="text-center">
              <div class="relative w-16 h-16 mx-auto">
                <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#F3F4F6" stroke-width="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none" :stroke="item.color" stroke-width="3"
                    stroke-linecap="round"
                    :stroke-dasharray="`${item.rate * 0.974} ${97.4 - item.rate * 0.974}`"
                  />
                </svg>
                <span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">{{ item.rate }}%</span>
              </div>
              <span class="text-[10px] text-gray-400 mt-1 block">{{ item.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Task Health Bar -->
      <div class="bg-white rounded-xl p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-3">Task Health</h3>
        <div class="flex rounded-full h-4 overflow-hidden bg-gray-100">
          <div class="bg-emerald-500 transition-all" :style="{ width: data.kpi.taskCompletionRate + '%' }" />
          <div class="bg-blue-500 transition-all" :style="{ width: (data.kpi.inProgressCount / data.kpi.totalTasks * 100) + '%' }" />
          <div class="bg-violet-500 transition-all" :style="{ width: (data.kpi.inReviewCount / data.kpi.totalTasks * 100) + '%' }" />
          <div class="bg-red-500 transition-all" :style="{ width: (data.kpi.blockedCount / data.kpi.totalTasks * 100) + '%' }" />
        </div>
        <div class="flex gap-4 mt-2 text-[10px] text-gray-500">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500" />Done {{ data.kpi.taskCompletionRate }}%</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500" />In Progress</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-violet-500" />In Review</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500" />Blocked</span>
        </div>
      </div>

      <!-- Team Workload Table -->
      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Team Workload</h3>
        </div>
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-gray-50 text-left text-gray-400">
              <th class="px-5 py-3 font-medium">Member</th>
              <th class="px-5 py-3 font-medium text-center">Total</th>
              <th class="px-5 py-3 font-medium text-center">Completed</th>
              <th class="px-5 py-3 font-medium text-center">In Progress</th>
              <th class="px-5 py-3 font-medium text-center">Overdue</th>
              <th class="px-5 py-3 font-medium text-center">Stories</th>
              <th class="px-5 py-3 font-medium text-center">Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in data.team.workload" :key="m.id" class="border-b border-gray-50 hover:bg-gray-50/50">
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <img v-if="m.avatar" :src="m.avatar" class="w-6 h-6 rounded-full object-cover" />
                  <div v-else class="w-6 h-6 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-semibold text-[#4857FE]">
                    {{ getInitials(m.name) }}
                  </div>
                  <span class="font-medium text-gray-700">{{ m.name }}</span>
                </div>
              </td>
              <td class="px-5 py-3 text-center text-gray-600">{{ m.tasks.total }}</td>
              <td class="px-5 py-3 text-center text-emerald-600 font-medium">{{ m.tasks.completed }}</td>
              <td class="px-5 py-3 text-center text-blue-600">{{ m.tasks.inProgress }}</td>
              <td class="px-5 py-3 text-center">
                <span v-if="m.tasks.overdue > 0" class="text-red-600 font-medium">{{ m.tasks.overdue }}</span>
                <span v-else class="text-gray-300">0</span>
              </td>
              <td class="px-5 py-3 text-center text-gray-600">{{ m.stories }}</td>
              <td class="px-5 py-3 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                  :class="m.completionRate >= 70 ? 'bg-emerald-50 text-emerald-700' : m.completionRate >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'">
                  {{ m.completionRate }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
