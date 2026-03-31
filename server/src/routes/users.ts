import { Elysia, t } from 'elysia'
import { and, eq, ilike, inArray, or } from 'drizzle-orm'
import { db } from '../db'
import {
  organizationMembers,
  productMembers,
  products,
  titles,
  users,
  userTitles,
} from '../db/schema'
import { computeChanges, logActivity } from '../lib/logActivity'
import { authPlugin } from '../plugins/auth'
import { requireOrganizationAccess } from '../lib/authz'
import { resolveProductMemberRole } from '../lib/productMembershipPolicy'
import { ensureUserBelongsToProductOrganization } from '../lib/productMembershipGuards'

type UserRole =
  | 'super_admin'
  | 'admin'
  | 'product_admin'
  | 'product_manager'
  | 'business_analyst'
  | 'developer'
  | 'viewer'

const manageableRolesByActor: Record<UserRole, UserRole[]> = {
  super_admin: ['super_admin', 'admin', 'product_admin', 'product_manager', 'business_analyst', 'developer', 'viewer'],
  admin: ['admin', 'product_admin', 'product_manager', 'business_analyst', 'developer', 'viewer'],
  product_admin: ['product_manager', 'business_analyst', 'developer', 'viewer'],
  product_manager: [],
  business_analyst: [],
  developer: [],
  viewer: [],
}

function canManageUsers(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'product_admin'
}

function canManageUserTitles(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin'
}

function canAssignRole(actorRole: UserRole, nextRole: UserRole): boolean {
  return manageableRolesByActor[actorRole].includes(nextRole)
}

function isRetiredGlobalRole(role: UserRole): boolean {
  return role === 'super_admin'
}

const PRODUCT_MANAGEMENT_ROLES = ['owner', 'admin'] as const

async function listOrganizationUserIds(organizationId: string): Promise<string[]> {
  const rows = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.organizationId, organizationId),
    columns: { userId: true },
  })
  return Array.from(new Set(rows.map((row) => row.userId)))
}

async function listOrganizationProductIds(organizationId: string): Promise<string[]> {
  const rows = await db.query.products.findMany({
    where: eq(products.organizationId, organizationId),
    columns: { id: true },
  })
  return Array.from(new Set(rows.map((row) => row.id)))
}

async function getProductAdminManagedProductIds(
  actorUserId: string,
  organizationId: string,
): Promise<string[]> {
  const rows = await db.select({
    productId: productMembers.productId,
  }).from(productMembers)
    .innerJoin(products, eq(products.id, productMembers.productId))
    .where(and(
      eq(productMembers.userId, actorUserId),
      inArray(productMembers.role, [...PRODUCT_MANAGEMENT_ROLES]),
      eq(products.organizationId, organizationId),
    ))
  return Array.from(new Set(rows.map((row) => row.productId)))
}

async function isOrganizationUser(organizationId: string, userId: string): Promise<boolean> {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId),
    ),
    columns: { id: true },
  })
  return Boolean(membership?.id)
}

async function productAdminCanManageTargetUser(
  actorUserId: string,
  targetUserId: string,
  organizationId: string,
): Promise<boolean> {
  const managedProductIds = await getProductAdminManagedProductIds(actorUserId, organizationId)
  if (managedProductIds.length === 0) return false
  const overlap = await db.query.productMembers.findFirst({
    where: and(
      eq(productMembers.userId, targetUserId),
      inArray(productMembers.productId, managedProductIds),
    ),
    columns: { id: true },
  })
  return !!overlap
}

async function productAdminCanManageProduct(
  actorUserId: string,
  productId: string,
  organizationId: string,
): Promise<boolean> {
  const managedProductIds = await getProductAdminManagedProductIds(actorUserId, organizationId)
  return managedProductIds.includes(productId)
}

function sanitizeUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    avatar: user.avatar,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

type UserTitlePayload = {
  id: string
  key: string
  name: string
  isActive: boolean
} | null

function buildUserWithTitle<T extends ReturnType<typeof sanitizeUser>>(user: T, title: UserTitlePayload) {
  return {
    ...user,
    title,
    titleId: title?.id || null,
  }
}

