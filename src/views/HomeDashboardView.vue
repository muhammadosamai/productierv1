<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import HomeView from '@/views/HomeView.vue'
import TeamHomeView from '@/views/home/TeamHomeView.vue'
import ExecutiveHomeView from '@/views/home/ExecutiveHomeView.vue'
import DashboardPageTabs from '@/components/dashboard/DashboardPageTabs.vue'
import DashboardWidgetPalette, { type DashboardWidgetCatalogEntry } from '@/components/dashboard/DashboardWidgetPalette.vue'
import DashboardWidgetGrid from '@/components/dashboard/DashboardWidgetGrid.vue'
import DashboardShareModal from '@/components/dashboard/DashboardShareModal.vue'
import DashboardTemplateLibraryModal from '@/components/dashboard/DashboardTemplateLibraryModal.vue'
import DashboardSaveTemplateModal from '@/components/dashboard/DashboardSaveTemplateModal.vue'
import DashboardApplyTemplateModal from '@/components/dashboard/DashboardApplyTemplateModal.vue'
import DashboardPageEditorModal from '@/components/dashboard/DashboardPageEditorModal.vue'
import DashboardConfirmModal from '@/components/dashboard/DashboardConfirmModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import { useProductStore } from '@/stores/products'
import { useRolesStore } from '@/stores/roles'
import { ensureAllowedHomeView, resolveHomeViewAccess, type HomeViewKey } from '@/lib/homeViewAccess'
import { STORAGE_KEYS } from '@/constants/storageKeys'
import { storageGet, storageGetJson, storageSet, storageSetJson } from '@/lib/browserStorage'
import { useHybridSettings } from '@/composables/useHybridSettings'
import { useDashboardPages } from '@/composables/useDashboardPages'
import { usersApi } from '@/lib/api'
import type {
  DashboardPage,
  DashboardTemplate,
  DashboardTemplateApplyMode,
  DashboardTemplateVisibility,
  DashboardVisibility,
  DashboardWidget,
} from '@/types/dashboard'
import type {
  HomeBriefEntityFocusType,
  HomeBriefMode,
  HomeBriefScope,
  HomeBriefTemplate,
  UserDailyBriefResponse,
} from '@/lib/api/usersApi'
import {
  normalizeHomeScopeSelection,
  sanitizeHomeScopeSelection,
  type HomeScopeMode,
  type HomeScopeSelection,
} from '@/composables/useHomeScope'
import { ApiError } from '@/lib/apiClient'

const authStore = useAuthStore()
const onboardingStore = useOnboardingStore()
const productStore = useProductStore()
const rolesStore = useRolesStore()
const {
  saveSetting: saveHomeSetting,
  loadSettings: loadHomeSettings,
  cleanup: cleanupHomeSettings,
} = useHybridSettings(computed(() => authStore.token))

const envFlags = import.meta.env as Record<string, string | undefined>
const dailyBriefEnabled = String(
  envFlags.VITE_HOME_DAILY_BRIEF_ENABLED ?? envFlags.HOME_DAILY_BRIEF_ENABLED ?? 'true',
).toLowerCase() !== 'false'
const dashboardTemplatesEnabled = String(
  envFlags.VITE_DASHBOARD_TEMPLATES_ENABLED
  ?? envFlags.VITE_dashboard_templates_enabled
  ?? envFlags.DASHBOARD_TEMPLATES_ENABLED
  ?? envFlags.dashboard_templates_enabled
  ?? 'true',
).toLowerCase() !== 'false'

