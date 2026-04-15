<script setup lang="ts">
import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import {
  X, Maximize2, Copy, MoreHorizontal, ArrowLeft,
  Palette, Code2, TestTube2, Eye, FlaskConical, Wrench, Rocket,
  CalendarDays, User2, AlertTriangle, Link2, Clock,
  MessageSquare, History, Paperclip, ListTree, Send,
  Circle, CheckCircle2, Loader2, ChevronDown, Trash2,
  Search, Check, Archive, Plus,
  Signal, FileText, Type, Tag, CalendarClock, Link,
  Users, User, UserCheck, ShieldAlert, Hourglass,
  Upload, FileIcon, ImageIcon, Download,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useBacklogStore } from '@/stores/backlog'
import { useProductStore } from '@/stores/products'
import TaskStatusIcon from '@/components/shared/TaskStatusIcon.vue'
import { useAuthStore } from '@/stores/auth'
import type { Task, TaskSubtask, TaskStatus, TaskType, TaskPriority, TaskComment, TaskAttachment } from '@/types/backlog'
import SubtaskDetailDialog from '@/components/delivery/SubtaskDetailDialog.vue'
import { resolveApiPath } from '@/utils/uploadAssetUrl'
import {
  partitionAllowedAttachmentFiles,
  ATTACHMENT_FILE_ACCEPT,
  ALLOWED_ATTACHMENT_TYPES_HINT,
} from '@/utils/allowedAttachments'
import { toast } from 'vue-sonner'
import { useCopyLink } from '@/utils/useCopyLink'
import { buildEntityShareUrl, mergeProductIntoShareQuery, productShareContextFromProductName } from '@/utils/productDeepLink'
import MentionTextarea from '@/components/comments/MentionTextarea.vue'
import FormattedCommentContent from '@/components/comments/FormattedCommentContent.vue'
import type { MentionUser } from '@/lib/commentMentions'

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
  task: Task | null
  open: boolean
  teamMembers: TeamUser[]
  fromStoryId?: string | null
}>()

const emit = defineEmits<{
  close: []
  updated: []
}>()

const router = useRouter()
const { copied, copyLink } = useCopyLink()
const backlogStore = useBacklogStore()
const productStore = useProductStore()
const authStore = useAuthStore()

function copyTaskLink(taskId: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const pname = productStore.activeProductScopeForApi || productStore.activeProduct?.name || ''
  const ctx = productShareContextFromProductName(
    productStore.products,
    pname,
    productStore.activeProduct || { name: pname || 'Product', projectKey: null },
  )
  copyLink(buildEntityShareUrl(origin, '/tasks', { task: taskId }, ctx))
}

function goBackToStory() {
  emit('close')
  const sid = props.fromStoryId
  if (!sid) return
  const story = backlogStore.stories.find(s => s.id === sid)
  const pname = story?.product || productStore.activeProductScopeForApi || productStore.activeProduct?.name || ''
  const ctx = productShareContextFromProductName(
    productStore.products,
    pname,
    productStore.activeProduct || { name: pname || 'Product', projectKey: null },
  )
  router.push({ path: '/stories', query: mergeProductIntoShareQuery({ story: sid }, ctx) })
}

// Active tab
const activeTab = ref<'comments' | 'activities' | 'dependencies' | 'attachments'>('comments')

// Comments
const comments = ref<TaskComment[]>([])
const commentsLoading = ref(false)
const newComment = ref('')
const sendingComment = ref(false)
const deletingCommentId = ref<string | null>(null)

// Activities
const activities = ref<Activity[]>([])
const activitiesLoading = ref(false)

// ============ EDITING STATE ============
const editingField = ref<string | null>(null)
const editTitle = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const deletingTask = ref(false)

// Dropdown states
const showStatusDropdown = ref(false)
const showPriorityDropdown = ref(false)
const showTypeDropdown = ref(false)
const showAssigneeDropdown = ref(false)
const showOwnerDropdown = ref(false)
const showReviewerDropdown = ref(false)
const showStoryDropdown = ref(false)
const assigneeSearch = ref('')
const ownerSearch = ref('')
const reviewerSearch = ref('')
const storySearchQuery = ref('')

// Due date editing
const editDueDate = ref('')

// Estimate editing
const editEstimate = ref('')

// Blocked reason editing
const editBlockedReason = ref('')

// Description editing
const editDescription = ref('')

// Options
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

// Story search
const filteredStories = computed(() => {
  const q = storySearchQuery.value.toLowerCase().trim()
  if (!q) return backlogStore.stories
  return backlogStore.stories.filter(s => s.title.toLowerCase().includes(q))
})

const currentStory = computed(() => {
  if (!props.task?.storyId) return null
  return backlogStore.stories.find(s => s.id === props.task!.storyId) || null
})

const mentionUsers = computed<MentionUser[]>(() =>
  props.teamMembers.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
  })),
)

const mentionUsersForDisplay = computed<MentionUser[]>(() => {
  const map = new Map<string, MentionUser>()
  const add = (u: { id: string; name: string; email: string; avatar: string | null }) => {
    map.set(u.id.toLowerCase(), {
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
    })
  }
  for (const u of mentionUsers.value) add(u)
  for (const c of comments.value) {
    if (c.user?.id) add(c.user)
  }
  return [...map.values()]
})

function storyStatusDot(status: string) {
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

async function selectStory(storyId: string) {
  storySearchQuery.value = ''
  showStoryDropdown.value = false
  await updateTaskField('storyId', storyId)
}

const filteredTeamMembers = computed(() => {
  const q = assigneeSearch.value.toLowerCase().trim()
  if (!q) return props.teamMembers
  return props.teamMembers.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  )
})

const filteredOwnerMembers = computed(() => {
  const q = ownerSearch.value.toLowerCase().trim()
  if (!q) return props.teamMembers
  return props.teamMembers.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  )
})

const filteredReviewerMembers = computed(() => {
  const q = reviewerSearch.value.toLowerCase().trim()
  if (!q) return props.teamMembers
  return props.teamMembers.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  )
})

// ============ DATA LOADING ============

const attachmentPreviewUrls = ref<Record<string, string>>({})
const downloadingAttachmentId = ref<string | null>(null)

