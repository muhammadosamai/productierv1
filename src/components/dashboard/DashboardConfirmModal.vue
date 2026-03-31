<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  danger?: boolean
}>(), {
  confirmLabel: 'Confirm',
  busy: false,
  danger: false,
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm'): void
}>()
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
    <div class="w-full max-w-md rounded-xl bg-white shadow-xl">
      <div class="border-b border-gray-100 px-4 py-3">
        <h3 class="text-sm font-semibold text-gray-900">{{ props.title }}</h3>
      </div>

      <div class="px-4 py-4">
        <p class="text-sm text-gray-600">{{ props.message }}</p>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
        <button
          type="button"
          class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-300"
          :disabled="props.busy"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          :class="props.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#4857FE] hover:bg-[#3f4de5]'"
          :disabled="props.busy"
          @click="emit('confirm')"
        >
          {{ props.confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
