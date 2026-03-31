import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/index'

const ORIGINAL_ONBOARDING_FLAG = process.env.ONBOARDING_V2_ENABLED
const ONBOARDING_STATE_URL = 'http://localhost/api/onboarding/state'
const ONBOARDING_ORGANIZATION_URL = 'http://localhost/api/onboarding/organization'

afterEach(() => {
  if (ORIGINAL_ONBOARDING_FLAG === undefined) {
    delete process.env.ONBOARDING_V2_ENABLED
    return
  }
  process.env.ONBOARDING_V2_ENABLED = ORIGINAL_ONBOARDING_FLAG
})

describe('onboarding rollout flag', () => {
  it('returns 404 for onboarding endpoints when flag is disabled', async () => {
    process.env.ONBOARDING_V2_ENABLED = 'false'

    const app = createApp()
    const response = await app.handle(new Request(ONBOARDING_STATE_URL))
    const organizationResponse = await app.handle(new Request(ONBOARDING_ORGANIZATION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Flag Disabled Org' }),
    }))

    expect(response.status).toBe(404)
    expect(organizationResponse.status).toBe(404)
  })

  it('keeps onboarding endpoints mounted when flag is enabled', async () => {
    process.env.ONBOARDING_V2_ENABLED = 'true'

    const app = createApp()
    const response = await app.handle(new Request(ONBOARDING_STATE_URL))
    const organizationResponse = await app.handle(new Request(ONBOARDING_ORGANIZATION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Flag Enabled Org' }),
    }))

    // Route exists and auth guard responds first when unauthenticated.
    expect(response.status).toBe(401)
    expect(organizationResponse.status).toBe(401)
  })
})
