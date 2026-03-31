// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardPageTabs from '@/components/dashboard/DashboardPageTabs.vue'
import DashboardPageActionsMenu from '@/components/dashboard/DashboardPageActionsMenu.vue'
import type { DashboardPage } from '@/types/dashboard'

const basePage: DashboardPage = {
  id: 'page-1',
  scopeType: 'product',
  scopeRefId: 'scope-1',
  sortOrder: 0,
  name: 'Feed',
  slug: 'feed',
  visibility: 'team',
  ownerUserId: null,
  isSystem: true,
  systemKey: 'product_feed',
  createdByUserId: 'user-1',
  updatedByUserId: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  widgets: [],
  viewerAssignments: [],
  viewerUserIds: [],
  canEdit: true,
  isOwner: false,
}

describe('DashboardPageTabs', () => {
  it('emits template actions when template controls are enabled', async () => {
    const wrapper = mount(DashboardPageTabs, {
      props: {
        pages: [basePage],
        activePageId: 'page-1',
      },
    })

    const templateButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Load Template')
    expect(templateButton).toBeTruthy()

    await templateButton!.trigger('click')
    wrapper.findComponent(DashboardPageActionsMenu).vm.$emit('save-template')

    expect(wrapper.emitted('open-templates')).toBeTruthy()
    expect(wrapper.emitted('save-template')).toBeTruthy()
  })

  it('hides template actions when template controls are disabled', () => {
    const wrapper = mount(DashboardPageTabs, {
      props: {
        pages: [basePage],
        activePageId: 'page-1',
        templatesEnabled: false,
      },
    })

    const buttonLabels = wrapper.findAll('button').map((button) => button.text().trim())
    expect(buttonLabels).not.toContain('Load Template')
    expect(buttonLabels).toContain('Add Page')
  })

  it('hides add/template buttons when page actions are disabled', () => {
    const wrapper = mount(DashboardPageTabs, {
      props: {
        pages: [basePage],
        activePageId: 'page-1',
        showLoadTemplateButton: false,
        showAddPageButton: false,
      },
    })

    const buttonLabels = wrapper.findAll('button').map((button) => button.text().trim())
    expect(buttonLabels).not.toContain('Load Template')
    expect(buttonLabels).not.toContain('Add Page')
  })
})
