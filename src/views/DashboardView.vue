<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Circle, Link2, Plus, CheckCircle2, Loader2, Trash2,
  LayoutList, LayoutGrid, Search, Sparkles, Bug, Lightbulb, FlaskConical, Wrench, Server, TestTube2,
  X, ArrowUp, ArrowDown, ArrowUpDown,
  FolderOpen, FileText, Flag, BarChart3, ListChecks, Settings2, Calendar,
  AlertTriangle, Clock
} from 'lucide-vue-next'
import { useBacklogStore } from '@/stores/backlog'
import { useAuthStore } from '@/stores/auth'
import AddStoryDialog from '@/components/backlog/AddStoryDialog.vue'
import TaskDetailPanel from '@/components/delivery/TaskDetailPanel.vue'
import StoryDetailPanel from '@/components/backlog/StoryDetailPanel.vue'
import type { TaskStatus, Task, Story } from '@/types/backlog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const backlogStore = useBacklogStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

// Task detail panel
interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}
const selectedTask = ref<Task | null>(null)
const showTaskPanel = ref(false)
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

function openTaskDetail(task: Task) {
  selectedTask.value = task
  showTaskPanel.value = true
}

function closeTaskPanel() {
  showTaskPanel.value = false
}

async function onTaskUpdated() {
  await backlogStore.fetchStories()
  // Refresh selectedTask with updated data
  if (selectedTask.value) {
    for (const item of backlogStore.stories) {
      const fresh = item.tasks.find(t => t.id === selectedTask.value!.id)
      if (fresh) {
        selectedTask.value = fresh
        break
      }
    }
  }
}

// Story detail panel
const selectedStory = ref<Story | null>(null)
const showStoryPanel = ref(false)

function openStoryDetail(story: Story) {
  selectedStory.value = story
  showStoryPanel.value = true
}

function closeStoryPanel() {
  showStoryPanel.value = false
}

async function onStoryUpdated() {
  await backlogStore.fetchStories()
  if (selectedStory.value) {
    const fresh = backlogStore.stories.find(i => i.id === selectedStory.value!.id)
    if (fresh) {
      selectedStory.value = fresh
    }
  }
}

// Owner search types & state
interface UserResult {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
}

const ownerSearchQuery = ref('')
const ownerSearchResults = ref<UserResult[]>([])
const ownerSearchLoading = ref(false)
const selectedOwnerIndex = ref(-1)
const showOwnerDropdown = ref(false)
const ownerMouseDownOnDropdown = ref(false)
let ownerSearchTimeout: ReturnType<typeof setTimeout> | null = null

async function searchOwners(query: string) {
  ownerSearchLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      ownerSearchResults.value = await res.json()
    }
  } catch {
    ownerSearchResults.value = []
  } finally {
    ownerSearchLoading.value = false
  }
}

function onOwnerSearchInput() {
  selectedOwnerIndex.value = -1
  showOwnerDropdown.value = true
  if (ownerSearchTimeout) clearTimeout(ownerSearchTimeout)
  ownerSearchTimeout = setTimeout(() => {
    searchOwners(ownerSearchQuery.value)
  }, 200)
}

function selectOwnerUser(storyId: string, user: UserResult) {
  editValue.value = user.name
  ownerSearchQuery.value = ''
  ownerSearchResults.value = []
  showOwnerDropdown.value = false
  selectedOwnerIndex.value = -1
  // Save both owner name and avatar
  backlogStore.updateStory(storyId, { owner: user.name, ownerAvatar: user.avatar || null })
  editingCell.value = null
}

const ownerClosedByEscape = ref(false)

function onOwnerSearchKeydown(e: KeyboardEvent, storyId: string) {
  const results = ownerSearchResults.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedOwnerIndex.value = Math.min(selectedOwnerIndex.value + 1, results.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedOwnerIndex.value = Math.max(selectedOwnerIndex.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedOwnerIndex.value >= 0 && results[selectedOwnerIndex.value]) {
      selectOwnerUser(storyId, results[selectedOwnerIndex.value]!)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    ownerClosedByEscape.value = true
    showOwnerDropdown.value = false
    cancelEdit()
  }
}

function onOwnerSearchFocus() {
  showOwnerDropdown.value = true
  searchOwners(ownerSearchQuery.value)
}

function onOwnerSearchBlur(_storyId: string) {
  if (ownerMouseDownOnDropdown.value) {
    ownerMouseDownOnDropdown.value = false
    return
  }
  if (ownerClosedByEscape.value) {
    ownerClosedByEscape.value = false
    return
  }
  setTimeout(() => {
    showOwnerDropdown.value = false
    cancelEdit()
  }, 150)
}

function onTaskAssigneeBlur() {
  setTimeout(() => { showTaskAssigneeDropdown.value = false }, 150)
}

function startOwnerEdit(storyId: string, currentOwner: string) {
  startEdit(storyId, 'owner', currentOwner)
  ownerSearchQuery.value = ''
  ownerSearchResults.value = []
  selectedOwnerIndex.value = -1
  showOwnerDropdown.value = true
  nextTick(() => searchOwners(''))
}

const activeTab = ref('Overview')
const showAddDialog = ref(false)
const showCreateTaskDialog = ref(false)
const searchQuery = ref('')
const viewMode = ref<'table' | 'card'>(localStorage.getItem('backlog-view-mode') as 'table' | 'card' || 'table')

// Sort state
type SortColumn = 'title' | 'type' | 'initiative' | 'tasks' | 'owner' | 'status' | 'priority' | 'createdAt' | 'delivery'
const sortColumn = ref<SortColumn | null>(null)
const sortDirection = ref<'asc' | 'desc'>('asc')

function toggleSort(column: SortColumn) {
  if (sortColumn.value === column) {
    if (sortDirection.value === 'asc') {
      sortDirection.value = 'desc'
    } else {
      // Third click resets sort
      sortColumn.value = null
      sortDirection.value = 'asc'
    }
  } else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const statusOrder: Record<string, number> = { in_progress: 0, initialized: 1, drafted: 2, backlog: 3, completed: 4, archived: 5 }

// Create Task dialog state
const newTaskStoryId = ref('')
const newTaskTitle = ref('')
const newTaskPriority = ref<'low' | 'medium' | 'high' | 'critical'>('medium')
const newTaskType = ref<string>('')
const newTaskEstimate = ref<string>('')
const newTaskDueAt = ref<string>('')
const newTaskDependent = ref<string>('')
const newTaskBlockedReason = ref<string>('')
const creatingTask = ref(false)

// Task assignee multi-select state
const taskAssigneeSearch = ref('')
const taskAssigneeResults = ref<{ id: string; name: string; email: string; avatar: string | null }[]>([])
const taskAssigneeLoading = ref(false)
const selectedTaskAssignees = ref<{ id: string; name: string; avatar: string | null }[]>([])
const showTaskAssigneeDropdown = ref(false)
let taskAssigneeTimeout: ReturnType<typeof setTimeout> | null = null

async function searchTaskAssignees(query: string) {
  taskAssigneeLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) taskAssigneeResults.value = await res.json()
  } catch { taskAssigneeResults.value = [] }
  finally { taskAssigneeLoading.value = false }
}

