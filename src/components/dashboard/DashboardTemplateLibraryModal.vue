<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DashboardTemplate } from '@/types/dashboard'

const props = withDefaults(defineProps<{
  open: boolean
  templates: DashboardTemplate[]
  canManageTemplates: boolean
  canApplyTemplates: boolean
  busy?: boolean
}>(), {
  busy: false,
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save-template'): void
  (event: 'apply-template', templateId: string): void
  (event: 'delete-template', templateId: string): void
}>()

const search = ref('')

const sortedTemplates = computed(() => {
  const source = Array.isArray(props.templates) ? props.templates : []
  return [...source].sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === 'system' ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })
})

const filteredTemplates = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return sortedTemplates.value
  return sortedTemplates.value.filter((template) => {
    const pages = template.pages.map((page) => page.name).join(' ')
    const haystack = `${template.name} ${template.description || ''} ${pages}`.toLowerCase()
    return haystack.includes(term)
  })
})

const presetTemplates = computed(() => filteredTemplates.value.filter((template) => template.source === 'system'))
const savedTemplates = computed(() => filteredTemplates.value.filter((template) => template.source === 'user'))

function sourceBadge(template: DashboardTemplate) {
  return template.source === 'system' ? 'Preset' : 'Saved'
}

function canApplyTemplate() {
  return props.canApplyTemplates && !props.busy
}
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
    <div class="w-full max-w-4xl rounded-xl bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h3 class="text-sm font-semibold text-gray-900">Dashboard Templates</h3>
          <p class="mt-0.5 text-xs text-gray-500">Load a preset or reuse saved layouts. Replace mode always keeps locked system pages (like Feed).</p>
        </div>
        <button
          type="button"
          class="text-sm text-gray-500 hover:text-gray-700"
          @click="emit('close')"
        >
          Close
        </button>
      </div>

      <div class="max-h-[65vh] space-y-4 overflow-auto p-4">
        <div>
          <input
            v-model="search"
            type="text"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Search templates by name, description, or page"
            :disabled="props.busy"
          >
        </div>

        <div v-if="filteredTemplates.length === 0" class="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No templates available yet.
        </div>

        <div v-if="presetTemplates.length > 0">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Built-in Presets</p>
          <div class="space-y-3">
            <div
              v-for="template in presetTemplates"
              :key="template.id"
              class="rounded-lg border border-gray-200 p-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="text-sm font-semibold text-gray-800">{{ template.name }}</h4>
                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {{ sourceBadge(template) }}
                </span>
                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {{ template.visibility === 'team' ? 'Team' : 'Personal' }}
                </span>
              </div>
              <p class="mt-1 text-xs text-gray-500">
                {{ template.description || 'No description provided.' }}
              </p>
              <p class="mt-1 text-[11px] text-gray-400">
                {{ template.pages.length }} page(s) ·
                {{ template.pages.reduce((total, page) => total + page.widgets.length, 0) }} widget(s)
              </p>
              <div class="mt-2 rounded-lg bg-gray-50 px-2.5 py-2">
                <p class="text-[11px] font-medium text-gray-600">Page preview</p>
                <ul class="mt-1 space-y-0.5 text-[11px] text-gray-500">
                  <li v-for="page in template.pages.slice(0, 3)" :key="`${template.id}-${page.slug}`">
                    {{ page.name }} · {{ page.widgets.length }} widget(s)
                  </li>
                </ul>
              </div>
              <div class="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-[#4857FE] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3f4de5] disabled:opacity-60"
                  :disabled="!canApplyTemplate()"
                  @click="emit('apply-template', template.id)"
                >
                  Choose apply mode
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="savedTemplates.length > 0">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Saved Templates</p>
          <div class="space-y-3">
            <div
              v-for="template in savedTemplates"
              :key="template.id"
              class="rounded-lg border border-gray-200 p-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="text-sm font-semibold text-gray-800">{{ template.name }}</h4>
                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {{ sourceBadge(template) }}
                </span>
                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {{ template.visibility === 'team' ? 'Team' : 'Personal' }}
                </span>
              </div>
              <p class="mt-1 text-xs text-gray-500">
                {{ template.description || 'No description provided.' }}
              </p>
              <p class="mt-1 text-[11px] text-gray-400">
                {{ template.pages.length }} page(s) ·
                {{ template.pages.reduce((total, page) => total + page.widgets.length, 0) }} widget(s)
              </p>
              <div class="mt-2 rounded-lg bg-gray-50 px-2.5 py-2">
                <p class="text-[11px] font-medium text-gray-600">Page preview</p>
                <ul class="mt-1 space-y-0.5 text-[11px] text-gray-500">
                  <li v-for="page in template.pages.slice(0, 3)" :key="`${template.id}-${page.slug}`">
                    {{ page.name }} · {{ page.widgets.length }} widget(s)
                  </li>
                </ul>
              </div>
              <div class="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-[#4857FE] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3f4de5] disabled:opacity-60"
                  :disabled="!canApplyTemplate()"
                  @click="emit('apply-template', template.id)"
                >
                  Choose apply mode
                </button>
                <button
                  v-if="template.canDelete"
                  type="button"
                  class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-60"
                  :disabled="props.busy"
                  @click="emit('delete-template', template.id)"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        <p class="text-xs text-gray-500">
          Save your current custom pages as a reusable template for this scope.
        </p>
        <button
          type="button"
          class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-[#4857FE]/40 hover:text-[#4857FE] disabled:opacity-60"
          :disabled="props.busy || !props.canManageTemplates"
          @click="emit('save-template')"
        >
          Save Current as Template
        </button>
      </div>
    </div>
  </div>
</template>
