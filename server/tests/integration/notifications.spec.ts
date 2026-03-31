import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'
import { runDailyCrossViewRollupSweep, runTaskReminderSweep } from '../../src/lib/notificationReminderScheduler'
import { resetNotificationsConfigCacheForTests } from '../../src/config/notifications'

const FULL_PERMISSION = {
  visible: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  selfViewOnly: false,
}

async function createProduct(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  name: string,
) {
  const response = await apiRequest(app, '/api/products', {
    method: 'POST',
    token,
    body: { name },
  })
  expect(response.status).toBe(200)
  const productId = String(response.body?.id || '')
  expect(productId).not.toBe('')
  return productId
}

async function createStory(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  productId: string,
  ownerUserId: string,
  title: string,
) {
  const response = await apiRequest(app, '/api/stories', {
    method: 'POST',
    token,
    body: {
      productId,
      title,
      ownerUserId,
    },
  })
  expect(response.status).toBe(200)
  const storyId = String(response.body?.id || '')
  expect(storyId).not.toBe('')
  return storyId
}

async function createTaskByStory(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  storyId: string,
  payload: {
    title: string
    ownerUserId?: string
    assigneeUserIds?: string[]
    reviewerUserIds?: string[]
    status?: string
    dueAt?: string | null
    blockedReason?: string | null
  },
) {
  const response = await apiRequest(app, `/api/tasks/by-story/${encodeURIComponent(storyId)}`, {
    method: 'POST',
    token,
    body: payload,
  })
  expect(response.status).toBe(200)
  const taskId = String(response.body?.id || '')
  expect(taskId).not.toBe('')
  return taskId
}

async function addProductMember(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  productId: string,
  userId: string,
  role = 'member',
) {
  const response = await apiRequest(app, `/api/products/${productId}/members`, {
    method: 'POST',
    token,
    body: { userId, role },
  })
  expect(response.status).toBe(200)
}

