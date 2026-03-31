<script setup lang="ts">
import { computed } from 'vue'

type KpiTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'purple'

const props = withDefaults(defineProps<{
  label: string
  value: string | number
  detail?: string
  tone?: KpiTone
}>(), {
  detail: '',
  tone: 'neutral',
})

const toneClass = computed(() => {
  switch (props.tone) {
    case 'primary':
      return 'text-[#4857FE] bg-[#4857FE]/10'
    case 'success':
      return 'text-emerald-700 bg-emerald-50'
    case 'warning':
      return 'text-amber-700 bg-amber-50'
    case 'danger':
      return 'text-red-700 bg-red-50'
    case 'purple':
      return 'text-purple-700 bg-purple-50'
    default:
      return 'text-gray-600 bg-gray-100'
  }
})
</script>

<template>
  <article class="rounded-xl border border-gray-100 bg-white p-4">
    <div class="mb-2 flex items-center justify-between gap-3">
      <p class="text-xs font-medium uppercase tracking-wide text-gray-400">{{ label }}</p>
      <span class="inline-flex h-6 w-6 items-center justify-center rounded-md" :class="toneClass">
        <slot name="icon" />
      </span>
    </div>
    <p class="text-2xl font-bold leading-none text-gray-900">{{ value }}</p>
    <p v-if="detail" class="mt-2 text-xs text-gray-500">{{ detail }}</p>
    <slot />
  </article>
</template>
