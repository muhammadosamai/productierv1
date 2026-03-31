import { describe, expect, it } from 'vitest'
import {
  normalizeHomeScopeSelection,
  sanitizeHomeScopeSelection,
  toHomeScopeQuery,
} from './useHomeScope'

describe('useHomeScope helpers', () => {
  it('normalizes unknown values to all scope', () => {
    expect(normalizeHomeScopeSelection({})).toEqual({
      scopeMode: 'all',
      productId: null,
      teamId: null,
    })
    expect(normalizeHomeScopeSelection({ scopeMode: 'unknown' })).toEqual({
      scopeMode: 'all',
      productId: null,
      teamId: null,
    })
  })

  it('keeps product id and maps legacy team mode to all', () => {
    expect(normalizeHomeScopeSelection({
      scopeMode: 'product',
      productId: 'product-1',
      teamId: 'team-1',
    })).toEqual({
      scopeMode: 'product',
      productId: 'product-1',
      teamId: null,
    })

    expect(normalizeHomeScopeSelection({
      scopeMode: 'team',
      productId: 'product-1',
      teamId: 'team-1',
    })).toEqual({
      scopeMode: 'all',
      productId: null,
      teamId: null,
    })
  })

  it('falls back to all when selected product is not available', () => {
    const invalidProduct = sanitizeHomeScopeSelection(
      { scopeMode: 'product', productId: 'missing', teamId: null },
      { availableProductIds: ['product-1'] },
    )
    expect(invalidProduct).toEqual({
      scopeMode: 'all',
      productId: null,
      teamId: null,
    })
  })

  it('maps legacy team scope selection to all during sanitization', () => {
    const normalizedLegacy = normalizeHomeScopeSelection({
      scopeMode: 'team',
      teamId: 'team-1',
    })
    const sanitized = sanitizeHomeScopeSelection(normalizedLegacy, {
      availableProductIds: ['product-1'],
    })
    expect(sanitized).toEqual({
      scopeMode: 'all',
      productId: null,
      teamId: null,
    })
  })

  it('serializes scope selection into API query format', () => {
    expect(toHomeScopeQuery({ scopeMode: 'all' })).toEqual({ scopeMode: 'all' })
    expect(toHomeScopeQuery({ scopeMode: 'product', productId: 'product-1' })).toEqual({
      scopeMode: 'product',
      productId: 'product-1',
    })
    expect(toHomeScopeQuery({ scopeMode: 'team', teamId: 'team-1' })).toEqual({
      scopeMode: 'team',
      teamId: 'team-1',
    })
  })
})