async function resolveAuditProductId(actorUserId: string, preferredProductId?: string | null): Promise<string | null> {
  void actorUserId
  if (preferredProductId) return preferredProductId
  return null
}

async function logFailedRoleAssignment(input: {
  actor: { id: string; name: string; avatar: string | null }
  target: { id: string; name: string; role: string }
  nextRole: string
  reason: string
}): Promise<void> {
  const auditProductId = await resolveAuditProductId(input.actor.id)
  logActivity({
    productId: auditProductId,
    userName: input.actor.name,
    userAvatar: input.actor.avatar,
    userId: input.actor.id,
    action: 'failed',
    entityType: 'user',
    entityId: input.target.id,
    entityTitle: input.target.name,
    changes: [
      { field: 'roleAssignment.from', from: input.target.role, to: input.nextRole },
      { field: 'roleAssignment.reason', from: null, to: input.reason },
    ],
    routePathOverride: '/users',
    subjectUserIds: [input.target.id],
  })
}

async function getUserTitlePayload(userId: string): Promise<UserTitlePayload> {
  const rows = await db
    .select({
      id: titles.id,
      key: titles.key,
      name: titles.name,
      isActive: titles.isActive,
    })
    .from(userTitles)
    .innerJoin(titles, eq(userTitles.titleId, titles.id))
    .where(eq(userTitles.userId, userId))
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]!
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    isActive: row.isActive,
  }
}

