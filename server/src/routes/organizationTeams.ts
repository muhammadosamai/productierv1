import { Elysia, t } from 'elysia'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  organizationMemberReports,
  organizationMembers,
  organizationTeamMembers,
  organizationTeams,
  users,
} from '../db/schema'
import { logActivity } from '../lib/logActivity'
import { requireOrganizationAccess } from '../lib/authz'
import { authPlugin } from '../plugins/auth'

const ORGANIZATION_MANAGER_ROLES = ['owner', 'admin'] as const

function normalizeTeamKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'team'
}

function sanitizeTeamMemberRole(value: string | null | undefined): 'member' | 'lead' {
  return value === 'lead' ? 'lead' : 'member'
}

function sanitizeUserIdList(values: Array<string | null | undefined> | null | undefined): string[] {
  if (!values || values.length === 0) return []
  const unique = new Set<string>()
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized) continue
    unique.add(normalized)
  }
  return Array.from(unique)
}

function isOrganizationManagerRole(role: string | null | undefined): boolean {
  if (!role) return false
  return ORGANIZATION_MANAGER_ROLES.includes(role.toLowerCase() as (typeof ORGANIZATION_MANAGER_ROLES)[number])
}

async function organizationHasMembers(organizationId: string, userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return true
  const rows = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      inArray(organizationMembers.userId, userIds),
    ),
    columns: { userId: true },
  })
  return rows.length === new Set(userIds).size
}

async function ensureTeamBelongsToOrganization(teamId: string, organizationId: string) {
  return db.query.organizationTeams.findFirst({
    where: and(
      eq(organizationTeams.id, teamId),
      eq(organizationTeams.organizationId, organizationId),
    ),
  })
}

async function isTeamLead(teamId: string, userId: string): Promise<boolean> {
  const match = await db.query.organizationTeamMembers.findFirst({
    where: and(
      eq(organizationTeamMembers.organizationTeamId, teamId),
      eq(organizationTeamMembers.userId, userId),
      eq(organizationTeamMembers.role, 'lead'),
    ),
    columns: { id: true },
  })
  return Boolean(match?.id)
}

async function listTeamLeadUserIds(teamId: string): Promise<string[]> {
  const leads = await db.query.organizationTeamMembers.findMany({
    where: and(
      eq(organizationTeamMembers.organizationTeamId, teamId),
      eq(organizationTeamMembers.role, 'lead'),
    ),
    columns: { userId: true },
    orderBy: (table, order) => [order.asc(table.createdAt), order.asc(table.userId)],
  })
  return leads.map((lead) => lead.userId)
}

async function listLeadUserIdsByTeam(teamIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (teamIds.length === 0) return map

  const leadRows = await db
    .select({
      organizationTeamId: organizationTeamMembers.organizationTeamId,
      userId: organizationTeamMembers.userId,
    })
    .from(organizationTeamMembers)
    .where(and(
      inArray(organizationTeamMembers.organizationTeamId, teamIds),
      eq(organizationTeamMembers.role, 'lead'),
    ))
    .orderBy(asc(organizationTeamMembers.organizationTeamId), asc(organizationTeamMembers.createdAt), asc(organizationTeamMembers.userId))

  for (const row of leadRows) {
    const current = map.get(row.organizationTeamId) || []
    current.push(row.userId)
    map.set(row.organizationTeamId, current)
  }
  return map
}

async function syncLegacyLeadUserId(teamId: string): Promise<string[]> {
  const leadUserIds = await listTeamLeadUserIds(teamId)
  await db.update(organizationTeams)
    .set({
      leadUserId: leadUserIds[0] || null,
      updatedAt: new Date(),
    })
    .where(eq(organizationTeams.id, teamId))
  return leadUserIds
}

async function replaceTeamLeads(teamId: string, leadUserIds: string[], actorUserId: string): Promise<string[]> {
  const normalizedLeadUserIds = sanitizeUserIdList(leadUserIds)

  await db.update(organizationTeamMembers)
    .set({ role: 'member', updatedAt: new Date() })
    .where(and(
      eq(organizationTeamMembers.organizationTeamId, teamId),
      eq(organizationTeamMembers.role, 'lead'),
    ))

  for (const userId of normalizedLeadUserIds) {
    await db.insert(organizationTeamMembers).values({
      organizationTeamId: teamId,
      userId,
      role: 'lead',
      addedByUserId: actorUserId,
    }).onConflictDoUpdate({
      target: [organizationTeamMembers.organizationTeamId, organizationTeamMembers.userId],
      set: {
        role: 'lead',
        addedByUserId: actorUserId,
        updatedAt: new Date(),
      },
    })
  }

  await db.update(organizationTeams)
    .set({
      leadUserId: normalizedLeadUserIds[0] || null,
      updatedAt: new Date(),
    })
    .where(eq(organizationTeams.id, teamId))

  return normalizedLeadUserIds
}

