import { describe, expect, it, vi } from 'vitest'
import { ChatOpenAI } from '@langchain/openai'
import { db } from '../../src/db'
import {
  organizationMembers,
  organizations,
  productMembers,
  products,
  stories,
  tasks,
} from '../../src/db/schema'
import { resetHomeBriefConfigCacheForTests } from '../../src/config/brief'
import { resetDailyBriefCacheForTests } from '../../src/lib/brief/dailyBrief'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

async function createScopedProductForUser(
  userId: string,
  name: string,
  existingOrganizationId?: string,
): Promise<{ productId: string; organizationId: string }> {
  const timestamp = Date.now()
  const organizationId = existingOrganizationId || (await db.insert(organizations).values({
    name: `Org ${name} ${timestamp}`,
    slug: `org-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    createdByUserId: userId,
  }).returning({ id: organizations.id }))[0]!.id

  if (!existingOrganizationId) {
    await db.insert(organizationMembers).values({
      organizationId,
      userId,
      role: 'owner',
    })
  }

  const [product] = await db.insert(products).values({
    organizationId,
    name: `${name} ${timestamp}`,
    createdByUserId: userId,
  }).returning({ id: products.id })

  await db.insert(productMembers).values({
    productId: product.id,
    userId,
    role: 'admin',
  })

  return {
    productId: product.id,
    organizationId,
  }
}

const briefEnvKeys = [
  'HOME_DAILY_BRIEF_ENABLED',
  'HOME_DAILY_BRIEF_PROVIDER',
  'HOME_DAILY_BRIEF_API_KEY',
  'SEARCH_EMBEDDING_API_KEY',
  'HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS',
  'HOME_DAILY_BRIEF_TIMEOUT_MS',
  'HOME_DAILY_BRIEF_RETRY_MODEL',
  'HOME_DAILY_BRIEF_RETRY_CONTEXT_MAX_CHARS',
  'HOME_DAILY_BRIEF_REASONING_EFFORT',
] as const

function withBriefEnv(overrides: Partial<Record<(typeof briefEnvKeys)[number], string>>) {
  const snapshot = new Map<string, string | undefined>()
  for (const key of briefEnvKeys) {
    snapshot.set(key, process.env[key])
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      process.env[key] = overrides[key]
    }
  }
  resetHomeBriefConfigCacheForTests()
  resetDailyBriefCacheForTests()

  return () => {
    for (const key of briefEnvKeys) {
      const previous = snapshot.get(key)
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    }
    resetHomeBriefConfigCacheForTests()
    resetDailyBriefCacheForTests()
  }
}

describe('home daily brief route', () => {
  it('returns a structured brief for authorized users', async () => {
    const app = await createTestApp()
    const { token, user } = await registerAndLogin(app, 'super_admin')

    const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Product')
    expect(productId).toBeTruthy()

    const briefRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?productId=${encodeURIComponent(productId)}&view=executive&mode=full`,
      {
        method: 'GET',
        token,
      },
    )

    expect(briefRes.status).toBe(200)
    expect(typeof briefRes.body?.brief).toBe('string')
    expect((briefRes.body?.brief as string).length).toBeGreaterThan(0)
    expect(['ai', 'fallback', 'disabled']).toContain(briefRes.body?.source)
    expect(briefRes.body?.view).toBe('executive')
    expect(briefRes.body?.mode).toBe('full')
    expect(Array.isArray(briefRes.body?.sections)).toBe(true)
    const sections = briefRes.body?.sections as Array<{ id?: unknown; title?: unknown; items?: unknown }>
    if (briefRes.body?.source === 'ai') {
      expect(sections.length).toBeGreaterThan(0)
      const firstSection = sections[0]
      expect(typeof firstSection?.id).toBe('string')
      expect(typeof firstSection?.title).toBe('string')
      expect(Array.isArray(firstSection?.items)).toBe(true)

      const allItems = (sections as Array<{ items?: Array<{ routePath?: unknown }> }>)
        .flatMap((section) => section.items || [])
      const routeItems = allItems.filter((item) => typeof item.routePath === 'string')
      for (const item of routeItems) {
        expect(String(item.routePath).startsWith('/')).toBe(true)
      }
    } else {
      expect(sections.length).toBe(0)
    }
    expect(typeof briefRes.body?.generatedAt).toBe('string')
  })

  it('supports all-scope home and brief requests and validates team scope requirements', async () => {
    const app = await createTestApp()
    const { token, user } = await registerAndLogin(app, 'super_admin')

    const scopeA = await createScopedProductForUser(user.id, 'All Scope Product A')
    await createScopedProductForUser(user.id, 'All Scope Product B', scopeA.organizationId)

    const homeRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(scopeA.organizationId)}/users/${encodeURIComponent(user.id)}/home?scopeMode=all`,
      {
        method: 'GET',
        token,
      },
    )
    expect(homeRes.status).toBe(200)
    expect(typeof homeRes.body?.totalTasks).toBe('number')
    expect(Array.isArray(homeRes.body?.activities)).toBe(true)
    expect(typeof homeRes.body?.actionScore?.current).toBe('number')
    expect(typeof homeRes.body?.stats?.overdueItems).toBe('number')
    expect(typeof homeRes.body?.reviewQueueHealth?.slaBreachCount).toBe('number')
    expect(typeof homeRes.body?.reviewQueueHealth?.buckets?.lt24).toBe('number')
    expect(typeof homeRes.body?.reviewQueueHealth?.buckets?.between24And72).toBe('number')
    expect(typeof homeRes.body?.reviewQueueHealth?.buckets?.gt72).toBe('number')
    expect(typeof homeRes.body?.personalWip?.current).toBe('number')
    expect(typeof homeRes.body?.personalWip?.limit).toBe('number')
    expect(Array.isArray(homeRes.body?.upcomingDeadlines)).toBe(true)

    const briefRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(scopeA.organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scopeMode=all&view=team`,
      {
        method: 'GET',
        token,
      },
    )
    expect(briefRes.status).toBe(200)
    expect(briefRes.body?.view).toBe('team')
    expect(typeof briefRes.body?.brief).toBe('string')
    expect((briefRes.body?.brief as string).length).toBeGreaterThan(0)
    expect(Array.isArray(briefRes.body?.sections)).toBe(true)
    expect(typeof briefRes.body?.generatedAt).toBe('string')
    expect(['ai', 'fallback', 'disabled']).toContain(briefRes.body?.source)

    const invalidTeamScopeHome = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(scopeA.organizationId)}/users/${encodeURIComponent(user.id)}/home?scopeMode=team`,
      {
        method: 'GET',
        token,
      },
    )
    expect(invalidTeamScopeHome.status).toBe(400)

    const invalidTeamScopeBrief = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(scopeA.organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scopeMode=team`,
      {
        method: 'GET',
        token,
      },
    )
    expect(invalidTeamScopeBrief.status).toBe(400)
  })

  it('rejects product-scoped brief requests without product access', async () => {
    const app = await createTestApp()
    const owner = await registerAndLogin(app, 'super_admin')
    const viewer = await registerAndLogin(app, 'viewer')

    const ownerScope = await createScopedProductForUser(owner.user.id, 'Daily Brief Access Product')
    const productId = ownerScope.productId
    expect(productId).toBeTruthy()

    const briefRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(ownerScope.organizationId)}/users/${encodeURIComponent(viewer.user.id)}/daily-brief?productId=${encodeURIComponent(productId)}&view=team`,
      {
        method: 'GET',
        token: viewer.token,
      },
    )

    expect(briefRes.status).toBe(403)
  })

  it('defaults invalid mode values to summary mode', async () => {
    const app = await createTestApp()
    const { token, user } = await registerAndLogin(app, 'viewer')
    const viewerScope = await createScopedProductForUser(user.id, 'Viewer Brief Scope')

    const briefRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(viewerScope.organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?view=my_tasks&mode=verbose`,
      {
        method: 'GET',
        token,
      },
    )

    expect(briefRes.status).toBe(200)
    expect(briefRes.body?.mode).toBe('summary')
    expect(briefRes.body?.view).toBe('my_tasks')
    expect(Array.isArray(briefRes.body?.sections)).toBe(true)
    if (briefRes.body?.source === 'ai') {
      expect((briefRes.body?.sections as Array<unknown>).length).toBeGreaterThan(0)
    } else {
      expect((briefRes.body?.sections as Array<unknown>).length).toBe(0)
    }
  })

  it('supports explicit scope, template, and entity focus metadata', async () => {
    const app = await createTestApp()
    const { token, user } = await registerAndLogin(app, 'super_admin')

    const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Scope Product')
    expect(productId).toBeTruthy()

    const [story] = await db.insert(stories).values({
      title: `Daily Brief Scope Story ${Date.now()}`,
      productId,
      ownerUserId: user.id,
    }).returning({
      id: stories.id,
    })
    expect(story?.id).toBeTruthy()

    const [task] = await db.insert(tasks).values({
      productId,
      storyId: story!.id,
      title: `Daily Brief Scope Task ${Date.now()}`,
      createdByUserId: user.id,
      ownerUserId: user.id,
      priority: 'high',
      status: 'in_progress',
    }).returning({
      id: tasks.id,
    })
    expect(task?.id).toBeTruthy()

    const productScopedRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&template=workload_focus`,
      {
        method: 'GET',
        token,
      },
    )
    expect(productScopedRes.status).toBe(200)
    expect(productScopedRes.body?.scope).toBe('product')
    expect(productScopedRes.body?.template).toBe('workload_focus')
    expect(productScopedRes.body?.productId).toBe(productId)

    const entityScopedRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=entity&entityType=task&entityId=${encodeURIComponent(task!.id)}&template=entity_deep_dive`,
      {
        method: 'GET',
        token,
      },
    )
    expect(entityScopedRes.status).toBe(200)
    expect(entityScopedRes.body?.scope).toBe('entity')
    expect(entityScopedRes.body?.template).toBe('entity_deep_dive')
    expect(entityScopedRes.body?.entityFocus?.entityType).toBe('task')
    expect(entityScopedRes.body?.entityFocus?.entityId).toBe(task!.id)
    expect(entityScopedRes.body?.productId).toBe(productId)

    const allProductsRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=all_products&template=executive_narrative`,
      {
        method: 'GET',
        token,
      },
    )
    expect(allProductsRes.status).toBe(200)
    expect(allProductsRes.body?.scope).toBe('all_products')
    expect(allProductsRes.body?.template).toBe('executive_narrative')

    const invalidEntityRes = await apiRequest(
      app,
      `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=entity&entityType=task`,
      {
        method: 'GET',
        token,
      },
    )
    expect(invalidEntityRes.status).toBe(400)
  })

  it('marks disabled source with explicit fallback reason metadata', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'false',
      HOME_DAILY_BRIEF_PROVIDER: 'none',
      HOME_DAILY_BRIEF_API_KEY: '',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '15000',
    })
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Disabled Source')

      const briefRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}`,
        {
          method: 'GET',
          token,
        },
      )

      expect(briefRes.status).toBe(200)
      expect(briefRes.body?.source).toBe('disabled')
      expect(briefRes.body?.fallbackReason).toBe('feature_disabled')
    } finally {
      restoreEnv()
    }
  })

  it('returns missing_api_key fallback reason when provider is enabled without credentials', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'true',
      HOME_DAILY_BRIEF_PROVIDER: 'openai',
      HOME_DAILY_BRIEF_API_KEY: '',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '15000',
    })
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Missing Key')

      const briefRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&view=executive`,
        {
          method: 'GET',
          token,
        },
      )

      expect(briefRes.status).toBe(200)
      expect(briefRes.body?.source).toBe('fallback')
      expect(briefRes.body?.fallbackReason).toBe('missing_api_key')
    } finally {
      restoreEnv()
    }
  })

  it('returns provider_not_ready fallback reason when provider is not selected', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'true',
      HOME_DAILY_BRIEF_PROVIDER: 'none',
      HOME_DAILY_BRIEF_API_KEY: '',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '15000',
    })
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Provider Not Ready')

      const briefRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&view=my_tasks`,
        {
          method: 'GET',
          token,
        },
      )

      expect(briefRes.status).toBe(200)
      expect(briefRes.body?.source).toBe('fallback')
      expect(briefRes.body?.fallbackReason).toBe('provider_not_ready')
    } finally {
      restoreEnv()
    }
  })

  it('returns parse_error fallback reason when AI provider emits invalid JSON payload', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'true',
      HOME_DAILY_BRIEF_PROVIDER: 'openai',
      HOME_DAILY_BRIEF_API_KEY: 'test-brief-key',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '15000',
    })
    const invokeSpy = vi.spyOn(ChatOpenAI.prototype as unknown as { invoke: (...args: unknown[]) => Promise<unknown> }, 'invoke')
      .mockResolvedValue({ content: 'not-json' })
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Parse Error')

      const briefRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&view=executive`,
        {
          method: 'GET',
          token,
        },
      )

      expect(briefRes.status).toBe(200)
      expect(briefRes.body?.source).toBe('fallback')
      expect(briefRes.body?.fallbackReason).toBe('parse_error')
    } finally {
      invokeSpy.mockRestore()
      restoreEnv()
    }
  })

  it('extracts JSON payload from response metadata output when top-level content is empty', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'true',
      HOME_DAILY_BRIEF_PROVIDER: 'openai',
      HOME_DAILY_BRIEF_API_KEY: 'test-brief-key',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '15000',
      HOME_DAILY_BRIEF_RETRY_MODEL: 'gpt-5.4-mini',
      HOME_DAILY_BRIEF_REASONING_EFFORT: 'low',
    })
    const invokeSpy = vi.spyOn(ChatOpenAI.prototype as unknown as { invoke: (...args: unknown[]) => Promise<unknown> }, 'invoke')
      .mockResolvedValue({
        content: '',
        response_metadata: {
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: '{"briefMarkdown":"### Metadata fallback parse\\n- Extracted from response metadata output.","sections":[]}',
                },
              ],
            },
          ],
        },
      })
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Metadata Output Parse')

      const briefRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&view=executive`,
        {
          method: 'GET',
          token,
        },
      )

      expect(briefRes.status).toBe(200)
      expect(briefRes.body?.source).toBe('ai')
      expect(briefRes.body?.fallbackReason).toBeNull()
      expect(typeof briefRes.body?.brief).toBe('string')
      expect((briefRes.body?.brief as string).length).toBeGreaterThan(0)
    } finally {
      invokeSpy.mockRestore()
      restoreEnv()
    }
  })

  it('retries parse failures and serves AI brief when retry succeeds', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'true',
      HOME_DAILY_BRIEF_PROVIDER: 'openai',
      HOME_DAILY_BRIEF_API_KEY: 'test-brief-key',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '15000',
      HOME_DAILY_BRIEF_RETRY_MODEL: 'gpt-5.4-mini',
      HOME_DAILY_BRIEF_RETRY_CONTEXT_MAX_CHARS: '3500',
    })
    const invokeSpy = vi.spyOn(ChatOpenAI.prototype as unknown as { invoke: (...args: unknown[]) => Promise<unknown> }, 'invoke')
      .mockResolvedValueOnce({ content: '' })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          briefMarkdown: '### Daily brief\\n- Retry path recovered the narrative.',
          sections: [],
        }),
      })
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Retry Success')

      const briefRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&view=executive`,
        {
          method: 'GET',
          token,
        },
      )

      expect(briefRes.status).toBe(200)
      expect(briefRes.body?.source).toBe('ai')
      expect(briefRes.body?.fallbackReason).toBeNull()
      expect((briefRes.body?.brief as string).length).toBeGreaterThan(0)
      expect(invokeSpy).toHaveBeenCalledTimes(2)
    } finally {
      invokeSpy.mockRestore()
      restoreEnv()
    }
  })

  it('returns timeout fallback reason when provider invocation times out', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'true',
      HOME_DAILY_BRIEF_PROVIDER: 'openai',
      HOME_DAILY_BRIEF_API_KEY: 'test-brief-key',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_TIMEOUT_MS: '5',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '15000',
    })
    const invokeSpy = vi.spyOn(ChatOpenAI.prototype as unknown as { invoke: (...args: unknown[]) => Promise<unknown> }, 'invoke')
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return { content: '{"briefMarkdown":"ok","sections":[]}' }
      })
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Timeout')

      const briefRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&view=executive`,
        {
          method: 'GET',
          token,
        },
      )

      expect(briefRes.status).toBe(200)
      expect(briefRes.body?.source).toBe('fallback')
      expect(briefRes.body?.fallbackReason).toBe('timeout')
    } finally {
      invokeSpy.mockRestore()
      restoreEnv()
    }
  })

  it('returns provider_error fallback reason when provider invocation fails', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'true',
      HOME_DAILY_BRIEF_PROVIDER: 'openai',
      HOME_DAILY_BRIEF_API_KEY: 'test-brief-key',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '15000',
    })
    const invokeSpy = vi.spyOn(ChatOpenAI.prototype as unknown as { invoke: (...args: unknown[]) => Promise<unknown> }, 'invoke')
      .mockRejectedValue(new Error('upstream provider failure'))
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Provider Error')

      const briefRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&view=executive`,
        {
          method: 'GET',
          token,
        },
      )

      expect(briefRes.status).toBe(200)
      expect(briefRes.body?.source).toBe('fallback')
      expect(briefRes.body?.fallbackReason).toBe('provider_error')
    } finally {
      invokeSpy.mockRestore()
      restoreEnv()
    }
  })

  it('does not persist fallback cache entries when fallback cache TTL is disabled', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'true',
      HOME_DAILY_BRIEF_PROVIDER: 'openai',
      HOME_DAILY_BRIEF_API_KEY: '',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '0',
    })
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief No Fallback Cache')

      const first = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}`,
        {
          method: 'GET',
          token,
        },
      )
      const second = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}`,
        {
          method: 'GET',
          token,
        },
      )

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(first.body?.source).toBe('fallback')
      expect(second.body?.source).toBe('fallback')
      expect(first.body?.fallbackReason).toBe('missing_api_key')
      expect(second.body?.fallbackReason).toBe('missing_api_key')
      expect(first.body?.cached).toBe(false)
      expect(second.body?.cached).toBe(false)
    } finally {
      restoreEnv()
    }
  })

  it('uses single strategy for short context and chunked strategy for long context', async () => {
    const restoreEnv = withBriefEnv({
      HOME_DAILY_BRIEF_ENABLED: 'false',
      HOME_DAILY_BRIEF_PROVIDER: 'none',
      HOME_DAILY_BRIEF_API_KEY: '',
      SEARCH_EMBEDDING_API_KEY: '',
      HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS: '0',
    })
    try {
      const app = await createTestApp()
      const { token, user } = await registerAndLogin(app, 'super_admin')
      const { productId, organizationId } = await createScopedProductForUser(user.id, 'Daily Brief Strategy Scope')

      const shortRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&mode=summary`,
        {
          method: 'GET',
          token,
        },
      )
      expect(shortRes.status).toBe(200)
      expect(shortRes.body?.strategy).toBe('single')

      const now = Date.now()
      const [strategyStory] = await db.insert(stories).values({
        title: `Daily Brief Strategy Story ${now}`,
        productId,
        ownerUserId: user.id,
      }).returning({
        id: stories.id,
      })
      await db.insert(tasks).values(
        Array.from({ length: 60 }).map((_, index) => ({
          productId,
          storyId: strategyStory!.id,
          title: `Daily Brief Strategy Task ${now}-${index}`,
          createdByUserId: user.id,
          ownerUserId: user.id,
          priority: index % 2 === 0 ? 'high' : 'medium',
          status: 'in_progress',
        })),
      )
      resetDailyBriefCacheForTests()

      const longRes = await apiRequest(
        app,
        `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(user.id)}/daily-brief?scope=product&productId=${encodeURIComponent(productId)}&mode=summary`,
        {
          method: 'GET',
          token,
        },
      )
      expect(longRes.status).toBe(200)
      expect(longRes.body?.strategy).toBe('chunked')
    } finally {
      restoreEnv()
    }
  })
})
