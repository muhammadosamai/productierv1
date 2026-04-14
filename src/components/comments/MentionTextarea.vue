<script setup lang="ts">
import { ref, computed, watch, useAttrs, shallowRef } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import History from '@tiptap/extension-history'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion'
import type { MentionUser } from '@/lib/commentMentions'
import { filterMentionUsers } from '@/lib/commentMentions'
import { plainCommentToTiptapDoc, tiptapDocToPlainComment } from '@/lib/commentMentionEditor'
import UploadAssetImg from '@/components/shared/UploadAssetImg.vue'

const COMMENT_MENTION_SUGGESTION_KEY = new PluginKey('commentComposerMention')

type MentionPick = { id: string; label: string }

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue: string
    users: MentionUser[]
    rows?: number
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    rows: 2,
    placeholder: '',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const attrs = useAttrs()

const wrapperBind = computed(() => {
  const { onKeydown: _k, class: _c, ...rest } = attrs as Record<string, unknown>
  return rest
})

const wrapperClass = computed(() => {
  const base =
    'w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 outline-none focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 transition-colors'
  const extra = attrs.class
  if (!extra) return base
  if (typeof extra === 'string') return `${base} ${extra}`
  if (Array.isArray(extra)) return [base, ...extra].join(' ')
  return [base, extra].join(' ')
})

const editorHostClass =
  'mention-textarea-editor prose prose-sm max-w-none min-w-0 [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[2.5rem] [&_.ProseMirror]:text-sm [&_.ProseMirror]:text-gray-700 [&_.ProseMirror]:leading-relaxed [&_.ProseMirror_p]:m-0'

const rootRef = ref<HTMLElement | null>(null)
const editorRef = shallowRef<Editor | null>(null)
const suggestionOpen = ref(false)
const mentionItems = ref<MentionPick[]>([])
const selectedIdx = ref(-1)
let latestSuggestionProps: SuggestionProps<MentionPick, MentionPick> | null = null

function forwardKeydown(e: KeyboardEvent) {
  const raw = attrs.onKeydown
  if (typeof raw === 'function') {
    ;(raw as (ev: KeyboardEvent) => void)(e)
  } else if (Array.isArray(raw)) {
    for (const fn of raw) {
      ;(fn as (ev: KeyboardEvent) => void)(e)
    }
  }
}

