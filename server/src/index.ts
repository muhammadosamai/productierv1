import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { authRoutes } from './routes/auth'
import { onboardingRoutes } from './routes/onboarding'
import { organizationTeamRoutes } from './routes/organizationTeams'
import { organizationProductRoutes } from './routes/organizationProducts'
import { organizationMetricsRoutes } from './routes/organizationMetrics'
import { organizationDashboardRoutes } from './routes/organizationDashboards'
import { organizationWorkspaceRoutes } from './routes/organizationWorkspaces'
import { consumerFeedbackPublicRoutes } from './routes/consumerFeedbackPublic'
import { settingsRoutes } from './routes/settings'
import { rolesRoutes } from './routes/roles'
import { usersRoutes } from './routes/users'
import { organizationUsersRoutes } from './routes/organizationUsers'
import { metadataRoutes } from './routes/metadata'
import { notificationRoutes } from './routes/notifications'
import { retiredTenantRoutes } from './routes/retiredTenantRoutes'
import {
  apiError,
  badRequest,
  conflict,
  forbidden,
  inferCodeFromStatus,
  inferStatusFromCode,
  internalError,
  isApiHttpError,
  notFound,
  unauthorized,
  validationError,
} from './lib/apiErrors'
import { getNetworkConfig } from './config/network'
import { getStorageConfig } from './config/storage'
import { getIntegrationsConfig } from './config/integrations'
import { getSearchConfig } from './config/search'
import { getHomeBriefConfig } from './config/brief'
import { collectMigrationStatus } from './db/migration-status'
import { startNotificationReminderScheduler } from './lib/notificationReminderScheduler'
import { getStorage } from './storage'

function getErrorStatus(
  setStatus: number | string | undefined,
  fallbackStatus: number,
  errorCode?: string
) {
  if (typeof setStatus === 'number' && setStatus >= 400) return setStatus
  if (fallbackStatus >= 400) return fallbackStatus
  if (typeof errorCode === 'string' && errorCode.trim().length > 0) {
    return inferStatusFromCode(errorCode)
  }
  return 500
}

function buildJsonResponse(payload: unknown, status: number, sourceHeaders?: Headers) {
  const headers = sourceHeaders ? new Headers(sourceHeaders) : new Headers()
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(payload), {
    status,
    headers,
  })
}

const LEGACY_TENANT_PATH_PREFIXES = [
  '/api/auth/users',
] as const

function isLegacyTenantPath(pathname: string): boolean {
  return LEGACY_TENANT_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function normalizeObjectErrorResponse(
  response: unknown,
  set: { status?: number | string }
) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return
  const maybePayload = response as Record<string, unknown>

  if (maybePayload.type === 'validation') {
    return buildJsonResponse(
      validationError(undefined, 'Validation failed', maybePayload),
      400
    )
  }

  if (typeof maybePayload.error !== 'string') return

  const normalizedStatus = getErrorStatus(
    set.status,
    200,
    typeof maybePayload.code === 'string' ? maybePayload.code : undefined
  )
  const normalizedPayload =
    typeof maybePayload.code === 'string'
      ? maybePayload
      : {
          ...maybePayload,
          code: inferCodeFromStatus(normalizedStatus),
        }

  return buildJsonResponse(normalizedPayload, normalizedStatus)
}

