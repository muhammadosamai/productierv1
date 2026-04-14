<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { Pencil } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: string
    suggestions: string[]
    placeholder?: string
    disabled?: boolean
    loading?: boolean
    inputClass?: string
    /** Decorative pencil on the right (e.g. module field). Hidden while loading. */
    showTrailingEditIcon?: boolean
  }>(),
  {
    placeholder: '',
    disabled: false,
    loading: false,
    inputClass: '',
    showTrailingEditIcon: false,
  },
)

const inputRightPadClass = computed(() =>
  props.loading || props.showTrailingEditIcon ? 'pr-8' : '',
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  enter: []
  escape: []
  pick: [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const listOpen = ref(false)

const filteredSuggestions = computed(() => {
  const q = props.modelValue.toLowerCase().trim()
  const list = props.suggestions
  if (!q) return list
  return list.filter(s => s.toLowerCase().includes(q))
})

function onDocClick(ev: MouseEvent) {
  const el = rootRef.value
  const t = ev.target as Node
  if (el && !el.contains(t)) listOpen.value = false
}

/** Pending registration from deferred attach; cleared on close/unmount so the listener is never orphaned. */
let outsideClickTimer: ReturnType<typeof setTimeout> | null = null

function attachOutside() {
  if (outsideClickTimer != null) clearTimeout(outsideClickTimer)
  outsideClickTimer = setTimeout(() => {
    outsideClickTimer = null
    document.addEventListener('click', onDocClick)
  }, 0)
}

function detachOutside() {
  if (outsideClickTimer != null) {
    clearTimeout(outsideClickTimer)
    outsideClickTimer = null
  }
  document.removeEventListener('click', onDocClick)
}

watch(listOpen, (open) => {
  if (open) attachOutside()
  else detachOutside()
})

watch(
  () => props.suggestions.length,
  (n) => {
    if (n > 0 && document.activeElement === inputRef.value) listOpen.value = true
  },
)

onBeforeUnmount(() => {
  detachOutside()
})

function openList() {
  if (!props.disabled && props.suggestions.length > 0) listOpen.value = true
}

function onFocus() {
  openList()
}

function onInput() {
  if (props.suggestions.length > 0) listOpen.value = true
}

function pick(s: string) {
  emit('update:modelValue', s)
  emit('pick', s)
  listOpen.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (listOpen.value) {
      e.stopPropagation()
      listOpen.value = false
    } else {
      emit('escape')
    }
    return
  }
  if (e.key === 'Enter') {
    emit('enter')
  }
}

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<template>
  <div ref="rootRef" class="relative searchable-string-combobox">
    <div class="relative flex items-center">
      <input
        ref="inputRef"
        :value="modelValue"
        type="text"
        :disabled="disabled"
        :placeholder="placeholder"
        class="text-sm text-gray-700 placeholder:text-gray-400 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE] w-48 min-w-[12rem] disabled:opacity-50"
        :class="[inputClass, inputRightPadClass]"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value); onInput()"
        @focus="onFocus"
        @keydown="onKeydown"
      />
      <Pencil
        v-if="showTrailingEditIcon && !loading"
        :size="14"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none shrink-0"
        aria-hidden="true"
      />
      <span
        v-if="loading"
        class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
        aria-hidden="true"
      >
        <span class="inline-block w-3 h-3 border-2 border-gray-300 border-t-[#4857FE] rounded-full animate-spin" />
      </span>
    </div>
    <div
      v-if="listOpen && filteredSuggestions.length > 0"
      class="absolute top-full left-0 mt-1 z-[12] min-w-full max-h-[min(200px,40vh)] overflow-y-auto overscroll-y-contain bg-white border border-gray-200 rounded-lg shadow-lg py-1"
      role="listbox"
    >
      <button
        v-for="s in filteredSuggestions"
        :key="s"
        type="button"
        role="option"
        class="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 truncate"
        @mousedown.prevent="pick(s)"
      >
        {{ s }}
      </button>
    </div>
  </div>
</template>
