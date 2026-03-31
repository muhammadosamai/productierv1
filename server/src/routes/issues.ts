import { Elysia, t } from 'elysia'
import { and, eq, ilike, or } from 'drizzle-orm'
import { db } from '../db'
import { issues } from '../db/schema'
import { computeChanges, logActivity } from '../lib/logActivity'
import { invalidateMetricsForProduct } from '../lib/metricsCache'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireProductPageAction } from '../lib/authz'
import { resolveProductIdInput } from '../lib/productResolver'
import { resolveProductOrganizationId, validateDualAssignmentTargets } from '../lib/assignmentTargets'

const issueBody = t.Object({
  productId: t.Optional(t.String({ minLength: 1 })),
  product: t.Optional(t.String()),
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  severity: t.Optional(t.Union([
    t.Literal('critical'),
    t.Literal('major'),
    t.Literal('minor'),
    t.Literal('trivial'),
  ])),
  status: t.Optional(t.Union([
    t.Literal('open'),
    t.Literal('in_progress'),
    t.Literal('resolved'),
    t.Literal('closed'),
    t.Literal('deferred'),
  ])),
  source: t.Optional(t.Union([
    t.Literal('standalone'),
    t.Literal('test_cycle'),
  ])),
  storyId: t.Optional(t.Nullable(t.String())),
  initiativeId: t.Optional(t.Nullable(t.String())),
  deliveryId: t.Optional(t.Nullable(t.String())),
  testCycleId: t.Optional(t.Nullable(t.String())),
  assignedToUserId: t.Optional(t.Nullable(t.String())),
  assignedToTeamId: t.Optional(t.Nullable(t.String())),
  resolutionSummary: t.Optional(t.Nullable(t.String())),
})

