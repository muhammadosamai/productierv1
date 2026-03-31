import { eq } from 'drizzle-orm'
import { db } from '../db'
import { products } from '../db/schema'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

/**
 * Accepts either a product UUID or legacy product name and returns
 * a canonical product UUID when found.
 */
export async function resolveProductIdInput(rawValue: string | null | undefined): Promise<string | null> {
  const value = (rawValue || '').trim()
  if (!value) return null
  if (isUuid(value)) return value

  const product = await db.query.products.findFirst({
    where: eq(products.name, value),
    columns: { id: true },
  })
  return product?.id || null
}
