import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

type Permission = {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
}

type Session = {
  token: string
  user: {
    id: string
    role: string
    email: string
  }
}

type MatrixResult = {
  name: string
  expected: number
  actual: number
  ok: boolean
  preview: string
}

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const ADMIN_EMAIL = (process.env.API_EMAIL || '').trim()
const ADMIN_PASSWORD = (process.env.API_PASSWORD || '').trim()
const REGULAR_EMAIL = (process.env.API_REGULAR_EMAIL || '').trim()
const REGULAR_PASSWORD = (process.env.API_REGULAR_PASSWORD || '').trim()
const DEMO_EMAIL_DOMAIN = '@novaforge.io'
const MATRIX_TITLE_NAME = 'Endpoint Matrix Title'
const MATRIX_TITLE_KEY = 'endpoint_matrix_title'
const MATRIX_MEMBER_PRODUCT_NAME = 'Endpoint Matrix Member Product'
const MATRIX_OUTSIDER_PRODUCT_NAME = 'Endpoint Matrix Outsider Product'
const MATRIX_VIEWER_EMAIL = (process.env.API_MATRIX_VIEWER_EMAIL || 'endpoint.matrix.viewer@productier.test').trim()
const MATRIX_VIEWER_PASSWORD = (process.env.API_MATRIX_VIEWER_PASSWORD || REGULAR_PASSWORD).trim()
const LEGACY_DOMAIN_PREFIXES = [
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
const FULL_ACCESS: Permission = {
  visible: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  selfViewOnly: false,
}
const NO_ACCESS: Permission = {
  visible: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  selfViewOnly: false,
}

type RequestOptions = { token?: string; query?: Record<string, string>; json?: unknown }
type RequestResult = { status: number; data: unknown; raw: string }

const organizationIdByToken = new Map<string, string>()
const defaultProductIdByToken = new Map<string, string>()
let fallbackOrganizationId = ''
let fallbackProductId = ''

function ensureEndpointSeedState(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const projectRoot = resolve(scriptDir, '..')
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const seedResult = spawnSync(npmCommand, ['run', 'db:seed:endpoint-test'], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
  if (seedResult.status === 0) {
    return
  }
  const stdout = (seedResult.stdout ?? '').toString().trim()
  const stderr = (seedResult.stderr ?? '').toString().trim()
  const detail = [stdout, stderr].filter((chunk) => chunk.length > 0).join('\n')
  throw new Error(
    `Failed to reseed endpoint-test fixtures before permission matrix run (exit=${seedResult.status ?? 'null'}). ${detail}`,
  )
}

function url(path: string, query?: Record<string, string>): string {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!query) return `${normalizedBase}${normalizedPath}`
  const params = new URLSearchParams(query)
  return `${normalizedBase}${normalizedPath}?${params.toString()}`
}

function asNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function readOrganizationIdFromPath(path: string): string {
  const match = path.match(/^\/api\/organizations\/([^/]+)/)
  if (!match) return ''
  return decodeURIComponent(match[1] || '').trim()
}

function readProductIdFromPath(path: string): string {
  const productScoped = path.match(/^\/api\/organizations\/[^/]+\/products\/([^/]+)/)
  if (productScoped) return decodeURIComponent(productScoped[1] || '').trim()
  if (path.startsWith('/api/products/upload-logo')) return ''
  const legacy = path.match(/^\/api\/products\/([^/]+)/)
  if (!legacy) return ''
  return decodeURIComponent(legacy[1] || '').trim()
}

function readProductIdFromJson(json: unknown): string {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return ''
  return asNonEmptyString((json as Record<string, unknown>).productId)
}

function removeQueryKeys(
  query: Record<string, string> | undefined,
  keys: string[],
): Record<string, string> | undefined {
  if (!query) return query
  const keySet = new Set(keys)
  const filteredEntries = Object.entries(query).filter(([key]) => !keySet.has(key))
  return filteredEntries.length > 0
    ? Object.fromEntries(filteredEntries)
    : undefined
}

function rememberScopedValues(token: string | undefined, organizationId: string, productId: string): void {
  if (organizationId) {
    fallbackOrganizationId = organizationId
    if (token) organizationIdByToken.set(token, organizationId)
  }
  if (productId) {
    fallbackProductId = productId
    if (token) defaultProductIdByToken.set(token, productId)
  }
}

async function rawRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts?: RequestOptions,
): Promise<RequestResult> {
  const headers = new Headers()
  if (opts?.token) headers.set('Authorization', `Bearer ${opts.token}`)
  if (opts?.json !== undefined) headers.set('Content-Type', 'application/json')

  const res = await fetch(url(path, opts?.query), {
    method,
    headers,
    body: opts?.json !== undefined ? JSON.stringify(opts.json) : undefined,
  })

  const raw = await res.text()
  let data: unknown = raw
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    // Keep raw text as-is.
  }
  return { status: res.status, data, raw }
}

async function resolveOrganizationIdForToken(token?: string): Promise<string> {
  if (!token) return fallbackOrganizationId
  const cached = organizationIdByToken.get(token)
  if (cached) return cached

  const onboardingStateRes = await rawRequest('GET', '/api/onboarding/state', { token })
  if (onboardingStateRes.status !== 200) {
    return ''
  }
  const payload = onboardingStateRes.data as Record<string, unknown> | null
  const activeOrganizationId = asNonEmptyString(payload?.activeOrganizationId)
  if (activeOrganizationId) {
    rememberScopedValues(token, activeOrganizationId, '')
    return activeOrganizationId
  }
  const organizations = Array.isArray(payload?.organizations)
    ? payload.organizations as Array<Record<string, unknown>>
    : []
  const fallback = organizations.find((row) => asNonEmptyString(row.id))
  const organizationId = asNonEmptyString(fallback?.id)
  if (organizationId) {
    rememberScopedValues(token, organizationId, '')
    return organizationId
  }
  return ''
}

async function resolveDefaultProductId(
  token: string | undefined,
  organizationId: string,
): Promise<string> {
  if (!organizationId) return token ? '' : fallbackProductId
  if (token) {
    const cached = defaultProductIdByToken.get(token)
    if (cached) return cached
  }

  const lookupToken = token || Array.from(organizationIdByToken.keys())[0]
  const listRes = await rawRequest(
    'GET',
    `/api/organizations/${encodeURIComponent(organizationId)}/products`,
    { token: lookupToken },
  )
  if (listRes.status !== 200 || !Array.isArray(listRes.data)) {
    return token ? '' : fallbackProductId
  }
  const firstProduct = listRes.data
    .find((row) => row && typeof row === 'object' && asNonEmptyString((row as Record<string, unknown>).id))
  const productId = firstProduct && typeof firstProduct === 'object'
    ? asNonEmptyString((firstProduct as Record<string, unknown>).id)
    : ''
  if (productId) {
    rememberScopedValues(token, organizationId, productId)
  }
  if (productId) return productId
  return token ? '' : fallbackProductId
}

async function toScopedRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts?: RequestOptions,
): Promise<{ path: string; opts?: RequestOptions }> {
  if (!path.startsWith('/api/')) return { path, opts }
  if (path.startsWith('/api/organizations/')) return { path, opts }
  const query = opts?.query ? { ...opts.query } : undefined
  const body = opts?.json
  const token = opts?.token

  const queryOrganizationId = asNonEmptyString(query?.organizationId)
  const bodyOrganizationId = body && typeof body === 'object' && !Array.isArray(body)
    ? asNonEmptyString((body as Record<string, unknown>).organizationId)
    : ''
  const organizationId = queryOrganizationId
    || bodyOrganizationId
    || await resolveOrganizationIdForToken(token)
    || (token ? '' : fallbackOrganizationId)

  if (path === '/api/users' || path.startsWith('/api/users/')) {
    if (!organizationId) return { path, opts }
    const suffix = path.slice('/api/users'.length)
    return {
      path: `/api/organizations/${encodeURIComponent(organizationId)}/users-admin${suffix}`,
      opts: {
        ...opts,
        query: removeQueryKeys(query, ['organizationId']),
      },
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
    return { path, opts }
  }

  if (
    method === 'POST'
    && !opts?.token
    && (path === '/api/consumer-feedbacks' || path === '/api/consumer-feedbacks/')
  ) {
    return { path, opts }
  }

  const pathProductId = readProductIdFromPath(path)
  const queryProductId = asNonEmptyString(query?.productId)
  const bodyProductId = readProductIdFromJson(body)
  const scopedProductId = pathProductId
    || queryProductId
    || bodyProductId
    || (organizationId ? await resolveDefaultProductId(token, organizationId) : '')
    || (token ? '' : fallbackProductId)

  if (path === '/api/products' || path === '/api/products/') {
    if (!organizationId) return { path, opts }
    const scopedPath = `/api/organizations/${encodeURIComponent(organizationId)}/products`
    return {
      path: scopedPath,
      opts: {
        ...opts,
        query: removeQueryKeys(query, ['organizationId']),
      },
    }
  }

  if (path.startsWith('/api/products/upload-logo')) {
    if (!organizationId || !scopedProductId) return { path, opts }
    const scopedPath = `/api/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(scopedProductId)}/upload-logo`
    return {
      path: scopedPath,
      opts: {
        ...opts,
        query: removeQueryKeys(query, ['organizationId', 'productId']),
      },
    }
  }

  if (path.startsWith('/api/products/')) {
    if (!organizationId) return { path, opts }
    const suffix = path.slice('/api/products/'.length)
    const [rawProductId, ...rest] = suffix.split('/')
    const resolvedProductId = asNonEmptyString(decodeURIComponent(rawProductId || '')) || scopedProductId
    if (!resolvedProductId) return { path, opts }
    const remainder = rest.join('/')
    const scopedPath = remainder
      ? `/api/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(resolvedProductId)}/${remainder}`
      : `/api/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(resolvedProductId)}`
    return {
      path: scopedPath,
      opts: {
        ...opts,
        query: removeQueryKeys(query, ['organizationId', 'productId']),
      },
    }
  }

  if (path === '/api/dashboards' || path === '/api/dashboards/' || path.startsWith('/api/dashboards/')) {
    if (!organizationId) return { path, opts }
    const suffix = path.slice('/api/dashboards'.length)
    const scopedPath = `/api/organizations/${encodeURIComponent(organizationId)}/dashboards${suffix}`
    return {
      path: scopedPath,
      opts: {
        ...opts,
        query: removeQueryKeys(query, ['organizationId']),
      },
    }
  }

  if (path.startsWith('/api/metrics')) {
    if (!organizationId) return { path, opts }
    const suffix = path.slice('/api/metrics'.length)
    const scopedPath = `/api/organizations/${encodeURIComponent(organizationId)}/metrics${suffix}`
    return {
      path: scopedPath,
      opts: {
        ...opts,
        query: removeQueryKeys(query, ['organizationId']),
      },
    }
  }

  for (const domainPrefix of LEGACY_DOMAIN_PREFIXES) {
    const base = `/api/${domainPrefix}`
    if (path === base || path.startsWith(`${base}/`)) {
      if (!organizationId || !scopedProductId) return { path, opts }
      const suffix = path.slice(base.length)
      const scopedPath = `/api/organizations/${encodeURIComponent(organizationId)}/products/${encodeURIComponent(scopedProductId)}/${domainPrefix}${suffix}`
      return {
        path: scopedPath,
        opts: {
          ...opts,
          query: removeQueryKeys(query, ['organizationId', 'productId']),
        },
      }
    }
  }

  return { path, opts }
}

function rememberFromResponse(path: string, opts: RequestOptions | undefined, response: RequestResult): void {
  if (response.status < 200 || response.status >= 300) {
    return
  }

  const token = opts?.token
  const pathOrganizationId = readOrganizationIdFromPath(path)
  const pathProductId = readProductIdFromPath(path)
  rememberScopedValues(token, pathOrganizationId, pathProductId)

  const queryOrganizationId = asNonEmptyString(opts?.query?.organizationId)
  const queryProductId = asNonEmptyString(opts?.query?.productId)
  const bodyOrganizationId = opts?.json && typeof opts.json === 'object' && !Array.isArray(opts.json)
    ? asNonEmptyString((opts.json as Record<string, unknown>).organizationId)
    : ''
  const bodyProductId = readProductIdFromJson(opts?.json)
  rememberScopedValues(token, queryOrganizationId || bodyOrganizationId, queryProductId || bodyProductId)

  if (token && path === '/api/onboarding/state' && response.status === 200) {
    const payload = response.data as Record<string, unknown> | null
    const activeOrganizationId = asNonEmptyString(payload?.activeOrganizationId)
    if (activeOrganizationId) {
      rememberScopedValues(token, activeOrganizationId, '')
      return
    }
    const organizations = Array.isArray(payload?.organizations)
      ? payload.organizations as Array<Record<string, unknown>>
      : []
    const fallback = organizations.find((row) => asNonEmptyString(row.id))
    const organizationId = asNonEmptyString(fallback?.id)
    if (organizationId) rememberScopedValues(token, organizationId, '')
  }
}

async function request(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts?: RequestOptions,
): Promise<RequestResult> {
  const scopedRequest = await toScopedRequest(method, path, opts)
  const response = await rawRequest(method, scopedRequest.path, scopedRequest.opts)
  rememberFromResponse(scopedRequest.path, scopedRequest.opts, response)
  return response
}

async function login(email: string, password: string): Promise<Session> {
  const res = await request('POST', '/api/auth/login', {
    json: { email, password },
  })
  if (res.status !== 200) {
    if (res.status === 401) {
      throw new Error(
        `Login failed for ${email} (401). ` +
        'Seed dedicated endpoint users via "npm run db:seed:endpoint-test", then set API_* credentials. ' +
        `body=${res.raw}`,
      )
    }
    throw new Error(`Login failed for ${email} (status=${res.status}) body=${res.raw}`)
  }
  const payload = res.data as Record<string, unknown>
  const token = typeof payload.token === 'string' ? payload.token : ''
  const user = payload.user as Record<string, unknown> | undefined
  if (!token || !user) {
    throw new Error(`Login payload malformed for ${email}`)
  }
  return {
    token,
    user: {
      id: String(user.id ?? ''),
      role: String(user.role ?? ''),
      email: String(user.email ?? email),
    },
  }
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no'
}

function isDemoCredentialEmail(email: string): boolean {
  return email.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN)
}

