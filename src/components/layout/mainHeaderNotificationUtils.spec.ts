import { describe, expect, it, vi } from 'vitest'
import {
  categoryLabel,
  emphasisBorderClass,
  formatRelativeTime,
  isSameLocalDay,
  severityClass,
  urgencyClass,
  urgencyLabel,
} from '@/components/layout/mainHeaderNotificationUtils'

describe('mainHeaderNotificationUtils', () => {
  it('maps category and urgency labels', () => {
    expect(categoryLabel('assignment')).toBe('Assignment')
    expect(categoryLabel('custom')).toBe('custom')
    expect(urgencyLabel('action_required')).toBe('Action required')
  })

  it('returns expected severity and urgency classes', () => {
    expect(severityClass('critical')).toContain('red')
    expect(urgencyClass('watch')).toContain('amber')
  })

  it('applies emphasis border based on urgency/severity', () => {
    expect(emphasisBorderClass({ urgency: 'action_required', severity: 'low' } as any)).toBe('border-l-red-400')
    expect(emphasisBorderClass({ urgency: 'informational', severity: 'high' } as any)).toBe('border-l-amber-300')
  })

  it('formats relative time and local-day checks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'))
    expect(formatRelativeTime('2026-03-30T11:59:00.000Z')).toBe('1m ago')
    expect(isSameLocalDay('2026-03-30T09:00:00', new Date('2026-03-30T23:00:00'))).toBe(true)
    vi.useRealTimers()
  })
})
