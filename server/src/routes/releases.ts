import { Elysia, t } from 'elysia'
import { db } from '../db'
import { releases, releaseDeliveries, releaseDeployments, deploymentTargets } from '../db/schema'
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { logActivity, computeChanges } from '../lib/logActivity'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireProductPageAction, type PageAction } from '../lib/authz'
import { publicUserColumns } from '../lib/serializers'
import {
  decodeCursor,
  encodeCursor,
  isLegacyListMode,
  parseListQuery,
  parseSort,
  toListEnvelope,
} from '../lib/listContract'

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

  const updatedDeployments = await db.query.releaseDeployments.findMany({
    where: eq(releaseDeployments.releaseId, releaseId),
  })
  if (updatedDeployments.length === 0) return

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

async function getDeploymentForRelease(releaseId: string, deploymentId: string) {
  return db.query.releaseDeployments.findFirst({
    where: and(
      eq(releaseDeployments.id, deploymentId),
      eq(releaseDeployments.releaseId, releaseId),
    ),
  })
}

async function getTargetForDeployment(targetId: string, deploymentId: string) {
  return db.query.deploymentTargets.findFirst({
    where: and(
      eq(deploymentTargets.id, targetId),
      eq(deploymentTargets.releaseDeploymentId, deploymentId),
    ),
  })
}

