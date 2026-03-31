import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  organizationMembers,
  productMembers,
  products,
  rolePermissions,
  titlePermissions,
  titles,
  userTitles,
  users,
} from '../db/schema'
import { isControllablePageKey, type ConfigurableRoleKey } from './pageCatalog'
import { buildDenyPermission, buildFullPermission, getDefaultPermissionForRolePage } from './rolePermissionPolicy'

type JwtVerify = (token: string) => Promise<any>

interface RouteSet {
  status?: number | string
}

export type AuthenticatedUser = typeof users.$inferSelect
export type PageAction = 'read' | 'create' | 'edit' | 'delete'

interface EffectivePagePermission {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
}

export interface ResolvedUserTitle {
  id: string
  key: string
  name: string
}

export interface EffectivePermissionContext {
  title: ResolvedUserTitle | null
  fallbackToRoleOnly: boolean
  formula: string
}

export const EFFECTIVE_PERMISSION_FORMULA =
  'roleHardLimit ∩ (rolePermissionProfile ∪ titlePermissionProfile) ∩ productMembershipScope'

const ORGANIZATION_SCOPE_HEADER = 'x-productier-organization-id'

// Global tenant bypass is retired. Access must always resolve through
// organization and product memberships.
export const GLOBAL_ADMIN_ROLES = new Set<AuthenticatedUser['role']>()

export function isGlobalAdminRole(role: AuthenticatedUser['role']): boolean {
  return GLOBAL_ADMIN_ROLES.has(role)
}

export function hasAnyRole(
  user: AuthenticatedUser,
  roles: AuthenticatedUser['role'][]
): boolean {
  return roles.includes(user.role)
}

function getBearerToken(headers: Record<string, string | undefined>): string | null {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice('Bearer '.length)
}

function getOrganizationScopeId(headers: Record<string, string | undefined>): string | null {
  const raw = headers[ORGANIZATION_SCOPE_HEADER]
  if (typeof raw !== 'string') return null
  const normalized = raw.trim()
  return normalized.length > 0 ? normalized : null
}

export async function getAuthenticatedUser(
  jwtVerify: JwtVerify,
  headers: Record<string, string | undefined>
): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(headers)
  if (!token) return null

  let payload: any
  try {
    payload = await jwtVerify(token)
  } catch {
    return null
  }
  if (!payload?.userId) return null

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId as string),
  })

  return user || null
}

export async function requireAuth(
  jwtVerify: JwtVerify,
  headers: Record<string, string | undefined>,
  set: RouteSet
): Promise<AuthenticatedUser | null> {
  const user = await getAuthenticatedUser(jwtVerify, headers)
  if (!user) {
    set.status = 401
    return null
  }
  if (!user.isActive) {
    set.status = 403
    return null
  }
  return user
}

export async function requireRole(
  jwtVerify: JwtVerify,
  headers: Record<string, string | undefined>,
  set: RouteSet,
  allowedRoles: AuthenticatedUser['role'][]
): Promise<AuthenticatedUser | null> {
  const user = await requireAuth(jwtVerify, headers, set)
  if (!user) return null

  if (!allowedRoles.includes(user.role)) {
    set.status = 403
    return null
  }

  return user
}

export async function requireSelfOrRole(
  jwtVerify: JwtVerify,
  headers: Record<string, string | undefined>,
  set: RouteSet,
  targetUserId: string,
  allowedRoles: AuthenticatedUser['role'][]
): Promise<AuthenticatedUser | null> {
  const user = await requireAuth(jwtVerify, headers, set)
  if (!user) return null

  if (user.id === targetUserId || allowedRoles.includes(user.role)) {
    return user
  }

  set.status = 403
  return null
}

