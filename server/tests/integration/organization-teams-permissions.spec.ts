import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { db } from '../../src/db'
import { organizationMembers, organizations } from '../../src/db/schema'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

type OrganizationMemberRole = 'owner' | 'admin' | 'member' | 'viewer'

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function createOrganizationWithMembers(
  ownerUserId: string,
  memberships: Array<{ userId: string; role: OrganizationMemberRole }>,
) {
  const runId = randomUUID().slice(0, 8)
  const [organization] = await db.insert(organizations).values({
    name: `Teams Spec Org ${runId}`,
    slug: `teams-spec-org-${runId}-${Date.now().toString(36)}`,
    createdByUserId: ownerUserId,
  }).returning({ id: organizations.id })

  await db.insert(organizationMembers).values(
    memberships.map((membership) => ({
      organizationId: organization.id,
      userId: membership.userId,
      role: membership.role,
    })),
  ).onConflictDoNothing()

  return organization.id
}

describe('organization teams permissions and multi-lead behavior', () => {
  it('allows owner/admin and team lead (own team) mutations', async () => {
    const app = await createTestApp()
    const { token: ownerToken, user: ownerUser } = await registerAndLogin(app, 'admin')
    const { token: leadToken, user: leadUser } = await registerAndLogin(app, 'developer')
    const { user: memberUser } = await registerAndLogin(app, 'developer')
    const { user: extraUser } = await registerAndLogin(app, 'developer')

    const organizationId = await createOrganizationWithMembers(ownerUser.id, [
      { userId: ownerUser.id, role: 'owner' },
      { userId: leadUser.id, role: 'member' },
      { userId: memberUser.id, role: 'member' },
      { userId: extraUser.id, role: 'member' },
    ])

    const createTeamRes = await apiRequest(app, `/api/organizations/${encodeURIComponent(organizationId)}/teams`, {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `Lead Scoped Team ${Date.now()}`,
        key: `lead-scoped-${Date.now().toString(36)}`,
        description: 'Team for scoped lead mutation tests',
        leadUserIds: [leadUser.id],
        memberUserIds: [memberUser.id],
      },
    })
    expect(createTeamRes.status).toBe(200)

    const teamId = String(createTeamRes.body?.id || '')
    expect(teamId).not.toBe('')
    expect(Array.isArray(createTeamRes.body?.leadUserIds)).toBe(true)
    expect(createTeamRes.body?.leadUserIds).toContain(leadUser.id)

    const leadPatchRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}`,
      {
        method: 'PATCH',
        token: leadToken,
        body: {
          description: 'Updated by team lead',
        },
      },
    )
    expect(leadPatchRes.status).toBe(200)
    expect(String(leadPatchRes.body?.description || '')).toBe('Updated by team lead')

    const leadAddMemberRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members`,
      {
        method: 'POST',
        token: leadToken,
        body: {
          userId: extraUser.id,
          role: 'member',
        },
      },
    )
    expect(leadAddMemberRes.status).toBe(200)
    expect(String(leadAddMemberRes.body?.userId || '')).toBe(extraUser.id)
  })

  it('blocks team leads from mutating teams they do not lead and from team create/delete', async () => {
    const app = await createTestApp()
    const { token: ownerToken, user: ownerUser } = await registerAndLogin(app, 'admin')
    const { token: leadToken, user: leadUser } = await registerAndLogin(app, 'developer')
    const { user: otherLeadUser } = await registerAndLogin(app, 'developer')

    const organizationId = await createOrganizationWithMembers(ownerUser.id, [
      { userId: ownerUser.id, role: 'owner' },
      { userId: leadUser.id, role: 'member' },
      { userId: otherLeadUser.id, role: 'member' },
    ])

    const ownTeamRes = await apiRequest(app, `/api/organizations/${encodeURIComponent(organizationId)}/teams`, {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `Own Team ${Date.now()}`,
        key: `own-${Date.now().toString(36)}`,
        leadUserIds: [leadUser.id],
      },
    })
    expect(ownTeamRes.status).toBe(200)
    const ownTeamId = String(ownTeamRes.body?.id || '')
    expect(ownTeamId).not.toBe('')

    const otherTeamRes = await apiRequest(app, `/api/organizations/${encodeURIComponent(organizationId)}/teams`, {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `Other Team ${Date.now()}`,
        key: `other-${Date.now().toString(36)}`,
        leadUserIds: [otherLeadUser.id],
      },
    })
    expect(otherTeamRes.status).toBe(200)
    const otherTeamId = String(otherTeamRes.body?.id || '')
    expect(otherTeamId).not.toBe('')

    const leadPatchOtherRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(otherTeamId)}`,
      {
        method: 'PATCH',
        token: leadToken,
        body: {
          description: 'Should fail',
        },
      },
    )
    expect(leadPatchOtherRes.status).toBe(403)

    const leadAddOtherMemberRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(otherTeamId)}/members`,
      {
        method: 'POST',
        token: leadToken,
        body: {
          userId: leadUser.id,
          role: 'member',
        },
      },
    )
    expect(leadAddOtherMemberRes.status).toBe(403)

    const leadCreateTeamRes = await apiRequest(app, `/api/organizations/${encodeURIComponent(organizationId)}/teams`, {
      method: 'POST',
      token: leadToken,
      body: {
        name: `Lead Create Attempt ${Date.now()}`,
      },
    })
    expect(leadCreateTeamRes.status).toBe(403)

    const leadDeleteOwnTeamRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(ownTeamId)}`,
      {
        method: 'DELETE',
        token: leadToken,
      },
    )
    expect(leadDeleteOwnTeamRes.status).toBe(403)
  })

  it('persists true multi-lead assignments without demoting existing leads', async () => {
    const app = await createTestApp()
    const { token: ownerToken, user: ownerUser } = await registerAndLogin(app, 'admin')
    const { user: leadAUser } = await registerAndLogin(app, 'developer')
    const { user: leadBUser } = await registerAndLogin(app, 'developer')
    const { user: leadCUser } = await registerAndLogin(app, 'developer')

    const organizationId = await createOrganizationWithMembers(ownerUser.id, [
      { userId: ownerUser.id, role: 'owner' },
      { userId: leadAUser.id, role: 'member' },
      { userId: leadBUser.id, role: 'member' },
      { userId: leadCUser.id, role: 'member' },
    ])

    const createTeamRes = await apiRequest(app, `/api/organizations/${encodeURIComponent(organizationId)}/teams`, {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `Multi Lead Team ${Date.now()}`,
        key: `multi-lead-${Date.now().toString(36)}`,
        leadUserIds: [leadAUser.id, leadBUser.id],
      },
    })
    expect(createTeamRes.status).toBe(200)
    const teamId = String(createTeamRes.body?.id || '')
    expect(teamId).not.toBe('')
    expect(Array.isArray(createTeamRes.body?.leadUserIds)).toBe(true)
    expect(createTeamRes.body?.leadUserIds).toEqual(expect.arrayContaining([leadAUser.id, leadBUser.id]))

    const listInitialRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams?includeMembers=1`,
      {
        method: 'GET',
        token: ownerToken,
      },
    )
    expect(listInitialRes.status).toBe(200)
    const listInitialBody = asRecordArray(listInitialRes.body)
    const initialTeam = listInitialBody.find((row) => asString(row.id) === teamId)
    expect(initialTeam).toBeTruthy()
    if (!initialTeam) {
      throw new Error('Expected created team to be present in list response')
    }
    expect(initialTeam.leadUserIds).toEqual(expect.arrayContaining([leadAUser.id, leadBUser.id]))
    const initialMembers = asRecordArray(initialTeam.members)
    expect(initialMembers.filter((member) => asString(member.role) === 'lead')).toHaveLength(2)

    const replaceLeadsRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/lead`,
      {
        method: 'PUT',
        token: ownerToken,
        body: {
          userIds: [leadAUser.id, leadCUser.id],
        },
      },
    )
    expect(replaceLeadsRes.status).toBe(200)
    expect(replaceLeadsRes.body?.leadUserIds).toEqual(expect.arrayContaining([leadAUser.id, leadCUser.id]))

    const appendLeadRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members`,
      {
        method: 'POST',
        token: ownerToken,
        body: {
          userId: leadBUser.id,
          role: 'lead',
        },
      },
    )
    expect(appendLeadRes.status).toBe(200)

    const membersAfterAppendRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members`,
      {
        method: 'GET',
        token: ownerToken,
      },
    )
    expect(membersAfterAppendRes.status).toBe(200)
    const membersAfterAppend = asRecordArray(membersAfterAppendRes.body)
    const leadIdsAfterAppend = membersAfterAppend
      .filter((row) => asString(row.role) === 'lead')
      .map((row) => asString(row.userId))
    expect(leadIdsAfterAppend).toEqual(expect.arrayContaining([leadAUser.id, leadBUser.id, leadCUser.id]))

    const demoteLeadRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members`,
      {
        method: 'POST',
        token: ownerToken,
        body: {
          userId: leadAUser.id,
          role: 'member',
        },
      },
    )
    expect(demoteLeadRes.status).toBe(200)

    const membersAfterDemoteRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members`,
      {
        method: 'GET',
        token: ownerToken,
      },
    )
    expect(membersAfterDemoteRes.status).toBe(200)
    const membersAfterDemote = asRecordArray(membersAfterDemoteRes.body)
    const leadIdsAfterDemote = membersAfterDemote
      .filter((row) => asString(row.role) === 'lead')
      .map((row) => asString(row.userId))
    expect(leadIdsAfterDemote).toEqual(expect.arrayContaining([leadBUser.id, leadCUser.id]))
    expect(leadIdsAfterDemote.includes(leadAUser.id)).toBe(false)
  })
})
