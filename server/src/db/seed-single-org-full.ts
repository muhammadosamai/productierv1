import bcrypt from 'bcryptjs'
import { and, eq, inArray, notInArray, or, sql } from 'drizzle-orm'
import { db } from './index'
import {
  activities,
  assetRelations_table,
  assetTypes,
  assets,
  consumerFeedbackAttachments,
  consumerFeedbackComments,
  consumerFeedbacks,
  deliveries,
  deliveryInitiatives,
  deploymentTargets,
  favorites,
  featureRequestAttachments,
  featureRequestComments,
  featureRequestUpvotes,
  featureRequests,
  issues,
  initiatives,
  notificationPreferences,
  onboardingProgress,
  organizationInvites,
  organizationMemberReports,
  organizationMembers,
  organizationTeamMembers,
  organizationTeams,
  organizations,
  productMembers,
  products,
  releaseDeliveries,
  releaseDeployments,
  releases,
  rolePermissions,
  servers,
  stories,
  storyComments,
  taskAttachments,
  taskComments,
  taskStatusHistory,
  tasks,
  testCycleIssues,
  testCycles,
  titlePermissions,
  titles,
  userTitles,
  userSettings,
  users,
} from './schema'
import {
  type SeedProductProfile,
  type SeedUserProfile,
  loadSeedProfilePack,
  parseSeedArgs,
  resolveRequiredSeedPassword,
} from './seed-config'
import { CONFIGURABLE_ROLE_CATALOG, CONTROLLABLE_PAGE_KEYS } from '../lib/pageCatalog'
import { getDefaultPermissionForRolePage } from '../lib/rolePermissionPolicy'
import { getNotificationPreferencePresetForUser } from '../lib/notifications'

const DEFAULT_FULL_PROFILE_PATH = 'src/db/seed-profiles/full-default.json'

type FullSeedConfig = {
  demoPassword: string
  product: SeedProductProfile
  products: SeedProductProfile[]
  users: SeedUserProfile[]
  profilePath: string
  profileSource: 'default' | 'override'
}

type DemoSeedScope = {
  organizationSlug: string
  organizationName: string
  productNames: string[]
  userEmails: string[]
}

function daysAgo(days: number): Date {
  const now = new Date()
  const d = new Date(now)
  d.setDate(now.getDate() - days)
  d.setHours(10, 0, 0, 0)
  return d
}

function daysFromNow(days: number): Date {
  const now = new Date()
  const d = new Date(now)
  d.setDate(now.getDate() + days)
  d.setHours(10, 0, 0, 0)
  return d
}

