import { Elysia, t } from 'elysia'
import { db } from '../db'
import { productMembers, rolePermissions, titlePermissions, titles, userTitles } from '../db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { computeChanges, logActivity } from '../lib/logActivity'
import {
  EFFECTIVE_PERMISSION_FORMULA,
  getEffectivePermissionMatrixForUser,
  requireAuth,
} from '../lib/authz'
import {
  CONFIGURABLE_ROLE_CATALOG,
  CONTROLLABLE_PAGE_KEYS,
  PAGE_CATALOG,
  isControllablePageKey,
} from '../lib/pageCatalog'
import { buildDenyPermission } from '../lib/rolePermissionPolicy'

type PagePermissionPayload = {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
}

const TITLE_MANAGER_ROLES = new Set(['super_admin', 'admin'])
const ROLE_PERMISSION_MANAGER_ROLES = new Set(['admin', 'super_admin'])
const ROLE_KEY_SET = new Set(['super_admin', ...CONFIGURABLE_ROLE_CATALOG.map((entry) => entry.key)])

function canManageTitles(role: string): boolean {
  return TITLE_MANAGER_ROLES.has(role)
}

function canManageRolePermissions(role: string): boolean {
  return ROLE_PERMISSION_MANAGER_ROLES.has(role)
}

function normalizeTitleKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100)
}

async function resolveAuditProductId(actorUserId: string): Promise<string | null> {
  void actorUserId
  return null
}

function toPagePermission(permission: PagePermissionPayload): PagePermissionPayload {
  if (!permission.visible) {
    return {
      visible: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      selfViewOnly: false,
    }
  }
  return permission
}

function mapPermissionRow(row: {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
}): PagePermissionPayload {
  return toPagePermission({
    visible: row.visible,
    canCreate: row.canCreate,
    canEdit: row.canEdit,
    canDelete: row.canDelete,
    selfViewOnly: row.selfViewOnly,
  })
}

const pagePermissionSchema = t.Object({
  visible: t.Boolean(),
  canCreate: t.Boolean(),
  canEdit: t.Boolean(),
  canDelete: t.Boolean(),
  selfViewOnly: t.Boolean(),
})

