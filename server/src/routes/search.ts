import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { and, arrayContains, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { issueStatusSearchDbValues } from '../lib/issueStatusId'
import { db } from '../db'
import { assets, initiatives, issues, productMembers, products, stories, tasks, users } from '../db/schema'
import { ISSUE_TYPES } from '../../../shared/issueTypes'
import { resolveProductRef } from '../lib/resolveProductRef'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

type ParsedFilters = {
  text: string
  status?: string
  type?: string
  assigneeMe?: boolean
}

type SearchRow = {
  id: string
  publicId: string | null
  title: string
  subtitle: string | null
  product: string
  status?: string | null
  updatedAt?: Date | string | null
}

async function safeQueryRows<T extends SearchRow>(queryPromise: Promise<T[]>) {
  try {
    return await queryPromise
  } catch (error: any) {
    if (error?.code === '42P01') {
      return [] as T[]
    }
    throw error
  }
}

function parseFilters(raw: string): ParsedFilters {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  const freeText: string[] = []
  const filters: ParsedFilters = { text: '' }

  for (const token of tokens) {
    const separator = token.indexOf(':')
    if (separator <= 0) {
      freeText.push(token)
      continue
    }

    const key = token.slice(0, separator).toLowerCase()
    const value = token.slice(separator + 1).toLowerCase()

    if (key === 'status' && value) {
      filters.status = value
      continue
    }
    if (key === 'type' && value) {
      filters.type = value
      continue
    }
    if (key === 'assignee' && value === 'me') {
      filters.assigneeMe = true
      continue
    }

    freeText.push(token)
  }

  filters.text = freeText.join(' ').trim()
  return filters
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

export const searchRoutes = new Elysia({ prefix: '/api/search' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))
  .get('/quick', async ({ query, jwt: jwtInstance, headers, set }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const q = (query.q || '').trim()
    if (!q) {
      set.status = 400
      return { error: 'Query is required' }
    }

    const requestedProduct = query.product?.trim()
    const limit = Math.max(1, Math.min(Number(query.limit || 5), 20))

    let allowedProductIds: string[] = []
    if (user.role === 'super_admin') {
      if (requestedProduct) {
        const pr = await resolveProductRef(requestedProduct)
        if (!pr.ok) {
          return {
            query: q,
            groups: { stories: [], tasks: [], issues: [], initiatives: [], wikiAssets: [] },
            filters: parseFilters(q),
          }
        }
        allowedProductIds = [pr.product.id]
      } else {
        const allP = await db.query.products.findMany({ columns: { id: true } })
        allowedProductIds = allP.map((p) => p.id)
      }
    } else {
      const memberships = await db
        .select({ productId: productMembers.productId })
        .from(productMembers)
        .where(eq(productMembers.userId, user.id))

      const memberIds = new Set(memberships.map((m) => m.productId))
      if (requestedProduct) {
        const pr = await resolveProductRef(requestedProduct)
        if (!pr.ok) {
          set.status = 403
          return { error: 'Forbidden for requested product scope' }
        }
        if (!memberIds.has(pr.product.id)) {
          set.status = 403
          return { error: 'Forbidden for requested product scope' }
        }
        allowedProductIds = [pr.product.id]
      } else {
        allowedProductIds = [...memberIds]
      }
    }

    if (allowedProductIds.length === 0) {
      return {
        query: q,
        groups: {
          stories: [],
          tasks: [],
          issues: [],
          initiatives: [],
          wikiAssets: [],
        },
      }
    }

    const productRows = await db.query.products.findMany({
      where: inArray(products.id, allowedProductIds),
      columns: { id: true, name: true },
    })
    const productIdToName = new Map(productRows.map((p) => [p.id, p.name]))

    const filters = parseFilters(q)
    const textPattern = filters.text ? `%${filters.text}%` : null

    // Valid status values per entity — used to gate which entities are queried
    // when a status: token is present. If the requested status doesn't exist for
    // an entity, that entity returns [] rather than ignoring the filter and
    // returning all results.
    const storyStatuses      = ['backlog', 'drafted', 'initialized', 'in_progress', 'completed', 'archived']
    const taskStatuses       = ['created', 'assigned', 'in_progress', 'in_review', 'done', 'overdue', 'blocked', 'archived']
    // Issue statuses are per-product (form config); issue query uses eq(status) and may return [].
    const initiativeStatuses = ['planning', 'active', 'paused', 'completed']

    // Valid type values per entity
    const storyTypes = ['feature', 'bug', 'improvement', 'technical_debt', 'research', 'infrastructure', 'testing', 'documentation']
    const taskTypes  = ['design', 'development', 'testing', 'review', 'research', 'fix', 'documentation', 'deployment']
    const issueTypes = [...ISSUE_TYPES]
    // Initiatives and wiki have no type field

    // When a status token is present, an entity whose status enum doesn't include
    // that value should return no results — the user explicitly asked for that status.
    const statusAppliesToStory      = !filters.status || storyStatuses.includes(filters.status)
    const statusAppliesToTask       = !filters.status || taskStatuses.includes(filters.status)
    const statusAppliesToIssue      = true
    const statusAppliesToInitiative = !filters.status || initiativeStatuses.includes(filters.status)
    // Wiki assets have no meaningful status filter — hide if status token was provided
    const statusAppliesToWiki       = !filters.status

    // Same gate for type: token — entities without that type return []
    const typeAppliesToStory      = !filters.type || storyTypes.includes(filters.type)
    const typeAppliesToTask       = !filters.type || taskTypes.includes(filters.type)
    const typeAppliesToIssue      = !filters.type || issueTypes.includes(filters.type as (typeof ISSUE_TYPES)[number])
    // Initiatives and wiki have no type field — exclude them if type: was specified
    const typeAppliesToInitiative = !filters.type
    const typeAppliesToWiki       = !filters.type

    const entityAppliesToStory      = statusAppliesToStory      && typeAppliesToStory
    const entityAppliesToTask       = statusAppliesToTask       && typeAppliesToTask
    const entityAppliesToIssue      = statusAppliesToIssue      && typeAppliesToIssue
    const entityAppliesToInitiative = statusAppliesToInitiative && typeAppliesToInitiative
    const entityAppliesToWiki       = statusAppliesToWiki       && typeAppliesToWiki

    const storyConditions: any[] = [inArray(stories.productId, allowedProductIds)]
    if (textPattern) {
      storyConditions.push(
        or(
          ilike(stories.title, textPattern),
          ilike(stories.description, textPattern),
        )
      )
    }
    if (filters.status) storyConditions.push(eq(stories.status, filters.status as any))
    if (filters.type) storyConditions.push(eq(stories.type, filters.type as any))
    if (filters.assigneeMe) storyConditions.push(eq(stories.owner, user.name))

    const taskConditions: any[] = [inArray(tasks.productId, allowedProductIds)]
    if (textPattern) {
      taskConditions.push(
        or(
          ilike(tasks.title, textPattern),
          ilike(tasks.description, textPattern),
        )
      )
    }
    if (filters.status) taskConditions.push(eq(tasks.status, filters.status as any))
    if (filters.type) taskConditions.push(eq(tasks.type, filters.type as any))
    if (filters.assigneeMe) {
      taskConditions.push(
        or(
          eq(tasks.ownerUserId, user.id),
          arrayContains(tasks.assigneeUserIds, [user.id]),
        )
      )
    }

    const issueConditions: any[] = [inArray(issues.productId, allowedProductIds), eq(issues.archived, false)]
    if (textPattern) {
      issueConditions.push(
        or(
          ilike(issues.title, textPattern),
          ilike(issues.description, textPattern),
          ilike(issues.module, textPattern),
        )
      )
    }
    if (filters.status) {
      const variants = issueStatusSearchDbValues(filters.status)
      if (variants.length > 0) issueConditions.push(inArray(issues.status, variants))
    }
    if (filters.type) issueConditions.push(eq(issues.type, filters.type as any))
    if (filters.assigneeMe) issueConditions.push(eq(issues.assignedToUserId, user.id))

    const initiativeConditions: any[] = [inArray(initiatives.productId, allowedProductIds)]
    if (textPattern) {
      initiativeConditions.push(
        or(
          ilike(initiatives.title, textPattern),
          ilike(initiatives.description, textPattern),
        )
      )
    }
    if (filters.status) initiativeConditions.push(eq(initiatives.status, filters.status as any))
    if (filters.assigneeMe) initiativeConditions.push(eq(initiatives.leader, user.name))

    const wikiConditions: any[] = [inArray(assets.productId, allowedProductIds)]
    if (textPattern) {
      wikiConditions.push(
        or(
          ilike(assets.title, textPattern),
          ilike(assets.description, textPattern),
        )
      )
    }

    const [storyRows, taskRows, issueRows, initiativeRows, wikiRows] = await Promise.all([
      entityAppliesToStory ? safeQueryRows(db.select({
        id: stories.id,
        publicId: stories.publicId,
        title: stories.title,
        subtitle: stories.description,
        product: stories.product,
        status: stories.status,
        updatedAt: stories.updatedAt,
      }).from(stories).where(and(...storyConditions)).limit(limit)) : Promise.resolve([]),
      entityAppliesToTask ? safeQueryRows(db.select({
        id: tasks.id,
        publicId: tasks.publicId,
        title: tasks.title,
        subtitle: tasks.description,
        product: tasks.productId,
        status: tasks.status,
        updatedAt: tasks.updatedAt,
      }).from(tasks).where(and(...taskConditions)).limit(limit)) : Promise.resolve([]),
      entityAppliesToIssue ? safeQueryRows(db.select({
        id: issues.id,
        publicId: issues.publicId,
        title: issues.title,
        subtitle: issues.description,
        product: issues.product,
        status: issues.status,
        updatedAt: issues.updatedAt,
      }).from(issues).where(and(...issueConditions)).limit(limit)) : Promise.resolve([]),
      entityAppliesToInitiative ? safeQueryRows(db.select({
        id: initiatives.id,
        publicId: sql<string | null>`NULL`,
        title: initiatives.title,
        subtitle: initiatives.description,
        product: initiatives.product,
        status: initiatives.status,
        updatedAt: initiatives.updatedAt,
      }).from(initiatives).where(and(...initiativeConditions)).limit(limit)) : Promise.resolve([]),
      entityAppliesToWiki ? safeQueryRows(db.select({
        id: assets.id,
        publicId: sql<string | null>`NULL`,
        title: assets.title,
        subtitle: assets.description,
        product: assets.productId,
        status: assets.status,
        updatedAt: assets.updatedAt,
      }).from(assets).where(and(...wikiConditions)).limit(limit)) : Promise.resolve([]),
    ])

    return {
      query: q,
      groups: {
        stories: storyRows.map(row => ({ ...row, entityType: 'story', href: `/stories?story=${row.id}` })),
        tasks: taskRows.map(row => ({ ...row, product: productIdToName.get(row.product) || row.product, entityType: 'task', href: `/tasks?task=${row.id}` })),
        issues: issueRows.map(row => ({ ...row, entityType: 'issue', href: `/issues?issue=${row.id}` })),
        initiatives: initiativeRows.map(row => ({ ...row, entityType: 'initiative', href: `/initiatives/${row.id}` })),
        wikiAssets: wikiRows.map(row => ({ ...row, product: productIdToName.get(row.product) || row.product, entityType: 'wiki', href: `/wiki?asset=${row.id}` })),
      },
      filters,
    }
  }, {
    query: t.Object({
      q: t.String({ minLength: 1 }),
      product: t.Optional(t.String()),
      limit: t.Optional(t.Numeric()),
    }),
  })