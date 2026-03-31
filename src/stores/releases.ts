import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Release, CreateReleasePayload, TargetStatus } from '@/types/release'
import { useAuthStore } from '@/stores/auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export const useReleasesStore = defineStore('releases', () => {
  const releases = ref<Release[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const totalApprox = ref<number | null>(null)

  const releaseCount = computed(() => releases.value.length)

  function resolveScope(explicitProductId?: string | null) {
    return resolveProductScope(explicitProductId)
  }

  function extractItems(payload: unknown): {
    items: Release[]
    nextCursor: string | null
    hasMore: boolean
    totalApprox: number | null
  } {
    if (Array.isArray(payload)) {
      return { items: payload as Release[], nextCursor: null, hasMore: false, totalApprox: null }
    }
    if (payload && typeof payload === 'object') {
      const envelope = payload as {
        items?: Release[]
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

  async function fetchReleases(
    productId?: string,
    options: { q?: string; sort?: string; cursor?: string | null; limit?: number } = {},
  ) {
    assertPageAction('releases', 'read', 'releases')
    const scope = resolveScope(productId)
    if (!scope) {
      releases.value = []
      return
    }
    const authStore = useAuthStore()
    loading.value = true
    error.value = null
    try {
      const res = await apiFetch(buildProductScopedPath(scope, '/releases'), {
        token: authStore.token,
        query: {
          paged: 1,
          limit: options.limit ?? 30,
          q: options.q,
          sort: options.sort,
          cursor: options.cursor,
        },
      })
      await ensureOk(res, 'Failed to fetch releases')
      const parsed = extractItems(await res.json())
      releases.value = parsed.items
      nextCursor.value = parsed.nextCursor
      hasMore.value = parsed.hasMore
      totalApprox.value = parsed.totalApprox
    } catch (e) {
      error.value = (e as Error).message
      releases.value = []
      nextCursor.value = null
      hasMore.value = false
      totalApprox.value = null
    } finally {
      loading.value = false
    }
  }

  async function fetchRelease(id: string): Promise<Release | null> {
    try {
      assertPageAction('releases', 'read', 'releases')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/releases/${id}`), {
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to fetch release')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function createRelease(payload: CreateReleasePayload): Promise<Release | null> {
    try {
      assertPageAction('releases', 'create', 'releases')
      const authStore = useAuthStore()
      const scope = resolveScope((payload as { productId?: string | null }).productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/releases'), {
        method: 'POST',
        token: authStore.token,
        json: {
          ...payload,
          productId: scope.productId,
        },
      })
      await ensureOk(res, 'Failed to create release')
      const created = await res.json()
      await fetchReleases()
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateRelease(id: string, payload: Partial<CreateReleasePayload>) {
    try {
      assertPageAction('releases', 'edit', 'releases')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/releases/${id}`), {
        method: 'PUT',
        token: authStore.token,
        json: payload,
      })
      await ensureOk(res, 'Failed to update release')
      await fetchReleases()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteRelease(id: string) {
    try {
      assertPageAction('releases', 'delete', 'releases')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/releases/${id}`), {
        method: 'DELETE',
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to delete release')
      releases.value = releases.value.filter(r => r.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function addDeploymentTargets(releaseId: string, deploymentId: string, serverIds: string[]) {
    try {
      assertPageAction('releases', 'edit', 'release deployments')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/releases/${releaseId}/deployments/${deploymentId}/targets`), {
        method: 'POST',
        token: authStore.token,
        json: { serverIds },
      })
      await ensureOk(res, 'Failed to add deployment targets')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateTargetStatus(releaseId: string, deploymentId: string, targetId: string, status: TargetStatus) {
    try {
      assertPageAction('releases', 'edit', 'release deployments')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/releases/${releaseId}/deployments/${deploymentId}/targets/${targetId}`), {
        method: 'PUT',
        token: authStore.token,
        json: { status },
      })
      await ensureOk(res, 'Failed to update target status')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function removeDeploymentTarget(releaseId: string, deploymentId: string, targetId: string) {
    try {
      assertPageAction('releases', 'delete', 'deployment targets')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/releases/${releaseId}/deployments/${deploymentId}/targets/${targetId}`), {
        method: 'DELETE',
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to remove target')
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function updateDeployment(releaseId: string, deploymentId: string, payload: { status?: string; notes?: string | null }) {
    try {
      assertPageAction('releases', 'edit', 'release deployments')
      const authStore = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/releases/${releaseId}/deployments/${deploymentId}`), {
        method: 'PUT',
        token: authStore.token,
        json: payload,
      })
      await ensureOk(res, 'Failed to update deployment')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  return {
    releases, loading, error, releaseCount,
    nextCursor, hasMore, totalApprox,
    fetchReleases, fetchRelease, createRelease, updateRelease, deleteRelease,
    addDeploymentTargets, updateTargetStatus, removeDeploymentTarget, updateDeployment,
  }
})
