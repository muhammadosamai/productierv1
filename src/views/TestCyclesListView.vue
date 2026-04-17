<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus, Loader2, Search,
  CalendarDays, Archive,
  LayoutList, LayoutGrid, ArrowUp, ArrowDown,
  FlaskConical,
} from 'lucide-vue-next'
import { useTestCyclesStore } from '@/stores/testCycles'
import { useProductStore } from '@/stores/products'
import CreateTestCycleDialog from '@/components/testCycle/CreateTestCycleDialog.vue'
import type { TestCycle } from '@/types/testCycle'
import { issueStatusSemanticTone } from '@/lib/issueStatusId'
import FavoriteStar from '@/components/shared/FavoriteStar.vue'

const router = useRouter()
const store = useTestCyclesStore()
const productStore = useProductStore()

const showCreateDialog = ref(false)
const searchQuery = ref('')
const activeTab = ref<'active' | 'completed' | 'archived'>('active')
const viewMode = ref<'table' | 'card'>(localStorage.getItem('test-cycles-view-mode') as 'table' | 'card' || 'table')
const sortField = ref<string>('createdAt')
const sortDir = ref<'asc' | 'desc'>('desc')

watch(viewMode, (v) => localStorage.setItem('test-cycles-view-mode', v))

onMounted(() => {
  store.fetchCycles()
})

watch(() => productStore.activeProductApiRef, () => {
  store.fetchCycles()
})

const activeCycles = computed(() => store.cycles.filter(c => c.status === 'planned' || c.status === 'in_progress'))
const completedCycles = computed(() => store.cycles.filter(c => c.status === 'completed'))
const archivedCycles = computed(() => store.cycles.filter(c => c.status === 'archived'))

const currentList = computed(() => {
  const list = activeTab.value === 'active' ? activeCycles.value
    : activeTab.value === 'completed' ? completedCycles.value
    : archivedCycles.value
  const q = searchQuery.value.toLowerCase().trim()
  let filtered = list
  if (q) {
    filtered = list.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q) ||
      c.delivery?.title?.toLowerCase().includes(q) ||
      c.release?.title?.toLowerCase().includes(q)
    )
  }
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

function onCreated(id: string) {
  showCreateDialog.value = false
  store.fetchCycles()
  router.push(`/test-cycles/${id}`)
}

async function archiveCycle(cycle: TestCycle, event: Event) {
  event.stopPropagation()
  await store.updateCycle(cycle.id, { status: 'archived' })
}

function statusStyle(status: string) {
  switch (status) {
    case 'planned': return 'bg-[#fdab3d] text-white'
    case 'in_progress': return 'bg-[#00c875] text-white'
    case 'completed': return 'bg-gray-400 text-white'
    case 'archived': return 'bg-gray-300 text-white'
    default: return 'bg-gray-400 text-white'
  }
}