export const usersRoutes = new Elysia({ prefix: '/api/organizations/:organizationId/users-admin' })
  .use(authPlugin)

  // GET /api/organizations/:organizationId/users-admin?q=...&role=...&active=true|false&limit=100
  .get('/', async ({ query, params, jwt: jwtInstance, headers, set }) => {
    const organizationId = params.organizationId
    const organizationAccess = await requireOrganizationAccess(
      jwtInstance.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const actor = organizationAccess.user
    const actorRole = actor.role as UserRole
    if (!canManageUsers(actorRole)) { set.status = 403; return { error: 'Forbidden' } }

    const organizationUserIds = await listOrganizationUserIds(organizationId)
    if (organizationUserIds.length === 0) {
      return []
    }
    const organizationUserIdSet = new Set(organizationUserIds)

    const conditions: any[] = [inArray(users.id, organizationUserIds)]
    let scopedMembershipRows: Array<{ userId: string; productId: string }> | null = null
    let scopedManagedProductIds: string[] = []
    if (actorRole === 'product_admin') {
      scopedManagedProductIds = await getProductAdminManagedProductIds(actor.id, organizationId)
      if (scopedManagedProductIds.length === 0) {
        return []
      }
      scopedMembershipRows = await db.query.productMembers.findMany({
        where: inArray(productMembers.productId, scopedManagedProductIds),
        columns: { userId: true, productId: true },
      })
      const scopedUserIds = Array.from(
        new Set(
          scopedMembershipRows
            .map((row) => row.userId)
            .filter((userId) => organizationUserIdSet.has(userId)),
        ),
      )
      if (scopedUserIds.length === 0) {
        return []
      }
      conditions.push(inArray(users.id, scopedUserIds))
      conditions.push(inArray(users.role, [...manageableRolesByActor.product_admin]))
    }

    if (query.q?.trim()) {
      conditions.push(or(
        ilike(users.name, `%${query.q.trim()}%`),
        ilike(users.email, `%${query.q.trim()}%`)
      )!)
    }
    if (query.role) {
      if (actorRole === 'product_admin' && !manageableRolesByActor.product_admin.includes(query.role as UserRole)) {
        return []
      }
      conditions.push(eq(users.role, query.role as any))
    }
    if (query.active !== undefined) {
      const active = query.active === 'true'
      conditions.push(eq(users.isActive, active))
    }

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 200)
    const rows = await db.query.users.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (u, { asc }) => [asc(u.name)],
      limit,
    })

    const userIds = rows.map(r => r.id)
    let memberships: Array<{ userId: string; productId: string }> = []
    if (userIds.length > 0) {
      if (actorRole === 'product_admin' && scopedMembershipRows) {
        const allowedSet = new Set(userIds)
        memberships = scopedMembershipRows
          .filter((row) => allowedSet.has(row.userId))
          .filter((row) => scopedManagedProductIds.includes(row.productId))
      } else {
        const organizationProductIds = await listOrganizationProductIds(organizationId)
        if (organizationProductIds.length > 0) {
          memberships = await db.query.productMembers.findMany({
            where: and(
              inArray(productMembers.userId, userIds),
              inArray(productMembers.productId, organizationProductIds),
            ),
            columns: { userId: true, productId: true },
          })
        }
      }
    }

    const membershipCountByUser = memberships.reduce<Record<string, number>>((acc, row) => {
      acc[row.userId] = (acc[row.userId] || 0) + 1
      return acc
    }, {})

    const titleRows = userIds.length > 0
      ? await db
        .select({
          userId: userTitles.userId,
          id: titles.id,
          key: titles.key,
          name: titles.name,
          isActive: titles.isActive,
        })
        .from(userTitles)
        .innerJoin(titles, eq(userTitles.titleId, titles.id))
        .where(inArray(userTitles.userId, userIds))
      : []
    const titleByUser = titleRows.reduce<Record<string, UserTitlePayload>>((acc, row) => {
      acc[row.userId] = {
        id: row.id,
        key: row.key,
        name: row.name,
        isActive: row.isActive,
      }
      return acc
    }, {})

    return rows.map((row) => ({
      ...buildUserWithTitle(sanitizeUser(row), titleByUser[row.id] || null),
      membershipsCount: membershipCountByUser[row.id] || 0,
    }))
  }, {
    query: t.Object({
      q: t.Optional(t.String()),
      role: t.Optional(t.String()),
      active: t.Optional(t.String()),
      limit: t.Optional(t.Numeric()),
    }),
  })

  // GET /api/organizations/:organizationId/users-admin/:id
  .get('/:id', async ({ params, jwt: jwtInstance, headers, set }) => {
    const organizationId = params.organizationId
    const organizationAccess = await requireOrganizationAccess(
      jwtInstance.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const actor = organizationAccess.user
    const actorRole = actor.role as UserRole
    if (!canManageUsers(actorRole) && actor.id !== params.id) { set.status = 403; return { error: 'Forbidden' } }

    const targetInOrganization = await isOrganizationUser(organizationId, params.id)
    if (!targetInOrganization) { set.status = 404; return { error: 'User not found in organization' } }

    const user = await db.query.users.findFirst({ where: eq(users.id, params.id) })
    if (!user) { set.status = 404; return { error: 'User not found' } }
    if (actorRole === 'product_admin' && actor.id !== user.id) {
      if (!manageableRolesByActor.product_admin.includes(user.role as UserRole)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const scoped = await productAdminCanManageTargetUser(actor.id, user.id, organizationId)
      if (!scoped) {
        set.status = 403
        return { error: 'Forbidden' }
      }
    }

    const organizationProductIds = await listOrganizationProductIds(organizationId)
    let memberships = organizationProductIds.length > 0
      ? await db.query.productMembers.findMany({
        where: and(
          eq(productMembers.userId, user.id),
          inArray(productMembers.productId, organizationProductIds),
        ),
        orderBy: (pm, { asc }) => [asc(pm.productId)],
      })
      : []
    if (actorRole === 'product_admin') {
      const managedProductIds = await getProductAdminManagedProductIds(actor.id, organizationId)
      const managedSet = new Set(managedProductIds)
      memberships = memberships.filter((membership) => managedSet.has(membership.productId))
    }

    return {
      ...buildUserWithTitle(sanitizeUser(user), await getUserTitlePayload(user.id)),
      memberships,
    }
  })

  // PUT /api/organizations/:organizationId/users-admin/:id/role
  .put('/:id/role', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const organizationId = params.organizationId
    const organizationAccess = await requireOrganizationAccess(
      jwtInstance.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const actor = organizationAccess.user
    if (!canManageUsers(actor.role as UserRole)) { set.status = 403; return { error: 'Forbidden' } }

    const targetInOrganization = await isOrganizationUser(organizationId, params.id)
    if (!targetInOrganization) { set.status = 404; return { error: 'User not found in organization' } }

    const target = await db.query.users.findFirst({ where: eq(users.id, params.id) })
    if (!target) { set.status = 404; return { error: 'User not found' } }

    const actorRole = actor.role as UserRole
    const nextRole = body.role as UserRole
    if (isRetiredGlobalRole(nextRole)) {
      set.status = 400
      return { error: 'The global super_admin role is retired. Assign admin and organization owner membership instead.' }
    }
    if (actorRole === 'product_admin') {
      if (!manageableRolesByActor.product_admin.includes(target.role as UserRole)) {
        set.status = 403
        return { error: 'Insufficient permission to manage this user' }
      }
      const scoped = await productAdminCanManageTargetUser(actor.id, target.id, organizationId)
      if (!scoped) {
        set.status = 403
        return { error: 'Forbidden' }
      }
    }
    if (!canAssignRole(actorRole, nextRole)) {
      await logFailedRoleAssignment({
        actor,
        target: { id: target.id, name: target.name, role: target.role },
        nextRole,
        reason: 'insufficient_role_scope',
      })
      set.status = 403
      return { error: 'Insufficient permission to assign this role' }
    }
    if (target.role === 'super_admin' && actorRole !== 'super_admin') {
      await logFailedRoleAssignment({
        actor,
        target: { id: target.id, name: target.name, role: target.role },
        nextRole,
        reason: 'super_admin_protected',
      })
      set.status = 403
      return { error: 'Only super admins can modify another super admin' }
    }

    const [updated] = await db.update(users)
      .set({ role: body.role, updatedAt: new Date() })
      .where(eq(users.id, params.id))
      .returning()

    const changes = computeChanges(target, { role: body.role }, ['role'])
    if (changes.length > 0) {
      const auditProductId = await resolveAuditProductId(actor.id)
      logActivity({
        productId: auditProductId,
        userName: actor.name,
        userAvatar: actor.avatar,
        userId: actor.id,
        action: 'updated',
        entityType: 'user',
        entityId: updated!.id,
        entityTitle: updated!.name,
        changes,
      })
    }

    return sanitizeUser(updated)
  }, {
    body: t.Object({
      role: t.Union([
        t.Literal('admin'),
        t.Literal('product_admin'),
        t.Literal('product_manager'),
        t.Literal('business_analyst'),
        t.Literal('developer'),
        t.Literal('viewer'),
      ]),
    }),
  })

  // PUT /api/organizations/:organizationId/users-admin/:id/status
  .put('/:id/status', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const organizationId = params.organizationId
    const organizationAccess = await requireOrganizationAccess(
      jwtInstance.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const actor = organizationAccess.user
    if (!canManageUsers(actor.role as UserRole)) { set.status = 403; return { error: 'Forbidden' } }
    if (actor.id === params.id && body.isActive === false) {
      set.status = 400
      return { error: 'You cannot deactivate your own account' }
    }

    const targetInOrganization = await isOrganizationUser(organizationId, params.id)
    if (!targetInOrganization) { set.status = 404; return { error: 'User not found in organization' } }

    const target = await db.query.users.findFirst({ where: eq(users.id, params.id) })
    if (!target) { set.status = 404; return { error: 'User not found' } }
    if (actor.role === 'product_admin') {
      if (!manageableRolesByActor.product_admin.includes(target.role as UserRole)) {
        set.status = 403
        return { error: 'Insufficient permission to manage this user' }
      }
      const scoped = await productAdminCanManageTargetUser(actor.id, target.id, organizationId)
      if (!scoped) {
        set.status = 403
        return { error: 'Forbidden' }
      }
    }

    if (target.role === 'super_admin' && actor.role !== 'super_admin') {
      set.status = 403
      return { error: 'Only super admins can modify another super admin' }
    }

    const [updated] = await db.update(users)
      .set({ isActive: body.isActive, updatedAt: new Date() })
      .where(eq(users.id, params.id))
      .returning()

    const changes = computeChanges(target, { isActive: body.isActive }, ['isActive'])
    if (changes.length > 0) {
      const auditProductId = await resolveAuditProductId(actor.id)
      logActivity({
        productId: auditProductId,
        userName: actor.name,
        userAvatar: actor.avatar,
        userId: actor.id,
        action: 'updated',
        entityType: 'user',
        entityId: updated!.id,
        entityTitle: updated!.name,
        changes,
      })
    }

    return sanitizeUser(updated)
  }, {
    body: t.Object({
      isActive: t.Boolean(),
    }),
  })

  // GET /api/organizations/:organizationId/users-admin/:id/memberships
  .get('/:id/memberships', async ({ params, jwt: jwtInstance, headers, set }) => {
    const organizationId = params.organizationId
    const organizationAccess = await requireOrganizationAccess(
      jwtInstance.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const actor = organizationAccess.user
    const actorRole = actor.role as UserRole
    if (!canManageUsers(actorRole) && actor.id !== params.id) { set.status = 403; return { error: 'Forbidden' } }

    const targetInOrganization = await isOrganizationUser(organizationId, params.id)
    if (!targetInOrganization) { set.status = 404; return { error: 'User not found in organization' } }

    if (actorRole === 'product_admin' && actor.id !== params.id) {
      const target = await db.query.users.findFirst({
        where: eq(users.id, params.id),
        columns: { id: true, role: true },
      })
      if (!target) { set.status = 404; return { error: 'User not found' } }
      if (!manageableRolesByActor.product_admin.includes(target.role as UserRole)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const scoped = await productAdminCanManageTargetUser(actor.id, target.id, organizationId)
      if (!scoped) {
        set.status = 403
        return { error: 'Forbidden' }
      }
    }

    const organizationProductIds = await listOrganizationProductIds(organizationId)
    let memberships = organizationProductIds.length > 0
      ? await db.query.productMembers.findMany({
        where: and(
          eq(productMembers.userId, params.id),
          inArray(productMembers.productId, organizationProductIds),
        ),
        orderBy: (pm, { asc }) => [asc(pm.productId)],
      })
      : []
    if (actorRole === 'product_admin') {
      const managedProductIds = await getProductAdminManagedProductIds(actor.id, organizationId)
      const managedSet = new Set(managedProductIds)
      memberships = memberships.filter((membership) => managedSet.has(membership.productId))
    }
    return memberships
  })

  // PUT /api/organizations/:organizationId/users-admin/:id/title
  .put('/:id/title', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const organizationId = params.organizationId
    const organizationAccess = await requireOrganizationAccess(
      jwtInstance.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const actor = organizationAccess.user
    if (!canManageUserTitles(actor.role as UserRole)) { set.status = 403; return { error: 'Forbidden' } }

    const targetInOrganization = await isOrganizationUser(organizationId, params.id)
    if (!targetInOrganization) { set.status = 404; return { error: 'User not found in organization' } }

    const target = await db.query.users.findFirst({ where: eq(users.id, params.id) })
    if (!target) { set.status = 404; return { error: 'User not found' } }

    if (target.role === 'super_admin' && actor.role !== 'super_admin') {
      set.status = 403
      return { error: 'Only super admins can modify another super admin' }
    }

    const previousTitle = await getUserTitlePayload(target.id)

    if (body.titleId === null) {
      await db.delete(userTitles).where(eq(userTitles.userId, target.id))

      const auditProductId = await resolveAuditProductId(actor.id)
      if (previousTitle) {
        logActivity({
          productId: auditProductId,
          userName: actor.name,
          userAvatar: actor.avatar,
          userId: actor.id,
          action: 'updated',
          entityType: 'user',
          entityId: target.id,
          entityTitle: target.name,
          changes: [{
            field: 'titleId',
            from: previousTitle.id,
            to: null,
          }],
          routePathOverride: '/users',
          subjectUserIds: [target.id],
        })
      }

      return buildUserWithTitle(sanitizeUser(target), null)
    }

    const title = await db.query.titles.findFirst({
      where: eq(titles.id, body.titleId),
    })
    if (!title) { set.status = 404; return { error: 'Title not found' } }
    if (!title.isActive) { set.status = 400; return { error: 'Cannot assign an archived title' } }

    const existingAssignment = await db.query.userTitles.findFirst({
      where: eq(userTitles.userId, target.id),
    })
    if (existingAssignment) {
      await db.update(userTitles)
        .set({
          titleId: title.id,
          assignedByUserId: actor.id,
          assignedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userTitles.id, existingAssignment.id))
    } else {
      await db.insert(userTitles).values({
        userId: target.id,
        titleId: title.id,
        assignedByUserId: actor.id,
        assignedAt: new Date(),
      })
    }

    const auditProductId = await resolveAuditProductId(actor.id)
    const changes = computeChanges({
      titleId: previousTitle?.id || null,
      titleName: previousTitle?.name || null,
    }, {
      titleId: title.id,
      titleName: title.name,
    }, ['titleId', 'titleName'])

    if (changes.length > 0) {
      logActivity({
        productId: auditProductId,
        userName: actor.name,
        userAvatar: actor.avatar,
        userId: actor.id,
        action: 'updated',
        entityType: 'user',
        entityId: target.id,
        entityTitle: target.name,
        changes,
        routePathOverride: '/users',
        subjectUserIds: [target.id],
      })
    }

    return buildUserWithTitle(sanitizeUser(target), {
      id: title.id,
      key: title.key,
      name: title.name,
      isActive: title.isActive,
    })
  }, {
    body: t.Object({
      titleId: t.Union([t.String({ minLength: 1 }), t.Null()]),
    }),
  })

  // POST /api/organizations/:organizationId/users-admin/:id/memberships
  .post('/:id/memberships', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const organizationId = params.organizationId
    const organizationAccess = await requireOrganizationAccess(
      jwtInstance.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const actor = organizationAccess.user
    const actorRole = actor.role as UserRole
    if (!canManageUsers(actorRole)) { set.status = 403; return { error: 'Forbidden' } }

    const targetInOrganization = await isOrganizationUser(organizationId, params.id)
    if (!targetInOrganization) { set.status = 404; return { error: 'User not found in organization' } }

    const scopedProduct = await db.query.products.findFirst({
      where: and(
        eq(products.id, body.productId),
        eq(products.organizationId, organizationId),
      ),
      columns: { id: true },
    })
    if (!scopedProduct) { set.status = 404; return { error: 'Workspace not found' } }

    const target = await db.query.users.findFirst({ where: eq(users.id, params.id) })
    if (!target) { set.status = 404; return { error: 'User not found' } }
    if (actorRole === 'product_admin') {
      if (!manageableRolesByActor.product_admin.includes(target.role as UserRole)) {
        set.status = 403
        return { error: 'Insufficient permission to manage this user' }
      }
      const canManageProduct = await productAdminCanManageProduct(actor.id, body.productId, organizationId)
      if (!canManageProduct) {
        set.status = 403
        return { error: 'Forbidden' }
      }
    }

    const membershipGuard = await ensureUserBelongsToProductOrganization({
      productId: body.productId,
      userId: params.id,
    })
    if (!membershipGuard.ok) {
      if (membershipGuard.reason === 'product_not_found') {
        set.status = 404
        return { error: 'Workspace not found' }
      }
      if (membershipGuard.reason === 'product_without_organization') {
        set.status = 409
        return { error: 'Workspace is missing an organization binding' }
      }
      if (membershipGuard.organizationId && membershipGuard.organizationId !== organizationId) {
        set.status = 404
        return { error: 'Workspace not found' }
      }
      set.status = 400
      return { error: 'User must belong to the workspace organization before assigning membership' }
    }

    const existing = await db.query.productMembers.findFirst({
      where: and(eq(productMembers.userId, params.id), eq(productMembers.productId, body.productId)),
    })

    if (existing) {
      const [updated] = await db.update(productMembers)
        .set({ role: resolveProductMemberRole(body.role, existing.role) })
        .where(eq(productMembers.id, existing.id))
        .returning()

      const auditProductId = await resolveAuditProductId(actor.id, body.productId)
      if (auditProductId) {
        const changes = computeChanges(existing, { role: updated?.role || existing.role }, ['role'])
        if (changes.length > 0) {
          logActivity({
            productId: auditProductId,
            userName: actor.name,
            userAvatar: actor.avatar,
            userId: actor.id,
            action: 'updated',
            entityType: 'user',
            entityId: target.id,
            entityTitle: target.name,
            changes: changes.map((change) => ({ ...change, field: 'productMembershipRole' })),
            routePathOverride: `/products/${body.productId}`,
            subjectUserIds: [target.id],
          })
        }
      }

      return updated
    }

    const [created] = await db.insert(productMembers).values({
      userId: params.id,
      productId: body.productId,
      role: resolveProductMemberRole(body.role),
    }).returning()

    const auditProductId = await resolveAuditProductId(actor.id, body.productId)
    if (auditProductId) {
      logActivity({
        productId: auditProductId,
        userName: actor.name,
        userAvatar: actor.avatar,
        userId: actor.id,
        action: 'updated',
        entityType: 'user',
        entityId: target.id,
        entityTitle: target.name,
        changes: [{
          field: 'productMembershipRole',
          from: null,
          to: created?.role || null,
        }],
        routePathOverride: `/products/${body.productId}`,
        subjectUserIds: [target.id],
      })
    }

    return created
  }, {
    body: t.Object({
      productId: t.String({ minLength: 1 }),
      role: t.Optional(t.String()),
    }),
  })

  // DELETE /api/organizations/:organizationId/users-admin/:id/memberships/:productId
  .delete('/:id/memberships/:productId', async ({ params, jwt: jwtInstance, headers, set }) => {
    const organizationId = params.organizationId
    const organizationAccess = await requireOrganizationAccess(
      jwtInstance.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const actor = organizationAccess.user
    const actorRole = actor.role as UserRole
    if (!canManageUsers(actorRole)) { set.status = 403; return { error: 'Forbidden' } }

    const targetInOrganization = await isOrganizationUser(organizationId, params.id)
    if (!targetInOrganization) { set.status = 404; return { error: 'User not found in organization' } }

    const scopedProduct = await db.query.products.findFirst({
      where: and(
        eq(products.id, params.productId),
        eq(products.organizationId, organizationId),
      ),
      columns: { id: true },
    })
    if (!scopedProduct) { set.status = 404; return { error: 'Workspace not found' } }

    const target = await db.query.users.findFirst({
      where: eq(users.id, params.id),
      columns: { id: true, name: true, role: true },
    })
    if (!target) { set.status = 404; return { error: 'User not found' } }
    if (actorRole === 'product_admin') {
      if (!manageableRolesByActor.product_admin.includes(target.role as UserRole)) {
        set.status = 403
        return { error: 'Insufficient permission to manage this user' }
      }
      const canManageProduct = await productAdminCanManageProduct(actor.id, params.productId, organizationId)
      if (!canManageProduct) {
        set.status = 403
        return { error: 'Forbidden' }
      }
    }

    const [deleted] = await db.delete(productMembers)
      .where(and(eq(productMembers.userId, params.id), eq(productMembers.productId, params.productId)))
      .returning()

    if (!deleted) { set.status = 404; return { error: 'Membership not found' } }
    const auditProductId = await resolveAuditProductId(actor.id, params.productId)
    if (auditProductId) {
      logActivity({
        productId: auditProductId,
        userName: actor.name,
        userAvatar: actor.avatar,
        userId: actor.id,
        action: 'updated',
        entityType: 'user',
        entityId: params.id,
        entityTitle: target.name || params.id,
        changes: [{
          field: 'productMembershipRole',
          from: deleted.role || null,
          to: null,
        }],
        routePathOverride: `/products/${params.productId}`,
        subjectUserIds: [params.id],
      })
    }

    return { success: true }
  })
