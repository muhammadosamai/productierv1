export * from './apiFacadeClient'
import type { User, UserTitle } from '@/types/user'

export interface RolePagePermission {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
}

export interface RolesPermissionsResponse {
  permissions: Record<string, Record<string, RolePagePermission>>
  pages?: string[]
  catalog?: Array<{ key: string; label: string; routePrefixes: string[]; selfViewConfigurable: boolean }>
  configurableRoles?: Array<{ key: string; label: string }>
}

export interface RolesMyPermissionsResponse {
  pages: Record<string, RolePagePermission>
  title?: UserTitle | null
  fallbackToRoleOnly?: boolean
  effectivePermissionFormula?: string
  source?: 'role_and_title' | 'role_only_fallback'
}

export interface RolesCatalogResponse {
  pages: Array<{ key: string; label: string; routePrefixes: string[]; selfViewConfigurable: boolean }>
  configurableRoles: Array<{ key: string; label: string }>
  effectivePermissionFormula?: string
}

export interface RoleTitleSummary {
  id: string
  key: string
  name: string
  description: string | null
  isActive: boolean
  isSystem: boolean
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
  assignedUsersCount?: number
  permissionCount?: number
}

export interface RolesTitlesResponse {
  titles: RoleTitleSummary[]
  effectivePermissionFormula?: string
}

export interface RoleTitlePermissionsResponse {
  title: {
    id: string
    key: string
    name: string
    description: string | null
    isActive: boolean
    isSystem: boolean
  }
  pages: Record<string, RolePagePermission>
  catalog?: Array<{ key: string; label: string; routePrefixes: string[]; selfViewConfigurable: boolean }>
  effectivePermissionFormula?: string
}

export interface ApiProduct {
  id?: string
  organizationId?: string | null
  name: string
  logo?: string | null
  description?: string | null
}

export interface ApiProductMember {
  id: string
  productId: string
  role: string
  addedAt: string
  userId: string
  userName: string
  userEmail: string
  userAvatar: string | null
  userRole: string
  userCreatedAt: string
  tasksAssigned: number
  tasksCompleted: number
}

export interface ApiOrganizationTeamMember {
  id: string
  organizationTeamId: string
  userId: string
  role: 'member' | 'lead'
  userName?: string
  userEmail?: string
  userAvatar?: string | null
}

export interface ApiOrganizationTeam {
  id: string
  organizationId: string
  name: string
  key: string
  description: string | null
  leadUserId: string | null
  leadUserIds?: string[]
  createdByUserId: string
  createdAt: string
  updatedAt: string
  members?: ApiOrganizationTeamMember[]
}

export interface AuthPayload {
  token: string
  user: User
  organization?: {
    id: string
    name: string
    slug: string
  } | null
  onboarding?: {
    currentStep: 'organization' | 'workspace'
    isCompleted: boolean
    organizationId: string | null
  } | null
}

export type OnboardingStep = 'account' | 'organization' | 'workspace' | 'invites' | 'completed'

export interface OnboardingStateResponse {
  progress: {
    currentStep: OnboardingStep
    isCompleted: boolean
    completedAt: string | null
  }
  activeOrganizationId: string | null
  organizations: Array<{
    id: string
    name: string
    slug: string
    description: string | null
    logo: string | null
    role: 'owner' | 'admin' | 'member' | 'viewer'
    workspaceCount: number
    pendingInviteCount: number
  }>
}

export interface OnboardingInviteRecord {
  id: string
  organizationId: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  expiresAt: string
  acceptedAt: string | null
  cancelledAt: string | null
  createdAt: string
}

