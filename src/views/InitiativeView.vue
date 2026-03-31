<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Link2, Loader2, ChevronRight, ChevronDown, ArrowLeft, Pencil, Check, X, Search } from 'lucide-vue-next'
import TaskStatusIcon from '@/components/shared/TaskStatusIcon.vue'
import { useInitiativesStore } from '@/stores/initiatives'
import { useBacklogStore } from '@/stores/backlog'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/lib/api'
import { organizationTeamsApi, productsApi, type ApiOrganizationTeam, type ApiProductMember } from '@/lib/apiClient'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { Initiative, InitiativeStatus, InitiativePriority, InitiativeInsights } from '@/types/initiative'
import type { TaskStatus } from '@/types/backlog'
import RichTextEditor from '@/components/ui/RichTextEditor.vue'
import { usePagePermissions } from '@/lib/pagePermissions'
import {
  daysAgo,
  deliveryProgressColor,
  formatDate,
  formatFullDate,
  formatPeriod,
  formatTimelineRange,
  priorityCircleColor,
  priorityNumber,
  ratioPercent,
} from '@/views/initiativeViewUtils'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

const route = useRoute()
const router = useRouter()
const initiativesStore = useInitiativesStore()
const backlogStore = useBacklogStore()
const productStore = useProductStore()
const authStore = useAuthStore()
const initiativePermissions = usePagePermissions('initiatives')
const taskPermissions = usePagePermissions('tasks')
const canEditInitiatives = computed(() => initiativePermissions.canEdit.value)
const canEditTasks = computed(() => taskPermissions.canEdit.value)
const sanitizedInitiativeDescription = computed(() => sanitizeHtml(initiative.value?.description || ''))

// Find the product info (logo, name) for the initiative
const initiativeProduct = computed(() => {
  if (!initiative.value) return null
  return productStore.products.find(
    p => p.id === initiative.value!.productId || p.name === initiative.value!.productId,
  ) || null
})
const initiativeProductLogoFailed = ref(false)
const initiativeProductLogoVisible = computed(
  () => Boolean(initiativeProduct.value?.logo) && !initiativeProductLogoFailed.value,
)

function onInitiativeProductLogoError(): void {
  initiativeProductLogoFailed.value = true
}

const initiative = ref<Initiative | null>(null)
const insights = ref<InitiativeInsights | null>(null)
const insightsError = ref<string | null>(null)
const loading = ref(true)
const expandedItems = ref<Set<string>>(new Set())
const assignmentMembers = ref<ApiProductMember[]>([])
const assignmentTeams = ref<ApiOrganizationTeam[]>([])
const assignmentOptionsLoading = ref(false)
const assignmentOptionsError = ref<string | null>(null)
const assignmentsSaving = ref(false)
const memberSearch = ref('')
const teamSearch = ref('')

const TAB_TO_QUERY = {
  'Initiative Overview': 'overview',
  'Stories & Backlog': 'stories',
  'Delivery Progress': 'delivery-progress',
  Metrics: 'metrics',
} as const

type InitiativeTab = keyof typeof TAB_TO_QUERY

const QUERY_TO_TAB: Record<string, InitiativeTab> = {
  overview: 'Initiative Overview',
  stories: 'Stories & Backlog',
  'delivery-progress': 'Delivery Progress',
  metrics: 'Metrics',
}

const tabs = Object.keys(TAB_TO_QUERY) as InitiativeTab[]

function resolveTabFromQuery(value: unknown): InitiativeTab {
  return typeof value === 'string' && QUERY_TO_TAB[value]
    ? QUERY_TO_TAB[value]
    : 'Initiative Overview'
}

const activeTab = ref<InitiativeTab>(resolveTabFromQuery(route.query.tab))

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

