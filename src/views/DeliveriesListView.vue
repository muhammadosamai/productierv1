<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Loader2, Search, Package, PackageOpen, Circle, CheckCircle2,
  ChevronRight, Plus, LayoutList, LayoutGrid,
  ArrowUp, ArrowDown, SlidersHorizontal, Clock,
  GripVertical, Check, RotateCcw,
  CalendarDays, FileText, Users, User, Hourglass, Archive, RotateCw, X,
  PencilLine, AlertTriangle, ShieldAlert, Target,
} from 'lucide-vue-next'
import { useDeliveriesStore } from '@/stores/deliveries'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'
import type { Activity } from '@/stores/activities'
import CreateDeliveryDialog from '@/components/delivery/CreateDeliveryDialog.vue'
import DeliveryDetailPanel from '@/components/delivery/DeliveryDetailPanel.vue'
import type { Delivery, DeliveryStatus } from '@/types/delivery'
import { toast } from 'vue-sonner'
import { applyProductDeepLinkFromQuery, pickSingleQueryParam } from '@/utils/productDeepLink'
import FavoriteStar from '@/components/shared/FavoriteStar.vue'

interface TeamUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

const router = useRouter()
const route = useRoute()
const deliveriesStore = useDeliveriesStore()
const productStore = useProductStore()
const authStore = useAuthStore()
const rolesStore = useRolesStore()

const searchQuery = ref('')
const activeTab = ref<'all' | 'initialized' | 'in_progress' | 'overdue' | 'blocked' | 'completed' | 'archived'>('all')
const viewMode = ref<'table' | 'card'>(localStorage.getItem('deliveries-view-mode') as 'table' | 'card' || 'table')
const showCreateDialog = ref(false)

// Save view mode to API + localStorage
watch(viewMode, (v) => {
  localStorage.setItem('deliveries-view-mode', v)
  saveUserSetting('deliveries-view-mode', v)
})

// Detail panel state
const selectedDelivery = ref<Delivery | null>(null)
const showDetailPanel = ref(false)

// Inline editing state
const inlineEditMode = ref(false)
const editingCell = ref<{ id: string; field: string } | null>(null)
const editValue = ref('')

const deliveryStatusOptions = ['initialized', 'in_progress', 'overdue', 'blocked', 'completed', 'archived'] as const

const editableFields = new Set(['title', 'status', 'description'])

function isEditing(id: string, field: string) {
  return editingCell.value?.id === id && editingCell.value?.field === field
}

function startEditing(id: string, field: string, currentValue: string, event?: MouseEvent) {
  if (!inlineEditMode.value || !editableFields.has(field)) return
  if (event) event.stopPropagation()
  editingCell.value = { id, field }
  editValue.value = currentValue || ''
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
    await deliveriesStore.updateDelivery(id, { [field]: value })
    await onDeliveryUpdated()
  }
}

function cancelEdit() {
  editingCell.value = null
  editValue.value = ''
}

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

function openDetailPanel(delivery: Delivery) {
  selectedDelivery.value = delivery
  showDetailPanel.value = true
}

function closeDetailPanel() {
  showDetailPanel.value = false
  selectedDelivery.value = null
}

function openDeliveryFromQueryParam() {
  const deliveryId = pickSingleQueryParam(route.query.delivery)
  if (!deliveryId) return
  const delivery = deliveriesStore.deliveries.find(d => d.id === deliveryId)
  if (delivery) openDetailPanel(delivery)
}

function navigateToDelivery(id: string) {
  showDetailPanel.value = false
  router.push(`/deliveries/${id}`)
}

async function onDeliveryUpdated() {
  await deliveriesStore.fetchDeliveries()
  if (selectedDelivery.value) {
    const fresh = deliveriesStore.deliveries.find(d => d.id === selectedDelivery.value!.id)
    if (fresh) {
      selectedDelivery.value = fresh
    }
  }
}

function onDeliveryCreated(id: string) {
  showCreateDialog.value = false
  deliveriesStore.fetchDeliveries()
  const created = deliveriesStore.deliveries.find(d => d.id === id)
  if (created) openDetailPanel(created)
}

