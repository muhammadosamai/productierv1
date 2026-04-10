<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {
  Loader2, Search, ListChecks, Circle, CheckCircle2,
  ChevronRight, Plus, LayoutList, LayoutGrid,
  ArrowUp, ArrowDown, SlidersHorizontal, Clock,
  GripVertical, Check, RotateCcw,
  Signal, FileText, Type, Tag, CalendarClock, Link,
  Users, User, UserCheck, ShieldAlert, Hourglass, Archive, RotateCw, Trash2, X, MessageSquare, Paperclip, ListTree,
  PencilLine, FolderOpen, Palette, Code2, TestTube2, Eye, FlaskConical, Wrench, Rocket,
  Columns3Cog,
} from 'lucide-vue-next'
import { useBacklogStore } from '@/stores/backlog'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'
import type { Activity } from '@/stores/activities'
import FavoriteStar from '@/components/shared/FavoriteStar.vue'
import TaskDetailPanel from '@/components/delivery/TaskDetailPanel.vue'
import TaskStatusIcon from '@/components/shared/TaskStatusIcon.vue'
import CreateTaskDialog from '@/components/delivery/CreateTaskDialog.vue'
import FormBuilderDialog from '@/components/forms/FormBuilderDialog.vue'
import type { Task } from '@/types/backlog'

interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

const route = useRoute()
const backlogStore = useBacklogStore()
const productStore = useProductStore()
const authStore = useAuthStore()
const rolesStore = useRolesStore()

const searchQuery = ref('')
const activeTab = ref<'all' | 'created' | 'assigned' | 'in_progress' | 'in_review' | 'done' | 'overdue' | 'blocked' | 'archived'>('all')
const viewMode = ref<'table' | 'card'>(localStorage.getItem('tasks-view-mode') as 'table' | 'card' || 'table')
const showCreateDialog = ref(false)
const showFormBuilder = ref(false)

// Save view mode to API + localStorage
watch(viewMode, (v) => {
  localStorage.setItem('tasks-view-mode', v)
  saveUserSetting('tasks-view-mode', v)
})

// Detail panel state
const selectedTask = ref<Task | null>(null)
const showTaskPanel = ref(false)
const teamMembers = ref<TeamUser[]>([])
const fromStoryId = ref<string | null>(null)

// Inline editing state
const inlineEditMode = ref(false)
const editingCell = ref<{ id: string; field: string } | null>(null)
const editValue = ref('')
const inlineOwnerSearch = ref('')

const taskStatusOptions = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'overdue', 'blocked', 'archived'] as const
const taskPriorityOptions = ['high', 'medium', 'low'] as const
const taskTypeOptions = ['design', 'development', 'testing', 'review', 'research', 'fix', 'documentation', 'deployment'] as const

const taskEditableFields = new Set(['title', 'status', 'priority', 'type', 'owner', 'assignees', 'reviewers', 'estimate', 'dueAt', 'blockedReason'])

function isEditing(id: string, field: string) {
  return editingCell.value?.id === id && editingCell.value?.field === field
}

function startTaskEditing(id: string, field: string, currentValue: string, event?: MouseEvent) {
  if (!inlineEditMode.value || !taskEditableFields.has(field)) return
  if (event) event.stopPropagation()
  editingCell.value = { id, field }
  editValue.value = currentValue || ''
  inlineOwnerSearch.value = ''
  nextTick(() => {
    const input = document.querySelector('.inline-edit-input') as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

async function saveTaskInlineEdit(id: string, field: string, value: any) {
  const prev = editingCell.value
  editingCell.value = null
  if (prev && prev.id === id && prev.field === field) {
    await backlogStore.updateTask(id, { [field]: value })
  }
}

async function saveTaskOwnerInline(id: string, member: TeamUser | null) {
  editingCell.value = null
  await backlogStore.updateTask(id, { ownerUserId: member?.id || null })
}

async function saveTaskAssigneesToggle(id: string, currentIds: string[] | null, userId: string) {
  const current = currentIds || []
  const newIds = current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]
  await backlogStore.updateTask(id, { assigneeUserIds: newIds.length > 0 ? newIds : null })
}

async function saveTaskReviewersToggle(id: string, currentIds: string[] | null, userId: string) {
  const current = currentIds || []
  const newIds = current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]
  await backlogStore.updateTask(id, { reviewerUserIds: newIds.length > 0 ? newIds : null })
}

function cancelTaskEdit() {
  editingCell.value = null
  editValue.value = ''
}

const filteredInlineMembers = computed(() => {
  const q = inlineOwnerSearch.value.toLowerCase()
  if (!q) return teamMembers.value
  return teamMembers.value.filter(m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
})

function onTaskEditClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.inline-edit-dropdown') && !target.closest('.inline-edit-cell')) {
    cancelTaskEdit()
  }
}

watch(editingCell, (v) => {
  if (v) {
    setTimeout(() => document.addEventListener('click', onTaskEditClickOutside), 0)
  } else {
    document.removeEventListener('click', onTaskEditClickOutside)
  }
})

function taskTypeIcon(type: string | null) {
  switch (type) {
    case 'design': return Palette
    case 'development': return Code2
    case 'testing': return TestTube2
    case 'review': return Eye
    case 'research': return FlaskConical
    case 'fix': return Wrench
    case 'documentation': return FileText
    case 'deployment': return Rocket
    default: return FolderOpen
  }
}

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
  selectedTask.value = null
  fromStoryId.value = null
}

async function onTaskUpdated() {
  await backlogStore.fetchStories()
  if (selectedTask.value) {
    const fresh = backlogStore.allTasks.find(t => t.id === selectedTask.value!.id)
    if (fresh) {
      selectedTask.value = fresh
    }
  }
}

function onTaskCreated() {
  backlogStore.fetchStories()
}

onMounted(async () => {
  await backlogStore.fetchStories()
  fetchTeamMembers()
  loadUserSettings()
  // Auto-open task from query param
  const taskId = route.query.task as string | undefined
  if (taskId) {
    const task = backlogStore.allTasks.find(t => t.id === taskId)
    if (task) {
      openTaskDetail(task)
      // Set fromStoryId if navigated from a story
      fromStoryId.value = (route.query.fromStory as string) || null
    }
  }
})

watch(() => productStore.activeProductName, () => {
  backlogStore.fetchStories()
  fetchTeamMembers()
})

// Watch for query param changes
watch(() => route.query.task, (taskId) => {
  if (taskId) {
    const task = backlogStore.allTasks.find(t => t.id === taskId as string)
    if (task) {
      openTaskDetail(task)
      fromStoryId.value = (route.query.fromStory as string) || null
    }
  }
})

// Status-filtered task groups
const tasksByStatus = computed(() => {
  let base = backlogStore.allTasks
  // Self-view-only: show only tasks where user is owner, assignee, or reviewer
  if (rolesStore.isSelfViewOnly('tasks') && authStore.user) {
    const uid = authStore.user.id
    base = base.filter(t =>
      t.ownerUserId === uid ||
      t.assigneeUserIds?.includes(uid) ||
      t.reviewerUserIds?.includes(uid) ||
      t.createdByUserId === uid
    )
  }
  const all = base.filter(t => t.status !== 'archived')
  return {
    all,
    created: all.filter(t => t.status === 'created'),
    assigned: all.filter(t => t.status === 'assigned'),
    in_progress: all.filter(t => t.status === 'in_progress'),
    in_review: all.filter(t => t.status === 'in_review'),
    done: all.filter(t => t.status === 'done'),
    overdue: all.filter(t => t.status === 'overdue'),
    blocked: all.filter(t => t.status === 'blocked'),
    archived: base.filter(t => t.status === 'archived'),
  }
})

const filteredTasks = computed(() => {
  const list = tasksByStatus.value[activeTab.value]
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return list
  return list.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.description && t.description.toLowerCase().includes(q)) ||
    t.status.toLowerCase().includes(q) ||
    (t as any).storyTitle?.toLowerCase().includes(q)
  )
})

// Sorting
type SortField = 'title' | 'status' | 'priority' | 'type' | 'story' | 'owner' | 'assignees' | 'reviewers' | 'estimate' | 'dueAt' | 'description' | 'createdBy' | 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt' | 'dependent' | 'blockedReason' | 'comments' | 'attachments'
const sortField = ref<SortField | null>(null)
const sortDirection = ref<'asc' | 'desc'>('asc')

