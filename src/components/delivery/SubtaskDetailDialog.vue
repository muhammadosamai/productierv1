<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Plus,
  X,
  Calendar,
  Link2,
} from 'lucide-vue-next'
import { useBacklogStore } from '@/stores/backlog'
import { useDeliveriesStore } from '@/stores/deliveries'
import { useProductStore } from '@/stores/products'
import type {
  Task,
  TaskSubtask,
  TaskStatus,
  TaskPriority,
  TaskType,
  SubtaskDraftRow,
  UpdateTaskSubtaskPayload,
} from '@/types/backlog'
import TaskStatusIcon from '@/components/shared/TaskStatusIcon.vue'

interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

const props = defineProps<{
  parentTask: Task
  mode: 'draft' | 'saved'
  draftRow?: SubtaskDraftRow | null
  subtask?: TaskSubtask | null
  teamMembers: TeamUser[]
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const backlogStore = useBacklogStore()
const deliveriesStore = useDeliveriesStore()
const productStore = useProductStore()

const saving = ref(false)
const assigneeSearch = ref('')
const showAssigneeDropdown = ref(false)
const assigneePickerRoot = ref<HTMLElement | null>(null)
const showDepPicker = ref(false)
const depSearch = ref('')

function onDocumentPointerDown(e: PointerEvent) {
  if (!showAssigneeDropdown.value) return
  const root = assigneePickerRoot.value
  if (root && !root.contains(e.target as Node)) {
    showAssigneeDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: 'created', label: 'Created' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'archived', label: 'Archived' },
]

const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const typeOptions: { value: TaskType; label: string }[] = [
  { value: 'design', label: 'Design' },
  { value: 'development', label: 'Development' },
  { value: 'testing', label: 'Testing' },
  { value: 'review', label: 'Review' },
  { value: 'research', label: 'Research' },
  { value: 'fix', label: 'Fix' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'deployment', label: 'Deployment' },
]

const form = reactive({
  title: '',
  description: '',
  status: 'created' as TaskStatus,
  priority: 'medium' as TaskPriority,
  type: null as TaskType | null,
  assigneeUserIds: [] as string[],
  estimateValue: null as number | null,
  dependent: [] as string[],
  blockedReason: '',
  deliveryId: null as string | null,
  dueAt: '',
  startedAt: null as string | null,
  completedAt: null as string | null,
})

const storyTasks = computed(() => {
  const story = backlogStore.stories.find(s => s.id === props.parentTask.storyId)
  return story?.tasks ?? []
})

const productDeliveries = computed(() =>
  deliveriesStore.deliveries.filter(d => d.productId === props.parentTask.productId)
)

const filteredAssignees = computed(() => {
  const q = assigneeSearch.value.toLowerCase().trim()
  if (!q) return props.teamMembers
  return props.teamMembers.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  )
})

const dependentTasks = computed(() => {
  return form.dependent.map(id => {
    const t = storyTasks.value.find(x => x.id === id)
    if (t) return { id, title: t.title, status: t.status, storyTitle: backlogStore.stories.find(s => s.id === t.storyId)?.title }
    return { id, title: id, status: 'created' as TaskStatus, missing: true as const }
  })
})

const depCandidates = computed(() => {
  const q = depSearch.value.toLowerCase().trim()
  const exclude = new Set([props.parentTask.id, ...form.dependent])
  let list = storyTasks.value.filter(t => !exclude.has(t.id))
  if (q) {
    list = list.filter(t => t.title.toLowerCase().includes(q))
  }
  return list.slice(0, 20)
})

function getUserById(id: string) {
  return props.teamMembers.find(u => u.id === id)
}

function toggleAssignee(userId: string) {
  const i = form.assigneeUserIds.indexOf(userId)
  if (i >= 0) form.assigneeUserIds.splice(i, 1)
  else form.assigneeUserIds.push(userId)
}

function addDependency(taskId: string) {
  if (!form.dependent.includes(taskId)) form.dependent.push(taskId)
  showDepPicker.value = false
  depSearch.value = ''
}

function removeDependency(taskId: string) {
  form.dependent = form.dependent.filter(id => id !== taskId)
}

