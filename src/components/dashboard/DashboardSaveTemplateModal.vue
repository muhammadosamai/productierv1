<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DashboardPage, DashboardTemplateVisibility } from '@/types/dashboard'

const props = withDefaults(defineProps<{
  open: boolean
  pages: DashboardPage[]
  canCreateTeamWide: boolean
  busy?: boolean
}>(), {
  busy: false,
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', payload: {
    name: string
    description?: string
    visibility: DashboardTemplateVisibility
    pageIds: string[]
  }): void
}>()

const name = ref('')
const description = ref('')
const visibility = ref<DashboardTemplateVisibility>('personal')
const selectedPageIds = ref<string[]>([])

const selectablePages = computed(() =>
  (props.pages || []).filter((page) => !page.isSystem && page.canEdit),
)

watch(() => [props.open, selectablePages.value.map((page) => page.id).join('|')], () => {
  if (!props.open) return
  name.value = ''
  description.value = ''
  visibility.value = props.canCreateTeamWide ? 'team' : 'personal'
  selectedPageIds.value = selectablePages.value.map((page) => page.id)
}, { immediate: true })

function togglePage(pageId: string) {
  const set = new Set(selectedPageIds.value)
  if (set.has(pageId)) set.delete(pageId)
  else set.add(pageId)
  selectedPageIds.value = [...set]
}

function onSave() {
  const resolvedName = name.value.trim()
  if (!resolvedName) return
  if (selectedPageIds.value.length === 0) return
  emit('save', {
    name: resolvedName,
    description: description.value.trim() || undefined,
    visibility: visibility.value,
    pageIds: selectedPageIds.value,
  })
}
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
    <div class="w-full max-w-2xl rounded-xl bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 class="text-sm font-semibold text-gray-900">Save Dashboard Template</h3>
        <button
          type="button"
          class="text-sm text-gray-500 hover:text-gray-700"
          @click="emit('close')"
        >
          Close
        </button>
      </div>

      <div class="space-y-4 p-4">
        <p class="text-xs text-gray-500">
          Save only custom pages you want to reuse later. Locked system pages are excluded automatically.
        </p>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Template name</label>
          <input
            v-model="name"
            type="text"
            maxlength="160"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Quarterly Delivery Review"
            :disabled="props.busy"
          />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Description (optional)</label>
          <textarea
            v-model="description"
            maxlength="1000"
            rows="3"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Reusable setup for delivery checkpoints and flow health."
            :disabled="props.busy"
          />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Visibility</label>
          <select
            v-model="visibility"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            :disabled="props.busy"
          >
            <option value="personal">Personal</option>
            <option v-if="props.canCreateTeamWide" value="team">Team-wide</option>
          </select>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Include pages</label>
          <div v-if="selectablePages.length === 0" class="rounded-lg border border-dashed border-gray-300 p-3 text-xs text-gray-500">
            No editable custom pages are available yet. Create and customize pages first.
          </div>
          <div v-else class="max-h-56 space-y-1 overflow-auto rounded-lg border border-gray-100 p-2">
            <label
              v-for="page in selectablePages"
              :key="page.id"
              class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                :checked="selectedPageIds.includes(page.id)"
                :disabled="props.busy"
                @change="togglePage(page.id)"
              >
              <div class="min-w-0">
                <p class="truncate text-sm text-gray-800">{{ page.name }}</p>
                <p class="truncate text-xs text-gray-400">
                  {{ page.widgets.length }} widget(s)
                </p>
              </div>
            </label>
          </div>
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
          :disabled="props.busy || !name.trim() || selectedPageIds.length === 0"
          @click="onSave"
        >
          Save Template
        </button>
      </div>
    </div>
  </div>
</template>