const HOME_ACTIVE_VIEW_KEY = STORAGE_KEYS.views.home.activeView
const HOME_TEAM_MEMBER_FILTER_KEY = STORAGE_KEYS.views.home.teamMemberFilter
const HOME_BRIEF_MODE_KEY = STORAGE_KEYS.views.home.briefMode
const HOME_BRIEF_SCOPE_KEY = STORAGE_KEYS.views.home.briefScope
const HOME_BRIEF_PRODUCT_ID_KEY = STORAGE_KEYS.views.home.briefProductId
const HOME_BRIEF_ENTITY_TYPE_KEY = STORAGE_KEYS.views.home.briefEntityType
const HOME_BRIEF_ENTITY_ID_KEY = STORAGE_KEYS.views.home.briefEntityId
const HOME_BRIEF_TEMPLATE_KEY = STORAGE_KEYS.views.home.briefTemplate
const HOME_SCOPE_MODE_KEY = STORAGE_KEYS.views.home.scopeMode
const HOME_SCOPE_PRODUCT_ID_KEY = STORAGE_KEYS.views.home.scopeProductId
const HOME_SCOPE_TEAM_ID_KEY = STORAGE_KEYS.views.home.scopeTeamId

const preferredView = ref<HomeViewKey>('my_tasks')
const selectedTeamMemberIds = ref<string[]>([])
const settingsHydrated = ref(false)

const briefLoading = ref(false)
const briefMode = ref<HomeBriefMode>('summary')
const briefScope = ref<HomeBriefScope>('all_products')
const briefProductId = ref<string | null>(null)
const briefEntityType = ref<HomeBriefEntityFocusType>('task')
const briefEntityId = ref('')
const briefTemplate = ref<HomeBriefTemplate>('executive_narrative')
const dailyBrief = ref<UserDailyBriefResponse | null>(null)
const briefError = ref<string | null>(null)
const homeScopeMode = ref<HomeScopeMode>('all')
const homeScopeProductId = ref<string | null>(null)
let briefRequestCounter = 0

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

const access = computed(() => {
  const role = authStore.user?.role ?? 'viewer'
  return resolveHomeViewAccess(role, rolesStore.myTitle)
})

function normalizeOrganizationId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

const activeOrganizationId = computed(() => normalizeOrganizationId(onboardingStore.activeOrganizationId))

const scopeProducts = computed(() => (
  productStore.products.filter((product) => {
    const productId = typeof product.id === 'string' ? product.id.trim() : ''
    if (!productId) return false
    const productOrganizationId = normalizeOrganizationId(product.organizationId)
    if (!productOrganizationId) return false
    return activeOrganizationId.value ? productOrganizationId === activeOrganizationId.value : false
  }) as Array<{
    id: string
    organizationId?: string | null
    name: string
  }>
))
const productById = computed(() => new Map(
  scopeProducts.value.map((product) => [product.id, product]),
))
const scopeProductIds = computed(() => scopeProducts.value.map((product) => product.id))
const briefProducts = computed(() => scopeProducts.value.map((product) => ({
  id: product.id,
  name: product.name,
})))
const homeScope = computed<HomeScopeSelection>(() => normalizeHomeScopeSelection({
  scopeMode: homeScopeMode.value,
  productId: homeScopeProductId.value,
  teamId: null,
}))
const selectedScopeProductName = computed(() =>
  scopeProducts.value.find((product) => product.id === homeScopeProductId.value)?.name || '',
)
const homeScopeSummary = computed(() => {
  if (homeScope.value.scopeMode === 'product') {
    return selectedScopeProductName.value
      ? `My Tasks and Executive Overview are scoped to ${selectedScopeProductName.value}.`
      : 'Select a product to scope Home.'
  }
  return 'My Tasks and Executive Overview aggregate all accessible products. Team View has its own team filter.'
})

const canUseAllProductsBriefScope = computed(() => {
  const role = authStore.user?.role || 'viewer'
  return role === 'super_admin' || role === 'admin' || role === 'product_admin' || role === 'product_manager'
})

const resolvedOrganizationId = computed(() => activeOrganizationId.value)

const dashboard = useDashboardPages({
  scopeType: computed(() => 'workspace' as const),
  productId: computed(() => null),
  organizationId: resolvedOrganizationId,
  token: computed(() => authStore.token),
})

const widgetRenderers = {
  home_my_tasks: HomeView,
  home_team: TeamHomeView,
  home_executive: ExecutiveHomeView,
}

