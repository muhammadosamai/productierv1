<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useBacklogStore } from '@/stores/backlog'
import { Plus, ChevronDown, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  storyId: string
}>()

const emit = defineEmits<{
  (e: 'created'): void
}>()

const backlogStore = useBacklogStore()
const taskTitle = ref('')
const taskDescription = ref('')
const taskEstimate = ref('')
const submitting = ref(false)
const expanded = ref(false)
const titleInputRef = ref<HTMLInputElement | null>(null)

function parsedEstimateHours(raw: string): number | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const n = Number.parseFloat(t.replace(/,/g, '.'))
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

async function handleAdd() {
  if (!taskTitle.value.trim()) return
  submitting.value = true
  await backlogStore.createTask(props.storyId, {
    title: taskTitle.value.trim(),
    description: taskDescription.value.trim() || undefined,
    estimateValue: parsedEstimateHours(taskEstimate.value),
  })
  taskTitle.value = ''
  taskDescription.value = ''
  taskEstimate.value = ''
  expanded.value = false
  submitting.value = false
  emit('created')
  await nextTick()
  titleInputRef.value?.focus()
}
</script>

<template>
  <form @submit.prevent="handleAdd" class="mt-2">
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-2 flex-1 border border-dashed border-gray-200 rounded-lg px-3 py-1.5">
        <Plus :size="14" class="text-gray-400 shrink-0" />
        <input
          ref="titleInputRef"
          v-model="taskTitle"
          type="text"
          placeholder="Add a task..."
          class="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
          :disabled="submitting"
          @focus="expanded = true"
          @keydown.tab="taskTitle.trim() && (expanded = true)"
        />
      </div>
      <button
        v-if="taskTitle.trim()"
        type="button"
        tabindex="-1"
        class="text-gray-400 hover:text-gray-600 transition-colors"
        @click="expanded = !expanded"
      >
        <component :is="expanded ? ChevronDown : ChevronRight" :size="14" />
      </button>
      <button
        v-if="taskTitle.trim()"
        type="submit"
        tabindex="-1"
        :disabled="submitting"
        class="text-xs font-medium text-[#4857FE] hover:text-[#3E4BDE] px-2 py-1.5 rounded transition-colors"
      >
        {{ submitting ? '...' : 'Add' }}
      </button>
    </div>

    <!-- Expanded fields -->
    <div v-if="expanded && taskTitle.trim()" class="mt-2 pl-6 space-y-2">
      <input
        v-model="taskEstimate"
        type="number"
        min="0"
        step="any"
        placeholder="Estimate (hours)"
        class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#4857FE] placeholder:text-gray-400 transition-colors"
        :disabled="submitting"
      />
      <input
        v-model="taskDescription"
        type="text"
        placeholder="Description (optional)"
        class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#4857FE] placeholder:text-gray-400 transition-colors"
        :disabled="submitting"
      />
    </div>
  </form>
</template>