export type { ApiRequestOptions } from '@/lib/api/core'
export { ApiError, API_BASE_URL, buildApiUrl, apiFetch, apiJson } from '@/lib/api/core'
export { metadataApi } from '@/lib/api/metadataApi'
export { rolesApi } from '@/lib/api/rolesApi'
export { authApi } from '@/lib/api/authApi'
export { onboardingApi } from '@/lib/api/onboardingApi'
export { productsApi, organizationTeamsApi } from '@/lib/api/productsApi'
export { settingsApi } from '@/lib/api/settingsApi'
export { notificationsApi } from '@/lib/api/notificationsApi'
/* import type { User, UserTitle } from '@/types/user'

export interface RolePagePermission {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
}

export interface RolesPermissionsResponse {
  permissions: Record<string, Record<string, RolePagePermission>>
  pages?: string[]
  catalog?: Array<{ key: string; label: string; routePrefixes: string[]; selfViewConfigurable: boolean }>
  configurableRoles?: Array<{ key: string; label: string }>
}

export interface RolesMyPermissionsResponse {
  pages: Record<string, RolePagePermission>
  title?: UserTitle | null
  fallbackToRoleOnly?: boolean
  effectivePermissionFormula?: string
  source?: 'role_and_title' | 'role_only_fallback'
}

export interface RolesCatalogResponse {
  pages: Array<{ key: string; label: string; routePrefixes: string[]; selfViewConfigurable: boolean }>
  configurableRoles: Array<{ key: string; label: string }>
  effectivePermissionFormula?: string
}

export interface RoleTitleSummary {
  id: string
  key: string
  name: string
  description: string | null
  isActive: boolean
  isSystem: boolean
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
  assignedUsersCount?: number
  permissionCount?: number
}

export interface RolesTitlesResponse {
  titles: RoleTitleSummary[]
  effectivePermissionFormula?: string
}

export interface RoleTitlePermissionsResponse {
  title: {
    id: string
    key: string
    name: string
    description: string | null
    isActive: boolean
    isSystem: boolean
  }
  pages: Record<string, RolePagePermission>
  catalog?: Array<{ key: string; label: string; routePrefixes: string[]; selfViewConfigurable: boolean }>
  effectivePermissionFormula?: string
}

export interface ApiProduct {
  id?: string
  organizationId?: string | null
  name: string
  logo?: string | null
  description?: string | null
}

export interface ApiProductMember {
  id: string
  productId: string
  role: string
  addedAt: string
  userId: string
  userName: string
  userEmail: string
  userAvatar: string | null
  userRole: string
  userCreatedAt: string
  tasksAssigned: number
  tasksCompleted: number
}

export interface ApiOrganizationTeamMember {
  id: string
  organizationTeamId: string
  userId: string
  role: 'member' | 'lead'
  userName?: string
  userEmail?: string
  userAvatar?: string | null
}

export interface ApiOrganizationTeam {
  id: string
  organizationId: string
  name: string
  key: string
  description: string | null
  leadUserId: string | null
  leadUserIds?: string[]
  createdByUserId: string
  createdAt: string
  updatedAt: string
  members?: ApiOrganizationTeamMember[]
}

export interface AuthPayload {
  token: string
  user: User
  organization?: {
    id: string
    name: string
    slug: string
  } | null
  onboarding?: {
    currentStep: 'organization' | 'workspace'
    isCompleted: boolean
    organizationId: string | null
  } | null
}

export type OnboardingStep = 'account' | 'organization' | 'workspace' | 'invites' | 'completed'

export interface OnboardingStateResponse {
  progress: {
    currentStep: OnboardingStep
    isCompleted: boolean
    completedAt: string | null
  }
  activeOrganizationId: string | null
  organizations: Array<{
    id: string
    name: string
    slug: string
    description: string | null
    logo: string | null
    role: 'owner' | 'admin' | 'member' | 'viewer'
    workspaceCount: number
    pendingInviteCount: number
  }>
}

export interface OnboardingInviteRecord {
  id: string
  organizationId: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  expiresAt: string
  acceptedAt: string | null
  cancelledAt: string | null
  createdAt: string
}

export type { ApiRequestOptions } from '@/lib/api/core'
export { ApiError, API_BASE_URL, buildApiUrl, apiFetch, apiJson } from '@/lib/api/core'
export { metadataApi } from '@/lib/api/metadataApi'
export { rolesApi } from '@/lib/api/rolesApi'
export { authApi } from '@/lib/api/authApi'
export { onboardingApi } from '@/lib/api/onboardingApi'
export { productsApi, organizationTeamsApi } from '@/lib/api/productsApi'
export { settingsApi } from '@/lib/api/settingsApi'
export { notificationsApi } from '@/lib/api/notificationsApi'
import type { MetadataEnumsResponse, MetadataNavigationResponse, MetadataPagesResponse, MetadataRoutesResponse, MetadataSettingsKeysResponse } from '@/types/metadata'
import type { User, UserTitle } from '@/types/user'
import type {
  NotificationCategory,
  NotificationInboxFacetsResponse,
  NotificationInboxResponse,
  NotificationItem,
  NotificationPreference,
  NotificationPreferencePreset,
  NotificationSeverity,
  NotificationUrgency,
} from '@/types/notification'

type ApiQueryValue = string | number | boolean | null | undefined
type ApiQuery = Record<string, ApiQueryValue>

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  token?: string | null
  query?: ApiQuery
  json?: unknown
  body?: BodyInit | null
}

export interface RolePagePermission {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
}

export interface RolesPermissionsResponse {
  permissions: Record<string, Record<string, RolePagePermission>>
  pages?: string[]
  catalog?: Array<{ key: string; label: string; routePrefixes: string[]; selfViewConfigurable: boolean }>
  configurableRoles?: Array<{ key: string; label: string }>
}

export interface RolesMyPermissionsResponse {
  pages: Record<string, RolePagePermission>
  title?: UserTitle | null
  fallbackToRoleOnly?: boolean
  effectivePermissionFormula?: string
  source?: 'role_and_title' | 'role_only_fallback'
}

export interface RolesCatalogResponse {
  pages: Array<{ key: string; label: string; routePrefixes: string[]; selfViewConfigurable: boolean }>
  configurableRoles: Array<{ key: string; label: string }>
  effectivePermissionFormula?: string
}

export interface RoleTitleSummary {
  id: string
  key: string
  name: string
  description: string | null
  isActive: boolean
  isSystem: boolean
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
  assignedUsersCount?: number
  permissionCount?: number
}

export interface RolesTitlesResponse {
  titles: RoleTitleSummary[]
  effectivePermissionFormula?: string
}

export interface RoleTitlePermissionsResponse {
  title: {
    id: string
    key: string
    name: string
    description: string | null
    isActive: boolean
    isSystem: boolean
  }
  pages: Record<string, RolePagePermission>
  catalog?: Array<{ key: string; label: string; routePrefixes: string[]; selfViewConfigurable: boolean }>
  effectivePermissionFormula?: string
}

export interface ApiProduct {
  id?: string
  organizationId?: string | null
  name: string
  logo?: string | null
  description?: string | null
}

export interface ApiProductMember {
  id: string
  productId: string
  role: string
  addedAt: string
  userId: string
  userName: string
  userEmail: string
  userAvatar: string | null
  userRole: string
  userCreatedAt: string
  tasksAssigned: number
  tasksCompleted: number
}

export interface ApiOrganizationTeamMember {
  id: string
  organizationTeamId: string
  userId: string
  role: 'member' | 'lead'
  userName?: string
  userEmail?: string
  userAvatar?: string | null
}

export interface ApiOrganizationTeam {
  id: string
  organizationId: string
  name: string
  key: string
  description: string | null
  leadUserId: string | null
  leadUserIds?: string[]
  createdByUserId: string
  createdAt: string
  updatedAt: string
  members?: ApiOrganizationTeamMember[]
}

export interface AuthPayload {
  token: string
  user: User
  organization?: {
    id: string
    name: string
    slug: string
  } | null
  onboarding?: {
    currentStep: 'organization' | 'workspace'
    isCompleted: boolean
    organizationId: string | null
  } | null
}

export type OnboardingStep = 'account' | 'organization' | 'workspace' | 'invites' | 'completed'

export interface OnboardingStateResponse {
  progress: {
    currentStep: OnboardingStep
    isCompleted: boolean
    completedAt: string | null
  }
  activeOrganizationId: string | null
  organizations: Array<{
    id: string
    name: string
    slug: string
    description: string | null
    logo: string | null
    role: 'owner' | 'admin' | 'member' | 'viewer'
    workspaceCount: number
    pendingInviteCount: number
  }>
}

export interface OnboardingInviteRecord {
  id: string
  organizationId: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  expiresAt: string
  acceptedAt: string | null
  cancelledAt: string | null
  createdAt: string
}

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

function resolveApiBaseUrl(): string {
  const candidate = (import.meta.env.VITE_API_BASE_URL || '/api').trim()
  if (!candidate) return '/api'
  return candidate.endsWith('/') ? candidate.slice(0, -1) : candidate
}

export const API_BASE_URL = resolveApiBaseUrl()

function trimApiPrefix(path: string): string {
  if (path === '/api') return '/'
  if (path.startsWith('/api/')) return path.slice(4)
  return path
}

function normalizePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return trimApiPrefix(normalized)
}

function appendQuery(url: string, query?: ApiQuery): string {
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    params.set(key, String(value))
  }
  const encoded = params.toString()
  if (!encoded) return url
  return `${url}${url.includes('?') ? '&' : '?'}${encoded}`
}

export function buildApiUrl(path: string, query?: ApiQuery): string {
  if (/^https?:\/\//i.test(path)) {
    return appendQuery(path, query)
  }
  const normalizedPath = normalizePath(path)
  return appendQuery(`${API_BASE_URL}${normalizedPath}`, query)
}

async function readPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }
  try {
    return await response.text()
  } catch {
    return null
  }
}

function payloadErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const errorValue = (payload as Record<string, unknown>).error
  if (typeof errorValue === 'string' && errorValue.trim()) return errorValue
  const messageValue = (payload as Record<string, unknown>).message
  if (typeof messageValue === 'string' && messageValue.trim()) return messageValue
  return null
}

async function toApiError(response: Response): Promise<ApiError> {
  const payload = await readPayload(response)
  const message = payloadErrorMessage(payload) ?? `Request failed (${response.status})`
  return new ApiError(response.status, message, payload)
}

export async function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const {
    token,
    query,
    json,
    body,
    headers: providedHeaders,
    ...init
  } = options

  const headers = new Headers(providedHeaders ?? {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let requestBody: BodyInit | null | undefined = body
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    requestBody = JSON.stringify(json)
  }

  return fetch(buildApiUrl(path, query), {
    ...init,
    headers,
    body: requestBody,
  })
}

export async function apiJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options)
  if (!response.ok) {
    throw await toApiError(response)
  }
  return await response.json() as T
}

export const metadataApi = {
  getPages(token?: string | null) {
    return apiJson<MetadataPagesResponse>('/metadata/pages', { token })
  },
  getRoutes(token?: string | null) {
    return apiJson<MetadataRoutesResponse>('/metadata/routes', { token })
  },
  getNavigation(token?: string | null) {
    return apiJson<MetadataNavigationResponse>('/metadata/navigation', { token })
  },
  getEnums(token?: string | null) {
    return apiJson<MetadataEnumsResponse>('/metadata/enums', { token })
  },
  getSettingsKeys(token?: string | null) {
    return apiJson<MetadataSettingsKeysResponse>('/metadata/settings-keys', { token })
  },
}

export const rolesApi = {
  getCatalog(token?: string | null) {
    return apiJson<RolesCatalogResponse>('/roles/catalog', { token })
  },
  getPermissions(token?: string | null) {
    return apiJson<RolesPermissionsResponse>('/roles/permissions', { token })
  },
  updatePermissions(
    role: string,
    pages: Record<string, RolePagePermission>,
    token?: string | null,
  ) {
    return apiJson<{ success: boolean }>('/roles/permissions', {
      method: 'PUT',
      token,
      json: { role, pages },
    })
  },
  getMyPermissions(token?: string | null) {
    return apiJson<RolesMyPermissionsResponse>('/roles/my-permissions', { token })
  },
  getTitles(token?: string | null) {
    return apiJson<RolesTitlesResponse>('/roles/titles', { token })
  },
  createTitle(
    payload: {
      name: string
      key?: string
      description?: string
      baseRole?: string
    },
    token?: string | null,
  ) {
    return apiJson<RoleTitleSummary>('/roles/titles', {
      method: 'POST',
      token,
      json: payload,
    })
  },
  updateTitle(
    titleId: string,
    payload: {
      name?: string
      description?: string | null
      isActive?: boolean
    },
    token?: string | null,
  ) {
    return apiJson<RoleTitleSummary>(`/roles/titles/${encodeURIComponent(titleId)}`, {
      method: 'PUT',
      token,
      json: payload,
    })
  },
  getTitlePermissions(titleId: string, token?: string | null) {
    return apiJson<RoleTitlePermissionsResponse>(`/roles/titles/${encodeURIComponent(titleId)}/permissions`, { token })
  },
  updateTitlePermissions(
    titleId: string,
    pages: Record<string, RolePagePermission>,
    token?: string | null,
  ) {
    return apiJson<{ success: boolean }>(`/roles/titles/${encodeURIComponent(titleId)}/permissions`, {
      method: 'PUT',
      token,
      json: { pages },
    })
  },
}

export const authApi = {
  login(email: string, password: string) {
    return apiJson<AuthPayload>('/auth/login', {
      method: 'POST',
      json: { email, password },
    })
  },
  register(
    name: string,
    email: string,
    password: string,
    options?: {
      organizationName?: string
      bootstrapOrganization?: boolean
    },
  ) {
    return apiJson<AuthPayload>('/auth/register', {
      method: 'POST',
      json: {
        name,
        email,
        password,
        organizationName: options?.organizationName,
        bootstrapOrganization: options?.bootstrapOrganization,
      },
    })
  },
  forgotPassword(email: string) {
    return apiJson<unknown>('/auth/forgot-password', {
      method: 'POST',
      json: { email },
    })
  },
  me(token?: string | null) {
    return apiJson<User>('/auth/me', { token })
  },
  updateProfile(data: { name?: string; email?: string; avatar?: string }, token?: string | null) {
    return apiJson<User>('/auth/profile', {
      method: 'PUT',
      token,
      json: data,
    })
  },
}

export const onboardingApi = {
  getState(token?: string | null) {
    return apiJson<OnboardingStateResponse>('/onboarding/state', { token })
  },
  createOrganization(
    payload: {
      name: string
      description?: string | null
      logo?: string | null
    },
    token?: string | null,
  ) {
    return apiJson<{
      organization: {
        id: string
        name: string
        slug: string
        description: string | null
        logo: string | null
      }
      memberRole: 'owner'
      onboarding: { currentStep: 'workspace'; isCompleted: false }
    }>('/onboarding/organization', {
      method: 'POST',
      token,
      json: payload,
    })
  },
  updateOrganization(
    organizationId: string,
    payload: {
      name?: string
      description?: string | null
      logo?: string | null
    },
    token?: string | null,
  ) {
    return apiJson<{
      organization: {
        id: string
        name: string
        slug: string
        description: string | null
        logo: string | null
      }
      onboarding: { currentStep: OnboardingStep; isCompleted: boolean }
    }>(`/onboarding/organization/${encodeURIComponent(organizationId)}`, {
      method: 'PATCH',
      token,
      json: payload,
    })
  },
  async uploadOrganizationLogo(
    file: File,
    organizationId?: string | null,
    token?: string | null,
  ) {
    const form = new FormData()
    form.set('file', file)
    if (organizationId) {
      form.set('organizationId', organizationId)
    }
    const response = await apiFetch('/onboarding/organization/upload-logo', {
      method: 'POST',
      token,
      body: form,
    })
    if (!response.ok) {
      throw await toApiError(response)
    }
    return await response.json() as { logo: string }
  },
  createWorkspace(
    payload: {
      organizationId: string
      name: string
      logo?: string | null
      description?: string | null
    },
    token?: string | null,
  ) {
    return apiJson<{
      product: ApiProduct
      onboarding: { currentStep: 'invites'; isCompleted: false }
    }>('/onboarding/workspace', {
      method: 'POST',
      token,
      json: payload,
    })
  },
  listInvites(organizationId: string, token?: string | null) {
    return apiJson<OnboardingInviteRecord[]>('/onboarding/invites', {
      token,
      query: { organizationId },
    })
  },
  createInvites(
    payload: {
      organizationId: string
      invites: Array<{
        email: string
        role?: 'owner' | 'admin' | 'member' | 'viewer'
      }>
    },
    token?: string | null,
  ) {
    return apiJson<{
      created: Array<{
        id: string
        email: string
        role: 'owner' | 'admin' | 'member' | 'viewer'
        status: 'pending'
        expiresAt: string
        inviteLink: string
      }>
      skipped: Array<{ email: string; reason: string }>
      onboarding: { currentStep: 'invites'; isCompleted: false }
    }>('/onboarding/invites', {
      method: 'POST',
      token,
      json: payload,
    })
  },
  cancelInvite(inviteId: string, token?: string | null) {
    return apiJson<{ success: boolean }>(`/onboarding/invites/${encodeURIComponent(inviteId)}`, {
      method: 'DELETE',
      token,
    })
  },
  acceptInvite(
    payload: { token: string },
    token?: string | null,
  ) {
    return apiJson<{
      success: boolean
      organization: { id: string; name: string; slug: string } | null
      membershipRole: 'owner' | 'admin' | 'member' | 'viewer'
      onboarding: { currentStep: OnboardingStep; isCompleted: boolean }
    }>('/onboarding/invites/accept', {
      method: 'POST',
      token,
      json: payload,
    })
  },
  cancelSignup(token?: string | null) {
    return apiJson<{
      success: boolean
      deletedOrganizations: number
      deletedUserId: string
    }>('/onboarding/cancel-signup', {
      method: 'POST',
      token,
      json: {},
    })
  },
  complete(
    payload: { organizationId?: string },
    token?: string | null,
  ) {
    return apiJson<{ success: boolean }>('/onboarding/complete', {
      method: 'POST',
      token,
      json: payload,
    })
  },
}

export const productsApi = {
  list(organizationId: string, token?: string | null) {
    return apiJson<ApiProduct[]>(
      `/organizations/${encodeURIComponent(organizationId)}/products`,
      { token },
    )
  },
  create(
    organizationId: string,
    payload: {
      name: string
      logo?: string | null
      description?: string | null
      members?: { userId: string; role?: string }[]
    },
    token?: string | null,
  ) {
    return apiJson<ApiProduct>(`/organizations/${encodeURIComponent(organizationId)}/products`, {
      method: 'POST',
      token,
      json: payload,
    })
  },
  getMembers(organizationId: string, productId: string, token?: string | null) {
    return apiJson<ApiProductMember[]>(
      `/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(productId)}/members`,
      { token },
    )
  },
}

export const organizationTeamsApi = {
  list(
    organizationId: string,
    options: { includeMembers?: boolean } = {},
    token?: string | null,
  ) {
    return apiJson<ApiOrganizationTeam[]>(
      `/organizations/${encodeURIComponent(organizationId)}/teams`,
      {
        token,
        query: {
          includeMembers: options.includeMembers ? '1' : undefined,
        },
      },
    )
  },
  create(
    organizationId: string,
    payload: {
      name: string
      key?: string
      description?: string | null
      leadUserId?: string | null
      leadUserIds?: string[]
      memberUserIds?: string[]
    },
    token?: string | null,
  ) {
    return apiJson<ApiOrganizationTeam>(
      `/organizations/${encodeURIComponent(organizationId)}/teams`,
      {
        method: 'POST',
        token,
        json: payload,
      },
    )
  },
  update(
    organizationId: string,
    teamId: string,
    payload: {
      name?: string
      key?: string
      description?: string | null
      leadUserId?: string | null
      leadUserIds?: string[]
    },
    token?: string | null,
  ) {
    return apiJson<ApiOrganizationTeam>(
      `/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}`,
      {
        method: 'PATCH',
        token,
        json: payload,
      },
    )
  },
  remove(organizationId: string, teamId: string, token?: string | null) {
    return apiJson<{ success: boolean }>(
      `/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}`,
      {
        method: 'DELETE',
        token,
      },
    )
  },
  getMembers(organizationId: string, teamId: string, token?: string | null) {
    return apiJson<ApiOrganizationTeamMember[]>(
      `/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members`,
      { token },
    )
  },
  addMember(
    organizationId: string,
    teamId: string,
    payload: { userId: string; role?: 'member' | 'lead' },
    token?: string | null,
  ) {
    return apiJson<ApiOrganizationTeamMember>(
      `/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members`,
      {
        method: 'POST',
        token,
        json: payload,
      },
    )
  },
  removeMember(organizationId: string, teamId: string, userId: string, token?: string | null) {
    return apiJson<{ success: boolean }>(
      `/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        token,
      },
    )
  },
  setLead(
    organizationId: string,
    teamId: string,
    userId: string | null,
    token?: string | null,
    userIds?: string[],
  ) {
    return apiJson<ApiOrganizationTeam>(
      `/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/lead`,
      {
        method: 'PUT',
        token,
        json: { userId, userIds },
      },
    )
  },
}

export const settingsApi = {
  getAll(token?: string | null) {
    return apiJson<Record<string, unknown>>('/settings', { token })
  },
  getByKey(key: string, token?: string | null) {
    return apiJson<{ key: string; value: unknown }>(`/settings/${encodeURIComponent(key)}`, { token })
  },
  setByKey(key: string, value: unknown, token?: string | null) {
    return apiJson<{ key: string; value: unknown }>(`/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      token,
      json: { value },
    })
  },
}

export const notificationsApi = {
  list(
    options: {
      limit?: number
      cursor?: string | null
      unreadOnly?: boolean
      includeArchived?: boolean
      includeMuted?: boolean
      includeSnoozed?: boolean
      category?: NotificationCategory
      urgency?: NotificationUrgency
      severity?: NotificationSeverity
      entityType?: string
      type?: string
      productId?: string
    },
    token?: string | null,
  ) {
    return apiJson<NotificationInboxResponse>('/notifications', {
      token,
      query: {
        limit: options.limit,
        cursor: options.cursor ?? undefined,
        unreadOnly: options.unreadOnly,
        includeArchived: options.includeArchived,
        includeMuted: options.includeMuted,
        includeSnoozed: options.includeSnoozed,
        category: options.category,
        urgency: options.urgency,
        severity: options.severity,
        entityType: options.entityType,
        type: options.type,
        productId: options.productId,
      },
    })
  },
  unreadCount(productId?: string, token?: string | null) {
    return apiJson<{ unreadCount: number }>('/notifications/unread-count', {
      token,
      query: {
        productId,
      },
    })
  },
  facets(
    options: {
      unreadOnly?: boolean
      includeArchived?: boolean
      includeMuted?: boolean
      includeSnoozed?: boolean
      category?: NotificationCategory
      urgency?: NotificationUrgency
      severity?: NotificationSeverity
      entityType?: string
      type?: string
      productId?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<NotificationInboxFacetsResponse>('/notifications/facets', {
      token,
      query: {
        unreadOnly: options.unreadOnly,
        includeArchived: options.includeArchived,
        includeMuted: options.includeMuted,
        includeSnoozed: options.includeSnoozed,
        category: options.category,
        urgency: options.urgency,
        severity: options.severity,
        entityType: options.entityType,
        type: options.type,
        productId: options.productId,
      },
    })
  },
  markRead(ids: string[], token?: string | null) {
    return apiJson<{
      success: boolean
      updated: number
      unreadCount: number
      events?: Array<{ type: 'notification_read'; unreadCount: number; updated: number; emittedAt: string }>
    }>('/notifications/read', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  markAllRead(
    filters: {
      productId?: string
      category?: NotificationCategory
      urgency?: NotificationUrgency
      severity?: NotificationSeverity
      entityType?: string
      type?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<{
      success: boolean
      updated: number
      unreadCount: number
      events?: Array<{ type: 'notification_read'; unreadCount: number; updated: number; emittedAt: string }>
    }>('/notifications/read-all', {
      method: 'POST',
      token,
      json: filters,
    })
  },
  archive(ids: string[], token?: string | null) {
    return apiJson<{ success: boolean; archived: number }>('/notifications/archive', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  archiveAll(
    filters: {
      productId?: string
      category?: NotificationCategory
      urgency?: NotificationUrgency
      severity?: NotificationSeverity
      entityType?: string
      type?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<{ success: boolean; archived: number }>('/notifications/archive-all', {
      method: 'POST',
      token,
      json: filters,
    })
  },
  mute(ids: string[], token?: string | null) {
    return apiJson<{ success: boolean; updated: number }>('/notifications/mute', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  unmute(ids: string[], token?: string | null) {
    return apiJson<{ success: boolean; updated: number }>('/notifications/unmute', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  snooze(ids: string[], untilAt: string, token?: string | null) {
    return apiJson<{ success: boolean; updated: number; snoozedUntil: string }>('/notifications/snooze', {
      method: 'POST',
      token,
      json: { ids, untilAt },
    })
  },
  unsnooze(ids: string[], token?: string | null) {
    return apiJson<{ success: boolean; updated: number }>('/notifications/unsnooze', {
      method: 'POST',
      token,
      json: { ids },
    })
  },
  getPreferences(
    options: {
      productId?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<{ preferences: NotificationPreference[]; preset?: NotificationPreferencePreset }>('/notifications/preferences', {
      token,
      query: {
        productId: options.productId,
      },
    })
  },
  updatePreferences(
    preferences: NotificationPreference[],
    options: {
      productId?: string
    } = {},
    token?: string | null,
  ) {
    return apiJson<{ preferences: NotificationPreference[]; preset?: NotificationPreferencePreset }>('/notifications/preferences', {
      method: 'PUT',
      token,
      json: {
        productId: options.productId,
        preferences,
      },
    })
  },
  adminPublish(
    payload: {
      productId?: string
      action: string
      entityType?: string
      entityId?: string
      entityTitle?: string
      message?: string
      routePath?: string
      recipientUserIds?: string[]
      subjectUserIds?: string[]
      changes?: Array<{ field: string; from: string | null; to: string | null }>
    },
    token?: string | null,
  ) {
    return apiJson<{ success: boolean; published: number; deduped: number; recipientsConsidered: number }>(
      '/notifications/admin/publish',
      {
        method: 'POST',
        token,
        json: payload,
      },
    )
  },
  adminStats(token?: string | null) {
    return apiJson<{
      stats: {
        published: number
        deduped: number
        skippedByPreference: number
        skippedByPermission: number
        skippedBySelfViewOnly: number
        skippedByMembership: number
        skippedByDisabledFlag: number
        publishFailures: number
        readVisibilityFiltered?: number
        readVisibilityRedacted?: number
        actorScopeDenied?: number
        digestEscalationsPublished?: number
        unreadDriftWarnings?: number
        reminderSweeps?: number
        reminderCandidates?: number
        reminderPublished?: number
        reminderCooldownSkipped?: number
        rollupSweeps?: number
        rollupCandidates?: number
        rollupPublished?: number
        rollupAlreadySentToday?: number
        rollupDeduped?: number
        inboxQueries?: number
        inboxSlowOver500ms?: number
        inboxTotalLatencyMs?: number
        inboxAvgLatencyMs?: number
        lastInboxLatencyMs?: number
        channelQuietHoursSuppressed?: number
        emailDispatchAttempts?: number
        emailDispatchFailures?: number
        emailDispatchSuccess?: number
        slackDispatchAttempts?: number
        slackDispatchFailures?: number
        slackDispatchSuccess?: number
      }
    }>('/notifications/admin/stats', { token })
  },
  castItems(items: NotificationItem[] | undefined): NotificationItem[] {
    return Array.isArray(items) ? items : []
  },
}
*/
