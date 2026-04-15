<script setup lang="ts">
import { ref, watch } from 'vue'
import { CheckCircle2, RefreshCw, Bug, Eye } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { getInitials, statusBg, statusLabel, priorityColor, CHART_COLORS } from './utils'
import DoughnutChart from '@/components/charts/DoughnutChart.vue'
import BarChart from '@/components/charts/BarChart.vue'

const props = defineProps<{ period: number }>()
const productStore = useProductStore()

const data = ref<any>(null)
const loading = ref(true)

async function fetchData() {
  loading.value = true
  try {
    const product = productStore.activeProductScopeForApi || ''
    const res = await fetch(`/api/metrics/quality?product=${encodeURIComponent(product)}&period=${props.period}`)
    data.value = await res.json()
  } catch (e) { console.error('Failed to load quality metrics', e) }
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
            <CheckCircle2 :size="14" class="text-emerald-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">First-Pass Rate</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.firstPassRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">of {{ data.totalCompleted }} completed</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <RefreshCw :size="14" class="text-amber-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Rework Rate</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.reworkRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">{{ data.reworkCount }} reworked tasks</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Bug :size="14" class="text-red-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">Bug Rate</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.bugRate }}%</div>
          <div class="text-xs text-gray-400 mt-1">of completed tasks are bugs</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <div class="flex items-center gap-2 mb-2">
            <Eye :size="14" class="text-violet-500" />
            <span class="text-xs font-medium text-gray-400 uppercase">In Review</span>
          </div>
          <div class="text-2xl font-bold text-gray-900">{{ data.reviewLoad.reduce((s: number, r: any) => s + r.count, 0) }}</div>
          <div class="text-xs text-gray-400 mt-1">tasks awaiting review</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <!-- First-pass vs Rework Donut -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">First Pass vs Rework</h3>
          <DoughnutChart
            :labels="['First Pass', 'Rework']"
            :data="[data.totalCompleted - data.reworkCount, data.reworkCount]"
            :colors="[CHART_COLORS.success, CHART_COLORS.warning]"
            :height="200"
            center-label="First Pass"
            :center-value="`${data.firstPassRate}%`"
          />
        </div>

        <!-- Rework Trend -->
        <div class="bg-white rounded-xl p-5 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-4">Rework Trend</h3>
          <BarChart
            v-if="data.reworkByWeek.length > 0"
            :labels="data.reworkByWeek.map((d: any) => d.date)"
            :datasets="[{ label: 'Rework Events', data: data.reworkByWeek.map((d: any) => d.count), backgroundColor: CHART_COLORS.warning }]"
            :height="200"
            :show-legend="false"
          />
          <div v-else class="text-center py-10 text-sm text-gray-400">No rework events in this period</div>
        </div>
      </div>

      <!-- Review Load -->
      <div class="bg-white rounded-xl p-5 border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">Review Load by Reviewer</h3>
        <div v-if="data.reviewLoad.length > 0" class="space-y-3">
          <div v-for="r in data.reviewLoad" :key="r.userId" class="flex items-center gap-3">
            <UploadAssetImg v-if="r.avatar" :src="r.avatar" class="w-6 h-6 rounded-full object-cover" />
            <div v-else class="w-6 h-6 rounded-full bg-violet-50 flex items-center justify-center text-[10px] font-semibold text-violet-600">
              {{ getInitials(r.name) }}
            </div>
            <span class="text-xs font-medium text-gray-700 w-28 truncate">{{ r.name }}</span>
            <div class="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full bg-violet-500 rounded-full transition-all" :style="{ width: `${Math.min(100, r.count * 20)}%` }" />
            </div>
            <span class="text-xs font-semibold text-gray-600 w-8 text-right">{{ r.count }}</span>
          </div>
        </div>
        <div v-else class="text-center py-10 text-sm text-gray-400">No tasks currently in review</div>
      </div>

      <!-- Reworked Tasks Table -->
      <div class="bg-white rounded-xl border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Reworked Tasks</h3>
        </div>
        <div v-if="data.reworkedTasks.length > 0">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-gray-50 text-left text-gray-400">
                <th class="px-5 py-3 font-medium">Task</th>
                <th class="px-5 py-3 font-medium">Status</th>
                <th class="px-5 py-3 font-medium">Priority</th>
                <th class="px-5 py-3 font-medium text-right">Rework Count</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in data.reworkedTasks" :key="t.taskId" class="border-b border-gray-50 hover:bg-gray-50/50">
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
                <td class="px-5 py-3 text-right">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">{{ t.reworkCount }}x</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="px-5 py-10 text-center text-sm text-gray-400">No reworked tasks in this period</div>
      </div>
    </template>
  </div>
</template>
