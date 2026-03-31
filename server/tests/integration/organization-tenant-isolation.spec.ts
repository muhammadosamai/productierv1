import { describe, expect, it } from 'vitest'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

function readOrganizationId(payload: unknown): string {
  const root = payload as Record<string, unknown> | null
  const org = root && typeof root.organization === 'object'
    ? root.organization as Record<string, unknown>
    : null
  return typeof org?.id === 'string' ? org.id : ''
}

function readWorkspaceProductId(payload: unknown): string {
  const root = payload as Record<string, unknown> | null
  const product = root && typeof root.product === 'object'
    ? root.product as Record<string, unknown>
    : null
  return typeof product?.id === 'string' ? product.id : ''
}

describe('organization tenant isolation', () => {
  it('blocks cross-organization access on org-first endpoints', async () => {
    const app = await createTestApp()
    const actorA = await registerAndLogin(app, 'developer')
    const actorB = await registerAndLogin(app, 'developer')

    const orgARes = await apiRequest(app, '/api/onboarding/organization', {
      method: 'POST',
      token: actorA.token,
      body: { name: `Tenant A ${Date.now()}` },
    })
    expect(orgARes.status).toBe(200)
    const orgAId = readOrganizationId(orgARes.body)
    expect(orgAId).not.toBe('')

    const orgBRes = await apiRequest(app, '/api/onboarding/organization', {
      method: 'POST',
      token: actorB.token,
      body: { name: `Tenant B ${Date.now()}` },
    })
    expect(orgBRes.status).toBe(200)
    const orgBId = readOrganizationId(orgBRes.body)
    expect(orgBId).not.toBe('')

    const workspaceBRes = await apiRequest(app, '/api/onboarding/workspace', {
      method: 'POST',
      token: actorB.token,
      body: {
        organizationId: orgBId,
        name: `Tenant B Workspace ${Date.now()}`,
      },
    })
    expect(workspaceBRes.status).toBe(200)
    const productBId = readWorkspaceProductId(workspaceBRes.body)
    expect(productBId).not.toBe('')

    const ownOrgUsersRes = await apiRequest(app, `/api/organizations/${orgBId}/users`, {
      method: 'GET',
      token: actorB.token,
    })
    expect(ownOrgUsersRes.status).toBe(200)

    const crossOrgUsersRes = await apiRequest(app, `/api/organizations/${orgBId}/users`, {
      method: 'GET',
      token: actorA.token,
    })
    expect(crossOrgUsersRes.status).toBe(403)

    const crossOrgProductsRes = await apiRequest(app, `/api/organizations/${orgBId}/products`, {
      method: 'GET',
      token: actorA.token,
    })
    expect(crossOrgProductsRes.status).toBe(403)

    const crossOrgTasksRes = await apiRequest(app, `/api/organizations/${orgBId}/products/${productBId}/tasks`, {
      method: 'GET',
      token: actorA.token,
    })
    expect(crossOrgTasksRes.status).toBe(403)

    const orgProductMismatchRes = await apiRequest(app, `/api/organizations/${orgAId}/products/${productBId}/tasks`, {
      method: 'GET',
      token: actorA.token,
    })
    expect(orgProductMismatchRes.status).toBe(404)
  })

  it('retires legacy auth users paths and keeps org-first users path scoped', async () => {
    const app = await createTestApp()
    const actorA = await registerAndLogin(app, 'developer')
    const actorB = await registerAndLogin(app, 'developer')

    const orgARes = await apiRequest(app, '/api/onboarding/organization', {
      method: 'POST',
      token: actorA.token,
      body: { name: `Legacy Scope Org A ${Date.now()}` },
    })
    expect(orgARes.status).toBe(200)
    const orgAId = readOrganizationId(orgARes.body)
    expect(orgAId).not.toBe('')

    const orgBRes = await apiRequest(app, '/api/onboarding/organization', {
      method: 'POST',
      token: actorB.token,
      body: { name: `Legacy Scope Org B ${Date.now()}` },
    })
    expect(orgBRes.status).toBe(200)
    const orgBId = readOrganizationId(orgBRes.body)
    expect(orgBId).not.toBe('')

    const legacyUsersRes = await apiRequest(app, '/api/auth/users', {
      method: 'GET',
      token: actorA.token,
    })
    expect(legacyUsersRes.status).toBe(410)

    const legacyUsersScopedRes = await apiRequest(app, `/api/auth/users?organizationId=${encodeURIComponent(orgAId)}`, {
      method: 'GET',
      token: actorA.token,
    })
    expect(legacyUsersScopedRes.status).toBe(410)

    const retiredGlobalUsersRes = await apiRequest(app, '/api/users', {
      method: 'GET',
      token: actorA.token,
    })
    expect(retiredGlobalUsersRes.status).toBe(410)

    const scopedRes = await apiRequest(app, `/api/organizations/${orgAId}/users`, {
      method: 'GET',
      token: actorA.token,
    })
    expect(scopedRes.status).toBe(200)
    expect(Array.isArray(scopedRes.body)).toBe(true)
    const scopedUsers = (scopedRes.body as Array<Record<string, unknown>>)
      .map((item) => String(item.id ?? ''))
    expect(scopedUsers.includes(actorA.user.id)).toBe(true)
    expect(scopedUsers.includes(actorB.user.id)).toBe(false)

    const forbiddenOrgRes = await apiRequest(app, `/api/organizations/${orgBId}/users`, {
      method: 'GET',
      token: actorA.token,
    })
    expect(forbiddenOrgRes.status).toBe(403)
  })

  it('enforces org-scoped users-admin boundaries and hides cross-org targets', async () => {
    const app = await createTestApp()
    const actorA = await registerAndLogin(app, 'admin')
    const actorB = await registerAndLogin(app, 'admin')

    const orgARes = await apiRequest(app, '/api/onboarding/organization', {
      method: 'POST',
      token: actorA.token,
      body: { name: `Users Admin Org A ${Date.now()}` },
    })
    expect(orgARes.status).toBe(200)
    const orgAId = readOrganizationId(orgARes.body)
    expect(orgAId).not.toBe('')

    const orgBRes = await apiRequest(app, '/api/onboarding/organization', {
      method: 'POST',
      token: actorB.token,
      body: { name: `Users Admin Org B ${Date.now()}` },
    })
    expect(orgBRes.status).toBe(200)
    const orgBId = readOrganizationId(orgBRes.body)
    expect(orgBId).not.toBe('')

    const workspaceBRes = await apiRequest(app, '/api/onboarding/workspace', {
      method: 'POST',
      token: actorB.token,
      body: {
        organizationId: orgBId,
        name: `Users Admin Workspace ${Date.now()}`,
      },
    })
    expect(workspaceBRes.status).toBe(200)
    const productBId = readWorkspaceProductId(workspaceBRes.body)
    expect(productBId).not.toBe('')

    const ownUsersAdminListRes = await apiRequest(app, `/api/organizations/${orgAId}/users-admin`, {
      method: 'GET',
      token: actorA.token,
    })
    expect(ownUsersAdminListRes.status).toBe(200)

    const crossUsersAdminListRes = await apiRequest(app, `/api/organizations/${orgBId}/users-admin`, {
      method: 'GET',
      token: actorA.token,
    })
    expect(crossUsersAdminListRes.status).toBe(403)

    const hiddenCrossTargetRes = await apiRequest(
      app,
      `/api/organizations/${orgAId}/users-admin/${encodeURIComponent(actorB.user.id)}`,
      {
        method: 'GET',
        token: actorA.token,
      },
    )
    expect(hiddenCrossTargetRes.status).toBe(404)

    const hiddenCrossRoleMutationRes = await apiRequest(
      app,
      `/api/organizations/${orgAId}/users-admin/${encodeURIComponent(actorB.user.id)}/role`,
      {
        method: 'PUT',
        token: actorA.token,
        body: { role: 'developer' },
      },
    )
    expect(hiddenCrossRoleMutationRes.status).toBe(404)

    const orgProductMismatchMembershipRes = await apiRequest(
      app,
      `/api/organizations/${orgAId}/users-admin/${encodeURIComponent(actorA.user.id)}/memberships`,
      {
        method: 'POST',
        token: actorA.token,
        body: {
          productId: productBId,
          role: 'member',
        },
      },
    )
    expect(orgProductMismatchMembershipRes.status).toBe(404)
  })

  it('enforces org-scoped metrics and home flows, including org/product mismatch handling', async () => {
    const app = await createTestApp()
    const actorA = await registerAndLogin(app, 'developer')
    const actorB = await registerAndLogin(app, 'developer')

    const orgARes = await apiRequest(app, '/api/onboarding/organization', {
      method: 'POST',
      token: actorA.token,
      body: { name: `Metrics Scope Org A ${Date.now()}` },
    })
    expect(orgARes.status).toBe(200)
    const orgAId = readOrganizationId(orgARes.body)
    expect(orgAId).not.toBe('')

    const orgBRes = await apiRequest(app, '/api/onboarding/organization', {
      method: 'POST',
      token: actorB.token,
      body: { name: `Metrics Scope Org B ${Date.now()}` },
    })
    expect(orgBRes.status).toBe(200)
    const orgBId = readOrganizationId(orgBRes.body)
    expect(orgBId).not.toBe('')

    const workspaceBRes = await apiRequest(app, '/api/onboarding/workspace', {
      method: 'POST',
      token: actorB.token,
      body: {
        organizationId: orgBId,
        name: `Metrics Scope Workspace ${Date.now()}`,
      },
    })
    expect(workspaceBRes.status).toBe(200)
    const productBId = readWorkspaceProductId(workspaceBRes.body)
    expect(productBId).not.toBe('')

    const retiredMetricsRes = await apiRequest(
      app,
      `/api/metrics/dashboard?productId=${encodeURIComponent(productBId)}&period=30`,
      {
        method: 'GET',
        token: actorB.token,
      },
    )
    expect(retiredMetricsRes.status).toBe(410)

    const ownMetricsRes = await apiRequest(
      app,
      `/api/organizations/${orgBId}/metrics/dashboard?scopeMode=all&period=30`,
      {
        method: 'GET',
        token: actorB.token,
      },
    )
    expect(ownMetricsRes.status).toBe(200)

    const crossMetricsRes = await apiRequest(
      app,
      `/api/organizations/${orgBId}/metrics/dashboard?scopeMode=all&period=30`,
      {
        method: 'GET',
        token: actorA.token,
      },
    )
    expect(crossMetricsRes.status).toBe(403)

    const mismatchMetricsRes = await apiRequest(
      app,
      `/api/organizations/${orgAId}/products/${productBId}/metrics/dashboard?period=30`,
      {
        method: 'GET',
        token: actorA.token,
      },
    )
    expect(mismatchMetricsRes.status).toBe(404)

    const ownHomeRes = await apiRequest(
      app,
      `/api/organizations/${orgBId}/users/${encodeURIComponent(actorB.user.id)}/home?scopeMode=all`,
      {
        method: 'GET',
        token: actorB.token,
      },
    )
    expect(ownHomeRes.status).toBe(200)

    const crossHomeRes = await apiRequest(
      app,
      `/api/organizations/${orgBId}/users/${encodeURIComponent(actorB.user.id)}/home?scopeMode=all`,
      {
        method: 'GET',
        token: actorA.token,
      },
    )
    expect(crossHomeRes.status).toBe(403)
  })
})
