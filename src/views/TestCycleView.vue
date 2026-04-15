<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, Loader2, Plus, FlaskConical,
  CalendarDays, Link2, Trash2, X, Pencil, Check,
  LayoutList, ChevronDown, User,
} from 'lucide-vue-next'
import { useTestCyclesStore } from '@/stores/testCycles'
import { useBacklogStore } from '@/stores/backlog'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import { useIssuesStore } from '@/stores/issues'
import { useFormConfigsStore } from '@/stores/formConfigs'
import {
  mergeIssueFormConfig,
  getIssueStatusCatalogFromMerged,
  resolveIssueStatusDisplayLabel,
  issueStoredStatusMatchesTabId,
  issueStatusCustomPillStyle,
} from '@/lib/issueFormConfig'
import { normalizeIssueStatusHexColor } from '@/lib/issueStatusColors'
import {
  ISSUE_STATUS_ID_OPEN,
  ISSUE_STATUS_ID_IN_PROGRESS,
  issueStatusSemanticTone,
} from '@/lib/issueStatusId'
import draggable from 'vuedraggable'
import type { TestCycle, IssueSeverity, IssueStatus } from '@/types/testCycle'
import type { Issue, CreateIssuePayload } from '@/types/issue'
import { toast } from 'vue-sonner'
import IssueDetailPanel from '@/components/issue/IssueDetailPanel.vue'

const route = useRoute()
const router = useRouter()
const store = useTestCyclesStore()
const backlogStore = useBacklogStore()
const authStore = useAuthStore()
const productStore = useProductStore()
const issuesStore = useIssuesStore()
const formConfigsStore = useFormConfigsStore()

const cycle = ref<TestCycle | null>(null)
const loading = ref(true)
const activeView = ref<'kanban' | 'list'>('kanban')
const cycleIssues = ref<Issue[]>([])

const selectedIssue = ref<Issue | null>(null)
const showIssuePanel = ref(false)
/** After a kanban drag ends, ignore card clicks briefly so drops do not open the detail panel. */
const suppressIssueCardClickUntil = ref(0)

const issueStatusFormConfigRaw = computed(() => {
  const pid = cycle.value?.productId
  if (!pid) return null
  return formConfigsStore.getConfig(pid, 'issue')
})
const editingField = ref<string | null>(null)
const editTitle = ref('')
const savingTitle = ref(false)
const titleInputRef = ref<HTMLInputElement | null>(null)

// Add issue form
const showAddIssue = ref(false)
const issueTitle = ref('')
const issueSeverity = ref<IssueSeverity>('minor')
const addingIssue = ref(false)

interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

const teamMembers = ref<TeamUser[]>([])
/** Selected assignee for “Report issue” (same pattern as Issues table inline assignee). */
const reportIssueAssignee = ref<TeamUser | null>(null)
const reportAssigneeMenuOpen = ref(false)
const reportAssigneeSearch = ref('')

const filteredReportAssignees = computed(() => {
  const q = reportAssigneeSearch.value.toLowerCase().trim()
  if (!q) return teamMembers.value
  return teamMembers.value.filter(
    m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
  )
})

function onReportAssigneeClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.report-assignee-picker')) {
    reportAssigneeMenuOpen.value = false
  }
}

watch(reportAssigneeMenuOpen, (open) => {
  if (open) {
    setTimeout(() => document.addEventListener('click', onReportAssigneeClickOutside), 0)
  } else {
    document.removeEventListener('click', onReportAssigneeClickOutside)
    reportAssigneeSearch.value = ''
  }
})

function selectReportAssignee(member: TeamUser) {
  reportIssueAssignee.value = member
  reportAssigneeMenuOpen.value = false
}

function clearReportAssignee() {
  reportIssueAssignee.value = null
  reportAssigneeMenuOpen.value = false
}

async function fetchTeamMembersForIssueForm() {
  if (!authStore.token) return
  try {
    const res = await fetch('/api/auth/users?q=', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) teamMembers.value = await res.json()
    else teamMembers.value = []
  } catch {
    teamMembers.value = []
  }
}