export async function requireProductAccess(
  jwtVerify: JwtVerify,
  headers: Record<string, string | undefined>,
  set: RouteSet,
  productId: string,
  requiredProductRoles?: string[]
): Promise<{ user: AuthenticatedUser; memberRole: string | null } | null> {
  const user = await requireAuth(jwtVerify, headers, set)
  if (!user) return null

  const scopedOrganizationId = getOrganizationScopeId(headers)
  if (scopedOrganizationId) {
    const tenantProduct = await db.query.products.findFirst({
      where: and(
        eq(products.id, productId),
        eq(products.organizationId, scopedOrganizationId),
      ),
      columns: { id: true },
    })
    if (!tenantProduct) {
      set.status = 404
      return null
    }

    if (!isGlobalAdminRole(user.role)) {
      const organizationMembership = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, scopedOrganizationId),
          eq(organizationMembers.userId, user.id),
        ),
        columns: { id: true },
      })
      if (!organizationMembership) {
        set.status = 403
        return null
      }
    }
  }

  if (isGlobalAdminRole(user.role)) {
    return { user, memberRole: 'admin' }
  }

  const membership = await db.query.productMembers.findFirst({
    where: and(
      eq(productMembers.productId, productId),
      eq(productMembers.userId, user.id)
    ),
  })

  if (!membership) {
    set.status = 403
    return null
  }

  const normalizedRole = (membership.role || '').toLowerCase()
  if (
    requiredProductRoles &&
    requiredProductRoles.length > 0 &&
    !requiredProductRoles.some(role => role.toLowerCase() === normalizedRole)
  ) {
    set.status = 403
    return null
  }

  return { user, memberRole: membership.role }
}

export async function requireOrganizationAccess(
  jwtVerify: JwtVerify,
  headers: Record<string, string | undefined>,
  set: RouteSet,
  organizationId: string,
  requiredOrganizationRoles?: string[]
): Promise<{ user: AuthenticatedUser; memberRole: string | null } | null> {
  const user = await requireAuth(jwtVerify, headers, set)
  if (!user) return null

  if (isGlobalAdminRole(user.role)) {
    return { user, memberRole: 'owner' }
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, user.id)
    ),
  })

  if (!membership) {
    set.status = 403
    return null
  }

  const normalizedRole = (membership.role || '').toLowerCase()
  if (
    requiredOrganizationRoles &&
    requiredOrganizationRoles.length > 0 &&
    !requiredOrganizationRoles.some(role => role.toLowerCase() === normalizedRole)
  ) {
    set.status = 403
    return null
  }

  return { user, memberRole: membership.role }
}

function sanitizePermission(permission: EffectivePagePermission): EffectivePagePermission {
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

function permissionFromRow(row: {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
} | null | undefined): EffectivePagePermission {
  if (!row) return buildDenyPermission()
  return sanitizePermission({
    visible: row.visible,
    canCreate: row.canCreate,
    canEdit: row.canEdit,
    canDelete: row.canDelete,
    selfViewOnly: row.selfViewOnly,
  })
}

function unionPermission(
  left: EffectivePagePermission,
  right: EffectivePagePermission
): EffectivePagePermission {
  return sanitizePermission({
    visible: left.visible || right.visible,
    canCreate: left.canCreate || right.canCreate,
    canEdit: left.canEdit || right.canEdit,
    canDelete: left.canDelete || right.canDelete,
    selfViewOnly: left.selfViewOnly || right.selfViewOnly,
  })
}

function intersectPermission(
  left: EffectivePagePermission,
  right: EffectivePagePermission
): EffectivePagePermission {
  return sanitizePermission({
    visible: left.visible && right.visible,
    canCreate: left.canCreate && right.canCreate,
    canEdit: left.canEdit && right.canEdit,
    canDelete: left.canDelete && right.canDelete,
    // selfViewOnly is a restrictive guardrail, so either side can enforce it.
    selfViewOnly: left.selfViewOnly || right.selfViewOnly,
  })
}

function resolveRoleHardLimit(
  role: AuthenticatedUser['role'],
  page: string
): EffectivePagePermission {
  if (role === 'super_admin') {
    return buildFullPermission()
  }
  if (!isControllablePageKey(page)) return buildDenyPermission()
  return getDefaultPermissionForRolePage(role as ConfigurableRoleKey, page)
}

async function getRolePermissionProfile(
  role: AuthenticatedUser['role'],
  page: string
): Promise<EffectivePagePermission> {
  if (role === 'super_admin') return buildFullPermission()

  const rolePermission = await db.query.rolePermissions.findFirst({
    where: and(
      eq(rolePermissions.role, role),
      eq(rolePermissions.page, page)
    ),
  })

  // Default deny: missing rows should not grant implicit privileges.
  return permissionFromRow(rolePermission)
}

async function getTitlePermissionProfile(
  titleId: string,
  page: string
): Promise<EffectivePagePermission> {
  const titlePermission = await db.query.titlePermissions.findFirst({
    where: and(
      eq(titlePermissions.titleId, titleId),
      eq(titlePermissions.page, page)
    ),
  })

  // Title profile defaults to deny when a row is missing.
  return permissionFromRow(titlePermission)
}

export async function getUserTitleAssignment(userId: string): Promise<ResolvedUserTitle | null> {
  const rows = await db
    .select({
      id: titles.id,
      key: titles.key,
      name: titles.name,
    })
    .from(userTitles)
    .innerJoin(titles, and(
      eq(userTitles.titleId, titles.id),
      eq(titles.isActive, true)
    ))
    .where(eq(userTitles.userId, userId))
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]!
  return {
    id: row.id,
    key: row.key,
    name: row.name,
  }
}

