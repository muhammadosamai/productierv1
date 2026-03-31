<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'

Chart.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = withDefaults(defineProps<{
  labels: string[]
  datasets: { label: string; data: number[]; backgroundColor?: string | string[]; borderRadius?: number }[]
  height?: number
  showLegend?: boolean
  stacked?: boolean
  horizontal?: boolean
}>(), {
  height: 280,
  showLegend: true,
  stacked: false,
  horizontal: false,
})

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map(ds => ({
    ...ds,
    backgroundColor: ds.backgroundColor || '#4857FE',
    borderRadius: ds.borderRadius ?? 4,
    borderSkipped: false as const,
  })),
}))

const options = computed(() => ({
  indexAxis: (props.horizontal ? 'y' : 'x') as 'x' | 'y',
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 4, right: 8, bottom: 0, left: 0 } },
  plugins: {
    legend: {
      display: props.showLegend && props.datasets.length > 1,
      position: 'top' as const,
      align: 'start' as const,
      labels: {
        usePointStyle: true,
        pointStyle: 'circle',
        boxWidth: 8,
        boxHeight: 8,
        padding: 12,
        font: { size: 11, family: 'Inter, system-ui, sans-serif' },
      },
    },
    tooltip: {
      backgroundColor: '#1F2937',
      titleFont: { size: 11, family: 'Inter, system-ui, sans-serif' },
      bodyFont: { size: 11, family: 'Inter, system-ui, sans-serif' },
      padding: 10,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      stacked: props.stacked,
      grid: { display: props.horizontal },
      ticks: {
        font: { size: 10, family: 'Inter, system-ui, sans-serif' },
        color: '#9CA3AF',
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 10,
      },
    },
    y: {
      stacked: props.stacked,
      beginAtZero: true,
      grid: { color: '#F3F4F6', display: !props.horizontal },
      ticks: { font: { size: 10, family: 'Inter, system-ui, sans-serif' }, color: '#9CA3AF' },
    },
  },
}))
</script>

<template>
  <div :style="{ height: height + 'px' }">
    <Bar :data="chartData" :options="options" />
  </div>
</template>