function toggleSort(field: SortField) {
  if (sortField.value === field) {
    if (sortDirection.value === 'asc') {
      sortDirection.value = 'desc'
    } else {
      // Third click: clear sort
      sortField.value = null
      sortDirection.value = 'asc'
    }
  } else {
    sortField.value = field
    sortDirection.value = 'asc'
  }
}

const statusOrder: Record<string, number> = { created: 0, assigned: 1, in_progress: 2, in_review: 3, done: 4, overdue: 5, blocked: 6 }
const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
const typeOrder: Record<string, number> = { design: 0, development: 1, testing: 2, review: 3, research: 4, fix: 5, documentation: 6, deployment: 7 }

function compareStr(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '').localeCompare(b || '')
}
function compareDate(a: string | null | undefined, b: string | null | undefined): number {
  const da = a ? new Date(a).getTime() : 0
  const db = b ? new Date(b).getTime() : 0
  return da - db
}
function compareUserName(id: string | null | undefined): string {
  if (!id) return ''
  return getUserById(id)?.name || ''
}

const sortedTasks = computed(() => {
  const list = [...filteredTasks.value]
  if (!sortField.value) {
    // Default stable sort by createdAt so rows don't jump on edit
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }

  const field = sortField.value
  const dir = sortDirection.value === 'asc' ? 1 : -1

  list.sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'title':
        cmp = a.title.localeCompare(b.title)
        break
      case 'status':
        cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
        break
      case 'priority':
        cmp = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99)
        break
      case 'type':
        cmp = (typeOrder[a.type || ''] ?? 99) - (typeOrder[b.type || ''] ?? 99)
        break
      case 'story':
        cmp = compareStr((a as any).storyTitle, (b as any).storyTitle)
        break
      case 'owner':
        cmp = compareStr(compareUserName(a.ownerUserId), compareUserName(b.ownerUserId))
        break
      case 'assignees':
        cmp = (a.assigneeUserIds?.length || 0) - (b.assigneeUserIds?.length || 0)
        break
      case 'reviewers':
        cmp = (a.reviewerUserIds?.length || 0) - (b.reviewerUserIds?.length || 0)
        break
      case 'estimate':
        cmp = (a.estimateValue || 0) - (b.estimateValue || 0)
        break
      case 'dueAt':
        cmp = compareDate(a.dueAt, b.dueAt)
        break
      case 'description':
        cmp = compareStr(a.description, b.description)
        break
      case 'createdBy':
        cmp = compareStr(compareUserName(a.createdByUserId), compareUserName(b.createdByUserId))
        break
      case 'createdAt':
        cmp = compareDate(a.createdAt, b.createdAt)
        break
      case 'updatedAt':
        cmp = compareDate(a.updatedAt, b.updatedAt)
        break
      case 'startedAt':
        cmp = compareDate(a.startedAt, b.startedAt)
        break
      case 'completedAt':
        cmp = compareDate(a.completedAt, b.completedAt)
        break
      case 'dependent':
        cmp = (a.dependent?.length || 0) - (b.dependent?.length || 0)
        break
      case 'blockedReason':
        cmp = compareStr(a.blockedReason, b.blockedReason)
        break
      case 'comments':
        cmp = (a.comments?.length || 0) - (b.comments?.length || 0)
        break
      case 'attachments':
        cmp = (a.attachments?.length || 0) - (b.attachments?.length || 0)
        break
    }
    return cmp * dir
  })
  return list
})

// Column customization
interface ColumnConfig {
  field: SortField
  label: string
  width: string
  visible: boolean
}

const defaultColumns: ColumnConfig[] = [
  { field: 'title', label: 'Title', width: '1fr', visible: true },
  { field: 'status', label: 'Status', width: '120px', visible: true },
  { field: 'priority', label: 'Priority', width: '100px', visible: true },
  { field: 'type', label: 'Type', width: '110px', visible: false },
  { field: 'story', label: 'Story', width: '160px', visible: true },
  { field: 'owner', label: 'Owner', width: '140px', visible: false },
  { field: 'assignees', label: 'Assignees', width: '160px', visible: true },
  { field: 'reviewers', label: 'Reviewers', width: '160px', visible: false },
  { field: 'estimate', label: 'Estimate', width: '90px', visible: false },
  { field: 'dueAt', label: 'Due Date', width: '110px', visible: false },
  { field: 'description', label: 'Description', width: '200px', visible: false },
  { field: 'createdBy', label: 'Created By', width: '140px', visible: false },
  { field: 'comments', label: 'Comments', width: '80px', visible: true },
  { field: 'attachments', label: 'Files', width: '70px', visible: true },
  { field: 'dependent', label: 'Deps', width: '70px', visible: true },
  { field: 'createdAt', label: 'Created', width: '100px', visible: true },
  { field: 'updatedAt', label: 'Updated', width: '100px', visible: false },
  { field: 'startedAt', label: 'Started', width: '100px', visible: false },
  { field: 'completedAt', label: 'Completed', width: '100px', visible: false },
  { field: 'blockedReason', label: 'Blocked Reason', width: '160px', visible: false },
]

function mergeWithDefaults(saved: ColumnConfig[]): ColumnConfig[] {
  const knownFields = new Set(saved.map(c => c.field))
  const merged = [...saved]
  for (const def of defaultColumns) {
    if (!knownFields.has(def.field)) merged.push({ ...def })
  }
  return merged
}

function loadColumnConfig(): ColumnConfig[] {
  try {
    const saved = localStorage.getItem('tasks-column-config')
    if (saved) return mergeWithDefaults(JSON.parse(saved) as ColumnConfig[])
  } catch { /* ignore */ }
  return defaultColumns.map(c => ({ ...c }))
}

const columns = ref<ColumnConfig[]>(loadColumnConfig())
const showColumnCustomizer = ref(false)

// Debounced save to API
let saveTimeout: ReturnType<typeof setTimeout> | null = null
function saveUserSetting(key: string, value: any) {
  if (!authStore.token) return
  // Debounce API calls
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    try {
      await fetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({ value }),
      })
    } catch { /* silently fail, localStorage is the fallback */ }
  }, 500)
}

watch(columns, (v) => {
  localStorage.setItem('tasks-column-config', JSON.stringify(v))
  saveUserSetting('tasks-column-config', v)
}, { deep: true })

// Load user settings from API on mount (overrides localStorage if available)
async function loadUserSettings() {
  if (!authStore.token) return
  try {
    const res = await fetch('/api/settings/', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (!res.ok) return
    const settings = await res.json()

    if (settings['tasks-column-config']) {
      const serverCols = mergeWithDefaults(settings['tasks-column-config'] as ColumnConfig[])
      columns.value = serverCols
      localStorage.setItem('tasks-column-config', JSON.stringify(serverCols))
    }

    if (settings['tasks-view-mode']) {
      viewMode.value = settings['tasks-view-mode'] as 'table' | 'card'
      localStorage.setItem('tasks-view-mode', settings['tasks-view-mode'])
    }

    if (settings['tasks-column-widths']) {
      const serverWidths = settings['tasks-column-widths'] as Record<string, number>
      for (const [k, v] of Object.entries(serverWidths)) {
        if (typeof v === 'number' && v >= 60) columnWidths[k] = v
      }
      localStorage.setItem('tasks-column-widths', JSON.stringify({ ...columnWidths }))
    }
  } catch { /* fall back to localStorage */ }
}

const visibleColumns = computed(() => columns.value.filter(c => c.visible))

const gridTemplateCols = computed(() =>
  visibleColumns.value.map(c => (columnWidths[c.field] || parseDefaultWidth(c.width)) + 'px').join(' ')
)

const minTableWidth = computed(() => {
  let total = 48 // px-6 padding (24px each side)
  for (const col of visibleColumns.value) {
    total += columnWidths[col.field] || parseDefaultWidth(col.width)
  }
  return total
})

function toggleColumnVisibility(field: SortField) {
  const col = columns.value.find(c => c.field === field)
  if (!col) return
  // Don't allow hiding Title column
  if (field === 'title') return
  // Don't allow hiding all columns
  const visibleCount = columns.value.filter(c => c.visible).length
  if (col.visible && visibleCount <= 2) return
  col.visible = !col.visible
}

function resetColumns() {
  columns.value = defaultColumns.map(c => ({ ...c }))
  // Also reset column widths
  for (const col of defaultColumns) {
    columnWidths[col.field] = parseDefaultWidth(col.width)
  }
  localStorage.removeItem('tasks-column-widths')
}

// --- Column resize ---
function parseDefaultWidth(w: string): number {
  if (w.endsWith('px')) return parseInt(w)
  return 200 // default for 1fr
}

function loadColumnWidths(): Record<string, number> {
  const widths: Record<string, number> = {}
  for (const col of defaultColumns) {
    widths[col.field] = parseDefaultWidth(col.width)
  }
  try {
    const saved = localStorage.getItem('tasks-column-widths')
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, number>
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && v >= 60) widths[k] = v
      }
    }
  } catch { /* ignore */ }
  return widths
}

