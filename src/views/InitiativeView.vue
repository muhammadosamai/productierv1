<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { Link2, Loader2, ChevronRight, ChevronDown, CheckCircle2, Circle, Trash2, ArrowLeft, Pencil, Check, X, Search } from 'lucide-vue-next'
import TaskStatusIcon from '@/components/shared/TaskStatusIcon.vue'
import { useInitiativesStore } from '@/stores/initiatives'
import { useBacklogStore } from '@/stores/backlog'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { Initiative, InitiativeStatus, InitiativePriority } from '@/types/initiative'
import type { TaskStatus } from '@/types/backlog'
import RichTextEditor from '@/components/ui/RichTextEditor.vue'

const route = useRoute()
const initiativesStore = useInitiativesStore()
const backlogStore = useBacklogStore()
const productStore = useProductStore()
const authStore = useAuthStore()

// Find the product info (logo, name) for the initiative
const initiativeProduct = computed(() => {
  if (!initiative.value) return null
  return productStore.products.find(p => p.name === initiative.value!.product) || null
})

const initiative = ref<Initiative | null>(null)
const loading = ref(true)
const activeTab = ref('Initiative Overview')
const expandedItems = ref<Set<string>>(new Set())

const tabs = ['Initiative Overview', 'Stories & Backlog', 'Delivery Progress', 'Metrics']

// Inline editing state
const editingField = ref<string | null>(null)
const editTitle = ref('')
const editDescription = ref('')
const editLeader = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const leaderInputRef = ref<HTMLInputElement | null>(null)

// Get stories linked to this initiative
const linkedStories = computed(() => {
  if (!initiative.value) return []
  return backlogStore.stories.filter(story =>
    story.initiative && story.initiative.toLowerCase() === initiative.value!.title.toLowerCase()
  )
})

async function loadInitiative(id: string) {
  loading.value = true
  initiative.value = await initiativesStore.fetchInitiative(id)
  await backlogStore.fetchStories()
  loading.value = false
}

onMounted(() => {
  loadInitiative(route.params.id as string)
})

watch(() => route.params.id, (newId) => {
  if (newId) {
    editingField.value = null
    loadInitiative(newId as string)
  }
})

// --- Inline edit helpers ---

async function updateField(field: string, value: any) {
  if (!initiative.value) return
  await initiativesStore.updateInitiative(initiative.value.id, { [field]: value })
  initiative.value = await initiativesStore.fetchInitiative(initiative.value.id)
  editingField.value = null
}

function startEditTitle() {
  if (!initiative.value) return
  editTitle.value = initiative.value.title
  editingField.value = 'title'
  nextTick(() => titleInputRef.value?.focus())
}

function saveTitle() {
  if (editTitle.value.trim()) {
    updateField('title', editTitle.value.trim())
  } else {
    editingField.value = null
  }
}

// Leader search autocomplete
interface UserResult {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
}
const leaderSearchResults = ref<UserResult[]>([])
const leaderSearchLoading = ref(false)
const selectedLeaderIndex = ref(-1)
let leaderSearchTimeout: ReturnType<typeof setTimeout> | null = null

function startEditLeader() {
  if (!initiative.value) return
  editLeader.value = ''
  leaderSearchResults.value = []
  selectedLeaderIndex.value = -1
  editingField.value = 'leader'
  nextTick(() => {
    leaderInputRef.value?.focus()
    searchUsers('')
  })
}

async function searchUsers(query: string) {
  leaderSearchLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      leaderSearchResults.value = await res.json()
    }
  } catch {
    leaderSearchResults.value = []
  } finally {
    leaderSearchLoading.value = false
  }
}

function onLeaderInput() {
  selectedLeaderIndex.value = -1
  if (leaderSearchTimeout) clearTimeout(leaderSearchTimeout)
  leaderSearchTimeout = setTimeout(() => {
    searchUsers(editLeader.value)
  }, 200)
}

async function selectLeader(user: UserResult) {
  if (!initiative.value) return
  await initiativesStore.updateInitiative(initiative.value.id, {
    leader: user.name,
    leaderAvatar: user.avatar || undefined,
  })
  initiative.value = await initiativesStore.fetchInitiative(initiative.value.id)
  editingField.value = null
}