function onTaskAssigneeInput() {
  showTaskAssigneeDropdown.value = true
  if (taskAssigneeTimeout) clearTimeout(taskAssigneeTimeout)
  taskAssigneeTimeout = setTimeout(() => searchTaskAssignees(taskAssigneeSearch.value), 200)
}

function addTaskAssignee(user: { id: string; name: string; avatar: string | null }) {
  if (!selectedTaskAssignees.value.find(u => u.id === user.id)) {
    selectedTaskAssignees.value.push(user)
  }
  taskAssigneeSearch.value = ''
  taskAssigneeResults.value = []
  showTaskAssigneeDropdown.value = false
}

function removeTaskAssignee(userId: string) {
  selectedTaskAssignees.value = selectedTaskAssignees.value.filter(u => u.id !== userId)
}

// Inline task add state
const inlineTaskStoryId = ref<string | null>(null)
const inlineTaskTitle = ref('')
const addingInlineTask = ref(false)

// Inline cell editing state
const editingCell = ref<{ storyId: string, field: string } | null>(null)
const editValue = ref('')

const taskTypeOptions = ['design', 'development', 'testing', 'review', 'research', 'fix', 'documentation', 'deployment'] as const
const statusOptions = ['backlog', 'drafted', 'initialized', 'in_progress', 'completed', 'archived'] as const
const priorityOptions = ['low', 'medium', 'high', 'critical'] as const

function isEditing(storyId: string, field: string) {
  return editingCell.value?.storyId === storyId && editingCell.value?.field === field
}

function startEdit(storyId: string, field: string, currentValue: string) {
  editingCell.value = { storyId, field }
  editValue.value = currentValue
}

async function saveEdit(storyId: string, field: string) {
  const story = backlogStore.stories.find(i => i.id === storyId)
  if (!story) return cancelEdit()

  const currentVal = (story as any)[field] ?? ''
  if (editValue.value !== currentVal) {
    await backlogStore.updateStory(storyId, { [field]: editValue.value || null })
  }
  editingCell.value = null
}

function selectOption(storyId: string, field: string, value: string) {
  editValue.value = value
  saveEdit(storyId, field)
}

function cancelEdit() {
  editingCell.value = null
}

// Distinct owners from backlog stories
const distinctOwners = computed(() => {
  const seen = new Map<string, { name: string, avatar: string | null }>()
  for (const item of backlogStore.stories) {
    if (item.owner && !seen.has(item.owner)) {
      seen.set(item.owner, { name: item.owner, avatar: item.ownerAvatar || null })
    }
  }
  return Array.from(seen.values())
})

const tabs = ['Overview', 'Stories', 'Tasks']

// Persist view mode
watch(viewMode, (v) => localStorage.setItem('backlog-view-mode', v))

// Flatten all tasks across stories for the Tasks tab
const allTasks = computed(() => {
  const result: (Task & { storyTitle: string })[] = []
  for (const item of backlogStore.stories) {
    for (const task of item.tasks) {
      result.push({ ...task, storyTitle: item.title })
    }
  }
  return result
})

// Filtered + sorted stories
const filteredStories = computed(() => {
  let items = backlogStore.stories
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    items = items.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q) ||
      item.priority.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q) ||
      (item.owner && item.owner.toLowerCase().includes(q)) ||
      (item.initiative && item.initiative.toLowerCase().includes(q))
    )
  }

  if (!sortColumn.value) return items

  const col = sortColumn.value
  const dir = sortDirection.value === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    let cmp = 0
    switch (col) {
      case 'title':
        cmp = a.title.localeCompare(b.title)
        break
      case 'type':
        cmp = a.type.localeCompare(b.type)
        break
      case 'initiative':
        cmp = (a.initiative || '').localeCompare(b.initiative || '')
        break
      case 'tasks': {
        const aDone = a.tasks.length ? a.tasks.filter(t => t.status === 'done').length / a.tasks.length : 0
        const bDone = b.tasks.length ? b.tasks.filter(t => t.status === 'done').length / b.tasks.length : 0
        cmp = aDone - bDone || a.tasks.length - b.tasks.length
        break
      }
      case 'owner':
        cmp = (a.owner || '').localeCompare(b.owner || '')
        break
      case 'status':
        cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
        break
      case 'priority':
        cmp = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99)
        break
      case 'createdAt':
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
      case 'delivery':
        cmp = (a.delivery ? new Date(a.delivery).getTime() : Infinity) - (b.delivery ? new Date(b.delivery).getTime() : Infinity)
        break
    }
    return cmp * dir
  })
})

// Close dropdowns on outside click
function handleGlobalClick() {
  if (editingCell.value) {
    const field = editingCell.value.field
    // Auto-close dropdowns and owner search on outside click
    if (['type', 'status', 'priority'].includes(field)) {
      cancelEdit()
    } else if (field === 'owner') {
      showOwnerDropdown.value = false
      cancelEdit()
    }
  }
}

// Open story panel from query param (e.g. sidebar click)
function openStoryFromQuery() {
  const storyId = route.query.story as string | undefined
  if (storyId && backlogStore.stories.length > 0) {
    const found = backlogStore.stories.find(i => i.id === storyId)
    if (found) {
      activeTab.value = 'Stories'
      openStoryDetail(found)
      // Clean up the query param so it doesn't re-trigger
      router.replace({ path: '/backlog', query: {} })
    }
  }
}

watch(() => backlogStore.stories, () => {
  openStoryFromQuery()
})

watch(() => route.query.story, () => {
  openStoryFromQuery()
})

onMounted(async () => {
  await backlogStore.fetchStories()
  fetchTeamMembers()
  document.addEventListener('click', handleGlobalClick)
  openStoryFromQuery()
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})

