import { apiJson } from '@/lib/api/core'
import type {
  ApiOrganizationTeam,
  ApiOrganizationTeamMember,
  ApiProduct,
  ApiProductMember,
} from '@/lib/apiClient'

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