async function normalizeLegacyErrorResponse(
  response: Response,
  set: { status?: number | string }
) {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  if (!contentType.includes('application/json')) return response

  let parsed: unknown
  try {
    parsed = await response.clone().json()
  } catch {
    return response
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return response
  const maybePayload = parsed as Record<string, unknown>

  if (maybePayload.type === 'validation') {
    const headers = new Headers(response.headers)
    headers.set('content-type', 'application/json')
    return new Response(
      JSON.stringify(validationError(undefined, 'Validation failed', maybePayload)),
      {
        status: 400,
        headers,
      }
    )
  }

  if (typeof maybePayload.error !== 'string') return response

  const normalizedStatus = getErrorStatus(
    set.status,
    response.status,
    typeof maybePayload.code === 'string' ? maybePayload.code : undefined
  )
  const hasCode = typeof maybePayload.code === 'string'
  const normalizedPayload = hasCode
    ? maybePayload
    : {
        ...maybePayload,
        code: inferCodeFromStatus(normalizedStatus),
      }

  if (hasCode && normalizedStatus === response.status) return response

  return buildJsonResponse(normalizedPayload, normalizedStatus, response.headers)
}

export function createApp() {
  getIntegrationsConfig()
  getSearchConfig()
  getHomeBriefConfig()
  const networkConfig = getNetworkConfig()
  const storageConfig = getStorageConfig()

  const app = new Elysia()
    .use(cors({
      origin: networkConfig.corsOrigins,
    }))

  if (storageConfig.backend === 'local') {
    app.get(`${storageConfig.publicPrefix}/:namespace/:filename`, async ({ params, set }) => {
      let namespace = ''
      let filename = ''
      try {
        namespace = decodeURIComponent(params.namespace || '').trim()
        filename = decodeURIComponent(params.filename || '').trim()
      } catch {
        set.status = 400
        return { error: 'Invalid file path' }
      }
      if (!namespace || !filename) {
        set.status = 404
        return { error: 'File not found' }
      }
      if (namespace === 'attachments') {
        set.status = 404
        return { error: 'File not found' }
      }

      const storage = getStorage()
      const publicPath = `${storageConfig.publicPrefix}/${namespace}/${filename}`
      const file = await storage.readByPublicPath(publicPath)
      if (!file) {
        set.status = 404
        return { error: 'File not found' }
      }

      const headers = new Headers()
      headers.set('content-type', file.contentType || 'application/octet-stream')
      headers.set('cache-control', 'public, max-age=3600')
      const responseBytes = Uint8Array.from(file.bytes)
      return new Response(responseBytes.buffer, {
        status: 200,
        headers,
      })
    })
  }

  const onboardingEnabled = String(process.env.ONBOARDING_V2_ENABLED ?? 'true').toLowerCase() !== 'false'

  let routedApp = app
    .use(retiredTenantRoutes)
    .use(authRoutes)

  if (onboardingEnabled) {
    routedApp = (routedApp as any).use(onboardingRoutes)
  }

  return routedApp
    .use(organizationTeamRoutes)
    .use(organizationMetricsRoutes)
    .use(organizationDashboardRoutes)
    .use(organizationWorkspaceRoutes)
    .use(organizationProductRoutes)
    .use(consumerFeedbackPublicRoutes)
    .use(settingsRoutes)
    .use(rolesRoutes)
    .use(usersRoutes)
    .use(organizationUsersRoutes)
    .use(notificationRoutes)
    .use(metadataRoutes)
    .get('/api/health', () => ({ status: 'ok' }))
    .onBeforeHandle(({ request, set }) => {
      const pathname = new URL(request.url).pathname
      if (!isLegacyTenantPath(pathname)) return
      const internalForwardMarker = request.headers.get('x-productier-internal-org-forward')
      if (internalForwardMarker === 'organization-users-routes') return
      set.status = 410
      return {
        error: 'Legacy tenant route is retired. Use /api/organizations/:organizationId/users endpoints.',
      }
    })
    .onError(({ code, error, set }) => {
      if (isApiHttpError(error)) {
        return apiError(set, error.status, error.code, error.message, error.details)
      }
      if (code === 'VALIDATION') {
        return validationError(set, 'Validation failed')
      }
      if (code === 'PARSE') {
        return badRequest(set, 'Invalid request payload')
      }
      if (code === 'NOT_FOUND') {
        return notFound(set, 'Route not found')
      }

      if (set.status === 401) return unauthorized(set)
      if (set.status === 403) return forbidden(set)
      if (set.status === 404) return notFound(set)
      if (set.status === 409) return conflict(set)

      console.error('[server] Unhandled error', error)
      return internalError(set)
    })
    .mapResponse(({ response, set }) => {
      if (response instanceof Response) {
        return normalizeLegacyErrorResponse(response, set)
      }
      return normalizeObjectErrorResponse(response, set)
    })
}

export const app = createApp()

async function logRuntimeSchemaPreflight(): Promise<void> {
  try {
    const report = await collectMigrationStatus()
    const missingNotificationMigrations = report.requiredNotificationMigrations
      .filter((entry) => !entry.inJournal || !entry.applied)
      .map((entry) => entry.tag)
    const missingPlatformMigrations = report.requiredPlatformMigrations
      .filter((entry) => !entry.inJournal || !entry.applied)
      .map((entry) => entry.tag)
    const missingNotificationSchema = report.notificationSchemaChecks
      .filter((entry) => !entry.exists)
      .map((entry) => `${entry.kind}:${entry.key}`)
    const missingPlatformSchema = report.platformSchemaChecks
      .filter((entry) => !entry.exists)
      .map((entry) => `${entry.kind}:${entry.key}`)

    if (
      missingNotificationMigrations.length > 0
      || missingPlatformMigrations.length > 0
      || missingNotificationSchema.length > 0
      || missingPlatformSchema.length > 0
      || report.hasJournalReferenceGap
      || report.hasUnexpectedOrphanSqlFiles
    ) {
      console.warn('[db:migration-status] Runtime schema preflight detected mismatches.', {
        missingNotificationMigrations,
        missingPlatformMigrations,
        missingNotificationSchema,
        missingPlatformSchema,
        missingSqlForJournalTags: report.missingSqlForJournalTags,
        staleRetiredTags: report.staleRetiredTags,
        unexpectedOrphanSqlFiles: report.unexpectedOrphanSqlFiles,
        recommendation: 'Run `bun run db:migration:reconcile` then `bun run db:migrate`.',
      })
      return
    }

    console.log('[db:migration-status] Runtime schema preflight OK.')
  } catch (error) {
    console.warn('[db:migration-status] Runtime schema preflight failed.', error)
  }
}

if (import.meta.main) {
  const networkConfig = getNetworkConfig()
  await logRuntimeSchemaPreflight()
  const stopReminderScheduler = startNotificationReminderScheduler()

  const shutdown = () => {
    stopReminderScheduler()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  app.listen(networkConfig.port)
  console.log(`Server running at http://localhost:${app.server?.port}`)
}
