<script setup lang="ts">
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { Chart, ArcElement, Tooltip, Legend } from 'chart.js'

Chart.register(ArcElement, Tooltip, Legend)

const props = withDefaults(defineProps<{
  labels: string[]
  data: number[]
  colors: string[]
  height?: number
  showLegend?: boolean
  centerLabel?: string
  centerValue?: string | number
}>(), {
  height: 200,
  showLegend: false,
})

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [{
    data: props.data,
    backgroundColor: props.colors,
    borderWidth: 2,
    borderColor: '#fff',
    hoverOffset: 4,
  }],
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '70%',
  plugins: {
    legend: {
      display: props.showLegend,
      position: 'bottom' as const,
      labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 10, family: 'Inter, system-ui, sans-serif' } },
    },
    tooltip: {
      backgroundColor: '#1F2937',
      titleFont: { size: 11, family: 'Inter, system-ui, sans-serif' },
      bodyFont: { size: 11, family: 'Inter, system-ui, sans-serif' },
      padding: 10,
      cornerRadius: 8,
    },
  },
}))
</script>

<template>
  <div class="relative" :style="{ height: height + 'px' }">
    <Doughnut :data="chartData" :options="options" />
    <div v-if="centerLabel || centerValue" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <span v-if="centerValue" class="text-xl font-bold text-gray-900">{{ centerValue }}</span>
      <span v-if="centerLabel" class="text-[10px] text-gray-400">{{ centerLabel }}</span>
    </div>
  </div>
</template>
