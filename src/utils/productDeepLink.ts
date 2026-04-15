/** Single value from vue-router LocationQuery. */
export function pickSingleQueryParam(value: unknown): string | undefined {
  if (value == null) return undefined
  const v = Array.isArray(value) ? value[0] : value
  const s = String(v).trim()
  return s || undefined
}

export function normalizeProjectKeyCompare(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

const PRODUCT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Resolve a product row from a denormalized scope string (product UUID, then `project_key`, then display name).
 * Duplicate display names: prefers a row that already has a `projectKey` when multiple name matches exist.
 */
export function findProductRowByDenormRef<T extends ProductDeepLinkRow>(
  products: ReadonlyArray<T>,
  denormRef: string | null | undefined,
): T | undefined {
  const raw = denormRef?.trim()
  if (!raw) return undefined
  if (PRODUCT_ID_RE.test(raw)) {
    const byId = products.find(p => p.id === raw)
    if (byId) return byId
  }
  const needle = normalizeProjectKeyCompare(raw)
  const byKey = products.find(
    p => p.projectKey && normalizeProjectKeyCompare(String(p.projectKey)) === needle,
  )
  if (byKey) return byKey
  const hits = products.filter(p => p.name === raw)
  if (hits.length === 1) return hits[0]
  if (hits.length > 1) return hits.find(h => h.projectKey?.trim()) ?? hits[0]
  return undefined
}

/** Index in `products` for `findProductRowByDenormRef`, or `-1`. */
export function findProductIndexByDenormRef<T extends ProductDeepLinkRow>(
  products: ReadonlyArray<T>,
  denormRef: string | null | undefined,
): number {
  const row = findProductRowByDenormRef(products, denormRef)
  if (!row) return -1
  if (row.id) return products.findIndex(p => p.id === row.id)
  const nk = row.projectKey?.trim()
    ? normalizeProjectKeyCompare(String(row.projectKey))
    : ''
  return products.findIndex(
    p =>
      p.name === row.name
      && (nk
        ? !!(p.projectKey && normalizeProjectKeyCompare(String(p.projectKey)) === nk)
        : !p.projectKey?.trim()),
  )
}

export type ProductDeepLinkRow = { id?: string; name: string; projectKey?: string | null }

export type ApplyProductDeepLinkResult = { switched: boolean; unknownProjectKey: boolean }

/**
 * Selects product from URL query: `projectKey` (preferred) or `product` (display name or key string).
 * `unknownProjectKey` is true only when a non-empty projectKey was given but no matching product was found.
 */
export function applyProductDeepLinkFromQuery(
  products: ReadonlyArray<ProductDeepLinkRow>,
  activeProductId: string,
  selectProductById: (id: string) => boolean,
  selectProductByName: (name: string) => boolean,
  query: Record<string, unknown>,
): ApplyProductDeepLinkResult {
  const pk = pickSingleQueryParam(query.projectKey)
  const pn = pickSingleQueryParam(query.product)
  if (pk) {
    const needle = normalizeProjectKeyCompare(pk)
    const match = products.find(
      p => p.projectKey && normalizeProjectKeyCompare(String(p.projectKey)) === needle,
    )
    if (!match) return { switched: false, unknownProjectKey: true }
    if (match.id && match.id !== activeProductId) {
      if (selectProductById(match.id)) return { switched: true, unknownProjectKey: false }
      selectProductByName(match.name)
      return { switched: true, unknownProjectKey: false }
    }
    if (!match.id && match.name) {
      const ok = selectProductByName(match.name)
      return { switched: ok, unknownProjectKey: false }
    }
    return { switched: false, unknownProjectKey: false }
  }
  if (pn) {
    const needle = normalizeProjectKeyCompare(pn)
    const byKey = products.find(
      p => p.projectKey && normalizeProjectKeyCompare(String(p.projectKey)) === needle,
    )
    if (byKey?.id && byKey.id !== activeProductId) {
      if (selectProductById(byKey.id)) return { switched: true, unknownProjectKey: false }
    }
    const ok = selectProductByName(pn)
    return { switched: ok, unknownProjectKey: false }
  }
  return { switched: false, unknownProjectKey: false }
}

/** Build query object for router.push / copy-link; prefers projectKey when set. */
export function mergeProductIntoShareQuery(
  entityParams: Record<string, string>,
  product: { projectKey?: string | null; name: string },
): Record<string, string> {
  const out = { ...entityParams }
  const pk = product.projectKey?.trim()
  if (pk) out.projectKey = pk
  else out.product = product.name
  return out
}

export function buildEntityShareUrl(
  origin: string,
  path: string,
  entityParams: Record<string, string>,
  product: { projectKey?: string | null; name: string },
): string {
  const base = origin.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  const u = new URL(base + p)
  for (const [k, v] of Object.entries(entityParams)) {
    if (v) u.searchParams.set(k, v)
  }
  const pk = product.projectKey?.trim()
  if (pk) u.searchParams.set('projectKey', pk)
  else u.searchParams.set('product', product.name)
  return u.toString()
}

/**
 * Resolve `{ name, projectKey }` for share links when entity carries a product scope string
 * (historically display name; may be project key). Handles duplicate display names when possible.
 */
export function productShareContextFromProductName(
  products: ReadonlyArray<ProductDeepLinkRow>,
  productRef: string,
  fallback: { name: string; projectKey?: string | null },
): { name: string; projectKey?: string | null } {
  const hit = findProductRowByDenormRef(products, productRef)
  if (hit) return { name: hit.name, projectKey: hit.projectKey ?? null }
  return fallback
}
