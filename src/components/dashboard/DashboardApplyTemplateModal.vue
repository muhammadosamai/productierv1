<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DashboardTemplate, DashboardTemplateApplyMode } from '@/types/dashboard'

const props = withDefaults(defineProps<{
  open: boolean
  template: DashboardTemplate | null
  busy?: boolean
}>(), {
  busy: false,
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'apply', mode: DashboardTemplateApplyMode): void
}>()

const mode = ref<DashboardTemplateApplyMode>('append')

const pageCount = computed(() => props.template?.pages.length || 0)
const widgetCount = computed(() =>
  (props.template?.pages || []).reduce((total, page) => total + page.widgets.length, 0),
)

watch(() => [props.open, props.template?.id], () => {
  if (!props.open) return
  mode.value = 'append'
}, { immediate: true })

function onApply() {
  emit('apply', mode.value)
}
</script>

<template>
  <div v-if="props.open && props.template" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
    <div class="w-full max-w-xl rounded-xl bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 class="text-sm font-semibold text-gray-900">Apply Template</h3>
        <button
          type="button"
          class="text-sm text-gray-500 hover:text-gray-700"
          @click="emit('close')"
        >
          Close
        </button>
      </div>

      <div class="space-y-4 p-4">
        <div>
          <p class="text-sm font-medium text-gray-800">{{ props.template.name }}</p>
          <p class="mt-1 text-xs text-gray-500">{{ props.template.description || 'No description provided.' }}</p>
          <p class="mt-1 text-[11px] text-gray-400">{{ pageCount }} page(s) · {{ widgetCount }} widget(s)</p>
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-medium text-gray-600">Apply mode</label>

          <label class="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 hover:border-[#4857FE]/40">
            <input
              v-model="mode"
              type="radio"
              value="append"
              :disabled="props.busy"
            >
            <div>
              <p class="text-sm font-medium text-gray-800">Append</p>
              <p class="text-xs text-gray-500">Keep current pages and add this template’s pages.</p>
            </div>
          </label>

          <label class="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 hover:border-[#4857FE]/40">
            <input
              v-model="mode"
              type="radio"
              value="replace_custom"
              :disabled="props.busy"
            >
            <div>
              <p class="text-sm font-medium text-gray-800">Replace custom pages</p>
              <p class="text-xs text-gray-500">Remove editable custom pages, keep locked system pages, then apply template pages.</p>
            </div>
          </label>
        </div>

        <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p class="text-[11px] text-amber-700">
            Locked system pages (for example, Feed) are always preserved.
          </p>
        </div>
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
          class="rounded-lg bg-[#4857FE] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3f4de5] disabled:opacity-60"
          :disabled="props.busy"
          @click="onApply"
        >
          Apply Template
        </button>
      </div>
    </div>
  </div>
</template>
