import { describe, expect, it, vi } from 'vitest'
import {
  daysAgo,
  deliveryProgressColor,
  formatPeriod,
  formatTimelineRange,
  priorityCircleColor,
  priorityNumber,
  ratioPercent,
} from '@/views/initiativeViewUtils'

describe('initiativeViewUtils', () => {
  it('computes ratios and progress styles', () => {
    expect(ratioPercent(5, 10)).toBe(50)
    expect(ratioPercent(1, 0)).toBe(0)
    expect(deliveryProgressColor(90)).toBe('bg-green-500')
    expect(deliveryProgressColor(10)).toBe('bg-gray-300')
  })

  it('maps priority levels to ordering and colors', () => {
    expect(priorityNumber('critical')).toBe(1)
    expect(priorityNumber('low')).toBe(4)
    expect(priorityCircleColor('critical')).toContain('e2445c')
  })

  it('formats timeline output consistently', () => {
    expect(formatTimelineRange('2026-03-01T00:00:00.000Z', '2026-03-10T00:00:00.000Z')).toContain('2026')
    expect(formatTimelineRange(null, null)).toBe('No dates')
    expect(formatPeriod(null, '2026-03-10T00:00:00.000Z')).toBe('—')
  })

  it('renders day age labels', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'))
    expect(daysAgo('2026-03-30T00:00:00.000Z')).toBe('Today')
    expect(daysAgo('2026-03-29T00:00:00.000Z')).toBe('1 day ago')
    vi.useRealTimers()
  })
})
