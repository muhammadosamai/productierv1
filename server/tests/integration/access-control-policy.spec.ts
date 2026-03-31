import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { db } from '../../src/db'
import { organizationMembers, rolePermissions } from '../../src/db/schema'
import {
  PRODUCT_CREATOR_MEMBER_ROLE,
  PRODUCT_DEFAULT_MEMBER_ROLE,
  resolveProductMemberRole,
} from '../../src/lib/productMembershipPolicy'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

const FULL_PERMISSION = {
  visible: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  selfViewOnly: false,
}

async function upsertSingleRolePermission(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  role: string,
  page: string,
  permission: typeof FULL_PERMISSION
) {
  const response = await apiRequest(app, '/api/roles/permissions', {
    method: 'PUT',
    token,
    body: {
      role,
      pages: {
        [page]: permission,
      },
    },
  })
  expect(response.status).toBe(200)
}

async function createTitle(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  name: string
) {
  const response = await apiRequest(app, '/api/roles/titles', {
    method: 'POST',
    token,
    body: {
      name,
    },
  })
  expect(response.status).toBe(200)
  return String(response.body?.id || '')
}

async function updateTitlePagePermission(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  titleId: string,
  page: string,
  permission: typeof FULL_PERMISSION
) {
  const response = await apiRequest(app, `/api/roles/titles/${titleId}/permissions`, {
    method: 'PUT',
    token,
    body: {
      pages: {
        [page]: permission,
      },
    },
  })
  expect(response.status).toBe(200)
}

async function createProduct(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  organizationId: string,
  name: string,
) {
  const response = await apiRequest(
    app,
    `/api/organizations/${encodeURIComponent(organizationId)}/products`,
    {
    method: 'POST',
    token,
    body: { name },
  },
  )
  expect(response.status).toBe(200)
  return String(response.body?.id || '')
}

async function addProductMember(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  organizationId: string,
  productId: string,
  userId: string,
  role = 'member',
) {
  const response = await apiRequest(
    app,
    `/api/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(productId)}/members`,
    {
    method: 'POST',
    token,
    body: { userId, role },
  },
  )
  expect(response.status).toBe(200)
}

