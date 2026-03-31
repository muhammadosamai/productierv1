// @vitest-environment jsdom

import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import OnboardingView from './OnboardingView.vue'

const {
  pushMock,
  replaceMock,
  onboardingStoreRef,
  authStoreRef,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  onboardingStoreRef: { current: null as any },
  authStoreRef: { current: null as any },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}))

vi.mock('@/stores/onboarding', () => ({
  useOnboardingStore: () => onboardingStoreRef.current,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreRef.current,
}))

vi.mock('@/components/ui/input', () => ({
  Input: {
    props: ['modelValue', 'type', 'placeholder', 'required', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <input
        :value="modelValue"
        :type="type || 'text'"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        @input="$emit('update:modelValue', $event.target.value)"
      >
    `,
  },
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: {
    props: ['modelValue', 'placeholder', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <textarea
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    `,
  },
}))

vi.mock('@/components/ui/button', () => ({
  Button: {
    props: ['type', 'disabled'],
    emits: ['click'],
    template: `
      <button :type="type || 'button'" :disabled="disabled" @click="$emit('click', $event)">
        <slot />
      </button>
    `,
  },
}))

function createOnboardingStoreMock() {
  return reactive({
    loading: false,
    invitesLoading: false,
    logoUploading: false,
    submitting: false,
    loaded: true,
    loadedForUserId: 'user-1',
    error: null as string | null,
    progress: {
      currentStep: 'invites',
      isCompleted: false,
      completedAt: null,
    },
    organizations: [
      {
        id: 'org-1',
        name: 'Acme Org',
        slug: 'acme-org',
        description: 'Acme organization',
        logo: null,
        role: 'owner',
        workspaceCount: 1,
        pendingInviteCount: 0,
      },
    ],
    activeOrganizationId: 'org-1',
    activeOrganization: {
      id: 'org-1',
      name: 'Acme Org',
      slug: 'acme-org',
      description: 'Acme organization',
      logo: null,
      role: 'owner',
      workspaceCount: 1,
      pendingInviteCount: 0,
    },
    invites: [],
    lastCreatedInviteLinks: [],
    lastSkippedInvites: [],
    isOnboardingComplete: false,
    fetchState: vi.fn(async () => true),
    fetchInvites: vi.fn(async () => true),
    setActiveOrganization: vi.fn(),
    createOrganization: vi.fn(async () => true),
    updateOrganizationProfile: vi.fn(async () => true),
    uploadOrganizationLogo: vi.fn(async () => '/uploads/organization-logos/mock.png'),
    createWorkspace: vi.fn(async () => true),
    createInvites: vi.fn(async () => true),
    cancelInvite: vi.fn(async () => true),
    acceptInvite: vi.fn(async () => true),
    completeOnboarding: vi.fn(async () => true),
    reset: vi.fn(),
  })
}

async function flushOnboardingInit() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function findButtonByText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

describe('OnboardingView', () => {
  beforeEach(() => {
    pushMock.mockReset()
    replaceMock.mockReset()
    onboardingStoreRef.current = createOnboardingStoreMock()
    authStoreRef.current = reactive({
      isAuthenticated: true,
    })
  })

  it('supports back navigation from invites to workspace step', async () => {
    const wrapper = mount(OnboardingView)
    await flushOnboardingInit()

    const backButton = findButtonByText(wrapper, 'Back to workspace setup')
    expect(backButton).toBeTruthy()

    await backButton!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('Workspace = Product in Productier')
    wrapper.unmount()
  })

  it('opens organization editor from invites step', async () => {
    const wrapper = mount(OnboardingView)
    await flushOnboardingInit()

    const editButton = findButtonByText(wrapper, 'Edit organization profile')
    expect(editButton).toBeTruthy()

    await editButton!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('Organization branding')
    expect(wrapper.text()).toContain('Organization Name')
    wrapper.unmount()
  })

  it('uses row-based invite entries and allows adding a person row', async () => {
    const wrapper = mount(OnboardingView)
    await flushOnboardingInit()

    expect(wrapper.findAll('input[placeholder="name@company.com"]')).toHaveLength(1)

    const addPersonButton = findButtonByText(wrapper, 'Add person')
    expect(addPersonButton).toBeTruthy()

    await addPersonButton!.trigger('click')
    await nextTick()

    expect(wrapper.findAll('input[placeholder="name@company.com"]')).toHaveLength(2)
    wrapper.unmount()
  })
})

