<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  GripVertical,
  Eye,
  EyeOff,
  Asterisk,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import type { FormFieldConfig, FieldType } from '@/types/formConfig'

const props = defineProps<{
  field: FormFieldConfig
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'update:required': [value: boolean]
  'update:label': [value: string]
  edit: []
  delete: []
}>()

const isEditingLabel = ref(false)
const editLabelValue = ref('')

const typeBadge = computed(() => {
  const map: Record<FieldType, { label: string; classes: string }> = {
    text: { label: 'Text', classes: 'bg-gray-100 text-gray-600' },
    select: { label: 'Select', classes: 'bg-blue-100 text-blue-700' },
    multi_select: { label: 'Multi Select', classes: 'bg-blue-100 text-blue-700' },
    textarea: { label: 'Textarea', classes: 'bg-purple-100 text-purple-700' },
    number: { label: 'Number', classes: 'bg-green-100 text-green-700' },
    date: { label: 'Date', classes: 'bg-amber-100 text-amber-700' },
    url: { label: 'URL', classes: 'bg-cyan-100 text-cyan-700' },
    user_picker: { label: 'User Picker', classes: 'bg-violet-100 text-violet-700' },
    single_user_picker: { label: 'User', classes: 'bg-violet-100 text-violet-700' },
  }
  return map[props.field.type] || { label: props.field.type, classes: 'bg-gray-100 text-gray-600' }
})

function startEditLabel() {
  if (props.field.isBuiltIn) return
  editLabelValue.value = props.field.label
  isEditingLabel.value = true
}

function finishEditLabel() {
  isEditingLabel.value = false
  const trimmed = editLabelValue.value.trim()
  if (trimmed && trimmed !== props.field.label) {
    emit('update:label', trimmed)
  }
}

function cancelEditLabel() {
  isEditingLabel.value = false
}
</script>

<template>
  <div
    class="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow group"
  >
    <!-- Drag handle -->
    <div class="drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors">
      <GripVertical :size="18" />
    </div>

    <!-- Field label -->
    <div class="flex items-center gap-2.5 flex-1 min-w-0">
      <template v-if="isEditingLabel">
        <input
          v-model="editLabelValue"
          class="text-sm font-semibold text-gray-900 bg-gray-50 border border-gray-300 rounded px-2 py-0.5 outline-none focus:border-[#7C5CFC] focus:ring-1 focus:ring-[#7C5CFC]/30 w-40"
          @keydown.enter="finishEditLabel"
          @keydown.escape="cancelEditLabel"
          @blur="finishEditLabel"
          ref="labelInput"
          autofocus
        />
      </template>
      <template v-else>
        <span
          class="text-sm font-semibold text-gray-900 truncate"
          :class="{ 'cursor-pointer hover:text-[#7C5CFC]': !field.isBuiltIn }"
          @dblclick="startEditLabel"
        >
          {{ field.label }}
        </span>
      </template>

      <!-- Type badge -->
      <span
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
        :class="typeBadge.classes"
      >
        {{ typeBadge.label }}
      </span>

      <!-- Built-in / Custom tag -->
      <span
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
        :class="field.isBuiltIn
          ? 'bg-gray-50 text-gray-400 border border-gray-200'
          : 'bg-indigo-50 text-indigo-600 border border-indigo-200'"
      >
        {{ field.isBuiltIn ? 'Built-in' : 'Custom' }}
      </span>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-1.5 shrink-0">
      <!-- Visibility toggle -->
      <button
        class="p-1.5 rounded-lg transition-colors"
        :class="field.visible
          ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'"
        :disabled="field.locked"
        :title="field.visible ? 'Hide field' : 'Show field'"
        @click="emit('update:visible', !field.visible)"
      >
        <Eye v-if="field.visible" :size="16" />
        <EyeOff v-else :size="16" />
      </button>

      <!-- Required toggle -->
      <button
        class="p-1.5 rounded-lg transition-colors"
        :class="field.required
          ? 'text-red-500 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'"
        :disabled="field.locked"
        :title="field.required ? 'Make optional' : 'Make required'"
        @click="emit('update:required', !field.required)"
      >
        <Asterisk :size="16" />
      </button>

      <!-- Edit button (custom fields only) -->
      <button
        v-if="!field.isBuiltIn"
        class="p-1.5 rounded-lg text-gray-400 hover:text-[#7C5CFC] hover:bg-[#7C5CFC]/10 transition-colors"
        title="Edit field"
        @click="emit('edit')"
      >
        <Pencil :size="16" />
      </button>

      <!-- Delete button (custom fields only) -->
      <button
        v-if="!field.isBuiltIn"
        class="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        title="Delete field"
        @click="emit('delete')"
      >
        <Trash2 :size="16" />
      </button>
    </div>
  </div>
</template>
