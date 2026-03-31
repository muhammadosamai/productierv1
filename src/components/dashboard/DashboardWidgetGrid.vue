<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import draggable from 'vuedraggable'
import { GripVertical } from 'lucide-vue-next'
import type { DashboardPage, DashboardWidget } from '@/types/dashboard'

const props = withDefaults(defineProps<{
  page: DashboardPage | null
  widgets?: DashboardWidget[] | null
  renderers: Record<string, Component>
  editable: boolean
  allowDrag?: boolean
  busy?: boolean
  resolveWidgetProps?: (widget: DashboardWidget) => Record<string, unknown>
  resolveWidgetListeners?: (widget: DashboardWidget) => Record<string, (...args: any[]) => void>
}>(), {
  widgets: null,
  allowDrag: false,
  busy: false,
})

const emit = defineEmits<{
  (event: 'update-widget', payload: {
    widgetId: string
    gridW?: number
    gridH?: number
  }): void
  (event: 'remove-widget', widgetId: string): void
  (event: 'reorder-widgets', payload: { widgetIds: string[] }): void
}>()

const sizeOptions = [
  { value: '1x1', gridW: 1, gridH: 1 },
  { value: '1x2', gridW: 1, gridH: 2 },
  { value: '2x1', gridW: 2, gridH: 1 },
  { value: '2x2', gridW: 2, gridH: 2 },
]

const sortedWidgets = computed(() => {
  const source = props.widgets ?? props.page?.widgets ?? []
  return [...source].sort((a, b) => a.sortOrder - b.sortOrder)
})

const draggableWidgets = ref<DashboardWidget[]>([])

watch(sortedWidgets, (widgets) => {
  draggableWidgets.value = widgets.map((widget) => ({
    ...widget,
    configJson: { ...(widget.configJson || {}) },
  }))
}, { immediate: true, deep: true })

function sizeValue(widget: DashboardWidget): string {
  const width = Math.min(2, Math.max(1, Number(widget.gridW) || 1))
  const height = Math.min(2, Math.max(1, Number(widget.gridH) || 1))
  return `${width}x${height}`
}

function onSizeChange(widget: DashboardWidget, value: string) {
  const next = sizeOptions.find((option) => option.value === value)
  if (!next) return
  emit('update-widget', {
    widgetId: widget.id,
    gridW: next.gridW,
    gridH: next.gridH,
  })
}

function widgetStyle(widget: DashboardWidget) {
  const width = Math.min(2, Math.max(1, Number(widget.gridW) || 1))
  const height = Math.min(2, Math.max(1, Number(widget.gridH) || 1))
  return {
    gridColumn: `span ${width} / span ${width}`,
    gridRow: `span ${height} / span ${height}`,
  }
}

function widgetProps(widget: DashboardWidget): Record<string, unknown> {
  return props.resolveWidgetProps ? props.resolveWidgetProps(widget) : {}
}

function widgetListeners(widget: DashboardWidget): Record<string, (...args: any[]) => void> {
  return props.resolveWidgetListeners ? props.resolveWidgetListeners(widget) : {}
}

function emitReorder() {
  emit('reorder-widgets', {
    widgetIds: draggableWidgets.value.map((widget) => widget.id),
  })
}
</script>

<template>
  <div v-if="!props.page && !props.widgets" class="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
    No dashboard page selected.
  </div>

  <div v-else-if="sortedWidgets.length === 0" class="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
    No widgets yet. Use “Add Widget” to build your view.
  </div>

  <draggable
    v-else-if="props.allowDrag"
    v-model="draggableWidgets"
    item-key="id"
    :animation="180"
    :disabled="props.busy || !props.editable"
    handle=".dashboard-widget-drag-handle"
    ghost-class="opacity-50"
    drag-class="scale-[1.01]"
    class="grid grid-cols-1 items-start gap-4 xl:grid-cols-2"
    @end="emitReorder"
  >
    <template #item="{ element: widget }">
      <div
        class="self-start flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
        :style="widgetStyle(widget)"
      >
        <div class="flex items-center justify-between border-b border-gray-100 px-3 py-2">
          <div class="flex min-w-0 items-center gap-2">
            <button
              v-if="props.editable"
              type="button"
              class="dashboard-widget-drag-handle cursor-grab rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
              :disabled="props.busy"
              title="Drag widget"
            >
              <GripVertical :size="14" />
            </button>
            <h3 class="truncate text-sm font-semibold text-gray-800">
              {{ widget.widgetTitle || widget.widgetType }}
            </h3>
          </div>
          <div v-if="props.editable" class="flex items-center gap-2">
            <select
              :value="sizeValue(widget)"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
              :disabled="props.busy"
              @change="onSizeChange(widget, String(($event.target as HTMLSelectElement).value || '1x1'))"
            >
              <option v-for="size in sizeOptions" :key="size.value" :value="size.value">{{ size.value }}</option>
            </select>
            <button
              type="button"
              class="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              :disabled="props.busy"
              @click="emit('remove-widget', widget.id)"
            >
              Remove
            </button>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-auto">
          <component
            :is="props.renderers[widget.widgetType]"
            v-if="props.renderers[widget.widgetType]"
            v-bind="widgetProps(widget)"
            v-on="widgetListeners(widget)"
          />
          <div v-else class="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500">
            Unknown widget type: {{ widget.widgetType }}
          </div>
        </div>
      </div>
    </template>
  </draggable>

  <div v-else class="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
    <div
      v-for="widget in sortedWidgets"
      :key="widget.id"
      class="self-start flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
      :style="widgetStyle(widget)"
    >
      <div class="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <h3 class="truncate text-sm font-semibold text-gray-800">
          {{ widget.widgetTitle || widget.widgetType }}
        </h3>
        <div v-if="props.editable" class="flex items-center gap-2">
          <select
            :value="sizeValue(widget)"
            class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
            :disabled="props.busy"
            @change="onSizeChange(widget, String(($event.target as HTMLSelectElement).value || '1x1'))"
          >
            <option v-for="size in sizeOptions" :key="size.value" :value="size.value">{{ size.value }}</option>
          </select>
          <button
            type="button"
            class="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
            :disabled="props.busy"
            @click="emit('remove-widget', widget.id)"
          >
            Remove
          </button>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <component
          :is="props.renderers[widget.widgetType]"
          v-if="props.renderers[widget.widgetType]"
          v-bind="widgetProps(widget)"
          v-on="widgetListeners(widget)"
        />
        <div v-else class="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500">
          Unknown widget type: {{ widget.widgetType }}
        </div>
      </div>
    </div>
  </div>
</template>