function revokeAllAttachmentPreviewUrls() {
  for (const url of Object.values(attachmentPreviewUrls.value)) {
    try {
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }
  attachmentPreviewUrls.value = {}
}

// Load comments when task changes
watch(() => props.task?.id, async (id) => {
  revokeAllAttachmentPreviewUrls()
  if (!id) return
  activeTab.value = 'comments'
  closeAllDropdowns()
  editingField.value = null
  await loadComments(id)
}, { immediate: true })

async function loadComments(taskId: string) {
  commentsLoading.value = true
  try {
    const res = await fetch(resolveApiPath(`/api/tasks/${taskId}/comments`))
    if (res.ok) {
      comments.value = await res.json()
    }
  } catch { comments.value = [] }
  finally { commentsLoading.value = false }
}

async function loadActivities(taskId: string) {
  activitiesLoading.value = true
  try {
    const res = await fetch(resolveApiPath(`/api/activities?entityId=${taskId}&limit=30`))
    if (res.ok) {
      activities.value = await res.json()
    }
  } catch { activities.value = [] }
  finally { activitiesLoading.value = false }
}

// Switch tabs and lazy-load data
watch(activeTab, (tab) => {
  if (tab === 'activities' && props.task) {
    loadActivities(props.task.id)
  }
  if (tab === 'attachments' && props.task) {
    loadAttachments(props.task.id)
  }
  // Close dependency picker when switching tabs
  showDepPicker.value = false
  depSearchQuery.value = ''
})

// ============ TASK FIELD EDITING ============

function closeAllDropdowns() {
  showStatusDropdown.value = false
  showPriorityDropdown.value = false
  showTypeDropdown.value = false
  showAssigneeDropdown.value = false
  showOwnerDropdown.value = false
  showReviewerDropdown.value = false
  showStoryDropdown.value = false
  assigneeSearch.value = ''
  ownerSearch.value = ''
  reviewerSearch.value = ''
  storySearchQuery.value = ''
}

// ─── Sub-tasks ───
const sortedSubtasks = computed(() => {
  const list = props.task?.subtasks ?? []
  return [...list].sort((a, b) =>
    a.sortOrder - b.sortOrder || String(a.createdAt).localeCompare(String(b.createdAt))
  )
})

const newSubtaskTitle = ref('')
const addingSubtask = ref(false)
const subtaskDetailOpen = ref(false)
const editingSubtask = ref<TaskSubtask | null>(null)

function openSubtaskEditor(st: TaskSubtask) {
  editingSubtask.value = st
  subtaskDetailOpen.value = true
}

function onSubtaskDialogSaved() {
  emit('updated')
}

async function addSubtask() {
  if (!props.task || !newSubtaskTitle.value.trim()) return
  addingSubtask.value = true
  try {
    await backlogStore.createSubtask(props.task.id, { title: newSubtaskTitle.value.trim() })
    newSubtaskTitle.value = ''
    emit('updated')
  } finally {
    addingSubtask.value = false
  }
}

async function removeSubtask(st: TaskSubtask) {
  if (!props.task) return
  saving.value = true
  try {
    await backlogStore.deleteSubtask(props.task.id, st.id)
    emit('updated')
  } finally {
    saving.value = false
  }
}

async function updateTaskField(field: string, value: any) {
  if (!props.task) return
  saving.value = true
  try {
    await backlogStore.updateTask(props.task.id, { [field]: value })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
    closeAllDropdowns()
  }
}

async function archiveTask() {
  if (!props.task) return
  await updateTaskField('status', 'archived')
  emit('close')
}

async function deleteTask() {
  if (!props.task || deletingTask.value) return
  if (!confirm('Delete this task? This cannot be undone.')) return
  deletingTask.value = true
  try {
    await backlogStore.deleteTask(props.task.id)
    emit('updated')
    emit('close')
  } finally {
    deletingTask.value = false
  }
}

// Title editing
function startEditTitle() {
  if (!props.task) return
  editTitle.value = props.task.title
  editingField.value = 'title'
  nextTick(() => titleInputRef.value?.focus())
}

async function saveTitle() {
  if (!editTitle.value.trim() || !props.task) {
    editingField.value = null
    return
  }
  if (editTitle.value.trim() === props.task.title) {
    editingField.value = null
    return
  }
  await updateTaskField('title', editTitle.value.trim())
}

// Status
async function selectStatus(status: TaskStatus) {
  await updateTaskField('status', status)
}

// Priority
async function selectPriority(priority: TaskPriority) {
  await updateTaskField('priority', priority)
}

// Type
async function selectType(type: TaskType) {
  await updateTaskField('type', type)
}

// Due date
function startEditDueDate() {
  if (!props.task) return
  editDueDate.value = props.task.dueAt ? (new Date(props.task.dueAt).toISOString().split('T')[0] ?? '') : ''
  editingField.value = 'dueAt'
}

async function saveDueDate() {
  await updateTaskField('dueAt', editDueDate.value || null)
}

// Estimate
function startEditEstimate() {
  if (!props.task) return
  editEstimate.value = props.task.estimateValue?.toString() || ''
  editingField.value = 'estimate'
}

async function saveEstimate() {
  const val = editEstimate.value ? parseFloat(editEstimate.value) : null
  await updateTaskField('estimateValue', val)
}

// Blocked reason
function startEditBlocked() {
  if (!props.task) return
  editBlockedReason.value = props.task.blockedReason || ''
  editingField.value = 'blocked'
}

async function saveBlocked() {
  await updateTaskField('blockedReason', editBlockedReason.value.trim() || null)
}

// Description
function startEditDescription() {
  if (!props.task) return
  editDescription.value = props.task.description || ''
  editingField.value = 'description'
}

async function saveDescription() {
  if (!props.task) return
  if (editDescription.value === (props.task.description || '')) {
    editingField.value = null
    return
  }
  await updateTaskField('description', editDescription.value || null)
}

// Assignees
async function toggleAssignee(userId: string) {
  if (!props.task) return
  const current = props.task.assigneeUserIds || []
  const newList = current.includes(userId)
    ? current.filter(id => id !== userId)
    : [...current, userId]
  await updateTaskField('assigneeUserIds', newList.length > 0 ? newList : null)
}

function isAssigned(userId: string): boolean {
  return props.task?.assigneeUserIds?.includes(userId) ?? false
}

// Owner
async function selectOwner(userId: string) {
  await updateTaskField('ownerUserId', userId)
}

async function clearOwner() {
  await updateTaskField('ownerUserId', null)
}

// Reviewers
async function toggleReviewer(userId: string) {
  if (!props.task) return
  const current = props.task.reviewerUserIds || []
  const newList = current.includes(userId)
    ? current.filter(id => id !== userId)
    : [...current, userId]
  await updateTaskField('reviewerUserIds', newList.length > 0 ? newList : null)
}

function isReviewer(userId: string): boolean {
  return props.task?.reviewerUserIds?.includes(userId) ?? false
}

// ============ COMMENTS ============

async function submitComment() {
  if (!newComment.value.trim() || !props.task) return
  sendingComment.value = true
  try {
    const res = await fetch(resolveApiPath(`/api/tasks/${props.task.id}/comments`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ content: newComment.value.trim() }),
    })
    if (res.ok) {
      newComment.value = ''
      await loadComments(props.task.id)
    }
  } catch {}
  finally { sendingComment.value = false }
}

