<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Loader2, ArrowLeft, Pencil, Check, X, Plus, MoreHorizontal,
  MessageSquare, AlertTriangle, Search,
  Palette, Code2, TestTube2, Eye, FlaskConical, Wrench, FileText, Rocket, Link2,
  CalendarDays, ListChecks,
} from 'lucide-vue-next'
import { useDeliveriesStore } from '@/stores/deliveries'
import { useBacklogStore } from '@/stores/backlog'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import type { Delivery, DeliveryStatus } from '@/types/delivery'
import type { Task, TaskStatus, TaskPriority } from '@/types/backlog'
import draggable from 'vuedraggable'
import DeliveryTimeline from '@/components/delivery/DeliveryTimeline.vue'
import DeliveryList from '@/components/delivery/DeliveryList.vue'
import TaskDetailPanel from '@/components/delivery/TaskDetailPanel.vue'
import { richTextPreviewText } from '@/lib/richText'
import { toast } from 'vue-sonner'

const route = useRoute()
const router = useRouter()
const deliveriesStore = useDeliveriesStore()
const backlogStore = useBacklogStore()
const productStore = useProductStore()
const authStore = useAuthStore()

const delivery = ref<Delivery | null>(null)
const loading = ref(true)

// View mode: kanban | timeline
const activeView = ref<'kanban' | 'timeline' | 'list'>('kanban')

// Task detail panel
const selectedTask = ref<Task | null>(null)
const showTaskPanel = ref(false)

function openTaskDetail(task: Task) {
  selectedTask.value = task
  showTaskPanel.value = true
}

function closeTaskPanel() {
  showTaskPanel.value = false
}

async function onTaskUpdated() {
  if (delivery.value) {
    delivery.value = await deliveriesStore.fetchDelivery(delivery.value.id)
    // Update selectedTask with the fresh data so the panel reflects changes
    if (selectedTask.value && delivery.value?.tasks) {
      const freshTask = (delivery.value.tasks as Task[]).find(t => t.id === selectedTask.value!.id)
      if (freshTask) {
        selectedTask.value = freshTask
      }
    }
  }
}

// Delivery-level inline editing
const editingField = ref<string | null>(null)
const editTitle = ref('')
const editDescription = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const descriptionInputRef = ref<HTMLTextAreaElement | null>(null)

// Team members for resolving assignee avatars
interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}
const teamMembers = ref<TeamUser[]>([])

async function fetchTeamMembers() {
  try {
    const res = await fetch(`/api/auth/users?q=`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      teamMembers.value = await res.json()
    }
  } catch {
    teamMembers.value = []
  }
}

function getUserById(id: string): TeamUser | undefined {
  return teamMembers.value.find(u => u.id === id)
}

// Close dropdowns on outside click
function handleGlobalClick() {
  showFilterDropdown.value = false
}

// Load delivery data
async function loadDelivery(id: string) {
  loading.value = true
  delivery.value = await deliveriesStore.fetchDelivery(id)
  loading.value = false
}

onMounted(async () => {
  await Promise.all([
    loadDelivery(route.params.id as string),
    fetchTeamMembers(),
    backlogStore.fetchStories(),
  ])
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})

watch(() => route.params.id, (newId) => {
  if (newId) {
    editingField.value = null
    loadDelivery(newId as string)
  }
})

// Kanban columns — metadata (static) + mutable task arrays for drag-and-drop
interface ColumnMeta {
  key: string
  label: string
  color: string
  status: TaskStatus | null  // null for "others" column
  hasAdd?: boolean
}

const columnDefs: ColumnMeta[] = [
  { key: 'todo', label: 'To-Do', color: '#c4c4c4', status: null, hasAdd: true },
  { key: 'in_progress', label: 'On Progress', color: '#fdab3d', status: 'in_progress', hasAdd: true },
  { key: 'in_review', label: 'In Review', color: '#579bfc', status: 'in_review', hasAdd: true },
  { key: 'done', label: 'Done', color: '#00c875', status: 'done' },
  { key: 'others', label: 'Others', color: '#e2445c', status: null },
]

// Mutable task arrays per column — vuedraggable modifies these directly
const columnTasks = ref<Record<string, Task[]>>({
  todo: [],
  in_progress: [],
  in_review: [],
  done: [],
  others: [],
})

// User filter for kanban board
const filterUserId = ref<string>('')
const showFilterDropdown = ref(false)