function dateOffsetString(days: number): string {
  const now = new Date()
  const d = new Date(now)
  d.setDate(now.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function statusTimeline(status: string): string[] {
  switch (status) {
    case 'created':
      return ['created']
    case 'assigned':
      return ['created', 'assigned']
    case 'in_progress':
      return ['created', 'assigned', 'in_progress']
    case 'in_review':
      return ['created', 'assigned', 'in_progress', 'in_review']
    case 'done':
      return ['created', 'assigned', 'in_progress', 'in_review', 'done']
    case 'blocked':
      return ['created', 'assigned', 'in_progress', 'blocked']
    case 'overdue':
      return ['created', 'assigned', 'in_progress', 'overdue']
    case 'archived':
      return ['created', 'assigned', 'in_progress', 'in_review', 'done', 'archived']
    default:
      return ['created']
  }
}

function mapUserRoleToOrganizationRole(
  role: SeedUserProfile['role'],
  isPrimaryOwner: boolean,
): 'owner' | 'admin' | 'member' | 'viewer' {
  if (isPrimaryOwner) return 'owner'
  if (role === 'admin' || role === 'product_admin' || role === 'product_manager') return 'admin'
  if (role === 'viewer') return 'viewer'
  return 'member'
}

function buildDemoSeedScope(config: FullSeedConfig): DemoSeedScope {
  const productNames = Array.from(
    new Set(
      config.products
        .map((product) => product.name.trim())
        .filter((name) => name.length > 0),
    ),
  )
  const userEmails = Array.from(
    new Set(
      config.users
        .map((user) => user.email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    ),
  )
  const organizationSlug = `${slugify(config.product.name)}-org`
  return {
    organizationSlug,
    organizationName: `${config.product.name} Organization`,
    productNames,
    userEmails,
  }
}

async function relationExists(relationName: string): Promise<boolean> {
  const [row] = await db.execute(sql<{ relation: string | null }>`
    SELECT to_regclass(${`public.${relationName}`})::text AS relation
  `)
  return row?.relation != null
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const [row] = await db.execute(sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS exists
  `)
  return Boolean(row?.exists)
}

async function assertFullSeedSchemaCompatibility(): Promise<void> {
  const requiredTables = [
    'organizations',
    'organization_members',
    'organization_teams',
    'organization_team_members',
    'organization_member_reports',
  ] as const
  const requiredColumns = [
    ['products', 'organization_id'],
    ['tasks', 'owner_team_id'],
    ['tasks', 'assignee_team_ids'],
    ['tasks', 'reviewer_team_ids'],
    ['issues', 'assigned_to_team_id'],
    ['test_cycle_issues', 'assigned_to_team_id'],
  ] as const

  const missingRequirements: string[] = []

  for (const tableName of requiredTables) {
    const exists = await relationExists(tableName)
    if (!exists) missingRequirements.push(`table ${tableName}`)
  }
  for (const [tableName, columnName] of requiredColumns) {
    const exists = await columnExists(tableName, columnName)
    if (!exists) missingRequirements.push(`column ${tableName}.${columnName}`)
  }

  if (missingRequirements.length > 0) {
    throw new Error(
      [
        'Full demo seed requires the latest organization/team migrations.',
        `Missing schema requirements: ${missingRequirements.join(', ')}`,
        'Run "bun run db:migrate" in the server directory, then run "bun run db:seed:full" again.',
      ].join(' '),
    )
  }
}

async function resetDemoSeedScope(config: FullSeedConfig) {
  const scope = buildDemoSeedScope(config)
  console.log(`Resetting demo scope for "${scope.organizationSlug}"...`)

  const existingOrganization = await db.query.organizations.findFirst({
    where: eq(organizations.slug, scope.organizationSlug),
    columns: {
      id: true,
      name: true,
      slug: true,
    },
  })

  const existingProducts = scope.productNames.length > 0
    ? await db.query.products.findMany({
      where: inArray(products.name, scope.productNames),
      columns: {
        id: true,
        name: true,
        organizationId: true,
      },
    })
    : []

  const existingUsers = scope.userEmails.length > 0
    ? await db.query.users.findMany({
      where: inArray(users.email, scope.userEmails),
      columns: {
        id: true,
        email: true,
      },
    })
    : []

  if (existingOrganization) {
    const productOrgMismatches = existingProducts.filter((product) => (
      product.organizationId != null && product.organizationId !== existingOrganization.id
    ))
    if (productOrgMismatches.length > 0) {
      const mismatchNames = productOrgMismatches.map((product) => product.name).join(', ')
      throw new Error(
        `Refusing demo reseed: product names are linked to a different organization (${mismatchNames}).`,
      )
    }

    if (scope.productNames.length > 0) {
      const nonDemoProductsInOrg = await db.query.products.findMany({
        where: and(
          eq(products.organizationId, existingOrganization.id),
          notInArray(products.name, scope.productNames),
        ),
        columns: {
          name: true,
        },
      })
      if (nonDemoProductsInOrg.length > 0) {
        const samples = nonDemoProductsInOrg.slice(0, 5).map((product) => product.name).join(', ')
        throw new Error(
          `Refusing demo reseed: organization "${existingOrganization.slug}" has non-demo products (${samples}).`,
        )
      }
    }
  } else {
    const productsInAnotherOrg = existingProducts.filter((product) => product.organizationId != null)
    if (productsInAnotherOrg.length > 0) {
      const conflictNames = productsInAnotherOrg.map((product) => product.name).join(', ')
      throw new Error(
        `Refusing demo reseed: configured demo product names already belong to another organization (${conflictNames}).`,
      )
    }
  }

  const combineWithOr = (conditions: any[]) => {
    if (conditions.length === 0) return null
    if (conditions.length === 1) return conditions[0]
    return or(...conditions)
  }

  const existingProductIds = existingProducts.map((product) => product.id)
  if (existingProductIds.length > 0) {
    const existingInitiativeRows = await db.query.initiatives.findMany({
      where: inArray(initiatives.productId, existingProductIds),
      columns: { id: true },
    })
    const existingDeliveryRows = await db.query.deliveries.findMany({
      where: inArray(deliveries.productId, existingProductIds),
      columns: { id: true },
    })
    const existingStoryRows = await db.query.stories.findMany({
      where: inArray(stories.productId, existingProductIds),
      columns: { id: true },
    })
    const existingCycleRows = await db.query.testCycles.findMany({
      where: inArray(testCycles.productId, existingProductIds),
      columns: { id: true },
    })

    const existingInitiativeIds = existingInitiativeRows.map((initiative) => initiative.id)
    const existingDeliveryIds = existingDeliveryRows.map((delivery) => delivery.id)
    const existingStoryIds = existingStoryRows.map((story) => story.id)
    const existingCycleIds = existingCycleRows.map((cycle) => cycle.id)

    const testCycleIssueConditions: any[] = []
    if (existingCycleIds.length > 0) {
      testCycleIssueConditions.push(inArray(testCycleIssues.testCycleId, existingCycleIds))
    }
    if (existingStoryIds.length > 0) {
      testCycleIssueConditions.push(inArray(testCycleIssues.storyId, existingStoryIds))
    }
    const testCycleIssueWhere = combineWithOr(testCycleIssueConditions)
    if (testCycleIssueWhere) {
      await db.delete(testCycleIssues).where(testCycleIssueWhere)
    }

    const featureRequestConditions: any[] = [inArray(featureRequests.productId, existingProductIds)]
    if (existingStoryIds.length > 0) {
      featureRequestConditions.push(inArray(featureRequests.storyId, existingStoryIds))
    }
    const featureRequestWhere = combineWithOr(featureRequestConditions)
    const existingFeatureRequestRows = featureRequestWhere
      ? await db.query.featureRequests.findMany({
        where: featureRequestWhere,
        columns: { id: true },
      })
      : []
    const existingFeatureRequestIds = existingFeatureRequestRows.map((request) => request.id)
    if (existingFeatureRequestIds.length > 0) {
      await db.delete(featureRequestAttachments).where(inArray(featureRequestAttachments.featureRequestId, existingFeatureRequestIds))
      await db.delete(featureRequestComments).where(inArray(featureRequestComments.featureRequestId, existingFeatureRequestIds))
      await db.delete(featureRequestUpvotes).where(inArray(featureRequestUpvotes.featureRequestId, existingFeatureRequestIds))
      await db.delete(featureRequests).where(inArray(featureRequests.id, existingFeatureRequestIds))
    }

    const feedbackConditions: any[] = [inArray(consumerFeedbacks.productId, existingProductIds)]
    if (existingStoryIds.length > 0) {
      feedbackConditions.push(inArray(consumerFeedbacks.storyId, existingStoryIds))
    }
    const feedbackWhere = combineWithOr(feedbackConditions)
    const existingFeedbackRows = feedbackWhere
      ? await db.query.consumerFeedbacks.findMany({
        where: feedbackWhere,
        columns: { id: true },
      })
      : []
    const existingFeedbackIds = existingFeedbackRows.map((feedback) => feedback.id)
    if (existingFeedbackIds.length > 0) {
      await db.delete(consumerFeedbackAttachments).where(inArray(consumerFeedbackAttachments.feedbackId, existingFeedbackIds))
      await db.delete(consumerFeedbackComments).where(inArray(consumerFeedbackComments.feedbackId, existingFeedbackIds))
      await db.delete(consumerFeedbacks).where(inArray(consumerFeedbacks.id, existingFeedbackIds))
    }

    const issueConditions: any[] = [inArray(issues.productId, existingProductIds)]
    if (existingStoryIds.length > 0) {
      issueConditions.push(inArray(issues.storyId, existingStoryIds))
    }
    if (existingInitiativeIds.length > 0) {
      issueConditions.push(inArray(issues.initiativeId, existingInitiativeIds))
    }
    if (existingDeliveryIds.length > 0) {
      issueConditions.push(inArray(issues.deliveryId, existingDeliveryIds))
    }
    if (existingCycleIds.length > 0) {
      issueConditions.push(inArray(issues.testCycleId, existingCycleIds))
    }
    const issueWhere = combineWithOr(issueConditions)
    if (issueWhere) {
      await db.delete(issues).where(issueWhere)
    }

    const existingServerRows = await db.query.servers.findMany({
      where: inArray(servers.productId, existingProductIds),
      columns: { id: true },
    })
    const existingReleaseRows = await db.query.releases.findMany({
      where: inArray(releases.productId, existingProductIds),
      columns: { id: true },
    })
    const existingReleaseIds = existingReleaseRows.map((release) => release.id)
    const existingReleaseDeploymentRows = existingReleaseIds.length > 0
      ? await db.query.releaseDeployments.findMany({
        where: inArray(releaseDeployments.releaseId, existingReleaseIds),
        columns: { id: true },
      })
      : []

    const existingServerIds = existingServerRows.map((server) => server.id)
    const existingReleaseDeploymentIds = existingReleaseDeploymentRows.map((deployment) => deployment.id)
    if (existingServerIds.length > 0 || existingReleaseDeploymentIds.length > 0) {
      if (existingServerIds.length > 0 && existingReleaseDeploymentIds.length > 0) {
        await db.delete(deploymentTargets).where(or(
          inArray(deploymentTargets.serverId, existingServerIds),
          inArray(deploymentTargets.releaseDeploymentId, existingReleaseDeploymentIds),
        ))
      } else if (existingServerIds.length > 0) {
        await db.delete(deploymentTargets).where(inArray(deploymentTargets.serverId, existingServerIds))
      } else {
        await db.delete(deploymentTargets).where(inArray(deploymentTargets.releaseDeploymentId, existingReleaseDeploymentIds))
      }
    }

    await db.delete(products).where(inArray(products.id, existingProductIds))
  }

  if (existingOrganization) {
    await db.delete(organizationMemberReports).where(eq(organizationMemberReports.organizationId, existingOrganization.id))
    await db.delete(organizationTeams).where(eq(organizationTeams.organizationId, existingOrganization.id))
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, existingOrganization.id))
    await db.delete(organizationInvites).where(eq(organizationInvites.organizationId, existingOrganization.id))
    await db.delete(onboardingProgress).where(eq(onboardingProgress.organizationId, existingOrganization.id))
  }

  const existingUserIds = existingUsers.map((user) => user.id)
  if (existingUserIds.length > 0) {
    await db.delete(notificationPreferences).where(inArray(notificationPreferences.userId, existingUserIds))
    await db.delete(userSettings).where(inArray(userSettings.userId, existingUserIds))
    await db.delete(userTitles).where(inArray(userTitles.userId, existingUserIds))
    await db.delete(favorites).where(inArray(favorites.userId, existingUserIds))
    await db.delete(onboardingProgress).where(inArray(onboardingProgress.userId, existingUserIds))
  }
}

async function seedEverything(config: FullSeedConfig) {
  const hashedPassword = await bcrypt.hash(config.demoPassword, 10)
  const insertedUsers: typeof users.$inferSelect[] = []
  for (const user of config.users) {
    const [created] = await db.insert(users).values({
      ...user,
      password: hashedPassword,
      createdAt: daysAgo(220),
      updatedAt: daysAgo(1),
    }).onConflictDoUpdate({
      target: users.email,
      set: {
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        password: hashedPassword,
        isActive: true,
        updatedAt: daysAgo(1),
      },
    }).returning()
    insertedUsers.push(created)
  }

  const notificationPreferenceRows: typeof notificationPreferences.$inferInsert[] = []
  for (const seededUser of insertedUsers) {
    const preset = await getNotificationPreferencePresetForUser(seededUser.id)
    for (const preference of preset.defaults) {
      notificationPreferenceRows.push({
        userId: seededUser.id,
        category: preference.category,
        inAppEnabled: preference.inAppEnabled,
        emailEnabled: preference.emailEnabled,
        quietHoursStart: preference.quietHoursStart,
        quietHoursEnd: preference.quietHoursEnd,
        minimumSeverity: preference.minimumSeverity,
        createdAt: daysAgo(200),
        updatedAt: daysAgo(1),
      })
    }
  }
  await db.insert(notificationPreferences).values(notificationPreferenceRows)

  const superAdmin = insertedUsers[0]!
  const demoScope = buildDemoSeedScope(config)
  const pickUserByOffset = (offset: number) => insertedUsers[offset % insertedUsers.length]!
  const existingDemoOrganization = await db.query.organizations.findFirst({
    where: eq(organizations.slug, demoScope.organizationSlug),
    columns: {
      id: true,
      name: true,
      slug: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const demoOrganization = existingDemoOrganization
    ? (await db.update(organizations)
      .set({
        name: demoScope.organizationName,
        createdByUserId: superAdmin.id,
        updatedAt: daysAgo(1),
      })
      .where(eq(organizations.id, existingDemoOrganization.id))
      .returning())[0]!
    : (await db.insert(organizations).values({
      name: demoScope.organizationName,
      slug: demoScope.organizationSlug,
      createdByUserId: superAdmin.id,
      createdAt: daysAgo(219),
      updatedAt: daysAgo(1),
    }).returning())[0]!

  const organizationMemberRows = insertedUsers.map((user, idx) => ({
    organizationId: demoOrganization.id,
    userId: user.id,
    role: mapUserRoleToOrganizationRole(user.role, idx === 0),
    invitedByUserId: idx === 0 ? null : superAdmin.id,
    joinedAt: daysAgo(215 - idx),
    createdAt: daysAgo(215 - idx),
    updatedAt: daysAgo(1),
  }))
  await db.insert(organizationMembers).values(organizationMemberRows)

  const teamBlueprints = [
    {
      name: 'Leadership',
      key: 'LEAD',
      description: 'Organization leadership and executive direction.',
      leadOffsets: [0, 1],
      memberOffsets: [0, 1, 2],
    },
    {
      name: 'Product Management',
      key: 'PM',
      description: 'Product direction, discovery, and roadmap stewardship.',
      leadOffsets: [2],
      memberOffsets: [2, 3, 4],
    },
    {
      name: 'Frontend Engineering',
      key: 'FE',
      description: 'Frontend architecture and web experience delivery.',
      leadOffsets: [5, 6],
      memberOffsets: [3, 5, 6, 8],
    },
    {
      name: 'Backend Engineering',
      key: 'BE',
      description: 'Backend APIs, data contracts, and platform reliability.',
      leadOffsets: [6, 7],
      memberOffsets: [1, 5, 6, 7],
    },
    {
      name: 'Quality and Operations',
      key: 'QOPS',
      description: 'Quality assurance, test operations, and release confidence.',
      leadOffsets: [4],
      memberOffsets: [4, 7, 8, 9],
    },
  ] as const

  const insertedOrganizationTeams: typeof organizationTeams.$inferSelect[] = []
  for (let index = 0; index < teamBlueprints.length; index++) {
    const blueprint = teamBlueprints[index]!
    const leadOffsets = blueprint.leadOffsets.length > 0
      ? blueprint.leadOffsets
      : [blueprint.memberOffsets[0] || 0]
    const leadOffsetSet = new Set<number>(leadOffsets as readonly number[])
    const primaryLeadUser = pickUserByOffset(leadOffsets[0]!)
    const [createdTeam] = await db.insert(organizationTeams).values({
      organizationId: demoOrganization.id,
      name: blueprint.name,
      key: blueprint.key,
      description: blueprint.description,
      leadUserId: primaryLeadUser.id,
      createdByUserId: superAdmin.id,
      createdAt: daysAgo(212 - index),
      updatedAt: daysAgo(1),
    }).returning()
    insertedOrganizationTeams.push(createdTeam)

    const uniqueMemberOffsets = Array.from(new Set([...leadOffsets, ...blueprint.memberOffsets]))
    const teamMemberRows: (typeof organizationTeamMembers.$inferInsert)[] = uniqueMemberOffsets.map((memberOffset) => {
      const memberUser = pickUserByOffset(memberOffset)
      return {
        organizationTeamId: createdTeam.id,
        userId: memberUser.id,
        role: leadOffsetSet.has(memberOffset) ? 'lead' : 'member',
        addedByUserId: superAdmin.id,
        createdAt: daysAgo(210 - index),
        updatedAt: daysAgo(1),
      }
    })
    await db.insert(organizationTeamMembers).values(teamMemberRows)
  }

  const managerOffsetByIndex = [null, 0, 0, 2, 3, 2, 5, 5, 4, 4] as const
  const reportRows = insertedUsers.map((memberUser, index) => {
    const managerOffset = managerOffsetByIndex[index] ?? (index > 0 ? index - 1 : null)
    const managerUserId = managerOffset == null ? null : pickUserByOffset(managerOffset).id
    return {
      organizationId: demoOrganization.id,
      memberUserId: memberUser.id,
      managerUserId,
      setByUserId: superAdmin.id,
      createdAt: daysAgo(209 - index),
      updatedAt: daysAgo(1),
    }
  })
  await db.insert(organizationMemberReports).values(reportRows)

  const onboardingRows = insertedUsers.map((user, index) => ({
    userId: user.id,
    organizationId: demoOrganization.id,
    currentStep: 'completed' as const,
    isCompleted: true,
    completedAt: daysAgo(200 - index),
    createdAt: daysAgo(218 - index),
    updatedAt: daysAgo(1),
  }))
  await db.insert(onboardingProgress).values(onboardingRows)

  const teamIdAt = (offset: number): string | null => {
    if (insertedOrganizationTeams.length === 0) return null
    return insertedOrganizationTeams[offset % insertedOrganizationTeams.length]!.id
  }
  const pickTeamIds = (offset: number, count = 2): string[] | null => {
    if (insertedOrganizationTeams.length === 0) return null
    const values: string[] = []
    for (let idx = 0; idx < count; idx++) {
      const candidate = teamIdAt(offset + idx * 2)
      if (!candidate) continue
      if (!values.includes(candidate)) values.push(candidate)
    }
    return values.length > 0 ? values : null
  }

  const [demoProduct] = await db.insert(products).values({
    organizationId: demoOrganization.id,
    name: config.product.name,
    logo: config.product.logo ?? null,
    description: config.product.description ?? null,
    createdByUserId: superAdmin.id,
  }).returning()

  const memberRows = insertedUsers.map((user, idx) => ({
    productId: demoProduct.id,
    userId: user.id,
    role: idx === 0 ? 'owner' : idx <= 2 ? 'admin' : 'member',
    addedAt: daysAgo(210 - idx),
  }))
  await db.insert(productMembers).values(memberRows)

  for (const { key: role } of CONFIGURABLE_ROLE_CATALOG) {
    for (const page of CONTROLLABLE_PAGE_KEYS) {
      const defaults = getDefaultPermissionForRolePage(role, page)
      await db.insert(rolePermissions).values({
        role,
        page,
        ...defaults,
      }).onConflictDoUpdate({
        target: [rolePermissions.role, rolePermissions.page],
        set: {
          ...defaults,
          updatedAt: daysAgo(1),
        },
      })
    }
  }

  const roleTitleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    product_admin: 'Product Admin',
    product_manager: 'Product Manager',
    business_analyst: 'Business Analyst',
    developer: 'Developer',
    viewer: 'Viewer',
  }

  const titleByRole = new Map<string, typeof titles.$inferSelect>()
  const roleKeys = ['super_admin', ...CONFIGURABLE_ROLE_CATALOG.map((entry) => entry.key)]
  for (const roleKey of roleKeys) {
    const [createdTitle] = await db.insert(titles).values({
      key: roleKey,
      name: roleTitleLabels[roleKey] || roleKey,
      description: `System bootstrap title mapped from role ${roleKey}.`,
      isActive: true,
      isSystem: true,
      createdByUserId: superAdmin.id,
    }).onConflictDoUpdate({
      target: titles.key,
      set: {
        name: roleTitleLabels[roleKey] || roleKey,
        description: `System bootstrap title mapped from role ${roleKey}.`,
        isActive: true,
        isSystem: true,
        createdByUserId: superAdmin.id,
        updatedAt: daysAgo(1),
      },
    }).returning()
    titleByRole.set(roleKey, createdTitle!)
  }

  for (const { key: role } of CONFIGURABLE_ROLE_CATALOG) {
    const title = titleByRole.get(role)
    if (!title) continue
    for (const page of CONTROLLABLE_PAGE_KEYS) {
      const defaults = getDefaultPermissionForRolePage(role, page)
      await db.insert(titlePermissions).values({
        titleId: title.id,
        page,
        ...defaults,
      }).onConflictDoUpdate({
        target: [titlePermissions.titleId, titlePermissions.page],
        set: {
          ...defaults,
          updatedAt: daysAgo(1),
        },
      })
    }
  }

  for (const seededUser of insertedUsers) {
    const mappedTitle = titleByRole.get(seededUser.role)
    if (!mappedTitle) continue
    await db.insert(userTitles).values({
      userId: seededUser.id,
      titleId: mappedTitle.id,
      assignedByUserId: superAdmin.id,
      assignedAt: daysAgo(1),
    }).onConflictDoUpdate({
      target: userTitles.userId,
      set: {
        titleId: mappedTitle.id,
        assignedByUserId: superAdmin.id,
        assignedAt: daysAgo(1),
        updatedAt: daysAgo(1),
      },
    })
  }

  const initiativeDefs = [
    { title: 'Q2 Acquisition Expansion', status: 'active', period: 'Q2 2026', priority: 'high' },
    { title: 'Platform Stability Program', status: 'active', period: 'Q2 2026', priority: 'critical' },
    { title: 'Performance Optimization Wave', status: 'planning', period: 'Q3 2026', priority: 'medium' },
    { title: 'Automation and AI Assist', status: 'planning', period: 'Q3 2026', priority: 'high' },
    { title: 'Self-Serve Onboarding', status: 'paused', period: 'Q2-Q3 2026', priority: 'medium' },
    { title: 'Data Governance and Security', status: 'active', period: 'Q2 2026', priority: 'critical' },
    { title: 'Mobile Experience Upgrade', status: 'completed', period: 'Q1 2026', priority: 'high' },
    { title: 'Revenue Analytics Revamp', status: 'completed', period: 'Q1 2026', priority: 'high' },
  ] as const

  const insertedInitiatives: typeof initiatives.$inferSelect[] = []
  for (let i = 0; i < initiativeDefs.length; i++) {
    const def = initiativeDefs[i]!
    const leader = insertedUsers[(i + 1) % insertedUsers.length]!
    const [created] = await db.insert(initiatives).values({
      title: def.title,
      description: `${def.title} drives measurable outcomes for ${config.product.name}.`,
      status: def.status,
      period: def.period,
      periodStart: dateOffsetString(-120 + i * 8),
      periodEnd: dateOffsetString(-40 + i * 8),
      leaderUserId: leader.id,
      priority: def.priority,
      productId: demoProduct.id,
      createdAt: daysAgo(170 - i * 2),
      updatedAt: daysAgo(2),
    }).returning()
    insertedInitiatives.push(created)
  }

  const deliveryDefs = [
    { title: 'Sprint 18 - Experience Core', status: 'completed', startOffset: -90, endOffset: -76 },
    { title: 'Sprint 19 - Collaboration', status: 'completed', startOffset: -75, endOffset: -61 },
    { title: 'Sprint 20 - Discovery Layer', status: 'in_progress', startOffset: -60, endOffset: -46 },
    { title: 'Sprint 21 - Metrics and Insights', status: 'in_progress', startOffset: -45, endOffset: -31 },
    { title: 'Sprint 22 - Reliability', status: 'blocked', startOffset: -30, endOffset: -16 },
    { title: 'Sprint 23 - Reporting', status: 'overdue', startOffset: -15, endOffset: -1 },
    { title: 'Sprint 24 - Mobile Upgrade', status: 'initialized', startOffset: 0, endOffset: 14 },
    { title: 'Sprint 25 - AI Assist', status: 'archived', startOffset: -140, endOffset: -126 },
  ] as const

  const insertedDeliveries: typeof deliveries.$inferSelect[] = []
  for (let i = 0; i < deliveryDefs.length; i++) {
    const def = deliveryDefs[i]!
    const creator = insertedUsers[i % insertedUsers.length]!
    const [created] = await db.insert(deliveries).values({
      productId: demoProduct.id,
      title: def.title,
      description: `${def.title} release train for ${config.product.name}.`,
      startDate: dateOffsetString(def.startOffset),
      endDate: dateOffsetString(def.endOffset),
      status: def.status,
      createdByUserId: creator.id,
      createdAt: daysAgo(95 - i * 5),
      updatedAt: daysAgo(1),
    }).returning()
    insertedDeliveries.push(created)
  }

  for (let i = 0; i < insertedDeliveries.length; i++) {
    const delivery = insertedDeliveries[i]!
    const first = insertedInitiatives[i % insertedInitiatives.length]!
    const second = insertedInitiatives[(i + 3) % insertedInitiatives.length]!
    await db.insert(deliveryInitiatives).values({
      deliveryId: delivery.id,
      initiativeId: first.id,
    })
    if (second.id !== first.id) {
      await db.insert(deliveryInitiatives).values({
        deliveryId: delivery.id,
        initiativeId: second.id,
      })
    }
  }

  const storyTypes = ['feature', 'bug', 'improvement', 'technical_debt', 'research', 'infrastructure', 'testing', 'documentation'] as const
  const storyStatuses = ['backlog', 'drafted', 'initialized', 'in_progress', 'completed', 'archived'] as const
  const storyPriorities = ['low', 'medium', 'high', 'critical'] as const
  const storyTitleBases = [
    'Real-time task collaboration', 'Release approval workflow', 'Executive dashboard export',
    'Role-based data boundaries', 'Delivery dependency graph', 'Workflow automation rules',
    'Cross-project initiative linking', 'Performance bottleneck explorer', 'Wiki smart templates',
    'Feedback triage board', 'Feature request scoring model', 'Mobile backlog optimization',
    'Search relevance tuning', 'Story quality checklist', 'Test cycle rollout planner',
    'Deployment rollback assistant', 'Task ownership insights', 'Risk and blocker monitor',
    'Portfolio-level roadmap timeline', 'Stakeholder digest center', 'Audit log explorer',
    'Notification preference matrix', 'Team workload balancing', 'Operational runbook indexing',
  ] as const

  const insertedStories: typeof stories.$inferSelect[] = []
  for (let i = 0; i < storyTitleBases.length; i++) {
    const owner = insertedUsers[(i + 2) % insertedUsers.length]!
    const initiative = insertedInitiatives[i % insertedInitiatives.length]!
    const delivery = insertedDeliveries[i % insertedDeliveries.length]!
    const [created] = await db.insert(stories).values({
      title: storyTitleBases[i]!,
      description: `${storyTitleBases[i]} for ${config.product.name} operations.`,
      type: storyTypes[i % storyTypes.length]!,
      priority: storyPriorities[i % storyPriorities.length]!,
      status: storyStatuses[i % storyStatuses.length]!,
      productId: demoProduct.id,
      initiativeId: initiative.id,
      initiative: initiative.title,
      delivery: delivery.title,
      ownerUserId: owner.id,
      estimate: `${2 + (i % 8)} pts`,
      acceptanceCriteria: `- Outcome is measurable\n- UX validated\n- QA approved\n- Documentation updated`,
      createdAt: daysAgo(155 - i * 3),
      updatedAt: daysAgo(2),
    }).returning()
    insertedStories.push(created)
  }

  const taskStatuses = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'blocked', 'overdue', 'archived'] as const
  const taskPriorities = ['low', 'medium', 'high', 'critical'] as const
  const taskTypes = ['design', 'development', 'testing', 'review', 'research', 'fix', 'documentation', 'deployment'] as const
  const initiativeByTitle = new Map(insertedInitiatives.map((initiative) => [initiative.title, initiative]))
  const taskRows: (typeof tasks.$inferInsert)[] = []

  let taskCounter = 0
  for (let i = 0; i < insertedStories.length; i++) {
    const story = insertedStories[i]!
    const storyTaskCount = 3 + (i % 2) // 3-4 tasks per story => 84 total
    const initiativeId = story.initiative ? initiativeByTitle.get(story.initiative)?.id ?? null : null
    for (let j = 0; j < storyTaskCount; j++) {
      const status = taskStatuses[(i + j) % taskStatuses.length]!
      const creator = insertedUsers[(i + j + 1) % insertedUsers.length]!
      const owner = insertedUsers[(i + j + 3) % insertedUsers.length]!
      const assigneePrimary = insertedUsers[(i + j + 4) % insertedUsers.length]!
      const assigneeSecondary = insertedUsers[(i + j + 5) % insertedUsers.length]!
      const reviewer = insertedUsers[(i + j + 6) % insertedUsers.length]!
      const createdAt = daysAgo(140 - taskCounter)
      const startedAt = ['in_progress', 'in_review', 'done', 'blocked', 'overdue', 'archived'].includes(status)
        ? daysAgo(130 - taskCounter)
        : null
      const completedAt = ['done', 'archived'].includes(status)
        ? daysAgo(90 - taskCounter)
        : null
      const dueAt = status === 'overdue' ? daysAgo(3 + (taskCounter % 7)) : daysFromNow((taskCounter % 21) - 5)
      const ownerTeamId = teamIdAt(i + j)
      const assigneeTeamIds = taskCounter % 3 === 0 ? pickTeamIds(i + j + 1) : null
      const reviewerTeamIds = ['in_review', 'done', 'archived'].includes(status)
        ? pickTeamIds(i + j + 2, 1)
        : null

      taskRows.push({
        productId: demoProduct.id,
        initiativeId,
        storyId: story.id,
        deliveryId: insertedDeliveries[(i + j) % insertedDeliveries.length]!.id,
        title: `Task ${taskCounter + 1}: ${story.title}`,
        description: `Execution task ${taskCounter + 1} for "${story.title}".`,
        status,
        priority: taskPriorities[(i + j) % taskPriorities.length]!,
        type: taskTypes[(i + j) % taskTypes.length]!,
        ownerUserId: owner.id,
        ownerTeamId,
        assigneeUserIds: [assigneePrimary.id, assigneeSecondary.id],
        assigneeTeamIds,
        reviewerUserIds: ['in_review', 'done', 'archived'].includes(status) ? [reviewer.id] : null,
        reviewerTeamIds,
        createdByUserId: creator.id,
        estimateValue: 2 + (taskCounter % 9),
        dependent: null,
        blockedReason: status === 'blocked' ? 'Dependency from external API contract is pending.' : null,
        createdAt,
        updatedAt: daysAgo(1),
        startedAt,
        completedAt,
        dueAt,
      })
      taskCounter++
    }
  }
  const insertedTasks = await db.insert(tasks).values(taskRows).returning()

  const taskHistoryRows: (typeof taskStatusHistory.$inferInsert)[] = []
  for (const task of insertedTasks) {
    const timeline = statusTimeline(task.status)
    for (let i = 0; i < timeline.length; i++) {
      taskHistoryRows.push({
        taskId: task.id,
        productId: task.productId,
        fromStatus: i === 0 ? null : (timeline[i - 1]! as any),
        toStatus: timeline[i]! as any,
        changedByUserId: task.createdByUserId,
        changedAt: new Date(task.createdAt.getTime() + i * 6 * 60 * 60 * 1000),
      })
    }
  }
  await db.insert(taskStatusHistory).values(taskHistoryRows)

  const storyCommentRows: (typeof storyComments.$inferInsert)[] = []
  const taskCommentRows: (typeof taskComments.$inferInsert)[] = []
  const taskAttachmentRows: (typeof taskAttachments.$inferInsert)[] = []

  for (let i = 0; i < insertedStories.length; i++) {
    const story = insertedStories[i]!
    const commenter = insertedUsers[i % insertedUsers.length]!
    storyCommentRows.push({
      storyId: story.id,
      userId: commenter.id,
      content: `Story discussion point ${i + 1} for "${story.title}".`,
      createdAt: daysAgo(40 - i),
      updatedAt: daysAgo(20 - i),
    })
    if (i % 3 === 0) {
      const secondCommenter = insertedUsers[(i + 2) % insertedUsers.length]!
      storyCommentRows.push({
        storyId: story.id,
        userId: secondCommenter.id,
        content: `Follow-up clarification for "${story.title}".`,
        createdAt: daysAgo(35 - i),
        updatedAt: daysAgo(15 - i),
      })
    }
  }

  for (let i = 0; i < insertedTasks.length; i++) {
    const task = insertedTasks[i]!
    const commenter = insertedUsers[(i + 1) % insertedUsers.length]!
    taskCommentRows.push({
      taskId: task.id,
      userId: commenter.id,
      content: `Task note ${i + 1}: progress update for "${task.title}".`,
      createdAt: daysAgo(32 - (i % 18)),
      updatedAt: daysAgo(20 - (i % 14)),
    })
    if (i % 2 === 0) {
      taskCommentRows.push({
        taskId: task.id,
        userId: insertedUsers[(i + 3) % insertedUsers.length]!.id,
        content: `QA feedback for "${task.title}".`,
        createdAt: daysAgo(28 - (i % 12)),
        updatedAt: daysAgo(18 - (i % 10)),
      })
    }
    if (i < 30) {
      taskAttachmentRows.push({
        taskId: task.id,
        userId: insertedUsers[(i + 4) % insertedUsers.length]!.id,
        fileName: `evidence-${i + 1}.png`,
        fileSize: 120_000 + i * 4_000,
        mimeType: 'image/png',
        filePath: `/uploads/attachments/demo/evidence-${i + 1}.png`,
        createdAt: daysAgo(24 - (i % 10)),
      })
    }
  }

  await db.insert(storyComments).values(storyCommentRows)
  await db.insert(taskComments).values(taskCommentRows)
  await db.insert(taskAttachments).values(taskAttachmentRows)

  const serverDefs = [
    { name: 'nf-dev-01', environment: 'dev', region: 'us-east-1' },
    { name: 'nf-dev-02', environment: 'dev', region: 'us-east-2' },
    { name: 'nf-stage-01', environment: 'stage', region: 'us-east-1' },
    { name: 'nf-stage-02', environment: 'stage', region: 'us-west-2' },
    { name: 'nf-prod-01', environment: 'prod', region: 'us-east-1' },
    { name: 'nf-prod-02', environment: 'prod', region: 'us-west-2' },
  ] as const

  const insertedServers: typeof servers.$inferSelect[] = []
  for (let i = 0; i < serverDefs.length; i++) {
    const def = serverDefs[i]!
    const [server] = await db.insert(servers).values({
      name: def.name,
      environment: def.environment,
      host: `${def.name}.novaforge.internal`,
      port: 443,
      protocol: 'https',
      region: def.region,
      provider: 'AWS',
      instanceId: `i-novaforge-${1000 + i}`,
      isActive: 1,
      productId: demoProduct.id,
      createdAt: daysAgo(120 - i),
      updatedAt: daysAgo(1),
    }).returning()
    insertedServers.push(server)
  }

  const releaseDefs = [
    { code: 'NF-R1', version: '2.0.0', title: 'Foundation Rollout', status: 'completed', releaseType: 'feature' },
    { code: 'NF-R2', version: '2.1.0', title: 'Collaboration Suite', status: 'in_progress', releaseType: 'feature' },
    { code: 'NF-R3', version: '2.1.1', title: 'Hotfix Session Stability', status: 'failed', releaseType: 'hotfix' },
    { code: 'NF-R4', version: '2.2.0', title: 'Insights Expansion', status: 'planned', releaseType: 'feature' },
    { code: 'NF-R5', version: '2.0.2', title: 'Patch UX Polish', status: 'draft', releaseType: 'patch' },
  ] as const

  const insertedReleases: typeof releases.$inferSelect[] = []
  for (let i = 0; i < releaseDefs.length; i++) {
    const def = releaseDefs[i]!
    const creator = insertedUsers[i % insertedUsers.length]!
    const manager = insertedUsers[(i + 2) % insertedUsers.length]!
    const [release] = await db.insert(releases).values({
      code: def.code,
      version: def.version,
      title: def.title,
      status: def.status,
      releaseType: def.releaseType,
      plannedAt: daysAgo(30 - i * 3),
      startedAt: def.status === 'draft' || def.status === 'planned' ? null : daysAgo(24 - i * 2),
      completedAt: def.status === 'completed' ? daysAgo(18) : null,
      createdByUserId: creator.id,
      releaseManagerId: manager.id,
      notes: `${def.title} for ${config.product.name}.`,
      releaseNotes: `Release notes for ${def.version}`,
      productId: demoProduct.id,
      createdAt: daysAgo(36 - i * 2),
      updatedAt: daysAgo(1),
    }).returning()
    insertedReleases.push(release)
  }

  for (let i = 0; i < insertedReleases.length; i++) {
    const release = insertedReleases[i]!
    await db.insert(releaseDeliveries).values({
      releaseId: release.id,
      deliveryId: insertedDeliveries[i % insertedDeliveries.length]!.id,
      deploymentOrder: 1,
      addedAt: daysAgo(20 - i),
      addedByUserId: insertedUsers[i % insertedUsers.length]!.id,
    })
    await db.insert(releaseDeliveries).values({
      releaseId: release.id,
      deliveryId: insertedDeliveries[(i + 2) % insertedDeliveries.length]!.id,
      deploymentOrder: 2,
      addedAt: daysAgo(19 - i),
      addedByUserId: insertedUsers[(i + 1) % insertedUsers.length]!.id,
    })
  }

  const envs: ('dev' | 'stage' | 'prod')[] = ['dev', 'stage', 'prod']
  const serverByEnv = {
    dev: insertedServers.filter((server) => server.environment === 'dev'),
    stage: insertedServers.filter((server) => server.environment === 'stage'),
    prod: insertedServers.filter((server) => server.environment === 'prod'),
  }

  for (let i = 0; i < insertedReleases.length; i++) {
    const release = insertedReleases[i]!
    for (let e = 0; e < envs.length; e++) {
      const environment = envs[e]!
      let status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'rolled_back' = 'pending'
      if (release.status === 'completed') status = 'deployed'
      if (release.status === 'in_progress') status = environment === 'dev' ? 'deployed' : environment === 'stage' ? 'deploying' : 'pending'
      if (release.status === 'failed') status = environment === 'dev' ? 'deployed' : environment === 'stage' ? 'failed' : 'pending'
      if (release.status === 'planned' || release.status === 'draft') status = 'pending'

      const [deployment] = await db.insert(releaseDeployments).values({
        releaseId: release.id,
        environment,
        sequence: e + 1,
        status,
        startedAt: status === 'pending' ? null : daysAgo(12 - i - e),
        completedAt: status === 'deployed' ? daysAgo(10 - i - e) : null,
        failedAt: status === 'failed' ? daysAgo(9 - i - e) : null,
        deployedByUserId: insertedUsers[(i + e) % insertedUsers.length]!.id,
        notes: `${environment} deployment for ${release.version}`,
      }).returning()

      const targets = serverByEnv[environment]
      for (let s = 0; s < targets.length; s++) {
        const server = targets[s]!
        const targetStatus: 'pending' | 'deploying' | 'deployed' | 'failed' =
          status === 'deployed'
            ? 'deployed'
            : status === 'deploying'
              ? s === 0 ? 'deploying' : 'pending'
              : status === 'failed'
                ? s === 0 ? 'failed' : 'pending'
                : 'pending'

        await db.insert(deploymentTargets).values({
          releaseDeploymentId: deployment.id,
          serverId: server.id,
          status: targetStatus,
          deployedAt: targetStatus === 'deployed' ? daysAgo(9 - i - e) : null,
          failedAt: targetStatus === 'failed' ? daysAgo(8 - i - e) : null,
          logsUrl: targetStatus === 'failed' ? `https://logs.novaforge.io/deploy/${release.code}-${environment}` : null,
        })
      }
    }
  }

  const cycleDefs = [
    { title: 'Cycle A - Regression', status: 'in_progress', startOffset: -18, endOffset: -6 },
    { title: 'Cycle B - UAT', status: 'completed', startOffset: -45, endOffset: -30 },
    { title: 'Cycle C - Performance', status: 'planned', startOffset: 2, endOffset: 14 },
    { title: 'Cycle D - Security', status: 'planned', startOffset: 8, endOffset: 18 },
    { title: 'Cycle E - Archive Snapshot', status: 'archived', startOffset: -140, endOffset: -126 },
  ] as const

  const insertedCycles: typeof testCycles.$inferSelect[] = []
  for (let i = 0; i < cycleDefs.length; i++) {
    const def = cycleDefs[i]!
    const [cycle] = await db.insert(testCycles).values({
      title: def.title,
      description: `${def.title} for ${config.product.name}.`,
      status: def.status,
      deliveryId: insertedDeliveries[i % insertedDeliveries.length]!.id,
      releaseId: insertedReleases[i % insertedReleases.length]!.id,
      productId: demoProduct.id,
      startDate: dateOffsetString(def.startOffset),
      endDate: dateOffsetString(def.endOffset),
      createdByUserId: insertedUsers[(i + 1) % insertedUsers.length]!.id,
      createdAt: daysAgo(20 - i),
      updatedAt: daysAgo(1),
    }).returning()
    insertedCycles.push(cycle)
  }

  const issueSeverities = ['critical', 'major', 'minor', 'trivial'] as const
  const issueStatuses = ['open', 'in_progress', 'resolved', 'closed', 'deferred'] as const
  const issueRows: (typeof testCycleIssues.$inferInsert)[] = []
  for (let i = 0; i < insertedCycles.length; i++) {
    const cycle = insertedCycles[i]!
    for (let j = 0; j < 8; j++) {
      issueRows.push({
        testCycleId: cycle.id,
        title: `Issue ${i + 1}.${j + 1} - Verification gap`,
        description: `Observed issue ${j + 1} in ${cycle.title}.`,
        severity: issueSeverities[(i + j) % issueSeverities.length]!,
        status: issueStatuses[(i + j) % issueStatuses.length]!,
        storyId: insertedStories[(i * 4 + j) % insertedStories.length]!.id,
        reportedByUserId: insertedUsers[(i + j + 1) % insertedUsers.length]!.id,
        assignedToUserId: insertedUsers[(i + j + 2) % insertedUsers.length]!.id,
        assignedToTeamId: j % 2 === 0 ? teamIdAt(i + j + 1) : null,
        createdAt: daysAgo(18 - j),
        updatedAt: daysAgo(6 - (j % 5)),
      })
    }
  }
  await db.insert(testCycleIssues).values(issueRows)

  const assetTypeDefs = [
    { name: 'API', slug: 'api', category: 'engineering', icon: 'api', color: '#4857fe' },
    { name: 'Service', slug: 'service', category: 'engineering', icon: 'service', color: '#7c5cfc' },
    { name: 'Database', slug: 'database', category: 'engineering', icon: 'database', color: '#f59e0b' },
    { name: 'Page', slug: 'page', category: 'product', icon: 'page', color: '#3b82f6' },
    { name: 'Feature', slug: 'feature', category: 'product', icon: 'feature', color: '#8b5cf6' },
    { name: 'Flow', slug: 'flow', category: 'product', icon: 'flow', color: '#06b6d4' },
    { name: 'Article', slug: 'article', category: 'business', icon: 'article', color: '#6366f1' },
    { name: 'SOP', slug: 'sop', category: 'business', icon: 'sop', color: '#f59e0b' },
    { name: 'Policy', slug: 'policy', category: 'business', icon: 'policy', color: '#ef4444' },
    { name: 'Tool', slug: 'tool', category: 'external', icon: 'tool', color: '#0ea5e9' },
  ] as const

  const insertedAssetTypes: typeof assetTypes.$inferSelect[] = []
  for (const def of assetTypeDefs) {
    const [created] = await db.insert(assetTypes).values({
      ...def,
      productId: demoProduct.id,
      createdAt: daysAgo(90),
    }).returning()
    insertedAssetTypes.push(created)
  }

  const assetTitleBases = [
    'Incident Response Playbook',
    'Release Readiness Checklist',
    'Sprint Planning Blueprint',
    'Customer Feedback Triage Guide',
    'Service Dependency Map',
    'Production Change Policy',
    'Data Retention Reference',
    'Monitoring and Alerting Handbook',
    'On-call Escalation Matrix',
    'Post-release Validation Guide',
  ] as const

  const insertedAssets: typeof assets.$inferSelect[] = []
  for (let i = 0; i < 30; i++) {
    const type = insertedAssetTypes[i % insertedAssetTypes.length]!
    const owner = insertedUsers[(i + 2) % insertedUsers.length]!
    const parent = i >= 10 ? insertedAssets[i % 10] : null
    const titleBase = assetTitleBases[i % assetTitleBases.length]!
    const title = `${titleBase} - ${type.name}`
    const [created] = await db.insert(assets).values({
      productId: demoProduct.id,
      assetTypeId: type.id,
      title,
      slug: `${slugify(title)}-${i + 1}`,
      description: `${titleBase} reference used by ${config.product.name} teams.`,
      content: `## ${title}\n\nOperational guide for ${config.product.name}.\n\n### Scope\n- Ownership model\n- Runtime dependencies\n- Validation checkpoints\n- Incident fallback path`,
      status: (i % 11 === 0 ? 'deprecated' : i % 7 === 0 ? 'draft' : 'active') as any,
      visibility: (i % 9 === 0 ? 'public' : i % 5 === 0 ? 'private' : 'internal') as any,
      ownerUserId: owner.id,
      tags: ['operations', type.slug, `domain-${(i % 4) + 1}`],
      parentId: parent?.id || null,
      sortOrder: i,
      createdByUserId: owner.id,
      createdAt: daysAgo(80 - i),
      updatedAt: daysAgo(1),
    }).returning()
    insertedAssets.push(created)
  }

  const relationTypes = ['related_to', 'depends_on', 'uses', 'documents'] as const
  for (let i = 0; i < 25; i++) {
    const source = insertedAssets[i]!
    const target = insertedAssets[(i + 7) % insertedAssets.length]!
    if (source.id === target.id) continue
    await db.insert(assetRelations_table).values({
      sourceAssetId: source.id,
      targetAssetId: target.id,
      relationType: relationTypes[i % relationTypes.length]!,
      createdAt: daysAgo(50 - i),
    })
  }

  const featureStatuses = ['open', 'under_review', 'planned', 'in_progress', 'completed', 'declined'] as const
  const featureCategories = ['enhancement', 'new_feature', 'integration', 'ux_improvement', 'performance', 'other'] as const
  const featureRequestTitles = [
    'Bulk-edit task fields from table view',
    'Cross-delivery dependency timeline',
    'Release risk scorecard by environment',
    'Automated sprint retro summary draft',
    'Portfolio roadmap export to PDF',
    'Slack alerts for overdue blockers',
    'Story acceptance checklist templates',
    'Initiative health trend visualization',
    'Cycle issue clustering by component',
    'Smart assignment suggestions for tasks',
    'Wiki relation graph explorer',
    'Customer feedback sentiment rollup',
    'Saved views for metrics dashboards',
    'Approval gate for production deployments',
    'Contextual onboarding tips for new members',
    'Delivery KPI digest email',
  ] as const
  const insertedFeatureRequests: typeof featureRequests.$inferSelect[] = []
  for (let i = 0; i < 16; i++) {
    const creator = insertedUsers[(i + 1) % insertedUsers.length]!
    const featureTitle = featureRequestTitles[i % featureRequestTitles.length]!
    const [created] = await db.insert(featureRequests).values({
      productId: demoProduct.id,
      title: featureTitle,
      description: `Requested by product leadership to improve delivery outcomes: ${featureTitle}.`,
      status: featureStatuses[i % featureStatuses.length]!,
      category: featureCategories[i % featureCategories.length]!,
      createdByUserId: creator.id,
      storyId: insertedStories[(i * 2) % insertedStories.length]!.id,
      tags: ['roadmap', `quarter-${(i % 4) + 1}`, featureCategories[i % featureCategories.length]!],
      upvoteCount: 0,
      createdAt: daysAgo(60 - i),
      updatedAt: daysAgo(2),
    }).returning()
    insertedFeatureRequests.push(created)
  }

  for (let i = 0; i < insertedFeatureRequests.length; i++) {
    const request = insertedFeatureRequests[i]!
    const upvoters = insertedUsers.slice(0, 2 + (i % 5))
    for (const voter of upvoters) {
      await db.insert(featureRequestUpvotes).values({
        featureRequestId: request.id,
        userId: voter.id,
        createdAt: daysAgo(30 - i),
      })
    }
    await db.update(featureRequests)
      .set({ upvoteCount: upvoters.length, updatedAt: daysAgo(1) })
      .where(eq(featureRequests.id, request.id))

    for (let c = 0; c < 1 + (i % 3); c++) {
      await db.insert(featureRequestComments).values({
        featureRequestId: request.id,
        userId: insertedUsers[(i + c + 2) % insertedUsers.length]!.id,
        content: `Discussion ${c + 1} on feature request ${i + 1}.`,
        createdAt: daysAgo(28 - i - c),
        updatedAt: daysAgo(7 - c),
      })
    }
    if (i < 8) {
      await db.insert(featureRequestAttachments).values({
        featureRequestId: request.id,
        userId: insertedUsers[(i + 3) % insertedUsers.length]!.id,
        fileName: `feature-mock-${i + 1}.png`,
        fileSize: 140_000 + i * 6_000,
        mimeType: 'image/png',
        filePath: `/uploads/feature-requests/feature-mock-${i + 1}.png`,
        createdAt: daysAgo(22 - i),
      })
    }
  }

  const feedbackTypes = ['bug', 'feature', 'enhancement'] as const
  const feedbackStatuses = ['new', 'acknowledged', 'investigating', 'resolved', 'wont_fix', 'duplicate'] as const
  const feedbackPriorities = ['low', 'medium', 'high', 'critical'] as const
  const feedbackTitleCatalog = [
    'Kanban drag-and-drop stutters with large backlogs',
    'Release notes editor loses focus while typing',
    'Notification panel unread badge desyncs after refresh',
    'Search returns stale wiki pages after rename',
    'Timeline filters reset unexpectedly on navigation',
    'Task quick-create should support keyboard-only flow',
    'Metrics charts should remember time range preference',
    'Deployment history page needs clearer rollback state',
    'Story comments markdown preview renders inconsistently',
    'Dark mode contrast too low in table headers',
    'Cycle issue form should auto-fill story context',
    'Bulk action bar overlaps pagination controls',
    'Product switcher should pin favorite workspaces',
    'Feedback attachments upload fails on slow networks',
    'Role settings page needs permission diff preview',
    'Activity feed should group repeated status updates',
  ] as const
  const feedbackReporterNames = [
    'Alex Morgan',
    'Priya Nair',
    'Jordan Lee',
    'Samira Khan',
    'Diego Alvarez',
    'Hannah Brooks',
    'Marcus Chen',
    'Elena Rossi',
  ] as const
  const feedbackPages = ['/home', '/stories', '/tasks', '/deliveries', '/releases', '/wiki'] as const
  const insertedFeedbacks: typeof consumerFeedbacks.$inferSelect[] = []
  for (let i = 0; i < 16; i++) {
    const reporterName = feedbackReporterNames[i % feedbackReporterNames.length]!
    const reporterEmailHandle = slugify(reporterName).replace(/-/g, '.')
    const feedbackTitle = feedbackTitleCatalog[i % feedbackTitleCatalog.length]!
    const pageUrl = feedbackPages[i % feedbackPages.length]!
    const [created] = await db.insert(consumerFeedbacks).values({
      productId: demoProduct.id,
      title: feedbackTitle,
      description: `Customer-reported issue impacting day-to-day workflows: ${feedbackTitle}.`,
      type: feedbackTypes[i % feedbackTypes.length]!,
      status: feedbackStatuses[i % feedbackStatuses.length]!,
      priority: feedbackPriorities[i % feedbackPriorities.length]!,
      reporterName,
      reporterEmail: `${reporterEmailHandle}@customer.example`,
      reporterDevice: i % 2 === 0 ? 'iPhone 15' : 'Pixel 8',
      reporterBrowser: i % 2 === 0 ? 'Safari' : 'Chrome',
      reporterOs: i % 2 === 0 ? 'iOS 17' : 'Android 14',
      appVersion: `2.${i % 4}.${i % 9}`,
      pageUrl,
      stepsToReproduce: `1. Open ${config.product.name}\n2. Navigate to ${pageUrl}\n3. Trigger the affected workflow\n4. Observe behavior mismatch`,
      expectedBehavior: 'Workflow should complete without state loss or visual regressions.',
      actualBehavior: 'Observed inconsistent state update and UI feedback during the workflow.',
      storyId: insertedStories[(i * 3) % insertedStories.length]!.id,
      assignedToUserId: insertedUsers[(i + 1) % insertedUsers.length]!.id,
      tags: ['customer', `segment-${(i % 3) + 1}`, `surface-${slugify(pageUrl.replace('/', '') || 'home')}`],
      upvoteCount: i % 7,
      createdAt: daysAgo(52 - i),
      updatedAt: daysAgo(2),
    }).returning()
    insertedFeedbacks.push(created)
  }

  for (let i = 0; i < insertedFeedbacks.length; i++) {
    const feedback = insertedFeedbacks[i]!
    for (let c = 0; c < (i % 3); c++) {
      await db.insert(consumerFeedbackComments).values({
        feedbackId: feedback.id,
        userId: insertedUsers[(i + c + 2) % insertedUsers.length]!.id,
        content: `Internal note ${c + 1} for feedback ${i + 1}.`,
        isInternal: c % 2 === 0 ? 1 : 0,
        createdAt: daysAgo(15 - c),
      })
    }
    if (i < 10) {
      await db.insert(consumerFeedbackAttachments).values({
        feedbackId: feedback.id,
        fileName: `feedback-proof-${i + 1}.png`,
        fileSize: 110_000 + i * 4_500,
        mimeType: 'image/png',
        filePath: `/uploads/consumer-feedback/feedback-proof-${i + 1}.png`,
        fileType: 'image',
        createdAt: daysAgo(14 - (i % 6)),
      })
    }
  }

  const activityRows: (typeof activities.$inferInsert)[] = []
  for (let i = 0; i < insertedStories.length; i++) {
    const story = insertedStories[i]!
    const actor = insertedUsers[i % insertedUsers.length]!
    activityRows.push({
      productId: demoProduct.id,
      userId: actor.id,
      userName: actor.name,
      userAvatar: actor.avatar,
      action: 'created',
      entityType: 'story',
      entityId: story.id,
      entityTitle: story.title,
      changes: null,
      createdAt: daysAgo(70 - i),
    })
  }
  for (let i = 0; i < 70; i++) {
    const task = insertedTasks[i]!
    const actor = insertedUsers[(i + 3) % insertedUsers.length]!
    activityRows.push({
      productId: demoProduct.id,
      userId: actor.id,
      userName: actor.name,
      userAvatar: actor.avatar,
      action: i % 3 === 0 ? 'updated' : 'created',
      entityType: 'task',
      entityId: task.id,
      entityTitle: task.title,
      changes: i % 3 === 0
        ? [{ field: 'status', from: 'in_progress', to: task.status }]
        : null,
      createdAt: daysAgo(65 - (i % 40)),
    })
  }
  for (let i = 0; i < insertedReleases.length; i++) {
    const release = insertedReleases[i]!
    const actor = insertedUsers[(i + 1) % insertedUsers.length]!
    activityRows.push({
      productId: demoProduct.id,
      userId: actor.id,
      userName: actor.name,
      userAvatar: actor.avatar,
      action: 'created',
      entityType: 'release',
      entityId: release.id,
      entityTitle: release.title,
      changes: null,
      createdAt: daysAgo(25 - i),
    })
  }
  await db.insert(activities).values(activityRows)

  const favoriteCandidates = [
    ...insertedInitiatives.slice(0, 3).map((initiative) => ({ entityType: 'initiative', entityId: initiative.id })),
    ...insertedStories.slice(0, 6).map((story) => ({ entityType: 'story', entityId: story.id })),
    ...insertedTasks.slice(0, 10).map((task) => ({ entityType: 'task', entityId: task.id })),
    ...insertedDeliveries.slice(0, 3).map((delivery) => ({ entityType: 'delivery', entityId: delivery.id })),
    ...insertedReleases.slice(0, 3).map((release) => ({ entityType: 'release', entityId: release.id })),
    ...insertedCycles.slice(0, 2).map((cycle) => ({ entityType: 'test_cycle', entityId: cycle.id })),
    ...insertedUsers.slice(0, 2).map((user) => ({ entityType: 'team_member', entityId: user.id })),
  ] as const

  const favoriteRows: (typeof favorites.$inferInsert)[] = []
  for (let i = 0; i < insertedUsers.length; i++) {
    for (let j = 0; j < 4; j++) {
      const candidate = favoriteCandidates[(i * 3 + j) % favoriteCandidates.length]!
      favoriteRows.push({
        userId: insertedUsers[i]!.id,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        productId: demoProduct.id,
        createdAt: daysAgo(14 - j),
      })
    }
  }
  await db.insert(favorites).values(favoriteRows)

  const settingsRows: (typeof userSettings.$inferInsert)[] = []
  for (let i = 0; i < insertedUsers.length; i++) {
    const user = insertedUsers[i]!
    settingsRows.push(
      { userId: user.id, key: 'stories-view-mode', value: i % 2 === 0 ? 'table' : 'kanban', updatedAt: daysAgo(3) },
      {
        userId: user.id,
        key: 'tasks-column-config',
        value: [
          { field: 'title', visible: true },
          { field: 'status', visible: true },
          { field: 'priority', visible: true },
          { field: 'owner', visible: i % 2 === 0 },
          { field: 'delivery', visible: true },
        ],
        updatedAt: daysAgo(3),
      },
      {
        userId: user.id,
        key: 'deliveries-column-widths',
        value: { title: 280, status: 120, startDate: 140, endDate: 140, progress: 130 },
        updatedAt: daysAgo(3),
      },
    )
  }
  await db.insert(userSettings).values(settingsRows)

  const additionalProducts = config.products.slice(1)
  const portfolioSummary = {
    products: 0,
    initiatives: 0,
    stories: 0,
    tasks: 0,
    deliveries: 0,
    releases: 0,
    testCycles: 0,
    assets: 0,
    featureRequests: 0,
    feedbacks: 0,
  }

  for (let productIndex = 0; productIndex < additionalProducts.length; productIndex++) {
    const profile = additionalProducts[productIndex]!
    const [portfolioProduct] = await db.insert(products).values({
      organizationId: demoOrganization.id,
      name: profile.name,
      logo: profile.logo ?? null,
      description: profile.description ?? `${profile.name} portfolio workspace seeded for Productier demos.`,
      createdByUserId: superAdmin.id,
      createdAt: daysAgo(160 - productIndex * 4),
      updatedAt: daysAgo(1),
    }).returning()
    portfolioSummary.products += 1

    const memberRowsForPortfolio = insertedUsers.map((user, idx) => ({
      productId: portfolioProduct.id,
      userId: user.id,
      role: idx === 0 ? 'owner' : idx <= 2 ? 'admin' : 'member',
      addedAt: daysAgo(150 - idx - productIndex * 2),
    }))
    await db.insert(productMembers).values(memberRowsForPortfolio)

    const initiativeTracks = [
      'Workflow automation',
      'Reliability engineering',
      'Adoption and onboarding',
    ] as const
    const portfolioInitiativeRows: (typeof initiatives.$inferInsert)[] = initiativeTracks.map((track, idx) => ({
      productId: portfolioProduct.id,
      title: `${profile.name} ${track}`,
      description: `${track} roadmap stream for ${profile.name}.`,
      status: idx === 0 ? 'active' : idx === 1 ? 'planning' : 'paused',
      period: `Q${(idx % 4) + 1} 2026`,
      periodStart: dateOffsetString(-95 + idx * 28),
      periodEnd: dateOffsetString(-35 + idx * 30),
      leaderUserId: insertedUsers[(idx + 2) % insertedUsers.length]!.id,
      priority: storyPriorities[(idx + 1) % storyPriorities.length]!,
      createdAt: daysAgo(130 - idx * 7 - productIndex * 5),
      updatedAt: daysAgo(2),
    }))
    const insertedPortfolioInitiatives = await db.insert(initiatives).values(portfolioInitiativeRows).returning()
    portfolioSummary.initiatives += insertedPortfolioInitiatives.length

    const portfolioDeliveryRows: (typeof deliveries.$inferInsert)[] = insertedPortfolioInitiatives.map((initiative, idx) => ({
      productId: portfolioProduct.id,
      title: `${profile.name} Program Increment ${idx + 1}`,
      description: `Execution window for ${initiative.title}.`,
      startDate: dateOffsetString(-80 + idx * 21),
      endDate: dateOffsetString(-52 + idx * 21),
      status: idx === 0 ? 'completed' : idx === 1 ? 'in_progress' : 'initialized',
      createdByUserId: insertedUsers[(idx + 1) % insertedUsers.length]!.id,
      createdAt: daysAgo(120 - idx * 5),
      updatedAt: daysAgo(2),
    }))
    const portfolioDeliveries = await db.insert(deliveries).values(portfolioDeliveryRows).returning()
    portfolioSummary.deliveries += portfolioDeliveries.length

    await db.insert(deliveryInitiatives).values(
      insertedPortfolioInitiatives.map((initiative, idx) => ({
        deliveryId: portfolioDeliveries[idx % portfolioDeliveries.length]!.id,
        initiativeId: initiative.id,
      })),
    )

    const storyFocuses = [
      'dashboard instrumentation',
      'cross-team automation',
      'quality guardrails',
      'reporting workflows',
    ] as const
    const portfolioStoryRows: (typeof stories.$inferInsert)[] = []
    for (let i = 0; i < 12; i++) {
      const initiative = insertedPortfolioInitiatives[i % insertedPortfolioInitiatives.length]!
      const delivery = portfolioDeliveries[i % portfolioDeliveries.length]!
      const owner = insertedUsers[(i + 3) % insertedUsers.length]!
      portfolioStoryRows.push({
        title: `${profile.name}: ${storyFocuses[i % storyFocuses.length]} #${i + 1}`,
        description: `Portfolio story ${i + 1} for ${profile.name}.`,
        type: storyTypes[(i + productIndex) % storyTypes.length]!,
        priority: storyPriorities[(i + 1) % storyPriorities.length]!,
        status: storyStatuses[(i + 1) % storyStatuses.length]!,
        productId: portfolioProduct.id,
        initiativeId: initiative.id,
        initiative: initiative.title,
        delivery: delivery.title,
        ownerUserId: owner.id,
        estimate: `${3 + (i % 5)} pts`,
        acceptanceCriteria: '- Scope reviewed\n- QA test plan prepared\n- Release notes updated',
        createdAt: daysAgo(118 - i * 2),
        updatedAt: daysAgo(2),
      })
    }
    const insertedPortfolioStories = await db.insert(stories).values(portfolioStoryRows).returning()
    portfolioSummary.stories += insertedPortfolioStories.length

    const portfolioTaskRows: (typeof tasks.$inferInsert)[] = []
    let portfolioTaskCounter = 0
    for (let i = 0; i < insertedPortfolioStories.length; i++) {
      const story = insertedPortfolioStories[i]!
      const tasksPerStory = 2 + ((i + productIndex) % 2)
      for (let j = 0; j < tasksPerStory; j++) {
        const status = taskStatuses[(i + j + 1) % taskStatuses.length]!
        const owner = insertedUsers[(i + j + 1) % insertedUsers.length]!
        const assignee = insertedUsers[(i + j + 2) % insertedUsers.length]!
        const reviewer = insertedUsers[(i + j + 4) % insertedUsers.length]!
        const ownerTeamId = teamIdAt(i + j + productIndex)
        const assigneeTeamIds = (i + j + productIndex) % 2 === 0
          ? pickTeamIds(i + j + productIndex + 1)
          : null
        const reviewerTeamIds = ['in_review', 'done', 'archived'].includes(status)
          ? pickTeamIds(i + j + productIndex + 2, 1)
          : null
        portfolioTaskRows.push({
          productId: portfolioProduct.id,
          initiativeId: story.initiativeId ?? null,
          storyId: story.id,
          deliveryId: portfolioDeliveries[(i + j) % portfolioDeliveries.length]!.id,
          title: `${profile.name} Task ${portfolioTaskCounter + 1}: ${story.title}`,
          description: `Execution step ${portfolioTaskCounter + 1} for ${story.title}.`,
          status,
          priority: taskPriorities[(i + j + 1) % taskPriorities.length]!,
          type: taskTypes[(i + j + productIndex) % taskTypes.length]!,
          ownerUserId: owner.id,
          ownerTeamId,
          assigneeUserIds: [assignee.id],
          assigneeTeamIds,
          reviewerUserIds: ['in_review', 'done', 'archived'].includes(status) ? [reviewer.id] : null,
          reviewerTeamIds,
          createdByUserId: insertedUsers[(i + j) % insertedUsers.length]!.id,
          estimateValue: 2 + ((i + j) % 6),
          blockedReason: status === 'blocked' ? 'Awaiting dependency completion from upstream team.' : null,
          createdAt: daysAgo(100 - portfolioTaskCounter),
          updatedAt: daysAgo(1),
          startedAt: ['in_progress', 'in_review', 'done', 'blocked', 'overdue', 'archived'].includes(status)
            ? daysAgo(95 - portfolioTaskCounter)
            : null,
          completedAt: ['done', 'archived'].includes(status)
            ? daysAgo(75 - portfolioTaskCounter)
            : null,
          dueAt: status === 'overdue'
            ? daysAgo(2 + ((i + j) % 4))
            : daysFromNow(7 + ((i + j) % 12)),
        })
        portfolioTaskCounter++
      }
    }
    const insertedPortfolioTasks = await db.insert(tasks).values(portfolioTaskRows).returning()
    portfolioSummary.tasks += insertedPortfolioTasks.length

    const productCodePrefix = (slugify(profile.name).replace(/-/g, '').slice(0, 4).toUpperCase() || `P${productIndex + 2}`)
    const portfolioReleaseRows: (typeof releases.$inferInsert)[] = [
      {
        code: `${productCodePrefix}-${productIndex + 2}01`,
        version: `${productIndex + 2}.1.0`,
        title: `${profile.name} Stability Release`,
        status: 'completed',
        releaseType: 'patch',
        plannedAt: daysAgo(44),
        startedAt: daysAgo(41),
        completedAt: daysAgo(36),
        createdByUserId: superAdmin.id,
        releaseManagerId: insertedUsers[1]!.id,
        notes: 'Hardening and quality-focused release.',
        releaseNotes: '- Regression fixes\n- Performance improvements\n- Monitoring updates',
        productId: portfolioProduct.id,
        createdAt: daysAgo(45),
        updatedAt: daysAgo(35),
      },
      {
        code: `${productCodePrefix}-${productIndex + 2}02`,
        version: `${productIndex + 2}.2.0`,
        title: `${profile.name} Growth Release`,
        status: 'in_progress',
        releaseType: 'feature',
        plannedAt: daysAgo(12),
        startedAt: daysAgo(8),
        completedAt: null,
        createdByUserId: superAdmin.id,
        releaseManagerId: insertedUsers[2]!.id,
        notes: 'Feature expansion release currently in execution.',
        releaseNotes: '- Workflow enhancements\n- New analytics touchpoints\n- UX refinements',
        productId: portfolioProduct.id,
        createdAt: daysAgo(14),
        updatedAt: daysAgo(1),
      },
    ]
    const insertedPortfolioReleases = await db.insert(releases).values(portfolioReleaseRows).returning()
    portfolioSummary.releases += insertedPortfolioReleases.length

    await db.insert(releaseDeliveries).values(
      insertedPortfolioReleases.flatMap((release, idx) =>
        portfolioDeliveries.slice(0, 2).map((delivery, order) => ({
          releaseId: release.id,
          deliveryId: delivery.id,
          deploymentOrder: order + 1,
          addedAt: daysAgo(20 - idx - order),
          addedByUserId: insertedUsers[(idx + order) % insertedUsers.length]!.id,
        })),
      ),
    )

    const portfolioDeploymentRows: (typeof releaseDeployments.$inferInsert)[] = insertedPortfolioReleases.flatMap((release, idx) => ([
      {
        releaseId: release.id,
        environment: 'stage',
        sequence: 1,
        status: idx === 0 ? 'deployed' : 'deploying',
        startedAt: daysAgo(9 - idx),
        completedAt: idx === 0 ? daysAgo(8 - idx) : null,
        failedAt: null,
        deployedByUserId: insertedUsers[(idx + 3) % insertedUsers.length]!.id,
        notes: 'Stage deployment automation pipeline run.',
      },
      {
        releaseId: release.id,
        environment: 'prod',
        sequence: 2,
        status: idx === 0 ? 'deployed' : 'pending',
        startedAt: idx === 0 ? daysAgo(7) : null,
        completedAt: idx === 0 ? daysAgo(6) : null,
        failedAt: null,
        deployedByUserId: idx === 0 ? insertedUsers[0]!.id : null,
        notes: idx === 0 ? 'Production rollout completed.' : 'Awaiting stage validation sign-off.',
      },
    ]))
    const insertedPortfolioDeployments = await db.insert(releaseDeployments).values(portfolioDeploymentRows).returning()

    const insertedPortfolioServers = await db.insert(servers).values([
      {
        name: `${profile.name} Stage Cluster`,
        environment: 'stage',
        host: `stage.${slugify(profile.name)}.internal`,
        port: 443,
        protocol: 'https',
        region: 'eu-west-1',
        provider: 'aws',
        instanceId: `${productCodePrefix}-stage-01`,
        isActive: 1,
        productId: portfolioProduct.id,
        createdAt: daysAgo(60),
        updatedAt: daysAgo(2),
      },
      {
        name: `${profile.name} Production Cluster`,
        environment: 'prod',
        host: `prod.${slugify(profile.name)}.internal`,
        port: 443,
        protocol: 'https',
        region: 'eu-west-1',
        provider: 'aws',
        instanceId: `${productCodePrefix}-prod-01`,
        isActive: 1,
        productId: portfolioProduct.id,
        createdAt: daysAgo(60),
        updatedAt: daysAgo(2),
      },
    ]).returning()

    const stageServer = insertedPortfolioServers.find((server) => server.environment === 'stage')!
    const prodServer = insertedPortfolioServers.find((server) => server.environment === 'prod')!
    const portfolioTargetRows: (typeof deploymentTargets.$inferInsert)[] = insertedPortfolioDeployments.map((deployment) => ({
      releaseDeploymentId: deployment.id,
      serverId: deployment.environment === 'stage' ? stageServer.id : prodServer.id,
      status: deployment.status === 'deployed' ? 'deployed' : deployment.status === 'deploying' ? 'deploying' : 'pending',
      deployedAt: deployment.status === 'deployed' ? daysAgo(5) : null,
      failedAt: null,
      logsUrl: `https://deployments.example.com/${deployment.id}`,
    }))
    await db.insert(deploymentTargets).values(portfolioTargetRows)

    const portfolioCycleRows: (typeof testCycles.$inferInsert)[] = insertedPortfolioReleases.map((release, idx) => ({
      title: `${profile.name} Validation Cycle ${idx + 1}`,
      description: `Regression and confidence suite for ${release.title}.`,
      status: idx === 0 ? 'completed' : 'in_progress',
      deliveryId: portfolioDeliveries[idx % portfolioDeliveries.length]!.id,
      releaseId: release.id,
      productId: portfolioProduct.id,
      startDate: dateOffsetString(-18 + idx * 8),
      endDate: dateOffsetString(-10 + idx * 8),
      createdByUserId: insertedUsers[(idx + 2) % insertedUsers.length]!.id,
      createdAt: daysAgo(18 - idx * 4),
      updatedAt: daysAgo(1),
    }))
    const insertedPortfolioCycles = await db.insert(testCycles).values(portfolioCycleRows).returning()
    portfolioSummary.testCycles += insertedPortfolioCycles.length

    const portfolioIssueRows: (typeof testCycleIssues.$inferInsert)[] = insertedPortfolioCycles.map((cycle, idx) => ({
      testCycleId: cycle.id,
      title: `${profile.name} issue follow-up ${idx + 1}`,
      description: 'Captured during seeded verification flow.',
      severity: idx % 2 === 0 ? 'major' : 'minor',
      status: idx % 2 === 0 ? 'open' : 'in_progress',
      storyId: insertedPortfolioStories[idx % insertedPortfolioStories.length]!.id,
      reportedByUserId: insertedUsers[(idx + 4) % insertedUsers.length]!.id,
      assignedToUserId: insertedUsers[(idx + 5) % insertedUsers.length]!.id,
      assignedToTeamId: idx % 2 === 0 ? teamIdAt(idx + productIndex + 1) : null,
      createdAt: daysAgo(12 - idx),
      updatedAt: daysAgo(1),
    }))
    await db.insert(testCycleIssues).values(portfolioIssueRows)

    const insertedPortfolioAssetTypes = await db.insert(assetTypes).values([
      {
        name: 'Runbook',
        slug: `${slugify(profile.name)}-runbook`,
        category: 'operations',
        icon: 'book-open',
        color: '#4857FE',
        productId: portfolioProduct.id,
        createdAt: daysAgo(90),
      },
      {
        name: 'Specification',
        slug: `${slugify(profile.name)}-specification`,
        category: 'product',
        icon: 'file-text',
        color: '#16a34a',
        productId: portfolioProduct.id,
        createdAt: daysAgo(90),
      },
    ]).returning()
    const runbookType = insertedPortfolioAssetTypes[0]!
    const specificationType = insertedPortfolioAssetTypes[1]!

    const portfolioAssetRows: (typeof assets.$inferInsert)[] = []
    for (let i = 0; i < 8; i++) {
      const type = i % 2 === 0 ? runbookType : specificationType
      const owner = insertedUsers[(i + 2) % insertedUsers.length]!
      portfolioAssetRows.push({
        productId: portfolioProduct.id,
        assetTypeId: type.id,
        title: `${profile.name} ${i % 2 === 0 ? 'Runbook' : 'Spec'} ${i + 1}`,
        slug: `${slugify(profile.name)}-${i % 2 === 0 ? 'runbook' : 'spec'}-${i + 1}`,
        description: `Seeded ${i % 2 === 0 ? 'runbook' : 'specification'} for ${profile.name}.`,
        content: `# ${profile.name} ${i % 2 === 0 ? 'Runbook' : 'Specification'} ${i + 1}\n\nOperational guidance for demo walkthroughs.`,
        status: i < 5 ? 'active' : 'draft',
        visibility: i % 3 === 0 ? 'public' : 'internal',
        ownerUserId: owner.id,
        tags: ['demo', slugify(profile.name), i % 2 === 0 ? 'operations' : 'product'],
        parentId: null,
        sortOrder: i,
        createdByUserId: insertedUsers[(i + 1) % insertedUsers.length]!.id,
        createdAt: daysAgo(88 - i * 2),
        updatedAt: daysAgo(2),
      })
    }
    const insertedPortfolioAssets = await db.insert(assets).values(portfolioAssetRows).returning()
    portfolioSummary.assets += insertedPortfolioAssets.length

    const portfolioFeatureRows: (typeof featureRequests.$inferInsert)[] = []
    for (let i = 0; i < 6; i++) {
      portfolioFeatureRows.push({
        productId: portfolioProduct.id,
        title: `${profile.name} request ${i + 1}: ${featureRequestTitles[i % featureRequestTitles.length]}`,
        description: `Portfolio feature request ${i + 1} for ${profile.name}.`,
        status: featureStatuses[(i + 1) % featureStatuses.length]!,
        category: featureCategories[(i + productIndex) % featureCategories.length]!,
        createdByUserId: insertedUsers[(i + 1) % insertedUsers.length]!.id,
        storyId: insertedPortfolioStories[i % insertedPortfolioStories.length]!.id,
        tags: ['portfolio', slugify(profile.name), `wave-${(i % 3) + 1}`],
        upvoteCount: 2 + (i % 5),
        createdAt: daysAgo(48 - i * 2),
        updatedAt: daysAgo(2),
      })
    }
    const insertedPortfolioFeatureRequests = await db.insert(featureRequests).values(portfolioFeatureRows).returning()
    portfolioSummary.featureRequests += insertedPortfolioFeatureRequests.length

    await db.insert(featureRequestComments).values(
      insertedPortfolioFeatureRequests.map((feature, idx) => ({
        featureRequestId: feature.id,
        userId: insertedUsers[(idx + 2) % insertedUsers.length]!.id,
        content: `Portfolio review note ${idx + 1} for ${feature.title}.`,
        createdAt: daysAgo(20 - idx),
        updatedAt: daysAgo(1),
      })),
    )

    const featureUpvoteRows: (typeof featureRequestUpvotes.$inferInsert)[] = []
    for (let i = 0; i < insertedPortfolioFeatureRequests.length; i++) {
      const feature = insertedPortfolioFeatureRequests[i]!
      for (let voter = 0; voter < 2; voter++) {
        featureUpvoteRows.push({
          featureRequestId: feature.id,
          userId: insertedUsers[(i + voter + 3) % insertedUsers.length]!.id,
          createdAt: daysAgo(18 - i),
        })
      }
    }
    await db.insert(featureRequestUpvotes).values(featureUpvoteRows)

    const portfolioFeedbackRows: (typeof consumerFeedbacks.$inferInsert)[] = []
    for (let i = 0; i < 6; i++) {
      const feedbackTitle = feedbackTitleCatalog[(i + productIndex) % feedbackTitleCatalog.length]!
      const reporterName = feedbackReporterNames[(i + 1) % feedbackReporterNames.length]!
      portfolioFeedbackRows.push({
        productId: portfolioProduct.id,
        title: `${profile.name}: ${feedbackTitle}`,
        description: `Seeded consumer feedback for ${profile.name}.`,
        type: feedbackTypes[(i + 1) % feedbackTypes.length]!,
        status: feedbackStatuses[(i + 1) % feedbackStatuses.length]!,
        priority: feedbackPriorities[(i + 1) % feedbackPriorities.length]!,
        reporterName,
        reporterEmail: `${slugify(reporterName).replace(/-/g, '.')}@customer.example`,
        reporterDevice: i % 2 === 0 ? 'MacBook Pro' : 'Windows Laptop',
        reporterBrowser: i % 2 === 0 ? 'Chrome' : 'Edge',
        reporterOs: i % 2 === 0 ? 'macOS' : 'Windows 11',
        appVersion: `3.${productIndex + 1}.${i}`,
        pageUrl: feedbackPages[(i + productIndex) % feedbackPages.length]!,
        stepsToReproduce: `1. Open ${profile.name}\n2. Navigate to target page\n3. Execute workflow\n4. Observe issue`,
        expectedBehavior: 'Action should complete smoothly without workflow interruption.',
        actualBehavior: 'User observes inconsistent UI response after submission.',
        storyId: insertedPortfolioStories[i % insertedPortfolioStories.length]!.id,
        assignedToUserId: insertedUsers[(i + 2) % insertedUsers.length]!.id,
        tags: ['portfolio', slugify(profile.name), `channel-${(i % 2) + 1}`],
        upvoteCount: 1 + (i % 4),
        createdAt: daysAgo(34 - i),
        updatedAt: daysAgo(1),
      })
    }
    const insertedPortfolioFeedbacks = await db.insert(consumerFeedbacks).values(portfolioFeedbackRows).returning()
    portfolioSummary.feedbacks += insertedPortfolioFeedbacks.length

    await db.insert(consumerFeedbackComments).values(
      insertedPortfolioFeedbacks.map((feedback, idx) => ({
        feedbackId: feedback.id,
        userId: insertedUsers[(idx + 3) % insertedUsers.length]!.id,
        content: `Portfolio triage comment ${idx + 1}.`,
        isInternal: idx % 2 === 0 ? 1 : 0,
        createdAt: daysAgo(11 - idx),
      })),
    )

    await db.insert(activities).values([
      ...insertedPortfolioStories.slice(0, 6).map((story, idx) => ({
        productId: portfolioProduct.id,
        userId: insertedUsers[(idx + 1) % insertedUsers.length]!.id,
        userName: insertedUsers[(idx + 1) % insertedUsers.length]!.name,
        userAvatar: insertedUsers[(idx + 1) % insertedUsers.length]!.avatar,
        action: 'created',
        entityType: 'story',
        entityId: story.id,
        entityTitle: story.title,
        changes: null,
        createdAt: daysAgo(30 - idx),
      })),
      ...insertedPortfolioTasks.slice(0, 8).map((task, idx) => ({
        productId: portfolioProduct.id,
        userId: insertedUsers[(idx + 2) % insertedUsers.length]!.id,
        userName: insertedUsers[(idx + 2) % insertedUsers.length]!.name,
        userAvatar: insertedUsers[(idx + 2) % insertedUsers.length]!.avatar,
        action: idx % 2 === 0 ? 'updated' : 'created',
        entityType: 'task',
        entityId: task.id,
        entityTitle: task.title,
        changes: idx % 2 === 0 ? [{ field: 'status', from: 'assigned', to: task.status }] : null,
        createdAt: daysAgo(24 - idx),
      })),
      ...insertedPortfolioReleases.map((release, idx) => ({
        productId: portfolioProduct.id,
        userId: insertedUsers[(idx + 3) % insertedUsers.length]!.id,
        userName: insertedUsers[(idx + 3) % insertedUsers.length]!.name,
        userAvatar: insertedUsers[(idx + 3) % insertedUsers.length]!.avatar,
        action: 'created',
        entityType: 'release',
        entityId: release.id,
        entityTitle: release.title,
        changes: null,
        createdAt: daysAgo(10 - idx),
      })),
    ])
  }

  const totalProducts = 1 + portfolioSummary.products
  const totalInitiatives = insertedInitiatives.length + portfolioSummary.initiatives
  const totalStories = insertedStories.length + portfolioSummary.stories
  const totalTasks = insertedTasks.length + portfolioSummary.tasks
  const totalDeliveries = insertedDeliveries.length + portfolioSummary.deliveries
  const totalReleases = insertedReleases.length + portfolioSummary.releases
  const totalCycles = insertedCycles.length + portfolioSummary.testCycles
  const totalAssets = insertedAssets.length + portfolioSummary.assets
  const totalFeatureRequests = insertedFeatureRequests.length + portfolioSummary.featureRequests
  const totalFeedbacks = insertedFeedbacks.length + portfolioSummary.feedbacks

  console.log('\nDemo seed complete for one organization.')
  console.log(`Organization: ${demoOrganization.name}`)
  console.log(`Products: ${totalProducts} (${config.products.map((product) => product.name).join(', ')})`)
  console.log(`Users: ${insertedUsers.length}`)
  console.log(`Organization teams: ${insertedOrganizationTeams.length}`)
  console.log(`Initiatives: ${totalInitiatives}`)
  console.log(`Stories: ${totalStories}`)
  console.log(`Tasks: ${totalTasks}`)
  console.log(`Deliveries: ${totalDeliveries}`)
  console.log(`Releases: ${totalReleases}`)
  console.log(`Test cycles: ${totalCycles}`)
  console.log(`Wiki assets: ${totalAssets}`)
  console.log(`Feature requests: ${totalFeatureRequests}`)
  console.log(`Consumer feedback entries: ${totalFeedbacks}`)
  console.log('Login password for all seeded users comes from SEED_DEMO_PASSWORD.')
}

