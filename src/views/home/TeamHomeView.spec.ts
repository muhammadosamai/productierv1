// @vitest-environment jsdom

import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import TeamHomeView from '@/views/home/TeamHomeView.vue'

const {
  authStoreRef,
  dashboardMock,
  workloadMock,
  blockersMock,
  qualityMock,
  throughputMock,
  listTeamsMock,
  getMembersMock,
} = vi.hoisted(() => ({
  authStoreRef: { current: null as any },
  dashboardMock: vi.fn(),
  workloadMock: vi.fn(),
  blockersMock: vi.fn(),
  qualityMock: vi.fn(),
  throughputMock: vi.fn(),
  listTeamsMock: vi.fn(),
  getMembersMock: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreRef.current,
}))

vi.mock('@/lib/api', () => ({
  metricsApi: {
    dashboard: dashboardMock,
    workload: workloadMock,
    blockers: blockersMock,
    quality: qualityMock,
    throughput: throughputMock,
  },
}))

vi.mock('@/lib/apiClient', () => ({
  ApiError: class ApiError extends Error {},
  organizationTeamsApi: {
    list: listTeamsMock,
  },
  productsApi: {
    getMembers: getMembersMock,
  },
}))

function baseProps() {
  return {
    organizationId: 'org-1',
    homeScope: {
      scopeMode: 'all' as const,
      productId: null,
      teamId: null,
    },
    selectedMemberIds: [],
    dailyBriefEnabled: false,
    briefLoading: false,
    dailyBrief: null,
    briefError: null,
    briefMode: 'summary' as const,
    briefScope: 'all_products' as const,
    briefProductId: null,
    briefEntityType: 'task' as const,
    briefEntityId: '',
    briefTemplate: 'executive_narrative' as const,
    briefProducts: [],
    allowAllProductsBriefScope: true,
  }
}

async function flushView() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('TeamHomeView', () => {
  beforeEach(() => {
    authStoreRef.current = reactive({
      token: 'token-1',
      user: {
        id: 'user-1',
        role: 'super_admin',
      },
    })

    dashboardMock.mockReset()
    workloadMock.mockReset()
    blockersMock.mockReset()
    qualityMock.mockReset()
    throughputMock.mockReset()
    listTeamsMock.mockReset()
    getMembersMock.mockReset()

    dashboardMock.mockResolvedValue({})
    workloadMock.mockResolvedValue({})
    blockersMock.mockResolvedValue({})
    qualityMock.mockResolvedValue({})
    throughputMock.mockResolvedValue({})
    listTeamsMock.mockResolvedValue([])
    getMembersMock.mockResolvedValue([])
  })

  it('routes selected team scope into metrics queries', async () => {
    listTeamsMock.mockResolvedValue([
      {
        id: 'team-1',
        name: 'Alpha Team',
        leadUserId: 'user-1',
        leadUserIds: ['user-1'],
        members: [{ userId: 'user-1' }],
      },
    ])

    const wrapper = shallowMount(TeamHomeView, { props: baseProps() })
    await flushView()

    const initialQuery = dashboardMock.mock.calls[dashboardMock.mock.calls.length - 1]?.[0]
    expect(initialQuery).toMatchObject({
      organizationId: 'org-1',
      scopeMode: 'all',
      teamId: null,
    })

    const teamScopeSelect = wrapper.findAll('select').find((select) =>
      select.text().includes('All teams in current Home scope'),
    )
    expect(teamScopeSelect).toBeTruthy()

    await teamScopeSelect!.setValue('team-1')
    await flushView()

    const scopedQuery = dashboardMock.mock.calls[dashboardMock.mock.calls.length - 1]?.[0]
    expect(scopedQuery).toMatchObject({
      organizationId: 'org-1',
      scopeMode: 'team',
      teamId: 'team-1',
      productId: null,
    })
    expect(getMembersMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('fetches product members only for product-scoped team summary', async () => {
    const wrapper = shallowMount(TeamHomeView, {
      props: {
        ...baseProps(),
        homeScope: {
          scopeMode: 'product',
          productId: 'product-1',
          teamId: null,
        },
      },
    })

    await flushView()

    expect(getMembersMock).toHaveBeenCalledWith('org-1', 'product-1', 'token-1')
    const query = workloadMock.mock.calls[workloadMock.mock.calls.length - 1]?.[0]
    expect(query).toMatchObject({
      organizationId: 'org-1',
      scopeMode: 'product',
      productId: 'product-1',
      teamId: null,
    })

    wrapper.unmount()
  })

  it('shows only teams the current non-admin user can access', async () => {
    authStoreRef.current = reactive({
      token: 'token-1',
      user: {
        id: 'member-1',
        role: 'viewer',
      },
    })

    listTeamsMock.mockResolvedValue([
      {
        id: 'team-hidden',
        name: 'Hidden Team',
        leadUserId: 'other-user',
        leadUserIds: [],
        members: [],
      },
      {
        id: 'team-visible',
        name: 'Visible Team',
        leadUserId: 'other-user',
        leadUserIds: [],
        members: [{ userId: 'member-1' }],
      },
    ])

    const wrapper = shallowMount(TeamHomeView, { props: baseProps() })
    await flushView()

    const optionTexts = wrapper.findAll('option').map((option) => option.text())
    expect(optionTexts).toContain('Visible Team')
    expect(optionTexts).not.toContain('Hidden Team')

    wrapper.unmount()
  })
})
