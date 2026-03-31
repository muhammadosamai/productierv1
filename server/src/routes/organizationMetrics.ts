import { Elysia } from 'elysia'
import { metricsRoutes } from './metrics'

async function forwardMetricsRequest(input: {
  request: Request
  organizationId: string
  targetPath: string
}): Promise<Request> {
  const targetUrl = new URL(input.request.url)
  targetUrl.pathname = input.targetPath
  targetUrl.searchParams.set('organizationId', input.organizationId)

  const headers = new Headers(input.request.headers)
  headers.set('x-productier-organization-id', input.organizationId)

  const method = input.request.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') {
    return new Request(targetUrl.toString(), {
      method,
      headers,
    })
  }

  const body = await input.request.clone().arrayBuffer()
  return new Request(targetUrl.toString(), {
    method,
    headers,
    body,
  })
}

function resolveTargetPath(pathname: string, organizationId: string): string {
  const prefix = `/api/organizations/${organizationId}/metrics`
  const suffix = pathname.slice(prefix.length)
  if (!suffix || suffix === '/') return '/api/metrics/dashboard'
  return `/api/metrics${suffix}`
}

export const organizationMetricsRoutes = new Elysia({ prefix: '/api/organizations/:organizationId/metrics' })
  .all('/', async ({ params, request }) => {
    const forward = await forwardMetricsRequest({
      request,
      organizationId: params.organizationId,
      targetPath: '/api/metrics/dashboard',
    })
    return metricsRoutes.handle(forward)
  })
  .all('/*', async ({ params, request }) => {
    const targetPath = resolveTargetPath(new URL(request.url).pathname, params.organizationId)
    const forward = await forwardMetricsRequest({
      request,
      organizationId: params.organizationId,
      targetPath,
    })
    return metricsRoutes.handle(forward)
  })
