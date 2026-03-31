export type HomeScopeMode = 'all' | 'product'
export type HomeScopeQueryMode = HomeScopeMode | 'team'

export interface HomeScopeSelection {
  scopeMode: HomeScopeMode
  productId: string | null
  teamId: null
}

export interface HomeScopeQueryOptions {
  scopeMode?: HomeScopeQueryMode
  productId?: string | null
  teamId?: string | null
}

export function normalizeHomeScopeMode(value: unknown): HomeScopeMode {
  return value === 'product' ? 'product' : 'all'
}

function normalizeHomeScopeQueryMode(value: unknown): HomeScopeQueryMode {
  if (value === 'product') return 'product'
  if (value === 'team') return 'team'
  return 'all'
}

export function normalizeHomeScopeId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeHomeScopeSelection(value: {
  scopeMode?: unknown
  productId?: unknown
  teamId?: unknown
}): HomeScopeSelection {
  const scopeMode = normalizeHomeScopeMode(value.scopeMode)
  const productId = normalizeHomeScopeId(value.productId)

  if (scopeMode === 'product') {
    return {
      scopeMode: 'product',
      productId,
      teamId: null,
    }
  }

  return {
    scopeMode: 'all',
    productId: null,
    teamId: null,
  }
}

export function sanitizeHomeScopeSelection(
  value: HomeScopeSelection,
  options: {
    availableProductIds: string[]
  },
): HomeScopeSelection {
  const products = new Set(options.availableProductIds)

  if (value.scopeMode === 'product') {
    if (value.productId && products.has(value.productId)) {
      return {
        scopeMode: 'product',
        productId: value.productId,
        teamId: null,
      }
    }
    return {
      scopeMode: 'all',
      productId: null,
      teamId: null,
    }
  }

  return {
    scopeMode: 'all',
    productId: null,
    teamId: null,
  }
}

export function toHomeScopeQuery(options: HomeScopeQueryOptions): {
  scopeMode?: HomeScopeQueryMode
  productId?: string
  teamId?: string
} {
  const scopeMode = normalizeHomeScopeQueryMode(options.scopeMode)
  const productId = normalizeHomeScopeId(options.productId)
  const teamId = normalizeHomeScopeId(options.teamId)

  if (scopeMode === 'all') {
    return { scopeMode: 'all' }
  }
  if (scopeMode === 'product') {
    return {
      scopeMode: 'product',
      productId: productId || undefined,
    }
  }
  return {
    scopeMode: 'team',
    teamId: teamId || undefined,
  }
}
