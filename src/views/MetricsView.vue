<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useOrganizationMembers } from '@/composables/useOrganizationMembers'
import { useDashboardPages } from '@/composables/useDashboardPages'
import { organizationTeamsApi } from '@/lib/apiClient'
import { STORAGE_KEYS } from '@/constants/storageKeys'
import { storageGet, storageSet } from '@/lib/browserStorage'
import type {
  DashboardTemplate,
  DashboardTemplateApplyMode,
  DashboardTemplateVisibility,
  DashboardVisibility,
  DashboardWidget,
} from '@/types/dashboard'
import DashboardPageTabs from '@/components/dashboard/DashboardPageTabs.vue'
import DashboardWidgetPalette, { type DashboardWidgetCatalogEntry } from '@/components/dashboard/DashboardWidgetPalette.vue'
import DashboardWidgetGrid from '@/components/dashboard/DashboardWidgetGrid.vue'
import DashboardShareModal from '@/components/dashboard/DashboardShareModal.vue'
import DashboardTemplateLibraryModal from '@/components/dashboard/DashboardTemplateLibraryModal.vue'
import DashboardSaveTemplateModal from '@/components/dashboard/DashboardSaveTemplateModal.vue'
import DashboardApplyTemplateModal from '@/components/dashboard/DashboardApplyTemplateModal.vue'
import DashboardPageEditorModal from '@/components/dashboard/DashboardPageEditorModal.vue'
import DashboardConfirmModal from '@/components/dashboard/DashboardConfirmModal.vue'

import ProductTab from '@/components/metrics/ProductTab.vue'
import OverviewTab from '@/components/metrics/OverviewTab.vue'
import ThroughputTab from '@/components/metrics/ThroughputTab.vue'
import FlowTab from '@/components/metrics/FlowTab.vue'
import QualityTab from '@/components/metrics/QualityTab.vue'
import BlockersTab from '@/components/metrics/BlockersTab.vue'
import PredictabilityTab from '@/components/metrics/PredictabilityTab.vue'
import WorkloadTab from '@/components/metrics/WorkloadTab.vue'
import DeliveriesTab from '@/components/metrics/DeliveriesTab.vue'
import ProductFeedSummaryWidget from '@/components/metrics/widgets/ProductFeedSummaryWidget.vue'
import ProductFeedActivitiesWidget from '@/components/metrics/widgets/ProductFeedActivitiesWidget.vue'
import ProductFeedTeamMembersWidget from '@/components/metrics/widgets/ProductFeedTeamMembersWidget.vue'

const productStore = useProductStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const organizationMembers = useOrganizationMembers()
const envFlags = import.meta.env as Record<string, string | undefined>
const dashboardTemplatesEnabled = String(
  envFlags.VITE_DASHBOARD_TEMPLATES_ENABLED
  ?? envFlags.VITE_dashboard_templates_enabled
  ?? envFlags.DASHBOARD_TEMPLATES_ENABLED
  ?? envFlags.dashboard_templates_enabled
  ?? 'true',
).toLowerCase() !== 'false'

type MetricsScopeMode = 'product' | 'all' | 'team'
const METRICS_PERIOD_OPTIONS = new Set([7, 30, 90, 180, 365])

function normalizeMetricsScopeMode(value: unknown): MetricsScopeMode | null {
  if (value === 'product' || value === 'all' || value === 'team') return value
  return null
}

function normalizeMetricsPeriod(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return null
  return METRICS_PERIOD_OPTIONS.has(parsed) ? parsed : null
}

const periodOptions = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last year' },
]
const period = ref<number>(
  normalizeMetricsPeriod(route.query.period)
  ?? normalizeMetricsPeriod(storageGet(STORAGE_KEYS.views.metrics.period))
  ?? 30,
)