export const issuesRoutes = new Elysia({ prefix: '/api/issues' })
  .use(authPlugin)

  // GET /api/issues?productId=...&status=...&severity=...&source=...&assignedToUserId=...&q=...
  .get('/', async ({ query, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const requestedProductId = await resolveProductIdInput(query.productId || (query as any).product)
    if (!requestedProductId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: requestedProductId,
      page: 'issues',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const conditions: any[] = []
    conditions.push(eq(issues.productId, requestedProductId))
    if (query.status) conditions.push(eq(issues.status, query.status as any))
    if (query.severity) conditions.push(eq(issues.severity, query.severity as any))
    if (query.source) conditions.push(eq(issues.source, query.source as any))
    if (query.assignedToUserId) conditions.push(eq(issues.assignedToUserId, query.assignedToUserId))
    if (query.assignedToTeamId) conditions.push(eq(issues.assignedToTeamId, query.assignedToTeamId))
    if (query.q?.trim()) {
      const q = query.q.trim()
      conditions.push(or(
        ilike(issues.title, `%${q}%`),
        ilike(issues.description, `%${q}%`)
      )!)
    }

    const pagedFlag = String((query as Record<string, unknown>).paged ?? '').toLowerCase()
    const paged = pagedFlag === '1' || pagedFlag === 'true'
    const requestedLimit = Number.parseInt(String((query as Record<string, unknown>).limit ?? '50'), 10)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 50
    const requestedOffset = Number.parseInt(String((query as Record<string, unknown>).cursor ?? '0'), 10)
    const offset = Number.isFinite(requestedOffset) && requestedOffset > 0
      ? requestedOffset
      : 0

    const rows = await db.query.issues.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (i, { desc }) => [desc(i.createdAt)],
      limit: paged ? limit + 1 : undefined,
      offset: paged ? offset : undefined,
      with: {
        story: { columns: { id: true, title: true, initiativeId: true } },
        initiative: { columns: { id: true, title: true, status: true } },
        delivery: { columns: { id: true, title: true, status: true } },
        testCycle: { columns: { id: true, title: true, status: true } },
        reportedByUser: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedToUser: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedToTeam: { columns: { id: true, name: true, key: true } },
      },
    })

    if (!paged) return rows

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    return {
      items,
      nextCursor: hasMore ? String(offset + items.length) : null,
      hasMore,
      totalApprox: offset + items.length + (hasMore ? 1 : 0),
    }
  }, {
    query: t.Object({
      productId: t.Optional(t.String()),
      product: t.Optional(t.String()),
      status: t.Optional(t.String()),
      severity: t.Optional(t.String()),
      source: t.Optional(t.String()),
      assignedToUserId: t.Optional(t.String()),
      assignedToTeamId: t.Optional(t.String()),
      q: t.Optional(t.String()),
      paged: t.Optional(t.Union([t.String(), t.Boolean(), t.Number()])),
      limit: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
    }),
  })

  // GET /api/issues/:id
  .get('/:id', async ({ params, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const issue = await db.query.issues.findFirst({
      where: eq(issues.id, params.id),
      with: {
        story: { columns: { id: true, title: true, initiativeId: true } },
        initiative: { columns: { id: true, title: true, status: true } },
        delivery: { columns: { id: true, title: true, status: true } },
        testCycle: { columns: { id: true, title: true, status: true } },
        reportedByUser: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedToUser: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedToTeam: { columns: { id: true, name: true, key: true } },
      },
    })
    if (!issue) { set.status = 404; return { error: 'Issue not found' } }
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: issue.productId,
      page: 'issues',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    return issue
  })

  // POST /api/issues
  .post('/', async ({ body, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const productId = await resolveProductIdInput(body.productId || body.product)
    if (!productId) {
      set.status = 400
      return { error: 'productId is required' }
    }

    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId,
      page: 'issues',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const organizationId = await resolveProductOrganizationId(productId)
    const assignmentValidation = await validateDualAssignmentTargets({
      organizationId,
      userIds: [body.assignedToUserId],
      teamIds: [body.assignedToTeamId],
    })
    if (!assignmentValidation.ok) {
      set.status = assignmentValidation.status || 400
      return { error: assignmentValidation.error || 'Invalid assignment targets' }
    }

    const [created] = await db.insert(issues).values({
      productId,
      title: body.title,
      description: body.description || null,
      severity: body.severity || 'minor',
      status: body.status || 'open',
      source: body.source || 'standalone',
      storyId: body.storyId || null,
      initiativeId: body.initiativeId || null,
      deliveryId: body.deliveryId || null,
      testCycleId: body.testCycleId || null,
      reportedByUserId: actor.id,
      assignedToUserId: body.assignedToUserId || null,
      assignedToTeamId: body.assignedToTeamId || null,
      resolutionSummary: body.resolutionSummary || null,
    }).returning()

    logActivity({
      productId: created!.productId,
      userName: actor.name,
      userAvatar: actor.avatar,
      userId: actor.id,
      action: 'created',
      entityType: 'issue',
      entityId: created!.id,
      entityTitle: created!.title,
    })

    await invalidateMetricsForProduct(created!.productId)

    return db.query.issues.findFirst({
      where: eq(issues.id, created!.id),
      with: {
        story: { columns: { id: true, title: true, initiativeId: true } },
        initiative: { columns: { id: true, title: true, status: true } },
        delivery: { columns: { id: true, title: true, status: true } },
        testCycle: { columns: { id: true, title: true, status: true } },
        reportedByUser: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedToUser: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedToTeam: { columns: { id: true, name: true, key: true } },
      },
    })
  }, { body: issueBody })

  // PUT /api/issues/:id
  .put('/:id', async ({ params, body, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const existing = await db.query.issues.findFirst({ where: eq(issues.id, params.id) })
    if (!existing) { set.status = 404; return { error: 'Issue not found' } }
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: existing.productId,
      page: 'issues',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const { product: _product, productId: _productId, ...rest } = body
    const organizationId = await resolveProductOrganizationId(existing.productId)
    const assignmentValidation = await validateDualAssignmentTargets({
      organizationId,
      userIds: [rest.assignedToUserId !== undefined ? rest.assignedToUserId : existing.assignedToUserId],
      teamIds: [rest.assignedToTeamId !== undefined ? rest.assignedToTeamId : existing.assignedToTeamId],
    })
    if (!assignmentValidation.ok) {
      set.status = assignmentValidation.status || 400
      return { error: assignmentValidation.error || 'Invalid assignment targets' }
    }

    const [updated] = await db.update(issues)
      .set({
        ...rest,
        description: rest.description !== undefined ? (rest.description || null) : undefined,
        storyId: rest.storyId !== undefined ? (rest.storyId || null) : undefined,
        initiativeId: rest.initiativeId !== undefined ? (rest.initiativeId || null) : undefined,
        deliveryId: rest.deliveryId !== undefined ? (rest.deliveryId || null) : undefined,
        testCycleId: rest.testCycleId !== undefined ? (rest.testCycleId || null) : undefined,
        assignedToUserId: rest.assignedToUserId !== undefined ? (rest.assignedToUserId || null) : undefined,
        assignedToTeamId: rest.assignedToTeamId !== undefined ? (rest.assignedToTeamId || null) : undefined,
        resolutionSummary: rest.resolutionSummary !== undefined ? (rest.resolutionSummary || null) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, params.id))
      .returning()

    const changes = computeChanges(existing, body, [
      'title', 'description', 'severity', 'status', 'source',
      'storyId', 'initiativeId', 'deliveryId', 'testCycleId',
      'assignedToUserId', 'assignedToTeamId', 'resolutionSummary',
    ])

    if (changes.length > 0) {
      logActivity({
        productId: updated!.productId,
        userName: actor.name,
        userAvatar: actor.avatar,
        userId: actor.id,
        action: 'updated',
        entityType: 'issue',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }

    await invalidateMetricsForProduct(updated!.productId)

    return db.query.issues.findFirst({
      where: eq(issues.id, updated!.id),
      with: {
        story: { columns: { id: true, title: true, initiativeId: true } },
        initiative: { columns: { id: true, title: true, status: true } },
        delivery: { columns: { id: true, title: true, status: true } },
        testCycle: { columns: { id: true, title: true, status: true } },
        reportedByUser: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedToUser: { columns: { id: true, name: true, email: true, avatar: true } },
        assignedToTeam: { columns: { id: true, name: true, key: true } },
      },
    })
  }, { body: t.Partial(issueBody) })

  // DELETE /api/issues/:id
  .delete('/:id', async ({ params, jwt: jwtInstance, headers, set }) => {
    const actor = await requireAuth(jwtInstance.verify, headers, set)
    if (!actor) return { error: 'Unauthorized' }

    const existing = await db.query.issues.findFirst({
      where: eq(issues.id, params.id),
      columns: { id: true, productId: true },
    })
    if (!existing) { set.status = 404; return { error: 'Issue not found' } }
    const access = await requireProductPageAction(jwtInstance.verify, headers, set, {
      productId: existing.productId,
      page: 'issues',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [deleted] = await db.delete(issues)
      .where(eq(issues.id, params.id))
      .returning()

    if (!deleted) { set.status = 404; return { error: 'Issue not found' } }

    logActivity({
      productId: deleted.productId,
      userName: actor.name,
      userAvatar: actor.avatar,
      userId: actor.id,
      action: 'deleted',
      entityType: 'issue',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })

    await invalidateMetricsForProduct(deleted.productId)

    return { success: true }
  })
