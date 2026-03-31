import { apiFetch } from '@/lib/apiClient'
import { readApiError } from '@/lib/storeAuthz'
import { metricsApi } from '@/lib/api/metricsApi'

type MetricsQueryValue = string | number | boolean | null | undefined
type MetricsQuery = Record<string, MetricsQueryValue>

export interface MetricsRequestOptions {
  token?: string | null
  query?: MetricsQuery
  fallbackMessage: string
}

export interface MetricsRequestResult<T> {
  data: T | null
  error: string | null
  status: number | null
}

type ScopedMetricsEndpoint =
  | 'dashboard'
  | 'throughput'
  | 'flow'
  | 'quality'
  | 'blockers'
  | 'predictability'
  | 'workload'
  | 'deliveries'

interface ScopedMetricsQuery {
  scopeMode?: 'product' | 'all' | 'team'
  productId?: string
  teamId?: string
  organizationId?: string | null
  period?: string
  granularity?: string
}

export async function fetchMetricsJson<T>(
  path: string,
  options: MetricsRequestOptions,
): Promise<MetricsRequestResult<T>> {
  const response = await apiFetch(path, {
    token: options.token,
    query: options.query,
  })

  if (!response.ok) {
    const message = await readApiError(response, options.fallbackMessage)
    return {
      data: null,
      error: message,
      status: response.status,
    }
  }

  const payload = await response.json() as T
  return {
    data: payload,
    error: null,
    status: response.status,
  }
}

export async function fetchScopedMetricsJson<T>(
  endpoint: ScopedMetricsEndpoint,
  options: {
    token?: string | null
    query: ScopedMetricsQuery
    fallbackMessage: string
  },
): Promise<MetricsRequestResult<T>> {
  try {
    const handler = metricsApi[endpoint] as (query: ScopedMetricsQuery, token?: string | null) => Promise<T>
    const payload = await handler(options.query, options.token)
    return {
      data: payload,
      error: null,
      status: 200,
    }
  } catch (e) {
    return {
      data: null,
      error: (e as Error).message || options.fallbackMessage,
      status: null,
    }
  }
}