const widgetCatalog = computed<DashboardWidgetCatalogEntry[]>(() => {
  const items: DashboardWidgetCatalogEntry[] = [
    { type: 'home_my_tasks', label: 'My Tasks', description: 'Personal focus, due work, and blockers', defaultGridW: 2, defaultGridH: 2 },
  ]
  if (access.value.allowedViews.includes('team')) {
    items.push({ type: 'home_team', label: 'Team View', description: 'Team workload, risks, and priorities', defaultGridW: 2, defaultGridH: 2 })
  }
  if (access.value.allowedViews.includes('executive')) {
    items.push({ type: 'home_executive', label: 'Executive Overview', description: 'Portfolio-level status and decision support', defaultGridW: 2, defaultGridH: 2 })
  }
  return items
})

function normalizeMemberIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const sanitized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return [...new Set(sanitized)]
}

function normalizeBriefMode(value: unknown): HomeBriefMode {
  return value === 'full' ? 'full' : 'summary'
}

function normalizeBriefScope(value: unknown): HomeBriefScope {
  if (value === 'product') return 'product'
  if (value === 'entity') return 'entity'
  return 'all_products'
}

function normalizeBriefTemplate(value: unknown): HomeBriefTemplate {
  if (value === 'delivery_risk') return 'delivery_risk'
  if (value === 'workload_focus') return 'workload_focus'
  if (value === 'entity_deep_dive') return 'entity_deep_dive'
  return 'executive_narrative'
}

function normalizeBriefEntityType(value: unknown): HomeBriefEntityFocusType {
  if (value === 'story') return 'story'
  if (value === 'initiative') return 'initiative'
  if (value === 'delivery') return 'delivery'
  if (value === 'release') return 'release'
  return 'task'
}

function normalizeBriefEntityId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getBriefRequestErrorMessage(error: ApiError): string {
  if (error.status === 400) {
    return error.message || 'AI brief request is invalid for the current scope selection.'
  }
  if (error.status === 401) {
    return 'Your session expired. Sign in again to load AI briefings.'
  }
  if (error.status === 403) {
    return 'You do not have access to generate this AI briefing scope.'
  }
  if (error.status === 404) {
    return 'The selected brief target was not found. Update scope filters and try again.'
  }
  if (error.status === 429) {
    return 'AI briefing is rate-limited right now. Wait a moment and retry.'
  }
  if (error.status >= 500) {
    return 'AI briefing service is temporarily unavailable. Retry shortly.'
  }
  return error.message || 'AI brief request failed.'
}

function applyScopeSelection(value: HomeScopeSelection) {
  if (homeScopeMode.value !== value.scopeMode) homeScopeMode.value = value.scopeMode
  if (homeScopeProductId.value !== value.productId) homeScopeProductId.value = value.productId
}

function sanitizeCurrentScopeSelection() {
  applyScopeSelection(sanitizeHomeScopeSelection(homeScope.value, {
    availableProductIds: scopeProductIds.value,
  }))
}

function hadLegacyTeamScope(scopeMode: unknown, teamId: unknown): boolean {
  if (scopeMode === 'team') return true
  if (scopeMode === undefined || scopeMode === null || String(scopeMode).trim().length === 0) {
    return typeof teamId === 'string' && teamId.trim().length > 0
  }
  return false
}

function setScopeMode(nextMode: HomeScopeMode) {
  homeScopeMode.value = nextMode
  if (nextMode === 'product' && !homeScopeProductId.value) {
    homeScopeProductId.value = scopeProductIds.value[0] || null
  }
  if (nextMode !== 'product') homeScopeProductId.value = null
}

function sanitizeBriefSelection() {
  if (!canUseAllProductsBriefScope.value && briefScope.value === 'all_products') {
    briefScope.value = 'product'
  }

  if (briefScope.value === 'product') {
    const available = new Set(briefProducts.value.map((item) => item.id))
    if (!briefProductId.value || !available.has(briefProductId.value)) {
      briefProductId.value = briefProducts.value[0]?.id || null
    }
    briefEntityId.value = ''
  } else if (briefScope.value === 'entity') {
    briefProductId.value = null
  } else {
    briefProductId.value = null
    briefEntityId.value = ''
  }

  if (briefScope.value !== 'entity' && briefTemplate.value === 'entity_deep_dive') {
    briefTemplate.value = 'executive_narrative'
  }
}