async function requireReleaseAccess(
  releaseId: string,
  action: PageAction,
  jwtVerify: (token: string) => Promise<any>,
  headers: Record<string, string | undefined>,
  set: { status?: number | string },
  requiredProductRoles?: string[]
) {
  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
    columns: { id: true, productId: true },
  })
  if (!release) {
    set.status = 404
    return null
  }

  const access = await requireProductPageAction(jwtVerify, headers, set, {
    productId: release.productId,
    page: 'releases',
    action,
    requiredProductRoles,
  })
  if (!access) return null

  return { release, user: access.user }
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
  .use(authPlugin)

  .get('/', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = query.productId
    if (!productId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'releases',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const parsedList = parseListQuery(query as Record<string, unknown>, {
      defaultLimit: 30,
      maxLimit: 100,
    })
    const legacyMode = isLegacyListMode(parsedList)
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const qTerm = q.length > 0 ? q : null

    if (legacyMode) {
      return db.query.releases.findMany({
        where: eq(releases.productId, productId),
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        with: {
          createdByUser: { columns: publicUserColumns },
          releaseManager: { columns: publicUserColumns },
          releaseDeliveries: {
            with: {
              delivery: {
                columns: { id: true, title: true, status: true, productId: true, startDate: true, endDate: true },
              },
            },
          },
          releaseDeployments: {
            with: {
              deploymentTargets: { with: { server: true } },
              deployedByUser: { columns: publicUserColumns },
            },
            orderBy: (d, { asc }) => [asc(d.sequence)],
          },
        },
      })
    }

    const sort = parseSort(parsedList.sort, ['createdAt', 'updatedAt', 'plannedAt'] as const, {
      field: 'createdAt',
      direction: 'desc',
      raw: 'createdAt:desc',
    })
    const cursor = decodeCursor(parsedList.cursor)
    const baseConditions = [eq(releases.productId, productId)]
    if (qTerm) {
      baseConditions.push(or(
        ilike(releases.title, `%${qTerm}%`),
        ilike(releases.code, `%${qTerm}%`),
        ilike(releases.version, `%${qTerm}%`),
      )!)
    }

    const conditions = [...baseConditions]
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt)
      if (!Number.isNaN(cursorDate.getTime())) {
        const field = sort.field === 'updatedAt' ? releases.updatedAt : sort.field === 'plannedAt' ? releases.plannedAt : releases.createdAt
        if (sort.direction === 'desc') {
          conditions.push(sql`(${field} < ${cursorDate} OR (${field} = ${cursorDate} AND ${releases.id} < ${cursor.id}))`)
        } else {
          conditions.push(sql`(${field} > ${cursorDate} OR (${field} = ${cursorDate} AND ${releases.id} > ${cursor.id}))`)
        }
      }
    }

    const orderField = sort.field === 'updatedAt' ? releases.updatedAt : sort.field === 'plannedAt' ? releases.plannedAt : releases.createdAt
    const rows = await db.select({
      id: releases.id,
      code: releases.code,
      version: releases.version,
      title: releases.title,
      status: releases.status,
      releaseType: releases.releaseType,
      plannedAt: releases.plannedAt,
      startedAt: releases.startedAt,
      completedAt: releases.completedAt,
      releaseManagerId: releases.releaseManagerId,
      notes: releases.notes,
      releaseNotes: releases.releaseNotes,
      productId: releases.productId,
      createdByUserId: releases.createdByUserId,
      createdAt: releases.createdAt,
      updatedAt: releases.updatedAt,
    }).from(releases)
      .where(and(...conditions))
      .orderBy(
        sort.direction === 'desc' ? desc(orderField) : asc(orderField),
        sort.direction === 'desc' ? desc(releases.id) : asc(releases.id),
      )
      .limit(parsedList.limit + 1)

    const hasMore = rows.length > parsedList.limit
    const items = hasMore ? rows.slice(0, parsedList.limit) : rows
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor({
        id: items[items.length - 1]!.id,
        createdAt: new Date(
          sort.field === 'updatedAt'
            ? items[items.length - 1]!.updatedAt
            : sort.field === 'plannedAt'
              ? (items[items.length - 1]!.plannedAt || items[items.length - 1]!.createdAt)
              : items[items.length - 1]!.createdAt,
        ).toISOString(),
      })
      : null

    let totalApprox: number | undefined
    if (!parsedList.cursor) {
      const [countRow] = await db.select({
        value: sql<number>`count(*)::int`,
      }).from(releases).where(and(...baseConditions))
      totalApprox = Number(countRow?.value ?? 0)
    }

    return toListEnvelope({
      items,
      hasMore,
      nextCursor,
      totalApprox,
    })
  })

  .get('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireReleaseAccess(id, 'read', jwt.verify, headers, set)
    if (!access) return set.status === 404 ? { error: 'Release not found' } : { error: 'Forbidden' }

    const release = await db.query.releases.findFirst({
      where: eq(releases.id, id),
      with: {
        createdByUser: { columns: publicUserColumns },
        releaseManager: { columns: publicUserColumns },
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
            deploymentTargets: { with: { server: true } },
            deployedByUser: { columns: publicUserColumns },
          },
          orderBy: (d, { asc }) => [asc(d.sequence)],
        },
      },
    })
    if (!release) { set.status = 404; return { error: 'Release not found' } }
    return release
  })

  .post('/', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const { deliveryIds, ...releaseData } = body
    const productId = releaseData.productId || ''
    if (!productId) {
      set.status = 400
      return { error: 'productId is required' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'releases',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [countResult] = await db.select({ total: count() }).from(releases).where(eq(releases.productId, productId))
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
      productId: release!.productId,
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

  .put('/:id', async ({ params: { id }, body, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireReleaseAccess(id, 'edit', jwt.verify, headers, set)
    if (!access) return set.status === 404 ? { error: 'Release not found' } : { error: 'Forbidden' }

    const old = await db.query.releases.findFirst({ where: eq(releases.id, id) })
    if (!old) { set.status = 404; return { error: 'Release not found' } }

    const { deliveryIds, ...releaseData } = body
    const updateData: Record<string, any> = { ...releaseData, updatedAt: new Date() }
    if (releaseData.plannedAt !== undefined) {
      updateData.plannedAt = releaseData.plannedAt ? new Date(releaseData.plannedAt) : null
    }

    const [updated] = await db.update(releases)
      .set(updateData)
      .where(eq(releases.id, id))
      .returning()

    if (deliveryIds !== undefined) {
      await db.delete(releaseDeliveries).where(eq(releaseDeliveries.releaseId, id))
      if (deliveryIds.length > 0) {
        await db.insert(releaseDeliveries).values(
          deliveryIds.map((did, i) => ({
            releaseId: id,
            deliveryId: did,
            deploymentOrder: i + 1,
            addedByUserId: user.id,
          }))
        )
      }
    }

    const changes = computeChanges(old, releaseData, ['title', 'status', 'version', 'releaseType', 'notes', 'releaseNotes', 'releaseManagerId'])
    if (changes.length > 0) {
      logActivity({
        productId: updated!.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'release',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }
    return updated
  }, { body: t.Partial(releaseBody) })

  .delete('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireReleaseAccess(id, 'delete', jwt.verify, headers, set)
    if (!access) return set.status === 404 ? { error: 'Release not found' } : { error: 'Forbidden' }

    const [deleted] = await db.delete(releases)
      .where(eq(releases.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Release not found' } }

    logActivity({
      productId: deleted.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'release',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })
    return { success: true }
  })

  .post('/:id/deployments/:deploymentId/targets', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireReleaseAccess(params.id, 'edit', jwt.verify, headers, set)
    if (!access) return set.status === 404 ? { error: 'Release not found' } : { error: 'Forbidden' }

    const { serverIds } = body
    if (!serverIds || serverIds.length === 0) {
      set.status = 400
      return { error: 'No server IDs provided' }
    }

    const deployment = await getDeploymentForRelease(params.id, params.deploymentId)
    if (!deployment) { set.status = 404; return { error: 'Deployment not found' } }

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

  .put('/:id/deployments/:deploymentId/targets/:targetId', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireReleaseAccess(params.id, 'edit', jwt.verify, headers, set)
    if (!access) return set.status === 404 ? { error: 'Release not found' } : { error: 'Forbidden' }

    const deployment = await getDeploymentForRelease(params.id, params.deploymentId)
    if (!deployment) { set.status = 404; return { error: 'Deployment not found' } }

    const target = await getTargetForDeployment(params.targetId, params.deploymentId)
    if (!target) { set.status = 404; return { error: 'Target not found' } }

    const updateData: Record<string, any> = { status: body.status }
    if (body.status === 'deployed') updateData.deployedAt = new Date()
    if (body.status === 'failed') updateData.failedAt = new Date()

    const [updated] = await db.update(deploymentTargets)
      .set(updateData)
      .where(eq(deploymentTargets.id, params.targetId))
      .returning()
    if (!updated) { set.status = 404; return { error: 'Target not found' } }

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

  .put('/:id/deployments/:deploymentId', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireReleaseAccess(params.id, 'edit', jwt.verify, headers, set)
    if (!access) return set.status === 404 ? { error: 'Release not found' } : { error: 'Forbidden' }

    const deployment = await getDeploymentForRelease(params.id, params.deploymentId)
    if (!deployment) { set.status = 404; return { error: 'Deployment not found' } }

    const updateData: Record<string, any> = {}
    if (body.status) updateData.status = body.status
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.status === 'deploying') updateData.startedAt = new Date()
    if (body.status === 'deployed') updateData.completedAt = new Date()
    if (body.status === 'failed') updateData.failedAt = new Date()
    updateData.deployedByUserId = user.id

    const [updated] = await db.update(releaseDeployments)
      .set(updateData)
      .where(eq(releaseDeployments.id, params.deploymentId))
      .returning()
    if (!updated) { set.status = 404; return { error: 'Deployment not found' } }

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

  .delete('/:id/deployments/:deploymentId/targets/:targetId', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireReleaseAccess(params.id, 'delete', jwt.verify, headers, set)
    if (!access) return set.status === 404 ? { error: 'Release not found' } : { error: 'Forbidden' }

    const deployment = await getDeploymentForRelease(params.id, params.deploymentId)
    if (!deployment) { set.status = 404; return { error: 'Deployment not found' } }

    const target = await getTargetForDeployment(params.targetId, params.deploymentId)
    if (!target) { set.status = 404; return { error: 'Target not found' } }

    const [deleted] = await db.delete(deploymentTargets)
      .where(eq(deploymentTargets.id, params.targetId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Target not found' } }

    await recomputeStatuses(params.id)
    return { success: true }
  })
