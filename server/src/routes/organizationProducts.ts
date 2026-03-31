import { Elysia } from 'elysia'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { products } from '../db/schema'
import { authPlugin } from '../plugins/auth'
import { requireOrganizationAccess } from '../lib/authz'
import { activityRoutes } from './activities'
import { consumerFeedbackRoutes } from './consumerFeedback'
import { dashboardRoutes } from './dashboards'
import { deliveryRoutes } from './deliveries'
import { featureRequestRoutes } from './featureRequestsSecure'
import { favoriteRoutes } from './favorites'
import { initiativeRoutes } from './initiatives'
import { integrationsRoutes } from './integrations'
import { issuesRoutes } from './issues'
import { metricsRoutes } from './metrics'
import { productRoutes } from './products'
import { releaseRoutes } from './releasesSecure'
import { searchRoutes } from './search'
import { serverRoutes } from './servers'
import { storyRoutes } from './stories'
import { taskRoutes } from './tasks'
import { testCycleRoutes } from './testCycles'
import { wikiRoutes } from './wikiSecure'
import { ApiHttpError } from '../lib/apiErrors'

const ORGANIZATION_SCOPE_HEADER = 'x-productier-organization-id'

type DomainHandler = {
  domainPrefix: string
  targetPrefix: string
  app: { handle: (request: Request) => Response | Promise<Response> }
}

const DOMAIN_HANDLERS: DomainHandler[] = [
  { domainPrefix: 'activities', targetPrefix: '/api/activities', app: activityRoutes },
  { domainPrefix: 'consumer-feedbacks', targetPrefix: '/api/consumer-feedbacks', app: consumerFeedbackRoutes },
  { domainPrefix: 'dashboards', targetPrefix: '/api/dashboards', app: dashboardRoutes },
  { domainPrefix: 'deliveries', targetPrefix: '/api/deliveries', app: deliveryRoutes },
  { domainPrefix: 'feature-requests', targetPrefix: '/api/feature-requests', app: featureRequestRoutes },
  { domainPrefix: 'favorites', targetPrefix: '/api/favorites', app: favoriteRoutes },
  { domainPrefix: 'initiatives', targetPrefix: '/api/initiatives', app: initiativeRoutes },
  { domainPrefix: 'integrations', targetPrefix: '/api/integrations', app: integrationsRoutes },
  { domainPrefix: 'issues', targetPrefix: '/api/issues', app: issuesRoutes },
  { domainPrefix: 'metrics', targetPrefix: '/api/metrics', app: metricsRoutes },
  { domainPrefix: 'releases', targetPrefix: '/api/releases', app: releaseRoutes },
  { domainPrefix: 'search', targetPrefix: '/api/search', app: searchRoutes },
  { domainPrefix: 'servers', targetPrefix: '/api/servers', app: serverRoutes },
  { domainPrefix: 'stories', targetPrefix: '/api/stories', app: storyRoutes },
  { domainPrefix: 'tasks', targetPrefix: '/api/tasks', app: taskRoutes },
  { domainPrefix: 'test-cycles', targetPrefix: '/api/test-cycles', app: testCycleRoutes },
  { domainPrefix: 'wiki', targetPrefix: '/api/wiki', app: wikiRoutes },
]

function resolveDomainHandler(
  tenantPathSuffix: string,
  productId: string,
): { handler: DomainHandler; targetPath: string } | null {
  const normalized = tenantPathSuffix.replace(/^\/+/, '')
  if (!normalized) return null

  if (normalized === 'members' || normalized.startsWith('members/')) {
    return {
      handler: { domainPrefix: 'members', targetPrefix: '/api/products', app: productRoutes },
      targetPath: `/api/products/${productId}/${normalized}`,
    }
  }

  if (normalized === 'settings/metrics') {
    return {
      handler: { domainPrefix: 'settings', targetPrefix: '/api/products', app: productRoutes },
      targetPath: `/api/products/${productId}/${normalized}`,
    }
  }

  if (normalized === 'upload-logo') {
    return {
      handler: { domainPrefix: 'upload-logo', targetPrefix: '/api/products', app: productRoutes },
      targetPath: '/api/products/upload-logo',
    }
  }

  for (const handler of DOMAIN_HANDLERS) {
    if (normalized === handler.domainPrefix || normalized.startsWith(`${handler.domainPrefix}/`)) {
      const suffix = normalized.slice(handler.domainPrefix.length)
      return {
        handler,
        targetPath: `${handler.targetPrefix}${suffix}`,
      }
    }
  }

  return null
}

