<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import {
  X, Maximize2, Copy, Loader2, ChevronDown, Check,
  Clock, CalendarDays, FileText, Shield,
  Bug, Circle, Wrench, Server,
  Target, History, Search,
  Signal, Type, Tag, User,
  MessageSquare, Send, Trash2,
  Upload, Download, ImageIcon, FileIcon, Paperclip,
  AlertTriangle, Eye, Monitor, Smartphone, Globe, Zap, Database, LayoutDashboard, Lock,
} from 'lucide-vue-next'
import { useIssuesStore } from '@/stores/issues'
import { useAuthStore } from '@/stores/auth'
import type {
  Issue, IssueType, IssueStatus, IssueSeverity, IssuePriority,
  IssueReproducibility, IssueEnvironment, IssueBrowser, IssueOs,
  IssueComment, IssueAttachment,
} from '@/types/issue'

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
  issue: Issue | null
  open: boolean
  teamMembers: TeamUser[]
}>()

const emit = defineEmits<{
  close: []
  updated: []
}>()

const issuesStore = useIssuesStore()
const authStore = useAuthStore()

// Active tab
const activeTab = ref<'description' | 'reproduction' | 'comments' | 'attachments' | 'activities'>('description')

// Editing state
const editingField = ref<string | null>(null)
const editTitle = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const saving = ref(false)

// Dropdown states
const showStatusDropdown = ref(false)
const showSeverityDropdown = ref(false)
const showPriorityDropdown = ref(false)
const showTypeDropdown = ref(false)
const showAssigneeDropdown = ref(false)
const showReproducibilityDropdown = ref(false)
const showEnvironmentDropdown = ref(false)
const showBrowserDropdown = ref(false)
const showOsDropdown = ref(false)
const assigneeSearchQuery = ref('')

// Edit fields
const editDescription = ref('')
const editStepsToReproduce = ref('')
const editExpectedBehavior = ref('')
const editActualBehavior = ref('')
const editModule = ref('')
const editAppVersion = ref('')

// Activities
const activities = ref<Activity[]>([])
const activitiesLoading = ref(false)

// Comments
const newComment = ref('')
const sendingComment = ref(false)
const deletingCommentId = ref<string | null>(null)

// Attachments
const attachments = ref<IssueAttachment[]>([])
const attachmentsLoading = ref(false)
const uploadingFiles = ref(false)
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const deletingAttachmentId = ref<string | null>(null)

// Comments (loaded from issue or fetched)
const comments = ref<IssueComment[]>([])
const commentsLoading = ref(false)

// ──── Options ────

const typeOptions: { value: IssueType; label: string; icon: any }[] = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'ui_issue', label: 'UI Issue', icon: LayoutDashboard },
  { value: 'performance', label: 'Performance', icon: Zap },
  { value: 'crash', label: 'Crash', icon: AlertTriangle },
  { value: 'security', label: 'Security', icon: Lock },
  { value: 'data_loss', label: 'Data Loss', icon: Database },
  { value: 'other', label: 'Other', icon: Circle },
]

const statusOptions: { value: IssueStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'deferred', label: 'Deferred' },
]

const severityOptions: { value: IssueSeverity; label: string }[] = [
  { value: 'blocker', label: 'Blocker' },
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'trivial', label: 'Trivial' },
]

const priorityOptions: { value: IssuePriority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const reproducibilityOptions: { value: IssueReproducibility; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'once', label: 'Once' },
  { value: 'unable_to_reproduce', label: 'Unable to Reproduce' },
]

const environmentOptions: { value: IssueEnvironment; label: string }[] = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
  { value: 'testing', label: 'Testing' },
]

const browserOptions: { value: IssueBrowser; label: string }[] = [
  { value: 'chrome', label: 'Chrome' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'safari', label: 'Safari' },
  { value: 'edge', label: 'Edge' },
  { value: 'other', label: 'Other' },
]

const osOptions: { value: IssueOs; label: string }[] = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'other', label: 'Other' },
]

const typeIcons: Record<string, any> = {
  bug: Bug,
  ui_issue: LayoutDashboard,
  performance: Zap,
  crash: AlertTriangle,
  security: Lock,
  data_loss: Database,
  other: Circle,
}

const filteredAssigneeMembers = computed(() => {
  const q = assigneeSearchQuery.value.toLowerCase().trim()
  if (!q) return props.teamMembers
  return props.teamMembers.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  )
})

// Reset state when issue changes
watch(() => props.issue?.id, async (id) => {
  if (!id) return
  editingField.value = null
  closeAllDropdowns()
  activeTab.value = 'description'
  newComment.value = ''
  comments.value = []
  attachments.value = []
}, { immediate: true })

// Lazy-load on tab switch
watch(activeTab, (tab) => {
  if (tab === 'activities' && props.issue) loadActivities(props.issue.id)
  if (tab === 'attachments' && props.issue) loadAttachments(props.issue.id)
  if (tab === 'comments' && props.issue) loadComments(props.issue.id)
})

// ──── Data loading ────

async function loadComments(issueId: string) {
  commentsLoading.value = true
  try {
    const res = await fetch(`/api/issues/${issueId}/comments`)
    if (res.ok) comments.value = await res.json()
  } catch { comments.value = [] }
  finally { commentsLoading.value = false }
}

async function loadAttachments(issueId: string) {
  attachmentsLoading.value = true
  try {
    const res = await fetch(`/api/issues/${issueId}/attachments`)
    if (res.ok) attachments.value = await res.json()
  } catch { attachments.value = [] }
  finally { attachmentsLoading.value = false }
}

