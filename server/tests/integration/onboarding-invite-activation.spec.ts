import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../../src/db'
import {
  organizationInvites,
  organizationMembers,
  organizationTeamMembers,
  productMembers,
  titles,
  userTitles,
} from '../../src/db/schema'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

function parseInviteToken(inviteLink: string): string {
  try {
    const parsed = new URL(inviteLink, 'http://localhost')
    return parsed.searchParams.get('token') || ''
  } catch {
    return ''
  }
}

describe('onboarding invite activation', () => {
  it('activates invite tokens, sets password, and applies optional assignments', async () => {
    const app = await createTestApp()
    const inviter = await registerAndLogin(app, 'super_admin')

    const orgResponse = await apiRequest(app, '/api/onboarding/organization', {
      method: 'POST',
      token: inviter.token,
      body: { name: `Invite Activation Org ${Date.now()}` },
    })
    expect(orgResponse.status).toBe(200)
    const organizationId = String(orgResponse.body?.organization?.id || '')
    expect(organizationId).not.toBe('')

    const workspaceResponse = await apiRequest(app, '/api/onboarding/workspace', {
      method: 'POST',
      token: inviter.token,
      body: {
        organizationId,
        name: `Invite Activation Workspace ${Date.now()}`,
      },
    })
    expect(workspaceResponse.status).toBe(200)
    const workspaceProductId = String(workspaceResponse.body?.product?.id || '')
    expect(workspaceProductId).not.toBe('')

    const teamResponse = await apiRequest(app, `/api/organizations/${encodeURIComponent(organizationId)}/teams`, {
      method: 'POST',
      token: inviter.token,
      body: {
        name: `Invite Activation Team ${Date.now()}`,
      },
    })
    expect(teamResponse.status).toBe(200)
    const organizationTeamId = String(teamResponse.body?.id || '')
    expect(organizationTeamId).not.toBe('')

    const [createdTitle] = await db.insert(titles).values({
      key: `invite_activation_title_${Date.now()}`,
      name: `Invite Activation Title ${Date.now()}`,
      description: 'Integration test title for invite activation',
      isActive: true,
      isSystem: false,
      createdByUserId: inviter.user.id,
    }).returning({
      id: titles.id,
    })
    const titleId = String(createdTitle?.id || '')
    expect(titleId).not.toBe('')

    const invitedEmail = `invite-activation-${Date.now()}@productier.test`
    const inviteResponse = await apiRequest(app, '/api/onboarding/invites', {
      method: 'POST',
      token: inviter.token,
      body: {
        organizationId,
        invites: [
          {
            email: invitedEmail,
            name: 'Invited Teammate',
            role: 'member',
            workspaceProductId,
            organizationTeamId,
            titleId,
          },
        ],
      },
    })
    expect(inviteResponse.status).toBe(200)
    const createdInvite = Array.isArray(inviteResponse.body?.created)
      ? inviteResponse.body.created[0]
      : null
    const inviteId = String(createdInvite?.id || '')
    const inviteToken = parseInviteToken(String(createdInvite?.inviteLink || ''))
    expect(inviteId).not.toBe('')
    expect(inviteToken).not.toBe('')

    const activationPassword = 'InviteActivation-Strong1!'
    const activateResponse = await apiRequest(app, '/api/onboarding/invites/activate', {
      method: 'POST',
      body: {
        token: inviteToken,
        password: activationPassword,
        name: 'Invitee Override',
      },
    })
    expect(activateResponse.status).toBe(200)
    expect(activateResponse.body?.success).toBe(true)
    expect(typeof activateResponse.body?.token).toBe('string')
    expect(activateResponse.body?.user?.email).toBe(invitedEmail)
    expect(activateResponse.body?.user?.name).toBe('Invitee Override')

    const activatedUserId = String(activateResponse.body?.user?.id || '')
    expect(activatedUserId).not.toBe('')

    const loginResponse = await apiRequest(app, '/api/auth/login', {
      method: 'POST',
      body: {
        email: invitedEmail,
        password: activationPassword,
      },
    })
    expect(loginResponse.status).toBe(200)
    expect(typeof loginResponse.body?.token).toBe('string')

    const inviteRecord = await db.query.organizationInvites.findFirst({
      where: eq(organizationInvites.id, inviteId),
    })
    expect(inviteRecord?.status).toBe('accepted')
    expect(inviteRecord?.acceptedByUserId).toBe(activatedUserId)

    const organizationMembership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, activatedUserId),
      ),
    })
    expect(organizationMembership?.role).toBe('member')

    const workspaceMembership = await db.query.productMembers.findFirst({
      where: and(
        eq(productMembers.productId, workspaceProductId),
        eq(productMembers.userId, activatedUserId),
      ),
    })
    expect(workspaceMembership).toBeTruthy()

    const teamMembership = await db.query.organizationTeamMembers.findFirst({
      where: and(
        eq(organizationTeamMembers.organizationTeamId, organizationTeamId),
        eq(organizationTeamMembers.userId, activatedUserId),
      ),
    })
    expect(teamMembership).toBeTruthy()

    const titleAssignment = await db.query.userTitles.findFirst({
      where: eq(userTitles.userId, activatedUserId),
    })
    expect(titleAssignment?.titleId).toBe(titleId)
  })
})
