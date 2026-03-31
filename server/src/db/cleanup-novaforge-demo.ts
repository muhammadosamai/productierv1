import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from './index'
import { loadSeedProfilePack, parseSeedArgs } from './seed-config'
import {
  organizationInvites,
  organizationMembers,
  organizations,
  productMembers,
  products,
  users,
} from './schema'

const DEFAULT_FULL_PROFILE_PATH = 'src/db/seed-profiles/full-default.json'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export async function cleanupNovaForgeDemo(args = parseSeedArgs()) {
  const loadedProfile = await loadSeedProfilePack({
    defaultPath: DEFAULT_FULL_PROFILE_PATH,
    args,
    envNames: ['SEED_FULL_PACK_PATH', 'SEED_PROFILE_PATH'],
    requiredSections: ['product', 'users'],
  })

  const profile = loadedProfile.profile
  const productName = profile.product?.name?.trim() || 'NovaForge'
  const organizationSlug = `${slugify(productName)}-org`
  const curatedEmails = Array.from(new Set((profile.users ?? [])
    .map((user) => normalizeEmail(user.email))
    .filter((email) => email.length > 0)))

  if (curatedEmails.length === 0) {
    throw new Error('Cleanup profile does not define any curated user emails.')
  }

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.slug, organizationSlug),
    columns: { id: true, name: true, slug: true },
  })
  if (!organization) {
    console.log(`No organization found for slug "${organizationSlug}". Nothing to clean.`)
    return
  }

  const curatedUsers = await db.query.users.findMany({
    where: inArray(users.email, curatedEmails),
    columns: { id: true, email: true },
  })
  const curatedUserIds = Array.from(new Set(curatedUsers.map((user) => user.id)))
  if (curatedUserIds.length === 0) {
    throw new Error(`No curated users found in database for organization "${organization.slug}".`)
  }

  const [orgProductRows, organizationMemberRows, pendingInviteRows] = await Promise.all([
    db.query.products.findMany({
      where: eq(products.organizationId, organization.id),
      columns: { id: true },
    }),
    db.query.organizationMembers.findMany({
      where: eq(organizationMembers.organizationId, organization.id),
      columns: { userId: true },
    }),
    db.query.organizationInvites.findMany({
      where: and(
        eq(organizationInvites.organizationId, organization.id),
        eq(organizationInvites.status, 'pending'),
      ),
      columns: { id: true, email: true },
    }),
  ])

  const orgProductIds = orgProductRows.map((row) => row.id)
  const memberUserIds = Array.from(new Set(organizationMemberRows.map((row) => row.userId)))
  const removedMembershipUserIds = memberUserIds.filter((userId) => !curatedUserIds.includes(userId))

  if (removedMembershipUserIds.length > 0) {
    await db.delete(organizationMembers).where(and(
      eq(organizationMembers.organizationId, organization.id),
      inArray(organizationMembers.userId, removedMembershipUserIds),
    ))
  }

  if (orgProductIds.length > 0 && removedMembershipUserIds.length > 0) {
    await db.delete(productMembers).where(and(
      inArray(productMembers.productId, orgProductIds),
      inArray(productMembers.userId, removedMembershipUserIds),
    ))
  }

  const pendingInviteIdsToCancel = pendingInviteRows
    .filter((invite) => !curatedEmails.includes(normalizeEmail(invite.email)))
    .map((invite) => invite.id)
  if (pendingInviteIdsToCancel.length > 0) {
    await db.update(organizationInvites)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(organizationInvites.id, pendingInviteIdsToCancel))
  }

  // Curated NovaForge personas must remain exclusive to NovaForge.
  await db.delete(organizationMembers).where(and(
    inArray(organizationMembers.userId, curatedUserIds),
    sql`${organizationMembers.organizationId} <> ${organization.id}::uuid`,
  ))
  const externalProducts = await db.select({ id: products.id })
    .from(products)
    .where(sql`${products.organizationId} <> ${organization.id}::uuid`)
  const externalProductIds = externalProducts.map((row) => row.id)
  if (externalProductIds.length > 0) {
    await db.delete(productMembers).where(and(
      inArray(productMembers.userId, curatedUserIds),
      inArray(productMembers.productId, externalProductIds),
    ))
  }

  console.log(`NovaForge cleanup complete for "${organization.name}" (${organization.slug}).`)
  console.log(`Curated users kept: ${curatedUserIds.length}`)
  console.log(`Removed organization memberships: ${removedMembershipUserIds.length}`)
  console.log(`Cancelled pending invites: ${pendingInviteIdsToCancel.length}`)
}

if (import.meta.main) {
  cleanupNovaForgeDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('NovaForge cleanup failed:', error)
      process.exit(1)
    })
}
