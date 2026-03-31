import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from './auth'
import { useOnboardingStore } from './onboarding'

const { onboardingApiMock, MockApiError } = vi.hoisted(() => {
  const onboardingApiMock = {
    getState: vi.fn(),
    createOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    createWorkspace: vi.fn(),
    uploadOrganizationLogo: vi.fn(),
    listInvites: vi.fn(),
    createInvites: vi.fn(),
    cancelInvite: vi.fn(),
    acceptInvite: vi.fn(),
    cancelSignup: vi.fn(),
    complete: vi.fn(),
  }

  class MockApiError extends Error {
    status: number
    payload: unknown

    constructor(status: number, message: string, payload: unknown = null) {
      super(message)
      this.status = status
      this.payload = payload
    }
  }

  return { onboardingApiMock, MockApiError }
})

vi.mock('@/lib/apiClient', () => ({
  onboardingApi: onboardingApiMock,
  ApiError: MockApiError,
}))

describe('onboarding store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('hydrates onboarding state and active organization', async () => {
    const authStore = useAuthStore()
    authStore.token = 'token-1'
    authStore.user = {
      id: 'user-1',
      name: 'User',
      email: 'user@example.com',
      role: 'viewer',
      isActive: true,
      avatar: null,
      createdAt: new Date().toISOString(),
    }

    onboardingApiMock.getState.mockResolvedValueOnce({
      progress: {
        currentStep: 'workspace',
        isCompleted: false,
        completedAt: null,
      },
      activeOrganizationId: 'org-1',
      organizations: [
        {
          id: 'org-1',
          name: 'Org One',
          slug: 'org-one',
          description: null,
          logo: null,
          role: 'owner',
          workspaceCount: 0,
          pendingInviteCount: 0,
        },
      ],
    })

    const store = useOnboardingStore()
    const ok = await store.fetchState()

    expect(ok).toBe(true)
    expect(store.loaded).toBe(true)
    expect(store.loadedForUserId).toBe('user-1')
    expect(store.activeOrganizationId).toBe('org-1')
    expect(store.progress.currentStep).toBe('workspace')
  })

  it('falls back to the first organization and invite step when workspace exists', async () => {
    const authStore = useAuthStore()
    authStore.token = 'token-fallback'
    authStore.user = {
      id: 'user-fallback',
      name: 'User',
      email: 'fallback@example.com',
      role: 'viewer',
      isActive: true,
      avatar: null,
      createdAt: new Date().toISOString(),
    }

    onboardingApiMock.getState.mockResolvedValueOnce({
      progress: {
        currentStep: 'organization',
        isCompleted: false,
        completedAt: null,
      },
      activeOrganizationId: 'missing-org-id',
      organizations: [
        {
          id: 'org-fallback',
          name: 'Fallback Org',
          slug: 'fallback-org',
          description: null,
          logo: null,
          role: 'owner',
          workspaceCount: 2,
          pendingInviteCount: 0,
        },
      ],
    })

    const store = useOnboardingStore()
    const ok = await store.fetchState()

    expect(ok).toBe(true)
    expect(store.activeOrganizationId).toBe('org-fallback')
    expect(store.progress.currentStep).toBe('invites')
  })

  it('returns false when organization creation succeeds but state refresh fails', async () => {
    const authStore = useAuthStore()
    authStore.token = 'token-create-org'
    authStore.user = {
      id: 'user-create-org',
      name: 'User',
      email: 'create-org@example.com',
      role: 'viewer',
      isActive: true,
      avatar: null,
      createdAt: new Date().toISOString(),
    }

    onboardingApiMock.createOrganization.mockResolvedValueOnce({
      organization: {
        id: 'org-created',
        name: 'Created Org',
        slug: 'created-org',
        description: null,
        logo: null,
      },
      memberRole: 'owner',
      onboarding: { currentStep: 'workspace', isCompleted: false },
    })
    onboardingApiMock.getState.mockRejectedValueOnce(new MockApiError(500, 'state refresh failed'))

    const store = useOnboardingStore()
    const ok = await store.createOrganization('Created Org')

    expect(ok).toBe(false)
    expect(store.activeOrganizationId).toBe('org-created')
    expect(store.error).toContain('state refresh failed')
  })

  it('stores invite links and skipped invite reasons', async () => {
    const authStore = useAuthStore()
    authStore.token = 'token-2'
    authStore.user = {
      id: 'user-2',
      name: 'User',
      email: 'user2@example.com',
      role: 'viewer',
      isActive: true,
      avatar: null,
      createdAt: new Date().toISOString(),
    }

    onboardingApiMock.createInvites.mockResolvedValueOnce({
      created: [
        {
          id: 'invite-1',
          email: 'teammate@example.com',
          role: 'member',
          status: 'pending',
          expiresAt: new Date().toISOString(),
          inviteLink: '/onboarding/accept-invite?token=abc',
        },
      ],
      skipped: [
        { email: 'bad-email', reason: 'invalid_email' },
      ],
      onboarding: { currentStep: 'invites', isCompleted: false },
    })
    onboardingApiMock.getState.mockResolvedValue({
      progress: {
        currentStep: 'invites',
        isCompleted: false,
        completedAt: null,
      },
      activeOrganizationId: 'org-2',
      organizations: [
        {
          id: 'org-2',
          name: 'Org Two',
          slug: 'org-two',
          description: null,
          logo: null,
          role: 'owner',
          workspaceCount: 1,
          pendingInviteCount: 1,
        },
      ],
    })
    onboardingApiMock.listInvites.mockResolvedValueOnce([
      {
        id: 'invite-1',
        organizationId: 'org-2',
        email: 'teammate@example.com',
        role: 'member',
        status: 'pending',
        expiresAt: new Date().toISOString(),
        acceptedAt: null,
        cancelledAt: null,
        createdAt: new Date().toISOString(),
      },
    ])

    const store = useOnboardingStore()
    const ok = await store.createInvites({
      organizationId: 'org-2',
      invites: [{ email: 'teammate@example.com', role: 'member' }],
    })

    expect(ok).toBe(true)
    expect(store.lastCreatedInviteLinks).toHaveLength(1)
    expect(store.lastCreatedInviteLinks[0]?.id).toBe('invite-1')
    expect(store.lastSkippedInvites).toEqual([{ email: 'bad-email', reason: 'invalid_email' }])
  })

  it('cancels signup draft and resets local onboarding state', async () => {
    const authStore = useAuthStore()
    authStore.token = 'token-cancel'
    authStore.user = {
      id: 'user-cancel',
      name: 'User',
      email: 'cancel@example.com',
      role: 'viewer',
      isActive: true,
      avatar: null,
      createdAt: new Date().toISOString(),
    }

    onboardingApiMock.cancelSignup.mockResolvedValueOnce({
      success: true,
      deletedOrganizations: 1,
      deletedUserId: 'user-cancel',
    })

    const store = useOnboardingStore()
    store.loaded = true
    store.activeOrganizationId = 'org-draft'
    store.organizations = [
      {
        id: 'org-draft',
        name: 'Draft Org',
        slug: 'draft-org',
        description: null,
        logo: null,
        role: 'owner',
        workspaceCount: 0,
        pendingInviteCount: 0,
      },
    ]

    const ok = await store.cancelSignupDraft()

    expect(ok).toBe(true)
    expect(onboardingApiMock.cancelSignup).toHaveBeenCalledWith('token-cancel')
    expect(store.loaded).toBe(false)
    expect(store.activeOrganizationId).toBe(null)
    expect(store.organizations).toEqual([])
    expect(store.error).toBe(null)
  })

  it('surfaces API errors when signup cancellation is blocked', async () => {
    const authStore = useAuthStore()
    authStore.token = 'token-cancel-blocked'
    authStore.user = {
      id: 'user-cancel-blocked',
      name: 'User',
      email: 'blocked@example.com',
      role: 'viewer',
      isActive: true,
      avatar: null,
      createdAt: new Date().toISOString(),
    }

    onboardingApiMock.cancelSignup.mockRejectedValueOnce(
      new MockApiError(409, 'Cannot cancel signup after workspace creation.')
    )

    const store = useOnboardingStore()
    const ok = await store.cancelSignupDraft()

    expect(ok).toBe(false)
    expect(store.error).toContain('Cannot cancel signup after workspace creation')
  })
})