async function loadActivities(issueId: string) {
  activitiesLoading.value = true
  try {
    const res = await fetch(`/api/activities?entityIds=${issueId}&limit=50`)
    if (res.ok) activities.value = await res.json()
  } catch { activities.value = [] }
  finally { activitiesLoading.value = false }
}

// ──── File upload / attachments ────

async function uploadFiles(files: FileList | File[]) {
  if (!props.issue || files.length === 0) return
  uploadingFiles.value = true
  try {
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/issues/${props.issue.id}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authStore.token}` },
        body: formData,
      })
      if (res.ok) {
        const att = await res.json()
        attachments.value.unshift(att)
      }
    }
  } finally { uploadingFiles.value = false }
}

async function deleteAttachment(attachmentId: string) {
  deletingAttachmentId.value = attachmentId
  try {
    const res = await fetch(`/api/issues/attachments/${attachmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) attachments.value = attachments.value.filter(a => a.id !== attachmentId)
  } finally { deletingAttachmentId.value = null }
}

function onDragOver(e: DragEvent) { e.preventDefault(); isDragging.value = true }
function onDragLeave() { isDragging.value = false }
function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files) uploadFiles(e.dataTransfer.files)
}
function onFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) uploadFiles(target.files)
  target.value = ''
}

// ──── Helpers ────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function isImageFile(mimeType: string): boolean { return mimeType.startsWith('image/') }
function fileIcon(mimeType: string) { return mimeType.startsWith('image/') ? ImageIcon : FileIcon }

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

