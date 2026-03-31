// @vitest-environment jsdom

import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MainHeader from './MainHeader.vue'

const pushMock = vi.fn()

const authStoreMock = reactive({
  token: 'token',
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'super_admin',
    avatar: '',
  },
  logout: vi.fn(),
})

const notificationsStoreMock = reactive({
  unreadCount: 0,
  filteredUnreadCount: 0,
  hasUnread: false,
  hasMore: false,
  loadingInbox: false,
  items: [] as any[],
  typeFacets: [] as Array<{ type: string; label: string; count: number }>,
  reset: vi.fn(),
  fetchInbox: vi.fn(async () => []),
  fetchUnreadCount: vi.fn(async () => 0),
  fetchFacets: vi.fn(async () => ({ filteredUnreadCount: 0, typeFacets: [] })),
  markRead: vi.fn(async () => {}),
  resolveNotificationRoute: vi.fn(() => ({ path: '/home' })),
  markAllRead: vi.fn(async () => {}),
  archive: vi.fn(async () => {}),
  archiveAll: vi.fn(async () => {}),
  fetchMore: vi.fn(async () => {}),
})

const productStoreMock = reactive({
  activeProductId: 'product-1',
  activeProduct: {
    id: 'product-1',
    name: 'Product 1',
  },
  products: [
    { id: 'product-1', name: 'Product 1' },
    { id: 'product-2', name: 'Product 2' },
  ],
  loaded: true,
  loading: false,
  fetchProducts: vi.fn(async () => []),
})

const globalSearchStoreMock = reactive({
  open: true,
  query: 'launch',
  selectedTypes: [] as Array<'task' | 'initiative' | 'delivery' | 'team_member' | 'wiki_asset'>,
  loading: false,
  error: null as string | null,
  results: [
    {
      id: 'initiative-1',
      entityType: 'initiative',
      title: 'Launch Initiative',
      subtitle: 'Owner: Product',
      descriptionSnippet: 'Primary initiative',
      productId: 'product-1',
      score: 0.9,
      matchedBy: 'lexical' as const,
      routePath: '/initiatives/initiative-1',
    },
    {
      id: 'task-1',
      entityType: 'task',
      title: 'Launch Checklist',
      subtitle: 'Status: in_progress',
      descriptionSnippet: 'Complete launch checklist',
      productId: 'product-1',
      score: 0.85,
      matchedBy: 'lexical' as const,
      routePath: '/tasks?task=task-1',
    },
  ],
  nextCursor: null as string | null,
  hasMore: false,
  totalApprox: 2,
  activeIndex: 0,
  setOpen(value: boolean) {
    this.open = value
  },
  setQuery(value: string) {
    this.query = value
  },
  toggleType(type: 'task' | 'initiative' | 'delivery' | 'team_member' | 'wiki_asset') {
    if (this.selectedTypes.includes(type)) {
      this.selectedTypes = this.selectedTypes.filter((entry) => entry !== type)
      return
    }
    this.selectedTypes = [...this.selectedTypes, type]
  },
  clearTypes() {
    this.selectedTypes = []
  },
  moveActive(delta: number) {
    if (this.results.length === 0) {
      this.activeIndex = -1
      return
    }
    const current = this.activeIndex < 0 ? -1 : this.activeIndex
    this.activeIndex = (current + delta + this.results.length) % this.results.length
  },
  setActive(index: number) {
    this.activeIndex = index
  },
  runSearch: vi.fn(async () => {}),
  loadMore: vi.fn(async () => {}),
  resetResults: vi.fn(),
  resetAll: vi.fn(),
  cancelInFlight: vi.fn(),
})

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreMock,
}))

vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => notificationsStoreMock,
}))

vi.mock('@/stores/products', () => ({
  useProductStore: () => productStoreMock,
}))

vi.mock('@/stores/globalSearch', () => ({
  useGlobalSearchStore: () => globalSearchStoreMock,
}))

