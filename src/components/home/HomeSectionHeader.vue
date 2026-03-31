<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
}>(), {
  description: '',
})
</script>

<template>
  <div class="mb-3 flex items-start justify-between gap-3">
    <div>
      <h3 class="text-sm font-semibold text-gray-800">{{ title }}</h3>
      <p v-if="description" class="mt-1 text-xs text-gray-400">{{ description }}</p>
    </div>
    <div class="shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>
