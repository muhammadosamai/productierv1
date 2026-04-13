<script setup lang="ts">
import { computed } from 'vue'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-vue-next'
import type { FormFieldConfig } from '@/types/formConfig'

const props = defineProps<{
  field: FormFieldConfig
  modelValue: any
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

// For multi_select: track selected values as an array
const selectedMulti = computed({
  get: () => {
    if (Array.isArray(props.modelValue)) return props.modelValue as string[]
    return []
  },
  set: (val: string[]) => emit('update:modelValue', val),
})

function toggleMultiOption(option: string) {
  const current = [...selectedMulti.value]
  const idx = current.indexOf(option)
  if (idx === -1) {
    current.push(option)
  } else {
    current.splice(idx, 1)
  }
  selectedMulti.value = current
}

function removeMultiTag(option: string) {
  selectedMulti.value = selectedMulti.value.filter(v => v !== option)
}

const issueStatusSelectItems = computed(() => {
  if (props.field.key !== 'status' || !props.field.issueStatusCatalog?.length) return null
  return (props.field.issueStatusCatalog || []).map((e) => ({
    value: e.id,
    label: e.name || e.id,
  }))
})
</script>

<template>
  <div class="space-y-1.5">
    <!-- Label -->
    <label class="text-sm font-medium text-gray-700">
      {{ field.label }}
      <span v-if="field.required" class="text-red-500 ml-0.5">*</span>
    </label>

    <!-- Text -->
    <Input
      v-if="field.type === 'text'"
      :model-value="value"
      @update:model-value="value = $event"
      :placeholder="field.placeholder || `Enter ${field.label.toLowerCase()}...`"
      :required="field.required"
    />

    <!-- Textarea -->
    <Textarea
      v-else-if="field.type === 'textarea'"
      :model-value="value"
      @update:model-value="value = $event"
      :placeholder="field.placeholder || `Enter ${field.label.toLowerCase()}...`"
      :required="field.required"
      :rows="3"
    />

    <!-- Number -->
    <Input
      v-else-if="field.type === 'number'"
      type="number"
      :model-value="value"
      @update:model-value="value = $event"
      :placeholder="field.placeholder || '0'"
      :required="field.required"
    />

    <!-- Date -->
    <Input
      v-else-if="field.type === 'date'"
      type="date"
      :model-value="value"
      @update:model-value="value = $event"
      :required="field.required"
    />

    <!-- URL -->
    <Input
      v-else-if="field.type === 'url'"
      type="url"
      :model-value="value"
      @update:model-value="value = $event"
      :placeholder="field.placeholder || 'https://...'"
      :required="field.required"
    />

    <!-- Select -->
    <Select
      v-else-if="field.type === 'select'"
      :model-value="value"
      @update:model-value="value = $event"
    >
      <SelectTrigger class="w-full">
        <SelectValue :placeholder="field.placeholder || `Select ${field.label.toLowerCase()}...`" />
      </SelectTrigger>
      <SelectContent>
        <template v-if="issueStatusSelectItems">
          <SelectItem
            v-for="opt in issueStatusSelectItems"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </SelectItem>
        </template>
        <template v-else>
          <SelectItem
            v-for="opt in field.options"
            :key="opt"
            :value="opt"
          >
            {{ opt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }}
          </SelectItem>
        </template>
      </SelectContent>
    </Select>

    <!-- Multi Select -->
    <div v-else-if="field.type === 'multi_select'" class="space-y-2">
      <!-- Selected tags -->
      <div v-if="selectedMulti.length > 0" class="flex flex-wrap gap-1.5">
        <span
          v-for="tag in selectedMulti"
          :key="tag"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#7C5CFC]/10 text-[#7C5CFC]"
        >
          {{ tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }}
          <button
            type="button"
            class="text-[#7C5CFC]/60 hover:text-[#7C5CFC] transition-colors"
            @click="removeMultiTag(tag)"
          >
            <X :size="12" />
          </button>
        </span>
      </div>
      <!-- Checkboxes -->
      <div class="border border-gray-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
        <label
          v-for="opt in field.options"
          :key="opt"
          class="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:text-gray-900"
        >
          <input
            type="checkbox"
            class="rounded border-gray-300 text-[#7C5CFC] focus:ring-[#7C5CFC]"
            :checked="selectedMulti.includes(opt)"
            @change="toggleMultiOption(opt)"
          />
          {{ opt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }}
        </label>
        <p v-if="!field.options?.length" class="text-xs text-gray-400">No options configured</p>
      </div>
    </div>

    <!-- User Picker / Single User Picker -->
    <Input
      v-else-if="field.type === 'user_picker' || field.type === 'single_user_picker'"
      :model-value="value"
      @update:model-value="value = $event"
      :placeholder="field.placeholder || 'Search users...'"
      :required="field.required"
    />
  </div>
</template>