async function grantRolePagePermission(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  role: string,
  page: string,
  permission: typeof FULL_PERMISSION = FULL_PERMISSION,
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

describe('notifications api', () => {
  it('publishes notifications and updates read-state counters', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks')

    const productId = await createProduct(app, adminToken, `Notif Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const publishResponse = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'task',
        entityId: randomUUID(),
        entityTitle: 'Test task assignment',
        message: 'You were assigned to a task',
        recipientUserIds: [developer.id],
        subjectUserIds: [developer.id],
        changes: [
          {
            field: 'ownerUserId',
            from: null,
            to: developer.id,
          },
        ],
      },
    })
    expect(publishResponse.status).toBe(200)
    expect(Number(publishResponse.body?.published || 0)).toBeGreaterThan(0)

    const unreadBefore = await apiRequest(app, `/api/notifications/unread-count?productId=${encodeURIComponent(productId)}`, {
      method: 'GET',
      token: developerToken,
    })
    expect(unreadBefore.status).toBe(200)
    expect(Number(unreadBefore.body?.unreadCount || 0)).toBeGreaterThan(0)

    const inbox = await apiRequest(app, `/api/notifications?productId=${encodeURIComponent(productId)}`, {
      method: 'GET',
      token: developerToken,
    })
    expect(inbox.status).toBe(200)
    expect(Array.isArray(inbox.body?.items)).toBe(true)
    expect((inbox.body?.items || []).length).toBeGreaterThan(0)

    const firstNotificationId = String(inbox.body.items[0]?.id || '')
    expect(firstNotificationId).not.toBe('')

    const markRead = await apiRequest(app, '/api/notifications/read', {
      method: 'POST',
      token: developerToken,
      body: {
        ids: [firstNotificationId],
      },
    })
    expect(markRead.status).toBe(200)
    expect(Number(markRead.body?.updated || 0)).toBeGreaterThan(0)

    const unreadAfter = await apiRequest(app, `/api/notifications/unread-count?productId=${encodeURIComponent(productId)}`, {
      method: 'GET',
      token: developerToken,
    })
    expect(unreadAfter.status).toBe(200)
    expect(Number(unreadAfter.body?.unreadCount || 0)).toBeLessThan(Number(unreadBefore.body?.unreadCount || 0))
  })

  it('supports large inbox pagination with stable cursors', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)
    const productId = await createProduct(app, adminToken, `Notif Pagination Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    let publishedTotal = 0
    for (let index = 0; index < 35; index += 1) {
      const publishResponse = await apiRequest(app, '/api/notifications/admin/publish', {
        method: 'POST',
        token: adminToken,
        body: {
          productId,
          action: 'updated',
          entityType: 'task',
          entityId: randomUUID(),
          entityTitle: `Pagination task ${index + 1}`,
          message: `Pagination notification ${index + 1}`,
          recipientUserIds: [developer.id],
          subjectUserIds: [developer.id],
          changes: [
            {
              field: 'ownerUserId',
              from: null,
              to: developer.id,
            },
          ],
        },
      })
      expect(publishResponse.status).toBe(200)
      publishedTotal += Number(publishResponse.body?.published || 0)
    }
    expect(publishedTotal).toBeGreaterThan(20)

    const firstPage = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productId)}&limit=20`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(firstPage.status).toBe(200)
    expect(Array.isArray(firstPage.body?.items)).toBe(true)
    expect(firstPage.body.items.length).toBe(20)
    expect(typeof firstPage.body?.nextCursor).toBe('string')

    const secondPage = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productId)}&limit=20&cursor=${encodeURIComponent(String(firstPage.body.nextCursor || ''))}`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(secondPage.status).toBe(200)
    expect(Array.isArray(secondPage.body?.items)).toBe(true)
    expect(secondPage.body.items.length).toBeGreaterThan(0)

    const firstIds = new Set((firstPage.body.items || []).map((item: any) => String(item?.id || '')))
    const overlapCount = (secondPage.body.items || []).filter((item: any) => firstIds.has(String(item?.id || ''))).length
    expect(overlapCount).toBe(0)
  })

  it('skips notification delivery for recipients outside product membership', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    const productId = await createProduct(app, adminToken, `Notif Scope Product ${Date.now()}`)
    // Intentionally do NOT add developer as a product member.

    const publishResponse = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'task',
        entityId: randomUUID(),
        entityTitle: 'Scoped task',
        message: 'Scoped notification',
        recipientUserIds: [developer.id],
        subjectUserIds: [developer.id],
      },
    })

    expect(publishResponse.status).toBe(200)
    expect(Number(publishResponse.body?.published || 0)).toBe(0)

    const inbox = await apiRequest(app, `/api/notifications?productId=${encodeURIComponent(productId)}`, {
      method: 'GET',
      token: developerToken,
    })
    expect(inbox.status).toBe(403)

    const globalInbox = await apiRequest(app, '/api/notifications', {
      method: 'GET',
      token: developerToken,
    })
    expect(globalInbox.status).toBe(200)
    expect(Array.isArray(globalInbox.body?.items)).toBe(true)
    expect(globalInbox.body.items.length).toBe(0)
  })

  it('respects notification preferences for in-app workflow events', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'stories')

    const productId = await createProduct(app, adminToken, `Notif Pref Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const disableWorkflow = await apiRequest(app, '/api/notifications/preferences', {
      method: 'PUT',
      token: developerToken,
      body: {
        preferences: [
          {
            category: 'workflow',
            inAppEnabled: false,
            emailEnabled: false,
            minimumSeverity: 'low',
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ],
      },
    })
    expect(disableWorkflow.status).toBe(200)

    const blockedPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'story',
        entityId: randomUUID(),
        entityTitle: 'Workflow story',
        message: 'Workflow event should be filtered',
        recipientUserIds: [developer.id],
        changes: [
          {
            field: 'status',
            from: 'in_progress',
            to: 'done',
          },
        ],
      },
    })
    expect(blockedPublish.status).toBe(200)
    expect(Number(blockedPublish.body?.published || 0)).toBe(0)

    const enableWorkflow = await apiRequest(app, '/api/notifications/preferences', {
      method: 'PUT',
      token: developerToken,
      body: {
        preferences: [
          {
            category: 'workflow',
            inAppEnabled: true,
            emailEnabled: false,
            minimumSeverity: 'low',
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ],
      },
    })
    expect(enableWorkflow.status).toBe(200)

    const allowedPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'story',
        entityId: randomUUID(),
        entityTitle: 'Workflow story',
        message: 'Workflow event should be delivered',
        recipientUserIds: [developer.id],
        changes: [
          {
            field: 'status',
            from: 'in_progress',
            to: 'done',
          },
        ],
      },
    })
    expect(allowedPublish.status).toBe(200)
    expect(Number(allowedPublish.body?.published || 0)).toBeGreaterThan(0)
  })

  it('supports product-scoped preference overrides and role persona presets', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'stories')

    const productId = await createProduct(app, adminToken, `Notif Scoped Pref Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const globalDisable = await apiRequest(app, '/api/notifications/preferences', {
      method: 'PUT',
      token: developerToken,
      body: {
        preferences: [
          {
            category: 'workflow',
            inAppEnabled: false,
            emailEnabled: false,
            slackEnabled: false,
            minimumSeverity: 'low',
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ],
      },
    })
    expect(globalDisable.status).toBe(200)
    expect(globalDisable.body?.preset?.persona).toBe('developer')

    const blockedByGlobal = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'story',
        entityId: randomUUID(),
        entityTitle: 'Scoped preference story',
        message: 'Global workflow setting is disabled',
        recipientUserIds: [developer.id],
        changes: [
          {
            field: 'status',
            from: 'in_progress',
            to: 'done',
          },
        ],
      },
    })
    expect(blockedByGlobal.status).toBe(200)
    expect(Number(blockedByGlobal.body?.published || 0)).toBe(0)

    const productScopedEnable = await apiRequest(app, '/api/notifications/preferences', {
      method: 'PUT',
      token: developerToken,
      body: {
        productId,
        preferences: [
          {
            category: 'workflow',
            inAppEnabled: true,
            emailEnabled: false,
            slackEnabled: true,
            minimumSeverity: 'low',
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ],
      },
    })
    expect(productScopedEnable.status).toBe(200)
    const scopedWorkflow = (productScopedEnable.body?.preferences || []).find((item: any) => item.category === 'workflow')
    expect(Boolean(scopedWorkflow?.inAppEnabled)).toBe(true)
    expect(Boolean(scopedWorkflow?.slackEnabled)).toBe(true)
    expect(scopedWorkflow?.productId).toBe(productId)

    const globalPreferences = await apiRequest(app, '/api/notifications/preferences', {
      method: 'GET',
      token: developerToken,
    })
    expect(globalPreferences.status).toBe(200)
    const globalWorkflow = (globalPreferences.body?.preferences || []).find((item: any) => item.category === 'workflow')
    expect(Boolean(globalWorkflow?.inAppEnabled)).toBe(false)

    const productPreferences = await apiRequest(app, `/api/notifications/preferences?productId=${encodeURIComponent(productId)}`, {
      method: 'GET',
      token: developerToken,
    })
    expect(productPreferences.status).toBe(200)
    const productWorkflow = (productPreferences.body?.preferences || []).find((item: any) => item.category === 'workflow')
    expect(Boolean(productWorkflow?.inAppEnabled)).toBe(true)
    expect(Boolean(productWorkflow?.slackEnabled)).toBe(true)

    const allowedByScopedOverride = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'story',
        entityId: randomUUID(),
        entityTitle: 'Scoped preference story',
        message: 'Product-scoped workflow setting is enabled',
        recipientUserIds: [developer.id],
        changes: [
          {
            field: 'status',
            from: 'in_progress',
            to: 'done',
          },
        ],
      },
    })
    expect(allowedByScopedOverride.status).toBe(200)
    expect(Number(allowedByScopedOverride.body?.published || 0)).toBeGreaterThan(0)
  })

  it('redacts notification payload when recipient loses page visibility', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)
    const productId = await createProduct(app, adminToken, `Notif Redaction Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const publishResponse = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'task',
        entityId: randomUUID(),
        entityTitle: 'Visibility-sensitive task',
        message: 'This should be redacted after permission loss',
        recipientUserIds: [developer.id],
        subjectUserIds: [developer.id],
        changes: [
          {
            field: 'ownerUserId',
            from: null,
            to: developer.id,
          },
        ],
      },
    })
    expect(publishResponse.status).toBe(200)
    expect(Number(publishResponse.body?.published || 0)).toBeGreaterThan(0)

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks', {
      visible: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      selfViewOnly: false,
    })

    const inboxAfterRevoke = await apiRequest(app, `/api/notifications?productId=${encodeURIComponent(productId)}`, {
      method: 'GET',
      token: developerToken,
    })
    expect(inboxAfterRevoke.status).toBe(200)
    expect(Array.isArray(inboxAfterRevoke.body?.items)).toBe(true)
    expect((inboxAfterRevoke.body?.items || []).length).toBeGreaterThan(0)

    const first = inboxAfterRevoke.body.items[0]
    expect(first?.entityId).toBeNull()
    expect(first?.routePath).toBeNull()
    expect(String(first?.message || '')).toContain('no longer have access')
  })

  it('propagates selfViewOnly permission contract for notification consumers', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: viewerToken } = await registerAndLogin(app, 'viewer')

    await grantRolePagePermission(app, adminToken, 'viewer', 'tasks', {
      visible: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      selfViewOnly: true,
    })

    const myPermissions = await apiRequest(app, '/api/roles/my-permissions', {
      method: 'GET',
      token: viewerToken,
    })
    expect(myPermissions.status).toBe(200)
    const taskPermission = myPermissions.body?.pages?.tasks
    expect(taskPermission?.visible).toBe(true)
    expect(taskPermission?.canCreate).toBe(false)
    expect(taskPermission?.selfViewOnly).toBe(true)
  })

  it('hides previously delivered notifications after membership removal', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)
    const productId = await createProduct(app, adminToken, `Notif Membership Transition ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const publishResponse = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'task',
        entityId: randomUUID(),
        entityTitle: 'Membership transition task',
        message: 'Should disappear after membership removal',
        recipientUserIds: [developer.id],
        subjectUserIds: [developer.id],
        changes: [
          {
            field: 'ownerUserId',
            from: null,
            to: developer.id,
          },
        ],
      },
    })
    expect(publishResponse.status).toBe(200)
    expect(Number(publishResponse.body?.published || 0)).toBeGreaterThan(0)

    const removeMemberResponse = await apiRequest(
      app,
      `/api/products/${encodeURIComponent(productId)}/members/${encodeURIComponent(developer.id)}`,
      {
        method: 'DELETE',
        token: adminToken,
      },
    )
    expect(removeMemberResponse.status).toBe(200)

    const globalInbox = await apiRequest(app, '/api/notifications', {
      method: 'GET',
      token: developerToken,
    })
    expect(globalInbox.status).toBe(200)
    const productScopedItems = (globalInbox.body?.items || []).filter((item: any) => item?.productId === productId)
    expect(productScopedItems.length).toBe(0)

    const productScopedCount = await apiRequest(app, `/api/notifications/unread-count?productId=${encodeURIComponent(productId)}`, {
      method: 'GET',
      token: developerToken,
    })
    expect(productScopedCount.status).toBe(403)
  })

  it('supports advanced inbox filters and deduplicates repeated events within the noise window', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)
    await grantRolePagePermission(app, adminToken, 'developer', 'stories', FULL_PERMISSION)
    await grantRolePagePermission(app, adminToken, 'developer', 'releases', FULL_PERMISSION)

    const productId = await createProduct(app, adminToken, `Notif Filters Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const taskEntityId = randomUUID()
    const assignmentPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'task',
        entityId: taskEntityId,
        entityTitle: 'Assigned Task',
        message: 'Assignment event',
        recipientUserIds: [developer.id],
        subjectUserIds: [developer.id],
        changes: [
          { field: 'ownerUserId', from: null, to: developer.id },
        ],
      },
    })
    expect(assignmentPublish.status).toBe(200)
    expect(Number(assignmentPublish.body?.published || 0)).toBeGreaterThan(0)

    const duplicateAssignmentPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'task',
        entityId: taskEntityId,
        entityTitle: 'Assigned Task',
        message: 'Assignment event',
        recipientUserIds: [developer.id],
        subjectUserIds: [developer.id],
        changes: [
          { field: 'ownerUserId', from: null, to: developer.id },
        ],
      },
    })
    expect(duplicateAssignmentPublish.status).toBe(200)
    expect(Number(duplicateAssignmentPublish.body?.deduped || 0)).toBeGreaterThan(0)

    const storyCommentPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'story',
        entityId: randomUUID(),
        entityTitle: 'Commented Story',
        message: 'Story comment event',
        recipientUserIds: [developer.id],
        subjectUserIds: [developer.id],
        changes: [
          { field: 'commentId', from: null, to: randomUUID() },
          { field: 'commentPreview', from: null, to: 'Looks good' },
        ],
      },
    })
    expect(storyCommentPublish.status).toBe(200)
    expect(Number(storyCommentPublish.body?.published || 0)).toBeGreaterThan(0)

    const releaseFailurePublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'failed',
        entityType: 'release',
        entityId: randomUUID(),
        entityTitle: 'Release Failure',
        message: 'Release deployment failed',
        recipientUserIds: [developer.id],
        subjectUserIds: [developer.id],
        changes: [
          { field: 'deploymentId', from: null, to: randomUUID() },
          { field: 'status', from: 'deploying', to: 'failed' },
        ],
      },
    })
    expect(releaseFailurePublish.status).toBe(200)
    expect(Number(releaseFailurePublish.body?.published || 0)).toBeGreaterThan(0)

    const fullInbox = await apiRequest(app, `/api/notifications?productId=${encodeURIComponent(productId)}&limit=50`, {
      method: 'GET',
      token: developerToken,
    })
    expect(fullInbox.status).toBe(200)
    const fullItems = Array.isArray(fullInbox.body?.items) ? fullInbox.body.items : []
    expect(fullItems.length).toBeGreaterThan(0)

    const taskItems = fullItems.filter((item: any) => item?.entityType === 'task' && item?.entityId === taskEntityId)
    expect(taskItems.length).toBe(1)

    const assignmentItem = taskItems[0]
    expect(assignmentItem?.category).toBe('assignment')
    expect(assignmentItem?.urgency).toBe('action_required')
    const assignmentType = String(assignmentItem?.type || '')
    expect(assignmentType.length).toBeGreaterThan(0)

    const filteredAssignmentInbox = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productId)}&category=assignment&urgency=action_required&entityType=task&type=${encodeURIComponent(assignmentType)}&limit=20`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(filteredAssignmentInbox.status).toBe(200)
    const filteredItems = Array.isArray(filteredAssignmentInbox.body?.items) ? filteredAssignmentInbox.body.items : []
    expect(filteredItems.length).toBe(1)
    expect(String(filteredItems[0]?.id || '')).toBe(String(assignmentItem?.id || ''))

    const markRead = await apiRequest(app, '/api/notifications/read', {
      method: 'POST',
      token: developerToken,
      body: { ids: [String(assignmentItem?.id || '')] },
    })
    expect(markRead.status).toBe(200)

    const unreadOnlyFilteredInbox = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productId)}&category=assignment&urgency=action_required&entityType=task&type=${encodeURIComponent(assignmentType)}&unreadOnly=true&limit=20`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(unreadOnlyFilteredInbox.status).toBe(200)
    expect(Array.isArray(unreadOnlyFilteredInbox.body?.items)).toBe(true)
    expect(unreadOnlyFilteredInbox.body.items.length).toBe(0)
  })

  it('emits story comment notifications from route-level producers', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'stories', FULL_PERMISSION)
    const productId = await createProduct(app, adminToken, `Notif Story Comment Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const storyCreate = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        title: 'Story with comments',
        ownerUserId: developer.id,
      },
    })
    expect(storyCreate.status).toBe(200)
    const storyId = String(storyCreate.body?.id || '')
    expect(storyId).not.toBe('')

    const commentCreate = await apiRequest(app, `/api/stories/${encodeURIComponent(storyId)}/comments`, {
      method: 'POST',
      token: adminToken,
      body: {
        content: 'Please review this story update.',
      },
    })
    expect(commentCreate.status).toBe(200)

    let storyItems: any[] = []
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const inboxAttempt = await apiRequest(
        app,
        `/api/notifications?productId=${encodeURIComponent(productId)}&entityType=story&limit=20`,
        {
          method: 'GET',
          token: developerToken,
        },
      )
      expect(inboxAttempt.status).toBe(200)
      storyItems = Array.isArray(inboxAttempt.body?.items) ? inboxAttempt.body.items : []
      if (storyItems.some((item: any) =>
        String(item?.entityId || '') === storyId
        && String(item?.type || '').includes('comment_added')
      )) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(storyItems.some((item: any) =>
      String(item?.entityId || '') === storyId
      && String(item?.type || '').includes('comment_added')
    )).toBe(true)
  })

  it('emits release failure notifications from deployment-target failure routes', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'releases', FULL_PERMISSION)
    const productId = await createProduct(app, adminToken, `Notif Release Failure Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const serverCreate = await apiRequest(app, '/api/servers', {
      method: 'POST',
      token: adminToken,
      body: {
        name: `notif-server-${Date.now()}`,
        environment: 'dev',
        productId,
      },
    })
    expect(serverCreate.status).toBe(200)
    const serverId = String(serverCreate.body?.id || '')
    expect(serverId).not.toBe('')

    const releaseCreate = await apiRequest(app, '/api/releases', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        title: 'Release with failure path',
        releaseManagerId: developer.id,
      },
    })
    expect(releaseCreate.status).toBe(200)
    const releaseId = String(releaseCreate.body?.id || '')
    expect(releaseId).not.toBe('')

    const releaseDetail = await apiRequest(app, `/api/releases/${encodeURIComponent(releaseId)}`, {
      method: 'GET',
      token: adminToken,
    })
    expect(releaseDetail.status).toBe(200)
    const deployments = Array.isArray(releaseDetail.body?.releaseDeployments)
      ? releaseDetail.body.releaseDeployments
      : []
    expect(deployments.length).toBeGreaterThan(0)
    const deploymentId = String(deployments[0]?.id || '')
    expect(deploymentId).not.toBe('')

    const targetAdd = await apiRequest(
      app,
      `/api/releases/${encodeURIComponent(releaseId)}/deployments/${encodeURIComponent(deploymentId)}/targets`,
      {
        method: 'POST',
        token: adminToken,
        body: { serverIds: [serverId] },
      },
    )
    expect(targetAdd.status).toBe(200)
    const targets = Array.isArray(targetAdd.body) ? targetAdd.body : []
    expect(targets.length).toBeGreaterThan(0)
    const targetId = String(targets[0]?.id || '')
    expect(targetId).not.toBe('')

    const markFailed = await apiRequest(
      app,
      `/api/releases/${encodeURIComponent(releaseId)}/deployments/${encodeURIComponent(deploymentId)}/targets/${encodeURIComponent(targetId)}`,
      {
        method: 'PUT',
        token: adminToken,
        body: { status: 'failed' },
      },
    )
    expect(markFailed.status).toBe(200)

    let releaseItems: any[] = []
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const releaseFailureInboxAttempt = await apiRequest(
        app,
        `/api/notifications?productId=${encodeURIComponent(productId)}&category=release&urgency=action_required&entityType=release&limit=30`,
        {
          method: 'GET',
          token: developerToken,
        },
      )
      expect(releaseFailureInboxAttempt.status).toBe(200)
      releaseItems = Array.isArray(releaseFailureInboxAttempt.body?.items)
        ? releaseFailureInboxAttempt.body.items
        : []
      if (releaseItems.some((item: any) =>
        String(item?.entityId || '') === releaseId
        && String(item?.type || '').includes('deployment')
        && String(item?.severity || '') === 'high'
      )) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(releaseItems.some((item: any) =>
      String(item?.entityId || '') === releaseId
      && String(item?.type || '').includes('deployment')
      && String(item?.severity || '') === 'high'
    )).toBe(true)
  })

  it('returns facets with filtered unread count and friendly type labels', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)
    await grantRolePagePermission(app, adminToken, 'developer', 'stories', FULL_PERMISSION)

    const productId = await createProduct(app, adminToken, `Notif Facets Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const assignmentPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'task',
        entityId: randomUUID(),
        entityTitle: 'Facet Assignment',
        recipientUserIds: [developer.id],
        changes: [{ field: 'ownerUserId', from: null, to: developer.id }],
      },
    })
    expect(assignmentPublish.status).toBe(200)
    expect(Number(assignmentPublish.body?.published || 0)).toBeGreaterThan(0)

    const commentPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'created',
        entityType: 'story',
        entityId: randomUUID(),
        entityTitle: 'Facet Comment',
        recipientUserIds: [developer.id],
        changes: [
          { field: 'commentId', from: null, to: randomUUID() },
          { field: 'commentPreview', from: null, to: 'Please review this change' },
        ],
      },
    })
    expect(commentPublish.status).toBe(200)
    expect(Number(commentPublish.body?.published || 0)).toBeGreaterThan(0)

    const inbox = await apiRequest(app, `/api/notifications?productId=${encodeURIComponent(productId)}&limit=30`, {
      method: 'GET',
      token: developerToken,
    })
    expect(inbox.status).toBe(200)
    const items = Array.isArray(inbox.body?.items) ? inbox.body.items : []
    const assignmentItem = items.find((item: any) => String(item?.category || '') === 'assignment')
    expect(assignmentItem).toBeTruthy()

    const markRead = await apiRequest(app, '/api/notifications/read', {
      method: 'POST',
      token: developerToken,
      body: { ids: [String(assignmentItem?.id || '')] },
    })
    expect(markRead.status).toBe(200)

    const facets = await apiRequest(app, `/api/notifications/facets?productId=${encodeURIComponent(productId)}`, {
      method: 'GET',
      token: developerToken,
    })
    expect(facets.status).toBe(200)
    expect(Number(facets.body?.filteredUnreadCount || 0)).toBeGreaterThanOrEqual(1)
    const typeFacets = Array.isArray(facets.body?.typeFacets) ? facets.body.typeFacets : []
    expect(typeFacets.length).toBeGreaterThan(0)
    expect(String(typeFacets[0]?.label || '').length).toBeGreaterThan(0)

    const assignmentType = String(assignmentItem?.type || '')
    const assignmentUnreadFacets = await apiRequest(
      app,
      `/api/notifications/facets?productId=${encodeURIComponent(productId)}&type=${encodeURIComponent(assignmentType)}&unreadOnly=true`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(assignmentUnreadFacets.status).toBe(200)
    expect(Number(assignmentUnreadFacets.body?.filteredUnreadCount || 0)).toBe(0)
  })

  it('supports all-products semantics and advanced inbox filters', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)
    await grantRolePagePermission(app, adminToken, 'developer', 'stories', FULL_PERMISSION)

    const productA = await createProduct(app, adminToken, `Notif Filter Product A ${Date.now()}`)
    const productB = await createProduct(app, adminToken, `Notif Filter Product B ${Date.now()}`)
    await addProductMember(app, adminToken, productA, developer.id, 'member')
    await addProductMember(app, adminToken, productB, developer.id, 'member')

    const assignmentPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId: productA,
        action: 'updated',
        entityType: 'task',
        entityId: randomUUID(),
        entityTitle: 'Product A assignment',
        recipientUserIds: [developer.id],
        changes: [{ field: 'ownerUserId', from: null, to: developer.id }],
      },
    })
    expect(assignmentPublish.status).toBe(200)
    expect(Number(assignmentPublish.body?.published || 0)).toBeGreaterThan(0)

    const riskPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId: productA,
        action: 'updated',
        entityType: 'task',
        entityId: randomUUID(),
        entityTitle: 'Product A blocked task',
        recipientUserIds: [developer.id],
        changes: [{ field: 'status', from: 'in_progress', to: 'blocked' }],
      },
    })
    expect(riskPublish.status).toBe(200)
    expect(Number(riskPublish.body?.published || 0)).toBeGreaterThan(0)

    const workflowPublish = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId: productB,
        action: 'created',
        entityType: 'story',
        entityId: randomUUID(),
        entityTitle: 'Product B comment',
        recipientUserIds: [developer.id],
        changes: [
          { field: 'commentId', from: null, to: randomUUID() },
          { field: 'commentPreview', from: null, to: 'Cross-product workflow signal' },
        ],
      },
    })
    expect(workflowPublish.status).toBe(200)
    expect(Number(workflowPublish.body?.published || 0)).toBeGreaterThan(0)

    const allProductsInbox = await apiRequest(app, '/api/notifications?unreadOnly=true&limit=50', {
      method: 'GET',
      token: developerToken,
    })
    expect(allProductsInbox.status).toBe(200)
    const allItems = Array.isArray(allProductsInbox.body?.items) ? allProductsInbox.body.items : []
    const allProductIds = new Set(allItems.map((item: any) => String(item?.productId || '')))
    expect(allProductIds.has(productA)).toBe(true)
    expect(allProductIds.has(productB)).toBe(true)

    const productScopedInbox = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productA)}&unreadOnly=true&limit=50`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(productScopedInbox.status).toBe(200)
    const productScopedItems = Array.isArray(productScopedInbox.body?.items) ? productScopedInbox.body.items : []
    expect(productScopedItems.length).toBeGreaterThan(0)
    expect(productScopedItems.every((item: any) => String(item?.productId || '') === productA)).toBe(true)

    const advancedFilteredInbox = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productA)}&category=risk&severity=high&entityType=task&unreadOnly=true&limit=20`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(advancedFilteredInbox.status).toBe(200)
    const advancedItems = Array.isArray(advancedFilteredInbox.body?.items) ? advancedFilteredInbox.body.items : []
    expect(advancedItems.length).toBeGreaterThan(0)
    expect(advancedItems.every((item: any) =>
      String(item?.category || '') === 'risk'
      && String(item?.severity || '') === 'high'
      && String(item?.entityType || '') === 'task'
    )).toBe(true)

    const advancedFacets = await apiRequest(
      app,
      `/api/notifications/facets?productId=${encodeURIComponent(productA)}&category=risk&severity=high&entityType=task&unreadOnly=true`,
      {
        method: 'GET',
        token: developerToken,
      },
    )
    expect(advancedFacets.status).toBe(200)
    expect(Number(advancedFacets.body?.filteredUnreadCount || 0)).toBeGreaterThan(0)
  })

  it('normalizes task comment route events into canonical notification types', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)
    await grantRolePagePermission(app, adminToken, 'developer', 'stories', FULL_PERMISSION)

    const productId = await createProduct(app, adminToken, `Notif Task Comment Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, developer.id, 'member')

    const storyId = await createStory(app, adminToken, productId, developer.id, 'Story for task comments')
    const taskId = await createTaskByStory(app, adminToken, storyId, {
      title: 'Task with route comment notification',
      ownerUserId: developer.id,
    })

    const commentCreate = await apiRequest(app, `/api/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: 'POST',
      token: adminToken,
      body: { content: 'Task route comment for canonical notification typing' },
    })
    expect(commentCreate.status).toBe(200)

    let taskItems: any[] = []
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const inboxAttempt = await apiRequest(
        app,
        `/api/notifications?productId=${encodeURIComponent(productId)}&entityType=task&limit=30`,
        {
          method: 'GET',
          token: developerToken,
        },
      )
      expect(inboxAttempt.status).toBe(200)
      taskItems = Array.isArray(inboxAttempt.body?.items) ? inboxAttempt.body.items : []
      if (taskItems.some((item: any) =>
        String(item?.entityId || '') === taskId
        && String(item?.type || '').includes('comment_added')
      )) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const commentNotification = taskItems.find((item: any) =>
      String(item?.entityId || '') === taskId
      && String(item?.type || '').includes('comment_added')
    )
    expect(commentNotification).toBeTruthy()
    expect(String(commentNotification?.category || '')).toBe('workflow')
  })

  it('targets assignment events to assignees without broad stakeholder fanout', async () => {
    const app = await createTestApp()
    const { token: adminToken } = await registerAndLogin(app, 'super_admin')
    const { token: assigneeToken, user: assignee } = await registerAndLogin(app, 'developer')
    const { token: watcherToken, user: watcher } = await registerAndLogin(app, 'developer')

    await grantRolePagePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)
    await grantRolePagePermission(app, adminToken, 'developer', 'stories', FULL_PERMISSION)

    const productId = await createProduct(app, adminToken, `Notif Recipient Policy Product ${Date.now()}`)
    await addProductMember(app, adminToken, productId, assignee.id, 'member')
    await addProductMember(app, adminToken, productId, watcher.id, 'member')

    const storyId = await createStory(app, adminToken, productId, watcher.id, 'Recipient targeting story')
    const taskId = await createTaskByStory(app, adminToken, storyId, {
      title: 'Recipient targeting task',
      ownerUserId: watcher.id,
    })

    const publishResponse = await apiRequest(app, '/api/notifications/admin/publish', {
      method: 'POST',
      token: adminToken,
      body: {
        productId,
        action: 'updated',
        entityType: 'task',
        entityId: taskId,
        entityTitle: 'Recipient targeting task',
        changes: [
          { field: 'ownerUserId', from: null, to: assignee.id },
        ],
      },
    })
    expect(publishResponse.status).toBe(200)
    expect(Number(publishResponse.body?.published || 0)).toBeGreaterThan(0)

    const assigneeInbox = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productId)}&entityType=task&limit=20`,
      {
        method: 'GET',
        token: assigneeToken,
      },
    )
    expect(assigneeInbox.status).toBe(200)
    const assigneeItems = Array.isArray(assigneeInbox.body?.items) ? assigneeInbox.body.items : []
    expect(assigneeItems.some((item: any) => String(item?.entityId || '') === taskId)).toBe(true)

    const watcherInbox = await apiRequest(
      app,
      `/api/notifications?productId=${encodeURIComponent(productId)}&entityType=task&limit=20`,
      {
        method: 'GET',
        token: watcherToken,
      },
    )
    expect(watcherInbox.status).toBe(200)
    const watcherItems = Array.isArray(watcherInbox.body?.items) ? watcherInbox.body.items : []
    expect(watcherItems.some((item: any) => String(item?.entityId || '') === taskId)).toBe(false)
  })

  it('generates proactive reminders and suppresses repeats within cooldown windows', async () => {
    const previousReminderFlag = process.env.NOTIFICATIONS_REMINDER_SCHEDULER_ENABLED
    const previousDailyRollupFlag = process.env.NOTIFICATIONS_DAILY_ROLLUP_ENABLED
    const previousDailyRollupHour = process.env.NOTIFICATIONS_DAILY_ROLLUP_HOUR_UTC
    process.env.NOTIFICATIONS_REMINDER_SCHEDULER_ENABLED = 'true'
    process.env.NOTIFICATIONS_DAILY_ROLLUP_ENABLED = 'true'
    process.env.NOTIFICATIONS_DAILY_ROLLUP_HOUR_UTC = '0'
    resetNotificationsConfigCacheForTests()

    try {
      const app = await createTestApp()
      const { token: adminToken } = await registerAndLogin(app, 'super_admin')
      const { token: developerToken, user: developer } = await registerAndLogin(app, 'developer')

      await grantRolePagePermission(app, adminToken, 'developer', 'tasks', FULL_PERMISSION)
      await grantRolePagePermission(app, adminToken, 'developer', 'stories', FULL_PERMISSION)
      await grantRolePagePermission(app, adminToken, 'developer', 'releases', FULL_PERMISSION)
      await grantRolePagePermission(app, adminToken, 'developer', 'issues', FULL_PERMISSION)
      await grantRolePagePermission(app, adminToken, 'developer', 'home', FULL_PERMISSION)

      const productId = await createProduct(app, adminToken, `Notif Reminder Product ${Date.now()}`)
      await addProductMember(app, adminToken, productId, developer.id, 'member')

      const storyId = await createStory(app, adminToken, productId, developer.id, 'Story for reminders')
      const overdueDueAt = new Date(Date.now() - 2 * 86400000).toISOString()
      const dueSoonAt = new Date(Date.now() + 2 * 3600000).toISOString()

      await createTaskByStory(app, adminToken, storyId, {
        title: 'Overdue reminder task',
        ownerUserId: developer.id,
        assigneeUserIds: [developer.id],
        status: 'in_progress',
        dueAt: overdueDueAt,
      })
      await createTaskByStory(app, adminToken, storyId, {
        title: 'Blocked dependency reminder task',
        ownerUserId: developer.id,
        assigneeUserIds: [developer.id],
        status: 'blocked',
        blockedReason: 'Waiting on upstream service rollout',
      })
      await createTaskByStory(app, adminToken, storyId, {
        title: 'Unassigned reminder task',
        reviewerUserIds: [developer.id],
        status: 'assigned',
      })
      await createTaskByStory(app, adminToken, storyId, {
        title: 'Due soon reminder task',
        ownerUserId: developer.id,
        assigneeUserIds: [developer.id],
        status: 'assigned',
        dueAt: dueSoonAt,
      })

      const releaseCreate = await apiRequest(app, '/api/releases', {
        method: 'POST',
        token: adminToken,
        body: {
          productId,
          title: 'Release failure reminder source',
          status: 'failed',
          releaseManagerId: developer.id,
        },
      })
      expect(releaseCreate.status).toBe(200)

      const issueCreate = await apiRequest(app, '/api/issues', {
        method: 'POST',
        token: adminToken,
        body: {
          productId,
          title: 'Open issue for rollup',
          assignedToUserId: developer.id,
          status: 'open',
        },
      })
      expect(issueCreate.status).toBe(200)

      const firstSweep = await runTaskReminderSweep(new Date())
      expect(firstSweep.published).toBeGreaterThan(0)

      const secondSweep = await runTaskReminderSweep(new Date())
      expect(secondSweep.published).toBe(0)
      expect(secondSweep.cooldownSkipped).toBeGreaterThan(0)

      const reminderInbox = await apiRequest(
        app,
        `/api/notifications?productId=${encodeURIComponent(productId)}&type=${encodeURIComponent('task.updated.reminder_overdue')}&limit=20`,
        {
          method: 'GET',
          token: developerToken,
        },
      )
      expect(reminderInbox.status).toBe(200)
      const reminderItems = Array.isArray(reminderInbox.body?.items) ? reminderInbox.body.items : []
      expect(reminderItems.length).toBeGreaterThan(0)

      const blockedReminderInbox = await apiRequest(
        app,
        `/api/notifications?productId=${encodeURIComponent(productId)}&type=${encodeURIComponent('task.updated.reminder_blocked_dependency')}&limit=20`,
        {
          method: 'GET',
          token: developerToken,
        },
      )
      expect(blockedReminderInbox.status).toBe(200)
      expect(Array.isArray(blockedReminderInbox.body?.items)).toBe(true)
      expect((blockedReminderInbox.body?.items || []).length).toBeGreaterThan(0)

      const unassignedReminderInbox = await apiRequest(
        app,
        `/api/notifications?productId=${encodeURIComponent(productId)}&type=${encodeURIComponent('task.updated.reminder_unassigned_work')}&limit=20`,
        {
          method: 'GET',
          token: developerToken,
        },
      )
      expect(unassignedReminderInbox.status).toBe(200)
      expect(Array.isArray(unassignedReminderInbox.body?.items)).toBe(true)
      expect((unassignedReminderInbox.body?.items || []).length).toBeGreaterThan(0)

      const releaseFailureReminderInbox = await apiRequest(
        app,
        `/api/notifications?productId=${encodeURIComponent(productId)}&type=${encodeURIComponent('release.updated.reminder_release_failure')}&limit=20`,
        {
          method: 'GET',
          token: developerToken,
        },
      )
      expect(releaseFailureReminderInbox.status).toBe(200)
      expect(Array.isArray(releaseFailureReminderInbox.body?.items)).toBe(true)
      expect((releaseFailureReminderInbox.body?.items || []).length).toBeGreaterThan(0)

      const dueSoonReminderInbox = await apiRequest(
        app,
        `/api/notifications?productId=${encodeURIComponent(productId)}&type=${encodeURIComponent('task.updated.reminder_due_soon')}&limit=20`,
        {
          method: 'GET',
          token: developerToken,
        },
      )
      expect(dueSoonReminderInbox.status).toBe(200)
      expect(Array.isArray(dueSoonReminderInbox.body?.items)).toBe(true)
      expect((dueSoonReminderInbox.body?.items || []).length).toBeGreaterThan(0)

      const firstRollup = await runDailyCrossViewRollupSweep(new Date())
      expect(firstRollup.candidates).toBeGreaterThan(0)
      expect(firstRollup.published).toBeGreaterThan(0)

      const secondRollup = await runDailyCrossViewRollupSweep(new Date())
      expect(secondRollup.published).toBe(0)
      expect(secondRollup.alreadySentToday).toBeGreaterThan(0)

      const rollupInbox = await apiRequest(
        app,
        `/api/notifications?type=${encodeURIComponent('digest.daily_cross_view')}&limit=20`,
        {
          method: 'GET',
          token: developerToken,
        },
      )
      expect(rollupInbox.status).toBe(200)
      const rollupItems = Array.isArray(rollupInbox.body?.items) ? rollupInbox.body.items : []
      expect(rollupItems.length).toBeGreaterThan(0)

      const disableRollup = await apiRequest(app, '/api/notifications/preferences', {
        method: 'PUT',
        token: developerToken,
        body: {
          preferences: [
            {
              category: 'digest',
              dailyRollupEnabled: false,
            },
          ],
        },
      })
      expect(disableRollup.status).toBe(200)

      const nextDayRollup = await runDailyCrossViewRollupSweep(new Date(Date.now() + 24 * 3600000))
      expect(nextDayRollup.published).toBe(0)

      const statsResponse = await apiRequest(app, '/api/notifications/admin/stats', {
        method: 'GET',
        token: adminToken,
      })
      expect(statsResponse.status).toBe(200)
      expect(Number(statsResponse.body?.stats?.reminderSweeps || 0)).toBeGreaterThan(0)
      expect(Number(statsResponse.body?.stats?.reminderPublished || 0)).toBeGreaterThan(0)
      expect(Number(statsResponse.body?.stats?.rollupSweeps || 0)).toBeGreaterThan(0)
      expect(Number(statsResponse.body?.stats?.rollupPublished || 0)).toBeGreaterThan(0)
    } finally {
      if (previousReminderFlag === undefined) {
        delete process.env.NOTIFICATIONS_REMINDER_SCHEDULER_ENABLED
      } else {
        process.env.NOTIFICATIONS_REMINDER_SCHEDULER_ENABLED = previousReminderFlag
      }
      if (previousDailyRollupFlag === undefined) {
        delete process.env.NOTIFICATIONS_DAILY_ROLLUP_ENABLED
      } else {
        process.env.NOTIFICATIONS_DAILY_ROLLUP_ENABLED = previousDailyRollupFlag
      }
      if (previousDailyRollupHour === undefined) {
        delete process.env.NOTIFICATIONS_DAILY_ROLLUP_HOUR_UTC
      } else {
        process.env.NOTIFICATIONS_DAILY_ROLLUP_HOUR_UTC = previousDailyRollupHour
      }
      resetNotificationsConfigCacheForTests()
    }
  })
})