provide('metricsProduct', () => productStore.activeProduct?.id || '')
provide('metricsPeriod', period)
const scopeMode = ref<MetricsScopeMode>(
  normalizeMetricsScopeMode(route.query.scope)
  ?? normalizeMetricsScopeMode(storageGet(STORAGE_KEYS.views.metrics.scopeMode))
  ?? 'product',
)
const selectedTeamId = ref<string>(
  (typeof route.query.teamId === 'string' ? route.query.teamId.trim() : '')
  || storageGet(STORAGE_KEYS.views.metrics.scopeTeamId)
  || '',
)
const metricTeams = ref<Array<{ id: string; name: string }>>([])
const metricTeamsError = ref<string | null>(null)
const activeProductId = computed(() => productStore.activeProduct?.id || '')
provide('metricsScopeMode', scopeMode)
provide('metricsTeamId', selectedTeamId)
provide('metricsProductId', activeProductId)

function syncMetricsQuery() {
  const currentScope = typeof route.query.scope === 'string' ? route.query.scope : ''
  const currentTeamId = typeof route.query.teamId === 'string' ? route.query.teamId : ''
  const currentPeriod = typeof route.query.period === 'string' ? route.query.period : ''

  const nextScope = scopeMode.value === 'product' ? '' : scopeMode.value
  const nextTeamId = scopeMode.value === 'team' ? selectedTeamId.value : ''
  const nextPeriod = period.value === 30 ? '' : String(period.value)

  if (currentScope === nextScope && currentTeamId === nextTeamId && currentPeriod === nextPeriod) {
    return
  }

  const nextQuery = { ...route.query }
  if (nextScope) nextQuery.scope = nextScope
  else delete nextQuery.scope

  if (nextTeamId) nextQuery.teamId = nextTeamId
  else delete nextQuery.teamId

  if (nextPeriod) nextQuery.period = nextPeriod
  else delete nextQuery.period

  router.replace({ query: nextQuery })
}

const widgetCatalog: DashboardWidgetCatalogEntry[] = [
  { type: 'product_feed_summary', label: 'Feed Summary', description: 'Stories, initiatives, and completion overview', defaultGridW: 2, defaultGridH: 1 },
  { type: 'product_feed_activities', label: 'Activities', description: 'Recent product changes and activity timeline', defaultGridW: 2, defaultGridH: 2 },
  { type: 'product_feed_team_members', label: 'Team Members', description: 'Team roster and membership actions', defaultGridW: 1, defaultGridH: 2 },
  { type: 'metrics_tasks_dashboard', label: 'Tasks Dashboard', description: 'Task KPI and dashboard overview', defaultGridW: 2, defaultGridH: 2 },
  { type: 'metrics_throughput', label: 'Throughput', description: 'Completion velocity and trend lines', defaultGridW: 2, defaultGridH: 2 },
  { type: 'metrics_flow', label: 'Flow', description: 'Flow efficiency and bottlenecks', defaultGridW: 2, defaultGridH: 2 },
  { type: 'metrics_quality', label: 'Quality', description: 'Quality indicators and defect trends', defaultGridW: 2, defaultGridH: 2 },
  { type: 'metrics_blockers', label: 'Blockers', description: 'Blocked work and blockers heatmap', defaultGridW: 2, defaultGridH: 2 },
  { type: 'metrics_predictability', label: 'Predictability', description: 'Delivery predictability and confidence', defaultGridW: 2, defaultGridH: 2 },
  { type: 'metrics_workload', label: 'Workload', description: 'Team workload distribution', defaultGridW: 2, defaultGridH: 2 },
  { type: 'metrics_deliveries', label: 'Deliveries', description: 'Delivery pipeline and release outcomes', defaultGridW: 2, defaultGridH: 2 },
]