onMounted(async () => {
  await productStore.fetchProducts()
  const link = applyProductDeepLinkFromQuery(
    productStore.products,
    productStore.activeProductId,
    productStore.selectProductById,
    productStore.selectProductByName,
    route.query as Record<string, unknown>,
  )
  if (link.unknownProjectKey && productStore.products.length > 0) {
    toast.error('Unknown project key in this link. Your product selection was not changed.')
  }
  await deliveriesStore.fetchDeliveries()
  loadUserSettings()
  openDeliveryFromQueryParam()
})

watch(
  () => [pickSingleQueryParam(route.query.projectKey), pickSingleQueryParam(route.query.product)].join('|'),
  async (_v, oldVal) => {
    if (oldVal === undefined) return
    await productStore.fetchProducts()
    const link = applyProductDeepLinkFromQuery(
      productStore.products,
      productStore.activeProductId,
      productStore.selectProductById,
      productStore.selectProductByName,
      route.query as Record<string, unknown>,
    )
    if (link.unknownProjectKey && productStore.products.length > 0) {
      toast.error('Unknown project key in this link. Your product selection was not changed.')
    }
    await deliveriesStore.fetchDeliveries()
    openDeliveryFromQueryParam()
  },
)

watch(() => productStore.activeProductId, () => {
  deliveriesStore.fetchDeliveries()
})

// Watch for delivery query param changes
watch(() => route.query.delivery, () => {
  openDeliveryFromQueryParam()
})

// Status-filtered delivery groups
const deliveriesByStatus = computed(() => {
  let base = deliveriesStore.deliveries
  // Self-view-only: show only deliveries created by user
  if (rolesStore.isSelfViewOnly('deliveries') && authStore.user) {
    base = base.filter(d => d.createdByUserId === authStore.user!.id)
  }
  const all = base.filter(d => d.status !== 'archived')
  return {
    all,
    initialized: all.filter(d => d.status === 'initialized'),
    in_progress: all.filter(d => d.status === 'in_progress'),
    overdue: all.filter(d => d.status === 'overdue'),
    blocked: all.filter(d => d.status === 'blocked'),
    completed: all.filter(d => d.status === 'completed'),
    archived: base.filter(d => d.status === 'archived'),
  }
})

const filteredDeliveries = computed(() => {
  const list = deliveriesByStatus.value[activeTab.value]
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return list
  return list.filter(d =>
    d.title.toLowerCase().includes(q) ||
    (d.description && d.description.toLowerCase().includes(q))
  )
})

// Sorting
type SortField = 'title' | 'status' | 'description' | 'period' | 'progress' | 'initiatives' | 'createdBy' | 'createdAt' | 'updatedAt'
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

const statusOrder: Record<string, number> = { initialized: 0, in_progress: 1, overdue: 2, blocked: 3, completed: 4, archived: 5 }

function compareStr(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '').localeCompare(b || '')
}
function compareDate(a: string | null | undefined, b: string | null | undefined): number {
  const da = a ? new Date(a).getTime() : 0
  const db = b ? new Date(b).getTime() : 0
  return da - db
}

const sortedDeliveries = computed(() => {
  const list = [...filteredDeliveries.value]
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
        cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
        break
      case 'description':
        cmp = compareStr(a.description, b.description)
        break
      case 'period':
        cmp = compareDate(a.startDate, b.startDate)
        break
      case 'progress':
        cmp = (a.progress ?? 0) - (b.progress ?? 0)
        break
      case 'initiatives':
        cmp = compareStr(
          a.initiatives?.map(i => i.title).join(', ') || '',
          b.initiatives?.map(i => i.title).join(', ') || ''
        )
        break
      case 'createdBy':
        cmp = compareStr(a.createdByUser?.name, b.createdByUser?.name)
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
  { field: 'title', label: 'Title', width: '1fr', visible: true },
  { field: 'status', label: 'Status', width: '120px', visible: true },
  { field: 'description', label: 'Description', width: '200px', visible: false },
  { field: 'period', label: 'Period', width: '160px', visible: true },
  { field: 'progress', label: 'Progress', width: '120px', visible: true },
  { field: 'initiatives', label: 'Initiatives', width: '140px', visible: true },
  { field: 'createdBy', label: 'Created By', width: '140px', visible: true },
  { field: 'createdAt', label: 'Created', width: '100px', visible: true },
  { field: 'updatedAt', label: 'Updated', width: '100px', visible: false },
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
    const saved = localStorage.getItem('deliveries-column-config')
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
  localStorage.setItem('deliveries-column-config', JSON.stringify(v))
  saveUserSetting('deliveries-column-config', v)
}, { deep: true })

