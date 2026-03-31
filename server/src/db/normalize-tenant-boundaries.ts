import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from './index'
import { loadSeedProfilePack, parseSeedArgs } from './seed-config'
import {
  organizationMembers,
  organizations,
  productMembers,
  products,
  users,
} from './schema'

const FULL_PROFILE_PATH = 'src/db/seed-profiles/full-default.json'
const ENDPOINT_PROFILE_PATH = 'src/db/seed-profiles/endpoint-test-default.json'
const NOVAFORGE_ORGANIZATION_SLUG = 'novaforge-org'
const ENDPOINT_TEST_ORGANIZATION_SLUG = 'endpoint-test-org'

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)))
}

function buildEmailSet(values: Array<{ email: string }>): string[] {
  return unique(values.map((entry) => normalizeEmail(entry.email)))
}

async function resolveSeedEmailSets() {
  const args = parseSeedArgs()
  const fullProfile = await loadSeedProfilePack({
    defaultPath: FULL_PROFILE_PATH,
    args,
    envNames: ['SEED_FULL_PACK_PATH', 'SEED_PROFILE_PATH'],
    requiredSections: ['users'],
  })
  const endpointProfile = await loadSeedProfilePack({
    defaultPath: ENDPOINT_PROFILE_PATH,
    args,
    envNames: ['SEED_ENDPOINT_TEST_PACK_PATH', 'SEED_PROFILE_PATH'],
    requiredSections: ['users'],
  })

  return {
    demoEmails: buildEmailSet(fullProfile.profile.users ?? []),
    endpointEmails: buildEmailSet(endpointProfile.profile.users ?? []),
    sources: {
      demo: fullProfile.resolvedPath,
      endpoint: endpointProfile.resolvedPath,
    },
  }
}

async function findUserIdsByEmails(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return []
  const rows = await db.query.users.findMany({
    where: inArray(users.email, emails),
    columns: { id: true },
  })
  return rows.map((row) => row.id)
}

async function removeUsersFromNonOrgMemberships(input: {
  userIds: string[]
  allowedOrganizationId: string
}): Promise<{ organizationMembershipsRemoved: number; productMembershipsRemoved: number }> {
  if (input.userIds.length === 0) {
    return { organizationMembershipsRemoved: 0, productMembershipsRemoved: 0 }
  }

  const externalOrgMemberships = await db.query.organizationMembers.findMany({
    where: and(
      inArray(organizationMembers.userId, input.userIds),
      sql`${organizationMembers.organizationId} <> ${input.allowedOrganizationId}::uuid`,
    ),
    columns: { userId: true, organizationId: true },
  })

  if (externalOrgMemberships.length > 0) {
    await db.delete(organizationMembers).where(and(
      inArray(organizationMembers.userId, input.userIds),
      sql`${organizationMembers.organizationId} <> ${input.allowedOrganizationId}::uuid`,
    ))
  }

  const externalProducts = await db.select({ id: products.id })
    .from(products)
    .where(sql`${products.organizationId} <> ${input.allowedOrganizationId}::uuid`)
  const externalProductIds = externalProducts.map((row) => row.id)
  let removedProductMemberships = 0
  if (externalProductIds.length > 0) {
    const productMembershipRows = await db.query.productMembers.findMany({
      where: and(
        inArray(productMembers.userId, input.userIds),
        inArray(productMembers.productId, externalProductIds),
      ),
      columns: { id: true },
    })
    removedProductMemberships = productMembershipRows.length
    if (removedProductMemberships > 0) {
      await db.delete(productMembers).where(and(
        inArray(productMembers.userId, input.userIds),
        inArray(productMembers.productId, externalProductIds),
      ))
    }
  }

  return {
    organizationMembershipsRemoved: externalOrgMemberships.length,
    productMembershipsRemoved: removedProductMemberships,
  }
}

async function pruneOrgToCuratedUsers(input: {
  organizationId: string
  curatedUserIds: string[]
}): Promise<{ organizationMembershipsRemoved: number; productMembershipsRemoved: number }> {
  const orgMemberRows = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.organizationId, input.organizationId),
    columns: { userId: true },
  })
  const currentMemberIds = unique(orgMemberRows.map((row) => row.userId))
  const removedUserIds = currentMemberIds.filter((userId) => !input.curatedUserIds.includes(userId))

  if (removedUserIds.length === 0) {
    return { organizationMembershipsRemoved: 0, productMembershipsRemoved: 0 }
  }

  await db.delete(organizationMembers).where(and(
    eq(organizationMembers.organizationId, input.organizationId),
    inArray(organizationMembers.userId, removedUserIds),
  ))

  const orgProductRows = await db.query.products.findMany({
    where: eq(products.organizationId, input.organizationId),
    columns: { id: true },
  })
  const orgProductIds = orgProductRows.map((row) => row.id)
  let removedProductMemberships = 0
  if (orgProductIds.length > 0) {
    const productMemberRows = await db.query.productMembers.findMany({
      where: and(
        inArray(productMembers.productId, orgProductIds),
        inArray(productMembers.userId, removedUserIds),
      ),
      columns: { id: true },
    })
    removedProductMemberships = productMemberRows.length
    if (removedProductMemberships > 0) {
      await db.delete(productMembers).where(and(
        inArray(productMembers.productId, orgProductIds),
        inArray(productMembers.userId, removedUserIds),
      ))
    }
  }

  return {
    organizationMembershipsRemoved: removedUserIds.length,
    productMembershipsRemoved: removedProductMemberships,
  }
}