export const rolesRoutes = new Elysia({ prefix: '/api/roles' })
  .use(authPlugin)

  // GET /api/roles/catalog — Canonical roles/page metadata for UI + routing.
  .get('/catalog', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    return {
      pages: PAGE_CATALOG,
      configurableRoles: CONFIGURABLE_ROLE_CATALOG,
      effectivePermissionFormula: EFFECTIVE_PERMISSION_FORMULA,
    }
  })

  // GET /api/roles/permissions — All role permissions (org admins)
  .get('/permissions', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!canManageRolePermissions(user.role)) { set.status = 403; return { error: 'Forbidden' } }

    const perms = await db.select().from(rolePermissions)

    // Build a map: { role: { page: { visible, canCreate, canEdit, canDelete } } }
    const result: Record<string, Record<string, { visible: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; selfViewOnly: boolean }>> = {}
    for (const p of perms) {
      if (!result[p.role]) result[p.role] = {}
      result[p.role][p.page] = {
        visible: p.visible,
        canCreate: p.canCreate,
        canEdit: p.canEdit,
        canDelete: p.canDelete,
        selfViewOnly: p.selfViewOnly,
      }
    }

    return {
      permissions: result,
      pages: CONTROLLABLE_PAGE_KEYS,
      catalog: PAGE_CATALOG,
      configurableRoles: CONFIGURABLE_ROLE_CATALOG,
      effectivePermissionFormula: EFFECTIVE_PERMISSION_FORMULA,
    }
  })

  // PUT /api/roles/permissions — Bulk update permissions for a role (org admins)
  .put('/permissions', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!canManageRolePermissions(user.role)) { set.status = 403; return { error: 'Forbidden' } }

    const { role, pages } = body as { role: string; pages: Record<string, { visible: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; selfViewOnly: boolean }> }

    // Don't allow modifying super_admin permissions
    if (role === 'super_admin') {
      set.status = 400
      return { error: 'Cannot modify super_admin permissions' }
    }

    await db.transaction(async (tx) => {
      const entries = Object.entries(pages)
        .filter(([page]) => isControllablePageKey(page)) as Array<[string, PagePermissionPayload]>
      const pageKeys = entries.map(([page]) => page)
      const existingRows = pageKeys.length > 0
        ? await tx.query.rolePermissions.findMany({
          where: and(
            eq(rolePermissions.role, role as any),
            inArray(rolePermissions.page, pageKeys),
          ),
        })
        : []
      const existingByPage = new Map(existingRows.map((row) => [row.page, row]))

      for (const [page, perms] of entries) {
        const existing = existingByPage.get(page)
        if (existing) {
          await tx.update(rolePermissions)
            .set({
              visible: perms.visible,
              canCreate: perms.canCreate,
              canEdit: perms.canEdit,
              canDelete: perms.canDelete,
              selfViewOnly: perms.selfViewOnly,
              updatedAt: new Date(),
            })
            .where(eq(rolePermissions.id, existing.id))
          continue
        }

        await tx.insert(rolePermissions).values({
          role: role as any,
          page,
          visible: perms.visible,
          canCreate: perms.canCreate,
          canEdit: perms.canEdit,
          canDelete: perms.canDelete,
          selfViewOnly: perms.selfViewOnly,
        })
      }
    })

    const auditProductId = await resolveAuditProductId(user.id)
    logActivity({
      productId: auditProductId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'updated',
      entityType: 'title',
      entityTitle: `Role permissions: ${role}`,
      changes: [{
        field: 'rolePermissions',
        from: null,
        to: `${Object.keys(pages).length} page entries updated`,
      }],
      routePathOverride: '/settings?tab=roles',
    })

    return { success: true }
  }, {
    body: t.Object({
      role: t.String(),
      pages: t.Record(t.String(), t.Object({
        visible: t.Boolean(),
        canCreate: t.Boolean(),
        canEdit: t.Boolean(),
        canDelete: t.Boolean(),
        selfViewOnly: t.Boolean(),
      })),
    }),
  })

  // GET /api/roles/my-permissions — Current user's accessible pages
  .get('/my-permissions', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const { pages, context } = await getEffectivePermissionMatrixForUser(user, CONTROLLABLE_PAGE_KEYS)

    return {
      pages,
      catalog: PAGE_CATALOG,
      configurableRoles: CONFIGURABLE_ROLE_CATALOG,
      title: context.title,
      fallbackToRoleOnly: context.fallbackToRoleOnly,
      effectivePermissionFormula: context.formula,
      source: context.title ? 'role_and_title' : 'role_only_fallback',
    }
  })

  // GET /api/roles/titles — List configurable titles and usage stats.
  .get('/titles', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!canManageTitles(user.role)) { set.status = 403; return { error: 'Forbidden' } }

    const titleRows = await db.query.titles.findMany({
      orderBy: (row, { asc }) => [desc(row.isSystem), asc(row.name)],
    })

    const titleIds = titleRows.map((row) => row.id)
    const permissionRows = titleIds.length > 0
      ? await db.query.titlePermissions.findMany({
        where: inArray(titlePermissions.titleId, titleIds),
      })
      : []
    const assignmentRows = titleIds.length > 0
      ? await db.query.userTitles.findMany({
        where: inArray(userTitles.titleId, titleIds),
      })
      : []

    const permissionCountByTitle = permissionRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.titleId] = (acc[row.titleId] || 0) + 1
      return acc
    }, {})
    const assignedUsersCountByTitle = assignmentRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.titleId] = (acc[row.titleId] || 0) + 1
      return acc
    }, {})

    return {
      titles: titleRows.map((row) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        isActive: row.isActive,
        isSystem: row.isSystem,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        assignedUsersCount: assignedUsersCountByTitle[row.id] || 0,
        permissionCount: permissionCountByTitle[row.id] || 0,
      })),
      effectivePermissionFormula: EFFECTIVE_PERMISSION_FORMULA,
    }
  })

  // GET /api/roles/titles/:id/permissions — Full page matrix for one title.
  .get('/titles/:id/permissions', async ({ params, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!canManageTitles(user.role)) { set.status = 403; return { error: 'Forbidden' } }

    const titleRow = await db.query.titles.findFirst({
      where: eq(titles.id, params.id),
    })
    if (!titleRow) { set.status = 404; return { error: 'Title not found' } }

    const rows = await db.query.titlePermissions.findMany({
      where: eq(titlePermissions.titleId, titleRow.id),
    })
    const pages: Record<string, PagePermissionPayload> = {}
    for (const page of CONTROLLABLE_PAGE_KEYS) {
      pages[page] = buildDenyPermission()
    }
    for (const row of rows) {
      if (!isControllablePageKey(row.page)) continue
      pages[row.page] = mapPermissionRow(row)
    }

    return {
      title: {
        id: titleRow.id,
        key: titleRow.key,
        name: titleRow.name,
        description: titleRow.description,
        isActive: titleRow.isActive,
        isSystem: titleRow.isSystem,
      },
      pages,
      catalog: PAGE_CATALOG,
      effectivePermissionFormula: EFFECTIVE_PERMISSION_FORMULA,
    }
  })

  // POST /api/roles/titles — Create a new configurable title.
  .post('/titles', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!canManageTitles(user.role)) { set.status = 403; return { error: 'Forbidden' } }

    const normalizedName = body.name.trim()
    const keyInput = body.key?.trim() || normalizedName
    const normalizedKey = normalizeTitleKey(keyInput)
    if (!normalizedName || !normalizedKey) {
      set.status = 400
      return { error: 'Title name/key is required' }
    }

    if (body.baseRole && !ROLE_KEY_SET.has(body.baseRole)) {
      set.status = 400
      return { error: 'Invalid baseRole provided' }
    }

    try {
      const [created] = await db.insert(titles).values({
        key: normalizedKey,
        name: normalizedName,
        description: body.description?.trim() || null,
        isActive: true,
        isSystem: false,
        createdByUserId: user.id,
      }).returning()

      let seededPermissions = 0
      if (body.baseRole && body.baseRole !== 'super_admin') {
        const baseRows = await db.query.rolePermissions.findMany({
          where: eq(rolePermissions.role, body.baseRole as any),
        })
        if (baseRows.length > 0) {
          seededPermissions = baseRows.length
          await db.insert(titlePermissions).values(baseRows.map((row) => ({
            titleId: created!.id,
            page: row.page,
            visible: row.visible,
            canCreate: row.canCreate,
            canEdit: row.canEdit,
            canDelete: row.canDelete,
            selfViewOnly: row.selfViewOnly,
          }))).onConflictDoNothing()
        }
      }

      const auditProductId = await resolveAuditProductId(user.id)
      if (created) {
        logActivity({
          productId: auditProductId,
          userName: user.name,
          userAvatar: user.avatar,
          userId: user.id,
          action: 'created',
          entityType: 'title',
          entityId: created.id,
          entityTitle: created.name,
          changes: [{
            field: 'seededPermissions',
            from: null,
            to: String(seededPermissions),
          }],
          routePathOverride: '/settings?tab=titles',
        })
      }

      return {
        id: created!.id,
        key: created!.key,
        name: created!.name,
        description: created!.description,
        isActive: created!.isActive,
        isSystem: created!.isSystem,
        createdByUserId: created!.createdByUserId,
        createdAt: created!.createdAt,
        updatedAt: created!.updatedAt,
        seededPermissions,
      }
    } catch (error: any) {
      if (error?.code === '23505') {
        set.status = 409
        return { error: 'A title with this key or name already exists' }
      }
      throw error
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      key: t.Optional(t.String({ minLength: 1 })),
      description: t.Optional(t.String()),
      baseRole: t.Optional(t.String()),
    }),
  })

  // PUT /api/roles/titles/:id — Update title metadata (name/description/active).
  .put('/titles/:id', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!canManageTitles(user.role)) { set.status = 403; return { error: 'Forbidden' } }

    const existing = await db.query.titles.findFirst({
      where: eq(titles.id, params.id),
    })
    if (!existing) { set.status = 404; return { error: 'Title not found' } }

    if (existing.isSystem && body.name && body.name.trim() !== existing.name) {
      set.status = 400
      return { error: 'System titles cannot be renamed' }
    }

    const patch: Partial<typeof titles.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.name !== undefined) patch.name = body.name.trim()
    if (body.description !== undefined) patch.description = body.description?.trim() || null
    if (body.isActive !== undefined) patch.isActive = body.isActive

    try {
      const [updated] = await db.update(titles)
        .set(patch)
        .where(eq(titles.id, params.id))
        .returning()

      const auditProductId = await resolveAuditProductId(user.id)
      if (updated) {
        const changes = computeChanges(existing as Record<string, any>, {
          name: updated.name,
          description: updated.description,
          isActive: updated.isActive,
        }, ['name', 'description', 'isActive'])

        if (changes.length > 0) {
          logActivity({
            productId: auditProductId,
            userName: user.name,
            userAvatar: user.avatar,
            userId: user.id,
            action: 'updated',
            entityType: 'title',
            entityId: updated.id,
            entityTitle: updated.name,
            changes,
            routePathOverride: '/settings?tab=titles',
          })
        }
      }

      return {
        id: updated!.id,
        key: updated!.key,
        name: updated!.name,
        description: updated!.description,
        isActive: updated!.isActive,
        isSystem: updated!.isSystem,
        createdByUserId: updated!.createdByUserId,
        createdAt: updated!.createdAt,
        updatedAt: updated!.updatedAt,
      }
    } catch (error: any) {
      if (error?.code === '23505') {
        set.status = 409
        return { error: 'A title with this name already exists' }
      }
      throw error
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1 })),
      description: t.Optional(t.Nullable(t.String())),
      isActive: t.Optional(t.Boolean()),
    }),
  })

  // PUT /api/roles/titles/:id/permissions — Bulk update title page permissions.
  .put('/titles/:id/permissions', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }
    if (!canManageTitles(user.role)) { set.status = 403; return { error: 'Forbidden' } }

    const titleRow = await db.query.titles.findFirst({
      where: eq(titles.id, params.id),
    })
    if (!titleRow) { set.status = 404; return { error: 'Title not found' } }

    for (const [page, payload] of Object.entries(body.pages)) {
      if (!isControllablePageKey(page)) continue
      const normalized = toPagePermission(payload)

      const existing = await db.query.titlePermissions.findFirst({
        where: and(
          eq(titlePermissions.titleId, titleRow.id),
          eq(titlePermissions.page, page),
        ),
      })
      if (existing) {
        await db.update(titlePermissions)
          .set({
            visible: normalized.visible,
            canCreate: normalized.canCreate,
            canEdit: normalized.canEdit,
            canDelete: normalized.canDelete,
            selfViewOnly: normalized.selfViewOnly,
            updatedAt: new Date(),
          })
          .where(eq(titlePermissions.id, existing.id))
      } else {
        await db.insert(titlePermissions).values({
          titleId: titleRow.id,
          page,
          visible: normalized.visible,
          canCreate: normalized.canCreate,
          canEdit: normalized.canEdit,
          canDelete: normalized.canDelete,
          selfViewOnly: normalized.selfViewOnly,
        })
      }
    }

    const auditProductId = await resolveAuditProductId(user.id)
    logActivity({
      productId: auditProductId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'updated',
      entityType: 'title',
      entityId: titleRow.id,
      entityTitle: titleRow.name,
      changes: [{
        field: 'permissionProfile',
        from: null,
        to: `${Object.keys(body.pages).length} page entries updated`,
      }],
      routePathOverride: '/settings?tab=titles',
    })

    return { success: true }
  }, {
    body: t.Object({
      pages: t.Record(t.String(), pagePermissionSchema),
    }),
  })
