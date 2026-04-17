<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Loader2, Search, Bug, Circle, CheckCircle2,
  ChevronRight, Plus, LayoutList, LayoutGrid,
  ArrowUp, ArrowDown, SlidersHorizontal, Clock,
  GripVertical, Check, RotateCcw,
  FileText, Type, Tag, CalendarClock, Link,
  Users, User, UserCheck, Hourglass, Archive, RotateCw, Trash2, X,
  Shield, AlertTriangle, Zap, Database, Eye, Monitor, Sparkles, Lightbulb,
  PencilLine, Wrench, Server, TestTube2,
  Columns3Cog,
  Filter,
} from 'lucide-vue-next'
import { useIssuesStore } from '@/stores/issues'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'
import { useProductMembersStore } from '@/stores/productMembers'
import type { Activity } from '@/stores/activities'
import FavoriteStar from '@/components/shared/FavoriteStar.vue'
import CreateIssueDialog from '@/components/issue/CreateIssueDialog.vue'
import IssueDetailPanel from '@/components/issue/IssueDetailPanel.vue'
import FormBuilderDialog from '@/components/forms/FormBuilderDialog.vue'
import { useFormConfigsStore } from '@/stores/formConfigs'
import {
  mergeIssueFormConfig,
  getIssueStatusCatalogFromMerged,
  resolveIssueStatusDisplayLabel,
  issueStoredStatusMatchesTabId,
  issueStatusCustomPillStyle,
  issueStatusTabBarStyleOverride,
  issueStatusTabBadgeStyleOverride,
} from '@/lib/issueFormConfig'
import { ISSUE_STATUS_ID_CLOSED, ISSUE_STATUS_ID_OPEN, issueStatusSemanticTone } from '@/lib/issueStatusId'
import type { Issue, IssueStatus } from '@/types/issue'
import { ISSUE_TYPES, ISSUE_TYPE_ORDER } from '@shared/issueTypes'
import { richTextPreviewText } from '@/lib/richText'

interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

const router = useRouter()
const route = useRoute()
const issuesStore = useIssuesStore()
const productStore = useProductStore()
const authStore = useAuthStore()
const rolesStore = useRolesStore()
const productMembersStore = useProductMembersStore()
const formConfigsStore = useFormConfigsStore()

const showArchived = ref(false)

const canIncludeArchived = computed(() => {
  const u = authStore.user
  const p = productStore.activeProductApiRef
  if (!u || !p) return false
  if (u.role === 'super_admin') return true
  return productMembersStore.members.some(m => m.userId === u.id && m.role === 'admin')
})

function issueListFetchOpts() {
  return {
    includeArchived: showArchived.value && canIncludeArchived.value,
  }
}

async function loadIssuesForProduct() {
  const p = productStore.activeProductApiRef
  if (p && authStore.token) await productMembersStore.fetchMembers(p)
  if (p) await formConfigsStore.fetchConfig(p, 'issue')
  await issuesStore.fetchIssues(p || '', undefined, issueListFetchOpts())
}

const searchQuery = ref('')
const activeTab = ref<string>('all')
const viewMode = ref<'table' | 'card'>(localStorage.getItem('issues-view-mode') as 'table' | 'card' || 'table')
const showCreateDialog = ref(false)
const showFormBuilder = ref(false)

// Detail panel state
const selectedIssue = ref<Issue | null>(null)
const showIssuePanel = ref(false)
const teamMembers = ref<TeamUser[]>([])

// Inline editing state
const inlineEditMode = ref(false)
const editingCell = ref<{ id: string; field: string } | null>(null)
const editValue = ref('')
const inlineAssigneeSearch = ref('')

const issueStatusFormMerged = computed(() => {
  const p = productStore.activeProductApiRef
  const cfg = p ? formConfigsStore.getConfig(p, 'issue') : null
  return mergeIssueFormConfig(cfg ?? undefined)
})

const issueStatusCatalog = computed(() => getIssueStatusCatalogFromMerged(issueStatusFormMerged.value))

const issueStatusFormConfigRaw = computed(() => {
  const p = productStore.activeProductApiRef
  if (!p) return null
  return formConfigsStore.getConfig(p, 'issue')
})
const issuePriorityOptions = ['high', 'medium', 'low'] as const
const issueTypeOptions = ISSUE_TYPES
const issueSeverityOptions = ['blocker', 'critical', 'major', 'minor', 'trivial'] as const

const editableFields = new Set(['title', 'priority', 'severity', 'type', 'module', 'assignedTo', 'status'])

function isEditing(id: string, field: string) {
  return editingCell.value?.id === id && editingCell.value?.field === field
}

