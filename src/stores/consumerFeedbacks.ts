import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ConsumerFeedback } from '@/types/consumerFeedback'
import { useAuthStore } from './auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

const API = '/consumer-feedbacks'

export const useConsumerFeedbacksStore = defineStore('consumerFeedbacks', () => {
  const items = ref<ConsumerFeedback[]>([])
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
    items: ConsumerFeedback[]
    nextCursor: string | null
    hasMore: boolean
    totalApprox: number | null
  } {
    if (Array.isArray(payload)) {
      return { items: payload as ConsumerFeedback[], nextCursor: null, hasMore: false, totalApprox: null }
    }
    if (payload && typeof payload === 'object') {
      const envelope = payload as {
        items?: ConsumerFeedback[]
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
    options: { q?: string; sort?: string; cursor?: string | null; limit?: number } = {},
  ) {
    assertPageAction('feedbacks', 'read', 'feedback')
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
      if (options.q) params.set('q', options.q)
      if (options.sort) params.set('sort', options.sort)
      if (options.cursor) params.set('cursor', options.cursor)
      const res = await apiFetch(buildProductScopedPath(scope, API), {
        token: authToken(),
        query: Object.fromEntries(params.entries()),
      })
      await ensureOk(res, 'Failed to fetch feedback')
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
    } finally { loading.value = false }
  }

  async function fetchOne(id: string): Promise<ConsumerFeedback | null> {
    try {
      assertPageAction('feedbacks', 'read', 'feedback')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `${API}/${id}`), { token: authToken() })
      await ensureOk(res, 'Failed to fetch feedback')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function create(data: any): Promise<ConsumerFeedback | null> {
    try {
      if (useAuthStore().token) {
        assertPageAction('feedbacks', 'create', 'feedback')
      }
      const scope = resolveScope(data?.productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, API), {
        method: 'POST',
        token: authToken(),
        json: {
          ...data,
          productId: scope.productId,
        },
      })
      await ensureOk(res, 'Failed to create feedback')
      const created = await res.json()
      if (useAuthStore().token) {
        await fetchAll(scope.productId)
      }
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function update(id: string, data: any): Promise<boolean> {
    try {
      assertPageAction('feedbacks', 'edit', 'feedback')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `${API}/${id}`), {
        method: 'PUT',
        token: authToken(),
        json: data,
      })
      await ensureOk(res, 'Failed to update feedback')
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      assertPageAction('feedbacks', 'delete', 'feedback')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `${API}/${id}`), {
        method: 'DELETE',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to delete feedback')
      items.value = items.value.filter(i => i.id !== id)
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function addComment(id: string, content: string, isInternal = false) {
    try {
      assertPageAction('feedbacks', 'create', 'feedback comments')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `${API}/${id}/comments`), {
        method: 'POST',
        token: authToken(),
        json: { content, isInternal },
      })
      await ensureOk(res, 'Failed to add feedback comment')
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
    fetchOne,
    create,
    update,
    remove,
    addComment,
  }
})
