<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Activity,
  Check,
  Link2,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  TestTubeDiagonal,
  X,
} from 'lucide-vue-next'
import { useIntegrationsStore } from '@/stores/integrations'
import { useProductStore } from '@/stores/products'
import { usePagePermissions } from '@/lib/pagePermissions'
import type { IntegrationConnection } from '@/types/integration'

const productStore = useProductStore()
const integrationsStore = useIntegrationsStore()
const integrationsPermissions = usePagePermissions('integrations')

const searchQuery = ref('')
const selectedCategory = ref('all')

const showConnectModal = ref(false)
const selectedConnectorKey = ref<string | null>(null)
const connectDisplayName = ref('')
const connectCredentialsRaw = ref('')
const connectMetadataRaw = ref('')
const connectError = ref<string | null>(null)

const canCreateIntegrations = computed(() => integrationsPermissions.canCreate.value)
const canEditIntegrations = computed(() => integrationsPermissions.canEdit.value)

const categoryOptions = computed(() => {
  const categories = new Set<string>()
  for (const item of integrationsStore.catalog) {
    if (item.category) categories.add(item.category)
  }
  return ['all', ...Array.from(categories).sort()]
})

const connectionByConnector = computed<Record<string, IntegrationConnection>>(() =>
  integrationsStore.connections.reduce((acc, item) => {
    acc[item.connectorKey] = item
    return acc
  }, {} as Record<string, IntegrationConnection>),
)

const filteredConnectors = computed(() => {
  let rows = integrationsStore.catalog
  if (selectedCategory.value !== 'all') {
    rows = rows.filter((item) => item.category === selectedCategory.value)
  }
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    rows = rows.filter((item) =>
      item.name.toLowerCase().includes(query) ||
      (item.description || '').toLowerCase().includes(query) ||
      (item.category || '').toLowerCase().includes(query) ||
      item.connectorKey.toLowerCase().includes(query),
    )
  }
  return rows
})

const connectorRows = computed(() =>
  filteredConnectors.value.map((connector) => ({
    connector,
    connection: connectionByConnector.value[connector.connectorKey] || null,
  })),
)

const selectedConnection = computed(() =>
  integrationsStore.connections.find((item) => item.id === integrationsStore.activeConnectionId) || null,
)

const selectedRuns = computed(() => {
  if (!selectedConnection.value) return []
  return integrationsStore.syncRunsByConnection[selectedConnection.value.id] || []
})

const selectedRun = computed(() =>
  selectedRuns.value.find((item) => item.id === integrationsStore.activeRunId) || null,
)

const selectedRunEvents = computed(() => {
  if (!selectedRun.value) return []
  return integrationsStore.syncEventsByRun[selectedRun.value.id] || []
})

const selectedConnector = computed(() => {
  if (!selectedConnectorKey.value) return null
  return integrationsStore.catalog.find((item) => item.connectorKey === selectedConnectorKey.value) || null
})

const selectedConnectorExistingConnection = computed(() => {
  if (!selectedConnectorKey.value) return null
  return connectionByConnector.value[selectedConnectorKey.value] || null
})

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function connectorStatusClass(status: string): string {
  if (status === 'connected') return 'bg-green-100 text-green-700 border-green-200'
  if (status === 'error') return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function runStatusClass(status: string): string {
  if (status === 'success') return 'bg-green-100 text-green-700 border-green-200'
  if (status === 'failed') return 'bg-red-100 text-red-700 border-red-200'
  if (status === 'running') return 'bg-blue-100 text-blue-700 border-blue-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function eventLevelClass(level: string): string {
  if (level === 'error') return 'text-red-700 bg-red-50 border-red-100'
  if (level === 'warn') return 'text-amber-700 bg-amber-50 border-amber-100'
  return 'text-blue-700 bg-blue-50 border-blue-100'
}

async function loadLifecycleForConnection(connectionId: string | null) {
  if (!connectionId) {
    integrationsStore.activeRunId = null
    return
  }

  await integrationsStore.fetchSyncRuns(connectionId)
  const runs = integrationsStore.syncRunsByConnection[connectionId] || []
  integrationsStore.activeRunId = runs[0]?.id || null
  if (integrationsStore.activeRunId) {
    await integrationsStore.fetchSyncEvents(integrationsStore.activeRunId)
  }
}

async function loadView() {
  await Promise.all([
    integrationsStore.fetchCatalog(),
    integrationsStore.fetchConnections(),
  ])
  await loadLifecycleForConnection(integrationsStore.activeConnectionId)
}

function openConnectModal(connectorKey: string) {
  if (!canCreateIntegrations.value) return
  const connector = integrationsStore.catalog.find((item) => item.connectorKey === connectorKey)
  const existing = connectionByConnector.value[connectorKey]

  selectedConnectorKey.value = connectorKey
  connectDisplayName.value = existing?.displayName || connector?.name || connectorKey
  connectCredentialsRaw.value = ''
  connectMetadataRaw.value = existing?.metadata
    ? JSON.stringify(existing.metadata, null, 2)
    : ''
  connectError.value = null
  showConnectModal.value = true
}

function closeConnectModal() {
  showConnectModal.value = false
  selectedConnectorKey.value = null
  connectDisplayName.value = ''
  connectCredentialsRaw.value = ''
  connectMetadataRaw.value = ''
  connectError.value = null
}

function parseOptionalJson(value: string, fieldLabel: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error(`${fieldLabel} must be valid JSON.`)
  }
}

