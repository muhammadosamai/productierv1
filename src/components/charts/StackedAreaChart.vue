<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const props = withDefaults(defineProps<{
  labels: string[]
  datasets: { label: string; data: number[]; borderColor: string; backgroundColor: string }[]
  height?: number
}>(), {
  height: 300,
})

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map(ds => ({
    ...ds,
    fill: true,
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 1.5,
  })),
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 10, family: 'Inter, system-ui, sans-serif' } },
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
      grid: { display: false },
      ticks: { font: { size: 10, family: 'Inter, system-ui, sans-serif' }, color: '#9CA3AF' },
    },
    y: {
      stacked: true,
      beginAtZero: true,
      grid: { color: '#F3F4F6' },
      ticks: { font: { size: 10, family: 'Inter, system-ui, sans-serif' }, color: '#9CA3AF' },
    },
  },
}))
</script>

<template>
  <div :style="{ height: height + 'px' }">
    <Line :data="chartData" :options="options" />
  </div>
</template>