function widgetMapsToView(widgetType: string): HomeViewKey {
  if (widgetType === 'home_team') return 'team'
  if (widgetType === 'home_executive') return 'executive'
  return 'my_tasks'
}

function viewFromPage(page: DashboardPage | null): HomeViewKey {
  if (!page) return 'my_tasks'
  if (page.systemKey === 'workspace_team') return 'team'
  if (page.systemKey === 'workspace_executive') return 'executive'
  if (page.systemKey === 'workspace_my_tasks') return 'my_tasks'
  return widgetMapsToView(page.widgets[0]?.widgetType || 'home_my_tasks')
}

function pageAllowedByAccess(page: DashboardPage): boolean {
  return page.widgets.every((widget) => {
    const mapped = widgetMapsToView(widget.widgetType)
    if (mapped === 'team') return access.value.allowedViews.includes('team')
    if (mapped === 'executive') return access.value.allowedViews.includes('executive')
    return true
  })
}

const visiblePages = computed(() => dashboard.pages.value.filter(pageAllowedByAccess))
const activePage = computed(() => visiblePages.value.find((page) => page.id === dashboard.activePageId.value) || visiblePages.value[0] || null)
const shareTargetPage = computed(() => {
  if (!shareTargetPageId.value) return null
  return visiblePages.value.find((page) => page.id === shareTargetPageId.value) || null
})
const renderedView = computed<HomeViewKey>(() => viewFromPage(activePage.value))
const activePageEditable = computed(() => Boolean(activePage.value?.canEdit && !activePage.value?.isSystem))
const canReorderPages = computed(() =>
  !isEditMode.value
  && visiblePages.value.length > 1
  && visiblePages.value.every((page) => page.canEdit),
)
const homeBusy = computed(() => Boolean(dashboard.saving.value || editModeSaving.value))
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

watch(access, (next) => {
  preferredView.value = ensureAllowedHomeView(preferredView.value, next)
})

watch(visiblePages, (pages) => {
  if (pages.length === 0) {
    if (dashboard.activePageId.value) dashboard.selectPage('')
    return
  }

  const activeId = dashboard.activePageId.value
  const exists = pages.some((page) => page.id === activeId)
  if (exists) return

  const wanted = pages.find((page) => viewFromPage(page) === preferredView.value)
  dashboard.selectPage(wanted?.id || pages[0]?.id || '')
}, { immediate: true })

function resolveWidgetProps(widget: DashboardWidget): Record<string, unknown> {
  const base = {
    embedded: true,
    organizationId: resolvedOrganizationId.value,
    homeScope: homeScope.value,
    dailyBriefEnabled,
    briefLoading: briefLoading.value,
    dailyBrief: dailyBrief.value,
    briefError: briefError.value,
    briefMode: briefMode.value,
    briefScope: briefScope.value,
    briefProductId: briefProductId.value,
    briefEntityType: briefEntityType.value,
    briefEntityId: briefEntityId.value,
    briefTemplate: briefTemplate.value,
    briefProducts: briefProducts.value,
    allowAllProductsBriefScope: canUseAllProductsBriefScope.value,
  }
  if (widget.widgetType === 'home_team') {
    return {
      ...base,
      selectedMemberIds: selectedTeamMemberIds.value,
    }
  }
  return base
}

function resolveWidgetListeners(widget: DashboardWidget) {
  const base = {
    'update:brief-mode': (value: HomeBriefMode) => { briefMode.value = value },
    'update:brief-scope': (value: HomeBriefScope) => { briefScope.value = value },
    'update:brief-product-id': (value: string | null) => { briefProductId.value = value },
    'update:brief-entity-type': (value: HomeBriefEntityFocusType) => { briefEntityType.value = value },
    'update:brief-entity-id': (value: string) => { briefEntityId.value = value },
    'update:brief-template': (value: HomeBriefTemplate) => { briefTemplate.value = value },
  } as const

  if (widget.widgetType === 'home_team') {
    return {
      ...base,
      'update:selected-member-ids': (value: string[]) => { selectedTeamMemberIds.value = normalizeMemberIds(value) },
    }
  }
  return base
}