const columnWidths = reactive<Record<string, number>>(loadColumnWidths())

// Resize drag state
const resizingCol = ref<string | null>(null)
let resizeStartX = 0
let resizeStartWidth = 0

function onResizeStart(field: string, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  resizingCol.value = field
  resizeStartX = e.clientX
  resizeStartWidth = columnWidths[field] || 100
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e: MouseEvent) {
  if (!resizingCol.value) return
  const delta = e.clientX - resizeStartX
  const newWidth = Math.max(60, resizeStartWidth + delta)
  columnWidths[resizingCol.value] = newWidth
}

function onResizeEnd() {
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  resizingCol.value = null
  // Persist
  localStorage.setItem('tasks-column-widths', JSON.stringify({ ...columnWidths }))
  saveUserSetting('tasks-column-widths', { ...columnWidths })
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})

// Drag-and-drop reordering
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(idx: number, event: DragEvent) {
  dragIndex.value = idx
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(idx))
  }
}

function onDragOver(idx: number, event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = idx
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(idx: number) {
  if (dragIndex.value === null || dragIndex.value === idx) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
  const arr = [...columns.value]
  const [moved] = arr.splice(dragIndex.value, 1)
  if (!moved) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
  arr.splice(idx, 0, moved)
  columns.value = arr
  dragIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

// Close customizer on outside click
function onCustomizerClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.column-customizer-container')) {
    showColumnCustomizer.value = false
  }
}

watch(showColumnCustomizer, (v) => {
  if (v) {
    setTimeout(() => document.addEventListener('click', onCustomizerClickOutside), 0)
  } else {
    document.removeEventListener('click', onCustomizerClickOutside)
  }
})

// ===== Archived Tab =====
function toggleArchivedTab() {
  activeTab.value = activeTab.value === 'archived' ? 'all' : 'archived'
}

async function restoreTask(taskId: string) {
  await backlogStore.updateTask(taskId, { status: 'created' })
}

async function deleteTask(taskId: string) {
  if (!confirm('Delete this task? This cannot be undone.')) return
  await backlogStore.deleteTask(taskId)
  if (selectedTask.value?.id === taskId) {
    showTaskPanel.value = false
    selectedTask.value = null
  }
}

// ===== Activity Timeline =====
const showActivityDropdown = ref(false)
const taskActivities = ref<Activity[]>([])
const taskActivitiesLoading = ref(false)

async function fetchTaskActivities() {
  taskActivitiesLoading.value = true
  try {
    const p = productStore.activeProductName
    const res = await fetch(`/api/activities?product=${encodeURIComponent(p)}&entityType=task&limit=50`)
    if (res.ok) {
      taskActivities.value = await res.json()
    }
  } catch (e) {
    console.error('Failed to fetch task activities:', e)
  } finally {
    taskActivitiesLoading.value = false
  }
}

function toggleActivityDropdown() {
  showActivityDropdown.value = !showActivityDropdown.value
  if (showActivityDropdown.value) {
    fetchTaskActivities()
  }
}

function onActivityClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.activity-dropdown-container')) {
    showActivityDropdown.value = false
  }
}

watch(showActivityDropdown, (v) => {
  if (v) {
    setTimeout(() => document.addEventListener('click', onActivityClickOutside), 0)
  } else {
    document.removeEventListener('click', onActivityClickOutside)
  }
})



function openTaskFromActivity(entityId: string | null) {
  if (!entityId) return
  const task = backlogStore.allTasks.find(t => t.id === entityId)
  if (task) {
    showActivityDropdown.value = false
    openTaskDetail(task)
  }
}

function activityTimeAgo(dateStr: string) {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function activityActionColor(action: string) {
  switch (action) {
    case 'created': return 'bg-[#00c875]'
    case 'updated': return 'bg-[#fdab3d]'
    case 'deleted': return 'bg-red-500'
    default: return 'bg-gray-400'
  }
}

function activityFormatField(field: string) {
  return field.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function activityUserInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// Resolve a value that might be a user ID to a display name
function resolveUserValue(value: string | null): string | null {
  if (!value) return null
  // Check if it looks like a UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(value)) {
    const user = getUserById(value)
    return user?.name || value.slice(0, 8)
  }
  return activityFormatField(value)
}

// Check if a field is user-related
function isUserField(field: string): boolean {
  return ['ownerUserId', 'reviewerUserIds', 'assigneeUserIds', 'createdBy'].includes(field)
}

// Get friendly field label
function changeFieldLabel(field: string): string {
  switch (field) {
    case 'ownerUserId': return 'Owner'
    case 'reviewerUserIds': return 'Reviewers'
    case 'assigneeUserIds': return 'Assignees'
    case 'createdBy': return 'Created by'
    case 'blockedReason': return 'Blocked reason'
    case 'estimateValue': return 'Estimate'
    case 'dueAt': return 'Due date'
    case 'dependent': return 'Dependency'
    default: return activityFormatField(field)
  }
}

// Determine change action type: added, removed, or updated
function changeActionType(change: { from: string | null; to: string | null }): 'added' | 'removed' | 'updated' {
  if (!change.from && change.to) return 'added'
  if (change.from && !change.to) return 'removed'
  return 'updated'
}

function changeDotColor(change: { from: string | null; to: string | null }): string {
  const type = changeActionType(change)
  switch (type) {
    case 'added': return 'bg-[#00c875]'
    case 'removed': return 'bg-red-500'
    case 'updated': return 'bg-[#fdab3d]'
  }
}

function changeIconColor(change: { from: string | null; to: string | null }): string {
  const type = changeActionType(change)
  switch (type) {
    case 'added': return 'text-[#00c875]'
    case 'removed': return 'text-red-500'
    case 'updated': return 'text-[#fdab3d]'
  }
}

function changeFieldIcon(field: string) {
  switch (field) {
    case 'status': return Circle
    case 'priority': return Signal
    case 'description': return FileText
    case 'title': return Type
    case 'type': return Tag
    case 'estimateValue': return Hourglass
    case 'dueAt': return CalendarClock
    case 'dependent': return Link
    case 'ownerUserId': return User
    case 'assigneeUserIds': return Users
    case 'reviewerUserIds': return UserCheck
    case 'blockedReason': return ShieldAlert
    default: return Circle
  }
}

// Build a human-readable description for a single change (just the action label, values shown separately)
function changeDescription(change: { field: string; from: string | null; to: string | null }): string {
  const label = changeFieldLabel(change.field)
  const action = changeActionType(change)

  if (isUserField(change.field)) {
    if (action === 'added') return `Added ${label.toLowerCase()}`
    if (action === 'removed') return `Removed ${label.toLowerCase()}`
    return `Updated ${label.toLowerCase()}`
  }

  if (action === 'added') return `Set ${label.toLowerCase()}`
  if (action === 'removed') return `Cleared ${label.toLowerCase()}`
  return `Updated ${label.toLowerCase()}`
}

// Format a change value for display (dates, enums, etc.)
function formatChangeValue(field: string, value: string | null): string {
  if (!value) return '—'
  if (field === 'dueAt') {
    const d = new Date(value)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }
  if (field === 'estimateValue') {
    const n = parseFloat(value)
    if (!isNaN(n)) return `${n}h`
  }
  if (isUserField(field)) return resolveUserValue(value) || value
  return activityFormatField(value)
}

// Resolve display value — show name+avatar for user fields, formatted label for others
function changeDisplayValue(field: string, value: string | null): string {
  if (!value) return '—'
  if (isUserField(field)) return resolveUserValue(value) || value
  return activityFormatField(value)
}

const groupedTaskActivities = computed(() => {
  const groups: { label: string; activities: Activity[] }[] = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000)

  const buckets = new Map<string, Activity[]>()

  for (const activity of taskActivities.value) {
    const d = new Date(activity.createdAt)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    let label: string
    if (day.getTime() >= weekStart.getTime()) {
      label = 'THIS WEEK'
    } else if (day.getTime() >= lastWeekStart.getTime()) {
      label = 'LAST WEEK'
    } else {
      label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
    }
    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label)!.push(activity)
  }

  for (const [label, acts] of buckets) {
    groups.push({ label, activities: acts })
  }
  return groups
})