const widgetRenderers = {
  product_feed: ProductTab,
  product_feed_summary: ProductFeedSummaryWidget,
  product_feed_activities: ProductFeedActivitiesWidget,
  product_feed_team_members: ProductFeedTeamMembersWidget,
  metrics_tasks_dashboard: OverviewTab,
  metrics_throughput: ThroughputTab,
  metrics_flow: FlowTab,
  metrics_quality: QualityTab,
  metrics_blockers: BlockersTab,
  metrics_predictability: PredictabilityTab,
  metrics_workload: WorkloadTab,
  metrics_deliveries: DeliveriesTab,
}

const dashboard = useDashboardPages({
  scopeType: computed(() => 'product' as const),
  productId: computed(() => productStore.activeProduct?.id || null),
  organizationId: computed(() => productStore.activeProduct?.organizationId || null),
  token: computed(() => authStore.token),
})

const shareOpen = ref(false)
const shareTargetPageId = ref<string | null>(null)
const shareUsers = ref<Array<{ id: string; name: string; email?: string }>>([])
const templateLibraryOpen = ref(false)
const saveTemplateOpen = ref(false)
const applyTemplateOpen = ref(false)
const templateToApply = ref<DashboardTemplate | null>(null)
const pageEditorOpen = ref(false)
const pageEditorMode = ref<'create' | 'rename'>('create')
const pageEditorInitialName = ref('')
const pageEditorInitialVisibility = ref<DashboardVisibility>('personal')
const pageEditorTargetId = ref<string | null>(null)
const pageDeleteTarget = ref<{ id: string; name: string } | null>(null)
const templateDeleteTarget = ref<DashboardTemplate | null>(null)
const isEditMode = ref(false)
const editModePageId = ref<string | null>(null)
const editModeError = ref<string | null>(null)
const editModeSaving = ref(false)
const draftWidgets = ref<DashboardWidget[]>([])

const activePage = computed(() => dashboard.activePage.value)
const shareTargetPage = computed(() => {
  if (!shareTargetPageId.value) return null
  return dashboard.pages.value.find((page) => page.id === shareTargetPageId.value) || null
})
const activePageEditable = computed(() => Boolean(activePage.value?.canEdit && !activePage.value?.isSystem))
const canReorderPages = computed(() =>
  !isEditMode.value
  && dashboard.pages.value.length > 1
  && dashboard.pages.value.every((page) => page.canEdit),
)
const metricsBusy = computed(() => Boolean(dashboard.saving.value || editModeSaving.value))
const visibleWidgets = computed<DashboardWidget[] | null>(() => {
  if (!activePage.value) return null
  return isEditMode.value ? draftWidgets.value : activePage.value.widgets
})

function clampGridSize(value: number | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(2, Math.max(1, parsed))
}

function cloneWidget(widget: DashboardWidget): DashboardWidget {
  return {
    ...widget,
    configJson: { ...(widget.configJson || {}) },
  }
}

function relayoutWidgets(widgets: DashboardWidget[]): DashboardWidget[] {
  const leftColumnHeight = 0
  const rightColumnHeight = 1
  const columnHeights = [0, 0]
  return widgets.map((widget, index) => {
    const gridW = clampGridSize(widget.gridW, 1)
    const gridH = clampGridSize(widget.gridH, 1)

    let gridX = 0
    let gridY = 0
    if (gridW === 2) {
      gridY = Math.max(columnHeights[leftColumnHeight]!, columnHeights[rightColumnHeight]!)
      columnHeights[leftColumnHeight] = gridY + gridH
      columnHeights[rightColumnHeight] = gridY + gridH
    } else {
      gridX = columnHeights[leftColumnHeight]! <= columnHeights[rightColumnHeight]!
        ? leftColumnHeight
        : rightColumnHeight
      gridY = columnHeights[gridX]!
      columnHeights[gridX] = gridY + gridH
    }

    return {
      ...cloneWidget(widget),
      sortOrder: index,
      gridW,
      gridH,
      gridX,
      gridY,
    }
  })
}

function isDraftWidgetId(widgetId: string): boolean {
  return widgetId.startsWith('draft-widget:')
}

