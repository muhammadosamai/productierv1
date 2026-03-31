type ApiQueryValue = string | number | boolean | null | undefined
type ApiQuery = Record<string, ApiQueryValue>

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  token?: string | null
  query?: ApiQuery
  json?: unknown
  body?: BodyInit | null
}

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

function resolveApiBaseUrl(): string {
  const candidate = (import.meta.env.VITE_API_BASE_URL || '/api').trim()
  if (!candidate) return '/api'
  return candidate.endsWith('/') ? candidate.slice(0, -1) : candidate
}

export const API_BASE_URL = resolveApiBaseUrl()

function trimApiPrefix(path: string): string {
  if (path === '/api') return '/'
  if (path.startsWith('/api/')) return path.slice(4)
  return path
}

function normalizePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return trimApiPrefix(normalized)
}

function appendQuery(url: string, query?: ApiQuery): string {
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    params.set(key, String(value))
  }
  const encoded = params.toString()
  if (!encoded) return url
  return `${url}${url.includes('?') ? '&' : '?'}${encoded}`
}

export function buildApiUrl(path: string, query?: ApiQuery): string {
  if (/^https?:\/\//i.test(path)) {
    return appendQuery(path, query)
  }
  const normalizedPath = normalizePath(path)
  return appendQuery(`${API_BASE_URL}${normalizedPath}`, query)
}

async function readPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }
  try {
    return await response.text()
  } catch {
    return null
  }
}

function payloadErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const errorValue = (payload as Record<string, unknown>).error
  if (typeof errorValue === 'string' && errorValue.trim()) return errorValue
  const messageValue = (payload as Record<string, unknown>).message
  if (typeof messageValue === 'string' && messageValue.trim()) return messageValue
  return null
}

export async function toApiError(response: Response): Promise<ApiError> {
  const payload = await readPayload(response)
  const message = payloadErrorMessage(payload) ?? `Request failed (${response.status})`
  return new ApiError(response.status, message, payload)
}

export async function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const {
    token,
    query,
    json,
    body,
    headers: providedHeaders,
    ...init
  } = options

  const headers = new Headers(providedHeaders ?? {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let requestBody: BodyInit | null | undefined = body
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    requestBody = JSON.stringify(json)
  }

  return fetch(buildApiUrl(path, query), {
    ...init,
    headers,
    body: requestBody,
  })
}

export async function apiJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options)
  if (!response.ok) {
    throw await toApiError(response)
  }
  return await response.json() as T
}
