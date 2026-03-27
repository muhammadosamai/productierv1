<script setup lang="ts">
import { ref, watch } from 'vue'
import { Users, AlertTriangle, Eye } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { getInitials, statusBg, statusLabel, formatDays, CHART_COLORS, STATUS_CHART_COLORS } from './utils'
import BarChart from '@/components/charts/BarChart.vue'

const props = defineProps<{ period: number }>()
const productStore = useProductStore()

const data = ref<any>(null)
const loading = ref(true)

async function fetchData() {
  loading.value = true
  try {
    const product = productStore.activeProduct?.name || ''
    const res = await fetch(`/api/metrics/workload?product=${encodeURIComponent(product)}`)
    data.value = await res.json()
  } catch (e) { console.error('Failed to load workload metrics', e) }
  loading.value = false
}

watch(() => [props.period, productStore.activeProduct?.name], fetchData, { immediate: true })

const statusKeys = ['in_progress', 'in_review', 'assigned', 'created', 'blocked', 'done']
</script>

<template>
  <div class="p-8 space-y-6">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-[#4857FE] border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else-if="data">
      <!-- Summary Cards -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Users :size="14" class="text-[#4857FE]" />
            <span class="text-xs font-medium text-gray-400 uppercase">Team Members</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.totalMembers }}</div>
          <div class="text-xs text-gray-400 mt-1">with assigned tasks</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <AlertTriangle :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Overloaded</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.overloaded.length }}</div>
          <div class="text-xs text-gray-400 mt-1">members with WIP &gt; 5</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Eye :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Idle</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.idle.length }}</div>
          <div class="text-xs text-gray-400 mt-1">members with 0 WIP</div>
        </div>
      </div>

      <!-- Stacked Bar: Per-member by status -->
      <div class="bg-white rounded-xl p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Workload by Member & Status</h3>
        <BarChart
          v-if="data.memberWorkload.length > 0"
          :labels="data.memberWorkload.map((m: any) => m.name.split(' ')[0])"
          :datasets="statusKeys.map(s => ({
            label: s.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
            data: data.memberWorkload.map((m: any) => m.byStatus[s] || 0),
            backgroundColor: STATUS_CHART_COLORS[s] || '#9CA3AF',
          }))"
          :height="300"
          :stacked="true"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No workload data</div>
      </div>

      <!-- Workload Table -->
      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Member Workload Detail</h3>
        </div>
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-gray-50 text-left text-gray-400">
              <th class="px-5 py-3 font-medium">Member</th>
              <th class="px-5 py-3 font-medium text-center">Total</th>
              <th class="px-5 py-3 font-medium text-center">WIP</th>
              <th class="px-5 py-3 font-medium text-center">Completed</th>
              <th class="px-5 py-3 font-medium text-center">Review Load</th>
              <th class="px-5 py-3 font-medium text-center">Overdue</th>
              <th class="px-5 py-3 font-medium text-center">Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in data.memberWorkload" :key="m.id"
              class="border-b border-gray-50 hover:bg-gray-50/50"
              :class="m.wipCount > 5 ? 'bg-red-50/30' : ''">
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <img v-if="m.avatar" :src="m.avatar" class="w-6 h-6 rounded-full object-cover" />
                  <div v-else class="w-6 h-6 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-semibold text-[#4857FE]">
                    {{ getInitials(m.name) }}
                  </div>
                  <div>
                    <span class="font-medium text-gray-700">{{ m.name }}</span>
                    <span v-if="m.wipCount > 5" class="ml-2 inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-50 text-red-600">OVERLOADED</span>
                  </div>
                </div>
              </td>
              <td class="px-5 py-3 text-center text-gray-600">{{ m.totalTasks }}</td>
              <td class="px-5 py-3 text-center font-medium" :class="m.wipCount > 5 ? 'text-red-600' : 'text-blue-600'">{{ m.wipCount }}</td>
              <td class="px-5 py-3 text-center text-emerald-600 font-medium">{{ m.completedCount }}</td>
              <td class="px-5 py-3 text-center text-violet-600">{{ m.reviewLoad }}</td>
              <td class="px-5 py-3 text-center">
                <span v-if="m.overdueCount > 0" class="text-red-600 font-medium">{{ m.overdueCount }}</span>
                <span v-else class="text-gray-300">0</span>
              </td>
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

      <!-- Overdue Tasks Detail -->
      <div v-if="data.memberWorkload.some((m: any) => m.overdueTasks.length > 0)" class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Overdue Tasks</h3>
        </div>
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-gray-50 text-left text-gray-400">
              <th class="px-5 py-3 font-medium">Task</th>
              <th class="px-5 py-3 font-medium">Assigned To</th>
              <th class="px-5 py-3 font-medium text-right">Days Overdue</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="m in data.memberWorkload.filter((m: any) => m.overdueTasks.length > 0)" :key="m.id">
              <tr v-for="t in m.overdueTasks" :key="t.taskId" class="border-b border-gray-50 hover:bg-red-50/30">
                <td class="px-5 py-3 text-gray-700 font-medium max-w-[300px] truncate">{{ t.title }}</td>
                <td class="px-5 py-3 text-gray-600">{{ m.name }}</td>
                <td class="px-5 py-3 text-right font-medium text-red-600">{{ formatDays(t.daysOverdue) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