async function buildForwardRequest(input: {
  request: Request
  targetUrl: URL
  productId: string
  organizationId: string
}): Promise<Request> {
  const method = input.request.method.toUpperCase()
  const headers = new Headers(input.request.headers)
  headers.set(ORGANIZATION_SCOPE_HEADER, input.organizationId)
  input.targetUrl.searchParams.set('productId', input.productId)

  if (method === 'GET' || method === 'HEAD') {
    return new Request(input.targetUrl.toString(), {
      method,
      headers,
    })
  }

  const contentType = (input.request.headers.get('content-type') || '').toLowerCase()

  if (contentType.includes('application/json')) {
    const rawTextBody = await input.request.clone().text()
    if (rawTextBody.trim().length === 0) {
      return new Request(input.targetUrl.toString(), {
        method,
        headers,
        body: rawTextBody,
      })
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawTextBody)
    } catch {
      throw new ApiHttpError(400, 'BAD_REQUEST', 'Invalid JSON request payload')
    }

    const bodyWithProduct = (
      parsedBody
      && typeof parsedBody === 'object'
      && !Array.isArray(parsedBody)
      && (parsedBody as Record<string, unknown>).productId === undefined
    )
      ? { ...(parsedBody as Record<string, unknown>), productId: input.productId }
      : parsedBody

    headers.set('content-type', 'application/json')
    return new Request(input.targetUrl.toString(), {
      method,
      headers,
      body: JSON.stringify(bodyWithProduct),
    })
  }

  if (contentType.includes('multipart/form-data')) {
    const formData = await input.request.clone().formData()
    if (!formData.has('productId')) {
      formData.set('productId', input.productId)
    }
    // Let the runtime provide the multipart boundary.
    headers.delete('content-type')
    return new Request(input.targetUrl.toString(), {
      method,
      headers,
      body: formData,
    })
  }

  const rawBody = await input.request.clone().arrayBuffer()
  return new Request(input.targetUrl.toString(), {
    method,
    headers,
    body: rawBody,
  })
}

export const organizationProductRoutes = new Elysia({ prefix: '/api/organizations/:organizationId/products/:productId' })
  .use(authPlugin)
  .all('/*', async ({ params, request, jwt, headers, set }) => {
    const typedParams = params as Record<string, string | undefined>
    const organizationId = typedParams.organizationId || ''
    const productId = typedParams.productId || ''
    const wildcard = typedParams['*'] || ''
    if (!organizationId || !productId || !wildcard) {
      set.status = 400
      return { error: 'organizationId, productId, and route suffix are required' }
    }

    const orgAccess = await requireOrganizationAccess(jwt.verify, headers, set, organizationId)
    if (!orgAccess) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const product = await db.query.products.findFirst({
      where: and(
        eq(products.id, productId),
        eq(products.organizationId, organizationId),
      ),
      columns: { id: true },
    })
    if (!product) {
      set.status = 404
      return { error: 'Product not found for organization' }
    }

    const resolved = resolveDomainHandler(wildcard, productId)
    if (!resolved) {
      set.status = 404
      return { error: 'Route not found' }
    }

    const targetUrl = new URL(request.url)
    targetUrl.pathname = resolved.targetPath
    const forwardRequest = await buildForwardRequest({
      request,
      targetUrl,
      productId,
      organizationId,
    })

    return resolved.handler.app.handle(forwardRequest)
  })