function startEditing(id: string, field: string, currentValue: string, event?: MouseEvent) {
  if (!inlineEditMode.value || !editableFields.has(field)) return
  if (event) event.stopPropagation()
  editingCell.value = { id, field }
  editValue.value = currentValue || ''
  inlineAssigneeSearch.value = ''
  nextTick(() => {
    const input = document.querySelector('.inline-edit-input') as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

async function saveInlineEdit(id: string, field: string, value: any) {
  const prev = editingCell.value
  editingCell.value = null
  if (prev && prev.id === id && prev.field === field) {
    await issuesStore.updateIssue(id, { [field]: value })
  }
}

async function saveAssigneeInline(id: string, member: TeamUser | null) {
  editingCell.value = null
  if (member) {
    await issuesStore.updateIssue(id, { assignedToUserId: member.id })
  } else {
    await issuesStore.updateIssue(id, { assignedToUserId: null })
  }
}

function cancelEdit() {
  editingCell.value = null
  editValue.value = ''
}

const filteredInlineAssignees = computed(() => {
  const q = inlineAssigneeSearch.value.toLowerCase()
  if (!q) return teamMembers.value
  return teamMembers.value.filter(m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
})

function onEditClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.inline-edit-dropdown') && !target.closest('.inline-edit-cell')) {
    cancelEdit()
  }
}

watch(editingCell, (v) => {
  if (v) {
    setTimeout(() => document.addEventListener('click', onEditClickOutside), 0)
  } else {
    document.removeEventListener('click', onEditClickOutside)
  }
})

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

watch(viewMode, (v) => {
  localStorage.setItem('issues-view-mode', v)
  saveUserSetting('issues-view-mode', v)
})

function openIssueDetail(issue: Issue) {
  selectedIssue.value = issue
  showIssuePanel.value = true
}

function closeIssuePanel() {
  showIssuePanel.value = false
  selectedIssue.value = null
}

async function onIssueUpdated() {
  await loadIssuesForProduct()
  if (selectedIssue.value) {
    const fresh = issuesStore.issues.find(i => i.id === selectedIssue.value!.id)
    if (fresh) {
      selectedIssue.value = fresh
    }
  }
}

onMounted(async () => {
  await loadIssuesForProduct()
  fetchTeamMembers()
  loadUserSettings()
  // Auto-open issue from query param
  const issueId = route.query.issue as string | undefined
  if (issueId) {
    const issue = issuesStore.issues.find(i => i.id === issueId)
    if (issue) openIssueDetail(issue)
  }
})

watch(() => productStore.activeProductApiRef, () => {
  showArchived.value = false
  activeTab.value = 'all'
  resetAllColumnValueFilters()
  loadIssuesForProduct()
  fetchTeamMembers()
})

watch(showArchived, async () => {
  await issuesStore.fetchIssues(productStore.activeProductApiRef, undefined, issueListFetchOpts())
})

// Watch for issue query param changes
watch(() => route.query.issue, (issueId) => {
  if (issueId) {
    const issue = issuesStore.issues.find(i => i.id === issueId as string)
    if (issue) openIssueDetail(issue)
  }
})

const issueStatusTabs = computed(() => issueStatusCatalog.value.map(e => e.id))

const statusTabsStrip = computed(() => issueStatusTabs.value.filter(id => id !== ISSUE_STATUS_ID_CLOSED))

const hasClosedInIssueStatuses = computed(() =>
  issueStatusCatalog.value.some(e => e.id === ISSUE_STATUS_ID_CLOSED),
)

// Status-filtered issue groups (keys: all, closed if configured, + each configured status)
const issuesByStatus = computed(() => {
  let base = issuesStore.issues
  if (rolesStore.isSelfViewOnly('issues') && authStore.user) {
    base = base.filter(i => i.assignedTo?.name === authStore.user!.name)
  }
  const statuses = issueStatusTabs.value
  const cat = issueStatusCatalog.value
  const excludeFromAll = hasClosedInIssueStatuses.value
  const all = excludeFromAll
    ? base.filter(i => !issueStoredStatusMatchesTabId(i.status, ISSUE_STATUS_ID_CLOSED, cat))
    : [...base]
  const out: Record<string, typeof base> = { all }
  for (const s of statuses) {
    if (s === ISSUE_STATUS_ID_CLOSED) {
      out.closed = base.filter(i => issueStoredStatusMatchesTabId(i.status, ISSUE_STATUS_ID_CLOSED, cat))
    } else {
      out[s] = all.filter(i => issueStoredStatusMatchesTabId(i.status, s, cat))
    }
  }
  if (!('closed' in out)) out.closed = []
  return out
})

watch(issueStatusTabs, () => {
  const tabs = issueStatusTabs.value
  if (activeTab.value !== 'all' && activeTab.value !== 'closed' && !tabs.includes(activeTab.value)) {
    activeTab.value = 'all'
  }
  if (activeTab.value === 'closed' && !hasClosedInIssueStatuses.value) {
    activeTab.value = 'all'
  }
})

const filteredIssues = computed(() => {
  const list = issuesByStatus.value[activeTab.value] ?? issuesByStatus.value.all ?? []
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return list
  return list.filter(i =>
    i.title.toLowerCase().includes(q) ||
    (i.description && i.description.toLowerCase().includes(q)) ||
    (i.module && i.module.toLowerCase().includes(q))
  )
})

const ISSUE_SEVERITY_FILTER_IDS = ['blocker', 'critical', 'major', 'minor', 'trivial'] as const
const ISSUE_PRIORITY_FILTER_IDS = ['high', 'medium', 'low'] as const

/** Normalize enum-ish column values for filter matching (API may vary in casing). */
function normalizeIssueFilterToken(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
}

const ISSUE_TYPE_FILTER_IDS = ISSUE_TYPES.map(v => normalizeIssueFilterToken(v))

/** Status column filter: canonical catalog ids to include in table/card lists. */
const statusColumnIncludedIds = ref<Set<string>>(new Set())
const showStatusColumnFilter = ref(false)

watch(
  () => issueStatusCatalog.value.map(e => e.id).sort().join(','),
  () => {
    // Always default to every catalog status selected (new product, new status row, or first load).
    statusColumnIncludedIds.value = new Set(issueStatusCatalog.value.map(e => e.id))
  },
  { immediate: true },
)

const severityColumnIncludedIds = ref<Set<string>>(new Set(ISSUE_SEVERITY_FILTER_IDS))
const showSeverityColumnFilter = ref(false)

const priorityColumnIncludedIds = ref<Set<string>>(new Set(ISSUE_PRIORITY_FILTER_IDS))
const showPriorityColumnFilter = ref(false)

const typeColumnIncludedIds = ref<Set<string>>(new Set(ISSUE_TYPE_FILTER_IDS))
const showTypeColumnFilter = ref(false)

const statusColumnFilterActive = computed(() => {
  const cat = issueStatusCatalog.value
  const inc = statusColumnIncludedIds.value
  return cat.length > 0 && inc.size > 0 && inc.size < cat.length
})

const severityColumnFilterActive = computed(() => {
  const inc = severityColumnIncludedIds.value
  return inc.size > 0 && inc.size < ISSUE_SEVERITY_FILTER_IDS.length
})

const priorityColumnFilterActive = computed(() => {
  const inc = priorityColumnIncludedIds.value
  return inc.size > 0 && inc.size < ISSUE_PRIORITY_FILTER_IDS.length
})

const typeColumnFilterActive = computed(() => {
  const inc = typeColumnIncludedIds.value
  return inc.size > 0 && inc.size < ISSUE_TYPE_FILTER_IDS.length
})

function isStatusIncludedForFilter(id: string) {
  return statusColumnIncludedIds.value.has(id)
}

function toggleStatusColumnFilter(id: string) {
  const next = new Set(statusColumnIncludedIds.value)
  if (next.has(id)) {
    if (next.size <= 1) return
    next.delete(id)
  } else {
    next.add(id)
  }
  statusColumnIncludedIds.value = next
}

function selectAllStatusColumnFilters() {
  statusColumnIncludedIds.value = new Set(issueStatusCatalog.value.map(e => e.id))
}

function isSeverityIncludedForFilter(id: string) {
  return severityColumnIncludedIds.value.has(id)
}

function toggleSeverityColumnFilter(id: string, evt?: Event) {
  const input = evt?.target as HTMLInputElement | undefined
  const wantChecked =
    input && input.type === 'checkbox' ? input.checked : !severityColumnIncludedIds.value.has(id)
  const next = new Set(severityColumnIncludedIds.value)
  if (wantChecked) {
    next.add(id)
  } else {
    if (next.size <= 1) {
      if (input) input.checked = true
      return
    }
    next.delete(id)
  }
  severityColumnIncludedIds.value = next
}

function selectAllSeverityColumnFilters() {
  severityColumnIncludedIds.value = new Set(ISSUE_SEVERITY_FILTER_IDS)
}

function isPriorityIncludedForFilter(id: string) {
  return priorityColumnIncludedIds.value.has(id)
}

function togglePriorityColumnFilter(id: string, evt?: Event) {
  const input = evt?.target as HTMLInputElement | undefined
  const wantChecked =
    input && input.type === 'checkbox' ? input.checked : !priorityColumnIncludedIds.value.has(id)
  const next = new Set(priorityColumnIncludedIds.value)
  if (wantChecked) {
    next.add(id)
  } else {
    if (next.size <= 1) {
      if (input) input.checked = true
      return
    }
    next.delete(id)
  }
  priorityColumnIncludedIds.value = next
}

function selectAllPriorityColumnFilters() {
  priorityColumnIncludedIds.value = new Set(ISSUE_PRIORITY_FILTER_IDS)
}

function isTypeIncludedForFilter(id: string) {
  return typeColumnIncludedIds.value.has(normalizeIssueFilterToken(id))
}

function toggleTypeColumnFilter(id: string, evt?: Event) {
  const token = normalizeIssueFilterToken(id)
  const input = evt?.target as HTMLInputElement | undefined
  const wantChecked =
    input && input.type === 'checkbox' ? input.checked : !typeColumnIncludedIds.value.has(token)
  const next = new Set(typeColumnIncludedIds.value)
  if (wantChecked) {
    next.add(token)
  } else {
    if (next.size <= 1) {
      if (input) input.checked = true
      return
    }
    next.delete(token)
  }
  typeColumnIncludedIds.value = next
}

function selectAllTypeColumnFilters() {
  typeColumnIncludedIds.value = new Set(ISSUE_TYPE_FILTER_IDS)
}

function closeAllColumnFilterMenus() {
  showStatusColumnFilter.value = false
  showSeverityColumnFilter.value = false
  showPriorityColumnFilter.value = false
  showTypeColumnFilter.value = false
}

function resetAllColumnValueFilters() {
  selectAllStatusColumnFilters()
  selectAllSeverityColumnFilters()
  selectAllPriorityColumnFilters()
  selectAllTypeColumnFilters()
}

function toggleStatusFilterPanel() {
  if (showStatusColumnFilter.value) {
    showStatusColumnFilter.value = false
  } else {
    closeAllColumnFilterMenus()
    showStatusColumnFilter.value = true
    showColumnCustomizer.value = false
  }
}

function toggleSeverityFilterPanel() {
  if (showSeverityColumnFilter.value) {
    showSeverityColumnFilter.value = false
  } else {
    closeAllColumnFilterMenus()
    showSeverityColumnFilter.value = true
    showColumnCustomizer.value = false
  }
}

function togglePriorityFilterPanel() {
  if (showPriorityColumnFilter.value) {
    showPriorityColumnFilter.value = false
  } else {
    closeAllColumnFilterMenus()
    showPriorityColumnFilter.value = true
    showColumnCustomizer.value = false
  }
}

function toggleTypeFilterPanel() {
  if (showTypeColumnFilter.value) {
    showTypeColumnFilter.value = false
  } else {
    closeAllColumnFilterMenus()
    showTypeColumnFilter.value = true
    showColumnCustomizer.value = false
  }
}

function toggleColumnCustomizerPanel() {
  showColumnCustomizer.value = !showColumnCustomizer.value
  if (showColumnCustomizer.value) closeAllColumnFilterMenus()
}

const columnFilteredIssues = computed(() => {
  let list = filteredIssues.value
  const cat = issueStatusCatalog.value
  const st = statusColumnIncludedIds.value
  if (st.size > 0 && cat.length > 0 && st.size < cat.length) {
    list = list.filter((i) => {
      for (const id of st) {
        if (issueStoredStatusMatchesTabId(i.status, id, cat)) return true
      }
      return false
    })
  }
  const includedSeverities = severityColumnIncludedIds.value
  if (includedSeverities.size > 0 && includedSeverities.size < ISSUE_SEVERITY_FILTER_IDS.length) {
    list = list.filter(issue => includedSeverities.has(normalizeIssueFilterToken(issue.severity)))
  }
  const includedPriorities = priorityColumnIncludedIds.value
  if (includedPriorities.size > 0 && includedPriorities.size < ISSUE_PRIORITY_FILTER_IDS.length) {
    list = list.filter(issue => includedPriorities.has(normalizeIssueFilterToken(issue.priority)))
  }
  const includedTypes = typeColumnIncludedIds.value
  if (includedTypes.size > 0 && includedTypes.size < ISSUE_TYPE_FILTER_IDS.length) {
    list = list.filter(issue => includedTypes.has(normalizeIssueFilterToken(issue.type)))
  }
  return list
})

// Sorting
type SortField = 'title' | 'status' | 'severity' | 'priority' | 'type' | 'module' | 'assignedTo' | 'reportedBy' | 'environment' | 'appVersion' | 'createdAt' | 'updatedAt'
const sortField = ref<SortField | null>(null)
const sortDirection = ref<'asc' | 'desc'>('asc')

function toggleSort(field: SortField) {
  if (sortField.value === field) {
    if (sortDirection.value === 'asc') {
      sortDirection.value = 'desc'
    } else {
      sortField.value = null
      sortDirection.value = 'asc'
    }
  } else {
    sortField.value = field
    sortDirection.value = 'asc'
  }
}

const statusOrder = computed(() => {
  const m: Record<string, number> = {}
  issueStatusCatalog.value.forEach((e, i) => {
    m[e.id] = i
    if (e.slugKey) m[e.slugKey] = i
  })
  return m
})
const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
const severityOrder: Record<string, number> = { blocker: 0, critical: 1, major: 2, minor: 3, trivial: 4 }
const typeOrder: Record<string, number> = ISSUE_TYPE_ORDER

function compareStr(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '').localeCompare(b || '')
}
function compareDate(a: string | null | undefined, b: string | null | undefined): number {
  const da = a ? new Date(a).getTime() : 0
  const db = b ? new Date(b).getTime() : 0
  return da - db
}

const sortedIssues = computed(() => {
  const list = [...columnFilteredIssues.value]
  if (!sortField.value) return list

  const field = sortField.value
  const dir = sortDirection.value === 'asc' ? 1 : -1

  list.sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'title':
        cmp = a.title.localeCompare(b.title)
        break
      case 'status':
        cmp = (statusOrder.value[a.status] ?? 99) - (statusOrder.value[b.status] ?? 99)
        break
      case 'severity':
        cmp = (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99)
        break
      case 'priority':
        cmp = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99)
        break
      case 'type':
        cmp = (typeOrder[a.type || ''] ?? 99) - (typeOrder[b.type || ''] ?? 99)
        break
      case 'module':
        cmp = compareStr(a.module, b.module)
        break
      case 'assignedTo':
        cmp = compareStr(a.assignedTo?.name, b.assignedTo?.name)
        break
      case 'reportedBy':
        cmp = compareStr(a.reportedBy?.name, b.reportedBy?.name)
        break
      case 'environment':
        cmp = compareStr(a.environment, b.environment)
        break
      case 'appVersion':
        cmp = compareStr(a.appVersion, b.appVersion)
        break
      case 'createdAt':
        cmp = compareDate(a.createdAt, b.createdAt)
        break
      case 'updatedAt':
        cmp = compareDate(a.updatedAt, b.updatedAt)
        break
    }
    return cmp * dir
  })
  return list
})