function getUserById(id: string): TeamUser | undefined {
  return teamMembers.value.find(u => u.id === id)
}

function statusStyle(status: string) {
  switch (status) {
    case 'created': return 'bg-gray-400 text-white'
    case 'assigned': return 'bg-[#a25ddc] text-white'
    case 'in_progress': return 'bg-[#fdab3d] text-white'
    case 'in_review': return 'bg-[#579bfc] text-white'
    case 'done': return 'bg-[#00c875] text-white'
    case 'overdue': return 'bg-red-500 text-white'
    case 'blocked': return 'bg-[#e2445c] text-white'
    case 'archived': return 'bg-gray-400 text-white'
    default: return 'bg-gray-400 text-white'
  }
}

function statusDotColor(status: string) {
  switch (status) {
    case 'created': return 'bg-gray-400'
    case 'assigned': return 'bg-[#a25ddc]'
    case 'in_progress': return 'bg-[#fdab3d]'
    case 'in_review': return 'bg-[#579bfc]'
    case 'done': return 'bg-[#00c875]'
    case 'overdue': return 'bg-red-500'
    case 'blocked': return 'bg-[#e2445c]'
    case 'archived': return 'bg-gray-400'
    default: return 'bg-gray-400'
  }
}

function statusTextColor(status: string) {
  switch (status) {
    case 'created': return 'text-gray-500'
    case 'assigned': return 'text-[#a25ddc]'
    case 'in_progress': return 'text-[#fdab3d]'
    case 'in_review': return 'text-[#579bfc]'
    case 'done': return 'text-[#00c875]'
    case 'overdue': return 'text-red-500'
    case 'blocked': return 'text-[#e2445c]'
    case 'archived': return 'text-gray-400'
    default: return 'text-gray-500'
  }
}

