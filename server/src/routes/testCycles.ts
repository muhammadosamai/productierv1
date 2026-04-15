import { Elysia, t } from 'elysia'
import { db } from '../db'
import { testCycles, testCycleIssues, users } from '../db/schema'
import { eq, count } from 'drizzle-orm'
import { resolveProductByScope, whereDenormProductMatches, denormalizedProductScopeValue } from '../lib/resolveProductScope'
import {
  getAllowedIssueStatusStoredValues,
  mergeIssueFormConfigForProduct,
  normalizeIssueStatusToCanonicalId,
  pickDefaultIssueStatus,
} from '../lib/issueFormConfig'
import { ensureFormConfigsSchema } from '../lib/ensureFormConfigsSchema'
import { jwt } from '@elysiajs/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

function parseCycleTitle(title: string) {
  const match = title.match(/^(#\d+)\s+(.*)$/)
  if (match) return { prefix: match[1], rest: match[2] }
  return { prefix: '', rest: title }
}

async function getUserFromHeader(jwtVerify: any, headers: Record<string, string | undefined>) {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const payload = await jwtVerify(token)
  if (!payload?.userId) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId as string) })
  return user || null
}

export const testCycleRoutes = new Elysia({ prefix: '/api/test-cycles' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))
  .onBeforeHandle(async () => {
    await ensureFormConfigsSchema()
  })

  // GET /api/test-cycles?product=X
  .get('/', async ({ query }) => {
    const product = query.product?.trim()
    const scopeRow = product ? await resolveProductByScope(product) : null
    return db.query.testCycles.findMany({
      where: scopeRow ? whereDenormProductMatches(testCycles.productId, scopeRow) : undefined,
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      with: {
        createdByUser: true,
        delivery: true,
        release: true,
        issues: {
          with: { reportedByUser: true, assignedToUser: true, story: true },
        },
      },
    })
  })

  // GET /api/test-cycles/:id
  .get('/:id', async ({ params: { id }, set }) => {
    const cycle = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, id),
      with: {
        createdByUser: true,
        delivery: true,
        release: true,
        issues: {
          with: { reportedByUser: true, assignedToUser: true, story: true },
          orderBy: (i, { desc }) => [desc(i.createdAt)],
        },
      },
    })
    if (!cycle) { set.status = 404; return { error: 'Test cycle not found' } }
    return cycle
  })

  // POST /api/test-cycles
  .post('/', async ({ body, jwt, headers, set }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const sr = await resolveProductByScope(body.productId)
    if (!sr) {
      set.status = 404
      return { error: 'Product not found' }
    }
    const productId = denormalizedProductScopeValue(sr)

    // Auto-number: count existing cycles for this product
    const [{ value: total }] = await db.select({ value: count() }).from(testCycles).where(whereDenormProductMatches(testCycles.productId, sr))
    const num = (total || 0) + 1

    const [cycle] = await db.insert(testCycles).values({
      title: `#${num} ${body.title}`,
      description: body.description || null,
      status: body.status || 'planned',
      deliveryId: body.deliveryId || null,
      releaseId: body.releaseId || null,
      productId,
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      createdByUserId: user.id,
    }).returning()

    const full = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, cycle!.id),
      with: { createdByUser: true, delivery: true, release: true, issues: true },
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
  .put('/:id', async ({ params: { id }, body, set }) => {
    const existing = await db.query.testCycles.findFirst({ where: eq(testCycles.id, id) })
    if (!existing) { set.status = 404; return { error: 'Test cycle not found' } }

    const updateData: Record<string, unknown> = { ...body }
    if (body.title !== undefined) {
      const existingPrefix = parseCycleTitle(existing.title).prefix
      const nextRest = parseCycleTitle(body.title).rest.trim()
      if (!nextRest) {
        set.status = 400
        return { error: 'Title is required' }
      }
      updateData.title = existingPrefix ? `${existingPrefix} ${nextRest}` : nextRest
    }

    const [updated] = await db.update(testCycles)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(testCycles.id, id))
      .returning()

    const full = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, updated!.id),
      with: { createdByUser: true, delivery: true, release: true, issues: true },
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
  .delete('/:id', async ({ params: { id }, set }) => {
    const [deleted] = await db.delete(testCycles).where(eq(testCycles.id, id)).returning()
    if (!deleted) { set.status = 404; return { error: 'Test cycle not found' } }
    return { success: true }
  })

  // ── Issues ──

  // POST /api/test-cycles/:id/issues
  .post('/:id/issues', async ({ params: { id }, body, jwt, headers, set }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const cycle = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, id),
      columns: { id: true, productId: true },
    })
    if (!cycle) { set.status = 404; return { error: 'Test cycle not found' } }

    const merged = await mergeIssueFormConfigForProduct(cycle.productId)
    const allowedList = getAllowedIssueStatusStoredValues(merged)
    const allowedSet = new Set(allowedList)
    let statusVal: string
    if (body.status != null && body.status !== '') {
      const raw = String(body.status).trim()
      if (!allowedSet.has(raw)) {
        set.status = 400
        return { error: `Invalid status for this product. Allowed: ${allowedList.join(', ')}` }
      }
      statusVal = normalizeIssueStatusToCanonicalId(merged, raw) ?? raw
    } else {
      statusVal = pickDefaultIssueStatus(merged)
    }

    const [issue] = await db.insert(testCycleIssues).values({
      testCycleId: id,
      title: body.title,
      description: body.description || null,
      severity: body.severity || 'minor',
      status: statusVal,
      storyId: body.storyId || null,
      reportedByUserId: user.id,
      assignedToUserId: body.assignedToUserId || null,
    }).returning()

    const full = await db.query.testCycleIssues.findFirst({
      where: eq(testCycleIssues.id, issue!.id),
      with: { reportedByUser: true, assignedToUser: true, story: true },
    })
    return full
  }, {
    body: t.Object({
      title: t.String({ minLength: 1 }),
      description: t.Optional(t.Nullable(t.String())),
      severity: t.Optional(t.Union([
        t.Literal('blocker'), t.Literal('critical'), t.Literal('major'), t.Literal('minor'), t.Literal('trivial'),
      ])),
      status: t.Optional(t.Nullable(t.String({ maxLength: 64 }))),
      storyId: t.Optional(t.Nullable(t.String())),
      assignedToUserId: t.Optional(t.Nullable(t.String())),
    }),
  })

  // PUT /api/test-cycles/:id/issues/:issueId
  .put('/:id/issues/:issueId', async ({ params, body, set }) => {
    const existing = await db.query.testCycleIssues.findFirst({ where: eq(testCycleIssues.id, params.issueId) })
    if (!existing) { set.status = 404; return { error: 'Issue not found' } }

    const cycle = await db.query.testCycles.findFirst({
      where: eq(testCycles.id, existing.testCycleId),
      columns: { productId: true },
    })
    const productId = cycle?.productId ?? ''

    const merged = await mergeIssueFormConfigForProduct(productId)
    const allowedList = getAllowedIssueStatusStoredValues(merged)

    if (body.status !== undefined && body.status !== null) {
      const raw = String(body.status).trim()
      if (!allowedList.includes(raw)) {
        set.status = 400
        return { error: `Invalid status for this product. Allowed: ${allowedList.join(', ')}` }
      }
    }

    const bodyNorm = { ...body } as Record<string, unknown>
    if (body.status !== undefined && body.status !== null) {
      const raw = String(body.status).trim()
      bodyNorm.status = normalizeIssueStatusToCanonicalId(merged, raw) ?? raw
    }

    const [updated] = await db.update(testCycleIssues)
      .set({ ...bodyNorm, updatedAt: new Date() })
      .where(eq(testCycleIssues.id, params.issueId))
      .returning()

    const full = await db.query.testCycleIssues.findFirst({
      where: eq(testCycleIssues.id, updated!.id),
      with: { reportedByUser: true, assignedToUser: true, story: true },
    })
    return full
  }, {
    body: t.Partial(t.Object({
      title: t.String({ minLength: 1 }),
      description: t.Nullable(t.String()),
      severity: t.Union([
        t.Literal('blocker'), t.Literal('critical'), t.Literal('major'), t.Literal('minor'), t.Literal('trivial'),
      ]),
      status: t.String({ maxLength: 64 }),
      storyId: t.Nullable(t.String()),
      assignedToUserId: t.Nullable(t.String()),
    })),
  })

  // DELETE /api/test-cycles/:id/issues/:issueId
  .delete('/:id/issues/:issueId', async ({ params, set }) => {
    const [deleted] = await db.delete(testCycleIssues).where(eq(testCycleIssues.id, params.issueId)).returning()
    if (!deleted) { set.status = 404; return { error: 'Issue not found' } }
    return { success: true }
  })