async function loadUserSettings() {
  if (!authStore.token) return
  try {
    const res = await fetch('/api/settings/', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (!res.ok) return
    const settings = await res.json()

    if (settings['deliveries-column-config']) {
      const serverCols = mergeWithDefaults(settings['deliveries-column-config'] as ColumnConfig[])
      columns.value = serverCols
      localStorage.setItem('deliveries-column-config', JSON.stringify(serverCols))
    }
    if (settings['deliveries-view-mode']) {
      viewMode.value = settings['deliveries-view-mode'] as 'table' | 'card'
      localStorage.setItem('deliveries-view-mode', settings['deliveries-view-mode'])
    }
    if (settings['deliveries-column-widths']) {
      const serverWidths = settings['deliveries-column-widths'] as Record<string, number>
      for (const [k, v] of Object.entries(serverWidths)) {
        if (typeof v === 'number' && v >= 60) columnWidths[k] = v
      }
      localStorage.setItem('deliveries-column-widths', JSON.stringify({ ...columnWidths }))
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
  localStorage.removeItem('deliveries-column-widths')
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
    const saved = localStorage.getItem('deliveries-column-widths')
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
  localStorage.setItem('deliveries-column-widths', JSON.stringify({ ...columnWidths }))
  saveUserSetting('deliveries-column-widths', { ...columnWidths })
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

// Archived tab
function toggleArchivedTab() {
  activeTab.value = activeTab.value === 'archived' ? 'all' : 'archived'
}

async function restoreDelivery(deliveryId: string) {
  await deliveriesStore.updateDelivery(deliveryId, { status: 'initialized' })
}

// ===== Activity Timeline =====
const showActivityDropdown = ref(false)
const deliveryActivities = ref<Activity[]>([])
const deliveryActivitiesLoading = ref(false)

async function fetchDeliveryActivities() {
  deliveryActivitiesLoading.value = true
  try {
    const p = productStore.activeProductScopeForApi
    const res = await fetch(`/api/activities?product=${encodeURIComponent(p)}&entityType=delivery&limit=50`)
    if (res.ok) {
      deliveryActivities.value = await res.json()
    }
  } catch (e) {
    console.error('Failed to fetch delivery activities:', e)
  } finally {
    deliveryActivitiesLoading.value = false
  }
}

function toggleActivityDropdown() {
  showActivityDropdown.value = !showActivityDropdown.value
  if (showActivityDropdown.value) {
    fetchDeliveryActivities()
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

function openDeliveryFromActivity(entityId: string | null) {
  if (!entityId) return
  showActivityDropdown.value = false
  router.push(`/deliveries/${entityId}`)
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

const groupedDeliveryActivities = computed(() => {
  const groups: { label: string; activities: Activity[] }[] = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000)
  const buckets = new Map<string, Activity[]>()
  for (const activity of deliveryActivities.value) {
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
  switch (status) {
    case 'initialized': return 'bg-[#ff69b4]/15 text-[#ff69b4] border border-[#ff69b4]/30'
    case 'in_progress': return 'bg-[#fdab3d]/15 text-[#d48806] border border-[#fdab3d]/30'
    case 'overdue': return 'bg-[#e2445c]/15 text-[#e2445c] border border-[#e2445c]/30'
    case 'blocked': return 'bg-[#a25ddc]/15 text-[#a25ddc] border border-[#a25ddc]/30'
    case 'completed': return 'bg-[#00c875]/15 text-[#00a65a] border border-[#00c875]/30'
    case 'archived': return 'bg-gray-100 text-gray-400 border border-gray-200'
    default: return 'bg-gray-100 text-gray-500 border border-gray-200'
  }
}

function statusTabColor(status: string) {
  switch (status) {
    case 'initialized': return { active: 'text-[#ff69b4] border-[#ff69b4]', badge: 'bg-[#ff69b4]/15 text-[#ff69b4]' }
    case 'in_progress': return { active: 'text-[#fdab3d] border-[#fdab3d]', badge: 'bg-[#fdab3d]/15 text-[#d48806]' }
    case 'overdue': return { active: 'text-[#e2445c] border-[#e2445c]', badge: 'bg-[#e2445c]/15 text-[#e2445c]' }
    case 'blocked': return { active: 'text-[#a25ddc] border-[#a25ddc]', badge: 'bg-[#a25ddc]/15 text-[#a25ddc]' }
    case 'completed': return { active: 'text-[#00c875] border-[#00c875]', badge: 'bg-[#00c875]/15 text-[#00a65a]' }
    case 'archived': return { active: 'text-gray-500 border-gray-400', badge: 'bg-gray-200 text-gray-500' }
    default: return { active: 'text-gray-500 border-gray-400', badge: 'bg-gray-200 text-gray-500' }
  }
}

function statusDotColor(status: string) {
  switch (status) {
    case 'initialized': return 'bg-[#ff69b4]'
    case 'in_progress': return 'bg-[#fdab3d]'
    case 'overdue': return 'bg-[#e2445c]'
    case 'blocked': return 'bg-[#a25ddc]'
    case 'completed': return 'bg-[#00c875]'
    case 'archived': return 'bg-gray-300'
    default: return 'bg-gray-400'
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function statusTextColor(status: string) {
  switch (status) {
    case 'initialized': return 'text-[#ff69b4]'
    case 'in_progress': return 'text-[#fdab3d]'
    case 'overdue': return 'text-[#e2445c]'
    case 'blocked': return 'text-[#a25ddc]'
    case 'completed': return 'text-[#00c875]'
    case 'archived': return 'text-gray-400'
    default: return 'text-gray-500'
  }
}

function parseDeliveryTitle(title: string) {
  const match = title.match(/^(#\d+)\s+(.*)$/)
  if (match) return { prefix: match[1], rest: match[2] }
  return { prefix: '', rest: title }
}

function stripHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
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

function progressPercent(delivery: Delivery) {
  if (delivery.progress !== undefined) return delivery.progress
  if (delivery.totalTasks && delivery.totalTasks > 0 && delivery.completedTasks !== undefined) {
    return Math.round((delivery.completedTasks / delivery.totalTasks) * 100)
  }
  return 0
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 pt-7 pb-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <Package :size="18" class="text-[#4857FE]" />
          </div>
          <h1 class="text-lg font-semibold text-gray-900">Deliveries <span class="text-gray-400 font-normal">({{ deliveriesStore.deliveries.length }})</span></h1>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="flex items-center gap-1.5 bg-[#4857FE] hover:bg-[#3E4BDE] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            @click="showCreateDialog = true"
          >
            <Plus :size="15" />
            Add Delivery
          </button>
        </div>
      </div>
    </div>

    <!-- Status Tabs + View Toggle -->
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
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center bg-[#4857FE]/15 text-[#4857FE]">{{ deliveriesByStatus.all.length }}</span>
          </button>
          <!-- Status tabs -->
          <button
            v-for="status in (['initialized', 'in_progress', 'overdue', 'blocked', 'completed'] as const)"
            :key="status"
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === status
              ? statusTabColor(status).active
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = status"
          >
            {{ statusLabel(status) }}
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center" :class="statusTabColor(status).badge">{{ deliveriesByStatus[status].length }}</span>
          </button>
        </div>

        <!-- Controls -->
        <div class="flex items-center gap-3">
          <!-- Archived -->
          <button
            class="flex items-center gap-1.5 p-1.5 rounded-lg transition-colors cursor-pointer"
            :class="activeTab === 'archived' ? 'bg-[#4857FE]/10 text-[#4857FE]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
            @click="toggleArchivedTab()"
            title="Archived deliveries"
          >
            <Archive :size="16" />
            <span v-if="deliveriesByStatus.archived.length > 0" class="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-gray-400 text-white leading-none">{{ deliveriesByStatus.archived.length }}</span>
          </button>

          <!-- Activity Timeline -->
          <div class="relative activity-dropdown-container">
            <button
              class="flex items-center gap-1.5 p-1.5 rounded-lg transition-colors cursor-pointer"
              :class="showActivityDropdown ? 'bg-[#4857FE]/10 text-[#4857FE]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
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
                  <button class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer" @click="fetchDeliveryActivities()">Refresh</button>
                </div>
                <div class="max-h-[480px] overflow-y-auto">
                  <div v-if="deliveryActivitiesLoading" class="flex items-center justify-center py-16">
                    <Loader2 :size="20" class="animate-spin text-gray-400" />
                  </div>
                  <div v-else-if="deliveryActivities.length === 0" class="text-center py-16 px-6">
                    <Clock :size="32" class="text-gray-200 mx-auto mb-3" />
                    <p class="text-sm text-gray-400">No activity yet</p>
                    <p class="text-xs text-gray-300 mt-1">Delivery changes will appear here</p>
                  </div>
                  <div v-else>
                    <div v-for="group in groupedDeliveryActivities" :key="group.label">
                      <div class="px-5 pt-4 pb-2">
                        <span class="text-[11px] font-bold tracking-wider text-[#4857FE]">{{ group.label }}</span>
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
                              <button class="flex items-center gap-1.5 mt-0.5 cursor-pointer text-left max-w-full group/dlv" @click="openDeliveryFromActivity(activity.entityId)">
                                <PackageOpen :size="13" class="text-[#4857FE]/60 shrink-0" />
                                <span class="text-sm font-medium text-[#4857FE] group-hover/dlv:text-[#3E4BDE] truncate">{{ activity.entityTitle }}</span>
                              </button>
                              <div class="mt-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                <div v-if="activity.action === 'created'" class="flex items-center gap-2">
                                  <span class="w-1.5 h-1.5 rounded-full bg-[#00c875] shrink-0"></span>
                                  <span class="text-xs font-medium text-gray-600">Delivery created</span>
                                </div>
                                <div v-else-if="activity.action === 'deleted'" class="flex items-center gap-2">
                                  <span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                                  <span class="text-xs font-medium text-gray-600">Delivery deleted</span>
                                </div>
                                <div v-else-if="activity.changes && activity.changes.length > 0" class="space-y-1.5">
                                  <div v-for="(change, ci) in activity.changes" :key="ci" class="flex items-center gap-2 text-xs text-gray-600">
                                    <span class="font-medium">{{ activityFormatField(change.field) }}:</span>
                                    <span v-if="change.from" class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600">{{ activityFormatField(change.from) }}</span>
                                    <span v-if="change.from && change.to" class="text-gray-300">→</span>
                                    <span v-if="change.to" class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700 text-white">{{ activityFormatField(change.to) }}</span>
                                  </div>
                                </div>
                                <div v-else class="flex items-center gap-2">
                                  <span class="w-1.5 h-1.5 rounded-full bg-[#fdab3d] shrink-0"></span>
                                  <span class="text-xs font-medium text-gray-600">Delivery updated</span>
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
          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input
              v-model="searchQuery"
              class="text-sm text-gray-700 bg-transparent outline-none w-44 placeholder-gray-400"
              placeholder="Search deliveries..."
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
                      :class="col.field === 'title' ? 'opacity-60 cursor-not-allowed' : ''"
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

          <!-- Inline Edit Toggle -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            :class="inlineEditMode
              ? 'bg-[#4857FE]/10 text-[#4857FE]'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
            @click="inlineEditMode = !inlineEditMode; editingCell = null"
            title="Inline editing"
          >
            <PencilLine :size="15" />
            <span v-if="inlineEditMode" class="text-xs">Editing</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden px-8 py-6 flex flex-col min-h-0" :class="viewMode === 'card' ? 'overflow-y-auto' : ''">
      <!-- Loading -->
      <div v-if="deliveriesStore.loading" class="flex items-center justify-center py-16">
        <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
        <span class="ml-2 text-sm text-gray-500">Loading deliveries...</span>
      </div>

      <!-- TABLE VIEW -->
      <template v-else-if="viewMode === 'table'">
        <div v-if="filteredDeliveries.length > 0"
          class="rounded-xl min-h-0 flex-1 overflow-auto transition-all duration-200"
          :class="inlineEditMode
            ? 'bg-blue-50/30 border-2 border-[#4857FE]/30 shadow-[0_0_0_1px_rgba(72,87,254,0.08)]'
            : 'bg-white border border-gray-200/80'"
        >
          <!-- Column headers -->
          <div
            class="grid items-center px-6 py-3 border-b sticky top-0 z-10 transition-colors duration-200"
            :class="inlineEditMode ? 'bg-blue-50/50 border-[#4857FE]/20' : 'bg-white border-gray-200'"
            :style="{ gridTemplateColumns: gridTemplateCols, minWidth: minTableWidth + 'px' }"
          >
            <div
              v-for="(col, colIdx) in visibleColumns"
              :key="col.field"
              class="relative flex items-center pr-2"
              :class="colIdx < visibleColumns.length - 1 ? 'border-r border-gray-100' : ''"
            >
              <button
                class="flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none transition-colors group/col"
                :class="sortField === col.field ? 'text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
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
              v-for="delivery in sortedDeliveries"
              :key="delivery.id"
              class="grid items-center px-6 py-3.5 transition-colors cursor-pointer group"
              :class="[
                selectedDelivery?.id === delivery.id
                  ? 'bg-[#4857FE]/5 hover:bg-[#4857FE]/8'
                  : inlineEditMode ? 'hover:bg-blue-50/40' : 'hover:bg-gray-50/60'
              ]"
              :style="{ gridTemplateColumns: gridTemplateCols, minWidth: minTableWidth + 'px' }"
              @click="inlineEditMode ? null : router.push(`/deliveries/${delivery.id}`)"
            >
              <template v-for="col in visibleColumns" :key="col.field">
                <!-- Title -->
                <div v-if="col.field === 'title'" class="flex items-center gap-2 min-w-0 inline-edit-cell"
                  :class="inlineEditMode && !isEditing(delivery.id, 'title') ? 'hover:bg-gray-100/60 rounded px-1 -mx-1 cursor-text' : ''"
                  @click="startEditing(delivery.id, 'title', delivery.title, $event)"
                >
                  <FavoriteStar entity-type="delivery" :entity-id="delivery.id" :product-id="productStore.activeProductScopeForApi" />
                  <template v-if="isEditing(delivery.id, 'title')">
                    <input
                      v-model="editValue"
                      class="inline-edit-input flex-1 text-sm font-medium text-gray-800 bg-white border border-[#4857FE]/30 rounded px-2 py-1 outline-none ring-2 ring-[#4857FE]/20 min-w-0"
                      @blur="saveInlineEdit(delivery.id, 'title', editValue)"
                      @keydown.enter.prevent="saveInlineEdit(delivery.id, 'title', editValue)"
                      @keydown.escape.prevent="cancelEdit()"
                      @click.stop
                    />
                  </template>
                  <template v-else>
                    <div class="min-w-0">
                      <span class="text-sm truncate block" :class="(delivery.status === 'completed' || delivery.status === 'archived') ? 'text-gray-400 line-through' : 'text-gray-800'">
                        <span v-if="parseDeliveryTitle(delivery.title).prefix" class="font-medium" :class="statusTextColor(delivery.status)">{{ parseDeliveryTitle(delivery.title).prefix }}</span>
                        <span v-if="parseDeliveryTitle(delivery.title).prefix"> - </span>
                        <span class="font-medium">{{ parseDeliveryTitle(delivery.title).rest }}</span>
                      </span>
                      <span v-if="delivery.description" class="text-xs text-gray-400 truncate block">{{ stripHtml(delivery.description) }}</span>
                    </div>
                    <ChevronRight v-if="!inlineEditMode" :size="14" class="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </template>
                </div>

                <!-- Status -->
                <div v-else-if="col.field === 'status'" class="relative inline-edit-cell"
                  :class="inlineEditMode ? 'cursor-pointer' : ''"
                  @click="startEditing(delivery.id, 'status', delivery.status, $event)"
                >
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold" :class="statusStyle(delivery.status)">
                    <span class="w-1.5 h-1.5 rounded-full" :class="statusDotColor(delivery.status)"></span>
                    {{ statusLabel(delivery.status) }}
                  </span>
                  <div v-if="isEditing(delivery.id, 'status')"
                    class="inline-edit-dropdown absolute top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl z-50 py-1 min-w-[160px]"
                    @click.stop
                  >
                    <button v-for="opt in deliveryStatusOptions" :key="opt"
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                      :class="delivery.status === opt ? 'bg-gray-50' : ''"
                      @click.stop="saveInlineEdit(delivery.id, 'status', opt)"
                    >
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold" :class="statusStyle(opt)">
                        <span class="w-1.5 h-1.5 rounded-full" :class="statusDotColor(opt)"></span>
                        {{ statusLabel(opt) }}
                      </span>
                    </button>
                  </div>
                </div>

                <!-- Description -->
                <div v-else-if="col.field === 'description'" class="min-w-0 inline-edit-cell"
                  :class="inlineEditMode && !isEditing(delivery.id, 'description') ? 'hover:bg-gray-100/60 rounded px-1 -mx-1 cursor-text' : ''"
                  @click="startEditing(delivery.id, 'description', delivery.description || '', $event)"
                >
                  <input v-if="isEditing(delivery.id, 'description')"
                    v-model="editValue"
                    class="inline-edit-input w-full text-sm text-gray-600 bg-white border border-[#4857FE]/30 rounded px-2 py-1 outline-none ring-2 ring-[#4857FE]/20"
                    placeholder="Description..."
                    @blur="saveInlineEdit(delivery.id, 'description', editValue)"
                    @keydown.enter.prevent="saveInlineEdit(delivery.id, 'description', editValue)"
                    @keydown.escape.prevent="cancelEdit()"
                    @click.stop
                  />
                  <span v-else class="text-sm text-gray-500 truncate block">{{ delivery.description ? stripHtml(delivery.description) : '—' }}</span>
                </div>

                <!-- Period -->
                <div v-else-if="col.field === 'period'" class="flex items-center gap-1.5 text-sm text-gray-500">
                  <CalendarDays :size="13" class="text-gray-400 shrink-0" />
                  <span class="truncate">{{ formatPeriod(delivery.startDate, delivery.endDate) }}</span>
                </div>

                <!-- Progress -->
                <div v-else-if="col.field === 'progress'" class="flex items-center gap-2">
                  <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="progressPercent(delivery) === 100 ? 'bg-[#00c875]' : 'bg-[#4857FE]'"
                      :style="{ width: progressPercent(delivery) + '%' }"
                    ></div>
                  </div>
                  <span class="text-[11px] text-gray-400 font-medium whitespace-nowrap">{{ delivery.completedTasks || 0 }}/{{ delivery.totalTasks || 0 }}</span>
                </div>

                <!-- Initiatives -->
                <div v-else-if="col.field === 'initiatives'" class="min-w-0">
                  <span v-if="delivery.initiatives && delivery.initiatives.length > 0" class="text-sm text-gray-500 truncate block">
                    {{ delivery.initiatives.map(i => i.title).join(', ') }}
                  </span>
                  <span v-else class="text-sm text-gray-400">—</span>
                </div>

                <!-- Created By -->
                <div v-else-if="col.field === 'createdBy'" class="flex items-center gap-2 min-w-0">
                  <template v-if="delivery.createdByUser">
                    <div class="w-7 h-7 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                      <UploadAssetImg v-if="delivery.createdByUser.avatar" :src="delivery.createdByUser.avatar" class="w-7 h-7 rounded-full object-cover" />
                      <span v-else>{{ delivery.createdByUser.name[0] }}</span>
                    </div>
                    <span class="text-sm text-gray-600 truncate">{{ delivery.createdByUser.name }}</span>
                  </template>
                  <span v-else class="text-sm text-gray-400">—</span>
                </div>

                <!-- Created -->
                <div v-else-if="col.field === 'createdAt'">
                  <span class="text-sm text-gray-500">{{ formatDate(delivery.createdAt) }}</span>
                </div>

                <!-- Updated -->
                <div v-else-if="col.field === 'updatedAt'">
                  <span class="text-sm text-gray-500">{{ formatDate(delivery.updatedAt) }}</span>
                </div>
              </template>
              <!-- Restore button for archived -->
              <button
                v-if="activeTab === 'archived'"
                class="ml-auto p-1 rounded-md hover:bg-green-50 text-gray-300 hover:text-green-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                title="Restore delivery"
                @click.stop="restoreDelivery(delivery.id)"
              >
                <RotateCw :size="14" />
              </button>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="flex flex-col items-center justify-center py-20">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <PackageOpen :size="24" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">No deliveries found</p>
          <p class="text-gray-400 text-xs mb-4">Create your first delivery to get started</p>
        </div>
      </template>

      <!-- CARD VIEW -->
      <template v-else-if="viewMode === 'card'">
        <div v-if="filteredDeliveries.length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          <div
            v-for="delivery in sortedDeliveries"
            :key="delivery.id"
            class="rounded-xl border transition-all duration-200 cursor-pointer group/card relative"
            :class="selectedDelivery?.id === delivery.id
              ? 'bg-[#4857FE]/5 border-[#4857FE]/30 shadow-md ring-1 ring-[#4857FE]/10'
              : 'bg-white border-gray-200/80 hover:shadow-lg hover:border-gray-300/80'"
            @click="router.push(`/deliveries/${delivery.id}`)"
          >
            <div class="p-5">
              <!-- Row 1: Status bar + status badge -->
              <div class="flex items-center justify-between mb-3.5">
                <div class="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
                  <Package :size="18" class="text-gray-400" />
                </div>
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold" :class="statusStyle(delivery.status)">
                  <span class="w-1.5 h-1.5 rounded-full" :class="statusDotColor(delivery.status)"></span>
                  {{ statusLabel(delivery.status) }}
                </span>
              </div>

              <!-- Title -->
              <div class="mb-1.5 flex items-start gap-2">
                <FavoriteStar entity-type="delivery" :entity-id="delivery.id" :product-id="productStore.activeProductScopeForApi" />
                <h4 class="text-base leading-snug line-clamp-2 group-hover/card:text-[#4857FE] transition-colors">
                  <span v-if="parseDeliveryTitle(delivery.title).prefix" class="font-medium" :class="statusTextColor(delivery.status)">{{ parseDeliveryTitle(delivery.title).prefix }}</span>
                  <span v-if="parseDeliveryTitle(delivery.title).prefix"> - </span>
                  <span class="font-semibold text-gray-900">{{ parseDeliveryTitle(delivery.title).rest }}</span>
                </h4>
              </div>

              <!-- Description -->
              <p v-if="delivery.description" class="text-sm text-gray-500 line-clamp-2 mb-4 leading-relaxed">{{ stripHtml(delivery.description) }}</p>
              <p v-else class="text-sm text-gray-400 italic mb-4">No description</p>

              <!-- Period + Progress -->
              <div class="flex items-center gap-2 mb-4">
                <div class="flex items-center gap-1 text-sm text-gray-500 flex-1 min-w-0">
                  <CalendarDays :size="13" class="text-gray-400 shrink-0" />
                  <span class="truncate">{{ formatPeriod(delivery.startDate, delivery.endDate) }}</span>
                </div>
                <span class="text-xs text-gray-500 font-medium shrink-0">{{ progressPercent(delivery) }}%</span>
              </div>

              <!-- Progress bar -->
              <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
                <div
                  class="h-full rounded-full transition-all"
                  :class="progressPercent(delivery) === 100 ? 'bg-[#00c875]' : 'bg-[#4857FE]'"
                  :style="{ width: progressPercent(delivery) + '%' }"
                ></div>
              </div>

              <!-- Footer: Created by + Tasks + Date -->
              <div class="flex items-center justify-between pt-3.5 border-t border-gray-100">
                <div class="flex items-center gap-2">
                  <template v-if="delivery.createdByUser">
                    <div class="w-7 h-7 rounded-full overflow-hidden bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-bold">
                      <UploadAssetImg v-if="delivery.createdByUser.avatar" :src="delivery.createdByUser.avatar" class="w-7 h-7 rounded-full object-cover" />
                      <span v-else>{{ delivery.createdByUser.name[0] }}</span>
                    </div>
                  </template>
                  <div v-else class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                    <span class="text-[10px] text-gray-400">?</span>
                  </div>
                  <span class="text-xs text-gray-500 font-medium">{{ delivery.completedTasks || 0 }}/{{ delivery.totalTasks || 0 }} tasks</span>
                </div>
                <span class="text-xs text-gray-400">{{ formatDate(delivery.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state (card) -->
        <div v-else class="flex flex-col items-center justify-center py-20">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <PackageOpen :size="24" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">No deliveries found</p>
          <p class="text-gray-400 text-xs mb-4">Create your first delivery to get started</p>
        </div>
      </template>
    </div>

    <!-- Create Delivery Dialog -->
    <CreateDeliveryDialog
      v-model:open="showCreateDialog"
      @created="onDeliveryCreated"
    />

    <!-- Detail Panel -->
    <DeliveryDetailPanel
      :delivery="selectedDelivery"
      :open="showDetailPanel"
      @close="closeDetailPanel"
      @updated="onDeliveryUpdated"
      @navigate="navigateToDelivery"
    />
  </div>
</template>
