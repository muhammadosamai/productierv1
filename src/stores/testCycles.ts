import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import type { TestCycle, CreateTestCyclePayload, CreateIssuePayload } from '@/types/testCycle'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export const useTestCyclesStore = defineStore('testCycles', () => {
  const cycles = ref<TestCycle[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const totalApprox = ref<number | null>(null)

  function authToken() {
    return useAuthStore().token
  }

  function resolveScope(explicitProductId?: string | null) {
    return resolveProductScope(explicitProductId)
  }

  function extractItems(payload: unknown): {
    items: TestCycle[]
    nextCursor: string | null
    hasMore: boolean
    totalApprox: number | null
  } {
    if (Array.isArray(payload)) {
      return { items: payload as TestCycle[], nextCursor: null, hasMore: false, totalApprox: null }
    }
    if (payload && typeof payload === 'object') {
      const envelope = payload as {
        items?: TestCycle[]
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

  async function fetchCycles(
    productId?: string,
    options: { q?: string; sort?: string; cursor?: string | null; limit?: number } = {},
  ) {
    assertPageAction('test-cycles', 'read', 'test cycles')
    loading.value = true
    error.value = null
    try {
      const scope = resolveScope(productId)
      if (!scope) {
        cycles.value = []
        return
      }
      const params = new URLSearchParams()
      params.set('paged', '1')
      params.set('limit', String(options.limit ?? 30))
      if (options.q) params.set('q', options.q)
      if (options.sort) params.set('sort', options.sort)
      if (options.cursor) params.set('cursor', options.cursor)
      const res = await apiFetch(buildProductScopedPath(scope, '/test-cycles'), {
        token: authToken(),
        query: Object.fromEntries(params.entries()),
      })
      await ensureOk(res, 'Failed to fetch test cycles')
      const parsed = extractItems(await res.json())
      cycles.value = parsed.items
      nextCursor.value = parsed.nextCursor
      hasMore.value = parsed.hasMore
      totalApprox.value = parsed.totalApprox
    } catch (e) {
      error.value = (e as Error).message
      cycles.value = []
      nextCursor.value = null
      hasMore.value = false
      totalApprox.value = null
    }
    finally { loading.value = false }
  }

  async function fetchCycle(id: string): Promise<TestCycle | null> {
    try {
      assertPageAction('test-cycles', 'read', 'test cycles')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/test-cycles/${id}`), {
        token: authToken(),
      })
      await ensureOk(res, 'Failed to fetch test cycle')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
    }
    return null
  }

  async function createCycle(payload: CreateTestCyclePayload): Promise<TestCycle | null> {
    try {
      assertPageAction('test-cycles', 'create', 'test cycles')
      const scope = resolveScope((payload as { productId?: string | null }).productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/test-cycles'), {
        method: 'POST',
        token: authToken(),
        json: { ...payload, productId: scope.productId },
      })
      await ensureOk(res, 'Failed to create test cycle')
      const cycle = await res.json()
      cycles.value.unshift(cycle)
      return cycle
    } catch (e) {
      error.value = (e as Error).message
    }
    return null
  }

  async function updateCycle(id: string, payload: Partial<CreateTestCyclePayload>): Promise<TestCycle | null> {
    try {
      assertPageAction('test-cycles', 'edit', 'test cycles')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/test-cycles/${id}`), {
        method: 'PUT',
        token: authToken(),
        json: payload,
      })
      await ensureOk(res, 'Failed to update test cycle')
      const updated = await res.json()
      const idx = cycles.value.findIndex(c => c.id === id)
      if (idx >= 0) cycles.value[idx] = updated
      return updated
    } catch (e) {
      error.value = (e as Error).message
    }
    return null
  }

  async function deleteCycle(id: string): Promise<boolean> {
    try {
      assertPageAction('test-cycles', 'delete', 'test cycles')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/test-cycles/${id}`), {
        method: 'DELETE',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to delete test cycle')
      cycles.value = cycles.value.filter(c => c.id !== id)
      return true
    } catch (e) {
      error.value = (e as Error).message
    }
    return false
  }

  async function addIssue(cycleId: string, payload: CreateIssuePayload) {
    try {
      assertPageAction('issues', 'create', 'issues')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/test-cycles/${cycleId}/issues`), {
        method: 'POST',
        token: authToken(),
        json: payload,
      })
      await ensureOk(res, 'Failed to add issue')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
    }
    return null
  }

  async function updateIssue(cycleId: string, issueId: string, payload: Partial<CreateIssuePayload>) {
    try {
      assertPageAction('issues', 'edit', 'issues')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/test-cycles/${cycleId}/issues/${issueId}`), {
        method: 'PUT',
        token: authToken(),
        json: payload,
      })
      await ensureOk(res, 'Failed to update issue')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
    }
    return null
  }

  async function deleteIssue(cycleId: string, issueId: string) {
    try {
      assertPageAction('issues', 'delete', 'issues')
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/test-cycles/${cycleId}/issues/${issueId}`), {
        method: 'DELETE',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to delete issue')
      return true
    } catch (e) {
      error.value = (e as Error).message
    }
    return false
  }

  return {
    cycles, loading, error, nextCursor, hasMore, totalApprox,
    fetchCycles, fetchCycle, createCycle, updateCycle, deleteCycle,
    addIssue, updateIssue, deleteIssue,
  }
})
