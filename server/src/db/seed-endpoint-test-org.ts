import bcrypt from 'bcryptjs'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from './index'
import {
  organizationMembers,
  organizations,
  productMembers,
  products,
  userRoleEnum,
  users,
} from './schema'
import { loadSeedProfilePack, parseSeedArgs, resolveEndpointTestSeedPassword } from './seed-config'

const DEFAULT_ENDPOINT_TEST_PROFILE_PATH = 'src/db/seed-profiles/endpoint-test-default.json'
const ENDPOINT_TEST_ORGANIZATION_SLUG = 'endpoint-test-org'
const ENDPOINT_TEST_ORGANIZATION_NAME = 'Endpoint Test Organization'
const NOVAFORGE_ORGANIZATION_SLUG = 'novaforge-org'

function mapGlobalRoleToProductMembership(role: UserRole): 'owner' | 'admin' | 'member' {
  if (role === 'super_admin') return 'owner'
  if (role === 'admin' || role === 'product_admin' || role === 'product_manager') return 'admin'
  return 'member'
}

function mapGlobalRoleToOrganizationMembership(role: UserRole): 'owner' | 'admin' | 'member' | 'viewer' {
  if (role === 'super_admin') return 'owner'
  if (role === 'admin' || role === 'product_admin' || role === 'product_manager') return 'admin'
  if (role === 'viewer') return 'viewer'
  return 'member'
}

type SeededUser = {
  id: string
  email: string
  role: UserRole
}

type UserRole = (typeof userRoleEnum.enumValues)[number]

