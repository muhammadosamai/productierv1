<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, Loader2, Plus, FlaskConical,
  CalendarDays, Link2, Trash2, X, MoreHorizontal,
  LayoutList, Search,
} from 'lucide-vue-next'
import { useTestCyclesStore } from '@/stores/testCycles'
import { useBacklogStore } from '@/stores/backlog'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { useIssuesStore } from '@/stores/issues'
import draggable from 'vuedraggable'
import type { TestCycle, IssueSeverity, IssueStatus } from '@/types/testCycle'
import type { Issue } from '@/types/issue'

const route = useRoute()
const router = useRouter()
const store = useTestCyclesStore()
const backlogStore = useBacklogStore()
const authStore = useAuthStore()
const productStore = useProductStore()
const issuesStore = useIssuesStore()

const cycle = ref<TestCycle | null>(null)
const loading = ref(true)
const activeView = ref<'kanban' | 'list'>('kanban')
const cycleIssues = ref<Issue[]>([])

// Add issue form
const showAddIssue = ref(false)
const issueTitle = ref('')
const issueSeverity = ref<IssueSeverity>('minor')
const addingIssue = ref(false)

// Kanban columns
interface ColumnMeta {
  key: string
  label: string
  color: string
  statuses: IssueStatus[]
  hasAdd?: boolean
}

const columnDefs: ColumnMeta[] = [
  { key: 'open', label: 'Open', color: '#e2445c', statuses: ['open'], hasAdd: true },
  { key: 'in_progress', label: 'In Progress', color: '#fdab3d', statuses: ['in_progress'], hasAdd: true },
  { key: 'resolved', label: 'Resolved', color: '#00c875', statuses: ['resolved'] },
  { key: 'closed', label: 'Closed', color: '#c4c4c4', statuses: ['closed'] },
  { key: 'deferred', label: 'Deferred', color: '#a25ddc', statuses: ['deferred'] },
]

const columnIssues = ref<Record<string, Issue[]>>({
  open: [],
  in_progress: [],
  resolved: [],
  closed: [],
  deferred: [],
})

const isDragging = ref(false)

watch(() => cycleIssues.value, (issues) => {
  const all = (issues || []) as Issue[]
  columnIssues.value = {
    open: all.filter(i => i.status === 'open'),
    in_progress: all.filter(i => i.status === 'in_progress'),
    resolved: all.filter(i => i.status === 'resolved'),
    closed: all.filter(i => i.status === 'closed'),
    deferred: all.filter(i => i.status === 'deferred'),
  }
}, { immediate: true, deep: true })

async function fetchCycleIssues(cycleId: string) {
  try {
    const res = await fetch('/api/issues?testCycleId=' + cycleId)
    if (res.ok) {
      cycleIssues.value = await res.json()
    }
  } catch {
    // silently fail
  }
}

async function onColumnChange(colKey: string, evt: any) {
  if (!evt.added || !cycle.value) return
  const issue = evt.added.element as Issue
  const col = columnDefs.find(c => c.key === colKey)
  if (!col) return
  const newStatus = col.statuses[0]
  if (issue.status === newStatus) return
  await issuesStore.updateIssue(issue.id, { status: newStatus })
  await fetchCycleIssues(cycle.value.id)
}

onMounted(async () => {
  if (productStore.activeProduct) {
    backlogStore.fetchStories(productStore.activeProduct.name)
  }
  const id = route.params.id as string
  const data = await store.fetchCycle(id)
  cycle.value = data
  await fetchCycleIssues(id)
  loading.value = false
})

async function addIssue() {
  if (!issueTitle.value.trim() || !cycle.value) return
  addingIssue.value = true
  await issuesStore.createIssue({
    title: issueTitle.value.trim(),
    severity: issueSeverity.value || 'minor',
    product: productStore.activeProduct?.name || '',
    testCycleId: cycle.value.id,
  })
  await fetchCycleIssues(cycle.value.id)
  issueTitle.value = ''
  issueSeverity.value = 'minor'
  showAddIssue.value = false
  addingIssue.value = false
}

