import { describe, expect, it } from 'vitest'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

describe('global search route', () => {
  it('returns product-scoped cross-entity search results', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productRes = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Search Product ${Date.now()}`,
        description: 'global search integration',
      },
    })
    expect(productRes.status).toBe(200)
    const productId = productRes.body?.id as string
    expect(productId).toBeTruthy()

    const initiativeRes = await apiRequest(app, '/api/initiatives', {
      method: 'POST',
      token,
      body: {
        title: 'Alpha Initiative Search',
        productId,
      },
    })
    expect(initiativeRes.status).toBe(200)

    const deliveryRes = await apiRequest(app, '/api/deliveries', {
      method: 'POST',
      token,
      body: {
        title: 'Alpha Delivery Search',
        productId,
      },
    })
    expect(deliveryRes.status).toBe(200)
    const deliveryId = deliveryRes.body?.id as string

    const storyRes = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: 'Alpha Story Search',
        productId,
      },
    })
    expect(storyRes.status).toBe(200)
    const storyId = storyRes.body?.id as string

    const taskRes = await apiRequest(app, `/api/tasks/by-story/${storyId}`, {
      method: 'POST',
      token,
      body: {
        title: 'Alpha Task Search',
        deliveryId,
      },
    })
    expect(taskRes.status).toBe(200)

    const wikiTypeRes = await apiRequest(app, '/api/wiki/types', {
      method: 'POST',
      token,
      body: {
        productId,
        name: 'Runbooks',
        category: 'engineering',
      },
    })
    expect(wikiTypeRes.status).toBe(200)
    const assetTypeId = wikiTypeRes.body?.id as string

    const wikiAssetRes = await apiRequest(app, '/api/wiki/assets', {
      method: 'POST',
      token,
      body: {
        productId,
        assetTypeId,
        title: 'Alpha Wiki Search',
        description: 'Searchable wiki page',
        status: 'active',
      },
    })
    expect(wikiAssetRes.status).toBe(200)

    const searchRes = await apiRequest(
      app,
      `/api/search/global?productId=${encodeURIComponent(productId)}&q=Alpha`,
      {
        method: 'GET',
        token,
      },
    )

    expect(searchRes.status).toBe(200)
    expect(Array.isArray(searchRes.body?.items)).toBe(true)
    expect(searchRes.body?.items.length).toBeGreaterThan(0)

    const entities = new Set<string>((searchRes.body?.items || []).map((item: any) => item.entityType))
    expect(entities.has('task')).toBe(true)
    expect(entities.has('initiative')).toBe(true)
    expect(entities.has('delivery')).toBe(true)
    expect(entities.has('wiki_asset')).toBe(true)

    for (const item of searchRes.body.items as Array<any>) {
      expect(typeof item.id).toBe('string')
      expect(typeof item.title).toBe('string')
      expect(typeof item.routePath).toBe('string')
      expect(['lexical', 'semantic', 'hybrid']).toContain(item.matchedBy)
      expect(typeof item.score).toBe('number')
    }
  })

  it('applies type filter and supports cursor pagination', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productRes = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Search Pagination Product ${Date.now()}`,
        description: 'global search pagination',
      },
    })
    expect(productRes.status).toBe(200)
    const productId = productRes.body?.id as string

    const storyRes = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: 'Pagination Story',
        productId,
      },
    })
    expect(storyRes.status).toBe(200)
    const storyId = storyRes.body?.id as string

    for (let index = 0; index < 3; index += 1) {
      const createTaskRes = await apiRequest(app, `/api/tasks/by-story/${storyId}`, {
        method: 'POST',
        token,
        body: {
          title: `Paged Task ${index + 1}`,
        },
      })
      expect(createTaskRes.status).toBe(200)
    }

    const firstPage = await apiRequest(
      app,
      `/api/search/global?productId=${encodeURIComponent(productId)}&q=Paged&types=task&limit=1`,
      { method: 'GET', token },
    )
    expect(firstPage.status).toBe(200)
    expect(firstPage.body?.items?.length).toBe(1)
    expect(firstPage.body?.items?.[0]?.entityType).toBe('task')
    expect(typeof firstPage.body?.nextCursor).toBe('string')
    expect(firstPage.body?.hasMore).toBe(true)

    const secondPage = await apiRequest(
      app,
      `/api/search/global?productId=${encodeURIComponent(productId)}&q=Paged&types=task&limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
      { method: 'GET', token },
    )
    expect(secondPage.status).toBe(200)
    expect(secondPage.body?.items?.length).toBe(1)
    expect(secondPage.body?.items?.[0]?.entityType).toBe('task')
    expect(secondPage.body?.items?.[0]?.id).not.toBe(firstPage.body?.items?.[0]?.id)
  })

  it('prioritizes exact title matches and handles typo queries', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productRes = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Search Ranking Product ${Date.now()}`,
      },
    })
    expect(productRes.status).toBe(200)
    const productId = productRes.body?.id as string

    const storyRes = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: 'Ranking Story',
        productId,
      },
    })
    expect(storyRes.status).toBe(200)
    const storyId = storyRes.body?.id as string

    const exactTaskRes = await apiRequest(app, `/api/tasks/by-story/${storyId}`, {
      method: 'POST',
      token,
      body: {
        title: 'Revenue Forecast Dashboard',
      },
    })
    expect(exactTaskRes.status).toBe(200)
    const exactTaskId = exactTaskRes.body?.id as string

    const fuzzyTaskRes = await apiRequest(app, `/api/tasks/by-story/${storyId}`, {
      method: 'POST',
      token,
      body: {
        title: 'Revenue Forecast Dashboard Follow Up',
      },
    })
    expect(fuzzyTaskRes.status).toBe(200)

    const exactSearch = await apiRequest(
      app,
      `/api/search/global?productId=${encodeURIComponent(productId)}&q=${encodeURIComponent('Revenue Forecast Dashboard')}&types=task`,
      { method: 'GET', token },
    )
    expect(exactSearch.status).toBe(200)
    expect(exactSearch.body?.items?.length).toBeGreaterThan(0)
    expect(exactSearch.body?.items?.[0]?.entityType).toBe('task')
    expect(exactSearch.body?.items?.[0]?.id).toBe(exactTaskId)

    const typoSearch = await apiRequest(
      app,
      `/api/search/global?productId=${encodeURIComponent(productId)}&q=${encodeURIComponent('Revnue Forcast Dashbord')}&types=task`,
      { method: 'GET', token },
    )
    expect(typoSearch.status).toBe(200)
    const typoIds = new Set<string>((typoSearch.body?.items || []).map((item: any) => String(item.id)))
    expect(typoIds.has(exactTaskId)).toBe(true)
  })

  it('applies inline type hints and returns routeable paths', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productRes = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Search Type Hint Product ${Date.now()}`,
      },
    })
    expect(productRes.status).toBe(200)
    const productId = productRes.body?.id as string

    const initiativeRes = await apiRequest(app, '/api/initiatives', {
      method: 'POST',
      token,
      body: {
        title: 'Polaris Launch Initiative',
        productId,
      },
    })
    expect(initiativeRes.status).toBe(200)
    const initiativeId = initiativeRes.body?.id as string

    const storyRes = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: 'Polaris Story',
        productId,
      },
    })
    expect(storyRes.status).toBe(200)
    const storyId = storyRes.body?.id as string

    const taskRes = await apiRequest(app, `/api/tasks/by-story/${storyId}`, {
      method: 'POST',
      token,
      body: {
        title: 'Polaris Launch Task',
      },
    })
    expect(taskRes.status).toBe(200)

    const hintedSearch = await apiRequest(
      app,
      `/api/search/global?productId=${encodeURIComponent(productId)}&q=${encodeURIComponent('initiative: Polaris Launch')}`,
      { method: 'GET', token },
    )
    expect(hintedSearch.status).toBe(200)
    expect(hintedSearch.body?.items?.length).toBeGreaterThan(0)
    for (const item of hintedSearch.body.items as Array<any>) {
      expect(item.entityType).toBe('initiative')
      expect(item.id).toBe(initiativeId)
      expect(typeof item.routePath).toBe('string')
      expect(item.routePath.startsWith('/initiatives/')).toBe(true)
    }
  })

  it('enforces product access for search', async () => {
    const app = await createTestApp()
    const owner = await registerAndLogin(app, 'super_admin')
    const outsider = await registerAndLogin(app, 'viewer')

    const productRes = await apiRequest(app, '/api/products', {
      method: 'POST',
      token: owner.token,
      body: {
        name: `Search ACL Product ${Date.now()}`,
      },
    })
    expect(productRes.status).toBe(200)
    const productId = productRes.body?.id as string

    const searchRes = await apiRequest(
      app,
      `/api/search/global?productId=${encodeURIComponent(productId)}&q=anything`,
      {
        method: 'GET',
        token: outsider.token,
      },
    )

    expect(searchRes.status).toBe(403)
  })
})
