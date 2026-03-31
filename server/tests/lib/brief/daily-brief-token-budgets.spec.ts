import { describe, expect, it } from 'vitest'
import { resolvePrimaryBriefMaxTokens, resolveRetryBriefMaxTokens } from '../../../src/lib/brief/dailyBrief'

describe('daily brief token budgets', () => {
  it('applies a chunked GPT-5 floor for primary requests', () => {
    expect(resolvePrimaryBriefMaxTokens('summary', 500, 'gpt-5.4-mini', 'chunked')).toBe(1200)
    expect(resolvePrimaryBriefMaxTokens('full', 900, 'gpt-5.4-mini', 'chunked')).toBe(1600)
  })

  it('preserves configured primary max tokens for non-chunked or non-gpt-5 requests', () => {
    expect(resolvePrimaryBriefMaxTokens('summary', 500, 'gpt-5.4-mini', 'single')).toBe(500)
    expect(resolvePrimaryBriefMaxTokens('summary', 500, 'gpt-4.1-mini', 'chunked')).toBe(500)
  })

  it('applies higher retry floors for chunked GPT-5 requests', () => {
    expect(resolveRetryBriefMaxTokens('summary', 500, 'gpt-5.4-mini', 'chunked')).toBe(1400)
    expect(resolveRetryBriefMaxTokens('full', 900, 'gpt-5.4-mini', 'chunked')).toBe(1800)
  })

  it('keeps existing retry floor behavior for non-chunked GPT-5 requests', () => {
    expect(resolveRetryBriefMaxTokens('summary', 500, 'gpt-5.4-mini', 'single')).toBe(900)
    expect(resolveRetryBriefMaxTokens('full', 1000, 'gpt-5.4-mini', 'single')).toBe(1200)
  })
})
