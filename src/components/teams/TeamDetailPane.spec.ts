// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TeamDetailPane from '@/components/teams/TeamDetailPane.vue'
import type { ApiOrganizationTeam } from '@/lib/apiClient'

const baseTeam: ApiOrganizationTeam = {
  id: 'team-1',
  organizationId: 'org-1',
  name: 'Platform',
  key: 'platform',
  description: 'Core platform engineering team.',
  leadUserId: 'lead-1',
  leadUserIds: ['lead-1'],
  createdByUserId: 'owner-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

function buildProps(overrides: Record<string, unknown> = {}) {
  return {
    team: baseTeam,
    teamLeadNames: 'Nora Quinn',
    teamLeadCount: 1,
    teamMemberCount: 2,
    teamAccessHint: '',
    teamMutationLoading: false,
    teamMutationError: null,
    canManageSelectedTeam: true,
    canDeleteSelectedTeam: true,
    isManageMode: false,
    membersLoading: false,
    teamNameDraft: baseTeam.name,
    teamKeyDraft: baseTeam.key,
    teamDescriptionDraft: baseTeam.description || '',
    memberRows: [
      {
        userId: 'user-1',
        userName: 'User One',
        userEmail: 'user.one@example.com',
        role: 'member' as const,
      },
      {
        userId: 'lead-1',
        userName: 'Nora Quinn',
        userEmail: 'nora@example.com',
        role: 'lead' as const,
      },
    ],
    availableMembers: [
      {
        id: 'pm-1',
        productId: 'product-1',
        role: 'member',
        addedAt: new Date().toISOString(),
        userId: 'user-2',
        userName: 'User Two',
        userEmail: 'user.two@example.com',
        userAvatar: null,
        userRole: 'developer',
        userCreatedAt: new Date().toISOString(),
        tasksAssigned: 0,
        tasksCompleted: 0,
      },
    ],
    memberToAddUserId: '',
    memberToAddRole: 'member' as const,
    ...overrides,
  }
}

describe('TeamDetailPane', () => {
  it('renders manage action in read mode and emits enter-manage-mode', async () => {
    const wrapper = mount(TeamDetailPane, { props: buildProps() })
    const manageButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Manage')

    expect(manageButton).toBeTruthy()
    await manageButton!.trigger('click')

    expect(wrapper.emitted('enter-manage-mode')).toBeTruthy()
  })

  it('hides manage actions for read-only users and shows access hint', () => {
    const wrapper = mount(TeamDetailPane, {
      props: buildProps({
        canManageSelectedTeam: false,
        canDeleteSelectedTeam: false,
        teamAccessHint: 'Read-only: only organization owners/admins or leads can manage this team.',
      }),
    })

    const buttonLabels = wrapper.findAll('button').map((button) => button.text().trim())
    expect(buttonLabels).not.toContain('Manage')
    expect(wrapper.text()).toContain('Read-only: only organization owners/admins or leads can manage this team.')
  })

  it('shows manage panel in manage mode and emits role changes', async () => {
    const wrapper = mount(TeamDetailPane, {
      props: buildProps({
        isManageMode: true,
      }),
    })

    expect(wrapper.text()).toContain('Team Details')
    expect(wrapper.text()).toContain('Add Member')

    const roleSelect = wrapper.find('#team-member-role-user-1')
    expect(roleSelect.exists()).toBe(true)
    await roleSelect.setValue('lead')

    const emitted = wrapper.emitted('change-member-role')
    expect(emitted).toBeTruthy()
    expect(emitted?.[0]?.[0]).toEqual({
      userId: 'user-1',
      role: 'lead',
    })
  })
})
