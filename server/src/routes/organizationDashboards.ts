import { Elysia } from 'elysia'
import { dashboardRoutes } from './dashboards'

function forwardDashboardsRequest(input: {
  request: Request
  organizationId: string
  targetPath: string
}): Request {
  const targetUrl = new URL(input.request.url)
  targetUrl.pathname = input.targetPath
  targetUrl.searchParams.set('organizationId', input.organizationId)

  const headers = new Headers(input.request.headers)
  headers.set('x-productier-organization-id', input.organizationId)

  return new Request(targetUrl.toString(), {
    method: input.request.method,
    headers,
    body: input.request.method === 'GET' || input.request.method === 'HEAD' ? undefined : input.request.body,
    // Bun's Request implementation requires duplex when forwarding stream bodies.
    ...(input.request.method === 'GET' || input.request.method === 'HEAD' ? {} : { duplex: 'half' as const }),
  })
}

function resolveTargetPath(pathname: string, organizationId: string): string {
  const prefix = `/api/organizations/${organizationId}/dashboards`
  const suffix = pathname.slice(prefix.length)
  if (!suffix || suffix === '/') return '/api/dashboards/pages'
  return `/api/dashboards${suffix}`
}

export const organizationDashboardRoutes = new Elysia({ prefix: '/api/organizations/:organizationId/dashboards' })
  .all('/', async ({ params, request }) => {
    const forward = forwardDashboardsRequest({
      request,
      organizationId: params.organizationId,
      targetPath: '/api/dashboards/pages',
    })
    return dashboardRoutes.handle(forward)
  })
  .all('/*', async ({ params, request }) => {
    const targetPath = resolveTargetPath(new URL(request.url).pathname, params.organizationId)
    const forward = forwardDashboardsRequest({
      request,
      organizationId: params.organizationId,
      targetPath,
    })
    return dashboardRoutes.handle(forward)
  })