// Column customization
interface ColumnConfig {
  field: SortField
  label: string
  width: string
  visible: boolean
}

const defaultColumns: ColumnConfig[] = [
  { field: 'title', label: 'Title', width: '320px', visible: true },
  { field: 'status', label: 'Status', width: '120px', visible: true },
  { field: 'severity', label: 'Severity', width: '110px', visible: true },
  { field: 'priority', label: 'Priority', width: '100px', visible: true },
  { field: 'type', label: 'Type', width: '130px', visible: true },
  { field: 'module', label: 'Module', width: '130px', visible: false },
  { field: 'assignedTo', label: 'Assigned To', width: '140px', visible: true },
  { field: 'reportedBy', label: 'Reported By', width: '140px', visible: false },
  { field: 'environment', label: 'Environment', width: '120px', visible: false },
  { field: 'appVersion', label: 'Version', width: '100px', visible: false },
  { field: 'createdAt', label: 'Created', width: '100px', visible: true },
  { field: 'updatedAt', label: 'Updated', width: '100px', visible: false },
]

function mergeWithDefaults(saved: ColumnConfig[]): ColumnConfig[] {
  const knownFields = new Set(saved.map(c => c.field))
  const merged = [...saved]
  for (const def of defaultColumns) {
    if (!knownFields.has(def.field)) merged.push({ ...def })
  }
  for (const c of merged) {
    if (c.field === 'title' && (c.width === '1fr' || c.width.endsWith('fr'))) {
      c.width = '320px'
    }
  }
  return merged
}

function loadColumnConfig(): ColumnConfig[] {
  try {
    const saved = localStorage.getItem('issues-column-config')
    if (saved) return mergeWithDefaults(JSON.parse(saved) as ColumnConfig[])
  } catch { /* ignore */ }
  return defaultColumns.map(c => ({ ...c }))
}

const columns = ref<ColumnConfig[]>(loadColumnConfig())
const showColumnCustomizer = ref(false)

// Debounced save to API
let saveTimeout: ReturnType<typeof setTimeout> | null = null
function saveUserSetting(key: string, value: any) {
  if (!authStore.token) return
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    try {
      await fetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({ value }),
      })
    } catch { /* silently fail */ }
  }, 500)
}

watch(columns, (v) => {
  localStorage.setItem('issues-column-config', JSON.stringify(v))
  saveUserSetting('issues-column-config', v)
}, { deep: true })

async function loadUserSettings() {
  if (!authStore.token) return
  try {
    const res = await fetch('/api/settings/', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (!res.ok) return
    const settings = await res.json()

    if (settings['issues-column-config']) {
      const serverCols = mergeWithDefaults(settings['issues-column-config'] as ColumnConfig[])
      columns.value = serverCols
      localStorage.setItem('issues-column-config', JSON.stringify(serverCols))
    }
    if (settings['issues-view-mode']) {
      viewMode.value = settings['issues-view-mode'] as 'table' | 'card'
      localStorage.setItem('issues-view-mode', settings['issues-view-mode'])
    }
    if (settings['issues-column-widths']) {
      const serverWidths = settings['issues-column-widths'] as Record<string, number>
      for (const [k, v] of Object.entries(serverWidths)) {
        if (typeof v === 'number' && v >= 60) columnWidths[k] = v
      }
      if (columnWidths.title === 200) columnWidths.title = 320
      localStorage.setItem('issues-column-widths', JSON.stringify({ ...columnWidths }))
    }
  } catch { /* fall back to localStorage */ }
}

const visibleColumns = computed(() => columns.value.filter(c => c.visible))

/** Column filter icons live in headers when that column is visible in table view. */
const statusFilterInTableHeader = computed(
  () => viewMode.value === 'table' && visibleColumns.value.some(c => c.field === 'status'),
)
const severityFilterInTableHeader = computed(
  () => viewMode.value === 'table' && visibleColumns.value.some(c => c.field === 'severity'),
)
const priorityFilterInTableHeader = computed(
  () => viewMode.value === 'table' && visibleColumns.value.some(c => c.field === 'priority'),
)
const typeFilterInTableHeader = computed(
  () => viewMode.value === 'table' && visibleColumns.value.some(c => c.field === 'type'),
)

/** Fixed column for row actions (delete / reopen); must match grid cell count or buttons wrap to a new row. */
const TABLE_ROW_ACTIONS_COL_PX = 80

const gridTemplateCols = computed(() => {
  const data = visibleColumns.value
    .map(c => (columnWidths[c.field] || parseDefaultWidth(c.width)) + 'px')
    .join(' ')
  return `${data} ${TABLE_ROW_ACTIONS_COL_PX}px`
})

const minTableWidth = computed(() => {
  let total = 48 + TABLE_ROW_ACTIONS_COL_PX
  for (const col of visibleColumns.value) {
    total += columnWidths[col.field] || parseDefaultWidth(col.width)
  }
  return total
})

function toggleColumnVisibility(field: SortField) {
  const col = columns.value.find(c => c.field === field)
  if (!col) return
  if (field === 'title') return
  const visibleCount = columns.value.filter(c => c.visible).length
  if (col.visible && visibleCount <= 2) return
  col.visible = !col.visible
}

function resetColumns() {
  columns.value = defaultColumns.map(c => ({ ...c }))
  for (const col of defaultColumns) {
    columnWidths[col.field] = parseDefaultWidth(col.width)
  }
  localStorage.removeItem('issues-column-widths')
}

// --- Column resize ---
function parseDefaultWidth(w: string): number {
  if (w.endsWith('px')) return parseInt(w)
  return 200
}

function loadColumnWidths(): Record<string, number> {
  const widths: Record<string, number> = {}
  for (const col of defaultColumns) {
    widths[col.field] = parseDefaultWidth(col.width)
  }
  try {
    const saved = localStorage.getItem('issues-column-widths')
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, number>
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && v >= 60) widths[k] = v
      }
    }
  } catch { /* ignore */ }
  // Legacy: title used `1fr`, which parsed as 200px — widen to match new default unless user chose otherwise.
  if (widths.title === 200) widths.title = 320
  return widths
}

const columnWidths = reactive<Record<string, number>>(loadColumnWidths())

const resizingCol = ref<string | null>(null)
let resizeStartX = 0
let resizeStartWidth = 0

function onResizeStart(field: string, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  resizingCol.value = field
  resizeStartX = e.clientX
  resizeStartWidth = columnWidths[field] || 100
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e: MouseEvent) {
  if (!resizingCol.value) return
  const delta = e.clientX - resizeStartX
  const newWidth = Math.max(60, resizeStartWidth + delta)
  columnWidths[resizingCol.value] = newWidth
}

function onResizeEnd() {
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  resizingCol.value = null
  localStorage.setItem('issues-column-widths', JSON.stringify({ ...columnWidths }))
  saveUserSetting('issues-column-widths', { ...columnWidths })
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})

// Drag-and-drop reordering
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(idx: number, event: DragEvent) {
  dragIndex.value = idx
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(idx))
  }
}
function onDragOver(idx: number, event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = idx
}
function onDragLeave() { dragOverIndex.value = null }
function onDrop(idx: number) {
  if (dragIndex.value === null || dragIndex.value === idx) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
  const arr = [...columns.value]
  const [moved] = arr.splice(dragIndex.value, 1)
  if (!moved) return
  arr.splice(idx, 0, moved)
  columns.value = arr
  dragIndex.value = null
  dragOverIndex.value = null
}
function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

// Close customizer on outside click
function onCustomizerClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.column-customizer-container')) {
    showColumnCustomizer.value = false
  }
}
watch(showColumnCustomizer, (v) => {
  if (v) {
    setTimeout(() => document.addEventListener('click', onCustomizerClickOutside), 0)
  } else {
    document.removeEventListener('click', onCustomizerClickOutside)
  }
})

function onColumnFilterClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.issues-column-filter-container')) {
    closeAllColumnFilterMenus()
  }
}

const anyColumnFilterMenuOpen = computed(
  () =>
    showStatusColumnFilter.value ||
    showSeverityColumnFilter.value ||
    showPriorityColumnFilter.value ||
    showTypeColumnFilter.value,
)

watch(anyColumnFilterMenuOpen, (open) => {
  if (open) {
    setTimeout(() => document.addEventListener('click', onColumnFilterClickOutside), 0)
  } else {
    document.removeEventListener('click', onColumnFilterClickOutside)
  }
})

// Closed tab (similar to archived in stories)
function toggleClosedTab() {
  if (!hasClosedInIssueStatuses.value) return
  activeTab.value = activeTab.value === 'closed' ? 'all' : 'closed'
}

function pickReopenTargetStatus(): IssueStatus {
  const tabs = issueStatusTabs.value
  if (tabs.includes(ISSUE_STATUS_ID_OPEN)) return ISSUE_STATUS_ID_OPEN
  const nonClosed = tabs.filter(s => s !== ISSUE_STATUS_ID_CLOSED)
  return nonClosed[0] ?? tabs[0] ?? ISSUE_STATUS_ID_OPEN
}

async function reopenIssue(issueId: string) {
  await issuesStore.updateIssue(issueId, { status: pickReopenTargetStatus() })
}

async function deleteIssue(issueId: string) {
  if (!confirm('Delete this issue? This cannot be undone.')) return
  const ok = await issuesStore.deleteIssue(issueId)
  if (ok && selectedIssue.value?.id === issueId) {
    showIssuePanel.value = false
    selectedIssue.value = null
  }
}

// ===== Activity Timeline =====
const showActivityDropdown = ref(false)
const issueActivities = ref<Activity[]>([])
const issueActivitiesLoading = ref(false)