function statusDotColor(status: string) {
  switch (status) {
    case 'planned': return 'bg-[#fdab3d]'
    case 'in_progress': return 'bg-[#00c875]'
    case 'completed': return 'bg-gray-400'
    case 'archived': return 'bg-gray-300'
    default: return 'bg-gray-400'
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function parsePrefix(title: string) {
  const match = title.match(/^(#\d+)\s+(.*)$/)
  if (match) return { prefix: match[1], rest: match[2] }
  return { prefix: '', rest: title }
}

function statusTextColor(status: string) {
  switch (status) {
    case 'planned': return 'text-[#fdab3d]'
    case 'in_progress': return 'text-[#00c875]'
    case 'completed': return 'text-gray-400'
    default: return 'text-gray-500'
  }
}

function formatPeriod(start: string | null, end: string | null) {
  if (!start && !end) return '—'
  const s = start ? new Date(start).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '?'
  const e = end ? new Date(end).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '?'
  return `${s} – ${e}`
}

/** Issues linked to a cycle: legacy `test_cycle_issues` plus main `issues` with `testCycleId`. */
function cycleIssuesForCount(cycle: TestCycle): { status: string }[] {
  const legacy = cycle.issues ?? []
  const linked = cycle.linkedIssues ?? []
  const byId = new Map<string, { status: string }>()
  for (const i of legacy) {
    byId.set(i.id, { status: i.status })
  }
  for (const i of linked) {
    byId.set(i.id, { status: i.status })
  }
  return [...byId.values()]
}

function issueCount(cycle: TestCycle) {
  return cycleIssuesForCount(cycle).length
}

function openCount(cycle: TestCycle) {
  return cycleIssuesForCount(cycle).filter(i => {
    const t = issueStatusSemanticTone(i.status)
    return t === 'open' || t === 'in_progress'
  }).length
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 pt-7 pb-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <FlaskConical :size="18" class="text-[#4857FE]" />
          </div>
          <h1 class="text-lg font-semibold text-gray-900">Test Cycles <span class="text-gray-400 font-normal">({{ store.cycles.length }})</span></h1>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="flex items-center gap-1.5 bg-[#4857FE] hover:bg-[#3E4BDE] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            @click="showCreateDialog = true"
          >
            <Plus :size="15" />
            Add Cycle
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
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#00c875]/15 text-[#00a65a]">{{ activeCycles.length }}</span>
          </button>
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'completed'
              ? 'text-gray-600 border-gray-400'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'completed'"
          >
            Completed
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-gray-200 text-gray-600">{{ completedCycles.length }}</span>
          </button>
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'archived'
              ? 'text-gray-500 border-gray-400'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'archived'"
          >
            Archived
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-gray-200 text-gray-500">{{ archivedCycles.length }}</span>
          </button>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input
              v-model="searchQuery"
              class="text-sm text-gray-700 bg-transparent outline-none w-44 placeholder-gray-400"
              placeholder="Search cycles..."
            />
          </div>
          <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              class="p-1.5 rounded-md transition-colors cursor-pointer"
              :class="viewMode === 'table' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
              @click="viewMode = 'table'"
            >
              <LayoutList :size="16" />
            </button>
            <button
              class="p-1.5 rounded-md transition-colors cursor-pointer"
              :class="viewMode === 'card' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
              @click="viewMode = 'card'"
            >
              <LayoutGrid :size="16" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto px-8 py-6">
      <div v-if="store.loading" class="flex items-center justify-center py-16">
        <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
      </div>

      <div v-else-if="currentList.length === 0" class="flex flex-col items-center justify-center py-20">
        <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <FlaskConical :size="24" class="text-gray-400" />
        </div>
        <p class="text-gray-500 text-sm font-medium mb-1">
          {{ activeTab === 'active' ? 'No active test cycles' : activeTab === 'completed' ? 'No completed cycles' : 'No archived cycles' }}
        </p>
        <p class="text-gray-400 text-xs mb-4">Create a test cycle to start tracking issues</p>
        <button
          v-if="activeTab === 'active'"
          class="flex items-center gap-1.5 px-4 py-2 bg-[#4857FE] text-white text-sm font-medium rounded-lg hover:bg-[#3a46d9] transition-colors cursor-pointer"
          @click="showCreateDialog = true"
        >
          <Plus :size="15" />
          Add Cycle
        </button>
      </div>

      <!-- Table View -->
      <div v-else-if="viewMode === 'table'" class="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('title')">
                <div class="flex items-center gap-1">
                  Title
                  <template v-if="sortField === 'title'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template>
                </div>
              </th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('status')">
                <div class="flex items-center gap-1">
                  Status
                  <template v-if="sortField === 'status'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template>
                </div>
              </th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Linked To</th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Issues</th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('createdAt')">
                <div class="flex items-center gap-1">
                  Created
                  <template v-if="sortField === 'createdAt'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template>
                </div>
              </th>
              <th class="w-12"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="cycle in currentList"
              :key="cycle.id"
              class="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors group"
              @click="router.push(`/test-cycles/${cycle.id}`)"
            >
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-2.5 min-w-0">
                  <FavoriteStar entity-type="test_cycle" :entity-id="cycle.id" :product-id="productStore.activeProductApiRef" />
                  <span class="w-1 h-7 rounded-full flex-shrink-0" :class="statusDotColor(cycle.status)"></span>
                  <span class="text-sm font-medium text-gray-900 truncate">
                    <span v-if="parsePrefix(cycle.title).prefix" class="font-semibold" :class="statusTextColor(cycle.status)">{{ parsePrefix(cycle.title).prefix }}</span>
                    <span v-if="parsePrefix(cycle.title).prefix"> - </span>{{ parsePrefix(cycle.title).rest }}
                  </span>
                </div>
              </td>
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full" :class="statusStyle(cycle.status)">
                  {{ statusLabel(cycle.status) }}
                </span>
              </td>
              <td class="px-5 py-3.5">
                <span v-if="cycle.delivery" class="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{{ cycle.delivery.title }}</span>
                <span v-else-if="cycle.release" class="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">{{ cycle.release.title }}</span>
                <span v-else class="text-sm text-gray-400">—</span>
              </td>
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-700 font-medium">{{ issueCount(cycle) }}</span>
                  <span v-if="openCount(cycle) > 0" class="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full font-medium">{{ openCount(cycle) }} open</span>
                </div>
              </td>
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-1.5 text-sm text-gray-500">
                  <CalendarDays :size="13" class="text-gray-400 shrink-0" />
                  <span>{{ formatPeriod(cycle.startDate, cycle.endDate) }}</span>
                </div>
              </td>
              <td class="px-5 py-3.5">
                <span class="text-sm text-gray-500">{{ formatDate(cycle.createdAt) }}</span>
              </td>
              <td class="px-5 py-3.5">
                <button
                  v-if="cycle.status !== 'archived'"
                  class="p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="Archive cycle"
                  @click="archiveCycle(cycle, $event)"
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
          v-for="cycle in currentList"
          :key="cycle.id"
          @click="router.push(`/test-cycles/${cycle.id}`)"
          class="bg-white rounded-xl border border-gray-200/80 p-5 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group"
        >
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <FavoriteStar entity-type="test_cycle" :entity-id="cycle.id" :product-id="productStore.activeProductApiRef" />
              <span class="w-1 h-5 rounded-full flex-shrink-0" :class="statusDotColor(cycle.status)"></span>
              <h3 class="text-sm font-semibold text-gray-900 truncate group-hover:text-[#4857FE] transition-colors">
                <span v-if="parsePrefix(cycle.title).prefix" :class="statusTextColor(cycle.status)">{{ parsePrefix(cycle.title).prefix }}</span>
                <span v-if="parsePrefix(cycle.title).prefix"> - </span>{{ parsePrefix(cycle.title).rest }}
              </h3>
            </div>
            <span class="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap" :class="statusStyle(cycle.status)">
              {{ statusLabel(cycle.status) }}
            </span>
          </div>

          <div class="flex items-center gap-2 mb-3">
            <span v-if="cycle.delivery" class="text-[10px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{{ cycle.delivery.title }}</span>
            <span v-else-if="cycle.release" class="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{{ cycle.release.title }}</span>
            <div class="flex items-center gap-1 text-xs text-gray-400">
              <CalendarDays :size="11" class="shrink-0" />
              <span>{{ formatPeriod(cycle.startDate, cycle.endDate) }}</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-gray-100">
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-600 font-medium">{{ issueCount(cycle) }} issues</span>
              <span v-if="openCount(cycle) > 0" class="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full font-medium">{{ openCount(cycle) }} open</span>
            </div>
            <span class="text-xs text-gray-400">{{ formatDate(cycle.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <CreateTestCycleDialog v-model:open="showCreateDialog" @created="onCreated" />
  </div>
</template>
