import { Elysia, t } from 'elysia'
import { db } from '../db'
import { releases, releaseDeliveries, releaseDeployments, deploymentTargets, users } from '../db/schema'
import { eq, count } from 'drizzle-orm'
import { resolveProductByScope, whereDenormProductMatches, denormalizedProductScopeValue } from '../lib/resolveProductScope'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

async function getUserFromHeader(jwtVerify: any, headers: Record<string, string | undefined>) {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const payload = await jwtVerify(token)
  if (!payload?.userId) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId as string) })
  return user || null
}

// Auto-recompute deployment + release statuses
async function recomputeStatuses(releaseId: string) {
  const deployments = await db.query.releaseDeployments.findMany({
    where: eq(releaseDeployments.releaseId, releaseId),
    with: { deploymentTargets: true },
  })

  for (const dep of deployments) {
    const targets = dep.deploymentTargets || []
    if (targets.length === 0) continue

    let newStatus: 'pending' | 'deploying' | 'deployed' | 'failed' = 'pending'
    const allDeployed = targets.every(t => t.status === 'deployed')
    const anyFailed = targets.some(t => t.status === 'failed')
    const anyDeploying = targets.some(t => t.status === 'deploying')

    if (allDeployed) newStatus = 'deployed'
    else if (anyFailed) newStatus = 'failed'
    else if (anyDeploying) newStatus = 'deploying'

    if (newStatus !== dep.status) {
      await db.update(releaseDeployments)
        .set({
          status: newStatus,
          ...(newStatus === 'deployed' ? { completedAt: new Date() } : {}),
          ...(newStatus === 'failed' ? { failedAt: new Date() } : {}),
          ...(newStatus === 'deploying' ? { startedAt: dep.startedAt || new Date() } : {}),
        })
        .where(eq(releaseDeployments.id, dep.id))
    }
  }

  // Now recompute release status
  const updatedDeployments = await db.query.releaseDeployments.findMany({
    where: eq(releaseDeployments.releaseId, releaseId),
  })

  const hasDeployments = updatedDeployments.length > 0
  if (!hasDeployments) return

  const allCompleted = updatedDeployments.every(d => d.status === 'deployed')
  const anyFailed = updatedDeployments.some(d => d.status === 'failed')
  const anyActive = updatedDeployments.some(d => d.status === 'deploying' || d.status === 'deployed')

  let releaseStatus: 'draft' | 'planned' | 'in_progress' | 'completed' | 'failed' | undefined
  if (allCompleted) releaseStatus = 'completed'
  else if (anyFailed) releaseStatus = 'failed'
  else if (anyActive) releaseStatus = 'in_progress'

  if (releaseStatus) {
    await db.update(releases)
      .set({
        status: releaseStatus,
        ...(releaseStatus === 'completed' ? { completedAt: new Date() } : {}),
        ...(releaseStatus === 'in_progress' ? { startedAt: new Date() } : {}),
      })
      .where(eq(releases.id, releaseId))
  }
}

const releaseBody = t.Object({
  title: t.String({ minLength: 1 }),
  version: t.Optional(t.Nullable(t.String())),
  releaseType: t.Optional(t.Union([
    t.Literal('feature'), t.Literal('hotfix'), t.Literal('patch'),
  ])),
  status: t.Optional(t.Union([
    t.Literal('draft'), t.Literal('planned'), t.Literal('in_progress'),
    t.Literal('completed'), t.Literal('failed'),
  ])),
  plannedAt: t.Optional(t.Nullable(t.String())),
  releaseManagerId: t.Optional(t.Nullable(t.String())),
  notes: t.Optional(t.Nullable(t.String())),
  releaseNotes: t.Optional(t.Nullable(t.String())),
  productId: t.Optional(t.String()),
  deliveryIds: t.Optional(t.Array(t.String())),
})

