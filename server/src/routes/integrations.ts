import { Elysia, t } from 'elysia'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { db } from '../db'
import {
  integrationCatalog,
  integrationConnections,
  integrationCredentials,
  integrationSyncEvents,
  integrationSyncRuns,
} from '../db/schema'
import { logActivity } from '../lib/logActivity'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requirePageAction, requireProductPageAction } from '../lib/authz'
import { getIntegrationsConfig } from '../config/integrations'

const FOUNDATION_CONNECTORS = [
  {
    connectorKey: 'jira',
    name: 'Jira',
    description: 'Foundation connector scaffold for Jira lifecycle operations.',
    category: 'project_management',
    authType: 'oauth2' as const,
  },
  {
    connectorKey: 'github',
    name: 'GitHub',
    description: 'Foundation connector scaffold for GitHub lifecycle operations.',
    category: 'development',
    authType: 'oauth2' as const,
  },
  {
    connectorKey: 'slack',
    name: 'Slack',
    description: 'Foundation connector scaffold for Slack lifecycle operations.',
    category: 'communication',
    authType: 'oauth2' as const,
  },
]

const integrationsConfig = getIntegrationsConfig()

function getEncryptionKey() {
  return createHash('sha256').update(integrationsConfig.secretKey).digest()
}

function encryptCredentials(value: unknown) {
  const plaintext = JSON.stringify(value ?? {})
  const iv = randomBytes(12)
  const key = getEncryptionKey()
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    secretCiphertext: encrypted.toString('base64'),
    secretIv: iv.toString('base64'),
    secretAuthTag: authTag.toString('base64'),
    keyVersion: 'v1',
  }
}

async function ensureCatalogSeeded() {
  const existing = await db.query.integrationCatalog.findMany({
    columns: { connectorKey: true },
  })
  const existingKeys = new Set(existing.map((item) => item.connectorKey))
  const missing = FOUNDATION_CONNECTORS.filter((c) => !existingKeys.has(c.connectorKey))
  if (missing.length === 0) return

  await db.insert(integrationCatalog).values(missing.map((item) => ({
    connectorKey: item.connectorKey,
    name: item.name,
    description: item.description,
    category: item.category,
    authType: item.authType,
    enabled: true,
    metadata: {
      foundationOnly: true,
      capabilities: ['connect', 'test', 'sync', 'logs'],
    },
  })))
}