async function deleteComment(commentId: string) {
  if (!props.task) return
  deletingCommentId.value = commentId
  try {
    await backlogStore.deleteTaskComment(commentId)
    await loadComments(props.task.id)
  } catch {}
  finally { deletingCommentId.value = null }
}

function getUserById(id: string): TeamUser | undefined {
  return props.teamMembers.find(u => u.id === id)
}

// Dependency picker
const showDepPicker = ref(false)
const depSearchQuery = ref('')

const dependentTasks = computed(() => {
  if (!props.task?.dependent || props.task.dependent.length === 0) return []
  return props.task.dependent.map(id => {
    const found = backlogStore.allTasks.find(t => t.id === id)
    return found || { id, title: id, status: 'created' as const, missing: true }
  })
})

const depSearchResults = computed(() => {
  const q = depSearchQuery.value.toLowerCase().trim()
  const existingIds = new Set(props.task?.dependent || [])
  return backlogStore.allTasks.filter(t => {
    if (!props.task) return false
    if (t.id === props.task.id) return false
    if (existingIds.has(t.id)) return false
    if (t.status === 'archived') return false
    if (!q) return true
    return t.title.toLowerCase().includes(q)
  }).slice(0, 20)
})

function addDependency(taskId: string) {
  const current = props.task?.dependent || []
  if (current.includes(taskId)) return
  updateTaskField('dependent', [...current, taskId])
  depSearchQuery.value = ''
}

function removeDependency(taskId: string) {
  const current = props.task?.dependent || []
  const updated = current.filter(id => id !== taskId)
  updateTaskField('dependent', updated.length > 0 ? updated : null)
}

function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

function fileIcon(mimeType: string) {
  return isImageFile(mimeType) ? ImageIcon : FileIcon
}

async function hydrateAttachmentImagePreviews(items: TaskAttachment[]) {
  revokeAllAttachmentPreviewUrls()
  const imageAtts = items.filter(a => isImageFile(a.mimeType))
  if (imageAtts.length === 0) return

  const pairs = await Promise.all(
    imageAtts.map(async (att) => {
      try {
        const res = await fetch(resolveApiPath(`/api/tasks/attachments/${att.id}/download`))
        if (!res.ok) return null
        const ct = (res.headers.get('content-type') || '').toLowerCase()
        if (ct.includes('application/json')) return null
        const blob = await res.blob()
        if (blob.size === 0) return null
        return [att.id, URL.createObjectURL(blob)] as const
      } catch {
        return null
      }
    }),
  )
  const next: Record<string, string> = {}
  for (const p of pairs) {
    if (p) next[p[0]] = p[1]
  }
  attachmentPreviewUrls.value = next
}

async function downloadTaskAttachment(att: TaskAttachment) {
  downloadingAttachmentId.value = att.id
  try {
    const res = await fetch(resolveApiPath(`/api/tasks/attachments/${att.id}/download`))
    if (!res.ok) { toast.error(`Download failed (${res.status})`); return }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html')) { toast.error('Download failed: server returned HTML. Check nginx config.'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = att.fileName || 'attachment'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } finally {
    downloadingAttachmentId.value = null
  }
}

onBeforeUnmount(() => {
  revokeAllAttachmentPreviewUrls()
})

// ============ ATTACHMENTS ============
const attachments = ref<TaskAttachment[]>([])
const attachmentsLoading = ref(false)
const uploadingFiles = ref(false)
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const deletingAttachmentId = ref<string | null>(null)

async function loadAttachments(taskId: string) {
  attachmentsLoading.value = true
  attachments.value = []
  revokeAllAttachmentPreviewUrls()
  try {
    const res = await fetch(resolveApiPath(`/api/tasks/${taskId}/attachments`))
    if (res.ok) {
      attachments.value = await res.json()
      await hydrateAttachmentImagePreviews(attachments.value)
    }
  } catch {
    attachments.value = []
    revokeAllAttachmentPreviewUrls()
  } finally { attachmentsLoading.value = false }
}

async function uploadFiles(files: FileList | File[]) {
  if (!props.task || files.length === 0) return
  const { allowed, rejectedNames } = partitionAllowedAttachmentFiles(Array.from(files))
  if (rejectedNames.length > 0) {
    const preview = rejectedNames.slice(0, 3).join(', ')
    const more = rejectedNames.length > 3 ? ` (+${rejectedNames.length - 3} more)` : ''
    toast.error(`Skipped unsupported file(s): ${preview}${more}. ${ALLOWED_ATTACHMENT_TYPES_HINT}.`)
  }
  if (allowed.length === 0) return
  uploadingFiles.value = true
  try {
    for (const file of allowed) {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(resolveApiPath(`/api/tasks/${props.task.id}/attachments`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
        body: formData,
      })
      if (res.ok) {
        const att = await res.json()
        attachments.value.unshift(att)
        await hydrateAttachmentImagePreviews(attachments.value)
      } else {
        try {
          const j = await res.json()
          if (j?.error) toast.error(j.error)
        } catch { /* ignore */ }
      }
    }
  } catch {}
  finally { uploadingFiles.value = false }
}