export async function getEffectivePagePermissionForUser(
  user: AuthenticatedUser,
  page: string
): Promise<{ permission: EffectivePagePermission; context: EffectivePermissionContext }> {
  if (user.role === 'super_admin') {
    return {
      permission: buildFullPermission(),
      context: {
        title: null,
        fallbackToRoleOnly: false,
        formula: EFFECTIVE_PERMISSION_FORMULA,
      },
    }
  }

  const title = await getUserTitleAssignment(user.id)
  const roleHardLimit = resolveRoleHardLimit(user.role, page)
  const rolePermissionProfile = await getRolePermissionProfile(user.role, page)
  const titlePermissionProfile = title
    ? await getTitlePermissionProfile(title.id, page)
    : buildDenyPermission()

  const mergedProfile = title
    ? unionPermission(rolePermissionProfile, titlePermissionProfile)
    : rolePermissionProfile

  return {
    permission: intersectPermission(roleHardLimit, mergedProfile),
    context: {
      title,
      fallbackToRoleOnly: !title,
      formula: EFFECTIVE_PERMISSION_FORMULA,
    },
  }
}

export async function getEffectivePermissionMatrixForUser(
  user: AuthenticatedUser,
  pages: string[]
): Promise<{ pages: Record<string, EffectivePagePermission>; context: EffectivePermissionContext }> {
  if (user.role === 'super_admin') {
    const allFull: Record<string, EffectivePagePermission> = {}
    for (const page of pages) {
      allFull[page] = buildFullPermission()
    }
    return {
      pages: allFull,
      context: {
        title: null,
        fallbackToRoleOnly: false,
        formula: EFFECTIVE_PERMISSION_FORMULA,
      },
    }
  }

  const title = await getUserTitleAssignment(user.id)

  const roleRows = await db.query.rolePermissions.findMany({
    where: eq(rolePermissions.role, user.role),
  })
  const roleByPage: Record<string, EffectivePagePermission> = {}
  for (const row of roleRows) {
    roleByPage[row.page] = permissionFromRow(row)
  }

  const titleByPage: Record<string, EffectivePagePermission> = {}
  if (title) {
    const titleRows = await db.query.titlePermissions.findMany({
      where: eq(titlePermissions.titleId, title.id),
    })
    for (const row of titleRows) {
      titleByPage[row.page] = permissionFromRow(row)
    }
  }

  const resolved: Record<string, EffectivePagePermission> = {}
  for (const page of pages) {
    const roleHardLimit = resolveRoleHardLimit(user.role, page)
    const rolePermissionProfile = roleByPage[page] || buildDenyPermission()
    const titlePermissionProfile = titleByPage[page] || buildDenyPermission()
    const mergedProfile = title
      ? unionPermission(rolePermissionProfile, titlePermissionProfile)
      : rolePermissionProfile
    resolved[page] = intersectPermission(roleHardLimit, mergedProfile)
  }

  return {
    pages: resolved,
    context: {
      title,
      fallbackToRoleOnly: !title,
      formula: EFFECTIVE_PERMISSION_FORMULA,
    },
  }
}

