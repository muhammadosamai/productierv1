import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { organizationMembers, organizationTeams, productMembers, products } from '../db/schema'
import { isGlobalAdminRole, type AuthenticatedUser } from './authz'

export type HomeScopeMode = 'all' | 'product' | 'team'

export interface ResolvedHomeScope {
  mode: HomeScopeMode
  productIds: string[]
  teamId: string | null
  requestedProductId: string | null
  requestedTeamId: string | null
}

export class HomeScopeResolutionError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function normalizeId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeScopeMode(raw: unknown, defaults: { productId: string | null; teamId: string | null }): HomeScopeMode {
  if (raw === 'product') return 'product'
  if (raw === 'team') return 'team'
  if (raw === 'all') return 'all'
  if (defaults.productId) return 'product'
  if (defaults.teamId) return 'team'
  return 'all'
}

async function listAccessibleProductIds(
  user: AuthenticatedUser,
  organizationId: string,
): Promise<string[]> {
  if (isGlobalAdminRole(user.role)) {
    const rows = await db.select({ id: products.id })
      .from(products)
      .where(eq(products.organizationId, organizationId))
    return rows.map((row) => row.id)
  }

  const rows = await db.select({ productId: productMembers.productId })
    .from(productMembers)
    .innerJoin(products, eq(productMembers.productId, products.id))
    .where(and(
      eq(productMembers.userId, user.id),
      eq(products.organizationId, organizationId),
    ))
  return rows.map((row) => row.productId)
}

async function ensureManagedTeamAccess(
  user: AuthenticatedUser,
  teamId: string,
  organizationId: string,
) {
  const team = await db.query.organizationTeams.findFirst({
    where: eq(organizationTeams.id, teamId),
    columns: {
      id: true,
      organizationId: true,
      leadUserId: true,
    },
  })

  if (!team) {
    throw new HomeScopeResolutionError(404, 'Team not found')
  }

  if (team.organizationId !== organizationId) {
    throw new HomeScopeResolutionError(403, 'Forbidden')
  }

  if (isGlobalAdminRole(user.role)) {
    return team
  }

  const organizationMember = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, team.organizationId),
      eq(organizationMembers.userId, user.id),
    ),
    columns: {
      role: true,
    },
  })

  if (!organizationMember) {
    throw new HomeScopeResolutionError(403, 'Forbidden')
  }

  const organizationRole = String(organizationMember.role || '').toLowerCase()
  const isOrgManager = organizationRole === 'owner' || organizationRole === 'admin'
  const isLead = team.leadUserId === user.id
  if (!isOrgManager && !isLead) {
    throw new HomeScopeResolutionError(403, 'Managed team access is required for team scope')
  }

  return team
}

export async function resolveAccessibleHomeScope(
  user: AuthenticatedUser,
  query: {
    organizationId?: unknown
    scopeMode?: unknown
    productId?: unknown
    teamId?: unknown
  },
): Promise<ResolvedHomeScope> {
  const requestedOrganizationId = normalizeId(query.organizationId)
  if (!requestedOrganizationId) {
    throw new HomeScopeResolutionError(400, 'organizationId is required')
  }
  const requestedProductId = normalizeId(query.productId)
  const requestedTeamId = normalizeId(query.teamId)
  const requestedMode = normalizeScopeMode(query.scopeMode, {
    productId: requestedProductId,
    teamId: requestedTeamId,
  })

  const accessibleProductIds = await listAccessibleProductIds(user, requestedOrganizationId)
  const accessibleSet = new Set(accessibleProductIds)

  if (requestedMode === 'product') {
    if (!requestedProductId) {
      throw new HomeScopeResolutionError(400, 'productId is required when scopeMode=product')
    }
    if (!accessibleSet.has(requestedProductId)) {
      throw new HomeScopeResolutionError(403, 'Forbidden')
    }

    return {
      mode: 'product',
      productIds: [requestedProductId],
      teamId: null,
      requestedProductId,
      requestedTeamId: null,
    }
  }

  if (requestedMode === 'team') {
    if (!requestedTeamId) {
      throw new HomeScopeResolutionError(400, 'teamId is required when scopeMode=team')
    }

    const team = await ensureManagedTeamAccess(user, requestedTeamId, requestedOrganizationId)

    const scopeProducts = await db.select({ id: products.id })
      .from(products)
      .where(eq(products.organizationId, team.organizationId))
    const scopedProductIds = scopeProducts
      .map((row) => row.id)
      .filter((productId) => accessibleSet.has(productId))

    return {
      mode: 'team',
      productIds: scopedProductIds,
      teamId: requestedTeamId,
      requestedProductId: null,
      requestedTeamId,
    }
  }

  return {
    mode: 'all',
    productIds: accessibleProductIds,
    teamId: null,
    requestedProductId: null,
    requestedTeamId: null,
  }
}

export async function resolveMetricsProductScope(
  user: AuthenticatedUser,
  query: {
    organizationId?: unknown
    scopeMode?: unknown
    productId?: unknown
    teamId?: unknown
  },
): Promise<ResolvedHomeScope> {
  const resolved = await resolveAccessibleHomeScope(user, query)
  if (resolved.productIds.length > 0) return resolved

  if (resolved.mode === 'product') {
    throw new HomeScopeResolutionError(403, 'Forbidden')
  }

  // Empty scope is allowed for all/team, endpoint should return empty metrics payload.
  return resolved
}

export async function listAccessibleProductsById(productIds: string[]) {
  if (productIds.length === 0) return []
  const rows = await db.select({
    id: products.id,
    organizationId: products.organizationId,
  }).from(products).where(inArray(products.id, productIds))
  return rows
}
