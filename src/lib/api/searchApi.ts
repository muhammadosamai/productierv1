import { apiFetch } from '@/lib/apiClient'
import { ensureOk } from '@/lib/storeAuthz'
import { useOnboardingStore } from '@/stores/onboarding'
import type { GlobalSearchResponse, SearchEntityType } from '@/types/search'

interface GlobalSearchQuery {
  organizationId?: string | null
  productId: string
  q: string
  types?: SearchEntityType[]
  limit?: number
  cursor?: string | null
}

function resolveOrganizationId(input?: string | null): string {
  const explicit = typeof input === 'string' ? input.trim() : ''
  if (explicit) return explicit
  const onboardingStore = useOnboardingStore()
  const fallback = onboardingStore.activeOrganizationId?.trim() || ''
  if (fallback) return fallback
  throw new Error('organizationId is required for search')
}

export const searchApi = {
  async global(
    query: GlobalSearchQuery,
    token?: string | null,
    signal?: AbortSignal,
  ): Promise<GlobalSearchResponse> {
    const organizationId = resolveOrganizationId(query.organizationId)
    const response = await apiFetch(
      `/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(query.productId)}/search/global`,
      {
      token,
      signal,
      query: {
        q: query.q,
        types: query.types && query.types.length > 0 ? query.types.join(',') : undefined,
        limit: query.limit,
        cursor: query.cursor ?? undefined,
      },
      },
    )
    await ensureOk(response, 'Failed to run global search')
    return await response.json() as GlobalSearchResponse
  },
}