const assignedMembers = computed(() => initiative.value?.members || [])
const assignedTeams = computed(() => initiative.value?.teams || [])
const assignedMemberIds = computed(() => assignedMembers.value.map((entry) => entry.userId))
const assignedTeamIds = computed(() => assignedTeams.value.map((entry) => entry.organizationTeamId))
const memberLookup = computed(() => {
  const index = new Map<string, ApiProductMember>()
  for (const member of assignmentMembers.value) {
    index.set(member.userId, member)
  }
  return index
})
const teamLookup = computed(() => {
  const index = new Map<string, ApiOrganizationTeam>()
  for (const team of assignmentTeams.value) {
    index.set(team.id, team)
  }
  return index
})
const filteredMemberOptions = computed(() => {
  const q = memberSearch.value.trim().toLowerCase()
  if (!q) return assignmentMembers.value
  return assignmentMembers.value.filter((member) =>
    member.userName.toLowerCase().includes(q) || member.userEmail.toLowerCase().includes(q),
  )
})
const filteredTeamOptions = computed(() => {
  const q = teamSearch.value.trim().toLowerCase()
  if (!q) return assignmentTeams.value
  return assignmentTeams.value.filter((team) =>
    team.name.toLowerCase().includes(q) || team.key.toLowerCase().includes(q),
  )
})

const deliveryProgressItems = computed(() => insights.value?.deliveryProgress.deliveries || [])
const timelinePeriod = computed(() => insights.value?.timeline?.period || null)
const timelineMilestones = computed(() => insights.value?.timeline?.milestones || [])

const storyStatusBreakdown = computed(() =>
  Object.entries(insights.value?.metrics.storyByStatus || {}).sort((a, b) => b[1] - a[1]),
)

const taskStatusBreakdown = computed(() =>
  Object.entries(insights.value?.metrics.taskByStatus || {}).sort((a, b) => b[1] - a[1]),
)

async function loadAssignmentOptions(productId: string) {
  assignmentOptionsLoading.value = true
  assignmentOptionsError.value = null
  try {
    let product = productStore.products.find((item) => item.id === productId)
      || (productStore.activeProduct?.id === productId ? productStore.activeProduct : null)
    if (!product && !productStore.loading) {
      await productStore.fetchProducts()
      product = productStore.products.find((item) => item.id === productId)
        || (productStore.activeProduct?.id === productId ? productStore.activeProduct : null)
    }
    const organizationId = product?.organizationId || null
    const resolvedProductId: string = productId
    const [memberPayload, teamPayload] = await Promise.all([
      organizationId
        ? productsApi.getMembers(organizationId, resolvedProductId, authStore.token)
        : Promise.resolve([]),
      organizationId
        ? organizationTeamsApi.list(organizationId, {}, authStore.token)
        : Promise.resolve([] as ApiOrganizationTeam[]),
    ])
    assignmentMembers.value = Array.isArray(memberPayload) ? memberPayload : []
    assignmentTeams.value = Array.isArray(teamPayload) ? teamPayload : []
  } catch {
    assignmentMembers.value = []
    assignmentTeams.value = []
    assignmentOptionsError.value = 'Unable to load team/member options right now.'
  } finally {
    assignmentOptionsLoading.value = false
  }
}

