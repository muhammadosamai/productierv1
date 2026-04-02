<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X, Plus } from 'lucide-vue-next'
import type { FormFieldConfig, FieldType } from '@/types/formConfig'

const props = defineProps<{
  editField?: FormFieldConfig
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  save: [field: FormFieldConfig]
}>()

const fieldTypes: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'URL' },
  { value: 'user_picker', label: 'User Picker' },
  { value: 'single_user_picker', label: 'Single User Picker' },
]

const label = ref('')
const key = ref('')
const type = ref<FieldType>('text')
const required = ref(false)
const placeholder = ref('')
const options = ref<string[]>([])
const newOption = ref('')

const isEditing = computed(() => !!props.editField)
const dialogTitle = computed(() => isEditing.value ? 'Edit Custom Field' : 'Add Custom Field')

const showOptions = computed(() => type.value === 'select' || type.value === 'multi_select')

const isValid = computed(() => {
  if (!label.value.trim()) return false
  if (!key.value.trim()) return false
  if (showOptions.value && options.value.length === 0) return false
  return true
})

function toSnakeCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

// Auto-generate key from label when not editing
watch(label, (val) => {
  if (!isEditing.value) {
    key.value = toSnakeCase(val)
  }
})

// Reset form when dialog opens
watch(open, (isOpen) => {
  if (isOpen) {
    if (props.editField) {
      label.value = props.editField.label
      key.value = props.editField.key
      type.value = props.editField.type
      required.value = props.editField.required
      placeholder.value = props.editField.placeholder || ''
      options.value = props.editField.options ? [...props.editField.options] : []
    } else {
      label.value = ''
      key.value = ''
      type.value = 'text'
      required.value = false
      placeholder.value = ''
      options.value = []
    }
    newOption.value = ''
  }
})

function addOption() {
  const val = newOption.value.trim()
  if (val && !options.value.includes(val)) {
    options.value.push(val)
  }
  newOption.value = ''
}

function removeOption(index: number) {
  options.value.splice(index, 1)
}

function handleSave() {
  if (!isValid.value) return

  const field: FormFieldConfig = {
    key: key.value,
    label: label.value.trim(),
    type: type.value,
    required: required.value,
    visible: props.editField?.visible ?? true,
    isBuiltIn: false,
    order: props.editField?.order ?? 0,
    placeholder: placeholder.value.trim() || undefined,
    options: showOptions.value ? [...options.value] : undefined,
  }

  emit('save', field)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <!-- Label -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Label</label>
          <Input
            v-model="label"
            placeholder="e.g. Sprint Number"
          />
        </div>

        <!-- Key -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Key</label>
          <Input
            v-model="key"
            placeholder="auto_generated_key"
            :disabled="isEditing"
            class="font-mono text-sm"
            :class="{ 'bg-gray-50 text-gray-500': isEditing }"
          />
          <p class="text-xs text-gray-400">
            {{ isEditing ? 'Key cannot be changed after creation' : 'Auto-generated from label (snake_case)' }}
          </p>
        </div>

        <!-- Type -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Type</label>
          <Select v-model="type">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select field type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="ft in fieldTypes"
                :key="ft.value"
                :value="ft.value"
              >
                {{ ft.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Required -->
        <div class="flex items-center gap-2">
          <input
            id="field-required"
            v-model="required"
            type="checkbox"
            class="rounded border-gray-300 text-[#7C5CFC] focus:ring-[#7C5CFC]"
          />
          <label for="field-required" class="text-sm font-medium text-gray-700">Required field</label>
        </div>

        <!-- Options (for select / multi_select) -->
        <div v-if="showOptions" class="space-y-2">
          <label class="text-sm font-medium text-gray-700">Options</label>
          <div class="flex gap-2">
            <Input
              v-model="newOption"
              placeholder="Add an option..."
              class="flex-1"
              @keydown.enter.prevent="addOption"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="shrink-0 h-10"
              @click="addOption"
            >
              <Plus :size="16" />
            </Button>
          </div>
          <div v-if="options.length > 0" class="flex flex-wrap gap-1.5 mt-1">
            <span
              v-for="(opt, idx) in options"
              :key="idx"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
            >
              {{ opt }}
              <button
                class="text-gray-400 hover:text-red-500 transition-colors"
                @click="removeOption(idx)"
              >
                <X :size="12" />
              </button>
            </span>
          </div>
          <p v-if="showOptions && options.length === 0" class="text-xs text-red-500">
            At least one option is required for select fields
          </p>
        </div>

        <!-- Placeholder -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Placeholder <span class="text-gray-400">(optional)</span></label>
          <Input
            v-model="placeholder"
            placeholder="e.g. Enter a value..."
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">
          Cancel
        </Button>
        <Button
          class="bg-[#7C5CFC] hover:bg-[#6B4CE0]"
          :disabled="!isValid"
          @click="handleSave"
        >
          {{ isEditing ? 'Update Field' : 'Add Field' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
