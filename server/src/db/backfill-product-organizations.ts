import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '.'
import { organizationMembers, organizations, products } from './schema'

interface ProductWithoutOrganization {
  id: string
  name: string
  createdByUserId: string
}

interface ProductAssignment {
  productId: string
  productName: string
  createdByUserId: string
  organizationId: string
  source: 'membership' | 'creator' | 'fallback'
}

function sortStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

async function loadProductsWithoutOrganization(): Promise<ProductWithoutOrganization[]> {
  return db.query.products.findMany({
    where: isNull(products.organizationId),
    columns: {
      id: true,
      name: true,
      createdByUserId: true,
    },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  })
}

async function resolveAssignments(rows: ProductWithoutOrganization[]): Promise<ProductAssignment[]> {
  const creatorUserIds = sortStrings(rows.map((row) => row.createdByUserId))
  const memberships = creatorUserIds.length > 0
    ? await db.query.organizationMembers.findMany({
      where: inArray(organizationMembers.userId, creatorUserIds),
      columns: {
        organizationId: true,
        userId: true,
      },
      orderBy: (table, { asc }) => [asc(table.organizationId)],
    })
    : []

  const allOrganizations = await db.query.organizations.findMany({
    columns: {
      id: true,
      createdByUserId: true,
    },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  })

  if (allOrganizations.length === 0) {
    throw new Error('No organizations found. Cannot backfill products.organization_id.')
  }

  const membershipByUser = new Map<string, string[]>()
  for (const row of memberships) {
    const current = membershipByUser.get(row.userId) || []
    current.push(row.organizationId)
    membershipByUser.set(row.userId, sortStrings(current))
  }

  const createdByUser = new Map<string, string[]>()
  for (const org of allOrganizations) {
    if (!org.createdByUserId) continue
    const current = createdByUser.get(org.createdByUserId) || []
    current.push(org.id)
    createdByUser.set(org.createdByUserId, sortStrings(current))
  }

  const fallbackOrganizationId = allOrganizations[0]!.id
  return rows.map((row) => {
    const membershipCandidates = membershipByUser.get(row.createdByUserId) || []
    if (membershipCandidates.length > 0) {
      return {
        productId: row.id,
        productName: row.name,
        createdByUserId: row.createdByUserId,
        organizationId: membershipCandidates[0]!,
        source: 'membership',
      }
    }

    const creatorCandidates = createdByUser.get(row.createdByUserId) || []
    if (creatorCandidates.length > 0) {
      return {
        productId: row.id,
        productName: row.name,
        createdByUserId: row.createdByUserId,
        organizationId: creatorCandidates[0]!,
        source: 'creator',
      }
    }

    return {
      productId: row.id,
      productName: row.name,
      createdByUserId: row.createdByUserId,
      organizationId: fallbackOrganizationId,
      source: 'fallback',
    }
  })
}

async function assertNoNameConflicts(assignments: ProductAssignment[]): Promise<void> {
  for (const assignment of assignments) {
    const conflictRows = await db.execute(sql`
      select id
      from ${products}
      where ${products.organizationId} = ${assignment.organizationId}::uuid
        and lower(${products.name}) = lower(${assignment.productName})
        and ${products.id} <> ${assignment.productId}::uuid
      limit 1
    `)

    if ((conflictRows as unknown[]).length > 0) {
      throw new Error(
        `Cannot backfill product "${assignment.productName}" (${assignment.productId}) to organization ` +
        `${assignment.organizationId}: a product with same name already exists there.`,
      )
    }
  }
}

async function applyAssignments(assignments: ProductAssignment[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const assignment of assignments) {
      await tx.update(products)
        .set({
          organizationId: assignment.organizationId,
          updatedAt: new Date(),
        })
        .where(and(
          eq(products.id, assignment.productId),
          isNull(products.organizationId),
        ))
    }
  })
}

async function main(): Promise<void> {
  const rows = await loadProductsWithoutOrganization()
  if (rows.length === 0) {
    console.log('No products with NULL organization_id found. Nothing to backfill.')
    return
  }

  const assignments = await resolveAssignments(rows)
  await assertNoNameConflicts(assignments)
  await applyAssignments(assignments)

  console.log('Backfilled products.organization_id successfully:')
  for (const assignment of assignments) {
    console.log(
      `- product=${assignment.productName} (${assignment.productId}) -> organization=${assignment.organizationId} [${assignment.source}]`,
    )
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('[backfill-product-organizations] Failed:', error)
    process.exit(1)
  })
