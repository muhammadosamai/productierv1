import { sql } from 'drizzle-orm'
import { db } from '../db'

export interface MetricsCacheKey {
  endpoint: string
  productId: string
  period?: number
  granularity?: string | null
  extra?: Record<string, string | number | boolean | null | undefined>
}

interface MetricsCacheRecord {
  payload: unknown
  expiresAt: Date
}

function applyCacheMeta<T>(payload: T, computedAt: Date, expiresAt: Date): T {
  if (!payload || typeof payload !== 'object') return payload
  const root = payload as Record<string, unknown>
  const meta = root.meta
  if (!meta || typeof meta !== 'object') return payload

  const nowMs = Date.now()
  const computedMs = computedAt.getTime()
  const expiresMs = expiresAt.getTime()
  if (!Number.isFinite(computedMs) || !Number.isFinite(expiresMs)) return payload

  const cacheAge = Math.max(0, Math.round((nowMs - computedMs) / 1000))
  const derivedTtl = Math.max(0, Math.round((expiresMs - computedMs) / 1000))
  const merged = {
    ...root,
    meta: {
      ...(meta as Record<string, unknown>),
      cacheAge,
      cacheTtl: (meta as Record<string, unknown>).cacheTtl ?? derivedTtl,
    },
  }
  return merged as T
}

function normalizeExtra(extra: MetricsCacheKey['extra']): Record<string, string> {
  if (!extra) return {}
  const normalized: Record<string, string> = {}
  const keys = Object.keys(extra).sort()
  for (const key of keys) {
    const value = extra[key]
    if (value === undefined || value === null) continue
    normalized[key] = String(value)
  }
  return normalized
}

function cacheKeyFrom(input: MetricsCacheKey): string {
  const stable = {
    endpoint: input.endpoint,
    productId: input.productId,
    period: input.period ?? null,
    granularity: input.granularity ?? null,
    extra: normalizeExtra(input.extra),
  }
  return Buffer.from(JSON.stringify(stable), 'utf8').toString('base64url')
}

function isCacheEnabled(): boolean {
  const raw = process.env.METRICS_CACHE_ENABLED
  if (!raw) return true
  const normalized = raw.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function toStructuredError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    }
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') payload.code = code
    return payload
  }
  return { message: String(error) }
}

function logMetricsCacheFailure(
  operation: 'read' | 'write' | 'invalidate',
  context: Record<string, unknown>,
  error: unknown,
): void {
  console.warn('[metrics-cache] operation failed; falling back to uncached behavior.', {
    operation,
    ...context,
    error: toStructuredError(error),
  })
}

export async function getCachedMetrics<T>(input: MetricsCacheKey): Promise<T | null> {
  if (!isCacheEnabled()) return null
  const cacheKey = cacheKeyFrom(input)
  try {
    const rows = await db.execute(sql`
      select payload, expires_at, computed_at
      from metrics_snapshots
      where cache_key = ${cacheKey}
        and invalidated = false
      limit 1
    `)
    const row = rows[0] as {
      payload: T
      expires_at: string | Date
      computed_at: string | Date
    } | undefined
    if (!row) return null
    const expiresAt = new Date(row.expires_at)
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null
    const computedAt = new Date(row.computed_at)
    return applyCacheMeta(row.payload, computedAt, expiresAt)
  } catch (error) {
    logMetricsCacheFailure('read', {
      endpoint: input.endpoint,
      productId: input.productId,
      cacheKey,
    }, error)
    return null
  }
}

export async function setCachedMetrics<T>(
  input: MetricsCacheKey,
  payload: T,
  ttlSeconds: number,
): Promise<void> {
  if (!isCacheEnabled()) return
  const cacheKey = cacheKeyFrom(input)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
  try {
    await db.execute(sql`
      insert into metrics_snapshots (
        endpoint,
        product_id,
        period,
        granularity,
        cache_key,
        payload,
        computed_at,
        expires_at,
        invalidated
      ) values (
        ${input.endpoint},
        ${input.productId},
        ${input.period ?? null},
        ${input.granularity ?? null},
        ${cacheKey},
        ${JSON.stringify(payload)}::jsonb,
        ${now.toISOString()}::timestamptz,
        ${expiresAt.toISOString()}::timestamptz,
        false
      )
      on conflict (cache_key)
      do update set
        payload = excluded.payload,
        computed_at = excluded.computed_at,
        expires_at = excluded.expires_at,
        invalidated = false
    `)
  } catch (error) {
    logMetricsCacheFailure('write', {
      endpoint: input.endpoint,
      productId: input.productId,
      cacheKey,
      ttlSeconds,
    }, error)
  }
}

export async function withMetricsCache<T>(
  input: MetricsCacheKey,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const cached = await getCachedMetrics<T>(input)
  if (cached !== null) return cached
  const computed = await compute()
  await setCachedMetrics(input, computed, ttlSeconds)
  return computed
}

export async function invalidateMetricsForProduct(productId: string): Promise<void> {
  if (!productId) return
  try {
    await db.execute(sql`
      update metrics_snapshots
      set invalidated = true
      where product_id = ${productId}
    `)
  } catch (error) {
    logMetricsCacheFailure('invalidate', { productId }, error)
  }
}

