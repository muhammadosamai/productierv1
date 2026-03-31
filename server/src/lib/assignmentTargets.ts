import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { organizationMembers, organizationTeamMembers, organizationTeams, products, users } from '../db/schema'

function uniqueNonEmpty(values: Array<string | null | undefined> | null | undefined): string[] {
  const normalized = (values || [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0)
  return [...new Set(normalized)]
}

export function normalizeAssignmentIds(values: Array<string | null | undefined> | null | undefined): string[] {
  return uniqueNonEmpty(values)
}

export async function resolveProductOrganizationId(productId: string): Promise<string | null> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { organizationId: true },
  })
  return product?.organizationId || null
}

export async function resolveUserTeamIdsForProduct(productId: string, userId: string): Promise<string[]> {
  const organizationId = await resolveProductOrganizationId(productId)
  if (!organizationId) return []

  const rows = await db
    .select({
      teamId: organizationTeamMembers.organizationTeamId,
    })
    .from(organizationTeamMembers)
    .innerJoin(
      organizationTeams,
      and(
        eq(organizationTeamMembers.organizationTeamId, organizationTeams.id),
        eq(organizationTeams.organizationId, organizationId),
      ),
    )
    .where(eq(organizationTeamMembers.userId, userId))

  return [...new Set(rows.map((row) => row.teamId))]
}

async function allUsersExist(userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return true
  const rows = await db.query.users.findMany({
    where: inArray(users.id, userIds),
    columns: { id: true },
  })
  return rows.length === userIds.length
}

async function allUsersAreOrganizationMembers(organizationId: string, userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return true
  const rows = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      inArray(organizationMembers.userId, userIds),
    ),
    columns: { userId: true },
  })
  return rows.length === userIds.length
}

async function allTeamsBelongToOrganization(organizationId: string, teamIds: string[]): Promise<boolean> {
  if (teamIds.length === 0) return true
  const rows = await db.query.organizationTeams.findMany({
    where: and(
      eq(organizationTeams.organizationId, organizationId),
      inArray(organizationTeams.id, teamIds),
    ),
    columns: { id: true },
  })
  return rows.length === teamIds.length
}

export async function validateDualAssignmentTargets(input: {
  organizationId: string | null
  userIds?: Array<string | null | undefined> | null
  teamIds?: Array<string | null | undefined> | null
}): Promise<{
  ok: boolean
  status?: number
  error?: string
  normalizedUserIds: string[]
  normalizedTeamIds: string[]
}> {
  const normalizedUserIds = uniqueNonEmpty(input.userIds)
  const normalizedTeamIds = uniqueNonEmpty(input.teamIds)

  if (input.organizationId) {
    const usersOk = await allUsersAreOrganizationMembers(input.organizationId, normalizedUserIds)
    if (!usersOk) {
      return {
        ok: false,
        status: 400,
        error: 'Assigned users must be organization members',
        normalizedUserIds,
        normalizedTeamIds,
      }
    }
  } else {
    const usersOk = await allUsersExist(normalizedUserIds)
    if (!usersOk) {
      return {
        ok: false,
        status: 400,
        error: 'Assigned users are invalid',
        normalizedUserIds,
        normalizedTeamIds,
      }
    }
  }

  if (normalizedTeamIds.length > 0 && !input.organizationId) {
    return {
      ok: false,
      status: 400,
      error: 'Team assignments require an organization-scoped product',
      normalizedUserIds,
      normalizedTeamIds,
    }
  }

  if (input.organizationId) {
    const teamsOk = await allTeamsBelongToOrganization(input.organizationId, normalizedTeamIds)
    if (!teamsOk) {
      return {
        ok: false,
        status: 400,
        error: 'Assigned teams must belong to the same organization',
        normalizedUserIds,
        normalizedTeamIds,
      }
    }
  }

  return {
    ok: true,
    normalizedUserIds,
    normalizedTeamIds,
  }
}

