import { Elysia } from 'elysia'

const RETIRED_ROUTE_PREFIXES = [
  '/api/auth/users',
  '/api/users',
  '/api/products',
  '/api/tasks',
  '/api/stories',
  '/api/initiatives',
  '/api/deliveries',
  '/api/issues',
  '/api/test-cycles',
  '/api/search',
  '/api/activities',
  '/api/feature-requests',
  '/api/wiki',
  '/api/releases',
  '/api/servers',
  '/api/favorites',
  '/api/integrations',
  '/api/metrics',
  '/api/dashboards',
] as const

function retiredPayload() {
  return {
    error: 'Legacy tenant route is retired. Use /api/organizations/:organizationId/... endpoints.',
  }
}

const route = new Elysia()
for (const prefix of RETIRED_ROUTE_PREFIXES) {
  ;(route as any)
    .all(prefix, ({ set }: { set: { status?: number | string } }) => {
      set.status = 410
      return retiredPayload()
    })
    .all(`${prefix}/*`, ({ set }: { set: { status?: number | string } }) => {
      set.status = 410
      return retiredPayload()
    })
}

export const retiredTenantRoutes = route
