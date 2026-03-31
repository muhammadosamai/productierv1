<script setup lang="ts">
import { computed } from 'vue'
import { Info } from 'lucide-vue-next'
import { METRIC_GLOSSARY } from './glossary'

const props = withDefaults(defineProps<{
  metricKey: string
  label?: string
}>(), {
  label: 'Metric info',
})

const entry = computed(() => METRIC_GLOSSARY[props.metricKey])
</script>

<template>
  <details class="relative inline-block">
    <summary class="list-none cursor-pointer inline-flex items-center text-gray-400 hover:text-gray-600">
      <Info :size="13" />
      <span class="sr-only">{{ label }}</span>
    </summary>
    <div
      v-if="entry"
      class="absolute z-30 right-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg"
    >
      <p class="font-semibold text-gray-800">{{ entry.title }}</p>
      <p class="mt-1"><span class="font-medium text-gray-700">Formula:</span> {{ entry.formula }}</p>
      <p class="mt-1"><span class="font-medium text-gray-700">Caveat:</span> {{ entry.caveat }}</p>
      <p class="mt-1"><span class="font-medium text-gray-700">What to do:</span> {{ entry.action }}</p>
    </div>
  </details>
</template>
