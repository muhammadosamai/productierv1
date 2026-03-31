<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { AlertTriangle, Eye, Users } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { fetchScopedMetricsJson } from './api'
import { CHART_COLORS, STATUS_CHART_COLORS, formatDays, getInitials } from './utils'
import type { WorkloadMetricsResponse } from '@/types/metrics'
import BarChart from '@/components/charts/BarChart.vue'
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

const data = ref<WorkloadMetricsResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedLoadFilter = ref<'all' | 'overloaded' | 'balanced' | 'idle'>('all')

const statusKeys = ['in_progress', 'in_review', 'assigned', 'created', 'blocked', 'done']

const filteredMembers = computed(() => {
  if (!data.value) return []
  if (selectedLoadFilter.value === 'overloaded') return data.value.memberWorkload.filter((member) => member.loadRatio > 1)
  if (selectedLoadFilter.value === 'idle') return data.value.memberWorkload.filter((member) => member.wipCount === 0)
  if (selectedLoadFilter.value === 'balanced') return data.value.memberWorkload.filter((member) => member.loadRatio >= 0.8 && member.loadRatio <= 1)
  return data.value.memberWorkload
})

const chartMembers = computed(() => {
  return [...filteredMembers.value]
    .sort((a, b) => Math.abs(b.loadRatio - 1) - Math.abs(a.loadRatio - 1))
    .slice(0, 15)
})