function priorityStyle(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700 border border-red-200'
    case 'medium': return 'bg-green-100 text-green-700 border border-green-200'
    case 'low': return 'bg-blue-100 text-blue-700 border border-blue-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
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

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function typeStyle(type: string | null) {
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

function typeLabel(type: string | null) {
  if (!type) return '—'
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function renderUserAvatar(userId: string | null) {
  if (!userId) return null
  return getUserById(userId)
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 pt-7 pb-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="text-[#4857FE]"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h1 class="text-lg font-semibold text-gray-900">Tasks <span class="text-gray-400 font-normal">({{ backlogStore.allTasks.length }})</span></h1>
        </div>
        <div class="flex items-center gap-3">
          <!-- Create Task -->
          <button
            class="flex items-center gap-1.5 bg-[#4857FE] hover:bg-[#3E4BDE] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            @click="showCreateDialog = true"
          >
            <Plus :size="15" />
            Create Task
          </button>
        </div>
      </div>
    </div>

    <!-- Status Tabs + View Toggle -->
    <div class="bg-white px-8 pt-4 pb-3 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1">
          <!-- All -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'all'
              ? 'text-[#4857FE] border-[#4857FE]'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'all'"
          >
            All
            <span
              class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#4857FE]/15 text-[#4857FE]"
            >{{ tasksByStatus.all.length }}</span>
          </button>
          <!-- Created -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'created'
              ? 'text-gray-600 border-gray-400'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'created'"
          >
            Created
            <span
              class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-gray-200 text-gray-600"
            >{{ tasksByStatus.created.length }}</span>
          </button>
          <!-- Assigned -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'assigned'
              ? 'text-[#a25ddc] border-[#a25ddc]'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'assigned'"
          >
            Assigned
            <span
              class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#a25ddc]/15 text-[#a25ddc]"
            >{{ tasksByStatus.assigned.length }}</span>
          </button>
          <!-- In Progress -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'in_progress'
              ? 'text-[#fdab3d] border-[#fdab3d]'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'in_progress'"
          >
            In Progress
            <span
              class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#fdab3d]/15 text-[#d48806]"
            >{{ tasksByStatus.in_progress.length }}</span>
          </button>
          <!-- In Review -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'in_review'
              ? 'text-[#579bfc] border-[#579bfc]'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'in_review'"
          >
            In Review
            <span
              class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#579bfc]/15 text-[#579bfc]"
            >{{ tasksByStatus.in_review.length }}</span>
          </button>
          <!-- Done -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'done'
              ? 'text-[#00c875] border-[#00c875]'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'done'"
          >
            Done
            <span
              class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#00c875]/15 text-[#00a65a]"
            >{{ tasksByStatus.done.length }}</span>
          </button>
          <!-- Overdue -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'overdue'
              ? 'text-red-500 border-red-500'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'overdue'"
          >
            Overdue
            <span
              class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-red-100 text-red-500"
            >{{ tasksByStatus.overdue.length }}</span>
          </button>
          <!-- Blocked -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'blocked'
              ? 'text-[#e2445c] border-[#e2445c]'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'blocked'"
          >
            Blocked
            <span
              class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#e2445c]/15 text-[#e2445c]"
            >{{ tasksByStatus.blocked.length }}</span>
          </button>
        </div>

        <!-- Search + View Toggle -->
        <div class="flex items-center gap-3">
          <!-- Archived Tasks Tab Toggle -->
          <button
            class="flex items-center gap-1.5 p-1.5 rounded-lg transition-colors cursor-pointer"
            :class="activeTab === 'archived' ? 'bg-[#4857FE]/10 text-[#4857FE]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
            @click="toggleArchivedTab()"
            title="Archived tasks"
          >
            <Archive :size="16" />
            <span v-if="tasksByStatus.archived.length > 0" class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-gray-200 text-gray-500 leading-none">{{ tasksByStatus.archived.length }}</span>
          </button>

          <!-- Activity Timeline Button -->
          <div class="relative activity-dropdown-container">
            <button
              class="flex items-center gap-1.5 p-1.5 rounded-lg transition-colors cursor-pointer"
              :class="showActivityDropdown ? 'bg-[#4857FE]/10 text-[#4857FE]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
              @click.stop="toggleActivityDropdown()"
              title="Activity timeline"
            >
              <Clock :size="16" />
            </button>

            <!-- Activity Dropdown -->
            <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 translate-y-1"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 translate-y-1"
            >
              <div
                v-if="showActivityDropdown"
                class="absolute right-0 top-full mt-2 w-[400px] bg-white rounded-xl border border-gray-200 shadow-2xl z-50 overflow-hidden"
                @click.stop
              >
                <!-- Header -->
                <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <div class="flex items-center gap-2">
                    <Clock :size="16" class="text-gray-400" />
                    <h3 class="text-sm font-semibold text-gray-900">Activity Timeline</h3>
                  </div>
                  <button
                    class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                    @click="fetchTaskActivities()"
                  >Refresh</button>
                </div>

                <!-- Content -->
                <div class="max-h-[480px] overflow-y-auto">
                  <!-- Loading -->
                  <div v-if="taskActivitiesLoading" class="flex items-center justify-center py-16">
                    <Loader2 :size="20" class="animate-spin text-gray-400" />
                  </div>

                  <!-- Empty -->
                  <div v-else-if="taskActivities.length === 0" class="text-center py-16 px-6">
                    <Clock :size="32" class="text-gray-200 mx-auto mb-3" />
                    <p class="text-sm text-gray-400">No activity yet</p>
                    <p class="text-xs text-gray-300 mt-1">Task changes will appear here</p>
                  </div>

                  <!-- Grouped Activities -->
                  <div v-else>
                    <div v-for="group in groupedTaskActivities" :key="group.label">
                      <!-- Date group header -->
                      <div class="px-5 pt-4 pb-2">
                        <span class="text-[11px] font-bold tracking-wider text-[#4857FE]">{{ group.label }}</span>
                      </div>

                      <!-- Activities -->
                      <div class="relative px-5">
                        <!-- Timeline line -->
                        <div class="absolute left-[33px] top-0 bottom-0 w-px bg-gray-100"></div>

                        <div v-for="activity in group.activities" :key="activity.id" class="relative py-3">
                          <div class="flex items-start gap-3">
                            <!-- Avatar with action dot -->
                            <div class="relative shrink-0 z-10">
                              <div class="w-8 h-8 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden ring-2 ring-white">
                                <UploadAssetImg
                                  v-if="activity.userAvatar"
                                  :src="activity.userAvatar"
                                  class="w-8 h-8 rounded-full object-cover"
                                  :alt="activity.userName"
                                />
                                <span v-else>{{ activityUserInitials(activity.userName) }}</span>
                              </div>
                              <!-- Action dot -->
                              <div
                                class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                                :class="activityActionColor(activity.action)"
                              ></div>
                            </div>

                            <!-- Content -->
                            <div class="flex-1 min-w-0">
                              <!-- Row 1: User name (left) + Time (right) -->
                              <div class="flex items-center justify-between">
                                <span class="text-sm font-semibold text-gray-900">{{ activity.userName }}</span>
                                <span class="text-[11px] text-gray-400 shrink-0 ml-2">{{ activityTimeAgo(activity.createdAt) }}</span>
                              </div>

                              <!-- Row 2: Clickable task title with icon -->
                              <button
                                class="flex items-center gap-1.5 mt-0.5 cursor-pointer text-left max-w-full group/task"
                                @click="openTaskFromActivity(activity.entityId)"
                              >
                                <ListChecks :size="13" class="text-[#4857FE]/60 shrink-0" />
                                <span class="text-sm font-medium text-[#4857FE] group-hover/task:text-[#3E4BDE] truncate">{{ activity.entityTitle }}</span>
                              </button>

                              <!-- Row 3: Action box — always visible -->
                              <div class="mt-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                <!-- Created — simple label -->
                                <div v-if="activity.action === 'created'" class="flex items-center gap-2">
                                  <span class="w-1.5 h-1.5 rounded-full bg-[#00c875] shrink-0"></span>
                                  <span class="text-xs font-medium text-gray-600">Task created</span>
                                </div>
                                <!-- Deleted — simple label -->
                                <div v-else-if="activity.action === 'deleted'" class="flex items-center gap-2">
                                  <span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                                  <span class="text-xs font-medium text-gray-600">Task deleted</span>
                                </div>
                                <!-- Updated — descriptive change lines -->
                                <div v-else-if="activity.changes && activity.changes.length > 0" class="space-y-2">
                                  <div v-for="(change, ci) in activity.changes" :key="ci" class="flex items-start gap-2">
                                    <component :is="changeFieldIcon(change.field)" :size="12" class="shrink-0 mt-0.5" :class="changeIconColor(change)" />
                                    <div class="text-xs text-gray-600 min-w-0">
                                      <span class="font-medium">{{ changeDescription(change) }}</span>

                                      <!-- Status: colored pill badges from → to -->
                                      <template v-if="change.field === 'status'">
                                        <span
                                          v-if="change.from"
                                          class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ml-1 align-middle"
                                          :class="statusStyle(change.from)"
                                        >{{ activityFormatField(change.from) }}</span>
                                        <span v-if="change.from && change.to" class="text-gray-300 mx-0.5 align-middle">→</span>
                                        <span
                                          v-if="change.to"
                                          class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold align-middle"
                                          :class="statusStyle(change.to)"
                                        >{{ activityFormatField(change.to) }}</span>
                                      </template>

                                      <!-- User fields: avatar + name -->
                                      <template v-else-if="isUserField(change.field)">
                                        <span v-if="change.to && getUserById(change.to)" class="inline-flex items-center gap-1 ml-1 align-middle">
                                          <span class="w-4 h-4 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[7px] font-medium overflow-hidden inline-flex shrink-0">
                                            <UploadAssetImg v-if="getUserById(change.to)?.avatar" :src="getUserById(change.to)!.avatar!" class="w-4 h-4 rounded-full object-cover" />
                                            <span v-else>{{ activityUserInitials(getUserById(change.to)!.name) }}</span>
                                          </span>
                                          <span class="font-medium text-gray-700">{{ getUserById(change.to)!.name }}</span>
                                        </span>
                                        <span v-else-if="change.from && getUserById(change.from)" class="inline-flex items-center gap-1 ml-1 align-middle">
                                          <span class="w-4 h-4 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[7px] font-medium overflow-hidden inline-flex shrink-0">
                                            <UploadAssetImg v-if="getUserById(change.from)?.avatar" :src="getUserById(change.from)!.avatar!" class="w-4 h-4 rounded-full object-cover" />
                                            <span v-else>{{ activityUserInitials(getUserById(change.from)!.name) }}</span>
                                          </span>
                                          <span class="font-medium text-gray-700">{{ getUserById(change.from)!.name }}</span>
                                        </span>
                                      </template>

                                      <!-- All other fields: from → to as text badges -->
                                      <template v-else-if="change.field !== 'description'">
                                        <span v-if="change.from" class="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-medium ml-1 align-middle">{{ formatChangeValue(change.field, change.from) }}</span>
                                        <span v-if="change.from && change.to" class="text-gray-300 mx-0.5 align-middle">→</span>
                                        <span v-if="change.to" class="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-700 text-white text-[10px] font-medium align-middle" :class="{ 'ml-1': !change.from }">{{ formatChangeValue(change.field, change.to) }}</span>
                                      </template>
                                    </div>
                                  </div>
                                </div>
                                <!-- Updated but no changes tracked -->
                                <div v-else class="flex items-center gap-2">
                                  <span class="w-1.5 h-1.5 rounded-full bg-[#fdab3d] shrink-0"></span>
                                  <span class="text-xs font-medium text-gray-600">Task updated</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input
              v-model="searchQuery"
              class="text-sm text-gray-700 bg-transparent outline-none w-44 placeholder-gray-400"
              placeholder="Search tasks..."
            />
          </div>
        <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            class="p-1.5 rounded-md transition-colors cursor-pointer"
            :class="viewMode === 'table' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
            @click="viewMode = 'table'"
            title="Table view"
          >
            <LayoutList :size="16" />
          </button>
          <button
            class="p-1.5 rounded-md transition-colors cursor-pointer"
            :class="viewMode === 'card' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
            @click="viewMode = 'card'"
            title="Card view"
          >
            <LayoutGrid :size="16" />
          </button>
        </div>

        <!-- Customize Table (rightmost) -->
        <div class="relative column-customizer-container">
          <button
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            :class="showColumnCustomizer ? 'bg-[#4857FE]/10 text-[#4857FE]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
            @click.stop="showColumnCustomizer = !showColumnCustomizer"
            title="Customize columns"
          >
            <SlidersHorizontal :size="15" />
          </button>

          <!-- Dropdown -->
          <Transition
            enter-active-class="transition ease-out duration-150"
            enter-from-class="opacity-0 scale-95 translate-y-1"
            enter-to-class="opacity-100 scale-100 translate-y-0"
            leave-active-class="transition ease-in duration-100"
            leave-from-class="opacity-100 scale-100 translate-y-0"
            leave-to-class="opacity-0 scale-95 translate-y-1"
          >
            <div
              v-if="showColumnCustomizer"
              class="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden"
              @click.stop
            >
              <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customize Columns</span>
                <button
                  class="text-[11px] text-gray-400 hover:text-[#4857FE] cursor-pointer flex items-center gap-1 transition-colors"
                  @click="resetColumns"
                  title="Reset to default"
                >
                  <RotateCcw :size="11" />
                  Reset
                </button>
              </div>
              <div class="py-1.5 max-h-[400px] overflow-y-auto">
                <div
                  v-for="(col, idx) in columns"
                  :key="col.field"
                  draggable="true"
                  class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-all group/item select-none"
                  :class="{
                    'opacity-40': dragIndex === idx,
                    'border-t-2 border-[#4857FE]': dragOverIndex === idx && dragIndex !== null && dragIndex !== idx,
                  }"
                  @dragstart="onDragStart(idx, $event)"
                  @dragover="onDragOver(idx, $event)"
                  @dragleave="onDragLeave"
                  @drop="onDrop(idx)"
                  @dragend="onDragEnd"
                >
                  <!-- Toggle visibility -->
                  <button
                    class="flex items-center gap-2.5 flex-1 cursor-pointer"
                    :class="col.field === 'title' ? 'opacity-60 cursor-not-allowed' : ''"
                    @click="toggleColumnVisibility(col.field)"
                  >
                    <div
                      class="w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors"
                      :class="col.visible
                        ? 'bg-[#4857FE] border-[#4857FE]'
                        : 'border-gray-300 bg-white'"
                    >
                      <Check v-if="col.visible" :size="11" class="text-white" />
                    </div>
                    <span class="text-sm text-gray-700" :class="!col.visible ? 'text-gray-400' : ''">{{ col.label }}</span>
                  </button>

                  <!-- Drag handle -->
                  <div class="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0">
                    <GripVertical :size="14" />
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>

          <!-- Inline Edit Toggle -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            :class="inlineEditMode
              ? 'bg-[#4857FE]/10 text-[#4857FE]'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
            @click="inlineEditMode = !inlineEditMode; editingCell = null"
            title="Inline editing"
          >
            <PencilLine :size="15" />
            <span v-if="inlineEditMode" class="text-xs">Editing</span>
          </button>

          <!-- Form Builder -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            @click="showFormBuilder = true"
            title="Form Builder"
          >
            <Columns3Cog :size="15" />
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden px-8 py-6 flex flex-col min-h-0" :class="viewMode === 'card' ? 'overflow-y-auto' : ''">
      <!-- Loading -->
      <div v-if="backlogStore.loading" class="flex items-center justify-center py-16">
        <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
        <span class="ml-2 text-sm text-gray-500">Loading tasks...</span>
      </div>

      <!-- ===== TABLE VIEW ===== -->
      <template v-else-if="viewMode === 'table'">
        <div v-if="filteredTasks.length > 0"
          class="rounded-xl min-h-0 flex-1 overflow-auto transition-all duration-200"
          :class="inlineEditMode
            ? 'bg-blue-50/30 border-2 border-[#4857FE]/30 shadow-[0_0_0_1px_rgba(72,87,254,0.08)]'
            : 'bg-white border border-gray-200/80'"
        >
          <!-- Column headers -->
          <div
            class="grid items-center px-6 py-3 border-b sticky top-0 z-10 transition-colors duration-200"
            :class="inlineEditMode ? 'bg-blue-50/50 border-[#4857FE]/20' : 'bg-white border-gray-200'"
            :style="{ gridTemplateColumns: gridTemplateCols, minWidth: minTableWidth + 'px' }"
          >
            <div
              v-for="(col, colIdx) in visibleColumns"
              :key="col.field"
              class="relative flex items-center pr-2"
              :class="colIdx < visibleColumns.length - 1 ? 'border-r border-gray-100' : ''"
            >
              <button
                class="flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none transition-colors group/col"
                :class="sortField === col.field ? 'text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
                @click="toggleSort(col.field)"
              >
                {{ col.label }}
                <span class="flex flex-col -space-y-1" v-if="sortField === col.field">
                  <ArrowUp v-if="sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
                  <ArrowDown v-else :size="12" class="text-[#4857FE]" />
                </span>
                <span v-else class="opacity-0 group-hover/col:opacity-50 transition-opacity">
                  <ArrowUp :size="12" />
                </span>
              </button>
              <!-- Resize handle -->
              <div
                v-if="colIdx < visibleColumns.length - 1"
                class="absolute -right-0.5 top-0 h-full w-2 cursor-col-resize z-20 group/resize flex items-center justify-center"
                @mousedown="onResizeStart(col.field, $event)"
              >
                <div class="w-px h-full transition-colors" :class="resizingCol === col.field ? 'bg-[#4857FE]' : 'bg-transparent group-hover/resize:bg-gray-300'"></div>
              </div>
            </div>
          </div>

          <!-- Rows -->
          <div class="divide-y divide-gray-100">
            <div
              v-for="task in sortedTasks"
              :key="task.id"
              class="grid items-center px-6 py-3.5 transition-colors cursor-pointer group"
              :class="[
                selectedTask?.id === task.id
                  ? 'bg-[#4857FE]/5 hover:bg-[#4857FE]/8 border-l-2 border-l-[#4857FE]'
                  : inlineEditMode ? 'hover:bg-blue-50/40 border-l-2 border-l-transparent' : 'hover:bg-gray-50/60 border-l-2 border-l-transparent'
              ]"
              :style="{ gridTemplateColumns: gridTemplateCols, minWidth: minTableWidth + 'px' }"
              @click="inlineEditMode ? null : openTaskDetail(task)"
            >
              <template v-for="col in visibleColumns" :key="col.field">
                <!-- Title -->
                <div v-if="col.field === 'title'" class="flex items-center gap-2.5 min-w-0 inline-edit-cell"
                  :class="inlineEditMode && !isEditing(task.id, 'title') ? 'hover:bg-gray-100/60 rounded px-1 -mx-1 cursor-text' : ''"
                  @click="startTaskEditing(task.id, 'title', task.title, $event)"
                >
                  <template v-if="isEditing(task.id, 'title')">
                    <FavoriteStar entity-type="task" :entity-id="task.id" :product-id="productStore.activeProductName" />
                    <TaskStatusIcon :status="task.status" :size="18" />
                    <input
                      v-model="editValue"
                      class="inline-edit-input flex-1 text-sm font-medium text-gray-800 bg-white border border-[#4857FE]/30 rounded px-2 py-1 outline-none ring-2 ring-[#4857FE]/20 min-w-0"
                      @blur="saveTaskInlineEdit(task.id, 'title', editValue)"
                      @keydown.enter.prevent="saveTaskInlineEdit(task.id, 'title', editValue)"
                      @keydown.escape.prevent="cancelTaskEdit()"
                      @click.stop
                    />
                  </template>
                  <template v-else>
                    <FavoriteStar entity-type="task" :entity-id="task.id" :product-id="productStore.activeProductName" />
                    <TaskStatusIcon :status="task.status" :size="18" />
                    <span class="text-sm font-medium truncate" :class="(task.status === 'done' || task.status === 'archived') ? 'text-gray-400 line-through' : 'text-gray-800'">{{ task.title }}</span>
                    <ChevronRight v-if="!inlineEditMode" :size="14" class="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </template>
                </div>

                <!-- Status -->
                <div v-else-if="col.field === 'status'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startTaskEditing(task.id, 'status', task.status, $event)"
                >
                  <span class="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold" :class="statusStyle(task.status)">
                    {{ statusLabel(task.status) }}
                  </span>
                  <div v-if="isEditing(task.id, 'status')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl z-50 py-1 min-w-[150px]"
                    @click.stop
                  >
                    <button v-for="opt in taskStatusOptions" :key="opt"
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                      :class="task.status === opt ? 'bg-gray-50' : ''"
                      @click.stop="saveTaskInlineEdit(task.id, 'status', opt)"
                    >
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold" :class="statusStyle(opt)">{{ statusLabel(opt) }}</span>
                    </button>
                  </div>
                </div>

                <!-- Priority -->
                <div v-else-if="col.field === 'priority'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startTaskEditing(task.id, 'priority', task.priority, $event)"
                >
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold" :class="priorityStyle(task.priority)">
                    {{ priorityLabel(task.priority) }}
                  </span>
                  <div v-if="isEditing(task.id, 'priority')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl z-50 py-1 min-w-[130px]"
                    @click.stop
                  >
                    <button v-for="opt in taskPriorityOptions" :key="opt"
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                      :class="task.priority === opt ? 'bg-gray-50' : ''"
                      @click.stop="saveTaskInlineEdit(task.id, 'priority', opt)"
                    >
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold" :class="priorityStyle(opt)">{{ priorityLabel(opt) }}</span>
                    </button>
                  </div>
                </div>

                <!-- Type -->
                <div v-else-if="col.field === 'type'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startTaskEditing(task.id, 'type', task.type || '', $event)"
                >
                  <span class="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium" :class="typeStyle(task.type)">
                    {{ typeLabel(task.type) }}
                  </span>
                  <div v-if="isEditing(task.id, 'type')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl z-50 py-1 min-w-[150px]"
                    @click.stop
                  >
                    <button v-for="opt in taskTypeOptions" :key="opt"
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                      :class="task.type === opt ? 'bg-gray-50' : ''"
                      @click.stop="saveTaskInlineEdit(task.id, 'type', opt)"
                    >
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium" :class="typeStyle(opt)">
                        <component :is="taskTypeIcon(opt)" :size="12" />
                        {{ typeLabel(opt) }}
                      </span>
                    </button>
                  </div>
                </div>

                <!-- Story -->
                <div v-else-if="col.field === 'story'" class="text-sm text-gray-500 truncate">
                  {{ (task as any).storyTitle || '—' }}
                </div>

                <!-- Owner -->
                <div v-else-if="col.field === 'owner'" class="relative min-w-0 inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startTaskEditing(task.id, 'owner', task.ownerUserId || '', $event)"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <template v-if="task.ownerUserId && getUserById(task.ownerUserId)">
                      <div class="w-8 h-8 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        <UploadAssetImg v-if="getUserById(task.ownerUserId)?.avatar" :src="getUserById(task.ownerUserId)!.avatar!" class="w-8 h-8 rounded-full object-cover" />
                        <span v-else>{{ (getUserById(task.ownerUserId)?.name || '?')[0] }}</span>
                      </div>
                      <span class="text-sm text-gray-600 truncate">{{ getUserById(task.ownerUserId)?.name }}</span>
                    </template>
                    <span v-else class="text-sm text-gray-400">—</span>
                  </div>
                  <div v-if="isEditing(task.id, 'owner')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 w-[240px] overflow-hidden"
                    @click.stop
                  >
                    <div class="p-2 border-b border-gray-100">
                      <input
                        v-model="inlineOwnerSearch"
                        class="inline-edit-input w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20"
                        placeholder="Search members..."
                        @click.stop
                      />
                    </div>
                    <div class="max-h-[200px] overflow-y-auto py-1">
                      <button
                        class="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 cursor-pointer"
                        @click.stop="saveTaskOwnerInline(task.id, null)"
                      >
                        Unassign
                      </button>
                      <button v-for="member in filteredInlineMembers" :key="member.id"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                        :class="task.ownerUserId === member.id ? 'bg-[#4857FE]/5' : ''"
                        @click.stop="saveTaskOwnerInline(task.id, member)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                          <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ member.name[0] }}</span>
                        </div>
                        <span class="truncate">{{ member.name }}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Assignees -->
                <div v-else-if="col.field === 'assignees'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startTaskEditing(task.id, 'assignees', '', $event)"
                >
                  <div class="flex items-center -space-x-2">
                    <template v-if="task.assigneeUserIds && task.assigneeUserIds.length > 0">
                      <div
                        v-for="(userId, i) in task.assigneeUserIds.slice(0, 3)"
                        :key="userId"
                        class="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-bold"
                        :style="{ zIndex: 3 - i }"
                        :title="getUserById(userId)?.name || userId"
                      >
                        <UploadAssetImg v-if="getUserById(userId)?.avatar" :src="getUserById(userId)!.avatar!" class="w-8 h-8 rounded-full object-cover" />
                        <span v-else>{{ (getUserById(userId)?.name || '?')[0] }}</span>
                      </div>
                      <div
                        v-if="task.assigneeUserIds.length > 3"
                        class="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-medium text-gray-500"
                      >
                        +{{ task.assigneeUserIds.length - 3 }}
                      </div>
                    </template>
                    <span v-else class="text-sm text-gray-400">—</span>
                  </div>
                  <div v-if="isEditing(task.id, 'assignees')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 w-[240px] overflow-hidden"
                    @click.stop
                  >
                    <div class="p-2 border-b border-gray-100">
                      <input
                        v-model="inlineOwnerSearch"
                        class="inline-edit-input w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20"
                        placeholder="Search members..."
                        @click.stop
                      />
                    </div>
                    <div class="max-h-[200px] overflow-y-auto py-1">
                      <button v-for="member in filteredInlineMembers" :key="member.id"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                        :class="task.assigneeUserIds?.includes(member.id) ? 'bg-[#4857FE]/5' : ''"
                        @click.stop="saveTaskAssigneesToggle(task.id, task.assigneeUserIds, member.id)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                          <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ member.name[0] }}</span>
                        </div>
                        <span class="truncate flex-1">{{ member.name }}</span>
                        <Check v-if="task.assigneeUserIds?.includes(member.id)" :size="14" class="text-[#4857FE] shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Reviewers -->
                <div v-else-if="col.field === 'reviewers'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startTaskEditing(task.id, 'reviewers', '', $event)"
                >
                  <div class="flex items-center -space-x-2">
                    <template v-if="task.reviewerUserIds && task.reviewerUserIds.length > 0">
                      <div
                        v-for="(userId, i) in task.reviewerUserIds.slice(0, 3)"
                        :key="userId"
                        class="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-[#579bfc] flex items-center justify-center text-white text-[10px] font-bold"
                        :style="{ zIndex: 3 - i }"
                        :title="getUserById(userId)?.name || userId"
                      >
                        <UploadAssetImg v-if="getUserById(userId)?.avatar" :src="getUserById(userId)!.avatar!" class="w-8 h-8 rounded-full object-cover" />
                        <span v-else>{{ (getUserById(userId)?.name || '?')[0] }}</span>
                      </div>
                      <div
                        v-if="task.reviewerUserIds.length > 3"
                        class="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-medium text-gray-500"
                      >
                        +{{ task.reviewerUserIds.length - 3 }}
                      </div>
                    </template>
                    <span v-else class="text-sm text-gray-400">—</span>
                  </div>
                  <div v-if="isEditing(task.id, 'reviewers')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 w-[240px] overflow-hidden"
                    @click.stop
                  >
                    <div class="p-2 border-b border-gray-100">
                      <input
                        v-model="inlineOwnerSearch"
                        class="inline-edit-input w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20"
                        placeholder="Search members..."
                        @click.stop
                      />
                    </div>
                    <div class="max-h-[200px] overflow-y-auto py-1">
                      <button v-for="member in filteredInlineMembers" :key="member.id"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                        :class="task.reviewerUserIds?.includes(member.id) ? 'bg-[#4857FE]/5' : ''"
                        @click.stop="saveTaskReviewersToggle(task.id, task.reviewerUserIds, member.id)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#579bfc] flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                          <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ member.name[0] }}</span>
                        </div>
                        <span class="truncate flex-1">{{ member.name }}</span>
                        <Check v-if="task.reviewerUserIds?.includes(member.id)" :size="14" class="text-[#4857FE] shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Estimate -->
                <div v-else-if="col.field === 'estimate'" class="min-w-0 inline-edit-cell"
                  :class="inlineEditMode && !isEditing(task.id, 'estimate') ? 'hover:bg-gray-100/60 rounded px-1 -mx-1 cursor-text' : ''"
                  @click="startTaskEditing(task.id, 'estimate', task.estimateValue != null ? String(task.estimateValue) : '', $event)"
                >
                  <input v-if="isEditing(task.id, 'estimate')"
                    v-model="editValue"
                    type="number"
                    class="inline-edit-input w-full text-sm text-gray-600 bg-white border border-[#4857FE]/30 rounded px-2 py-1 outline-none ring-2 ring-[#4857FE]/20"
                    placeholder="Points..."
                    @blur="saveTaskInlineEdit(task.id, 'estimateValue', editValue ? Number(editValue) : null)"
                    @keydown.enter.prevent="saveTaskInlineEdit(task.id, 'estimateValue', editValue ? Number(editValue) : null)"
                    @keydown.escape.prevent="cancelTaskEdit()"
                    @click.stop
                  />
                  <template v-else>
                    <span v-if="task.estimateValue" class="text-sm text-gray-600 font-medium">{{ task.estimateValue }}pts</span>
                    <span v-else class="text-sm text-gray-400">—</span>
                  </template>
                </div>

                <!-- Due Date -->
                <div v-else-if="col.field === 'dueAt'" class="min-w-0 inline-edit-cell"
                  :class="inlineEditMode && !isEditing(task.id, 'dueAt') ? 'hover:bg-gray-100/60 rounded px-1 -mx-1 cursor-text' : ''"
                  @click="startTaskEditing(task.id, 'dueAt', task.dueAt ? task.dueAt.slice(0, 10) : '', $event)"
                >
                  <input v-if="isEditing(task.id, 'dueAt')"
                    v-model="editValue"
                    type="date"
                    class="inline-edit-input w-full text-sm text-gray-600 bg-white border border-[#4857FE]/30 rounded px-2 py-1 outline-none ring-2 ring-[#4857FE]/20"
                    @blur="saveTaskInlineEdit(task.id, 'dueAt', editValue || null)"
                    @keydown.enter.prevent="saveTaskInlineEdit(task.id, 'dueAt', editValue || null)"
                    @keydown.escape.prevent="cancelTaskEdit()"
                    @click.stop
                  />
                  <span v-else class="text-sm" :class="task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-500'">{{ formatDate(task.dueAt) }}</span>
                </div>

                <!-- Description -->
                <div v-else-if="col.field === 'description'" class="text-sm text-gray-500 truncate">
                  {{ task.description || '—' }}
                </div>

                <!-- Created By -->
                <div v-else-if="col.field === 'createdBy'" class="flex items-center gap-2 min-w-0">
                  <template v-if="task.createdByUserId && getUserById(task.createdByUserId)">
                    <div class="w-8 h-8 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      <UploadAssetImg v-if="getUserById(task.createdByUserId)?.avatar" :src="getUserById(task.createdByUserId)!.avatar!" class="w-8 h-8 rounded-full object-cover" />
                      <span v-else>{{ (getUserById(task.createdByUserId)?.name || '?')[0] }}</span>
                    </div>
                    <span class="text-sm text-gray-600 truncate">{{ getUserById(task.createdByUserId)?.name }}</span>
                  </template>
                  <span v-else class="text-sm text-gray-400">—</span>
                </div>

                <!-- Comments -->
                <div v-else-if="col.field === 'comments'" class="flex items-center gap-1.5">
                  <MessageSquare :size="14" class="text-gray-300 shrink-0" />
                  <span class="text-sm" :class="(task.comments?.length || 0) > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'">{{ task.comments?.length || 0 }}</span>
                </div>

                <!-- Attachments -->
                <div v-else-if="col.field === 'attachments'" class="flex items-center gap-1.5">
                  <Paperclip :size="14" class="text-gray-300 shrink-0" />
                  <span class="text-sm" :class="(task.attachments?.length || 0) > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'">{{ task.attachments?.length || 0 }}</span>
                </div>

                <!-- Dependencies -->
                <div v-else-if="col.field === 'dependent'" class="flex items-center gap-1.5">
                  <ListTree :size="14" class="text-gray-300 shrink-0" />
                  <span class="text-sm" :class="(task.dependent?.length || 0) > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'">{{ task.dependent?.length || 0 }}</span>
                </div>

                <!-- Created -->
                <div v-else-if="col.field === 'createdAt'">
                  <span class="text-sm text-gray-500">{{ formatDate(task.createdAt) }}</span>
                </div>

                <!-- Updated -->
                <div v-else-if="col.field === 'updatedAt'">
                  <span class="text-sm text-gray-500">{{ formatDate(task.updatedAt) }}</span>
                </div>

                <!-- Started -->
                <div v-else-if="col.field === 'startedAt'">
                  <span class="text-sm text-gray-500">{{ formatDate(task.startedAt) }}</span>
                </div>

                <!-- Completed -->
                <div v-else-if="col.field === 'completedAt'">
                  <span class="text-sm text-gray-500">{{ formatDate(task.completedAt) }}</span>
                </div>

                <!-- Blocked Reason -->
                <div v-else-if="col.field === 'blockedReason'" class="min-w-0 inline-edit-cell"
                  :class="inlineEditMode && !isEditing(task.id, 'blockedReason') ? 'hover:bg-gray-100/60 rounded px-1 -mx-1 cursor-text' : ''"
                  @click="startTaskEditing(task.id, 'blockedReason', task.blockedReason || '', $event)"
                >
                  <input v-if="isEditing(task.id, 'blockedReason')"
                    v-model="editValue"
                    class="inline-edit-input w-full text-sm text-red-500 bg-white border border-[#4857FE]/30 rounded px-2 py-1 outline-none ring-2 ring-[#4857FE]/20"
                    placeholder="Blocked reason..."
                    @blur="saveTaskInlineEdit(task.id, 'blockedReason', editValue || null)"
                    @keydown.enter.prevent="saveTaskInlineEdit(task.id, 'blockedReason', editValue || null)"
                    @keydown.escape.prevent="cancelTaskEdit()"
                    @click.stop
                  />
                  <span v-else class="text-sm truncate block" :class="task.blockedReason ? 'text-red-500' : 'text-gray-400'">
                    {{ task.blockedReason || '—' }}
                  </span>
                </div>
              </template>
              <!-- Restore button for archived tasks -->
              <button
                v-if="activeTab === 'archived'"
                class="ml-auto p-1 rounded-md hover:bg-green-50 text-gray-300 hover:text-green-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                title="Restore task"
                @click.stop="restoreTask(task.id)"
              >
                <RotateCw :size="14" />
              </button>
              <button
                class="p-1 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                title="Delete task"
                @click.stop="deleteTask(task.id)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </div>

        <!-- Empty state (table) -->
        <div v-else class="flex flex-col items-center justify-center py-20">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <ListChecks :size="24" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">No tasks found</p>
          <p class="text-gray-400 text-xs mb-4">Tasks are created within stories</p>
        </div>
      </template>

      <!-- ===== CARD VIEW ===== -->
      <template v-else-if="viewMode === 'card'">
        <div v-if="filteredTasks.length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          <div
            v-for="task in sortedTasks"
            :key="task.id"
            class="rounded-xl border transition-all duration-200 cursor-pointer group/card relative"
            :class="selectedTask?.id === task.id
              ? 'bg-[#4857FE]/5 border-[#4857FE]/30 shadow-md ring-1 ring-[#4857FE]/10'
              : 'bg-white border-gray-200/80 hover:shadow-lg hover:border-gray-300/80'"
            @click="openTaskDetail(task)"
          >
            <div class="p-5">
              <!-- Row 1: Status badge -->
              <div class="flex items-center justify-between mb-3.5">
                <div class="flex items-center gap-2">
                  <FavoriteStar entity-type="task" :entity-id="task.id" :product-id="productStore.activeProductName" />
                  <div class="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
                    <ListChecks :size="18" class="text-gray-400" />
                  </div>
                </div>
                <span class="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold" :class="statusStyle(task.status)">
                  {{ statusLabel(task.status) }}
                </span>
              </div>

              <!-- Row 2: Title -->
              <div class="mb-1.5">
                <h4 class="text-base font-semibold text-gray-900 line-clamp-2 leading-snug group-hover/card:text-[#4857FE] transition-colors">{{ task.title }}</h4>
              </div>

              <!-- Row 3: Description -->
              <p v-if="task.description" class="text-sm text-gray-500 line-clamp-2 mb-4 leading-relaxed">{{ task.description }}</p>
              <p v-else class="text-sm text-gray-400 italic mb-4">No description</p>

              <!-- Row 4: Story + Priority -->
              <div class="flex items-center gap-2 mb-4">
                <span v-if="(task as any).storyTitle" class="text-sm text-gray-500 truncate flex-1">{{ (task as any).storyTitle }}</span>
                <span v-else class="text-sm text-gray-400 italic flex-1">No story</span>
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-semibold shrink-0"
                  :class="priorityStyle(task.priority)"
                >
                  <span class="w-2 h-2 rounded-full shrink-0" :class="priorityDotStyle(task.priority)"></span>
                  {{ priorityLabel(task.priority) }}
                </span>
              </div>

              <!-- Row 5: Footer - Assignees + Date -->
              <div class="flex items-center justify-between pt-3.5 border-t border-gray-100">
                <!-- Assignees -->
                <div class="flex items-center -space-x-1.5">
                  <template v-if="task.assigneeUserIds && task.assigneeUserIds.length > 0">
                    <div
                      v-for="(userId, i) in task.assigneeUserIds.slice(0, 3)"
                      :key="userId"
                      class="w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-bold"
                      :style="{ zIndex: 3 - i }"
                      :title="getUserById(userId)?.name || userId"
                    >
                      <UploadAssetImg v-if="getUserById(userId)?.avatar" :src="getUserById(userId)!.avatar!" class="w-7 h-7 rounded-full object-cover" />
                      <span v-else>{{ (getUserById(userId)?.name || '?')[0] }}</span>
                    </div>
                    <div
                      v-if="task.assigneeUserIds.length > 3"
                      class="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-medium text-gray-500"
                    >
                      +{{ task.assigneeUserIds.length - 3 }}
                    </div>
                  </template>
                  <div v-else class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                    <span class="text-[10px] text-gray-400">?</span>
                  </div>
                </div>

                <!-- Date -->
                <span class="text-xs text-gray-400">{{ formatDate(task.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state (card) -->
        <div v-else class="flex flex-col items-center justify-center py-20">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <ListChecks :size="24" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">No tasks found</p>
          <p class="text-gray-400 text-xs mb-4">Tasks are created within stories</p>
        </div>
      </template>
    </div>

    <!-- Task Detail Panel -->
    <TaskDetailPanel
      :task="selectedTask"
      :open="showTaskPanel"
      :team-members="teamMembers"
      :from-story-id="fromStoryId"
      @close="closeTaskPanel"
      @updated="onTaskUpdated"
    />

    <!-- Create Task Dialog -->
    <CreateTaskDialog v-model:open="showCreateDialog" @created="onTaskCreated" />

    <FormBuilderDialog v-model:open="showFormBuilder" entity-type="task" />
  </div>
</template>