async function hydrateSettings() {
  const localView = storageGet(HOME_ACTIVE_VIEW_KEY)
  if (localView) preferredView.value = ensureAllowedHomeView(localView, access.value)

  briefMode.value = normalizeBriefMode(storageGet(HOME_BRIEF_MODE_KEY))
  briefScope.value = normalizeBriefScope(storageGet(HOME_BRIEF_SCOPE_KEY))
  briefProductId.value = storageGet(HOME_BRIEF_PRODUCT_ID_KEY)?.trim() || null
  briefEntityType.value = normalizeBriefEntityType(storageGet(HOME_BRIEF_ENTITY_TYPE_KEY))
  briefEntityId.value = normalizeBriefEntityId(storageGet(HOME_BRIEF_ENTITY_ID_KEY))
  briefTemplate.value = normalizeBriefTemplate(storageGet(HOME_BRIEF_TEMPLATE_KEY))
  selectedTeamMemberIds.value = normalizeMemberIds(storageGetJson(HOME_TEAM_MEMBER_FILTER_KEY, [] as string[]))
  const localScopeModeRaw = storageGet(HOME_SCOPE_MODE_KEY)
  const localScopeTeamIdRaw = storageGet(HOME_SCOPE_TEAM_ID_KEY)
  const localLegacyTeamScope = hadLegacyTeamScope(localScopeModeRaw, localScopeTeamIdRaw)
  applyScopeSelection(normalizeHomeScopeSelection({
    scopeMode: localScopeModeRaw,
    productId: storageGet(HOME_SCOPE_PRODUCT_ID_KEY),
    teamId: localScopeTeamIdRaw,
  }))
  if (localLegacyTeamScope) {
    storageSet(HOME_SCOPE_MODE_KEY, 'all')
    storageSet(HOME_SCOPE_TEAM_ID_KEY, '')
  }

  const remote = await loadHomeSettings()
  if (remote[HOME_ACTIVE_VIEW_KEY]) preferredView.value = ensureAllowedHomeView(String(remote[HOME_ACTIVE_VIEW_KEY]), access.value)
  if (remote[HOME_TEAM_MEMBER_FILTER_KEY]) selectedTeamMemberIds.value = normalizeMemberIds(remote[HOME_TEAM_MEMBER_FILTER_KEY])
  if (remote[HOME_BRIEF_MODE_KEY]) briefMode.value = normalizeBriefMode(remote[HOME_BRIEF_MODE_KEY])
  if (remote[HOME_BRIEF_SCOPE_KEY]) briefScope.value = normalizeBriefScope(remote[HOME_BRIEF_SCOPE_KEY])
  if (remote[HOME_BRIEF_PRODUCT_ID_KEY]) briefProductId.value = normalizeBriefEntityId(remote[HOME_BRIEF_PRODUCT_ID_KEY]) || null
  if (remote[HOME_BRIEF_ENTITY_TYPE_KEY]) briefEntityType.value = normalizeBriefEntityType(remote[HOME_BRIEF_ENTITY_TYPE_KEY])
  if (remote[HOME_BRIEF_ENTITY_ID_KEY]) briefEntityId.value = normalizeBriefEntityId(remote[HOME_BRIEF_ENTITY_ID_KEY])
  if (remote[HOME_BRIEF_TEMPLATE_KEY]) briefTemplate.value = normalizeBriefTemplate(remote[HOME_BRIEF_TEMPLATE_KEY])
  const remoteScopeModeRaw = remote[HOME_SCOPE_MODE_KEY]
  const remoteScopeTeamIdRaw = remote[HOME_SCOPE_TEAM_ID_KEY]
  const remoteLegacyTeamScope = hadLegacyTeamScope(remoteScopeModeRaw, remoteScopeTeamIdRaw)
  applyScopeSelection(normalizeHomeScopeSelection({
    scopeMode: remoteScopeModeRaw,
    productId: remote[HOME_SCOPE_PRODUCT_ID_KEY],
    teamId: remoteScopeTeamIdRaw,
  }))
  if (remoteLegacyTeamScope) {
    saveHomeSetting(HOME_SCOPE_MODE_KEY, 'all')
    saveHomeSetting(HOME_SCOPE_TEAM_ID_KEY, '')
  }

  sanitizeCurrentScopeSelection()
  sanitizeBriefSelection()
  settingsHydrated.value = true
}

