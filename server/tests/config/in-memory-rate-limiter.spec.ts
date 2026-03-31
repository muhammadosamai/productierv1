import { describe, expect, it, vi } from 'vitest'
import { consumeRateLimit, resolveClientAddress } from '../../src/lib/inMemoryRateLimiter'

describe('inMemoryRateLimiter', () => {
  it('blocks requests after max within window and allows after reset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const key = `test-rate-limit-${Date.now()}`
    const first = consumeRateLimit({ key, windowMs: 1_000, max: 2 })
    const second = consumeRateLimit({ key, windowMs: 1_000, max: 2 })
    const third = consumeRateLimit({ key, windowMs: 1_000, max: 2 })

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(false)
    expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(1)

    vi.advanceTimersByTime(1_001)
    const afterReset = consumeRateLimit({ key, windowMs: 1_000, max: 2 })
    expect(afterReset.allowed).toBe(true)

    vi.useRealTimers()
  })

  it('prefers forwarded header then x-real-ip', () => {
    const fromForwarded = resolveClientAddress({
      'x-forwarded-for': '203.0.113.9, 70.41.3.18',
      'x-real-ip': '198.51.100.10',
    })
    expect(fromForwarded).toBe('203.0.113.9')

    const fromRealIp = resolveClientAddress({
      'x-real-ip': '198.51.100.12',
    })
    expect(fromRealIp).toBe('198.51.100.12')

    const fallback = resolveClientAddress({})
    expect(fallback).toBe('unknown')
  })
})
