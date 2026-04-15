import { eq, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db'
import { products } from '../db/schema'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeProjectKeyInput(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

export type ProductScopeRow = {
  id: string
  name: string
  projectKey: string | null
}

/**
 * Resolve a client "product" reference: UUID, then normalized **project_key** (unique),
 * then exact **display name** (duplicate names → prefer a row that already has a key).
 */
export async function resolveProductByScope(
  ref: string | undefined | null,
): Promise<ProductScopeRow | null> {
  if (ref == null || typeof ref !== 'string') return null
  const t = ref.trim()
  if (!t) return null

  if (UUID_REGEX.test(t)) {
    const byId = await db.query.products.findFirst({ where: eq(products.id, t) })
    if (byId) return byId
  }

  const needle = normalizeProjectKeyInput(t)
  const byKey = await db.query.products.findFirst({
    where: sql`${products.projectKey} is not null
      and upper(regexp_replace(${products.projectKey}, '[[:space:]]', '', 'g')) = ${needle}`,
  })
  if (byKey) return byKey

  const byNames = await db.query.products.findMany({ where: eq(products.name, t) })
  if (byNames.length === 1) return byNames[0]
  if (byNames.length > 1) {
    const preferred = byNames.find(p => p.projectKey?.trim())
    return preferred ?? byNames[0]
  }

  return null
}

/**
 * Value to **write** into denormalized `product` / `product_id` columns.
 * Prefer stable `project_key` once set (Phase 1), else display name (legacy).
 */
export function denormalizedProductScopeValue(row: ProductScopeRow): string {
  return (row.projectKey && row.projectKey.trim()) || row.name
}

/**
 * Match rows where the denormalized column still holds **name** OR already holds **project_key**
 * (Phase 2 transition / post-migration OR reads).
 */
export function whereDenormProductMatches(column: any, row: ProductScopeRow): SQL {
  const key = row.projectKey?.trim()
  if (key) return or(eq(column, row.name), eq(column, key)) as SQL
  return eq(column, row.name)
}

/** Values that may appear in denormalized `product` / `product_id` columns (for `inArray` filters). */
export function denormMatchValues(row: ProductScopeRow): string[] {
  return Array.from(
    new Set([row.id, row.name, denormalizedProductScopeValue(row), ...(row.projectKey ? [row.projectKey] : [])]),
  )
}