watch(showAddIssue, (open) => {
  if (open) {
    fetchTeamMembersForIssueForm()
    reportAssigneeMenuOpen.value = false
    reportAssigneeSearch.value = ''
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onReportAssigneeClickOutside)
})

// Kanban columns
interface ColumnMeta {
  key: string
  label: string
  color: string
  statuses: IssueStatus[]
  hasAdd?: boolean
}

const issueStatusFormMerged = computed(() => {
  const pid = cycle.value?.productId
  const cfg = pid ? formConfigsStore.getConfig(pid, 'issue') : null
  return mergeIssueFormConfig(cfg ?? undefined)
})

const issueStatusCatalog = computed(() => getIssueStatusCatalogFromMerged(issueStatusFormMerged.value))

const issueStatusTabs = computed(() => issueStatusCatalog.value.map(e => e.id))

function issueColumnColor(s: string): string {
  const e = issueStatusCatalog.value.find(x => x.id === s)
  const fromCatalog = e?.color ? normalizeIssueStatusHexColor(e.color) : undefined
  if (fromCatalog) return fromCatalog
  const map: Record<string, string> = {
    open: '#e2445c',
    in_progress: '#fdab3d',
    resolved: '#00c875',
    closed: '#c4c4c4',
    deferred: '#a25ddc',
  }
  return map[issueStatusSemanticTone(s)] ?? '#94a3b8'
}

const columnDefs = computed<ColumnMeta[]>(() =>
  issueStatusTabs.value.map(s => ({
    key: s,
    label: statusLabel(s),
    color: issueColumnColor(s),
    statuses: [s],
    hasAdd: s === ISSUE_STATUS_ID_OPEN || s === ISSUE_STATUS_ID_IN_PROGRESS,
  })),
)

const columnIssues = ref<Record<string, Issue[]>>({})

const isDragging = ref(false)

watch(
  () => [cycleIssues.value, issueStatusTabs.value] as const,
  ([issues, tabs]) => {
    const all = (issues || []) as Issue[]
    const next: Record<string, Issue[]> = {}
    const cat = issueStatusCatalog.value
    for (const s of tabs) {
      next[s] = all.filter(i => issueStoredStatusMatchesTabId(i.status, s, cat))
    }
    columnIssues.value = next
  },
  { immediate: true, deep: true },
)

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
  const col = columnDefs.value.find(c => c.key === colKey)
  if (!col) return
  const newStatus = col.statuses[0]
  if (newStatus == null || newStatus === '') return
  if (issueStoredStatusMatchesTabId(issue.status, newStatus, issueStatusCatalog.value)) return
  await issuesStore.updateIssue(issue.id, { status: newStatus })
  await fetchCycleIssues(cycle.value.id)
  if (selectedIssue.value?.id === issue.id) {
    const fresh = cycleIssues.value.find(i => i.id === issue.id)
    if (fresh) selectedIssue.value = fresh
  }
}

/** Load or reload the current test cycle when the route id changes (same component instance is reused between cycles). */
async function loadCyclePage(cycleId: string) {
  if (!cycleId) return
  loading.value = true
  closeIssueDetailPanel()
  closeAddIssueForm()
  try {
    if (productStore.activeProduct) {
      await backlogStore.fetchStories(productStore.activeProduct.name)
    }
    const data = await store.fetchCycle(cycleId)
    cycle.value = data
    if (data?.productId) await formConfigsStore.fetchConfig(data.productId, 'issue')
    await fetchCycleIssues(cycleId)
    await fetchTeamMembersForIssueForm()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadCyclePage(route.params.id as string)
})

watch(
  () => route.params.id as string | undefined,
  async (newId, oldId) => {
    if (!newId || newId === oldId) return
    await loadCyclePage(newId)
  },
)

