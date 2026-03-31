import { describe, expect, it } from 'vitest'
import { Elysia } from 'elysia'
import { and, eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { organizationMembers, organizations, rolePermissions } from '../../src/db/schema'
import { authRoutes } from '../../src/routes/auth'
import { dashboardRoutes } from '../../src/routes/dashboards'
import { apiRequest, registerAndLogin } from '../setup/testApp'

async function createWorkspaceOrganizationForUser(
  userId: string,
  namePrefix: string,
): Promise<string> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const [organization] = await db.insert(organizations).values({
    name: `${namePrefix} ${stamp}`,
    slug: `${namePrefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`,
    createdByUserId: userId,
  }).returning({ id: organizations.id })

  await db.insert(organizationMembers).values({
    organizationId: organization!.id,
    userId,
    role: 'owner',
  })

  return organization!.id
}

describe('dashboard templates route', () => {
  const createTestDashboardApp = () => (
    new Elysia()
      .use(authRoutes)
      .use(dashboardRoutes)
  )

  it('lists templates for workspace scope with organization context', async () => {
    const app = createTestDashboardApp()
    const { token, user } = await registerAndLogin(app, 'super_admin')
    const organizationId = await createWorkspaceOrganizationForUser(user.id, 'Dashboard Templates Org')

    const response = await apiRequest(
      app,
      `/api/dashboards/templates?scopeType=workspace&organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: 'GET',
        token,
      },
    )

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body?.items)).toBe(true)
    expect(typeof response.body?.canManageTemplates).toBe('boolean')
    expect(typeof response.body?.canApplyTemplates).toBe('boolean')
  })

  it('returns a safe fallback payload when template lookup fails', async () => {
    const app = createTestDashboardApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const response = await apiRequest(
      app,
      '/api/dashboards/templates?scopeType=workspace&organizationId=not-a-valid-uuid',
      {
        method: 'GET',
        token,
      },
    )

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body?.items)).toBe(true)
    expect(response.body?.canManageTemplates).toBe(false)
    expect(response.body?.canApplyTemplates).toBe(false)
  })

  it('allows template apply when create is allowed but management edit is denied', async () => {
    const app = createTestDashboardApp()
    const { token, user } = await registerAndLogin(app, 'business_analyst')
    const organizationId = await createWorkspaceOrganizationForUser(user.id, 'Dashboard Template Apply Org')

    await db.update(rolePermissions)
      .set({
        visible: true,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        selfViewOnly: false,
      })
      .where(and(
        eq(rolePermissions.role, 'business_analyst'),
        eq(rolePermissions.page, 'home'),
      ))

    const listResponse = await apiRequest(
      app,
      `/api/dashboards/templates?scopeType=workspace&organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: 'GET',
        token,
      },
    )

    expect(listResponse.status).toBe(200)
    expect(listResponse.body?.canManageTemplates).toBe(false)
    expect(listResponse.body?.canApplyTemplates).toBe(true)

    const applyResponse = await apiRequest(
      app,
      `/api/dashboards/templates/${encodeURIComponent('system:workspace:personal-focus')}/apply`,
      {
        method: 'POST',
        token,
        body: {
          scopeType: 'workspace',
          organizationId,
          mode: 'append',
        },
      },
    )

    expect(applyResponse.status).toBe(200)
    expect(applyResponse.body?.success).toBe(true)

    const saveResponse = await apiRequest(app, '/api/dashboards/templates', {
      method: 'POST',
      token,
      body: {
        scopeType: 'workspace',
        organizationId,
        name: 'Should still require edit',
      },
    })

    expect(saveResponse.status).toBe(403)
  })
})