async function loadInitiative(id: string) {
  loading.value = true
  insightsError.value = null
  memberSearch.value = ''
  teamSearch.value = ''
  const [initiativeData, initiativeInsights] = await Promise.all([
    initiativesStore.fetchInitiative(id),
    initiativesStore.fetchInitiativeInsights(id),
    backlogStore.fetchStories(),
  ])
  initiative.value = initiativeData
  insights.value = initiativeInsights
  if (!initiativeInsights && initiativesStore.insightsError) {
    insightsError.value = initiativesStore.insightsError
  }
  if (initiativeData?.productId) {
    await loadAssignmentOptions(initiativeData.productId)
  } else {
    assignmentMembers.value = []
    assignmentTeams.value = []
  }
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

watch(
  () => route.query.tab,
  (value) => {
    const resolvedTab = resolveTabFromQuery(value)
    if (activeTab.value !== resolvedTab) activeTab.value = resolvedTab
  },
)

watch(() => initiativeProduct.value?.id, () => {
  initiativeProductLogoFailed.value = false
})

watch(() => initiativeProduct.value?.logo, () => {
  initiativeProductLogoFailed.value = false
})

watch(activeTab, (tab) => {
  const tabQuery = TAB_TO_QUERY[tab]
  if (route.query.tab === tabQuery) return
  void router.replace({
    query: {
      ...route.query,
      tab: tabQuery,
    },
  })
})

// --- Inline edit helpers ---

async function updateField(field: string, value: any) {
  if (!canEditInitiatives.value) return
  if (!initiative.value) return
  await initiativesStore.updateInitiative(initiative.value.id, { [field]: value })
  const [freshInitiative, freshInsights] = await Promise.all([
    initiativesStore.fetchInitiative(initiative.value.id),
    initiativesStore.fetchInitiativeInsights(initiative.value.id),
  ])
  initiative.value = freshInitiative
  insights.value = freshInsights
  editingField.value = null
}

function startEditTitle() {
  if (!canEditInitiatives.value) return
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
  if (!canEditInitiatives.value) return
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
    const payload = await usersApi.list({ q: query }, authStore.token)
    leaderSearchResults.value = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.items) ? payload.items : [])
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
  if (!canEditInitiatives.value) return
  if (!initiative.value) return
  const [_, freshInitiative, freshInsights] = await Promise.all([
    initiativesStore.updateInitiative(initiative.value.id, {
      leaderUserId: user.id,
    }),
    initiativesStore.fetchInitiative(initiative.value.id),
    initiativesStore.fetchInitiativeInsights(initiative.value.id),
  ])
  initiative.value = freshInitiative
  insights.value = freshInsights
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
      const match = results.find(u => u.name === editLeader.value.trim())
      if (match) {
        selectLeader(match)
      } else {
        editingField.value = null
      }
    }
  } else if (e.key === 'Escape') {
    editingField.value = null
  }
}

function saveLeader() {
  if (!editLeader.value.trim()) {
    editingField.value = null
    return
  }
  const match = leaderSearchResults.value.find(u => u.name === editLeader.value.trim())
  if (match) {
    selectLeader(match)
  } else {
    editingField.value = null
  }
}

function startEditDescription() {
  if (!canEditInitiatives.value) return
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

function onPeriodChange(range: { start: string | null; end: string | null }) {
  if (!canEditInitiatives.value) return
  if (!initiative.value) return
  initiativesStore.updateInitiative(initiative.value.id, {
    periodStart: range.start || undefined,
    periodEnd: range.end || undefined,
  }).then(async () => {
    const [freshInitiative, freshInsights] = await Promise.all([
      initiativesStore.fetchInitiative(initiative.value!.id),
      initiativesStore.fetchInitiativeInsights(initiative.value!.id),
    ])
    initiative.value = freshInitiative
    insights.value = freshInsights
  })
}

const periodRange = computed(() => ({
  start: initiative.value?.periodStart || null,
  end: initiative.value?.periodEnd || null,
}))

function initials(value: string) {
  return value.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2)
}

function isMemberAssigned(userId: string) {
  return assignedMemberIds.value.includes(userId)
}

function isTeamAssigned(teamId: string) {
  return assignedTeamIds.value.includes(teamId)
}

function assignedMemberName(userId: string, fallback?: string | null) {
  if (fallback) return fallback
  return memberLookup.value.get(userId)?.userName || 'Unknown member'
}

function assignedMemberAvatar(userId: string, fallback?: string | null) {
  if (fallback) return fallback
  return memberLookup.value.get(userId)?.userAvatar || null
}

function assignedTeamName(teamId: string, fallback?: string | null) {
  if (fallback) return fallback
  return teamLookup.value.get(teamId)?.name || 'Unknown team'
}

async function saveAssignments(memberUserIds: string[], teamIds: string[]) {
  if (!canEditInitiatives.value) return
  if (!initiative.value || assignmentsSaving.value) return
  assignmentsSaving.value = true
  try {
    await initiativesStore.updateInitiative(initiative.value.id, { memberUserIds, teamIds })
    const [freshInitiative, freshInsights] = await Promise.all([
      initiativesStore.fetchInitiative(initiative.value.id),
      initiativesStore.fetchInitiativeInsights(initiative.value.id),
    ])
    initiative.value = freshInitiative
    insights.value = freshInsights
  } finally {
    assignmentsSaving.value = false
  }
}