function loadFormFromSources() {
  if (props.mode === 'draft' && props.draftRow) {
    const d = props.draftRow
    form.title = d.title
    form.description = d.description ?? ''
    form.status = d.status
    form.priority = d.priority
    form.type = d.type
    form.assigneeUserIds = [...d.assigneeUserIds]
    form.estimateValue = d.estimateValue
    form.dependent = [...d.dependent]
    form.blockedReason = d.blockedReason ?? ''
    form.deliveryId = d.deliveryId
    form.dueAt = d.dueAt
    form.startedAt = null
    form.completedAt = null
    return
  }
  if (props.mode === 'saved' && props.subtask) {
    const s = props.subtask
    form.title = s.title
    form.description = s.description ?? ''
    form.status = s.status
    form.priority = s.priority
    form.type = s.type ?? null
    form.assigneeUserIds = [...(s.assigneeUserIds || [])]
    form.estimateValue = s.estimateValue
    form.dependent = [...(s.dependent || [])]
    form.blockedReason = s.blockedReason ?? ''
    form.deliveryId = s.deliveryId
    form.dueAt = s.dueAt ? (new Date(s.dueAt).toISOString().split('T')[0] ?? '') : ''
    form.startedAt = s.startedAt
    form.completedAt = s.completedAt
  }
}

function applyDraftBack() {
  if (!props.draftRow) return
  const d = props.draftRow
  d.title = form.title
  d.description = form.description.trim() || null
  d.status = form.status
  d.priority = form.priority
  d.type = form.type
  d.assigneeUserIds = [...form.assigneeUserIds]
  d.estimateValue = form.estimateValue
  d.dependent = [...form.dependent]
  d.blockedReason = form.blockedReason.trim() || null
  d.deliveryId = form.deliveryId
  d.dueAt = form.dueAt
}

function buildPayload(): UpdateTaskSubtaskPayload {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    status: form.status,
    priority: form.priority,
    type: form.type,
    assigneeUserIds: form.assigneeUserIds.length > 0 ? form.assigneeUserIds : null,
    estimateValue: form.estimateValue,
    dependent: form.dependent.length > 0 ? form.dependent : null,
    blockedReason: form.blockedReason.trim() || null,
    deliveryId: form.deliveryId,
    dueAt: form.dueAt ? form.dueAt : null,
  }
}

async function handleSave() {
  if (!form.title.trim()) return
  if (props.mode === 'draft') {
    applyDraftBack()
    open.value = false
    return
  }
  if (!props.subtask) return
  saving.value = true
  try {
    await backlogStore.updateSubtask(props.parentTask.id, props.subtask.id, buildPayload())
    emit('saved')
    open.value = false
  } finally {
    saving.value = false
  }
}

watch(
  open,
  async (v) => {
    if (!v) return
    assigneeSearch.value = ''
    showAssigneeDropdown.value = false
    showDepPicker.value = false
    depSearch.value = ''
    await deliveriesStore.fetchDeliveries(productStore.activeProductName)
    loadFormFromSources()
  },
  { immediate: true }
)

