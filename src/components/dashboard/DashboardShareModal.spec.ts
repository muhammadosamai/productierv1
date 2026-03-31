// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardShareModal from '@/components/dashboard/DashboardShareModal.vue'
import type { DashboardPage } from '@/types/dashboard'

const page: DashboardPage = {
  id: 'page-1',
  scopeType: 'workspace',
  scopeRefId: 'org-1',
  sortOrder: 0,
  name: 'Shared Page',
  slug: 'shared-page',
  visibility: 'invited',
  ownerUserId: 'owner-1',
  isSystem: false,
  systemKey: null,
  createdByUserId: 'owner-1',
  updatedByUserId: 'owner-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  widgets: [],
  viewerAssignments: [
    { userId: 'user-1', role: 'editor' },
  ],
  viewerUserIds: ['user-1'],
  canEdit: true,
  isOwner: true,
}

describe('DashboardShareModal', () => {
  it('emits role-aware viewer assignments', async () => {
    const wrapper = mount(DashboardShareModal, {
      props: {
        open: true,
        page,
        users: [
          { id: 'user-1', name: 'Alex', email: 'alex@example.com' },
          { id: 'user-2', name: 'Sam', email: 'sam@example.com' },
        ],
        canCreateTeamWide: true,
      },
    })

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBe(2)
    await checkboxes[1]!.trigger('change')

    const roleSelects = wrapper.findAll('select')
    expect(roleSelects.length).toBeGreaterThan(1)
    const secondRoleSelect = roleSelects[2]
    await secondRoleSelect!.setValue('editor')

    const saveButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Save')
    expect(saveButton).toBeTruthy()
    await saveButton!.trigger('click')

    const payload = wrapper.emitted('save')?.[0]?.[0] as {
      visibility: string
      viewerUserIds: string[]
      viewers: Array<{ userId: string; role: string }>
    }
    expect(payload.visibility).toBe('invited')
    expect(payload.viewerUserIds).toEqual(expect.arrayContaining(['user-1', 'user-2']))
    expect(payload.viewers).toEqual(expect.arrayContaining([
      { userId: 'user-1', role: 'editor' },
      { userId: 'user-2', role: 'editor' },
    ]))
  })
})
