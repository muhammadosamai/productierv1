import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Server, CreateServerPayload, Environment } from '@/types/release'
import { useAuthStore } from '@/stores/auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export const useServersStore = defineStore('servers', () => {
  const servers = ref<Server[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchServers(environment?: Environment) {
    assertPageAction('integrations', 'read', 'servers')
    const scope = resolveProductScope()
    loading.value = true
    error.value = null
    try {
      if (!scope) {
        servers.value = []
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/servers'), {
        token: useAuthStore().token,
        query: {
          environment,
        },
      })
      await ensureOk(res, 'Failed to fetch servers')
      servers.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function createServer(payload: CreateServerPayload): Promise<Server | null> {
    try {
      assertPageAction('integrations', 'create', 'servers')
      const scope = resolveProductScope(payload.productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/servers'), {
        method: 'POST',
        token: useAuthStore().token,
        json: {
          ...payload,
          productId: scope.productId,
        },
      })
      await ensureOk(res, 'Failed to create server')
      const created = await res.json()
      await fetchServers()
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateServer(id: string, payload: Partial<CreateServerPayload>) {
    try {
      assertPageAction('integrations', 'edit', 'servers')
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/servers/${id}`), {
        method: 'PUT',
        token: useAuthStore().token,
        json: payload,
      })
      await ensureOk(res, 'Failed to update server')
      await fetchServers()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteServer(id: string) {
    try {
      assertPageAction('integrations', 'delete', 'servers')
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/servers/${id}`), {
        method: 'DELETE',
        token: useAuthStore().token,
      })
      await ensureOk(res, 'Failed to delete server')
      servers.value = servers.value.filter(s => s.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return {
    servers, loading, error,
    fetchServers, createServer, updateServer, deleteServer,
  }
})
