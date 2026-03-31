import { Elysia } from 'elysia'
import { authRoutes } from './auth'

function forwardAuthUsersRequest(input: {
  request: Request
  targetPath: string
  organizationId: string
}): Request {
  const targetUrl = new URL(input.request.url)
  targetUrl.pathname = input.targetPath
  targetUrl.searchParams.set('organizationId', input.organizationId)
  const headers = new Headers(input.request.headers)
  headers.set('x-productier-internal-org-forward', 'organization-users-routes')
  return new Request(targetUrl.toString(), {
    method: input.request.method,
    headers,
  })
}

export const organizationUsersRoutes = new Elysia({ prefix: '/api/organizations/:organizationId/users' })
  .get('/', async ({ params, request }) => {
    const forward = forwardAuthUsersRequest({
      request,
      targetPath: '/api/auth/users',
      organizationId: params.organizationId,
    })
    return authRoutes.handle(forward)
  })
  .get('/:id/work', async ({ params, request }) => {
    const forward = forwardAuthUsersRequest({
      request,
      targetPath: `/api/auth/users/${params.id}/work`,
      organizationId: params.organizationId,
    })
    return authRoutes.handle(forward)
  })
  .get('/:id/home', async ({ params, request }) => {
    const forward = forwardAuthUsersRequest({
      request,
      targetPath: `/api/auth/users/${params.id}/home`,
      organizationId: params.organizationId,
    })
    return authRoutes.handle(forward)
  })
  .get('/:id/daily-brief', async ({ params, request }) => {
    const forward = forwardAuthUsersRequest({
      request,
      targetPath: `/api/auth/users/${params.id}/daily-brief`,
      organizationId: params.organizationId,
    })
    return authRoutes.handle(forward)
  })
