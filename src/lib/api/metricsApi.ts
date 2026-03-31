import { apiJson } from '@/lib/apiClient'
import { toHomeScopeQuery, type HomeScopeQueryOptions } from '@/composables/useHomeScope'
import { useOnboardingStore } from '@/stores/onboarding'
import type {
  BlockersMetricsResponse,
  DashboardMetricsResponse,
  DeliveriesMetricsResponse,
  FlowMetricsResponse,
  PredictabilityMetricsResponse,
  QualityMetricsResponse,
  ThroughputMetricsResponse,
  WorkloadMetricsResponse,
} from '@/types/metrics'

interface MetricsQuery extends HomeScopeQueryOptions {
  organizationId?: string | null
  period?: string
  granularity?: string
}

function resolveOrganizationId(value?: string | null): string {
  const explicit = typeof value === 'string' ? value.trim() : ''
  if (explicit) return explicit
  const onboardingStore = useOnboardingStore()
  const fallback = onboardingStore.activeOrganizationId?.trim() || ''
  if (fallback) return fallback
  throw new Error('organizationId is required for metrics requests')
}

function buildMetricsPath(endpoint: string, query: MetricsQuery): string {
  const organizationId = resolveOrganizationId(query.organizationId)
  return `/organizations/${encodeURIComponent(organizationId)}/metrics/${endpoint}`
}

function buildMetricsQuery(query: MetricsQuery): Record<string, string | undefined> {
  const scopeQuery = toHomeScopeQuery({
    scopeMode: query.scopeMode,
    productId: query.productId,
    teamId: query.teamId,
  })
  const explicitProductId = typeof query.productId === 'string' ? query.productId.trim() : ''
  return {
    scopeMode: scopeQuery.scopeMode ?? (explicitProductId ? 'product' : undefined),
    productId: scopeQuery.productId ?? (explicitProductId || undefined),
    teamId: scopeQuery.teamId,
    period: query.period,
    granularity: query.granularity,
  }
}

export const metricsApi = {
  dashboard(query: MetricsQuery, token?: string | null) {
    return apiJson<DashboardMetricsResponse>(buildMetricsPath('dashboard', query), {
      token,
      query: buildMetricsQuery(query),
    })
  },

  flow(query: MetricsQuery, token?: string | null) {
    return apiJson<FlowMetricsResponse>(buildMetricsPath('flow', query), {
      token,
      query: buildMetricsQuery(query),
    })
  },

  throughput(query: MetricsQuery, token?: string | null) {
    return apiJson<ThroughputMetricsResponse>(buildMetricsPath('throughput', query), {
      token,
      query: buildMetricsQuery(query),
    })
  },

  predictability(query: MetricsQuery, token?: string | null) {
    return apiJson<PredictabilityMetricsResponse>(buildMetricsPath('predictability', query), {
      token,
      query: buildMetricsQuery(query),
    })
  },

  quality(query: MetricsQuery, token?: string | null) {
    return apiJson<QualityMetricsResponse>(buildMetricsPath('quality', query), {
      token,
      query: buildMetricsQuery(query),
    })
  },

  blockers(query: MetricsQuery, token?: string | null) {
    return apiJson<BlockersMetricsResponse>(buildMetricsPath('blockers', query), {
      token,
      query: buildMetricsQuery(query),
    })
  },

  deliveries(query: MetricsQuery, token?: string | null) {
    return apiJson<DeliveriesMetricsResponse>(buildMetricsPath('deliveries-metrics', query), {
      token,
      query: buildMetricsQuery(query),
    })
  },

  workload(query: MetricsQuery, token?: string | null) {
    return apiJson<WorkloadMetricsResponse>(buildMetricsPath('workload', query), {
      token,
      query: buildMetricsQuery(query),
    })
  },
}
