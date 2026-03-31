interface RateLimitBucket {
  count: number
  resetAt: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

const rateLimitBuckets = new Map<string, RateLimitBucket>()

function cleanupBuckets(now: number) {
  if (rateLimitBuckets.size < 5000) return
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key)
    }
  }
}

export function consumeRateLimit(input: {
  key: string
  windowMs: number
  max: number
}): RateLimitResult {
  const now = Date.now()
  cleanupBuckets(now)

  const windowMs = Math.max(1, input.windowMs)
  const max = Math.max(1, input.max)
  const existing = rateLimitBuckets.get(input.key)
  const bucket = (!existing || existing.resetAt <= now)
    ? { count: 0, resetAt: now + windowMs }
    : existing

  if (bucket.count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    return {
      allowed: false,
      retryAfterSeconds,
      remaining: 0,
    }
  }

  bucket.count += 1
  rateLimitBuckets.set(input.key, bucket)

  return {
    allowed: true,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    remaining: Math.max(0, max - bucket.count),
  }
}

export function resolveClientAddress(headers: Record<string, string | undefined>): string {
  const forwarded = headers['x-forwarded-for']
    ?.split(',')
    .map((value) => value.trim())
    .find((value) => value.length > 0)
  if (forwarded) return forwarded
  const realIp = headers['x-real-ip']?.trim()
  if (realIp) return realIp
  return 'unknown'
}
