import type { Task } from './backlog'

export type ReleaseStatus = 'draft' | 'planned' | 'in_progress' | 'completed' | 'failed'
export type ReleaseType = 'feature' | 'hotfix' | 'patch'
export type Environment = 'dev' | 'stage' | 'prod'
export type DeploymentStatus = 'pending' | 'deploying' | 'deployed' | 'failed' | 'rolled_back'
export type TargetStatus = 'pending' | 'deploying' | 'deployed' | 'failed'

export interface Server {
  id: string
  name: string
  environment: Environment
  host: string | null
  port: number | null
  protocol: string | null
  region: string | null
  provider: string | null
  instanceId: string | null
  isActive: number
  productId: string
  createdAt: string
  updatedAt: string
}

export interface DeploymentTarget {
  id: string
  releaseDeploymentId: string
  serverId: string
  status: TargetStatus
  deployedAt: string | null
  failedAt: string | null
  logsUrl: string | null
  server?: Server
}

export interface ReleaseDeployment {
  id: string
  releaseId: string
  environment: Environment
  sequence: number
  status: DeploymentStatus
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  deployedByUserId: string | null
  notes: string | null
  deployedByUser?: { id: string; name: string; email: string; avatar: string | null }
  deploymentTargets?: DeploymentTarget[]
}

export interface ReleaseDelivery {
  id: string
  releaseId: string
  deliveryId: string
  deploymentOrder: number | null
  addedAt: string
  addedByUserId: string | null
  delivery?: {
    id: string
    title: string
    status: string
    productId: string
    startDate: string | null
    endDate: string | null
    tasks?: Task[]
    totalTasks?: number
    completedTasks?: number
    progress?: number
  }
}

export interface Release {
  id: string
  code: string | null
  version: string | null
  title: string
  status: ReleaseStatus
  releaseType: ReleaseType
  plannedAt: string | null
  startedAt: string | null
  completedAt: string | null
  createdByUserId: string
  releaseManagerId: string | null
  notes: string | null
  releaseNotes: string | null
  productId: string
  createdAt: string
  updatedAt: string
  createdByUser?: { id: string; name: string; email: string; avatar: string | null }
  releaseManager?: { id: string; name: string; email: string; avatar: string | null }
  releaseDeliveries?: ReleaseDelivery[]
  releaseDeployments?: ReleaseDeployment[]
}

export interface CreateReleasePayload {
  title: string
  version?: string | null
  releaseType?: ReleaseType
  status?: ReleaseStatus
  plannedAt?: string | null
  releaseManagerId?: string | null
  notes?: string | null
  releaseNotes?: string | null
  productId?: string
  deliveryIds?: string[]
}

export interface CreateServerPayload {
  name: string
  environment: Environment
  host?: string | null
  port?: number | null
  protocol?: string | null
  region?: string | null
  provider?: string | null
  instanceId?: string | null
  productId: string
}
