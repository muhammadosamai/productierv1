<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {
  Loader2, Search, Users, Mail, Shield,
  ChevronRight, LayoutList, LayoutGrid,
  ArrowUp, ArrowDown, SlidersHorizontal,
  GripVertical, Check, RotateCcw,
  CalendarDays, ListChecks, CheckCircle2, User, Plus,
} from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'vue-sonner'
import { applyProductDeepLinkFromQuery } from '@/utils/productDeepLink'
import TeamMemberDetailPanel from '@/components/team/TeamMemberDetailPanel.vue'
import InviteMemberDialog from '@/components/team/InviteMemberDialog.vue'

interface TeamUser {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  createdAt?: string
  tasksAssigned?: number
  tasksCompleted?: number
}

const route = useRoute()
const productStore = useProductStore()
const authStore = useAuthStore()

const teamMembers = ref<TeamUser[]>([])
const pendingInvites = ref<{ id: string; email: string; role: string; status: string; createdAt: string }[]>([])
const loading = ref(false)
const searchQuery = ref('')
const activeTab = ref<'all' | 'admin' | 'product_manager' | 'business_analyst' | 'developer' | 'viewer' | 'invited'>('all')
const viewMode = ref<'table' | 'card'>(localStorage.getItem('team-view-mode') as 'table' | 'card' || 'table')
const showInviteDialog = ref(false)

// Save view mode to API + localStorage
watch(viewMode, (v) => {
  localStorage.setItem('team-view-mode', v)
  saveUserSetting('team-view-mode', v)
})

// Detail panel state
const selectedMember = ref<TeamUser | null>(null)
const showDetailPanel = ref(false)

function openDetailPanel(member: TeamUser) {
  selectedMember.value = member
  showDetailPanel.value = true
}

function closeDetailPanel() {
  showDetailPanel.value = false
  selectedMember.value = null
}

async function fetchTeamMembers() {
  loading.value = true
  try {
    const productName = productStore.activeProductScopeForApi
    if (!productName) {
      teamMembers.value = []
      return
    }

    const res = await fetch(`/api/products/${encodeURIComponent(productName)}/members`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const members: any[] = await res.json()
      teamMembers.value = members.map(m => ({
        id: m.userId,
        name: m.userName,
        email: m.userEmail,
        role: m.role,
        avatar: m.userAvatar,
        createdAt: m.addedAt,
      }))
    }

    // Also fetch pending invites
    const inviteRes = await fetch(`/api/invites/product/${encodeURIComponent(productName)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (inviteRes.ok) {
      pendingInvites.value = await inviteRes.json()
    }
  } catch {
    teamMembers.value = []
  } finally {
    loading.value = false
  }
}

function onInvited() {
  fetchTeamMembers()
}

async function revokeInvite(inviteId: string) {
  try {
    const res = await fetch(`/api/invites/${inviteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      pendingInvites.value = pendingInvites.value.filter(i => i.id !== inviteId)
      if (pendingInvites.value.length === 0 && activeTab.value === 'invited') {
        activeTab.value = 'all'
      }
    }
  } catch {
    // ignore
  }
}

onMounted(async () => {
  await fetchTeamMembers()
  loadUserSettings()
  // Auto-open member from query param
  const memberId = route.query.member as string | undefined
  if (memberId) {
    const member = teamMembers.value.find(m => m.id === memberId)
    if (member) openDetailPanel(member)
  }
})

// Watch for member query param changes (e.g. sidebar click)
watch(() => route.query.member, (memberId) => {
  if (memberId) {
    const member = teamMembers.value.find(m => m.id === memberId as string)
    if (member) openDetailPanel(member)
  }
})

watch(() => productStore.activeProductId, () => {
  fetchTeamMembers()
})

/** Deep-link: `projectKey` or legacy `product` (exact product name), e.g. /team?product=Name */
function applyProductFromQuery() {
  const r = applyProductDeepLinkFromQuery(
    productStore.products,
    productStore.activeProductId,
    productStore.selectProductById,
    productStore.selectProductByName,
    route.query as Record<string, unknown>,
  )
  if (r.unknownProjectKey && productStore.products.length > 0) {
    toast.error('Unknown project key in this link. Your product selection was not changed.')
  }
}

watch(
  () => [route.query.product, route.query.projectKey, productStore.products.map(p => `${p.name}::${p.projectKey ?? ''}`).join('|')] as const,
  () => applyProductFromQuery(),
  { immediate: true },
)

// Role-filtered member groups
const membersByRole = computed(() => {
  const all = teamMembers.value
  return {
    all,
    admin: all.filter(m => m.role === 'super_admin' || m.role === 'admin'),
    product_manager: all.filter(m => m.role === 'product_admin' || m.role === 'product_manager'),
    business_analyst: all.filter(m => m.role === 'business_analyst'),
    developer: all.filter(m => m.role === 'developer'),
    viewer: all.filter(m => m.role === 'viewer'),
  }
})

const filteredMembers = computed(() => {
  const list = activeTab.value === 'invited'
    ? ([] as TeamUser[])
    : membersByRole.value[activeTab.value as keyof typeof membersByRole.value]
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return list
  return list.filter((m: TeamUser) =>
    m.name.toLowerCase().includes(q) ||
    m.email.toLowerCase().includes(q) ||
    m.role.toLowerCase().includes(q)
  )
})

// Sorting
type SortField = 'name' | 'email' | 'role' | 'createdAt' | 'tasksAssigned' | 'status'
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

const roleOrder: Record<string, number> = { super_admin: 0, admin: 1, product_admin: 2, product_manager: 3, business_analyst: 4, developer: 5, viewer: 6, member: 7 }

/** Product-scoped roles (matches invites / API). */
const productRoleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'product_manager', label: 'Product Manager' },
  { value: 'business_analyst', label: 'Business Analyst' },
  { value: 'developer', label: 'Developer' },
  { value: 'viewer', label: 'Viewer' },
] as const

