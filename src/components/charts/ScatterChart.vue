<script setup lang="ts">
import { computed } from 'vue'
import { Scatter } from 'vue-chartjs'
import {
  Chart, LinearScale, PointElement, Tooltip, Legend,
} from 'chart.js'

Chart.register(LinearScale, PointElement, Tooltip, Legend)

type ScatterPoint = {
  x: number
  y: number
  r?: number
  label?: string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  datasets: {
    label: string
    data: ScatterPoint[]
    backgroundColor?: string | string[]
    pointRadius?: number
    pointHoverRadius?: number
  }[]
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
    pointRadius: ds.data.map((point) => {
      const bubbleRadius = Number(point.r ?? 0)
      if (Number.isFinite(bubbleRadius) && bubbleRadius > 0) {
        return Math.max(3, Math.min(18, bubbleRadius))
      }
      return ds.pointRadius ?? 5
    }),
    pointHoverRadius: ds.data.map((point) => {
      const bubbleRadius = Number(point.r ?? 0)
      if (Number.isFinite(bubbleRadius) && bubbleRadius > 0) {
        return Math.max(5, Math.min(22, bubbleRadius + 2))
      }
      return ds.pointHoverRadius ?? 7
    }),
  })),
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 4, right: 8, bottom: 0, left: 0 } },
  plugins: {
    legend: {
      display: props.datasets.length > 1,
      position: 'top' as const,
      align: 'start' as const,
      labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 12, font: { size: 11 } },
    },
    tooltip: {
      backgroundColor: '#1F2937',
      cornerRadius: 8,
      padding: 10,
      bodyFont: { size: 11, family: 'Inter, system-ui, sans-serif' },
      callbacks: {
        label: (context: any) => {
          const raw = context.raw as ScatterPoint
          const values = [`x: ${raw.x}`, `y: ${raw.y}`]
          if (typeof raw.r === 'number') values.push(`size: ${Math.round(raw.r)}`)
          const tail = raw.label ? ` (${raw.label})` : ''
          return `${context.dataset.label}${tail} - ${values.join(', ')}`
        },
      },
    },
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
