import { afterEach, describe, expect, it } from 'vitest'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

const LIST_ROLLOUT_FLAG = 'LIST_PAGING_ROLLOUT'
const initialListRolloutFlag = process.env[LIST_ROLLOUT_FLAG]

function restoreRolloutFlag() {
  if (initialListRolloutFlag === undefined) {
    delete process.env[LIST_ROLLOUT_FLAG]
    return
  }
  process.env[LIST_ROLLOUT_FLAG] = initialListRolloutFlag
}

async function createProduct(app: Awaited<ReturnType<typeof createTestApp>>, token: string, label: string) {
  const response = await apiRequest(app, '/api/products', {
    method: 'POST',
    token,
    body: {
      name: `${label}-${Date.now()}`,
      description: 'scalability rollout integration test',
    },
  })
  expect(response.status).toBe(200)
  const productId = response.body?.id as string
  expect(productId).toBeTruthy()
  return productId
}

async function createStories(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  productId: string,
  count: number,
) {
  for (let index = 0; index < count; index += 1) {
    const response = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: `Rollout Story ${index + 1}`,
        productId,
        description: 'scalability list response test',
      },
    })
    expect(response.status).toBe(200)
  }
}

describe('scalability rollout feature flags', () => {
  afterEach(() => {
    restoreRolloutFlag()
  })

  it('returns paged list envelope when list paging rollout is enabled', async () => {
    process.env[LIST_ROLLOUT_FLAG] = 'on'
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productId = await createProduct(app, token, 'PagedEnvelopeProduct')
    await createStories(app, token, productId, 3)

    const response = await apiRequest(
      app,
      `/api/stories?productId=${encodeURIComponent(productId)}&paged=1&limit=1&q=Rollout`,
      { method: 'GET', token },
    )
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body)).toBe(false)
    expect(Array.isArray(response.body?.items)).toBe(true)
    expect(typeof response.body?.hasMore).toBe('boolean')
    expect(response.body?.items.length).toBe(1)
    expect(response.body?.hasMore).toBe(true)
  })

  it('falls back to legacy array payload when list paging rollout is disabled', async () => {
    process.env[LIST_ROLLOUT_FLAG] = 'off'
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productId = await createProduct(app, token, 'LegacyListProduct')
    await createStories(app, token, productId, 2)

    const response = await apiRequest(
      app,
      `/api/stories?productId=${encodeURIComponent(productId)}&paged=1&limit=1&q=Rollout`,
      { method: 'GET', token },
    )
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
    expect((response.body as unknown[]).length).toBeGreaterThanOrEqual(2)
  })
})