async function connectSelectedConnector() {
  if (!canCreateIntegrations.value) return
  if (!selectedConnectorKey.value) return
  connectError.value = null

  try {
    const credentials = parseOptionalJson(connectCredentialsRaw.value, 'Credentials')
    const metadata = parseOptionalJson(connectMetadataRaw.value, 'Metadata')

    const connected = await integrationsStore.connectConnector(selectedConnectorKey.value, {
      displayName: connectDisplayName.value.trim() || undefined,
      credentials,
      metadata,
    })

    if (!connected) return
    closeConnectModal()
    integrationsStore.activeConnectionId = connected.id
    await loadLifecycleForConnection(connected.id)
  } catch (e) {
    connectError.value = (e as Error).message
  }
}

async function selectConnection(connectionId: string) {
  integrationsStore.activeConnectionId = connectionId
  await loadLifecycleForConnection(connectionId)
}

async function runConnectionTest() {
  if (!canEditIntegrations.value) return
  if (!selectedConnection.value) return
  const run = await integrationsStore.testConnection(selectedConnection.value.id)
  if (!run) return
  integrationsStore.activeRunId = run.id
  await integrationsStore.fetchSyncEvents(run.id)
}

async function runConnectionSync() {
  if (!canEditIntegrations.value) return
  if (!selectedConnection.value) return
  const run = await integrationsStore.runSync(selectedConnection.value.id)
  if (!run) return
  integrationsStore.activeRunId = run.id
  await integrationsStore.fetchSyncEvents(run.id)
}

watch(
  () => productStore.activeProduct.id,
  async () => {
    integrationsStore.clearSelection()
    await loadView()
  },
)

watch(
  () => integrationsStore.activeRunId,
  async (runId) => {
    if (!runId) return
    await integrationsStore.fetchSyncEvents(runId)
  },
)