async function fetchDailyBrief() {
  if (!dailyBriefEnabled || !authStore.user?.id) {
    dailyBrief.value = null
    briefError.value = null
    briefLoading.value = false
    return
  }

  const requestId = ++briefRequestCounter
  if (!resolvedOrganizationId.value) {
    dailyBrief.value = null
    briefError.value = 'Select a valid workspace or product scope to load AI briefings.'
    briefLoading.value = false
    return
  }

  briefLoading.value = true
  briefError.value = null
  try {
    const resolvedEntityId = briefEntityId.value.trim()
    if (briefScope.value === 'entity' && resolvedEntityId.length === 0) {
      dailyBrief.value = null
      briefError.value = 'Enter an entity ID to generate an entity-focused brief.'
      return
    }

    const payload = await usersApi.getDailyBrief(
      authStore.user.id,
      {
        organizationId: resolvedOrganizationId.value,
        scope: briefScope.value,
        scopeMode: homeScope.value.scopeMode,
        productId: homeScope.value.scopeMode === 'product'
          ? homeScope.value.productId
          : (briefScope.value === 'product' ? briefProductId.value : null),
        entityType: briefScope.value === 'entity' ? briefEntityType.value : null,
        entityId: briefScope.value === 'entity' ? resolvedEntityId : null,
        view: renderedView.value,
        mode: briefMode.value,
        template: briefTemplate.value,
      },
      authStore.token,
    )
    if (requestId !== briefRequestCounter) return
    dailyBrief.value = payload
    briefError.value = null
  } catch (error) {
    if (requestId !== briefRequestCounter) return
    dailyBrief.value = null
    if (error instanceof ApiError) {
      briefError.value = getBriefRequestErrorMessage(error)
    } else {
      briefError.value = 'Unable to load AI brief right now.'
    }
  } finally {
    if (requestId === briefRequestCounter) briefLoading.value = false
  }
}

watch(renderedView, (value) => {
  preferredView.value = ensureAllowedHomeView(value, access.value)
  if (!settingsHydrated.value) return
  storageSet(HOME_ACTIVE_VIEW_KEY, preferredView.value)
  saveHomeSetting(HOME_ACTIVE_VIEW_KEY, preferredView.value)
})

watch(briefMode, (value) => {
  if (!settingsHydrated.value) return
  storageSet(HOME_BRIEF_MODE_KEY, value)
  saveHomeSetting(HOME_BRIEF_MODE_KEY, value)
})

watch(briefScope, (value) => {
  sanitizeBriefSelection()
  if (!settingsHydrated.value) return
  storageSet(HOME_BRIEF_SCOPE_KEY, value)
  saveHomeSetting(HOME_BRIEF_SCOPE_KEY, value)
})

watch(briefProductId, (value) => {
  if (!settingsHydrated.value) return
  storageSet(HOME_BRIEF_PRODUCT_ID_KEY, value || '')
  saveHomeSetting(HOME_BRIEF_PRODUCT_ID_KEY, value)
})

watch(briefEntityType, (value) => {
  if (!settingsHydrated.value) return
  storageSet(HOME_BRIEF_ENTITY_TYPE_KEY, value)
  saveHomeSetting(HOME_BRIEF_ENTITY_TYPE_KEY, value)
})

watch(briefEntityId, (value) => {
  if (!settingsHydrated.value) return
  const trimmed = value.trim()
  storageSet(HOME_BRIEF_ENTITY_ID_KEY, trimmed)
  saveHomeSetting(HOME_BRIEF_ENTITY_ID_KEY, trimmed)
})

watch(briefTemplate, (value) => {
  if (briefScope.value !== 'entity' && value === 'entity_deep_dive') {
    briefTemplate.value = 'executive_narrative'
    return
  }
  if (!settingsHydrated.value) return
  storageSet(HOME_BRIEF_TEMPLATE_KEY, value)
  saveHomeSetting(HOME_BRIEF_TEMPLATE_KEY, value)
})

