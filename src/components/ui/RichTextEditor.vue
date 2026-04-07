<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { watch } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: 'text-[#4857FE] underline' },
    }),
    Underline,
    Placeholder.configure({
      placeholder: props.placeholder || 'Start writing...',
    }),
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-sm max-w-none outline-none px-4 py-3 min-h-[min(8rem,30vh)] text-sm text-gray-800',
    },
  },
  onUpdate: ({ editor }) => {
    const html = editor.getHTML()
    emit('update:modelValue', html === '<p></p>' ? '' : html)
  },
})

watch(() => props.modelValue, (val) => {
  if (editor.value && editor.value.getHTML() !== val) {
    editor.value.commands.setContent(val || '')
  }
})

function setLink() {
  if (!editor.value) return
  const previousUrl = editor.value.getAttributes('link').href
  const url = window.prompt('URL', previousUrl)
  if (url === null) return
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}
</script>

<template>
  <div
    class="border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#4857FE] transition-colors flex flex-col min-h-[120px]"
  >
    <!-- Toolbar: fixed strip; body scrolls below -->
    <div
      v-if="editor"
      class="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0 flex-wrap z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]"
    >
      <!-- Bold -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        :class="editor.isActive('bold') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleBold().run()"
        title="Bold"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></svg>
      </button>
      <!-- Italic -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        :class="editor.isActive('italic') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleItalic().run()"
        title="Italic"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
      </button>
      <!-- Underline -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        :class="editor.isActive('underline') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleUnderline().run()"
        title="Underline"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
      </button>
      <!-- Strike -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        :class="editor.isActive('strike') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleStrike().run()"
        title="Strikethrough"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/></svg>
      </button>

      <div class="w-px h-5 bg-gray-200 mx-1"></div>

      <!-- H1 -->
      <button
        type="button"
        class="px-1.5 py-1 rounded hover:bg-gray-200 transition-colors text-xs font-bold"
        :class="editor.isActive('heading', { level: 1 }) ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
        title="Heading 1"
      >H1</button>
      <!-- H2 -->
      <button
        type="button"
        class="px-1.5 py-1 rounded hover:bg-gray-200 transition-colors text-xs font-bold"
        :class="editor.isActive('heading', { level: 2 }) ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        title="Heading 2"
      >H2</button>
      <!-- H3 -->
      <button
        type="button"
        class="px-1.5 py-1 rounded hover:bg-gray-200 transition-colors text-xs font-bold"
        :class="editor.isActive('heading', { level: 3 }) ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
        title="Heading 3"
      >H3</button>

      <div class="w-px h-5 bg-gray-200 mx-1"></div>

      <!-- Bullet List -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        :class="editor.isActive('bulletList') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleBulletList().run()"
        title="Bullet List"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
      </button>
      <!-- Ordered List -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        :class="editor.isActive('orderedList') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleOrderedList().run()"
        title="Ordered List"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
      </button>

      <div class="w-px h-5 bg-gray-200 mx-1"></div>

      <!-- Blockquote -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        :class="editor.isActive('blockquote') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleBlockquote().run()"
        title="Blockquote"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12v6"/></svg>
      </button>
      <!-- Code -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        :class="editor.isActive('code') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="editor.chain().focus().toggleCode().run()"
        title="Inline Code"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </button>
      <!-- Link -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        :class="editor.isActive('link') ? 'bg-gray-200 text-[#4857FE]' : 'text-gray-500'"
        @click="setLink"
        title="Link"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </button>
    </div>

    <!-- Scrollable editing surface -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <EditorContent v-if="editor" :editor="editor" />
    </div>
  </div>
</template>

<style>
/* Tiptap editor styles */
.tiptap {
  outline: none;
}

.tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #9ca3af;
  pointer-events: none;
  height: 0;
}

.tiptap h1 {
  font-size: 1.5em;
  font-weight: 700;
  margin: 0.5em 0 0.25em;
}

.tiptap h2 {
  font-size: 1.25em;
  font-weight: 600;
  margin: 0.5em 0 0.25em;
}

.tiptap h3 {
  font-size: 1.1em;
  font-weight: 600;
  margin: 0.5em 0 0.25em;
}

.tiptap p {
  margin: 0.25em 0;
}

.tiptap ul {
  list-style: disc;
  padding-left: 1.5em;
  margin: 0.25em 0;
}

.tiptap ol {
  list-style: decimal;
  padding-left: 1.5em;
  margin: 0.25em 0;
}

.tiptap li {
  margin: 0.15em 0;
}

.tiptap blockquote {
  border-left: 3px solid #4857FE;
  padding-left: 1em;
  margin: 0.5em 0;
  color: #6b7280;
  font-style: italic;
}

.tiptap code {
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0.15em 0.4em;
  font-size: 0.9em;
  font-family: monospace;
  color: #e2445c;
}

.tiptap pre {
  background: #1f2937;
  color: #e5e7eb;
  border-radius: 8px;
  padding: 0.75em 1em;
  margin: 0.5em 0;
  font-family: monospace;
  font-size: 0.9em;
  overflow-x: auto;
}

.tiptap pre code {
  background: none;
  color: inherit;
  padding: 0;
  border-radius: 0;
}

.tiptap a {
  color: #4857FE;
  text-decoration: underline;
}
</style>