async function addIssue() {
  if (!issueTitle.value.trim() || !cycle.value) return
  addingIssue.value = true
  try {
    const payload: CreateIssuePayload = {
      title: issueTitle.value.trim(),
      severity: issueSeverity.value || 'minor',
      product: cycle.value.productId || productStore.activeProduct?.name || '',
      testCycleId: cycle.value.id,
    }
    const assigneeId = reportIssueAssignee.value?.id
    if (assigneeId) payload.assignedToUserId = assigneeId
    const created = await issuesStore.createIssue(payload)
    if (!created) {
      toast.error('Could not create the issue. Please try again.')
      return
    }
    await fetchCycleIssues(cycle.value.id)
    issueTitle.value = ''
    issueSeverity.value = 'minor'
    reportIssueAssignee.value = null
    reportAssigneeMenuOpen.value = false
    reportAssigneeSearch.value = ''
    showAddIssue.value = false
  } finally {
    addingIssue.value = false
  }
}

function closeAddIssueForm() {
  showAddIssue.value = false
  reportIssueAssignee.value = null
  reportAssigneeMenuOpen.value = false
  reportAssigneeSearch.value = ''
}

async function updateIssueStatus(issue: Issue, status: IssueStatus) {
  if (!cycle.value) return
  await issuesStore.updateIssue(issue.id, { status })
  await fetchCycleIssues(cycle.value.id)
  if (selectedIssue.value?.id === issue.id) {
    const fresh = cycleIssues.value.find(i => i.id === issue.id)
    if (fresh) selectedIssue.value = fresh
  }
}

async function deleteIssue(issue: Issue) {
  if (!cycle.value) return
  await issuesStore.deleteIssue(issue.id)
  await fetchCycleIssues(cycle.value.id)
  if (selectedIssue.value?.id === issue.id) closeIssueDetailPanel()
}

function closeIssueDetailPanel() {
  showIssuePanel.value = false
  selectedIssue.value = null
}

function onKanbanDragEnd() {
  isDragging.value = false
  suppressIssueCardClickUntil.value = Date.now() + 200
}

