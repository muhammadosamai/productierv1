import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { GlobalSearchResponse } from '@/types/search'
import { useGlobalSearchStore } from './globalSearch'
import { searchApi } from '@/lib/api/searchApi'

vi.mock('@/lib/api/searchApi', () => ({
  searchApi: {
    global: vi.fn(),
  },
}))

function response(items: GlobalSearchResponse['items']): GlobalSearchResponse {
  return {
    items,
    nextCursor: null,
    hasMore: false,
    totalApprox: items.length,
  }
}

describe('globalSearch store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('keeps latest response when requests resolve out of order', async () => {
    const store = useGlobalSearchStore()
    const globalMock = vi.mocked(searchApi.global)

    let resolveFirst!: (value: GlobalSearchResponse) => void
    globalMock
      .mockImplementationOnce(async () => await new Promise((resolve) => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce(response([
        {
          id: 'task-new',
          entityType: 'task',
          title: 'New Query Task',
          subtitle: null,
          descriptionSnippet: null,
          productId: 'p1',
          score: 0.91,
          matchedBy: 'lexical',
          routePath: '/tasks?task=task-new',
        },
      ]))

    store.setQuery('legacy')
    const firstRun = store.runSearch('p1', 'token')

    store.setQuery('new query')
    const secondRun = store.runSearch('p1', 'token')

    resolveFirst(response([
      {
        id: 'task-legacy',
        entityType: 'task',
        title: 'Legacy Task',
        subtitle: null,
        descriptionSnippet: null,
        productId: 'p1',
        score: 0.65,
        matchedBy: 'lexical',
        routePath: '/tasks?task=task-legacy',
      },
    ]))

    await Promise.all([firstRun, secondRun])
    expect(store.results).toHaveLength(1)
    expect(store.results[0]?.id).toBe('task-new')
  })

  it('preserves active item across refresh when possible', async () => {
    const store = useGlobalSearchStore()
    const globalMock = vi.mocked(searchApi.global)

    globalMock
      .mockResolvedValueOnce(response([
        {
          id: 'initiative-1',
          entityType: 'initiative',
          title: 'Initiative One',
          subtitle: null,
          descriptionSnippet: null,
          productId: 'p1',
          score: 0.8,
          matchedBy: 'lexical',
          routePath: '/initiatives/initiative-1',
        },
        {
          id: 'initiative-2',
          entityType: 'initiative',
          title: 'Initiative Two',
          subtitle: null,
          descriptionSnippet: null,
          productId: 'p1',
          score: 0.7,
          matchedBy: 'lexical',
          routePath: '/initiatives/initiative-2',
        },
      ]))
      .mockResolvedValueOnce(response([
        {
          id: 'initiative-2',
          entityType: 'initiative',
          title: 'Initiative Two',
          subtitle: null,
          descriptionSnippet: null,
          productId: 'p1',
          score: 0.93,
          matchedBy: 'lexical',
          routePath: '/initiatives/initiative-2',
        },
        {
          id: 'initiative-3',
          entityType: 'initiative',
          title: 'Initiative Three',
          subtitle: null,
          descriptionSnippet: null,
          productId: 'p1',
          score: 0.81,
          matchedBy: 'lexical',
          routePath: '/initiatives/initiative-3',
        },
      ]))

    store.setQuery('initiative')
    await store.runSearch('p1', 'token')
    store.setActive(1)

    await store.runSearch('p1', 'token')

    expect(store.activeIndex).toBe(0)
    expect(store.results[store.activeIndex]?.id).toBe('initiative-2')
  })

  it('shows user-friendly error copy on failures', async () => {
    const store = useGlobalSearchStore()
    const globalMock = vi.mocked(searchApi.global)
    globalMock.mockRejectedValueOnce(new Error('backend exploded'))

    store.setQuery('search term')
    await store.runSearch('p1', 'token')

    expect(store.error).toBe('Search is temporarily unavailable. Please try again.')
  })
})