watch(
  () => [props.mode, props.draftRow?.localId, props.subtask?.id] as const,
  () => {
    if (open.value) loadFormFromSources()
  }
)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ mode === 'draft' ? 'Sub-task details' : 'Edit sub-task' }}</DialogTitle>
        <DialogDescription>
          Same fields as a task except owner, story, and reviewers.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input
            v-model="form.title"
            type="text"
            class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE]"
            placeholder="Sub-task title"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <Textarea v-model="form.description" rows="3" class="text-sm resize-none" placeholder="Optional" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="space-y-1">
            <span class="text-xs text-gray-500">Status</span>
            <Select v-model="form.status">
              <SelectTrigger class="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1">
            <span class="text-xs text-gray-500">Priority</span>
            <Select v-model="form.priority">
              <SelectTrigger class="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1">
            <span class="text-xs text-gray-500">Type</span>
            <Select :model-value="form.type ?? '__none__'" @update:model-value="(v: any) => { form.type = v === '__none__' ? null : v }">
              <SelectTrigger class="h-9 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                <SelectItem v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Assignees</label>
          <div class="border border-gray-200 rounded-lg p-2 min-h-[40px]">
            <div class="flex flex-wrap gap-1 mb-2">
              <template v-for="uid in form.assigneeUserIds" :key="uid">
                <span
                  v-if="getUserById(uid)"
                  class="inline-flex items-center gap-1 bg-gray-100 rounded-full pl-1 pr-2 py-0.5 text-xs"
                >
                  <span class="truncate max-w-[100px]">{{ getUserById(uid)!.name }}</span>
                  <button type="button" class="text-gray-400 hover:text-red-500" @click="toggleAssignee(uid)"><X :size="12" /></button>
                </span>
              </template>
            </div>
            <div ref="assigneePickerRoot" class="relative">
              <div class="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-md">
                <Search :size="14" class="text-gray-400 shrink-0" />
                <input
                  v-model="assigneeSearch"
                  class="text-xs bg-transparent outline-none flex-1"
                  placeholder="Add assignee…"
                  @focus="showAssigneeDropdown = true"
                  @keydown.escape="showAssigneeDropdown = false"
                />
              </div>
              <div
                v-if="showAssigneeDropdown && filteredAssignees.length"
                class="absolute z-20 left-0 right-0 mt-1 max-h-36 overflow-auto bg-white border rounded-lg shadow text-xs"
                @mousedown.prevent
              >
                <button
                  v-for="u in filteredAssignees.slice(0, 12)"
                  :key="u.id"
                  type="button"
                  class="w-full text-left px-2 py-2 hover:bg-gray-50 flex items-center gap-2"
                  @click="toggleAssignee(u.id)"
                >
                  {{ u.name }}
                  <span v-if="form.assigneeUserIds.includes(u.id)" class="text-[#4857FE] ml-auto">✓</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700">Due date</label>
            <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1.5">
              <Calendar :size="14" class="text-gray-400 shrink-0" />
              <input v-model="form.dueAt" type="date" class="text-sm bg-transparent outline-none w-full" />
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-700">Estimate (hours)</label>
            <input
              :value="form.estimateValue ?? ''"
              type="number"
              step="0.5"
              min="0"
              class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE]"
              @input="form.estimateValue = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Delivery</label>
          <Select :model-value="form.deliveryId ?? '__none__'" @update:model-value="(v: any) => { form.deliveryId = v === '__none__' ? null : v }">
            <SelectTrigger class="h-9 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              <SelectItem v-for="d in productDeliveries" :key="d.id" :value="d.id">{{ d.title }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Blocked reason</label>
          <Textarea v-model="form.blockedReason" rows="2" class="text-sm resize-none" placeholder="If blocked…" />
        </div>

        <div v-if="mode === 'saved' && (form.startedAt || form.completedAt)" class="text-xs text-gray-500 space-y-1">
          <p v-if="form.startedAt">Started: {{ new Date(form.startedAt).toLocaleString() }}</p>
          <p v-if="form.completedAt">Completed: {{ new Date(form.completedAt).toLocaleString() }}</p>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-gray-700">Depends on tasks</label>
            <button
              v-if="!showDepPicker"
              type="button"
              class="text-xs font-medium text-[#4857FE] flex items-center gap-1"
              @click="showDepPicker = true"
            >
              <Plus :size="14" /> Add
            </button>
          </div>
          <div v-if="showDepPicker" class="border rounded-lg p-2 space-y-2">
            <input v-model="depSearch" class="w-full text-xs border rounded px-2 py-1" placeholder="Search tasks in this story…" />
            <div class="max-h-32 overflow-auto space-y-1">
              <button
                v-for="t in depCandidates"
                :key="t.id"
                type="button"
                class="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-50 flex items-center gap-2"
                @click="addDependency(t.id)"
              >
                <TaskStatusIcon :status="t.status" :size="14" />
                <span class="truncate">{{ t.title }}</span>
              </button>
              <p v-if="depCandidates.length === 0" class="text-xs text-gray-400 px-2 py-2">No tasks</p>
            </div>
            <button type="button" class="text-xs text-gray-500" @click="showDepPicker = false">Close</button>
          </div>
          <div v-if="dependentTasks.length" class="space-y-1.5">
            <div
              v-for="dep in dependentTasks"
              :key="dep.id"
              class="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100 text-xs group"
            >
              <template v-if="!(dep as any).missing">
                <TaskStatusIcon :status="dep.status" :size="14" />
                <span class="flex-1 truncate font-medium text-gray-800">{{ dep.title }}</span>
              </template>
              <template v-else>
                <Link2 :size="14" class="text-gray-400" />
                <span class="flex-1 truncate text-gray-500">{{ dep.id }}</span>
              </template>
              <button type="button" class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-0.5" @click="removeDependency(dep.id)">
                <X :size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button type="button" variant="outline" @click="open = false">Cancel</Button>
        <Button
          type="button"
          class="bg-[#4857FE] hover:bg-[#3E4BDE]"
          :disabled="!form.title.trim() || saving"
          @click="handleSave"
        >
          {{ saving ? 'Saving…' : mode === 'draft' ? 'Apply' : 'Save' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
