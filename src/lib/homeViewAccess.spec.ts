import { describe, expect, it } from 'vitest'
import { ensureAllowedHomeView, resolveHomeViewAccess } from './homeViewAccess'

describe('home view access policy', () => {
  it('keeps viewer users on My Tasks by default', () => {
    const access = resolveHomeViewAccess('viewer', null)
    expect(access.allowedViews).toEqual(['my_tasks'])
    expect(access.defaultView).toBe('my_tasks')
  })

  it('grants Team View for manager-oriented roles', () => {
    const access = resolveHomeViewAccess('product_manager', null)
    expect(access.allowedViews).toEqual(['my_tasks', 'team'])
    expect(access.defaultView).toBe('team')
  })

  it('grants Executive Overview for elevated roles', () => {
    const access = resolveHomeViewAccess('admin', null)
    expect(access.allowedViews).toEqual(['my_tasks', 'team', 'executive'])
    expect(access.defaultView).toBe('executive')
  })

  it('grants executive view through title keys', () => {
    const access = resolveHomeViewAccess('developer', {
      id: 't-1',
      key: 'vp_engineering',
      name: 'VP Engineering',
      isActive: true,
    })
    expect(access.allowedViews).toEqual(['my_tasks', 'team', 'executive'])
    expect(access.defaultView).toBe('executive')
  })

  it('falls back to default when persisted view is no longer allowed', () => {
    const access = resolveHomeViewAccess('viewer', null)
    expect(ensureAllowedHomeView('executive', access)).toBe('my_tasks')
  })
})