const filterLabel = computed(() => {
  if (!filterUserId.value) return 'All Members'
  if (filterUserId.value === 'unassigned') return 'Unassigned'
  const user = getUserById(filterUserId.value)
  return user?.name || 'Unknown'
})

function selectFilter(userId: string) {
  filterUserId.value = userId
  showFilterDropdown.value = false
}

function matchesUserFilter(task: Task): boolean {
  const uid = filterUserId.value
  if (!uid) return true
  if (uid === 'unassigned') {
    return !task.ownerUserId && (!task.assigneeUserIds || task.assigneeUserIds.length === 0)
  }
  return task.ownerUserId === uid ||
    (task.assigneeUserIds?.includes(uid) ?? false) ||
    (task.reviewerUserIds?.includes(uid) ?? false)
}

// Filtered tasks for all views (list, timeline, kanban)
const filteredTasks = computed(() => {
  const all = (delivery.value?.tasks || []) as Task[]
  return all.filter(matchesUserFilter)
})

// Rebuild column tasks whenever delivery data or filter changes
watch([() => delivery.value?.tasks, filterUserId], ([tasks]) => {
  const raw = (tasks || []) as Task[]
  const all = raw.filter(matchesUserFilter)
  columnTasks.value = {
    todo: all.filter(t => t.status === 'created' || t.status === 'assigned'),
    in_progress: all.filter(t => t.status === 'in_progress'),
    in_review: all.filter(t => t.status === 'in_review'),
    done: all.filter(t => t.status === 'done'),
    others: all.filter(t => !!t.blockedReason),
  }
}, { immediate: true, deep: true })

// Drag-and-drop handler: when a task is added to a column, update its status
const isDragging = ref(false)

async function onColumnChange(colKey: string, evt: any) {
  // Only handle the "added" event (task dropped into this column)
  if (!evt.added) return

  const task = evt.added.element as Task
  const col = columnDefs.find(c => c.key === colKey)
  if (!col) return

  // Determine the new status based on the target column
  let newStatus: string
  if (col.key === 'todo') {
    // If the task has any role assigned, set to 'assigned'; otherwise 'created'
    const hasAssignee = (task.ownerUserId) ||
      (task.assigneeUserIds && task.assigneeUserIds.length > 0) ||
      (task.reviewerUserIds && task.reviewerUserIds.length > 0)
    newStatus = hasAssignee ? 'assigned' : 'created'
  } else if (col.status) {
    newStatus = col.status
  } else {
    return  // skip "others" — no status mapping
  }

  // Only update if status actually changed
  if (task.status === newStatus) return

  await backlogStore.updateTask(task.id, { status: newStatus as TaskStatus })
  if (delivery.value) {
    delivery.value = await deliveriesStore.fetchDelivery(delivery.value.id)
  }
}

// Timeline drag: update task end date (calendar)
async function onTaskDueChange(taskId: string, endDateWire: string) {
  await backlogStore.updateTask(taskId, { endDate: endDateWire || null })
  if (delivery.value) {
    delivery.value = await deliveriesStore.fetchDelivery(delivery.value.id)
  }
}

// Progress
const totalTasks = computed(() => delivery.value?.totalTasks || 0)
const completedTasks = computed(() => delivery.value?.completedTasks || 0)
const progress = computed(() => delivery.value?.progress || 0)

// Task-level progress (subtask simulation based on estimate)
function taskProgress(task: Task) {
  if (task.status === 'done') return 100
  if (task.status === 'in_review') return 70
  if (task.status === 'in_progress') return 30
  if (task.status === 'assigned') return 10
  return 0 // 'created'
}

// --- Add Task Picker (for columns) ---
const showTaskPicker = ref(false)
const taskSearchQuery = ref('')

const availableTasks = computed(() => {
  if (!delivery.value) return []
  const deliveryTaskIds = new Set((delivery.value.tasks || []).map(t => t.id))
  const allTasks: (Task & { storyTitle?: string })[] = []
  for (const story of backlogStore.stories) {
    for (const task of story.tasks) {
      if (!deliveryTaskIds.has(task.id) && !task.deliveryId) {
        allTasks.push({ ...task, storyTitle: story.title })
      }
    }
  }
  return allTasks
})

const filteredAvailableTasks = computed(() => {
  const q = taskSearchQuery.value.toLowerCase().trim()
  if (!q) return availableTasks.value
  return availableTasks.value.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t as any).storyTitle?.toLowerCase().includes(q)
  )
})

