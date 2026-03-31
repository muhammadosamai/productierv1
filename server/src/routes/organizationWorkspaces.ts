import { Elysia, t } from 'elysia'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { organizationMembers, productMembers, products } from '../db/schema'
import { requireOrganizationAccess } from '../lib/authz'
import { logActivity } from '../lib/logActivity'
import { authPlugin } from '../plugins/auth'
import { productRoutes } from './products'
import {
  PRODUCT_CREATOR_MEMBER_ROLE,
  resolveProductMemberRole,
} from '../lib/productMembershipPolicy'

const ORGANIZATION_MANAGER_ROLES = ['owner', 'admin'] as const

export const organizationWorkspaceRoutes = new Elysia({ prefix: '/api/organizations/:organizationId/products' })
  .use(authPlugin)

  .get('/', async ({ params, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    return db.query.products.findMany({
      where: eq(products.organizationId, params.organizationId),
      orderBy: (table, { asc }) => [asc(table.name)],
    })
  })

  .post('/', async ({ params, body, set, jwt, headers }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
      [...ORGANIZATION_MANAGER_ROLES],
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const requestedMemberUserIds = (body.members || [])
      .map((member) => member.userId)
      .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)

    if (requestedMemberUserIds.length > 0) {
      const membershipRows = await db.query.organizationMembers.findMany({
        where: and(
          eq(organizationMembers.organizationId, params.organizationId),
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
        organizationId: params.organizationId,
        name: body.name,
        logo: body.logo || null,
        description: body.description || null,
        createdByUserId: access.user.id,
      }).returning()

      await db.insert(productMembers).values({
        productId: product!.id,
        userId: access.user.id,
        role: PRODUCT_CREATOR_MEMBER_ROLE,
      }).onConflictDoNothing()

      if (body.members && body.members.length > 0) {
        for (const member of body.members) {
          if (member.userId !== access.user.id) {
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
        userName: access.user.name,
        userAvatar: access.user.avatar,
        userId: access.user.id,
        action: 'created',
        entityType: 'product',
        entityId: product!.id,
        entityTitle: product!.name,
        routePathOverride: '/home',
        subjectUserIds: [access.user.id],
      })

      return product
    } catch (error: any) {
      if (error?.code === '23505') {
        set.status = 409
        return { error: 'A workspace with this name already exists in this organization' }
      }
      throw error
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      logo: t.Optional(t.Nullable(t.String())),
      description: t.Optional(t.Nullable(t.String())),
      members: t.Optional(t.Array(t.Object({
        userId: t.String(),
        role: t.Optional(t.String()),
      }))),
    }),
  })

  .post('/upload-logo', async ({ params, request, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
      [...ORGANIZATION_MANAGER_ROLES],
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const targetUrl = new URL(request.url)
    targetUrl.pathname = '/api/products/upload-logo'

    const forwardHeaders = new Headers(request.headers)
    forwardHeaders.set('x-productier-organization-id', params.organizationId)

    const forward = new Request(targetUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      duplex: 'half',
    } as RequestInit)
    return productRoutes.handle(forward)
  })
