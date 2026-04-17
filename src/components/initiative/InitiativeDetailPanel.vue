<script setup lang="ts">
import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import {
  X, Maximize2, Copy, Loader2, ChevronDown, Check,
  Clock, CalendarDays, User2, FileText, Search,
  Upload, FileIcon, ImageIcon, Download, Trash2, Paperclip, Video,
  Plus, Minus, RotateCcw,
} from 'lucide-vue-next'
import { useInitiativesStore } from '@/stores/initiatives'
import { useAuthStore } from '@/stores/auth'
import type { Initiative, InitiativeStatus, InitiativePriority, InitiativeAttachment } from '@/types/initiative'
import { resolveApiPath } from '@/utils/uploadAssetUrl'
import {
  partitionAllowedAttachmentFiles,
  ATTACHMENT_FILE_ACCEPT,
  ALLOWED_ATTACHMENT_TYPES_HINT,
  isVideoMimeType,
} from '@/utils/allowedAttachments'
import { useAttachmentMediaPreviewZoom, MEDIA_PREVIEW_ZOOM_MAX } from '@/utils/useAttachmentMediaPreviewZoom'
import { toast } from 'vue-sonner'
import { useCopyLink } from '@/utils/useCopyLink'

interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

const props = defineProps<{
  initiative: Initiative | null
  open: boolean
  teamMembers: TeamUser[]
}>()

const emit = defineEmits<{
  close: []
  updated: []
}>()

const initiativesStore = useInitiativesStore()
const authStore = useAuthStore()
const { copied, copyLink } = useCopyLink()
const origin = typeof window !== 'undefined' ? window.location.origin : ''

// Editing state
const editingField = ref<string | null>(null)
const editTitle = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const saving = ref(false)

// Dropdown states
const showStatusDropdown = ref(false)
const showPriorityDropdown = ref(false)
const showLeaderDropdown = ref(false)
const leaderSearch = ref('')

// Edit fields
const editDescription = ref('')
const editPeriodStart = ref('')
const editPeriodEnd = ref('')

