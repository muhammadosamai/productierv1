import { Elysia, t } from 'elysia'
import { getSearchConfig } from '../config/search'
import {
  getEffectivePagePermissionForUser,
  requireProductAccess,
  type AuthenticatedUser,
} from '../lib/authz'
import {
  decodeGlobalSearchCursor,
  runGlobalSearch,
  type SearchTypeAccessMap,
} from '../lib/search/searchRetrieval'
import { SEARCH_ENTITY_TYPES, parseSearchTypes, type SearchEntityType } from '../lib/search/searchTypes'
import { authPlugin } from '../plugins/auth'

const PAGE_BY_TYPE: Record<SearchEntityType, string> = {
  task: 'tasks',
  initiative: 'initiatives',
  delivery: 'deliveries',
  team_member: 'team',
  wiki_asset: 'wiki',
}

async function buildAccessMap(
  user: AuthenticatedUser,
  types: SearchEntityType[],
): Promise<SearchTypeAccessMap> {
  const accessMap = {} as SearchTypeAccessMap

  for (const entityType of SEARCH_ENTITY_TYPES) {
    if (!types.includes(entityType)) {
      accessMap[entityType] = { allowed: false, selfViewOnly: false }
      continue
    }

    if (user.role === 'super_admin') {
      accessMap[entityType] = { allowed: true, selfViewOnly: false }
      continue
    }

    const page = PAGE_BY_TYPE[entityType]
    const { permission } = await getEffectivePagePermissionForUser(user, page)
    accessMap[entityType] = {
      allowed: permission.visible,
      selfViewOnly: permission.selfViewOnly,
    }
  }

  return accessMap
}

export const searchRoutes = new Elysia({ prefix: '/api/search' })
  .use(authPlugin)
  .get('/global', async ({ query, jwt, headers, set }) => {
    const config = getSearchConfig()
    if (!config.enabled) {
      set.status = 503
      return {
        error: 'Global search is disabled',
        items: [],
        hasMore: false,
        nextCursor: null,
        totalApprox: 0,
      }
    }

    const productId = query.productId?.trim()
    if (!productId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }

    const q = query.q?.trim() || ''
    if (!q) {
      return { items: [], hasMore: false, nextCursor: null, totalApprox: 0 }
    }

    const access = await requireProductAccess(jwt.verify, headers, set, productId)
    if (!access) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const requestedTypes = parseSearchTypes(query.types)
    const accessMap = await buildAccessMap(access.user, requestedTypes)
    const allowedTypes = requestedTypes.filter((entityType) => accessMap[entityType].allowed)

    if (allowedTypes.length === 0) {
      return { items: [], hasMore: false, nextCursor: null, totalApprox: 0 }
    }

    const limitRaw = Number(query.limit || config.defaultLimit)
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : config.defaultLimit, config.maxLimit))

    return runGlobalSearch({
      productId,
      q,
      types: allowedTypes,
      limit,
      cursorOffset: decodeGlobalSearchCursor(query.cursor || null),
      userId: access.user.id,
      access: accessMap,
    })
  }, {
    query: t.Object({
      productId: t.Optional(t.String()),
      q: t.Optional(t.String()),
      types: t.Optional(t.String()),
      limit: t.Optional(t.Numeric()),
      cursor: t.Optional(t.String()),
    }),
  })