function formatDate(dateStr: string | null) {
  if (!dateStr) return '\u2014'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function label(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

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

// ──── Dropdowns ────

function closeAllDropdowns() {
  showStatusDropdown.value = false
  showSeverityDropdown.value = false
  showPriorityDropdown.value = false
  showTypeDropdown.value = false
  showAssigneeDropdown.value = false
  showReproducibilityDropdown.value = false
  showEnvironmentDropdown.value = false
  showBrowserDropdown.value = false
  showOsDropdown.value = false
  assigneeSearchQuery.value = ''
}

// ──── Update field ────

async function updateField(field: string, value: any) {
  if (!props.issue) return
  saving.value = true
  try {
    await issuesStore.updateIssue(props.issue.id, { [field]: value })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
    closeAllDropdowns()
  }
}

// ──── Title editing ────

function startEditTitle() {
  if (!props.issue) return
  editTitle.value = props.issue.title
  editingField.value = 'title'
  nextTick(() => titleInputRef.value?.focus())
}

async function saveTitle() {
  if (!props.issue || !editTitle.value.trim()) {
    editingField.value = null
    return
  }
  if (editTitle.value === props.issue.title) {
    editingField.value = null
    return
  }
  await updateField('title', editTitle.value.trim())
}

// ──── Status ────
async function selectStatus(status: IssueStatus) {
  await updateField('status', status)
}

// ──── Severity ────
async function selectSeverity(severity: IssueSeverity) {
  await updateField('severity', severity)
}

// ──── Priority ────
async function selectPriority(priority: IssuePriority) {
  await updateField('priority', priority)
}

// ──── Type ────
async function selectType(type: IssueType) {
  await updateField('type', type)
}

// ──── Reproducibility ────
async function selectReproducibility(val: IssueReproducibility) {
  await updateField('reproducibility', val)
}

// ──── Environment ────
async function selectEnvironment(val: IssueEnvironment) {
  await updateField('environment', val)
}

// ──── Browser ────
async function selectBrowser(val: IssueBrowser) {
  await updateField('browser', val)
}

// ──── OS ────
async function selectOs(val: IssueOs) {
  await updateField('operatingSystem', val)
}

// ──── Assigned To ────
function startAssigneeEdit() {
  editingField.value = 'assignedTo'
  assigneeSearchQuery.value = ''
  showAssigneeDropdown.value = true
}

async function selectAssignee(user: TeamUser) {
  showAssigneeDropdown.value = false
  assigneeSearchQuery.value = ''
  saving.value = true
  try {
    await issuesStore.updateIssue(props.issue!.id, { assignedToUserId: user.id })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
  }
}

async function clearAssignee() {
  showAssigneeDropdown.value = false
  saving.value = true
  try {
    await issuesStore.updateIssue(props.issue!.id, { assignedToUserId: null })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
  }
}

// ──── Module ────
function startEditModule() {
  if (!props.issue) return
  editModule.value = props.issue.module || ''
  editingField.value = 'module'
}

async function saveModule() {
  if (!props.issue) return
  if (editModule.value === (props.issue.module || '')) {
    editingField.value = null
    return
  }
  await updateField('module', editModule.value || null)
}

// ──── App Version ────
function startEditAppVersion() {
  if (!props.issue) return
  editAppVersion.value = props.issue.appVersion || ''
  editingField.value = 'appVersion'
}

async function saveAppVersion() {
  if (!props.issue) return
  if (editAppVersion.value === (props.issue.appVersion || '')) {
    editingField.value = null
    return
  }
  await updateField('appVersion', editAppVersion.value || null)
}

// ──── Description ────
function startEditDescription() {
  if (!props.issue) return
  editDescription.value = props.issue.description || ''
  editingField.value = 'description'
}

async function saveDescription() {
  if (!props.issue) return
  if (editDescription.value === (props.issue.description || '')) {
    editingField.value = null
    return
  }
  await updateField('description', editDescription.value || null)
}

// ──── Steps to Reproduce ────
function startEditStepsToReproduce() {
  if (!props.issue) return
  editStepsToReproduce.value = props.issue.stepsToReproduce || ''
  editingField.value = 'stepsToReproduce'
}

async function saveStepsToReproduce() {
  if (!props.issue) return
  if (editStepsToReproduce.value === (props.issue.stepsToReproduce || '')) {
    editingField.value = null
    return
  }
  await updateField('stepsToReproduce', editStepsToReproduce.value || null)
}

// ──── Expected Behavior ────
function startEditExpectedBehavior() {
  if (!props.issue) return
  editExpectedBehavior.value = props.issue.expectedBehavior || ''
  editingField.value = 'expectedBehavior'
}

async function saveExpectedBehavior() {
  if (!props.issue) return
  if (editExpectedBehavior.value === (props.issue.expectedBehavior || '')) {
    editingField.value = null
    return
  }
  await updateField('expectedBehavior', editExpectedBehavior.value || null)
}

// ──── Actual Behavior ────
function startEditActualBehavior() {
  if (!props.issue) return
  editActualBehavior.value = props.issue.actualBehavior || ''
  editingField.value = 'actualBehavior'
}

async function saveActualBehavior() {
  if (!props.issue) return
  if (editActualBehavior.value === (props.issue.actualBehavior || '')) {
    editingField.value = null
    return
  }
  await updateField('actualBehavior', editActualBehavior.value || null)
}

// ──── Comments ────

const groupedComments = computed(() => {
  const groups: { date: string; comments: IssueComment[] }[] = []
  let currentDate = ''
  const sorted = [...comments.value].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
  for (const c of sorted) {
    const date = formatCommentDate(c.createdAt)
    if (date !== currentDate) {
      currentDate = date
      groups.push({ date, comments: [] })
    }
    groups[groups.length - 1]!.comments.push(c)
  }
  return groups
})

async function submitComment() {
  if (!newComment.value.trim() || !props.issue) return
  sendingComment.value = true
  try {
    const res = await fetch(`/api/issues/${props.issue.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ content: newComment.value.trim() }),
    })
    if (res.ok) {
      newComment.value = ''
      // Re-fetch comments to get the user data populated
      await loadComments(props.issue!.id)
      emit('updated')
    }
  } catch {}
  finally { sendingComment.value = false }
}

async function deleteComment(commentId: string) {
  if (!props.issue) return
  deletingCommentId.value = commentId
  try {
    await fetch(`/api/issues/${props.issue.id}/comments/${commentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    comments.value = comments.value.filter(c => c.id !== commentId)
    emit('updated')
  } catch {}
  finally { deletingCommentId.value = null }
}

function onBackdropClick() {
  closeAllDropdowns()
}

// ──── Styling ────

function statusStyle(status: string) {
  switch (status) {
    case 'open': return 'bg-[#579bfc] text-white'
    case 'in_progress': return 'bg-[#fdab3d] text-white'
    case 'resolved': return 'bg-[#00c875] text-white'
    case 'closed': return 'bg-gray-400 text-white'
    case 'deferred': return 'bg-[#a25ddc] text-white'
    default: return 'bg-gray-400 text-white'
  }
}

function severityStyle(severity: string) {
  switch (severity) {
    case 'blocker': return 'bg-rose-950 text-white border border-rose-900'
    case 'critical': return 'bg-red-100 text-red-700 border border-red-200'
    case 'major': return 'bg-orange-100 text-orange-700 border border-orange-200'
    case 'minor': return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
    case 'trivial': return 'bg-gray-100 text-gray-600 border border-gray-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
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

function typeBadgeStyle(type: string) {
  switch (type) {
    case 'bug': return 'bg-red-50/80 text-red-600'
    case 'ui_issue': return 'bg-purple-50/80 text-purple-600'
    case 'performance': return 'bg-yellow-50/80 text-yellow-600'
    case 'crash': return 'bg-red-100/80 text-red-700'
    case 'security': return 'bg-orange-50/80 text-orange-600'
    case 'data_loss': return 'bg-pink-50/80 text-pink-600'
    case 'other': return 'bg-gray-50/80 text-gray-500'
    default: return 'bg-gray-50/80 text-gray-500'
  }
}

function typeIconColor(type: string) {
  switch (type) {
    case 'bug': return 'text-red-500'
    case 'ui_issue': return 'text-purple-500'
    case 'performance': return 'text-yellow-500'
    case 'crash': return 'text-red-700'
    case 'security': return 'text-orange-500'
    case 'data_loss': return 'text-pink-500'
    case 'other': return 'text-gray-400'
    default: return 'text-gray-400'
  }
}

// ──── Activity helpers ────

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
    case 'assignedToUserId': return 'Assigned to'
    case 'reportedByUserId': return 'Reported by'
    case 'stepsToReproduce': return 'Steps to reproduce'
    case 'expectedBehavior': return 'Expected behavior'
    case 'actualBehavior': return 'Actual behavior'
    case 'appVersion': return 'App version'
    case 'operatingSystem': return 'Operating system'
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
    case 'severity': return AlertTriangle
    case 'description': return FileText
    case 'title': return Type
    case 'type': return Tag
    case 'assignedToUserId': return User
    case 'module': return Target
    case 'environment': return Globe
    case 'browser': return Monitor
    case 'operatingSystem': return Smartphone
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
  const fieldLbl = changeFieldLabel(change.field)
  const action = changeActionType(change)
  if (action === 'added') return `Set ${fieldLbl.toLowerCase()}`
  if (action === 'removed') return `Cleared ${fieldLbl.toLowerCase()}`
  return `Updated ${fieldLbl.toLowerCase()}`
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
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <Transition name="panel-backdrop">
      <div
        v-if="open && issue"
        class="fixed inset-0 bg-black/20 z-40"
        @click="emit('close')"
      ></div>
    </Transition>

    <!-- Slide-over Panel -->
    <Transition name="panel-slide">
      <div
        v-if="open && issue"
        class="fixed top-0 right-0 bottom-0 w-[680px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200"
        @click="onBackdropClick"
      >
        <!-- Panel Header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <div class="flex items-center gap-2">
            <Bug :size="16" class="text-red-500 shrink-0" />
            <span class="text-[11px] font-mono text-gray-400 px-1.5 py-0.5 bg-gray-50 rounded">ISS-{{ issue.id.slice(-5).toUpperCase() }}</span>
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
                :title="issue.title"
              >
                <Bug :size="16" class="text-red-500 shrink-0" />
                <span class="truncate">{{ issue.title }}</span>
                <span class="text-xs text-gray-300 opacity-0 group-hover/title:opacity-100 ml-1 transition-opacity shrink-0">edit</span>
              </h2>
            </div>
          </div>

          <!-- Metadata Grid -->
          <div class="px-6 pt-4 pb-4">
            <div class="space-y-4">

              <!-- Status (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Clock :size="13" class="text-gray-400" /> Status
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                    :class="statusStyle(issue.status)"
                    @click="showStatusDropdown = !showStatusDropdown; showSeverityDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showReproducibilityDropdown = false; showEnvironmentDropdown = false; showBrowserDropdown = false; showOsDropdown = false"
                  >
                    {{ label(issue.status) }}
                    <ChevronDown :size="12" />
                  </button>
                  <div
                    v-if="showStatusDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]"
                  >
                    <button
                      v-for="opt in statusOptions"
                      :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="issue.status === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectStatus(opt.value)"
                    >
                      <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold" :class="statusStyle(opt.value)">{{ opt.label }}</span>
                      <Check v-if="issue.status === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Severity (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <AlertTriangle :size="13" class="text-gray-400" /> Severity
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity"
                    :class="severityStyle(issue.severity)"
                    @click="showSeverityDropdown = !showSeverityDropdown; showStatusDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showReproducibilityDropdown = false; showEnvironmentDropdown = false; showBrowserDropdown = false; showOsDropdown = false"
                  >
                    {{ label(issue.severity) }}
                    <ChevronDown :size="12" />
                  </button>
                  <div
                    v-if="showSeverityDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]"
                  >
                    <button
                      v-for="opt in severityOptions"
                      :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="issue.severity === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectSeverity(opt.value)"
                    >
                      <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" :class="severityStyle(opt.value)">{{ opt.label }}</span>
                      <Check v-if="issue.severity === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Priority (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Signal :size="13" class="text-gray-400" /> Priority
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity"
                    :class="priorityStyle(issue.priority)"
                    @click="showPriorityDropdown = !showPriorityDropdown; showStatusDropdown = false; showSeverityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showReproducibilityDropdown = false; showEnvironmentDropdown = false; showBrowserDropdown = false; showOsDropdown = false"
                  >
                    {{ label(issue.priority) }}
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
                      :class="issue.priority === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectPriority(opt.value)"
                    >
                      <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" :class="priorityStyle(opt.value)">{{ opt.label }}</span>
                      <Check v-if="issue.priority === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Type (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Tag :size="13" class="text-gray-400" /> Type
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
                    :class="typeBadgeStyle(issue.type)"
                    @click="showTypeDropdown = !showTypeDropdown; showStatusDropdown = false; showSeverityDropdown = false; showPriorityDropdown = false; showAssigneeDropdown = false; showReproducibilityDropdown = false; showEnvironmentDropdown = false; showBrowserDropdown = false; showOsDropdown = false"
                  >
                    <component :is="typeIcons[issue.type] || Circle" :size="12" />
                    {{ label(issue.type) }}
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
                      :class="issue.type === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectType(opt.value)"
                    >
                      <component :is="opt.icon" :size="14" />
                      {{ opt.label }}
                      <Check v-if="issue.type === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Assigned To (searchable user dropdown) -->
              <div class="flex items-start gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5 pt-1">
                  <User :size="13" class="text-gray-400" /> Assigned To
                </span>
                <div class="flex-1" @click.stop>
                  <div class="flex items-center gap-2 flex-wrap">
                    <template v-if="issue.assignedTo">
                      <div class="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-2 py-1 group/assignee">
                        <div class="w-5 h-5 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <img v-if="issue.assignedTo.avatar" :src="issue.assignedTo.avatar" class="w-5 h-5 rounded-full object-cover" />
                          <span v-else>{{ issue.assignedTo.name[0] }}</span>
                        </div>
                        <span class="text-xs font-medium text-gray-700">{{ issue.assignedTo.name }}</span>
                        <button
                          class="text-gray-300 hover:text-red-500 opacity-0 group-hover/assignee:opacity-100 transition-all ml-0.5"
                          @click="clearAssignee"
                          title="Remove assignee"
                        >
                          <X :size="10" />
                        </button>
                      </div>
                    </template>
                    <span v-else class="text-xs text-gray-400">Unassigned</span>
                    <button
                      class="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-[#4857FE] hover:text-[#4857FE] transition-colors"
                      @click="showAssigneeDropdown = !showAssigneeDropdown; showStatusDropdown = false; showSeverityDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showReproducibilityDropdown = false; showEnvironmentDropdown = false; showBrowserDropdown = false; showOsDropdown = false; assigneeSearchQuery = ''; editingField = 'assignedTo'"
                    >
                      <span class="text-xs">+</span>
                    </button>
                  </div>
                  <!-- Assignee dropdown -->
                  <div
                    v-if="showAssigneeDropdown"
                    class="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 w-full max-w-[280px]"
                  >
                    <div class="p-2 border-b border-gray-100">
                      <div class="flex items-center gap-1.5 bg-gray-50 rounded-md px-2 py-1.5">
                        <Search :size="12" class="text-gray-400" />
                        <input
                          v-model="assigneeSearchQuery"
                          class="text-xs bg-transparent outline-none w-full placeholder-gray-400"
                          placeholder="Search team members..."
                          autofocus
                        />
                      </div>
                    </div>
                    <div class="max-h-[200px] overflow-auto py-1">
                      <button
                        v-if="issue.assignedTo"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors border-b border-gray-100"
                        @click="clearAssignee"
                      >
                        <X :size="14" />
                        Remove assignee
                      </button>
                      <button
                        v-for="member in filteredAssigneeMembers"
                        :key="member.id"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        @click="selectAssignee(member)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <img v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ member.name[0] }}</span>
                        </div>
                        <div class="flex-1 text-left min-w-0">
                          <p class="text-sm text-gray-700 truncate">{{ member.name }}</p>
                          <p class="text-[10px] text-gray-400 truncate">{{ member.email }}</p>
                        </div>
                        <Check v-if="issue.assignedToUserId === member.id" :size="14" class="text-[#4857FE] shrink-0" />
                      </button>
                      <p v-if="filteredAssigneeMembers.length === 0" class="text-xs text-gray-400 text-center py-3">No members found</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Reported By (read-only) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <User :size="13" class="text-gray-400" /> Reported By
                </span>
                <div v-if="issue.reportedBy" class="inline-flex items-center gap-1.5 bg-gray-50 rounded-full pl-1 pr-2.5 py-1">
                  <div class="w-5 h-5 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                    <img v-if="issue.reportedBy.avatar" :src="issue.reportedBy.avatar" class="w-5 h-5 rounded-full object-cover" />
                    <span v-else>{{ issue.reportedBy.name[0] }}</span>
                  </div>
                  <span class="text-xs font-medium text-gray-600">{{ issue.reportedBy.name }}</span>
                </div>
                <span v-else class="text-sm text-gray-400">&mdash;</span>
              </div>

              <!-- Module (editable inline text) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Target :size="13" class="text-gray-400" /> Module
                </span>
                <div @click.stop>
                  <div v-if="editingField === 'module'" class="flex items-center gap-2">
                    <input
                      v-model="editModule"
                      class="text-sm text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE] w-48"
                      placeholder="Module name..."
                      autofocus
                      @keydown.enter="saveModule"
                      @keydown.escape="editingField = null"
                    />
                    <button @click="saveModule" class="text-green-500 hover:text-green-600"><Check :size="14" /></button>
                    <button @click="editingField = null" class="text-gray-400 hover:text-gray-600"><X :size="14" /></button>
                  </div>
                  <span
                    v-else
                    class="text-sm font-medium text-gray-700 cursor-pointer hover:text-[#4857FE] transition-colors"
                    @click="startEditModule"
                  >
                    {{ issue.module || '\u2014' }}
                  </span>
                </div>
              </div>

              <!-- App Version (editable inline text) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Tag :size="13" class="text-gray-400" /> App Version
                </span>
                <div @click.stop>
                  <div v-if="editingField === 'appVersion'" class="flex items-center gap-2">
                    <input
                      v-model="editAppVersion"
                      class="text-sm text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE] w-48"
                      placeholder="e.g. 1.2.3"
                      autofocus
                      @keydown.enter="saveAppVersion"
                      @keydown.escape="editingField = null"
                    />
                    <button @click="saveAppVersion" class="text-green-500 hover:text-green-600"><Check :size="14" /></button>
                    <button @click="editingField = null" class="text-gray-400 hover:text-gray-600"><X :size="14" /></button>
                  </div>
                  <span
                    v-else
                    class="text-sm font-medium text-gray-700 cursor-pointer hover:text-[#4857FE] transition-colors"
                    @click="startEditAppVersion"
                  >
                    {{ issue.appVersion || '\u2014' }}
                  </span>
                </div>
              </div>

              <!-- Reproducibility (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Eye :size="13" class="text-gray-400" /> Reproducibility
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors"
                    @click="showReproducibilityDropdown = !showReproducibilityDropdown; showStatusDropdown = false; showSeverityDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showEnvironmentDropdown = false; showBrowserDropdown = false; showOsDropdown = false"
                  >
                    {{ issue.reproducibility ? label(issue.reproducibility) : '\u2014' }}
                    <ChevronDown :size="12" />
                  </button>
                  <div
                    v-if="showReproducibilityDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[200px]"
                  >
                    <button
                      v-for="opt in reproducibilityOptions"
                      :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="issue.reproducibility === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectReproducibility(opt.value)"
                    >
                      {{ opt.label }}
                      <Check v-if="issue.reproducibility === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Environment (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Globe :size="13" class="text-gray-400" /> Environment
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors"
                    @click="showEnvironmentDropdown = !showEnvironmentDropdown; showStatusDropdown = false; showSeverityDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showReproducibilityDropdown = false; showBrowserDropdown = false; showOsDropdown = false"
                  >
                    {{ issue.environment ? label(issue.environment) : '\u2014' }}
                    <ChevronDown :size="12" />
                  </button>
                  <div
                    v-if="showEnvironmentDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]"
                  >
                    <button
                      v-for="opt in environmentOptions"
                      :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="issue.environment === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectEnvironment(opt.value)"
                    >
                      {{ opt.label }}
                      <Check v-if="issue.environment === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Browser (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Monitor :size="13" class="text-gray-400" /> Browser
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors"
                    @click="showBrowserDropdown = !showBrowserDropdown; showStatusDropdown = false; showSeverityDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showReproducibilityDropdown = false; showEnvironmentDropdown = false; showOsDropdown = false"
                  >
                    {{ issue.browser ? label(issue.browser) : '\u2014' }}
                    <ChevronDown :size="12" />
                  </button>
                  <div
                    v-if="showBrowserDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]"
                  >
                    <button
                      v-for="opt in browserOptions"
                      :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="issue.browser === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectBrowser(opt.value)"
                    >
                      {{ opt.label }}
                      <Check v-if="issue.browser === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- OS (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Smartphone :size="13" class="text-gray-400" /> OS
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors"
                    @click="showOsDropdown = !showOsDropdown; showStatusDropdown = false; showSeverityDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showReproducibilityDropdown = false; showEnvironmentDropdown = false; showBrowserDropdown = false"
                  >
                    {{ issue.operatingSystem ? label(issue.operatingSystem) : '\u2014' }}
                    <ChevronDown :size="12" />
                  </button>
                  <div
                    v-if="showOsDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]"
                  >
                    <button
                      v-for="opt in osOptions"
                      :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="issue.operatingSystem === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectOs(opt.value)"
                    >
                      {{ opt.label }}
                      <Check v-if="issue.operatingSystem === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Created -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-28 shrink-0 flex items-center gap-1.5">
                  <Clock :size="13" class="text-gray-400" /> Created
                </span>
                <span class="text-sm text-gray-500">{{ formatDate(issue.createdAt) }}</span>
              </div>

            </div>
          </div>

          <!-- Sticky Tabs -->
          <div class="sticky top-[44px] z-10 bg-white border-t border-b border-gray-100">
            <div class="flex px-6 gap-0">
              <button
                v-for="tab in ([
                  { key: 'description', label: 'Description', icon: FileText, count: 0 },
                  { key: 'reproduction', label: 'Reproduction', icon: Bug, count: 0 },
                  { key: 'comments', label: 'Comments', icon: MessageSquare, count: comments.length },
                  { key: 'attachments', label: 'Attachments', icon: Paperclip, count: attachments.length },
                  { key: 'activities', label: 'Activities', icon: History, count: 0 },
                ] as const)"
                :key="tab.key"
                class="px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer"
                :class="activeTab === tab.key
                  ? 'text-[#F97316] border-[#F97316]'
                  : 'text-gray-400 border-transparent hover:text-gray-600'"
                @click="activeTab = tab.key as any; tab.key === 'activities' && issue && loadActivities(issue.id); tab.key === 'attachments' && issue && loadAttachments(issue.id); tab.key === 'comments' && issue && loadComments(issue.id)"
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

            <!-- Description Tab -->
            <template v-if="activeTab === 'description'">
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
                    rows="6"
                    class="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 leading-relaxed"
                    placeholder="Add a description..."
                    @keydown.escape="editingField = null"
                  ></textarea>
                  <div class="flex items-center gap-2 mt-2">
                    <button class="px-3 py-1 text-xs font-medium text-white bg-[#4857FE] rounded-md hover:bg-[#3a46d9] transition-colors cursor-pointer" @click="saveDescription">Save</button>
                    <button class="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer" @click="editingField = null">Cancel</button>
                  </div>
                </div>
                <p v-else-if="issue.description" class="text-sm text-gray-600 leading-relaxed cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors whitespace-pre-wrap" @click="startEditDescription">
                  {{ issue.description }}
                </p>
                <p v-else class="text-sm text-gray-400 italic cursor-pointer hover:text-[#4857FE] transition-colors" @click="startEditDescription">
                  Click to add a description...
                </p>
              </div>
            </template>

            <!-- Reproduction Tab -->
            <template v-if="activeTab === 'reproduction'">
              <!-- Steps to Reproduce -->
              <div class="py-3" @click.stop>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Steps to Reproduce</span>
                  <button
                    v-if="editingField !== 'stepsToReproduce'"
                    class="text-xs text-gray-400 hover:text-[#4857FE] transition-colors cursor-pointer"
                    @click="startEditStepsToReproduce"
                  >Edit</button>
                </div>
                <div v-if="editingField === 'stepsToReproduce'">
                  <textarea
                    v-model="editStepsToReproduce"
                    rows="5"
                    class="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 leading-relaxed"
                    placeholder="1. Go to...\n2. Click on...\n3. Observe..."
                    @keydown.escape="editingField = null"
                  ></textarea>
                  <div class="flex items-center gap-2 mt-2">
                    <button class="px-3 py-1 text-xs font-medium text-white bg-[#4857FE] rounded-md hover:bg-[#3a46d9] transition-colors cursor-pointer" @click="saveStepsToReproduce">Save</button>
                    <button class="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer" @click="editingField = null">Cancel</button>
                  </div>
                </div>
                <p v-else-if="issue.stepsToReproduce" class="text-sm text-gray-600 leading-relaxed cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors whitespace-pre-wrap" @click="startEditStepsToReproduce">
                  {{ issue.stepsToReproduce }}
                </p>
                <p v-else class="text-sm text-gray-400 italic cursor-pointer hover:text-[#4857FE] transition-colors" @click="startEditStepsToReproduce">
                  Click to add steps to reproduce...
                </p>
              </div>

              <!-- Expected Behavior -->
              <div class="py-3 border-t border-gray-100" @click.stop>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expected Behavior</span>
                  <button
                    v-if="editingField !== 'expectedBehavior'"
                    class="text-xs text-gray-400 hover:text-[#4857FE] transition-colors cursor-pointer"
                    @click="startEditExpectedBehavior"
                  >Edit</button>
                </div>
                <div v-if="editingField === 'expectedBehavior'">
                  <textarea
                    v-model="editExpectedBehavior"
                    rows="4"
                    class="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 leading-relaxed"
                    placeholder="What should happen..."
                    @keydown.escape="editingField = null"
                  ></textarea>
                  <div class="flex items-center gap-2 mt-2">
                    <button class="px-3 py-1 text-xs font-medium text-white bg-[#4857FE] rounded-md hover:bg-[#3a46d9] transition-colors cursor-pointer" @click="saveExpectedBehavior">Save</button>
                    <button class="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer" @click="editingField = null">Cancel</button>
                  </div>
                </div>
                <div v-else-if="issue.expectedBehavior" class="bg-green-50 rounded-lg p-3 cursor-pointer hover:bg-green-100/70 transition-colors" @click="startEditExpectedBehavior">
                  <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ issue.expectedBehavior }}</p>
                </div>
                <p v-else class="text-sm text-gray-400 italic cursor-pointer hover:text-[#4857FE] transition-colors" @click="startEditExpectedBehavior">
                  Click to add expected behavior...
                </p>
              </div>

              <!-- Actual Behavior -->
              <div class="py-3 border-t border-gray-100" @click.stop>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Actual Behavior</span>
                  <button
                    v-if="editingField !== 'actualBehavior'"
                    class="text-xs text-gray-400 hover:text-[#4857FE] transition-colors cursor-pointer"
                    @click="startEditActualBehavior"
                  >Edit</button>
                </div>
                <div v-if="editingField === 'actualBehavior'">
                  <textarea
                    v-model="editActualBehavior"
                    rows="4"
                    class="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 leading-relaxed"
                    placeholder="What actually happens..."
                    @keydown.escape="editingField = null"
                  ></textarea>
                  <div class="flex items-center gap-2 mt-2">
                    <button class="px-3 py-1 text-xs font-medium text-white bg-[#4857FE] rounded-md hover:bg-[#3a46d9] transition-colors cursor-pointer" @click="saveActualBehavior">Save</button>
                    <button class="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer" @click="editingField = null">Cancel</button>
                  </div>
                </div>
                <div v-else-if="issue.actualBehavior" class="bg-red-50 rounded-lg p-3 cursor-pointer hover:bg-red-100/70 transition-colors" @click="startEditActualBehavior">
                  <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ issue.actualBehavior }}</p>
                </div>
                <p v-else class="text-sm text-gray-400 italic cursor-pointer hover:text-[#4857FE] transition-colors" @click="startEditActualBehavior">
                  Click to add actual behavior...
                </p>
              </div>

              <!-- Linked Story / Task -->
              <div v-if="issue.storyId || issue.taskId" class="py-3 border-t border-gray-100">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Linked Items</span>
                <div class="space-y-1.5">
                  <div v-if="issue.storyId" class="flex items-center gap-2 text-sm text-gray-600">
                    <FileText :size="13" class="text-gray-400" />
                    <span class="text-xs text-gray-400">Story:</span>
                    <span class="text-xs font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">STY-{{ issue.storyId.slice(-5).toUpperCase() }}</span>
                  </div>
                  <div v-if="issue.taskId" class="flex items-center gap-2 text-sm text-gray-600">
                    <FileText :size="13" class="text-gray-400" />
                    <span class="text-xs text-gray-400">Task:</span>
                    <span class="text-xs font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{{ issue.taskId.slice(-5).toUpperCase() }}</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- Comments Tab -->
            <template v-if="activeTab === 'comments'">
              <div v-if="commentsLoading" class="flex items-center justify-center py-8">
                <Loader2 :size="18" class="animate-spin text-gray-400" />
              </div>
              <template v-else>
                <div v-if="comments.length === 0" class="text-center py-8">
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
                            <!-- Delete button -->
                            <button
                              class="p-0.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover/comment:opacity-100 transition-all ml-auto cursor-pointer"
                              title="Delete comment"
                              @click="deleteComment(comment.id)"
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
            </template>

            <!-- Attachments Tab -->
            <template v-if="activeTab === 'attachments'">
              <div>
                <!-- Drop zone -->
                <div
                  class="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer mb-4"
                  :class="isDragging
                    ? 'border-[#4857FE] bg-[#4857FE]/5'
                    : 'border-gray-200 hover:border-gray-300 bg-gray-50/50 hover:bg-gray-50'"
                  @dragover="onDragOver"
                  @dragleave="onDragLeave"
                  @drop="onDrop"
                  @click="fileInputRef?.click()"
                >
                  <input
                    ref="fileInputRef"
                    type="file"
                    multiple
                    class="hidden"
                    @change="onFileSelect"
                  />
                  <div v-if="uploadingFiles" class="flex flex-col items-center gap-2">
                    <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
                    <p class="text-sm text-[#4857FE] font-medium">Uploading...</p>
                  </div>
                  <div v-else class="flex flex-col items-center gap-2">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center" :class="isDragging ? 'bg-[#4857FE]/10' : 'bg-gray-100'">
                      <Upload :size="20" :class="isDragging ? 'text-[#4857FE]' : 'text-gray-400'" />
                    </div>
                    <div>
                      <p class="text-sm font-medium" :class="isDragging ? 'text-[#4857FE]' : 'text-gray-600'">
                        {{ isDragging ? 'Drop files here' : 'Drop files or click to upload' }}
                      </p>
                      <p class="text-xs text-gray-400 mt-0.5">Images, documents, or any file type</p>
                    </div>
                  </div>
                </div>

                <!-- Loading -->
                <div v-if="attachmentsLoading" class="flex items-center justify-center py-6">
                  <Loader2 :size="18" class="animate-spin text-gray-400" />
                </div>

                <!-- Attachment list -->
                <div v-else-if="attachments.length > 0" class="space-y-2">
                  <div
                    v-for="att in attachments"
                    :key="att.id"
                    class="bg-gray-50 rounded-lg border border-gray-100 p-3 flex items-center gap-3 group/att hover:bg-gray-100/70 transition-colors"
                  >
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                      :class="isImageFile(att.mimeType) ? 'bg-gray-200' : 'bg-blue-50'"
                    >
                      <img
                        v-if="isImageFile(att.mimeType)"
                        :src="att.filePath"
                        :alt="att.fileName"
                        class="w-10 h-10 object-cover rounded-lg"
                      />
                      <component v-else :is="fileIcon(att.mimeType)" :size="18" class="text-blue-500" />
                    </div>

                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-800 truncate">{{ att.fileName }}</p>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-[10px] text-gray-400">{{ formatFileSize(att.fileSize) }}</span>
                        <span class="text-[10px] text-gray-300">&middot;</span>
                        <span class="text-[10px] text-gray-400">{{ att.user?.name || 'Unknown' }}</span>
                        <span class="text-[10px] text-gray-300">&middot;</span>
                        <span class="text-[10px] text-gray-400">{{ formatRelativeTime(att.createdAt) }}</span>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover/att:opacity-100 transition-opacity">
                      <a
                        :href="att.filePath"
                        target="_blank"
                        download
                        class="p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Download"
                        @click.stop
                      >
                        <Download :size="13" />
                      </a>
                      <button
                        class="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                        @click="deleteAttachment(att.id)"
                        :disabled="deletingAttachmentId === att.id"
                      >
                        <Loader2 v-if="deletingAttachmentId === att.id" :size="13" class="animate-spin" />
                        <Trash2 v-else :size="13" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Empty state -->
                <div v-else class="text-center py-4">
                  <p class="text-xs text-gray-400">No attachments yet</p>
                </div>
              </div>
            </template>

            <!-- Activities Tab -->
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
                            <!-- Row 1: User name + Time -->
                            <div class="flex items-center justify-between">
                              <div class="flex items-center gap-1.5 min-w-0">
                                <span class="text-sm font-semibold text-gray-900">{{ activity.userName }}</span>
                              </div>
                              <span class="text-[11px] text-gray-400 shrink-0 ml-2">{{ formatRelativeTime(activity.createdAt) }}</span>
                            </div>

                            <!-- Row 2: Action box -->
                            <div class="mt-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                              <!-- Created -->
                              <div v-if="activity.action === 'created'" class="flex items-center gap-2">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#00c875] shrink-0"></span>
                                <span class="text-xs font-medium text-gray-600">Issue created</span>
                              </div>
                              <!-- Deleted -->
                              <div v-else-if="activity.action === 'deleted'" class="flex items-center gap-2">
                                <span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                                <span class="text-xs font-medium text-gray-600">Issue deleted</span>
                              </div>
                              <!-- Updated -- descriptive change lines -->
                              <div v-else-if="activity.changes && activity.changes.length > 0" class="space-y-2">
                                <div v-for="(change, ci) in activity.changes" :key="ci" class="flex items-start gap-2">
                                  <component :is="changeFieldIcon(change.field)" :size="12" class="shrink-0 mt-0.5" :class="changeIconColor(change)" />
                                  <div class="text-xs text-gray-600 min-w-0">
                                    <span class="font-medium">{{ changeDescription(change) }}</span>

                                    <!-- Status: colored pill badges from -> to -->
                                    <template v-if="change.field === 'status'">
                                      <span
                                        v-if="change.from"
                                        class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ml-1 align-middle"
                                        :class="statusStyle(change.from)"
                                      >{{ activityFormatField(change.from) }}</span>
                                      <span v-if="change.from && change.to" class="text-gray-300 mx-0.5 align-middle">&rarr;</span>
                                      <span
                                        v-if="change.to"
                                        class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold align-middle"
                                        :class="statusStyle(change.to)"
                                      >{{ activityFormatField(change.to) }}</span>
                                    </template>

                                    <!-- All other fields: from -> to as text badges (skip long text fields) -->
                                    <template v-else-if="change.field !== 'description' && change.field !== 'stepsToReproduce' && change.field !== 'expectedBehavior' && change.field !== 'actualBehavior'">
                                      <span v-if="change.from" class="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-medium ml-1 align-middle">{{ activityFormatField(change.from) }}</span>
                                      <span v-if="change.from && change.to" class="text-gray-300 mx-0.5 align-middle">&rarr;</span>
                                      <span v-if="change.to" class="inline-flex items-center px-1.5 py-0.5 rounded bg-[#4857FE]/10 text-[#4857FE] text-[10px] font-medium align-middle">{{ activityFormatField(change.to) }}</span>
                                    </template>
                                  </div>
                                </div>
                              </div>
                              <!-- Fallback -->
                              <div v-else class="flex items-center gap-2">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#579bfc] shrink-0"></span>
                                <span class="text-xs font-medium text-gray-600">{{ label(activity.action) }} issue</span>
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
