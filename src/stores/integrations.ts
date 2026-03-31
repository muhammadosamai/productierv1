import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import {
  type ConnectIntegrationPayload,
  type IntegrationCatalogConnector,
  type IntegrationConnection,
  type IntegrationSyncEvent,
  type IntegrationSyncRun,
} from '@/types/integration'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

const API_BASE = '/integrations'

export const useIntegrationsStore = defineStore('integrations', () => {
  const catalog = ref<IntegrationCatalogConnector[]>([])
  const connections = ref<IntegrationConnection[]>([])
  const syncRunsByConnection = ref<Record<string, IntegrationSyncRun[]>>({})
  const syncEventsByRun = ref<Record<string, IntegrationSyncEvent[]>>({})

  const loadingCatalog = ref(false)
  const loadingConnections = ref(false)
  const runningAction = ref(false)
  const error = ref<string | null>(null)

  const activeConnectionId = ref<string | null>(null)
  const activeRunId = ref<string | null>(null)

  const connectedCount = computed(
    () => connections.value.filter((item) => item.status === 'connected').length,
  )

  function authToken() {
    return useAuthStore().token
  }

  function resolveScope(explicitProductId?: string) {
    return resolveProductScope(explicitProductId)
  }

  async function fetchCatalog() {
    assertPageAction('integrations', 'read', 'integrations catalog')
    const scope = resolveScope()
    if (!scope) {
      catalog.value = []
      return
    }
    loadingCatalog.value = true
    error.value = null
    try {
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/catalog`), {
        token: authToken(),
      })
      await ensureOk(res, 'Failed to fetch integrations catalog')
      catalog.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
      catalog.value = []
    } finally {
      loadingCatalog.value = false
    }
  }

  async function fetchConnections(productId?: string) {
    assertPageAction('integrations', 'read', 'integration connections')
    const scope = resolveScope(productId)
    if (!scope) {
      connections.value = []
      return
    }

    loadingConnections.value = true
    error.value = null
    try {
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/connections`), {
        token: authToken(),
      })
      await ensureOk(res, 'Failed to fetch integration connections')
      connections.value = await res.json()
      if (!connections.value.find((item) => item.id === activeConnectionId.value)) {
        activeConnectionId.value = connections.value[0]?.id || null
      }
    } catch (e) {
      error.value = (e as Error).message
      connections.value = []
    } finally {
      loadingConnections.value = false
    }
  }

  async function connectConnector(
    connectorKey: string,
    payload: ConnectIntegrationPayload,
    productId?: string,
  ): Promise<IntegrationConnection | null> {
    assertPageAction('integrations', 'create', 'integration connections')
    const scope = resolveScope(productId)
    if (!scope) {
      error.value = 'Select a product before connecting integrations.'
      return null
    }

    runningAction.value = true
    error.value = null
    try {
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/${encodeURIComponent(connectorKey)}/connect`), {
        method: 'POST',
        token: authToken(),
        json: {
          productId: scope.productId,
          ...payload,
        },
      })
      await ensureOk(res, 'Failed to connect integration')
      const connected = await res.json() as IntegrationConnection
      await fetchConnections(scope.productId)
      activeConnectionId.value = connected.id
      return connected
    } catch (e) {
      error.value = (e as Error).message
      return null
    } finally {
      runningAction.value = false
    }
  }

  async function testConnection(connectionId: string): Promise<IntegrationSyncRun | null> {
    assertPageAction('integrations', 'edit', 'integration connections')
    const scope = resolveScope()
    if (!scope) {
      error.value = 'No active product selected'
      return null
    }
    runningAction.value = true
    error.value = null
    try {
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/${encodeURIComponent(connectionId)}/test`), {
        method: 'POST',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to run integration test')
      const run = await res.json() as IntegrationSyncRun
      await Promise.all([
        fetchConnections(),
        fetchSyncRuns(connectionId),
      ])
      activeRunId.value = run.id
      return run
    } catch (e) {
      error.value = (e as Error).message
      return null
    } finally {
      runningAction.value = false
    }
  }

  async function runSync(connectionId: string): Promise<IntegrationSyncRun | null> {
    assertPageAction('integrations', 'edit', 'integration sync')
    const scope = resolveScope()
    if (!scope) {
      error.value = 'No active product selected'
      return null
    }
    runningAction.value = true
    error.value = null
    try {
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/${encodeURIComponent(connectionId)}/sync`), {
        method: 'POST',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to run integration sync')
      const run = await res.json() as IntegrationSyncRun
      await Promise.all([
        fetchConnections(),
        fetchSyncRuns(connectionId),
      ])
      activeRunId.value = run.id
      return run
    } catch (e) {
      error.value = (e as Error).message
      return null
    } finally {
      runningAction.value = false
    }
  }

  async function fetchSyncRuns(connectionId: string, limit = 25) {
    assertPageAction('integrations', 'read', 'integration sync runs')
    const scope = resolveScope()
    if (!scope) {
      syncRunsByConnection.value = {
        ...syncRunsByConnection.value,
        [connectionId]: [],
      }
      return
    }
    try {
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/${encodeURIComponent(connectionId)}/sync-runs`), {
        token: authToken(),
        query: { limit },
      })
      await ensureOk(res, 'Failed to fetch sync runs')
      const runs = await res.json() as IntegrationSyncRun[]
      syncRunsByConnection.value = {
        ...syncRunsByConnection.value,
        [connectionId]: runs,
      }
      if (runs.length > 0 && !activeRunId.value) activeRunId.value = runs[0]!.id
    } catch (e) {
      error.value = (e as Error).message
      syncRunsByConnection.value = {
        ...syncRunsByConnection.value,
        [connectionId]: [],
      }
    }
  }

  async function fetchSyncEvents(runId: string) {
    assertPageAction('integrations', 'read', 'integration sync events')
    const scope = resolveScope()
    if (!scope) {
      syncEventsByRun.value = {
        ...syncEventsByRun.value,
        [runId]: [],
      }
      return
    }
    try {
      const res = await apiFetch(buildProductScopedPath(scope, `${API_BASE}/sync-runs/${encodeURIComponent(runId)}/events`), {
        token: authToken(),
      })
      await ensureOk(res, 'Failed to fetch sync events')
      const events = await res.json() as IntegrationSyncEvent[]
      syncEventsByRun.value = {
        ...syncEventsByRun.value,
        [runId]: events,
      }
    } catch (e) {
      error.value = (e as Error).message
      syncEventsByRun.value = {
        ...syncEventsByRun.value,
        [runId]: [],
      }
    }
  }

  function clearSelection() {
    activeConnectionId.value = null
    activeRunId.value = null
  }

  return {
    catalog,
    connections,
    syncRunsByConnection,
    syncEventsByRun,
    loadingCatalog,
    loadingConnections,
    runningAction,
    error,
    activeConnectionId,
    activeRunId,
    connectedCount,
    fetchCatalog,
    fetchConnections,
    connectConnector,
    testConnection,
    runSync,
    fetchSyncRuns,
    fetchSyncEvents,
    clearSelection,
  }
})
