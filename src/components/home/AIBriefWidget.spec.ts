// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AIBriefWidget from './AIBriefWidget.vue'

const pushMock = vi.fn()

function toHref(route: unknown): string {
  if (typeof route === 'string') return route
  if (!route || typeof route !== 'object') return '/home'
  const value = route as { path?: string; query?: Record<string, unknown> }
  const path = value.path || '/home'
  const params = new URLSearchParams()
  if (value.query && typeof value.query === 'object') {
    for (const [key, raw] of Object.entries(value.query)) {
      if (raw === null || raw === undefined) continue
      params.set(key, String(raw))
    }
  }
  const encoded = params.toString()
  return encoded.length > 0 ? `${path}?${encoded}` : path
}

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock,
    resolve: (route: unknown) => ({ href: toHref(route) }),
  }),
}))

describe('AIBriefWidget', () => {
  it('renders inline task tokens as links and navigates internally on click', async () => {
    const wrapper = mount(AIBriefWidget, {
      props: {
        loading: false,
        errorMessage: null,
        mode: 'summary',
        scope: 'product',
        productId: 'product-1',
        entityType: 'task',
        entityId: 'task-1',
        template: 'executive_narrative',
        products: [{ id: 'product-1', name: 'NovaForge' }],
        allowAllProductsScope: true,
        brief: {
          brief: 'Focus [[task:task-1|Launch checklist]] first.',
          sections: [],
          generatedAt: new Date().toISOString(),
          source: 'ai',
          view: 'my_tasks',
          mode: 'summary',
          cached: false,
        },
      },
    })

    const link = wrapper.find('.prose a')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('Launch checklist')
    expect(link.attributes('href')).toBe('/tasks?task=task-1')

    await link.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/tasks?task=task-1')
  })

  it('emits scope/template/entity control updates', async () => {
    const wrapper = mount(AIBriefWidget, {
      props: {
        loading: false,
        errorMessage: null,
        mode: 'summary',
        scope: 'entity',
        productId: null,
        entityType: 'task',
        entityId: '',
        template: 'entity_deep_dive',
        products: [{ id: 'product-1', name: 'NovaForge' }],
        allowAllProductsScope: true,
        brief: null,
      },
    })

    const entityButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Entity')
    expect(entityButton).toBeTruthy()
    await entityButton!.trigger('click')
    expect(wrapper.emitted('update:scope')).toBeTruthy()

    const selects = wrapper.findAll('select')
    expect(selects.length).toBeGreaterThanOrEqual(2)
    await selects[0]!.setValue('executive_narrative')
    await selects[1]!.setValue('initiative')
    expect(wrapper.emitted('update:template')?.[0]).toEqual(['executive_narrative'])
    expect(wrapper.emitted('update:entity-type')?.[0]).toEqual(['initiative'])

    const entityInput = wrapper.find('input[placeholder="Entity ID"]')
    expect(entityInput.exists()).toBe(true)
    await entityInput.setValue('task-77')
    const entityIdEvents = wrapper.emitted('update:entity-id')
    expect(entityIdEvents?.[entityIdEvents.length - 1]).toEqual(['task-77'])
  })

  it('shows actionable fetch error hints when request fails', () => {
    const wrapper = mount(AIBriefWidget, {
      props: {
        loading: false,
        errorMessage: 'organizationId query parameter is required',
        mode: 'summary',
        scope: 'all_products',
        productId: null,
        entityType: 'task',
        entityId: '',
        template: 'executive_narrative',
        products: [],
        allowAllProductsScope: true,
        brief: null,
      },
    })

    expect(wrapper.text()).toContain('Unable to load AI brief')
    expect(wrapper.text()).toContain('organizationId query parameter is required')
  })

  it('shows reason-specific unavailable hint for missing API credentials', () => {
    const wrapper = mount(AIBriefWidget, {
      props: {
        loading: false,
        errorMessage: null,
        mode: 'summary',
        scope: 'product',
        productId: 'product-1',
        entityType: 'task',
        entityId: '',
        template: 'executive_narrative',
        products: [{ id: 'product-1', name: 'NovaForge' }],
        allowAllProductsScope: true,
        brief: {
          brief: 'Fallback brief',
          sections: [],
          generatedAt: new Date().toISOString(),
          source: 'fallback',
          fallbackReason: 'missing_api_key',
          view: 'my_tasks',
          mode: 'summary',
          cached: false,
        },
      },
    })

    expect(wrapper.text()).toContain('AI briefing unavailable')
    expect(wrapper.text()).toContain('API credentials are missing')
  })

  it('shows timeout hint for timeout fallback reason', () => {
    const wrapper = mount(AIBriefWidget, {
      props: {
        loading: false,
        errorMessage: null,
        mode: 'summary',
        scope: 'all_products',
        productId: null,
        entityType: 'task',
        entityId: '',
        template: 'executive_narrative',
        products: [],
        allowAllProductsScope: true,
        brief: {
          brief: 'Fallback brief',
          sections: [],
          generatedAt: new Date().toISOString(),
          source: 'fallback',
          fallbackReason: 'timeout',
          view: 'executive',
          mode: 'summary',
          cached: false,
        },
      },
    })

    expect(wrapper.text()).toContain('AI briefing timed out while generating')
  })
})
