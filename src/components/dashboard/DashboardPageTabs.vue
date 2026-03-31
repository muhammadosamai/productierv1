<script setup lang="ts">
import { computed } from 'vue'
import type { DashboardPage } from '@/types/dashboard'
import DashboardPageActionsMenu from '@/components/dashboard/DashboardPageActionsMenu.vue'

const props = withDefaults(defineProps<{
  pages: DashboardPage[]
  activePageId: string
  templatesEnabled?: boolean
  showLoadTemplateButton?: boolean
  showAddPageButton?: boolean
  allowReorder?: boolean
  busy?: boolean
}>(), {
  templatesEnabled: true,
  showLoadTemplateButton: true,
  showAddPageButton: true,
  allowReorder: false,
  busy: false,
})

const emit = defineEmits<{
  (event: 'select-page', pageId: string): void
  (event: 'open-templates'): void
  (event: 'save-template'): void
  (event: 'create-page'): void
  (event: 'rename-page', pageId: string): void
  (event: 'share-page', pageId: string): void
  (event: 'delete-page', pageId: string): void
  (event: 'move-page-left', pageId: string): void
  (event: 'move-page-right', pageId: string): void
}>()

const activePage = computed(() => props.pages.find((page) => page.id === props.activePageId) || null)
const activeIndex = computed(() => props.pages.findIndex((page) => page.id === props.activePageId))

function onRename() {
  if (!activePage.value) return
  emit('rename-page', activePage.value.id)
}

function onShare() {
  if (!activePage.value) return
  emit('share-page', activePage.value.id)
}

function onDelete() {
  if (!activePage.value || activePage.value.isSystem) return
  emit('delete-page', activePage.value.id)
}

function onMoveLeft() {
  if (!activePage.value) return
  emit('move-page-left', activePage.value.id)
}

function onMoveRight() {
  if (!activePage.value) return
  emit('move-page-right', activePage.value.id)
}
</script>

<template>
  <div class="border-b border-gray-100 bg-white px-4 py-3 sm:px-6">
    <div class="flex items-center gap-2">
      <div class="min-w-0 flex-1 overflow-x-auto">
        <div class="flex min-w-max items-center gap-2 pr-2">
          <button
            v-for="page in props.pages"
            :key="page.id"
            type="button"
            class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
            :class="props.activePageId === page.id
              ? 'border-[#4857FE] bg-[#4857FE] text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-[#4857FE]/40 hover:text-[#4857FE]'"
            @click="emit('select-page', page.id)"
          >
            <span>{{ page.name }}</span>
            <span
              v-if="page.visibility === 'team'"
              class="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]"
            >
              Team
            </span>
            <span
              v-else-if="page.visibility === 'invited'"
              class="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]"
            >
              Invited
            </span>
          </button>
        </div>
      </div>

      <button
        v-if="props.templatesEnabled && props.showLoadTemplateButton"
        type="button"
        class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-[#4857FE]/40 hover:text-[#4857FE]"
        :disabled="props.busy"
        @click="emit('open-templates')"
      >
        Load Template
      </button>
      <button
        v-if="props.showAddPageButton"
        type="button"
        class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-[#4857FE]/40 hover:text-[#4857FE]"
        :disabled="props.busy"
        @click="emit('create-page')"
      >
        Add Page
      </button>
      <DashboardPageActionsMenu
        v-if="activePage"
        :page="activePage"
        :busy="props.busy"
        :templates-enabled="props.templatesEnabled"
        :allow-reorder="props.allowReorder"
        :can-move-left="activeIndex > 0"
        :can-move-right="activeIndex > -1 && activeIndex < props.pages.length - 1"
        @save-template="emit('save-template')"
        @rename="onRename"
        @share="onShare"
        @delete="onDelete"
        @move-left="onMoveLeft"
        @move-right="onMoveRight"
      />
    </div>
  </div>
</template>
