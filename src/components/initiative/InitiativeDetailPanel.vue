<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import {
  X, Maximize2, Copy, Loader2, ChevronDown, Check,
  Clock, Target, CalendarDays, User2, FileText, Search,
} from 'lucide-vue-next'
import { useInitiativesStore } from '@/stores/initiatives'
import { useAuthStore } from '@/stores/auth'
import type { Initiative, InitiativeStatus, InitiativePriority } from '@/types/initiative'

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

// Reset state when initiative changes
watch(() => props.initiative?.id, () => {
  editingField.value = null
  closeAllDropdowns()
})

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
            <button class="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Copy link">
              <Copy :size="14" />
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
