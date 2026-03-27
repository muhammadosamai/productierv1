<script setup lang="ts">
import { computed } from 'vue'
import { Scatter } from 'vue-chartjs'
import {
  Chart, LinearScale, PointElement, Tooltip, Legend,
} from 'chart.js'

Chart.register(LinearScale, PointElement, Tooltip, Legend)

const props = withDefaults(defineProps<{
  datasets: { label: string; data: { x: number; y: number }[]; backgroundColor?: string; pointRadius?: number }[]
  height?: number
  xTitle?: string
  yTitle?: string
}>(), {
  height: 280,
})

const chartData = computed(() => ({
  datasets: props.datasets.map(ds => ({
    ...ds,
    backgroundColor: ds.backgroundColor || 'rgba(72,87,254,0.6)',
    pointRadius: ds.pointRadius ?? 5,
    pointHoverRadius: 7,
  })),
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: props.datasets.length > 1, position: 'top' as const, labels: { usePointStyle: true, font: { size: 11 } } },
    tooltip: { backgroundColor: '#1F2937', cornerRadius: 8, padding: 10, bodyFont: { size: 11, family: 'Inter, system-ui, sans-serif' } },
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: '#F3F4F6' },
      ticks: { font: { size: 10 }, color: '#9CA3AF' },
      title: props.xTitle ? { display: true, text: props.xTitle, font: { size: 10 }, color: '#9CA3AF' } : undefined,
    },
    y: {
      beginAtZero: true,
      grid: { color: '#F3F4F6' },
      ticks: { font: { size: 10 }, color: '#9CA3AF' },
      title: props.yTitle ? { display: true, text: props.yTitle, font: { size: 10 }, color: '#9CA3AF' } : undefined,
    },
  },
}))
</script>

<template>
  <div :style="{ height: height + 'px' }">
    <Scatter :data="chartData" :options="options" />
  </div>
</template>
