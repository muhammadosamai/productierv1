import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { organizationMembers, products } from '../db/schema'

type MembershipGuardFailureReason =
  | 'product_not_found'
  | 'product_without_organization'
  | 'user_not_in_organization'

export type ProductMembershipGuardResult =
  | {
      ok: true
      organizationId: string
    }
  | {
      ok: false
      reason: MembershipGuardFailureReason
      organizationId?: string
    }

export async function ensureUserBelongsToProductOrganization(input: {
  productId: string
  userId: string
}): Promise<ProductMembershipGuardResult> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, input.productId),
    columns: { id: true, organizationId: true },
  })

  if (!product) {
    return { ok: false, reason: 'product_not_found' }
  }
  if (!product.organizationId) {
    return { ok: false, reason: 'product_without_organization' }
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, product.organizationId),
      eq(organizationMembers.userId, input.userId),
    ),
    columns: { id: true },
  })
  if (!membership) {
    return {
      ok: false,
      reason: 'user_not_in_organization',
      organizationId: product.organizationId,
    }
  }

  return {
    ok: true,
    organizationId: product.organizationId,
  }
}
