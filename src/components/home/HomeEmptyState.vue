<script setup lang="ts">
withDefaults(defineProps<{
  message: string
}>(), {
  message: 'No data available.',
})
</script>

<template>
  <div class="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
    {{ message }}
  </div>
</template>
