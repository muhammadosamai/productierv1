import { Elysia, t } from 'elysia'
import { db } from '../db'
import { organizationMembers, products, productMembers, tasks, users } from '../db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { isGlobalAdminRole, requireAuth, requireOrganizationAccess, requirePageAction, requireProductPageAction } from '../lib/authz'
import { computeChanges, logActivity } from '../lib/logActivity'
import {
  PRODUCT_CREATOR_MEMBER_ROLE,
  PRODUCT_MEMBERSHIP_MANAGER_ROLES,
  resolveProductMemberRole,
} from '../lib/productMembershipPolicy'
import { getStorage } from '../storage'
import { ensureUserBelongsToProductOrganization } from '../lib/productMembershipGuards'

export const productRoutes = new Elysia({ prefix: '/api/products' })
  .use(authPlugin)

  // GET /api/products - List all products
  .get('/', async ({ jwt, headers, set, query }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const queryOrganizationId = typeof query.organizationId === 'string' ? query.organizationId.trim() : ''
    const headerOrganizationId = typeof headers['x-productier-organization-id'] === 'string'
      ? headers['x-productier-organization-id']!.trim()
      : ''
    const organizationId = queryOrganizationId || headerOrganizationId
    if (!organizationId) {
      set.status = 400
      return { error: 'organizationId is required' }
    }
    if (queryOrganizationId && headerOrganizationId && queryOrganizationId !== headerOrganizationId) {
      set.status = 400
      return { error: 'organizationId does not match scoped organization context' }
    }

    const organizationAccess = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    if (isGlobalAdminRole(user.role)) {
      return db.query.products.findMany({
        where: eq(products.organizationId, organizationId),
        orderBy: (items, { asc }) => [asc(items.name)],
      })
    }

    const memberships = await db.select({
      productId: productMembers.productId,
    }).from(productMembers)
      .innerJoin(products, eq(productMembers.productId, products.id))
      .where(and(
        eq(productMembers.userId, user.id),
        eq(products.organizationId, organizationId),
      ))
    const productIds = memberships.map((m) => m.productId)
    if (productIds.length === 0) return []

    return db.query.products.findMany({
      where: and(
        eq(products.organizationId, organizationId),
        inArray(products.id, productIds),
      ),
      orderBy: (items, { asc }) => [asc(items.name)],
    })
  }, {
    query: t.Object({
      organizationId: t.Optional(t.String()),
    }),
  })

  // POST /api/products - Create a new product
  .post('/', async ({ body, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    let organizationId = body.organizationId || null
    if (!organizationId) {
      const scopedOrganizationId = typeof headers['x-productier-organization-id'] === 'string'
        ? headers['x-productier-organization-id']!.trim()
        : ''
      organizationId = scopedOrganizationId || null
    }
    if (!organizationId) {
      set.status = 400
      return { error: 'organizationId is required to create a workspace' }
    }

    const organizationAccess = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      organizationId,
      ['owner', 'admin']
    )
    if (!organizationAccess) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const requestedMemberUserIds = (body.members || [])
      .map(member => member.userId)
      .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)

    if (requestedMemberUserIds.length > 0) {
      const membershipRows = await db.query.organizationMembers.findMany({
        where: and(
          eq(organizationMembers.organizationId, organizationId),
          inArray(organizationMembers.userId, requestedMemberUserIds),
        ),
        columns: { userId: true },
      })
      const memberSet = new Set(membershipRows.map((row) => row.userId))
      const hasOutOfOrganizationUser = requestedMemberUserIds.some((userId) => !memberSet.has(userId))
      if (hasOutOfOrganizationUser) {
        set.status = 400
        return { error: 'All workspace members must belong to the organization' }
      }
    }

    try {
      const [product] = await db.insert(products).values({
        organizationId,
        name: body.name,
        logo: body.logo || null,
        description: body.description || null,
        createdByUserId: user.id,
      }).returning()

      // Apply explicit membership policy for creator defaults.
      await db.insert(productMembers).values({
        productId: product!.id,
        userId: user.id,
        role: PRODUCT_CREATOR_MEMBER_ROLE,
      })

      // Add additional team members if provided
      if (body.members && body.members.length > 0) {
        for (const member of body.members) {
          if (member.userId !== user.id) {
            await db.insert(productMembers).values({
              productId: product!.id,
              userId: member.userId,
              role: resolveProductMemberRole(member.role),
            }).onConflictDoNothing()
          }
        }
      }

      logActivity({
        productId: product!.id,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'created',
        entityType: 'product',
        entityId: product!.id,
        entityTitle: product!.name,
        routePathOverride: '/home',
        subjectUserIds: [user.id],
      })

      return product
    } catch (e: any) {
      if (e.code === '23505') {
        set.status = 409
        return { error: 'A product with this name already exists' }
      }
      throw e
    }
  }, {
    body: t.Object({
      organizationId: t.Optional(t.String()),
      name: t.String({ minLength: 1 }),
      logo: t.Optional(t.Nullable(t.String())),
      description: t.Optional(t.Nullable(t.String())),
      members: t.Optional(t.Array(t.Object({
        userId: t.String(),
        role: t.Optional(t.String()),
      }))),
    }),
  })

  // PATCH /api/products/:productId/settings/metrics - Update product metrics settings
  .patch('/:productId/settings/metrics', async ({ params: { productId }, body, set, jwt, headers }) => {
    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'settings',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    if (!Number.isInteger(body.overloadWipThreshold)) {
      set.status = 400
      return { error: 'overloadWipThreshold must be an integer' }
    }

    const existing = await db.query.products.findFirst({
      where: eq(products.id, productId),
      columns: {
        id: true,
        name: true,
        metricsOverloadWipThreshold: true,
      },
    })
    if (!existing) {
      set.status = 404
      return { error: 'Product not found' }
    }

    const [updated] = await db.update(products)
      .set({ metricsOverloadWipThreshold: body.overloadWipThreshold })
      .where(eq(products.id, productId))
      .returning({
        productId: products.id,
        metricsOverloadWipThreshold: products.metricsOverloadWipThreshold,
      })

    if (!updated) {
      set.status = 404
      return { error: 'Product not found' }
    }

    const changes = computeChanges(existing, {
      metricsOverloadWipThreshold: body.overloadWipThreshold,
    }, ['metricsOverloadWipThreshold'])
    if (changes.length > 0) {
      logActivity({
        productId,
        userName: access.user.name,
        userAvatar: access.user.avatar,
        userId: access.user.id,
        action: 'updated',
        entityType: 'product',
        entityId: existing.id,
        entityTitle: existing.name,
        changes,
        routePathOverride: '/home',
      })
    }

    return updated
  }, {
    body: t.Object({
      overloadWipThreshold: t.Number({ minimum: 1, maximum: 100 }),
    }),
  })

  // GET /api/products/:productId/members
  .get('/:productId/members', async ({ params: { productId }, jwt, headers, set }) => {
    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'team',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const members = await db
      .select({
        id: productMembers.id,
        productId: productMembers.productId,
        role: productMembers.role,
        addedAt: productMembers.addedAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatar,
        userRole: users.role,
        userCreatedAt: users.createdAt,
      })
      .from(productMembers)
      .innerJoin(users, eq(productMembers.userId, users.id))
      .where(eq(productMembers.productId, productId))

    const countsByUser = new Map<string, { tasksAssigned: number; tasksCompleted: number }>()
    for (const member of members) {
      countsByUser.set(member.userId, { tasksAssigned: 0, tasksCompleted: 0 })
    }

    const memberUserIds = members.map((member) => member.userId)
    if (memberUserIds.length > 0) {
      const userIdsArraySql = sql`array[${sql.join(memberUserIds.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`
      const taskRows = await db.execute(sql`
        select owner_user_id, assignee_user_ids, status
        from ${tasks}
        where product_id = ${productId}::uuid
          and (
            owner_user_id = any(${userIdsArraySql})
            or (assignee_user_ids is not null and assignee_user_ids && ${userIdsArraySql})
          )
      `)

      for (const row of taskRows as any[]) {
        const involved = new Set<string>()
        const ownerId = typeof row.owner_user_id === 'string' ? row.owner_user_id : null
        if (ownerId && countsByUser.has(ownerId)) involved.add(ownerId)

        const assignees = Array.isArray(row.assignee_user_ids)
          ? row.assignee_user_ids as string[]
          : []
        for (const assigneeId of assignees) {
          if (countsByUser.has(assigneeId)) involved.add(assigneeId)
        }

        for (const involvedUserId of involved) {
          const current = countsByUser.get(involvedUserId)
          if (!current) continue
          current.tasksAssigned += 1
          if (row.status === 'done') current.tasksCompleted += 1
        }
      }
    }

    return members.map((member) => ({
      ...member,
      tasksAssigned: countsByUser.get(member.userId)?.tasksAssigned ?? 0,
      tasksCompleted: countsByUser.get(member.userId)?.tasksCompleted ?? 0,
    }))
  })

  // POST /api/products/:productId/members
  .post('/:productId/members', async ({ params: { productId }, body, set, jwt, headers }) => {
    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'team',
      action: 'create',
      requiredProductRoles: [...PRODUCT_MEMBERSHIP_MANAGER_ROLES],
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const membershipGuard = await ensureUserBelongsToProductOrganization({
      productId,
      userId: body.userId,
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
      set.status = 400
      return { error: 'User must belong to the workspace organization before being added' }
    }

    try {
      const [member] = await db.insert(productMembers).values({
        productId,
        userId: body.userId,
        role: resolveProductMemberRole(body.role),
      }).returning()

      // Return with user info
      const user = await db.query.users.findFirst({
        where: eq(users.id, body.userId),
      })

      logActivity({
        productId,
        userName: access.user.name,
        userAvatar: access.user.avatar,
        userId: access.user.id,
        action: 'updated',
        entityType: 'user',
        entityId: body.userId,
        entityTitle: user?.name || body.userId,
        changes: [{
          field: 'productMembershipRole',
          from: null,
          to: member?.role || null,
        }],
        routePathOverride: `/products/${productId}`,
        subjectUserIds: [body.userId],
      })

      return {
        ...member,
        userName: user?.name,
        userAvatar: user?.avatar,
        userRole: user?.role,
      }
    } catch (e: any) {
      if (e.code === '23505') { // unique constraint violation
        set.status = 409
        return { error: 'User is already a member of this product' }
      }
      throw e
    }
  }, {
    body: t.Object({
      userId: t.String(),
      role: t.Optional(t.String()),
    }),
  })

  // DELETE /api/products/:productId/members/:userId
  .delete('/:productId/members/:userId', async ({ params: { productId, userId }, set, jwt, headers }) => {
    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'team',
      action: 'delete',
      requiredProductRoles: [...PRODUCT_MEMBERSHIP_MANAGER_ROLES],
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [deleted] = await db.delete(productMembers)
      .where(and(
        eq(productMembers.productId, productId),
        eq(productMembers.userId, userId),
      ))
      .returning()

    if (!deleted) {
      set.status = 404
      return { error: 'Member not found' }
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, name: true },
    })
    logActivity({
      productId,
      userName: access.user.name,
      userAvatar: access.user.avatar,
      userId: access.user.id,
      action: 'updated',
      entityType: 'user',
      entityId: userId,
      entityTitle: targetUser?.name || userId,
      changes: [{
        field: 'productMembershipRole',
        from: deleted.role || null,
        to: null,
      }],
      routePathOverride: `/products/${productId}`,
      subjectUserIds: [userId],
    })

    return { success: true }
  })

  // POST /api/products/upload-logo - Upload product logo image
  .post('/upload-logo', async ({ body, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (body.productId) {
      const access = await requireProductPageAction(jwt.verify, headers, set, {
        productId: body.productId,
        page: 'settings',
        action: 'edit',
      })
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    } else {
      const canCreateProduct = await requirePageAction(user, set, 'home', 'create')
      if (!canCreateProduct) return { error: 'Forbidden' }
    }

    const file = body.file
    if (!file) {
      set.status = 400
      return { error: 'No file provided' }
    }

    const ext = file.name.split('.').pop() || 'png'
    const filename = `product-${Date.now()}.${ext}`
    const storage = getStorage()
    const logo = (await storage.saveFile({
      namespace: 'logos',
      filename,
      contentType: file.type || 'application/octet-stream',
      bytes: new Uint8Array(await file.arrayBuffer()),
    })).publicPath

    return { logo }
  }, {
    body: t.Object({
      productId: t.Optional(t.String()),
      file: t.File({ maxSize: '5m', type: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] }),
    }),
  })
