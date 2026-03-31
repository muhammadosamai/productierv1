import { describe, expect, it } from 'vitest'
import { buildGlobalSearchEntityRoute } from './homeEntityRouting'

describe('buildGlobalSearchEntityRoute', () => {
  it('maps every global-search entity to the expected deep link', () => {
    expect(buildGlobalSearchEntityRoute('task', 'task-1')).toEqual({
      path: '/tasks',
      query: { task: 'task-1' },
    })
    expect(buildGlobalSearchEntityRoute('initiative', 'initiative-1')).toEqual({
      path: '/initiatives/initiative-1',
    })
    expect(buildGlobalSearchEntityRoute('delivery', 'delivery-1')).toEqual({
      path: '/deliveries/delivery-1',
    })
    expect(buildGlobalSearchEntityRoute('team_member', 'user-1')).toEqual({
      path: '/users',
      query: { user: 'user-1' },
    })
    expect(buildGlobalSearchEntityRoute('wiki_asset', 'asset-1')).toEqual({
      path: '/wiki',
      query: { asset: 'asset-1' },
    })
  })
})