async function openIssueDetailFromCycle(issue: Issue) {
  if (Date.now() < suppressIssueCardClickUntil.value) return
  selectedIssue.value = issue
  showIssuePanel.value = true
  try {
    if (!authStore.token) return
    const res = await fetch(`/api/issues/${issue.id}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const full = await res.json() as Issue
      if (selectedIssue.value?.id === full.id) selectedIssue.value = full
    }
  } catch {
    /* keep list payload */
  }
}

async function onIssueDetailUpdated() {
  if (!cycle.value) return
  await fetchCycleIssues(cycle.value.id)
  if (selectedIssue.value) {
    const fresh = cycleIssues.value.find(i => i.id === selectedIssue.value!.id)
    if (fresh) selectedIssue.value = fresh
    else closeIssueDetailPanel()
  }
}

function parsePrefix(title: string): { prefix: string; rest: string } {
  const match = title.match(/^(#\d+)\s+(.*)$/)
  if (match) return { prefix: match[1] || '', rest: match[2] || '' }
  return { prefix: '', rest: title }
}

function startEditTitle() {
  if (!cycle.value) return
  editTitle.value = parsePrefix(cycle.value.title).rest
  editingField.value = 'title'
  nextTick(() => titleInputRef.value?.focus())
}

function cancelEditTitle() {
  editingField.value = null
}

async function saveTitle() {
  if (!cycle.value || savingTitle.value) return

  const trimmed = editTitle.value.trim()
  const { prefix, rest } = parsePrefix(cycle.value.title)
  if (!trimmed || trimmed === rest.trim()) {
    editingField.value = null
    return
  }

  const nextTitle = prefix ? `${prefix} ${trimmed}` : trimmed
  savingTitle.value = true
  try {
    const updated = await store.updateCycle(cycle.value.id, { title: nextTitle })
    if (updated) {
      cycle.value = updated
      editingField.value = null
    } else {
      toast.error('Failed to update test cycle name.')
    }
  } catch {
    toast.error('Failed to update test cycle name.')
  } finally {
    savingTitle.value = false
  }
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

function issueStatusToneClass(s: string) {
  switch (issueStatusSemanticTone(s)) {
    case 'open': return 'bg-[#e2445c] text-white'
    case 'in_progress': return 'bg-[#fdab3d] text-white'
    case 'resolved': return 'bg-[#00c875] text-white'
    case 'closed': return 'bg-gray-400 text-white'
    case 'deferred': return 'bg-[#a25ddc] text-white'
    default: return 'bg-slate-200 text-slate-700 border border-slate-300'
  }
}

function issueRowSelectToneClass(s: string) {
  if (issueStatusCustomPillStyle(issueStatusFormMerged.value, s)) return ''
  return issueStatusToneClass(s)
}

function issueRowSelectStyle(s: string) {
  return issueStatusCustomPillStyle(issueStatusFormMerged.value, s)
}

function statusLabel(s: string) {
  return resolveIssueStatusDisplayLabel(issueStatusFormMerged.value, s)
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Effort (estimate hours) for list/kanban; matches 0.5h rounding used on issues. */
function formatIssueEffortHours(v: number | null | undefined): string {
  if (v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  const r = Math.round(n * 2) / 2
  const s = r % 1 === 0 ? String(r) : r.toFixed(1)
  return `${s}h`
}

const issueStatuses = computed(() => issueStatusTabs.value)

const totalIssues = computed(() => cycleIssues.value?.length || 0)
const openIssues = computed(
  () =>
    cycleIssues.value?.filter(i =>
      issueStoredStatusMatchesTabId(i.status, ISSUE_STATUS_ID_OPEN, issueStatusCatalog.value),
    ).length || 0,
)
const resolvedIssues = computed(
  () =>
    cycleIssues.value?.filter(i => {
      const t = issueStatusSemanticTone(i.status)
      return t === 'resolved' || t === 'closed'
    }).length || 0,
)
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
            <div v-if="editingField === 'title'" class="flex items-center gap-2 min-w-0">
              <span
                v-if="parsePrefix(cycle.title).prefix"
                class="text-lg font-semibold text-[#4857FE] shrink-0"
              >
                {{ parsePrefix(cycle.title).prefix }} -
              </span>
              <input
                ref="titleInputRef"
                v-model="editTitle"
                class="text-lg font-semibold text-gray-900 bg-transparent border-b-2 border-[#4857FE] outline-none py-0.5 min-w-[200px]"
                :disabled="savingTitle"
                @keydown.enter="saveTitle"
                @keydown.escape="cancelEditTitle"
              />
              <button
                class="text-green-500 hover:text-green-600 disabled:opacity-50"
                :disabled="savingTitle"
                @click="saveTitle"
              >
                <Check :size="16" />
              </button>
              <button
                class="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                :disabled="savingTitle"
                @click="cancelEditTitle"
              >
                <X :size="16" />
              </button>
            </div>
            <h1
              v-else
              class="text-lg font-semibold text-gray-900 truncate cursor-pointer hover:text-[#4857FE] transition-colors group/title"
              @click="startEditTitle"
            >
              <span v-if="parsePrefix(cycle.title).prefix" class="text-[#4857FE]">{{ parsePrefix(cycle.title).prefix }}</span>
              <span v-if="parsePrefix(cycle.title).prefix"> - </span>{{ parsePrefix(cycle.title).rest }}
              <Pencil :size="12" class="inline ml-1 opacity-0 group-hover/title:opacity-40 transition-opacity" />
            </h1>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full" :class="issueStatusToneClass(cycle.status)">{{ statusLabel(cycle.status) }}</span>
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
          <button type="button" class="text-gray-400 hover:text-gray-600 cursor-pointer" @click="closeAddIssueForm"><X :size="16" /></button>
        </div>
        <form @submit.prevent="addIssue" class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            v-model="issueTitle"
            placeholder="Issue title..."
            autofocus
            class="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] placeholder-gray-400"
          />
          <select v-model="issueSeverity" class="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] bg-white shrink-0 w-full sm:w-auto">
            <option value="trivial">Trivial</option>
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="critical">Critical</option>
            <option value="blocker">Blocker</option>
          </select>
          <div class="relative report-assignee-picker w-full sm:w-auto sm:min-w-[240px] shrink-0">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm outline-none transition-colors hover:border-gray-300 focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20"
              @click.stop="reportAssigneeMenuOpen = !reportAssigneeMenuOpen"
            >
              <template v-if="reportIssueAssignee">
                <div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#7C5CFC] text-[10px] font-bold text-white">
                  <UploadAssetImg
                    v-if="reportIssueAssignee.avatar"
                    :src="reportIssueAssignee.avatar"
                    class="h-7 w-7 rounded-full object-cover"
                  />
                  <span v-else>{{ reportIssueAssignee.name[0] }}</span>
                </div>
                <span class="min-w-0 flex-1 truncate text-gray-800">{{ reportIssueAssignee.name }}</span>
              </template>
              <template v-else>
                <User :size="16" class="shrink-0 text-gray-400" />
                <span class="flex-1 text-gray-500">Assign to…</span>
              </template>
              <ChevronDown :size="14" class="shrink-0 text-gray-400" />
            </button>
            <div
              v-if="reportAssigneeMenuOpen"
              class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl sm:right-auto sm:w-[260px]"
              @click.stop
            >
              <div class="border-b border-gray-100 p-2">
                <input
                  v-model="reportAssigneeSearch"
                  type="text"
                  class="inline-edit-input w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20"
                  placeholder="Search members..."
                  @click.stop
                />
              </div>
              <div class="max-h-[220px] overflow-y-auto py-1">
                <button
                  type="button"
                  class="w-full cursor-pointer px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-50"
                  @click.stop="clearReportAssignee"
                >
                  Unassign
                </button>
                <button
                  v-for="member in filteredReportAssignees"
                  :key="member.id"
                  type="button"
                  class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  :class="reportIssueAssignee?.id === member.id ? 'bg-[#4857FE]/5' : ''"
                  @click.stop="selectReportAssignee(member)"
                >
                  <div class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#7C5CFC] text-[9px] font-bold text-white">
                    <UploadAssetImg
                      v-if="member.avatar"
                      :src="member.avatar"
                      class="h-6 w-6 rounded-full object-cover"
                    />
                    <span v-else>{{ member.name[0] }}</span>
                  </div>
                  <span class="min-w-0 flex-1 truncate text-gray-800">{{ member.name }}</span>
                </button>
              </div>
            </div>
          </div>
          <button type="submit" :disabled="!issueTitle.trim() || addingIssue" class="text-sm font-medium text-white bg-[#4857FE] hover:bg-[#3E4BDE] px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shrink-0 w-full sm:w-auto">
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
                @end="onKanbanDragEnd"
                @change="(evt: any) => onColumnChange(col.key, evt)"
              >
                <template #item="{ element: issue }">
                  <div
                    class="bg-white rounded-xl border border-gray-200/80 hover:shadow-md hover:border-gray-300 transition-all duration-200 group/card relative cursor-grab active:cursor-grabbing p-3.5"
                    @click="openIssueDetailFromCycle(issue)"
                  >
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

                    <!-- Effort + issue fixed date (endDate) -->
                    <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
                      <span class="tabular-nums text-gray-600" title="Effort (hours)">{{ formatIssueEffortHours(issue.estimateValue) }}</span>
                      <span class="inline-flex min-w-0 items-center gap-0.5" title="Issue fixed date">
                        <CalendarDays :size="10" class="shrink-0 text-gray-400" />
                        <span class="truncate">{{ formatDate(issue.endDate) }}</span>
                      </span>
                    </div>

                    <!-- Story tag -->
                    <div v-if="issue.storyId" class="mb-2">
                      <span class="text-[10px] text-[#4857FE] bg-[#4857FE]/8 px-1.5 py-0.5 rounded truncate inline-block max-w-full">{{ issue.storyId }}</span>
                    </div>

                    <!-- Footer: assignee + reporter + date -->
                    <div class="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 min-w-0">
                      <div class="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                        <div v-if="issue.assignedTo" class="flex items-center gap-1 min-w-0" title="Assignee">
                          <UploadAssetImg v-if="issue.assignedTo.avatar" :src="issue.assignedTo.avatar" class="w-5 h-5 rounded-full object-cover shrink-0" />
                          <div v-else class="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center text-[8px] font-semibold text-emerald-700 shrink-0">{{ issue.assignedTo.name[0] }}</div>
                          <span class="text-[10px] text-gray-600 truncate">{{ issue.assignedTo.name.split(' ')[0] }}</span>
                        </div>
                        <div v-if="issue.reportedBy" class="flex items-center gap-1.5 min-w-0">
                          <UploadAssetImg v-if="issue.reportedBy.avatar" :src="issue.reportedBy.avatar" class="w-5 h-5 rounded-full object-cover shrink-0" />
                          <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[8px] font-semibold text-[#4857FE] shrink-0">{{ issue.reportedBy.name[0] }}</div>
                          <span class="text-[10px] text-gray-500 truncate">{{ issue.reportedBy.name.split(' ')[0] }}</span>
                        </div>
                        <span v-if="!issue.assignedTo && !issue.reportedBy" class="text-[10px] text-gray-400">—</span>
                      </div>
                      <span class="text-[10px] text-gray-400 shrink-0">{{ formatDate(issue.createdAt) }}</span>
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
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Assignee</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Issue fixed date</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Effort</th>
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
                class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group cursor-pointer"
                @click="openIssueDetailFromCycle(issue)"
              >
                <td class="px-5 py-3.5">
                  <span class="text-sm font-medium text-gray-900">{{ issue.title }}</span>
                </td>
                <td class="px-5 py-3.5">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold" :class="severityStyle(issue.severity)">
                    {{ issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1) }}
                  </span>
                </td>
                <td class="px-5 py-3.5" @click.stop>
                  <select
                    :value="issue.status"
                    class="text-xs font-medium rounded-full px-2.5 py-1 outline-none cursor-pointer border-0 appearance-none"
                    :class="issueRowSelectToneClass(issue.status)"
                    :style="issueRowSelectStyle(issue.status)"
                    @change="updateIssueStatus(issue, ($event.target as HTMLSelectElement).value as IssueStatus)"
                  >
                    <option v-for="s in issueStatuses" :key="s" :value="s">{{ statusLabel(s) }}</option>
                  </select>
                </td>
                <td class="px-5 py-3.5">
                  <div v-if="issue.assignedTo" class="flex items-center gap-2 min-w-0">
                    <UploadAssetImg v-if="issue.assignedTo.avatar" :src="issue.assignedTo.avatar" class="w-5 h-5 rounded-full object-cover shrink-0" />
                    <div v-else class="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center text-[8px] font-semibold text-emerald-700 shrink-0">{{ issue.assignedTo.name[0] }}</div>
                    <span class="text-sm text-gray-600 truncate">{{ issue.assignedTo.name }}</span>
                  </div>
                  <span v-else class="text-sm text-gray-400">—</span>
                </td>
                <td class="px-5 py-3.5">
                  <span class="text-sm text-gray-500">{{ formatDate(issue.endDate) }}</span>
                </td>
                <td class="px-5 py-3.5">
                  <span class="text-sm text-gray-600 tabular-nums">{{ formatIssueEffortHours(issue.estimateValue) }}</span>
                </td>
                <td class="px-5 py-3.5">
                  <div v-if="issue.reportedBy" class="flex items-center gap-2">
                    <UploadAssetImg v-if="issue.reportedBy.avatar" :src="issue.reportedBy.avatar" class="w-5 h-5 rounded-full object-cover" />
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
                <td class="px-5 py-3.5" @click.stop>
                  <button
                    type="button"
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

    <IssueDetailPanel
      :issue="selectedIssue"
      :open="showIssuePanel"
      :team-members="teamMembers"
      :status-form-config="issueStatusFormConfigRaw"
      @close="closeIssueDetailPanel"
      @updated="onIssueDetailUpdated"
    />
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
