import { fetchScopedMetricsJson, type MetricsRequestResult } from './api'
import type { ExecutiveKpisResponse } from '@/types/metrics'

export interface ExecutiveKpiQueryContext {
  token?: string | null
  organizationId: string | null
  scopeMode: 'product' | 'all' | 'team'
  productId?: string
  teamId?: string
  period: number
}

const executiveKpiInflight = new Map<string, Promise<MetricsRequestResult<ExecutiveKpisResponse>>>()
const executiveKpiCache = new Map<string, MetricsRequestResult<ExecutiveKpisResponse>>()

function cacheKey(context: ExecutiveKpiQueryContext): string {
  return JSON.stringify({
    token: context.token || '',
    organizationId: context.organizationId || '',
    scopeMode: context.scopeMode,
    productId: context.productId || '',
    teamId: context.teamId || '',
    period: context.period,
  })
}

export function clearExecutiveKpiCache() {
  executiveKpiInflight.clear()
  executiveKpiCache.clear()
}

export async function fetchExecutiveKpisShared(
  context: ExecutiveKpiQueryContext,
): Promise<MetricsRequestResult<ExecutiveKpisResponse>> {
  const key = cacheKey(context)
  const cached = executiveKpiCache.get(key)
  if (cached) return cached

  const active = executiveKpiInflight.get(key)
  if (active) return active

  const request = fetchScopedMetricsJson<ExecutiveKpisResponse>('executiveKpis', {
    token: context.token,
    query: {
      organizationId: context.organizationId,
      scopeMode: context.scopeMode,
      productId: context.scopeMode === 'product' ? context.productId : undefined,
      teamId: context.scopeMode === 'team' ? context.teamId : undefined,
      period: String(context.period),
    },
    fallbackMessage: 'Failed to load executive KPI metrics',
  }).then((result) => {
    executiveKpiCache.set(key, result)
    return result
  }).finally(() => {
    executiveKpiInflight.delete(key)
  })

  executiveKpiInflight.set(key, request)
  return request
}

