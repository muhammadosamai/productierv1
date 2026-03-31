import { apiJson } from '@/lib/apiClient'
import { useOnboardingStore } from '@/stores/onboarding'
import type {
  DashboardPage,
  DashboardPageViewer,
  DashboardPageListResponse,
  DashboardScopeContextResponse,
  DashboardScopeType,
  DashboardTemplate,
  DashboardTemplateApplyMode,
  DashboardTemplateApplyResponse,
  DashboardTemplateListResponse,
  DashboardTemplateVisibility,
  DashboardVisibility,
  DashboardWidget,
} from '@/types/dashboard'

export interface DashboardScopeQuery {
  scopeType: DashboardScopeType
  productId?: string
  organizationId?: string | null
}

function resolveOrganizationId(input?: string | null): string {
  const explicit = typeof input === 'string' ? input.trim() : ''
  if (explicit) return explicit
  const onboardingStore = useOnboardingStore()
  const fallback = onboardingStore.activeOrganizationId?.trim() || ''
  if (fallback) return fallback
  throw new Error('organizationId is required for dashboard requests')
}

function buildOrganizationDashboardPath(suffix: string, organizationId?: string | null): string {
  const resolvedOrganizationId = resolveOrganizationId(organizationId)
  return `/organizations/${encodeURIComponent(resolvedOrganizationId)}/dashboards${suffix}`
}

function buildScopeQuery(scope: DashboardScopeQuery) {
  return {
    scopeType: scope.scopeType,
    productId: scope.productId,
  }
}

export const dashboardsApi = {
  listPages(scope: DashboardScopeQuery, token?: string | null) {
    return apiJson<DashboardPageListResponse>(buildOrganizationDashboardPath('/pages', scope.organizationId), {
      token,
      query: buildScopeQuery(scope),
    })
  },

  getScopeContext(scope: DashboardScopeQuery, token?: string | null) {
    return apiJson<DashboardScopeContextResponse>(buildOrganizationDashboardPath('/scope-context', scope.organizationId), {
      token,
      query: buildScopeQuery(scope),
    })
  },

  listTemplates(scope: DashboardScopeQuery, token?: string | null) {
    return apiJson<DashboardTemplateListResponse>(buildOrganizationDashboardPath('/templates', scope.organizationId), {
      token,
      query: buildScopeQuery(scope),
    })
  },

  saveTemplate(
    payload: DashboardScopeQuery & {
      name: string
      description?: string
      visibility?: DashboardTemplateVisibility
      pageIds?: string[]
    },
    token?: string | null,
  ) {
    return apiJson<DashboardTemplate>(buildOrganizationDashboardPath('/templates', payload.organizationId), {
      method: 'POST',
      token,
      json: payload,
    })
  },

  deleteTemplate(templateId: string, scope: DashboardScopeQuery, token?: string | null) {
    return apiJson<{ success: boolean }>(
      `${buildOrganizationDashboardPath('/templates', scope.organizationId)}/${encodeURIComponent(templateId)}`,
      {
      method: 'DELETE',
      token,
      query: buildScopeQuery(scope),
      },
    )
  },

  applyTemplate(
    templateId: string,
    payload: DashboardScopeQuery & {
      mode: DashboardTemplateApplyMode
    },
    token?: string | null,
  ) {
    return apiJson<DashboardTemplateApplyResponse>(
      `${buildOrganizationDashboardPath('/templates', payload.organizationId)}/${encodeURIComponent(templateId)}/apply`,
      {
      method: 'POST',
      token,
      json: payload,
      },
    )
  },

  createPage(
    payload: DashboardScopeQuery & {
      name: string
      visibility: DashboardVisibility
      sharedUserIds?: string[]
      viewers?: DashboardPageViewer[]
    },
    token?: string | null,
  ) {
    return apiJson<DashboardPage>(buildOrganizationDashboardPath('/pages', payload.organizationId), {
      method: 'POST',
      token,
      json: payload,
    })
  },

  updatePage(
    pageId: string,
    payload: {
      name?: string
      visibility?: DashboardVisibility
    },
    token?: string | null,
  ) {
    return apiJson<DashboardPage>(
      `${buildOrganizationDashboardPath('/pages')}/${encodeURIComponent(pageId)}`,
      {
      method: 'PATCH',
      token,
      json: payload,
      },
    )
  },

  reorderPages(
    payload: DashboardScopeQuery & {
      orderedPageIds: string[]
    },
    token?: string | null,
  ) {
    return apiJson<{ success: boolean; items: DashboardPage[] }>(buildOrganizationDashboardPath('/pages/reorder', payload.organizationId), {
      method: 'PUT',
      token,
      json: payload,
    })
  },

  deletePage(pageId: string, token?: string | null) {
    return apiJson<{ success: boolean }>(`${buildOrganizationDashboardPath('/pages')}/${encodeURIComponent(pageId)}`, {
      method: 'DELETE',
      token,
    })
  },

  updateViewers(
    pageId: string,
    viewers: DashboardPageViewer[] | string[],
    token?: string | null,
  ) {
    const useLegacyUserIds = viewers.length === 0 || typeof viewers[0] === 'string'
    return apiJson<{ pageId: string; viewerUserIds: string[]; viewers?: DashboardPageViewer[] }>(
      `${buildOrganizationDashboardPath('/pages')}/${encodeURIComponent(pageId)}/viewers`,
      {
        method: 'PUT',
        token,
        json: useLegacyUserIds
          ? { userIds: viewers as string[] }
          : { viewers: viewers as DashboardPageViewer[] },
      },
    )
  },

  addWidget(
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
    token?: string | null,
  ) {
    return apiJson<DashboardWidget>(`${buildOrganizationDashboardPath('/pages')}/${encodeURIComponent(pageId)}/widgets`, {
      method: 'POST',
      token,
      json: payload,
    })
  },

  updateWidget(
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
    token?: string | null,
  ) {
    return apiJson<DashboardWidget>(
      `${buildOrganizationDashboardPath('/pages')}/${encodeURIComponent(pageId)}/widgets/${encodeURIComponent(widgetId)}`,
      {
        method: 'PATCH',
        token,
        json: payload,
      },
    )
  },

  deleteWidget(pageId: string, widgetId: string, token?: string | null) {
    return apiJson<{ success: boolean }>(
      `${buildOrganizationDashboardPath('/pages')}/${encodeURIComponent(pageId)}/widgets/${encodeURIComponent(widgetId)}`,
      {
        method: 'DELETE',
        token,
      },
    )
  },
}
