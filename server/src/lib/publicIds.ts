import { eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { productCounters, products } from '../db/schema'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeProjectKeyBase(input: string) {
  const base = input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5)
  return base || 'PRD'
}

async function ensureProjectKey(productId: string, productName: string) {
  const existing = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { projectKey: true },
  })

  if (existing?.projectKey) return existing.projectKey

  const base = normalizeProjectKeyBase(productName)
  let candidate = base
  let suffix = 2

  while (true) {
    const usedByOther = await db.query.products.findFirst({
      where: eq(products.projectKey, candidate),
      columns: { id: true },
    })
    if (!usedByOther || usedByOther.id === productId) {
      await db.update(products).set({ projectKey: candidate }).where(eq(products.id, productId))
      return candidate
    }

    candidate = `${base.slice(0, 4)}${suffix}`
    suffix += 1
  }

  return base
}

async function resolveProduct(productRef: string) {
  if (UUID_REGEX.test(productRef)) {
    const byId = await db.query.products.findFirst({
      where: eq(products.id, productRef),
      columns: { id: true, name: true, projectKey: true },
    })
    if (byId) return byId
  }

  const byName = await db.query.products.findFirst({
    where: eq(products.name, productRef),
    columns: { id: true, name: true, projectKey: true },
  })
  return byName
}

export async function generatePublicIdForProduct(productRef: string): Promise<string | null> {
  const product = await resolveProduct(productRef)
  if (!product) return null

  const projectKey = product.projectKey || await ensureProjectKey(product.id, product.name)

  const result = await db.execute(sql`
    insert into product_counters (product_id, next_value)
    values (${product.id}::uuid, 2)
    on conflict (product_id)
    do update set next_value = product_counters.next_value + 1
    returning next_value - 1 as seq
  `)

  const rows = (result as any).rows ?? []
  const seq = Number(rows[0]?.seq ?? 1)
  return `${projectKey}-${seq}`
}
