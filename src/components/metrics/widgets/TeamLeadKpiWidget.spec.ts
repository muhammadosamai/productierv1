// @vitest-environment jsdom

import { computed, nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TeamLeadKpiWidget from './TeamLeadKpiWidget.vue'

const { fetchScopedMetricsJsonMock, productStoreRef } = vi.hoisted(() => ({
  fetchScopedMetricsJsonMock: vi.fn(),
  productStoreRef: {
    current: null as any,
  },
}))

vi.mock('@/components/metrics/api', () => ({
  fetchScopedMetricsJson: fetchScopedMetricsJsonMock,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: 'token-1',
  }),
}))

vi.mock('@/stores/products', () => ({
  useProductStore: () => productStoreRef.current,
}))

async function flushWidget() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountWidget() {
  return mount(TeamLeadKpiWidget, {
    props: {
      period: 30,
      kpiKey: 'review_sla_adherence',
    },
    global: {
      provide: {
        metricsProductId: computed(() => productStoreRef.current.activeProduct.id),
        metricsScopeMode: ref<'product' | 'all' | 'team'>('product'),
        metricsTeamId: ref(''),
      },
    },
  })
}

describe('TeamLeadKpiWidget', () => {
  beforeEach(() => {
    productStoreRef.current = reactive({
      activeProduct: {
        id: 'product-1',
        organizationId: 'org-1',
      },
    })
    fetchScopedMetricsJsonMock.mockReset()
  })

  it('renders KPI value from team-lead-kpis endpoint', async () => {
    fetchScopedMetricsJsonMock.mockResolvedValue({
      data: {
        order: ['review_sla_adherence'],
        items: {
          review_sla_adherence: {
            key: 'review_sla_adherence',
            label: 'Review SLA Adherence',
            description: 'Tasks reviewed within SLA window.',
            unit: 'percent',
            targetDirection: 'higher',
            value: 82,
            previousValue: 78,
            deltaValue: 4,
            trendDirection: 'up',
            numerator: 41,
            denominator: 50,
            warning: false,
            supporting: {
              reviewSlaHours: 48,
              reviewTotal: 50,
            },
          },
        },
        meta: {
          generatedAt: new Date().toISOString(),
          sourceWindow: {
            periodDays: 30,
            startAt: new Date().toISOString(),
            endAt: new Date().toISOString(),
          },
          sampleSize: {},
          cacheAge: null,
          cacheTtl: null,
          lowSample: false,
        },
      },
      error: null,
      status: 200,
    })

    const wrapper = mountWidget()
    await flushWidget()

    expect(fetchScopedMetricsJsonMock).toHaveBeenCalledWith(
      'teamLeadKpis',
      expect.objectContaining({
        query: expect.objectContaining({
          organizationId: 'org-1',
          scopeMode: 'product',
          productId: 'product-1',
          period: '30',
        }),
      }),
    )
    expect(wrapper.text()).toContain('Review SLA Adherence')
    expect(wrapper.text()).toContain('82%')
    expect(wrapper.text()).toContain('Up +4pp')
    wrapper.unmount()
  })

  it('renders API error state', async () => {
    fetchScopedMetricsJsonMock.mockResolvedValue({
      data: null,
      error: 'Failed to load team lead KPI metrics',
      status: null,
    })

    const wrapper = mountWidget()
    await flushWidget()

    expect(wrapper.text()).toContain('Failed to load team lead KPI metrics')
    wrapper.unmount()
  })
})
