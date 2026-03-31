export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type AuthMode = 'none' | 'user' | 'superAdmin' | 'regularUser'

export interface EndpointSession {
  token: string
  userId: string
  email: string
  role: string
  name: string
}

export interface EndpointCredentials {
  email: string
  password: string
  regularEmail: string
  regularPassword: string
}

export interface EndpointFixtures {
  runId: string
  productName: string
  caseProductName: string
  productId?: string
  organizationId?: string
  onboardingOrganizationId?: string
  organizationTeamId?: string
  organizationTeamCaseId?: string
  primaryUserId?: string
  secondaryUserId?: string
  tertiaryUserId?: string
  storyId?: string
  storyCommentId?: string
  taskId?: string
  taskCommentId?: string
  taskAttachmentId?: string
  initiativeId?: string
  deliveryId?: string
  serverId?: string
  releaseId?: string
  releaseDeploymentId?: string
  releaseTargetId?: string
  testCycleId?: string
  testIssueId?: string
  issueId?: string
  featureRequestId?: string
  consumerFeedbackId?: string
  wikiTypeId?: string
  wikiAssetId?: string
  wikiAssetId2?: string
  wikiRevisionId?: string
  wikiRelationId?: string
  integrationConnectionId?: string
  integrationRunId?: string
  titleId?: string
  favoriteEntityType?: string
  favoriteEntityId?: string
  productMemberUserId?: string
  dashboardPageId?: string
  dashboardWidgetId?: string
  dashboardTemplateId?: string
  onboardingInviteId?: string
  onboardingInviteEmail?: string
  onboardingInviteToken?: string
  registeredUserEmail: string
  registeredUserPassword: string
}

export interface EndpointRunContext {
  baseUrl: string
  credentials: EndpointCredentials
  sessions: {
    superAdmin: EndpointSession
    regularUser?: EndpointSession
  }
  fixtures: EndpointFixtures
}

export interface EndpointRequestSpec {
  method: HttpMethod
  path: string
  query?: Record<string, string | number | boolean | null | undefined>
  auth?: AuthMode
  json?: unknown
  formData?: FormData
  headers?: Record<string, string>
}

export interface EndpointResponse {
  status: number
  ok: boolean
  url: string
  headers: Record<string, string>
  rawText: string
  data: unknown
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3001'
const DEFAULT_ENDPOINT_PRODUCT_NAME = 'Endpoint Test Workspace'
const DEFAULT_ENDPOINT_CASE_PRODUCT_NAME = 'Endpoint Case Product'
const DEFAULT_REGISTERED_ENDPOINT_USER_EMAIL = 'endpoint.runner@productier.test'
const DEFAULT_REGISTERED_ENDPOINT_USER_PASSWORD = 'EndpointRunner-Shared-Secret!'
const DEMO_EMAIL_DOMAIN = '@novaforge.io'
const ENDPOINT_HARNESS_TITLE_KEY = 'endpoint_harness_full_access'
const ENDPOINT_HARNESS_TITLE_NAME = 'Endpoint Harness Full Access'
const LEGACY_DOMAIN_PREFIXES = [
  'products',
  'tasks',
  'stories',
  'initiatives',
  'deliveries',
  'issues',
  'test-cycles',
  'search',
  'activities',
  'feature-requests',
  'wiki',
  'releases',
  'servers',
  'favorites',
  'consumer-feedbacks',
  'integrations',
  'dashboards',
] as const

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function isTruthyEnvFlag(name: string): boolean {
  const raw = readOptionalEnv(name)
  if (!raw) return false
  const normalized = raw.toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no'
}

function isDemoCredentialEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(DEMO_EMAIL_DOMAIN)
}

function ensureCredentialPairs(credentials: EndpointCredentials): void {
  const hasAdminEmail = credentials.email.length > 0
  const hasAdminPassword = credentials.password.length > 0
  if (hasAdminEmail !== hasAdminPassword) {
    throw new Error(
      'Endpoint docs config requires API_EMAIL and API_PASSWORD to be set together when either is provided.',
    )
  }

  const hasRegularEmail = credentials.regularEmail.length > 0
  const hasRegularPassword = credentials.regularPassword.length > 0
  if (hasRegularEmail !== hasRegularPassword) {
    throw new Error(
      'Endpoint docs config requires API_REGULAR_EMAIL and API_REGULAR_PASSWORD to be set together when either is provided.',
    )
  }
}

function resolveEndpointCredentials(): EndpointCredentials {
  const credentials: EndpointCredentials = {
    email: readOptionalEnv('API_EMAIL') ?? '',
    password: readOptionalEnv('API_PASSWORD') ?? '',
    regularEmail: readOptionalEnv('API_REGULAR_EMAIL') ?? '',
    regularPassword: readOptionalEnv('API_REGULAR_PASSWORD') ?? '',
  }
  ensureCredentialPairs(credentials)

  if (!credentials.email || !credentials.password || !credentials.regularEmail || !credentials.regularPassword) {
    throw new Error(
      'Endpoint docs runs now require dedicated credentials: set API_EMAIL/API_PASSWORD and ' +
      'API_REGULAR_EMAIL/API_REGULAR_PASSWORD. Seed them with "npm run db:seed:endpoint-test".',
    )
  }

  const allowDemoCredentials = isTruthyEnvFlag('ALLOW_ENDPOINT_DEMO_CREDENTIALS')
  if (
    !allowDemoCredentials
    && (isDemoCredentialEmail(credentials.email) || isDemoCredentialEmail(credentials.regularEmail))
  ) {
    throw new Error(
      'Refusing to run endpoint docs with NovaForge demo users. ' +
      'Use dedicated endpoint-test users or set ALLOW_ENDPOINT_DEMO_CREDENTIALS=true to override intentionally.',
    )
  }

  if (credentials.email.toLowerCase() === credentials.regularEmail.toLowerCase()) {
    throw new Error('API_EMAIL and API_REGULAR_EMAIL must be different accounts for role-boundary checks.')
  }

  return credentials
}

