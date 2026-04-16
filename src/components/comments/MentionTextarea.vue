<script setup lang="ts">
import { ref, computed, watch, useAttrs, shallowRef } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { Editor } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion'
import type { MentionUser } from '@/lib/commentMentions'
import { filterMentionUsers } from '@/lib/commentMentions'
import {
  hydrateCommentEditorContent,
  serializeCommentEditor,
} from '@/lib/commentMentionEditor'
import { commentComposerBaseExtensions } from '@/lib/tiptap/commentComposerExtensions'
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
    'w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl outline-none focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 transition-colors overflow-hidden'
  const extra = attrs.class
  if (!extra) return base
  if (typeof extra === 'string') return `${base} ${extra}`
  if (Array.isArray(extra)) return [base, ...extra].join(' ')
  return [base, extra].join(' ')
})

const editorHostClass =
  'mention-textarea-editor prose prose-sm max-w-none min-w-0 px-3.5 py-2 [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[2.5rem] [&_.ProseMirror]:text-sm [&_.ProseMirror]:text-gray-700 [&_.ProseMirror]:leading-relaxed [&_.ProseMirror_p]:m-0'

const toolbarIconBtnClass =
  'p-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0'

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

/** Allow link edit when caret is inside a link, even if selection is collapsed. */
const linkToolDisabled = computed(() => {
  if (props.disabled) return true
  const ed = editorRef.value
  if (!ed) return true
  if (ed.isActive('link')) return false
  return ed.state.selection.empty
})

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
  content: hydrateCommentEditorContent(props.modelValue, props.users),
  editable: !props.disabled,
  onCreate: ({ editor: ed }) => {
    editorRef.value = ed
  },
  onDestroy: () => {
    editorRef.value = null
  },
  extensions: [
    ...commentComposerBaseExtensions(),
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
          'data-type': 'mention',
          'data-id': node.attrs.id,
          'data-label': node.attrs.label,
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
    emit('update:modelValue', serializeCommentEditor(ed.getJSON(), ed.getHTML()))
  },
})

watch(
  () => props.modelValue,
  val => {
    const ed = editorRef.value
    if (!ed) return
    const current = serializeCommentEditor(ed.getJSON(), ed.getHTML())
    if (val !== current) {
      ed.commands.setContent(hydrateCommentEditorContent(val, props.users), { emitUpdate: false })
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
  const currentStored = serializeCommentEditor(ed.getJSON(), ed.getHTML())
  ed.commands.setContent(hydrateCommentEditorContent(currentStored, props.users), { emitUpdate: false })
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

function setLink() {
  const ed = editorRef.value
  if (!ed || props.disabled) return
  const previousUrl = ed.getAttributes('link').href
  const url = globalThis.window.prompt('URL', previousUrl)
  if (url === null) return
  if (url === '') {
    ed.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
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
      <div
        v-if="editor"
        class="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-gray-200 bg-gray-50 shadow-[0_1px_0_rgba(0,0,0,0.06)]"
      >
        <button
          type="button"
          :class="[
            toolbarIconBtnClass,
            editor.isActive('bold') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500 hover:bg-gray-200',
          ]"
          :disabled="props.disabled"
          title="Bold"
          @click="editor.chain().focus().toggleBold().run()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></svg>
        </button>
        <button
          type="button"
          :class="[
            toolbarIconBtnClass,
            editor.isActive('italic') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500 hover:bg-gray-200',
          ]"
          :disabled="props.disabled"
          title="Italic"
          @click="editor.chain().focus().toggleItalic().run()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
        </button>
        <button
          type="button"
          :class="[
            toolbarIconBtnClass,
            editor.isActive('underline') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500 hover:bg-gray-200',
          ]"
          :disabled="props.disabled"
          title="Underline"
          @click="editor.chain().focus().toggleUnderline().run()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
        </button>
        <button
          type="button"
          :class="[
            toolbarIconBtnClass,
            editor.isActive('strike') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500 hover:bg-gray-200',
          ]"
          :disabled="props.disabled"
          title="Strikethrough"
          @click="editor.chain().focus().toggleStrike().run()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/></svg>
        </button>
        <div class="w-px h-5 bg-gray-200 mx-1 shrink-0" aria-hidden="true"></div>
        <button
          type="button"
          :class="[
            toolbarIconBtnClass,
            editor.isActive('bulletList') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500 hover:bg-gray-200',
          ]"
          :disabled="props.disabled"
          title="Bullet list"
          @click="editor.chain().focus().toggleBulletList().run()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
        </button>
        <button
          type="button"
          :class="[
            toolbarIconBtnClass,
            editor.isActive('orderedList') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500 hover:bg-gray-200',
          ]"
          :disabled="props.disabled"
          title="Numbered list"
          @click="editor.chain().focus().toggleOrderedList().run()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
        </button>
        <div class="w-px h-5 bg-gray-200 mx-1 shrink-0" aria-hidden="true"></div>
        <button
          type="button"
          :class="[
            toolbarIconBtnClass,
            editor.isActive('link') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500 hover:bg-gray-200',
          ]"
          :disabled="linkToolDisabled"
          title="Link"
          @click="setLink"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </button>
      </div>
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