// Options
const statusOptions: { value: InitiativeStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

const priorityOptions: { value: InitiativePriority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const filteredTeamMembers = computed(() => {
  const q = leaderSearch.value.toLowerCase().trim()
  if (!q) return props.teamMembers
  return props.teamMembers.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  )
})

const attachments = ref<InitiativeAttachment[]>([])
const attachmentsLoading = ref(false)
const uploadingFiles = ref(false)
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const deletingAttachmentId = ref<string | null>(null)
const downloadingAttachmentId = ref<string | null>(null)
const attachmentPreviewUrls = ref<Record<string, string>>({})
const mediaPreviewOpen = ref(false)
const selectedMediaId = ref<string | null>(null)

function revokeAllAttachmentPreviewUrls() {
  for (const url of Object.values(attachmentPreviewUrls.value)) {
    try {
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }
  attachmentPreviewUrls.value = {}
}

function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

function attachmentThumbIcon(mimeType: string) {
  if (isImageFile(mimeType)) return ImageIcon
  if (isVideoMimeType(mimeType)) return Video
  return FileIcon
}

function thumbBgClass(mimeType: string) {
  if (isImageFile(mimeType)) return 'bg-gray-200'
  if (isVideoMimeType(mimeType)) return 'bg-violet-50'
  return 'bg-blue-50'
}

async function hydrateAttachmentImagePreviews(items: InitiativeAttachment[]) {
  revokeAllAttachmentPreviewUrls()
  const mediaAtts = items.filter(a => isImageFile(a.mimeType) || isVideoMimeType(a.mimeType))
  if (mediaAtts.length === 0) return

  if (!authStore.token) {
    attachmentPreviewUrls.value = {}
    return
  }

  const pairs = await Promise.all(
    mediaAtts.map(async (att) => {
      try {
        const res = await fetch(resolveApiPath(`/api/initiatives/attachments/${att.id}/download`), {
          headers: { Authorization: `Bearer ${authStore.token}` },
        })
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

async function loadAttachments(initiativeId: string) {
  attachmentsLoading.value = true
  attachments.value = []
  revokeAllAttachmentPreviewUrls()
  try {
    const headers: Record<string, string> = {}
    if (authStore.token) headers.Authorization = `Bearer ${authStore.token}`
    const res = await fetch(resolveApiPath(`/api/initiatives/${initiativeId}/attachments`), { headers })
    if (res.ok) {
      attachments.value = await res.json()
      await hydrateAttachmentImagePreviews(attachments.value)
    }
  } catch {
    attachments.value = []
    revokeAllAttachmentPreviewUrls()
  } finally {
    attachmentsLoading.value = false
  }
}

async function uploadFiles(files: FileList | File[]) {
  if (!props.initiative || files.length === 0) return
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
      const res = await fetch(resolveApiPath(`/api/initiatives/${props.initiative.id}/attachments`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${authStore.token}` },
        body: formData,
      })
      if (!res.ok) {
        try {
          const j = await res.json()
          if (j?.error) toast.error(j.error)
        } catch { /* ignore */ }
      }
    }
    await loadAttachments(props.initiative.id)
    emit('updated')
  } finally {
    uploadingFiles.value = false
  }
}

async function deleteAttachment(attachmentId: string) {
  if (!props.initiative) return
  deletingAttachmentId.value = attachmentId
  try {
    const res = await fetch(resolveApiPath(`/api/initiatives/attachments/${attachmentId}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      await loadAttachments(props.initiative.id)
      emit('updated')
    }
  } finally {
    deletingAttachmentId.value = null
  }
}

async function downloadInitiativeAttachment(att: InitiativeAttachment) {
  if (!authStore.token) return
  downloadingAttachmentId.value = att.id
  try {
    const res = await fetch(resolveApiPath(`/api/initiatives/attachments/${att.id}/download`), {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (!res.ok) return
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
  if (e.dataTransfer?.files) uploadFiles(e.dataTransfer.files)
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    uploadFiles(input.files)
    input.value = ''
  }
}

function isPreviewableMedia(mimeType: string): boolean {
  return isImageFile(mimeType) || isVideoMimeType(mimeType)
}

const mediaAttachments = computed(() =>
  attachments.value.filter(att => isPreviewableMedia(att.mimeType)),
)

const selectedMediaIndex = computed(() =>
  mediaAttachments.value.findIndex(att => att.id === selectedMediaId.value),
)

const selectedMedia = computed(() => {
  const idx = selectedMediaIndex.value
  return idx >= 0 ? mediaAttachments.value[idx] ?? null : null
})

const {
  zoom: mediaPreviewZoom,
  panning: mediaPreviewPanning,
  resetTransform: resetMediaPreviewTransform,
  zoomIn: mediaPreviewZoomIn,
  zoomOut: mediaPreviewZoomOut,
  onWheel: onMediaPreviewWheel,
  onPanPointerDown: onMediaPreviewPanDown,
  onPanPointerMove: onMediaPreviewPanMove,
  onPanPointerUp: onMediaPreviewPanUp,
  onPanPointerCancel: onMediaPreviewPanCancel,
  transformStyle: mediaPreviewTransformStyle,
  zoomPercentLabel: mediaPreviewZoomPercentLabel,
  showGrabCursor: mediaPreviewShowGrabCursor,
} = useAttachmentMediaPreviewZoom({
  mediaPreviewOpen,
  selectedMediaId,
  isImage: () => !!(selectedMedia.value && isImageFile(selectedMedia.value.mimeType)),
})

function openMediaPreview(attachmentId: string) {
  if (!mediaAttachments.value.some(att => att.id === attachmentId)) return
  selectedMediaId.value = attachmentId
  mediaPreviewOpen.value = true
}

function closeMediaPreview() {
  mediaPreviewOpen.value = false
  selectedMediaId.value = null
}

function showPrevMedia() {
  if (selectedMediaIndex.value <= 0) return
  selectedMediaId.value = mediaAttachments.value[selectedMediaIndex.value - 1]!.id
}

function showNextMedia() {
  if (selectedMediaIndex.value < 0 || selectedMediaIndex.value >= mediaAttachments.value.length - 1) return
  selectedMediaId.value = mediaAttachments.value[selectedMediaIndex.value + 1]!.id
}

function onMediaPreviewKeydown(e: KeyboardEvent) {
  if (!mediaPreviewOpen.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closeMediaPreview()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    showPrevMedia()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    showNextMedia()
  } else if (e.key === '+' || e.key === '=') {
    e.preventDefault()
    mediaPreviewZoomIn()
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    mediaPreviewZoomOut()
  } else if (e.key === '0') {
    e.preventDefault()
    resetMediaPreviewTransform()
  }
}

watch(mediaAttachments, (items) => {
  if (!mediaPreviewOpen.value) return
  if (items.length === 0) {
    closeMediaPreview()
    return
  }
  if (!selectedMediaId.value || !items.some(att => att.id === selectedMediaId.value)) {
    selectedMediaId.value = items[0]!.id
  }
})

function extractClipboardFiles(e: ClipboardEvent): File[] {
  const direct = e.clipboardData?.files ? Array.from(e.clipboardData.files) : []
  if (direct.length > 0) return direct
  const files: File[] = []
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind !== 'file') continue
    const f = item.getAsFile()
    if (f) files.push(f)
  }
  return files
}

function onPasteFiles(e: ClipboardEvent) {
  // Initiative panel has no tab state; avoid intercepting while editing text fields.
  if (!props.open || editingField.value) return
  const files = extractClipboardFiles(e)
  if (files.length === 0) return
  e.preventDefault()
  void uploadFiles(files)
}

if (globalThis.window) {
  globalThis.window.addEventListener('paste', onPasteFiles)
  globalThis.window.addEventListener('keydown', onMediaPreviewKeydown)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
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

onBeforeUnmount(() => {
  revokeAllAttachmentPreviewUrls()
  if (globalThis.window) {
    globalThis.window.removeEventListener('paste', onPasteFiles)
    globalThis.window.removeEventListener('keydown', onMediaPreviewKeydown)
  }
})

// Reset state when panel / initiative changes; load attachments when open
watch(
  () => [props.open, props.initiative?.id] as const,
  async ([open, id]) => {
    editingField.value = null
    closeAllDropdowns()
    revokeAllAttachmentPreviewUrls()
    attachments.value = []
    if (!open || !id) {
      attachmentsLoading.value = false
      return
    }
    await loadAttachments(id)
  },
  { immediate: true },
)

function closeAllDropdowns() {
  showStatusDropdown.value = false
  showPriorityDropdown.value = false
  showLeaderDropdown.value = false
  leaderSearch.value = ''
}

async function updateField(field: string, value: any) {
  if (!props.initiative) return
  saving.value = true
  try {
    await initiativesStore.updateInitiative(props.initiative.id, { [field]: value })
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
  if (!props.initiative) return
  editTitle.value = props.initiative.title
  editingField.value = 'title'
  nextTick(() => titleInputRef.value?.focus())
}

async function saveTitle() {
  if (!props.initiative || !editTitle.value.trim()) {
    editingField.value = null
    return
  }
  if (editTitle.value === props.initiative.title) {
    editingField.value = null
    return
  }
  await updateField('title', editTitle.value.trim())
}

// Status
async function selectStatus(status: InitiativeStatus) {
  await updateField('status', status)
}

// Priority
async function selectPriority(priority: InitiativePriority) {
  await updateField('priority', priority)
}

// Leader
async function selectLeader(name: string, avatar: string | null) {
  saving.value = true
  try {
    await initiativesStore.updateInitiative(props.initiative!.id, {
      leader: name,
      leaderAvatar: avatar || undefined,
    })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    closeAllDropdowns()
  }
}

// Period
function startEditPeriod() {
  if (!props.initiative) return
  editPeriodStart.value = props.initiative.periodStart || ''
  editPeriodEnd.value = props.initiative.periodEnd || ''
  editingField.value = 'period'
}

async function savePeriod() {
  saving.value = true
  try {
    await initiativesStore.updateInitiative(props.initiative!.id, {
      periodStart: editPeriodStart.value || undefined,
      periodEnd: editPeriodEnd.value || undefined,
    })
    emit('updated')
  } catch {}
  finally {
    saving.value = false
    editingField.value = null
  }
}

// Description
function startEditDescription() {
  if (!props.initiative) return
  editDescription.value = props.initiative.description || ''
  editingField.value = 'description'
}

async function saveDescription() {
  if (!props.initiative) return
  if (editDescription.value === (props.initiative.description || '')) {
    editingField.value = null
    return
  }
  await updateField('description', editDescription.value || null)
}

function onBackdropClick() {
  closeAllDropdowns()
}

// ============ STYLING ============

function statusStyle(status: string) {
  switch (status) {
    case 'planning': return 'bg-[#fdab3d]/15 text-[#fdab3d]'
    case 'active': return 'bg-[#00c875]/15 text-[#00c875]'
    case 'paused': return 'bg-[#e2445c]/15 text-[#e2445c]'
    case 'completed': return 'bg-gray-100 text-gray-500'
    case 'archived': return 'bg-gray-100 text-gray-400'
    default: return 'bg-gray-100 text-gray-500'
  }
}

function statusDot(status: string) {
  switch (status) {
    case 'planning': return 'bg-[#fdab3d]'
    case 'active': return 'bg-[#00c875]'
    case 'paused': return 'bg-[#e2445c]'
    case 'completed': return 'bg-gray-400'
    case 'archived': return 'bg-gray-300'
    default: return 'bg-gray-400'
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

function label(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <Transition name="panel-backdrop">
      <div
        v-if="open && initiative"
        class="fixed inset-0 bg-black/20 z-40"
        @click="emit('close')"
      ></div>
    </Transition>

    <!-- Slide-over Panel -->
    <Transition name="panel-slide">
      <div
        v-if="open && initiative"
        class="fixed top-0 right-0 bottom-0 w-[520px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200"
        @click="onBackdropClick"
      >
        <!-- Panel Header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <div class="flex items-center gap-2">
            <button class="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Expand">
              <Maximize2 :size="14" />
            </button>
            <button
              class="p-1 rounded-md hover:bg-gray-100 transition-colors"
              :class="copied ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'"
              title="Copy link"
              @click="copyLink(`${origin}/initiatives/${initiative.id}`)"
            >
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
            </button>
            <span class="text-[11px] font-mono text-gray-400 px-1.5 py-0.5 bg-gray-50 rounded">INI-{{ initiative.id.slice(-5).toUpperCase() }}</span>
            <div v-if="saving" class="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 :size="12" class="animate-spin" /> Saving...
            </div>
          </div>
          <button
            class="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Scrollable Body -->
        <div class="flex-1 overflow-y-auto">
          <!-- Title -->
          <div class="px-6 pt-5 pb-4">
            <div v-if="editingField === 'title'" class="mb-4">
              <input
                ref="titleInputRef"
                v-model="editTitle"
                class="w-full text-lg font-bold text-gray-900 bg-transparent border-b-2 border-[#4857FE] outline-none py-1 leading-snug"
                @keydown.enter="saveTitle"
                @keydown.escape="editingField = null"
                @blur="saveTitle"
                @click.stop
              />
            </div>
            <h2
              v-else
              class="text-lg font-bold text-gray-900 leading-snug mb-4 cursor-pointer hover:text-[#4857FE] transition-colors group/title"
              @click.stop="startEditTitle"
            >
              {{ initiative.title }}
              <span class="text-xs text-gray-300 opacity-0 group-hover/title:opacity-100 ml-1 transition-opacity">click to edit</span>
            </h2>

            <!-- Metadata Grid -->
            <div class="space-y-3.5">
              <!-- Status -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <Clock :size="13" class="text-gray-400" /> Status
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                    :class="statusStyle(initiative.status)"
                    @click="showStatusDropdown = !showStatusDropdown; showPriorityDropdown = false; showLeaderDropdown = false"
                  >
                    <span class="w-2 h-2 rounded-full" :class="statusDot(initiative.status)"></span>
                    {{ label(initiative.status) }}
                    <ChevronDown :size="12" />
                  </button>
                  <div v-if="showStatusDropdown" class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]">
                    <button
                      v-for="opt in statusOptions" :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="initiative.status === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectStatus(opt.value)"
                    >
                      <span class="w-2 h-2 rounded-full" :class="statusDot(opt.value)"></span>
                      {{ opt.label }}
                      <Check v-if="initiative.status === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Priority -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0">Priority</span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity"
                    :class="priorityStyle(initiative.priority)"
                    @click="showPriorityDropdown = !showPriorityDropdown; showStatusDropdown = false; showLeaderDropdown = false"
                  >
                    {{ label(initiative.priority) }}
                    <ChevronDown :size="12" />
                  </button>
                  <div v-if="showPriorityDropdown" class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-[160px]">
                    <button
                      v-for="opt in priorityOptions" :key="opt.value"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      :class="initiative.priority === opt.value ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                      @click="selectPriority(opt.value)"
                    >
                      <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" :class="priorityStyle(opt.value)">{{ opt.label }}</span>
                      <Check v-if="initiative.priority === opt.value" :size="14" class="ml-auto text-[#4857FE]" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Leader (searchable dropdown) -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <User2 :size="13" class="text-gray-400" /> Leader
                </span>
                <div class="relative" @click.stop>
                  <button
                    class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200"
                    @click="showLeaderDropdown = !showLeaderDropdown; showStatusDropdown = false; showPriorityDropdown = false; leaderSearch = ''"
                  >
                    <template v-if="initiative.leader">
                      <div class="w-5 h-5 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                        <UploadAssetImg v-if="initiative.leaderAvatar" :src="initiative.leaderAvatar" class="w-5 h-5 rounded-full object-cover" />
                        <span v-else>{{ initiative.leader[0] }}</span>
                      </div>
                      <span class="text-gray-700">{{ initiative.leader }}</span>
                    </template>
                    <span v-else class="text-gray-400">Set leader</span>
                    <ChevronDown :size="12" class="text-gray-400" />
                  </button>
                  <div v-if="showLeaderDropdown" class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 w-[220px]">
                    <div class="p-2 border-b border-gray-100">
                      <div class="flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1.5 focus-within:border-[#4857FE]">
                        <Search :size="12" class="text-gray-400" />
                        <input v-model="leaderSearch" class="text-xs text-gray-700 bg-transparent outline-none flex-1" placeholder="Search..." />
                      </div>
                    </div>
                    <div class="max-h-[200px] overflow-y-auto py-1">
                      <button
                        v-for="user in filteredTeamMembers" :key="user.id"
                        class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        :class="initiative.leader === user.name ? 'text-[#4857FE] font-medium' : 'text-gray-600'"
                        @click="selectLeader(user.name, user.avatar)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          <UploadAssetImg v-if="user.avatar" :src="user.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
                        </div>
                        <span class="truncate">{{ user.name }}</span>
                        <Check v-if="initiative.leader === user.name" :size="14" class="ml-auto text-[#4857FE]" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Period -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0 flex items-center gap-1.5">
                  <CalendarDays :size="13" class="text-gray-400" /> Period
                </span>
                <div v-if="editingField === 'period'" class="flex items-center gap-2" @click.stop>
                  <input
                    v-model="editPeriodStart"
                    type="date"
                    class="text-xs border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE]"
                  />
                  <span class="text-xs text-gray-400">to</span>
                  <input
                    v-model="editPeriodEnd"
                    type="date"
                    class="text-xs border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-[#4857FE]"
                  />
                  <button class="text-xs text-[#4857FE] font-medium hover:underline" @click="savePeriod">Save</button>
                  <button class="text-xs text-gray-400 hover:underline" @click="editingField = null">Cancel</button>
                </div>
                <button
                  v-else
                  class="text-sm text-gray-700 hover:text-[#4857FE] transition-colors cursor-pointer"
                  @click.stop="startEditPeriod"
                >
                  {{ initiative.periodStart || initiative.periodEnd
                    ? `${formatDate(initiative.periodStart)} – ${formatDate(initiative.periodEnd)}`
                    : 'Set period' }}
                </button>
              </div>

              <!-- Created -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500 w-24 shrink-0">Created</span>
                <span class="text-sm text-gray-700">{{ formatDate(initiative.createdAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Description -->
          <div class="px-6 py-4 border-t border-gray-100">
            <div class="flex items-center gap-1.5 mb-2">
              <FileText :size="13" class="text-gray-400" />
              <span class="text-sm font-medium text-gray-700">Description</span>
            </div>
            <div v-if="editingField === 'description'" @click.stop>
              <textarea
                v-model="editDescription"
                rows="4"
                class="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 resize-none"
                placeholder="Add a description..."
                @keydown.escape="editingField = null"
              ></textarea>
              <div class="flex items-center gap-2 mt-2">
                <button class="px-3 py-1.5 bg-[#4857FE] text-white text-xs font-medium rounded-md hover:bg-[#3a46d9] transition-colors" @click="saveDescription">Save</button>
                <button class="px-3 py-1.5 text-gray-500 text-xs font-medium hover:text-gray-700 transition-colors" @click="editingField = null">Cancel</button>
              </div>
            </div>
            <div
              v-else
              class="text-sm text-gray-600 whitespace-pre-wrap cursor-pointer hover:bg-gray-50 rounded-lg px-3 py-2 -mx-3 transition-colors min-h-[40px]"
              @click.stop="startEditDescription"
            >
              {{ initiative.description || 'Click to add a description...' }}
            </div>
          </div>

          <!-- Attachments -->
          <div class="px-6 py-4 border-t border-gray-100" @click.stop>
            <div class="flex items-center gap-1.5 mb-3">
              <Paperclip :size="13" class="text-gray-400" />
              <span class="text-sm font-medium text-gray-700">Attachments</span>
            </div>

            <div
              class="border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer mb-4"
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
                <Loader2 :size="22" class="animate-spin text-[#4857FE]" />
                <p class="text-sm text-[#4857FE] font-medium">Uploading...</p>
              </div>
              <div v-else class="flex flex-col items-center gap-2">
                <div class="w-9 h-9 rounded-full flex items-center justify-center" :class="isDragging ? 'bg-[#4857FE]/10' : 'bg-gray-100'">
                  <Upload :size="18" :class="isDragging ? 'text-[#4857FE]' : 'text-gray-400'" />
                </div>
                <div>
                  <p class="text-sm font-medium" :class="isDragging ? 'text-[#4857FE]' : 'text-gray-600'">
                    {{ isDragging ? 'Drop files here' : 'Drop files or click to upload' }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ ALLOWED_ATTACHMENT_TYPES_HINT }}. Press Ctrl+V to paste files.</p>
                </div>
              </div>
            </div>

            <div v-if="attachmentsLoading" class="flex items-center justify-center py-6">
              <Loader2 :size="18" class="animate-spin text-gray-400" />
            </div>

            <div v-else-if="attachments.length > 0" class="space-y-2">
              <div
                v-for="att in attachments"
                :key="att.id"
                class="bg-gray-50 rounded-lg border border-gray-100 p-3 flex items-center gap-3 group/att hover:bg-gray-100/70 transition-colors"
              >
                <div
                  class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                  :class="[thumbBgClass(att.mimeType), isPreviewableMedia(att.mimeType) ? 'cursor-pointer' : '']"
                  @click.stop="isPreviewableMedia(att.mimeType) ? openMediaPreview(att.id) : null"
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
                  <Video
                    v-else-if="isVideoMimeType(att.mimeType)"
                    :size="18"
                    class="text-violet-500"
                  />
                  <component v-else :is="attachmentThumbIcon(att.mimeType)" :size="18" class="text-blue-500" />
                </div>

                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-800 truncate">{{ att.fileName }}</p>
                  <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span class="text-[10px] text-gray-400">{{ formatFileSize(att.fileSize) }}</span>
                    <span class="text-[10px] text-gray-300">·</span>
                    <span class="text-[10px] text-gray-400">{{ att.user?.name || 'Unknown' }}</span>
                    <span class="text-[10px] text-gray-300">·</span>
                    <span class="text-[10px] text-gray-400">{{ formatRelativeTime(att.createdAt) }}</span>
                  </div>
                </div>

                <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover/att:opacity-100 transition-opacity">
                  <button
                    type="button"
                    class="p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer disabled:opacity-40"
                    title="Download"
                    :disabled="downloadingAttachmentId === att.id"
                    @click.stop="downloadInitiativeAttachment(att)"
                  >
                    <Loader2 v-if="downloadingAttachmentId === att.id" :size="13" class="animate-spin" />
                    <Download v-else :size="13" />
                  </button>
                  <button
                    class="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete"
                    :disabled="deletingAttachmentId === att.id"
                    @click.stop="deleteAttachment(att.id)"
                  >
                    <Loader2 v-if="deletingAttachmentId === att.id" :size="13" class="animate-spin" />
                    <Trash2 v-else :size="13" />
                  </button>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-3">
              <p class="text-xs text-gray-400">No attachments yet</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  <Teleport to="body">
    <div
      v-if="mediaPreviewOpen && selectedMedia"
      class="fixed inset-0 z-[120] flex min-h-0 bg-black/90 backdrop-blur-[1px]"
      @click.self="closeMediaPreview"
    >
      <button
        type="button"
        class="absolute top-4 right-4 p-2 rounded-md bg-white/10 hover:bg-white/20 text-white"
        @click="closeMediaPreview"
      >
        <X :size="18" />
      </button>

      <div class="absolute top-4 left-4 text-white/90 text-xs">
        <span class="font-medium">{{ selectedMedia.fileName }}</span>
        <span class="mx-2 text-white/50">·</span>
        <span>{{ selectedMediaIndex + 1 }} / {{ mediaAttachments.length }}</span>
      </div>

      <button
        type="button"
        class="absolute left-4 top-1/2 -translate-y-1/2 px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm"
        :disabled="selectedMediaIndex <= 0"
        @click="showPrevMedia"
      >
        Prev
      </button>
      <button
        type="button"
        class="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm"
        :disabled="selectedMediaIndex >= mediaAttachments.length - 1"
        @click="showNextMedia"
      >
        Next
      </button>

      <div
        class="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-black/50 px-2 py-1.5 text-white backdrop-blur-sm"
      >
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          title="Zoom out (−)"
          :disabled="mediaPreviewZoom <= 1"
          @click="mediaPreviewZoomOut"
        >
          <Minus :size="18" />
        </button>
        <span class="min-w-[3.25rem] text-center text-xs tabular-nums">{{ mediaPreviewZoomPercentLabel }}</span>
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          title="Zoom in (+)"
          :disabled="mediaPreviewZoom >= MEDIA_PREVIEW_ZOOM_MAX"
          @click="mediaPreviewZoomIn"
        >
          <Plus :size="18" />
        </button>
        <button
          v-if="mediaPreviewZoom > 1"
          type="button"
          class="p-1.5 rounded-md hover:bg-white/15"
          title="Reset zoom (0)"
          @click="resetMediaPreviewTransform"
        >
          <RotateCcw :size="16" />
        </button>
      </div>

      <div
        class="flex min-h-0 w-full flex-1 touch-none select-none items-center justify-center overflow-hidden px-16 sm:px-24 py-6"
        :class="
          mediaPreviewShowGrabCursor
            ? mediaPreviewPanning
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : ''
        "
        @wheel="onMediaPreviewWheel"
        @pointerdown="onMediaPreviewPanDown"
        @pointermove="onMediaPreviewPanMove"
        @pointerup="onMediaPreviewPanUp"
        @pointercancel="onMediaPreviewPanCancel"
      >
        <div
          :style="mediaPreviewTransformStyle"
          class="will-change-transform"
          @dblclick.stop="resetMediaPreviewTransform"
        >
          <img
            v-if="selectedMedia && isImageFile(selectedMedia.mimeType)"
            :src="attachmentPreviewUrls[selectedMedia.id]"
            :alt="selectedMedia.fileName"
            class="max-h-[85vh] max-w-[92vw] object-contain rounded-md pointer-events-none"
            draggable="false"
          />
          <video
            v-else-if="selectedMedia"
            :src="attachmentPreviewUrls[selectedMedia.id]"
            controls
            autoplay
            class="max-h-[85vh] max-w-[92vw] rounded-md bg-black"
          />
        </div>
      </div>
    </div>
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