async function addTaskToDelivery(taskId: string) {
  if (!delivery.value) return
  await backlogStore.updateTask(taskId, { deliveryId: delivery.value.id } as any)
  delivery.value = await deliveriesStore.fetchDelivery(delivery.value.id)
  await backlogStore.fetchStories()
}

function openTaskPicker() {
  taskSearchQuery.value = ''
  showTaskPicker.value = true
  backlogStore.fetchStories()
}

async function removeTaskFromDelivery(taskId: string) {
  if (!delivery.value) return
  await backlogStore.updateTask(taskId, { deliveryId: null } as any)
  delivery.value = await deliveriesStore.fetchDelivery(delivery.value.id)
  await backlogStore.fetchStories()
}

// Delivery edit helpers
async function updateField(field: string, value: any) {
  if (!delivery.value) return
  await deliveriesStore.updateDelivery(delivery.value.id, { [field]: value })
  delivery.value = await deliveriesStore.fetchDelivery(delivery.value.id)
  editingField.value = null
}

function startEditTitle() {
  if (!delivery.value) return
  editTitle.value = delivery.value.title
  editingField.value = 'title'
  setTimeout(() => titleInputRef.value?.focus(), 50)
}

function saveTitle() {
  if (editTitle.value.trim()) {
    updateField('title', editTitle.value.trim())
  } else {
    editingField.value = null
  }
}

function startEditDescription() {
  if (!delivery.value) return
  editDescription.value = stripHtml(delivery.value.description || '')
  editingField.value = 'description'
  setTimeout(() => descriptionInputRef.value?.focus(), 50)
}

function saveDescription() {
  const val = editDescription.value.trim()
  if (val !== stripHtml(delivery.value?.description || '')) {
    updateField('description', val || null)
  } else {
    editingField.value = null
  }
}

function stripHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

function updateStatus(status: DeliveryStatus) {
  updateField('status', status)
}

// Delivery date range
const deliveryDateRange = computed(() => ({
  start: delivery.value?.startDate || null,
  end: delivery.value?.endDate || null,
}))

async function onDeliveryDateChange(range: { start: string | null; end: string | null } | undefined) {
  if (!delivery.value) return
  const start = range?.start || null
  const end = range?.end || null

  // Block inverted ranges — start can't be after end when both are set
  if (start && end && new Date(start) > new Date(end)) {
    toast.error('Start date cannot be after end date.')
    return
  }

  try {
    await deliveriesStore.updateDelivery(delivery.value.id, { startDate: start, endDate: end })
    delivery.value = await deliveriesStore.fetchDelivery(delivery.value.id)
  } catch {
    toast.error('Failed to update delivery dates.')
  }
}