async function fetchIssueActivities() {
  issueActivitiesLoading.value = true
  try {
    const p = productStore.activeProductApiRef
    const res = await fetch(`/api/activities?product=${encodeURIComponent(p)}&entityType=issue&limit=50`)
    if (res.ok) {
      issueActivities.value = await res.json()
    }
  } catch (e) {
    console.error('Failed to fetch issue activities:', e)
  } finally {
    issueActivitiesLoading.value = false
  }
}

function toggleActivityDropdown() {
  showActivityDropdown.value = !showActivityDropdown.value
  if (showActivityDropdown.value) {
    fetchIssueActivities()
  }
}

function onActivityClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.activity-dropdown-container')) {
    showActivityDropdown.value = false
  }
}
watch(showActivityDropdown, (v) => {
  if (v) {
    setTimeout(() => document.addEventListener('click', onActivityClickOutside), 0)
  } else {
    document.removeEventListener('click', onActivityClickOutside)
  }
})

function openIssueFromActivity(entityId: string | null) {
  if (!entityId) return
  showActivityDropdown.value = false
  const issue = issuesStore.issues.find(i => i.id === entityId)
  if (issue) openIssueDetail(issue)
}

function activityTimeAgo(dateStr: string) {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function activityActionColor(action: string) {
  switch (action) {
    case 'created': return 'bg-[#00c875]'
    case 'updated': return 'bg-[#fdab3d]'
    case 'deleted': return 'bg-red-500'
    default: return 'bg-gray-400'
  }
}

function activityFormatField(field: string) {
  return field.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function activityUserInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const groupedIssueActivities = computed(() => {
  const groups: { label: string; activities: Activity[] }[] = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000)
  const buckets = new Map<string, Activity[]>()
  for (const activity of issueActivities.value) {
    const d = new Date(activity.createdAt)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    let label: string
    if (day.getTime() >= weekStart.getTime()) label = 'THIS WEEK'
    else if (day.getTime() >= lastWeekStart.getTime()) label = 'LAST WEEK'
    else label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label)!.push(activity)
  }
  for (const [label, acts] of buckets) {
    groups.push({ label, activities: acts })
  }
  return groups
})

// ===== Styling =====
function statusStyle(status: string) {
  switch (issueStatusSemanticTone(status)) {
    case 'open': return 'bg-red-500 text-white'
    case 'in_progress': return 'bg-[#fdab3d] text-white'
    case 'resolved': return 'bg-[#00c875] text-white'
    case 'closed': return 'bg-gray-400 text-white'
    case 'deferred': return 'bg-[#a25ddc] text-white'
    default: return 'bg-gray-400 text-white'
  }
}

function statusTabColor(status: string) {
  switch (issueStatusSemanticTone(status)) {
    case 'open': return { active: 'text-red-600 border-red-500', badge: 'bg-red-100 text-red-600' }
    case 'in_progress': return { active: 'text-[#fdab3d] border-[#fdab3d]', badge: 'bg-[#fdab3d]/15 text-[#d48806]' }
    case 'resolved': return { active: 'text-[#00c875] border-[#00c875]', badge: 'bg-[#00c875]/15 text-[#00a65a]' }
    case 'closed': return { active: 'text-gray-500 border-gray-400', badge: 'bg-gray-200 text-gray-500' }
    case 'deferred': return { active: 'text-[#a25ddc] border-[#a25ddc]', badge: 'bg-[#a25ddc]/15 text-[#a25ddc]' }
    default: return { active: 'text-gray-500 border-gray-400', badge: 'bg-gray-200 text-gray-500' }
  }
}

function issueListStatusPillClass(stored: string, size: 'md' | 'sm') {
  const custom = issueStatusCustomPillStyle(issueStatusFormMerged.value, stored)
  const pad = size === 'md' ? 'px-3 py-1' : 'px-2.5 py-0.5'
  const base = `inline-flex items-center ${pad} rounded-full text-[11px] font-semibold`
  if (custom) return base
  return `${base} ${statusStyle(stored)}`
}

function issueListStatusPillStyle(stored: string) {
  return issueStatusCustomPillStyle(issueStatusFormMerged.value, stored)
}

function statusTabBarClass(tabId: string) {
  const base = 'flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer'
  if (activeTab.value !== tabId) return `${base} text-gray-500 border-transparent hover:text-gray-700`
  const bar = issueStatusTabBarStyleOverride(issueStatusFormMerged.value, tabId)
  if (bar) return `${base} border-transparent`
  return `${base} ${statusTabColor(tabId).active}`
}

function statusTabBarInline(tabId: string) {
  if (activeTab.value !== tabId) return undefined
  return issueStatusTabBarStyleOverride(issueStatusFormMerged.value, tabId)
}

function statusTabCountBadgeClass(tabId: string) {
  const base = 'text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center'
  const badge = issueStatusTabBadgeStyleOverride(issueStatusFormMerged.value, tabId)
  if (badge) return base
  return `${base} ${statusTabColor(tabId).badge}`
}

function statusTabCountBadgeInline(tabId: string) {
  return issueStatusTabBadgeStyleOverride(issueStatusFormMerged.value, tabId)
}

function priorityStyle(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700 border border-red-200'
    case 'medium': return 'bg-green-100 text-green-700 border border-green-200'
    case 'low': return 'bg-blue-100 text-blue-700 border border-blue-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
}