function startEditMode() {
  const page = activePage.value
  if (!page || !activePageEditable.value) return
  isEditMode.value = true
  editModePageId.value = page.id
  editModeError.value = null
  draftWidgets.value = relayoutWidgets(
    [...page.widgets]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(cloneWidget),
  )
}

function cancelEditMode() {
  isEditMode.value = false
  editModePageId.value = null
  draftWidgets.value = []
  editModeError.value = null
}

function resolveWidgetProps(widget: DashboardWidget): Record<string, unknown> {
  if (
    widget.widgetType === 'product_feed'
    || widget.widgetType === 'product_feed_summary'
    || widget.widgetType === 'product_feed_activities'
    || widget.widgetType === 'product_feed_team_members'
  ) {
    return {}
  }
  return { period: period.value }
}

function openCreatePageEditor() {
  pageEditorMode.value = 'create'
  pageEditorInitialName.value = ''
  pageEditorInitialVisibility.value = 'personal'
  pageEditorTargetId.value = null
  pageEditorOpen.value = true
}

function onRenamePage(pageId: string) {
  const page = dashboard.pages.value.find((entry) => entry.id === pageId)
  if (!page || page.isSystem || !page.canEdit) return
  pageEditorMode.value = 'rename'
  pageEditorInitialName.value = page.name
  pageEditorInitialVisibility.value = page.visibility
  pageEditorTargetId.value = page.id
  pageEditorOpen.value = true
}

function onDeletePage(pageId: string) {
  const page = dashboard.pages.value.find((entry) => entry.id === pageId)
  if (!page || page.isSystem || !page.canEdit) return
  pageDeleteTarget.value = { id: page.id, name: page.name }
}

async function onConfirmDeletePage() {
  if (!pageDeleteTarget.value) return
  const success = await dashboard.deletePage(pageDeleteTarget.value.id)
  if (!success) return
  pageDeleteTarget.value = null
}

async function onPageEditorSave(payload: { name: string; visibility?: DashboardVisibility }) {
  if (pageEditorMode.value === 'create') {
    const success = await dashboard.createPage({
      name: payload.name,
      visibility: payload.visibility || 'personal',
    })
    if (success) pageEditorOpen.value = false
    return
  }

  if (!pageEditorTargetId.value) return
  const success = await dashboard.updatePage(pageEditorTargetId.value, { name: payload.name })
  if (success) {
    pageEditorOpen.value = false
    pageEditorTargetId.value = null
  }
}

function openShare(pageId: string) {
  const page = dashboard.pages.value.find((entry) => entry.id === pageId)
  if (!page || !page.canEdit) return
  shareTargetPageId.value = page.id
  shareOpen.value = true
}

async function saveShare(payload: {
  visibility: 'personal' | 'team' | 'invited'
  viewerUserIds: string[]
  viewers: Array<{ userId: string; role: 'viewer' | 'editor' }>
}) {
  const page = shareTargetPage.value
  if (!page) return
  const updated = await dashboard.updatePage(page.id, { visibility: payload.visibility }, { reload: false })
  if (!updated) return
  if (payload.visibility === 'invited') {
    const viewersUpdated = await dashboard.updateViewers(page.id, payload.viewers, { reload: false })
    if (!viewersUpdated) return
  }
  await dashboard.loadPages()
  shareOpen.value = false
  shareTargetPageId.value = null
}