async function normalizeTenantBoundaries() {
  const { demoEmails, endpointEmails, sources } = await resolveSeedEmailSets()
  const [novaForgeOrg, endpointOrg] = await Promise.all([
    db.query.organizations.findFirst({
      where: eq(organizations.slug, NOVAFORGE_ORGANIZATION_SLUG),
      columns: { id: true, slug: true },
    }),
    db.query.organizations.findFirst({
      where: eq(organizations.slug, ENDPOINT_TEST_ORGANIZATION_SLUG),
      columns: { id: true, slug: true },
    }),
  ])

  const [demoUserIds, endpointUserIds] = await Promise.all([
    findUserIdsByEmails(demoEmails),
    findUserIdsByEmails(endpointEmails),
  ])

  const superAdminRows = await db.query.users.findMany({
    where: eq(users.role, 'super_admin'),
    columns: { id: true },
  })
  const downgradeUserIds = unique(superAdminRows.map((row) => row.id))
  let downgradedRoleCount = 0
  if (downgradeUserIds.length > 0) {
    const downgraded = await db.update(users)
      .set({
        role: 'admin',
        updatedAt: new Date(),
      })
      .where(and(
        inArray(users.id, downgradeUserIds),
        eq(users.role, 'super_admin'),
      ))
      .returning({ id: users.id })
    downgradedRoleCount = downgraded.length
  }

  let demoPruned = { organizationMembershipsRemoved: 0, productMembershipsRemoved: 0 }
  let demoExternalRemoved = { organizationMembershipsRemoved: 0, productMembershipsRemoved: 0 }
  if (novaForgeOrg) {
    demoPruned = await pruneOrgToCuratedUsers({
      organizationId: novaForgeOrg.id,
      curatedUserIds: demoUserIds,
    })
    demoExternalRemoved = await removeUsersFromNonOrgMemberships({
      userIds: demoUserIds,
      allowedOrganizationId: novaForgeOrg.id,
    })
  }

  let endpointPruned = { organizationMembershipsRemoved: 0, productMembershipsRemoved: 0 }
  let endpointExternalRemoved = { organizationMembershipsRemoved: 0, productMembershipsRemoved: 0 }
  if (endpointOrg) {
    endpointPruned = await pruneOrgToCuratedUsers({
      organizationId: endpointOrg.id,
      curatedUserIds: endpointUserIds,
    })
    endpointExternalRemoved = await removeUsersFromNonOrgMemberships({
      userIds: endpointUserIds,
      allowedOrganizationId: endpointOrg.id,
    })
  }

  console.log('[tenant-normalize] complete')
  console.log(`[tenant-normalize] seed sources: demo=${sources.demo}, endpoint=${sources.endpoint}`)
  console.log(`[tenant-normalize] demo users found: ${demoUserIds.length}`)
  console.log(`[tenant-normalize] endpoint users found: ${endpointUserIds.length}`)
  console.log(`[tenant-normalize] downgraded super_admin roles: ${downgradedRoleCount}`)
  console.log(`[tenant-normalize] demo org removed memberships: org=${demoPruned.organizationMembershipsRemoved}, product=${demoPruned.productMembershipsRemoved}`)
  console.log(`[tenant-normalize] demo external removals: org=${demoExternalRemoved.organizationMembershipsRemoved}, product=${demoExternalRemoved.productMembershipsRemoved}`)
  console.log(`[tenant-normalize] endpoint org removed memberships: org=${endpointPruned.organizationMembershipsRemoved}, product=${endpointPruned.productMembershipsRemoved}`)
  console.log(`[tenant-normalize] endpoint external removals: org=${endpointExternalRemoved.organizationMembershipsRemoved}, product=${endpointExternalRemoved.productMembershipsRemoved}`)
}

if (import.meta.main) {
  normalizeTenantBoundaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[tenant-normalize] failed', error)
      process.exit(1)
    })
}
