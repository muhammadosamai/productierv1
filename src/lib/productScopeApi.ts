import { useProductStore } from '@/stores/products'

export interface ProductScopeContext {
  organizationId: string
  productId: string
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeSuffix(resourcePath: string): string {
  const trimmed = resourcePath.trim()
  return trimmed.replace(/^\/+/, '')
}

export function resolveProductScope(explicitProductId?: string | null): ProductScopeContext | null {
  const productStore = useProductStore()
  const requestedProductId = normalizeId(explicitProductId)
  const activeProductId = normalizeId(productStore.activeProduct.id)
  const productId = requestedProductId || activeProductId
  if (!productId) return null

  const product = productStore.products.find((row) => normalizeId(row.id) === productId) || null
  const organizationId = normalizeId(product?.organizationId) || normalizeId(productStore.activeProduct.organizationId)
  if (!organizationId) return null

  return {
    organizationId,
    productId,
  }
}

export function buildProductScopedPath(scope: ProductScopeContext, resourcePath: string): string {
  const suffix = normalizeSuffix(resourcePath)
  const base = `/organizations/${encodeURIComponent(scope.organizationId)}/products/${encodeURIComponent(scope.productId)}`
  return suffix.length > 0 ? `${base}/${suffix}` : base
}