function onAddWidget(payload: { widgetType: string; widgetTitle?: string; gridW?: number; gridH?: number }) {
  const page = activePage.value
  if (!page || !activePageEditable.value || !isEditMode.value) return

  const draftWidget: DashboardWidget = {
    id: `draft-widget:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    pageId: page.id,
    widgetType: payload.widgetType,
    widgetTitle: payload.widgetTitle || null,
    configJson: {},
    gridX: 0,
    gridY: 0,
    gridW: clampGridSize(payload.gridW, 1),
    gridH: clampGridSize(payload.gridH, 1),
    sortOrder: draftWidgets.value.length,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  draftWidgets.value = relayoutWidgets([...draftWidgets.value, draftWidget])
}

function onUpdateWidget(payload: { widgetId: string; gridW?: number; gridH?: number }) {
  if (!activePageEditable.value || !isEditMode.value) return
  draftWidgets.value = relayoutWidgets(
    draftWidgets.value.map((widget) => {
      if (widget.id !== payload.widgetId) return widget
      return {
        ...widget,
        gridW: clampGridSize(payload.gridW, widget.gridW),
        gridH: clampGridSize(payload.gridH, widget.gridH),
      }
    }),
  )
}

function onRemoveWidget(widgetId: string) {
  if (!activePageEditable.value || !isEditMode.value) return
  draftWidgets.value = relayoutWidgets(
    draftWidgets.value.filter((widget) => widget.id !== widgetId),
  )
}

function onReorderWidgets(payload: { widgetIds: string[] }) {
  if (!activePageEditable.value || !isEditMode.value) return
  const orderMap = new Map(payload.widgetIds.map((widgetId, index) => [widgetId, index]))
  draftWidgets.value = relayoutWidgets(
    [...draftWidgets.value].sort((left, right) => {
      const leftOrder = orderMap.get(left.id)
      const rightOrder = orderMap.get(right.id)
      if (leftOrder === undefined && rightOrder === undefined) return left.sortOrder - right.sortOrder
      if (leftOrder === undefined) return 1
      if (rightOrder === undefined) return -1
      return leftOrder - rightOrder
    }),
  )
}

function widgetChanged(
  current: DashboardWidget,
  baseline: DashboardWidget | undefined,
): boolean {
  if (!baseline) return true
  if (current.widgetTitle !== baseline.widgetTitle) return true
  if (current.gridX !== baseline.gridX) return true
  if (current.gridY !== baseline.gridY) return true
  if (current.gridW !== baseline.gridW) return true
  if (current.gridH !== baseline.gridH) return true
  if (current.sortOrder !== baseline.sortOrder) return true
  return JSON.stringify(current.configJson || {}) !== JSON.stringify(baseline.configJson || {})
}

async function saveEditMode() {
  const page = activePage.value
  if (!page || !activePageEditable.value || !isEditMode.value) return
  if (editModePageId.value !== page.id) {
    editModeError.value = 'Editing session no longer matches the selected page.'
    cancelEditMode()
    return
  }

  editModeSaving.value = true
  editModeError.value = null
  const normalizedDraft = relayoutWidgets(draftWidgets.value.map(cloneWidget))
  const baselineWidgets = [...page.widgets]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(cloneWidget)
  const baselineMap = new Map(baselineWidgets.map((widget) => [widget.id, widget]))

  const removedWidgetIds = baselineWidgets
    .filter((widget) => !normalizedDraft.some((draftWidget) => draftWidget.id === widget.id))
    .map((widget) => widget.id)
  const existingDraftWidgets = normalizedDraft.filter((widget) => !isDraftWidgetId(widget.id))
  const newDraftWidgets = normalizedDraft.filter((widget) => isDraftWidgetId(widget.id))

  const fail = async () => {
    await dashboard.loadPages()
    editModeError.value = dashboard.error.value || 'Unable to save dashboard layout.'
    editModeSaving.value = false
  }

  for (const widgetId of removedWidgetIds) {
    const removed = await dashboard.deleteWidget(page.id, widgetId, { reload: false })
    if (!removed) {
      await fail()
      return
    }
  }

  for (const widget of existingDraftWidgets) {
    if (!widgetChanged(widget, baselineMap.get(widget.id))) continue
    const updated = await dashboard.updateWidget(page.id, widget.id, {
      widgetTitle: widget.widgetTitle || undefined,
      configJson: widget.configJson || {},
      gridX: widget.gridX,
      gridY: widget.gridY,
      gridW: widget.gridW,
      gridH: widget.gridH,
      sortOrder: widget.sortOrder,
    }, { reload: false })
    if (!updated) {
      await fail()
      return
    }
  }

  for (const widget of newDraftWidgets) {
    const created = await dashboard.addWidget(page.id, {
      widgetType: widget.widgetType,
      widgetTitle: widget.widgetTitle || undefined,
      configJson: widget.configJson || {},
      gridX: widget.gridX,
      gridY: widget.gridY,
      gridW: widget.gridW,
      gridH: widget.gridH,
      sortOrder: widget.sortOrder,
    }, { reload: false })
    if (!created) {
      await fail()
      return
    }
  }

  await dashboard.loadPages()
  editModeSaving.value = false
  cancelEditMode()
}

function openTemplateLibrary() {
  if (!dashboardTemplatesEnabled) return
  templateLibraryOpen.value = true
}

function openSaveTemplateModal() {
  if (!dashboardTemplatesEnabled) return
  saveTemplateOpen.value = true
}

async function onSaveTemplate(payload: {
  name: string
  description?: string
  visibility: DashboardTemplateVisibility
  pageIds: string[]
}) {
  const success = await dashboard.saveTemplate(payload)
  if (!success) return
  saveTemplateOpen.value = false
}

function onRequestTemplateApply(templateId: string) {
  const template = dashboard.templates.value.find((entry) => entry.id === templateId)
  if (!template) return
  templateToApply.value = template
  applyTemplateOpen.value = true
}

async function onConfirmTemplateApply(mode: DashboardTemplateApplyMode) {
  const template = templateToApply.value
  if (!template) return
  const success = await dashboard.applyTemplate(template.id, mode)
  if (!success) return
  applyTemplateOpen.value = false
  templateLibraryOpen.value = false
  templateToApply.value = null
}

async function onDeleteTemplate(templateId: string) {
  const template = dashboard.templates.value.find((entry) => entry.id === templateId)
  if (!template || !template.canDelete) return
  templateDeleteTarget.value = template
}

async function onConfirmDeleteTemplate() {
  if (!templateDeleteTarget.value) return
  const success = await dashboard.deleteTemplate(templateDeleteTarget.value.id)
  if (!success) return
  templateDeleteTarget.value = null
}

async function onMovePage(pageId: string, direction: 'left' | 'right') {
  if (isEditMode.value) return
  if (!canReorderPages.value) return
  const orderedIds = dashboard.pages.value.map((page) => page.id)
  const index = orderedIds.indexOf(pageId)
  if (index < 0) return

  const targetIndex = direction === 'left' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= orderedIds.length) return

  const [moved] = orderedIds.splice(index, 1)
  if (!moved) return
  orderedIds.splice(targetIndex, 0, moved)
  await dashboard.reorderPages(orderedIds)
}

async function loadShareUsers() {
  if (shareUsers.value.length > 0) return
  try {
    await organizationMembers.loadMembers('')
    shareUsers.value = organizationMembers.members.value.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
    }))
  } catch {
    shareUsers.value = []
  }
}

async function loadMetricTeams() {
  const organizationId = productStore.activeProduct?.organizationId || ''
  metricTeamsError.value = null
  if (!organizationId || !authStore.token) {
    metricTeams.value = []
    return
  }
  try {
    const rows = await organizationTeamsApi.list(organizationId, {}, authStore.token)
    metricTeams.value = rows.map((team) => ({ id: team.id, name: team.name }))
    if (selectedTeamId.value && !metricTeams.value.some((team) => team.id === selectedTeamId.value)) {
      selectedTeamId.value = ''
      if (scopeMode.value === 'team') {
        scopeMode.value = 'product'
      }
    }
  } catch {
    metricTeams.value = []
    metricTeamsError.value = 'Unable to load team options for metrics scope.'
  }
}

watch(scopeMode, (mode) => {
  storageSet(STORAGE_KEYS.views.metrics.scopeMode, mode)
  if (mode !== 'team') {
    selectedTeamId.value = ''
  }
  syncMetricsQuery()
})

watch(selectedTeamId, (teamId) => {
  if (teamId) {
    storageSet(STORAGE_KEYS.views.metrics.scopeTeamId, teamId)
  } else {
    storageSet(STORAGE_KEYS.views.metrics.scopeTeamId, '')
  }
  syncMetricsQuery()
})

watch(period, (nextPeriod) => {
  storageSet(STORAGE_KEYS.views.metrics.period, String(nextPeriod))
  syncMetricsQuery()
})

watch(() => [productStore.activeProduct?.organizationId, authStore.token], () => {
  loadMetricTeams()
})

watch(() => activePage.value?.id, (nextPageId, previousPageId) => {
  if (isEditMode.value && nextPageId !== previousPageId) {
    cancelEditMode()
  }
})

watch(activePageEditable, (editable) => {
  if (!editable && isEditMode.value) {
    cancelEditMode()
  }
})

watch(shareOpen, (open) => {
  if (!open) {
    shareTargetPageId.value = null
  }
})

onMounted(() => {
  loadShareUsers()
  loadMetricTeams()
  syncMetricsQuery()
})
</script>

<template>
  <div class="flex h-full flex-col bg-[#FAFBFD]">
    <div class="border-b border-gray-100 bg-white px-4 py-4 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4857FE]/10">
            <LayoutDashboard :size="18" class="text-[#4857FE]" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-gray-900">Dashboard Metrics</h1>
            <p class="mt-0.5 text-sm text-gray-400">{{ productStore.activeProduct.name }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="scopeMode"
            class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 focus:border-[#4857FE] focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20"
          >
            <option value="product">Product scope</option>
            <option value="all">All product data</option>
            <option value="team">Specific team</option>
          </select>
          <select
            v-if="scopeMode === 'team'"
            v-model="selectedTeamId"
            class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 focus:border-[#4857FE] focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20"
          >
            <option value="">Select team</option>
            <option v-for="team in metricTeams" :key="team.id" :value="team.id">{{ team.name }}</option>
          </select>
          <select
            v-model="period"
            class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 focus:border-[#4857FE] focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20"
          >
            <option v-for="option in periodOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
      </div>
      <p
        v-if="scopeMode === 'team' && metricTeamsError"
        class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
      >
        {{ metricTeamsError }}
      </p>
    </div>

    <DashboardPageTabs
      :pages="dashboard.pages.value"
      :active-page-id="dashboard.activePageId.value"
      :templates-enabled="dashboardTemplatesEnabled"
      :allow-reorder="canReorderPages"
      :busy="metricsBusy"
      @select-page="dashboard.selectPage"
      @open-templates="openTemplateLibrary"
      @save-template="openSaveTemplateModal"
      @create-page="openCreatePageEditor"
      @rename-page="onRenamePage"
      @share-page="openShare"
      @delete-page="onDeletePage"
      @move-page-left="onMovePage($event, 'left')"
      @move-page-right="onMovePage($event, 'right')"
    />

    <div class="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-6 lg:p-8">
      <p v-if="dashboard.error.value" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
        {{ dashboard.error.value }}
      </p>

      <div v-if="activePageEditable" class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2">
        <p class="text-xs text-gray-500">
          {{ isEditMode ? 'Edit mode is on. Drag widgets, resize, add, or remove before saving.' : 'View mode is on. Enter edit mode to change layout.' }}
        </p>
        <div class="flex items-center gap-2">
          <button
            v-if="!isEditMode"
            type="button"
            class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-[#4857FE]/40 hover:text-[#4857FE]"
            :disabled="metricsBusy"
            @click="startEditMode"
          >
            Edit layout
          </button>
          <template v-else>
            <button
              type="button"
              class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
              :disabled="metricsBusy"
              @click="cancelEditMode"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-[#4857FE] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3f4de5] disabled:opacity-60"
              :disabled="metricsBusy"
              @click="saveEditMode"
            >
              Save layout
            </button>
          </template>
        </div>
      </div>

      <p v-if="editModeError" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
        {{ editModeError }}
      </p>

      <DashboardWidgetPalette
        v-if="activePageEditable && isEditMode"
        :items="widgetCatalog"
        :busy="metricsBusy"
        @add-widget="onAddWidget"
      />

      <DashboardWidgetGrid
        :page="activePage"
        :widgets="visibleWidgets"
        :renderers="widgetRenderers"
        :editable="activePageEditable && isEditMode"
        :allow-drag="activePageEditable && isEditMode"
        :busy="metricsBusy"
        :resolve-widget-props="resolveWidgetProps"
        @update-widget="onUpdateWidget"
        @remove-widget="onRemoveWidget"
        @reorder-widgets="onReorderWidgets"
      />
    </div>

    <DashboardShareModal
      :open="shareOpen"
      :page="shareTargetPage"
      :users="shareUsers"
      :can-create-team-wide="dashboard.canCreateTeamWide.value"
      :busy="metricsBusy"
      @close="shareOpen = false; shareTargetPageId = null"
      @save="saveShare"
    />

    <DashboardTemplateLibraryModal
      v-if="dashboardTemplatesEnabled"
      :open="templateLibraryOpen"
      :templates="dashboard.templates.value"
      :can-manage-templates="dashboard.canManageTemplates.value"
      :can-apply-templates="dashboard.canApplyTemplates.value"
      :busy="metricsBusy"
      @close="templateLibraryOpen = false"
      @save-template="openSaveTemplateModal"
      @apply-template="onRequestTemplateApply"
      @delete-template="onDeleteTemplate"
    />

    <DashboardSaveTemplateModal
      v-if="dashboardTemplatesEnabled"
      :open="saveTemplateOpen"
      :pages="dashboard.pages.value"
      :can-create-team-wide="dashboard.canManageTemplates.value"
      :busy="metricsBusy"
      @close="saveTemplateOpen = false"
      @save="onSaveTemplate"
    />

    <DashboardApplyTemplateModal
      v-if="dashboardTemplatesEnabled"
      :open="applyTemplateOpen"
      :template="templateToApply"
      :busy="metricsBusy"
      @close="applyTemplateOpen = false; templateToApply = null"
      @apply="onConfirmTemplateApply"
    />

    <DashboardPageEditorModal
      :open="pageEditorOpen"
      :mode="pageEditorMode"
      :initial-name="pageEditorInitialName"
      :initial-visibility="pageEditorInitialVisibility"
      :can-create-team-wide="dashboard.canCreateTeamWide.value"
      :busy="metricsBusy"
      @close="pageEditorOpen = false; pageEditorTargetId = null"
      @save="onPageEditorSave"
    />

    <DashboardConfirmModal
      :open="Boolean(pageDeleteTarget)"
      title="Delete dashboard page"
      :message="pageDeleteTarget ? 'Delete ' + pageDeleteTarget.name + '? This cannot be undone.' : ''"
      confirm-label="Delete page"
      :busy="metricsBusy"
      danger
      @close="pageDeleteTarget = null"
      @confirm="onConfirmDeletePage"
    />

    <DashboardConfirmModal
      :open="Boolean(templateDeleteTarget)"
      title="Delete template"
      :message="templateDeleteTarget ? 'Delete template ' + templateDeleteTarget.name + '?' : ''"
      confirm-label="Delete template"
      :busy="metricsBusy"
      danger
      @close="templateDeleteTarget = null"
      @confirm="onConfirmDeleteTemplate"
    />
  </div>
</template>
