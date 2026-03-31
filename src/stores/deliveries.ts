import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Delivery, CreateDeliveryPayload } from '@/types/delivery'
import { useAuthStore } from '@/stores/auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export const useDeliveriesStore = defineStore('deliveries', () => {
  const deliveries = ref<Delivery[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const totalApprox = ref<number | null>(null)
  const lastQuery = ref<{
    productId?: string
    q?: string
    sort?: string
    limit: number
  } | null>(null)

  const deliveryCount = computed(() => deliveries.value.length)

  function resolveScope(explicitProductId?: string | null) {
    return resolveProductScope(explicitProductId)
  }

  function extractItems(payload: unknown): {
    items: Delivery[]
    nextCursor: string | null
    hasMore: boolean
    totalApprox: number | null
  } {
    if (Array.isArray(payload)) {
      return { items: payload as Delivery[], nextCursor: null, hasMore: false, totalApprox: null }
    }
    if (payload && typeof payload === 'object') {
      const envelope = payload as {
        items?: Delivery[]
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

  function mergeDeliveries(base: Delivery[], incoming: Delivery[]) {
    const byId = new Map<string, Delivery>()
    for (const delivery of base) byId.set(delivery.id, delivery)
    for (const delivery of incoming) byId.set(delivery.id, delivery)
    return [...byId.values()]
  }

  async function reloadDeliveries() {
    const previous = lastQuery.value
    await fetchDeliveries(previous?.productId, {
      q: previous?.q,
      sort: previous?.sort,
      limit: previous?.limit,
    })
  }

  async function fetchDeliveries(
    productId?: string,
    options: { q?: string; sort?: string; cursor?: string | null; limit?: number; append?: boolean } = {},
  ) {
    assertPageAction('deliveries', 'read', 'deliveries')
    const scope = resolveScope(productId)
    if (!scope) {
      deliveries.value = []
      return
    }
    const authStore = useAuthStore()
    loading.value = true
    error.value = null
    const resolvedLimit = options.limit ?? 40
    lastQuery.value = {
      productId: scope.productId,
      q: options.q,
      sort: options.sort,
      limit: resolvedLimit,
    }
    try {
      const res = await apiFetch(buildProductScopedPath(scope, '/deliveries'), {
        token: authStore.token,
        query: {
          paged: 1,
          limit: resolvedLimit,
          q: options.q,
          sort: options.sort,
          cursor: options.cursor,
        },
      })
      await ensureOk(res, 'Failed to fetch deliveries')
      const parsed = extractItems(await res.json())
      deliveries.value = options.append ? mergeDeliveries(deliveries.value, parsed.items) : parsed.items
      nextCursor.value = parsed.nextCursor
      hasMore.value = parsed.hasMore
      totalApprox.value = parsed.totalApprox
    } catch (e) {
      error.value = (e as Error).message
      deliveries.value = []
      nextCursor.value = null
      hasMore.value = false
      totalApprox.value = null
    } finally {
      loading.value = false
    }
  }

  async function fetchDelivery(id: string): Promise<Delivery | null> {
    try {
      assertPageAction('deliveries', 'read', 'deliveries')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/deliveries/${id}`), {
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to fetch delivery')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function createDelivery(payload: CreateDeliveryPayload): Promise<Delivery | null> {
    try {
      assertPageAction('deliveries', 'create', 'deliveries')
      const authStore = useAuthStore()
      const scope = resolveScope((payload as { productId?: string | null }).productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/deliveries'), {
        method: 'POST',
        token: authStore.token,
        json: {
          ...payload,
          productId: scope.productId,
        },
      })
      await ensureOk(res, 'Failed to create delivery')
      const created = await res.json() as Delivery
      if (lastQuery.value?.q || lastQuery.value?.sort) {
        await reloadDeliveries()
      } else {
        deliveries.value = [created, ...deliveries.value.filter((delivery) => delivery.id !== created.id)]
      }
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateDelivery(
    id: string,
    payload: Partial<CreateDeliveryPayload>,
    options: { reload?: boolean } = {},
  ) {
    try {
      assertPageAction('deliveries', 'edit', 'deliveries')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/deliveries/${id}`), {
        method: 'PUT',
        token: authStore.token,
        json: payload,
      })
      await ensureOk(res, 'Failed to update delivery')
      const updated = await res.json() as Delivery
      const index = deliveries.value.findIndex((delivery) => delivery.id === id)
      if (index >= 0) {
        deliveries.value[index] = { ...deliveries.value[index]!, ...updated }
      }
      if (index < 0 || options.reload === true) {
        await reloadDeliveries()
      }
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteDelivery(id: string) {
    try {
      assertPageAction('deliveries', 'delete', 'deliveries')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/deliveries/${id}`), {
        method: 'DELETE',
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to delete delivery')
      deliveries.value = deliveries.value.filter(d => d.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return {
    deliveries, loading, error, deliveryCount,
    nextCursor, hasMore, totalApprox,
    fetchDeliveries, fetchDelivery, createDelivery, updateDelivery, deleteDelivery,
  }
})