watch(selectedTeamMemberIds, (value) => {
  if (!settingsHydrated.value) return
  const normalized = normalizeMemberIds(value)
  storageSetJson(HOME_TEAM_MEMBER_FILTER_KEY, normalized)
  saveHomeSetting(HOME_TEAM_MEMBER_FILTER_KEY, normalized)
}, { deep: true })

watch(
  () => [scopeProductIds.value.join('|')],
  () => {
    sanitizeCurrentScopeSelection()
    sanitizeBriefSelection()
  },
  { immediate: true },
)

watch(homeScopeMode, (value) => {
  if (!settingsHydrated.value) return
  storageSet(HOME_SCOPE_MODE_KEY, value)
  saveHomeSetting(HOME_SCOPE_MODE_KEY, value)
})

watch(homeScopeProductId, (value) => {
  if (!settingsHydrated.value) return
  storageSet(HOME_SCOPE_PRODUCT_ID_KEY, value || '')
  saveHomeSetting(HOME_SCOPE_PRODUCT_ID_KEY, value || '')
})

watch(() => [
  resolvedOrganizationId.value,
  renderedView.value,
  homeScope.value.scopeMode,
  homeScope.value.productId,
  briefMode.value,
  briefScope.value,
  briefProductId.value,
  briefEntityType.value,
  briefEntityId.value,
  briefTemplate.value,
  authStore.user?.id,
  authStore.token,
], () => {
  fetchDailyBrief()
}, { immediate: true })

function openCreatePageEditor() {
  pageEditorMode.value = 'create'
  pageEditorInitialName.value = ''
  pageEditorInitialVisibility.value = 'personal'
  pageEditorTargetId.value = null
  pageEditorOpen.value = true
}

function onRenamePage(pageId: string) {
  const page = visiblePages.value.find((entry) => entry.id === pageId)
  if (!page || page.isSystem || !page.canEdit) return
  pageEditorMode.value = 'rename'
  pageEditorInitialName.value = page.name
  pageEditorInitialVisibility.value = page.visibility
  pageEditorTargetId.value = page.id
  pageEditorOpen.value = true
}

function onDeletePage(pageId: string) {
  const page = visiblePages.value.find((entry) => entry.id === pageId)
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
  const page = visiblePages.value.find((entry) => entry.id === pageId)
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
  const orderedIds = visiblePages.value.map((page) => page.id)
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
    const payload = await usersApi.list({ q: '' }, authStore.token)
    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : [])
    shareUsers.value = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
    }))
  } catch {
    shareUsers.value = []
  }
}

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
  hydrateSettings()
  loadShareUsers()
})

onBeforeUnmount(() => {
  cleanupHomeSettings()
})
</script>

