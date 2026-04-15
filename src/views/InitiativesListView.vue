<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus, Loader2, Search,
  CalendarDays, Archive,
  LayoutList, LayoutGrid, ArrowUp, ArrowDown,
} from 'lucide-vue-next'
import { useInitiativesStore } from '@/stores/initiatives'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'
import CreateInitiativeDialog from '@/components/initiative/CreateInitiativeDialog.vue'
import InitiativeDetailPanel from '@/components/initiative/InitiativeDetailPanel.vue'
import FavoriteStar from '@/components/shared/FavoriteStar.vue'
import type { Initiative } from '@/types/initiative'

interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

const router = useRouter()
const initiativesStore = useInitiativesStore()
const productStore = useProductStore()
const authStore = useAuthStore()
const rolesStore = useRolesStore()

const showCreateDialog = ref(false)
const searchQuery = ref('')
const activeTab = ref<'active' | 'inactive' | 'archived'>('active')
const viewMode = ref<'table' | 'card'>(localStorage.getItem('initiatives-view-mode') as 'table' | 'card' || 'table')
const sortField = ref<string>('createdAt')
const sortDir = ref<'asc' | 'desc'>('desc')

watch(viewMode, (v) => {
  localStorage.setItem('initiatives-view-mode', v)
})

// Detail panel state
const selectedInitiative = ref<Initiative | null>(null)
const showDetailPanel = ref(false)
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

function openDetailPanel(initiative: Initiative) {
  selectedInitiative.value = initiative
  showDetailPanel.value = true
}

function closeDetailPanel() {
  showDetailPanel.value = false
  selectedInitiative.value = null
}

async function onInitiativeUpdated() {
  await initiativesStore.fetchInitiatives()
  // Refresh selected initiative from store
  if (selectedInitiative.value) {
    const fresh = initiativesStore.initiatives.find(i => i.id === selectedInitiative.value!.id)
    if (fresh) {
      selectedInitiative.value = fresh
    }
  }
}

onMounted(() => {
  initiativesStore.fetchInitiatives()
  fetchTeamMembers()
})
watch(() => productStore.activeProductId, () => {
  initiativesStore.fetchInitiatives()
  fetchTeamMembers()
})

// Active = planning, active, paused; Inactive = completed
const activeInitiatives = computed(() => {
  return initiativesStore.initiatives.filter(i =>
    i.status === 'planning' || i.status === 'active' || i.status === 'paused'
  )
})

const inactiveInitiatives = computed(() => {
  return initiativesStore.initiatives.filter(i => i.status === 'completed')
})

const archivedInitiatives = computed(() => {
  return initiativesStore.initiatives.filter(i => i.status === 'archived')
})

async function archiveInitiative(initiative: Initiative, event: Event) {
  event.stopPropagation()
  await initiativesStore.updateInitiative(initiative.id, { status: 'archived' })
}

const currentList = computed(() => {
  let list = activeTab.value === 'active'
    ? activeInitiatives.value
    : activeTab.value === 'archived'
      ? archivedInitiatives.value
      : inactiveInitiatives.value
  // Self-view-only: show only initiatives where user is the leader
  if (rolesStore.isSelfViewOnly('initiatives') && authStore.user) {
    list = list.filter(i => i.leader === authStore.user!.name)
  }
  const q = searchQuery.value.toLowerCase().trim()
  let filtered = list
  if (q) {
    filtered = list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.leader && i.leader.toLowerCase().includes(q)) ||
      i.status.toLowerCase().includes(q)
    )
  }
  // Sort
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...filtered].sort((a: any, b: any) => {
    const va = a[sortField.value] || ''
    const vb = b[sortField.value] || ''
    if (va < vb) return -1 * dir
    if (va > vb) return 1 * dir
    return 0
  })
})

function toggleSort(field: string) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}

function onInitiativeCreated(id: string) {
  showCreateDialog.value = false
  initiativesStore.fetchInitiatives()
  router.push(`/initiatives/${id}`)
}

// ============ STYLING ============

function statusStyle(status: string) {
  switch (status) {
    case 'planning': return 'bg-[#fdab3d] text-white'
    case 'active': return 'bg-[#00c875] text-white'
    case 'paused': return 'bg-[#e2445c] text-white'
    case 'completed': return 'bg-gray-400 text-white'
    case 'archived': return 'bg-gray-400 text-white'
    default: return 'bg-gray-400 text-white'
  }
}

