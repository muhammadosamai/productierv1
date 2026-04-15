<script setup lang="ts">
import { ref, watch, provide } from 'vue'
import {
  Activity, BarChart3, TrendingUp, Zap,
  Target, AlertTriangle, Users, Package, LayoutDashboard,
} from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'

import ProductTab from '@/components/metrics/ProductTab.vue'
import OverviewTab from '@/components/metrics/OverviewTab.vue'
import ThroughputTab from '@/components/metrics/ThroughputTab.vue'
import FlowTab from '@/components/metrics/FlowTab.vue'
import QualityTab from '@/components/metrics/QualityTab.vue'
import BlockersTab from '@/components/metrics/BlockersTab.vue'
import PredictabilityTab from '@/components/metrics/PredictabilityTab.vue'
import WorkloadTab from '@/components/metrics/WorkloadTab.vue'
import DeliveriesTab from '@/components/metrics/DeliveriesTab.vue'

const productStore = useProductStore()

type DashboardTab = 'product' | 'tasks_dashboard' | 'throughput' | 'flow' | 'quality' | 'blockers' | 'predictability' | 'workload' | 'deliveries'

const activeTab = ref<DashboardTab>('product')
const period = ref(30)

const tabs = [
  { key: 'product' as const, label: 'Product', icon: LayoutDashboard },
  { key: 'tasks_dashboard' as const, label: 'Tasks Dashboard', icon: BarChart3 },
  { key: 'throughput' as const, label: 'Throughput', icon: TrendingUp },
  { key: 'flow' as const, label: 'Flow', icon: Activity },
  { key: 'quality' as const, label: 'Quality', icon: Target },
  { key: 'blockers' as const, label: 'Blockers', icon: AlertTriangle },
  { key: 'predictability' as const, label: 'Predictability', icon: Zap },
  { key: 'workload' as const, label: 'Workload', icon: Users },
  { key: 'deliveries' as const, label: 'Deliveries', icon: Package },
]

const periodOptions = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last year' },
]

provide('metricsProduct', () => productStore.activeProductScopeForApi || '')
provide('metricsPeriod', period)
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 py-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <LayoutDashboard :size="18" class="text-[#4857FE]" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-gray-900">Overview</h1>
              <p class="text-sm text-gray-400 mt-0.5">{{ productStore.activeProductName }}</p>
          </div>
        </div>
        <!-- Period Selector -->
        <select
          v-model="period"
          class="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
        >
          <option v-for="opt in periodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="bg-white border-b border-gray-100 px-8">
      <div class="flex gap-0.5 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="flex items-center gap-1.5 px-3.5 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap"
          :class="activeTab === tab.key
            ? 'border-[#4857FE] text-[#4857FE]'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeTab = tab.key"
        >
          <component :is="tab.icon" :size="13" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Tab Content -->
    <div class="flex-1 overflow-y-auto">
      <ProductTab v-if="activeTab === 'product'" />
      <OverviewTab v-else-if="activeTab === 'tasks_dashboard'" :period="period" />
      <ThroughputTab v-else-if="activeTab === 'throughput'" :period="period" />
      <FlowTab v-else-if="activeTab === 'flow'" :period="period" />
      <QualityTab v-else-if="activeTab === 'quality'" :period="period" />
      <BlockersTab v-else-if="activeTab === 'blockers'" :period="period" />
      <PredictabilityTab v-else-if="activeTab === 'predictability'" :period="period" />
      <WorkloadTab v-else-if="activeTab === 'workload'" :period="period" />
      <DeliveriesTab v-else-if="activeTab === 'deliveries'" :period="period" />
    </div>
  </div>
</template>
