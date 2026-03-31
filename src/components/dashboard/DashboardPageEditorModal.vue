<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DashboardVisibility } from '@/types/dashboard'

type PageEditorMode = 'create' | 'rename'

const props = withDefaults(defineProps<{
  open: boolean
  mode: PageEditorMode
  initialName?: string
  initialVisibility?: DashboardVisibility
  canCreateTeamWide: boolean
  busy?: boolean
}>(), {
  initialName: '',
  initialVisibility: 'personal',
  busy: false,
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', payload: { name: string; visibility?: DashboardVisibility }): void
}>()

const name = ref('')
const visibility = ref<DashboardVisibility>('personal')

const title = computed(() => props.mode === 'create' ? 'Create Dashboard Page' : 'Rename Dashboard Page')
const saveLabel = computed(() => props.mode === 'create' ? 'Create Page' : 'Save Name')
const isCreateMode = computed(() => props.mode === 'create')

watch(() => [props.open, props.mode, props.initialName, props.initialVisibility], () => {
  if (!props.open) return
  name.value = String(props.initialName || '').trim()
  visibility.value = props.initialVisibility || 'personal'
}, { immediate: true })

function onSave() {
  const resolvedName = name.value.trim()
  if (!resolvedName) return

  if (isCreateMode.value) {
    emit('save', {
      name: resolvedName,
      visibility: visibility.value,
    })
    return
  }

  emit('save', { name: resolvedName })
}
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
    <div class="w-full max-w-lg rounded-xl bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 class="text-sm font-semibold text-gray-900">{{ title }}</h3>
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
          <label class="mb-1 block text-xs font-medium text-gray-600">Page name</label>
          <input
            v-model="name"
            type="text"
            maxlength="160"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Quarterly delivery review"
            :disabled="props.busy"
          >
        </div>

        <div v-if="isCreateMode">
          <label class="mb-1 block text-xs font-medium text-gray-600">Visibility</label>
          <select
            v-model="visibility"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            :disabled="props.busy"
          >
            <option value="personal">Personal</option>
            <option v-if="props.canCreateTeamWide" value="team">Team-wide</option>
            <option value="invited">Invited users</option>
          </select>
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
          :disabled="props.busy || !name.trim()"
          @click="onSave"
        >
          {{ saveLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
