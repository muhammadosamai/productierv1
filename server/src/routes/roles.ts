import { Elysia, t } from 'elysia'
import { db } from '../db'
import { rolePermissions, users } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

async function getUserFromHeader(jwtVerify: any, headers: Record<string, string | undefined>) {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const payload = await jwtVerify(token)
  if (!payload?.userId) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId as string) })
  return user || null
}

const CONTROLLABLE_PAGES = [
  'home', 'overview', 'wiki', 'team', 'initiatives', 'stories', 'tasks',
  'deliveries', 'releases', 'test-cycles', 'issues', 'feedbacks',
  'feature-requests', 'users', 'integrations', 'settings',
]

export const rolesRoutes = new Elysia({ prefix: '/api/roles' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/roles/permissions — All role permissions (super_admin only)
  .get('/permissions', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }
    if (user.role !== 'super_admin') { set.status = 403; return { error: 'Forbidden' } }

    const perms = await db.select().from(rolePermissions)

    // Build a map: { role: { page: { visible, canCreate, canEdit } } }
    const result: Record<string, Record<string, { visible: boolean; canCreate: boolean; canEdit: boolean; selfViewOnly: boolean }>> = {}
    for (const p of perms) {
      if (!result[p.role]) result[p.role] = {}
      result[p.role][p.page] = {
        visible: p.visible,
        canCreate: p.canCreate,
        canEdit: p.canEdit,
        selfViewOnly: p.selfViewOnly,
      }
    }

    return { permissions: result, pages: CONTROLLABLE_PAGES }
  })

  // PUT /api/roles/permissions — Bulk update permissions for a role (super_admin only)
  .put('/permissions', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }
    if (user.role !== 'super_admin') { set.status = 403; return { error: 'Forbidden' } }

    const { role, pages } = body as { role: string; pages: Record<string, { visible: boolean; canCreate: boolean; canEdit: boolean; selfViewOnly: boolean }> }

    // Don't allow modifying super_admin permissions
    if (role === 'super_admin') {
      set.status = 400
      return { error: 'Cannot modify super_admin permissions' }
    }

    // Upsert each page permission
    for (const [page, perms] of Object.entries(pages)) {
      if (!CONTROLLABLE_PAGES.includes(page)) continue

      const existing = await db.query.rolePermissions.findFirst({
        where: and(
          eq(rolePermissions.role, role as any),
          eq(rolePermissions.page, page),
        ),
      })

      if (existing) {
        await db.update(rolePermissions)
          .set({
            visible: perms.visible,
            canCreate: perms.canCreate,
            canEdit: perms.canEdit,
            selfViewOnly: perms.selfViewOnly,
            updatedAt: new Date(),
          })
          .where(eq(rolePermissions.id, existing.id))
      } else {
        await db.insert(rolePermissions).values({
          role: role as any,
          page,
          visible: perms.visible,
          canCreate: perms.canCreate,
          canEdit: perms.canEdit,
        })
      }
    }

    return { success: true }
  }, {
    body: t.Object({
      role: t.String(),
      pages: t.Record(t.String(), t.Object({
        visible: t.Boolean(),
        canCreate: t.Boolean(),
        canEdit: t.Boolean(),
        selfViewOnly: t.Boolean(),
      })),
    }),
  })

  // GET /api/roles/my-permissions — Current user's accessible pages
  .get('/my-permissions', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    // super_admin always has full access
    if (user.role === 'super_admin') {
      const allFull: Record<string, { visible: boolean; canCreate: boolean; canEdit: boolean; selfViewOnly: boolean }> = {}
      for (const page of CONTROLLABLE_PAGES) allFull[page] = { visible: true, canCreate: true, canEdit: true, selfViewOnly: false }
      return { pages: allFull }
    }

    const perms = await db.select()
      .from(rolePermissions)
      .where(eq(rolePermissions.role, user.role))

    const result: Record<string, { visible: boolean; canCreate: boolean; canEdit: boolean; selfViewOnly: boolean }> = {}
    // Default all pages to full access
    for (const page of CONTROLLABLE_PAGES) result[page] = { visible: true, canCreate: true, canEdit: true, selfViewOnly: false }
    // Override with saved permissions
    for (const p of perms) {
      result[p.page] = {
        visible: p.visible,
        canCreate: p.canCreate,
        canEdit: p.canEdit,
        selfViewOnly: p.selfViewOnly,
      }
    }

    return { pages: result }
  })
