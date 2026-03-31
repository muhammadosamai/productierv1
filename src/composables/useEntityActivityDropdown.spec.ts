// @vitest-environment jsdom
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntityActivityDropdown } from '@/composables/useEntityActivityDropdown'

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}))

const { resolveProductScopeMock, buildProductScopedPathMock } = vi.hoisted(() => ({
  resolveProductScopeMock: vi.fn(),
  buildProductScopedPathMock: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public payload: unknown,
    ) {
      super(message)
      this.name = 'ApiError'
    }
  },
  apiFetch: apiFetchMock,
}))

vi.mock('@/lib/productScopeApi', () => ({
  resolveProductScope: resolveProductScopeMock,
  buildProductScopedPath: buildProductScopedPathMock,
}))

describe('useEntityActivityDropdown', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    resolveProductScopeMock.mockReset()
    buildProductScopedPathMock.mockReset()
    resolveProductScopeMock.mockReturnValue({
      organizationId: 'org-1',
      productId: 'product-1',
    })
    buildProductScopedPathMock.mockReturnValue('/organizations/org-1/products/product-1/activities')
  })

  it('fetches activities when opening the dropdown', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'activity-1' }],
    })

    const token = ref<string | null>('token-1')
    const productId = ref<string | null>('product-1')
    const activityDropdown = useEntityActivityDropdown({
      entityType: 'task',
      token: computed(() => token.value),
      productId: computed(() => productId.value),
    })

    await activityDropdown.toggleDropdown()

    expect(resolveProductScopeMock).toHaveBeenCalledWith('product-1')
    expect(buildProductScopedPathMock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      productId: 'product-1',
    }, '/activities')
    expect(apiFetchMock).toHaveBeenCalledWith('/organizations/org-1/products/product-1/activities', {
      token: 'token-1',
      query: {
        entityType: 'task',
        limit: 50,
      },
    })
    expect(activityDropdown.activities.value).toHaveLength(1)
  })

  it('returns an error state when request fails', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    const activityDropdown = useEntityActivityDropdown({
      entityType: 'story',
      token: computed(() => 'token-1'),
      productId: computed(() => 'product-1'),
      fetchErrorMessage: 'Failed to fetch story activities.',
    })

    await activityDropdown.toggleDropdown()
    expect(activityDropdown.error.value).toBe('Failed to fetch story activities.')
  })

  it('skips fetch when there is no active product', async () => {
    resolveProductScopeMock.mockReturnValueOnce(null)

    const activityDropdown = useEntityActivityDropdown({
      entityType: 'delivery',
      token: computed(() => 'token-1'),
      productId: computed(() => null),
    })

    await activityDropdown.toggleDropdown()
    expect(apiFetchMock).not.toHaveBeenCalled()
    expect(activityDropdown.activities.value).toEqual([])
  })
})