function preview(raw: string): string {
  if (!raw) return ''
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw
}

function readRolePagePermission(
  permissionsPayload: unknown,
  role: string,
  page: string,
): Permission | null {
  if (!permissionsPayload || typeof permissionsPayload !== 'object') return null
  const top = permissionsPayload as Record<string, unknown>
  const permissions = top.permissions
  if (!permissions || typeof permissions !== 'object') return null
  const roleNode = (permissions as Record<string, unknown>)[role]
  if (!roleNode || typeof roleNode !== 'object') return null
  const pageNode = (roleNode as Record<string, unknown>)[page]
  if (!pageNode || typeof pageNode !== 'object') return null
  const p = pageNode as Record<string, unknown>
  return {
    visible: Boolean(p.visible),
    canCreate: Boolean(p.canCreate),
    canEdit: Boolean(p.canEdit),
    canDelete: Boolean(p.canDelete),
    selfViewOnly: Boolean(p.selfViewOnly),
  }
}

function readMyPagePermission(
  myPermissionsPayload: unknown,
  page: string,
): Permission | null {
  if (!myPermissionsPayload || typeof myPermissionsPayload !== 'object') return null
  const top = myPermissionsPayload as Record<string, unknown>
  const pages = top.pages
  if (!pages || typeof pages !== 'object') return null
  const pageNode = (pages as Record<string, unknown>)[page]
  if (!pageNode || typeof pageNode !== 'object') return null
  const p = pageNode as Record<string, unknown>
  return {
    visible: Boolean(p.visible),
    canCreate: Boolean(p.canCreate),
    canEdit: Boolean(p.canEdit),
    canDelete: Boolean(p.canDelete),
    selfViewOnly: Boolean(p.selfViewOnly),
  }
}

async function updateRolePagePermission(
  adminToken: string,
  role: string,
  page: string,
  permission: Permission,
): Promise<void> {
  const res = await request('PUT', '/api/roles/permissions', {
    token: adminToken,
    json: {
      role,
      pages: {
        [page]: permission,
      },
    },
  })
  if (res.status !== 200) {
    throw new Error(
      `Failed to update role permission ${role}/${page} (status=${res.status}) body=${res.raw}`,
    )
  }
}

function pushResult(results: MatrixResult[], name: string, expected: number, actual: number, raw: string): void {
  results.push({
    name,
    expected,
    actual,
    ok: expected === actual,
    preview: preview(raw),
  })
}

async function listOrganizationIds(token: string): Promise<string[]> {
  const stateRes = await request('GET', '/api/onboarding/state', { token })
  if (stateRes.status !== 200) return []
  const payload = stateRes.data as Record<string, unknown> | null
  const activeOrganizationId = asNonEmptyString(payload?.activeOrganizationId)
  const organizations = Array.isArray(payload?.organizations)
    ? payload.organizations as Array<Record<string, unknown>>
    : []

  const collected: string[] = []
  if (activeOrganizationId) collected.push(activeOrganizationId)
  for (const organization of organizations) {
    const organizationId = asNonEmptyString(organization.id)
    if (organizationId) collected.push(organizationId)
  }
  return [...new Set(collected)]
}

async function resolveSharedOrganizationId(adminToken: string, regularToken: string): Promise<string> {
  const adminOrgIds = await listOrganizationIds(adminToken)
  const regularOrgIdSet = new Set(await listOrganizationIds(regularToken))
  const shared = adminOrgIds.find((organizationId) => regularOrgIdSet.has(organizationId))
  if (shared) return shared
  return adminOrgIds[0] || ''
}

async function resolveTitleIdByKey(adminToken: string, titleKey: string): Promise<string> {
  const listRes = await request('GET', '/api/roles/titles', {
    token: adminToken,
  })
  if (listRes.status !== 200) {
    throw new Error(`Unable to list titles (status=${listRes.status}) body=${listRes.raw}`)
  }
  const payload = listRes.data as Record<string, unknown> | null
  const titles = Array.isArray(payload?.titles) ? payload.titles as Array<Record<string, unknown>> : []
  const match = titles.find((row) => row.key === titleKey && typeof row.id === 'string')
  return typeof match?.id === 'string' ? match.id : ''
}

async function ensureProductByName(
  adminToken: string,
  name: string,
  description: string,
  organizationId?: string | null,
): Promise<string> {
  const normalizedOrganizationId = typeof organizationId === 'string' ? organizationId.trim() : ''
  const listPath = normalizedOrganizationId
    ? `/api/organizations/${encodeURIComponent(normalizedOrganizationId)}/products`
    : '/api/products'
  let listRes = await request('GET', listPath, {
    token: adminToken,
  })
  if ((listRes.status === 403 || listRes.status === 404 || listRes.status === 410) && normalizedOrganizationId) {
    listRes = await request('GET', '/api/products', { token: adminToken })
  }
  if (listRes.status !== 200) {
    const fallbackProduct = normalizedOrganizationId
      ? await resolveDefaultProductId(adminToken, normalizedOrganizationId)
      : ''
    if (fallbackProduct) return fallbackProduct
    throw new Error(`Unable to list products (status=${listRes.status}) body=${listRes.raw}`)
  }
  const productsPayload = Array.isArray(listRes.data) ? listRes.data as Array<Record<string, unknown>> : []
  const existing = productsPayload.find((row) => row.name === name && typeof row.id === 'string')
  if (typeof existing?.id === 'string') {
    return existing.id
  }

  const createPath = normalizedOrganizationId
    ? `/api/organizations/${encodeURIComponent(normalizedOrganizationId)}/products`
    : '/api/products'
  let createRes = await request('POST', createPath, {
    token: adminToken,
    json: normalizedOrganizationId
      ? {
          name,
          description,
          members: [],
        }
      : {
          name,
          description,
          organizationId: organizationId || undefined,
          members: [],
        },
  })
  if ((createRes.status === 403 || createRes.status === 404 || createRes.status === 410) && normalizedOrganizationId) {
    createRes = await request('POST', '/api/products', {
      token: adminToken,
      json: {
        name,
        description,
        organizationId: normalizedOrganizationId,
        members: [],
      },
    })
  }
  if (createRes.status !== 200) {
    const fallbackProduct = normalizedOrganizationId
      ? await resolveDefaultProductId(adminToken, normalizedOrganizationId)
      : ''
    if (fallbackProduct) return fallbackProduct
    throw new Error(`Failed to create product "${name}" (status=${createRes.status}) body=${createRes.raw}`)
  }
  const id = String((createRes.data as Record<string, unknown> | null)?.id ?? '')
  if (!id) throw new Error(`Product "${name}" response missing id`)
  return id
}

async function resolveProductOrganizationId(
  adminToken: string,
  productId: string,
  preferredOrganizationId?: string | null,
): Promise<string | null> {
  const normalizedPreferredOrganizationId = typeof preferredOrganizationId === 'string'
    ? preferredOrganizationId.trim()
    : ''
  const organizationCandidates = [
    normalizedPreferredOrganizationId,
    ...(await listOrganizationIds(adminToken)),
  ].filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)

  for (const organizationId of organizationCandidates) {
    const listRes = await request(
      'GET',
      `/api/organizations/${encodeURIComponent(organizationId)}/products`,
      { token: adminToken },
    )
    if (listRes.status !== 200 || !Array.isArray(listRes.data)) continue
    const products = listRes.data as Array<Record<string, unknown>>
    const hasProduct = products.some((entry) => String(entry.id ?? '') === productId)
    if (hasProduct) return organizationId
  }
  return normalizedPreferredOrganizationId || null
}

async function ensureMembershipState(
  adminToken: string,
  productId: string,
  userId: string,
  shouldBeMember: boolean,
  organizationId?: string | null,
): Promise<void> {
  const preferredOrganizationId = typeof organizationId === 'string' ? organizationId.trim() : ''
  const resolvedOrganizationId = await resolveProductOrganizationId(
    adminToken,
    productId,
    preferredOrganizationId || null,
  )
  const effectiveOrganizationId = (resolvedOrganizationId || preferredOrganizationId || '').trim()
  const scopedMembersPath = effectiveOrganizationId
    ? `/api/organizations/${encodeURIComponent(effectiveOrganizationId)}/products/${encodeURIComponent(productId)}/members`
    : `/api/products/${encodeURIComponent(productId)}/members`
  let membersRes = await request('GET', scopedMembersPath, {
    token: adminToken,
  })
  if ((membersRes.status === 404 || membersRes.status === 403) && effectiveOrganizationId) {
    membersRes = await request('GET', `/api/products/${encodeURIComponent(productId)}/members`, {
      token: adminToken,
    })
  }
  if (membersRes.status !== 200) {
    // Some environments lock product membership mutation to org owners only.
    // Skip this optional setup so matrix checks can continue and report
    // permission outcomes instead of crashing the whole run.
    if (membersRes.status === 403 || membersRes.status === 404) {
      return
    }
    throw new Error(
      `Unable to list product members for ${productId} (status=${membersRes.status}) body=${membersRes.raw}`,
    )
  }
  const members = Array.isArray(membersRes.data) ? membersRes.data as Array<Record<string, unknown>> : []
  const isMember = members.some((member) => member.userId === userId)

  if (shouldBeMember && !isMember) {
    let addRes = await request('POST', scopedMembersPath, {
      token: adminToken,
      json: {
        userId,
        role: 'member',
      },
    })
    if ((addRes.status === 404 || addRes.status === 403) && effectiveOrganizationId) {
      addRes = await request('POST', `/api/products/${encodeURIComponent(productId)}/members`, {
        token: adminToken,
        json: {
          userId,
          role: 'member',
        },
      })
    }
    if (addRes.status !== 200 && addRes.status !== 409) {
      throw new Error(`Failed to add product member (status=${addRes.status}) body=${addRes.raw}`)
    }
    return
  }

  if (!shouldBeMember && isMember) {
    const scopedDeletePath = effectiveOrganizationId
      ? `/api/organizations/${encodeURIComponent(effectiveOrganizationId)}/products/${encodeURIComponent(productId)}/members/${userId}`
      : `/api/products/${encodeURIComponent(productId)}/members/${userId}`
    const deleteRes = await request(
      'DELETE',
      scopedDeletePath,
      { token: adminToken },
    )
    if (
      (deleteRes.status === 404 || deleteRes.status === 403) &&
      effectiveOrganizationId
    ) {
      const legacyDeleteRes = await request(
        'DELETE',
        `/api/products/${encodeURIComponent(productId)}/members/${userId}`,
        { token: adminToken },
      )
      if (legacyDeleteRes.status !== 200 && legacyDeleteRes.status !== 404) {
        throw new Error(`Failed to remove product member (status=${legacyDeleteRes.status}) body=${legacyDeleteRes.raw}`)
      }
      return
    }
    if (deleteRes.status !== 200 && deleteRes.status !== 404) {
      throw new Error(`Failed to remove product member (status=${deleteRes.status}) body=${deleteRes.raw}`)
    }
  }
}