async function updateIssueStatus(issue: Issue, status: IssueStatus) {
  if (!cycle.value) return
  await issuesStore.updateIssue(issue.id, { status })
  await fetchCycleIssues(cycle.value.id)
}

async function deleteIssue(issue: Issue) {
  if (!cycle.value) return
  await issuesStore.deleteIssue(issue.id)
  await fetchCycleIssues(cycle.value.id)
}

function parsePrefix(title: string) {
  const match = title.match(/^(#\d+)\s+(.*)$/)
  if (match) return { prefix: match[1], rest: match[2] }
  return { prefix: '', rest: title }
}

function severityStyle(s: string) {
  switch (s) {
    case 'blocker': return 'bg-rose-950 text-white border border-rose-900'
    case 'critical': return 'bg-red-100 text-red-700 border border-red-200'
    case 'major': return 'bg-orange-100 text-orange-700 border border-orange-200'
    case 'minor': return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
    case 'trivial': return 'bg-gray-100 text-gray-600 border border-gray-200'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function issueStatusStyle(s: string) {
  switch (s) {
    case 'open': return 'bg-[#e2445c] text-white'
    case 'in_progress': return 'bg-[#fdab3d] text-white'
    case 'resolved': return 'bg-[#00c875] text-white'
    case 'closed': return 'bg-gray-400 text-white'
    case 'deferred': return 'bg-[#a25ddc] text-white'
    default: return 'bg-gray-400 text-white'
  }
}

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

const issueStatuses: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed', 'deferred']

const totalIssues = computed(() => cycleIssues.value?.length || 0)
const openIssues = computed(() => cycleIssues.value?.filter(i => i.status === 'open').length || 0)
const resolvedIssues = computed(() => cycleIssues.value?.filter(i => i.status === 'resolved' || i.status === 'closed').length || 0)
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Header -->
    <div class="bg-white px-8 py-5 border-b border-gray-100">
      <div class="flex items-center gap-4">
        <button
          class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          @click="router.push('/test-cycles')"
        >
          <ArrowLeft :size="18" />
        </button>
        <div v-if="cycle" class="flex items-center gap-3 flex-1 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <FlaskConical :size="16" class="text-[#4857FE]" />
          </div>
          <div class="min-w-0">
            <h1 class="text-lg font-semibold text-gray-900 truncate">
              <span v-if="parsePrefix(cycle.title).prefix" class="text-[#4857FE]">{{ parsePrefix(cycle.title).prefix }}</span>
              <span v-if="parsePrefix(cycle.title).prefix"> - </span>{{ parsePrefix(cycle.title).rest }}
            </h1>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full" :class="issueStatusStyle(cycle.status)">{{ statusLabel(cycle.status) }}</span>
              <span v-if="cycle.delivery" class="text-xs text-gray-500">
                <Link2 :size="10" class="inline mr-0.5" />{{ cycle.delivery.title }}
              </span>
              <span v-else-if="cycle.release" class="text-xs text-purple-500">
                <Link2 :size="10" class="inline mr-0.5" />{{ cycle.release.title }}
              </span>
              <span class="text-xs text-gray-400">
                <CalendarDays :size="10" class="inline mr-0.5" />{{ formatDate(cycle.startDate) }} – {{ formatDate(cycle.endDate) }}
              </span>
              <span class="text-xs text-gray-400">·</span>
              <span class="text-xs text-gray-600 font-medium">{{ totalIssues }} issues</span>
              <span v-if="openIssues > 0" class="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full font-medium">{{ openIssues }} open</span>
            </div>
          </div>
        </div>
        <button
          class="flex items-center gap-1.5 bg-[#4857FE] hover:bg-[#3E4BDE] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
          @click="showAddIssue = true"
        >
          <Plus :size="15" />
          Report Issue
        </button>
      </div>
    </div>

    <!-- View Tabs -->
    <div v-if="cycle" class="bg-white px-8 border-b border-gray-100">
      <div class="flex items-center gap-1">
        <button
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 cursor-pointer"
          :class="activeView === 'kanban'
            ? 'text-[#4857FE] border-[#4857FE] bg-[#4857FE]/5'
            : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'"
          @click="activeView = 'kanban'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>
          Kanban
        </button>
        <button
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 cursor-pointer"
          :class="activeView === 'list'
            ? 'text-[#4857FE] border-[#4857FE] bg-[#4857FE]/5'
            : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'"
          @click="activeView = 'list'"
        >
          <LayoutList :size="14" />
          List
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
    </div>

    <template v-else-if="cycle">
      <!-- Add Issue Form -->
      <div v-if="showAddIssue" class="px-8 py-4 bg-white border-b border-gray-100">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-900">Report Issue</h3>
          <button class="text-gray-400 hover:text-gray-600 cursor-pointer" @click="showAddIssue = false"><X :size="16" /></button>
        </div>
        <form @submit.prevent="addIssue" class="flex items-center gap-3">
          <input
            v-model="issueTitle"
            placeholder="Issue title..."
            autofocus
            class="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] placeholder-gray-400"
          />
          <select v-model="issueSeverity" class="text-xs border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-[#4857FE] bg-white">
            <option value="trivial">Trivial</option>
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="critical">Critical</option>
            <option value="blocker">Blocker</option>
          </select>
          <button type="submit" :disabled="!issueTitle.trim() || addingIssue" class="text-sm font-medium text-white bg-[#4857FE] hover:bg-[#3E4BDE] px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50">
            {{ addingIssue ? 'Adding...' : 'Add Issue' }}
          </button>
        </form>
      </div>

      <!-- ═══ Kanban View ═══ -->
      <div v-if="activeView === 'kanban'" class="flex-1 overflow-auto p-5" style="background-color: #FAFBFD">
        <div class="flex gap-4 h-full min-h-0">
          <div
            v-for="col in columnDefs"
            :key="col.key"
            class="flex flex-col flex-1 min-w-[220px] max-w-[280px]"
          >
            <!-- Column header -->
            <div class="flex items-center justify-between mb-3 px-0.5">
              <div class="flex items-center gap-2">
                <div class="w-1 h-5 rounded-full" :style="{ backgroundColor: col.color }"></div>
                <h3 class="text-sm font-semibold text-gray-800">{{ col.label }}</h3>
                <span
                  class="text-[11px] font-bold w-5 h-5 rounded-md flex items-center justify-center"
                  :style="{ backgroundColor: col.color + '18', color: col.color }"
                >
                  {{ (columnIssues[col.key] || []).length }}
                </span>
              </div>
              <button
                v-if="col.hasAdd"
                class="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-[#4857FE] transition-colors px-2 py-1 rounded-md hover:bg-[#4857FE]/5 cursor-pointer"
                @click="showAddIssue = true"
              >
                <Plus :size="13" />
                Add
              </button>
            </div>

            <!-- Issue cards (drag-and-drop) -->
            <div class="flex-1 overflow-y-auto pr-0.5 pb-2">
              <draggable
                v-model="columnIssues[col.key]"
                group="kanban-issues"
                item-key="id"
                :animation="200"
                ghost-class="kanban-ghost"
                drag-class="kanban-drag"
                class="space-y-3 h-full min-h-[200px]"
                @start="isDragging = true"
                @end="isDragging = false"
                @change="(evt: any) => onColumnChange(col.key, evt)"
              >
                <template #item="{ element: issue }">
                  <div class="bg-white rounded-xl border border-gray-200/80 hover:shadow-md hover:border-gray-300 transition-all duration-200 group/card relative cursor-grab active:cursor-grabbing p-3.5">
                    <!-- Severity badge -->
                    <div class="flex items-center justify-between mb-2">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold" :class="severityStyle(issue.severity)">
                        {{ issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1) }}
                      </span>
                      <button
                        class="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/card:opacity-100 transition-all cursor-pointer"
                        @click.stop="deleteIssue(issue)"
                      >
                        <Trash2 :size="12" />
                      </button>
                    </div>

                    <!-- Title -->
                    <p class="text-sm font-medium text-gray-900 leading-snug mb-2">{{ issue.title }}</p>

                    <!-- Story tag -->
                    <div v-if="issue.storyId" class="mb-2">
                      <span class="text-[10px] text-[#4857FE] bg-[#4857FE]/8 px-1.5 py-0.5 rounded truncate inline-block max-w-full">{{ issue.storyId }}</span>
                    </div>

                    <!-- Footer: reporter + date -->
                    <div class="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div v-if="issue.reportedBy" class="flex items-center gap-1.5">
                        <img v-if="issue.reportedBy.avatar" :src="issue.reportedBy.avatar" class="w-5 h-5 rounded-full object-cover" />
                        <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[8px] font-semibold text-[#4857FE]">{{ issue.reportedBy.name[0] }}</div>
                        <span class="text-[10px] text-gray-500">{{ issue.reportedBy.name.split(' ')[0] }}</span>
                      </div>
                      <span class="text-[10px] text-gray-400">{{ formatDate(issue.createdAt) }}</span>
                    </div>
                  </div>
                </template>
              </draggable>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ List View ═══ -->
      <div v-else-if="activeView === 'list'" class="flex-1 overflow-auto px-8 py-6">
        <div v-if="!cycleIssues?.length" class="flex flex-col items-center justify-center py-16">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <FlaskConical :size="24" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">No issues reported yet</p>
          <p class="text-gray-400 text-xs">Click "Report Issue" to log the first issue</p>
        </div>

        <div v-else class="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-100">
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Issue</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Reported By</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Story</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="issue in cycleIssues"
                :key="issue.id"
                class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group"
              >
                <td class="px-5 py-3.5">
                  <span class="text-sm font-medium text-gray-900">{{ issue.title }}</span>
                </td>
                <td class="px-5 py-3.5">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold" :class="severityStyle(issue.severity)">
                    {{ issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1) }}
                  </span>
                </td>
                <td class="px-5 py-3.5">
                  <select
                    :value="issue.status"
                    class="text-xs font-medium rounded-full px-2.5 py-1 outline-none cursor-pointer border-0 appearance-none"
                    :class="issueStatusStyle(issue.status)"
                    @change="updateIssueStatus(issue, ($event.target as HTMLSelectElement).value as IssueStatus)"
                  >
                    <option v-for="s in issueStatuses" :key="s" :value="s">{{ statusLabel(s) }}</option>
                  </select>
                </td>
                <td class="px-5 py-3.5">
                  <div v-if="issue.reportedBy" class="flex items-center gap-2">
                    <img v-if="issue.reportedBy.avatar" :src="issue.reportedBy.avatar" class="w-5 h-5 rounded-full object-cover" />
                    <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[8px] font-semibold text-[#4857FE]">{{ issue.reportedBy.name[0] }}</div>
                    <span class="text-sm text-gray-600">{{ issue.reportedBy.name }}</span>
                  </div>
                </td>
                <td class="px-5 py-3.5">
                  <span v-if="issue.storyId" class="text-xs text-[#4857FE] bg-[#4857FE]/8 px-1.5 py-0.5 rounded truncate max-w-[120px] inline-block">{{ issue.storyId }}</span>
                  <span v-else class="text-sm text-gray-400">—</span>
                </td>
                <td class="px-5 py-3.5">
                  <span class="text-sm text-gray-500">{{ formatDate(issue.createdAt) }}</span>
                </td>
                <td class="px-5 py-3.5">
                  <button
                    class="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    @click="deleteIssue(issue)"
                  >
                    <Trash2 :size="13" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kanban-ghost {
  opacity: 0.4;
  background: #f0f4ff;
  border: 2px dashed #4857FE;
  border-radius: 12px;
}
.kanban-drag {
  opacity: 0.9;
  transform: rotate(2deg);
  box-shadow: 0 8px 25px -5px rgba(0,0,0,0.15);
}
</style>
