<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import {
  X, Maximize2, Copy, Loader2, ChevronDown, Check, Archive,
  Clock, CalendarDays, FileText, FolderOpen, Shield,
  Sparkles, Bug, Lightbulb, FlaskConical, Circle, Wrench, Server, TestTube2,
  ListChecks, Target, History, Search,
  Signal, Type, Tag, CalendarClock, Hourglass, User,
  MessageSquare, Plus, Send, Trash2,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useBacklogStore } from '@/stores/backlog'
import { useAuthStore } from '@/stores/auth'
import type { Story, StoryType, StoryStatus, StoryPriority, TaskComment } from '@/types/backlog'
import AddTaskInline from '@/components/backlog/AddTaskInline.vue'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader as CalHeader,
  CalendarHeading,
  CalendarNext,
  CalendarPrev,
  CalendarRoot,
} from 'reka-ui'
import { type DateValue, CalendarDate } from '@internationalized/date'
import { ChevronLeft, ChevronRight as ChevRight } from 'lucide-vue-next'

interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

interface Activity {
  id: string
  userName: string
  userAvatar: string | null
  action: string
  entityType: string
  entityTitle: string
  changes: { field: string; from: string | null; to: string | null }[] | null
  createdAt: string
}

const props = defineProps<{
  story: Story | null
  open: boolean
  teamMembers: TeamUser[]
}>()

const emit = defineEmits<{
  close: []
  updated: []
}>()

const router = useRouter()
const backlogStore = useBacklogStore()
const authStore = useAuthStore()

// Active tab
const activeTab = ref<'description' | 'tasks' | 'comments' | 'activities'>('description')

// Editing state
const editingField = ref<string | null>(null)
const editTitle = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const saving = ref(false)

// Dropdown states
const showStatusDropdown = ref(false)
const showPriorityDropdown = ref(false)
const showTypeDropdown = ref(false)
const showOwnerDropdown = ref(false)
const ownerSearchQuery = ref('')

// Edit fields
const editDescription = ref('')
const editAcceptanceCriteria = ref('')
const editInitiative = ref('')
const calendarOpen = ref(false)
const calendarValue = ref<DateValue | undefined>()

const totalEstimatedHours = computed(() => {
  if (!props.story?.tasks?.length) return 0
  return props.story.tasks.reduce((sum, t) => sum + (t.estimateValue || 0), 0)
})

// Activities
const activities = ref<Activity[]>([])
const activitiesLoading = ref(false)

// Comments
const newComment = ref('')
const sendingComment = ref(false)
const deletingCommentId = ref<string | null>(null)
const commentTaskId = ref<string | null>(null) // null = story-level, task id = task-level
const commentFilter = ref<string>('all') // 'all', 'story', or task id

// Options
const typeOptions: { value: StoryType; label: string; icon: any }[] = [
  { value: 'feature', label: 'Feature', icon: Sparkles },
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'improvement', label: 'Improvement', icon: Lightbulb },
  { value: 'technical_debt', label: 'Technical Debt', icon: Wrench },
  { value: 'research', label: 'Research', icon: FlaskConical },
  { value: 'infrastructure', label: 'Infrastructure', icon: Server },
  { value: 'testing', label: 'Testing', icon: TestTube2 },
  { value: 'documentation', label: 'Documentation', icon: FileText },
]