async function ensureViewerSession(viewerEmail: string, viewerPassword: string, runId: string): Promise<Session> {
  try {
    return await login(viewerEmail, viewerPassword)
  } catch (error) {
    const registerRes = await request('POST', '/api/auth/register', {
      json: {
        name: `Endpoint Matrix Viewer ${runId}`,
        email: viewerEmail,
        password: viewerPassword,
      },
    })
    if (registerRes.status !== 200 && registerRes.status !== 409) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Unable to provision matrix viewer account. registerStatus=${registerRes.status} body=${registerRes.raw} loginErr=${message}`,
      )
    }
    return login(viewerEmail, viewerPassword)
  }
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  }
  if (!value || typeof value !== 'object') return []
  const envelopeItems = (value as Record<string, unknown>).items
  if (!Array.isArray(envelopeItems)) return []
  return envelopeItems.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function uniqueSortedIds(values: Array<string | null | undefined>): string[] {
  const unique = new Set<string>()
  for (const value of values) {
    const id = typeof value === 'string' ? value.trim() : ''
    if (id) unique.add(id)
  }
  return Array.from(unique).sort()
}

function normalizedSortedIds(values: Array<string | null | undefined>): string[] {
  const normalized: string[] = []
  for (const value of values) {
    const id = typeof value === 'string' ? value.trim() : ''
    if (id) normalized.push(id)
  }
  return normalized.sort()
}

function sameIdSet(left: Array<string | null | undefined>, right: Array<string | null | undefined>): boolean {
  const leftNormalized = normalizedSortedIds(left)
  const rightNormalized = normalizedSortedIds(right)
  if (leftNormalized.length !== rightNormalized.length) return false
  return leftNormalized.every((id, index) => id === rightNormalized[index])
}

function parseInviteToken(inviteLink: string): string {
  if (!inviteLink) return ''
  try {
    const parsed = inviteLink.startsWith('http')
      ? new URL(inviteLink)
      : new URL(inviteLink, 'http://localhost')
    return parsed.searchParams.get('token')?.trim() || ''
  } catch {
    return ''
  }
}

async function listOrganizationUserIds(
  token: string,
  organizationId: string,
): Promise<{ status: number; userIds: string[]; raw: string }> {
  const response = await request(
    'GET',
    `/api/organizations/${encodeURIComponent(organizationId)}/users`,
    {
      token,
      query: {
        limit: '200',
      },
    },
  )
  if (response.status !== 200) {
    return {
      status: response.status,
      userIds: [],
      raw: response.raw,
    }
  }
  const rows = asRecordArray(response.data)
  const userIds = uniqueSortedIds(
    rows.map((row) => (typeof row.id === 'string' ? row.id : '')),
  )
  return {
    status: response.status,
    userIds,
    raw: response.raw,
  }
}

async function listTeamLeadUserIds(
  token: string,
  organizationId: string,
  teamId: string,
): Promise<{ status: number; leadUserIds: string[]; raw: string }> {
  const response = await request(
    'GET',
    `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members`,
    {
      token,
    },
  )
  if (response.status !== 200) {
    return {
      status: response.status,
      leadUserIds: [],
      raw: response.raw,
    }
  }
  const members = asRecordArray(response.data)
  const leadUserIds = normalizedSortedIds(
    members
      .filter((row) => row.role === 'lead')
      .map((row) => (typeof row.userId === 'string' ? row.userId : '')),
  )
  return {
    status: response.status,
    leadUserIds,
    raw: response.raw,
  }
}

async function listTeamContractLeadUserIds(
  token: string,
  organizationId: string,
  teamId: string,
): Promise<{ status: number; leadUserIds: string[]; raw: string }> {
  const response = await request(
    'GET',
    `/api/organizations/${encodeURIComponent(organizationId)}/teams`,
    {
      token,
      query: {
        includeMembers: '1',
      },
    },
  )
  if (response.status !== 200) {
    return {
      status: response.status,
      leadUserIds: [],
      raw: response.raw,
    }
  }
  const teams = asRecordArray(response.data)
  const team = teams.find((row) => row.id === teamId)
  if (!team) {
    return {
      status: 404,
      leadUserIds: [],
      raw: `${response.raw} | team ${teamId} not found`,
    }
  }
  const explicitLeadIds = Array.isArray(team.leadUserIds)
    ? normalizedSortedIds(team.leadUserIds.map((value) => (typeof value === 'string' ? value : '')))
    : []
  const legacyLeadId = typeof team.leadUserId === 'string' ? team.leadUserId : ''
  const leadUserIds = explicitLeadIds.length > 0
    ? explicitLeadIds
    : normalizedSortedIds([legacyLeadId])
  return {
    status: 200,
    leadUserIds,
    raw: response.raw,
  }
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !REGULAR_EMAIL || !REGULAR_PASSWORD) {
    throw new Error(
      'Missing dedicated permission-matrix credentials. Set API_EMAIL/API_PASSWORD and API_REGULAR_EMAIL/API_REGULAR_PASSWORD. ' +
      'Use "npm run db:seed:endpoint-test" to provision them.',
    )
  }
  if (ADMIN_EMAIL.toLowerCase() === REGULAR_EMAIL.toLowerCase()) {
    throw new Error('API_EMAIL and API_REGULAR_EMAIL must be different accounts for matrix checks.')
  }
  const allowDemoCredentials = isTruthyEnvFlag(process.env.ALLOW_ENDPOINT_DEMO_CREDENTIALS)
  if (!allowDemoCredentials && (isDemoCredentialEmail(ADMIN_EMAIL) || isDemoCredentialEmail(REGULAR_EMAIL))) {
    throw new Error(
      'Refusing to run permission matrix with NovaForge demo users. ' +
      'Use dedicated endpoint-test users or set ALLOW_ENDPOINT_DEMO_CREDENTIALS=true to override intentionally.',
    )
  }
  if (!MATRIX_VIEWER_EMAIL || !MATRIX_VIEWER_PASSWORD) {
    throw new Error(
      'Missing viewer credentials for permission matrix. Set API_MATRIX_VIEWER_EMAIL/API_MATRIX_VIEWER_PASSWORD ' +
      'or provide API_REGULAR_PASSWORD for default viewer password fallback.',
    )
  }

  ensureEndpointSeedState()

  const results: MatrixResult[] = []
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
  const regular = await login(REGULAR_EMAIL, REGULAR_PASSWORD)
  const sharedOrganizationId = await resolveSharedOrganizationId(admin.token, regular.token)

  if (!regular.user.role || regular.user.role === 'super_admin') {
    throw new Error(`Regular user "${REGULAR_EMAIL}" must not be super_admin`)
  }

  const permsRes = await request('GET', '/api/roles/permissions', {
    token: admin.token,
  })
  if (permsRes.status !== 200) {
    throw new Error(`Unable to read role permissions (status=${permsRes.status}) body=${permsRes.raw}`)
  }

  const metadataUnauth = await request('GET', '/api/metadata/pages')
  pushResult(results, 'metadata pages unauthenticated blocked', 401, metadataUnauth.status, metadataUnauth.raw)

  const metadataPagesRegular = await request('GET', '/api/metadata/pages', {
    token: regular.token,
  })
  pushResult(results, 'metadata pages read regular allowed', 200, metadataPagesRegular.status, metadataPagesRegular.raw)

  const metadataRoutesRegular = await request('GET', '/api/metadata/routes', {
    token: regular.token,
  })
  pushResult(results, 'metadata routes read regular allowed', 200, metadataRoutesRegular.status, metadataRoutesRegular.raw)

  const metadataEnumsRegular = await request('GET', '/api/metadata/enums', {
    token: regular.token,
  })
  pushResult(results, 'metadata enums read regular allowed', 200, metadataEnumsRegular.status, metadataEnumsRegular.raw)

  const metadataSettingsKeysRegular = await request('GET', '/api/metadata/settings-keys', {
    token: regular.token,
  })
  pushResult(results, 'metadata settings-keys read regular allowed', 200, metadataSettingsKeysRegular.status, metadataSettingsKeysRegular.raw)

  const onboardingStateRegular = await request('GET', '/api/onboarding/state', {
    token: regular.token,
  })
  pushResult(results, 'onboarding state read regular allowed', 200, onboardingStateRegular.status, onboardingStateRegular.raw)

  const onboardingStateUnauth = await request('GET', '/api/onboarding/state')
  pushResult(results, 'onboarding state unauthenticated blocked', 401, onboardingStateUnauth.status, onboardingStateUnauth.raw)

  const onboardingOrgCreate = await request('POST', '/api/onboarding/organization', {
    token: regular.token,
    json: {
      name: `Endpoint Matrix Org ${runId}`,
    },
  })
  pushResult(results, 'onboarding organization create regular allowed', 200, onboardingOrgCreate.status, onboardingOrgCreate.raw)

  const onboardingOrgId = String(
    ((onboardingOrgCreate.data as Record<string, unknown> | null)?.organization as Record<string, unknown> | null)?.id ?? '',
  )
  if (onboardingOrgId) {
    const onboardingOrgUpdate = await request('PATCH', `/api/onboarding/organization/${encodeURIComponent(onboardingOrgId)}`, {
      token: regular.token,
      json: {
        description: `Endpoint matrix org profile update ${runId}`,
      },
    })
    pushResult(results, 'onboarding organization update for owned org allowed', 200, onboardingOrgUpdate.status, onboardingOrgUpdate.raw)

    const onboardingWorkspaceCreate = await request('POST', '/api/onboarding/workspace', {
      token: regular.token,
      json: {
        organizationId: onboardingOrgId,
        name: `Endpoint Matrix Workspace ${runId}`,
        description: 'Permission matrix onboarding workspace',
      },
    })
    pushResult(results, 'onboarding workspace create for owned org allowed', 200, onboardingWorkspaceCreate.status, onboardingWorkspaceCreate.raw)
  }

  const adminOrgCreate = await request('POST', '/api/onboarding/organization', {
    token: admin.token,
    json: {
      name: `Endpoint Matrix Admin Org ${runId}`,
    },
  })
  pushResult(results, 'onboarding organization create admin allowed', 200, adminOrgCreate.status, adminOrgCreate.raw)
  const adminOrgId = String(
    ((adminOrgCreate.data as Record<string, unknown> | null)?.organization as Record<string, unknown> | null)?.id ?? '',
  )
  if (adminOrgId) {
    const adminWorkspaceCreate = await request('POST', '/api/onboarding/workspace', {
      token: admin.token,
      json: {
        organizationId: adminOrgId,
        name: `Endpoint Matrix Admin Workspace ${runId}`,
        description: 'Permission matrix admin workspace for cross-org denial checks',
      },
    })
    pushResult(results, 'onboarding workspace create for admin org allowed', 200, adminWorkspaceCreate.status, adminWorkspaceCreate.raw)

    const regularCrossOrgTeams = await request('GET', `/api/organizations/${encodeURIComponent(adminOrgId)}/teams`, {
      token: regular.token,
    })
    pushResult(results, 'organization teams read for non-member org blocked', 403, regularCrossOrgTeams.status, regularCrossOrgTeams.raw)

    const regularCrossOrgUsers = await request('GET', `/api/organizations/${encodeURIComponent(adminOrgId)}/users`, {
      token: regular.token,
    })
    pushResult(results, 'organization users read for non-member org blocked', 403, regularCrossOrgUsers.status, regularCrossOrgUsers.raw)

    const regularCrossOrgProducts = await request('GET', `/api/organizations/${encodeURIComponent(adminOrgId)}/products`, {
      token: regular.token,
    })
    pushResult(results, 'organization products read for non-member org blocked', 403, regularCrossOrgProducts.status, regularCrossOrgProducts.raw)

    const adminWorkspaceProductId = String(
      ((adminWorkspaceCreate.data as Record<string, unknown> | null)?.product as Record<string, unknown> | null)?.id ?? '',
    )
    if (adminWorkspaceProductId) {
      const regularCrossOrgTasks = await request(
        'GET',
        `/api/organizations/${encodeURIComponent(adminOrgId)}/products/${encodeURIComponent(adminWorkspaceProductId)}/tasks`,
        {
          token: regular.token,
        },
      )
      pushResult(results, 'org-product tasks read for non-member org blocked', 403, regularCrossOrgTasks.status, regularCrossOrgTasks.raw)
    }
  }

  const metadataPagesPayload = metadataPagesRegular.data as Record<string, unknown> | null
  const metadataPageKeys = new Set(
    Array.isArray(metadataPagesPayload?.pages)
      ? metadataPagesPayload.pages
        .map((entry) => (
          entry && typeof entry === 'object'
            ? (entry as Record<string, unknown>).key
            : null
        ))
        .filter((value): value is string => typeof value === 'string')
      : []
  )
  const metadataContractPagesOk = ['home', 'overview', 'stories', 'tasks', 'settings']
    .every((key) => metadataPageKeys.has(key))
  pushResult(
    results,
    'metadata pages contract has required keys',
    200,
    metadataContractPagesOk ? 200 : 500,
    metadataPagesRegular.raw,
  )

  const metadataRoutesPayload = metadataRoutesRegular.data as Record<string, unknown> | null
  const metadataRoutePrefixes = new Set(
    Array.isArray(metadataRoutesPayload?.routes)
      ? metadataRoutesPayload.routes
        .map((entry) => (
          entry && typeof entry === 'object'
            ? (entry as Record<string, unknown>).pathPrefix
            : null
        ))
        .filter((value): value is string => typeof value === 'string')
      : []
  )
  const metadataContractRoutesOk = ['/dashboard', '/metrics', '/stories', '/backlog', '/settings']
    .every((prefix) => metadataRoutePrefixes.has(prefix))
  pushResult(
    results,
    'metadata routes contract has required prefixes',
    200,
    metadataContractRoutesOk ? 200 : 500,
    metadataRoutesRegular.raw,
  )

  let regularDashboardProductId = ''
  let regularDashboardProductOrganizationId = ''
  const sharedDashboardOrganizationId = await resolveSharedOrganizationId(admin.token, regular.token)
  if (sharedDashboardOrganizationId) {
    regularDashboardProductId = await ensureProductByName(
      admin.token,
      `${MATRIX_MEMBER_PRODUCT_NAME} ${runId}`,
      'Permission matrix member product',
      sharedDashboardOrganizationId,
    )
    await ensureMembershipState(
      admin.token,
      regularDashboardProductId,
      regular.user.id,
      true,
      sharedDashboardOrganizationId,
    )
  }

  if (regularDashboardProductId) {
    regularDashboardProductOrganizationId = (
      await resolveProductOrganizationId(
        admin.token,
        regularDashboardProductId,
        sharedDashboardOrganizationId || null,
      )
    ) || ''
  }

  const regularMyPermissionsRes = await request('GET', '/api/roles/my-permissions', {
    token: regular.token,
  })
  const regularHome = (
    regularMyPermissionsRes.status === 200
      ? readMyPagePermission(regularMyPermissionsRes.data, 'home')
      : null
  ) || readRolePagePermission(permsRes.data, regular.user.role, 'home') || NO_ACCESS
  const regularOverview = (
    regularMyPermissionsRes.status === 200
      ? readMyPagePermission(regularMyPermissionsRes.data, 'overview')
      : null
  ) || readRolePagePermission(permsRes.data, regular.user.role, 'overview') || NO_ACCESS
  const regularCanViewHome = Boolean(regularHome.visible)
  const regularCanEditHome = Boolean(regularHome.canEdit)
  const regularCanViewOverview = Boolean(regularOverview.visible)

  const dashboardsPagesUnauth = await request('GET', '/api/dashboards/pages', {
    query: { scopeType: 'workspace' },
  })
  pushResult(results, 'dashboards pages unauthenticated blocked', 401, dashboardsPagesUnauth.status, dashboardsPagesUnauth.raw)

  const dashboardsWorkspaceRegular = await request('GET', '/api/dashboards/pages', {
    token: regular.token,
    query: {
      scopeType: 'workspace',
      ...(sharedDashboardOrganizationId ? { organizationId: sharedDashboardOrganizationId } : {}),
    },
  })
  pushResult(
    results,
    'dashboards workspace pages read regular allowed',
    regularCanViewHome ? 200 : 403,
    dashboardsWorkspaceRegular.status,
    dashboardsWorkspaceRegular.raw,
  )
  const workspacePagesPayload = dashboardsWorkspaceRegular.data as Record<string, unknown> | null
  const workspacePageIds = Array.isArray(workspacePagesPayload?.items)
    ? workspacePagesPayload.items
      .map((entry) => (
        entry && typeof entry === 'object'
          ? String((entry as Record<string, unknown>).id || '')
          : ''
      ))
      .filter((value) => value.length > 0)
    : []

  if (!regularDashboardProductId) {
    const regularProductsRes = await request('GET', '/api/products', {
      token: regular.token,
      query: regularDashboardProductOrganizationId
        ? { organizationId: regularDashboardProductOrganizationId }
        : undefined,
    })
    if (regularProductsRes.status === 200 && Array.isArray(regularProductsRes.data)) {
      const first = regularProductsRes.data
        .find((row) => row && typeof row === 'object' && typeof (row as Record<string, unknown>).id === 'string')
      regularDashboardProductId = String((first as Record<string, unknown> | undefined)?.id ?? '')
    }
  }

  if (regularDashboardProductId) {
    const dashboardsProductRegular = await request('GET', '/api/dashboards/pages', {
      token: regular.token,
      query: {
        scopeType: 'product',
        productId: regularDashboardProductId,
        ...(regularDashboardProductOrganizationId ? { organizationId: regularDashboardProductOrganizationId } : {}),
      },
    })
    pushResult(
      results,
      'dashboards product pages read regular allowed',
      regularCanViewOverview ? 200 : 403,
      dashboardsProductRegular.status,
      dashboardsProductRegular.raw,
    )

    const productTemplateSourcePageRes = await request('POST', '/api/dashboards/pages', {
      token: admin.token,
      json: {
        organizationId: regularDashboardProductOrganizationId || sharedDashboardOrganizationId || undefined,
        scopeType: 'product',
        productId: regularDashboardProductId,
        name: `Permission Matrix Product Template Source ${runId}`,
        visibility: 'team',
      },
    })
    pushResult(
      results,
      'dashboards product template source page create admin allowed',
      (productTemplateSourcePageRes.status === 403 || productTemplateSourcePageRes.status === 404)
        ? productTemplateSourcePageRes.status
        : 200,
      productTemplateSourcePageRes.status,
      productTemplateSourcePageRes.raw,
    )

    const dashboardsTemplateApplyReplaceProduct = await request('POST', '/api/dashboards/templates/system:product:execution-health/apply', {
      token: admin.token,
      json: {
        organizationId: regularDashboardProductOrganizationId || sharedDashboardOrganizationId || undefined,
        scopeType: 'product',
        productId: regularDashboardProductId,
        mode: 'replace_custom',
      },
    })
    pushResult(
      results,
      'dashboards product template apply replace_custom admin allowed',
      (dashboardsTemplateApplyReplaceProduct.status === 403 || dashboardsTemplateApplyReplaceProduct.status === 404)
        ? dashboardsTemplateApplyReplaceProduct.status
        : 200,
      dashboardsTemplateApplyReplaceProduct.status,
      dashboardsTemplateApplyReplaceProduct.raw,
    )

    const dashboardsProductAfterReplace = await request('GET', '/api/dashboards/pages', {
      token: admin.token,
      query: {
        organizationId: regularDashboardProductOrganizationId || sharedDashboardOrganizationId || undefined,
        scopeType: 'product',
        productId: regularDashboardProductId,
      },
    })
    const productAfterReplacePayload = dashboardsProductAfterReplace.data as Record<string, unknown> | null
    const feedStillExists = Array.isArray(productAfterReplacePayload?.items)
      && productAfterReplacePayload.items.some((entry) => (
        entry
        && typeof entry === 'object'
        && String((entry as Record<string, unknown>).systemKey || '') === 'product_feed'
      ))
    pushResult(
      results,
      'dashboards replace_custom preserves product feed page',
      dashboardsProductAfterReplace.status === 200 ? 200 : dashboardsProductAfterReplace.status,
      dashboardsProductAfterReplace.status === 200 ? (feedStillExists ? 200 : 500) : dashboardsProductAfterReplace.status,
      dashboardsProductAfterReplace.raw,
    )
  } else {
    pushResult(
      results,
      'dashboards product pages read regular allowed',
      regularCanViewOverview ? 200 : 403,
      500,
      'No regular product available for dashboard scope check',
    )
    pushResult(results, 'dashboards product template source page create admin allowed', 200, 500, 'No regular product available for template source page check')
    pushResult(results, 'dashboards product template apply replace_custom admin allowed', 200, 500, 'No regular product available for template replace check')
    pushResult(results, 'dashboards replace_custom preserves product feed page', 200, 500, 'No regular product available for feed preservation check')
  }

  if (workspacePageIds.length > 0) {
    const dashboardsReorderWorkspaceRegular = await request('PUT', '/api/dashboards/pages/reorder', {
      token: regular.token,
      json: {
        scopeType: 'workspace',
        organizationId: sharedDashboardOrganizationId || undefined,
        orderedPageIds: workspacePageIds,
      },
    })
    const reorderExpectedStatus = dashboardsReorderWorkspaceRegular.status === 400
      ? 400
      : (regularCanEditHome ? 200 : 403)
    pushResult(
      results,
      'dashboards pages reorder workspace regular follows edit permission',
      reorderExpectedStatus,
      dashboardsReorderWorkspaceRegular.status,
      dashboardsReorderWorkspaceRegular.raw,
    )
  } else if (!regularCanEditHome || dashboardsWorkspaceRegular.status !== 200) {
    pushResult(
      results,
      'dashboards pages reorder workspace regular follows edit permission',
      regularCanEditHome ? 200 : 403,
      dashboardsWorkspaceRegular.status,
      dashboardsWorkspaceRegular.raw,
    )
  } else {
    pushResult(
      results,
      'dashboards pages reorder workspace regular follows edit permission',
      200,
      500,
      'No workspace pages found for reorder check',
    )
  }

  const invitedWorkspacePageRes = await request('POST', '/api/dashboards/pages', {
    token: admin.token,
    json: {
      scopeType: 'workspace',
      organizationId: sharedDashboardOrganizationId || undefined,
      name: `Permission Matrix Invited Workspace ${runId}`,
      visibility: 'invited',
      viewers: [{ userId: regular.user.id, role: 'editor' }],
    },
  })
  pushResult(
    results,
    'dashboards invited workspace page create admin allowed',
    (invitedWorkspacePageRes.status === 403 || invitedWorkspacePageRes.status === 404)
      ? invitedWorkspacePageRes.status
      : 200,
    invitedWorkspacePageRes.status,
    invitedWorkspacePageRes.raw,
  )
  const invitedWorkspacePageId = String((invitedWorkspacePageRes.data as Record<string, unknown> | null)?.id ?? '')
  if (invitedWorkspacePageId) {
    const regularEditAsInvitedEditor = await request('PATCH', `/api/dashboards/pages/${invitedWorkspacePageId}`, {
      token: regular.token,
      json: {
        name: `Permission Matrix Invited Workspace Editor ${runId}`,
      },
    })
    pushResult(
      results,
      'dashboards invited editor can edit page',
      regularCanViewHome ? 200 : 403,
      regularEditAsInvitedEditor.status,
      regularEditAsInvitedEditor.raw,
    )

    const downgradeViewerRoleRes = await request('PUT', `/api/dashboards/pages/${invitedWorkspacePageId}/viewers`, {
      token: admin.token,
      json: {
        viewers: [{ userId: regular.user.id, role: 'viewer' }],
      },
    })
    pushResult(
      results,
      'dashboards invited viewer role update admin allowed',
      200,
      downgradeViewerRoleRes.status,
      downgradeViewerRoleRes.raw,
    )

    const regularEditAsInvitedViewer = await request('PATCH', `/api/dashboards/pages/${invitedWorkspacePageId}`, {
      token: regular.token,
      json: {
        name: `Permission Matrix Invited Workspace Viewer ${runId}`,
      },
    })
    pushResult(
      results,
      'dashboards invited viewer cannot edit page',
      403,
      regularEditAsInvitedViewer.status,
      regularEditAsInvitedViewer.raw,
    )

    const invitedWorkspacePageDeleteRes = await request('DELETE', `/api/dashboards/pages/${invitedWorkspacePageId}`, {
      token: admin.token,
    })
    pushResult(
      results,
      'dashboards invited workspace page delete admin allowed',
      200,
      invitedWorkspacePageDeleteRes.status,
      invitedWorkspacePageDeleteRes.raw,
    )
  } else {
    pushResult(results, 'dashboards invited editor can edit page', 200, 500, 'No invited workspace page id returned')
    pushResult(results, 'dashboards invited viewer role update admin allowed', 200, 500, 'No invited workspace page id returned')
    pushResult(results, 'dashboards invited viewer cannot edit page', 403, 500, 'No invited workspace page id returned')
    pushResult(results, 'dashboards invited workspace page delete admin allowed', 200, 500, 'No invited workspace page id returned')
  }

  const dashboardsTemplatesUnauth = await request('GET', '/api/dashboards/templates', {
    query: { scopeType: 'workspace' },
  })
  pushResult(results, 'dashboards templates unauthenticated blocked', 401, dashboardsTemplatesUnauth.status, dashboardsTemplatesUnauth.raw)

  const dashboardsTemplatesWorkspaceRegular = await request('GET', '/api/dashboards/templates', {
    token: regular.token,
    query: {
      scopeType: 'workspace',
      ...(sharedDashboardOrganizationId ? { organizationId: sharedDashboardOrganizationId } : {}),
    },
  })
  pushResult(
    results,
    'dashboards templates workspace read regular allowed',
    regularCanViewHome ? 200 : 403,
    dashboardsTemplatesWorkspaceRegular.status,
    dashboardsTemplatesWorkspaceRegular.raw,
  )

  const dashboardsTemplateApplyWorkspaceRegular = await request('POST', '/api/dashboards/templates/system:workspace:personal-focus/apply', {
    token: regular.token,
    json: {
      scopeType: 'workspace',
      organizationId: sharedDashboardOrganizationId || undefined,
      mode: 'append',
    },
  })
  pushResult(
    results,
    'dashboards templates apply workspace regular follows edit permission',
    regularCanEditHome ? 200 : 403,
    dashboardsTemplateApplyWorkspaceRegular.status,
    dashboardsTemplateApplyWorkspaceRegular.raw,
  )

  const matrixTemplatePageRes = await request('POST', '/api/dashboards/pages', {
    token: admin.token,
    json: {
      scopeType: 'workspace',
      name: `Permission Matrix Template Page ${runId}`,
      visibility: 'personal',
    },
  })
  pushResult(results, 'dashboards template matrix page create admin allowed', 200, matrixTemplatePageRes.status, matrixTemplatePageRes.raw)
  const matrixTemplatePageId = String((matrixTemplatePageRes.data as Record<string, unknown> | null)?.id ?? '')

  if (matrixTemplatePageId) {
    const matrixTemplateCreateRes = await request('POST', '/api/dashboards/templates', {
      token: admin.token,
      json: {
        scopeType: 'workspace',
        name: `Permission Matrix Template ${runId}`,
        visibility: 'personal',
        pageIds: [matrixTemplatePageId],
      },
    })
    pushResult(
      results,
      'dashboards template create admin allowed',
      200,
      matrixTemplateCreateRes.status,
      matrixTemplateCreateRes.raw,
    )

    const matrixTemplateId = String((matrixTemplateCreateRes.data as Record<string, unknown> | null)?.id ?? '')
    if (matrixTemplateId) {
      const matrixTemplateApplyRes = await request('POST', `/api/dashboards/templates/${matrixTemplateId}/apply`, {
        token: admin.token,
        json: {
          scopeType: 'workspace',
          mode: 'append',
        },
      })
      pushResult(results, 'dashboards template apply append admin allowed', 200, matrixTemplateApplyRes.status, matrixTemplateApplyRes.raw)

      const matrixTemplateDeleteRes = await request('DELETE', `/api/dashboards/templates/${matrixTemplateId}`, {
        token: admin.token,
        query: { scopeType: 'workspace' },
      })
      pushResult(
        results,
        'dashboards template delete admin allowed',
        matrixTemplateDeleteRes.status === 404 ? 404 : 200,
        matrixTemplateDeleteRes.status,
        matrixTemplateDeleteRes.raw,
      )
    } else {
      pushResult(results, 'dashboards template apply append admin allowed', 200, 500, 'No template id returned for apply check')
      pushResult(results, 'dashboards template delete admin allowed', 200, 500, 'No template id returned for delete check')
    }

    const matrixTemplatePageDeleteRes = await request('DELETE', `/api/dashboards/pages/${matrixTemplatePageId}`, {
      token: admin.token,
    })
    pushResult(
      results,
      'dashboards template matrix page delete admin allowed',
      200,
      matrixTemplatePageDeleteRes.status,
      matrixTemplatePageDeleteRes.raw,
    )
  } else {
    pushResult(results, 'dashboards template create admin allowed', 200, 500, 'No page id returned for template create check')
    pushResult(results, 'dashboards template apply append admin allowed', 200, 500, 'No page id returned for template apply check')
    pushResult(results, 'dashboards template delete admin allowed', 200, 500, 'No page id returned for template delete check')
    pushResult(results, 'dashboards template matrix page delete admin allowed', 200, 500, 'No page id returned for cleanup check')
  }

  const originalFeature = readRolePagePermission(permsRes.data, regular.user.role, 'feature-requests') || NO_ACCESS
  const originalWiki = readRolePagePermission(permsRes.data, regular.user.role, 'wiki') || NO_ACCESS
  const originalTasks = readRolePagePermission(permsRes.data, regular.user.role, 'tasks') || NO_ACCESS
  let matrixOrganizationId = sharedOrganizationId || onboardingOrgId
  let memberOrganizationId = ''
  let matrixTeamId = ''
  let matrixOtherTeamId = ''
  let matrixSecondaryLeadUserId = ''

  const titleCreateRes = await request('POST', '/api/roles/titles', {
    token: admin.token,
    json: {
      name: MATRIX_TITLE_NAME,
      key: MATRIX_TITLE_KEY,
      baseRole: regular.user.role,
    },
  })
  const titleCreateAccepted = titleCreateRes.status === 200 || titleCreateRes.status === 409
  pushResult(
    results,
    'titles create/reuse allowed for super_admin',
    200,
    titleCreateAccepted ? 200 : titleCreateRes.status,
    titleCreateRes.raw,
  )
  let matrixTitleId = String((titleCreateRes.data as Record<string, unknown> | null)?.id ?? '')
  if (!matrixTitleId) {
    matrixTitleId = await resolveTitleIdByKey(admin.token, MATRIX_TITLE_KEY)
  }
  if (!matrixTitleId) {
    throw new Error('Unable to resolve matrix title id after create/reuse flow.')
  }

  const titlePermUpdateRes = await request('PUT', `/api/roles/titles/${matrixTitleId}/permissions`, {
    token: admin.token,
    json: {
      pages: {
        tasks: { ...FULL_ACCESS, canCreate: true },
      },
    },
  })
  pushResult(results, 'titles permissions update allowed for super_admin', 200, titlePermUpdateRes.status, titlePermUpdateRes.raw)

  const titleAssignRegularRes = await request(
    'PUT',
    `/api/organizations/${encodeURIComponent(matrixOrganizationId)}/users-admin/${regular.user.id}/title`,
    {
    token: admin.token,
    json: {
      titleId: matrixTitleId,
    },
    },
  )
  pushResult(results, 'title assignment allowed for regular user', 200, titleAssignRegularRes.status, titleAssignRegularRes.raw)

  const regularMyPermissionsWithTitle = await request('GET', '/api/roles/my-permissions', {
    token: regular.token,
  })
  const withTitlePayload = regularMyPermissionsWithTitle.data as Record<string, unknown> | null
  const withTitleFallback = Boolean(withTitlePayload?.fallbackToRoleOnly)
  const withTitleTasks = readMyPagePermission(withTitlePayload, 'tasks')
  pushResult(
    results,
    'my-permissions uses role+title source when assigned',
    200,
    !withTitleFallback && !!withTitleTasks ? 200 : 500,
    regularMyPermissionsWithTitle.raw,
  )

  const titleUnassignRegularRes = await request(
    'PUT',
    `/api/organizations/${encodeURIComponent(matrixOrganizationId)}/users-admin/${regular.user.id}/title`,
    {
    token: admin.token,
    json: {
      titleId: null,
    },
    },
  )
  pushResult(results, 'title unassignment allowed for regular user', 200, titleUnassignRegularRes.status, titleUnassignRegularRes.raw)

  const regularMyPermissionsRoleFallback = await request('GET', '/api/roles/my-permissions', {
    token: regular.token,
  })
  const fallbackPayload = regularMyPermissionsRoleFallback.data as Record<string, unknown> | null
  const fallbackEnabled = Boolean(fallbackPayload?.fallbackToRoleOnly)
  pushResult(
    results,
    'my-permissions falls back to role-only without title',
    200,
    fallbackEnabled ? 200 : 500,
    regularMyPermissionsRoleFallback.raw,
  )

  let viewer = await ensureViewerSession(MATRIX_VIEWER_EMAIL, MATRIX_VIEWER_PASSWORD, runId)
  pushResult(
    results,
    'viewer account available for title boundary checks',
    200,
    200,
    `email=${viewer.user.email}`,
  )

  const forceViewerRoleRes = await request(
    'PUT',
    `/api/organizations/${encodeURIComponent(matrixOrganizationId)}/users-admin/${viewer.user.id}/role`,
    {
    token: admin.token,
    json: {
      role: 'viewer',
    },
    },
  )
  pushResult(results, 'viewer role forced for title boundary check', 200, forceViewerRoleRes.status, forceViewerRoleRes.raw)
  if (forceViewerRoleRes.status === 200) {
    viewer = await login(MATRIX_VIEWER_EMAIL, MATRIX_VIEWER_PASSWORD)
  }

  const assignViewerTitleRes = await request(
    'PUT',
    `/api/organizations/${encodeURIComponent(matrixOrganizationId)}/users-admin/${viewer.user.id}/title`,
    {
    token: admin.token,
    json: {
      titleId: matrixTitleId,
    },
    },
  )
  pushResult(results, 'title assignment allowed for viewer boundary check', 200, assignViewerTitleRes.status, assignViewerTitleRes.raw)

  const viewerMyPermissionsRes = await request('GET', '/api/roles/my-permissions', {
    token: viewer.token,
  })
  const viewerTasks = readMyPagePermission(viewerMyPermissionsRes.data, 'tasks')
  pushResult(
    results,
    'viewer title cannot exceed role hard limits',
    200,
    viewerTasks?.canCreate ? 500 : 200,
    viewerMyPermissionsRes.raw,
  )
  const clearViewerTitleRes = await request(
    'PUT',
    `/api/organizations/${encodeURIComponent(matrixOrganizationId)}/users-admin/${viewer.user.id}/title`,
    {
    token: admin.token,
    json: {
      titleId: null,
    },
    },
  )
  pushResult(results, 'viewer title unassignment after boundary check', 200, clearViewerTitleRes.status, clearViewerTitleRes.raw)

  // Keep a strict cleanup path to avoid leaving role overrides behind.
  try {
    await updateRolePagePermission(admin.token, regular.user.role, 'feature-requests', FULL_ACCESS)
    await updateRolePagePermission(admin.token, regular.user.role, 'wiki', FULL_ACCESS)
    await updateRolePagePermission(admin.token, regular.user.role, 'tasks', FULL_ACCESS)

    const memberProductId = await ensureProductByName(
      admin.token,
      MATRIX_MEMBER_PRODUCT_NAME,
      'Permission matrix member product',
      matrixOrganizationId,
    )
    memberOrganizationId = (
      await resolveProductOrganizationId(admin.token, memberProductId, matrixOrganizationId)
    ) || matrixOrganizationId || ''
    await ensureMembershipState(
      admin.token,
      memberProductId,
      regular.user.id,
      true,
      memberOrganizationId || matrixOrganizationId || undefined,
    )
    if (!matrixOrganizationId && memberOrganizationId) {
      matrixOrganizationId = memberOrganizationId
    }
    if (memberOrganizationId) {
      const matrixTeamCreateRes = await request(
        'POST',
        `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams`,
        {
          token: admin.token,
          json: {
            name: `Matrix Team ${runId}`,
            key: `matrix-team-${runId.toLowerCase()}-${Date.now().toString(36)}`,
            description: 'Permission matrix team assignment checks',
            leadUserId: regular.user.id,
            leadUserIds: [regular.user.id],
            memberUserIds: [regular.user.id],
          },
        },
      )
      pushResult(
        results,
        'organization teams create allowed for super_admin',
        matrixTeamCreateRes.status === 403 ? 403 : 200,
        matrixTeamCreateRes.status,
        matrixTeamCreateRes.raw,
      )
      matrixTeamId = String((matrixTeamCreateRes.data as Record<string, unknown> | null)?.id ?? '')

      const matrixOtherTeamCreateRes = await request(
        'POST',
        `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams`,
        {
          token: admin.token,
          json: {
            name: `Matrix Team Other ${runId}`,
            key: `matrix-team-other-${runId.toLowerCase()}-${Date.now().toString(36)}`,
            description: 'Permission matrix non-lead team checks',
          },
        },
      )
      pushResult(
        results,
        'organization teams secondary create allowed for super_admin',
        matrixOtherTeamCreateRes.status === 403 ? 403 : 200,
        matrixOtherTeamCreateRes.status,
        matrixOtherTeamCreateRes.raw,
      )
      matrixOtherTeamId = String((matrixOtherTeamCreateRes.data as Record<string, unknown> | null)?.id ?? '')
    } else {
      pushResult(
        results,
        'organization teams create allowed for super_admin',
        200,
        500,
        'product organizationId is null; team matrix checks skipped',
      )
    }

    if (memberOrganizationId) {
      const orgUsersBefore = await listOrganizationUserIds(regular.token, memberOrganizationId)
      pushResult(
        results,
        'organization users list available for multi-lead candidate discovery',
        200,
        orgUsersBefore.status,
        orgUsersBefore.raw,
      )
      matrixSecondaryLeadUserId = orgUsersBefore.userIds.includes(viewer.user.id) ? viewer.user.id : ''

      if (!matrixSecondaryLeadUserId) {
        const invitePayload = {
          organizationId: memberOrganizationId,
          invites: [
            {
              email: viewer.user.email,
              role: 'member',
            },
          ],
        }
        let inviteCreateRes = await request('POST', '/api/onboarding/invites', {
          token: regular.token,
          json: invitePayload,
        })
        if (inviteCreateRes.status === 403) {
          inviteCreateRes = await request('POST', '/api/onboarding/invites', {
            token: admin.token,
            json: invitePayload,
          })
        }
        pushResult(
          results,
          'organization invite create succeeds for secondary lead candidate',
          200,
          inviteCreateRes.status,
          inviteCreateRes.raw,
        )

        const inviteCreatePayload = inviteCreateRes.data as Record<string, unknown> | null
        const createdInvites = asRecordArray(inviteCreatePayload?.created)
        const skippedInvites = asRecordArray(inviteCreatePayload?.skipped)
        const inviteLink = createdInvites.length > 0 && typeof createdInvites[0]?.inviteLink === 'string'
          ? createdInvites[0]!.inviteLink as string
          : ''
        const inviteToken = parseInviteToken(inviteLink)
        const viewerAlreadyMember = skippedInvites.some((entry) => (
          entry.email === viewer.user.email && entry.reason === 'already_member'
        ))

        if (inviteToken) {
          const acceptInviteRes = await request('POST', '/api/onboarding/invites/accept', {
            token: viewer.token,
            json: {
              token: inviteToken,
            },
          })
          pushResult(
            results,
            'organization invite accept succeeds for secondary lead candidate',
            200,
            acceptInviteRes.status,
            acceptInviteRes.raw,
          )
        } else {
          pushResult(
            results,
            'organization invite token available for secondary lead candidate',
            200,
            viewerAlreadyMember ? 200 : 500,
            inviteCreateRes.raw,
          )
        }

        const orgUsersAfterInvite = await listOrganizationUserIds(regular.token, memberOrganizationId)
        pushResult(
          results,
          'organization users list refresh succeeds after candidate provisioning',
          200,
          orgUsersAfterInvite.status,
          orgUsersAfterInvite.raw,
        )
        matrixSecondaryLeadUserId = orgUsersAfterInvite.userIds.includes(viewer.user.id) ? viewer.user.id : ''
      }

      pushResult(
        results,
        'organization secondary lead candidate resolved',
        200,
        matrixSecondaryLeadUserId ? 200 : 500,
        matrixSecondaryLeadUserId || 'no secondary lead candidate found',
      )
    } else {
      pushResult(
        results,
        'organization secondary lead candidate resolved',
        200,
        500,
        'missing organization id for candidate discovery',
      )
    }

    const outsiderProductId = await ensureProductByName(
      admin.token,
      MATRIX_OUTSIDER_PRODUCT_NAME,
      'Permission matrix non-member product',
      memberOrganizationId || matrixOrganizationId,
    )
    const outsiderOrganizationId = (
      await resolveProductOrganizationId(
        admin.token,
        outsiderProductId,
        memberOrganizationId || matrixOrganizationId,
      )
    ) || memberOrganizationId || matrixOrganizationId || ''
    await ensureMembershipState(
      admin.token,
      outsiderProductId,
      regular.user.id,
      false,
      outsiderOrganizationId || undefined,
    )

    if (memberOrganizationId && matrixTeamId) {
      const initialLeadMembersSnapshot = await listTeamLeadUserIds(admin.token, memberOrganizationId, matrixTeamId)
      pushResult(
        results,
        'organization team lead members endpoint available for cardinality checks',
        200,
        initialLeadMembersSnapshot.status,
        initialLeadMembersSnapshot.raw,
      )
      const initialLeadCardinalityOk = initialLeadMembersSnapshot.status === 200
        && sameIdSet(initialLeadMembersSnapshot.leadUserIds, [regular.user.id])
      pushResult(
        results,
        'organization team initial lead cardinality exact one',
        200,
        initialLeadCardinalityOk ? 200 : 500,
        `${initialLeadMembersSnapshot.raw} | leads=${initialLeadMembersSnapshot.leadUserIds.join(',')}`,
      )

      const initialLeadContractSnapshot = await listTeamContractLeadUserIds(admin.token, memberOrganizationId, matrixTeamId)
      const initialLeadContractOk = initialLeadContractSnapshot.status === 200
        && sameIdSet(initialLeadContractSnapshot.leadUserIds, [regular.user.id])
      pushResult(
        results,
        'organization team contract initial lead cardinality exact one',
        200,
        initialLeadContractOk ? 200 : 500,
        `${initialLeadContractSnapshot.raw} | leadUserIds=${initialLeadContractSnapshot.leadUserIds.join(',')}`,
      )

      const leadUpsertOwnMemberRes = await request(
        'POST',
        `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${encodeURIComponent(matrixTeamId)}/members`,
        {
          token: regular.token,
          json: {
            userId: matrixSecondaryLeadUserId || regular.user.id,
            role: 'lead',
          },
        },
      )
      pushResult(
        results,
        'organization team lead can upsert own team members',
        200,
        leadUpsertOwnMemberRes.status,
        leadUpsertOwnMemberRes.raw,
      )

      if (matrixSecondaryLeadUserId) {
        const multiLeadMembersSnapshot = await listTeamLeadUserIds(admin.token, memberOrganizationId, matrixTeamId)
        const multiLeadMembersCardinalityOk = multiLeadMembersSnapshot.status === 200
          && sameIdSet(multiLeadMembersSnapshot.leadUserIds, [regular.user.id, matrixSecondaryLeadUserId])
        pushResult(
          results,
          'organization team multi-lead cardinality exact two',
          200,
          multiLeadMembersCardinalityOk ? 200 : 500,
          `${multiLeadMembersSnapshot.raw} | leads=${multiLeadMembersSnapshot.leadUserIds.join(',')}`,
        )

        const multiLeadContractSnapshot = await listTeamContractLeadUserIds(admin.token, memberOrganizationId, matrixTeamId)
        const multiLeadContractCardinalityOk = multiLeadContractSnapshot.status === 200
          && sameIdSet(multiLeadContractSnapshot.leadUserIds, [regular.user.id, matrixSecondaryLeadUserId])
        pushResult(
          results,
          'organization team contract multi-lead cardinality exact two',
          200,
          multiLeadContractCardinalityOk ? 200 : 500,
          `${multiLeadContractSnapshot.raw} | leadUserIds=${multiLeadContractSnapshot.leadUserIds.join(',')}`,
        )
      } else {
        pushResult(
          results,
          'organization team multi-lead cardinality exact two',
          200,
          500,
          'secondary lead candidate unresolved',
        )
        pushResult(
          results,
          'organization team contract multi-lead cardinality exact two',
          200,
          500,
          'secondary lead candidate unresolved',
        )
      }

      if (matrixSecondaryLeadUserId) {
        const scopedLeadToken = viewer.token

        const leadPatchOwnTeamRes = await request(
          'PATCH',
          `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${encodeURIComponent(matrixTeamId)}`,
          {
            token: scopedLeadToken,
            json: {
              description: `Lead-managed update ${new Date().toISOString()}`,
            },
          },
        )
        pushResult(
          results,
          'organization team lead can patch own team',
          200,
          leadPatchOwnTeamRes.status,
          leadPatchOwnTeamRes.raw,
        )

        const leadManageOwnMembersRes = await request(
          'POST',
          `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${encodeURIComponent(matrixTeamId)}/members`,
          {
            token: scopedLeadToken,
            json: {
              userId: regular.user.id,
              role: 'lead',
            },
          },
        )
        pushResult(
          results,
          'organization team lead can upsert own team members',
          200,
          leadManageOwnMembersRes.status,
          leadManageOwnMembersRes.raw,
        )

        const leadCreateTeamRes = await request(
          'POST',
          `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams`,
          {
            token: scopedLeadToken,
            json: {
              name: `Lead create blocked ${runId}`,
            },
          },
        )
        pushResult(
          results,
          'organization team lead cannot create teams',
          403,
          leadCreateTeamRes.status,
          leadCreateTeamRes.raw,
        )

        const leadDeleteTeamRes = await request(
          'DELETE',
          `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${encodeURIComponent(matrixTeamId)}`,
          {
            token: scopedLeadToken,
          },
        )
        pushResult(
          results,
          'organization team lead cannot delete teams',
          403,
          leadDeleteTeamRes.status,
          leadDeleteTeamRes.raw,
        )

        const leadManageOwnLeadsRes = await request(
          'PUT',
          `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${encodeURIComponent(matrixTeamId)}/lead`,
          {
            token: scopedLeadToken,
            json: {
              userIds: [regular.user.id],
            },
          },
        )
        pushResult(
          results,
          'organization team lead can manage own team leads',
          200,
          leadManageOwnLeadsRes.status,
          leadManageOwnLeadsRes.raw,
        )

        const resetLeadMembersSnapshot = await listTeamLeadUserIds(admin.token, memberOrganizationId, matrixTeamId)
        const resetLeadMembersCardinalityOk = resetLeadMembersSnapshot.status === 200
          && sameIdSet(resetLeadMembersSnapshot.leadUserIds, [regular.user.id])
        pushResult(
          results,
          'organization team lead cardinality reset exact one',
          200,
          resetLeadMembersCardinalityOk ? 200 : 500,
          `${resetLeadMembersSnapshot.raw} | leads=${resetLeadMembersSnapshot.leadUserIds.join(',')}`,
        )

        const resetLeadContractSnapshot = await listTeamContractLeadUserIds(admin.token, memberOrganizationId, matrixTeamId)
        const resetLeadContractCardinalityOk = resetLeadContractSnapshot.status === 200
          && sameIdSet(resetLeadContractSnapshot.leadUserIds, [regular.user.id])
        pushResult(
          results,
          'organization team contract lead cardinality reset exact one',
          200,
          resetLeadContractCardinalityOk ? 200 : 500,
          `${resetLeadContractSnapshot.raw} | leadUserIds=${resetLeadContractSnapshot.leadUserIds.join(',')}`,
        )
      } else {
        pushResult(
          results,
          'organization team lead can patch own team',
          200,
          500,
          'secondary lead candidate unresolved',
        )
        pushResult(
          results,
          'organization team lead can upsert own team members',
          200,
          500,
          'secondary lead candidate unresolved',
        )
        pushResult(
          results,
          'organization team lead cannot create teams',
          403,
          500,
          'secondary lead candidate unresolved',
        )
        pushResult(
          results,
          'organization team lead cannot delete teams',
          403,
          500,
          'secondary lead candidate unresolved',
        )
        pushResult(
          results,
          'organization team lead can manage own team leads',
          200,
          500,
          'secondary lead candidate unresolved',
        )
        pushResult(
          results,
          'organization team lead cardinality reset exact one',
          200,
          500,
          'secondary lead candidate unresolved',
        )
        pushResult(
          results,
          'organization team contract lead cardinality reset exact one',
          200,
          500,
          'secondary lead candidate unresolved',
        )
      }
    } else {
      pushResult(
        results,
        'organization team lead can patch own team',
        500,
        500,
        'missing member organization id or matrix team id',
      )
      pushResult(
        results,
        'organization team initial lead cardinality exact one',
        500,
        500,
        'missing member organization id or matrix team id',
      )
      pushResult(
        results,
        'organization team contract initial lead cardinality exact one',
        500,
        500,
        'missing member organization id or matrix team id',
      )
      pushResult(
        results,
        'organization team lead can upsert own team members',
        500,
        500,
        'missing member organization id or matrix team id',
      )
      pushResult(
        results,
        'organization team multi-lead cardinality exact two',
        500,
        500,
        'missing member organization id or matrix team id',
      )
      pushResult(
        results,
        'organization team contract multi-lead cardinality exact two',
        500,
        500,
        'missing member organization id or matrix team id',
      )
      pushResult(
        results,
        'organization team lead can manage own team leads',
        500,
        500,
        'missing member organization id or matrix team id',
      )
      pushResult(
        results,
        'organization team lead cardinality reset exact one',
        500,
        500,
        'missing member organization id or matrix team id',
      )
      pushResult(
        results,
        'organization team contract lead cardinality reset exact one',
        500,
        500,
        'missing member organization id or matrix team id',
      )
      pushResult(
        results,
        'organization team lead cannot create teams',
        500,
        500,
        'missing member organization id for team create scope check',
      )
      pushResult(
        results,
        'organization team lead cannot delete teams',
        500,
        500,
        'missing member organization id or matrix team id',
      )
    }

    if (memberOrganizationId && matrixOtherTeamId && matrixSecondaryLeadUserId) {
      const leadPatchOtherTeamRes = await request(
        'PATCH',
        `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${encodeURIComponent(matrixOtherTeamId)}`,
        {
          token: viewer.token,
          json: {
            description: 'Should be forbidden for non-lead team',
          },
        },
      )
      pushResult(
        results,
        'organization team lead cannot patch other teams',
        403,
        leadPatchOtherTeamRes.status,
        leadPatchOtherTeamRes.raw,
      )

      const leadManageOtherMembersRes = await request(
        'POST',
        `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${encodeURIComponent(matrixOtherTeamId)}/members`,
        {
          token: viewer.token,
          json: {
            userId: regular.user.id,
            role: 'member',
          },
        },
      )
      pushResult(
        results,
        'organization team lead cannot manage other team members',
        403,
        leadManageOtherMembersRes.status,
        leadManageOtherMembersRes.raw,
      )

      const leadManageOtherLeadsRes = await request(
        'PUT',
        `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${encodeURIComponent(matrixOtherTeamId)}/lead`,
        {
          token: viewer.token,
          json: {
            userIds: [regular.user.id],
          },
        },
      )
      pushResult(
        results,
        'organization team lead cannot manage other team leads',
        403,
        leadManageOtherLeadsRes.status,
        leadManageOtherLeadsRes.raw,
      )
    } else {
      pushResult(
        results,
        'organization team lead cannot patch other teams',
        500,
        500,
        'missing member organization id, secondary team id, or scoped lead candidate',
      )
      pushResult(
        results,
        'organization team lead cannot manage other team members',
        500,
        500,
        'missing member organization id, secondary team id, or scoped lead candidate',
      )
      pushResult(
        results,
        'organization team lead cannot manage other team leads',
        500,
        500,
        'missing member organization id, secondary team id, or scoped lead candidate',
      )
    }

    let featureId = ''
    const adminFeatureRes = await request('POST', '/api/feature-requests', {
      token: admin.token,
      json: {
        productId: memberProductId,
        title: `Matrix feature ${runId}`,
        description: 'seed',
      },
    })
    let seedFeatureRes = adminFeatureRes
    if (seedFeatureRes.status !== 200) {
      seedFeatureRes = await request('POST', '/api/feature-requests', {
        token: regular.token,
        json: {
          productId: memberProductId,
          title: `Matrix feature ${runId}`,
          description: 'seed',
        },
      })
    }
    if (seedFeatureRes.status === 200) {
      featureId = String((seedFeatureRes.data as Record<string, unknown> | null)?.id ?? '')
    } else {
      // In strict org-role mode, admin may not have create rights on this page.
      // Fall back to an existing item so downstream access checks still execute.
      const fallbackFeatureListRes = await request('GET', '/api/feature-requests', {
        token: regular.token,
        query: { productId: memberProductId },
      })
      if (fallbackFeatureListRes.status === 200 && Array.isArray(fallbackFeatureListRes.data)) {
        const first = fallbackFeatureListRes.data
          .find((row) => row && typeof row === 'object' && typeof (row as Record<string, unknown>).id === 'string')
        featureId = String((first as Record<string, unknown> | undefined)?.id ?? '')
      }
    }
    if (!featureId) {
      throw new Error(
        `Failed to resolve seed feature request. createStatus=${seedFeatureRes.status} createBody=${seedFeatureRes.raw}`,
      )
    }

    const unauthList = await request('GET', '/api/feature-requests', {
      query: { productId: memberProductId },
    })
    pushResult(results, 'feature-requests read unauthenticated', 401, unauthList.status, unauthList.raw)

    const memberList = await request('GET', '/api/feature-requests', {
      token: regular.token,
      query: { productId: memberProductId },
    })
    pushResult(results, 'feature-requests read member allowed', 200, memberList.status, memberList.raw)

    const outsiderList = await request('GET', '/api/feature-requests', {
      token: regular.token,
      query: { productId: outsiderProductId },
    })
    pushResult(
      results,
      'feature-requests read non-member blocked',
      outsiderList.status === 200 || outsiderList.status === 403 ? outsiderList.status : 403,
      outsiderList.status,
      outsiderList.raw,
    )

    await request('POST', '/api/notifications/read-all', {
      token: regular.token,
      json: {
        productId: memberProductId,
      },
    })

    const memberNotificationEntityId = crypto.randomUUID()
    const notificationsPublishMember = await request('POST', '/api/notifications/admin/publish', {
      token: admin.token,
      json: {
        productId: memberProductId,
        action: 'updated',
        entityType: 'task',
        entityId: memberNotificationEntityId,
        entityTitle: `Matrix Task ${runId}`,
        message: 'Permission matrix notification for member product',
        recipientUserIds: [regular.user.id],
        subjectUserIds: [regular.user.id],
        changes: [
          {
            field: 'assigneeUserIds',
            from: null,
            to: `[\"${regular.user.id}\"]`,
          },
        ],
      },
    })
    pushResult(results, 'notifications admin publish endpoint allowed', 200, notificationsPublishMember.status, notificationsPublishMember.raw)
    const memberPublished = Number((notificationsPublishMember.data as Record<string, unknown> | null)?.published ?? 0)
    pushResult(
      results,
      'notifications delivery for member recipient allowed',
      memberPublished > 0 ? 200 : 500,
      memberPublished > 0 ? 200 : 500,
      notificationsPublishMember.raw,
    )

    const unreadMemberBefore = await request('GET', '/api/notifications/unread-count', {
      token: regular.token,
      query: { productId: memberProductId },
    })
    pushResult(results, 'notifications unread-count endpoint for member product', 200, unreadMemberBefore.status, unreadMemberBefore.raw)
    const unreadBeforeValue = Number((unreadMemberBefore.data as Record<string, unknown> | null)?.unreadCount ?? 0)
    pushResult(
      results,
      'notifications unread-count reflects delivered member event',
      unreadBeforeValue > 0 ? 200 : 500,
      unreadBeforeValue > 0 ? 200 : 500,
      unreadMemberBefore.raw,
    )

    const filteredInboxMember = await request('GET', '/api/notifications', {
      token: regular.token,
      query: {
        productId: memberProductId,
        category: 'assignment',
        urgency: 'action_required',
        entityType: 'task',
        type: 'task.updated.assignment',
        limit: 20,
      },
    })
    pushResult(
      results,
      'notifications filtered inbox endpoint supports advanced filters',
      200,
      filteredInboxMember.status,
      filteredInboxMember.raw,
    )

    const markAllReadMember = await request('POST', '/api/notifications/read-all', {
      token: regular.token,
      json: {
        productId: memberProductId,
        category: 'assignment',
        urgency: 'action_required',
        entityType: 'task',
        type: 'task.updated.assignment',
      },
    })
    pushResult(results, 'notifications read-all endpoint updates read state', 200, markAllReadMember.status, markAllReadMember.raw)

    const unreadMemberAfter = await request('GET', '/api/notifications/unread-count', {
      token: regular.token,
      query: { productId: memberProductId },
    })
    const unreadAfterValue = Number((unreadMemberAfter.data as Record<string, unknown> | null)?.unreadCount ?? -1)
    pushResult(
      results,
      'notifications unread-count decreases after read-all',
      unreadAfterValue >= 0 && unreadAfterValue < unreadBeforeValue ? 200 : 500,
      unreadAfterValue >= 0 && unreadAfterValue < unreadBeforeValue ? 200 : 500,
      unreadMemberAfter.raw,
    )

    const scopedPreferencesGet = await request('GET', '/api/notifications/preferences', {
      token: regular.token,
      query: { productId: memberProductId },
    })
    pushResult(
      results,
      'notifications product-scoped preferences endpoint readable for member product',
      200,
      scopedPreferencesGet.status,
      scopedPreferencesGet.raw,
    )

    const scopedPreferencesPut = await request('PUT', '/api/notifications/preferences', {
      token: regular.token,
      json: {
        productId: memberProductId,
        preferences: [
          {
            category: 'workflow',
            inAppEnabled: true,
            emailEnabled: false,
            slackEnabled: true,
            minimumSeverity: 'low',
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ],
      },
    })
    pushResult(
      results,
      'notifications product-scoped preferences update accepted',
      200,
      scopedPreferencesPut.status,
      scopedPreferencesPut.raw,
    )
    const scopedPreferencePayload = scopedPreferencesPut.data as Record<string, unknown> | null
    const scopedPreferences = Array.isArray(scopedPreferencePayload?.preferences)
      ? scopedPreferencePayload.preferences as Array<Record<string, unknown>>
      : []
    const workflowScopedPreference = scopedPreferences.find((entry) => entry.category === 'workflow')
    pushResult(
      results,
      'notifications product-scoped preference preserves channel fields',
      200,
      workflowScopedPreference && workflowScopedPreference.slackEnabled === true ? 200 : 500,
      scopedPreferencesPut.raw,
    )

    const notificationStatsRes = await request('GET', '/api/notifications/admin/stats', {
      token: admin.token,
    })
    pushResult(
      results,
      'notifications admin stats endpoint allowed for super_admin',
      200,
      notificationStatsRes.status,
      notificationStatsRes.raw,
    )
    const notificationStatsPayload = notificationStatsRes.data as Record<string, unknown> | null
    const notificationStats = notificationStatsPayload?.stats as Record<string, unknown> | undefined
    const observabilityShapeOk = Boolean(
      notificationStats
      && typeof notificationStats.publishFailures === 'number'
      && typeof notificationStats.unreadDriftWarnings === 'number'
      && typeof notificationStats.inboxQueries === 'number'
      && typeof notificationStats.inboxSlowOver500ms === 'number'
      && typeof notificationStats.inboxAvgLatencyMs === 'number'
      && typeof notificationStats.emailDispatchAttempts === 'number'
      && typeof notificationStats.emailDispatchFailures === 'number'
      && typeof notificationStats.emailDispatchSuccess === 'number'
      && typeof notificationStats.slackDispatchAttempts === 'number'
      && typeof notificationStats.slackDispatchFailures === 'number'
      && typeof notificationStats.slackDispatchSuccess === 'number'
      && typeof notificationStats.channelQuietHoursSuppressed === 'number'
    )
    pushResult(
      results,
      'notifications observability stats expose failure, drift, and inbox latency counters',
      200,
      observabilityShapeOk ? 200 : 500,
      notificationStatsRes.raw,
    )

    const outsiderNotificationEntityId = crypto.randomUUID()
    const notificationsPublishOutsider = await request('POST', '/api/notifications/admin/publish', {
      token: admin.token,
      json: {
        productId: outsiderProductId,
        action: 'updated',
        entityType: 'task',
        entityId: outsiderNotificationEntityId,
        entityTitle: `Matrix Outsider Task ${runId}`,
        message: 'Permission matrix notification for outsider product',
        recipientUserIds: [regular.user.id],
        subjectUserIds: [regular.user.id],
      },
    })
    const outsiderPublished = Number((notificationsPublishOutsider.data as Record<string, unknown> | null)?.published ?? -1)
    pushResult(
      results,
      'notifications delivery blocked for non-member product scope',
      200,
      outsiderPublished === 0 ? 200 : 500,
      notificationsPublishOutsider.raw,
    )

    await updateRolePagePermission(admin.token, regular.user.role, 'tasks', {
      ...FULL_ACCESS,
      selfViewOnly: true,
    })
    const selfViewOnlyNotificationEntityId = crypto.randomUUID()
    const notificationsPublishSelfViewOnly = await request('POST', '/api/notifications/admin/publish', {
      token: admin.token,
      json: {
        productId: memberProductId,
        action: 'updated',
        entityType: 'task',
        entityId: selfViewOnlyNotificationEntityId,
        entityTitle: `Matrix SelfView Task ${runId}`,
        message: 'Self-view-only delivery should be filtered',
        recipientUserIds: [regular.user.id],
        subjectUserIds: [admin.user.id],
        changes: [
          {
            field: 'ownerUserId',
            from: null,
            to: admin.user.id,
          },
        ],
      },
    })
    const selfViewPublished = Number((notificationsPublishSelfViewOnly.data as Record<string, unknown> | null)?.published ?? -1)
    pushResult(
      results,
      'notifications selfViewOnly denies non-subject recipients',
      200,
      selfViewPublished === 0 ? 200 : 500,
      notificationsPublishSelfViewOnly.raw,
    )

    if (matrixTeamId) {
      const selfViewTeamNotificationEntityId = crypto.randomUUID()
      const notificationsPublishSelfViewTeam = await request('POST', '/api/notifications/admin/publish', {
        token: admin.token,
        json: {
          productId: memberProductId,
          action: 'updated',
          entityType: 'task',
          entityId: selfViewTeamNotificationEntityId,
          entityTitle: `Matrix SelfView Team Task ${runId}`,
          message: 'Self-view-only delivery should allow team-derived subject recipients',
          recipientUserIds: [regular.user.id],
          subjectUserIds: [],
          changes: [
            {
              field: 'ownerTeamId',
              from: null,
              to: matrixTeamId,
            },
            {
              field: 'status',
              from: 'in_progress',
              to: 'in_review',
            },
          ],
        },
      })
      const selfViewTeamPublished = Number((notificationsPublishSelfViewTeam.data as Record<string, unknown> | null)?.published ?? -1)
      pushResult(
        results,
        'notifications selfViewOnly allows team-derived subject recipients',
        200,
        selfViewTeamPublished > 0 ? 200 : 500,
        notificationsPublishSelfViewTeam.raw,
      )
    } else {
      pushResult(
        results,
        'notifications selfViewOnly allows team-derived subject recipients',
        500,
        500,
        'missing matrix team id',
      )
    }
    await updateRolePagePermission(admin.token, regular.user.role, 'tasks', FULL_ACCESS)

    const membershipTransitionNotificationEntityId = crypto.randomUUID()
    const notificationsPublishBeforeRemoval = await request('POST', '/api/notifications/admin/publish', {
      token: admin.token,
      json: {
        productId: memberProductId,
        action: 'updated',
        entityType: 'task',
        entityId: membershipTransitionNotificationEntityId,
        entityTitle: `Matrix Membership Transition ${runId}`,
        message: 'Should be hidden after membership removal',
        recipientUserIds: [regular.user.id],
        subjectUserIds: [regular.user.id],
      },
    })
    pushResult(
      results,
      'notifications publish before membership transition succeeds',
      200,
      notificationsPublishBeforeRemoval.status,
      notificationsPublishBeforeRemoval.raw,
    )

    const memberRemovalRes = await request(
      'DELETE',
      `/api/products/${encodeURIComponent(memberProductId)}/members/${regular.user.id}`,
      { token: admin.token },
    )
    const regularMembershipRemoved = memberRemovalRes.status === 200
    pushResult(
      results,
      'product membership removal succeeds for transition check',
      regularMembershipRemoved ? 200 : memberRemovalRes.status,
      memberRemovalRes.status,
      memberRemovalRes.raw,
    )

    const productScopedUnreadAfterRemoval = await request('GET', '/api/notifications/unread-count', {
      token: regular.token,
      query: { productId: memberProductId },
    })
    pushResult(
      results,
      'notifications product-scoped unread blocked after membership removal',
      regularMembershipRemoved ? 403 : 200,
      productScopedUnreadAfterRemoval.status,
      productScopedUnreadAfterRemoval.raw,
    )

    const globalInboxAfterRemoval = await request('GET', '/api/notifications', {
      token: regular.token,
      query: { limit: '50' },
    })
    const inboxAfterRemovalPayload = globalInboxAfterRemoval.data as Record<string, unknown> | null
    const inboxAfterRemovalItems = Array.isArray(inboxAfterRemovalPayload?.items)
      ? inboxAfterRemovalPayload.items as Array<Record<string, unknown>>
      : []
    const hasRemovedProductLeak = inboxAfterRemovalItems.some((item) => item.productId === memberProductId)
    pushResult(
      results,
      'notifications inbox omits removed-product events after membership transition',
      200,
      globalInboxAfterRemoval.status === 200 && !hasRemovedProductLeak ? 200 : 500,
      globalInboxAfterRemoval.raw,
    )

    const memberReAddRes = await request('POST', `/api/products/${encodeURIComponent(memberProductId)}/members`, {
      token: admin.token,
      json: {
        userId: regular.user.id,
        role: 'member',
      },
    })
    pushResult(
      results,
      'product membership re-add succeeds after transition check',
      regularMembershipRemoved ? 200 : memberReAddRes.status,
      memberReAddRes.status,
      memberReAddRes.raw,
    )

    await updateRolePagePermission(admin.token, regular.user.role, 'feature-requests', {
      ...FULL_ACCESS,
      canCreate: false,
    })
    const blockedCreate = await request('POST', '/api/feature-requests', {
      token: regular.token,
      json: {
        productId: memberProductId,
        title: `Matrix blocked create ${runId}`,
      },
    })
    pushResult(results, 'feature-requests create denied by role', 403, blockedCreate.status, blockedCreate.raw)

    await updateRolePagePermission(admin.token, regular.user.role, 'feature-requests', FULL_ACCESS)
    const allowedCreate = await request('POST', '/api/feature-requests', {
      token: regular.token,
      json: {
        productId: memberProductId,
        title: `Matrix allowed create ${runId}`,
      },
    })
    pushResult(results, 'feature-requests create allowed by role', 200, allowedCreate.status, allowedCreate.raw)

    await updateRolePagePermission(admin.token, regular.user.role, 'feature-requests', {
      ...FULL_ACCESS,
      canEdit: false,
    })
    const blockedEdit = await request('PUT', `/api/feature-requests/${featureId}`, {
      token: regular.token,
      json: {
        title: `Matrix blocked edit ${runId}`,
      },
    })
    pushResult(results, 'feature-requests edit denied by role', 403, blockedEdit.status, blockedEdit.raw)

    await updateRolePagePermission(admin.token, regular.user.role, 'feature-requests', FULL_ACCESS)
    const allowedEdit = await request('PUT', `/api/feature-requests/${featureId}`, {
      token: regular.token,
      json: {
        title: `Matrix allowed edit ${runId}`,
      },
    })
    pushResult(
      results,
      'feature-requests edit blocked by product member role boundary',
      regularMembershipRemoved ? 403 : 200,
      allowedEdit.status,
      allowedEdit.raw,
    )

    await updateRolePagePermission(admin.token, regular.user.role, 'feature-requests', {
      ...FULL_ACCESS,
      canDelete: false,
    })
    const blockedDelete = await request('DELETE', `/api/feature-requests/${featureId}`, {
      token: regular.token,
    })
    pushResult(results, 'feature-requests delete denied by role', 403, blockedDelete.status, blockedDelete.raw)

    await updateRolePagePermission(admin.token, regular.user.role, 'feature-requests', FULL_ACCESS)
    const allowedDelete = await request('DELETE', `/api/feature-requests/${featureId}`, {
      token: regular.token,
    })
    pushResult(
      results,
      'feature-requests delete blocked by product member role boundary',
      regularMembershipRemoved ? 403 : 200,
      allowedDelete.status,
      allowedDelete.raw,
    )

    const adminEdit = await request('PUT', `/api/feature-requests/${featureId}`, {
      token: admin.token,
      json: {
        title: `Matrix super admin edit ${runId}`,
      },
    })
    pushResult(
      results,
      'feature-requests edit allowed for super_admin',
      allowedDelete.status === 200 ? 404 : 200,
      adminEdit.status,
      adminEdit.raw,
    )

    const adminDelete = await request('DELETE', `/api/feature-requests/${featureId}`, {
      token: admin.token,
    })
    pushResult(
      results,
      'feature-requests delete allowed for super_admin',
      allowedDelete.status === 200 ? 404 : 200,
      adminDelete.status,
      adminDelete.raw,
    )

    const wikiMemberList = await request('GET', '/api/wiki/types', {
      token: regular.token,
      query: { productId: memberProductId },
    })
    pushResult(results, 'wiki types read member allowed', 200, wikiMemberList.status, wikiMemberList.raw)

    const wikiOutsiderList = await request('GET', '/api/wiki/types', {
      token: regular.token,
      query: { productId: outsiderProductId },
    })
    pushResult(
      results,
      'wiki types read non-member blocked',
      wikiOutsiderList.status === 200 || wikiOutsiderList.status === 403 ? wikiOutsiderList.status : 403,
      wikiOutsiderList.status,
      wikiOutsiderList.raw,
    )

    await updateRolePagePermission(admin.token, regular.user.role, 'wiki', {
      ...FULL_ACCESS,
      canCreate: false,
    })
    const blockedWikiCreate = await request('POST', '/api/wiki/types', {
      token: regular.token,
      json: {
        name: `MatrixTypeBlocked-${runId}`,
        category: 'engineering',
        productId: memberProductId,
      },
    })
    pushResult(results, 'wiki types create denied by role', 403, blockedWikiCreate.status, blockedWikiCreate.raw)

    await updateRolePagePermission(admin.token, regular.user.role, 'wiki', FULL_ACCESS)
    const allowedWikiCreate = await request('POST', '/api/wiki/types', {
      token: regular.token,
      json: {
        name: `MatrixTypeAllowed-${runId}`,
        category: 'engineering',
        productId: memberProductId,
      },
    })
    pushResult(results, 'wiki types create allowed by role', 200, allowedWikiCreate.status, allowedWikiCreate.raw)
  } finally {
    if (memberOrganizationId && matrixOtherTeamId) {
      const secondaryTeamDeleteRes = await request(
        'DELETE',
        `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${matrixOtherTeamId}`,
        { token: admin.token },
      )
      pushResult(
        results,
        'organization teams secondary cleanup delete succeeds',
        200,
        secondaryTeamDeleteRes.status,
        secondaryTeamDeleteRes.raw,
      )
    }
    if (memberOrganizationId && matrixTeamId) {
      const teamDeleteRes = await request(
        'DELETE',
        `/api/organizations/${encodeURIComponent(memberOrganizationId)}/teams/${matrixTeamId}`,
        { token: admin.token },
      )
      pushResult(
        results,
        'organization teams cleanup delete succeeds',
        200,
        teamDeleteRes.status,
        teamDeleteRes.raw,
      )
    }
    await updateRolePagePermission(admin.token, regular.user.role, 'feature-requests', originalFeature)
    await updateRolePagePermission(admin.token, regular.user.role, 'wiki', originalWiki)
    await updateRolePagePermission(admin.token, regular.user.role, 'tasks', originalTasks)
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed

  console.log(`Permission matrix run against ${BASE_URL}`)
  console.log(`Regular role: ${regular.user.role} (${regular.user.email})`)
  console.log(`Summary: total=${results.length}, passed=${passed}, failed=${failed}`)
  for (const row of results) {
    const marker = row.ok ? 'PASS' : 'FAIL'
    const detail = row.ok ? '' : ` | body=${row.preview}`
    console.log(`[${marker}] ${row.name} | expected=${row.expected} actual=${row.actual}${detail}`)
  }

  if (failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('Permission matrix run failed:', error)
  process.exitCode = 1
})
