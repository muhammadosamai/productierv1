import { Elysia, t } from 'elysia'
import { db } from '../db'
import { testCycles, testCycleIssues } from '../db/schema'
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireProductPageAction } from '../lib/authz'
import { publicUserColumns } from '../lib/serializers'
import { computeChanges, logActivity } from '../lib/logActivity'
import {
  decodeCursor,
  encodeCursor,
  isLegacyListMode,
  parseListQuery,
  parseSort,
  toListEnvelope,
} from '../lib/listContract'
import { resolveProductOrganizationId, validateDualAssignmentTargets } from '../lib/assignmentTargets'

export const testCycleRoutes = new Elysia({ prefix: '/api/test-cycles' })
  .use(authPlugin)

  // GET /api/test-cycles?productId=X
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
      page: 'test-cycles',
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
      return db.query.testCycles.findMany({
        where: and(
          eq(testCycles.productId, productId),
          ...(qTerm
            ? [or(
              ilike(testCycles.title, `%${qTerm}%`),
              ilike(testCycles.description, `%${qTerm}%`),
            )!]
            : []),
        ),
        orderBy: (c, { desc }) => [desc(c.createdAt)],
        with: {
          createdByUser: { columns: publicUserColumns },
          delivery: true,
          release: true,
          issues: {
            with: {
              reportedByUser: { columns: publicUserColumns },
              assignedToUser: { columns: publicUserColumns },
              assignedToTeam: { columns: { id: true, name: true, key: true } },
              story: true,
            },
          },
        },
      })
    }

    const sort = parseSort(parsedList.sort, ['createdAt', 'updatedAt'] as const, {
      field: 'createdAt',
      direction: 'desc',
      raw: 'createdAt:desc',
    })
    const cursor = decodeCursor(parsedList.cursor)
    const baseConditions = [eq(testCycles.productId, productId)]
    if (qTerm) {
      baseConditions.push(or(
        ilike(testCycles.title, `%${qTerm}%`),
        ilike(testCycles.description, `%${qTerm}%`),
      )!)
    }

    const conditions = [...baseConditions]
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt)
      if (!Number.isNaN(cursorDate.getTime())) {
        if (sort.field === 'updatedAt') {
          if (sort.direction === 'desc') {
            conditions.push(sql`(${testCycles.updatedAt} < ${cursorDate} OR (${testCycles.updatedAt} = ${cursorDate} AND ${testCycles.id} < ${cursor.id}))`)
          } else {
            conditions.push(sql`(${testCycles.updatedAt} > ${cursorDate} OR (${testCycles.updatedAt} = ${cursorDate} AND ${testCycles.id} > ${cursor.id}))`)
          }
        } else if (sort.direction === 'desc') {
          conditions.push(sql`(${testCycles.createdAt} < ${cursorDate} OR (${testCycles.createdAt} = ${cursorDate} AND ${testCycles.id} < ${cursor.id}))`)
        } else {
          conditions.push(sql`(${testCycles.createdAt} > ${cursorDate} OR (${testCycles.createdAt} = ${cursorDate} AND ${testCycles.id} > ${cursor.id}))`)
        }
      }
    }

    const orderField = sort.field === 'updatedAt' ? testCycles.updatedAt : testCycles.createdAt
    const rows = await db.query.testCycles.findMany({
      where: and(...conditions),
      orderBy: sort.direction === 'desc'
        ? [desc(orderField as any), desc(testCycles.id)]
        : [asc(orderField as any), asc(testCycles.id)],
      limit: parsedList.limit + 1,
      with: {
        createdByUser: { columns: publicUserColumns },
        delivery: true,
        release: true,
      },
    })

    const hasMore = rows.length > parsedList.limit
    const items = hasMore ? rows.slice(0, parsedList.limit) : rows
    const ids = items.map(item => item.id)
    const issueCounts = ids.length > 0
      ? await db.select({
        testCycleId: testCycleIssues.testCycleId,
        count: sql<number>`count(*)::int`,
      }).from(testCycleIssues)
        .where(inArray(testCycleIssues.testCycleId, ids))
        .groupBy(testCycleIssues.testCycleId)
      : []
    const issueCountMap = new Map<string, number>()
    for (const row of issueCounts) issueCountMap.set(row.testCycleId, Number(row.count ?? 0))

    const enrichedItems = items.map(item => ({
      ...item,
      issueCount: issueCountMap.get(item.id) || 0,
    }))

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor({
        id: items[items.length - 1]!.id,
        createdAt: new Date(
          sort.field === 'updatedAt'
            ? items[items.length - 1]!.updatedAt
            : items[items.length - 1]!.createdAt,
        ).toISOString(),
      })
      : null

    let totalApprox: number | undefined
    if (!parsedList.cursor) {
      const [countRow] = await db.select({
        value: sql<number>`count(*)::int`,
      }).from(testCycles).where(and(...baseConditions))
      totalApprox = Number(countRow?.value ?? 0)
    }

    return toListEnvelope({
      items: enrichedItems,
      hasMore,
      nextCursor,
      totalApprox,
    })
  })

  // GET /api/test-cycles/:id
  .get('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, id),
      columns: { id: true, productId: true },
    })
    if (!existing) { set.status = 404; return { error: 'Test cycle not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'test-cycles',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const cycle = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, id),
      with: {
        createdByUser: { columns: publicUserColumns },
        delivery: true,
        release: true,
        issues: {
          with: {
            reportedByUser: { columns: publicUserColumns },
            assignedToUser: { columns: publicUserColumns },
            assignedToTeam: { columns: { id: true, name: true, key: true } },
            story: true,
          },
          orderBy: (i, { desc }) => [desc(i.createdAt)],
        },
      },
    })
    if (!cycle) { set.status = 404; return { error: 'Test cycle not found' } }
    return cycle
  })

  // POST /api/test-cycles
  .post('/', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: body.productId,
      page: 'test-cycles',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [{ value: total }] = await db.select({ value: count() }).from(testCycles).where(eq(testCycles.productId, body.productId))
    const num = (total || 0) + 1

    const [cycle] = await db.insert(testCycles).values({
      title: `#${num} ${body.title}`,
      description: body.description || null,
      status: body.status || 'planned',
      deliveryId: body.deliveryId || null,
      releaseId: body.releaseId || null,
      productId: body.productId,
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      createdByUserId: user.id,
    }).returning()

    logActivity({
      productId: cycle!.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'test_cycle',
      entityId: cycle!.id,
      entityTitle: cycle!.title,
      routePathOverride: `/test-cycles/${cycle!.id}`,
      subjectUserIds: [cycle!.createdByUserId],
    })

    const full = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, cycle!.id),
      with: {
        createdByUser: { columns: publicUserColumns },
        delivery: true,
        release: true,
        issues: true,
      },
    })
    return full
  }, {
    body: t.Object({
      title: t.String({ minLength: 1 }),
      description: t.Optional(t.Nullable(t.String())),
      status: t.Optional(t.Union([
        t.Literal('planned'), t.Literal('in_progress'), t.Literal('completed'), t.Literal('archived'),
      ])),
      deliveryId: t.Optional(t.Nullable(t.String())),
      releaseId: t.Optional(t.Nullable(t.String())),
      productId: t.String(),
      startDate: t.Optional(t.Nullable(t.String())),
      endDate: t.Optional(t.Nullable(t.String())),
    }),
  })

  // PUT /api/test-cycles/:id
  .put('/:id', async ({ params: { id }, body, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.testCycles.findFirst({ where: eq(testCycles.id, id) })
    if (!existing) { set.status = 404; return { error: 'Test cycle not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'test-cycles',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [updated] = await db.update(testCycles)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(testCycles.id, id))
      .returning()

    const changes = computeChanges(existing as Record<string, any>, body as Record<string, any>, [
      'title',
      'description',
      'status',
      'deliveryId',
      'releaseId',
      'startDate',
      'endDate',
    ])
    if (changes.length > 0) {
      logActivity({
        productId: updated!.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'test_cycle',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
        routePathOverride: `/test-cycles/${updated!.id}`,
        subjectUserIds: [existing.createdByUserId],
      })
    }

    const full = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, updated!.id),
      with: {
        createdByUser: { columns: publicUserColumns },
        delivery: true,
        release: true,
        issues: true,
      },
    })
    return full
  }, {
    body: t.Partial(t.Object({
      title: t.String({ minLength: 1 }),
      description: t.Nullable(t.String()),
      status: t.Union([
        t.Literal('planned'), t.Literal('in_progress'), t.Literal('completed'), t.Literal('archived'),
      ]),
      deliveryId: t.Nullable(t.String()),
      releaseId: t.Nullable(t.String()),
      startDate: t.Nullable(t.String()),
      endDate: t.Nullable(t.String()),
    })),
  })

  // DELETE /api/test-cycles/:id
  .delete('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const existing = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, id),
      columns: { id: true, productId: true },
    })
    if (!existing) { set.status = 404; return { error: 'Test cycle not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: existing.productId,
      page: 'test-cycles',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [deleted] = await db.delete(testCycles).where(eq(testCycles.id, id)).returning()
    if (!deleted) { set.status = 404; return { error: 'Test cycle not found' } }

    logActivity({
      productId: deleted.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'test_cycle',
      entityId: deleted.id,
      entityTitle: deleted.title,
      routePathOverride: '/test-cycles',
      subjectUserIds: [deleted.createdByUserId],
    })

    return { success: true }
  })

  // ── Issues ──

  // POST /api/test-cycles/:id/issues
  .post('/:id/issues', async ({ params: { id }, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const cycle = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, id),
      columns: { id: true, productId: true },
    })
    if (!cycle) { set.status = 404; return { error: 'Test cycle not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: cycle.productId,
      page: 'issues',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    const organizationId = await resolveProductOrganizationId(cycle.productId)
    const assignmentValidation = await validateDualAssignmentTargets({
      organizationId,
      userIds: [body.assignedToUserId],
      teamIds: [body.assignedToTeamId],
    })
    if (!assignmentValidation.ok) {
      set.status = assignmentValidation.status || 400
      return { error: assignmentValidation.error || 'Invalid assignment targets' }
    }

    const [issue] = await db.insert(testCycleIssues).values({
      testCycleId: id,
      title: body.title,
      description: body.description || null,
      severity: body.severity || 'minor',
      status: body.status || 'open',
      storyId: body.storyId || null,
      reportedByUserId: user.id,
      assignedToUserId: body.assignedToUserId || null,
      assignedToTeamId: body.assignedToTeamId || null,
    }).returning()

    const issueSubjects = [issue!.reportedByUserId, issue!.assignedToUserId]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
    logActivity({
      productId: cycle.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'test_cycle_issue',
      entityId: issue!.id,
      entityTitle: issue!.title,
      routePathOverride: `/test-cycles/${id}`,
      subjectUserIds: issueSubjects,
    })

    const full = await db.query.testCycleIssues.findFirst({
      where: eq(testCycleIssues.id, issue!.id),
      with: {
        reportedByUser: { columns: publicUserColumns },
        assignedToUser: { columns: publicUserColumns },
        assignedToTeam: { columns: { id: true, name: true, key: true } },
        story: true,
      },
    })
    return full
  }, {
    body: t.Object({
      title: t.String({ minLength: 1 }),
      description: t.Optional(t.Nullable(t.String())),
      severity: t.Optional(t.Union([
        t.Literal('critical'), t.Literal('major'), t.Literal('minor'), t.Literal('trivial'),
      ])),
      status: t.Optional(t.Union([
        t.Literal('open'), t.Literal('in_progress'), t.Literal('resolved'), t.Literal('closed'), t.Literal('deferred'),
      ])),
      storyId: t.Optional(t.Nullable(t.String())),
      assignedToUserId: t.Optional(t.Nullable(t.String())),
      assignedToTeamId: t.Optional(t.Nullable(t.String())),
    }),
  })

  // PUT /api/test-cycles/:id/issues/:issueId
  .put('/:id/issues/:issueId', async ({ params, body, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const cycle = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, params.id),
      columns: { id: true, productId: true },
    })
    if (!cycle) { set.status = 404; return { error: 'Test cycle not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: cycle.productId,
      page: 'issues',
      action: 'edit',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const existing = await db.query.testCycleIssues.findFirst({ where: eq(testCycleIssues.id, params.issueId) })
    if (!existing) { set.status = 404; return { error: 'Issue not found' } }
    const organizationId = await resolveProductOrganizationId(cycle.productId)
    const assignmentValidation = await validateDualAssignmentTargets({
      organizationId,
      userIds: [body.assignedToUserId !== undefined ? body.assignedToUserId : existing.assignedToUserId],
      teamIds: [body.assignedToTeamId !== undefined ? body.assignedToTeamId : existing.assignedToTeamId],
    })
    if (!assignmentValidation.ok) {
      set.status = assignmentValidation.status || 400
      return { error: assignmentValidation.error || 'Invalid assignment targets' }
    }

    const [updated] = await db.update(testCycleIssues)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(testCycleIssues.id, params.issueId))
      .returning()

    const changes = computeChanges(existing as Record<string, any>, body as Record<string, any>, [
      'title',
      'description',
      'severity',
      'status',
      'storyId',
      'assignedToUserId',
      'assignedToTeamId',
    ])
    if (changes.length > 0) {
      const issueSubjects = [
        existing.reportedByUserId,
        existing.assignedToUserId,
        updated!.reportedByUserId,
        updated!.assignedToUserId,
      ].filter((value): value is string => typeof value === 'string' && value.length > 0)

      logActivity({
        productId: cycle.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'test_cycle_issue',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
        routePathOverride: `/test-cycles/${params.id}`,
        subjectUserIds: issueSubjects,
      })
    }

    const full = await db.query.testCycleIssues.findFirst({
      where: eq(testCycleIssues.id, updated!.id),
      with: {
        reportedByUser: { columns: publicUserColumns },
        assignedToUser: { columns: publicUserColumns },
        assignedToTeam: { columns: { id: true, name: true, key: true } },
        story: true,
      },
    })
    return full
  }, {
    body: t.Partial(t.Object({
      title: t.String({ minLength: 1 }),
      description: t.Nullable(t.String()),
      severity: t.Union([
        t.Literal('critical'), t.Literal('major'), t.Literal('minor'), t.Literal('trivial'),
      ]),
      status: t.Union([
        t.Literal('open'), t.Literal('in_progress'), t.Literal('resolved'), t.Literal('closed'), t.Literal('deferred'),
      ]),
      storyId: t.Nullable(t.String()),
      assignedToUserId: t.Nullable(t.String()),
      assignedToTeamId: t.Nullable(t.String()),
    })),
  })

  // DELETE /api/test-cycles/:id/issues/:issueId
  .delete('/:id/issues/:issueId', async ({ params, set, jwt, headers }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const cycle = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, params.id),
      columns: { id: true, productId: true },
    })
    if (!cycle) { set.status = 404; return { error: 'Test cycle not found' } }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: cycle.productId,
      page: 'issues',
      action: 'delete',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [deleted] = await db.delete(testCycleIssues).where(eq(testCycleIssues.id, params.issueId)).returning()
    if (!deleted) { set.status = 404; return { error: 'Issue not found' } }

    const issueSubjects = [deleted.reportedByUserId, deleted.assignedToUserId]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
    logActivity({
      productId: cycle.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'test_cycle_issue',
      entityId: deleted.id,
      entityTitle: deleted.title,
      routePathOverride: `/test-cycles/${params.id}`,
      subjectUserIds: issueSubjects,
    })

    return { success: true }
  })