async function toggleMemberAssignment(userId: string) {
  const nextMemberIds = isMemberAssigned(userId)
    ? assignedMemberIds.value.filter((id) => id !== userId)
    : [...assignedMemberIds.value, userId]
  await saveAssignments(nextMemberIds, assignedTeamIds.value)
}

async function toggleTeamAssignment(teamId: string) {
  const nextTeamIds = isTeamAssigned(teamId)
    ? assignedTeamIds.value.filter((id) => id !== teamId)
    : [...assignedTeamIds.value, teamId]
  await saveAssignments(assignedMemberIds.value, nextTeamIds)
}

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
  { value: 'critical', label: 'Critical', number: 1, color: 'bg-[#e2445c]' },
  { value: 'high', label: 'High', number: 2, color: 'bg-[#fdab3d]' },
  { value: 'medium', label: 'Medium', number: 3, color: 'bg-[#00c875]' },
  { value: 'low', label: 'Low', number: 4, color: 'bg-[#579bfc]' },
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

function cycleTaskStatus(taskId: string, currentStatus: TaskStatus) {
  if (!canEditTasks.value) return
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

            <span class="w-1 h-7 rounded-full shrink-0" :class="statusStyle(initiative.status).split(' ')[0]"></span>

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
              class="text-2xl font-semibold transition-colors group/title"
              :class="canEditInitiatives ? 'text-gray-900 cursor-pointer hover:text-[#4857FE]' : 'text-gray-500 cursor-not-allowed'"
              :title="initiativePermissions.deniedReason('edit', 'initiatives') || 'Edit title'"
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
              <img
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
                <img
                  v-if="initiativeProductLogoVisible"
                  :src="initiativeProduct?.logo || ''"
                  :alt="initiativeProduct?.name || 'Product'"
                  class="w-7 h-7 rounded-lg object-cover"
                  @error="onInitiativeProductLogoError"
                />
                <div
                  v-else-if="initiativeProduct"
                  class="w-7 h-7 rounded-lg bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-bold text-[#4857FE]"
                >
                  {{ initiativeProduct.name.slice(0, 2).toUpperCase() }}
                </div>
                <span class="text-sm font-medium text-gray-900">{{ initiativeProduct?.name || initiative.productId }}</span>
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
                <div
                  class="bg-white rounded-xl border border-gray-100 p-5 transition-all group/card"
                  :class="canEditInitiatives ? 'cursor-pointer hover:border-[#4857FE]/30 hover:shadow-sm' : 'cursor-not-allowed opacity-80'"
                  :title="initiativePermissions.deniedReason('edit', 'initiative status') || 'Update status'"
                >
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
                  :disabled="!canEditInitiatives"
                  :title="initiativePermissions.deniedReason('edit', 'initiative status') || 'Update status'"
                  @click="updateStatus(s.value)"
                >
                  <span class="w-3 h-3 rounded-full" :class="statusStyle(s.value).split(' ')[0]"></span>
                  {{ s.label }}
                </button>
              </PopoverContent>
            </Popover>

            <!-- Period Card (date range picker) -->
            <div
              class="bg-white rounded-xl border border-gray-100 p-5 transition-all group/card"
              :class="canEditInitiatives ? 'hover:border-[#4857FE]/30 hover:shadow-sm' : 'opacity-80'"
              :title="initiativePermissions.deniedReason('edit', 'initiative period') || 'Update period'"
            >
              <div class="flex items-center justify-between">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Period</p>
                <Pencil :size="12" class="text-gray-300 opacity-0 group-hover/card:opacity-100 transition-opacity" />
              </div>
              <div class="mt-2">
                <div :class="canEditInitiatives ? '' : 'pointer-events-none opacity-60'">
                  <DateRangePicker
                    :model-value="periodRange"
                    @update:model-value="onPeriodChange"
                  />
                </div>
              </div>
            </div>

            <!-- Leader Card (click to edit with user search) -->
            <div
              class="bg-white rounded-xl border border-gray-100 p-5 transition-all group/card relative"
              :class="canEditInitiatives ? 'cursor-pointer hover:border-[#4857FE]/30 hover:shadow-sm' : 'cursor-not-allowed opacity-80'"
              :title="initiativePermissions.deniedReason('edit', 'initiative leader') || 'Update leader'"
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
                        <img
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
                  <img
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
                <div
                  class="bg-white rounded-xl border border-gray-100 p-5 transition-all group/card"
                  :class="canEditInitiatives ? 'cursor-pointer hover:border-[#4857FE]/30 hover:shadow-sm' : 'cursor-not-allowed opacity-80'"
                  :title="initiativePermissions.deniedReason('edit', 'initiative priority') || 'Update priority'"
                >
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
                  :disabled="!canEditInitiatives"
                  :title="initiativePermissions.deniedReason('edit', 'initiative priority') || 'Update priority'"
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

          <!-- Assigned Teams & Members -->
          <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div class="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold text-gray-800">Assigned Teams</h3>
                  <p class="text-xs text-gray-400 mt-0.5">Teams explicitly assigned to this initiative.</p>
                </div>
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#4857FE]/10 text-[#4857FE]">
                  {{ assignedTeams.length }}
                </span>
              </div>

              <div class="space-y-2">
                <input
                  v-model="teamSearch"
                  type="text"
                  class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4857FE]/30 focus:border-[#4857FE]/30"
                  placeholder="Search teams..."
                />
                <div class="max-h-[180px] overflow-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                  <div v-if="assignmentOptionsLoading" class="px-3 py-3 text-xs text-gray-400 flex items-center gap-2">
                    <Loader2 :size="12" class="animate-spin" />
                    Loading team options...
                  </div>
                  <div v-else-if="filteredTeamOptions.length === 0" class="px-3 py-3 text-xs text-gray-400">
                    No teams found.
                  </div>
                  <button
                    v-for="team in filteredTeamOptions"
                    :key="team.id"
                    class="w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors"
                    :class="isTeamAssigned(team.id) ? 'bg-[#4857FE]/10 hover:bg-[#4857FE]/20' : 'hover:bg-gray-50'"
                    :disabled="!canEditInitiatives || assignmentsSaving"
                    :title="initiativePermissions.deniedReason('edit', 'initiative assignments') || 'Toggle team assignment'"
                    @click="toggleTeamAssignment(team.id)"
                  >
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-gray-800 truncate">{{ team.name }}</p>
                      <p class="text-[11px] text-gray-400 truncate">{{ team.key }}</p>
                    </div>
                    <Check v-if="isTeamAssigned(team.id)" :size="14" class="text-[#4857FE] shrink-0" />
                  </button>
                </div>
              </div>

              <div class="flex flex-wrap gap-2 pt-1">
                <span
                  v-for="team in assignedTeams"
                  :key="team.id"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-[#4857FE]/10 text-[#4857FE] font-medium"
                >
                  {{ assignedTeamName(team.organizationTeamId, team.team?.name) }}
                </span>
                <p v-if="assignedTeams.length === 0" class="text-xs text-gray-400">No teams assigned yet.</p>
              </div>
            </div>

            <div class="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold text-gray-800">Assigned Members</h3>
                  <p class="text-xs text-gray-400 mt-0.5">People currently assigned to this initiative.</p>
                </div>
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#7C5CFC]/10 text-[#7C5CFC]">
                  {{ assignedMembers.length }}
                </span>
              </div>

              <div class="space-y-2">
                <input
                  v-model="memberSearch"
                  type="text"
                  class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4857FE]/30 focus:border-[#4857FE]/30"
                  placeholder="Search members..."
                />
                <div class="max-h-[180px] overflow-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                  <div v-if="assignmentOptionsLoading" class="px-3 py-3 text-xs text-gray-400 flex items-center gap-2">
                    <Loader2 :size="12" class="animate-spin" />
                    Loading member options...
                  </div>
                  <div v-else-if="filteredMemberOptions.length === 0" class="px-3 py-3 text-xs text-gray-400">
                    No members found.
                  </div>
                  <button
                    v-for="member in filteredMemberOptions"
                    :key="member.userId"
                    class="w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors"
                    :class="isMemberAssigned(member.userId) ? 'bg-[#7C5CFC]/10 hover:bg-[#7C5CFC]/20' : 'hover:bg-gray-50'"
                    :disabled="!canEditInitiatives || assignmentsSaving"
                    :title="initiativePermissions.deniedReason('edit', 'initiative assignments') || 'Toggle member assignment'"
                    @click="toggleMemberAssignment(member.userId)"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <div class="w-7 h-7 rounded-full bg-[#7C5CFC] text-white text-[10px] font-medium flex items-center justify-center overflow-hidden shrink-0">
                        <img
                          v-if="member.userAvatar"
                          :src="member.userAvatar"
                          class="w-7 h-7 rounded-full object-cover"
                          :alt="member.userName"
                        />
                        <span v-else>{{ initials(member.userName) }}</span>
                      </div>
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">{{ member.userName }}</p>
                        <p class="text-[11px] text-gray-400 truncate">{{ member.userEmail }}</p>
                      </div>
                    </div>
                    <Check v-if="isMemberAssigned(member.userId)" :size="14" class="text-[#7C5CFC] shrink-0" />
                  </button>
                </div>
                <p v-if="assignmentOptionsError" class="text-[11px] text-amber-600">{{ assignmentOptionsError }}</p>
              </div>

              <div class="flex flex-wrap gap-2 pt-1">
                <span
                  v-for="member in assignedMembers"
                  :key="member.id"
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-[#7C5CFC]/10 text-[#7C5CFC] font-medium"
                >
                  <span class="w-4 h-4 rounded-full bg-[#7C5CFC] text-white text-[9px] flex items-center justify-center overflow-hidden">
                    <img
                      v-if="assignedMemberAvatar(member.userId, member.user?.avatar || null)"
                      :src="assignedMemberAvatar(member.userId, member.user?.avatar || null) || ''"
                      class="w-4 h-4 rounded-full object-cover"
                      :alt="assignedMemberName(member.userId, member.user?.name || null)"
                    />
                    <span v-else>{{ initials(assignedMemberName(member.userId, member.user?.name || null)) }}</span>
                  </span>
                  {{ assignedMemberName(member.userId, member.user?.name || null) }}
                </span>
                <p v-if="assignedMembers.length === 0" class="text-xs text-gray-400">No members assigned yet.</p>
              </div>
            </div>
          </div>

          <!-- Timeline Overview -->
          <div class="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-sm font-semibold text-gray-800">Timeline Overview</h3>
                <p class="text-xs text-gray-400 mt-0.5">Current schedule health and delivery milestones.</p>
              </div>
              <span
                v-if="timelinePeriod?.isOverdue"
                class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#e2445c]/10 text-[#e2445c]"
              >
                Overdue
              </span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div class="rounded-lg border border-gray-100 p-4">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">Period</p>
                <p class="text-sm font-medium text-gray-900 mt-1">
                  {{ formatTimelineRange(timelinePeriod?.startDate || null, timelinePeriod?.endDate || null) }}
                </p>
              </div>
              <div class="rounded-lg border border-gray-100 p-4">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">Elapsed</p>
                <p class="text-sm font-medium text-gray-900 mt-1">
                  {{ timelinePeriod?.elapsedDays ?? '—' }}<span class="text-xs text-gray-400"> days</span>
                </p>
              </div>
              <div class="rounded-lg border border-gray-100 p-4">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">Remaining</p>
                <p class="text-sm font-medium text-gray-900 mt-1">
                  {{ timelinePeriod?.remainingDays ?? '—' }}<span class="text-xs text-gray-400"> days</span>
                </p>
              </div>
              <div class="rounded-lg border border-gray-100 p-4">
                <p class="text-[11px] uppercase tracking-wide text-gray-400">Schedule Progress</p>
                <p class="text-sm font-medium text-gray-900 mt-1">{{ timelinePeriod?.scheduleProgressPercent ?? '—' }}%</p>
              </div>
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-semibold text-gray-700">Delivery Milestones</h4>
                <p class="text-xs text-gray-400">{{ timelineMilestones.length }} linked deliveries</p>
              </div>
              <div v-if="timelineMilestones.length === 0" class="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
                No delivery milestones linked yet.
              </div>
              <div v-else class="space-y-3">
                <div
                  v-for="delivery in timelineMilestones"
                  :key="delivery.id"
                  class="border border-gray-100 rounded-lg p-4"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-gray-900 truncate">{{ delivery.title }}</p>
                      <p class="text-xs text-gray-400 mt-0.5">{{ formatTimelineRange(delivery.startDate, delivery.endDate) }}</p>
                    </div>
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold" :class="statusStyle(delivery.status)">
                      {{ statusLabel(delivery.status) }}
                    </span>
                  </div>
                  <div class="mt-3">
                    <div class="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                      <span>{{ delivery.doneTasks }}/{{ delivery.totalTasks }} tasks</span>
                      <span>{{ delivery.progress }}%</span>
                    </div>
                    <div class="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                      <div class="h-full rounded-full transition-all" :class="deliveryProgressColor(delivery.progress)" :style="{ width: `${delivery.progress}%` }"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Description (editable) -->
          <div
            class="bg-white rounded-xl border border-gray-100 p-6 transition-all group/card"
            :class="canEditInitiatives ? 'cursor-pointer hover:border-[#4857FE]/30 hover:shadow-sm' : 'cursor-not-allowed opacity-80'"
            :title="initiativePermissions.deniedReason('edit', 'initiative description') || 'Edit description'"
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
              <div v-if="initiative.description" class="text-sm text-gray-600 leading-relaxed prose prose-sm max-w-none rich-text-content" v-html="sanitizedInitiativeDescription"></div>
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
                      <button
                        @click.stop="cycleTaskStatus(task.id, task.status)"
                        class="shrink-0"
                        :disabled="!canEditTasks"
                        :title="taskPermissions.deniedReason('edit', 'tasks') || 'Cycle task status'"
                      >
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
        <div v-else-if="activeTab === 'Delivery Progress'" class="space-y-5">
          <div v-if="initiativesStore.insightsLoading" class="bg-white rounded-xl border border-gray-100 min-h-[240px] flex items-center justify-center">
            <Loader2 :size="20" class="animate-spin text-[#4857FE]" />
          </div>
          <div v-else-if="insightsError" class="bg-white rounded-xl border border-red-100 text-red-600 px-4 py-3 text-sm">
            {{ insightsError }}
          </div>
          <template v-else>
            <div class="grid grid-cols-4 gap-4">
              <div class="bg-white rounded-xl border border-gray-100 p-5">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Deliveries</p>
                <p class="text-2xl font-semibold text-gray-900 mt-2">{{ insights?.overview.deliveriesCount || 0 }}</p>
              </div>
              <div class="bg-white rounded-xl border border-gray-100 p-5">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Completed</p>
                <p class="text-2xl font-semibold text-green-600 mt-2">{{ insights?.overview.deliveriesCompleted || 0 }}</p>
              </div>
              <div class="bg-white rounded-xl border border-gray-100 p-5">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Average Progress</p>
                <p class="text-2xl font-semibold text-[#4857FE] mt-2">{{ insights?.deliveryProgress.averageProgress || 0 }}%</p>
              </div>
              <div class="bg-white rounded-xl border border-gray-100 p-5">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Task Completion</p>
                <p class="text-2xl font-semibold text-gray-900 mt-2">{{ ratioPercent(insights?.overview.tasksCompleted || 0, insights?.overview.tasksCount || 0) }}%</p>
              </div>
            </div>

            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 class="text-sm font-semibold text-[#4857FE]">Linked Deliveries</h3>
                <p class="text-xs text-gray-400">{{ deliveryProgressItems.length }} deliveries</p>
              </div>

              <div v-if="deliveryProgressItems.length === 0" class="py-10 text-center text-sm text-gray-400">
                No deliveries linked to this initiative yet.
              </div>

              <div v-else class="divide-y divide-gray-100">
                <div v-for="delivery in deliveryProgressItems" :key="delivery.id" class="px-6 py-4">
                  <div class="flex items-center justify-between gap-4">
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-gray-900 truncate">{{ delivery.title }}</p>
                      <p class="text-xs text-gray-400 mt-1">
                        {{ statusLabel(delivery.status) }} •
                        {{ delivery.startDate ? formatDate(delivery.startDate) : 'No start date' }} - {{ delivery.endDate ? formatDate(delivery.endDate) : 'No end date' }}
                      </p>
                    </div>
                    <div class="text-right shrink-0">
                      <p class="text-sm font-semibold text-gray-800">{{ delivery.progress }}%</p>
                      <p class="text-xs text-gray-400">{{ delivery.doneTasks }}/{{ delivery.totalTasks }} tasks</p>
                    </div>
                  </div>
                  <div class="mt-3 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-300"
                      :class="deliveryProgressColor(delivery.progress)"
                      :style="{ width: `${delivery.progress}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- ========== METRICS TAB ========== -->
        <div v-else-if="activeTab === 'Metrics'" class="space-y-5">
          <div v-if="initiativesStore.insightsLoading" class="bg-white rounded-xl border border-gray-100 min-h-[240px] flex items-center justify-center">
            <Loader2 :size="20" class="animate-spin text-[#4857FE]" />
          </div>
          <div v-else-if="insightsError" class="bg-white rounded-xl border border-red-100 text-red-600 px-4 py-3 text-sm">
            {{ insightsError }}
          </div>
          <template v-else>
            <div class="grid grid-cols-4 gap-4">
              <div class="bg-white rounded-xl border border-gray-100 p-5">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Completion Rate</p>
                <p class="text-2xl font-semibold text-[#4857FE] mt-2">{{ insights?.metrics.completionRate || 0 }}%</p>
              </div>
              <div class="bg-white rounded-xl border border-gray-100 p-5">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Throughput (14d)</p>
                <p class="text-2xl font-semibold text-green-600 mt-2">{{ insights?.metrics.throughput14d || 0 }}</p>
              </div>
              <div class="bg-white rounded-xl border border-gray-100 p-5">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Blocked Tasks</p>
                <p class="text-2xl font-semibold text-amber-600 mt-2">{{ insights?.overview.tasksBlocked || 0 }}</p>
              </div>
              <div class="bg-white rounded-xl border border-gray-100 p-5">
                <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Overdue Tasks</p>
                <p class="text-2xl font-semibold text-red-600 mt-2">{{ insights?.overview.tasksOverdue || 0 }}</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-5">
              <div class="bg-white rounded-xl border border-gray-100">
                <div class="px-5 py-4 border-b border-gray-100">
                  <h3 class="text-sm font-semibold text-gray-700">Stories by Status</h3>
                </div>
                <div v-if="storyStatusBreakdown.length === 0" class="px-5 py-10 text-center text-sm text-gray-400">
                  No story metrics available.
                </div>
                <div v-else class="px-5 py-4 space-y-3">
                  <div v-for="[status, count] in storyStatusBreakdown" :key="status">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-gray-600">{{ statusLabel(status) }}</span>
                      <span class="text-gray-500">{{ count }}</span>
                    </div>
                    <div class="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        class="h-full bg-[#4857FE] rounded-full"
                        :style="{ width: `${ratioPercent(count, insights?.overview.storiesCount || 0)}%` }"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-xl border border-gray-100">
                <div class="px-5 py-4 border-b border-gray-100">
                  <h3 class="text-sm font-semibold text-gray-700">Tasks by Status</h3>
                </div>
                <div v-if="taskStatusBreakdown.length === 0" class="px-5 py-10 text-center text-sm text-gray-400">
                  No task metrics available.
                </div>
                <div v-else class="px-5 py-4 space-y-3">
                  <div v-for="[status, count] in taskStatusBreakdown" :key="status">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-gray-600">{{ statusLabel(status) }}</span>
                      <span class="text-gray-500">{{ count }}</span>
                    </div>
                    <div class="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        class="h-full bg-green-500 rounded-full"
                        :style="{ width: `${ratioPercent(count, insights?.overview.tasksCount || 0)}%` }"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
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
