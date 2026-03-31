<script setup lang="ts">
import { computed, ref } from 'vue'
import { MoreHorizontal } from 'lucide-vue-next'
import type { DashboardPage } from '@/types/dashboard'

const props = withDefaults(defineProps<{
  page: DashboardPage | null
  busy?: boolean
  canMoveLeft?: boolean
  canMoveRight?: boolean
  allowReorder?: boolean
  templatesEnabled?: boolean
}>(), {
  busy: false,
  canMoveLeft: false,
  canMoveRight: false,
  allowReorder: false,
  templatesEnabled: true,
})

const emit = defineEmits<{
  rename: []
  share: []
  delete: []
  'save-template': []
  'move-left': []
  'move-right': []
}>()

const detailsRef = ref<HTMLDetailsElement | null>(null)

const canEditPage = computed(() => Boolean(props.page?.canEdit && !props.busy))
const canChangePageMeta = computed(() => Boolean(canEditPage.value && !props.page?.isSystem))
const canDeletePage = computed(() => Boolean(canEditPage.value && !props.page?.isSystem))
const canMovePageLeft = computed(() => Boolean(canEditPage.value && props.allowReorder && props.canMoveLeft))
const canMovePageRight = computed(() => Boolean(canEditPage.value && props.allowReorder && props.canMoveRight))

function closeMenu() {
  if (!detailsRef.value) return
  detailsRef.value.open = false
}

function trigger(event: 'rename' | 'share' | 'delete' | 'save-template' | 'move-left' | 'move-right') {
  switch (event) {
    case 'rename':
      emit('rename')
      break
    case 'share':
      emit('share')
      break
    case 'delete':
      emit('delete')
      break
    case 'save-template':
      emit('save-template')
      break
    case 'move-left':
      emit('move-left')
      break
    case 'move-right':
      emit('move-right')
      break
    default:
      break
  }
  closeMenu()
}
</script>

<template>
  <details
    ref="detailsRef"
    class="relative"
    data-testid="dashboard-page-actions-menu"
  >
    <summary
      class="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-[#4857FE]/40 hover:text-[#4857FE]"
      :class="props.busy ? 'pointer-events-none opacity-60' : ''"
    >
      <MoreHorizontal :size="16" />
    </summary>

    <div class="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
      <button
        v-if="props.templatesEnabled"
        type="button"
        class="w-full px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:text-gray-400"
        :disabled="!canEditPage"
        @click="trigger('save-template')"
      >
        Save as template
      </button>
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:text-gray-400"
        :disabled="!canMovePageLeft"
        @click="trigger('move-left')"
      >
        Move left
      </button>
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:text-gray-400"
        :disabled="!canMovePageRight"
        @click="trigger('move-right')"
      >
        Move right
      </button>
      <div class="my-1 border-t border-gray-100" />
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:text-gray-400"
        :disabled="!canChangePageMeta"
        @click="trigger('rename')"
      >
        Rename
      </button>
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:text-gray-400"
        :disabled="!canChangePageMeta"
        @click="trigger('share')"
      >
        Share access
      </button>
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-xs text-red-600 transition-colors hover:bg-red-50 disabled:text-red-300"
        :disabled="!canDeletePage"
        @click="trigger('delete')"
      >
        Delete page
      </button>
    </div>
  </details>
</template>
