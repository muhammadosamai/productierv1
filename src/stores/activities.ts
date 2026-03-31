import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export interface ActivityChange {
  field: string
  from: string | null
  to: string | null
}

export interface Activity {
  id: string
  productId: string | null
  userId: string | null
  userName: string
  userAvatar: string | null
  action: string
  entityType: string
  entityId: string | null
  entityTitle: string
  changes: ActivityChange[] | null
  createdAt: string
}

export const useActivitiesStore = defineStore('activities', () => {
  const activities = ref<Activity[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const totalApprox = ref<number | null>(null)

  async function fetchActivities(
    productId?: string,
    options: { q?: string; cursor?: string | null; limit?: number } = {},
  ) {
    assertPageAction('overview', 'read', 'activities')
    const scope = resolveProductScope(productId)
    loading.value = true
    error.value = null
    try {
      if (!scope) {
        activities.value = []
        return
      }
      const params = new URLSearchParams()
      params.set('paged', '1')
      params.set('limit', String(options.limit ?? 50))
      if (options.q) params.set('q', options.q)
      if (options.cursor) params.set('cursor', options.cursor)
      const res = await apiFetch(buildProductScopedPath(scope, '/activities'), {
        token: useAuthStore().token,
        query: Object.fromEntries(params.entries()),
      })
      await ensureOk(res, 'Failed to fetch activities')
      const payload = await res.json()
      if (Array.isArray(payload)) {
        activities.value = payload
        nextCursor.value = null
        hasMore.value = false
        totalApprox.value = null
      } else {
        activities.value = Array.isArray(payload?.items) ? payload.items : []
        nextCursor.value = payload?.nextCursor ?? null
        hasMore.value = Boolean(payload?.hasMore)
        totalApprox.value = typeof payload?.totalApprox === 'number' ? payload.totalApprox : null
      }
    } catch (e) {
      error.value = (e as Error).message
      activities.value = []
      nextCursor.value = null
      hasMore.value = false
      totalApprox.value = null
    } finally {
      loading.value = false
    }
  }

  return { activities, loading, error, nextCursor, hasMore, totalApprox, fetchActivities }
})
