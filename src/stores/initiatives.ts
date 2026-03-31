import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Initiative, CreateInitiativePayload, InitiativeInsights } from '@/types/initiative'
import { useAuthStore } from '@/stores/auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export const useInitiativesStore = defineStore('initiatives', () => {
  const initiatives = ref<Initiative[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const insightsLoading = ref(false)
  const insightsError = ref<string | null>(null)

  const initiativeCount = computed(() => initiatives.value.length)

  function normalizeInitiative(initiative: Initiative): Initiative {
    return {
      ...initiative,
      leader: initiative.leaderUser?.name ?? null,
      leaderAvatar: initiative.leaderUser?.avatar ?? null,
      members: initiative.members ?? [],
      teams: initiative.teams ?? [],
    }
  }

  async function fetchInitiatives(productId?: string) {
    assertPageAction('initiatives', 'read', 'initiatives')
    const auth = useAuthStore()
    const scope = resolveProductScope(productId)
    if (!scope) {
      initiatives.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const res = await apiFetch(buildProductScopedPath(scope, '/initiatives'), {
        token: auth.token,
      })
      await ensureOk(res, 'Failed to fetch initiatives')
      initiatives.value = (await res.json() as Initiative[]).map(normalizeInitiative)
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function fetchInitiative(id: string): Promise<Initiative | null> {
    try {
      assertPageAction('initiatives', 'read', 'initiatives')
      const auth = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/initiatives/${id}`), {
        token: auth.token,
      })
      await ensureOk(res, 'Failed to fetch initiative')
      return normalizeInitiative(await res.json() as Initiative)
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function fetchInitiativeInsights(id: string): Promise<InitiativeInsights | null> {
    try {
      assertPageAction('initiatives', 'read', 'initiative insights')
      const auth = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        insightsError.value = 'No active product selected'
        return null
      }
      insightsLoading.value = true
      insightsError.value = null
      const res = await apiFetch(buildProductScopedPath(scope, `/initiatives/${id}/insights`), {
        token: auth.token,
      })
      await ensureOk(res, 'Failed to fetch initiative insights')
      return await res.json()
    } catch (e) {
      insightsError.value = (e as Error).message
      return null
    } finally {
      insightsLoading.value = false
    }
  }

  async function createInitiative(payload: CreateInitiativePayload): Promise<Initiative | null> {
    try {
      assertPageAction('initiatives', 'create', 'initiatives')
      const auth = useAuthStore()
      const scope = resolveProductScope((payload as { productId?: string | null }).productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/initiatives'), {
        method: 'POST',
        token: auth.token,
        json: {
          ...payload,
          productId: scope.productId,
        },
      })
      await ensureOk(res, 'Failed to create initiative')
      const created = normalizeInitiative(await res.json() as Initiative)
      await fetchInitiatives()
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateInitiative(id: string, payload: Partial<CreateInitiativePayload>) {
    try {
      assertPageAction('initiatives', 'edit', 'initiatives')
      const auth = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/initiatives/${id}`), {
        method: 'PUT',
        token: auth.token,
        json: payload,
      })
      await ensureOk(res, 'Failed to update initiative')
      await fetchInitiatives()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteInitiative(id: string) {
    try {
      assertPageAction('initiatives', 'delete', 'initiatives')
      const auth = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/initiatives/${id}`), {
        method: 'DELETE',
        token: auth.token,
      })
      await ensureOk(res, 'Failed to delete initiative')
      initiatives.value = initiatives.value.filter(i => i.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return {
    initiatives, loading, error, initiativeCount, insightsLoading, insightsError,
    fetchInitiatives, fetchInitiative, fetchInitiativeInsights, createInitiative, updateInitiative, deleteInitiative,
  }
})
