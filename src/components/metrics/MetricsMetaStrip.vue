<script setup lang="ts">
import { computed } from 'vue'
import type { MetricsMeta } from '@/types/metrics'

const props = defineProps<{
  meta?: MetricsMeta | null
}>()

const generatedLabel = computed(() => {
  if (!props.meta?.generatedAt) return '—'
  const generated = new Date(props.meta.generatedAt)
  const deltaMs = Date.now() - generated.getTime()
  const minutes = Math.floor(deltaMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
})

const sampleSummary = computed(() => {
  if (!props.meta) return ''
  const pairs = Object.entries(props.meta.sampleSize)
  if (pairs.length === 0) return 'n/a'
  return pairs.map(([key, count]) => `${key}: ${count}`).join(' | ')
})
</script>

<template>
  <div
    v-if="meta"
    class="rounded-lg border border-gray-100 bg-white px-3 py-2 text-[11px] sm:text-xs text-gray-500 flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1"
  >
    <span>
      <strong class="text-gray-700 font-medium">Updated:</strong>
      {{ generatedLabel }}
      <span class="hidden sm:inline">({{ new Date(meta.generatedAt).toLocaleString() }})</span>
    </span>
    <span>
      <strong class="text-gray-700 font-medium">Window:</strong>
      {{ meta.sourceWindow.periodDays }}d{{ meta.sourceWindow.granularity ? ` / ${meta.sourceWindow.granularity}` : '' }}
    </span>
    <span><strong class="text-gray-700 font-medium">Sample:</strong> {{ sampleSummary }}</span>
    <span v-if="meta.cacheTtl !== null"><strong class="text-gray-700 font-medium">Cache TTL:</strong> {{ meta.cacheTtl }}s</span>
    <span v-if="meta.lowSample" class="text-amber-700">
      <strong class="font-medium">Low sample:</strong> interpret trends with caution
    </span>
  </div>
</template>