function onLeaderKeydown(e: KeyboardEvent) {
  const results = leaderSearchResults.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedLeaderIndex.value = Math.min(selectedLeaderIndex.value + 1, results.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedLeaderIndex.value = Math.max(selectedLeaderIndex.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedLeaderIndex.value >= 0 && results[selectedLeaderIndex.value]) {
      selectLeader(results[selectedLeaderIndex.value]!)
    } else if (editLeader.value.trim()) {
      updateField('leader', editLeader.value.trim())
    }
  } else if (e.key === 'Escape') {
    editingField.value = null
  }
}

function saveLeader() {
  if (editLeader.value.trim()) {
    updateField('leader', editLeader.value.trim())
  } else {
    editingField.value = null
  }
}

function startEditDescription() {
  if (!initiative.value) return
  editDescription.value = initiative.value.description || ''
  editingField.value = 'description'
}

function saveDescription() {
  updateField('description', editDescription.value.trim() || null)
}

function updateStatus(status: InitiativeStatus) {
  updateField('status', status)
}

function updatePriority(priority: InitiativePriority) {
  updateField('priority', priority)
}

function onPeriodChange(range: { start: string | null; end: string | null } | undefined) {
  if (!initiative.value) return
  const start = range?.start || undefined
  const end = range?.end || undefined
  initiativesStore.updateInitiative(initiative.value.id, {
    periodStart: start,
    periodEnd: end,
  }).then(async () => {
    initiative.value = await initiativesStore.fetchInitiative(initiative.value!.id)
  })
}

const periodRange = computed(() => ({
  start: initiative.value?.periodStart || null,
  end: initiative.value?.periodEnd || null,
}))

// --- Existing helpers ---

function toggleExpand(id: string) {
  const newSet = new Set(expandedItems.value)
  if (newSet.has(id)) newSet.delete(id)
  else newSet.add(id)
  expandedItems.value = newSet
}

const initiativeStatuses: { value: InitiativeStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
]

const priorities: { value: InitiativePriority; label: string; number: number; color: string }[] = [
  { value: 'high', label: 'High', number: 1, color: 'bg-[#e2445c]' },
  { value: 'medium', label: 'Medium', number: 2, color: 'bg-[#00c875]' },
  { value: 'low', label: 'Low', number: 3, color: 'bg-[#579bfc]' },
]