function priorityDotStyle(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-500'
    case 'medium': return 'bg-green-500'
    case 'low': return 'bg-blue-500'
    default: return 'bg-gray-400'
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

function typeIcon(type: string) {
  switch (type) {
    case 'bug': return Bug
    case 'ui_issue': return Eye
    case 'performance': return Zap
    case 'crash': return AlertTriangle
    case 'security': return Shield
    case 'data_loss': return Database
    case 'other': return Bug
    case 'feature': return Sparkles
    case 'enhancement': return Lightbulb
    default: return Bug
  }
}

function typeStyle(type: string | null) {
  switch (type) {
    case 'bug': return 'bg-red-50/80 text-red-600'
    case 'ui_issue': return 'bg-purple-50/80 text-purple-600'
    case 'performance': return 'bg-yellow-50/80 text-yellow-600'
    case 'crash': return 'bg-red-50/80 text-red-700'
    case 'security': return 'bg-orange-50/80 text-orange-600'
    case 'data_loss': return 'bg-rose-50/80 text-rose-600'
    case 'other': return 'bg-gray-50/80 text-gray-500'
    case 'feature': return 'bg-violet-50/80 text-violet-600'
    case 'enhancement': return 'bg-sky-50/80 text-sky-600'
    default: return 'bg-gray-50/80 text-gray-500'
  }
}

function statusLabel(status: string) {
  return resolveIssueStatusDisplayLabel(issueStatusFormMerged.value, status)
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function severityLabel(severity: string) {
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}

function typeLabel(type: string | null) {
  if (!type) return '--'
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 pt-7 pb-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Bug :size="18" class="text-red-500" />
          </div>
          <h1 class="text-lg font-semibold text-gray-900">Issues <span class="text-gray-400 font-normal">({{ issuesStore.issues.length }})</span></h1>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            @click="showCreateDialog = true"
          >
            <Plus :size="15" />
            Report Bug
          </button>
        </div>
      </div>
    </div>

    <!-- Status Tabs + View Toggle -->
    <div class="bg-white px-8 pt-4 pb-3 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1 flex-wrap">
          <!-- All -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'all'
              ? 'text-red-500 border-red-500'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'all'"
          >
            All
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-red-500/15 text-red-500">{{ (issuesByStatus.all ?? []).length }}</span>
          </button>
          <!-- Status tabs -->
          <button
            v-for="status in statusTabsStrip"
            :key="status"
            :class="statusTabBarClass(status)"
            :style="statusTabBarInline(status)"
            @click="activeTab = status"
          >
            {{ statusLabel(status) }}
            <span
              :class="statusTabCountBadgeClass(status)"
              :style="statusTabCountBadgeInline(status)"
            >{{ (issuesByStatus[status] ?? []).length }}</span>
          </button>
        </div>

        <!-- Controls -->
        <div class="flex items-center gap-3">
          <label
            v-if="canIncludeArchived"
            class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none shrink-0"
          >
            <input
              v-model="showArchived"
              type="checkbox"
              class="rounded border-gray-300 text-red-500 focus:ring-red-500"
            />
            Show archived
          </label>
          <!-- Closed -->
          <button
            v-if="hasClosedInIssueStatuses"
            class="flex items-center gap-1.5 p-1.5 rounded-lg transition-colors cursor-pointer"
            :class="activeTab === 'closed' ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
            @click="toggleClosedTab()"
            title="Closed issues"
          >
            <Archive :size="16" />
            <span v-if="(issuesByStatus.closed ?? []).length > 0" class="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-gray-400 text-white leading-none">{{ (issuesByStatus.closed ?? []).length }}</span>
          </button>

          <!-- Activity Timeline -->
          <div class="relative activity-dropdown-container">
            <button
              class="flex items-center gap-1.5 p-1.5 rounded-lg transition-colors cursor-pointer"
              :class="showActivityDropdown ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
              @click.stop="toggleActivityDropdown()"
              title="Activity timeline"
            >
              <Clock :size="16" />
            </button>
            <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 translate-y-1"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 translate-y-1"
            >
              <div
                v-if="showActivityDropdown"
                class="absolute right-0 top-full mt-2 w-[400px] bg-white rounded-xl border border-gray-200 shadow-2xl z-50 overflow-hidden"
                @click.stop
              >
                <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <div class="flex items-center gap-2">
                    <Clock :size="16" class="text-gray-400" />
                    <h3 class="text-sm font-semibold text-gray-900">Activity Timeline</h3>
                  </div>
                  <button class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer" @click="fetchIssueActivities()">Refresh</button>
                </div>
                <div class="max-h-[480px] overflow-y-auto">
                  <div v-if="issueActivitiesLoading" class="flex items-center justify-center py-16">
                    <Loader2 :size="20" class="animate-spin text-gray-400" />
                  </div>
                  <div v-else-if="issueActivities.length === 0" class="text-center py-16 px-6">
                    <Clock :size="32" class="text-gray-200 mx-auto mb-3" />
                    <p class="text-sm text-gray-400">No activity yet</p>
                    <p class="text-xs text-gray-300 mt-1">Issue changes will appear here</p>
                  </div>
                  <div v-else>
                    <div v-for="group in groupedIssueActivities" :key="group.label">
                      <div class="px-5 pt-4 pb-2">
                        <span class="text-[11px] font-bold tracking-wider text-red-500">{{ group.label }}</span>
                      </div>
                      <div class="relative px-5">
                        <div class="absolute left-[33px] top-0 bottom-0 w-px bg-gray-100"></div>
                        <div v-for="activity in group.activities" :key="activity.id" class="relative py-3">
                          <div class="flex items-start gap-3">
                            <div class="relative shrink-0 z-10">
                              <div class="w-8 h-8 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden ring-2 ring-white">
                                <UploadAssetImg v-if="activity.userAvatar" :src="activity.userAvatar" class="w-8 h-8 rounded-full object-cover" :alt="activity.userName" />
                                <span v-else>{{ activityUserInitials(activity.userName) }}</span>
                              </div>
                              <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" :class="activityActionColor(activity.action)"></div>
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center justify-between">
                                <span class="text-sm font-semibold text-gray-900">{{ activity.userName }}</span>
                                <span class="text-[11px] text-gray-400 shrink-0 ml-2">{{ activityTimeAgo(activity.createdAt) }}</span>
                              </div>
                              <button class="flex items-center gap-1.5 mt-0.5 cursor-pointer text-left max-w-full group/issue" @click="openIssueFromActivity(activity.entityId)">
                                <Bug :size="13" class="text-red-500/60 shrink-0" />
                                <span class="text-sm font-medium text-red-500 group-hover/issue:text-red-600 truncate">{{ activity.entityTitle }}</span>
                              </button>
                              <div class="mt-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                <div v-if="activity.action === 'created'" class="flex items-center gap-2">
                                  <span class="w-1.5 h-1.5 rounded-full bg-[#00c875] shrink-0"></span>
                                  <span class="text-xs font-medium text-gray-600">Issue reported</span>
                                </div>
                                <div v-else-if="activity.action === 'deleted'" class="flex items-center gap-2">
                                  <span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                                  <span class="text-xs font-medium text-gray-600">Issue deleted</span>
                                </div>
                                <div v-else-if="activity.changes && activity.changes.length > 0" class="space-y-1.5">
                                  <div v-for="(change, ci) in activity.changes" :key="ci" class="flex items-center gap-2 text-xs text-gray-600">
                                    <span class="font-medium">{{ activityFormatField(change.field) }}:</span>
                                    <span v-if="change.from" class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600">{{ activityFormatField(change.from) }}</span>
                                    <span v-if="change.from && change.to" class="text-gray-300">&rarr;</span>
                                    <span v-if="change.to" class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700 text-white">{{ activityFormatField(change.to) }}</span>
                                  </div>
                                </div>
                                <div v-else class="flex items-center gap-2">
                                  <span class="w-1.5 h-1.5 rounded-full bg-[#fdab3d] shrink-0"></span>
                                  <span class="text-xs font-medium text-gray-600">Issue updated</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Search -->
          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/20">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input
              v-model="searchQuery"
              class="text-sm text-gray-700 bg-transparent outline-none w-44 placeholder-gray-400"
              placeholder="Search issues..."
            />
          </div>

          <!-- View Toggle -->
          <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              class="p-1.5 rounded-md transition-colors cursor-pointer"
              :class="viewMode === 'table' ? 'bg-white shadow-sm text-red-500' : 'text-gray-400 hover:text-gray-600'"
              @click="viewMode = 'table'"
              title="Table view"
            >
              <LayoutList :size="16" />
            </button>
            <button
              class="p-1.5 rounded-md transition-colors cursor-pointer"
              :class="viewMode === 'card' ? 'bg-white shadow-sm text-red-500' : 'text-gray-400 hover:text-gray-600'"
              @click="viewMode = 'card'"
              title="Card view"
            >
              <LayoutGrid :size="16" />
            </button>
          </div>

          <!-- Column value filters (toolbar when column hidden or card view) -->
          <div class="flex items-center gap-0.5">
            <div
              v-if="!statusFilterInTableHeader"
              class="relative issues-column-filter-container"
            >
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors cursor-pointer"
                :class="showStatusColumnFilter || statusColumnFilterActive
                  ? 'bg-red-500/10 text-red-500'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'"
                title="Filter by status"
                @click.stop="toggleStatusFilterPanel()"
              >
                <Filter :size="15" />
              </button>
              <Transition
                enter-active-class="transition ease-out duration-150"
                enter-from-class="opacity-0 scale-95 translate-y-1"
                enter-to-class="opacity-100 scale-100 translate-y-0"
                leave-active-class="transition ease-in duration-100"
                leave-from-class="opacity-100 scale-100 translate-y-0"
                leave-to-class="opacity-0 scale-95 translate-y-1"
              >
                <div
                  v-if="showStatusColumnFilter && !statusFilterInTableHeader"
                  class="absolute right-0 top-full z-50 mt-2 w-56 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
                  @click.stop
                >
                  <div class="flex items-center justify-between border-b border-gray-100 px-3 pb-2">
                    <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Statuses</span>
                    <button
                      type="button"
                      class="cursor-pointer text-[11px] text-red-500 hover:underline"
                      @click="selectAllStatusColumnFilters"
                    >
                      All
                    </button>
                  </div>
                  <label
                    v-for="e in issueStatusCatalog"
                    :key="e.id"
                    class="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      class="rounded border-gray-300 text-red-500 focus:ring-red-500"
                      :checked="isStatusIncludedForFilter(e.id)"
                      @change="toggleStatusColumnFilter(e.id)"
                    />
                    <span class="text-sm text-gray-800">{{ e.name }}</span>
                  </label>
                </div>
              </Transition>
            </div>
            <div
              v-if="!severityFilterInTableHeader"
              class="relative issues-column-filter-container"
            >
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors cursor-pointer"
                :class="showSeverityColumnFilter || severityColumnFilterActive
                  ? 'bg-red-500/10 text-red-500'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'"
                title="Filter by severity"
                @click.stop="toggleSeverityFilterPanel()"
              >
                <Filter :size="15" />
              </button>
              <Transition
                enter-active-class="transition ease-out duration-150"
                enter-from-class="opacity-0 scale-95 translate-y-1"
                enter-to-class="opacity-100 scale-100 translate-y-0"
                leave-active-class="transition ease-in duration-100"
                leave-from-class="opacity-100 scale-100 translate-y-0"
                leave-to-class="opacity-0 scale-95 translate-y-1"
              >
                <div
                  v-if="showSeverityColumnFilter && !severityFilterInTableHeader"
                  class="absolute right-0 top-full z-50 mt-2 w-56 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
                  @click.stop
                >
                  <div class="flex items-center justify-between border-b border-gray-100 px-3 pb-2">
                    <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Severity</span>
                    <button
                      type="button"
                      class="cursor-pointer text-[11px] text-red-500 hover:underline"
                      @click="selectAllSeverityColumnFilters"
                    >
                      All
                    </button>
                  </div>
                  <label
                    v-for="sev in ISSUE_SEVERITY_FILTER_IDS"
                    :key="sev"
                    class="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      class="rounded border-gray-300 text-red-500 focus:ring-red-500"
                      :checked="isSeverityIncludedForFilter(sev)"
                      @change="toggleSeverityColumnFilter(sev, $event)"
                    />
                    <span class="text-sm text-gray-800">{{ severityLabel(sev) }}</span>
                  </label>
                </div>
              </Transition>
            </div>
            <div
              v-if="!priorityFilterInTableHeader"
              class="relative issues-column-filter-container"
            >
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors cursor-pointer"
                :class="showPriorityColumnFilter || priorityColumnFilterActive
                  ? 'bg-red-500/10 text-red-500'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'"
                title="Filter by priority"
                @click.stop="togglePriorityFilterPanel()"
              >
                <Filter :size="15" />
              </button>
              <Transition
                enter-active-class="transition ease-out duration-150"
                enter-from-class="opacity-0 scale-95 translate-y-1"
                enter-to-class="opacity-100 scale-100 translate-y-0"
                leave-active-class="transition ease-in duration-100"
                leave-from-class="opacity-100 scale-100 translate-y-0"
                leave-to-class="opacity-0 scale-95 translate-y-1"
              >
                <div
                  v-if="showPriorityColumnFilter && !priorityFilterInTableHeader"
                  class="absolute right-0 top-full z-50 mt-2 w-56 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
                  @click.stop
                >
                  <div class="flex items-center justify-between border-b border-gray-100 px-3 pb-2">
                    <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Priority</span>
                    <button
                      type="button"
                      class="cursor-pointer text-[11px] text-red-500 hover:underline"
                      @click="selectAllPriorityColumnFilters"
                    >
                      All
                    </button>
                  </div>
                  <label
                    v-for="pri in ISSUE_PRIORITY_FILTER_IDS"
                    :key="pri"
                    class="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      class="rounded border-gray-300 text-red-500 focus:ring-red-500"
                      :checked="isPriorityIncludedForFilter(pri)"
                      @change="togglePriorityColumnFilter(pri, $event)"
                    />
                    <span class="text-sm text-gray-800">{{ priorityLabel(pri) }}</span>
                  </label>
                </div>
              </Transition>
            </div>
            <div
              v-if="!typeFilterInTableHeader"
              class="relative issues-column-filter-container"
            >
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors cursor-pointer"
                :class="showTypeColumnFilter || typeColumnFilterActive
                  ? 'bg-red-500/10 text-red-500'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'"
                title="Filter by type"
                @click.stop="toggleTypeFilterPanel()"
              >
                <Filter :size="15" />
              </button>
              <Transition
                enter-active-class="transition ease-out duration-150"
                enter-from-class="opacity-0 scale-95 translate-y-1"
                enter-to-class="opacity-100 scale-100 translate-y-0"
                leave-active-class="transition ease-in duration-100"
                leave-from-class="opacity-100 scale-100 translate-y-0"
                leave-to-class="opacity-0 scale-95 translate-y-1"
              >
                <div
                  v-if="showTypeColumnFilter && !typeFilterInTableHeader"
                  class="absolute right-0 top-full z-50 mt-2 w-56 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
                  @click.stop
                >
                  <div class="flex items-center justify-between border-b border-gray-100 px-3 pb-2">
                    <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Type</span>
                    <button
                      type="button"
                      class="cursor-pointer text-[11px] text-red-500 hover:underline"
                      @click="selectAllTypeColumnFilters"
                    >
                      All
                    </button>
                  </div>
                  <label
                    v-for="opt in ISSUE_TYPES"
                    :key="opt"
                    class="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      class="rounded border-gray-300 text-red-500 focus:ring-red-500"
                      :checked="isTypeIncludedForFilter(opt)"
                      @change="toggleTypeColumnFilter(opt, $event)"
                    />
                    <span class="text-sm text-gray-800">{{ typeLabel(opt) }}</span>
                  </label>
                </div>
              </Transition>
            </div>
          </div>

          <!-- Column Customizer -->
          <div class="relative column-customizer-container">
            <button
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              :class="showColumnCustomizer ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
              @click.stop="toggleColumnCustomizerPanel()"
              title="Customize columns"
            >
              <SlidersHorizontal :size="15" />
            </button>
            <Transition
              enter-active-class="transition ease-out duration-150"
              enter-from-class="opacity-0 scale-95 translate-y-1"
              enter-to-class="opacity-100 scale-100 translate-y-0"
              leave-active-class="transition ease-in duration-100"
              leave-from-class="opacity-100 scale-100 translate-y-0"
              leave-to-class="opacity-0 scale-95 translate-y-1"
            >
              <div
                v-if="showColumnCustomizer"
                class="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden"
                @click.stop
              >
                <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customize Columns</span>
                  <button
                    class="text-[11px] text-gray-400 hover:text-red-500 cursor-pointer flex items-center gap-1 transition-colors"
                    @click="resetColumns"
                    title="Reset to default"
                  >
                    <RotateCcw :size="11" />
                    Reset
                  </button>
                </div>
                <div class="py-1.5 max-h-[400px] overflow-y-auto">
                  <div
                    v-for="(col, idx) in columns"
                    :key="col.field"
                    draggable="true"
                    class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-all group/item select-none"
                    :class="{
                      'opacity-40': dragIndex === idx,
                      'border-t-2 border-red-500': dragOverIndex === idx && dragIndex !== null && dragIndex !== idx,
                    }"
                    @dragstart="onDragStart(idx, $event)"
                    @dragover="onDragOver(idx, $event)"
                    @dragleave="onDragLeave"
                    @drop="onDrop(idx)"
                    @dragend="onDragEnd"
                  >
                    <button
                      class="flex items-center gap-2.5 flex-1 cursor-pointer"
                      :class="col.field === 'title' ? 'opacity-60 cursor-not-allowed' : ''"
                      @click="toggleColumnVisibility(col.field)"
                    >
                      <div
                        class="w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors"
                        :class="col.visible ? 'bg-red-500 border-red-500' : 'border-gray-300 bg-white'"
                      >
                        <Check v-if="col.visible" :size="11" class="text-white" />
                      </div>
                      <span class="text-sm text-gray-700" :class="!col.visible ? 'text-gray-400' : ''">{{ col.label }}</span>
                    </button>
                    <div class="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0">
                      <GripVertical :size="14" />
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Inline Edit Toggle -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            :class="inlineEditMode
              ? 'bg-red-500/10 text-red-500'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
            @click="inlineEditMode = !inlineEditMode; editingCell = null"
            title="Inline editing"
          >
            <PencilLine :size="15" />
            <span v-if="inlineEditMode" class="text-xs">Editing</span>
          </button>

          <!-- Form Builder -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            @click="showFormBuilder = true"
            title="Form Builder"
          >
            <Columns3Cog :size="15" />
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden px-8 py-6 flex flex-col min-h-0" :class="viewMode === 'card' ? 'overflow-y-auto' : ''">
      <!-- Loading -->
      <div v-if="issuesStore.loading" class="flex items-center justify-center py-16">
        <Loader2 :size="24" class="animate-spin text-red-500" />
        <span class="ml-2 text-sm text-gray-500">Loading issues...</span>
      </div>

      <!-- TABLE VIEW -->
      <template v-else-if="viewMode === 'table'">
        <div v-if="filteredIssues.length > 0"
          class="rounded-xl min-h-0 flex-1 overflow-auto transition-all duration-200"
          :class="inlineEditMode
            ? 'bg-red-50/30 border-2 border-red-500/30 shadow-[0_0_0_1px_rgba(239,68,68,0.08)]'
            : 'bg-white border border-gray-200/80'"
        >
          <!-- Column headers -->
          <div
            class="grid items-center px-6 py-3 border-b sticky top-0 z-10 transition-colors duration-200"
            :class="inlineEditMode ? 'bg-red-50/50 border-red-500/20' : 'bg-white border-gray-200'"
            :style="{ gridTemplateColumns: gridTemplateCols, minWidth: minTableWidth + 'px' }"
          >
            <div
              v-for="(col, colIdx) in visibleColumns"
              :key="col.field"
              class="relative flex items-center pr-2 border-r border-gray-100"
            >
              <div
                class="flex min-w-0 items-center gap-0.5"
                :class="['status', 'severity', 'priority', 'type'].includes(col.field) ? 'flex-1' : ''"
              >
                <button
                  class="flex min-w-0 items-center gap-1 text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none transition-colors group/col"
                  :class="sortField === col.field ? 'text-red-500' : 'text-gray-400 hover:text-gray-600'"
                  @click="toggleSort(col.field)"
                >
                  <span class="truncate">{{ col.label }}</span>
                  <span class="flex shrink-0 flex-col -space-y-1" v-if="sortField === col.field">
                    <ArrowUp v-if="sortDirection === 'asc'" :size="12" class="text-red-500" />
                    <ArrowDown v-else :size="12" class="text-red-500" />
                  </span>
                  <span v-else class="shrink-0 opacity-0 group-hover/col:opacity-50 transition-opacity">
                    <ArrowUp :size="12" />
                  </span>
                </button>
                <div
                  v-if="col.field === 'status'"
                  class="relative shrink-0 issues-column-filter-container"
                >
                  <button
                    type="button"
                    class="rounded-md p-1 transition-colors cursor-pointer"
                    :class="showStatusColumnFilter || statusColumnFilterActive
                      ? 'bg-red-500/10 text-red-500'
                      : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'"
                    title="Filter by status"
                    @click.stop="toggleStatusFilterPanel()"
                  >
                    <Filter :size="14" />
                  </button>
                  <Transition
                    enter-active-class="transition ease-out duration-150"
                    enter-from-class="opacity-0 scale-95 translate-y-1"
                    enter-to-class="opacity-100 scale-100 translate-y-0"
                    leave-active-class="transition ease-in duration-100"
                    leave-from-class="opacity-100 scale-100 translate-y-0"
                    leave-to-class="opacity-0 scale-95 translate-y-1"
                  >
                    <div
                      v-if="showStatusColumnFilter && statusFilterInTableHeader"
                      class="absolute left-0 top-full z-50 mt-1.5 w-56 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
                      @click.stop
                    >
                      <div class="flex items-center justify-between border-b border-gray-100 px-3 pb-2">
                        <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Statuses</span>
                        <button
                          type="button"
                          class="cursor-pointer text-[11px] text-red-500 hover:underline"
                          @click="selectAllStatusColumnFilters"
                        >
                          All
                        </button>
                      </div>
                      <label
                        v-for="e in issueStatusCatalog"
                        :key="e.id"
                        class="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          class="rounded border-gray-300 text-red-500 focus:ring-red-500"
                          :checked="isStatusIncludedForFilter(e.id)"
                          @change="toggleStatusColumnFilter(e.id)"
                        />
                        <span class="text-sm text-gray-800">{{ e.name }}</span>
                      </label>
                    </div>
                  </Transition>
                </div>
                <div
                  v-if="col.field === 'severity'"
                  class="relative shrink-0 issues-column-filter-container"
                >
                  <button
                    type="button"
                    class="rounded-md p-1 transition-colors cursor-pointer"
                    :class="showSeverityColumnFilter || severityColumnFilterActive
                      ? 'bg-red-500/10 text-red-500'
                      : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'"
                    title="Filter by severity"
                    @click.stop="toggleSeverityFilterPanel()"
                  >
                    <Filter :size="14" />
                  </button>
                  <Transition
                    enter-active-class="transition ease-out duration-150"
                    enter-from-class="opacity-0 scale-95 translate-y-1"
                    enter-to-class="opacity-100 scale-100 translate-y-0"
                    leave-active-class="transition ease-in duration-100"
                    leave-from-class="opacity-100 scale-100 translate-y-0"
                    leave-to-class="opacity-0 scale-95 translate-y-1"
                  >
                    <div
                      v-if="showSeverityColumnFilter && severityFilterInTableHeader"
                      class="absolute left-0 top-full z-50 mt-1.5 w-56 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
                      @click.stop
                    >
                      <div class="flex items-center justify-between border-b border-gray-100 px-3 pb-2">
                        <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Severity</span>
                        <button
                          type="button"
                          class="cursor-pointer text-[11px] text-red-500 hover:underline"
                          @click="selectAllSeverityColumnFilters"
                        >
                          All
                        </button>
                      </div>
                      <label
                        v-for="sev in ISSUE_SEVERITY_FILTER_IDS"
                        :key="sev"
                        class="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          class="rounded border-gray-300 text-red-500 focus:ring-red-500"
                          :checked="isSeverityIncludedForFilter(sev)"
                          @change="toggleSeverityColumnFilter(sev, $event)"
                        />
                        <span class="text-sm text-gray-800">{{ severityLabel(sev) }}</span>
                      </label>
                    </div>
                  </Transition>
                </div>
                <div
                  v-if="col.field === 'priority'"
                  class="relative shrink-0 issues-column-filter-container"
                >
                  <button
                    type="button"
                    class="rounded-md p-1 transition-colors cursor-pointer"
                    :class="showPriorityColumnFilter || priorityColumnFilterActive
                      ? 'bg-red-500/10 text-red-500'
                      : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'"
                    title="Filter by priority"
                    @click.stop="togglePriorityFilterPanel()"
                  >
                    <Filter :size="14" />
                  </button>
                  <Transition
                    enter-active-class="transition ease-out duration-150"
                    enter-from-class="opacity-0 scale-95 translate-y-1"
                    enter-to-class="opacity-100 scale-100 translate-y-0"
                    leave-active-class="transition ease-in duration-100"
                    leave-from-class="opacity-100 scale-100 translate-y-0"
                    leave-to-class="opacity-0 scale-95 translate-y-1"
                  >
                    <div
                      v-if="showPriorityColumnFilter && priorityFilterInTableHeader"
                      class="absolute left-0 top-full z-50 mt-1.5 w-56 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
                      @click.stop
                    >
                      <div class="flex items-center justify-between border-b border-gray-100 px-3 pb-2">
                        <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Priority</span>
                        <button
                          type="button"
                          class="cursor-pointer text-[11px] text-red-500 hover:underline"
                          @click="selectAllPriorityColumnFilters"
                        >
                          All
                        </button>
                      </div>
                      <label
                        v-for="pri in ISSUE_PRIORITY_FILTER_IDS"
                        :key="pri"
                        class="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          class="rounded border-gray-300 text-red-500 focus:ring-red-500"
                          :checked="isPriorityIncludedForFilter(pri)"
                          @change="togglePriorityColumnFilter(pri, $event)"
                        />
                        <span class="text-sm text-gray-800">{{ priorityLabel(pri) }}</span>
                      </label>
                    </div>
                  </Transition>
                </div>
                <div
                  v-if="col.field === 'type'"
                  class="relative shrink-0 issues-column-filter-container"
                >
                  <button
                    type="button"
                    class="rounded-md p-1 transition-colors cursor-pointer"
                    :class="showTypeColumnFilter || typeColumnFilterActive
                      ? 'bg-red-500/10 text-red-500'
                      : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'"
                    title="Filter by type"
                    @click.stop="toggleTypeFilterPanel()"
                  >
                    <Filter :size="14" />
                  </button>
                  <Transition
                    enter-active-class="transition ease-out duration-150"
                    enter-from-class="opacity-0 scale-95 translate-y-1"
                    enter-to-class="opacity-100 scale-100 translate-y-0"
                    leave-active-class="transition ease-in duration-100"
                    leave-from-class="opacity-100 scale-100 translate-y-0"
                    leave-to-class="opacity-0 scale-95 translate-y-1"
                  >
                    <div
                      v-if="showTypeColumnFilter && typeFilterInTableHeader"
                      class="absolute left-0 top-full z-50 mt-1.5 w-56 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl"
                      @click.stop
                    >
                      <div class="flex items-center justify-between border-b border-gray-100 px-3 pb-2">
                        <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Type</span>
                        <button
                          type="button"
                          class="cursor-pointer text-[11px] text-red-500 hover:underline"
                          @click="selectAllTypeColumnFilters"
                        >
                          All
                        </button>
                      </div>
                      <label
                        v-for="opt in ISSUE_TYPES"
                        :key="opt"
                        class="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          class="rounded border-gray-300 text-red-500 focus:ring-red-500"
                          :checked="isTypeIncludedForFilter(opt)"
                          @change="toggleTypeColumnFilter(opt, $event)"
                        />
                        <span class="text-sm text-gray-800">{{ typeLabel(opt) }}</span>
                      </label>
                    </div>
                  </Transition>
                </div>
              </div>
              <!-- Resize handle -->
              <div
                v-if="colIdx < visibleColumns.length - 1"
                class="absolute -right-0.5 top-0 h-full w-2 cursor-col-resize z-20 group/resize flex items-center justify-center"
                @mousedown="onResizeStart(col.field, $event)"
              >
                <div class="w-px h-full transition-colors" :class="resizingCol === col.field ? 'bg-red-500' : 'bg-transparent group-hover/resize:bg-gray-300'"></div>
              </div>
            </div>
            <!-- Matches row action column so header grid column count aligns with body rows -->
            <div class="flex items-center justify-end shrink-0 min-w-0 pl-1" aria-hidden="true" />
          </div>

          <!-- Rows -->
          <div class="divide-y divide-gray-100">
            <template v-if="columnFilteredIssues.length === 0">
              <div class="px-6 py-14 text-center">
                <p class="text-sm text-gray-500">No issues match the column filters.</p>
                <button
                  type="button"
                  class="mt-2 text-xs font-medium text-red-500 hover:underline cursor-pointer"
                  @click="resetAllColumnValueFilters"
                >
                  Reset filters
                </button>
              </div>
            </template>
            <template v-else>
              <div
                v-for="issue in sortedIssues"
                :key="issue.id"
                class="grid items-center px-6 py-3.5 transition-colors cursor-pointer group"
                :class="[
                  selectedIssue?.id === issue.id
                    ? 'bg-red-500/5 hover:bg-red-500/8 border-l-2 border-l-red-500'
                    : inlineEditMode ? 'hover:bg-red-50/40 border-l-2 border-l-transparent' : 'hover:bg-gray-50/60 border-l-2 border-l-transparent',
                  issue.archived ? 'opacity-65' : '',
                ]"
                :style="{ gridTemplateColumns: gridTemplateCols, minWidth: minTableWidth + 'px' }"
                @click="inlineEditMode ? null : openIssueDetail(issue)"
              >
              <template v-for="col in visibleColumns" :key="col.field">
                <!-- Title -->
                <div v-if="col.field === 'title'" class="flex items-center gap-2.5 min-w-0 inline-edit-cell"
                  :class="inlineEditMode && !isEditing(issue.id, 'title') ? 'hover:bg-gray-100/60 rounded px-1 -mx-1 cursor-text' : ''"
                  @click="startEditing(issue.id, 'title', issue.title, $event)"
                >
                  <template v-if="isEditing(issue.id, 'title')">
                    <FavoriteStar entity-type="issue" :entity-id="issue.id" :product-id="productStore.activeProductApiRef" />
                    <Bug :size="16" class="shrink-0 text-red-500" />
                    <input
                      v-model="editValue"
                      class="inline-edit-input flex-1 text-sm font-medium text-gray-800 bg-white border border-red-500/30 rounded px-2 py-1 outline-none ring-2 ring-red-500/20 min-w-0"
                      @blur="saveInlineEdit(issue.id, 'title', editValue)"
                      @keydown.enter.prevent="saveInlineEdit(issue.id, 'title', editValue)"
                      @keydown.escape.prevent="cancelEdit()"
                      @click.stop
                    />
                  </template>
                  <template v-else>
                    <FavoriteStar entity-type="issue" :entity-id="issue.id" :product-id="productStore.activeProductApiRef" />
                    <Bug :size="16" class="shrink-0 text-red-500" />
                    <span
                      class="text-sm font-medium truncate"
                      :class="issueStoredStatusMatchesTabId(issue.status, ISSUE_STATUS_ID_CLOSED, issueStatusCatalog) ? 'text-gray-400 line-through' : issue.archived ? 'text-gray-500' : 'text-gray-800'"
                    >{{ issue.title }}</span>
                    <span
                      v-if="issue.archived"
                      class="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-600"
                    >Archived</span>
                    <ChevronRight v-if="!inlineEditMode" :size="14" class="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </template>
                </div>

                <!-- Status -->
                <div v-else-if="col.field === 'status'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startEditing(issue.id, 'status', issue.status, $event)"
                >
                  <span
                    class="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold"
                    :class="issueListStatusPillClass(issue.status, 'md')"
                    :style="issueListStatusPillStyle(issue.status)"
                  >
                    {{ statusLabel(issue.status) }}
                  </span>
                  <div v-if="isEditing(issue.id, 'status')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl z-50 py-1 min-w-[150px]"
                    @click.stop
                  >
                    <button v-for="opt in issueStatusTabs" :key="String(opt)"
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                      :class="issueStoredStatusMatchesTabId(issue.status, opt, issueStatusCatalog) ? 'bg-gray-50' : ''"
                      @click.stop="saveInlineEdit(issue.id, 'status', opt)"
                    >
                      <span
                        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                        :class="issueListStatusPillClass(opt, 'sm')"
                        :style="issueListStatusPillStyle(opt)"
                      >{{ statusLabel(opt) }}</span>
                    </button>
                  </div>
                </div>

                <!-- Severity -->
                <div v-else-if="col.field === 'severity'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startEditing(issue.id, 'severity', issue.severity, $event)"
                >
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold" :class="severityStyle(issue.severity)">
                    {{ severityLabel(issue.severity) }}
                  </span>
                  <div v-if="isEditing(issue.id, 'severity')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl z-50 py-1 min-w-[130px]"
                    @click.stop
                  >
                    <button v-for="opt in issueSeverityOptions" :key="opt"
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                      :class="issue.severity === opt ? 'bg-gray-50' : ''"
                      @click.stop="saveInlineEdit(issue.id, 'severity', opt)"
                    >
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold" :class="severityStyle(opt)">{{ severityLabel(opt) }}</span>
                    </button>
                  </div>
                </div>

                <!-- Priority -->
                <div v-else-if="col.field === 'priority'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startEditing(issue.id, 'priority', issue.priority, $event)"
                >
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold" :class="priorityStyle(issue.priority)">
                    {{ priorityLabel(issue.priority) }}
                  </span>
                  <div v-if="isEditing(issue.id, 'priority')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl z-50 py-1 min-w-[130px]"
                    @click.stop
                  >
                    <button v-for="opt in issuePriorityOptions" :key="opt"
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                      :class="issue.priority === opt ? 'bg-gray-50' : ''"
                      @click.stop="saveInlineEdit(issue.id, 'priority', opt)"
                    >
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold" :class="priorityStyle(opt)">{{ priorityLabel(opt) }}</span>
                    </button>
                  </div>
                </div>

                <!-- Type -->
                <div v-else-if="col.field === 'type'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startEditing(issue.id, 'type', issue.type || '', $event)"
                >
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium" :class="typeStyle(issue.type)">
                    <component :is="typeIcon(issue.type)" :size="12" />
                    {{ typeLabel(issue.type) }}
                  </span>
                  <div v-if="isEditing(issue.id, 'type')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl z-50 py-1 min-w-[150px]"
                    @click.stop
                  >
                    <button v-for="opt in issueTypeOptions" :key="opt"
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                      :class="issue.type === opt ? 'bg-gray-50' : ''"
                      @click.stop="saveInlineEdit(issue.id, 'type', opt)"
                    >
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium" :class="typeStyle(opt)">
                        <component :is="typeIcon(opt)" :size="12" />
                        {{ typeLabel(opt) }}
                      </span>
                    </button>
                  </div>
                </div>

                <!-- Module -->
                <div v-else-if="col.field === 'module'" class="min-w-0 inline-edit-cell"
                  :class="inlineEditMode && !isEditing(issue.id, 'module') ? 'hover:bg-gray-100/60 rounded px-1 -mx-1 cursor-text' : ''"
                  @click="startEditing(issue.id, 'module', issue.module || '', $event)"
                >
                  <input v-if="isEditing(issue.id, 'module')"
                    v-model="editValue"
                    class="inline-edit-input w-full text-sm text-gray-600 bg-white border border-red-500/30 rounded px-2 py-1 outline-none ring-2 ring-red-500/20"
                    placeholder="Module..."
                    @blur="saveInlineEdit(issue.id, 'module', editValue)"
                    @keydown.enter.prevent="saveInlineEdit(issue.id, 'module', editValue)"
                    @keydown.escape.prevent="cancelEdit()"
                    @click.stop
                  />
                  <span v-else class="text-sm text-gray-500 truncate block">{{ issue.module || '--' }}</span>
                </div>

                <!-- Assigned To -->
                <div v-else-if="col.field === 'assignedTo'" class="relative min-w-0 inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startEditing(issue.id, 'assignedTo', issue.assignedTo?.name || '', $event)"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <template v-if="issue.assignedTo">
                      <div class="w-8 h-8 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        <UploadAssetImg v-if="issue.assignedTo.avatar" :src="issue.assignedTo.avatar" class="w-8 h-8 rounded-full object-cover" />
                        <span v-else>{{ issue.assignedTo.name[0] }}</span>
                      </div>
                      <span class="text-sm text-gray-600 truncate">{{ issue.assignedTo.name }}</span>
                    </template>
                    <span v-else class="text-sm text-gray-400">--</span>
                  </div>
                  <div v-if="isEditing(issue.id, 'assignedTo')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 w-[240px] overflow-hidden"
                    @click.stop
                  >
                    <div class="p-2 border-b border-gray-100">
                      <input
                        v-model="inlineAssigneeSearch"
                        class="inline-edit-input w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                        placeholder="Search members..."
                        @click.stop
                      />
                    </div>
                    <div class="max-h-[200px] overflow-y-auto py-1">
                      <button
                        class="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 cursor-pointer"
                        @click.stop="saveAssigneeInline(issue.id, null)"
                      >
                        Unassign
                      </button>
                      <button v-for="member in filteredInlineAssignees" :key="member.id"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                        :class="issue.assignedTo?.id === member.id ? 'bg-red-500/5' : ''"
                        @click.stop="saveAssigneeInline(issue.id, member)"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                          <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-6 h-6 rounded-full object-cover" />
                          <span v-else>{{ member.name[0] }}</span>
                        </div>
                        <span class="truncate">{{ member.name }}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Reported By -->
                <div v-else-if="col.field === 'reportedBy'" class="flex items-center gap-2 min-w-0">
                  <template v-if="issue.reportedBy">
                    <div class="w-8 h-8 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      <UploadAssetImg v-if="issue.reportedBy.avatar" :src="issue.reportedBy.avatar" class="w-8 h-8 rounded-full object-cover" />
                      <span v-else>{{ issue.reportedBy.name[0] }}</span>
                    </div>
                    <span class="text-sm text-gray-600 truncate">{{ issue.reportedBy.name }}</span>
                  </template>
                  <span v-else class="text-sm text-gray-400">--</span>
                </div>

                <!-- Environment -->
                <div v-else-if="col.field === 'environment'" class="min-w-0">
                  <span class="text-sm text-gray-500 truncate block">{{ issue.environment ? statusLabel(issue.environment) : '--' }}</span>
                </div>

                <!-- App Version -->
                <div v-else-if="col.field === 'appVersion'" class="min-w-0">
                  <span class="text-sm text-gray-500 truncate block">{{ issue.appVersion || '--' }}</span>
                </div>

                <!-- Created -->
                <div v-else-if="col.field === 'createdAt'">
                  <span class="text-sm text-gray-500">{{ formatDate(issue.createdAt) }}</span>
                </div>

                <!-- Updated -->
                <div v-else-if="col.field === 'updatedAt'">
                  <span class="text-sm text-gray-500">{{ formatDate(issue.updatedAt) }}</span>
                </div>
              </template>
              <div class="flex items-center justify-end gap-0.5 shrink-0 min-w-0 pl-1">
                <button
                  v-if="activeTab === 'closed'"
                  type="button"
                  class="p-1 rounded-md hover:bg-green-50 text-gray-300 hover:text-green-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  title="Reopen issue"
                  @click.stop="reopenIssue(issue.id)"
                >
                  <RotateCw :size="14" />
                </button>
                <button
                  type="button"
                  class="p-1 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  title="Delete issue"
                  @click.stop="deleteIssue(issue.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="flex flex-col items-center justify-center py-20">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Bug :size="24" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">No issues found</p>
          <p class="text-gray-400 text-xs mb-4">Report your first bug to get started</p>
        </div>
      </template>

      <!-- CARD VIEW -->
      <template v-else-if="viewMode === 'card'">
        <div v-if="filteredIssues.length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          <template v-if="columnFilteredIssues.length === 0">
            <div
              class="col-span-full flex flex-col items-center justify-center rounded-xl border border-gray-200/80 bg-white py-16"
            >
              <p class="text-sm text-gray-500">No issues match the column filters.</p>
              <button
                type="button"
                class="mt-2 text-xs font-medium text-red-500 hover:underline cursor-pointer"
                @click="resetAllColumnValueFilters"
              >
                Reset filters
              </button>
            </div>
          </template>
          <template v-else>
            <div
              v-for="issue in sortedIssues"
              :key="issue.id"
              class="rounded-xl border transition-all duration-200 cursor-pointer group/card relative"
            :class="[
              selectedIssue?.id === issue.id
                ? 'bg-red-500/5 border-red-500/30 shadow-md ring-1 ring-red-500/10'
                : 'bg-white border-gray-200/80 hover:shadow-lg hover:border-gray-300/80',
              issue.archived ? 'opacity-65' : '',
            ]"
            @click="openIssueDetail(issue)"
          >
            <div class="p-5">
              <!-- Row 1: Bug icon + type badge + severity badge -->
              <div class="flex items-center justify-between mb-3.5">
                <div class="flex items-center gap-2">
                  <FavoriteStar entity-type="issue" :entity-id="issue.id" :product-id="productStore.activeProductApiRef" />
                  <div class="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center">
                    <Bug :size="18" class="text-red-500" />
                  </div>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium" :class="typeStyle(issue.type)">
                    <component :is="typeIcon(issue.type)" :size="10" />
                    {{ typeLabel(issue.type) }}
                  </span>
                </div>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold" :class="severityStyle(issue.severity)">
                  {{ severityLabel(issue.severity) }}
                </span>
              </div>

              <!-- Title -->
              <div class="mb-1.5 flex items-start gap-2 flex-wrap">
                <h4
                  class="text-base font-semibold line-clamp-2 leading-snug group-hover/card:text-red-500 transition-colors flex-1 min-w-0"
                  :class="issue.archived ? 'text-gray-500' : 'text-gray-900'"
                >{{ issue.title }}</h4>
                <span
                  v-if="issue.archived"
                  class="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-600"
                >Archived</span>
              </div>

              <!-- Description -->
              <p v-if="issue.description" class="text-sm text-gray-500 line-clamp-2 mb-4 leading-relaxed">{{ richTextPreviewText(issue.description) }}</p>
              <p v-else class="text-sm text-gray-400 italic mb-4">No description</p>

              <!-- Priority + Status -->
              <div class="flex items-center gap-2 mb-4">
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-semibold shrink-0"
                  :class="priorityStyle(issue.priority)"
                >
                  <span class="w-2 h-2 rounded-full shrink-0" :class="priorityDotStyle(issue.priority)"></span>
                  {{ priorityLabel(issue.priority) }}
                </span>
                <span
                  class="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold"
                  :class="issueListStatusPillClass(issue.status, 'md')"
                  :style="issueListStatusPillStyle(issue.status)"
                >
                  {{ statusLabel(issue.status) }}
                </span>
              </div>

              <!-- Footer: Reporter avatar + Date -->
              <div class="flex items-center justify-between pt-3.5 border-t border-gray-100">
                <div class="flex items-center gap-2">
                  <template v-if="issue.reportedBy">
                    <div class="w-7 h-7 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-bold">
                      <UploadAssetImg v-if="issue.reportedBy.avatar" :src="issue.reportedBy.avatar" class="w-7 h-7 rounded-full object-cover" />
                      <span v-else>{{ issue.reportedBy.name[0] }}</span>
                    </div>
                    <span class="text-xs text-gray-500 truncate">{{ issue.reportedBy.name }}</span>
                  </template>
                  <div v-else class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                    <span class="text-[10px] text-gray-400">?</span>
                  </div>
                </div>
                <span class="text-xs text-gray-400">{{ formatDate(issue.createdAt) }}</span>
              </div>
            </div>
            </div>
          </template>
        </div>

        <!-- Empty state (card) -->
        <div v-else class="flex flex-col items-center justify-center py-20">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Bug :size="24" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">No issues found</p>
          <p class="text-gray-400 text-xs mb-4">Report your first bug to get started</p>
        </div>
      </template>
    </div>

    <!-- Create Issue Dialog -->
    <CreateIssueDialog v-model:open="showCreateDialog" />

    <!-- Issue Detail Panel -->
    <IssueDetailPanel
      :issue="selectedIssue"
      :open="showIssuePanel"
      :team-members="teamMembers"
      :status-form-config="issueStatusFormConfigRaw"
      @close="closeIssuePanel"
      @updated="onIssueUpdated"
    />

    <FormBuilderDialog v-model:open="showFormBuilder" entity-type="issue" />
  </div>
</template>