function roleOptionsForMember(member: TeamUser): { value: string; label: string }[] {
  const base = productRoleOptions.map(r => ({ value: r.value, label: r.label }))
  if (!base.some(r => r.value === member.role)) {
    return [{ value: member.role, label: roleLabel(member.role) }, ...base]
  }
  return base
}

const roleUpdatingId = ref<string | null>(null)
const roleUpdateError = ref('')

function canChangeRoleFor(member: TeamUser): boolean {
  const u = authStore.user
  if (!u || !authStore.token) return false
  if (u.role === 'super_admin') return true
  const self = teamMembers.value.find(m => m.id === u.id)
  if (self?.role !== 'admin') return false
  return member.id !== u.id
}

async function onMemberRoleChange(member: TeamUser, newRole: string) {
  if (member.role === newRole) return
  const productName = productStore.activeProductScopeForApi
  if (!productName) return
  roleUpdateError.value = ''
  roleUpdatingId.value = member.id
  try {
    const res = await fetch(
      `/api/products/${encodeURIComponent(productName)}/members/${encodeURIComponent(member.id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({ role: newRole }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      roleUpdateError.value = (data as { error?: string }).error || 'Failed to update role'
      return
    }
    const newRoleVal = (data as { role?: string }).role
    if (!newRoleVal) return
    const idx = teamMembers.value.findIndex(m => m.id === member.id)
    if (idx !== -1) {
      const cur = teamMembers.value[idx]!
      teamMembers.value[idx] = { ...cur, role: newRoleVal }
    }
    if (selectedMember.value?.id === member.id) {
      const sm = selectedMember.value
      selectedMember.value = { ...sm, role: newRoleVal }
    }
  } catch {
    roleUpdateError.value = 'Network error'
  } finally {
    roleUpdatingId.value = null
  }
}

function compareStr(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '').localeCompare(b || '')
}
function compareDate(a: string | null | undefined, b: string | null | undefined): number {
  const da = a ? new Date(a).getTime() : 0
  const db = b ? new Date(b).getTime() : 0
  return da - db
}

const sortedMembers = computed(() => {
  const list = [...filteredMembers.value]
  if (!sortField.value) return list

  const field = sortField.value
  const dir = sortDirection.value === 'asc' ? 1 : -1

  list.sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'email':
        cmp = a.email.localeCompare(b.email)
        break
      case 'role':
        cmp = (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99)
        break
      case 'createdAt':
        cmp = compareDate(a.createdAt, b.createdAt)
        break
      case 'tasksAssigned':
        cmp = (a.tasksAssigned ?? 0) - (b.tasksAssigned ?? 0)
        break
      case 'status':
        cmp = compareStr(memberStatus(a), memberStatus(b))
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
  { field: 'name', label: 'Member', width: '1fr', visible: true },
  { field: 'email', label: 'Email', width: '220px', visible: true },
  { field: 'role', label: 'Role', width: '160px', visible: true },
  { field: 'createdAt', label: 'Joined', width: '120px', visible: true },
  { field: 'tasksAssigned', label: 'Tasks', width: '120px', visible: true },
  { field: 'status', label: 'Status', width: '100px', visible: true },
]

function mergeWithDefaults(saved: ColumnConfig[]): ColumnConfig[] {
  const knownFields = new Set(saved.map(c => c.field))
  const merged = [...saved]
  for (const def of defaultColumns) {
    if (!knownFields.has(def.field)) merged.push({ ...def })
  }
  return merged
}

function loadColumnConfig(): ColumnConfig[] {
  try {
    const saved = localStorage.getItem('team-column-config')
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
  localStorage.setItem('team-column-config', JSON.stringify(v))
  saveUserSetting('team-column-config', v)
}, { deep: true })

async function loadUserSettings() {
  if (!authStore.token) return
  try {
    const res = await fetch('/api/settings/', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (!res.ok) return
    const settings = await res.json()

    if (settings['team-column-config']) {
      const serverCols = mergeWithDefaults(settings['team-column-config'] as ColumnConfig[])
      columns.value = serverCols
      localStorage.setItem('team-column-config', JSON.stringify(serverCols))
    }
    if (settings['team-view-mode']) {
      viewMode.value = settings['team-view-mode'] as 'table' | 'card'
      localStorage.setItem('team-view-mode', settings['team-view-mode'])
    }
    if (settings['team-column-widths']) {
      const serverWidths = settings['team-column-widths'] as Record<string, number>
      for (const [k, v] of Object.entries(serverWidths)) {
        if (typeof v === 'number' && v >= 60) columnWidths[k] = v
      }
      localStorage.setItem('team-column-widths', JSON.stringify({ ...columnWidths }))
    }
  } catch { /* fall back to localStorage */ }
}

const visibleColumns = computed(() => columns.value.filter(c => c.visible))

const gridTemplateCols = computed(() =>
  visibleColumns.value.map(c => (columnWidths[c.field] || parseDefaultWidth(c.width)) + 'px').join(' ')
)

const minTableWidth = computed(() => {
  let total = 48
  for (const col of visibleColumns.value) {
    total += columnWidths[col.field] || parseDefaultWidth(col.width)
  }
  return total
})

function toggleColumnVisibility(field: SortField) {
  const col = columns.value.find(c => c.field === field)
  if (!col) return
  if (field === 'name') return
  const visibleCount = columns.value.filter(c => c.visible).length
  if (col.visible && visibleCount <= 2) return
  col.visible = !col.visible
}

function resetColumns() {
  columns.value = defaultColumns.map(c => ({ ...c }))
  for (const col of defaultColumns) {
    columnWidths[col.field] = parseDefaultWidth(col.width)
  }
  localStorage.removeItem('team-column-widths')
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
    const saved = localStorage.getItem('team-column-widths')
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, number>
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && v >= 60) widths[k] = v
      }
    }
  } catch { /* ignore */ }
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
  localStorage.setItem('team-column-widths', JSON.stringify({ ...columnWidths }))
  saveUserSetting('team-column-widths', { ...columnWidths })
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
  if (!moved) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
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

// ===== Styling =====
function roleStyle(role: string) {
  switch (role) {
    case 'super_admin':
    case 'admin': return 'bg-red-100 text-red-700 border border-red-200'
    case 'product_admin':
    case 'product_manager': return 'bg-purple-100 text-purple-700 border border-purple-200'
    case 'business_analyst': return 'bg-blue-100 text-blue-700 border border-blue-200'
    case 'developer': return 'bg-green-100 text-green-700 border border-green-200'
    case 'viewer':
    case 'member': return 'bg-gray-100 text-gray-600 border border-gray-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
}

function roleTabColor(role: string) {
  switch (role) {
    case 'admin': return { active: 'text-red-600 border-red-500', badge: 'bg-red-100 text-red-700' }
    case 'product_manager': return { active: 'text-purple-600 border-purple-500', badge: 'bg-purple-100 text-purple-700' }
    case 'business_analyst': return { active: 'text-blue-600 border-blue-500', badge: 'bg-blue-100 text-blue-700' }
    case 'developer': return { active: 'text-green-600 border-green-500', badge: 'bg-green-100 text-green-700' }
    case 'viewer': return { active: 'text-gray-500 border-gray-400', badge: 'bg-gray-200 text-gray-600' }
    default: return { active: 'text-gray-500 border-gray-400', badge: 'bg-gray-200 text-gray-500' }
  }
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function roleTabLabel(role: string) {
  switch (role) {
    case 'admin': return 'Admin'
    case 'product_manager': return 'Product Manager'
    case 'business_analyst': return 'Business Analyst'
    case 'developer': return 'Developer'
    case 'viewer': return 'Viewer'
    default: return roleLabel(role)
  }
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function memberStatus(member: TeamUser) {
  // Simple heuristic: if they have tasks assigned, they're active
  return (member.tasksAssigned && member.tasksAssigned > 0) ? 'active' : 'idle'
}

function statusBadgeStyle(status: string) {
  return status === 'active'
    ? 'bg-green-100 text-green-700 border border-green-200'
    : 'bg-gray-100 text-gray-500 border border-gray-200'
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 pt-7 pb-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <Users :size="18" class="text-[#4857FE]" />
          </div>
          <h1 class="text-lg font-semibold text-gray-900">Team <span class="text-gray-400 font-normal">({{ teamMembers.length }})</span></h1>
        </div>
        <button
          class="flex items-center gap-1.5 bg-[#4857FE] hover:bg-[#3E4BDE] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
          @click="showInviteDialog = true"
        >
          <Plus :size="16" />
          Invite Member
        </button>
      </div>
      <p v-if="roleUpdateError" class="mt-3 text-sm text-red-600">{{ roleUpdateError }}</p>
    </div>

    <!-- Role Tabs + View Toggle -->
    <div class="bg-white px-8 pt-4 pb-3 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1">
          <!-- All -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'all'
              ? 'text-[#4857FE] border-[#4857FE]'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'all'"
          >
            All
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#4857FE]/15 text-[#4857FE]">{{ membersByRole.all.length }}</span>
          </button>
          <!-- Role tabs -->
          <button
            v-for="role in (['admin', 'product_manager', 'business_analyst', 'developer', 'viewer'] as const)"
            :key="role"
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === role
              ? roleTabColor(role).active
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = role"
          >
            {{ roleTabLabel(role) }}
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center" :class="roleTabColor(role).badge">{{ membersByRole[role].length }}</span>
          </button>
          <!-- Invited tab -->
          <button
            v-if="pendingInvites.length > 0"
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'invited'
              ? 'text-amber-600 border-amber-500'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'invited'"
          >
            Invited
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-amber-100 text-amber-700">{{ pendingInvites.length }}</span>
          </button>
        </div>

        <!-- Controls -->
        <div class="flex items-center gap-3">
          <!-- Search -->
          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input
              v-model="searchQuery"
              class="text-sm text-gray-700 bg-transparent outline-none w-44 placeholder-gray-400"
              placeholder="Search members..."
            />
          </div>

          <!-- View Toggle -->
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

          <!-- Column Customizer -->
          <div class="relative column-customizer-container">
            <button
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              :class="showColumnCustomizer ? 'bg-[#4857FE]/10 text-[#4857FE]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
              @click.stop="showColumnCustomizer = !showColumnCustomizer"
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
                    class="text-[11px] text-gray-400 hover:text-[#4857FE] cursor-pointer flex items-center gap-1 transition-colors"
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
                      'border-t-2 border-[#4857FE]': dragOverIndex === idx && dragIndex !== null && dragIndex !== idx,
                    }"
                    @dragstart="onDragStart(idx, $event)"
                    @dragover="onDragOver(idx, $event)"
                    @dragleave="onDragLeave"
                    @drop="onDrop(idx)"
                    @dragend="onDragEnd"
                  >
                    <button
                      class="flex items-center gap-2.5 flex-1 cursor-pointer"
                      :class="col.field === 'name' ? 'opacity-60 cursor-not-allowed' : ''"
                      @click="toggleColumnVisibility(col.field)"
                    >
                      <div
                        class="w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors"
                        :class="col.visible ? 'bg-[#4857FE] border-[#4857FE]' : 'border-gray-300 bg-white'"
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
        </div>
      </div>
    </div>

    <!-- Invited Tab Content -->
    <div v-if="activeTab === 'invited'" class="flex-1 overflow-auto px-8 py-6">
      <div class="bg-white rounded-xl border border-gray-200/80 overflow-hidden max-w-3xl">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50/50">
              <th class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Email</th>
              <th class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Role</th>
              <th class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Invited</th>
              <th class="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="invite in pendingInvites" :key="invite.id" class="border-b border-gray-50 hover:bg-gray-50/50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <Mail :size="14" class="text-gray-400" />
                  <span class="text-sm text-gray-900">{{ invite.email }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {{ invite.role }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(invite.createdAt) }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  class="text-xs text-red-500 hover:text-red-700 font-medium"
                  @click="revokeInvite(invite.id)"
                >
                  Revoke
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Content -->
    <div v-else class="flex-1 overflow-hidden px-8 py-6 flex flex-col min-h-0" :class="viewMode === 'card' ? 'overflow-y-auto' : ''">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-16">
        <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
        <span class="ml-2 text-sm text-gray-500">Loading team members...</span>
      </div>

      <!-- TABLE VIEW -->
      <template v-else-if="viewMode === 'table'">
        <div v-if="filteredMembers.length > 0"
          class="rounded-xl min-h-0 flex-1 overflow-auto bg-white border border-gray-200/80"
        >
          <!-- Column headers -->
          <div
            class="grid items-center px-6 py-3 border-b sticky top-0 z-10 bg-gray-50/80 border-gray-200"
            :style="{ gridTemplateColumns: gridTemplateCols, minWidth: minTableWidth + 'px' }"
          >
            <div
              v-for="(col, colIdx) in visibleColumns"
              :key="col.field"
              class="relative"
            >
              <button
                class="flex items-center gap-1 text-[11px] font-medium text-gray-400 tracking-wide uppercase cursor-pointer hover:text-gray-600 transition-colors group/col"
                @click="toggleSort(col.field)"
              >
                {{ col.label }}
                <span class="flex flex-col -space-y-1" v-if="sortField === col.field">
                  <ArrowUp v-if="sortDirection === 'asc'" :size="12" class="text-[#4857FE]" />
                  <ArrowDown v-else :size="12" class="text-[#4857FE]" />
                </span>
                <span v-else class="opacity-0 group-hover/col:opacity-50 transition-opacity">
                  <ArrowUp :size="12" />
                </span>
              </button>
              <!-- Resize handle -->
              <div
                v-if="colIdx < visibleColumns.length - 1"
                class="absolute -right-0.5 top-0 h-full w-2 cursor-col-resize z-20 group/resize flex items-center justify-center"
                @mousedown="onResizeStart(col.field, $event)"
              >
                <div class="w-px h-full transition-colors" :class="resizingCol === col.field ? 'bg-[#4857FE]' : 'bg-transparent group-hover/resize:bg-gray-300'"></div>
              </div>
            </div>
          </div>

          <!-- Rows -->
          <div class="divide-y divide-gray-100">
            <div
              v-for="member in sortedMembers"
              :key="member.id"
              class="grid items-center px-6 py-3.5 transition-colors cursor-pointer group"
              :class="[
                selectedMember?.id === member.id
                  ? 'bg-[#4857FE]/5 hover:bg-[#4857FE]/8'
                  : 'hover:bg-gray-50/60'
              ]"
              :style="{ gridTemplateColumns: gridTemplateCols, minWidth: minTableWidth + 'px' }"
              @click="openDetailPanel(member)"
            >
              <template v-for="col in visibleColumns" :key="col.field">
                <!-- Member (name + avatar) -->
                <div v-if="col.field === 'name'" class="flex items-center gap-3 min-w-0">
                  <div class="w-8 h-8 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-8 h-8 rounded-full object-cover" />
                    <span v-else>{{ getInitials(member.name) }}</span>
                  </div>
                  <span class="text-sm font-medium text-gray-800 truncate">{{ member.name }}</span>
                  <ChevronRight :size="14" class="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>

                <!-- Email -->
                <div v-else-if="col.field === 'email'" class="flex items-center gap-1.5 min-w-0">
                  <Mail :size="13" class="text-gray-400 shrink-0" />
                  <span class="text-sm text-gray-500 truncate">{{ member.email }}</span>
                </div>

                <!-- Role -->
                <div v-else-if="col.field === 'role'" @click.stop>
                  <div v-if="canChangeRoleFor(member)" class="flex items-center gap-2 min-w-0">
                    <select
                      :value="member.role"
                      :disabled="roleUpdatingId === member.id"
                      class="max-w-full rounded-md border border-gray-200 bg-white py-1 pl-2 pr-6 text-[11px] font-semibold text-gray-800 shadow-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#4857FE] focus:border-[#4857FE] disabled:opacity-60 [field-sizing:content] w-auto min-w-0"
                      @change="onMemberRoleChange(member, ($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="r in roleOptionsForMember(member)" :key="r.value" :value="r.value">
                        {{ r.label }}
                      </option>
                    </select>
                    <Loader2 v-if="roleUpdatingId === member.id" :size="14" class="animate-spin text-[#4857FE] shrink-0" />
                  </div>
                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold"
                    :class="roleStyle(member.role)"
                  >
                    <Shield :size="10" />
                    {{ roleLabel(member.role) }}
                  </span>
                </div>

                <!-- Joined -->
                <div v-else-if="col.field === 'createdAt'" class="flex items-center gap-1.5">
                  <CalendarDays :size="13" class="text-gray-400 shrink-0" />
                  <span class="text-sm text-gray-500">{{ formatDate(member.createdAt) }}</span>
                </div>

                <!-- Tasks Assigned -->
                <div v-else-if="col.field === 'tasksAssigned'" class="flex items-center gap-2">
                  <div class="flex items-center gap-1.5">
                    <ListChecks :size="13" class="text-gray-400 shrink-0" />
                    <span class="text-sm font-medium text-gray-700">{{ member.tasksAssigned ?? 0 }}</span>
                  </div>
                  <span v-if="member.tasksCompleted" class="text-xs text-gray-400">
                    ({{ member.tasksCompleted }} done)
                  </span>
                </div>

                <!-- Status -->
                <div v-else-if="col.field === 'status'">
                  <span
                    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                    :class="statusBadgeStyle(memberStatus(member))"
                  >
                    <span class="w-1.5 h-1.5 rounded-full" :class="memberStatus(member) === 'active' ? 'bg-green-500' : 'bg-gray-400'"></span>
                    {{ memberStatus(member) === 'active' ? 'Active' : 'Idle' }}
                  </span>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="flex flex-col items-center justify-center py-20">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Users :size="24" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">No team members found</p>
          <p class="text-gray-400 text-xs">Try adjusting your search or filter</p>
        </div>
      </template>

      <!-- CARD VIEW -->
      <template v-else-if="viewMode === 'card'">
        <div v-if="filteredMembers.length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          <div
            v-for="member in sortedMembers"
            :key="member.id"
            class="rounded-xl border transition-all duration-200 cursor-pointer group/card relative"
            :class="selectedMember?.id === member.id
              ? 'bg-[#4857FE]/5 border-[#4857FE]/30 shadow-md ring-1 ring-[#4857FE]/10'
              : 'bg-white border-gray-200/80 hover:shadow-lg hover:border-gray-300/80'"
            @click="openDetailPanel(member)"
          >
            <div class="p-5">
              <!-- Row 1: Avatar + Role badge -->
              <div class="flex items-center justify-between mb-4 gap-2">
                <div class="w-12 h-12 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-lg font-bold shrink-0">
                  <UploadAssetImg v-if="member.avatar" :src="member.avatar" class="w-12 h-12 rounded-full object-cover" />
                  <span v-else>{{ getInitials(member.name) }}</span>
                </div>
                <div v-if="canChangeRoleFor(member)" class="flex items-center gap-1.5 shrink-0" @click.stop>
                  <select
                    :value="member.role"
                    :disabled="roleUpdatingId === member.id"
                    class="max-w-full rounded-md border border-gray-200 bg-white py-1 pl-2 pr-5 text-[10px] font-semibold text-gray-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#4857FE] disabled:opacity-60 [field-sizing:content] w-auto min-w-0"
                    @change="onMemberRoleChange(member, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="r in roleOptionsForMember(member)" :key="r.value" :value="r.value">
                      {{ r.label }}
                    </option>
                  </select>
                  <Loader2 v-if="roleUpdatingId === member.id" :size="12" class="animate-spin text-[#4857FE]" />
                </div>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold shrink-0"
                  :class="roleStyle(member.role)"
                >
                  <Shield :size="10" />
                  {{ roleLabel(member.role) }}
                </span>
              </div>

              <!-- Name -->
              <h4 class="text-base font-semibold text-gray-900 mb-1 group-hover/card:text-[#4857FE] transition-colors">{{ member.name }}</h4>

              <!-- Email -->
              <div class="flex items-center gap-1.5 mb-4">
                <Mail :size="13" class="text-gray-400 shrink-0" />
                <span class="text-sm text-gray-500 truncate">{{ member.email }}</span>
              </div>

              <!-- Stats row -->
              <div class="flex items-center gap-4 pt-3 border-t border-gray-100">
                <!-- Tasks -->
                <div class="flex items-center gap-1.5">
                  <ListChecks :size="13" class="text-gray-400" />
                  <span class="text-sm font-medium text-gray-700">{{ member.tasksAssigned ?? 0 }} tasks</span>
                </div>

                <div class="w-px h-4 bg-gray-200"></div>

                <!-- Status -->
                <span
                  class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                  :class="statusBadgeStyle(memberStatus(member))"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="memberStatus(member) === 'active' ? 'bg-green-500' : 'bg-gray-400'"></span>
                  {{ memberStatus(member) === 'active' ? 'Active' : 'Idle' }}
                </span>
              </div>

              <!-- Joined -->
              <div class="flex items-center gap-1.5 mt-3 text-xs text-gray-400">
                <CalendarDays :size="12" />
                Joined {{ formatDate(member.createdAt) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state (card) -->
        <div v-else class="flex flex-col items-center justify-center py-20">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Users :size="24" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">No team members found</p>
          <p class="text-gray-400 text-xs">Try adjusting your search or filter</p>
        </div>
      </template>
    </div>

    <!-- Detail Panel -->
    <TeamMemberDetailPanel
      :member="selectedMember"
      :open="showDetailPanel"
      @close="closeDetailPanel"
    />

    <!-- Invite Dialog -->
    <InviteMemberDialog
      v-model:open="showInviteDialog"
      @invited="onInvited"
    />
  </div>
</template>