function statusStyle(status: string) {
  switch (status) {
    case 'planning': return 'bg-[#fdab3d] text-white'
    case 'active': return 'bg-[#00c875] text-white'
    case 'paused': return 'bg-[#e2445c] text-white'
    case 'completed': return 'bg-[#c4c4c4] text-white'
    case 'backlog': return 'bg-[#c4c4c4] text-white'
    case 'ready': return 'bg-[#00c875] text-white'
    case 'in_progress': return 'bg-[#fdab3d] text-white'
    case 'done': return 'bg-[#00c875] text-white'
    case 'archived': return 'bg-[#c4c4c4] text-white'
    case 'created': return 'bg-[#c4c4c4] text-white'
    case 'assigned': return 'bg-[#a25ddc] text-white'
    case 'in_review': return 'bg-[#579bfc] text-white'
    default: return 'bg-[#c4c4c4] text-white'
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function priorityNumber(priority: string) {
  switch (priority) {
    case 'high': return 1
    case 'medium': return 2
    case 'low': return 3
    default: return 3
  }
}

function priorityCircleColor(priority: string) {
  switch (priority) {
    case 'high': return 'bg-[#e2445c]'
    case 'medium': return 'bg-[#00c875]'
    case 'low': return 'bg-[#579bfc]'
    default: return 'bg-gray-400'
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFullDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysAgo(dateStr: string): string {
  const created = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return '1 day ago'
  return `${diffDays} days ago`
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const s = new Date(start)
  const e = new Date(end)
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${sStr} – ${eStr}`
}

function cycleTaskStatus(taskId: string, currentStatus: TaskStatus) {
  const order: TaskStatus[] = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'overdue', 'blocked']
  const idx = order.indexOf(currentStatus)
  const next = order[(idx + 1) % order.length]!
  backlogStore.updateTask(taskId, { status: next })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
      <span class="ml-2 text-sm text-gray-500">Loading initiative...</span>
    </div>

    <!-- Not found -->
    <div v-else-if="!initiative" class="flex flex-col items-center justify-center h-full gap-3">
      <p class="text-gray-400 text-sm">Initiative not found</p>
      <router-link to="/initiatives" class="text-sm text-[#4857FE] hover:underline flex items-center gap-1">
        <ArrowLeft :size="14" /> Back to Initiatives
      </router-link>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Page Header -->
      <div class="bg-white px-8 pt-6 pb-0 border-b border-gray-100">
        <!-- Title row -->
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <router-link to="/initiatives" class="text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft :size="18" />
            </router-link>

            <span class="w-1 h-7 rounded-full flex-shrink-0" :class="statusStyle(initiative.status).split(' ')[0]"></span>

            <!-- Editable title -->
            <div v-if="editingField === 'title'" class="flex items-center gap-2">
              <input
                ref="titleInputRef"
                v-model="editTitle"
                class="text-2xl font-semibold text-gray-900 bg-transparent border-b-2 border-[#4857FE] outline-none py-0.5 min-w-[200px]"
                @keydown.enter="saveTitle"
                @keydown.escape="editingField = null"
              />
              <button @click="saveTitle" class="text-green-500 hover:text-green-600"><Check :size="18" /></button>
              <button @click="editingField = null" class="text-gray-400 hover:text-gray-600"><X :size="18" /></button>
            </div>
            <h1
              v-else
              class="text-2xl font-semibold text-gray-900 cursor-pointer hover:text-[#4857FE] transition-colors group/title"
              @click="startEditTitle"
            >
              {{ initiative.title }}
              <Pencil :size="14" class="inline ml-1 opacity-0 group-hover/title:opacity-50 transition-opacity" />
            </h1>

            <button class="text-gray-400 hover:text-gray-600 transition-colors">
              <Link2 :size="18" />
            </button>
          </div>

          <!-- Leader avatar -->
          <div v-if="initiative.leader" class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-xs font-medium overflow-hidden border-2 border-white shadow-sm">
              <UploadAssetImg
                v-if="initiative.leaderAvatar"
                :src="initiative.leaderAvatar"
                class="w-8 h-8 rounded-full object-cover"
                :alt="initiative.leader"
              />
              <span v-else>{{ initiative.leader.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
            </div>
            <span class="text-sm text-gray-600">{{ initiative.leader }}</span>
          </div>
        </div>

        <!-- Tab navigation -->
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
              :class="[activeTab === tab ? 'bg-[#4857FE]' : 'bg-gray-300']"
            ></span>
            {{ tab }}
            <div
              v-if="activeTab === tab"
              class="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4857FE] rounded-t-full"
            ></div>
          </button>
        </div>
      </div>

      <!-- Page Content -->
      <div class="flex-1 overflow-auto p-8" style="background-color: #F8FAFF">

        <!-- ========== INITIATIVE OVERVIEW TAB ========== -->
        <div v-if="activeTab === 'Initiative Overview'" class="space-y-6">
          <!-- Info Cards -->
          <div class="grid grid-cols-6 gap-4">

            <!-- Product Card -->
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Product</p>
              <div class="flex items-center gap-2.5 mt-2">
                <UploadAssetImg
                  v-if="initiativeProduct"
                  :src="initiativeProduct.logo"
                  :alt="initiativeProduct.name"
                  class="w-7 h-7 rounded-lg object-cover"
                />
                <span class="text-sm font-medium text-gray-900">{{ initiative.product }}</span>
              </div>
            </div>

            <!-- Created Card -->
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Created</p>
              <p class="text-sm font-medium text-gray-900 mt-2">{{ formatFullDate(initiative.createdAt) }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ daysAgo(initiative.createdAt) }}</p>
            </div>

            <!-- Status Card (click to choose) -->
            <Popover>
              <PopoverTrigger as-child>
                <div class="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-[#4857FE]/30 hover:shadow-sm transition-all group/card">
                  <div class="flex items-center justify-between">
                    <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Status</p>
                    <Pencil :size="12" class="text-gray-300 opacity-0 group-hover/card:opacity-100 transition-opacity" />
                  </div>
                  <div class="mt-2">
                    <span
                      class="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm"
                      :class="statusStyle(initiative.status)"
                    >
                      {{ statusLabel(initiative.status) }}
                    </span>
                  </div>
                </div>
              </PopoverTrigger>
              <PopoverContent align="start" :side-offset="4" class="p-2 w-[180px]">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 py-1">Status</p>
                <button
                  v-for="s in initiativeStatuses"
                  :key="s.value"
                  class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
                  :class="initiative.status === s.value ? 'bg-[#4857FE]/10 text-[#4857FE] font-medium' : 'text-gray-600 hover:bg-gray-50'"
                  @click="updateStatus(s.value)"
                >
                  <span class="w-3 h-3 rounded-full" :class="statusStyle(s.value).split(' ')[0]"></span>
                  {{ s.label }}
                </button>
              </PopoverContent>
            </Popover>

            <!-- Period Card (date range picker) -->
            <div class="bg-white rounded-xl border border-gray-100 p-5 hover:border-[#4857FE]/30 hover:shadow-sm transition-all group/card">
              <div class="flex items-center justify-between">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Period</p>
                <Pencil :size="12" class="text-gray-300 opacity-0 group-hover/card:opacity-100 transition-opacity" />
              </div>
              <div class="mt-2">
                <DateRangePicker
                  :model-value="periodRange"
                  @update:model-value="onPeriodChange"
                />
              </div>
            </div>

            <!-- Leader Card (click to edit with user search) -->
            <div
              class="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-[#4857FE]/30 hover:shadow-sm transition-all group/card relative"
              @click="editingField !== 'leader' && startEditLeader()"
            >
              <div class="flex items-center justify-between">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Leader</p>
                <Pencil :size="12" class="text-gray-300 opacity-0 group-hover/card:opacity-100 transition-opacity" />
              </div>

              <div v-if="editingField === 'leader'" class="mt-2" @click.stop>
                <div class="relative">
                  <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
                    <Search :size="14" class="text-gray-400 shrink-0" />
                    <input
                      ref="leaderInputRef"
                      v-model="editLeader"
                      class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                      placeholder="Search users..."
                      @input="onLeaderInput"
                      @keydown="onLeaderKeydown"
                    />
                    <Loader2 v-if="leaderSearchLoading" :size="14" class="text-gray-400 animate-spin shrink-0" />
                  </div>

                  <!-- Autocomplete dropdown -->
                  <div
                    v-if="leaderSearchResults.length > 0"
                    class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[200px] overflow-auto"
                  >
                    <button
                      v-for="(user, idx) in leaderSearchResults"
                      :key="user.id"
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                      :class="idx === selectedLeaderIndex ? 'bg-[#4857FE]/10' : 'hover:bg-gray-50'"
                      @mousedown.prevent="selectLeader(user)"
                    >
                      <div class="w-7 h-7 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden shrink-0">
                        <UploadAssetImg
                          v-if="user.avatar"
                          :src="user.avatar"
                          class="w-7 h-7 rounded-full object-cover"
                          :alt="user.name"
                        />
                        <span v-else>{{ user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-sm font-medium text-gray-900 truncate">{{ user.name }}</span>
                        <span class="text-[10px] text-gray-400 truncate">{{ user.email }}</span>
                      </div>
                    </button>
                  </div>

                  <!-- No results -->
                  <div
                    v-else-if="editLeader && !leaderSearchLoading && leaderSearchResults.length === 0"
                    class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3"
                  >
                    <p class="text-xs text-gray-400 text-center">No users found</p>
                  </div>
                </div>
              </div>
              <div v-else class="flex items-center gap-2 mt-2">
                <div v-if="initiative.leader" class="w-7 h-7 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden shrink-0">
                  <UploadAssetImg
                    v-if="initiative.leaderAvatar"
                    :src="initiative.leaderAvatar"
                    class="w-7 h-7 rounded-full object-cover"
                    :alt="initiative.leader"
                  />
                  <span v-else>{{ initiative.leader.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
                </div>
                <span class="text-sm font-medium text-gray-900">{{ initiative.leader || '—' }}</span>
              </div>
            </div>

            <!-- Priority Card (click to choose) -->
            <Popover>
              <PopoverTrigger as-child>
                <div class="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-[#4857FE]/30 hover:shadow-sm transition-all group/card">
                  <div class="flex items-center justify-between">
                    <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Priority</p>
                    <Pencil :size="12" class="text-gray-300 opacity-0 group-hover/card:opacity-100 transition-opacity" />
                  </div>
                  <div class="flex items-center gap-2 mt-2">
                    <div
                      class="flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold shadow-sm"
                      :class="priorityCircleColor(initiative.priority)"
                    >
                      {{ priorityNumber(initiative.priority) }}
                    </div>
                    <span class="text-sm font-medium text-gray-700 capitalize">{{ initiative.priority }}</span>
                  </div>
                </div>
              </PopoverTrigger>
              <PopoverContent align="start" :side-offset="4" class="p-2 w-[180px]">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 py-1">Priority</p>
                <button
                  v-for="p in priorities"
                  :key="p.value"
                  class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
                  :class="initiative.priority === p.value ? 'bg-[#4857FE]/10 text-[#4857FE] font-medium' : 'text-gray-600 hover:bg-gray-50'"
                  @click="updatePriority(p.value)"
                >
                  <div
                    class="flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold"
                    :class="p.color"
                  >
                    {{ p.number }}
                  </div>
                  {{ p.label }}
                </button>
              </PopoverContent>
            </Popover>

          </div>

          <!-- Description (editable) -->
          <div
            class="bg-white rounded-xl border border-gray-100 p-6 cursor-pointer hover:border-[#4857FE]/30 hover:shadow-sm transition-all group/card"
            @click="editingField !== 'description' && startEditDescription()"
          >
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-700">Description</h3>
              <Pencil :size="12" class="text-gray-300 opacity-0 group-hover/card:opacity-100 transition-opacity" />
            </div>

            <div v-if="editingField === 'description'" @click.stop>
              <RichTextEditor
                v-model="editDescription"
                placeholder="Describe the initiative goals and scope..."
              />
              <div class="flex justify-end gap-2 mt-2">
                <button
                  @click="editingField = null"
                  class="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  @click="saveDescription"
                  class="px-3 py-1.5 text-xs text-white bg-[#4857FE] hover:bg-[#3E4BDE] rounded-lg font-medium"
                >
                  Save
                </button>
              </div>
            </div>
            <template v-else>
              <div v-if="initiative.description" class="text-sm text-gray-600 leading-relaxed prose prose-sm max-w-none rich-text-content" v-html="initiative.description"></div>
              <p v-else class="text-sm text-gray-400 italic">Click to add a description...</p>
            </template>
          </div>

          <!-- Linked Stories Summary -->
          <div class="bg-white rounded-xl border border-gray-100 p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-gray-700">Linked Stories</h3>
              <button @click="activeTab = 'Stories & Backlog'" class="text-xs text-[#4857FE] font-medium hover:underline">
                View all
              </button>
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div class="text-center py-4">
                <p class="text-2xl font-semibold text-gray-900">{{ linkedStories.length }}</p>
                <p class="text-xs text-gray-400 mt-1">Total Stories</p>
              </div>
              <div class="text-center py-4">
                <p class="text-2xl font-semibold text-blue-600">{{ linkedStories.filter(i => i.status === 'in_progress').length }}</p>
                <p class="text-xs text-gray-400 mt-1">In Progress</p>
              </div>
              <div class="text-center py-4">
                <p class="text-2xl font-semibold text-green-600">{{ linkedStories.filter(i => i.status === 'completed').length }}</p>
                <p class="text-xs text-gray-400 mt-1">Completed</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ========== STORIES & BACKLOG TAB ========== -->
        <div v-else-if="activeTab === 'Stories & Backlog'" class="bg-white rounded-xl border border-gray-100 min-h-[300px]">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 class="text-sm font-semibold text-[#4857FE]">Stories & Backlog</h3>
            <p class="text-sm text-gray-400">{{ linkedStories.length }} stories</p>
          </div>

          <div>
            <div class="flex items-center justify-between px-6 py-3 border-b border-gray-100">
              <h4 class="text-base font-semibold text-[#4857FE]">{{ initiative.title }}</h4>
            </div>

            <div class="grid grid-cols-[4px_1fr_60px_120px_140px_100px_110px] gap-0 items-center px-6 py-2.5 border-b border-gray-200 text-xs font-medium text-gray-400 tracking-wide">
              <span></span>
              <span class="pl-2">Title</span>
              <span class="text-center">Owner</span>
              <span class="text-center">Status</span>
              <span class="text-center">Timeline</span>
              <span class="text-center">Due date</span>
              <span class="text-center">Priority</span>
            </div>

            <div class="divide-y divide-gray-100">
              <template v-for="item in linkedStories" :key="item.id">
                <div
                  class="grid grid-cols-[4px_1fr_60px_120px_140px_100px_110px] gap-0 items-center px-6 py-3.5 hover:bg-gray-50/60 transition-colors cursor-pointer group"
                  @click="toggleExpand(item.id)"
                >
                  <div class="h-full w-[3px] rounded-full self-stretch bg-[#4857FE]"></div>
                  <div class="flex items-center gap-2 pl-3 min-w-0">
                    <component :is="expandedItems.has(item.id) ? ChevronDown : ChevronRight" :size="14" class="text-gray-400 shrink-0" />
                    <span class="text-sm text-gray-800 truncate">{{ item.title }}</span>
                  </div>
                  <div class="flex justify-center">
                    <img v-if="item.owner" :src="`https://api.dicebear.com/7.x/avataaars/svg?seed=${item.owner}`" class="w-8 h-8 rounded-full border-2 border-white shadow-sm" :alt="item.owner" />
                    <div v-else class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><span class="text-xs text-gray-400">?</span></div>
                  </div>
                  <div class="flex justify-center">
                    <span class="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold min-w-[100px] justify-center shadow-sm" :class="statusStyle(item.status)">{{ statusLabel(item.status) }}</span>
                  </div>
                  <div class="flex justify-center px-2">
                    <div class="w-full h-[6px] bg-gray-200 rounded-full overflow-hidden">
                      <div class="h-full bg-[#4857FE] rounded-full transition-all duration-300" :style="{ width: item.tasks.length > 0 ? `${(item.tasks.filter(t => t.status === 'done').length / item.tasks.length) * 100}%` : '0%' }"></div>
                    </div>
                  </div>
                  <div class="text-center"><span class="text-sm text-gray-600">{{ formatDate(item.createdAt) }}</span></div>
                  <div class="flex justify-center">
                    <div class="flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold shadow-sm" :class="priorityCircleColor(item.priority)">{{ priorityNumber(item.priority) }}</div>
                  </div>
                </div>

                <div v-if="expandedItems.has(item.id)" class="bg-gray-50/40 px-6 py-3 pl-14">
                  <div class="space-y-1">
                    <div v-for="task in item.tasks" :key="task.id" class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/80 transition-colors group/task">
                      <button @click.stop="cycleTaskStatus(task.id, task.status)" class="shrink-0">
                        <TaskStatusIcon :status="task.status" :size="16" />
                      </button>
                      <span class="text-sm flex-1" :class="task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-700'">{{ task.title }}</span>
                      <span class="text-xs px-2 py-0.5 rounded" :class="statusStyle(task.status)">{{ statusLabel(task.status) }}</span>
                    </div>
                  </div>
                  <div v-if="item.tasks.length === 0" class="text-sm text-gray-400 py-2">No tasks</div>
                </div>
              </template>
            </div>

            <div v-if="linkedStories.length === 0" class="text-center py-12">
              <p class="text-gray-400 text-sm">No stories linked to this initiative yet.</p>
              <p class="text-xs text-gray-400 mt-1">Set the initiative field on backlog stories to "{{ initiative.title }}" to link them here.</p>
            </div>
          </div>
        </div>

        <!-- ========== DELIVERY PROGRESS TAB ========== -->
        <div v-else-if="activeTab === 'Delivery Progress'" class="bg-white rounded-xl border border-gray-100 min-h-[300px]">
          <div class="flex flex-col items-center justify-center py-20">
            <div class="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-300"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            </div>
            <p class="text-sm font-medium text-gray-500">Delivery Progress</p>
            <p class="text-xs text-gray-400 mt-1">Coming soon</p>
          </div>
        </div>

        <!-- ========== METRICS TAB ========== -->
        <div v-else-if="activeTab === 'Metrics'" class="bg-white rounded-xl border border-gray-100 min-h-[300px]">
          <div class="flex flex-col items-center justify-center py-20">
            <div class="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-300"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>
            </div>
            <p class="text-sm font-medium text-gray-500">Metrics</p>
            <p class="text-xs text-gray-400 mt-1">Coming soon</p>
          </div>
        </div>

      </div>
    </template>
  </div>
</template>

<style scoped>
.rich-text-content :deep(h1) {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0.75rem 0 0.5rem;
}
.rich-text-content :deep(h2) {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0.75rem 0 0.5rem;
}
.rich-text-content :deep(h3) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0.5rem 0 0.25rem;
}
.rich-text-content :deep(ul) {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
.rich-text-content :deep(ol) {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
.rich-text-content :deep(li) {
  margin: 0.25rem 0;
}
.rich-text-content :deep(blockquote) {
  border-left: 3px solid #e5e7eb;
  padding-left: 1rem;
  margin: 0.5rem 0;
  color: #6b7280;
  font-style: italic;
}
.rich-text-content :deep(code) {
  background: #f3f4f6;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
  font-family: monospace;
}
.rich-text-content :deep(a) {
  color: #4857FE;
  text-decoration: underline;
}
.rich-text-content :deep(p) {
  margin: 0.25rem 0;
}
</style>
