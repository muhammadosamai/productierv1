// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardPageActionsMenu from '@/components/dashboard/DashboardPageActionsMenu.vue'
import type { DashboardPage } from '@/types/dashboard'

const editablePage: DashboardPage = {
  id: 'page-1',
  scopeType: 'product',
  scopeRefId: 'scope-1',
  sortOrder: 0,
  name: 'Custom',
  slug: 'custom',
  visibility: 'personal',
  ownerUserId: 'user-1',
  isSystem: false,
  systemKey: null,
  createdByUserId: 'user-1',
  updatedByUserId: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  widgets: [],
  viewerAssignments: [],
  viewerUserIds: [],
  canEdit: true,
  isOwner: true,
}

const systemPage: DashboardPage = {
  ...editablePage,
  name: 'Feed',
  slug: 'feed',
  visibility: 'team',
  ownerUserId: null,
  isSystem: true,
  systemKey: 'product_feed',
  isOwner: false,
}

function openMenu(wrapper: ReturnType<typeof mount>) {
  const details = wrapper.find('details').element as HTMLDetailsElement
  details.open = true
}

describe('DashboardPageActionsMenu', () => {
  it('emits action events for editable custom pages', async () => {
    const wrapper = mount(DashboardPageActionsMenu, {
      props: {
        page: editablePage,
        allowReorder: true,
        canMoveLeft: true,
        canMoveRight: true,
      },
    })

    openMenu(wrapper)
    await wrapper.findAll('button').find((button) => button.text().trim() === 'Save as template')!.trigger('click')
    openMenu(wrapper)
    await wrapper.findAll('button').find((button) => button.text().trim() === 'Rename')!.trigger('click')
    openMenu(wrapper)
    await wrapper.findAll('button').find((button) => button.text().trim() === 'Share access')!.trigger('click')
    openMenu(wrapper)
    await wrapper.findAll('button').find((button) => button.text().trim() === 'Delete page')!.trigger('click')

    expect(wrapper.emitted('save-template')).toBeTruthy()
    expect(wrapper.emitted('rename')).toBeTruthy()
    expect(wrapper.emitted('share')).toBeTruthy()
    expect(wrapper.emitted('delete')).toBeTruthy()
  })

  it('disables mutating actions for system pages', () => {
    const wrapper = mount(DashboardPageActionsMenu, {
      props: {
        page: systemPage,
        allowReorder: true,
        canMoveLeft: true,
        canMoveRight: true,
      },
    })

    openMenu(wrapper)
    const renameButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Rename')
    const shareButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Share access')
    const deleteButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Delete page')

    expect(renameButton?.attributes('disabled')).toBeDefined()
    expect(shareButton?.attributes('disabled')).toBeDefined()
    expect(deleteButton?.attributes('disabled')).toBeDefined()
  })
})