async function deleteAttachment(attachmentId: string) {
  if (!props.task) return
  deletingAttachmentId.value = attachmentId
  try {
    await fetch(resolveApiPath(`/api/tasks/attachments/${attachmentId}`), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authStore.token}`,
      },
    })
    await loadAttachments(props.task.id)
  } catch {}
  finally { deletingAttachmentId.value = null }
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files) {
    uploadFiles(e.dataTransfer.files)
  }
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    uploadFiles(input.files)
    input.value = '' // reset
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ============ STYLING HELPERS ============

function priorityStyle(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700 border border-red-200'
    case 'medium': return 'bg-green-100 text-green-700 border border-green-200'
    case 'low': return 'bg-blue-100 text-blue-700 border border-blue-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
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

function statusDot(status: string) {
  switch (status) {
    case 'created': return 'bg-white/50'
    case 'assigned': return 'bg-white/50'
    case 'in_progress': return 'bg-white/50'
    case 'in_review': return 'bg-white/50'
    case 'done': return 'bg-white/50'
    case 'overdue': return 'bg-white/50'
    case 'blocked': return 'bg-white/50'
    default: return 'bg-white/50'
  }
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

// Group comments by date
const groupedComments = computed(() => {
  const groups: { date: string; comments: TaskComment[] }[] = []
  let currentDate = ''
  for (const c of comments.value) {
    const date = formatCommentDate(c.createdAt)
    if (date !== currentDate) {
      currentDate = date
      groups.push({ date, comments: [] })
    }
    groups[groups.length - 1]!.comments.push(c)
  }
  return groups
})

function changeLabel(field: string, from: string | null, to: string | null) {
  return `Changed ${label(field)} from "${from || '—'}" to "${to || '—'}"`
}

// Activity helpers (identical to main activity dropdown)
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

function isUserField(field: string): boolean {
  return ['ownerUserId', 'reviewerUserIds', 'assigneeUserIds', 'createdBy'].includes(field)
}

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
    case 'comment': return 'Comment'
    case 'attachment': return 'Attachment'
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
    case 'estimateValue': return Hourglass
    case 'dueAt': return CalendarClock
    case 'dependent': return Link
    case 'ownerUserId': return User
    case 'assigneeUserIds': return Users
    case 'reviewerUserIds': return UserCheck
    case 'blockedReason': return ShieldAlert
    case 'comment': return MessageSquare
    case 'attachment': return Paperclip
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

  if (change.field === 'comment') {
    if (action === 'added') return 'Added a comment'
    if (action === 'removed') return 'Removed a comment'
    return 'Updated a comment'
  }

  if (change.field === 'attachment') {
    if (action === 'added') return 'Added an attachment'
    if (action === 'removed') return 'Removed an attachment'
    return 'Updated an attachment'
  }

  if (isUserField(change.field)) {
    if (action === 'added') return `Added ${fieldLabel.toLowerCase()}`
    if (action === 'removed') return `Removed ${fieldLabel.toLowerCase()}`
    return `Updated ${fieldLabel.toLowerCase()}`
  }

  if (action === 'added') return `Set ${fieldLabel.toLowerCase()}`
  if (action === 'removed') return `Cleared ${fieldLabel.toLowerCase()}`
  return `Updated ${fieldLabel.toLowerCase()}`
}

function resolveUserValue(value: string | null): string | null {
  if (!value) return null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(value)) {
    const user = getUserById(value)
    return user?.name || value.slice(0, 8)
  }
  return activityFormatField(value)
}

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

// Close dropdowns on clicking outside
function onBackdropClick(e: MouseEvent) {
  closeAllDropdowns()
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <Transition name="panel-backdrop">
      <div
        v-if="open && task"
        class="fixed inset-0 bg-black/20 z-40"
        @click="emit('close')"
      ></div>
    </Transition>

    <!-- Slide-over Panel -->
    <Transition name="panel-slide">
      <div
        v-if="open && task"
        class="fixed top-0 right-0 bottom-0 w-[680px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200"
        @click="onBackdropClick"
      >
        <!-- Panel Header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <div class="flex items-center gap-2">
            <button
              v-if="fromStoryId"
              class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-[#4857FE] hover:bg-[#4857FE]/10 transition-colors cursor-pointer"
              @click="goBackToStory"
              title="Back to story"
            >
              <ArrowLeft :size="13" />
              Story
            </button>
            <span class="text-[11px] font-mono text-gray-400 px-1.5 py-0.5 bg-gray-50 rounded">TSK-{{ task.id.slice(-5).toUpperCase() }}</span>
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
              class="p-1 rounded-md hover:bg-gray-100 transition-colors"
              :class="copied ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'"
              title="Copy link"
              @click="copyTaskLink(task.id)"
            >
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
            </button>
            <button
              class="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"
              title="Archive task"
              @click="archiveTask"
            >
              <Archive :size="14" />
            </button>
            <button
              type="button"
              class="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
              title="Delete task"
              :disabled="deletingTask || saving"
              @click="deleteTask"
            >
              <Trash2 :size="14" />
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
                class="text-base font-bold text-gray-900 leading-snug cursor-pointer hover:text-[#4857FE] transition-colors group/title truncate"
                @click.stop="startEditTitle"
                :title="task.title"
              >
                {{ task.title }}
                <span class="text-xs text-gray-300 opacity-0 group-hover/title:opacity-100 ml-1 transition-opacity">edit</span>
              </h2>
            </div>
          </div>

          <!-- Metadata Grid -->
          <div class="px-6 pt-4 pb-4">
            <div class="space-y-3.5">
              <!-- Status (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <Clock :size="13" class="text-gray-400" /> Status
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                    :class="statusStyle(task.status)"
                    @click="showStatusDropdown = !showStatusDropdown; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showOwnerDropdown = false; showReviewerDropdown = false"
                  >
                    {{ label(task.status) }}
                    <ChevronDown :size="12" />
                  </button>
                  <div
                    v-if="showStatusDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]"
                  >
                    <button
                      v-for="opt in statusOptions"
                      :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 transition-colors"
                      @click="selectStatus(opt.value)"
                    >
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold" :class="statusStyle(opt.value)">
                        {{ opt.label }}
                      </span>
                      <Check v-if="task.status === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Priority (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <Signal :size="13" class="text-gray-400" /> Priority
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity"
                    :class="priorityStyle(task.priority)"
                    @click="showPriorityDropdown = !showPriorityDropdown; showStatusDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showOwnerDropdown = false; showReviewerDropdown = false"
                  >
                    {{ label(task.priority) }}
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
                      :class="task.priority === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectPriority(opt.value)"
                    >
                      <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" :class="priorityStyle(opt.value)">{{ opt.label }}</span>
                      <Check v-if="task.priority === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Type (dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <Circle :size="13" class="text-gray-400" /> Type
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
                    :class="task.type ? typeBadgeStyle(task.type) : 'bg-gray-50/80 text-gray-500'"
                    @click="showTypeDropdown = !showTypeDropdown; showStatusDropdown = false; showPriorityDropdown = false; showAssigneeDropdown = false; showOwnerDropdown = false; showReviewerDropdown = false"
                  >
                    <component v-if="task.type" :is="typeIcons[task.type] || Circle" :size="12" />
                    {{ task.type ? label(task.type) : 'Set type' }}
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
                      :class="task.type === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectType(opt.value)"
                    >
                      <component :is="typeIcons[opt.value] || Circle" :size="14" />
                      {{ opt.label }}
                      <Check v-if="task.type === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Story (searchable dropdown) -->
              <div class="flex items-start gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5 pt-1">
                  <ListTree :size="13" class="text-gray-400" /> Story
                </span>
                <div class="flex-1 relative" @click.stop>
                  <!-- Current story display -->
                  <div v-if="currentStory" class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full shrink-0" :class="storyStatusDot(currentStory.status)"></span>
                    <span class="text-sm text-gray-900 truncate max-w-[180px]">{{ currentStory.title }}</span>
                    <button
                      class="text-gray-400 hover:text-gray-600 shrink-0"
                      @click="showStoryDropdown = !showStoryDropdown; showStatusDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showOwnerDropdown = false; showReviewerDropdown = false"
                      title="Change story"
                    >
                      <ChevronDown :size="12" />
                    </button>
                  </div>
                  <button
                    v-else
                    class="text-sm text-gray-400 hover:text-gray-600"
                    @click="showStoryDropdown = !showStoryDropdown; showStatusDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showOwnerDropdown = false; showReviewerDropdown = false"
                  >
                    Select story
                  </button>
                  <!-- Story search dropdown -->
                  <div
                    v-if="showStoryDropdown"
                    class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 w-[280px]"
                  >
                    <div class="p-2 border-b border-gray-100">
                      <div class="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-md">
                        <Search :size="13" class="text-gray-400 shrink-0" />
                        <input
                          v-model="storySearchQuery"
                          class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                          placeholder="Search stories..."
                          autofocus
                        />
                      </div>
                    </div>
                    <div class="max-h-[200px] overflow-auto py-1">
                      <button
                        v-for="story in filteredStories.slice(0, 15)"
                        :key="story.id"
                        class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                        @click="selectStory(story.id)"
                      >
                        <span class="w-2 h-2 rounded-full shrink-0" :class="storyStatusDot(story.status)"></span>
                        <span class="text-sm text-gray-900 truncate">{{ story.title }}</span>
                        <Check v-if="task.storyId === story.id" :size="14" class="ml-auto text-[#4857FE] shrink-0" />
                      </button>
                      <p v-if="filteredStories.length === 0" class="text-xs text-gray-400 text-center py-3">No stories found</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Owner (single-select dropdown with search) -->
              <div class="flex items-start gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5 pt-1">
                  <User2 :size="13" class="text-gray-400" /> Owner
                </span>
                <div class="flex-1" @click.stop>
                  <div class="flex items-center gap-2 flex-wrap">
                    <template v-if="task.ownerUserId">
                      <div
                        class="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-2 py-1 group/owner"
                      >
                        <div class="w-5 h-5 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <UploadAssetImg v-if="getUserById(task.ownerUserId)?.avatar" :src="getUserById(task.ownerUserId)!.avatar!" class="w-5 h-5 rounded-full object-cover" />
                          <span v-else>{{ (getUserById(task.ownerUserId)?.name || '?')[0] }}</span>
                        </div>
                        <span class="text-xs font-medium text-gray-700">{{ getUserById(task.ownerUserId)?.name || 'Unknown' }}</span>
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
                      @click="showOwnerDropdown = !showOwnerDropdown; showStatusDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showAssigneeDropdown = false; showReviewerDropdown = false; ownerSearch = ''"
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
                          v-model="ownerSearch"
                          class="text-xs bg-transparent outline-none w-full placeholder-gray-400"
                          placeholder="Search team members..."
                        />
                      </div>
                    </div>
                    <div class="max-h-[200px] overflow-auto py-1">
                      <button
                        v-for="member in filteredOwnerMembers"
                        :key="member.id"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        @click="selectOwner(member.id)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ member.name[0] }}</span>
                        </div>
                        <div class="flex-1 text-left min-w-0">
                          <p class="text-sm text-gray-700 truncate">{{ member.name }}</p>
                          <p class="text-[10px] text-gray-400 truncate">{{ member.email }}</p>
                        </div>
                        <Check v-if="task.ownerUserId === member.id" :size="14" class="text-[#4857FE] shrink-0" />
                      </button>
                      <p v-if="filteredOwnerMembers.length === 0" class="text-xs text-gray-400 text-center py-3">No members found</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Assignees (multi-select dropdown with search) -->
              <div class="flex items-start gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5 pt-1">
                  <User2 :size="13" class="text-gray-400" /> Assignees
                </span>
                <div class="flex-1" @click.stop>
                  <div class="flex items-center gap-2 flex-wrap">
                    <template v-if="task.assigneeUserIds && task.assigneeUserIds.length > 0">
                      <div
                        v-for="uid in task.assigneeUserIds"
                        :key="uid"
                        class="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-2 py-1 group/assignee"
                      >
                        <div class="w-5 h-5 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <UploadAssetImg v-if="getUserById(uid)?.avatar" :src="getUserById(uid)!.avatar!" class="w-5 h-5 rounded-full object-cover" />
                          <span v-else>{{ (getUserById(uid)?.name || '?')[0] }}</span>
                        </div>
                        <span class="text-xs font-medium text-gray-700">{{ getUserById(uid)?.name || 'Unknown' }}</span>
                        <button
                          class="text-gray-300 hover:text-red-500 opacity-0 group-hover/assignee:opacity-100 transition-all ml-0.5"
                          @click="toggleAssignee(uid)"
                          title="Remove assignee"
                        >
                          <X :size="10" />
                        </button>
                      </div>
                    </template>
                    <span v-else class="text-xs text-gray-400">Unassigned</span>
                    <button
                      class="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-[#4857FE] hover:text-[#4857FE] transition-colors"
                      @click="showAssigneeDropdown = !showAssigneeDropdown; showStatusDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showOwnerDropdown = false; showReviewerDropdown = false; assigneeSearch = ''"
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
                          v-model="assigneeSearch"
                          class="text-xs bg-transparent outline-none w-full placeholder-gray-400"
                          placeholder="Search team members..."
                        />
                      </div>
                    </div>
                    <div class="max-h-[200px] overflow-auto py-1">
                      <button
                        v-for="member in filteredTeamMembers"
                        :key="member.id"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        @click="toggleAssignee(member.id)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ member.name[0] }}</span>
                        </div>
                        <div class="flex-1 text-left min-w-0">
                          <p class="text-sm text-gray-700 truncate">{{ member.name }}</p>
                          <p class="text-[10px] text-gray-400 truncate">{{ member.email }}</p>
                        </div>
                        <Check v-if="isAssigned(member.id)" :size="14" class="text-[#4857FE] shrink-0" />
                      </button>
                      <p v-if="filteredTeamMembers.length === 0" class="text-xs text-gray-400 text-center py-3">No members found</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Reviewers (multi-select dropdown with search) -->
              <div class="flex items-start gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5 pt-1">
                  <User2 :size="13" class="text-gray-400" /> Reviewers
                </span>
                <div class="flex-1" @click.stop>
                  <div class="flex items-center gap-2 flex-wrap">
                    <template v-if="task.reviewerUserIds && task.reviewerUserIds.length > 0">
                      <div
                        v-for="uid in task.reviewerUserIds"
                        :key="uid"
                        class="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-2 py-1 group/reviewer"
                      >
                        <div class="w-5 h-5 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <UploadAssetImg v-if="getUserById(uid)?.avatar" :src="getUserById(uid)!.avatar!" class="w-5 h-5 rounded-full object-cover" />
                          <span v-else>{{ (getUserById(uid)?.name || '?')[0] }}</span>
                        </div>
                        <span class="text-xs font-medium text-gray-700">{{ getUserById(uid)?.name || 'Unknown' }}</span>
                        <button
                          class="text-gray-300 hover:text-red-500 opacity-0 group-hover/reviewer:opacity-100 transition-all ml-0.5"
                          @click="toggleReviewer(uid)"
                          title="Remove reviewer"
                        >
                          <X :size="10" />
                        </button>
                      </div>
                    </template>
                    <span v-else class="text-xs text-gray-400">No reviewers</span>
                    <button
                      class="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-[#4857FE] hover:text-[#4857FE] transition-colors"
                      @click="showReviewerDropdown = !showReviewerDropdown; showStatusDropdown = false; showPriorityDropdown = false; showTypeDropdown = false; showOwnerDropdown = false; showAssigneeDropdown = false; reviewerSearch = ''"
                    >
                      <span class="text-xs">+</span>
                    </button>
                  </div>
                  <!-- Reviewer dropdown -->
                  <div
                    v-if="showReviewerDropdown"
                    class="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 w-full max-w-[280px]"
                  >
                    <div class="p-2 border-b border-gray-100">
                      <div class="flex items-center gap-1.5 bg-gray-50 rounded-md px-2 py-1.5">
                        <Search :size="12" class="text-gray-400" />
                        <input
                          v-model="reviewerSearch"
                          class="text-xs bg-transparent outline-none w-full placeholder-gray-400"
                          placeholder="Search team members..."
                        />
                      </div>
                    </div>
                    <div class="max-h-[200px] overflow-auto py-1">
                      <button
                        v-for="member in filteredReviewerMembers"
                        :key="member.id"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        @click="toggleReviewer(member.id)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ member.name[0] }}</span>
                        </div>
                        <div class="flex-1 text-left min-w-0">
                          <p class="text-sm text-gray-700 truncate">{{ member.name }}</p>
                          <p class="text-[10px] text-gray-400 truncate">{{ member.email }}</p>
                        </div>
                        <Check v-if="isReviewer(member.id)" :size="14" class="text-[#4857FE] shrink-0" />
                      </button>
                      <p v-if="filteredReviewerMembers.length === 0" class="text-xs text-gray-400 text-center py-3">No members found</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Due Date (editable) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <CalendarDays :size="13" class="text-gray-400" /> Due date
                </span>
                <div @click.stop>
                  <div v-if="editingField === 'dueAt'" class="flex items-center gap-2">
                    <input
                      type="date"
                      v-model="editDueDate"
                      class="text-sm text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE]"
                      @keydown.enter="saveDueDate"
                      @keydown.escape="editingField = null"
                    />
                    <button @click="saveDueDate" class="text-green-500 hover:text-green-600"><Check :size="14" /></button>
                    <button @click="editingField = null" class="text-gray-400 hover:text-gray-600"><X :size="14" /></button>
                  </div>
                  <span
                    v-else
                    class="text-sm font-medium text-gray-700 cursor-pointer hover:text-[#4857FE] transition-colors"
                    @click="startEditDueDate"
                  >
                    {{ formatDate(task.dueAt) }}
                  </span>
                </div>
              </div>

              <!-- Estimate (editable) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <Link2 :size="13" class="text-gray-400" /> Estimate
                </span>
                <div @click.stop>
                  <div v-if="editingField === 'estimate'" class="flex items-center gap-2">
                    <input
                      type="number"
                      v-model="editEstimate"
                      class="text-sm text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE] w-20"
                      placeholder="Hours"
                      min="0"
                      step="0.5"
                      @keydown.enter="saveEstimate"
                      @keydown.escape="editingField = null"
                    />
                    <span class="text-xs text-gray-400">hours</span>
                    <button @click="saveEstimate" class="text-green-500 hover:text-green-600"><Check :size="14" /></button>
                    <button @click="editingField = null" class="text-gray-400 hover:text-gray-600"><X :size="14" /></button>
                  </div>
                  <span
                    v-else
                    class="text-sm font-medium text-gray-700 cursor-pointer hover:text-[#4857FE] transition-colors"
                    @click="startEditEstimate"
                  >
                    {{ task.estimateValue ? task.estimateValue + 'h' : '—' }}
                  </span>
                </div>
              </div>

              <!-- Blocked Reason (editable) -->
              <div class="flex items-start gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5 pt-0.5">
                  <AlertTriangle :size="13" class="text-red-400" /> Blocked
                </span>
                <div class="flex-1" @click.stop>
                  <div v-if="editingField === 'blocked'" class="flex items-start gap-2">
                    <input
                      v-model="editBlockedReason"
                      class="flex-1 text-sm text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE]"
                      placeholder="Describe blocker (leave empty to clear)"
                      @keydown.enter="saveBlocked"
                      @keydown.escape="editingField = null"
                    />
                    <button @click="saveBlocked" class="text-green-500 hover:text-green-600 mt-0.5"><Check :size="14" /></button>
                    <button @click="editingField = null" class="text-gray-400 hover:text-gray-600 mt-0.5"><X :size="14" /></button>
                  </div>
                  <span
                    v-else-if="task.blockedReason"
                    class="text-sm text-red-600 bg-red-50 px-2.5 py-1 rounded-md cursor-pointer hover:bg-red-100 transition-colors inline-block"
                    @click="startEditBlocked"
                  >
                    {{ task.blockedReason }}
                  </span>
                  <span
                    v-else
                    class="text-sm text-gray-400 cursor-pointer hover:text-[#4857FE] transition-colors"
                    @click="startEditBlocked"
                  >
                    —
                  </span>
                </div>
              </div>
            </div>

            <!-- Description (editable) -->
            <div class="mt-5 pt-4 border-t border-gray-100" @click.stop>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</span>
                <button
                  v-if="editingField !== 'description'"
                  class="text-xs text-gray-400 hover:text-[#4857FE] transition-colors"
                  @click="startEditDescription"
                >
                  Edit
                </button>
              </div>
              <div v-if="editingField === 'description'">
                <textarea
                  v-model="editDescription"
                  rows="4"
                  class="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 outline-none resize-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 leading-relaxed"
                  placeholder="Add a description..."
                  @keydown.escape="editingField = null"
                ></textarea>
                <div class="flex items-center gap-2 mt-2">
                  <button
                    class="px-3 py-1 text-xs font-medium text-white bg-[#4857FE] rounded-md hover:bg-[#3a46d9] transition-colors"
                    @click="saveDescription"
                  >Save</button>
                  <button
                    class="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                    @click="editingField = null"
                  >Cancel</button>
                </div>
              </div>
              <p v-else-if="task.description" class="text-sm text-gray-600 leading-relaxed cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors" @click="startEditDescription">
                {{ task.description }}
              </p>
              <p v-else class="text-sm text-gray-400 italic cursor-pointer hover:text-[#4857FE] transition-colors" @click="startEditDescription">
                Click to add a description...
              </p>
            </div>

            <!-- Sub-tasks -->
            <div class="mt-5 pt-4 border-t border-gray-100" @click.stop>
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <ListTree :size="14" class="text-gray-400" /> Sub-tasks
                </h3>
              </div>
              <p class="text-[11px] text-gray-500 mb-2">Click a row to view or edit all fields.</p>
              <div class="space-y-2">
                <div
                  v-for="st in sortedSubtasks"
                  :key="st.id"
                  class="flex items-stretch gap-2"
                >
                  <button
                    type="button"
                    class="flex-1 min-w-0 text-left rounded-lg border border-gray-100 bg-gray-50/40 px-3 py-2 flex items-center gap-2 hover:border-[#4857FE]/50 hover:bg-white transition-colors"
                    @click="openSubtaskEditor(st)"
                  >
                    <span class="flex-1 truncate text-sm font-medium text-gray-900">{{ st.title }}</span>
                    <span
                      class="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 capitalize"
                      :class="statusStyle(st.status)"
                    >{{ label(st.status) }}</span>
                    <span
                      class="text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0"
                      :class="priorityStyle(st.priority)"
                    >{{ st.priority }}</span>
                    <span v-if="st.assigneeUserIds?.length" class="text-[10px] text-gray-500 shrink-0">{{ st.assigneeUserIds.length }} assignee(s)</span>
                  </button>
                  <button
                    type="button"
                    class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                    title="Delete sub-task"
                    @click.stop="removeSubtask(st)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
              <div class="mt-3 flex items-center gap-2">
                <input
                  v-model="newSubtaskTitle"
                  type="text"
                  placeholder="New sub-task title…"
                  class="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#4857FE]"
                  @keydown.enter="addSubtask"
                />
                <button
                  type="button"
                  class="text-xs font-medium text-white bg-[#4857FE] hover:bg-[#3E4BDE] rounded-lg px-3 py-1.5 shrink-0 disabled:opacity-50"
                  :disabled="!newSubtaskTitle.trim() || addingSubtask"
                  @click="addSubtask"
                >
                  {{ addingSubtask ? '…' : 'Add' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Sticky Tabs (sticks below title on scroll) -->
          <div class="sticky top-[44px] z-10 bg-white border-t border-b border-gray-100">
            <div class="flex px-6 gap-0">
              <button
                v-for="tab in (['comments', 'activities', 'dependencies', 'attachments'] as const)"
                :key="tab"
                class="px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors"
                :class="activeTab === tab
                  ? 'text-[#F97316] border-[#F97316]'
                  : 'text-gray-500 border-transparent hover:text-gray-700'"
                @click="activeTab = tab"
              >
                <span class="flex items-center gap-1.5">
                  {{ tab === 'dependencies' ? 'Dependencies' : label(tab) }}
                  <span v-if="tab === 'comments' && comments.length > 0" class="text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 font-bold">{{ comments.length }}</span>
                </span>
              </button>
            </div>
          </div>

          <!-- Tab Content -->
          <div class="px-6 py-2 relative z-0">
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
                      <div class="flex-1 h-px bg-gray-200 border-dashed"></div>
                      <span class="text-[10px] font-medium text-gray-400">{{ group.date }}</span>
                      <div class="flex-1 h-px bg-gray-200 border-dashed"></div>
                    </div>
                    <!-- Comments -->
                    <div
                      v-for="comment in group.comments"
                      :key="comment.id"
                      class="py-2 group/comment relative hover:bg-gray-50/70 rounded-lg px-2 -mx-2"
                    >
                      <div class="flex items-start gap-2">
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
                          <UploadAssetImg v-if="comment.user?.avatar" :src="comment.user.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ (comment.user?.name || '?')[0] }}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-1.5">
                            <span class="text-xs font-semibold text-gray-800">{{ comment.user?.name || 'Unknown' }}</span>
                            <span class="text-[10px] text-gray-400">{{ formatCommentTime(comment.createdAt) }}</span>
                            <!-- Delete button -->
                            <button
                              class="p-0.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover/comment:opacity-100 transition-all ml-auto"
                              title="Delete comment"
                              @click="deleteComment(comment.id)"
                              :disabled="deletingCommentId === comment.id"
                            >
                              <Loader2 v-if="deletingCommentId === comment.id" :size="11" class="animate-spin" />
                              <Trash2 v-else :size="11" />
                            </button>
                          </div>
                          <div class="mt-0.5">
                            <FormattedCommentContent :text="comment.content" :users="mentionUsersForDisplay" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </template>
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
                              <span class="text-[11px] text-gray-400 shrink-0 ml-2">{{ formatRelativeTime(activity.createdAt) }}</span>
                            </div>

                            <!-- Row 2: Action box -->
                            <div class="mt-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                              <!-- Created -->
                              <div v-if="activity.action === 'created'" class="flex items-center gap-2">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#00c875] shrink-0"></span>
                                <span class="text-xs font-medium text-gray-600">Task created</span>
                              </div>
                              <!-- Deleted -->
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

                                    <!-- All other fields: from → to as text badges (skip description) -->
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
              </template>
            </template>

            <!-- Dependencies Tab -->
            <template v-if="activeTab === 'dependencies'">
              <div>
                <!-- Header -->
                <div class="flex items-center justify-between mb-3">
                  <p class="text-xs text-gray-500 uppercase font-semibold tracking-wider">
                    Depends on
                    <span v-if="dependentTasks.length > 0" class="text-gray-400 font-normal">({{ dependentTasks.length }})</span>
                  </p>
                  <button
                    v-if="!showDepPicker"
                    class="flex items-center gap-1 text-xs font-medium text-[#4857FE] hover:text-[#3E4BDE] cursor-pointer transition-colors"
                    @click="showDepPicker = true"
                  >
                    <Plus :size="14" />
                    Add
                  </button>
                </div>

                <!-- Dependency cards list -->
                <div v-if="dependentTasks.length > 0" class="space-y-2">
                  <div
                    v-for="dep in dependentTasks"
                    :key="dep.id"
                    class="bg-gray-50 rounded-lg p-2.5 flex items-center gap-2.5 group/dep border border-gray-100"
                  >
                    <template v-if="!(dep as any).missing">
                      <TaskStatusIcon :status="dep.status" :size="16" />
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">{{ dep.title }}</p>
                        <p class="text-[10px] text-gray-400 mt-0.5">{{ (dep as any).storyTitle || 'Task' }} · {{ label(dep.status) }}</p>
                      </div>
                    </template>
                    <template v-else>
                      <Link2 :size="14" class="text-gray-400 shrink-0" />
                      <div class="flex-1 min-w-0">
                        <p class="text-xs text-gray-500 font-mono truncate">{{ dep.id }}</p>
                        <p class="text-[10px] text-gray-400">Not found</p>
                      </div>
                    </template>
                    <button
                      class="p-1 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover/dep:opacity-100 transition-all shrink-0"
                      title="Remove dependency"
                      @click="removeDependency(dep.id)"
                    >
                      <X :size="12" />
                    </button>
                  </div>
                </div>

                <!-- Empty state -->
                <div v-else-if="!showDepPicker" class="text-center py-6">
                  <ListTree :size="28" class="mx-auto text-gray-200 mb-2" />
                  <p class="text-sm text-gray-400">No dependencies</p>
                  <p class="text-xs text-gray-300 mt-1">Add tasks this depends on</p>
                </div>

                <!-- Search picker -->
                <div v-if="showDepPicker" class="mt-3">
                  <div class="relative">
                    <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
                      <Search :size="14" class="text-gray-400 shrink-0" />
                      <input
                        v-model="depSearchQuery"
                        class="text-sm text-gray-700 bg-transparent outline-none w-full placeholder-gray-400"
                        placeholder="Search tasks..."
                        @keydown.escape="showDepPicker = false; depSearchQuery = ''"
                      />
                      <button
                        class="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
                        @click="showDepPicker = false; depSearchQuery = ''"
                      >
                        <X :size="14" />
                      </button>
                    </div>

                    <!-- Results dropdown -->
                    <div class="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
                      <div v-if="depSearchResults.length === 0" class="px-4 py-6 text-center">
                        <p class="text-sm text-gray-400">No tasks found</p>
                      </div>
                      <button
                        v-for="t in depSearchResults"
                        :key="t.id"
                        class="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer text-left border-b border-gray-50 last:border-0"
                        @click="addDependency(t.id)"
                      >
                        <TaskStatusIcon :status="t.status" :size="16" />
                        <div class="flex-1 min-w-0">
                          <p class="text-sm text-gray-800 truncate">{{ t.title }}</p>
                          <p class="text-[10px] text-gray-400 mt-0.5 truncate">{{ (t as any).storyTitle || 'Task' }}</p>
                        </div>
                        <span
                          class="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                          :class="statusStyle(t.status)"
                        >{{ label(t.status) }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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
                    :accept="ATTACHMENT_FILE_ACCEPT"
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
                    <!-- Thumbnail or icon -->
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                      :class="isImageFile(att.mimeType) ? 'bg-gray-200' : 'bg-blue-50'"
                    >
                      <img
                        v-if="isImageFile(att.mimeType) && attachmentPreviewUrls[att.id]"
                        :src="attachmentPreviewUrls[att.id]"
                        :alt="att.fileName"
                        class="w-10 h-10 object-cover rounded-lg"
                      />
                      <ImageIcon
                        v-else-if="isImageFile(att.mimeType)"
                        :size="18"
                        class="text-gray-400"
                      />
                      <component v-else :is="fileIcon(att.mimeType)" :size="18" class="text-blue-500" />
                    </div>

                    <!-- File info -->
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-800 truncate">{{ att.fileName }}</p>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-[10px] text-gray-400">{{ formatFileSize(att.fileSize) }}</span>
                        <span class="text-[10px] text-gray-300">·</span>
                        <span class="text-[10px] text-gray-400">{{ att.user?.name || 'Unknown' }}</span>
                        <span class="text-[10px] text-gray-300">·</span>
                        <span class="text-[10px] text-gray-400">{{ formatRelativeTime(att.createdAt) }}</span>
                      </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover/att:opacity-100 transition-opacity">
                      <button
                        type="button"
                        class="p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer disabled:opacity-40"
                        title="Download"
                        :disabled="downloadingAttachmentId === att.id"
                        @click.stop="downloadTaskAttachment(att)"
                      >
                        <Loader2 v-if="downloadingAttachmentId === att.id" :size="13" class="animate-spin" />
                        <Download v-else :size="13" />
                      </button>
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

                <!-- Empty state (only show when not loading and no attachments) -->
                <div v-else class="text-center py-4">
                  <p class="text-xs text-gray-400">No attachments yet</p>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Comment Input (only visible on comments tab) -->
        <div v-if="activeTab === 'comments'" class="border-t border-gray-100 bg-white px-5 py-3 shrink-0">
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1 border-t border-gray-100 pb-1">
              <span class="text-xs font-medium px-2 py-0.5 text-[#F97316] border-b-2 border-[#F97316] cursor-pointer">Chat</span>
              <span class="text-xs font-medium px-2 py-0.5 text-gray-400 cursor-pointer hover:text-gray-600">Note</span>
            </div>
          </div>
          <div class="mt-2 flex items-end gap-2">
            <div class="flex-1 min-w-0">
              <MentionTextarea
                v-model="newComment"
                :users="mentionUsers"
                :rows="2"
                placeholder="Write your message here..."
                @keydown.enter.exact.prevent="submitComment"
              />
            </div>
            <button
              class="p-2.5 rounded-full transition-colors shrink-0"
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
  <SubtaskDetailDialog
    v-if="task && editingSubtask"
    v-model:open="subtaskDetailOpen"
    :parent-task="task"
    mode="saved"
    :subtask="editingSubtask"
    :team-members="teamMembers"
    @saved="onSubtaskDialogSaved"
  />
</template>

<style scoped>
/* Backdrop transition */
.panel-backdrop-enter-active,
.panel-backdrop-leave-active {
  transition: opacity 0.25s ease;
}
.panel-backdrop-enter-from,
.panel-backdrop-leave-to {
  opacity: 0;
}

/* Slide transition */
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
