import { eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { productCounters, products } from '../db/schema'
import { resolveProductRef } from './resolveProductRef'

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
  const r = await resolveProductRef(productRef)
  if (r.ok) return r.product
  return null
}

export async function generatePublicIdForProduct(productRef: string): Promise<string | null> {
  const product = await resolveProduct(productRef)
  if (!product) return null

  const projectKey = product.projectKey || await ensureProjectKey(product.id, product.name)

  // --- Step 1: Compute the max existing suffix OUTSIDE the transaction ---
  // Each query is independent so a schema difference (wrong table name, wrong column type)
  // only results in 0 for that entity rather than aborting the whole transaction.
  async function safeMaxSuffix(q: ReturnType<typeof sql>): Promise<number> {
    try {
      const r = await db.execute(q)
      return Number(((r as any).rows ?? [])[0]?.n ?? 0)
    } catch { return 0 }
  }

  const [maxTask, maxStory, maxIssue] = await Promise.all([
    // tasks.product_id is varchar — compare with plain string, no ::uuid cast
    safeMaxSuffix(sql`
      select coalesce(max((regexp_match(public_id, '-([0-9]+)$'))[1]::int), 0) as n
      from tasks where product_id = ${product.id} and public_id is not null
    `),
    // stories Drizzle model maps to table 'backlog_items'
    safeMaxSuffix(sql`
      select coalesce(max((regexp_match(public_id, '-([0-9]+)$'))[1]::int), 0) as n
      from backlog_items where product_id = ${product.id}::uuid and public_id is not null
    `),
    safeMaxSuffix(sql`
      select coalesce(max((regexp_match(public_id, '-([0-9]+)$'))[1]::int), 0) as n
      from issues where product_id = ${product.id}::uuid and public_id is not null
    `),
  ])

  const globalMax = Math.max(maxTask, maxStory, maxIssue)

  // --- Step 2: Lock the counter row and allocate the next sequence atomically ---
  const seq = await db.transaction(async (tx) => {
    // Ensure the counter row exists
    await tx.execute(sql`
      insert into product_counters (product_id, next_value)
      values (${product.id}::uuid, 1)
      on conflict (product_id) do nothing
    `)

    // Exclusive row lock — concurrent allocations for this product wait here
    const lockResult = await tx.execute(sql`
      select next_value from product_counters
      where product_id = ${product.id}::uuid
      for update
    `)
    const currentCounter = Number(((lockResult as any).rows ?? [])[0]?.next_value ?? 1)

    // Must be strictly above every existing suffix AND the stored counter
    const allocatedSeq = Math.max(currentCounter, globalMax + 1)

    await tx.execute(sql`
      update product_counters
      set next_value = ${allocatedSeq + 1}
      where product_id = ${product.id}::uuid
    `)

    return allocatedSeq
  })

  return `${projectKey}-${seq}`
}

/** No-op kept for call-site compatibility. */
export async function resyncProductCounterFromTasks(_productRef: string): Promise<void> {}