// Delivery status styling
const deliveryStatuses: { value: DeliveryStatus; label: string; color: string }[] = [
  { value: 'initialized', label: 'Initialized', color: 'bg-[#ff69b4]' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-[#fdab3d]' },
  { value: 'overdue', label: 'Overdue', color: 'bg-[#e2445c]' },
  { value: 'blocked', label: 'Blocked', color: 'bg-[#a25ddc]' },
  { value: 'completed', label: 'Completed', color: 'bg-[#00c875]' },
  { value: 'archived', label: 'Archived', color: 'bg-[#c4c4c4]' },
]

function deliveryStatusStyle(status: string) {
  switch (status) {
    case 'initialized': return 'bg-[#ff69b4]/15 text-[#ff69b4] border border-[#ff69b4]/30'
    case 'in_progress': return 'bg-[#fdab3d]/15 text-[#d48806] border border-[#fdab3d]/30'
    case 'overdue': return 'bg-[#e2445c]/15 text-[#e2445c] border border-[#e2445c]/30'
    case 'blocked': return 'bg-[#a25ddc]/15 text-[#a25ddc] border border-[#a25ddc]/30'
    case 'completed': return 'bg-[#00c875]/15 text-[#00a65a] border border-[#00c875]/30'
    case 'archived': return 'bg-gray-100 text-gray-500 border border-gray-200'
    default: return 'bg-gray-100 text-gray-500 border border-gray-200'
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Task styling
function priorityStyle(priority: string) {
  switch (priority) {
    case 'high': return 'bg-[#e2445c] text-white'
    case 'medium': return 'bg-[#00c875] text-white'
    case 'low': return 'bg-gray-200 text-gray-600'
    default: return 'bg-gray-200 text-gray-600'
  }
}

function priorityDotStyle(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-500'
    case 'medium': return 'bg-green-500'
    case 'low': return 'bg-blue-500'
    default: return 'bg-gray-400'
  }
}

function prioritySelectStyle(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-50 text-red-700 border border-red-200'
    case 'medium': return 'bg-green-50 text-green-700 border border-green-200'
    case 'low': return 'bg-blue-50 text-blue-700 border border-blue-200'
    default: return 'bg-gray-50 text-gray-600 border border-gray-200'
  }
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function typeBadgeStyle(type: string) {
  switch (type) {
    case 'design': return 'bg-purple-50/80 text-purple-600'
    case 'development': return 'bg-blue-50/80 text-blue-600'
    case 'testing': return 'bg-green-50/80 text-green-600'
    case 'review': return 'bg-cyan-50/80 text-cyan-600'
    case 'research': return 'bg-yellow-50/80 text-yellow-600'
    case 'fix': return 'bg-red-50/80 text-red-600'
    case 'documentation': return 'bg-gray-50/80 text-gray-500'
    case 'deployment': return 'bg-orange-50/80 text-orange-600'
    default: return 'bg-gray-50/80 text-gray-500'
  }
}

function typeIconColor(type: string) {
  switch (type) {
    case 'design': return 'text-purple-500'
    case 'development': return 'text-blue-500'
    case 'testing': return 'text-green-500'
    case 'review': return 'text-cyan-500'
    case 'research': return 'text-yellow-500'
    case 'fix': return 'text-red-500'
    case 'documentation': return 'text-gray-400'
    case 'deployment': return 'text-orange-500'
    default: return 'text-gray-400'
  }
}

const typeIcons: Record<string, any> = {
  design: Palette,
  development: Code2,
  testing: TestTube2,
  review: Eye,
  research: FlaskConical,
  fix: Wrench,
  documentation: FileText,
  deployment: Rocket,
}

function typeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function progressBarColor(status: string) {
  switch (status) {
    case 'done': return 'bg-[#00c875]'
    case 'in_review': return 'bg-[#579bfc]'
    case 'in_progress': return 'bg-[#fdab3d]'
    case 'assigned': return 'bg-[#a25ddc]'
    default: return 'bg-[#4857FE]'
  }
}

function formatDateShort(dateStr: string | null) {
  if (!dateStr) return '\u2014'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return 'No dates set'
  const s = start ? new Date(start).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '?'
  const e = end ? new Date(end).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '?'
  return `${s} – ${e}`
}

// Generate short task IDs for display
function taskShortId(task: Task) {
  return 'TSK-' + task.id.slice(-5).toUpperCase()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
      <span class="ml-2 text-sm text-gray-500">Loading delivery...</span>
    </div>

    <!-- Not found -->
    <div v-else-if="!delivery" class="flex flex-col items-center justify-center h-full gap-3">
      <p class="text-gray-400 text-sm">Delivery not found</p>
      <router-link to="/deliveries" class="text-sm text-[#4857FE] hover:underline flex items-center gap-1">
        <ArrowLeft :size="14" /> Back to Deliveries
      </router-link>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Compact Header -->
      <div class="bg-white px-8 py-4 border-b border-gray-100">
        <div class="flex items-center justify-between">
          <!-- Left: Back + Title + Status + Meta -->
          <div class="flex items-center gap-4 min-w-0 flex-1">
            <router-link to="/deliveries" class="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
              <ArrowLeft :size="18" />
            </router-link>

            <!-- Editable title -->
            <div v-if="editingField === 'title'" class="flex items-center gap-2 shrink-0">
              <input
                ref="titleInputRef"
                v-model="editTitle"
                class="text-xl font-semibold text-gray-900 bg-transparent border-b-2 border-[#4857FE] outline-none py-0.5 min-w-[200px]"
                @keydown.enter="saveTitle"
                @keydown.escape="editingField = null"
              />
              <button @click="saveTitle" class="text-green-500 hover:text-green-600"><Check :size="16" /></button>
              <button @click="editingField = null" class="text-gray-400 hover:text-gray-600"><X :size="16" /></button>
            </div>
            <h1
              v-else
              class="text-xl font-semibold text-gray-900 cursor-pointer hover:text-[#4857FE] transition-colors group/title shrink-0"
              @click="startEditTitle"
            >
              {{ delivery.title }}
              <Pencil :size="12" class="inline ml-1 opacity-0 group-hover/title:opacity-40 transition-opacity" />
            </h1>

            <!-- Status badge -->
            <Popover>
              <PopoverTrigger as-child>
                <button
                  class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  :class="deliveryStatusStyle(delivery.status)"
                >
                  {{ statusLabel(delivery.status) }}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" :side-offset="4" class="p-2 w-[180px]">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 py-1">Status</p>
                <button
                  v-for="s in deliveryStatuses"
                  :key="s.value"
                  class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
                  :class="delivery.status === s.value ? 'bg-[#4857FE]/10 text-[#4857FE] font-medium' : 'text-gray-600 hover:bg-gray-50'"
                  @click="updateStatus(s.value)"
                >
                  <span class="w-3 h-3 rounded-full" :class="s.color"></span>
                  {{ s.label }}
                </button>
              </PopoverContent>
            </Popover>

          </div>

          <!-- Right: Date + Tasks + Progress -->
          <div class="flex items-center gap-4 shrink-0 ml-6">
            <!-- Date Range (editable) -->
            <DateRangePicker
              :model-value="deliveryDateRange"
              @update:model-value="onDeliveryDateChange"
            >
              <template #trigger>
                <button
                  type="button"
                  class="group flex items-center gap-2 text-sm hover:text-[#4857FE] transition-colors"
                >
                  <CalendarDays :size="14" class="text-gray-400 shrink-0 group-hover:text-[#4857FE] transition-colors" />
                  <span
                    v-if="!deliveryDateRange.start && !deliveryDateRange.end"
                    class="text-gray-400 italic"
                  >Set dates</span>
                  <template v-else>
                    <span class="text-gray-700 font-medium">{{ formatDateShort(deliveryDateRange.start) }}</span>
                    <span class="text-gray-400 mx-0.5">→</span>
                    <span class="text-gray-700 font-medium">{{ formatDateShort(deliveryDateRange.end) }}</span>
                  </template>
                  <Pencil :size="11" class="text-gray-400 opacity-0 group-hover:opacity-70 transition-opacity" />
                </button>
              </template>
            </DateRangePicker>

            <div class="w-px h-5 bg-gray-200 shrink-0"></div>

            <!-- Tasks count -->
            <div class="flex items-center gap-1.5 text-sm shrink-0">
              <ListChecks :size="14" class="text-gray-400" />
              <span class="font-semibold text-gray-700">{{ completedTasks }}</span>
              <span class="text-gray-400">/</span>
              <span class="text-gray-500">{{ totalTasks }}</span>
            </div>

            <div class="w-px h-5 bg-gray-200 shrink-0"></div>

            <!-- Progress -->
            <div class="flex items-center gap-2">
              <div class="w-28 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  class="h-full bg-[#4857FE] rounded-full transition-all duration-500"
                  :style="{ width: `${progress}%` }"
                ></div>
              </div>
              <span class="text-sm font-semibold text-gray-700">{{ progress }}%</span>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="px-8 pb-3 pt-1">
          <div v-if="editingField === 'description'" class="flex items-start gap-2">
            <textarea
              ref="descriptionInputRef"
              v-model="editDescription"
              rows="2"
              class="flex-1 text-sm text-gray-600 bg-white border border-[#4857FE]/30 rounded-lg px-3 py-2 outline-none ring-2 ring-[#4857FE]/20 resize-none"
              placeholder="Add a description..."
              @keydown.escape.prevent="editingField = null"
            />
            <button @click="saveDescription" class="text-green-500 hover:text-green-600 mt-1.5"><Check :size="16" /></button>
            <button @click="editingField = null" class="text-gray-400 hover:text-gray-600 mt-1.5"><X :size="16" /></button>
          </div>
          <p
            v-else
            class="text-sm cursor-pointer hover:text-[#4857FE] transition-colors group/desc"
            :class="delivery.description ? 'text-gray-500' : 'text-gray-400 italic'"
            @click="startEditDescription"
          >
            {{ delivery.description ? stripHtml(delivery.description) : 'Click to add a description...' }}
            <Pencil :size="11" class="inline ml-1 opacity-0 group-hover/desc:opacity-40 transition-opacity" />
          </p>
        </div>
      </div>

      <!-- View Tabs -->
      <div class="bg-white px-8 border-b border-gray-100">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1">
            <button
              class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2"
              :class="activeView === 'kanban'
                ? 'text-[#4857FE] border-[#4857FE] bg-[#4857FE]/5'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'"
              @click="activeView = 'kanban'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="6" height="14" x="2" y="5" rx="1"/><rect width="6" height="10" x="16" y="7" rx="1"/><rect width="6" height="16" x="9" y="4" rx="1"/></svg>
              Kanban
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2"
              :class="activeView === 'timeline'
                ? 'text-[#4857FE] border-[#4857FE] bg-[#4857FE]/5'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'"
              @click="activeView = 'timeline'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 6 3 12 8 18"/><line x1="10" y1="6" x2="10" y2="18"/><line x1="14" y1="6" x2="14" y2="18"/><line x1="18" y1="6" x2="18" y2="18"/></svg>
              Timeline
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2"
              :class="activeView === 'list'
                ? 'text-[#4857FE] border-[#4857FE] bg-[#4857FE]/5'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'"
              @click="activeView = 'list'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              List
            </button>
          </div>

          <!-- User Filter Dropdown -->
          <div class="relative">
            <button
              class="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors cursor-pointer"
              :class="filterUserId ? 'border-[#4857FE] text-[#4857FE]' : 'text-gray-600'"
              @click.stop="showFilterDropdown = !showFilterDropdown"
            >
              <template v-if="filterUserId && filterUserId !== 'unassigned' && getUserById(filterUserId)">
                <div class="w-5 h-5 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold overflow-hidden shrink-0">
                  <UploadAssetImg v-if="getUserById(filterUserId)?.avatar" :src="getUserById(filterUserId)!.avatar!" class="w-5 h-5 rounded-full object-cover" />
                  <span v-else>{{ getUserById(filterUserId)!.name[0] }}</span>
                </div>
              </template>
              <template v-else-if="filterUserId === 'unassigned'">
                <div class="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <span class="text-[9px] text-gray-400">?</span>
                </div>
              </template>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {{ filterLabel }}
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>

            <div
              v-if="showFilterDropdown"
              class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-56 max-h-72 overflow-auto z-50"
              @click.stop
            >
              <!-- All Members -->
              <button
                class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors cursor-pointer"
                :class="!filterUserId ? 'text-[#4857FE] font-medium bg-[#4857FE]/5' : 'text-gray-700'"
                @click="selectFilter('')"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span class="flex-1">All Members</span>
                <svg v-if="!filterUserId" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[#4857FE]"><polyline points="20 6 9 17 4 12"/></svg>
              </button>

              <!-- Unassigned -->
              <button
                class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors cursor-pointer"
                :class="filterUserId === 'unassigned' ? 'text-[#4857FE] font-medium bg-[#4857FE]/5' : 'text-gray-700'"
                @click="selectFilter('unassigned')"
              >
                <div class="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                  <span class="text-[9px] text-gray-400">?</span>
                </div>
                <span class="flex-1">Unassigned</span>
                <svg v-if="filterUserId === 'unassigned'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[#4857FE]"><polyline points="20 6 9 17 4 12"/></svg>
              </button>

              <!-- Divider -->
              <div class="border-t border-gray-100 my-1"></div>

              <!-- Team Members -->
              <button
                v-for="user in teamMembers"
                :key="user.id"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors cursor-pointer"
                :class="filterUserId === user.id ? 'text-[#4857FE] font-medium bg-[#4857FE]/5' : 'text-gray-700'"
                @click="selectFilter(user.id)"
              >
                <div class="w-5 h-5 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold overflow-hidden shrink-0">
                  <UploadAssetImg v-if="user.avatar" :src="user.avatar" class="w-5 h-5 rounded-full object-cover" />
                  <span v-else>{{ user.name[0] }}</span>
                </div>
                <span class="flex-1 truncate">{{ user.name }}</span>
                <svg v-if="filterUserId === user.id" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[#4857FE] shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- List View -->
      <div v-if="activeView === 'list'" class="flex-1 overflow-hidden" style="background-color: #FAFBFD">
        <DeliveryList
          :tasks="filteredTasks"
          :team-members="teamMembers"
          @task-click="openTaskDetail"
        />
      </div>

      <!-- Timeline View -->
      <div v-if="activeView === 'timeline'" class="flex-1 overflow-hidden" style="background-color: #FAFBFD">
        <DeliveryTimeline
          :tasks="filteredTasks"
          :team-members="teamMembers"
          @task-click="openTaskDetail"
          @task-due-change="onTaskDueChange"
        />
      </div>

      <!-- Kanban Board -->
      <div v-else-if="activeView === 'kanban'" class="flex-1 overflow-auto p-5" style="background-color: #FAFBFD">
        <div class="flex gap-4 h-full min-h-0">
          <!-- Column for each status -->
          <div
            v-for="col in columnDefs"
            :key="col.key"
            class="flex flex-col flex-1 min-w-[260px] max-w-[320px] border-r border-gray-200 last:border-r-0 pr-4"
          >
            <!-- Column header -->
            <div class="flex items-center justify-between mb-3 px-0.5">
              <div class="flex items-center gap-2">
                <div class="w-1 h-5 rounded-full" :style="{ backgroundColor: col.color }"></div>
                <h3 class="text-sm font-semibold text-gray-800">{{ col.label }}</h3>
                <span
                  class="text-[11px] font-bold w-5 h-5 rounded-md flex items-center justify-center"
                  :style="{ backgroundColor: col.color + '18', color: col.color }"
                >
                  {{ (columnTasks[col.key] || []).length }}
                </span>
              </div>
              <button
                v-if="col.hasAdd"
                class="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-[#4857FE] transition-colors px-2 py-1 rounded-md hover:bg-[#4857FE]/5 cursor-pointer"
                @click="openTaskPicker"
              >
                <Plus :size="13" />
                Add
              </button>
            </div>

            <!-- Task cards (scrollable + drag-and-drop) -->
            <div class="flex-1 overflow-y-auto pr-0.5 pb-2">
              <draggable
                v-model="columnTasks[col.key]"
                group="kanban"
                item-key="id"
                :animation="200"
                ghost-class="kanban-ghost"
                drag-class="kanban-drag"
                class="space-y-3 h-full min-h-[200px]"
                @start="isDragging = true"
                @end="isDragging = false"
                @change="(evt: any) => onColumnChange(col.key, evt)"
              >
                <template #item="{ element: task }">
                  <div
                    class="bg-white rounded-xl border border-gray-200/80 hover:shadow-md hover:border-gray-300 transition-all duration-200 group/card relative cursor-grab active:cursor-grabbing"
                    @click="openTaskDetail(task)"
                  >
                    <div class="p-4">
                      <!-- Row 1: Short ID + Remove -->
                      <div class="flex items-center justify-between mb-2">
                        <span class="text-[10px] font-mono text-gray-400">{{ taskShortId(task) }}</span>
                        <button
                          class="text-gray-300 hover:text-red-500 opacity-0 group-hover/card:opacity-100 transition-all p-0.5 rounded hover:bg-red-50"
                          title="Remove from delivery"
                          @click.stop="removeTaskFromDelivery(task.id)"
                        >
                          <X :size="12" />
                        </button>
                      </div>

                      <!-- Row 2: Title -->
                      <h4 class="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug mb-1">{{ task.title }}</h4>

                      <!-- Row 3: Description -->
                      <p v-if="task.description" class="text-xs text-gray-400 line-clamp-2 mb-2 leading-relaxed">{{ richTextPreviewText(task.description) }}</p>
                      <div v-else class="mb-1"></div>

                      <!-- Row 4: Tags -->
                      <div class="flex items-center gap-1.5 flex-wrap mb-2.5">
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold"
                          :class="priorityStyle(task.priority)"
                        >
                          {{ priorityLabel(task.priority) }}
                        </span>
                        <span
                          v-if="task.type"
                          class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium"
                          :class="typeBadgeStyle(task.type)"
                        >
                          {{ typeLabel(task.type) }}
                        </span>
                      </div>

                      <!-- Row 5: Progress bar -->
                      <div class="flex items-center gap-2 mb-3">
                        <div class="flex items-center gap-1 text-gray-400">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1v6l4.33 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/></svg>
                          <span class="text-[10px] font-medium">Progress</span>
                        </div>
                        <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            class="h-full rounded-full transition-all duration-500"
                            :class="progressBarColor(task.status)"
                            :style="{ width: `${taskProgress(task)}%` }"
                          ></div>
                        </div>
                        <span class="text-[10px] font-medium text-gray-500 w-7 text-right">{{ taskProgress(task) }}%</span>
                      </div>

                      <!-- Row 5: Blocked warning -->
                      <div v-if="task.blockedReason" class="flex items-center gap-1.5 mb-3 px-2 py-1.5 bg-red-50 rounded-lg">
                        <AlertTriangle :size="12" class="text-red-500 shrink-0" />
                        <span class="text-[10px] text-red-600 font-medium truncate">{{ task.blockedReason }}</span>
                      </div>

                      <!-- Row 6: Footer - Assignees + Meta -->
                      <div class="flex items-center justify-between pt-2.5 border-t border-gray-100">
                        <div class="flex items-center -space-x-1.5">
                          <template v-if="task.assigneeUserIds && task.assigneeUserIds.length > 0">
                            <div
                              v-for="(userId, i) in task.assigneeUserIds.slice(0, 3)"
                              :key="userId"
                              class="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold"
                              :style="{ zIndex: 3 - Number(i) }"
                              :title="getUserById(userId)?.name || userId"
                            >
                              <UploadAssetImg v-if="getUserById(userId)?.avatar" :src="getUserById(userId)!.avatar!" class="w-6 h-6 rounded-full object-cover" />
                              <span v-else>{{ (getUserById(userId)?.name || '?')[0] }}</span>
                            </div>
                            <div
                              v-if="task.assigneeUserIds.length > 3"
                              class="w-6 h-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[9px] font-medium text-gray-500"
                            >
                              +{{ task.assigneeUserIds.length - 3 }}
                            </div>
                          </template>
                          <div v-else class="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                            <span class="text-[9px] text-gray-400">?</span>
                          </div>
                        </div>
                        <div class="flex items-center gap-2.5 text-gray-400">
                          <div v-if="(task as any).comments?.length" class="flex items-center gap-1" :title="`${(task as any).comments.length} comments`">
                            <MessageSquare :size="12" />
                            <span class="text-[10px] font-medium">{{ (task as any).comments.length }}</span>
                          </div>
                          <div v-if="task.estimateValue" class="flex items-center gap-1" :title="`${task.estimateValue}h estimate`">
                            <Link2 :size="12" />
                            <span class="text-[10px] font-medium">{{ task.estimateValue }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </draggable>

              <!-- Empty state (only for non-draggable columns with no tasks) -->
              <div v-if="(columnTasks[col.key] || []).length === 0 && !col.hasAdd" class="text-center py-8">
                <p class="text-xs text-gray-400">
                  {{ col.key === 'others' ? 'No blocked tasks' : 'No tasks' }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Task Picker Overlay -->
      <Teleport to="body">
        <div v-if="showTaskPicker" class="fixed inset-0 z-[100]" @click="showTaskPicker = false">
          <div class="absolute inset-0 bg-black/20"></div>
          <div
            class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl border border-gray-200 w-[420px] max-h-[480px] flex flex-col"
            @click.stop
          >
            <div class="p-4 border-b border-gray-100">
              <div class="flex items-center justify-between mb-3">
                <p class="text-sm font-semibold text-gray-800">Add Tasks from Backlog</p>
                <button
                  class="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors"
                  @click="showTaskPicker = false"
                >
                  <X :size="16" />
                </button>
              </div>
              <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-2 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
                <Search :size="14" class="text-gray-400 shrink-0" />
                <input
                  v-model="taskSearchQuery"
                  class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                  placeholder="Search tasks..."
                />
              </div>
            </div>
            <div class="flex-1 overflow-auto">
              <div v-if="filteredAvailableTasks.length === 0" class="p-6 text-center">
                <p class="text-sm text-gray-400">No available tasks found</p>
                <p class="text-xs text-gray-300 mt-1">All backlog tasks are already in this delivery</p>
              </div>
              <button
                v-for="task in filteredAvailableTasks"
                :key="task.id"
                class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                @click="addTaskToDelivery(task.id)"
              >
                <Plus :size="14" class="text-[#4857FE] shrink-0 mt-0.5" />
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-800 truncate">{{ task.title }}</p>
                  <span class="text-[10px] text-gray-400 truncate block">{{ (task as any).storyTitle }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Task Detail Panel -->
      <TaskDetailPanel
        :task="selectedTask"
        :open="showTaskPanel"
        :team-members="teamMembers"
        @close="closeTaskPanel"
        @updated="onTaskUpdated"
      />
    </template>
  </div>
</template>

<style scoped>
/* Drag-and-drop ghost (placeholder in target column) */
.kanban-ghost {
  opacity: 0.5;
  border: 2px dashed #4857FE !important;
  border-radius: 12px;
  background: #f0f4ff !important;
}
.kanban-ghost > * {
  opacity: 0;
}

/* Drag-and-drop dragging card */
.kanban-drag {
  transform: rotate(2deg);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15) !important;
  border-color: #4857FE !important;
  z-index: 50;
}
</style>