/** Match Vue `@keydown.enter.exact` — only bare Enter, not Shift/Ctrl/Meta/Alt. */
function isBareEnter(event: KeyboardEvent) {
  return (
    event.key === 'Enter'
    && !event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
  )
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const userByIdLower = computed(() => {
  const m = new Map<string, MentionUser>()
  for (const u of props.users) {
    m.set(u.id.toLowerCase(), u)
  }
  return m
})

function userForPick(pick: MentionPick): MentionUser | null {
  return userByIdLower.value.get(pick.id.toLowerCase()) ?? null
}

const showMentionMenu = computed(
  () => suggestionOpen.value && !props.disabled && latestSuggestionProps !== null,
)

onClickOutside(rootRef, () => {
  const ed = editorRef.value
  if (!ed) return
  exitSuggestion(ed.view, COMMENT_MENTION_SUGGESTION_KEY)
  suggestionOpen.value = false
  mentionItems.value = []
  selectedIdx.value = -1
  latestSuggestionProps = null
})

const editor = useEditor({
  content: plainCommentToTiptapDoc(props.modelValue, props.users),
  editable: !props.disabled,
  onCreate: ({ editor: ed }) => {
    editorRef.value = ed
  },
  onDestroy: () => {
    editorRef.value = null
  },
  extensions: [
    Document,
    Paragraph,
    Text,
    HardBreak,
    History,
    Placeholder.configure({
      placeholder: props.placeholder || '',
      showOnlyWhenEditable: true,
    }),
    Mention.configure({
      HTMLAttributes: {
        class:
          'mention-pill rounded px-1 py-0.5 bg-[#7C5CFC]/15 text-[#4857FE] font-medium not-prose align-baseline',
      },
      renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id ?? ''}`,
      renderHTML: ({ node }) => [
        'span',
        {
          class:
            'mention-pill rounded px-1 py-0.5 bg-[#7C5CFC]/15 text-[#4857FE] font-medium not-prose align-baseline',
        },
        `@${node.attrs.label ?? node.attrs.id ?? ''}`,
      ],
      suggestion: {
        char: '@',
        pluginKey: COMMENT_MENTION_SUGGESTION_KEY,
        allowSpaces: false,
        allowedPrefixes: [' '],
        items: ({ query }) =>
          filterMentionUsers(props.users, query, 20).map(u => ({ id: u.id, label: u.name })),
        render: () => ({
          onStart: p => {
            suggestionOpen.value = true
            latestSuggestionProps = p
            mentionItems.value = p.items as MentionPick[]
            selectedIdx.value = mentionItems.value.length > 0 ? 0 : -1
          },
          onUpdate: p => {
            latestSuggestionProps = p
            mentionItems.value = p.items as MentionPick[]
            if (mentionItems.value.length > 0) {
              if (selectedIdx.value < 0 || selectedIdx.value >= mentionItems.value.length) {
                selectedIdx.value = 0
              }
            } else {
              selectedIdx.value = -1
            }
          },
          onExit: () => {
            suggestionOpen.value = false
            mentionItems.value = []
            selectedIdx.value = -1
            latestSuggestionProps = null
          },
          onKeyDown: ({ event }) => {
            const p = latestSuggestionProps
            if (!p) return false

            if (event.key === 'Escape' || event.key === 'Esc') {
              return false
            }

            const items = p.items as MentionPick[]

            if (items.length > 0) {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                selectedIdx.value = Math.min(selectedIdx.value + 1, items.length - 1)
                return true
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                selectedIdx.value = Math.max(selectedIdx.value - 1, -1)
                return true
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                const idx = Math.max(0, selectedIdx.value)
                const pick = items[idx]
                if (pick) p.command(pick)
                return true
              }
            }

            return false
          },
        }),
      },
    }),
  ],
  editorProps: {
    attributes: {
      class: editorHostClass,
    },
    handleKeyDown(_view, event) {
      if (event.isComposing) return false
      if (props.disabled) return false
      const ed = editorRef.value
      if (event.key === 'Enter' && event.shiftKey) {
        ed?.chain().focus().setHardBreak().run()
        return true
      }
      if (isBareEnter(event)) {
        if (suggestionOpen.value) return false
        forwardKeydown(event)
        return true
      }
      return false
    },
  },
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', tiptapDocToPlainComment(ed.getJSON()))
  },
})

watch(
  () => props.modelValue,
  val => {
    const ed = editorRef.value
    if (!ed) return
    const current = tiptapDocToPlainComment(ed.getJSON())
    if (val !== current) {
      ed.commands.setContent(plainCommentToTiptapDoc(val, props.users), { emitUpdate: false })
    }
  },
)

/** Re-resolve mention labels when roster loads or member names change; plain API text unchanged. */
const usersDisplayRefreshKey = computed(() =>
  props.users.map(u => `${u.id}:${u.name}`).join('|'),
)

watch(usersDisplayRefreshKey, () => {
  const ed = editorRef.value
  if (!ed) return
  const plain = tiptapDocToPlainComment(ed.getJSON())
  ed.commands.setContent(plainCommentToTiptapDoc(plain, props.users), { emitUpdate: false })
})

watch(
  () => props.disabled,
  d => {
    editorRef.value?.setEditable(!d)
  },
)

function pickUser(pick: MentionPick) {
  const p = latestSuggestionProps
  if (!p) return
  p.command(pick)
}

const editorMinHeightStyle = computed(() => ({
  minHeight: `${Math.max(2, props.rows) * 1.375}rem`,
}))
</script>

<style scoped>
:deep(.mention-textarea-editor .ProseMirror p.is-editor-empty:first-child::before) {
  color: #9ca3af;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
</style>

<template>
  <div ref="rootRef" class="relative">
    <div :class="wrapperClass" :style="editorMinHeightStyle" v-bind="wrapperBind">
      <EditorContent v-if="editor" :editor="editor" />
    </div>

    <div
      v-if="showMentionMenu"
      class="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-[200]"
      @mousedown.prevent
    >
      <template v-if="mentionItems.length > 0">
        <button
          v-for="(pick, idx) in mentionItems"
          :key="pick.id"
          type="button"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
          :class="idx === selectedIdx ? 'bg-[#4857FE]/10' : 'hover:bg-gray-50'"
          @click="pickUser(pick)"
        >
          <div
            class="w-7 h-7 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden shrink-0"
          >
            <UploadAssetImg
              v-if="userForPick(pick)?.avatar"
              :src="userForPick(pick)!.avatar!"
              class="w-7 h-7 rounded-full object-cover"
              :alt="pick.label"
            />
            <span v-else>{{ getInitials(pick.label) }}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-medium text-gray-900 truncate">{{ pick.label }}</span>
            <span v-if="userForPick(pick)" class="text-[10px] text-gray-400 truncate">{{
              userForPick(pick)!.email
            }}</span>
          </div>
        </button>
      </template>
      <div v-else class="px-3 py-2.5 text-xs text-gray-400 text-center">No matching team members</div>
    </div>
  </div>
</template>
