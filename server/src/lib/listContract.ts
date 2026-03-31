export type SortDirection = 'asc' | 'desc'

export interface ParsedSort<TField extends string> {
  field: TField
  direction: SortDirection
  raw: string
}

export interface ParsedListQuery {
  limit: number
  cursor: string | null
  q: string | null
  sort: string | null
  paged: boolean
}

export interface ListEnvelope<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
  totalApprox?: number
}

export interface CursorPayload {
  createdAt: string
  id: string
}

interface ParseListQueryOptions {
  defaultLimit?: number
  maxLimit?: number
}

const DEFAULT_LIMIT = 50
const DEFAULT_MAX_LIMIT = 100

function isPagedListRolloutEnabled(): boolean {
  const raw = process.env.LIST_PAGING_ROLLOUT ?? process.env.SCALABILITY_LIST_PAGING_ROLLOUT
  if (!raw) return true
  const normalized = raw.trim().toLowerCase()
  return !(
    normalized === '0'
    || normalized === 'false'
    || normalized === 'off'
    || normalized === 'disabled'
    || normalized === 'rollback'
  )
}

function parseIntSafe(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseBooleanSafe(value: unknown): boolean | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  return null
}

function parseText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseListQuery(
  query: Record<string, unknown>,
  options: ParseListQueryOptions = {},
): ParsedListQuery {
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT
  const maxLimit = options.maxLimit ?? DEFAULT_MAX_LIMIT

  const limitValue = parseIntSafe(query.limit)
  const clampedLimit = Math.max(1, Math.min(limitValue ?? defaultLimit, maxLimit))
  const cursor = parseText(query.cursor)
  const q = parseText(query.q)
  const sort = parseText(query.sort)
  const explicitPaged = parseBooleanSafe(query.paged)
  const rolloutEnabled = isPagedListRolloutEnabled()

  // Keep backward compatibility for legacy endpoints that already use q.
  // Paging mode should only auto-enable when paging-specific params are provided.
  const hasListParams = limitValue !== null || cursor !== null
  const paged = rolloutEnabled ? (explicitPaged ?? hasListParams) : false

  return {
    limit: clampedLimit,
    cursor,
    q,
    sort,
    paged,
  }
}

export function parseSort<TField extends string>(
  rawSort: string | null,
  allowedFields: readonly TField[],
  fallback: ParsedSort<TField>,
): ParsedSort<TField> {
  if (!rawSort) return fallback
  const [rawField, rawDirection] = rawSort.split(':')
  const field = (rawField || '').trim() as TField
  if (!allowedFields.includes(field)) return fallback

  const direction = rawDirection?.trim().toLowerCase() === 'asc' ? 'asc' : 'desc'
  return { field, direction, raw: `${field}:${direction}` }
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload)
  return Buffer.from(json, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded) as Partial<CursorPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') return null
    return {
      id: parsed.id,
      createdAt: parsed.createdAt,
    }
  } catch {
    return null
  }
}

export function toListEnvelope<T>(params: {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
  totalApprox?: number
}): ListEnvelope<T> {
  return {
    items: params.items,
    nextCursor: params.nextCursor,
    hasMore: params.hasMore,
    ...(typeof params.totalApprox === 'number' ? { totalApprox: params.totalApprox } : {}),
  }
}

export function isLegacyListMode(parsed: ParsedListQuery): boolean {
  return !parsed.paged
}