async function main() {
  await runFullDemoSeed()
}

async function resolveFullSeedConfig(args = parseSeedArgs()): Promise<FullSeedConfig> {
  const demoPassword = resolveRequiredSeedPassword()
  const loadedProfile = await loadSeedProfilePack({
    defaultPath: DEFAULT_FULL_PROFILE_PATH,
    args,
    envNames: ['SEED_FULL_PACK_PATH', 'SEED_PROFILE_PATH'],
    requiredSections: ['users'],
  })

  const profileProducts = loadedProfile.profile.products?.length
    ? loadedProfile.profile.products
    : (loadedProfile.profile.product ? [loadedProfile.profile.product] : [])
  const users = loadedProfile.profile.users
  if (profileProducts.length === 0) {
    throw new Error('Full seed profile is missing "product" or "products".')
  }
  if (!users || users.length === 0) throw new Error('Full seed profile must contain at least one user.')

  return {
    demoPassword,
    product: profileProducts[0]!,
    products: profileProducts,
    users,
    profilePath: loadedProfile.resolvedPath,
    profileSource: loadedProfile.source,
  }
}

export async function runFullDemoSeed(args = parseSeedArgs()) {
  const config = await resolveFullSeedConfig(args)
  console.log('Seeding one full demo organization...')
  console.log(`Primary product: ${config.product.name}`)
  console.log(`Portfolio products: ${config.products.map((product) => product.name).join(', ')}`)
  console.log(`Loaded profile (${config.profileSource}): ${config.profilePath}`)
  await assertFullSeedSchemaCompatibility()
  await resetDemoSeedScope(config)
  await seedEverything(config)
}

if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Full demo seed failed:', error)
      process.exit(1)
    })
}