onMounted(async () => {
  await loadView()
})
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <div class="bg-white px-8 py-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <Link2 :size="18" class="text-[#4857FE]" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-gray-900">Integrations</h1>
            <p class="text-sm text-gray-400 mt-0.5">{{ productStore.activeProduct.name }}</p>
          </div>
        </div>
        <span class="text-xs font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full">
          {{ integrationsStore.connectedCount }} connected
        </span>
      </div>
    </div>

    <div class="flex-1 min-h-0 px-8 py-6">
      <div class="h-full grid grid-cols-[minmax(420px,1fr)_minmax(420px,1fr)] gap-5">
        <div class="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-0">
          <div class="px-5 py-4 border-b border-gray-100 space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-gray-700">Connector Catalog</h2>
              <Loader2 v-if="integrationsStore.loadingCatalog" :size="14" class="animate-spin text-[#4857FE]" />
            </div>
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search connectors..."
                  class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
                />
              </div>
              <select v-model="selectedCategory" class="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700">
                <option v-for="category in categoryOptions" :key="category" :value="category">
                  {{ category === 'all' ? 'All categories' : humanize(category) }}
                </option>
              </select>
            </div>
          </div>

          <div v-if="filteredConnectors.length === 0" class="flex-1 flex items-center justify-center text-sm text-gray-500">
            No connectors found
          </div>

          <div v-else class="flex-1 overflow-auto divide-y divide-gray-100">
            <div
              v-for="row in connectorRows"
              :key="row.connector.id"
              class="px-5 py-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">{{ row.connector?.name }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">
                    {{ humanize(row.connector?.category || 'general') }} • {{ humanize(row.connector?.authType || 'none') }}
                  </p>
                  <p class="text-xs text-gray-500 mt-2 leading-relaxed">
                    {{ row.connector?.description || 'Connector scaffold for lifecycle operations.' }}
                  </p>
                </div>
                <div class="flex flex-col items-end gap-2 shrink-0">
                  <span
                    v-if="row.connection"
                    class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium"
                    :class="connectorStatusClass(row.connection?.status || 'disconnected')"
                  >
                    {{ humanize(row.connection?.status || 'disconnected') }}
                  </span>
                  <button
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    :class="canCreateIntegrations ? 'bg-[#4857FE] text-white hover:bg-[#3E4BDE]' : 'bg-gray-100 text-gray-400'"
                    :disabled="!canCreateIntegrations || integrationsStore.runningAction"
                    :title="integrationsPermissions.deniedReason('create', 'integration connections') || 'Connect'"
                    @click="openConnectModal(row.connector?.connectorKey || '')"
                  >
                    <Check v-if="row.connection" :size="12" />
                    {{ row.connection ? 'Reconnect' : 'Connect' }}
                  </button>
                  <button
                    v-if="row.connection"
                    class="text-xs text-[#4857FE] hover:underline"
                    @click="selectConnection(row.connection.id)"
                  >
                    Open lifecycle
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-0">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-700">Connection Lifecycle</h2>
            <Loader2 v-if="integrationsStore.loadingConnections" :size="14" class="animate-spin text-[#4857FE]" />
          </div>

          <div v-if="integrationsStore.connections.length === 0" class="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div class="w-14 h-14 rounded-xl bg-[#4857FE]/10 flex items-center justify-center mb-3">
              <Activity :size="22" class="text-[#4857FE]" />
            </div>
            <p class="text-sm text-gray-600 font-medium">No active connections</p>
            <p class="text-xs text-gray-400 mt-1">Connect a catalog item to enable test, sync, and log workflows.</p>
          </div>

          <div v-else class="flex-1 min-h-0 flex flex-col">
            <div class="px-4 py-3 border-b border-gray-100 flex gap-2 overflow-x-auto">
              <button
                v-for="connection in integrationsStore.connections"
                :key="connection.id"
                class="px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors"
                :class="integrationsStore.activeConnectionId === connection.id
                  ? 'border-[#4857FE] bg-[#4857FE]/10 text-[#4857FE]'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'"
                @click="selectConnection(connection.id)"
              >
                {{ connection.displayName || humanize(connection.connectorKey) }}
              </button>
            </div>

            <div v-if="selectedConnection" class="flex-1 min-h-0 overflow-auto px-5 py-4 space-y-4">
              <div class="border border-gray-200 rounded-xl p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-gray-900">
                      {{ selectedConnection.displayName || humanize(selectedConnection.connectorKey) }}
                    </p>
                    <p class="text-xs text-gray-400 mt-0.5">
                      Last tested: {{ formatDateTime(selectedConnection.lastTestedAt) }} •
                      Last synced: {{ formatDateTime(selectedConnection.lastSyncedAt) }}
                    </p>
                    <p v-if="selectedConnection.latestRun" class="text-xs text-gray-500 mt-2">
                      Latest run: {{ humanize(selectedConnection.latestRun.triggerType) }} /
                      {{ humanize(selectedConnection.latestRun.status) }}
                    </p>
                  </div>
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium"
                    :class="connectorStatusClass(selectedConnection.status)"
                  >
                    {{ humanize(selectedConnection.status) }}
                  </span>
                </div>

                <div class="mt-3 flex items-center gap-2">
                  <button
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4857FE] text-white hover:bg-[#3E4BDE] disabled:bg-gray-300"
                    :disabled="!canEditIntegrations || integrationsStore.runningAction"
                    :title="integrationsPermissions.deniedReason('edit', 'integration connection') || 'Run connection test'"
                    @click="runConnectionTest"
                  >
                    <TestTubeDiagonal :size="12" />
                    Test connection
                  </button>
                  <button
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="!canEditIntegrations || integrationsStore.runningAction"
                    :title="integrationsPermissions.deniedReason('edit', 'integration sync') || 'Run sync'"
                    @click="runConnectionSync"
                  >
                    <RefreshCw :size="12" />
                    Run sync
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-[minmax(0,220px)_1fr] gap-4 min-h-[280px]">
                <div class="border border-gray-200 rounded-xl overflow-hidden">
                  <div class="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-600">
                    Sync Runs
                  </div>
                  <div v-if="selectedRuns.length === 0" class="px-3 py-8 text-center text-xs text-gray-400">
                    No runs yet
                  </div>
                  <div v-else class="max-h-[360px] overflow-auto divide-y divide-gray-100">
                    <button
                      v-for="run in selectedRuns"
                      :key="run.id"
                      class="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                      :class="integrationsStore.activeRunId === run.id ? 'bg-[#4857FE]/5' : ''"
                      @click="integrationsStore.activeRunId = run.id"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-medium text-gray-700">{{ humanize(run.triggerType) }}</span>
                        <span class="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium" :class="runStatusClass(run.status)">
                          {{ humanize(run.status) }}
                        </span>
                      </div>
                      <p class="text-[11px] text-gray-400 mt-1 truncate">{{ formatDateTime(run.createdAt) }}</p>
                    </button>
                  </div>
                </div>

                <div class="border border-gray-200 rounded-xl overflow-hidden">
                  <div class="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                    <p class="text-xs font-semibold text-gray-600">Run Events</p>
                    <p v-if="selectedRun" class="text-[11px] text-gray-400">
                      {{ humanize(selectedRun.triggerType) }} • {{ humanize(selectedRun.status) }}
                    </p>
                  </div>

                  <div v-if="!selectedRun" class="px-4 py-10 text-center text-sm text-gray-400">
                    Select a run to view logs.
                  </div>
                  <div v-else-if="selectedRunEvents.length === 0" class="px-4 py-10 text-center text-sm text-gray-400">
                    No events for this run.
                  </div>
                  <div v-else class="max-h-[360px] overflow-auto divide-y divide-gray-100">
                    <div v-for="event in selectedRunEvents" :key="event.id" class="px-4 py-3">
                      <div class="flex items-start justify-between gap-3">
                        <p class="text-xs text-gray-700">{{ event.message }}</p>
                        <span class="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium" :class="eventLevelClass(event.level)">
                          {{ humanize(event.level) }}
                        </span>
                      </div>
                      <p class="text-[11px] text-gray-400 mt-1">{{ formatDateTime(event.createdAt) }}</p>
                      <pre
                        v-if="event.details"
                        class="mt-2 text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-md p-2 overflow-auto"
                      >{{ JSON.stringify(event.details, null, 2) }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showConnectModal"
      class="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      @click.self="closeConnectModal"
    >
      <div class="w-full max-w-[620px] bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold text-gray-900">
              {{ selectedConnectorExistingConnection ? 'Reconnect' : 'Connect' }} {{ selectedConnector?.name || selectedConnectorKey }}
            </h3>
            <p class="text-xs text-gray-400 mt-1">
              Foundation mode: store credentials securely, then use test/sync/log lifecycle.
            </p>
          </div>
          <button class="p-1.5 rounded hover:bg-gray-100 text-gray-500" @click="closeConnectModal">
            <X :size="14" />
          </button>
        </div>

        <div class="px-5 py-4 space-y-3">
          <div>
            <label class="text-xs font-medium text-gray-600">Display Name</label>
            <input
              v-model="connectDisplayName"
              type="text"
              class="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
              placeholder="Connection name"
            />
          </div>

          <div>
            <label class="text-xs font-medium text-gray-600">Credentials JSON (optional)</label>
            <textarea
              v-model="connectCredentialsRaw"
              rows="4"
              class="mt-1 w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
              placeholder="{&quot;token&quot;:&quot;...&quot;}"
            ></textarea>
          </div>

          <div>
            <label class="text-xs font-medium text-gray-600">Metadata JSON (optional)</label>
            <textarea
              v-model="connectMetadataRaw"
              rows="4"
              class="mt-1 w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
              placeholder="{&quot;projectKey&quot;:&quot;ABC&quot;}"
            ></textarea>
          </div>

          <p v-if="connectError || integrationsStore.error" class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {{ connectError || integrationsStore.error }}
          </p>
        </div>

        <div class="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            class="px-3 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50"
            @click="closeConnectModal"
          >
            Cancel
          </button>
          <button
            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-[#4857FE] text-white hover:bg-[#3E4BDE] disabled:bg-gray-300"
            :disabled="integrationsStore.runningAction || !selectedConnectorKey || !canCreateIntegrations"
            :title="integrationsPermissions.deniedReason('create', 'integration connections') || 'Connect integration'"
            @click="connectSelectedConnector"
          >
            <PlayCircle :size="14" />
            {{ selectedConnectorExistingConnection ? 'Save Connection' : 'Connect' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
