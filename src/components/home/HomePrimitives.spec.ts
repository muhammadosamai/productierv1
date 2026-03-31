// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeEmptyState from './HomeEmptyState.vue'
import HomeKpiCard from './HomeKpiCard.vue'
import HomeSectionHeader from './HomeSectionHeader.vue'

describe('Home dashboard primitives', () => {
  it('renders KPI card label/value/detail and icon slot', () => {
    const wrapper = mount(HomeKpiCard, {
      props: {
        label: 'Overdue',
        value: 12,
        detail: 'Past due active work',
      },
      slots: {
        icon: '<span data-test="kpi-icon">!</span>',
      },
    })

    expect(wrapper.text()).toContain('Overdue')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('Past due active work')
    expect(wrapper.find('[data-test="kpi-icon"]').exists()).toBe(true)
  })

  it('renders section header title, description, and action slot', () => {
    const wrapper = mount(HomeSectionHeader, {
      props: {
        title: 'Execution Pressure',
        description: 'Risk distribution for active work',
      },
      slots: {
        actions: '<button data-test="section-action">Open</button>',
      },
    })

    expect(wrapper.text()).toContain('Execution Pressure')
    expect(wrapper.text()).toContain('Risk distribution for active work')
    expect(wrapper.find('[data-test="section-action"]').exists()).toBe(true)
  })

  it('renders empty-state message', () => {
    const wrapper = mount(HomeEmptyState, {
      props: {
        message: 'No KPIs for this selection.',
      },
    })

    expect(wrapper.text()).toContain('No KPIs for this selection.')
  })
})
