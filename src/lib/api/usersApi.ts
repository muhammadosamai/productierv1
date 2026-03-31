import { apiJson } from '@/lib/apiClient'
import { toHomeScopeQuery, type HomeScopeQueryOptions } from '@/composables/useHomeScope'
import { useOnboardingStore } from '@/stores/onboarding'
import type { HomeDashboardResponse } from '@/types/home'
import type { User } from '@/types/user'

export interface UserListQuery {
  q?: string
  productId?: string
  organizationId?: string
  paged?: 0 | 1
  page?: number
  limit?: number
}

export interface UserListResponse {
  items?: User[]
  total?: number
  page?: number
  limit?: number
}

export interface UserHomeSettingsPayload {
  widgetsOrder?: string[]
}

export interface UserWorkSettingsPayload {
  department?: string | null
  location?: string | null
  title?: string | null
  timezone?: string | null
  startDate?: string | null
}

export type HomeBriefView = 'my_tasks' | 'team' | 'executive'
export type HomeBriefMode = 'summary' | 'full'
export type HomeBriefScope = 'all_products' | 'product' | 'entity'
export type HomeBriefFallbackReason =
  | 'feature_disabled'
  | 'provider_not_ready'
  | 'missing_api_key'
  | 'provider_error'
  | 'timeout'
  | 'parse_error'
  | 'empty_sanitized_output'
export type HomeBriefTemplate =
  | 'executive_narrative'
  | 'delivery_risk'
  | 'workload_focus'
  | 'entity_deep_dive'
export type HomeBriefEntityFocusType = 'task' | 'story' | 'initiative' | 'delivery' | 'release'
export type UserDailyBriefItemSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type UserDailyBriefEntityType =
  | 'task'
  | 'story'
  | 'initiative'
  | 'delivery'
  | 'release'
  | 'test_cycle'
  | 'user'
  | 'wiki_asset'

export interface UserDailyBriefSectionItem {
  text: string
  severity?: UserDailyBriefItemSeverity
  entityType?: UserDailyBriefEntityType
  entityId?: string
  routePath?: string
}

export interface UserDailyBriefSection {
  id: string
  title: string
  items: UserDailyBriefSectionItem[]
}

export interface UserDailyBriefResponse {
  brief: string
  sections: UserDailyBriefSection[]
  generatedAt: string
  source: 'ai' | 'fallback' | 'disabled'
  fallbackReason?: HomeBriefFallbackReason | null
  view: HomeBriefView
  mode: HomeBriefMode
  scope?: HomeBriefScope
  productId?: string | null
  template?: HomeBriefTemplate
  strategy?: 'single' | 'chunked'
  entityFocus?: {
    entityType: HomeBriefEntityFocusType
    entityId: string
    entityLabel?: string
  } | null
  cached: boolean
}

function resolveOrganizationId(input?: string | null): string {
  const explicit = typeof input === 'string' ? input.trim() : ''
  if (explicit) return explicit
  const onboardingStore = useOnboardingStore()
  const fallback = onboardingStore.activeOrganizationId?.trim() || ''
  if (fallback) return fallback
  throw new Error('organizationId is required for user endpoints')
}

export const usersApi = {
  async list(query: UserListQuery = {}, token?: string | null): Promise<User[] | UserListResponse> {
    const organizationId = resolveOrganizationId(query.organizationId)
    const { organizationId: _organizationId, ...queryWithoutOrganization } = query
    const payload = await apiJson<unknown>(`/organizations/${encodeURIComponent(organizationId)}/users`, {
      token,
      query: queryWithoutOrganization as Record<string, string | number | boolean | null | undefined>,
    })

    if (Array.isArray(payload)) {
      return payload as User[]
    }
    return (payload ?? {}) as UserListResponse
  },

  getHome(
    userId: string,
    options: HomeScopeQueryOptions & {
      organizationId?: string | null
    } = {},
    token?: string | null,
  ) {
    const organizationId = resolveOrganizationId(options.organizationId)
    const scopeQuery = toHomeScopeQuery(options)
    return apiJson<HomeDashboardResponse>(`/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(userId)}/home`, {
      token,
      query: {
        scopeMode: scopeQuery.scopeMode,
        productId: scopeQuery.productId,
        teamId: scopeQuery.teamId,
      },
    })
  },

  getWork(userId: string, token?: string | null, organizationId?: string | null) {
    const resolvedOrganizationId = resolveOrganizationId(organizationId)
    return apiJson<unknown>(`/organizations/${encodeURIComponent(resolvedOrganizationId)}/users/${encodeURIComponent(userId)}/work`, {
      token,
    })
  },

  getDailyBrief(
    userId: string,
    options: {
      organizationId?: string | null
      scope?: HomeBriefScope
      scopeMode?: HomeScopeQueryOptions['scopeMode']
      productId?: string | null
      teamId?: string | null
      entityType?: HomeBriefEntityFocusType | null
      entityId?: string | null
      view?: HomeBriefView
      mode?: HomeBriefMode
      template?: HomeBriefTemplate
    },
    token?: string | null,
  ) {
    const organizationId = resolveOrganizationId(options.organizationId)
    const legacyScopeQuery = toHomeScopeQuery({
      scopeMode: options.scopeMode,
      productId: options.productId,
      teamId: options.teamId,
    })
    return apiJson<UserDailyBriefResponse>(
      `/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(userId)}/daily-brief`,
      {
      token,
      query: {
        scope: options.scope ?? undefined,
        scopeMode: options.scope ? undefined : legacyScopeQuery.scopeMode,
        productId: options.productId ?? legacyScopeQuery.productId,
        teamId: options.teamId ?? legacyScopeQuery.teamId,
        entityType: options.entityType ?? undefined,
        entityId: options.entityId ?? undefined,
        view: options.view ?? undefined,
        mode: options.mode ?? undefined,
        template: options.template ?? undefined,
      },
      },
    )
  },

  updateHome(userId: string, value: UserHomeSettingsPayload, token?: string | null, organizationId?: string | null) {
    const resolvedOrganizationId = resolveOrganizationId(organizationId)
    return apiJson<unknown>(`/organizations/${encodeURIComponent(resolvedOrganizationId)}/users/${encodeURIComponent(userId)}/home`, {
      method: 'PUT',
      token,
      json: value,
    })
  },

  updateWork(userId: string, value: UserWorkSettingsPayload, token?: string | null, organizationId?: string | null) {
    const resolvedOrganizationId = resolveOrganizationId(organizationId)
    return apiJson<unknown>(`/organizations/${encodeURIComponent(resolvedOrganizationId)}/users/${encodeURIComponent(userId)}/work`, {
      method: 'PUT',
      token,
      json: value,
    })
  },
}
