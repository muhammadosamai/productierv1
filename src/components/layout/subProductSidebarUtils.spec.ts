import { describe, expect, it } from 'vitest'
import {
  parseDeliveryPrefix,
  qualityStatusDot,
  qualityStatusText,
} from '@/components/layout/subProductSidebarUtils'

describe('subProductSidebarUtils', () => {
  it('parses delivery title prefix when present', () => {
    expect(parseDeliveryPrefix('#123 Delivery title')).toEqual({ prefix: '#123', rest: 'Delivery title' })
    expect(parseDeliveryPrefix('Plain title')).toEqual({ prefix: '', rest: 'Plain title' })
  })

  it('maps quality status to dot and text classes', () => {
    expect(qualityStatusDot('in_progress')).toContain('00c875')
    expect(qualityStatusDot('unknown')).toContain('gray')
    expect(qualityStatusText('planned')).toContain('fdab3d')
  })
})
