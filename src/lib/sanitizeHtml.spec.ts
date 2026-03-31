// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

describe('sanitizeHtml', () => {
  it('removes script tags and unsafe event handlers', () => {
    const raw = '<div onclick="alert(1)">ok</div><script>alert(2)</script>'
    const sanitized = sanitizeHtml(raw)
    expect(sanitized).toContain('<div>ok</div>')
    expect(sanitized).not.toContain('onclick')
    expect(sanitized).not.toContain('<script')
  })
})
