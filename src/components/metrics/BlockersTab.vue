<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef, type Ref } from 'vue'
import { AlertTriangle, BarChart3, Clock } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { fetchScopedMetricsJson } from './api'
import { CHART_COLORS, formatDays, getInitials, priorityColor, statusBg, statusLabel } from './utils'
import type { BlockersMetricsResponse } from '@/types/metrics'
import BarChart from '@/components/charts/BarChart.vue'
import LineChart from '@/components/charts/LineChart.vue'
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

const data = ref<BlockersMetricsResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const bottleneckEntries = computed(() => {
  if (!data.value) return [] as Array<{ status: string; count: number; avgAge: number; widthPct: number }>
  const entries = Object.entries(data.value.bottleneckStages).map(([status, info]) => ({
    status,
    count: info.count,
    avgAge: info.avgAge,
  }))
  const maxCount = Math.max(1, ...entries.map((entry) => entry.count))
  return entries
    .sort((a, b) => b.count - a.count)
    .map((entry) => ({
      ...entry,
      widthPct: Math.max(6, Math.round((entry.count / maxCount) * 1000) / 10),
    }))
})

function bucketMidpoint(bucket: string): number {
  if (bucket === '<1d') return 0.5
  if (bucket === '1-3d') return 2
  if (bucket === '3-7d') return 5
  if (bucket === '>7d') return 8
  return 0
}