const heatmapMembers = computed(() => filteredMembers.value.slice(0, 20))

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
    const result = await fetchScopedMetricsJson<WorkloadMetricsResponse>('workload', {
      token: authStore.token,
      query: {
        organizationId: productStore.activeProduct?.organizationId || null,
        scopeMode: metricsScopeMode.value,
        productId: metricsScopeMode.value === 'product' ? metricsProductId.value : undefined,
        teamId: metricsScopeMode.value === 'team' ? metricsTeamId.value || undefined : undefined,
        period: String(props.period),
      },
      fallbackMessage: 'Failed to load workload metrics',
    })

    if (result.error) {
      data.value = null
      error.value = result.error
      return
    }

    data.value = result.data
  } catch (e) {
    console.error('Failed to load workload metrics', e)
    data.value = null
    error.value = 'Failed to load workload metrics'
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
      No workload metrics available for the selected product.
    </div>

    <template v-else>
      <MetricsMetaStrip :meta="data.meta" />

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Users :size="14" class="text-[#4857FE]" />
            <span class="text-xs font-medium text-gray-400 uppercase">Team Members</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.totalMembers }}</div>
          <div class="text-xs text-gray-400 mt-1">Members carrying current load</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <AlertTriangle :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Overloaded</span>
            <MetricHelpPopover metric-key="load_ratio" />
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.overloaded.length }}</div>
          <div class="text-xs text-gray-400 mt-1">Load ratio above 1.0</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Eye :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Idle</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.idle.length }}</div>
          <div class="text-xs text-gray-400 mt-1">Members with zero WIP</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <p class="text-xs text-gray-400 uppercase tracking-wide">Load Balance Index</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ data.loadBalanceIndex }}</p>
          <p class="text-xs text-gray-500 mt-1">Higher means less balanced distribution</p>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Capacity-Normalized Load Ratio</h3>
        <div class="flex flex-wrap gap-2 mb-4">
          <button type="button" class="px-2.5 py-1 rounded-full text-xs border" :class="selectedLoadFilter === 'all' ? 'bg-[#4857FE] border-[#4857FE] text-white' : 'bg-white border-gray-200 text-gray-600'" @click="selectedLoadFilter = 'all'">
            All ({{ data.memberWorkload.length }})
          </button>
          <button type="button" class="px-2.5 py-1 rounded-full text-xs border" :class="selectedLoadFilter === 'overloaded' ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-red-200 text-red-600'" @click="selectedLoadFilter = 'overloaded'">
            Overloaded ({{ data.overloaded.length }})
          </button>
          <button type="button" class="px-2.5 py-1 rounded-full text-xs border" :class="selectedLoadFilter === 'balanced' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-emerald-200 text-emerald-700'" @click="selectedLoadFilter = 'balanced'">
            Balanced
          </button>
          <button type="button" class="px-2.5 py-1 rounded-full text-xs border" :class="selectedLoadFilter === 'idle' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-200 text-amber-700'" @click="selectedLoadFilter = 'idle'">
            Idle ({{ data.idle.length }})
          </button>
        </div>
        <BarChart
          v-if="chartMembers.length > 0"
          :labels="chartMembers.map((member) => member.name.split(' ')[0] || member.name)"
          :datasets="[
            {
              label: 'Load ratio delta',
              data: chartMembers.map((member) => Number((member.loadRatio - 1).toFixed(2))),
              backgroundColor: chartMembers.map((member) => member.loadRatio > 1 ? CHART_COLORS.danger : CHART_COLORS.success),
            },
          ]"
          :height="260"
          :show-legend="false"
        />
        <div v-else class="text-center py-10 text-sm text-gray-400">No workload data for selected filter</div>
        <p class="text-xs text-gray-500 mt-3">Above zero indicates overload (WIP higher than capacity threshold).</p>
        <p v-if="filteredMembers.length > chartMembers.length" class="text-[11px] text-gray-400 mt-1">
          Showing top {{ chartMembers.length }} members by deviation from balanced load.
        </p>
      </div>

      <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Status Heatmap (scanable)</h3>
        <div v-if="heatmapMembers.length > 0" class="space-y-2 overflow-x-auto">
          <div v-for="member in heatmapMembers" :key="member.id" class="grid grid-cols-[180px_repeat(6,minmax(0,1fr))] items-center gap-2 text-xs min-w-[680px]">
            <div class="font-medium text-gray-700 truncate">{{ member.name }}</div>
            <div v-for="status in statusKeys" :key="status" class="rounded-md px-2 py-1 text-center"
              :style="{ backgroundColor: (STATUS_CHART_COLORS[status] || '#9CA3AF') + '22', color: STATUS_CHART_COLORS[status] || '#6B7280' }">
              {{ member.byStatus[status] || 0 }}
            </div>
          </div>
          <div class="text-[10px] text-gray-400 pt-1">Columns: in progress, in review, assigned, created, blocked, done</div>
          <div v-if="filteredMembers.length > heatmapMembers.length" class="text-[10px] text-gray-400">
            Showing first {{ heatmapMembers.length }} members for readability.
          </div>
        </div>
        <div v-else class="text-center py-10 text-sm text-gray-400">No members to display</div>
      </div>

      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Member Workload Detail</h3>
        </div>
        <div v-if="filteredMembers.length > 0" class="overflow-x-auto">
        <table class="w-full text-xs min-w-[780px]">
          <thead>
            <tr class="border-b border-gray-50 text-left text-gray-400">
              <th class="px-5 py-3 font-medium">Member</th>
              <th class="px-5 py-3 font-medium text-center">WIP / Cap</th>
              <th class="px-5 py-3 font-medium text-center">Load Ratio</th>
              <th class="px-5 py-3 font-medium text-center">Review:Build</th>
              <th class="px-5 py-3 font-medium text-center">Overdue</th>
              <th class="px-5 py-3 font-medium text-center">Completion</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in filteredMembers" :key="member.id" class="border-b border-gray-50 hover:bg-gray-50/50" :class="member.loadRatio > 1 ? 'bg-red-50/30' : ''">
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <img v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                  <div v-else class="w-6 h-6 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-semibold text-[#4857FE]">
                    {{ getInitials(member.name) }}
                  </div>
                  <span class="font-medium text-gray-700">{{ member.name }}</span>
                </div>
              </td>
              <td class="px-5 py-3 text-center text-gray-600">{{ member.wipCount }} / {{ member.capacity }}</td>
              <td class="px-5 py-3 text-center font-medium" :class="member.loadRatio > 1 ? 'text-red-600' : 'text-emerald-600'">{{ member.loadRatio.toFixed(2) }}</td>
              <td class="px-5 py-3 text-center text-violet-600">{{ member.reviewVsBuildRatio.toFixed(2) }}</td>
              <td class="px-5 py-3 text-center">
                <span v-if="member.overdueCount > 0" class="text-red-600 font-medium">{{ member.overdueCount }}</span>
                <span v-else class="text-gray-300">0</span>
              </td>
              <td class="px-5 py-3 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                  :class="member.completionRate >= 70 ? 'bg-emerald-50 text-emerald-700' : member.completionRate >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'">
                  {{ member.completionRate }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        <div v-else class="px-5 py-10 text-center text-sm text-gray-400">No members match the selected load filter.</div>
      </div>

      <div v-if="filteredMembers.some((member) => member.overdueTasks.length > 0)" class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Overdue Tasks</h3>
        </div>
        <div class="overflow-x-auto">
        <table class="w-full text-xs min-w-[700px]">
          <thead>
            <tr class="border-b border-gray-50 text-left text-gray-400">
              <th class="px-5 py-3 font-medium">Task</th>
              <th class="px-5 py-3 font-medium">Assigned To</th>
              <th class="px-5 py-3 font-medium text-right">Days Overdue</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="member in filteredMembers.filter((entry) => entry.overdueTasks.length > 0)" :key="member.id">
              <tr v-for="task in member.overdueTasks" :key="task.taskId" class="border-b border-gray-50 hover:bg-red-50/30">
                <td class="px-5 py-3 font-medium max-w-[320px] truncate">
                  <router-link :to="`/tasks?task=${task.taskId}`" class="text-[#4857FE] hover:text-[#3E4BDE]">
                    {{ task.title }}
                  </router-link>
                </td>
                <td class="px-5 py-3 text-gray-600">{{ member.name }}</td>
                <td class="px-5 py-3 text-right font-medium text-red-600">{{ formatDays(task.daysOverdue) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
        </div>
      </div>
    </template>
  </div>
</template>