const statusOptions: { value: StoryStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'initialized', label: 'Initialized' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

const priorityOptions: { value: StoryPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const filteredOwnerMembers = computed(() => {
  const q = ownerSearchQuery.value.toLowerCase().trim()
  if (!q) return props.teamMembers
  return props.teamMembers.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  )
})

// Reset state when story changes
watch(() => props.story?.id, async (id) => {
  if (!id) return
  editingField.value = null
  closeAllDropdowns()
  activeTab.value = 'description'
  // Default comment target to story
  commentTaskId.value = null
  commentFilter.value = 'all'
  newComment.value = ''
}, { immediate: true })

// Lazy-load activities on tab switch
watch(activeTab, (tab) => {
  if (tab === 'activities' && props.story) {
    loadActivities(props.story.id)
  }
})

async function loadActivities(storyId: string) {
  activitiesLoading.value = true
  try {
    // Aggregate activities for the story + all its child tasks
    const taskIds = props.story?.tasks?.map(t => t.id) || []
    const allIds = [storyId, ...taskIds].join(',')
    const res = await fetch(`/api/activities?entityIds=${allIds}&limit=50`)
    if (res.ok) {
      activities.value = await res.json()
    }
  } catch { activities.value = [] }
  finally { activitiesLoading.value = false }
}

function closeAllDropdowns() {
  showStatusDropdown.value = false
  showPriorityDropdown.value = false
  showTypeDropdown.value = false
  showOwnerDropdown.value = false
  ownerSearchQuery.value = ''
}

async function updateField(field: string, value: any) {
  if (!props.story) return
  saving.value = true
  try {
    await backlogStore.updateStory(props.story.id, { [field]: value })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
    closeAllDropdowns()
  }
}

// Title editing
function startEditTitle() {
  if (!props.story) return
  editTitle.value = props.story.title
  editingField.value = 'title'
  nextTick(() => titleInputRef.value?.focus())
}

async function saveTitle() {
  if (!props.story || !editTitle.value.trim()) {
    editingField.value = null
    return
  }
  if (editTitle.value === props.story.title) {
    editingField.value = null
    return
  }
  await updateField('title', editTitle.value.trim())
}

// Status
async function selectStatus(status: StoryStatus) {
  await updateField('status', status)
}

// Priority
async function selectPriority(priority: StoryPriority) {
  await updateField('priority', priority)
}

// Type
async function selectType(type: StoryType) {
  await updateField('type', type)
}

// Initiative
function startEditInitiative() {
  if (!props.story) return
  editInitiative.value = props.story.initiative || ''
  editingField.value = 'initiative'
}

async function saveInitiative() {
  if (!props.story) return
  if (editInitiative.value === (props.story.initiative || '')) {
    editingField.value = null
    return
  }
  await updateField('initiative', editInitiative.value || null)
}

// Required By (calendar)
function isoToCalendarDate(iso: string | null): DateValue | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function formatDisplayDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function onCalendarSelect(val: DateValue | undefined) {
  calendarValue.value = val
  if (val) {
    const iso = `${val.year}-${String(val.month).padStart(2, '0')}-${String(val.day).padStart(2, '0')}`
    await updateField('delivery', iso)
    calendarOpen.value = false
  }
}

async function clearRequiredBy() {
  await updateField('delivery', null)
  calendarValue.value = undefined
}

// Owner
function startOwnerEdit() {
  editingField.value = 'owner'
  ownerSearchQuery.value = ''
  showOwnerDropdown.value = true
}

async function selectOwner(user: TeamUser) {
  showOwnerDropdown.value = false
  ownerSearchQuery.value = ''
  saving.value = true
  try {
    await backlogStore.updateStory(props.story!.id, { owner: user.name, ownerAvatar: user.avatar || null })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
  }
}

async function clearOwner() {
  showOwnerDropdown.value = false
  saving.value = true
  try {
    await backlogStore.updateStory(props.story!.id, { owner: null, ownerAvatar: null })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
  }
}

// Description
function startEditDescription() {
  if (!props.story) return
  editDescription.value = props.story.description || ''
  editingField.value = 'description'
}

async function saveDescription() {
  if (!props.story) return
  if (editDescription.value === (props.story.description || '')) {
    editingField.value = null
    return
  }
  await updateField('description', editDescription.value || null)
}

// Acceptance Criteria
function startEditAcceptanceCriteria() {
  if (!props.story) return
  editAcceptanceCriteria.value = props.story.acceptanceCriteria || ''
  editingField.value = 'acceptanceCriteria'
}

async function saveAcceptanceCriteria() {
  if (!props.story) return
  if (editAcceptanceCriteria.value === (props.story.acceptanceCriteria || '')) {
    editingField.value = null
    return
  }
  await updateField('acceptanceCriteria', editAcceptanceCriteria.value || null)
}

// Archive
async function archiveStory() {
  if (!props.story) return
  await updateField('status', 'archived')
  emit('close')
}

function onBackdropClick() {
  closeAllDropdowns()
}

// ============ STYLING ============

function statusStyle(status: string) {
  switch (status) {
    case 'backlog': return 'bg-[#c4c4c4] text-white'
    case 'drafted': return 'bg-[#a25ddc] text-white'
    case 'initialized': return 'bg-[#579bfc] text-white'
    case 'in_progress': return 'bg-[#fdab3d] text-white'
    case 'completed': return 'bg-[#00c875] text-white'
    case 'archived': return 'bg-gray-400 text-white'
    default: return 'bg-gray-400 text-white'
  }
}

function priorityStyle(priority: string) {
  switch (priority) {
    case 'critical': return 'bg-red-100 text-red-700 border border-red-200'
    case 'high': return 'bg-orange-100 text-orange-700 border border-orange-200'
    case 'medium': return 'bg-green-100 text-green-700 border border-green-200'
    case 'low': return 'bg-blue-100 text-blue-700 border border-blue-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
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
    case 'infrastructure': return 'text-gray-500'
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

function label(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatRelativeTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function taskProgress() {
  if (!props.story || props.story.tasks.length === 0) return 0
  return Math.round((props.story.tasks.filter(t => t.status === 'done').length / props.story.tasks.length) * 100)
}

// Activity helpers
function activityActionColor(action: string) {
  switch (action) {
    case 'created': return 'bg-[#00c875]'
    case 'deleted': return 'bg-red-500'
    default: return 'bg-[#579bfc]'
  }
}

function activityUserInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function activityFormatField(field: string) {
  return field.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function changeFieldLabel(field: string): string {
  switch (field) {
    case 'owner': return 'Owner'
    case 'ownerAvatar': return 'Owner avatar'
    case 'initiative': return 'Initiative'
    case 'delivery': return 'Delivery'
    case 'estimate': return 'Estimate'
    case 'acceptanceCriteria': return 'Acceptance criteria'
    default: return activityFormatField(field)
  }
}

function changeActionType(change: { from: string | null; to: string | null }): 'added' | 'removed' | 'updated' {
  if (!change.from && change.to) return 'added'
  if (change.from && !change.to) return 'removed'
  return 'updated'
}

function changeFieldIcon(field: string) {
  switch (field) {
    case 'status': return Circle
    case 'priority': return Signal
    case 'description': return FileText
    case 'title': return Type
    case 'type': return Tag
    case 'estimate': return Hourglass
    case 'owner': return User
    case 'initiative': return Target
    case 'delivery': return CalendarClock
    case 'acceptanceCriteria': return ListChecks
    default: return Circle
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

function changeDescription(change: { field: string; from: string | null; to: string | null }): string {
  const fieldLabel = changeFieldLabel(change.field)
  const action = changeActionType(change)

  if (action === 'added') return `Set ${fieldLabel.toLowerCase()}`
  if (action === 'removed') return `Cleared ${fieldLabel.toLowerCase()}`
  return `Updated ${fieldLabel.toLowerCase()}`
}

// Group activities by date
const groupedActivities = computed(() => {
  const groups: { label: string; activities: typeof activities.value }[] = []
  let currentLabel = ''
  for (const act of activities.value) {
    const d = new Date(act.createdAt)
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    let dateLabel: string
    if (d.toDateString() === now.toDateString()) dateLabel = 'TODAY'
    else if (d.toDateString() === yesterday.toDateString()) dateLabel = 'YESTERDAY'
    else dateLabel = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()
    if (dateLabel !== currentLabel) {
      currentLabel = dateLabel
      groups.push({ label: dateLabel, activities: [] })
    }
    groups[groups.length - 1]!.activities.push(act)
  }
  return groups
})

// ──── Tasks tab helpers ────
function taskStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function taskStatusDot(status: string) {
  switch (status) {
    case 'done': return 'bg-[#00c875]'
    case 'in_progress': return 'bg-[#579bfc]'
    case 'in_review': return 'bg-[#a25ddc]'
    case 'blocked': return 'bg-red-500'
    case 'overdue': return 'bg-[#fdab3d]'
    case 'assigned': return 'bg-[#fdab3d]'
    case 'archived': return 'bg-gray-400'
    default: return 'bg-gray-300'
  }
}

function taskPriorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function taskPriorityStyle(priority: string) {
  switch (priority) {
    case 'critical': return 'text-red-600 bg-red-50'
    case 'high': return 'text-orange-600 bg-orange-50'
    case 'medium': return 'text-yellow-600 bg-yellow-50'
    case 'low': return 'text-green-600 bg-green-50'
    default: return 'text-gray-600 bg-gray-50'
  }
}

// ──── Comments tab helpers ────
interface UnifiedComment {
  id: string
  content: string
  createdAt: string
  source: 'story' | 'task'
  sourceLabel: string
  user?: { id: string; name: string; email: string; avatar: string | null }
}

const allComments = computed(() => {
  if (!props.story) return []
  const comments: UnifiedComment[] = []

  // Story-level comments
  if (props.story.comments) {
    for (const c of props.story.comments) {
      comments.push({ id: c.id, content: c.content, createdAt: c.createdAt, source: 'story', sourceLabel: 'Story', user: c.user })
    }
  }

  // Task-level comments
  for (const task of props.story.tasks) {
    if (task.comments) {
      for (const c of task.comments) {
        comments.push({ id: c.id, content: c.content, createdAt: c.createdAt, source: 'task', sourceLabel: task.title, user: c.user })
      }
    }
  }

  return comments.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
})

const filteredComments = computed(() => {
  if (commentFilter.value === 'all') return allComments.value
  if (commentFilter.value === 'story') return allComments.value.filter(c => c.source === 'story')
  // Filter by task id — match by sourceLabel (task title)
  const task = props.story?.tasks.find(t => t.id === commentFilter.value)
  if (!task) return allComments.value
  return allComments.value.filter(c => c.source === 'task' && c.sourceLabel === task.title)
})

const groupedComments = computed(() => {
  const groups: { date: string; comments: UnifiedComment[] }[] = []
  let currentDate = ''
  for (const c of filteredComments.value) {
    const date = formatCommentDate(c.createdAt)
    if (date !== currentDate) {
      currentDate = date
      groups.push({ date, comments: [] })
    }
    groups[groups.length - 1]!.comments.push(c)
  }
  return groups
})

function formatCommentTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
}

function formatCommentDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function submitComment() {
  if (!newComment.value.trim() || !props.story) return

  // Determine endpoint based on commentTaskId
  const isStoryComment = !commentTaskId.value
  const url = isStoryComment
    ? `/api/stories/${props.story.id}/comments`
    : `/api/tasks/${commentTaskId.value}/comments`

  sendingComment.value = true
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ content: newComment.value.trim() }),
    })
    if (res.ok) {
      newComment.value = ''
      emit('updated')
    }
  } catch {}
  finally { sendingComment.value = false }
}

async function deleteComment(comment: UnifiedComment) {
  if (!props.story) return
  deletingCommentId.value = comment.id
  try {
    if (comment.source === 'story') {
      await fetch(`/api/stories/${props.story.id}/comments/${comment.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authStore.token}` },
      })
      emit('updated')
    } else {
      await backlogStore.deleteTaskComment(comment.id)
      emit('updated')
    }
  } catch {}
  finally { deletingCommentId.value = null }
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <Transition name="panel-backdrop">
      <div
        v-if="open && story"
        class="fixed inset-0 bg-black/20 z-40"
        @click="emit('close')"
      ></div>
    </Transition>

    <!-- Slide-over Panel -->
    <Transition name="panel-slide">
      <div
        v-if="open && story"
        class="fixed top-0 right-0 bottom-0 w-[680px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200"
        @click="onBackdropClick"
      >
        <!-- Panel Header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono text-gray-400 px-1.5 py-0.5 bg-gray-50 rounded">STY-{{ story.id.slice(-5).toUpperCase() }}</span>
            <div v-if="saving" class="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 :size="12" class="animate-spin" /> Saving...
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              class="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Expand"
            >
              <Maximize2 :size="14" />
            </button>
            <button
              class="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Copy link"
            >
              <Copy :size="14" />
            </button>
            <button
              class="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"
              title="Archive story"
              @click="archiveStory"
            >
              <Archive :size="14" />
            </button>
            <button
              class="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              @click="emit('close')"
            >
              <X :size="16" />
            </button>
          </div>
        </div>

        <!-- Scrollable Body -->
        <div class="flex-1 overflow-y-auto">
          <!-- Sticky Title -->
          <div class="sticky top-0 z-20 bg-white border-b border-gray-100">
            <div class="px-6 py-3">
              <div v-if="editingField === 'title'">
                <input
                  ref="titleInputRef"
                  v-model="editTitle"
                  class="w-full text-base font-bold text-gray-900 bg-transparent border-b-2 border-[#4857FE] outline-none py-0.5 leading-snug"
                  @keydown.enter="saveTitle"
                  @keydown.escape="editingField = null"
                  @blur="saveTitle"
                  @click.stop
                />
              </div>
              <h2
                v-else
                class="flex items-center gap-2 text-base font-bold text-gray-900 leading-snug cursor-pointer hover:text-[#4857FE] transition-colors group/title truncate"
                @click.stop="startEditTitle"
                :title="story.title"
              >
                <component :is="typeIcons[story.type] || Circle" :size="16" :class="typeIconColor(story.type)" class="shrink-0" />
                <span class="truncate">{{ story.title }}</span>
                <span class="text-xs text-gray-300 opacity-0 group-hover/title:opacity-100 ml-1 transition-opacity shrink-0">edit</span>
              </h2>
            </div>
          </div>

          <!-- Metadata Grid -->
          <div class="px-6 pt-4 pb-4">
            <div class="space-y-4">
              <!-- Status (auto-computed, read-only) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Clock :size="13" class="text-gray-400" /> Status
                </span>
                <span
                  class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
                  :class="statusStyle(story.status)"
                >
                  {{ label(story.status) }}
                </span>
                <span class="text-[10px] text-gray-400 italic">auto</span>
              </div>

              <!-- Priority (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Signal :size="13" class="text-gray-400" /> Priority
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity"
                    :class="priorityStyle(story.priority)"
                    @click="showPriorityDropdown = !showPriorityDropdown; showStatusDropdown = false; showTypeDropdown = false; showOwnerDropdown = false"
                  >
                    {{ label(story.priority) }}
                    <ChevronDown :size="12" />
                  </button>
                  <div
                    v-if="showPriorityDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]"
                  >
                    <button
                      v-for="opt in priorityOptions"
                      :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="story.priority === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectPriority(opt.value)"
                    >
                      <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" :class="priorityStyle(opt.value)">{{ opt.label }}</span>
                      <Check v-if="story.priority === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Type (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Circle :size="13" class="text-gray-400" /> Type
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
                    :class="typeBadgeStyle(story.type)"
                    @click="showTypeDropdown = !showTypeDropdown; showStatusDropdown = false; showPriorityDropdown = false; showOwnerDropdown = false"
                  >
                    <component :is="typeIcons[story.type] || Circle" :size="12" />
                    {{ label(story.type) }}
                    <ChevronDown :size="12" />
                  </button>
                  <div
                    v-if="showTypeDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[180px]"
                  >
                    <button
                      v-for="opt in typeOptions"
                      :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="story.type === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectType(opt.value)"
                    >
                      <component :is="opt.icon" :size="14" />
                      {{ opt.label }}
                      <Check v-if="story.type === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Owner (single-select dropdown with search) -->
              <div class="flex items-start gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5 pt-1">
                  <User :size="13" class="text-gray-400" /> Owner
                </span>
                <div class="flex-1" @click.stop>
                  <div class="flex items-center gap-2 flex-wrap">
                    <template v-if="story.owner">
                      <div class="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-2 py-1 group/owner">
                        <div class="w-5 h-5 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <img v-if="story.ownerAvatar" :src="story.ownerAvatar" class="w-5 h-5 rounded-full object-cover" />
                          <span v-else>{{ story.owner[0] }}</span>
                        </div>
                        <span class="text-xs font-medium text-gray-700">{{ story.owner }}</span>
                        <button
                          class="text-gray-300 hover:text-red-500 opacity-0 group-hover/owner:opacity-100 transition-all ml-0.5"
                          @click="clearOwner"
                          title="Remove owner"
                        >
                          <X :size="10" />
                        </button>
                      </div>
                    </template>
                    <span v-else class="text-xs text-gray-400">No owner</span>
                    <button
                      class="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-[#4857FE] hover:text-[#4857FE] transition-colors"
                      @click="showOwnerDropdown = !showOwnerDropdown; showStatusDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; ownerSearchQuery = ''; editingField = 'owner'"
                    >
                      <span class="text-xs">+</span>
                    </button>
                  </div>
                  <!-- Owner dropdown -->
                  <div
                    v-if="showOwnerDropdown"
                    class="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 w-full max-w-[280px]"
                  >
                    <div class="p-2 border-b border-gray-100">
                      <div class="flex items-center gap-1.5 bg-gray-50 rounded-md px-2 py-1.5">
                        <Search :size="12" class="text-gray-400" />
                        <input
                          v-model="ownerSearchQuery"
                          class="text-xs bg-transparent outline-none w-full placeholder-gray-400"
                          placeholder="Search team members..."
                          autofocus
                        />
                      </div>
                    </div>
                    <div class="max-h-[200px] overflow-auto py-1">
                      <button
                        v-if="story.owner"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors border-b border-gray-100"
                        @click="clearOwner"
                      >
                        <X :size="14" />
                        Remove owner
                      </button>
                      <button
                        v-for="member in filteredOwnerMembers"
                        :key="member.id"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        @click="selectOwner(member)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <img v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ member.name[0] }}</span>
                        </div>
                        <div class="flex-1 text-left min-w-0">
                          <p class="text-sm text-gray-700 truncate">{{ member.name }}</p>
                          <p class="text-[10px] text-gray-400 truncate">{{ member.email }}</p>
                        </div>
                        <Check v-if="story.owner === member.name" :size="14" class="text-[#4857FE] shrink-0" />
                      </button>
                      <p v-if="filteredOwnerMembers.length === 0" class="text-xs text-gray-400 text-center py-3">No members found</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Initiative (editable inline text) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Target :size="13" class="text-gray-400" /> Initiative
                </span>
                <div @click.stop>
                  <div v-if="editingField === 'initiative'" class="flex items-center gap-2">
                    <input
                      v-model="editInitiative"
                      class="text-sm text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE] w-48"
                      placeholder="Initiative name..."
                      autofocus
                      @keydown.enter="saveInitiative"
                      @keydown.escape="editingField = null"
                    />
                    <button @click="saveInitiative" class="text-green-500 hover:text-green-600"><Check :size="14" /></button>
                    <button @click="editingField = null" class="text-gray-400 hover:text-gray-600"><X :size="14" /></button>
                  </div>
                  <span
                    v-else
                    class="text-sm font-medium text-gray-700 cursor-pointer hover:text-[#4857FE] transition-colors"
                    @click="startEditInitiative"
                  >
                    {{ story.initiative || '—' }}
                  </span>
                </div>
              </div>

              <!-- Required By (calendar picker) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <CalendarDays :size="13" class="text-gray-400" /> Required By
                </span>
                <div @click.stop>
                  <Popover v-model:open="calendarOpen">
                    <PopoverTrigger as-child>
                      <button
                        class="inline-flex items-center gap-1.5 text-sm font-medium transition-colors cursor-pointer"
                        :class="story.delivery ? 'text-gray-700 hover:text-[#4857FE]' : 'text-gray-400 hover:text-[#4857FE]'"
                      >
                        {{ formatDisplayDate(story.delivery) }}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" :side-offset="8" class="w-auto p-0 z-[200]">
                      <div class="flex items-center justify-end px-3 pt-2" v-if="story.delivery">
                        <button class="text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer" @click="clearRequiredBy">Clear</button>
                      </div>
                      <CalendarRoot
                        v-slot="{ weekDays, grid }"
                        :model-value="isoToCalendarDate(story.delivery)"
                        weekday-format="short"
                        class="p-3"
                        @update:model-value="onCalendarSelect"
                      >
                        <CalHeader class="flex items-center justify-between mb-4">
                          <CalendarPrev class="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                            <ChevronLeft :size="16" />
                          </CalendarPrev>
                          <CalendarHeading class="text-sm font-semibold text-gray-900" />
                          <CalendarNext class="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                            <ChevRight :size="16" />
                          </CalendarNext>
                        </CalHeader>
                        <CalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse">
                          <CalendarGridHead>
                            <CalendarGridRow class="flex">
                              <CalendarHeadCell v-for="day in weekDays" :key="day" class="w-9 h-9 flex items-center justify-center text-xs font-medium text-gray-400">
                                {{ day }}
                              </CalendarHeadCell>
                            </CalendarGridRow>
                          </CalendarGridHead>
                          <CalendarGridBody>
                            <CalendarGridRow v-for="(weekDates, index) in month.rows" :key="`weekDate-${index}`" class="flex">
                              <CalendarCell v-for="weekDate in weekDates" :key="weekDate.toString()" :date="weekDate" class="relative w-9 h-9 flex items-center justify-center text-sm p-0">
                                <CalendarCellTrigger
                                  :day="weekDate"
                                  :month="month.value"
                                  class="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-normal transition-colors
                                    hover:bg-gray-100
                                    data-[today]:font-bold data-[today]:text-[#4857FE]
                                    data-[selected]:bg-[#4857FE] data-[selected]:text-white data-[selected]:hover:bg-[#3E4BDE] data-[selected]:font-semibold
                                    data-[disabled]:text-gray-300 data-[disabled]:pointer-events-none
                                    data-[outside-month]:text-gray-300 data-[outside-month]:pointer-events-none"
                                />
                              </CalendarCell>
                            </CalendarGridRow>
                          </CalendarGridBody>
                        </CalendarGrid>
                      </CalendarRoot>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <!-- Estimated Hours (computed from child tasks, read-only) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Hourglass :size="13" class="text-gray-400" /> Est. Hours
                </span>
                <span class="text-sm font-medium text-gray-700">
                  {{ totalEstimatedHours > 0 ? `${totalEstimatedHours}h` : '—' }}
                </span>
              </div>

              <!-- Tasks Progress -->
              <div v-if="story.tasks.length > 0" class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <ListChecks :size="13" class="text-gray-400" /> Tasks
                </span>
                <div class="flex items-center gap-3 flex-1">
                  <div class="flex-1 max-w-[180px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="taskProgress() === 100 ? 'bg-[#00c875]' : 'bg-[#4857FE]'"
                      :style="{ width: taskProgress() + '%' }"
                    ></div>
                  </div>
                  <span class="text-xs text-gray-500">{{ story.tasks.filter(t => t.status === 'done').length }}/{{ story.tasks.length }} done</span>
                </div>
              </div>

              <!-- Created -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Clock :size="13" class="text-gray-400" /> Created
                </span>
                <span class="text-sm text-gray-500">{{ formatDate(story.createdAt) }}</span>
              </div>
            </div>

          </div>

          <!-- Sticky Tabs (sticks below title on scroll) -->
          <div class="sticky top-[44px] z-10 bg-white border-t border-b border-gray-100">
            <div class="flex px-6 gap-0">
              <button
                v-for="tab in ([
                  { key: 'description', label: 'Description', icon: FileText, count: 0 },
                  { key: 'tasks', label: 'Tasks', icon: ListChecks, count: story.tasks.length },
                  { key: 'comments', label: 'Comments', icon: MessageSquare, count: allComments.length },
                  { key: 'activities', label: 'Activities', icon: History, count: 0 },
                ] as const)"
                :key="tab.key"
                class="px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer"
                :class="activeTab === tab.key
                  ? 'text-[#F97316] border-[#F97316]'
                  : 'text-gray-400 border-transparent hover:text-gray-600'"
                @click="activeTab = tab.key as any; tab.key === 'activities' && story && loadActivities(story.id)"
              >
                <span class="flex items-center gap-1.5">
                  <component :is="tab.icon" :size="14" />
                  {{ tab.label }}
                  <span
                    v-if="tab.count > 0"
                    class="text-[10px] rounded-full px-1.5 py-0.5 font-bold"
                    :class="activeTab === tab.key ? 'bg-[#F97316]/10 text-[#F97316]' : 'bg-gray-200 text-gray-600'"
                  >{{ tab.count }}</span>
                </span>
              </button>
            </div>
          </div>

          <!-- Tab Content -->
          <div class="px-6 py-2 relative z-0">

            <!-- ═══ Description Tab ═══ -->
            <template v-if="activeTab === 'description'">
              <!-- Description -->
              <div class="py-3" @click.stop>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</span>
                  <button
                    v-if="editingField !== 'description'"
                    class="text-xs text-gray-400 hover:text-[#4857FE] transition-colors cursor-pointer"
                    @click="startEditDescription"
                  >Edit</button>
                </div>
                <div v-if="editingField === 'description'">
                  <textarea
                    v-model="editDescription"
                    rows="5"
                    class="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 leading-relaxed"
                    placeholder="Add a description..."
                    @keydown.escape="editingField = null"
                  ></textarea>
                  <div class="flex items-center gap-2 mt-2">
                    <button class="px-3 py-1 text-xs font-medium text-white bg-[#4857FE] rounded-md hover:bg-[#3a46d9] transition-colors cursor-pointer" @click="saveDescription">Save</button>
                    <button class="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer" @click="editingField = null">Cancel</button>
                  </div>
                </div>
                <p v-else-if="story.description" class="text-sm text-gray-600 leading-relaxed cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors whitespace-pre-wrap" @click="startEditDescription">
                  {{ story.description }}
                </p>
                <p v-else class="text-sm text-gray-400 italic cursor-pointer hover:text-[#4857FE] transition-colors" @click="startEditDescription">
                  Click to add a description...
                </p>
              </div>

              <!-- Acceptance Criteria -->
              <div class="py-3 border-t border-gray-100" @click.stop>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Acceptance Criteria</span>
                  <button
                    v-if="editingField !== 'acceptanceCriteria'"
                    class="text-xs text-gray-400 hover:text-[#4857FE] transition-colors cursor-pointer"
                    @click="startEditAcceptanceCriteria"
                  >Edit</button>
                </div>
                <div v-if="editingField === 'acceptanceCriteria'">
                  <textarea
                    v-model="editAcceptanceCriteria"
                    rows="5"
                    class="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 leading-relaxed"
                    placeholder="Add acceptance criteria..."
                    @keydown.escape="editingField = null"
                  ></textarea>
                  <div class="flex items-center gap-2 mt-2">
                    <button class="px-3 py-1 text-xs font-medium text-white bg-[#4857FE] rounded-md hover:bg-[#3a46d9] transition-colors cursor-pointer" @click="saveAcceptanceCriteria">Save</button>
                    <button class="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer" @click="editingField = null">Cancel</button>
                  </div>
                </div>
                <p v-else-if="story.acceptanceCriteria" class="text-sm text-gray-600 leading-relaxed cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors whitespace-pre-wrap" @click="startEditAcceptanceCriteria">
                  {{ story.acceptanceCriteria }}
                </p>
                <p v-else class="text-sm text-gray-400 italic cursor-pointer hover:text-[#4857FE] transition-colors" @click="startEditAcceptanceCriteria">
                  Click to add acceptance criteria...
                </p>
              </div>
            </template>

            <!-- ═══ Tasks Tab ═══ -->
            <template v-if="activeTab === 'tasks'">
              <div v-if="story.tasks.length === 0" class="text-center py-8">
                <ListChecks :size="28" class="mx-auto text-gray-300 mb-2" />
                <p class="text-sm text-gray-400">No tasks yet</p>
                <p class="text-xs text-gray-300 mt-1">Add a task below to get started</p>
              </div>
              <div v-else class="space-y-0">
                <div
                  v-for="task in story.tasks"
                  :key="task.id"
                  class="py-2.5 px-2 -mx-2 rounded-lg hover:bg-gray-50/70 transition-colors group/task cursor-pointer"
                  @click="emit('close'); router.push({ path: '/tasks', query: { task: task.id, fromStory: story.id } })"
                >
                  <div class="flex items-center gap-2.5">
                    <!-- Status dot -->
                    <span class="w-2 h-2 rounded-full shrink-0" :class="taskStatusDot(task.status)"></span>
                    <!-- Title -->
                    <span class="text-sm text-gray-800 font-medium truncate flex-1 min-w-0">{{ task.title }}</span>
                    <!-- Priority badge -->
                    <span
                      class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                      :class="taskPriorityStyle(task.priority)"
                    >{{ taskPriorityLabel(task.priority) }}</span>
                    <!-- Estimate -->
                    <span v-if="task.estimateValue" class="inline-flex items-center gap-0.5 text-[10px] text-gray-400 font-medium shrink-0">
                      <Clock :size="10" class="text-gray-300" />
                      {{ task.estimateValue }}h
                    </span>
                    <!-- Status label -->
                    <span class="text-[10px] text-gray-400 font-medium shrink-0 w-[72px] text-right">
                      {{ taskStatusLabel(task.status) }}
                    </span>
                  </div>
                </div>
              </div>
              <!-- Add task inline -->
              <div class="mt-2 pt-2 border-t border-gray-100">
                <AddTaskInline :storyId="story.id" @created="emit('updated')" />
              </div>
            </template>

            <!-- ═══ Comments Tab ═══ -->
            <template v-if="activeTab === 'comments'">
              <!-- Filter dropdown -->
              <div class="flex items-center gap-2 mb-3">
                <span class="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Show</span>
                <select
                  v-model="commentFilter"
                  class="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#4857FE] transition-colors flex-1 min-w-0 cursor-pointer"
                >
                  <option value="all">All Comments</option>
                  <option value="story">Story</option>
                  <option v-for="task in story.tasks" :key="task.id" :value="task.id">{{ task.title }}</option>
                </select>
              </div>

              <div v-if="filteredComments.length === 0" class="text-center py-8">
                <MessageSquare :size="28" class="mx-auto text-gray-300 mb-2" />
                <p class="text-sm text-gray-400">No comments yet</p>
                <p class="text-xs text-gray-300 mt-1">Be the first to add a comment</p>
              </div>
              <div v-else class="space-y-0">
                <template v-for="group in groupedComments" :key="group.date">
                  <!-- Date separator -->
                  <div class="flex items-center gap-3 py-2">
                    <div class="flex-1 h-px bg-gray-200"></div>
                    <span class="text-[10px] font-medium text-gray-400">{{ group.date }}</span>
                    <div class="flex-1 h-px bg-gray-200"></div>
                  </div>
                  <!-- Comments -->
                  <div
                    v-for="comment in group.comments"
                    :key="comment.id"
                    class="py-2 group/comment relative hover:bg-gray-50/70 rounded-lg px-2 -mx-2"
                  >
                    <div class="flex items-start gap-2">
                      <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
                        <img v-if="comment.user?.avatar" :src="comment.user.avatar" class="w-6 h-6 rounded-full object-cover" />
                        <span v-else>{{ (comment.user?.name || '?')[0] }}</span>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-xs font-semibold text-gray-800">{{ comment.user?.name || 'Unknown' }}</span>
                          <span class="text-[10px] text-gray-400">{{ formatCommentTime(comment.createdAt) }}</span>
                          <!-- Source tag -->
                          <span
                            class="text-[9px] font-medium rounded px-1.5 py-0.5 truncate max-w-[120px]"
                            :class="comment.source === 'story' ? 'text-orange-600 bg-orange-50' : 'text-[#4857FE] bg-[#4857FE]/8'"
                          >
                            {{ comment.sourceLabel }}
                          </span>
                          <!-- Delete button -->
                          <button
                            class="p-0.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover/comment:opacity-100 transition-all ml-auto cursor-pointer"
                            title="Delete comment"
                            @click="deleteComment(comment)"
                            :disabled="deletingCommentId === comment.id"
                          >
                            <Loader2 v-if="deletingCommentId === comment.id" :size="11" class="animate-spin" />
                            <Trash2 v-else :size="11" />
                          </button>
                        </div>
                        <p class="text-sm text-gray-600 leading-snug mt-0.5">{{ comment.content }}</p>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </template>

            <!-- ═══ Activities Tab ═══ -->
            <template v-if="activeTab === 'activities'">
            <div v-if="activitiesLoading" class="flex items-center justify-center py-8">
              <Loader2 :size="18" class="animate-spin text-gray-400" />
            </div>
            <template v-else>
              <div v-if="activities.length === 0" class="text-center py-8">
                <History :size="28" class="mx-auto text-gray-300 mb-2" />
                <p class="text-sm text-gray-400">No activity recorded</p>
              </div>
              <div v-else>
                <div v-for="group in groupedActivities" :key="group.label">
                  <!-- Date group header -->
                  <div class="pt-3 pb-1.5">
                    <span class="text-[11px] font-bold tracking-wider text-[#4857FE]">{{ group.label }}</span>
                  </div>

                  <!-- Activities -->
                  <div class="relative">
                    <!-- Timeline line -->
                    <div class="absolute left-[15px] top-0 bottom-0 w-px bg-gray-100"></div>

                    <div v-for="activity in group.activities" :key="activity.id" class="relative py-3">
                      <div class="flex items-start gap-3">
                        <!-- Avatar with action dot -->
                        <div class="relative shrink-0 z-10">
                          <div class="w-8 h-8 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden ring-2 ring-white">
                            <img
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
                          <!-- Row 1: User name + task tag (left) + Time (right) -->
                          <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1.5 min-w-0">
                              <span class="text-sm font-semibold text-gray-900">{{ activity.userName }}</span>
                              <span
                                v-if="activity.entityType === 'task'"
                                class="text-[9px] font-medium text-[#4857FE] bg-[#4857FE]/8 rounded px-1.5 py-0.5 truncate max-w-[140px]"
                                :title="activity.entityTitle"
                              >{{ activity.entityTitle }}</span>
                            </div>
                            <span class="text-[11px] text-gray-400 shrink-0 ml-2">{{ formatRelativeTime(activity.createdAt) }}</span>
                          </div>

                          <!-- Row 2: Action box -->
                          <div class="mt-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                            <!-- Created -->
                            <div v-if="activity.action === 'created'" class="flex items-center gap-2">
                              <span class="w-1.5 h-1.5 rounded-full bg-[#00c875] shrink-0"></span>
                              <span class="text-xs font-medium text-gray-600">{{ activity.entityType === 'task' ? 'Task' : 'Story' }} created</span>
                            </div>
                            <!-- Deleted -->
                            <div v-else-if="activity.action === 'deleted'" class="flex items-center gap-2">
                              <span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                              <span class="text-xs font-medium text-gray-600">{{ activity.entityType === 'task' ? 'Task' : 'Story' }} deleted</span>
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

                                  <!-- All other fields: from → to as text badges (skip description/acceptanceCriteria) -->
                                  <template v-else-if="change.field !== 'description' && change.field !== 'acceptanceCriteria' && change.field !== 'ownerAvatar'">
                                    <span v-if="change.from" class="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-medium ml-1 align-middle">{{ activityFormatField(change.from) }}</span>
                                    <span v-if="change.from && change.to" class="text-gray-300 mx-0.5 align-middle">→</span>
                                    <span v-if="change.to" class="inline-flex items-center px-1.5 py-0.5 rounded bg-[#4857FE]/10 text-[#4857FE] text-[10px] font-medium align-middle">{{ activityFormatField(change.to) }}</span>
                                  </template>
                                </div>
                              </div>
                            </div>
                            <!-- Fallback -->
                            <div v-else class="flex items-center gap-2">
                              <span class="w-1.5 h-1.5 rounded-full bg-[#579bfc] shrink-0"></span>
                              <span class="text-xs font-medium text-gray-600">{{ label(activity.action) }} {{ activity.entityType === 'task' ? 'task' : 'story' }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            </template>
          </div>
        </div>

        <!-- Comment Input Footer (always on comments tab) -->
        <div v-if="activeTab === 'comments'" class="border-t border-gray-100 bg-white px-5 py-3 shrink-0">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-[10px] font-medium text-gray-400 shrink-0">on</span>
            <select
              v-model="commentTaskId"
              class="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-[#4857FE] transition-colors flex-1 min-w-0 truncate cursor-pointer"
            >
              <option :value="null">Story</option>
              <option v-for="task in story.tasks" :key="task.id" :value="task.id">{{ task.title }}</option>
            </select>
          </div>
          <div class="flex items-end gap-2">
            <div class="flex-1 relative">
              <textarea
                v-model="newComment"
                rows="2"
                class="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none resize-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 transition-colors placeholder-gray-400"
                placeholder="Write your comment..."
                @keydown.enter.exact.prevent="submitComment"
              ></textarea>
            </div>
            <button
              class="p-2.5 rounded-full transition-colors shrink-0 cursor-pointer"
              :class="newComment.trim()
                ? 'bg-[#F97316] hover:bg-[#EA580C] text-white'
                : 'bg-gray-100 text-gray-400'"
              :disabled="!newComment.trim() || sendingComment"
              @click="submitComment"
            >
              <Loader2 v-if="sendingComment" :size="16" class="animate-spin" />
              <Send v-else :size="16" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.panel-backdrop-enter-active,
.panel-backdrop-leave-active {
  transition: opacity 0.25s ease;
}
.panel-backdrop-enter-from,
.panel-backdrop-leave-to {
  opacity: 0;
}

.panel-slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-slide-leave-active {
  transition: transform 0.2s ease-in;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
}
</style>
