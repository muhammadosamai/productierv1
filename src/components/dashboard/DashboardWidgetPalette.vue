<script setup lang="ts">
export interface DashboardWidgetCatalogEntry {
  type: string
  label: string
  description: string
  defaultGridW?: number
  defaultGridH?: number
}

const props = withDefaults(defineProps<{
  items: DashboardWidgetCatalogEntry[]
  busy?: boolean
}>(), {
  busy: false,
})

const emit = defineEmits<{
  (event: 'add-widget', payload: {
    widgetType: string
    widgetTitle?: string
    gridW?: number
    gridH?: number
  }): void
}>()
</script>

<template>
  <div class="rounded-xl border border-gray-100 bg-white p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-800">Add Widget</h3>
      <span class="text-[11px] text-gray-400">Drag-and-drop ready grid sizes (1x1 to 2x2)</span>
    </div>
    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <button
        v-for="item in props.items"
        :key="item.type"
        type="button"
        class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:border-[#4857FE]/40 hover:bg-[#4857FE]/5"
        :disabled="props.busy"
        @click="emit('add-widget', {
          widgetType: item.type,
          widgetTitle: item.label,
          gridW: item.defaultGridW,
          gridH: item.defaultGridH,
        })"
      >
        <p class="text-sm font-medium text-gray-800">{{ item.label }}</p>
        <p class="mt-1 text-xs text-gray-500">{{ item.description }}</p>
      </button>
    </div>
  </div>
</template>
