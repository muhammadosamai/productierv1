// @vitest-environment jsdom

import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeDashboardView from '@/views/HomeDashboardView.vue'

const {
  authStoreRef,
  onboardingStoreRef,
  productStoreRef,
  rolesStoreRef,
  getDailyBriefMock,
  usersListMock,
  dashboardPagesRef,
  dashboardActivePageIdRef,
  dashboardSelectPageMock,
} = vi.hoisted(() => ({
  authStoreRef: { current: null as any },
  onboardingStoreRef: { current: null as any },
  productStoreRef: { current: null as any },
  rolesStoreRef: { current: null as any },
  getDailyBriefMock: vi.fn(),
  usersListMock: vi.fn(),
  dashboardPagesRef: { current: null as any },
  dashboardActivePageIdRef: { current: null as any },
  dashboardSelectPageMock: vi.fn(),
}))

function buildSystemHomePage() {
  return {
    id: 'page-1',
    scopeType: 'workspace',
    scopeRefId: 'org-1',
    sortOrder: 0,
    name: 'My Tasks',
    slug: 'my-tasks',
    visibility: 'team',
    ownerUserId: null,
    isSystem: true,
    systemKey: 'workspace_my_tasks',
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    widgets: [
      {
        id: 'widget-1',
        pageId: 'page-1',
        widgetType: 'home_my_tasks',
        widgetTitle: 'My Tasks',
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
    isOwner: false,
  }
}

function buildCustomHomePage() {
  return {
    id: 'page-custom',
    scopeType: 'workspace',
    scopeRefId: 'org-1',
    sortOrder: 10,
    name: 'Personal Focus',
    slug: 'personal-focus',
    visibility: 'personal',
    ownerUserId: 'user-1',
    isSystem: false,
    systemKey: null,
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    widgets: [
      {
        id: 'widget-custom',
        pageId: 'page-custom',
        widgetType: 'home_my_tasks',
        widgetTitle: 'My Tasks',
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

vi.mock('@/stores/onboarding', () => ({
  useOnboardingStore: () => onboardingStoreRef.current,
}))

vi.mock('@/stores/roles', () => ({
  useRolesStore: () => rolesStoreRef.current,
}))

vi.mock('@/lib/api', () => ({
  usersApi: {
    getDailyBrief: getDailyBriefMock,
    list: usersListMock,
  },
}))

vi.mock('@/lib/apiClient', () => ({
  ApiError: class ApiError extends Error {},
}))

vi.mock('@/composables/useHybridSettings', () => ({
  useHybridSettings: () => ({
    loadSettings: vi.fn().mockResolvedValue({}),
    saveSetting: vi.fn(),
    cleanup: vi.fn(),
  }),
}))

vi.mock('@/composables/useDashboardPages', async () => {
  const vue = await import('vue')
  const pages = vue.ref([buildSystemHomePage()])
  const activePageId = vue.ref('page-1')
  const templates = vue.ref([])
  dashboardPagesRef.current = pages
  dashboardActivePageIdRef.current = activePageId

  return {
    useDashboardPages: () => ({
      pages,
      templates,
      activePageId,
      activePage: vue.computed(() => pages.value.find((page) => page.id === activePageId.value) || null),
      loading: vue.ref(false),
      templatesLoading: vue.ref(false),
      saving: vue.ref(false),
      error: vue.ref<string | null>(null),
      scopeContext: vue.ref(null),
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
        dashboardSelectPageMock(pageId)
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

const commonStubs = {
  HomeView: { template: '<div />' },
  TeamHomeView: { template: '<div />' },
  ExecutiveHomeView: { template: '<div />' },
  DashboardPageTabs: { template: '<div />' },
  DashboardWidgetPalette: { template: '<div data-testid="widget-palette" />' },
  DashboardWidgetGrid: { template: '<div />' },
  DashboardShareModal: { template: '<div />' },
  DashboardTemplateLibraryModal: { template: '<div />' },
  DashboardSaveTemplateModal: { template: '<div />' },
  DashboardApplyTemplateModal: { template: '<div />' },
  DashboardPageEditorModal: { template: '<div />' },
  DashboardConfirmModal: { template: '<div />' },
}

function mountDashboard() {
  return mount(HomeDashboardView, {
    global: {
      stubs: commonStubs,
    },
  })
}

describe('HomeDashboardView', () => {
  beforeEach(() => {
    window.localStorage.clear()
    authStoreRef.current = reactive({
      token: 'token-1',
      user: {
        id: 'user-1',
        role: 'super_admin',
        title: null,
      },
    })
    onboardingStoreRef.current = reactive({
      activeOrganizationId: 'org-1',
    })
    productStoreRef.current = reactive({
      activeProduct: {
        id: 'sidebar-product-1',
        name: 'Sidebar Product 1',
        organizationId: 'org-1',
      },
      products: [
        { id: 'product-1', name: 'Product 1', organizationId: 'org-1' },
        { id: 'product-2', name: 'Product 2', organizationId: 'org-1' },
      ],
    })
    rolesStoreRef.current = reactive({ myTitle: null })

    usersListMock.mockReset()
    usersListMock.mockResolvedValue([])
    dashboardSelectPageMock.mockReset()
    if (dashboardPagesRef.current) {
      dashboardPagesRef.current.value = [buildSystemHomePage()]
    }
    if (dashboardActivePageIdRef.current) {
      dashboardActivePageIdRef.current.value = 'page-1'
    }
    getDailyBriefMock.mockReset()
    getDailyBriefMock.mockResolvedValue({
      brief: 'Daily brief',
      source: 'fallback',
      view: 'my_tasks',
      mode: 'summary',
      sections: [],
      generatedAt: new Date().toISOString(),
      cached: false,
    })
  })

  it('defaults brief requests to all scope and ignores sidebar product changes', async () => {
    const wrapper = mountDashboard()

    await flushView()
    expect(getDailyBriefMock).toHaveBeenCalled()

    const firstCallOptions = getDailyBriefMock.mock.calls[0]?.[1]
    expect(firstCallOptions).toMatchObject({
      organizationId: 'org-1',
      scopeMode: 'all',
      productId: null,
      view: 'my_tasks',
      mode: 'summary',
    })

    const callCountBeforeSidebarChange = getDailyBriefMock.mock.calls.length
    productStoreRef.current.activeProduct = {
      id: 'sidebar-product-2',
      name: 'Sidebar Product 2',
      organizationId: 'org-1',
    }
    await flushView()
    expect(getDailyBriefMock.mock.calls.length).toBe(callCountBeforeSidebarChange)

    wrapper.unmount()
  })

  it('requests a product-scoped brief after scope selection changes', async () => {
    const wrapper = mountDashboard()

    await flushView()
    const callCountBeforeScopeChange = getDailyBriefMock.mock.calls.length
    const productScopeButton = wrapper.findAll('button').find((button) => button.text().includes('Single Product'))
    expect(productScopeButton).toBeTruthy()
    await productScopeButton!.trigger('click')
    await flushView()

    expect(getDailyBriefMock.mock.calls.length).toBeGreaterThan(callCountBeforeScopeChange)
    const latestCallOptions = getDailyBriefMock.mock.calls[getDailyBriefMock.mock.calls.length - 1]?.[1]
    expect(latestCallOptions).toMatchObject({
      organizationId: 'org-1',
      scopeMode: 'product',
      productId: 'product-1',
    })

    wrapper.unmount()
  })

  it('renders simplified scope controls without managed team mode', async () => {
    const wrapper = mountDashboard()

    await flushView()
    const text = wrapper.text()
    expect(text).toContain('All Products')
    expect(text).toContain('Single Product')
    expect(text).toContain('Team-specific scope is selected inside Team View')
    expect(text).not.toContain('Managed Team')

    wrapper.unmount()
  })

  it('keeps a selected custom page active after dashboard refreshes', async () => {
    const wrapper = mountDashboard()

    await flushView()

    expect(dashboardPagesRef.current).toBeTruthy()
    expect(dashboardActivePageIdRef.current).toBeTruthy()
    if (!dashboardPagesRef.current || !dashboardActivePageIdRef.current) return

    const customPage = buildCustomHomePage()
    dashboardPagesRef.current.value = [buildSystemHomePage(), customPage]
    dashboardActivePageIdRef.current.value = customPage.id
    await flushView()

    expect(dashboardActivePageIdRef.current.value).toBe(customPage.id)

    const selectionCallsBeforeRefresh = dashboardSelectPageMock.mock.calls.length
    dashboardPagesRef.current.value = [...dashboardPagesRef.current.value]
    await flushView()

    expect(dashboardActivePageIdRef.current.value).toBe(customPage.id)
    expect(dashboardSelectPageMock.mock.calls.length).toBe(selectionCallsBeforeRefresh)

    wrapper.unmount()
  })

  it('migrates legacy team scope settings to all products', async () => {
    window.localStorage.setItem('home-scope-mode', 'team')
    window.localStorage.setItem('home-scope-team-id', 'legacy-team-1')

    const wrapper = mountDashboard()

    await flushView()
    const latestCallOptions = getDailyBriefMock.mock.calls[getDailyBriefMock.mock.calls.length - 1]?.[1]
    expect(latestCallOptions).toMatchObject({
      scopeMode: 'all',
      productId: null,
    })
    expect(['', null]).toContain(window.localStorage.getItem('home-scope-team-id'))

    wrapper.unmount()
  })
})
