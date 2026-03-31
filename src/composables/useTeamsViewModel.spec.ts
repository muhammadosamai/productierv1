import { describe, expect, it } from 'vitest'
import { normalizeUserIds, normalizeTeamRole, resolveTeamLeadUserIds } from '@/composables/useTeamsViewModel'

describe('useTeamsViewModel helpers', () => {
  it('normalizes unique user ids and strips blanks', () => {
    expect(normalizeUserIds(['u-1', ' u-1 ', '', 'u-2', null, undefined, '   '])).toEqual(['u-1', 'u-2'])
  })

  it('normalizes unknown roles to member', () => {
    expect(normalizeTeamRole('lead')).toBe('lead')
    expect(normalizeTeamRole('member')).toBe('member')
    expect(normalizeTeamRole('anything-else')).toBe('member')
  })

  it('resolves multi-lead ids across contract, legacy field, and team members', () => {
    const leadIds = resolveTeamLeadUserIds(
      {
        leadUserIds: ['lead-a', 'lead-b'],
        leadUserId: 'legacy-lead',
      },
      [
        { userId: 'lead-b', role: 'lead' },
        { userId: 'lead-c', role: 'lead' },
        { userId: 'member-a', role: 'member' },
      ],
    )

    expect(leadIds).toEqual(['lead-a', 'lead-b', 'lead-c', 'legacy-lead'])
  })
})
