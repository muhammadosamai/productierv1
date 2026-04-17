import { eq } from 'drizzle-orm'
import { db } from '../db'
import { products } from '../db/schema'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ResolvedProduct = { id: string; name: string; projectKey: string | null }

export type ResolveProductResult =
  | { ok: true; product: ResolvedProduct }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'ambiguous'; candidates: ResolvedProduct[] }

/** Resolve a product by id (UUID), then project_key (case-insensitive), then display name (must be unique). */
export async function resolveProductRef(ref: string): Promise<ResolveProductResult> {
  const trimmed = ref.trim()
  if (!trimmed) return { ok: false, kind: 'not_found' }

  if (UUID_REGEX.test(trimmed)) {
    const row = await db.query.products.findFirst({
      where: eq(products.id, trimmed),
      columns: { id: true, name: true, projectKey: true },
    })
    if (row) return { ok: true, product: row }
    return { ok: false, kind: 'not_found' }
  }

  const key = trimmed.toUpperCase()
  const byKey = await db.query.products.findFirst({
    where: eq(products.projectKey, key),
    columns: { id: true, name: true, projectKey: true },
  })
  if (byKey) return { ok: true, product: byKey }

  const byName = await db.query.products.findMany({
    where: eq(products.name, trimmed),
    columns: { id: true, name: true, projectKey: true },
  })
  if (byName.length === 0) return { ok: false, kind: 'not_found' }
  if (byName.length === 1) return { ok: true, product: byName[0]! }
  return { ok: false, kind: 'ambiguous', candidates: byName }
}
