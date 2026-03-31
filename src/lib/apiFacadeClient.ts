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