function statusDotColor(status: string) {
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

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatPeriod(start: string | null, end: string | null) {
  if (!start && !end) return '—'
  const s = start ? new Date(start).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '?'
  const e = end ? new Date(end).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '?'
  return `${s} – ${e}`
}

const sortableColumns = ['title', 'status', 'priority', 'leader', 'createdAt']
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 pt-7 pb-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="text-[#4857FE]"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/></svg>
          </div>
          <h1 class="text-lg font-semibold text-gray-900">Initiatives <span class="text-gray-400 font-normal">({{ initiativesStore.initiatives.length }})</span></h1>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="flex items-center gap-1.5 bg-[#4857FE] hover:bg-[#3E4BDE] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            @click="showCreateDialog = true"
          >
            <Plus :size="15" />
            Add Initiative
          </button>
        </div>
      </div>
    </div>

    <!-- Status Tabs + Search + View Toggle -->
    <div class="bg-white px-8 pt-4 pb-3 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1">
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'active'
              ? 'text-[#00c875] border-[#00c875]'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'active'"
          >
            Active
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#00c875]/15 text-[#00a65a]">{{ activeInitiatives.length }}</span>
          </button>
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'inactive'
              ? 'text-gray-600 border-gray-400'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'inactive'"
          >
            Completed
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-gray-200 text-gray-600">{{ inactiveInitiatives.length }}</span>
          </button>
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'archived'
              ? 'text-gray-500 border-gray-400'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'archived'"
          >
            Archived
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-gray-200 text-gray-500">{{ archivedInitiatives.length }}</span>
          </button>
        </div>

        <!-- Search + View Toggle -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input
              v-model="searchQuery"
              class="text-sm text-gray-700 bg-transparent outline-none w-44 placeholder-gray-400"
              placeholder="Search initiatives..."
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
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto px-8 py-6">
      <!-- Loading -->
      <div v-if="initiativesStore.loading" class="flex items-center justify-center py-16">
        <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
      </div>

      <!-- Empty state -->
      <div v-else-if="currentList.length === 0" class="flex flex-col items-center justify-center py-20">
        <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/></svg>
        </div>
        <p class="text-gray-500 text-sm font-medium mb-1">
          {{ activeTab === 'active' ? 'No active initiatives' : activeTab === 'archived' ? 'No archived initiatives' : 'No completed initiatives' }}
        </p>
        <p class="text-gray-400 text-xs mb-4">
          {{ activeTab === 'active' ? 'Create an initiative to get started' : activeTab === 'archived' ? 'Archived initiatives will appear here' : 'Completed initiatives will appear here' }}
        </p>
        <button
          v-if="activeTab === 'active'"
          class="flex items-center gap-1.5 px-4 py-2 bg-[#4857FE] text-white text-sm font-medium rounded-lg hover:bg-[#3a46d9] transition-colors cursor-pointer"
          @click="showCreateDialog = true"
        >
          <Plus :size="15" />
          Add Initiative
        </button>
      </div>

      <!-- Table View -->
      <div v-else-if="viewMode === 'table'" class="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100">
              <th
                class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                @click="toggleSort('title')"
              >
                <div class="flex items-center gap-1">
                  Title
                  <template v-if="sortField === 'title'">
                    <ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" />
                    <ArrowDown v-else :size="12" class="text-[#4857FE]" />
                  </template>
                </div>
              </th>
              <th
                class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                @click="toggleSort('status')"
              >
                <div class="flex items-center gap-1">
                  Status
                  <template v-if="sortField === 'status'">
                    <ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" />
                    <ArrowDown v-else :size="12" class="text-[#4857FE]" />
                  </template>
                </div>
              </th>
              <th
                class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                @click="toggleSort('priority')"
              >
                <div class="flex items-center gap-1">
                  Priority
                  <template v-if="sortField === 'priority'">
                    <ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" />
                    <ArrowDown v-else :size="12" class="text-[#4857FE]" />
                  </template>
                </div>
              </th>
              <th
                class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                @click="toggleSort('leader')"
              >
                <div class="flex items-center gap-1">
                  Leader
                  <template v-if="sortField === 'leader'">
                    <ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" />
                    <ArrowDown v-else :size="12" class="text-[#4857FE]" />
                  </template>
                </div>
              </th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
              <th
                class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                @click="toggleSort('createdAt')"
              >
                <div class="flex items-center gap-1">
                  Created
                  <template v-if="sortField === 'createdAt'">
                    <ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" />
                    <ArrowDown v-else :size="12" class="text-[#4857FE]" />
                  </template>
                </div>
              </th>
              <th class="w-12"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="initiative in currentList"
              :key="initiative.id"
              class="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors group"
              @click="router.push(`/initiatives/${initiative.id}`)"
            >
              <!-- Title -->
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-2 min-w-0">
                  <FavoriteStar entity-type="initiative" :entity-id="initiative.id" :product-id="productStore.activeProductScopeForApi" />
                  <span class="w-1 h-7 rounded-full flex-shrink-0" :class="statusDotColor(initiative.status)"></span>
                  <span class="text-sm font-medium text-gray-900 truncate">{{ initiative.title }}</span>
                </div>
              </td>

              <!-- Status -->
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full" :class="statusStyle(initiative.status)">
                  {{ statusLabel(initiative.status) }}
                </span>
              </td>

              <!-- Priority -->
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold" :class="priorityStyle(initiative.priority)">
                  {{ priorityLabel(initiative.priority) }}
                </span>
              </td>

              <!-- Leader -->
              <td class="px-5 py-3.5">
                <div v-if="initiative.leader" class="flex items-center gap-2 min-w-0">
                  <UploadAssetImg v-if="initiative.leaderAvatar" :src="initiative.leaderAvatar" class="w-6 h-6 rounded-full object-cover" />
                  <div v-else class="w-6 h-6 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-semibold text-[#4857FE]">
                    {{ initiative.leader[0]?.toUpperCase() }}
                  </div>
                  <span class="text-sm text-gray-600 truncate">{{ initiative.leader }}</span>
                </div>
                <span v-else class="text-sm text-gray-400">—</span>
              </td>

              <!-- Period -->
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-1.5 text-sm text-gray-500">
                  <CalendarDays :size="13" class="text-gray-400 shrink-0" />
                  <span class="truncate">{{ formatPeriod(initiative.periodStart, initiative.periodEnd) }}</span>
                </div>
              </td>

              <!-- Created -->
              <td class="px-5 py-3.5">
                <span class="text-sm text-gray-500">{{ formatDate(initiative.createdAt) }}</span>
              </td>

              <!-- Archive action -->
              <td class="px-5 py-3.5">
                <button
                  v-if="initiative.status !== 'archived'"
                  class="p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="Archive initiative"
                  @click="archiveInitiative(initiative, $event)"
                >
                  <Archive :size="14" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Card View -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="initiative in currentList"
          :key="initiative.id"
          @click="router.push(`/initiatives/${initiative.id}`)"
          class="bg-white rounded-xl border border-gray-200/80 p-5 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group"
        >
          <!-- Header: title + status badge -->
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex items-center gap-2 min-w-0">
              <FavoriteStar entity-type="initiative" :entity-id="initiative.id" :product-id="productStore.activeProductScopeForApi" />
              <span class="w-1 h-5 rounded-full flex-shrink-0" :class="statusDotColor(initiative.status)"></span>
              <h3 class="text-sm font-semibold text-gray-900 truncate group-hover:text-[#4857FE] transition-colors">{{ initiative.title }}</h3>
            </div>
            <span class="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap" :class="statusStyle(initiative.status)">
              {{ statusLabel(initiative.status) }}
            </span>
          </div>

          <!-- Priority + Period -->
          <div class="flex items-center gap-2 mb-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold" :class="priorityStyle(initiative.priority)">
              {{ priorityLabel(initiative.priority) }}
            </span>
            <div class="flex items-center gap-1 text-xs text-gray-400">
              <CalendarDays :size="11" class="shrink-0" />
              <span>{{ formatPeriod(initiative.periodStart, initiative.periodEnd) }}</span>
            </div>
          </div>

          <!-- Footer: leader + created date -->
          <div class="flex items-center justify-between pt-3 border-t border-gray-100">
            <div class="flex items-center gap-2">
              <template v-if="initiative.leader">
                <UploadAssetImg v-if="initiative.leaderAvatar" :src="initiative.leaderAvatar" class="w-5 h-5 rounded-full object-cover" />
                <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[9px] font-semibold text-[#4857FE]">
                  {{ initiative.leader[0]?.toUpperCase() }}
                </div>
                <span class="text-xs text-gray-500">{{ initiative.leader }}</span>
              </template>
              <span v-else class="text-xs text-gray-400">No leader</span>
            </div>
            <span class="text-xs text-gray-400">{{ formatDate(initiative.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Initiative Dialog -->
    <CreateInitiativeDialog
      v-model:open="showCreateDialog"
      @created="onInitiativeCreated"
    />

    <!-- Detail Panel -->
    <InitiativeDetailPanel
      :initiative="selectedInitiative"
      :open="showDetailPanel"
      :team-members="teamMembers"
      @close="closeDetailPanel"
      @updated="onInitiativeUpdated"
    />
  </div>
</template>