export const integrationsRoutes = new Elysia({ prefix: '/api/integrations' })
  .use(authPlugin)

  // GET /api/integrations/catalog
  .get('/catalog', async ({ jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }
    const canReadIntegrations = await requirePageAction(actor, set, 'integrations', 'read')
    if (!canReadIntegrations) return { error: 'Forbidden' }

    await ensureCatalogSeeded()
    return db.query.integrationCatalog.findMany({
      where: eq(integrationCatalog.enabled, true),
      orderBy: (c, { asc }) => [asc(c.category), asc(c.name)],
    })
  })

  // GET /api/integrations/connections?productId=...
  .get('/connections', async ({ query, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const requestedProductId = query.productId
    if (!requestedProductId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: requestedProductId,
      page: 'integrations',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const conditions: any[] = []
    conditions.push(eq(integrationConnections.productId, requestedProductId))

    const connections = await db.query.integrationConnections.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (c, { desc }) => [desc(c.updatedAt)],
      with: {
        connectedByUser: { columns: { id: true, name: true, email: true, avatar: true } },
      },
    })

    const connectionIds = connections.map((item) => item.id)
    const runs = connectionIds.length > 0
      ? await db.query.integrationSyncRuns.findMany({
        where: inArray(integrationSyncRuns.connectionId, connectionIds),
        orderBy: [desc(integrationSyncRuns.createdAt)],
      })
      : []

    const latestRunByConnection = new Map<string, any>()
    for (const run of runs) {
      if (!latestRunByConnection.has(run.connectionId)) {
        latestRunByConnection.set(run.connectionId, run)
      }
    }

    return connections.map((connection) => ({
      ...connection,
      latestRun: latestRunByConnection.get(connection.id) || null,
    }))
  }, {
    query: t.Object({
      productId: t.Optional(t.String()),
    }),
  })

  // POST /api/integrations/:connector/connect
  .post('/:connector/connect', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const productId = body.productId
    if (!productId) {
      set.status = 400
      return { error: 'productId is required' }
    }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId,
      page: 'integrations',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    await ensureCatalogSeeded()
    const connector = await db.query.integrationCatalog.findFirst({
      where: and(
        eq(integrationCatalog.connectorKey, params.connector),
        eq(integrationCatalog.enabled, true),
      ),
    })
    if (!connector) { set.status = 404; return { error: 'Connector not found' } }

    const existing = await db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.connectorKey, params.connector),
        eq(integrationConnections.productId, productId),
      ),
    })

    let connectionId = existing?.id || null
    if (existing) {
      await db.update(integrationConnections)
        .set({
          displayName: body.displayName || existing.displayName,
          metadata: body.metadata || existing.metadata,
          status: 'connected',
          connectedByUserId: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, existing.id))
      connectionId = existing.id
    } else {
      const [created] = await db.insert(integrationConnections).values({
        productId,
        connectorKey: params.connector,
        displayName: body.displayName || connector.name,
        metadata: body.metadata || null,
        status: 'connected',
        connectedByUserId: actor.id,
      }).returning()
      connectionId = created!.id
    }

    if (body.credentials !== undefined && connectionId) {
      const encrypted = encryptCredentials(body.credentials)
      const existingSecret = await db.query.integrationCredentials.findFirst({
        where: eq(integrationCredentials.connectionId, connectionId),
      })
      if (existingSecret) {
        await db.update(integrationCredentials)
          .set({
            ...encrypted,
            updatedAt: new Date(),
          })
          .where(eq(integrationCredentials.connectionId, connectionId))
      } else {
        await db.insert(integrationCredentials).values({
          connectionId,
          ...encrypted,
        })
      }
    }

    const connection = await db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, connectionId!),
      with: {
        connectedByUser: { columns: { id: true, name: true, email: true, avatar: true } },
      },
    })

    logActivity({
      productId,
      userName: actor.name,
      userAvatar: actor.avatar,
      userId: actor.id,
      action: 'connected',
      entityType: 'integration_connection',
      entityId: connection?.id,
      entityTitle: `${connector.name} (${productId})`,
    })

    return connection
  }, {
    body: t.Object({
      productId: t.Optional(t.String({ minLength: 1 })),
      displayName: t.Optional(t.String()),
      metadata: t.Optional(t.Any()),
      credentials: t.Optional(t.Any()),
    }),
  })

  // POST /api/integrations/:connectionId/test
  .post('/:connector/test', async ({ params, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const connection = await db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, params.connector),
    })
    if (!connection) { set.status = 404; return { error: 'Connection not found' } }
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: connection.productId,
      page: 'integrations',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [run] = await db.insert(integrationSyncRuns).values({
      connectionId: connection.id,
      triggerType: 'test',
      status: 'running',
      requestedByUserId: actor.id,
      startedAt: new Date(),
      summary: { type: 'test', foundationOnly: true },
    }).returning()

    await db.insert(integrationSyncEvents).values({
      runId: run!.id,
      level: 'info',
      message: 'Connection test started.',
      details: { connectionId: connection.id },
    })

    await db.update(integrationSyncRuns)
      .set({
        status: 'success',
        completedAt: new Date(),
      })
      .where(eq(integrationSyncRuns.id, run!.id))

    await db.insert(integrationSyncEvents).values({
      runId: run!.id,
      level: 'info',
      message: 'Connection test completed successfully (foundation mode).',
      details: { result: 'success' },
    })

    await db.update(integrationConnections)
      .set({
        status: 'connected',
        lastTestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id))

    logActivity({
      productId: connection.productId,
      userName: actor.name,
      userAvatar: actor.avatar,
      userId: actor.id,
      action: 'tested',
      entityType: 'integration_connection',
      entityId: connection.id,
      entityTitle: connection.displayName || connection.connectorKey,
    })

    return db.query.integrationSyncRuns.findFirst({
      where: eq(integrationSyncRuns.id, run!.id),
    })
  })

  // POST /api/integrations/:connectionId/sync
  .post('/:connector/sync', async ({ params, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const connection = await db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, params.connector),
    })
    if (!connection) { set.status = 404; return { error: 'Connection not found' } }
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: connection.productId,
      page: 'integrations',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [run] = await db.insert(integrationSyncRuns).values({
      connectionId: connection.id,
      triggerType: 'manual',
      status: 'running',
      requestedByUserId: actor.id,
      startedAt: new Date(),
      summary: { foundationOnly: true, recordsSynced: 0 },
    }).returning()

    await db.insert(integrationSyncEvents).values({
      runId: run!.id,
      level: 'info',
      message: 'Sync run started.',
      details: { connectionId: connection.id, connectorKey: connection.connectorKey },
    })

    await db.insert(integrationSyncEvents).values({
      runId: run!.id,
      level: 'info',
      message: 'No provider adapter configured; foundation sync finished with 0 records.',
      details: { recordsSynced: 0, foundationOnly: true },
    })

    await db.update(integrationSyncRuns)
      .set({
        status: 'success',
        completedAt: new Date(),
      })
      .where(eq(integrationSyncRuns.id, run!.id))

    await db.update(integrationConnections)
      .set({
        status: 'connected',
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id))

    logActivity({
      productId: connection.productId,
      userName: actor.name,
      userAvatar: actor.avatar,
      userId: actor.id,
      action: 'synced',
      entityType: 'integration_sync',
      entityId: run!.id,
      entityTitle: connection.displayName || connection.connectorKey,
    })

    return db.query.integrationSyncRuns.findFirst({
      where: eq(integrationSyncRuns.id, run!.id),
    })
  })

  // GET /api/integrations/:connectionId/sync-runs?limit=50
  .get('/:connector/sync-runs', async ({ params, query, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const connection = await db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, params.connector),
      columns: { id: true, productId: true },
    })
    if (!connection) { set.status = 404; return { error: 'Connection not found' } }
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: connection.productId,
      page: 'integrations',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200)
    return db.query.integrationSyncRuns.findMany({
      where: eq(integrationSyncRuns.connectionId, params.connector),
      orderBy: [desc(integrationSyncRuns.createdAt)],
      limit,
      with: {
        requestedByUser: { columns: { id: true, name: true, email: true, avatar: true } },
      },
    })
  }, {
    query: t.Object({
      limit: t.Optional(t.Numeric()),
    }),
  })

  // GET /api/integrations/sync-runs/:runId/events
  .get('/sync-runs/:runId/events', async ({ params, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const run = await db.query.integrationSyncRuns.findFirst({
      where: eq(integrationSyncRuns.id, params.runId),
      columns: { id: true, connectionId: true },
    })
    if (!run) { set.status = 404; return { error: 'Sync run not found' } }

    const connection = await db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, run.connectionId),
      columns: { id: true, productId: true },
    })
    if (!connection) { set.status = 404; return { error: 'Connection not found' } }
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: connection.productId,
      page: 'integrations',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    return db.query.integrationSyncEvents.findMany({
      where: eq(integrationSyncEvents.runId, params.runId),
      orderBy: [asc(integrationSyncEvents.createdAt)],
    })
  })