function safeJsonParse(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function decodeJwtHeader(token: string): Record<string, unknown> | null {
  const [encodedHeader] = token.split('.')
  if (!encodedHeader) return null
  const padded = encodedHeader.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = `${padded}${'='.repeat((4 - (padded.length % 4)) % 4)}`
  try {
    const decoded = atob(normalized)
    const parsed = JSON.parse(decoded)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function toQueryString(query: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded.length > 0 ? `?${encoded}` : ''
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | boolean | null | undefined>): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const suffix = query ? toQueryString(query) : ''
  return `${normalizedBase}${normalizedPath}${suffix}`
}

function asNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function maybeProductIdFromPath(path: string): string {
  if (path.startsWith('/api/products/upload-logo')) return ''
  const match = path.match(/^\/api\/products\/([^/]+)/)
  if (!match) return ''
  return decodeURIComponent(match[1] || '').trim()
}

function maybeProductIdFromJson(json: unknown): string {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return ''
  return asNonEmptyString((json as Record<string, unknown>).productId)
}

function maybeProductIdFromFormData(formData?: FormData): string {
  if (!formData) return ''
  const value = formData.get('productId')
  return typeof value === 'string' ? value.trim() : ''
}

function readScopedOrganizationId(
  ctx: EndpointRunContext,
  spec: EndpointRequestSpec,
): string {
  const fromQuery = asNonEmptyString(spec.query?.organizationId)
  if (fromQuery) return fromQuery

  if (spec.json && typeof spec.json === 'object' && !Array.isArray(spec.json)) {
    const fromBody = asNonEmptyString((spec.json as Record<string, unknown>).organizationId)
    if (fromBody) return fromBody
  }

  const fromFixtures = asNonEmptyString(ctx.fixtures.organizationId)
  if (fromFixtures) return fromFixtures
  return asNonEmptyString(ctx.fixtures.onboardingOrganizationId)
}

function readScopedProductId(
  ctx: EndpointRunContext,
  spec: EndpointRequestSpec,
): string {
  const fromPath = maybeProductIdFromPath(spec.path)
  if (fromPath) return fromPath

  const fromQuery = asNonEmptyString(spec.query?.productId)
  if (fromQuery) return fromQuery

  const fromBody = maybeProductIdFromJson(spec.json)
  if (fromBody) return fromBody

  const fromFormData = maybeProductIdFromFormData(spec.formData)
  if (fromFormData) return fromFormData

  return asNonEmptyString(ctx.fixtures.productId)
}

function dropQueryKeys(
  query: Record<string, string | number | boolean | null | undefined> | undefined,
  keys: string[],
): Record<string, string | number | boolean | null | undefined> | undefined {
  if (!query) return query
  const keySet = new Set(keys)
  const next = Object.fromEntries(
    Object.entries(query).filter(([key]) => !keySet.has(key)),
  )
  return Object.keys(next).length > 0 ? next : undefined
}

function toScopedSpec(
  ctx: EndpointRunContext,
  spec: EndpointRequestSpec,
): EndpointRequestSpec {
  const path = spec.path
  if (!path.startsWith('/api/')) return spec
  if (path.startsWith('/api/organizations/')) return spec
  if (path.startsWith('/api/auth/users')) {
    const organizationId = readScopedOrganizationId(ctx, spec)
    if (!organizationId) return spec
    const suffix = path.slice('/api/auth/users'.length)
    return {
      ...spec,
      path: `/api/organizations/${encodeURIComponent(organizationId)}/users${suffix}`,
      query: dropQueryKeys(spec.query, ['organizationId']),
    }
  }
  if (path === '/api/users' || path.startsWith('/api/users/')) {
    const organizationId = readScopedOrganizationId(ctx, spec)
    if (!organizationId) return spec
    const suffix = path.slice('/api/users'.length)
    return {
      ...spec,
      path: `/api/organizations/${encodeURIComponent(organizationId)}/users-admin${suffix}`,
      query: dropQueryKeys(spec.query, ['organizationId']),
    }
  }
  if (
    path.startsWith('/api/auth/')
    || path === '/api/health'
    || path.startsWith('/api/onboarding/')
    || path.startsWith('/api/roles/')
    || path.startsWith('/api/settings/')
    || path.startsWith('/api/metadata/')
    || path.startsWith('/api/notifications/')
  ) {
    return spec
  }

  if (
    spec.method === 'POST'
    && spec.auth === 'none'
    && (path === '/api/consumer-feedbacks' || path === '/api/consumer-feedbacks/')
  ) {
    return spec
  }

  const organizationId = readScopedOrganizationId(ctx, spec)
  if (!organizationId) return spec

  if (path === '/api/products' || path === '/api/products/') {
    return {
      ...spec,
      path: `/api/organizations/${encodeURIComponent(organizationId)}/products`,
      query: dropQueryKeys(spec.query, ['organizationId']),
    }
  }

  if (path.startsWith('/api/products/upload-logo')) {
    const scopedProductId = readScopedProductId(ctx, spec)
    if (!scopedProductId) return spec
    return {
      ...spec,
      path: `/api/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(scopedProductId)}/upload-logo`,
      query: dropQueryKeys(spec.query, ['organizationId', 'productId']),
    }
  }

  if (path.startsWith('/api/products/')) {
    const rawSuffix = path.slice('/api/products/'.length)
    const [rawProductId, ...suffixParts] = rawSuffix.split('/')
    const scopedProductId = decodeURIComponent(rawProductId || '').trim() || readScopedProductId(ctx, spec)
    if (!scopedProductId) return spec
    const suffix = suffixParts.join('/')
    const scopedPath = suffix
      ? `/api/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(scopedProductId)}/${suffix}`
      : `/api/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(scopedProductId)}`
    return {
      ...spec,
      path: scopedPath,
      query: dropQueryKeys(spec.query, ['organizationId', 'productId']),
    }
  }

  if (path === '/api/dashboards' || path === '/api/dashboards/' || path.startsWith('/api/dashboards/')) {
    const suffix = path.slice('/api/dashboards'.length)
    return {
      ...spec,
      path: `/api/organizations/${encodeURIComponent(organizationId)}/dashboards${suffix}`,
      query: dropQueryKeys(spec.query, ['organizationId']),
    }
  }

  if (path.startsWith('/api/metrics')) {
    const suffix = path.slice('/api/metrics'.length)
    return {
      ...spec,
      path: `/api/organizations/${encodeURIComponent(organizationId)}/metrics${suffix}`,
      query: dropQueryKeys(spec.query, ['organizationId']),
    }
  }

  for (const domainPrefix of LEGACY_DOMAIN_PREFIXES) {
    const base = `/api/${domainPrefix}`
    if (path === base || path.startsWith(`${base}/`)) {
      const scopedProductId = readScopedProductId(ctx, spec)
      if (!scopedProductId) return spec
      const suffix = path.slice(base.length)
      return {
        ...spec,
        path: `/api/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(scopedProductId)}/${domainPrefix}${suffix}`,
        query: dropQueryKeys(spec.query, ['organizationId', 'productId']),
      }
    }
  }

  return spec
}

export function createRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createImageFile(name = 'sample.png'): File {
  // Valid 1x1 PNG payload (not just a header) so MIME sniffers can parse it.
  const onePixelPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+R6kAAAAASUVORK5CYII='
  const binary = atob(onePixelPngBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new File([bytes], name, { type: 'image/png' })
}

export function createTextFile(name = 'sample.txt', content = 'endpoint-docs-sample'): File {
  return new File([content], name, { type: 'text/plain' })
}

function dataHasErrorField(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const maybeError = (data as Record<string, unknown>).error
  return typeof maybeError === 'string' && maybeError.length > 0 ? maybeError : null
}

function sessionTokenForAuth(ctx: EndpointRunContext, auth: AuthMode | undefined): string | undefined {
  if (!auth || auth === 'none') return undefined
  if (auth === 'superAdmin') return ctx.sessions.superAdmin.token
  if (auth === 'regularUser') return ctx.sessions.regularUser?.token
  return ctx.sessions.superAdmin.token
}

export async function requestEndpoint(ctx: EndpointRunContext, spec: EndpointRequestSpec): Promise<EndpointResponse> {
  const scopedSpec = toScopedSpec(ctx, spec)
  const url = buildUrl(ctx.baseUrl, scopedSpec.path, scopedSpec.query)
  const headers = new Headers(scopedSpec.headers ?? {})
  const token = sessionTokenForAuth(ctx, scopedSpec.auth)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const init: RequestInit = { method: scopedSpec.method, headers }
  if (scopedSpec.formData) {
    init.body = scopedSpec.formData
  } else if (scopedSpec.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    init.body = JSON.stringify(scopedSpec.json)
  }

  const response = await fetch(url, init)
  const rawText = await response.text()
  const data = safeJsonParse(rawText)

  const headerMap: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headerMap[key] = value
  })

  return {
    status: response.status,
    ok: response.ok,
    url,
    headers: headerMap,
    rawText,
    data,
  }
}

function ensureSuccess(label: string, response: EndpointResponse, expectedStatuses: number[] = [200]): void {
  const errorField = dataHasErrorField(response.data)
  if (!expectedStatuses.includes(response.status) || errorField) {
    const shortBody = response.rawText.length > 300 ? `${response.rawText.slice(0, 297)}...` : response.rawText
    throw new Error(
      `${label} failed (status=${response.status}, expected=${expectedStatuses.join(', ')}, errorField=${errorField ?? 'none'}) body=${shortBody}`,
    )
  }
}

export async function login(baseUrl: string, email: string, password: string): Promise<EndpointSession> {
  const tmpCtx: EndpointRunContext = {
    baseUrl: baseUrl || DEFAULT_BASE_URL,
    credentials: {
      email,
      password,
      regularEmail: email,
      regularPassword: password,
    },
    sessions: {
      superAdmin: { token: '', userId: '', email: '', role: '', name: '' },
    },
    fixtures: {
      runId: createRunId(),
      productName: '',
      registeredUserEmail: '',
      registeredUserPassword: '',
    },
  }

  const response = await requestEndpoint(tmpCtx, {
    method: 'POST',
    path: '/api/auth/login',
    auth: 'none',
    json: { email, password },
  })
  ensureSuccess('login', response)

  const payload = response.data as Record<string, unknown>
  const token = typeof payload.token === 'string' ? payload.token : ''
  const user = payload.user as Record<string, unknown> | undefined
  const userId = typeof user?.id === 'string' ? user.id : ''
  const role = typeof user?.role === 'string' ? user.role : ''
  const name = typeof user?.name === 'string' ? user.name : email

  if (!token || !userId) {
    throw new Error('login response missing token or user id')
  }

  const protectedHeader = decodeJwtHeader(token)
  if (
    !protectedHeader
    || protectedHeader.alg !== 'RS256'
    || typeof protectedHeader.kid !== 'string'
    || !protectedHeader.kid.trim()
  ) {
    throw new Error(
      `login token is not RS256+kid compliant (alg=${String(protectedHeader?.alg)}, kid=${String(protectedHeader?.kid)})`,
    )
  }

  return {
    token,
    userId,
    email,
    role,
    name,
  }
}

function getIdField(data: unknown, field = 'id'): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const value = (data as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

async function findProductByName(
  ctx: EndpointRunContext,
  productName: string,
): Promise<{ id: string; name: string; organizationId?: string | null } | null> {
  const listRes = await requestEndpoint(ctx, {
    method: 'GET',
    path: '/api/products',
    auth: 'superAdmin',
  })
  ensureSuccess('list products', listRes)

  const rows = Array.isArray(listRes.data) ? listRes.data as Array<Record<string, unknown>> : []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const rowId = typeof row.id === 'string' ? row.id : ''
    const rowName = typeof row.name === 'string' ? row.name : ''
    const rowOrganizationId = typeof row.organizationId === 'string'
      ? row.organizationId
      : null
    if (rowId && rowName === productName) {
      return { id: rowId, name: rowName, organizationId: rowOrganizationId }
    }
  }
  return null
}

async function resolveActiveOrganizationId(ctx: EndpointRunContext): Promise<string> {
  const candidates: string[] = []
  const managerCandidates: string[] = []
  const regularUserId = asNonEmptyString(ctx.sessions.regularUser?.userId)
  const pushCandidate = (value: unknown) => {
    const normalized = asNonEmptyString(value)
    if (!normalized) return
    if (!candidates.includes(normalized)) candidates.push(normalized)
  }
  const pushManagerCandidate = (value: unknown) => {
    const normalized = asNonEmptyString(value)
    if (!normalized) return
    if (!managerCandidates.includes(normalized)) managerCandidates.push(normalized)
    if (!candidates.includes(normalized)) candidates.push(normalized)
  }

  pushCandidate(ctx.fixtures.organizationId)

  const authMeRes = await requestEndpoint(ctx, {
    method: 'GET',
    path: '/api/auth/me',
    auth: 'superAdmin',
  })
  if (authMeRes.status === 200) {
    const payload = authMeRes.data as Record<string, unknown> | null
    const organization = payload?.organization as Record<string, unknown> | undefined
    pushCandidate(organization?.id)
  }

  const onboardingStateRes = await requestEndpoint(ctx, {
    method: 'GET',
    path: '/api/onboarding/state',
    auth: 'superAdmin',
  })
  if (onboardingStateRes.status === 200) {
    const state = onboardingStateRes.data as Record<string, unknown> | null
    pushCandidate(state?.activeOrganizationId)
    const organizations = Array.isArray(state?.organizations)
      ? state.organizations as Array<Record<string, unknown>>
      : []
    for (const organization of organizations) {
      const organizationRole = asNonEmptyString(organization.role).toLowerCase()
      if (organizationRole === 'owner' || organizationRole === 'admin') {
        pushManagerCandidate(organization.id)
      } else {
        pushCandidate(organization.id)
      }
    }
  }

  let fallbackWithRegular = ''
  let fallbackWithMultipleUsers = ''
  let fallbackAny = ''

  const orderedCandidates = [...new Set([...managerCandidates, ...candidates])]
  for (const organizationId of orderedCandidates) {
    const scopedProductsRes = await requestEndpoint(ctx, {
      method: 'GET',
      path: `/api/organizations/${encodeURIComponent(organizationId)}/products`,
      auth: 'superAdmin',
    })
    if (scopedProductsRes.status !== 200) continue

    const usersRes = await requestEndpoint(ctx, {
      method: 'GET',
      path: `/api/organizations/${encodeURIComponent(organizationId)}/users`,
      auth: 'superAdmin',
    })
    const users = usersRes.status === 200 && Array.isArray(usersRes.data)
      ? usersRes.data as Array<Record<string, unknown>>
      : []
    const userIds = users
      .map((row) => asNonEmptyString(row.id))
      .filter((value) => value.length > 0)
    const hasRegular = regularUserId.length > 0 && userIds.includes(regularUserId)
    const hasMultipleUsers = userIds.length >= 2

    if (hasRegular && hasMultipleUsers) {
      return organizationId
    }

    if (!fallbackWithRegular && hasRegular) fallbackWithRegular = organizationId
    if (!fallbackWithMultipleUsers && hasMultipleUsers) fallbackWithMultipleUsers = organizationId
    if (!fallbackAny) fallbackAny = organizationId
  }

  return fallbackWithRegular || fallbackWithMultipleUsers || fallbackAny || orderedCandidates[0] || ''
}

async function ensureHarnessActorPermissions(ctx: EndpointRunContext): Promise<void> {
  const actorUserId = asNonEmptyString(ctx.sessions.superAdmin.userId)
  if (!actorUserId) return

  let titleId = ''
  const listTitlesRes = await requestEndpoint(ctx, {
    method: 'GET',
    path: '/api/roles/titles',
    auth: 'superAdmin',
  })
  if (listTitlesRes.status === 200) {
    const payload = listTitlesRes.data as Record<string, unknown> | null
    const titles = Array.isArray(payload?.titles) ? payload.titles as Array<Record<string, unknown>> : []
    const existing = titles.find((row) => (
      asNonEmptyString(row.key) === ENDPOINT_HARNESS_TITLE_KEY
      || asNonEmptyString(row.name) === ENDPOINT_HARNESS_TITLE_NAME
    ))
    titleId = asNonEmptyString(existing?.id)
  }

  if (!titleId) {
    const createTitleRes = await requestEndpoint(ctx, {
      method: 'POST',
      path: '/api/roles/titles',
      auth: 'superAdmin',
      json: {
        name: ENDPOINT_HARNESS_TITLE_NAME,
        key: ENDPOINT_HARNESS_TITLE_KEY,
        baseRole: 'admin',
      },
    })
    if (createTitleRes.status === 200) {
      titleId = asNonEmptyString(getIdField(createTitleRes.data))
    } else if (createTitleRes.status === 409) {
      const retryTitlesRes = await requestEndpoint(ctx, {
        method: 'GET',
        path: '/api/roles/titles',
        auth: 'superAdmin',
      })
      if (retryTitlesRes.status === 200) {
        const payload = retryTitlesRes.data as Record<string, unknown> | null
        const titles = Array.isArray(payload?.titles) ? payload.titles as Array<Record<string, unknown>> : []
        const existing = titles.find((row) => asNonEmptyString(row.key) === ENDPOINT_HARNESS_TITLE_KEY)
        titleId = asNonEmptyString(existing?.id)
      }
    }
  }

  if (!titleId) return

  const pagesRes = await requestEndpoint(ctx, {
    method: 'GET',
    path: '/api/metadata/pages',
    auth: 'superAdmin',
  })
  if (pagesRes.status !== 200) return

  const pagesPayload = pagesRes.data as Record<string, unknown> | null
  const pageRows = Array.isArray(pagesPayload?.pages) ? pagesPayload.pages as Array<Record<string, unknown>> : []
  const pageKeys = pageRows
    .map((row) => asNonEmptyString(row.key))
    .filter((value) => value.length > 0)
  if (pageKeys.length === 0) return

  const pages = Object.fromEntries(
    pageKeys.map((pageKey) => [pageKey, {
      visible: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      selfViewOnly: false,
    }]),
  )

  await requestEndpoint(ctx, {
    method: 'PUT',
    path: `/api/roles/titles/${encodeURIComponent(titleId)}/permissions`,
    auth: 'superAdmin',
    json: { pages },
  })

  const organizationId = asNonEmptyString(ctx.fixtures.organizationId) || await resolveActiveOrganizationId(ctx)
  if (!organizationId) return
  ctx.fixtures.organizationId = organizationId

  await requestEndpoint(ctx, {
    method: 'PUT',
    path: `/api/organizations/${encodeURIComponent(organizationId)}/users-admin/${encodeURIComponent(actorUserId)}/title`,
    auth: 'superAdmin',
    json: { titleId },
  })
}

export async function setupFixtures(ctx: EndpointRunContext): Promise<void> {
  const runLabel = ctx.fixtures.runId

  await ensureHarnessActorPermissions(ctx)

  if (!ctx.fixtures.organizationId) {
    ctx.fixtures.organizationId = (await resolveActiveOrganizationId(ctx)) || undefined
  }
  if (!ctx.fixtures.organizationId) {
    throw new Error('fixture organization id is missing')
  }
  ctx.fixtures.onboardingOrganizationId = ctx.fixtures.organizationId

  const fixtureProductName = `${ctx.fixtures.productName} ${runLabel}`
  const productRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/products',
    auth: 'superAdmin',
    json: {
      name: fixtureProductName,
      description: `Endpoint docs fixture ${runLabel}`,
      organizationId: ctx.fixtures.organizationId,
      members: [],
    },
  })
  ensureSuccess('create product', productRes)
  const createdProduct = (productRes.data as Record<string, unknown> | undefined) ?? {}
  ctx.fixtures.productId = typeof createdProduct.id === 'string' ? createdProduct.id : undefined
  ctx.fixtures.productName = typeof createdProduct.name === 'string' ? createdProduct.name : fixtureProductName
  ctx.fixtures.organizationId = typeof createdProduct.organizationId === 'string'
    ? createdProduct.organizationId
    : ctx.fixtures.organizationId
  if (!ctx.fixtures.productId) {
    throw new Error('fixture product id is missing')
  }

  const usersRes = await requestEndpoint(ctx, {
    method: 'GET',
    path: `/api/organizations/${encodeURIComponent(ctx.fixtures.organizationId)}/users`,
    auth: 'superAdmin',
  })
  ensureSuccess('get users', usersRes)
  const users = Array.isArray(usersRes.data) ? usersRes.data as Array<Record<string, unknown>> : []
  if (users.length === 0) {
    throw new Error('No users returned by /api/organizations/:organizationId/users; seed users first.')
  }

  const superAdminUserId = asNonEmptyString(ctx.sessions.superAdmin.userId)
  const regularUserId = asNonEmptyString(ctx.sessions.regularUser?.userId)
  const primary = users.find((u) => asNonEmptyString(u.id) === regularUserId)
    ?? users.find((u) => asNonEmptyString(u.id) !== superAdminUserId && asNonEmptyString(u.role) !== 'super_admin')
    ?? users.find((u) => asNonEmptyString(u.id) !== superAdminUserId)
    ?? users[0]
  const secondary = users.find((u) => (
    asNonEmptyString(u.id) !== asNonEmptyString(primary.id)
    && asNonEmptyString(u.id) !== superAdminUserId
  )) ?? users.find((u) => asNonEmptyString(u.id) !== asNonEmptyString(primary.id)) ?? users[0]
  const tertiary = users.find((u) => (
    asNonEmptyString(u.id) !== asNonEmptyString(primary.id)
    && asNonEmptyString(u.id) !== asNonEmptyString(secondary.id)
    && asNonEmptyString(u.id) !== superAdminUserId
  )) ?? users.find((u) => (
    asNonEmptyString(u.id) !== asNonEmptyString(primary.id)
    && asNonEmptyString(u.id) !== asNonEmptyString(secondary.id)
  )) ?? secondary
  ctx.fixtures.primaryUserId = typeof primary.id === 'string' ? primary.id : ctx.sessions.superAdmin.userId
  ctx.fixtures.secondaryUserId = typeof secondary.id === 'string' ? secondary.id : ctx.fixtures.primaryUserId
  ctx.fixtures.tertiaryUserId = typeof tertiary.id === 'string' ? tertiary.id : ctx.fixtures.secondaryUserId

  const shouldEnsureMember = ctx.fixtures.secondaryUserId && ctx.fixtures.secondaryUserId !== ctx.fixtures.primaryUserId
  if (shouldEnsureMember) {
    const addMemberRes = await requestEndpoint(ctx, {
      method: 'POST',
      path: `/api/products/${encodeURIComponent(ctx.fixtures.productId)}/members`,
      auth: 'superAdmin',
      json: {
        userId: ctx.fixtures.secondaryUserId,
        role: 'member',
      },
    })
    if (addMemberRes.status !== 200 && addMemberRes.status !== 409) {
      const shortBody = addMemberRes.rawText.length > 240 ? `${addMemberRes.rawText.slice(0, 237)}...` : addMemberRes.rawText
      throw new Error(`ensure fixture product member failed (status=${addMemberRes.status}) body=${shortBody}`)
    }
  }
  ctx.fixtures.productMemberUserId = ctx.fixtures.secondaryUserId

  if (ctx.fixtures.organizationId) {
    const baseTeamRes = await requestEndpoint(ctx, {
      method: 'POST',
      path: `/api/organizations/${encodeURIComponent(ctx.fixtures.organizationId)}/teams`,
      auth: 'superAdmin',
      json: {
        name: `Endpoint Core Team ${runLabel}`,
        key: `endpoint-core-${runLabel.toLowerCase()}`,
        description: 'Fixture organization team for endpoint tests',
        leadUserId: ctx.fixtures.secondaryUserId ?? ctx.fixtures.primaryUserId ?? null,
        leadUserIds: [ctx.fixtures.secondaryUserId, ctx.fixtures.primaryUserId].filter(
          (value): value is string => typeof value === 'string' && value.length > 0,
        ),
        memberUserIds: [ctx.fixtures.primaryUserId, ctx.fixtures.secondaryUserId].filter(
          (value): value is string => typeof value === 'string' && value.length > 0,
        ),
      },
    })
    if (baseTeamRes.status === 200) {
      ctx.fixtures.organizationTeamId = getIdField(baseTeamRes.data)
    }
  }

  // Seed one standalone issue so initial list endpoints do not return empty arrays.
  const seededIssueRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/issues',
    auth: 'superAdmin',
    json: {
      productId: ctx.fixtures.productId,
      title: `Endpoint Seed Issue ${runLabel}`,
      description: 'Fixture standalone issue for endpoint list checks',
      severity: 'major',
      source: 'standalone',
    },
  })
  ensureSuccess('create seeded issue', seededIssueRes)
  ctx.fixtures.issueId = getIdField(seededIssueRes.data)

  // Seed one integration connection so initial connection listing is non-empty.
  const seededIntegrationRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/integrations/jira/connect',
    auth: 'superAdmin',
    json: {
      productId: ctx.fixtures.productId,
      displayName: `Endpoint Jira Seed ${runLabel}`,
      metadata: { foundationOnly: true, projectKey: `SEED-${runLabel}` },
      credentials: { token: `endpoint-seed-${runLabel}` },
    },
  })
  ensureSuccess('create seeded integration connection', seededIntegrationRes)
  ctx.fixtures.integrationConnectionId = getIdField(seededIntegrationRes.data)

  const initiativeRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/initiatives',
    auth: 'superAdmin',
    json: {
      title: `Endpoint Initiative ${runLabel}`,
      productId: ctx.fixtures.productId,
      status: 'planning',
      priority: 'medium',
      description: 'Fixture initiative for endpoint tests',
    },
  })
  ensureSuccess('create initiative', initiativeRes)
  ctx.fixtures.initiativeId = getIdField(initiativeRes.data)

  const storyRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/stories',
    auth: 'superAdmin',
    json: {
      title: `Endpoint Story ${runLabel}`,
      productId: ctx.fixtures.productId,
      type: 'feature',
      priority: 'medium',
      status: 'backlog',
      description: 'Fixture story for endpoint tests',
    },
  })
  ensureSuccess('create story', storyRes)
  ctx.fixtures.storyId = getIdField(storyRes.data)

  const deliveryRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/deliveries',
    auth: 'superAdmin',
    json: {
      title: `Endpoint Delivery ${runLabel}`,
      productId: ctx.fixtures.productId,
      status: 'initialized',
      initiativeIds: ctx.fixtures.initiativeId ? [ctx.fixtures.initiativeId] : [],
      description: 'Fixture delivery for endpoint tests',
    },
  })
  ensureSuccess('create delivery', deliveryRes)
  ctx.fixtures.deliveryId = getIdField(deliveryRes.data)

  const taskRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: `/api/tasks/by-story/${ctx.fixtures.storyId}`,
    auth: 'superAdmin',
    json: {
      title: `Endpoint Task ${runLabel}`,
      status: 'created',
      ownerUserId: ctx.fixtures.secondaryUserId,
      assigneeUserIds: ctx.fixtures.secondaryUserId ? [ctx.fixtures.secondaryUserId] : [],
      estimateValue: 3,
    },
  })
  ensureSuccess('create task', taskRes)
  ctx.fixtures.taskId = getIdField(taskRes.data)

  const storyCommentRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: `/api/stories/${ctx.fixtures.storyId}/comments`,
    auth: 'superAdmin',
    json: { content: `Fixture story comment ${runLabel}` },
  })
  ensureSuccess('create story comment', storyCommentRes)
  ctx.fixtures.storyCommentId = getIdField(storyCommentRes.data)

  const taskCommentRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: `/api/tasks/${ctx.fixtures.taskId}/comments`,
    auth: 'superAdmin',
    json: { content: `Fixture task comment ${runLabel}` },
  })
  ensureSuccess('create task comment', taskCommentRes)
  ctx.fixtures.taskCommentId = getIdField(taskCommentRes.data)

  const taskAttachmentForm = new FormData()
  taskAttachmentForm.set('file', createImageFile(`fixture-${runLabel}.png`))
  const taskAttachmentRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: `/api/tasks/${ctx.fixtures.taskId}/attachments`,
    auth: 'superAdmin',
    formData: taskAttachmentForm,
  })
  ensureSuccess('create task attachment', taskAttachmentRes)
  ctx.fixtures.taskAttachmentId = getIdField(taskAttachmentRes.data)

  const serverRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/servers',
    auth: 'superAdmin',
    json: {
      name: `endpoint-server-${runLabel}`,
      environment: 'dev',
      productId: ctx.fixtures.productId,
      host: '127.0.0.1',
      port: 3001,
      protocol: 'http',
      provider: 'local',
    },
  })
  ensureSuccess('create server', serverRes)
  ctx.fixtures.serverId = getIdField(serverRes.data)

  const releaseRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/releases',
    auth: 'superAdmin',
    json: {
      title: `Endpoint Release ${runLabel}`,
      productId: ctx.fixtures.productId,
      status: 'planned',
      releaseType: 'feature',
      deliveryIds: ctx.fixtures.deliveryId ? [ctx.fixtures.deliveryId] : [],
      notes: `Fixture release ${runLabel}`,
    },
  })
  ensureSuccess('create release', releaseRes)
  ctx.fixtures.releaseId = getIdField(releaseRes.data)

  const releaseDetailRes = await requestEndpoint(ctx, {
    method: 'GET',
    path: `/api/releases/${ctx.fixtures.releaseId}`,
    auth: 'superAdmin',
  })
  ensureSuccess('get release detail', releaseDetailRes)
  const releaseDeployments = (releaseDetailRes.data as Record<string, unknown> | undefined)?.releaseDeployments
  if (Array.isArray(releaseDeployments) && releaseDeployments.length > 0) {
    const deploymentId = getIdField(releaseDeployments[0])
    ctx.fixtures.releaseDeploymentId = deploymentId || undefined
  }

  const cycleRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/test-cycles',
    auth: 'superAdmin',
    json: {
      title: `Endpoint Test Cycle ${runLabel}`,
      productId: ctx.fixtures.productId,
      deliveryId: ctx.fixtures.deliveryId ?? null,
      releaseId: ctx.fixtures.releaseId ?? null,
      status: 'planned',
    },
  })
  ensureSuccess('create test cycle', cycleRes)
  ctx.fixtures.testCycleId = getIdField(cycleRes.data)

  const frRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/feature-requests',
    auth: 'superAdmin',
    json: {
      productId: ctx.fixtures.productId,
      title: `Endpoint Feature Request ${runLabel}`,
      description: 'Fixture feature request',
    },
  })
  ensureSuccess('create feature request', frRes)
  ctx.fixtures.featureRequestId = getIdField(frRes.data)

  if (ctx.fixtures.featureRequestId) {
    await requestEndpoint(ctx, {
      method: 'POST',
      path: `/api/feature-requests/${ctx.fixtures.featureRequestId}/comments`,
      auth: 'superAdmin',
      json: { content: `Fixture feature comment ${runLabel}` },
    })
  }

  const feedbackRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/consumer-feedbacks',
    auth: 'superAdmin',
    json: {
      productId: ctx.fixtures.productId,
      title: `Endpoint Feedback ${runLabel}`,
      description: 'Fixture consumer feedback',
      type: 'bug',
      priority: 'medium',
    },
  })
  ensureSuccess('create consumer feedback', feedbackRes)
  ctx.fixtures.consumerFeedbackId = getIdField(feedbackRes.data)

  if (ctx.fixtures.consumerFeedbackId) {
    await requestEndpoint(ctx, {
      method: 'POST',
      path: `/api/consumer-feedbacks/${ctx.fixtures.consumerFeedbackId}/comments`,
      auth: 'superAdmin',
      json: { content: `Fixture feedback comment ${runLabel}`, isInternal: true },
    })
  }

  const fixtureWikiTypeName = readOptionalEnv('API_ENDPOINT_WIKI_TYPE_NAME') ?? 'Endpoint Fixture Type'
  const wikiTypesRes = await requestEndpoint(ctx, {
    method: 'GET',
    path: '/api/wiki/types',
    auth: 'superAdmin',
    query: {
      productId: ctx.fixtures.productId,
    },
  })
  ensureSuccess('list wiki types', wikiTypesRes)
  const existingWikiTypes = Array.isArray(wikiTypesRes.data) ? wikiTypesRes.data as Array<Record<string, unknown>> : []
  const existingFixtureWikiType = existingWikiTypes.find((row) => row.name === fixtureWikiTypeName)

  if (existingFixtureWikiType && typeof existingFixtureWikiType.id === 'string') {
    ctx.fixtures.wikiTypeId = existingFixtureWikiType.id
  } else {
    const wikiTypeRes = await requestEndpoint(ctx, {
      method: 'POST',
      path: '/api/wiki/types',
      auth: 'superAdmin',
      json: {
        name: fixtureWikiTypeName,
        category: 'engineering',
        productId: ctx.fixtures.productId,
      },
    })
    ensureSuccess('create wiki type', wikiTypeRes)
    ctx.fixtures.wikiTypeId = getIdField(wikiTypeRes.data)
  }

  if (ctx.fixtures.wikiTypeId) {
    const wikiAsset1Res = await requestEndpoint(ctx, {
      method: 'POST',
      path: '/api/wiki/assets',
      auth: 'superAdmin',
      json: {
        productId: ctx.fixtures.productId,
        assetTypeId: ctx.fixtures.wikiTypeId,
        title: `Endpoint Asset A ${runLabel}`,
        status: 'draft',
      },
    })
    ensureSuccess('create wiki asset A', wikiAsset1Res)
    ctx.fixtures.wikiAssetId = getIdField(wikiAsset1Res.data)

    const wikiAsset2Res = await requestEndpoint(ctx, {
      method: 'POST',
      path: '/api/wiki/assets',
      auth: 'superAdmin',
      json: {
        productId: ctx.fixtures.productId,
        assetTypeId: ctx.fixtures.wikiTypeId,
        title: `Endpoint Asset B ${runLabel}`,
        status: 'draft',
      },
    })
    ensureSuccess('create wiki asset B', wikiAsset2Res)
    ctx.fixtures.wikiAssetId2 = getIdField(wikiAsset2Res.data)

    if (ctx.fixtures.wikiAssetId && ctx.fixtures.wikiAssetId2) {
      const relationRes = await requestEndpoint(ctx, {
        method: 'POST',
        path: `/api/wiki/assets/${ctx.fixtures.wikiAssetId}/relations`,
        auth: 'superAdmin',
        json: {
          targetAssetId: ctx.fixtures.wikiAssetId2,
          relationType: 'related_to',
        },
      })
      ensureSuccess('create wiki relation', relationRes)
      ctx.fixtures.wikiRelationId = getIdField(relationRes.data)
    }
  }

  const favoriteRes = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/favorites',
    auth: 'superAdmin',
    json: {
      entityType: 'story',
      entityId: ctx.fixtures.storyId,
      productId: ctx.fixtures.productId,
    },
  })
  ensureSuccess('create favorite', favoriteRes)
  ctx.fixtures.favoriteEntityType = 'story'
  ctx.fixtures.favoriteEntityId = ctx.fixtures.storyId

  await requestEndpoint(ctx, {
    method: 'PUT',
    path: '/api/settings/theme',
    auth: 'superAdmin',
    json: { value: 'dark' },
  })

  await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/activities',
    auth: 'none',
    json: {
      productId: ctx.fixtures.productId,
      userId: ctx.fixtures.primaryUserId,
      userName: 'Endpoint Runner',
      action: 'created',
      entityType: 'story',
      entityId: ctx.fixtures.storyId,
      entityTitle: `Endpoint Story ${runLabel}`,
    },
  })
}