function priorityColor(priority: string) {
  switch (priority) {
    case 'critical': return '#e2445c'
    case 'high': return '#fdab3d'
    case 'medium': return '#00c875'
    case 'low': return '#579bfc'
    default: return '#c4c4c4'
  }
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function priorityStyle(priority: string) {
  switch (priority) {
    case 'critical': return 'bg-red-50 text-red-700 border border-red-200'
    case 'high': return 'bg-orange-50 text-orange-700 border border-orange-200'
    case 'medium': return 'bg-green-50 text-green-700 border border-green-200'
    case 'low': return 'bg-blue-50 text-blue-700 border border-blue-200'
    default: return 'bg-gray-50 text-gray-600 border border-gray-200'
  }
}

function priorityDotStyle(priority: string) {
  switch (priority) {
    case 'critical': return 'bg-red-500'
    case 'high': return 'bg-orange-500'
    case 'medium': return 'bg-green-500'
    case 'low': return 'bg-blue-500'
    default: return 'bg-gray-400'
  }
}

function statusStyle(status: string) {
  switch (status) {
    // Story statuses
    case 'backlog': return 'bg-[#c4c4c4] text-white'
    case 'drafted': return 'bg-[#a25ddc] text-white'
    case 'initialized': return 'bg-[#579bfc] text-white'
    case 'in_progress': return 'bg-[#fdab3d] text-white'
    case 'completed': return 'bg-[#00c875] text-white'
    // Task statuses
    case 'created': return 'bg-[#c4c4c4] text-white'
    case 'assigned': return 'bg-[#a25ddc] text-white'
    case 'in_review': return 'bg-[#579bfc] text-white'
    case 'done': return 'bg-[#00c875] text-white'
    case 'overdue': return 'bg-red-500 text-white'
    case 'blocked': return 'bg-[#e2445c] text-white'
    case 'archived': return 'bg-gray-400 text-white'
    default: return 'bg-[#c4c4c4] text-white'
  }
}

function itemBorderColor(type: string) {
  switch (type) {
    case 'feature': return 'border-l-blue-500'
    case 'bug': return 'border-l-red-500'
    case 'improvement': return 'border-l-purple-500'
    case 'technical_debt': return 'border-l-orange-500'
    case 'research': return 'border-l-yellow-500'
    case 'infrastructure': return 'border-l-gray-600'
    case 'testing': return 'border-l-green-500'
    case 'documentation': return 'border-l-gray-400'
    default: return 'border-l-gray-300'
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function typeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function typeBadgeStyle(type: string) {
  switch (type) {
    case 'feature': return 'bg-blue-50/80 text-blue-600'
    case 'bug': return 'bg-red-50/80 text-red-600'
    case 'improvement': return 'bg-purple-50/80 text-purple-600'
    case 'technical_debt': return 'bg-orange-50/80 text-orange-600'
    case 'research': return 'bg-yellow-50/80 text-yellow-600'
    case 'infrastructure': return 'bg-gray-100/80 text-gray-600'
    case 'testing': return 'bg-green-50/80 text-green-600'
    case 'documentation': return 'bg-gray-50/80 text-gray-500'
    default: return 'bg-gray-50/80 text-gray-500'
  }
}

function typeIconColor(type: string) {
  switch (type) {
    case 'feature': return 'text-blue-500'
    case 'bug': return 'text-red-500'
    case 'improvement': return 'text-purple-500'
    case 'technical_debt': return 'text-orange-500'
    case 'research': return 'text-yellow-500'
    case 'infrastructure': return 'text-gray-600'
    case 'testing': return 'text-green-500'
    case 'documentation': return 'text-gray-400'
    default: return 'text-gray-400'
  }
}

const typeIcons: Record<string, any> = {
  feature: Sparkles,
  bug: Bug,
  improvement: Lightbulb,
  technical_debt: Wrench,
  research: FlaskConical,
  infrastructure: Server,
  testing: TestTube2,
  documentation: FileText,
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function daysAgo(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return '1 day ago'
  return `${diffDays} days ago`
}

function taskProgress(item: Story) {
  if (item.tasks.length === 0) return 0
  return Math.round((item.tasks.filter(t => t.status === 'done').length / item.tasks.length) * 100)
}

function cycleTaskStatus(taskId: string, currentStatus: TaskStatus) {
  const order: TaskStatus[] = ['created', 'assigned', 'in_progress', 'in_review', 'done']
  const idx = order.indexOf(currentStatus)
  const next = order[(idx + 1) % order.length]!
  backlogStore.updateTask(taskId, { status: next })
}

// Create Task dialog
async function handleCreateTask() {
  if (!newTaskTitle.value.trim() || !newTaskStoryId.value) return
  creatingTask.value = true
  await backlogStore.createTask(newTaskStoryId.value, {
    title: newTaskTitle.value.trim(),
    priority: newTaskPriority.value,
    type: newTaskType.value ? (newTaskType.value as any) : undefined,
    assigneeUserIds: selectedTaskAssignees.value.length > 0
      ? selectedTaskAssignees.value.map(u => u.id)
      : undefined,
    estimateValue: newTaskEstimate.value ? parseInt(newTaskEstimate.value) : undefined,
    dueAt: newTaskDueAt.value || undefined,
    dependent: newTaskDependent.value ? [newTaskDependent.value] : undefined,
    blockedReason: newTaskBlockedReason.value.trim() || undefined,
  })
  newTaskTitle.value = ''
  newTaskPriority.value = 'medium'
  newTaskType.value = ''
  newTaskEstimate.value = ''
  newTaskDueAt.value = ''
  newTaskDependent.value = ''
  newTaskBlockedReason.value = ''
  selectedTaskAssignees.value = []
  newTaskStoryId.value = ''
  creatingTask.value = false
  showCreateTaskDialog.value = false
}

// Inline task add
async function handleInlineTaskAdd(storyId: string) {
  if (!inlineTaskTitle.value.trim()) return
  addingInlineTask.value = true
  await backlogStore.createTask(storyId, {
    title: inlineTaskTitle.value.trim(),
  })
  inlineTaskTitle.value = ''
  inlineTaskStoryId.value = null
  addingInlineTask.value = false
}

function openInlineTaskAdd(storyId: string, event: Event) {
  event.stopPropagation()
  inlineTaskStoryId.value = storyId
  inlineTaskTitle.value = ''
}

function cancelInlineTaskAdd() {
  inlineTaskStoryId.value = null
  inlineTaskTitle.value = ''
}

function priorityCircleColor(priority: string) {
  switch (priority) {
    case 'critical': return 'bg-[#e2445c]'
    case 'high': return 'bg-[#fdab3d]'
    case 'medium': return 'bg-[#00c875]'
    case 'low': return 'bg-[#579bfc]'
    default: return 'bg-gray-400'
  }
}

function priorityNumber(priority: string) {
  switch (priority) {
    case 'critical': return 1
    case 'high': return 2
    case 'medium': return 3
    case 'low': return 4
    default: return 4
  }
}

function statusDotColor(status: string) {
  switch (status) {
    case 'backlog': return 'bg-[#c4c4c4]'
    case 'drafted': return 'bg-[#a25ddc]'
    case 'initialized': return 'bg-[#579bfc]'
    case 'in_progress': return 'bg-[#fdab3d]'
    case 'completed': return 'bg-[#00c875]'
    case 'archived': return 'bg-gray-300'
    default: return 'bg-gray-400'
  }
}

function statusTextColor(status: string) {
  switch (status) {
    case 'backlog': return 'text-gray-600'
    case 'drafted': return 'text-purple-700'
    case 'initialized': return 'text-blue-700'
    case 'in_progress': return 'text-orange-700'
    case 'completed': return 'text-green-700'
    case 'archived': return 'text-gray-500'
    default: return 'text-gray-600'
  }
}

function priorityBarColor(priority: string) {
  switch (priority) {
    case 'critical': return 'text-red-500'
    case 'high': return 'text-orange-500'
    case 'medium': return 'text-green-500'
    case 'low': return 'text-blue-400'
    default: return 'text-gray-400'
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Page Header -->
    <div class="bg-white px-8 pt-8 pb-6 border-b border-gray-100">
      <!-- Title row -->
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-3">
          <div class="w-3 h-3 rounded-full border-2 border-gray-300"></div>
          <h1 class="text-2xl font-semibold text-gray-900">Backlog</h1>
          <button class="text-gray-400 hover:text-gray-600 transition-colors">
            <Link2 :size="18" />
          </button>
        </div>

        <!-- Distinct owner avatars from stories -->
        <div v-if="distinctOwners.length > 0" class="flex items-center">
          <div class="flex -space-x-2">
            <img
              v-for="owner in distinctOwners.slice(0, 3)"
              :key="owner.name"
              :src="owner.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${owner.name}`"
              class="w-8 h-8 rounded-full border-2 border-white object-cover"
              :alt="owner.name"
              :title="owner.name"
            />
          </div>
          <!-- +N badge with hover dropdown -->
          <div
            v-if="distinctOwners.length > 3"
            class="relative group/owners -ml-2"
          >
            <div
              class="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-xs font-medium text-gray-500 border-2 border-white cursor-pointer hover:bg-gray-200 transition-colors"
            >
              +{{ distinctOwners.length - 3 }}
            </div>
            <!-- Hover dropdown showing remaining owners -->
            <div class="absolute top-full right-0 mt-1.5 bg-white rounded-lg border border-gray-200 shadow-lg py-1.5 min-w-[200px] z-40 opacity-0 invisible group-hover/owners:opacity-100 group-hover/owners:visible transition-all duration-150">
              <div class="px-3 py-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider">More owners</div>
              <div
                v-for="owner in distinctOwners.slice(3)"
                :key="owner.name"
                class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50"
              >
                <img
                  :src="owner.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${owner.name}`"
                  class="w-6 h-6 rounded-full object-cover"
                  :alt="owner.name"
                />
                <span class="text-sm text-gray-700">{{ owner.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab navigation + Create buttons -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1">
          <button
            v-for="tab in tabs"
            :key="tab"
            class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative"
            :class="[
              activeTab === tab
                ? 'text-[#4857FE]'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            ]"
            @click="activeTab = tab"
          >
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="[
                activeTab === tab ? 'bg-[#4857FE]' : 'bg-gray-300'
              ]"
            ></span>
            {{ tab }}

            <div
              v-if="activeTab === tab"
              class="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4857FE] rounded-t-full"
            ></div>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="showCreateTaskDialog = true"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
          >
            <Plus :size="14" />
            Create Task
          </button>
          <button
            @click="showAddDialog = true"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#4857FE] hover:bg-[#3E4BDE] rounded-lg transition-colors"
          >
            <Plus :size="14" />
            Create Story
          </button>
        </div>
      </div>
    </div>

    <!-- Page Content -->
    <div class="flex-1 overflow-auto p-8" style="background-color: #F8FAFF">

      <!-- ========== OVERVIEW TAB ========== -->
      <div v-if="activeTab === 'Overview'" class="space-y-6">
        <!-- Stats cards -->
        <div class="grid grid-cols-4 gap-4">
          <div class="bg-white rounded-xl border border-gray-100 p-5">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Stories</p>
            <p class="text-2xl font-semibold text-gray-900 mt-1">{{ backlogStore.storyCount }}</p>
          </div>
          <div class="bg-white rounded-xl border border-gray-100 p-5">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Tasks</p>
            <p class="text-2xl font-semibold text-gray-900 mt-1">{{ allTasks.length }}</p>
          </div>
          <div class="bg-white rounded-xl border border-gray-100 p-5">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">In Progress</p>
            <p class="text-2xl font-semibold text-blue-600 mt-1">{{ backlogStore.stories.filter(i => i.status === 'in_progress').length }}</p>
          </div>
          <div class="bg-white rounded-xl border border-gray-100 p-5">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Tasks Done</p>
            <p class="text-2xl font-semibold text-green-600 mt-1">{{ allTasks.filter(t => t.status === 'done').length }}</p>
          </div>
        </div>

        <!-- Recent stories -->
        <div class="bg-white rounded-xl border border-gray-100 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-gray-700">Recent Stories</h3>
            <button @click="activeTab = 'Stories'" class="text-xs text-[#4857FE] font-medium hover:underline">View all</button>
          </div>

          <!-- Loading -->
          <div v-if="backlogStore.loading && !backlogStore.stories.length" class="flex items-center justify-center py-8">
            <Loader2 :size="20" class="animate-spin text-[#4857FE]" />
            <span class="ml-2 text-sm text-gray-500">Loading...</span>
          </div>

          <div v-else class="space-y-1">
            <div
              v-for="item in backlogStore.stories.slice(0, 5)"
              :key="item.id"
              class="flex items-center justify-between py-3 px-4 border-l-[3px] border-l-[#4857FE] hover:bg-gray-50/60 transition-colors rounded-r-lg"
            >
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-sm text-gray-800 font-medium truncate">{{ item.title }}</span>
              </div>
              <div class="flex items-center gap-4 shrink-0 ml-4">
                <span
                  class="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold min-w-[80px] justify-center shadow-sm"
                  :class="statusStyle(item.status)"
                >
                  {{ statusLabel(item.status) }}
                </span>
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  :class="priorityStyle(item.priority)"
                >
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="priorityDotStyle(item.priority)"></span>
                  {{ priorityLabel(item.priority) }}
                </span>
                <span class="text-xs text-gray-400 w-10 text-right">
                  <span class="text-gray-700 font-medium">{{ item.tasks.filter(t => t.status === 'done').length }}</span>/{{ item.tasks.length }}
                </span>
              </div>
            </div>

            <div v-if="backlogStore.stories.length === 0" class="text-center py-6">
              <p class="text-sm text-gray-400">No stories yet</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== STORIES TAB ========== -->
      <div v-else-if="activeTab === 'Stories'" class="min-h-[300px]">
        <!-- Stories Header Bar -->
        <div
          class="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white border-x border-t border-gray-100"
          :class="viewMode === 'card' ? 'rounded-xl' : 'rounded-t-xl'"
        >
          <h3 class="text-base font-semibold text-gray-900">Stories</h3>

          <div class="flex items-center gap-4">
            <p class="text-sm text-gray-400">{{ filteredStories.length }} stories</p>

            <!-- Search -->
            <div class="relative">
              <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search stories..."
                class="pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#4857FE] focus:bg-white placeholder:text-gray-400 transition-colors w-48"
              />
              <button
                v-if="searchQuery"
                @click="searchQuery = ''"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X :size="12" />
              </button>
            </div>

            <!-- View toggle -->
            <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                class="p-1.5 rounded-md transition-colors"
                :class="viewMode === 'table' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
                @click="viewMode = 'table'"
                title="Table view"
              >
                <LayoutList :size="16" />
              </button>
              <button
                class="p-1.5 rounded-md transition-colors"
                :class="viewMode === 'card' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
                @click="viewMode = 'card'"
                title="Card view"
              >
                <LayoutGrid :size="16" />
              </button>
            </div>
          </div>
        </div>

        <!-- Loading state -->
        <div v-if="backlogStore.loading && !backlogStore.stories.length" class="flex items-center justify-center py-12">
          <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
          <span class="ml-2 text-sm text-gray-500">Loading backlog...</span>
        </div>

        <!-- Error state -->
        <div v-else-if="backlogStore.error" class="bg-red-50 border border-red-100 rounded-lg p-4 m-6">
          <p class="text-sm text-red-600">{{ backlogStore.error }}</p>
          <button @click="backlogStore.fetchStories()" class="text-sm text-red-700 font-medium mt-1 hover:underline">
            Retry
          </button>
        </div>

        <!-- ===== TABLE VIEW ===== -->
        <div v-else-if="viewMode === 'table'" class="bg-white rounded-b-xl border-x border-b border-gray-100">
          <!-- Column Headers (sortable) -->
          <div class="grid grid-cols-[4px_1fr_160px_120px_90px_70px_130px_120px_120px_100px] gap-x-3 items-center px-6 py-2.5 border-b border-gray-200 text-sm font-medium text-gray-400 tracking-wide select-none">
            <span></span>
            <button class="pl-2 flex items-center gap-1 hover:text-gray-600 transition-colors text-left" @click="toggleSort('title')">
              Title
              <ArrowUp v-if="sortColumn === 'title' && sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
              <ArrowDown v-else-if="sortColumn === 'title' && sortDirection === 'desc'" :size="12" class="text-[#4857FE]" />
              <ArrowUpDown v-else :size="12" class="opacity-0 group-hover/header:opacity-100" />
            </button>
            <button class="flex items-center gap-1 hover:text-gray-600 transition-colors" @click="toggleSort('initiative')">
              Initiative
              <ArrowUp v-if="sortColumn === 'initiative' && sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
              <ArrowDown v-else-if="sortColumn === 'initiative' && sortDirection === 'desc'" :size="12" class="text-[#4857FE]" />
            </button>
            <button class="flex items-center gap-1 hover:text-gray-600 transition-colors" @click="toggleSort('type')">
              Type
              <ArrowUp v-if="sortColumn === 'type' && sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
              <ArrowDown v-else-if="sortColumn === 'type' && sortDirection === 'desc'" :size="12" class="text-[#4857FE]" />
            </button>
            <button class="flex items-center gap-1 hover:text-gray-600 transition-colors" @click="toggleSort('tasks')">
              Tasks
              <ArrowUp v-if="sortColumn === 'tasks' && sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
              <ArrowDown v-else-if="sortColumn === 'tasks' && sortDirection === 'desc'" :size="12" class="text-[#4857FE]" />
            </button>
            <button class="flex items-center gap-1 hover:text-gray-600 transition-colors" @click="toggleSort('owner')">
              Owner
              <ArrowUp v-if="sortColumn === 'owner' && sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
              <ArrowDown v-else-if="sortColumn === 'owner' && sortDirection === 'desc'" :size="12" class="text-[#4857FE]" />
            </button>
            <button class="flex items-center gap-1 hover:text-gray-600 transition-colors" @click="toggleSort('status')">
              Status
              <ArrowUp v-if="sortColumn === 'status' && sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
              <ArrowDown v-else-if="sortColumn === 'status' && sortDirection === 'desc'" :size="12" class="text-[#4857FE]" />
            </button>
            <button class="flex items-center gap-1 hover:text-gray-600 transition-colors" @click="toggleSort('priority')">
              Priority
              <ArrowUp v-if="sortColumn === 'priority' && sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
              <ArrowDown v-else-if="sortColumn === 'priority' && sortDirection === 'desc'" :size="12" class="text-[#4857FE]" />
            </button>
            <button class="flex items-center gap-1 hover:text-gray-600 transition-colors" @click="toggleSort('createdAt')">
              Created
              <ArrowUp v-if="sortColumn === 'createdAt' && sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
              <ArrowDown v-else-if="sortColumn === 'createdAt' && sortDirection === 'desc'" :size="12" class="text-[#4857FE]" />
            </button>
            <button class="flex items-center gap-1 hover:text-gray-600 transition-colors" @click="toggleSort('delivery')">
              Due Date
              <ArrowUp v-if="sortColumn === 'delivery' && sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
              <ArrowDown v-else-if="sortColumn === 'delivery' && sortDirection === 'desc'" :size="12" class="text-[#4857FE]" />
            </button>
          </div>

          <div class="divide-y divide-gray-100">
            <div
              v-for="item in filteredStories"
              :key="item.id"
              class="grid grid-cols-[4px_1fr_160px_120px_90px_70px_130px_120px_120px_100px] gap-x-3 items-center px-6 py-3 hover:bg-gray-50/60 transition-colors group cursor-pointer"
              @click="openStoryDetail(item)"
            >
              <!-- Left color border -->
              <div class="h-full w-[3px] rounded-full self-stretch bg-[#4857FE]"></div>

              <!-- Title -->
              <div class="flex items-center gap-2 pl-3 min-w-0">
                <span class="text-sm font-medium text-gray-800 truncate">{{ item.title }}</span>
              </div>

              <!-- Initiative -->
              <div class="min-w-0">
                <span class="text-sm text-gray-600 truncate block" :title="item.initiative || ''">{{ item.initiative || '—' }}</span>
              </div>

              <!-- Type -->
              <div class="flex items-center gap-1.5">
                <component :is="typeIcons[item.type] || Circle" :size="15" :class="typeIconColor(item.type)" />
                <span class="text-sm text-gray-600">{{ typeLabel(item.type) }}</span>
              </div>

              <!-- Tasks -->
              <div class="flex items-center gap-1.5">
                <span class="text-sm text-gray-600">
                  <span class="font-medium text-gray-700">{{ item.tasks.filter(t => t.status === 'done').length }}</span>/<span>{{ item.tasks.length }}</span>
                </span>
              </div>

              <!-- Owner -->
              <div class="flex">
                <img
                  v-if="item.owner"
                  :src="item.ownerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.owner}`"
                  class="w-9 h-9 rounded-full border-2 border-white shadow-sm"
                  :alt="item.owner"
                  :title="item.owner"
                />
                <div v-else class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                  <span class="text-sm text-gray-400">?</span>
                </div>
              </div>

              <!-- Status Badge -->
              <div>
                <span
                  class="inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold min-w-[90px] justify-center shadow-sm"
                  :class="statusStyle(item.status)"
                >
                  {{ statusLabel(item.status) }}
                </span>
              </div>

              <!-- Priority -->
              <div>
                <span
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold"
                  :class="priorityStyle(item.priority)"
                >
                  <span class="w-2 h-2 rounded-full shrink-0" :class="priorityDotStyle(item.priority)"></span>
                  {{ priorityLabel(item.priority) }}
                </span>
              </div>

              <!-- Created (read-only) -->
              <div>
                <p class="text-sm text-gray-700">{{ formatDate(item.createdAt) }}</p>
                <p class="text-xs text-gray-400">{{ daysAgo(item.createdAt) }}</p>
              </div>

              <!-- Due Date -->
              <div>
                <span class="text-sm text-gray-600">{{ item.delivery ? formatDate(item.delivery) : '—' }}</span>
              </div>
            </div>
          </div>

          <div v-if="!backlogStore.loading && filteredStories.length === 0" class="text-center py-12">
            <p class="text-gray-400 text-sm">{{ searchQuery ? 'No stories match your search.' : 'No stories in the backlog yet.' }}</p>
            <button
              v-if="!searchQuery"
              @click="showAddDialog = true"
              class="mt-2 text-sm text-[#4857FE] font-medium hover:underline"
            >
              Add your first story
            </button>
          </div>
        </div>

        <!-- ===== CARD VIEW ===== -->
        <div v-else-if="viewMode === 'card'" class="pt-5">
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            <div
              v-for="item in filteredStories"
              :key="item.id"
              class="bg-white rounded-xl border border-gray-200/80 hover:shadow-lg hover:border-gray-300/80 transition-all duration-200 cursor-pointer group/card relative"
              @click="openStoryDetail(item)"
            >
              <div class="p-5">
                <!-- Row 1: Folder icon + Status badge -->
                <div class="flex items-center justify-between mb-3.5">
                  <div class="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
                    <FolderOpen :size="18" class="text-gray-400" />
                  </div>
                  <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100">
                    <span class="w-2 h-2 rounded-full shrink-0" :class="statusDotColor(item.status)"></span>
                    <span class="text-sm font-medium" :class="statusTextColor(item.status)">{{ statusLabel(item.status) }}</span>
                  </div>
                </div>

                <!-- Row 2: Title -->
                <div class="mb-1.5">
                  <h4 class="text-base font-semibold text-gray-900 line-clamp-2 leading-snug group-hover/card:text-[#4857FE] transition-colors">{{ item.title }}</h4>
                </div>

                <!-- Row 3: Description -->
                <p v-if="item.description" class="text-sm text-gray-500 line-clamp-2 mb-4 leading-relaxed">{{ item.description }}</p>
                <p v-else class="text-sm text-gray-400 italic mb-4">No description</p>

                <!-- Row 4: Product/Initiative info + Type -->
                <div class="flex items-center gap-2 mb-3">
                  <div class="flex items-center gap-1.5 text-gray-500">
                    <Settings2 :size="14" class="text-gray-400" />
                    <span class="text-sm">{{ item.initiative || item.product }}</span>
                  </div>
                  <span v-if="item.type" class="inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded-md" :class="typeBadgeStyle(item.type)">
                    <component :is="typeIcons[item.type] || Circle" :size="12" />
                    {{ typeLabel(item.type) }}
                  </span>
                </div>

                <!-- Row 5: Date + Priority -->
                <div class="flex items-center gap-4 mb-4">
                  <div class="flex items-center gap-1.5 text-gray-500">
                    <Flag :size="14" class="text-gray-400" />
                    <span class="text-sm">{{ item.delivery ? formatDate(item.delivery) : 'No date' }}</span>
                  </div>
                  <span
                    class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-semibold"
                    :class="priorityStyle(item.priority)"
                  >
                    <span class="w-2 h-2 rounded-full shrink-0" :class="priorityDotStyle(item.priority)"></span>
                    {{ priorityLabel(item.priority) }}
                  </span>
                </div>

                <!-- Row 6: Footer - Progress donut + Tasks + Owner -->
                <div class="flex items-center justify-between pt-3.5 border-t border-gray-100">
                  <div class="flex items-center gap-4">
                    <!-- Progress donut -->
                    <div class="flex items-center gap-1.5">
                      <svg width="22" height="22" viewBox="0 0 36 36" class="shrink-0">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" stroke-width="3.5" />
                        <circle
                          cx="18" cy="18" r="15" fill="none"
                          stroke="#4857FE" stroke-width="3.5"
                          stroke-linecap="round"
                          :stroke-dasharray="`${taskProgress(item) * 0.942} 94.2`"
                          stroke-dashoffset="23.55"
                          class="transition-all duration-500"
                        />
                      </svg>
                      <span class="text-sm font-semibold text-gray-700">{{ taskProgress(item) }}%</span>
                    </div>

                    <!-- Task count -->
                    <div class="flex items-center gap-1.5 text-gray-500">
                      <ListChecks :size="15" class="text-gray-400" />
                      <span class="text-sm font-medium">{{ item.tasks.filter(t => t.status === 'done').length }}/{{ item.tasks.length }}</span>
                    </div>
                  </div>

                  <!-- Owner avatar -->
                  <div class="shrink-0">
                    <img
                      v-if="item.owner"
                      :src="item.ownerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.owner}`"
                      class="w-7 h-7 rounded-full border-2 border-white shadow-sm"
                      :alt="item.owner"
                      :title="item.owner"
                    />
                    <div v-else class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                      <span class="text-[10px] text-gray-400">?</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="!backlogStore.loading && filteredStories.length === 0" class="text-center py-12">
            <p class="text-gray-400 text-sm">{{ searchQuery ? 'No stories match your search.' : 'No stories in the backlog yet.' }}</p>
            <button
              v-if="!searchQuery"
              @click="showAddDialog = true"
              class="mt-2 text-sm text-[#4857FE] font-medium hover:underline"
            >
              Add your first story
            </button>
          </div>
        </div>
      </div>

      <!-- ========== TASKS TAB ========== -->
      <div v-else-if="activeTab === 'Tasks'" class="bg-white rounded-xl border border-gray-100 min-h-[300px]">
        <!-- Table Header Bar -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 class="text-sm font-semibold text-[#4857FE]">Tasks</h3>
          <p class="text-sm text-gray-400">
            {{ allTasks.length }} tasks across all stories
          </p>
        </div>

        <!-- Loading state -->
        <div v-if="backlogStore.loading && !backlogStore.stories.length" class="flex items-center justify-center py-12">
          <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
          <span class="ml-2 text-sm text-gray-500">Loading tasks...</span>
        </div>

        <!-- Tasks Table -->
        <div v-else>
          <!-- Section Group Header -->
          <div class="flex items-center justify-between px-6 py-3 border-b border-gray-100">
            <h4 class="text-base font-semibold text-[#4857FE]">All tasks</h4>
          </div>

          <!-- Column Headers -->
          <div class="grid grid-cols-[4px_1fr_90px_120px_120px_80px_140px_100px_80px] gap-x-2 items-center px-6 py-2.5 border-b border-gray-200 text-xs font-medium text-gray-400 tracking-wide">
            <span></span>
            <span class="pl-2">Task</span>
            <span>Assignees</span>
            <span>Priority</span>
            <span>Status</span>
            <span class="text-center">Estimate</span>
            <span>Parent Story</span>
            <span>Due Date</span>
            <span class="text-center">Created</span>
          </div>

          <div class="divide-y divide-gray-100">
            <div
              v-for="task in allTasks"
              :key="task.id"
              class="grid grid-cols-[4px_1fr_90px_120px_120px_80px_140px_100px_80px] gap-x-2 items-center px-6 py-3.5 hover:bg-gray-50/60 transition-colors group cursor-pointer"
              @click="openTaskDetail(task)"
            >
              <!-- Left color border -->
              <div class="h-full w-[3px] rounded-full self-stretch bg-[#4857FE]"></div>

              <!-- Task title with status icon + blocked indicator -->
              <div class="flex items-center gap-2 pl-3 min-w-0">
                <button
                  @click.stop="cycleTaskStatus(task.id, task.status)"
                  class="shrink-0"
                  :title="`Status: ${statusLabel(task.status)} (click to cycle)`"
                >
                  <CheckCircle2 v-if="task.status === 'done'" :size="16" class="text-green-500" />
                  <Loader2 v-else-if="task.status === 'in_progress'" :size="16" class="text-blue-500" />
                  <Circle v-else-if="task.status === 'in_review'" :size="16" class="text-amber-500" />
                  <Circle v-else-if="task.status === 'assigned'" :size="16" class="text-[#a25ddc]" />
                  <Circle v-else :size="16" class="text-gray-300" />
                </button>
                <span
                  class="text-sm truncate"
                  :class="task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'"
                >
                  {{ task.title }}
                </span>
                <AlertTriangle
                  v-if="task.blockedReason"
                  :size="14"
                  class="text-red-500 shrink-0"
                  :title="`Blocked: ${task.blockedReason}`"
                />
              </div>

              <!-- Assignees (multiple avatars) -->
              <div class="flex items-center -space-x-1.5">
                <template v-if="task.assigneeUserIds && task.assigneeUserIds.length > 0">
                  <img
                    v-for="uid in task.assigneeUserIds.slice(0, 3)"
                    :key="uid"
                    :src="`https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`"
                    class="w-7 h-7 rounded-full border-2 border-white shadow-sm"
                    :title="uid"
                  />
                  <div
                    v-if="task.assigneeUserIds.length > 3"
                    class="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] font-medium text-gray-500"
                  >
                    +{{ task.assigneeUserIds.length - 3 }}
                  </div>
                </template>
                <div v-else class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                  <span class="text-xs text-gray-400">?</span>
                </div>
              </div>

              <!-- Priority badge -->
              <div>
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  :class="priorityStyle(task.priority)"
                >
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="priorityDotStyle(task.priority)"></span>
                  {{ priorityLabel(task.priority) }}
                </span>
              </div>

              <!-- Status badge -->
              <div>
                <span
                  class="inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold min-w-[90px] justify-center shadow-sm"
                  :class="statusStyle(task.status)"
                >
                  {{ statusLabel(task.status) }}
                </span>
              </div>

              <!-- Estimate (hours) -->
              <div class="text-center">
                <span v-if="task.estimateValue" class="text-sm text-gray-600 flex items-center justify-center gap-1">
                  <Clock :size="12" class="text-gray-400" />
                  {{ task.estimateValue }}h
                </span>
                <span v-else class="text-sm text-gray-400">—</span>
              </div>

              <!-- Parent story -->
              <div>
                <span class="text-xs text-gray-500 truncate block">{{ task.storyTitle }}</span>
              </div>

              <!-- Due Date -->
              <div>
                <span class="text-sm text-gray-600">{{ task.dueAt ? formatDate(task.dueAt) : '—' }}</span>
              </div>

              <!-- Created date + delete -->
              <div class="flex items-center justify-center gap-2">
                <span class="text-xs text-gray-500">{{ formatDate(task.createdAt) }}</span>
                <button
                  @click.stop="backlogStore.deleteTask(task.id)"
                  class="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                  title="Delete task"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="allTasks.length === 0" class="text-center py-12">
            <p class="text-gray-400 text-sm">No tasks yet. Add tasks from the Stories tab.</p>
            <button
              @click="activeTab = 'Stories'"
              class="mt-2 text-sm text-[#4857FE] font-medium hover:underline"
            >
              Go to Stories
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Add Story Dialog -->
    <AddStoryDialog v-model:open="showAddDialog" />

    <!-- Create Task Dialog -->
    <Dialog v-model:open="showCreateTaskDialog">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <form @submit.prevent="handleCreateTask" class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <!-- Select parent story -->
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1.5 block">Parent Story</label>
            <select
              v-model="newTaskStoryId"
              class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] transition-colors"
            >
              <option value="" disabled>Select a story...</option>
              <option v-for="item in backlogStore.stories" :key="item.id" :value="item.id">
                {{ item.title }}
              </option>
            </select>
          </div>

          <!-- Task title -->
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1.5 block">Task Title</label>
            <input
              v-model="newTaskTitle"
              type="text"
              placeholder="Enter task title..."
              class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] placeholder:text-gray-400 transition-colors"
              :disabled="creatingTask"
            />
          </div>

          <!-- Priority + Type -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm font-medium text-gray-700 mb-1.5 block">Priority</label>
              <select
                v-model="newTaskPriority"
                class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] transition-colors"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 mb-1.5 block">Type</label>
              <select
                v-model="newTaskType"
                class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] transition-colors"
              >
                <option value="">None</option>
                <option value="design">Design</option>
                <option value="development">Development</option>
                <option value="testing">Testing</option>
                <option value="review">Review</option>
                <option value="research">Research</option>
                <option value="fix">Fix</option>
                <option value="documentation">Documentation</option>
                <option value="deployment">Deployment</option>
              </select>
            </div>
          </div>

          <!-- Assignees (multi-select user search) -->
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1.5 block">Assignees</label>
            <!-- Selected assignees -->
            <div v-if="selectedTaskAssignees.length > 0" class="flex flex-wrap gap-1.5 mb-2">
              <div
                v-for="user in selectedTaskAssignees"
                :key="user.id"
                class="flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-2 py-0.5"
              >
                <img
                  :src="user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`"
                  class="w-5 h-5 rounded-full"
                  :alt="user.name"
                />
                <span class="text-xs font-medium text-gray-700">{{ user.name }}</span>
                <button type="button" @click="removeTaskAssignee(user.id)" class="text-gray-400 hover:text-red-500">
                  <X :size="12" />
                </button>
              </div>
            </div>
            <!-- Search input -->
            <div class="relative">
              <input
                v-model="taskAssigneeSearch"
                type="text"
                placeholder="Search users to assign..."
                class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] placeholder:text-gray-400 transition-colors"
                @input="onTaskAssigneeInput"
                @focus="showTaskAssigneeDropdown = true; searchTaskAssignees(taskAssigneeSearch)"
                @blur="onTaskAssigneeBlur"
              />
              <div
                v-if="showTaskAssigneeDropdown && (taskAssigneeResults.length > 0 || taskAssigneeLoading)"
                class="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-[180px] overflow-y-auto py-1"
              >
                <div v-if="taskAssigneeLoading" class="px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
                  <Loader2 :size="14" class="animate-spin" /> Searching...
                </div>
                <button
                  v-for="user in taskAssigneeResults"
                  :key="user.id"
                  type="button"
                  class="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left"
                  :class="selectedTaskAssignees.find(u => u.id === user.id) ? 'opacity-50' : ''"
                  @mousedown.prevent="addTaskAssignee(user)"
                >
                  <img
                    :src="user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`"
                    class="w-6 h-6 rounded-full border border-gray-200"
                    :alt="user.name"
                  />
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-800 truncate">{{ user.name }}</p>
                    <p class="text-xs text-gray-400 truncate">{{ user.email }}</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Estimate + Due Date -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-sm font-medium text-gray-700 mb-1.5 block">Estimate (hours)</label>
              <input
                v-model="newTaskEstimate"
                type="number"
                min="0"
                placeholder="e.g. 8"
                class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] placeholder:text-gray-400 transition-colors"
                :disabled="creatingTask"
              />
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700 mb-1.5 block">Due Date</label>
              <input
                v-model="newTaskDueAt"
                type="date"
                class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] transition-colors"
                :disabled="creatingTask"
              />
            </div>
          </div>

          <!-- Dependent task -->
          <div v-if="newTaskStoryId">
            <label class="text-sm font-medium text-gray-700 mb-1.5 block">Depends On</label>
            <select
              v-model="newTaskDependent"
              class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] transition-colors"
            >
              <option value="">None</option>
              <option
                v-for="t in (backlogStore.stories.find(i => i.id === newTaskStoryId)?.tasks || [])"
                :key="t.id"
                :value="t.id"
              >
                {{ t.title }}
              </option>
            </select>
          </div>

          <!-- Blocked reason -->
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1.5 block">Blocked Reason</label>
            <textarea
              v-model="newTaskBlockedReason"
              placeholder="Why is this task blocked? (optional)"
              rows="2"
              class="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] placeholder:text-gray-400 transition-colors resize-none"
              :disabled="creatingTask"
            ></textarea>
          </div>

          <!-- Submit -->
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              @click="showCreateTaskDialog = false"
              class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="!newTaskStoryId || !newTaskTitle.trim() || creatingTask"
              class="px-4 py-2 text-sm font-medium text-white bg-[#4857FE] hover:bg-[#3E4BDE] rounded-lg transition-colors disabled:opacity-50"
            >
              {{ creatingTask ? 'Creating...' : 'Create Task' }}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Task Detail Side Panel -->
    <TaskDetailPanel
      :task="selectedTask"
      :open="showTaskPanel"
      :team-members="teamMembers"
      @close="closeTaskPanel"
      @updated="onTaskUpdated"
    />

    <!-- Story Detail Side Panel -->
    <StoryDetailPanel
      :story="selectedStory"
      :open="showStoryPanel"
      :team-members="teamMembers"
      @close="closeStoryPanel"
      @updated="onStoryUpdated"
    />
  </div>
</template>
