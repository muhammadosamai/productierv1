import { apiFetch, apiJson, toApiError } from '@/lib/api/core'
import type { User } from '@/types/user'
import type {
  ApiProduct,
  OnboardingInviteRecord,
  OnboardingStateResponse,
  OnboardingStep,
} from '@/lib/apiClient'

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
        name?: string | null
        role?: 'owner' | 'admin' | 'member' | 'viewer'
        workspaceProductId?: string | null
        organizationTeamId?: string | null
        titleId?: string | null
      }>
    },
    token?: string | null,
  ) {
    return apiJson<{
      created: Array<{
        id: string
        email: string
        inviteeName?: string | null
        role: 'owner' | 'admin' | 'member' | 'viewer'
        workspaceProductId?: string | null
        organizationTeamId?: string | null
        titleId?: string | null
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
  activateInvite(
    payload: {
      token: string
      password: string
      name?: string | null
    },
    token?: string | null,
  ) {
    return apiJson<{
      success: boolean
      token: string
      user: User
      organization: { id: string; name: string; slug: string } | null
      membershipRole: 'owner' | 'admin' | 'member' | 'viewer'
      onboarding: { currentStep: OnboardingStep; isCompleted: boolean }
    }>('/onboarding/invites/activate', {
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
