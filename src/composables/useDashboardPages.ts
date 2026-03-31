import { computed, ref, watch, type Ref } from 'vue'
import { ApiError } from '@/lib/apiClient'
import { dashboardsApi } from '@/lib/api'
import type {
  DashboardPage,
  DashboardScopeContextResponse,
  DashboardScopeType,
  DashboardTemplate,
  DashboardTemplateApplyMode,
  DashboardTemplateVisibility,
  DashboardVisibility,
  DashboardPageViewer,
} from '@/types/dashboard'

interface UseDashboardPagesOptions {
  scopeType: Ref<DashboardScopeType>
  productId: Ref<string | null | undefined>
  organizationId: Ref<string | null | undefined>
  token: Ref<string | null | undefined>
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Dashboard request failed'
}

export function useDashboardPages(options: UseDashboardPagesOptions) {
  const pages = ref<DashboardPage[]>([])
  const templates = ref<DashboardTemplate[]>([])
  const scopeContext = ref<DashboardScopeContextResponse | null>(null)
  const activePageId = ref('')
  const loading = ref(false)
  const templatesLoading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const canManageTemplates = ref(false)
  const canApplyTemplates = ref(false)

  const activePage = computed(() => pages.value.find((page) => page.id === activePageId.value) || null)
  const canCreateTeamWide = computed(() => Boolean(scopeContext.value?.canEditTeamWide))

  function scopeQuery() {
    const scopeType = options.scopeType.value
    const query: {
      scopeType: DashboardScopeType
      productId?: string
      organizationId?: string | null
    } = { scopeType }

    if (scopeType === 'product') {
      const productId = String(options.productId.value || '').trim()
      if (!productId) return null
      query.productId = productId
      return query
    }

    query.organizationId = options.organizationId.value ?? undefined
    return query
  }

  async function loadPages() {
    const token = options.token.value
    if (!token) {
      pages.value = []
      templates.value = []
      canManageTemplates.value = false
      canApplyTemplates.value = false
      scopeContext.value = null
      activePageId.value = ''
      return
    }

    const query = scopeQuery()
    if (!query) {
      pages.value = []
      templates.value = []
      canManageTemplates.value = false
      canApplyTemplates.value = false
      scopeContext.value = null
      activePageId.value = ''
      return
    }

    loading.value = true
    error.value = null
    try {
      const [pagesResponse, contextResponse] = await Promise.all([
        dashboardsApi.listPages(query, token),
        dashboardsApi.getScopeContext(query, token),
      ])
      pages.value = Array.isArray(pagesResponse.items) ? pagesResponse.items : []
      scopeContext.value = contextResponse

      const stillExists = pages.value.some((page) => page.id === activePageId.value)
      if (!stillExists) {
        activePageId.value = pages.value[0]?.id || ''
      }

      try {
        const templateResponse = await dashboardsApi.listTemplates(query, token)
        templates.value = Array.isArray(templateResponse.items) ? templateResponse.items : []
        canManageTemplates.value = Boolean(templateResponse.canManageTemplates)
        canApplyTemplates.value = Boolean(
          templateResponse.canApplyTemplates ?? templateResponse.canManageTemplates,
        )
      } catch {
        templates.value = []
        canManageTemplates.value = false
        canApplyTemplates.value = false
      }
    } catch (err) {
      error.value = toErrorMessage(err)
      pages.value = []
      templates.value = []
      canManageTemplates.value = false
      canApplyTemplates.value = false
      scopeContext.value = null
      activePageId.value = ''
    } finally {
      loading.value = false
    }
  }

  async function loadTemplates() {
    const token = options.token.value
    if (!token) {
      templates.value = []
      canManageTemplates.value = false
      canApplyTemplates.value = false
      return
    }

    const query = scopeQuery()
    if (!query) {
      templates.value = []
      canManageTemplates.value = false
      canApplyTemplates.value = false
      return
    }

    templatesLoading.value = true
    error.value = null
    try {
      const response = await dashboardsApi.listTemplates(query, token)
      templates.value = Array.isArray(response.items) ? response.items : []
      canManageTemplates.value = Boolean(response.canManageTemplates)
      canApplyTemplates.value = Boolean(response.canApplyTemplates ?? response.canManageTemplates)
    } catch (err) {
      error.value = toErrorMessage(err)
      templates.value = []
      canManageTemplates.value = false
      canApplyTemplates.value = false
    } finally {
      templatesLoading.value = false
    }
  }

  async function createPage(
    payload: {
      name: string
      visibility: DashboardVisibility
      sharedUserIds?: string[]
    },
  ): Promise<boolean> {
    const query = scopeQuery()
    const token = options.token.value
    if (!query || !token) return false
    saving.value = true
    error.value = null
    try {
      const created = await dashboardsApi.createPage({
        ...query,
        ...payload,
      }, token)
      await loadPages()
      if (created?.id) {
        activePageId.value = created.id
      }
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function updatePage(
    pageId: string,
    payload: { name?: string; visibility?: DashboardVisibility },
    requestOptions: { reload?: boolean } = {},
  ): Promise<boolean> {
    const token = options.token.value
    if (!token) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.updatePage(pageId, payload, token)
      if (requestOptions.reload !== false) {
        await loadPages()
      }
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function deletePage(pageId: string): Promise<boolean> {
    const token = options.token.value
    if (!token) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.deletePage(pageId, token)
      await loadPages()
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function reorderPages(orderedPageIds: string[]): Promise<boolean> {
    const query = scopeQuery()
    const token = options.token.value
    if (!query || !token) return false
    if (!Array.isArray(orderedPageIds) || orderedPageIds.length < 2) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.reorderPages({
        ...query,
        orderedPageIds,
      }, token)
      await loadPages()
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function updateViewers(
    pageId: string,
    viewers: DashboardPageViewer[] | string[],
    requestOptions: { reload?: boolean } = {},
  ): Promise<boolean> {
    const token = options.token.value
    if (!token) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.updateViewers(pageId, viewers, token)
      if (requestOptions.reload !== false) {
        await loadPages()
      }
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function addWidget(
    pageId: string,
    payload: {
      widgetType: string
      widgetTitle?: string
      configJson?: Record<string, unknown>
      gridX?: number
      gridY?: number
      gridW?: number
      gridH?: number
      sortOrder?: number
    },
    requestOptions: { reload?: boolean } = {},
  ): Promise<boolean> {
    const token = options.token.value
    if (!token) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.addWidget(pageId, payload, token)
      if (requestOptions.reload !== false) {
        await loadPages()
      }
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function updateWidget(
    pageId: string,
    widgetId: string,
    payload: {
      widgetTitle?: string
      configJson?: Record<string, unknown>
      gridX?: number
      gridY?: number
      gridW?: number
      gridH?: number
      sortOrder?: number
    },
    requestOptions: { reload?: boolean } = {},
  ): Promise<boolean> {
    const token = options.token.value
    if (!token) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.updateWidget(pageId, widgetId, payload, token)
      if (requestOptions.reload !== false) {
        await loadPages()
      }
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function deleteWidget(
    pageId: string,
    widgetId: string,
    requestOptions: { reload?: boolean } = {},
  ): Promise<boolean> {
    const token = options.token.value
    if (!token) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.deleteWidget(pageId, widgetId, token)
      if (requestOptions.reload !== false) {
        await loadPages()
      }
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function saveTemplate(
    payload: {
      name: string
      description?: string
      visibility?: DashboardTemplateVisibility
      pageIds?: string[]
    },
  ): Promise<boolean> {
    const query = scopeQuery()
    const token = options.token.value
    if (!query || !token) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.saveTemplate({
        ...query,
        ...payload,
      }, token)
      await loadPages()
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function deleteTemplate(templateId: string): Promise<boolean> {
    const query = scopeQuery()
    const token = options.token.value
    if (!query || !token) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.deleteTemplate(templateId, query, token)
      await loadPages()
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function applyTemplate(templateId: string, mode: DashboardTemplateApplyMode): Promise<boolean> {
    const query = scopeQuery()
    const token = options.token.value
    if (!query || !token) return false
    saving.value = true
    error.value = null
    try {
      await dashboardsApi.applyTemplate(templateId, {
        ...query,
        mode,
      }, token)
      await loadPages()
      return true
    } catch (err) {
      error.value = toErrorMessage(err)
      return false
    } finally {
      saving.value = false
    }
  }

  function selectPage(pageId: string) {
    activePageId.value = pageId
  }

  watch(
    () => [
      options.scopeType.value,
      options.productId.value,
      options.organizationId.value,
      options.token.value,
    ],
    () => {
      loadPages()
    },
    { immediate: true },
  )

  return {
    pages,
    templates,
    activePageId,
    activePage,
    loading,
    templatesLoading,
    saving,
    error,
    scopeContext,
    canCreateTeamWide,
    canManageTemplates,
    canApplyTemplates,
    loadPages,
    loadTemplates,
    createPage,
    updatePage,
    deletePage,
    reorderPages,
    updateViewers,
    addWidget,
    updateWidget,
    deleteWidget,
    saveTemplate,
    deleteTemplate,
    applyTemplate,
    selectPage,
  }
}
