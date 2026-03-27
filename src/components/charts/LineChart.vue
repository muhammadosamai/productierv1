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
  datasets: { label: string; data: number[]; borderColor?: string; backgroundColor?: string; fill?: boolean; tension?: number; borderDash?: number[] }[]
  height?: number
  showLegend?: boolean
  yTitle?: string
}>(), {
  height: 280,
  showLegend: true,
})

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map(ds => ({
    ...ds,
    borderColor: ds.borderColor || '#4857FE',
    backgroundColor: ds.backgroundColor || (ds.fill ? 'rgba(72,87,254,0.08)' : 'transparent'),
    tension: ds.tension ?? 0.3,
    pointRadius: 3,
    pointHoverRadius: 5,
    borderWidth: 2,
  })),
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      display: props.showLegend && props.datasets.length > 1,
      position: 'top' as const,
      labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11, family: 'Inter, system-ui, sans-serif' } },
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
      beginAtZero: true,
      grid: { color: '#F3F4F6' },
      ticks: { font: { size: 10, family: 'Inter, system-ui, sans-serif' }, color: '#9CA3AF' },
      title: props.yTitle ? { display: true, text: props.yTitle, font: { size: 10 }, color: '#9CA3AF' } : undefined,
    },
  },
}))
</script>

<template>
  <div :style="{ height: height + 'px' }">
    <Line :data="chartData" :options="options" />
  </div>
</template>
