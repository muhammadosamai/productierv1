// @vitest-environment jsdom

import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardWidgetGrid from '@/components/dashboard/DashboardWidgetGrid.vue'
import type { DashboardPage, DashboardWidget } from '@/types/dashboard'

const TestWidget = defineComponent({
  name: 'TestWidget',
  setup() {
    return () => h('div', 'Widget Content')
  },
})

const baseWidgets: DashboardWidget[] = [
  {
    id: 'widget-1',
    pageId: 'page-1',
    widgetType: 'test_widget',
    widgetTitle: 'Widget One',
    configJson: {},
    gridX: 0,
    gridY: 0,
    gridW: 1,
    gridH: 1,
    sortOrder: 0,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'widget-2',
    pageId: 'page-1',
    widgetType: 'test_widget',
    widgetTitle: 'Widget Two',
    configJson: {},
    gridX: 1,
    gridY: 0,
    gridW: 1,
    gridH: 1,
    sortOrder: 1,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

const page: DashboardPage = {
  id: 'page-1',
  scopeType: 'workspace',
  scopeRefId: 'org-1',
  sortOrder: 0,
  name: 'Layout',
  slug: 'layout',
  visibility: 'personal',
  ownerUserId: 'user-1',
  isSystem: false,
  systemKey: null,
  createdByUserId: 'user-1',
  updatedByUserId: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  widgets: baseWidgets,
  viewerAssignments: [],
  viewerUserIds: [],
  canEdit: true,
  isOwner: true,
}

describe('DashboardWidgetGrid', () => {
  it('supports drag mode and emits reorder', async () => {
    const wrapper = mount(DashboardWidgetGrid, {
      props: {
        page,
        widgets: baseWidgets,
        renderers: {
          test_widget: TestWidget,
        },
        editable: true,
        allowDrag: true,
      },
    })

    expect(wrapper.findAll('.dashboard-widget-drag-handle').length).toBe(2)

    const draggableComp = wrapper.findComponent({ name: 'draggable' })
    expect(draggableComp.exists()).toBe(true)
    draggableComp.vm.$emit('end')

    expect(wrapper.emitted('reorder-widgets')?.[0]?.[0]).toEqual({
      widgetIds: ['widget-1', 'widget-2'],
    })
  })

  it('emits update and remove actions', async () => {
    const wrapper = mount(DashboardWidgetGrid, {
      props: {
        page,
        widgets: baseWidgets,
        renderers: {
          test_widget: TestWidget,
        },
        editable: true,
      },
    })

    const firstSizeSelect = wrapper.find('select')
    await firstSizeSelect.setValue('2x2')
    expect(wrapper.emitted('update-widget')?.[0]?.[0]).toEqual({
      widgetId: 'widget-1',
      gridW: 2,
      gridH: 2,
    })

    const firstRemoveButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Remove')
    expect(firstRemoveButton).toBeTruthy()
    await firstRemoveButton!.trigger('click')
    expect(wrapper.emitted('remove-widget')?.[0]?.[0]).toBe('widget-1')
  })
})