const unblockDistributionColors = computed(() => {
  if (!data.value) return [] as string[]
  return data.value.unblockDistribution.map((bin) =>
    bucketMidpoint(bin.bucket) > data.value!.unblockSlaDays ? CHART_COLORS.danger : CHART_COLORS.success
  )
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
    const result = await fetchScopedMetricsJson<BlockersMetricsResponse>('blockers', {
      token: authStore.token,
      query: {
        organizationId: productStore.activeProduct?.organizationId || null,
        scopeMode: metricsScopeMode.value,
        productId: metricsScopeMode.value === 'product' ? metricsProductId.value : undefined,
        teamId: metricsScopeMode.value === 'team' ? metricsTeamId.value || undefined : undefined,
        period: String(props.period),
      },
      fallbackMessage: 'Failed to load blockers metrics',
    })

    if (result.error) {
      data.value = null
      error.value = result.error
      return
    }

    data.value = result.data
  } catch (e) {
    console.error('Failed to load blockers metrics', e)
    data.value = null
    error.value = 'Failed to load blockers metrics'
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
      No blockers metrics available for the selected product.
    </div>

    <template v-else>
      <MetricsMetaStrip :meta="data.meta" />

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <AlertTriangle :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Currently Blocked</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.blockedCount }}</div>
          <div class="text-xs text-gray-400 mt-1">Open blocked tasks</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Clock :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Median Unblock</span>
            <MetricHelpPopover metric-key="unblock_efficiency" />
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ formatDays(data.medianUnblockDays) }}</div>
          <div class="text-xs text-gray-400 mt-1">Average: {{ formatDays(data.avgBlockDuration) }}</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <BarChart3 :size="14" class="text-violet-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">SLA Hit Rate</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.unblockSlaHitRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">SLA threshold: {{ data.unblockSlaDays }} days</div>
        </div>
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <AlertTriangle :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Long-Open Breaches</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.longOpenBreaches }}</div>
          <div class="text-xs text-gray-400 mt-1">Current blockers over SLA</div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Unblock Efficiency Funnel</h3>
          <BarChart
            :labels="['Blocked', 'Unblocked in SLA', 'SLA Breached']"
            :datasets="[{ label: 'Count', data: [data.unblockFunnel.blockedTotal, data.unblockFunnel.unblockedWithinSla, data.unblockFunnel.slaBreached], backgroundColor: [CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.danger] }]"
            :height="220"
            :show-legend="false"
          />
        </div>

        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Time-to-Unblock Distribution</h3>
          <BarChart
            v-if="data.unblockDistribution.length > 0"
            :labels="data.unblockDistribution.map((bin) => bin.bucket)"
            :datasets="[{ label: 'Events', data: data.unblockDistribution.map((bin) => bin.count), backgroundColor: unblockDistributionColors }]"
            :height="220"
            :show-legend="false"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No unblock history in this period</div>
          <p class="text-[11px] text-gray-500 mt-2">
            Green buckets are within {{ data.unblockSlaDays }}d SLA, red buckets exceed it.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Block Reasons</h3>
          <BarChart
            v-if="data.blockReasons.length > 0"
            :labels="data.blockReasons.map((reason) => reason.reason.length > 30 ? reason.reason.slice(0, 30) + '...' : reason.reason)"
            :datasets="[{ label: 'Count', data: data.blockReasons.map((reason) => reason.count), backgroundColor: CHART_COLORS.danger }]"
            :height="220"
            :show-legend="false"
            :horizontal="true"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No block reasons recorded</div>
        </div>

        <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Block Events Over Time</h3>
          <LineChart
            v-if="data.blockedTrend.length > 0"
            :labels="data.blockedTrend.map((point) => point.date)"
            :datasets="[{ label: 'Block Events', data: data.blockedTrend.map((point) => point.count), borderColor: CHART_COLORS.danger, backgroundColor: CHART_COLORS.dangerLight, fill: true }]"
            :height="220"
            :show-legend="false"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No block events in this period</div>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 sm:p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Bottleneck Analysis</h3>
        <div v-if="bottleneckEntries.length > 0" class="space-y-3">
          <div v-for="entry in bottleneckEntries" :key="entry.status" class="flex items-center gap-3">
            <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium w-24 justify-center" :class="statusBg(String(entry.status))">
              {{ statusLabel(String(entry.status)) }}
            </span>
            <div class="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full bg-[#4857FE] rounded-full transition-all" :style="{ width: `${entry.widthPct}%`, opacity: entry.avgAge > 10 ? 1 : 0.6 }" />
            </div>
            <span class="text-xs text-gray-600 w-16 text-right">{{ entry.count }}</span>
            <span class="text-xs font-medium w-20 text-right" :class="entry.avgAge > 14 ? 'text-red-600' : entry.avgAge > 7 ? 'text-amber-600' : 'text-gray-500'">
              {{ formatDays(entry.avgAge) }}
            </span>
          </div>
        </div>
        <div v-else class="text-center py-10 text-sm text-gray-400">No active tasks</div>
      </div>

      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Currently Blocked Tasks</h3>
        </div>
        <div v-if="data.currentlyBlocked.length > 0" class="overflow-x-auto">
          <table class="w-full text-xs min-w-[860px]">
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
              <tr v-for="task in data.currentlyBlocked" :key="task.taskId" class="border-b border-gray-50 hover:bg-gray-50/50">
                <td class="px-5 py-3 font-medium max-w-[220px] truncate">
                  <router-link :to="`/tasks?task=${task.taskId}`" class="text-[#4857FE] hover:text-[#3E4BDE]">
                    {{ task.title }}
                  </router-link>
                </td>
                <td class="px-5 py-3">
                  <span class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: priorityColor(String(task.priority)) }" />
                    <span class="text-gray-600 capitalize">{{ task.priority }}</span>
                  </span>
                </td>
                <td class="px-5 py-3 text-gray-500 max-w-[220px] truncate">{{ task.blockedReason }}</td>
                <td class="px-5 py-3">
                  <div v-if="task.assignee" class="flex items-center gap-1.5">
                    <img v-if="task.assignee.avatar" :src="task.assignee.avatar" class="w-5 h-5 rounded-full object-cover" />
                    <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[9px] font-semibold text-[#4857FE]">
                      {{ getInitials(task.assignee.name) }}
                    </div>
                    <span class="text-gray-600">{{ task.assignee.name.split(' ')[0] }}</span>
                  </div>
                  <span v-else class="text-gray-300">—</span>
                </td>
                <td class="px-5 py-3 text-right font-medium" :class="task.blockedDays > data.unblockSlaDays ? 'text-red-600' : 'text-amber-600'">
                  {{ formatDays(task.blockedDays) }}
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
