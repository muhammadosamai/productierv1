export type IntegrationAuthType = 'none' | 'api_key' | 'oauth2'
export type IntegrationConnectionStatus = 'disconnected' | 'connected' | 'error'
export type IntegrationSyncRunStatus = 'queued' | 'running' | 'success' | 'failed'
export type IntegrationSyncEventLevel = 'info' | 'warn' | 'error'

export interface IntegrationCatalogConnector {
  id: string
  connectorKey: string
  name: string
  description: string | null
  category: string | null
  authType: IntegrationAuthType
  enabled: boolean
  metadata: unknown
  createdAt: string
  updatedAt: string
}

export interface IntegrationUserRef {
  id: string
  name: string
  email: string
  avatar: string | null
}

export interface IntegrationSyncRun {
  id: string
  connectionId: string
  triggerType: string
  status: IntegrationSyncRunStatus
  requestedByUserId: string | null
  requestedByUser?: IntegrationUserRef
  summary: unknown
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface IntegrationConnection {
  id: string
  productId: string
  connectorKey: string
  displayName: string | null
  status: IntegrationConnectionStatus
  metadata: unknown
  lastTestedAt: string | null
  lastSyncedAt: string | null
  connectedByUserId: string | null
  connectedByUser?: IntegrationUserRef
  createdAt: string
  updatedAt: string
  latestRun?: IntegrationSyncRun | null
}

export interface IntegrationSyncEvent {
  id: string
  runId: string
  level: IntegrationSyncEventLevel
  message: string
  details: unknown
  createdAt: string
}

export interface ConnectIntegrationPayload {
  displayName?: string
  credentials?: unknown
  metadata?: unknown
}