async function bestEffort(ctx: EndpointRunContext, spec: EndpointRequestSpec): Promise<void> {
  try {
    await requestEndpoint(ctx, spec)
  } catch {
    // Ignore cleanup failures.
  }
}

export async function cleanupFixtures(ctx: EndpointRunContext): Promise<void> {
  const f = ctx.fixtures

  if (f.wikiAssetId && f.wikiRelationId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/wiki/assets/${f.wikiAssetId}/relations/${f.wikiRelationId}`,
      auth: 'superAdmin',
    })
  }
  if (f.wikiAssetId2) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/wiki/assets/${f.wikiAssetId2}`,
      auth: 'superAdmin',
    })
  }
  if (f.wikiAssetId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/wiki/assets/${f.wikiAssetId}`,
      auth: 'superAdmin',
    })
  }
  if (f.releaseId && f.releaseDeploymentId && f.releaseTargetId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/releases/${f.releaseId}/deployments/${f.releaseDeploymentId}/targets/${f.releaseTargetId}`,
      auth: 'superAdmin',
    })
  }
  if (f.releaseId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/releases/${f.releaseId}`,
      auth: 'superAdmin',
    })
  }
  if (f.serverId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/servers/${f.serverId}`,
      auth: 'superAdmin',
    })
  }
  if (f.testCycleId && f.testIssueId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/test-cycles/${f.testCycleId}/issues/${f.testIssueId}`,
      auth: 'none',
    })
  }
  if (f.testCycleId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/test-cycles/${f.testCycleId}`,
      auth: 'none',
    })
  }
  if (f.featureRequestId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/feature-requests/${f.featureRequestId}`,
      auth: 'superAdmin',
    })
  }
  if (f.consumerFeedbackId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/consumer-feedbacks/${f.consumerFeedbackId}`,
      auth: 'superAdmin',
    })
  }
  if (f.taskAttachmentId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/tasks/attachments/${f.taskAttachmentId}`,
      auth: 'superAdmin',
    })
  }
  if (f.taskCommentId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/tasks/comments/${f.taskCommentId}`,
      auth: 'superAdmin',
    })
  }
  if (f.taskId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/tasks/${f.taskId}`,
      auth: 'none',
    })
  }
  if (f.storyId && f.storyCommentId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/stories/${f.storyId}/comments/${f.storyCommentId}`,
      auth: 'superAdmin',
    })
  }
  if (f.storyId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/stories/${f.storyId}`,
      auth: 'none',
    })
  }
  if (f.deliveryId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/deliveries/${f.deliveryId}`,
      auth: 'none',
    })
  }
  if (f.initiativeId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/initiatives/${f.initiativeId}`,
      auth: 'none',
    })
  }
  if (f.productId && f.productMemberUserId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/products/${encodeURIComponent(f.productId)}/members/${f.productMemberUserId}`,
      auth: 'none',
    })
  }
  if (f.organizationId && f.secondaryUserId) {
    await bestEffort(ctx, {
      method: 'PUT',
      path: `/api/organizations/${encodeURIComponent(f.organizationId)}/member-reports/${f.secondaryUserId}`,
      auth: 'superAdmin',
      json: { managerUserId: null },
    })
  }
  if (f.organizationId && f.organizationTeamCaseId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/organizations/${encodeURIComponent(f.organizationId)}/teams/${f.organizationTeamCaseId}`,
      auth: 'superAdmin',
    })
  }
  if (f.organizationId && f.organizationTeamId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/organizations/${encodeURIComponent(f.organizationId)}/teams/${f.organizationTeamId}`,
      auth: 'superAdmin',
    })
  }
  if (f.favoriteEntityType && f.favoriteEntityId) {
    await bestEffort(ctx, {
      method: 'DELETE',
      path: `/api/favorites/${f.favoriteEntityType}/${f.favoriteEntityId}`,
      auth: 'superAdmin',
    })
  }
}