export async function seedEndpointTestOrg(args = parseSeedArgs()) {
  console.log('Seeding dedicated endpoint-test workspace...')

  const endpointTestPassword = resolveEndpointTestSeedPassword()
  const loadedProfile = await loadSeedProfilePack({
    defaultPath: DEFAULT_ENDPOINT_TEST_PROFILE_PATH,
    args,
    envNames: ['SEED_ENDPOINT_TEST_PACK_PATH', 'SEED_PROFILE_PATH'],
    requiredSections: ['product', 'users'],
  })
  const profileUsers = loadedProfile.profile.users ?? []
  const profileProduct = loadedProfile.profile.product

  if (!profileProduct) {
    throw new Error('Endpoint test seed profile missing "product" section.')
  }
  if (profileUsers.length === 0) {
    throw new Error('Endpoint test seed profile must include at least one user.')
  }

  const hashedPassword = await bcrypt.hash(endpointTestPassword, 10)

  const seededUsers: SeededUser[] = []
  for (const user of profileUsers) {
    const [saved] = await db.insert(users).values({
      ...user,
      password: hashedPassword,
    }).onConflictDoUpdate({
      target: users.email,
      set: {
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        password: hashedPassword,
      },
    }).returning({
      id: users.id,
      email: users.email,
      role: users.role,
    })

    if (!saved) {
      throw new Error(`Failed to seed endpoint-test user "${user.email}".`)
    }
    seededUsers.push(saved)
  }

  const ownerUser = seededUsers.find((u) => u.role === 'super_admin') ?? seededUsers[0]
  if (!ownerUser) {
    throw new Error('Endpoint test seed could not resolve an owner user.')
  }

  const existingOrganization = await db.query.organizations.findFirst({
    where: eq(organizations.slug, ENDPOINT_TEST_ORGANIZATION_SLUG),
    columns: {
      id: true,
      name: true,
    },
  })
  const organizationId = existingOrganization?.id
    ? existingOrganization.id
    : (await db.insert(organizations).values({
      name: ENDPOINT_TEST_ORGANIZATION_NAME,
      slug: ENDPOINT_TEST_ORGANIZATION_SLUG,
      createdByUserId: ownerUser.id,
    }).returning({ id: organizations.id }))[0]?.id
  if (!organizationId) {
    throw new Error('Failed to resolve endpoint-test organization id.')
  }

  for (const seededUser of seededUsers) {
    await db.insert(organizationMembers).values({
      organizationId,
      userId: seededUser.id,
      role: mapGlobalRoleToOrganizationMembership(seededUser.role),
      invitedByUserId: ownerUser.id,
    }).onConflictDoUpdate({
      target: [organizationMembers.organizationId, organizationMembers.userId],
      set: {
        role: mapGlobalRoleToOrganizationMembership(seededUser.role),
        invitedByUserId: ownerUser.id,
        updatedAt: new Date(),
      },
    })
  }

  const existingProduct = await db.query.products.findFirst({
    where: and(
      eq(products.organizationId, organizationId),
      eq(products.name, profileProduct.name),
    ),
    columns: {
      id: true,
      name: true,
    },
  })

  let productId = existingProduct?.id
  if (!productId) {
    const [createdProduct] = await db.insert(products).values({
      organizationId,
      name: profileProduct.name,
      description: profileProduct.description ?? null,
      logo: profileProduct.logo ?? null,
      createdByUserId: ownerUser.id,
    }).returning({
      id: products.id,
    })
    productId = createdProduct?.id
  } else {
    await db.update(products)
      .set({
        description: profileProduct.description ?? null,
        logo: profileProduct.logo ?? null,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
  }

  if (!productId) {
    throw new Error('Failed to resolve endpoint-test product id.')
  }

  for (const seededUser of seededUsers) {
    await db.insert(productMembers).values({
      productId,
      userId: seededUser.id,
      role: mapGlobalRoleToProductMembership(seededUser.role),
    }).onConflictDoUpdate({
      target: [productMembers.productId, productMembers.userId],
      set: {
        role: mapGlobalRoleToProductMembership(seededUser.role),
      },
    })
  }

  const seededUserIds = seededUsers.map((u) => u.id)
  if (seededUserIds.length > 0) {
    // Keep endpoint-test identities isolated: they should not retain
    // memberships in any other organization/workspace.
    await db.delete(organizationMembers).where(and(
      inArray(organizationMembers.userId, seededUserIds),
      sql`${organizationMembers.organizationId} <> ${organizationId}::uuid`,
    ))

    const nonEndpointProducts = await db.select({ id: products.id })
      .from(products)
      .where(sql`${products.organizationId} <> ${organizationId}::uuid`)
    const nonEndpointProductIds = nonEndpointProducts.map((row) => row.id)
    if (nonEndpointProductIds.length > 0) {
      await db.delete(productMembers).where(and(
        inArray(productMembers.productId, nonEndpointProductIds),
        inArray(productMembers.userId, seededUserIds),
      ))
    }

    const novaForgeOrganization = await db.query.organizations.findFirst({
      where: eq(organizations.slug, NOVAFORGE_ORGANIZATION_SLUG),
      columns: { id: true },
    })
    if (novaForgeOrganization) {
      await db.delete(organizationMembers).where(and(
        eq(organizationMembers.organizationId, novaForgeOrganization.id),
        inArray(organizationMembers.userId, seededUserIds),
      ))
      const novaForgeProductRows = await db.query.products.findMany({
        where: eq(products.organizationId, novaForgeOrganization.id),
        columns: { id: true },
      })
      const novaForgeProductIds = novaForgeProductRows.map((row) => row.id)
      if (novaForgeProductIds.length > 0) {
        await db.delete(productMembers).where(and(
          inArray(productMembers.productId, novaForgeProductIds),
          inArray(productMembers.userId, seededUserIds),
        ))
      }
    }

    const scopedMembers = await db.query.productMembers.findMany({
      where: eq(productMembers.productId, productId),
      columns: {
        userId: true,
      },
    })
    const unexpectedMemberUserIds = scopedMembers
      .map((member) => member.userId)
      .filter((memberUserId) => !seededUserIds.includes(memberUserId))

    if (unexpectedMemberUserIds.length > 0) {
      await db.delete(productMembers).where(and(
        eq(productMembers.productId, productId),
        inArray(productMembers.userId, unexpectedMemberUserIds),
      ))
    }
  }

  const confirmedMembers = await db.query.productMembers.findMany({
    where: eq(productMembers.productId, productId),
    columns: {
      userId: true,
      role: true,
    },
  })
  const memberIds = confirmedMembers.map((row) => row.userId)
  const memberUsers = memberIds.length > 0
    ? await db.query.users.findMany({
      where: inArray(users.id, memberIds),
      columns: {
        email: true,
      },
    })
    : []

  console.log(`Loaded profile (${loadedProfile.source}): ${loadedProfile.resolvedPath}`)
  console.log(`Endpoint test product: ${profileProduct.name} (${productId})`)
  console.log(`Seeded endpoint users: ${seededUsers.length}`)
  console.log(`Scoped members in endpoint product: ${confirmedMembers.length}`)
  console.log(`Member emails: ${memberUsers.map((u) => u.email).join(', ')}`)
  console.log('Done. Endpoint tests can now run against dedicated endpoint users/product.')
}

if (import.meta.main) {
  seedEndpointTestOrg()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Endpoint test seed failed:', error)
      process.exit(1)
    })
}
