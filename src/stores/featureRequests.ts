import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FeatureRequest, CreateFeatureRequestPayload, FeatureRequestComment } from '@/types/featureRequest'
import { useAuthStore } from './auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

const API_BASE = '/feature-requests'

export const useFeatureRequestsStore = defineStore('featureRequests', () => {
  const items = ref<FeatureRequest[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const totalApprox = ref<number | null>(null)

  function authToken() {
    return useAuthStore().token
  }

  function resolveScope(explicitProductId?: string) {
    return resolveProductScope(explicitProductId)
  }

  function extractItems(payload: unknown): {
    items: FeatureRequest[]
    nextCursor: string | null
    hasMore: boolean
    totalApprox: number | null
  } {
    if (Array.isArray(payload)) {
      return { items: payload as FeatureRequest[], nextCursor: null, hasMore: false, totalApprox: null }
    }
    if (payload && typeof payload === 'object') {
      const envelope = payload as {
        items?: FeatureRequest[]
        nextCursor?: string | null
        hasMore?: boolean
        totalApprox?: number
      }
      return {
        items: Array.isArray(envelope.items) ? envelope.items : [],
        nextCursor: envelope.nextCursor ?? null,
        hasMore: Boolean(envelope.hasMore),
        totalApprox: typeof envelope.totalApprox === 'number' ? envelope.totalApprox : null,
      }
    }
    return { items: [], nextCursor: null, hasMore: false, totalApprox: null }
  }

  async function fetchAll(
    productId?: string,
    sort?: string,
    options: { q?: string; cursor?: string | null; limit?: number } = {},
  ) {
    assertPageAction('feature-requests', 'read', 'feature requests')
    loading.value = true
    error.value = null
    try {
      const scope = resolveScope(productId)
      if (!scope) {
        items.value = []
        return
      }
      const params = new URLSearchParams()
      params.set('paged', '1')
      params.set('limit', String(options.limit ?? 30))
      if (sort) params.set('sort', sort)
      if (options.q) params.set('q', options.q)
      if (options.cursor) params.set('cursor', options.cursor)
      const res = await apiFetch(buildProductScopedPath(scope, API_BASE), {
        token: authToken(),
        query: Object.fromEntries(params.entries()),
      })
      await ensureOk(res, 'Failed to fetch feature requests')
      const parsed = extractItems(await res.json())
      items.value = parsed.items
      nextCursor.value = parsed.nextCursor
      hasMore.value = parsed.hasMore
      totalApprox.value = parsed.totalApprox
    } catch (e) {
      error.value = (e as Error).message
      items.value = []
      nextCursor.value = null
      hasMore.value = false
      totalApprox.value = null
    } finally {
      loading.value = false
    }
  }

  async function create(payload: CreateFeatureRequestPayload): Promise<FeatureRequest | null> {
    try {
      assertPageAction('feature-requests', 'create', 'feature requests')
      const scope = resolveScope(payload.productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, API_BASE), {
        method: 'POST',
        token: authToken(),
        json: {
          ...payload,
          productId: scope.productId,
        },
      })
      await ensureOk(res, 'Failed to create feature request')
      const created = await res.json()
      await fetchAll(scope.productId)
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function update(id: string, data: Partial<FeatureRequest>): Promise<boolean> {
    try {
      assertPageAction('feature-requests', 'edit', 'feature requests')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/${id}`), {
        method: 'PUT',
        token: authToken(),
        json: data,
      })
      await ensureOk(res, 'Failed to update feature request')
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      assertPageAction('feature-requests', 'delete', 'feature requests')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/${id}`), {
        method: 'DELETE',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to delete feature request')
      items.value = items.value.filter(i => i.id !== id)
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function toggleUpvote(id: string): Promise<boolean> {
    try {
      assertPageAction('feature-requests', 'edit', 'feature requests')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/${id}/upvote`), {
        method: 'POST',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to update upvote')
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function addComment(id: string, content: string): Promise<FeatureRequestComment | null> {
    try {
      assertPageAction('feature-requests', 'create', 'feature request comments')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/${id}/comments`), {
        method: 'POST',
        token: authToken(),
        json: { content },
      })
      await ensureOk(res, 'Failed to add feature request comment')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  return {
    items,
    loading,
    error,
    nextCursor,
    hasMore,
    totalApprox,
    fetchAll,
    create,
    update,
    remove,
    toggleUpvote,
    addComment,
  }
})