function isActionAllowed(
  permission: EffectivePagePermission,
  action: PageAction
): boolean {
  if (!permission.visible) return false

  switch (action) {
    case 'read':
      return permission.visible
    case 'create':
      return permission.canCreate
    case 'edit':
      return permission.canEdit
    case 'delete':
      return permission.canDelete
    default:
      return false
  }
}

export async function requirePageAction(
  user: AuthenticatedUser,
  set: RouteSet,
  page: string,
  action: PageAction
): Promise<boolean> {
  if (user.role === 'super_admin') return true

  const { permission } = await getEffectivePagePermissionForUser(user, page)
  if (isActionAllowed(permission, action)) return true

  set.status = 403
  return false
}

export async function requireProductPageAction(
  jwtVerify: JwtVerify,
  headers: Record<string, string | undefined>,
  set: RouteSet,
  options: {
    organizationId?: string
    productId: string
    page: string
    action: PageAction
    requiredProductRoles?: string[]
    requiredOrganizationRoles?: string[]
  }
): Promise<{ user: AuthenticatedUser; memberRole: string | null } | null> {
  const scopedOrganizationId = options.organizationId || getOrganizationScopeId(headers)
  if (scopedOrganizationId) {
    const access = await requireOrganizationProductPageAction(jwtVerify, headers, set, {
      organizationId: scopedOrganizationId,
      productId: options.productId,
      page: options.page,
      action: options.action,
      requiredProductRoles: options.requiredProductRoles,
      requiredOrganizationRoles: options.requiredOrganizationRoles,
    })
    if (!access) return null
    return {
      user: access.user,
      memberRole: access.productMemberRole,
    }
  }

  const access = await requireProductAccess(
    jwtVerify,
    headers,
    set,
    options.productId,
    options.requiredProductRoles
  )
  if (!access) return null

  const allowed = await requirePageAction(access.user, set, options.page, options.action)
  if (!allowed) return null

  return access
}

export async function requireOrganizationProductPageAction(
  jwtVerify: JwtVerify,
  headers: Record<string, string | undefined>,
  set: RouteSet,
  options: {
    organizationId: string
    productId: string
    page: string
    action: PageAction
    requiredProductRoles?: string[]
    requiredOrganizationRoles?: string[]
  }
): Promise<{
    user: AuthenticatedUser
    organizationMemberRole: string | null
    productMemberRole: string | null
  } | null> {
  const organizationAccess = await requireOrganizationAccess(
    jwtVerify,
    headers,
    set,
    options.organizationId,
    options.requiredOrganizationRoles,
  )
  if (!organizationAccess) return null

  const product = await db.query.products.findFirst({
    where: eq(products.id, options.productId),
    columns: {
      id: true,
      organizationId: true,
    },
  })
  if (!product || product.organizationId !== options.organizationId) {
    // Return 404 to avoid disclosing whether the product exists in another tenant.
    set.status = 404
    return null
  }

  const productAccess = await requireProductAccess(
    jwtVerify,
    headers,
    set,
    options.productId,
    options.requiredProductRoles,
  )
  if (!productAccess) return null

  const allowed = await requirePageAction(productAccess.user, set, options.page, options.action)
  if (!allowed) return null

  return {
    user: productAccess.user,
    organizationMemberRole: organizationAccess.memberRole,
    productMemberRole: productAccess.memberRole,
  }
}