export const releaseRoutes = new Elysia({ prefix: '/api/releases' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/releases?product=X
  .get('/', async ({ query }) => {
    const product = query.product?.trim()
    const scopeRow = product ? await resolveProductByScope(product) : null
    const results = await db.query.releases.findMany({
      where: scopeRow ? whereDenormProductMatches(releases.productId, scopeRow) : undefined,
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      with: {
        createdByUser: {
          columns: { id: true, name: true, email: true, avatar: true },
        },
        releaseManager: {
          columns: { id: true, name: true, email: true, avatar: true },
        },
        releaseDeliveries: {
          with: {
            delivery: {
              columns: { id: true, title: true, status: true, productId: true, startDate: true, endDate: true },
            },
          },
        },
        releaseDeployments: {
          with: {
            deploymentTargets: {
              with: {
                server: true,
              },
            },
            deployedByUser: {
              columns: { id: true, name: true, email: true, avatar: true },
            },
          },
          orderBy: (d, { asc }) => [asc(d.sequence)],
        },
      },
    })
    return results
  })

  // GET /api/releases/:id
  .get('/:id', async ({ params: { id }, set }) => {
    const release = await db.query.releases.findFirst({
      where: eq(releases.id, id),
      with: {
        createdByUser: {
          columns: { id: true, name: true, email: true, avatar: true },
        },
        releaseManager: {
          columns: { id: true, name: true, email: true, avatar: true },
        },
        releaseDeliveries: {
          with: {
            delivery: {
              columns: { id: true, title: true, status: true, productId: true, startDate: true, endDate: true },
              with: {
                tasks: {
                  columns: { id: true, title: true, status: true, type: true, priority: true },
                },
              },
            },
          },
        },
        releaseDeployments: {
          with: {
            deploymentTargets: {
              with: {
                server: true,
              },
            },
            deployedByUser: {
              columns: { id: true, name: true, email: true, avatar: true },
            },
          },
          orderBy: (d, { asc }) => [asc(d.sequence)],
        },
      },
    })
    if (!release) { set.status = 404; return { error: 'Release not found' } }
    return release
  })

  // POST /api/releases
  .post('/', async ({ body, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) return { error: 'Unauthorized' }

    const { deliveryIds, ...releaseData } = body
    const rawPid = releaseData.productId?.trim()
    if (!rawPid) {
      set.status = 400
      return { error: 'productId is required' }
    }
    const sr = await resolveProductByScope(rawPid)
    if (!sr) {
      set.status = 404
      return { error: 'Product not found' }
    }
    const productId = denormalizedProductScopeValue(sr)

    // Auto-generate code R-N
    const [countResult] = await db.select({ total: count() }).from(releases).where(whereDenormProductMatches(releases.productId, sr))
    const nextNumber = (countResult?.total || 0) + 1
    const code = `R-${nextNumber}`

    const [release] = await db.insert(releases).values({
      ...releaseData,
      code,
      status: releaseData.status ?? 'draft',
      releaseType: releaseData.releaseType ?? 'feature',
      plannedAt: releaseData.plannedAt ? new Date(releaseData.plannedAt) : null,
      createdByUserId: user.id,
      productId,
    }).returning()

    // Attach deliveries
    if (deliveryIds && deliveryIds.length > 0) {
      await db.insert(releaseDeliveries).values(
        deliveryIds.map((did, i) => ({
          releaseId: release!.id,
          deliveryId: did,
          deploymentOrder: i + 1,
          addedByUserId: user.id,
        }))
      )
    }

    // Auto-create 3 environment deployments
    const envs: Array<{ env: 'dev' | 'stage' | 'prod'; seq: number }> = [
      { env: 'dev', seq: 1 },
      { env: 'stage', seq: 2 },
      { env: 'prod', seq: 3 },
    ]
    await db.insert(releaseDeployments).values(
      envs.map(e => ({
        releaseId: release!.id,
        environment: e.env,
        sequence: e.seq,
      }))
    )

    logActivity({
      product: release!.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'release',
      entityId: release!.id,
      entityTitle: release!.title,
    })

    return release
  }, { body: releaseBody })

  // PUT /api/releases/:id
  .put('/:id', async ({ params: { id }, body, set, jwt: jwtInstance, headers }) => {
    const old = await db.query.releases.findFirst({ where: eq(releases.id, id) })
    if (!old) { set.status = 404; return { error: 'Release not found' } }

    const { deliveryIds, ...releaseData } = body
    const updateData: any = { ...releaseData, updatedAt: new Date() }
    if (releaseData.plannedAt !== undefined) {
      updateData.plannedAt = releaseData.plannedAt ? new Date(releaseData.plannedAt) : null
    }

    const [updated] = await db.update(releases)
      .set(updateData)
      .where(eq(releases.id, id))
      .returning()

    // Update delivery links if provided
    if (deliveryIds !== undefined) {
      await db.delete(releaseDeliveries).where(eq(releaseDeliveries.releaseId, id))
      if (deliveryIds.length > 0) {
        const user = await getUserFromHeader(jwtInstance.verify, headers)
        await db.insert(releaseDeliveries).values(
          deliveryIds.map((did, i) => ({
            releaseId: id,
            deliveryId: did,
            deploymentOrder: i + 1,
            addedByUserId: user?.id || null,
          }))
        )
      }
    }

    const user = await getUserFromHeader(jwtInstance.verify, headers)
    const changes = computeChanges(old, releaseData, ['title', 'status', 'version', 'releaseType', 'notes', 'releaseNotes', 'releaseManagerId'])
    if (changes.length > 0) {
      logActivity({
        product: updated!.productId,
        userName: user?.name || 'System',
        userAvatar: user?.avatar,
        userId: user?.id,
        action: 'updated',
        entityType: 'release',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }
    return updated
  }, { body: t.Partial(releaseBody) })

  // DELETE /api/releases/:id
  .delete('/:id', async ({ params: { id }, set, jwt: jwtInstance, headers }) => {
    const [deleted] = await db.delete(releases)
      .where(eq(releases.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Release not found' } }

    const user = await getUserFromHeader(jwtInstance.verify, headers)
    logActivity({
      product: deleted.productId,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'deleted',
      entityType: 'release',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })
    return { success: true }
  })

  // POST /api/releases/:id/deployments/:deploymentId/targets — add servers to a deployment
  .post('/:id/deployments/:deploymentId/targets', async ({ params, body, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) return { error: 'Unauthorized' }

    const { serverIds } = body
    if (!serverIds || serverIds.length === 0) return { error: 'No server IDs provided' }

    const inserted = await db.insert(deploymentTargets).values(
      serverIds.map((sid: string) => ({
        releaseDeploymentId: params.deploymentId,
        serverId: sid,
      }))
    ).returning()

    return inserted
  }, {
    body: t.Object({ serverIds: t.Array(t.String()) }),
  })

  // PUT /api/releases/:id/deployments/:deploymentId/targets/:targetId — update target status
  .put('/:id/deployments/:deploymentId/targets/:targetId', async ({ params, body, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) return { error: 'Unauthorized' }

    const updateData: any = { status: body.status }
    if (body.status === 'deployed') updateData.deployedAt = new Date()
    if (body.status === 'failed') updateData.failedAt = new Date()

    const [updated] = await db.update(deploymentTargets)
      .set(updateData)
      .where(eq(deploymentTargets.id, params.targetId))
      .returning()

    if (!updated) return { error: 'Target not found' }

    // Auto-recompute statuses
    await recomputeStatuses(params.id)

    return updated
  }, {
    body: t.Object({
      status: t.Union([
        t.Literal('pending'), t.Literal('deploying'),
        t.Literal('deployed'), t.Literal('failed'),
      ]),
    }),
  })

  // PUT /api/releases/:id/deployments/:deploymentId — update deployment
  .put('/:id/deployments/:deploymentId', async ({ params, body, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) return { error: 'Unauthorized' }

    const updateData: any = {}
    if (body.status) updateData.status = body.status
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.status === 'deploying') updateData.startedAt = new Date()
    if (body.status === 'deployed') updateData.completedAt = new Date()
    if (body.status === 'failed') updateData.failedAt = new Date()
    if (user) updateData.deployedByUserId = user.id

    const [updated] = await db.update(releaseDeployments)
      .set(updateData)
      .where(eq(releaseDeployments.id, params.deploymentId))
      .returning()

    if (!updated) return { error: 'Deployment not found' }

    // Auto-recompute release status
    await recomputeStatuses(params.id)

    return updated
  }, {
    body: t.Object({
      status: t.Optional(t.Union([
        t.Literal('pending'), t.Literal('deploying'),
        t.Literal('deployed'), t.Literal('failed'), t.Literal('rolled_back'),
      ])),
      notes: t.Optional(t.Nullable(t.String())),
    }),
  })

  // DELETE /api/releases/:id/deployments/:deploymentId/targets/:targetId — remove a target
  .delete('/:id/deployments/:deploymentId/targets/:targetId', async ({ params, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) return { error: 'Unauthorized' }

    const [deleted] = await db.delete(deploymentTargets)
      .where(eq(deploymentTargets.id, params.targetId))
      .returning()

    if (!deleted) return { error: 'Target not found' }

    await recomputeStatuses(params.id)
    return { success: true }
  })