<template>
  <div class="flex h-full flex-col bg-[#FAFBFD]">
    <DashboardPageTabs
      :pages="visiblePages"
      :active-page-id="activePage?.id || ''"
      :templates-enabled="dashboardTemplatesEnabled"
      :show-load-template-button="false"
      :show-add-page-button="false"
      :show-page-actions-menu="false"
      :allow-reorder="canReorderPages"
      :busy="homeBusy"
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

    <div class="border-b border-gray-100 bg-white px-4 py-3 sm:px-6">
      <div class="rounded-2xl border border-gray-200 bg-linear-to-r from-white to-[#F6F8FF] p-4 sm:p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-sm font-semibold text-gray-800">Home Scope</p>
            <p class="mt-1 text-xs text-gray-500">
              Applies to My Tasks and Executive Overview. Team-specific scope is selected inside Team View.
            </p>
          </div>

          <div class="inline-flex w-full rounded-xl bg-gray-100 p-1 sm:w-auto">
            <button
              type="button"
              class="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none"
              :class="homeScopeMode === 'all'
                ? 'bg-white text-[#4857FE] shadow-sm ring-1 ring-[#4857FE]/20'
                : 'text-gray-600 hover:text-gray-800'"
              @click="setScopeMode('all')"
            >
              All Products
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              :class="homeScopeMode === 'product'
                ? 'bg-white text-[#4857FE] shadow-sm ring-1 ring-[#4857FE]/20'
                : 'text-gray-600 hover:text-gray-800'"
              :disabled="scopeProducts.length === 0"
              @click="setScopeMode('product')"
            >
              Single Product
            </button>
          </div>
        </div>

        <div
          v-if="homeScopeMode === 'product'"
          class="mt-4 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center"
        >
          <label class="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Product
          </label>
          <select
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#4857FE] focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
            :value="homeScopeProductId || ''"
            :disabled="scopeProducts.length === 0"
            @change="homeScopeProductId = ($event.target as HTMLSelectElement).value || null"
          >
            <option value="" disabled>
              {{ scopeProducts.length === 0 ? 'No products available' : 'Select a product' }}
            </option>
            <option
              v-for="product in scopeProducts"
              :key="product.id"
              :value="product.id"
            >
              {{ product.name }}
            </option>
          </select>
        </div>

        <p class="mt-3 text-xs text-gray-500">
          {{ homeScopeSummary }}
        </p>
      </div>
    </div>

    <div class="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-6">
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
            :disabled="homeBusy"
            @click="startEditMode"
          >
            Edit layout
          </button>
          <template v-else>
            <button
              type="button"
              class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
              :disabled="homeBusy"
              @click="cancelEditMode"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-[#4857FE] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3f4de5] disabled:opacity-60"
              :disabled="homeBusy"
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
        :busy="homeBusy"
        @add-widget="onAddWidget"
      />

      <DashboardWidgetGrid
        :page="activePage"
        :widgets="visibleWidgets"
        :renderers="widgetRenderers"
        :editable="activePageEditable && isEditMode"
        :allow-drag="activePageEditable && isEditMode"
        :busy="homeBusy"
        :resolve-widget-props="resolveWidgetProps"
        :resolve-widget-listeners="resolveWidgetListeners"
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
      :busy="homeBusy"
      @close="shareOpen = false; shareTargetPageId = null"
      @save="saveShare"
    />

    <DashboardTemplateLibraryModal
      v-if="dashboardTemplatesEnabled"
      :open="templateLibraryOpen"
      :templates="dashboard.templates.value"
      :can-manage-templates="dashboard.canManageTemplates.value"
      :can-apply-templates="dashboard.canApplyTemplates.value"
      :busy="homeBusy"
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
      :busy="homeBusy"
      @close="saveTemplateOpen = false"
      @save="onSaveTemplate"
    />

    <DashboardApplyTemplateModal
      v-if="dashboardTemplatesEnabled"
      :open="applyTemplateOpen"
      :template="templateToApply"
      :busy="homeBusy"
      @close="applyTemplateOpen = false; templateToApply = null"
      @apply="onConfirmTemplateApply"
    />

    <DashboardPageEditorModal
      :open="pageEditorOpen"
      :mode="pageEditorMode"
      :initial-name="pageEditorInitialName"
      :initial-visibility="pageEditorInitialVisibility"
      :can-create-team-wide="dashboard.canCreateTeamWide.value"
      :busy="homeBusy"
      @close="pageEditorOpen = false; pageEditorTargetId = null"
      @save="onPageEditorSave"
    />

    <DashboardConfirmModal
      :open="Boolean(pageDeleteTarget)"
      title="Delete dashboard page"
      :message="pageDeleteTarget ? 'Delete ' + pageDeleteTarget.name + '? This cannot be undone.' : ''"
      confirm-label="Delete page"
      :busy="homeBusy"
      danger
      @close="pageDeleteTarget = null"
      @confirm="onConfirmDeletePage"
    />

    <DashboardConfirmModal
      :open="Boolean(templateDeleteTarget)"
      title="Delete template"
      :message="templateDeleteTarget ? 'Delete template ' + templateDeleteTarget.name + '?' : ''"
      confirm-label="Delete template"
      :busy="homeBusy"
      danger
      @close="templateDeleteTarget = null"
      @confirm="onConfirmDeleteTemplate"
    />
  </div>
</template>