async function createOrganizationForActor(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  namePrefix: string,
): Promise<string> {
  const response = await apiRequest(app, '/api/onboarding/organization', {
    method: 'POST',
    token,
    body: { name: `${namePrefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  })
  expect(response.status).toBe(200)
  const organizationId = String(response.body?.organization?.id || '')
  expect(organizationId).not.toBe('')
  return organizationId
}

async function ensureOrganizationMember(
  organizationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member' | 'viewer' = 'member',
) {
  await db.insert(organizationMembers).values({
    organizationId,
    userId,
    role,
  }).onConflictDoNothing()
}

describe('access control policy hardcoding regressions', () => {
  it('applies membership defaults from centralized policy', async () => {
    const app = await createTestApp()
    const { token: adminToken, user: adminUser } = await registerAndLogin(app, 'super_admin')
    const organizationId = await createOrganizationForActor(app, adminToken, 'Policy Scope Org')

    expect(PRODUCT_CREATOR_MEMBER_ROLE).toBe('admin')
    expect(resolveProductMemberRole(undefined)).toBe(PRODUCT_DEFAULT_MEMBER_ROLE)

    const productId = randomUUID()
    await db.execute(sql`
      INSERT INTO products (id, organization_id, name, created_by_user_id, created_at, updated_at)
      VALUES (
        ${productId}::uuid,
        ${organizationId}::uuid,
        ${`Policy Product ${Date.now()}`},
        ${adminUser.id}::uuid,
        now(),
        now()
      )
    `)

    const { user: firstViewer } = await registerAndLogin(app, 'viewer')
    await ensureOrganizationMember(organizationId, firstViewer.id, 'member')
    await addProductMember(app, adminToken, organizationId, productId, firstViewer.id, 'member')

    const { user: secondViewer } = await registerAndLogin(app, 'viewer')
    await ensureOrganizationMember(organizationId, secondViewer.id, 'member')
    const addByUsersRoute = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users-admin/${secondViewer.id}/memberships`,
      {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
      },
    },
    )
    expect(addByUsersRoute.status).toBe(200)
    expect(addByUsersRoute.body?.role).toBe('member')
  })

  it('serves canonical page + role catalog metadata from backend', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const response = await apiRequest(app, '/api/roles/catalog', {
      method: 'GET',
      token,
    })

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body?.pages)).toBe(true)
    expect(Array.isArray(response.body?.configurableRoles)).toBe(true)
    expect(response.body.configurableRoles.some((item: { key: string }) => item.key === 'super_admin')).toBe(
      false,
    )

    const storiesPage = response.body.pages.find((entry: { key: string }) => entry.key === 'stories')
    expect(storiesPage).toBeTruthy()
    expect(storiesPage.routePrefixes).toContain('/stories')
    expect(storiesPage.routePrefixes).toContain('/backlog')
  })

  it('defaults to deny when permission rows are missing', async () => {
    const app = await createTestApp()
    const { token: viewerToken } = await registerAndLogin(app, 'viewer')
    const organizationId = await createOrganizationForActor(app, viewerToken, 'Denied Create Org')

    await db.delete(rolePermissions).where(eq(rolePermissions.role, 'viewer'))

    const myPermissionsResponse = await apiRequest(app, '/api/roles/my-permissions', {
      method: 'GET',
      token: viewerToken,
    })
    expect(myPermissionsResponse.status).toBe(200)
    expect(myPermissionsResponse.body?.pages?.home?.visible).toBe(false)
    expect(myPermissionsResponse.body?.pages?.home?.canCreate).toBe(false)

    const forbiddenCreateResponse = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/products`,
      {
      method: 'POST',
      token: viewerToken,
      body: {
        name: `Denied Product ${Date.now()}`,
      },
    },
    )
    expect(forbiddenCreateResponse.status).toBe(403)
    expect(forbiddenCreateResponse.body?.error).toBe('Forbidden')
  })

  it('falls back to role-only behavior when no title is assigned', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken } = await registerAndLogin(app, 'developer')

    await upsertSingleRolePermission(app, adminToken, 'developer', 'tasks', {
      ...FULL_PERMISSION,
      canCreate: false,
    })

    const myPermissionsResponse = await apiRequest(app, '/api/roles/my-permissions', {
      method: 'GET',
      token: developerToken,
    })
    expect(myPermissionsResponse.status).toBe(200)
    expect(myPermissionsResponse.body?.fallbackToRoleOnly).toBe(true)
    expect(myPermissionsResponse.body?.source).toBe('role_only_fallback')
    expect(myPermissionsResponse.body?.pages?.tasks?.canCreate).toBe(false)
  })

  it('merges role and title permissions within hard limits', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const organizationId = await createOrganizationForActor(app, adminToken, 'Title Merge Org')
    const { token: developerToken, user: developerUser } = await registerAndLogin(app, 'developer')
    await ensureOrganizationMember(organizationId, developerUser.id, 'member')

    await upsertSingleRolePermission(app, adminToken, 'developer', 'tasks', {
      ...FULL_PERMISSION,
      canCreate: false,
    })

    const titleId = await createTitle(app, adminToken, `Task Creator ${Date.now()}`)
    expect(titleId).not.toBe('')

    await updateTitlePagePermission(app, adminToken, titleId, 'tasks', {
      ...FULL_PERMISSION,
      canCreate: true,
    })

    const assignResponse = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users-admin/${developerUser.id}/title`,
      {
      method: 'PUT',
      token: adminToken,
      body: { titleId },
    },
    )
    expect(assignResponse.status).toBe(200)

    const myPermissionsResponse = await apiRequest(app, '/api/roles/my-permissions', {
      method: 'GET',
      token: developerToken,
    })
    expect(myPermissionsResponse.status).toBe(200)
    expect(myPermissionsResponse.body?.fallbackToRoleOnly).toBe(false)
    expect(myPermissionsResponse.body?.source).toBe('role_and_title')
    expect(myPermissionsResponse.body?.pages?.tasks?.canCreate).toBe(true)
  })

  it('caps title permissions by role hard limits to prevent escalation', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const organizationId = await createOrganizationForActor(app, adminToken, 'Title Cap Org')
    const { token: viewerToken, user: viewerUser } = await registerAndLogin(app, 'viewer')
    await ensureOrganizationMember(organizationId, viewerUser.id, 'member')

    const titleId = await createTitle(app, adminToken, `Viewer Escalation Attempt ${Date.now()}`)
    expect(titleId).not.toBe('')

    await updateTitlePagePermission(app, adminToken, titleId, 'tasks', {
      ...FULL_PERMISSION,
      visible: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      selfViewOnly: false,
    })

    const assignResponse = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users-admin/${viewerUser.id}/title`,
      {
      method: 'PUT',
      token: adminToken,
      body: { titleId },
    },
    )
    expect(assignResponse.status).toBe(200)

    const myPermissionsResponse = await apiRequest(app, '/api/roles/my-permissions', {
      method: 'GET',
      token: viewerToken,
    })
    expect(myPermissionsResponse.status).toBe(200)
    expect(myPermissionsResponse.body?.pages?.tasks?.visible).toBe(true)
    expect(myPermissionsResponse.body?.pages?.tasks?.canCreate).toBe(false)
    expect(myPermissionsResponse.body?.pages?.tasks?.canEdit).toBe(false)
    expect(myPermissionsResponse.body?.pages?.tasks?.canDelete).toBe(false)
  })

  it('restricts product_admin user-management actions to managed product boundaries', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const organizationId = await createOrganizationForActor(app, adminToken, 'Product Admin Scope Org')
    const { token: productAdminToken, user: productAdminUser } = await registerAndLogin(app, 'product_admin')
    const { user: scopedDeveloper } = await registerAndLogin(app, 'developer')
    const { user: outsiderDeveloper } = await registerAndLogin(app, 'developer')
    await ensureOrganizationMember(organizationId, productAdminUser.id, 'member')
    await ensureOrganizationMember(organizationId, scopedDeveloper.id, 'member')
    await ensureOrganizationMember(organizationId, outsiderDeveloper.id, 'member')

    const managedProductId = await createProduct(app, adminToken, organizationId, `Managed Product ${Date.now()}`)
    const outsiderProductId = await createProduct(app, adminToken, organizationId, `Outsider Product ${Date.now()}`)

    await addProductMember(app, adminToken, organizationId, managedProductId, productAdminUser.id, 'admin')
    await addProductMember(app, adminToken, organizationId, managedProductId, scopedDeveloper.id, 'member')
    await addProductMember(app, adminToken, organizationId, outsiderProductId, outsiderDeveloper.id, 'member')

    const managedUsersList = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users-admin`,
      {
      method: 'GET',
      token: productAdminToken,
    },
    )
    expect(managedUsersList.status).toBe(200)
    const managedUserIds = new Set((managedUsersList.body || []).map((row: any) => String(row?.id || '')))
    expect(managedUserIds.has(scopedDeveloper.id)).toBe(true)
    expect(managedUserIds.has(outsiderDeveloper.id)).toBe(false)

    const roleUpdateOutsideScope = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users-admin/${outsiderDeveloper.id}/role`,
      {
      method: 'PUT',
      token: productAdminToken,
      body: { role: 'viewer' },
    },
    )
    expect(roleUpdateOutsideScope.status).toBe(403)

    const membershipMutationOutsideScope = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users-admin/${scopedDeveloper.id}/memberships`,
      {
      method: 'POST',
      token: productAdminToken,
      body: { productId: outsiderProductId, role: 'member' },
    },
    )
    expect(membershipMutationOutsideScope.status).toBe(403)
  })

  it('enforces selfViewOnly filters on task/story/initiative/delivery list surfaces', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: viewerToken, user: viewerUser } = await registerAndLogin(app, 'viewer')

    await upsertSingleRolePermission(app, adminToken, 'viewer', 'tasks', {
      visible: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      selfViewOnly: true,
    })
    await upsertSingleRolePermission(app, adminToken, 'viewer', 'stories', {
      visible: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      selfViewOnly: true,
    })
    await upsertSingleRolePermission(app, adminToken, 'viewer', 'initiatives', {
      visible: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      selfViewOnly: true,
    })
    await upsertSingleRolePermission(app, adminToken, 'viewer', 'deliveries', {
      visible: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      selfViewOnly: true,
    })

    const organizationId = await createOrganizationForActor(app, adminToken, 'Self View Org')
    await ensureOrganizationMember(organizationId, viewerUser.id, 'member')
    const productId = await createProduct(app, adminToken, organizationId, `SelfView Product ${Date.now()}`)
    await addProductMember(app, adminToken, organizationId, productId, viewerUser.id, 'member')

    const initiativeOwnedRes = await apiRequest(app, '/api/initiatives', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Initiative Owned',
        productId,
        leaderUserId: viewerUser.id,
      },
    })
    expect(initiativeOwnedRes.status).toBe(200)
    const initiativeOwnedId = String(initiativeOwnedRes.body?.id || '')
    const initiativeOtherRes = await apiRequest(app, '/api/initiatives', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Initiative Other',
        productId,
      },
    })
    expect(initiativeOtherRes.status).toBe(200)

    const storyOwnedRes = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Story Owned',
        productId,
        ownerUserId: viewerUser.id,
      },
    })
    expect(storyOwnedRes.status).toBe(200)
    const storyOwnedId = String(storyOwnedRes.body?.id || '')
    const storyOtherRes = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Story Other',
        productId,
      },
    })
    expect(storyOtherRes.status).toBe(200)
    const storyOtherId = String(storyOtherRes.body?.id || '')

    const deliveryOwnedRes = await apiRequest(app, '/api/deliveries', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Delivery Owned',
        productId,
      },
    })
    expect(deliveryOwnedRes.status).toBe(200)
    const deliveryOwnedId = String(deliveryOwnedRes.body?.id || '')
    const deliveryOtherRes = await apiRequest(app, '/api/deliveries', {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Delivery Other',
        productId,
      },
    })
    expect(deliveryOtherRes.status).toBe(200)

    await db.execute(sql`
      UPDATE deliveries
      SET created_by_user_id = ${viewerUser.id}::uuid
      WHERE id = ${deliveryOwnedId}::uuid
    `)

    const createOwnedTask = await apiRequest(app, `/api/tasks/by-story/${encodeURIComponent(storyOwnedId)}`, {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Task Owned',
        ownerUserId: viewerUser.id,
      },
    })
    expect(createOwnedTask.status).toBe(200)
    const createOtherTask = await apiRequest(app, `/api/tasks/by-story/${encodeURIComponent(storyOtherId)}`, {
      method: 'POST',
      token: adminToken,
      body: {
        title: 'Task Other',
      },
    })
    expect(createOtherTask.status).toBe(200)

    const taskListRes = await apiRequest(app, `/api/tasks?productId=${encodeURIComponent(productId)}&limit=50`, {
      method: 'GET',
      token: viewerToken,
    })
    expect(taskListRes.status).toBe(200)
    expect(Array.isArray(taskListRes.body?.items)).toBe(true)
    expect(taskListRes.body.items.length).toBe(1)
    expect(taskListRes.body.items[0]?.ownerUserId).toBe(viewerUser.id)

    const storyListRes = await apiRequest(app, `/api/stories?productId=${encodeURIComponent(productId)}&limit=50`, {
      method: 'GET',
      token: viewerToken,
    })
    expect(storyListRes.status).toBe(200)
    expect(Array.isArray(storyListRes.body?.items)).toBe(true)
    expect(storyListRes.body.items.length).toBe(1)
    expect(storyListRes.body.items[0]?.ownerUserId).toBe(viewerUser.id)

    const initiativeListRes = await apiRequest(app, `/api/initiatives?productId=${encodeURIComponent(productId)}`, {
      method: 'GET',
      token: viewerToken,
    })
    expect(initiativeListRes.status).toBe(200)
    expect(Array.isArray(initiativeListRes.body)).toBe(true)
    expect(initiativeListRes.body.length).toBe(1)
    expect(initiativeListRes.body[0]?.id).toBe(initiativeOwnedId)

    const deliveryListRes = await apiRequest(app, `/api/deliveries?productId=${encodeURIComponent(productId)}&limit=50`, {
      method: 'GET',
      token: viewerToken,
    })
    expect(deliveryListRes.status).toBe(200)
    expect(Array.isArray(deliveryListRes.body?.items)).toBe(true)
    expect(deliveryListRes.body.items.length).toBe(1)
    expect(deliveryListRes.body.items[0]?.createdByUserId).toBe(viewerUser.id)
  })

  it('enforces product membership boundaries for advanced notification filters', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const organizationId = await createOrganizationForActor(app, adminToken, 'Notification Scope Org')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')
    await ensureOrganizationMember(organizationId, developer.id, 'member')

    await upsertSingleRolePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)

    const productId = await createProduct(app, adminToken, organizationId, `Notification Scope Product ${Date.now()}`)

    const outsiderFilteredInbox = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productId)}&category=assignment&urgency=action_required&entityType=task&type=${encodeURIComponent('task.updated.assignment')}`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(outsiderFilteredInbox.status).toBe(403)

    await addProductMember(app, adminToken, organizationId, productId, developer.id, 'member')

    const memberFilteredInbox = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productId)}&category=assignment&urgency=action_required&entityType=task&type=${encodeURIComponent('task.updated.assignment')}`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(memberFilteredInbox.status).toBe(200)
    expect(Array.isArray(memberFilteredInbox.body?.items)).toBe(true)
  })
})