export function createDefaultContext(): EndpointRunContext {
  const runId = createRunId()
  const baseUrl = normalizeBaseUrl(readOptionalEnv('API_BASE_URL') ?? DEFAULT_BASE_URL)
  const credentials = resolveEndpointCredentials()
  const productName = readOptionalEnv('API_ENDPOINT_PRODUCT_NAME') ?? DEFAULT_ENDPOINT_PRODUCT_NAME
  const caseProductName = readOptionalEnv('API_ENDPOINT_CASE_PRODUCT_NAME') ?? DEFAULT_ENDPOINT_CASE_PRODUCT_NAME
  const registeredUserEmail = readOptionalEnv('API_ENDPOINT_REGISTERED_EMAIL') ?? DEFAULT_REGISTERED_ENDPOINT_USER_EMAIL
  const registeredUserPassword = readOptionalEnv('API_ENDPOINT_REGISTERED_PASSWORD') ?? DEFAULT_REGISTERED_ENDPOINT_USER_PASSWORD

  return {
    baseUrl,
    credentials,
    sessions: {
      superAdmin: { token: '', userId: '', email: credentials.email, role: '', name: '' },
    },
    fixtures: {
      runId,
      productName,
      caseProductName,
      registeredUserEmail,
      registeredUserPassword,
    },
  }
}
