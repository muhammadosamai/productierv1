import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  ApiError,
  onboardingApi,
  type OnboardingInviteRecord,
  type OnboardingStateResponse,
  type OnboardingStep,
} from '@/lib/apiClient'
import { useAuthStore } from './auth'

type OrganizationSummary = OnboardingStateResponse['organizations'][number]

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message || fallback
  }
  if (error instanceof Error) {
    return error.message || fallback
  }
  return fallback
}

function normalizeStep(step: unknown): OnboardingStep {
  if (
    step === 'account'
    || step === 'organization'
    || step === 'workspace'
    || step === 'invites'
    || step === 'completed'
  ) {
    return step
  }
  return 'organization'
}

function resolveActiveOrganizationId(input: {
  requested: string | null | undefined
  organizations: OrganizationSummary[]
  fallback: string | null
}): string | null {
  const ids = new Set(input.organizations.map((item) => item.id))
  if (input.requested && ids.has(input.requested)) return input.requested
  if (input.fallback && ids.has(input.fallback)) return input.fallback
  return input.organizations[0]?.id || null
}

function deriveClientStep(input: {
  progressStep: unknown
  isCompleted: boolean
  activeOrganizationId: string | null
  organizations: OrganizationSummary[]
}): OnboardingStep {
  if (input.isCompleted) return 'completed'
  if (!input.activeOrganizationId) return 'organization'

  const activeOrganization = input.organizations.find((item) => item.id === input.activeOrganizationId) || null
  const workspaceCount = Number(activeOrganization?.workspaceCount || 0)
  if (workspaceCount <= 0) return 'workspace'

  const normalizedStep = normalizeStep(input.progressStep)
  if (normalizedStep === 'invites') return 'invites'

  // Once an organization has at least one workspace, onboarding should move into invite completion.
  return 'invites'
}

