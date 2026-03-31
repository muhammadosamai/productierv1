import { apiJson } from '@/lib/api/core'
import type {
  RolePagePermission,
  RoleTitlePermissionsResponse,
  RoleTitleSummary,
  RolesCatalogResponse,
  RolesMyPermissionsResponse,
  RolesPermissionsResponse,
  RolesTitlesResponse,
} from '@/lib/apiClient'

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
