<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import draggable from 'vuedraggable'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, CheckCircle2 } from 'lucide-vue-next'
import { useFormConfigsStore } from '@/stores/formConfigs'
import { useProductStore } from '@/stores/products'
import { getDefaultConfig } from '@/lib/builtInFields'
import { mergeIssueFormConfig } from '@/lib/issueFormConfig'
import type { EntityType, FormFieldConfig, FormConfigJson } from '@/types/formConfig'
import FormFieldCard from './FormFieldCard.vue'
import AddCustomFieldDialog from './AddCustomFieldDialog.vue'
import { toast } from 'vue-sonner'

const props = defineProps<{
  entityType: EntityType
}>()

const formConfigsStore = useFormConfigsStore()
const productStore = useProductStore()

const fields = ref<FormFieldConfig[]>([])
const savedFields = ref<FormFieldConfig[]>([])
const loading = ref(false)
const saving = ref(false)
const saved = ref(false)
const showAddDialog = ref(false)
const editingField = ref<FormFieldConfig | undefined>(undefined)

const entityLabels: Record<EntityType, string> = {
  story: 'Story',
  task: 'Task',
  issue: 'Issue',
}

const isDirty = computed(() => {
  return JSON.stringify(fields.value) !== JSON.stringify(savedFields.value)
})

const fieldCount = computed(() => fields.value.length)

async function loadConfig() {
  loading.value = true
  const product = productStore.activeProductScopeForApi
  if (!product) {
    const defaults = getDefaultConfig(props.entityType)
    fields.value = defaults.fields.map(f => ({ ...f }))
    savedFields.value = defaults.fields.map(f => ({ ...f }))
    loading.value = false
    return
  }

  const config = await formConfigsStore.fetchConfig(product, props.entityType)
  if (config && config.fields.length > 0) {
    const normalized =
      props.entityType === 'issue' ? mergeIssueFormConfig(config) : config
    fields.value = normalized.fields.map(f => ({ ...f }))
    savedFields.value = normalized.fields.map(f => ({ ...f }))
  } else {
    const defaults = getDefaultConfig(props.entityType)
    fields.value = defaults.fields.map(f => ({ ...f }))
    savedFields.value = defaults.fields.map(f => ({ ...f }))
  }
  loading.value = false
}

async function handleSave() {
  const product = productStore.activeProductScopeForApi
  if (!product) return

  saving.value = true
  // Recompute order based on current position
  const orderedFields = fields.value.map((f, i) => ({ ...f, order: i }))
  fields.value = orderedFields

  const config: FormConfigJson = { fields: orderedFields }
  const result = await formConfigsStore.saveConfig(product, props.entityType, config)

  if (result.ok) {
    savedFields.value = orderedFields.map(f => ({ ...f }))
    saved.value = true
    setTimeout(() => (saved.value = false), 3000)
  } else {
    toast.error(result.error)
  }
  saving.value = false
}

function handleVisibilityUpdate(key: string, visible: boolean) {
  const field = fields.value.find(f => f.key === key)
  if (field) field.visible = visible
}

function handleRequiredUpdate(key: string, required: boolean) {
  const field = fields.value.find(f => f.key === key)
  if (field) field.required = required
}

function handleLabelUpdate(key: string, label: string) {
  const field = fields.value.find(f => f.key === key)
  if (field) field.label = label
}

function handleEdit(field: FormFieldConfig) {
  editingField.value = { ...field }
  showAddDialog.value = true
}

function handleDelete(key: string) {
  fields.value = fields.value.filter(f => f.key !== key)
}

function handleAddNew() {
  editingField.value = undefined
  showAddDialog.value = true
}

function handleSaveField(field: FormFieldConfig) {
  if (editingField.value) {
    // Update existing
    const idx = fields.value.findIndex(f => f.key === field.key)
    if (idx !== -1) {
      fields.value[idx] = { ...field, order: idx }
    }
  } else {
    // Add new
    field.order = fields.value.length
    field.isBuiltIn = false
    fields.value.push(field)
  }
  showAddDialog.value = false
  editingField.value = undefined
}

onMounted(loadConfig)
watch(() => props.entityType, loadConfig)
</script>

<template>
  <div class="bg-white rounded-2xl border border-gray-100 shadow-sm">
    <!-- Top bar -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold text-gray-900">{{ entityLabels[entityType] }} Fields</h2>
        <span class="text-sm text-gray-400">{{ fieldCount }} fields</span>
        <span
          v-if="isDirty"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"
        >
          Unsaved changes
        </span>
      </div>
      <div class="flex items-center gap-2">
        <div
          v-if="saved"
          class="flex items-center gap-1.5 text-sm text-green-600 font-medium mr-2"
        >
          <CheckCircle2 :size="16" />
          Saved
        </div>
        <Button
          class="bg-[#7C5CFC] hover:bg-[#6B4CE0] h-9 px-4 text-sm font-medium"
          :disabled="!isDirty || saving"
          @click="handleSave"
        >
          <Loader2 v-if="saving" :size="16" class="animate-spin mr-2" />
          {{ saving ? 'Saving...' : 'Save Changes' }}
        </Button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <Loader2 :size="24" class="animate-spin text-gray-400" />
    </div>

    <!-- Field list -->
    <div v-else class="p-4">
      <draggable
        v-model="fields"
        item-key="key"
        handle=".drag-handle"
        ghost-class="opacity-50"
        animation="200"
        class="space-y-2"
      >
        <template #item="{ element }">
          <FormFieldCard
            :field="element"
            :entity-type="entityType"
            @update:visible="handleVisibilityUpdate(element.key, $event)"
            @update:required="handleRequiredUpdate(element.key, $event)"
            @update:label="handleLabelUpdate(element.key, $event)"
            @edit="handleEdit(element)"
            @delete="handleDelete(element.key)"
          />
        </template>
      </draggable>

      <!-- Add custom field button -->
      <button
        class="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 hover:border-[#7C5CFC] hover:text-[#7C5CFC] transition-colors"
        @click="handleAddNew"
      >
        <Plus :size="16" />
        Add Custom Field
      </button>
    </div>

    <!-- Add / Edit dialog -->
    <AddCustomFieldDialog
      v-model:open="showAddDialog"
      :edit-field="editingField"
      :entity-type="entityType"
      @save="handleSaveField"
    />
  </div>
</template>