export const useOnboardingStore = defineStore('onboarding', () => {
  const authStore = useAuthStore()

  const loading = ref(false)
  const invitesLoading = ref(false)
  const logoUploading = ref(false)
  const submitting = ref(false)
  const loaded = ref(false)
  const loadedForUserId = ref<string | null>(null)
  const error = ref<string | null>(null)

  const progress = ref<{
    currentStep: OnboardingStep
    isCompleted: boolean
    completedAt: string | null
  }>({
    currentStep: 'organization',
    isCompleted: false,
    completedAt: null,
  })
  const organizations = ref<OrganizationSummary[]>([])
  const activeOrganizationId = ref<string | null>(null)

  const invites = ref<OnboardingInviteRecord[]>([])
  const lastCreatedInviteLinks = ref<Array<{ id: string; email: string; inviteLink: string }>>([])
  const lastSkippedInvites = ref<Array<{ email: string; reason: string }>>([])

  const activeOrganization = computed(() => (
    organizations.value.find((item) => item.id === activeOrganizationId.value) || null
  ))

  const isOnboardingComplete = computed(() => progress.value.isCompleted)

  async function fetchState(options: { silent?: boolean } = {}): Promise<boolean> {
    if (!authStore.token) return false
    const withBlockingLoader = options.silent !== true
    if (withBlockingLoader) loading.value = true
    error.value = null
    try {
      const payload = await onboardingApi.getState(authStore.token)
      const resolvedOrganizations = Array.isArray(payload.organizations) ? payload.organizations : []
      organizations.value = resolvedOrganizations
      const resolvedActiveOrganizationId = resolveActiveOrganizationId({
        requested: payload.activeOrganizationId,
        organizations: resolvedOrganizations,
        fallback: activeOrganizationId.value,
      })
      activeOrganizationId.value = resolvedActiveOrganizationId
      const isCompleted = Boolean(payload.progress?.isCompleted)
      progress.value = {
        currentStep: deriveClientStep({
          progressStep: payload.progress?.currentStep,
          isCompleted,
          activeOrganizationId: resolvedActiveOrganizationId,
          organizations: resolvedOrganizations,
        }),
        isCompleted,
        completedAt: payload.progress?.completedAt || null,
      }
      loaded.value = true
      loadedForUserId.value = authStore.user?.id || null
      return true
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to load onboarding state.')
      return false
    } finally {
      if (withBlockingLoader) loading.value = false
    }
  }

  function setActiveOrganization(id: string | null) {
    activeOrganizationId.value = resolveActiveOrganizationId({
      requested: id,
      organizations: organizations.value,
      fallback: activeOrganizationId.value,
    })
  }

  async function syncStateAfterMutation(fallbackMessage: string): Promise<boolean> {
    const refreshed = await fetchState({ silent: true })
    if (!refreshed) {
      error.value = error.value || fallbackMessage
      return false
    }
    return true
  }

  async function createOrganization(input:
    | string
    | {
      name: string
      description?: string | null
      logo?: string | null
    }
  ): Promise<boolean> {
    if (!authStore.token) return false
    const payload = typeof input === 'string'
      ? { name: input }
      : input

    submitting.value = true
    error.value = null
    try {
      const created = await onboardingApi.createOrganization({
        name: payload.name,
        description: payload.description ?? null,
        logo: payload.logo ?? null,
      }, authStore.token)
      activeOrganizationId.value = created.organization.id
      return await syncStateAfterMutation('Organization was created, but onboarding state could not be refreshed.')
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to create organization.')
      return false
    } finally {
      submitting.value = false
    }
  }

  async function updateOrganizationProfile(payload: {
    organizationId: string
    name?: string
    description?: string | null
    logo?: string | null
  }): Promise<boolean> {
    if (!authStore.token) return false
    submitting.value = true
    error.value = null
    try {
      await onboardingApi.updateOrganization(payload.organizationId, {
        name: payload.name,
        description: payload.description ?? null,
        logo: payload.logo ?? null,
      }, authStore.token)
      return await syncStateAfterMutation('Organization profile was saved, but onboarding state could not be refreshed.')
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to update organization profile.')
      return false
    } finally {
      submitting.value = false
    }
  }

  async function createWorkspace(payload: {
    organizationId: string
    name: string
    description?: string | null
    logo?: string | null
  }): Promise<boolean> {
    if (!authStore.token) return false
    submitting.value = true
    error.value = null
    try {
      await onboardingApi.createWorkspace(payload, authStore.token)
      return await syncStateAfterMutation('Workspace was created, but onboarding state could not be refreshed.')
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to create workspace.')
      return false
    } finally {
      submitting.value = false
    }
  }

  async function fetchInvites(organizationId?: string | null): Promise<boolean> {
    if (!authStore.token) return false
    const orgId = organizationId || activeOrganizationId.value
    if (!orgId) {
      invites.value = []
      return true
    }

    invitesLoading.value = true
    error.value = null
    try {
      invites.value = await onboardingApi.listInvites(orgId, authStore.token)
      return true
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to load invites.')
      return false
    } finally {
      invitesLoading.value = false
    }
  }

  async function createInvites(input: {
    organizationId: string
    invites: Array<{ email: string; role?: 'owner' | 'admin' | 'member' | 'viewer' }>
  }): Promise<boolean> {
    if (!authStore.token) return false
    submitting.value = true
    error.value = null
    lastCreatedInviteLinks.value = []
    lastSkippedInvites.value = []
    try {
      const payload = await onboardingApi.createInvites(input, authStore.token)
      lastCreatedInviteLinks.value = payload.created.map((item) => ({
        id: item.id,
        email: item.email,
        inviteLink: item.inviteLink,
      }))
      lastSkippedInvites.value = payload.skipped
      const refreshedState = await syncStateAfterMutation('Invites were created, but onboarding state could not be refreshed.')
      const refreshedInvites = await fetchInvites(input.organizationId)
      return refreshedState && refreshedInvites
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to create invites.')
      return false
    } finally {
      submitting.value = false
    }
  }

  async function cancelInvite(inviteId: string): Promise<boolean> {
    if (!authStore.token) return false
    submitting.value = true
    error.value = null
    try {
      await onboardingApi.cancelInvite(inviteId, authStore.token)
      const refreshedInvites = await fetchInvites()
      const refreshedState = await syncStateAfterMutation('Invite was cancelled, but onboarding state could not be refreshed.')
      return refreshedInvites && refreshedState
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to cancel invite.')
      return false
    } finally {
      submitting.value = false
    }
  }

  async function acceptInvite(token: string): Promise<boolean> {
    if (!authStore.token) return false
    submitting.value = true
    error.value = null
    try {
      await onboardingApi.acceptInvite({ token }, authStore.token)
      return await syncStateAfterMutation('Invite was accepted, but onboarding state could not be refreshed.')
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to accept invite.')
      return false
    } finally {
      submitting.value = false
    }
  }

  async function completeOnboarding(organizationId?: string): Promise<boolean> {
    if (!authStore.token) return false
    submitting.value = true
    error.value = null
    try {
      await onboardingApi.complete({ organizationId }, authStore.token)
      return await syncStateAfterMutation('Onboarding was completed, but onboarding state could not be refreshed.')
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to complete onboarding.')
      return false
    } finally {
      submitting.value = false
    }
  }

  async function cancelSignupDraft(): Promise<boolean> {
    if (!authStore.token) return false
    submitting.value = true
    error.value = null
    try {
      await onboardingApi.cancelSignup(authStore.token)
      reset()
      return true
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to cancel signup.')
      return false
    } finally {
      submitting.value = false
    }
  }

  async function uploadOrganizationLogo(file: File, organizationId?: string | null): Promise<string | null> {
    if (!authStore.token) return null
    logoUploading.value = true
    error.value = null
    try {
      const response = await onboardingApi.uploadOrganizationLogo(file, organizationId ?? null, authStore.token)
      return response.logo
    } catch (e) {
      error.value = getErrorMessage(e, 'Failed to upload organization logo.')
      return null
    } finally {
      logoUploading.value = false
    }
  }

  function reset() {
    loading.value = false
    invitesLoading.value = false
    logoUploading.value = false
    submitting.value = false
    loaded.value = false
    loadedForUserId.value = null
    error.value = null
    progress.value = {
      currentStep: 'organization',
      isCompleted: false,
      completedAt: null,
    }
    organizations.value = []
    activeOrganizationId.value = null
    invites.value = []
    lastCreatedInviteLinks.value = []
    lastSkippedInvites.value = []
  }

  return {
    loading,
    invitesLoading,
    logoUploading,
    submitting,
    loaded,
    loadedForUserId,
    error,
    progress,
    organizations,
    activeOrganizationId,
    activeOrganization,
    invites,
    lastCreatedInviteLinks,
    lastSkippedInvites,
    isOnboardingComplete,
    fetchState,
    setActiveOrganization,
    createOrganization,
    updateOrganizationProfile,
    createWorkspace,
    fetchInvites,
    createInvites,
    cancelInvite,
    acceptInvite,
    completeOnboarding,
    cancelSignupDraft,
    uploadOrganizationLogo,
    reset,
  }
})
