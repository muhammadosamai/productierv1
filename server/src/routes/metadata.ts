import { Elysia, t } from 'elysia'
import { requireAuth } from '../lib/authz'
import {
  ENUM_CATALOG,
  MAIN_NAVIGATION_ITEMS,
  PAGE_CATALOG,
  PRODUCT_NAVIGATION_SECTIONS,
  ROLE_CATALOG,
  ROUTE_CATALOG,
  SETTINGS_KEY_SCHEMA,
} from '../lib/metadataCatalog'
import { authPlugin } from '../plugins/auth'

const shellSectionSchema = t.Union([t.Literal('global'), t.Literal('products')])

const roleSchema = t.Object({
  key: t.String(),
  label: t.String(),
  configurable: t.Boolean(),
})

const pageSchema = t.Object({
  key: t.String(),
  label: t.String(),
  selfViewOnlySupported: t.Boolean(),
  shellSection: shellSectionSchema,
})

const routeSchema = t.Object({
  pathPrefix: t.String(),
  pageKey: t.String(),
  shellSection: shellSectionSchema,
  routeName: t.Union([t.String(), t.Null()]),
})

const mainNavigationSchema = t.Object({
  id: t.String(),
  label: t.String(),
  iconToken: t.String(),
  route: t.String(),
  pageKey: t.String(),
  shellSection: shellSectionSchema,
  placement: t.Union([t.Literal('main'), t.Literal('footer')]),
  order: t.Number(),
})

const productNavigationItemSchema = t.Object({
  id: t.String(),
  label: t.String(),
  iconToken: t.String(),
  route: t.String(),
  pageKey: t.String(),
  expandable: t.Boolean(),
  hasAdd: t.Boolean(),
})

const productNavigationSectionSchema = t.Object({
  id: t.String(),
  label: t.String(),
  order: t.Number(),
  items: t.Array(productNavigationItemSchema),
})

const enumCatalogSchema = t.Object({
  story: t.Object({
    type: t.Array(t.String()),
    priority: t.Array(t.String()),
    status: t.Array(t.String()),
  }),
  task: t.Object({
    type: t.Array(t.String()),
    priority: t.Array(t.String()),
    status: t.Array(t.String()),
  }),
  delivery: t.Object({
    status: t.Array(t.String()),
  }),
  release: t.Object({
    status: t.Array(t.String()),
    type: t.Array(t.String()),
  }),
  testCycle: t.Object({
    status: t.Array(t.String()),
  }),
  issue: t.Object({
    status: t.Array(t.String()),
    severity: t.Array(t.String()),
  }),
})

const settingsKeySchema = t.Object({
  key: t.String(),
  valueType: t.Union([
    t.Literal('string'),
    t.Literal('boolean'),
    t.Literal('number'),
    t.Literal('json'),
  ]),
  storage: t.Union([
    t.Literal('localStorage'),
    t.Literal('serverSetting'),
    t.Literal('hybrid'),
  ]),
  description: t.String(),
})

const authErrorSchema = t.Object({
  error: t.String(),
})

export const metadataResponseSchemas = {
  pages: t.Object({
    pages: t.Array(pageSchema),
    roles: t.Array(roleSchema),
    configurableRoles: t.Array(roleSchema),
  }),
  routes: t.Object({
    routes: t.Array(routeSchema),
  }),
  navigation: t.Object({
    mainSidebar: t.Array(mainNavigationSchema),
    productSections: t.Array(productNavigationSectionSchema),
  }),
  enums: t.Object({
    enums: enumCatalogSchema,
  }),
  settingsKeys: t.Object({
    keys: t.Array(settingsKeySchema),
  }),
  authError: authErrorSchema,
}

function authError(status: number | string | undefined) {
  return { error: status === 403 ? 'Forbidden' : 'Unauthorized' }
}

function authStatusCode(status: number | string | undefined): 401 | 403 {
  return status === 403 || status === '403' ? 403 : 401
}

function authResponse(status: number | string | undefined): Response {
  return new Response(JSON.stringify(authError(status)), {
    status: authStatusCode(status),
    headers: {
      'content-type': 'application/json',
    },
  })
}

export const metadataRoutes = new Elysia({ prefix: '/api/metadata' })
  .use(authPlugin)

  .get('/pages', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return authResponse(set.status)

    return {
      pages: PAGE_CATALOG,
      roles: ROLE_CATALOG,
      configurableRoles: ROLE_CATALOG.filter((entry) => entry.configurable),
    }
  })

  .get('/routes', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return authResponse(set.status)

    return {
      routes: ROUTE_CATALOG,
    }
  })

  .get('/navigation', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return authResponse(set.status)

    return {
      mainSidebar: MAIN_NAVIGATION_ITEMS,
      productSections: PRODUCT_NAVIGATION_SECTIONS,
    }
  })

  .get('/enums', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return authResponse(set.status)

    return {
      enums: ENUM_CATALOG,
    }
  })

  .get('/settings-keys', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return authResponse(set.status)

    return {
      keys: SETTINGS_KEY_SCHEMA,
    }
  })
