// @vitest-environment jsdom

import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricsView from '@/views/MetricsView.vue'

const {
  authStoreRef,
  productStoreRef,
  dashboardPagesRef,
  dashboardActivePageIdRef,
  routeQueryRef,
  teamListMock,
} = vi.hoisted(() => ({
  authStoreRef: { current: null as any },
  productStoreRef: { current: null as any },
  dashboardPagesRef: { current: null as any },
  dashboardActivePageIdRef: { current: null as any },
  routeQueryRef: { current: {} as Record<string, unknown> },
  teamListMock: vi.fn(),
}))

const replaceQueryMock = vi.fn()

function buildEditableMetricsPage() {
  return {
    id: 'metrics-page-1',
    scopeType: 'product',
    scopeRefId: 'product-1',
    sortOrder: 0,
    name: 'Custom Metrics',
    slug: 'custom-metrics',
    visibility: 'team',
    ownerUserId: 'user-1',
    isSystem: false,
    systemKey: null,
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    widgets: [
      {
        id: 'widget-overview',
        pageId: 'metrics-page-1',
        widgetType: 'metrics_tasks_dashboard',
        widgetTitle: 'Tasks Dashboard',
        configJson: {},
        gridX: 0,
        gridY: 0,
        gridW: 2,
        gridH: 2,
        sortOrder: 0,
        createdByUserId: 'user-1',
        updatedByUserId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    viewerAssignments: [],
    viewerUserIds: [],
    canEdit: true,
    isOwner: true,
  }
}

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreRef.current,
}))

vi.mock('@/stores/products', () => ({
  useProductStore: () => productStoreRef.current,
}))

vi.mock('@/composables/useOrganizationMembers', () => ({
  useOrganizationMembers: () => ({
    members: { value: [] },
    loadMembers: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/lib/apiClient', () => ({
  organizationTeamsApi: {
    list: (...args: any[]) => teamListMock(...args),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQueryRef.current }),
  useRouter: () => ({ replace: replaceQueryMock }),
}))

vi.mock('@/composables/useDashboardPages', async () => {
  const vue = await import('vue')
  const pages = vue.ref([buildEditableMetricsPage()])
  const activePageId = vue.ref('metrics-page-1')
  dashboardPagesRef.current = pages
  dashboardActivePageIdRef.current = activePageId
  return {
    useDashboardPages: () => ({
      pages,
      templates: vue.ref([]),
      activePageId,
      activePage: vue.computed(() => pages.value.find((page) => page.id === activePageId.value) || null),
      loading: vue.ref(false),
      templatesLoading: vue.ref(false),
      saving: vue.ref(false),
      error: vue.ref<string | null>(null),
      canCreateTeamWide: vue.ref(true),
      canManageTemplates: vue.ref(true),
      canApplyTemplates: vue.ref(true),
      loadPages: vi.fn(),
      loadTemplates: vi.fn(),
      createPage: vi.fn().mockResolvedValue(true),
      updatePage: vi.fn().mockResolvedValue(true),
      deletePage: vi.fn().mockResolvedValue(true),
      reorderPages: vi.fn().mockResolvedValue(true),
      updateViewers: vi.fn().mockResolvedValue(true),
      addWidget: vi.fn().mockResolvedValue(true),
      updateWidget: vi.fn().mockResolvedValue(true),
      deleteWidget: vi.fn().mockResolvedValue(true),
      saveTemplate: vi.fn().mockResolvedValue(true),
      deleteTemplate: vi.fn().mockResolvedValue(true),
      applyTemplate: vi.fn().mockResolvedValue(true),
      selectPage: (pageId: string) => {
        activePageId.value = pageId
      },
    }),
  }
})

async function flushView() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

const baseStubs = {
  DashboardPageTabs: { template: '<div />' },
  DashboardWidgetPalette: {
    name: 'DashboardWidgetPalette',
    props: ['items', 'busy'],
    template: '<div data-testid="widget-palette" />',
  },
  DashboardWidgetGrid: {
    name: 'DashboardWidgetGrid',
    props: ['renderers', 'resolveWidgetProps', 'widgets', 'page', 'editable', 'allowDrag', 'busy'],
    template: '<div data-testid="widget-grid" />',
  },
  DashboardShareModal: { template: '<div />' },
  DashboardTemplateLibraryModal: { template: '<div />' },
  DashboardSaveTemplateModal: { template: '<div />' },
  DashboardApplyTemplateModal: { template: '<div />' },
  DashboardPageEditorModal: { template: '<div />' },
  DashboardConfirmModal: { template: '<div />' },
}

describe('MetricsView executive KPI widgets', () => {
  beforeEach(() => {
    window.localStorage.clear()
    replaceQueryMock.mockReset()
    teamListMock.mockReset()
    teamListMock.mockResolvedValue([])
    routeQueryRef.current = reactive({})

    authStoreRef.current = reactive({
      token: 'token-1',
      user: { id: 'user-1', role: 'super_admin' },
    })
    productStoreRef.current = reactive({
      activeProduct: {
        id: 'product-1',
        organizationId: 'org-1',
        name: 'Product One',
      },
    })

    if (dashboardPagesRef.current) {
      dashboardPagesRef.current.value = [buildEditableMetricsPage()]
    }
    if (dashboardActivePageIdRef.current) {
      dashboardActivePageIdRef.current.value = 'metrics-page-1'
    }
  })

  it('exposes executive KPI widgets in palette and resolver', async () => {
    const wrapper = mount(MetricsView, {
      global: {
        stubs: baseStubs,
      },
    })

    await flushView()

    const editButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Edit layout')
    expect(editButton).toBeTruthy()
    await editButton!.trigger('click')
    await flushView()

    const palette = wrapper.findComponent({ name: 'DashboardWidgetPalette' })
    expect(palette.exists()).toBe(true)
    const paletteItems = (palette.props('items') as Array<{ type: string }>) || []
    const executiveTypes = [
      'metrics_exec_portfolio_health_score',
      'metrics_exec_delivery_confidence_distribution',
      'metrics_exec_forecast_bias',
      'metrics_exec_scope_volatility_burn',
      'metrics_exec_risk_burndown',
      'metrics_exec_initiative_execution_confidence',
      'metrics_exec_quality_cost_index',
      'metrics_exec_throughput_stability_index',
      'metrics_exec_cross_product_bottleneck_heatmap',
      'metrics_exec_customer_impact_proxy',
    ]
    for (const type of executiveTypes) {
      expect(paletteItems.some((item) => item.type === type)).toBe(true)
    }

    const grid = wrapper.findComponent({ name: 'DashboardWidgetGrid' })
    const renderers = grid.props('renderers') as Record<string, unknown>
    expect(Boolean(renderers.metrics_exec_portfolio_health_score)).toBe(true)

    const resolver = grid.props('resolveWidgetProps') as ((widget: any) => Record<string, unknown>)
    const resolved = resolver({
      id: 'w1',
      pageId: 'metrics-page-1',
      widgetType: 'metrics_exec_portfolio_health_score',
      widgetTitle: 'Portfolio Health Score',
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
    })
    expect(resolved.period).toBe(30)
    expect(resolved.kpiKey).toBe('portfolioHealthScore')
  })
})