async function canManageTeam(access: { user: { id: string }; memberRole: string | null }, teamId: string): Promise<boolean> {
  if (isOrganizationManagerRole(access.memberRole)) return true
  return isTeamLead(teamId, access.user.id)
}

export const organizationTeamRoutes = new Elysia({ prefix: '/api/organizations' })
  .use(authPlugin)

  // GET /api/organizations/:organizationId/teams
  .get('/:organizationId/teams', async ({ params, query, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const teams = await db.query.organizationTeams.findMany({
      where: eq(organizationTeams.organizationId, params.organizationId),
      orderBy: (table, { asc }) => [asc(table.name)],
    })

    const teamIds = teams.map((team) => team.id)
    const includeMembers = query.includeMembers === '1' || query.includeMembers === 'true'
    const leadUserIdsByTeam = await listLeadUserIdsByTeam(teamIds)

    if (!includeMembers || teams.length === 0) {
      return teams.map((team) => ({
        ...team,
        leadUserIds: leadUserIdsByTeam.get(team.id) || (team.leadUserId ? [team.leadUserId] : []),
      }))
    }

    const members = await db
      .select({
        id: organizationTeamMembers.id,
        organizationTeamId: organizationTeamMembers.organizationTeamId,
        role: organizationTeamMembers.role,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatar,
      })
      .from(organizationTeamMembers)
      .innerJoin(users, eq(organizationTeamMembers.userId, users.id))
      .where(inArray(organizationTeamMembers.organizationTeamId, teamIds))
      .orderBy(asc(users.name))

    const membersByTeam = new Map<string, typeof members>()
    for (const member of members) {
      const current = membersByTeam.get(member.organizationTeamId) || []
      current.push(member)
      membersByTeam.set(member.organizationTeamId, current)
    }

    return teams.map((team) => ({
      ...team,
      leadUserIds: leadUserIdsByTeam.get(team.id) || (team.leadUserId ? [team.leadUserId] : []),
      members: membersByTeam.get(team.id) || [],
    }))
  }, {
    query: t.Object({
      includeMembers: t.Optional(t.String()),
    }),
  })

  // POST /api/organizations/:organizationId/teams
  .post('/:organizationId/teams', async ({ params, body, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
      [...ORGANIZATION_MANAGER_ROLES],
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const requestedKey = body.key?.trim() || normalizeTeamKey(body.name)
    const requestedLeadUserIds = sanitizeUserIdList([
      ...(Array.isArray(body.leadUserIds) ? body.leadUserIds : []),
      body.leadUserId,
    ])
    const requestedMembers = sanitizeUserIdList(body.memberUserIds || [])
    const usersToValidate = sanitizeUserIdList([...requestedMembers, ...requestedLeadUserIds])
    const allAreMembers = await organizationHasMembers(params.organizationId, usersToValidate)
    if (!allAreMembers) {
      set.status = 400
      return { error: 'All team users must belong to the organization' }
    }

    try {
      const [created] = await db.insert(organizationTeams).values({
        organizationId: params.organizationId,
        name: body.name.trim(),
        key: requestedKey,
        description: body.description || null,
        leadUserId: requestedLeadUserIds[0] || null,
        createdByUserId: access.user.id,
      }).returning()

      const membersToInsert = new Set<string>(requestedMembers)
      for (const leadUserId of requestedLeadUserIds) membersToInsert.add(leadUserId)

      for (const userId of membersToInsert) {
        await db.insert(organizationTeamMembers).values({
          organizationTeamId: created!.id,
          userId,
          role: requestedLeadUserIds.includes(userId) ? 'lead' : 'member',
          addedByUserId: access.user.id,
        }).onConflictDoNothing()
      }

      logActivity({
        userName: access.user.name,
        userAvatar: access.user.avatar,
        userId: access.user.id,
        action: 'created',
        entityType: 'organization',
        entityId: created!.id,
        entityTitle: created!.name,
        routePathOverride: '/team',
      })

      return {
        ...created,
        leadUserIds: requestedLeadUserIds,
      }
    } catch (error: any) {
      if (error?.code === '23505') {
        set.status = 409
        return { error: 'Team name or key already exists in this organization' }
      }
      throw error
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 2, maxLength: 160 }),
      key: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      description: t.Optional(t.Nullable(t.String())),
      leadUserId: t.Optional(t.Nullable(t.String())),
      leadUserIds: t.Optional(t.Array(t.String())),
      memberUserIds: t.Optional(t.Array(t.String())),
    }),
  })

  // PATCH /api/organizations/:organizationId/teams/:teamId
  .patch('/:organizationId/teams/:teamId', async ({ params, body, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const existing = await ensureTeamBelongsToOrganization(params.teamId, params.organizationId)
    if (!existing) {
      set.status = 404
      return { error: 'Team not found' }
    }

    const hasManageAccess = await canManageTeam(access, existing.id)
    if (!hasManageAccess) {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const hasLeadOverride = body.leadUserIds !== undefined || body.leadUserId !== undefined
    let nextLeadUserIds: string[] = []
    if (hasLeadOverride) {
      nextLeadUserIds = sanitizeUserIdList([
        ...(Array.isArray(body.leadUserIds) ? body.leadUserIds : []),
        body.leadUserId,
      ])
      const validLeads = await organizationHasMembers(params.organizationId, nextLeadUserIds)
      if (!validLeads) {
        set.status = 400
        return { error: 'Lead users must be organization members' }
      }
      await replaceTeamLeads(existing.id, nextLeadUserIds, access.user.id)
    }

    const [updated] = await db.update(organizationTeams)
      .set({
        name: body.name?.trim() || existing.name,
        key: body.key?.trim() || existing.key,
        description: body.description !== undefined ? body.description : existing.description,
        leadUserId: hasLeadOverride ? (nextLeadUserIds[0] || null) : existing.leadUserId,
        updatedAt: new Date(),
      })
      .where(eq(organizationTeams.id, existing.id))
      .returning()

    const leadUserIds = hasLeadOverride ? nextLeadUserIds : await listTeamLeadUserIds(existing.id)
    return {
      ...updated,
      leadUserIds,
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 2, maxLength: 160 })),
      key: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      description: t.Optional(t.Nullable(t.String())),
      leadUserId: t.Optional(t.Nullable(t.String())),
      leadUserIds: t.Optional(t.Array(t.String())),
    }),
  })

  // DELETE /api/organizations/:organizationId/teams/:teamId
  .delete('/:organizationId/teams/:teamId', async ({ params, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
      [...ORGANIZATION_MANAGER_ROLES],
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const existing = await ensureTeamBelongsToOrganization(params.teamId, params.organizationId)
    if (!existing) {
      set.status = 404
      return { error: 'Team not found' }
    }

    await db.delete(organizationTeams).where(eq(organizationTeams.id, existing.id))
    return { success: true }
  })

  // GET /api/organizations/:organizationId/teams/:teamId/members
  .get('/:organizationId/teams/:teamId/members', async ({ params, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(jwt.verify, headers, set, params.organizationId)
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const team = await ensureTeamBelongsToOrganization(params.teamId, params.organizationId)
    if (!team) {
      set.status = 404
      return { error: 'Team not found' }
    }

    const members = await db
      .select({
        id: organizationTeamMembers.id,
        organizationTeamId: organizationTeamMembers.organizationTeamId,
        role: organizationTeamMembers.role,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatar,
      })
      .from(organizationTeamMembers)
      .innerJoin(users, eq(organizationTeamMembers.userId, users.id))
      .where(eq(organizationTeamMembers.organizationTeamId, team.id))

    return members
  })

  // POST /api/organizations/:organizationId/teams/:teamId/members
  .post('/:organizationId/teams/:teamId/members', async ({ params, body, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const team = await ensureTeamBelongsToOrganization(params.teamId, params.organizationId)
    if (!team) {
      set.status = 404
      return { error: 'Team not found' }
    }

    const hasManageAccess = await canManageTeam(access, team.id)
    if (!hasManageAccess) {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const validMember = await organizationHasMembers(params.organizationId, [body.userId])
    if (!validMember) {
      set.status = 400
      return { error: 'User must be an organization member' }
    }

    const role = sanitizeTeamMemberRole(body.role)
    const [membership] = await db.insert(organizationTeamMembers).values({
      organizationTeamId: team.id,
      userId: body.userId,
      role,
      addedByUserId: access.user.id,
    }).onConflictDoUpdate({
      target: [organizationTeamMembers.organizationTeamId, organizationTeamMembers.userId],
      set: {
        role,
        addedByUserId: access.user.id,
        updatedAt: new Date(),
      },
    }).returning()

    await syncLegacyLeadUserId(team.id)

    return membership
  }, {
    body: t.Object({
      userId: t.String({ minLength: 1 }),
      role: t.Optional(t.String()),
    }),
  })

  // DELETE /api/organizations/:organizationId/teams/:teamId/members/:userId
  .delete('/:organizationId/teams/:teamId/members/:userId', async ({ params, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const team = await ensureTeamBelongsToOrganization(params.teamId, params.organizationId)
    if (!team) {
      set.status = 404
      return { error: 'Team not found' }
    }

    const hasManageAccess = await canManageTeam(access, team.id)
    if (!hasManageAccess) {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const [deleted] = await db.delete(organizationTeamMembers)
      .where(and(
        eq(organizationTeamMembers.organizationTeamId, team.id),
        eq(organizationTeamMembers.userId, params.userId),
      ))
      .returning()
    if (!deleted) {
      set.status = 404
      return { error: 'Team membership not found' }
    }

    await syncLegacyLeadUserId(team.id)

    return { success: true }
  })

  // PUT /api/organizations/:organizationId/teams/:teamId/lead
  .put('/:organizationId/teams/:teamId/lead', async ({ params, body, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const team = await ensureTeamBelongsToOrganization(params.teamId, params.organizationId)
    if (!team) {
      set.status = 404
      return { error: 'Team not found' }
    }

    const hasManageAccess = await canManageTeam(access, team.id)
    if (!hasManageAccess) {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const nextLeadUserIds = sanitizeUserIdList([
      ...(Array.isArray(body.userIds) ? body.userIds : []),
      body.userId,
    ])

    const validLeads = await organizationHasMembers(params.organizationId, nextLeadUserIds)
    if (!validLeads) {
      set.status = 400
      return { error: 'Lead users must be organization members' }
    }

    await replaceTeamLeads(team.id, nextLeadUserIds, access.user.id)

    const updated = await ensureTeamBelongsToOrganization(team.id, params.organizationId)
    if (!updated) {
      set.status = 404
      return { error: 'Team not found' }
    }

    return {
      ...updated,
      leadUserIds: nextLeadUserIds,
    }
  }, {
    body: t.Object({
      userId: t.Optional(t.Nullable(t.String())),
      userIds: t.Optional(t.Array(t.String())),
    }),
  })

  // GET /api/organizations/:organizationId/member-reports
  .get('/:organizationId/member-reports', async ({ params, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(jwt.verify, headers, set, params.organizationId)
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const rows = await db
      .select({
        id: organizationMemberReports.id,
        organizationId: organizationMemberReports.organizationId,
        memberUserId: organizationMemberReports.memberUserId,
        managerUserId: organizationMemberReports.managerUserId,
      })
      .from(organizationMemberReports)
      .where(eq(organizationMemberReports.organizationId, params.organizationId))

    return rows
  })

  // PUT /api/organizations/:organizationId/member-reports/:memberUserId
  .put('/:organizationId/member-reports/:memberUserId', async ({ params, body, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
      [...ORGANIZATION_MANAGER_ROLES],
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    if (body.managerUserId && body.managerUserId === params.memberUserId) {
      set.status = 400
      return { error: 'A member cannot report to themselves' }
    }

    const usersToValidate = body.managerUserId
      ? [params.memberUserId, body.managerUserId]
      : [params.memberUserId]
    const allAreMembers = await organizationHasMembers(params.organizationId, usersToValidate)
    if (!allAreMembers) {
      set.status = 400
      return { error: 'Reporting graph users must belong to the organization' }
    }

    const [upserted] = await db.insert(organizationMemberReports).values({
      organizationId: params.organizationId,
      memberUserId: params.memberUserId,
      managerUserId: body.managerUserId || null,
      setByUserId: access.user.id,
    }).onConflictDoUpdate({
      target: [organizationMemberReports.organizationId, organizationMemberReports.memberUserId],
      set: {
        managerUserId: body.managerUserId || null,
        setByUserId: access.user.id,
        updatedAt: new Date(),
      },
    }).returning()

    return upserted
  }, {
    body: t.Object({
      managerUserId: t.Optional(t.Nullable(t.String())),
    }),
  })
