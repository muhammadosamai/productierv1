import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { searchApi } from '@/lib/api/searchApi'
import type { GlobalSearchResult, SearchEntityType } from '@/types/search'

const DEFAULT_LIMIT = 20
const ALL_TYPES: SearchEntityType[] = [
  'task',
  'initiative',
  'delivery',
  'team_member',
  'wiki_asset',
]

export const useGlobalSearchStore = defineStore('global-search', () => {
  const open = ref(false)
  const query = ref('')
  const selectedTypes = ref<SearchEntityType[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const results = ref<GlobalSearchResult[]>([])
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const totalApprox = ref(0)
  const activeIndex = ref(-1)

  const effectiveTypes = computed(() => (
    selectedTypes.value.length > 0 ? selectedTypes.value : ALL_TYPES
  ))

  let requestVersion = 0
  let currentAbort: AbortController | null = null

  function resultKey(result: Pick<GlobalSearchResult, 'entityType' | 'id'>): string {
    return `${result.entityType}:${result.id}`
  }

  function userFacingErrorMessage(err: unknown): string {
    const message = (err as Error)?.message || ''
    if (!message) return 'Search is temporarily unavailable.'
    if (message.toLowerCase().includes('abort')) return 'Search was cancelled.'
    return 'Search is temporarily unavailable. Please try again.'
  }

  function resetResults() {
    results.value = []
    nextCursor.value = null
    hasMore.value = false
    totalApprox.value = 0
    activeIndex.value = -1
    error.value = null
  }

  function clearResultsState() {
    results.value = []
    nextCursor.value = null
    hasMore.value = false
    totalApprox.value = 0
    activeIndex.value = -1
  }

  function cancelInFlight() {
    if (currentAbort) {
      currentAbort.abort()
      currentAbort = null
    }
  }

  function setOpen(value: boolean) {
    open.value = value
    if (!value) {
      activeIndex.value = -1
      cancelInFlight()
      loading.value = false
    }
  }

  function setQuery(value: string) {
    query.value = value
  }

  function toggleType(type: SearchEntityType) {
    if (selectedTypes.value.includes(type)) {
      selectedTypes.value = selectedTypes.value.filter((entry) => entry !== type)
      return
    }
    selectedTypes.value = [...selectedTypes.value, type]
  }

  function clearTypes() {
    selectedTypes.value = []
  }

  function moveActive(delta: number) {
    if (results.value.length === 0) {
      activeIndex.value = -1
      return
    }
    const current = activeIndex.value < 0 ? -1 : activeIndex.value
    const next = (current + delta + results.value.length) % results.value.length
    activeIndex.value = next
  }

  function setActive(index: number) {
    if (index < 0 || index >= results.value.length) {
      activeIndex.value = -1
      return
    }
    activeIndex.value = index
  }

  async function runSearch(
    productId: string | null | undefined,
    token?: string | null,
    options: { append?: boolean } = {},
  ) {
    const q = query.value.trim()
    const scopedProductId = productId || ''
    if (!q || !scopedProductId) {
      cancelInFlight()
      loading.value = false
      resetResults()
      return
    }

    const append = options.append === true
    const cursor = append ? nextCursor.value : null
    const activeResult = !append && activeIndex.value >= 0
      ? results.value[activeIndex.value]
      : undefined
    const previousActiveKey = activeResult
      ? resultKey(activeResult)
      : null
    if (!append) {
      cancelInFlight()
      error.value = null
    }

    const requestId = ++requestVersion
    const controller = new AbortController()
    currentAbort = controller
    loading.value = true

    try {
      const payload = await searchApi.global({
        productId: scopedProductId,
        q,
        types: effectiveTypes.value,
        limit: DEFAULT_LIMIT,
        cursor,
      }, token, controller.signal)

      if (requestId !== requestVersion) return

      if (append) {
        results.value = [...results.value, ...payload.items]
      } else {
        results.value = payload.items
      }
      nextCursor.value = payload.nextCursor
      hasMore.value = payload.hasMore
      totalApprox.value = payload.totalApprox
      if (!append) {
        if (payload.items.length === 0) {
          activeIndex.value = -1
        } else if (previousActiveKey) {
          const stableIndex = payload.items.findIndex((item) => resultKey(item) === previousActiveKey)
          activeIndex.value = stableIndex >= 0 ? stableIndex : 0
        } else {
          activeIndex.value = 0
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      if (requestId !== requestVersion) return
      error.value = userFacingErrorMessage(err)
      if (!append) clearResultsState()
    } finally {
      if (requestId === requestVersion) {
        loading.value = false
      }
      if (currentAbort === controller) {
        currentAbort = null
      }
    }
  }

  async function loadMore(productId: string | null | undefined, token?: string | null) {
    if (!hasMore.value || loading.value) return
    await runSearch(productId, token, { append: true })
  }

  function resetAll() {
    cancelInFlight()
    loading.value = false
    query.value = ''
    selectedTypes.value = []
    resetResults()
  }

  return {
    open,
    query,
    selectedTypes,
    effectiveTypes,
    loading,
    error,
    results,
    nextCursor,
    hasMore,
    totalApprox,
    activeIndex,
    setOpen,
    setQuery,
    toggleType,
    clearTypes,
    moveActive,
    setActive,
    runSearch,
    loadMore,
    resetResults,
    resetAll,
    cancelInFlight,
  }
})
