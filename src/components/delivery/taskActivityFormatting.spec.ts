import { describe, expect, it } from 'vitest'
import {
  activityUserInitials,
  changeActionType,
  changeDescription,
  formatChangeValue,
} from '@/components/delivery/taskActivityFormatting'

describe('taskActivityFormatting', () => {
  it('builds deterministic user initials', () => {
    expect(activityUserInitials('Jane Doe')).toBe('JD')
    expect(activityUserInitials('Single')).toBe('S')
  })

  it('detects change action type correctly', () => {
    expect(changeActionType({ from: null, to: 'next' })).toBe('added')
    expect(changeActionType({ from: 'prev', to: null })).toBe('removed')
    expect(changeActionType({ from: 'prev', to: 'next' })).toBe('updated')
  })

  it('describes user-field updates semantically', () => {
    expect(changeDescription({ field: 'ownerUserId', from: null, to: 'u1' })).toBe('Added owner')
    expect(changeDescription({ field: 'ownerUserId', from: 'u1', to: null })).toBe('Removed owner')
    expect(changeDescription({ field: 'ownerUserId', from: 'u1', to: 'u2' })).toBe('Updated owner')
  })

  it('formats change values with specialized rules', () => {
    expect(formatChangeValue('estimateValue', '3', () => null)).toBe('3h')
    expect(formatChangeValue('ownerUserId', 'user-1', (value) => value === 'user-1' ? 'Alice' : value)).toBe('Alice')
    expect(formatChangeValue('dueAt', '2026-04-10T00:00:00.000Z', () => null)).toContain('2026')
  })
})