describe('MainHeader global search', () => {
  beforeEach(() => {
    pushMock.mockReset()
    globalSearchStoreMock.open = true
    globalSearchStoreMock.query = 'launch'
    globalSearchStoreMock.activeIndex = 0
    globalSearchStoreMock.error = null
    globalSearchStoreMock.loading = false
    notificationsStoreMock.unreadCount = 0
    notificationsStoreMock.filteredUnreadCount = 0
    notificationsStoreMock.items = []
    notificationsStoreMock.typeFacets = []
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('renders combobox semantics for the search input', async () => {
    const wrapper = mount(MainHeader, {
      global: {
        stubs: {
          Popover: { template: '<div><slot /></div>' },
          PopoverTrigger: { template: '<div><slot /></div>' },
          PopoverContent: { template: '<div><slot /></div>' },
        },
      },
    })

    const input = wrapper.find('input[role="combobox"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('aria-controls')).toBe('global-search-listbox')
    expect(input.attributes('aria-expanded')).toBe('true')
    expect(input.attributes('aria-autocomplete')).toBe('list')
    expect(wrapper.find('#global-search-listbox').exists()).toBe(true)

    wrapper.unmount()
  })

  it('supports arrow navigation, enter open, and escape close', async () => {
    const wrapper = mount(MainHeader, {
      global: {
        stubs: {
          Popover: { template: '<div><slot /></div>' },
          PopoverTrigger: { template: '<div><slot /></div>' },
          PopoverContent: { template: '<div><slot /></div>' },
        },
      },
    })

    const input = wrapper.find('input[role="combobox"]')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(globalSearchStoreMock.activeIndex).toBe(1)

    await input.trigger('keydown', { key: 'Enter' })
    expect(pushMock).toHaveBeenCalledWith('/tasks?task=task-1')

    await input.trigger('keydown', { key: 'Escape' })
    expect(globalSearchStoreMock.open).toBe(false)

    wrapper.unmount()
  })

  it('renders upgraded popover actions and unified intent/product filters', async () => {
    const wrapper = mount(MainHeader, {
      global: {
        stubs: {
          Popover: { template: '<div><slot /></div>' },
          PopoverTrigger: { template: '<div><slot /></div>' },
          PopoverContent: { template: '<div><slot /></div>' },
        },
      },
    })

    const text = wrapper.text()
    expect(text).toContain('Needs my action')
    expect(text).toContain('Assigned to me')
    expect(text).toContain('Needs my review')
    expect(text).toContain('At risk')
    expect(text).toContain('Releases')
    expect(text).toContain('Unassigned')

    const productSelect = wrapper.findAll('select')
      .find((selectEl) => selectEl.find('option[value="all_products"]').exists())
    expect(productSelect).toBeTruthy()
    expect(productSelect!.find('option[value="product-2"]').exists()).toBe(true)

    expect(wrapper.text()).toContain('Mark all as read (0)')
    expect(wrapper.text()).toContain('Archive all (0)')

    const needsActionButton = wrapper.findAll('button')
      .find((button) => button.text().includes('Needs my action'))
    expect(needsActionButton).toBeTruthy()
    await needsActionButton!.trigger('click')

    expect(wrapper.text()).toContain('Mark filtered as read (0)')
    expect(wrapper.text()).toContain('Archive filtered (0)')

    const advancedToggle = wrapper.findAll('button')
      .find((button) => button.text().includes('Advanced filters'))
    expect(advancedToggle).toBeTruthy()
    await advancedToggle!.trigger('click')

    expect(wrapper.text()).toContain('Hide advanced filters')
    expect(wrapper.text()).toContain('All categories')
    expect(wrapper.text()).toContain('All urgencies')
    expect(wrapper.text()).toContain('All severities')
    expect(wrapper.text()).toContain('All entities')

    wrapper.unmount()
  })
})
