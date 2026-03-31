import { Elysia, t } from 'elysia'
import { and, asc, desc, eq, ilike, lt, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { assetTypes, assets, assetRelations_table, assetRevisions } from '../db/schema'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireProductPageAction, isGlobalAdminRole, type PageAction } from '../lib/authz'
import { badRequest } from '../lib/apiErrors'
import { publicUserColumns } from '../lib/serializers'
import { computeChanges, logActivity } from '../lib/logActivity'
import { removeSearchDocument, upsertWikiAssetSearchDocument } from '../lib/search/searchIndex'
import { isUuid } from '../lib/productResolver'

const WRITE_ROLES = ['admin', 'owner']
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's', 'a',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function resolveProductId(input: { productId?: string }): Promise<string | null> {
  const value = (input.productId || '').trim()
  return value.length > 0 ? value : null
}

function resolveAssetAccessError(
  set: { status?: number | string },
  label = 'Asset',
): { error: string; code?: string; details?: unknown } {
  if (set.status === 400) {
    return badRequest(set, `Invalid ${label.toLowerCase()} id`)
  }
  if (set.status === 404) {
    return { error: `${label} not found` }
  }
  return { error: 'Forbidden' }
}

function extractAttribute(attrs: string, attr: string): string | null {
  const regex = new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`, 'i')
  const match = regex.exec(attrs)
  if (!match) return null
  return (match[2] || match[3] || match[4] || '').trim()
}

function sanitizeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith('/') || value.startsWith('#')) return value
  try {
    const url = new URL(value)
    if (!SAFE_LINK_PROTOCOLS.has(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

function sanitizeAllowedHtml(html: string): string {
  return html.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (full, tagName, attrs = '') => {
    const tag = String(tagName).toLowerCase()
    const isClosingTag = full.startsWith('</')

    if (!ALLOWED_TAGS.has(tag)) return ''
    if (isClosingTag) return `</${tag}>`

    if (tag === 'a') {
      const safeHref = sanitizeUrl(extractAttribute(String(attrs), 'href') || '')
      const target = extractAttribute(String(attrs), 'target')
      const targetAttr = target === '_blank' ? ' target="_blank"' : ''
      const hrefAttr = safeHref ? ` href="${safeHref}"` : ''
      return `<a${hrefAttr}${targetAttr} rel="noopener noreferrer">`
    }

    return `<${tag}>`
  })
}

function sanitizeAssetContent(content: string | null | undefined): string | null {
  if (!content) return null

  // Remove dangerous containers and comments before tag allow-list processing.
  let sanitized = content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')

  sanitized = sanitizeAllowedHtml(sanitized).trim()
  return sanitized.length > 0 ? sanitized : null
}

function canReadPrivateAsset(
  actorId: string,
  actorRole: string,
  memberRole: string | null,
  asset: { ownerUserId: string | null; createdByUserId: string },
): boolean {
  if (isGlobalAdminRole(actorRole as any)) return true
  if (memberRole && WRITE_ROLES.includes(memberRole.toLowerCase())) return true
  if (asset.ownerUserId && asset.ownerUserId === actorId) return true
  return asset.createdByUserId === actorId
}

function canManageAllAssets(actorRole: string, memberRole: string | null): boolean {
  return isGlobalAdminRole(actorRole as any) || Boolean(memberRole && WRITE_ROLES.includes(memberRole.toLowerCase()))
}

function buildLineDiff(fromValue: string, toValue: string) {
  const fromLines = fromValue.split(/\r?\n/)
  const toLines = toValue.split(/\r?\n/)

  let start = 0
  while (
    start < fromLines.length &&
    start < toLines.length &&
    fromLines[start] === toLines[start]
  ) {
    start++
  }

  let fromEnd = fromLines.length - 1
  let toEnd = toLines.length - 1
  while (
    fromEnd >= start &&
    toEnd >= start &&
    fromLines[fromEnd] === toLines[toEnd]
  ) {
    fromEnd--
    toEnd--
  }

  return {
    unchangedPrefixLines: start,
    removedLines: fromEnd >= start ? fromLines.slice(start, fromEnd + 1) : [],
    addedLines: toEnd >= start ? toLines.slice(start, toEnd + 1) : [],
    unchangedSuffixLines: Math.max(0, fromLines.length - 1 - fromEnd),
  }
}

function toRevisionComparable(revision: typeof assetRevisions.$inferSelect) {
  return {
    title: revision.title,
    description: revision.description,
    status: revision.status,
    visibility: revision.visibility,
    tags: revision.tags,
    content: revision.content || '',
  }
}

async function fetchAssetDetails(assetId: string) {
  return db.query.assets.findFirst({
    where: eq(assets.id, assetId),
    with: {
      assetType: true,
      ownerUser: { columns: publicUserColumns },
      createdByUser: { columns: publicUserColumns },
      children: {
        with: {
          assetType: true,
          ownerUser: { columns: publicUserColumns },
        },
        orderBy: (a, { asc }) => [asc(a.sortOrder), asc(a.title)],
      },
      sourceRelations: {
        with: {
          targetAsset: {
            with: { assetType: true },
          },
        },
      },
      targetRelations: {
        with: {
          sourceAsset: {
            with: { assetType: true },
          },
        },
      },
      revisions: {
        orderBy: (r, { desc }) => [desc(r.revisionNumber)],
        limit: 20,
        with: {
          changedByUser: { columns: publicUserColumns },
        },
      },
    },
  })
}

async function createRevisionSnapshot(params: {
  asset: Pick<typeof assets.$inferSelect, 'id' | 'title' | 'description' | 'content' | 'status' | 'visibility' | 'tags'>
  changedByUserId: string
  changeSummary?: string | null
}) {
  const [maxRow] = await db.select({
    value: sql<number>`coalesce(max(${assetRevisions.revisionNumber}), 0)`,
  }).from(assetRevisions).where(eq(assetRevisions.assetId, params.asset.id))

  const nextRevision = Number(maxRow?.value ?? 0) + 1

  const [revision] = await db.insert(assetRevisions).values({
    assetId: params.asset.id,
    revisionNumber: nextRevision,
    title: params.asset.title,
    description: params.asset.description,
    content: params.asset.content,
    status: params.asset.status,
    visibility: params.asset.visibility,
    tags: params.asset.tags,
    changedByUserId: params.changedByUserId,
    changeSummary: params.changeSummary || null,
  }).returning()

  return revision!
}

async function requireAssetAccess(
  assetId: string,
  jwtVerify: (token: string) => Promise<any>,
  headers: Record<string, string | undefined>,
  set: { status?: number | string },
  action: PageAction = 'read',
) {
  if (!isUuid(assetId)) {
    set.status = 400
    return null
  }

  const asset = await db.query.assets.findFirst({
    where: eq(assets.id, assetId),
    columns: {
      id: true,
      productId: true,
      ownerUserId: true,
      createdByUserId: true,
      visibility: true,
      title: true,
    },
  })

  if (!asset) {
    set.status = 404
    return null
  }

  const access = await requireProductPageAction(jwtVerify, headers, set, {
    productId: asset.productId,
    page: 'wiki',
    action,
  })
  if (!access) return null

  if (
    action === 'read' &&
    asset.visibility === 'private' &&
    !canReadPrivateAsset(access.user.id, access.user.role, access.memberRole, asset)
  ) {
    set.status = 403
    return null
  }

  return { asset, access }
}

export const wikiRoutes = new Elysia({ prefix: '/api/wiki' })
  .use(authPlugin)

  // GET /api/wiki/types?productId=...
  .get('/types', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = await resolveProductId({ productId: query.productId })
    if (!productId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'wiki',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    return db.query.assetTypes.findMany({
      where: eq(assetTypes.productId, productId),
      orderBy: (table, { asc }) => [asc(table.category), asc(table.name)],
    })
  }, {
    query: t.Object({
      productId: t.Optional(t.String()),
    }),
  })

  // POST /api/wiki/types
  .post('/types', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = (body.productId || '').trim() || null
    if (!productId) {
      set.status = 400
      return { error: 'Invalid productId' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'wiki',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const nextSlug = slugify(body.name)
    const existingType = await db.query.assetTypes.findFirst({
      where: and(eq(assetTypes.productId, productId), eq(assetTypes.slug, nextSlug)),
    })
    if (existingType) {
      set.status = 409
      return existingType
    }

    try {
      const [created] = await db.insert(assetTypes).values({
        name: body.name.trim(),
        slug: nextSlug,
        category: body.category || 'business',
        icon: body.icon || null,
        color: body.color || null,
        productId,
      }).returning()

      return created
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === '23505') {
        const conflictType = await db.query.assetTypes.findFirst({
          where: and(eq(assetTypes.productId, productId), eq(assetTypes.slug, nextSlug)),
        })
        if (conflictType) {
          set.status = 409
          return conflictType
        }
      }
      throw error
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      category: t.Optional(t.String()),
      icon: t.Optional(t.String()),
      color: t.Optional(t.String()),
      productId: t.String({ minLength: 1 }),
    }),
  })

  // GET /api/wiki/assets?productId=...&type=...&search=...
  .get('/assets', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = await resolveProductId({ productId: query.productId })
    if (!productId) {
      set.status = 400
      return { error: 'productId query parameter is required' }
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'wiki',
      action: 'read',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    let typeFilter: ReturnType<typeof eq> | undefined
    if (query.type?.trim()) {
      const matchedType = await db.query.assetTypes.findFirst({
        where: and(
          eq(assetTypes.slug, query.type.trim()),
          eq(assetTypes.productId, productId),
        ),
      })
      if (matchedType) {
        typeFilter = eq(assets.assetTypeId, matchedType.id)
      }
    }

    const conditions: any[] = [eq(assets.productId, productId)]
    if (typeFilter) conditions.push(typeFilter)
    if (query.search?.trim()) {
      const q = query.search.trim()
      conditions.push(or(
        ilike(assets.title, `%${q}%`),
        ilike(assets.description, `%${q}%`),
      )!)
    }

    if (!canManageAllAssets(access.user.role, access.memberRole)) {
      conditions.push(or(
        eq(assets.visibility, 'public'),
        eq(assets.visibility, 'internal'),
        eq(assets.ownerUserId, access.user.id),
        eq(assets.createdByUserId, access.user.id),
      )!)
    }

    return db.query.assets.findMany({
      where: and(...conditions),
      orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.title)],
      with: {
        assetType: true,
        ownerUser: { columns: publicUserColumns },
        createdByUser: { columns: publicUserColumns },
      },
    })
  }, {
    query: t.Object({
      productId: t.Optional(t.String()),
      type: t.Optional(t.String()),
      search: t.Optional(t.String()),
    }),
  })

  // GET /api/wiki/assets/:id
  .get('/assets/:id', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const scoped = await requireAssetAccess(params.id, jwt.verify, headers, set, 'read')
    if (!scoped) return resolveAssetAccessError(set, 'Asset')

    const asset = await fetchAssetDetails(scoped.asset.id)
    if (!asset) {
      set.status = 404
      return { error: 'Asset not found' }
    }
    return asset
  })

  // POST /api/wiki/assets
  .post('/assets', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = (body.productId || '').trim() || null
    if (!productId) {
      set.status = 400
      return { error: 'Invalid productId' }
    }
    if (!isUuid(productId)) {
      return badRequest(set, 'Invalid productId')
    }
    if (!isUuid(body.assetTypeId)) {
      return badRequest(set, 'Invalid assetTypeId')
    }
    if (body.ownerUserId !== null && body.ownerUserId !== undefined && !isUuid(body.ownerUserId)) {
      return badRequest(set, 'Invalid ownerUserId')
    }
    if (body.parentId !== null && body.parentId !== undefined && !isUuid(body.parentId)) {
      return badRequest(set, 'Invalid parentId')
    }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId,
      page: 'wiki',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [created] = await db.insert(assets).values({
      productId,
      assetTypeId: body.assetTypeId,
      title: body.title.trim(),
      slug: slugify(body.title),
      description: body.description?.trim() || null,
      content: sanitizeAssetContent(body.content),
      status: body.status || 'draft',
      visibility: body.visibility || 'internal',
      ownerUserId: body.ownerUserId || null,
      tags: body.tags || null,
      parentId: body.parentId || null,
      sortOrder: body.sortOrder || 0,
      createdByUserId: user.id,
    }).returning()

    await createRevisionSnapshot({
      asset: created!,
      changedByUserId: user.id,
      changeSummary: body.changeSummary || 'Initial version',
    })

    logActivity({
      productId: created!.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'wiki_asset',
      entityId: created!.id,
      entityTitle: created!.title,
    })

    await upsertWikiAssetSearchDocument(created!.id)

    return fetchAssetDetails(created!.id)
  }, {
    body: t.Object({
      productId: t.String({ minLength: 1 }),
      assetTypeId: t.String({ minLength: 1 }),
      title: t.String({ minLength: 1 }),
      description: t.Optional(t.Nullable(t.String())),
      content: t.Optional(t.Nullable(t.String())),
      status: t.Optional(t.Union([
        t.Literal('draft'),
        t.Literal('active'),
        t.Literal('deprecated'),
        t.Literal('archived'),
      ])),
      visibility: t.Optional(t.Union([
        t.Literal('public'),
        t.Literal('internal'),
        t.Literal('private'),
      ])),
      ownerUserId: t.Optional(t.Nullable(t.String())),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
      parentId: t.Optional(t.Nullable(t.String())),
      sortOrder: t.Optional(t.Number()),
      changeSummary: t.Optional(t.String()),
    }),
  })

  // PUT /api/wiki/assets/:id
  .put('/assets/:id', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const scoped = await requireAssetAccess(params.id, jwt.verify, headers, set, 'edit')
    if (!scoped) return resolveAssetAccessError(set, 'Asset')

    if (body.assetTypeId !== undefined && !isUuid(body.assetTypeId)) {
      return badRequest(set, 'Invalid assetTypeId')
    }
    if (body.ownerUserId !== undefined && body.ownerUserId !== null && !isUuid(body.ownerUserId)) {
      return badRequest(set, 'Invalid ownerUserId')
    }
    if (body.parentId !== undefined && body.parentId !== null && !isUuid(body.parentId)) {
      return badRequest(set, 'Invalid parentId')
    }

    const existing = await db.query.assets.findFirst({
      where: eq(assets.id, params.id),
    })
    if (!existing) {
      set.status = 404
      return { error: 'Asset not found' }
    }

    const updateData: Partial<typeof assets.$inferInsert> & { updatedAt?: Date } = {}
    if (body.title !== undefined) {
      updateData.title = body.title.trim()
      updateData.slug = slugify(body.title)
    }
    if (body.description !== undefined) updateData.description = body.description?.trim() || null
    if (body.content !== undefined) updateData.content = sanitizeAssetContent(body.content)
    if (body.status !== undefined) updateData.status = body.status
    if (body.visibility !== undefined) updateData.visibility = body.visibility
    if (body.ownerUserId !== undefined) updateData.ownerUserId = body.ownerUserId
    if (body.tags !== undefined) updateData.tags = body.tags
    if (body.parentId !== undefined) updateData.parentId = body.parentId
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder
    if (body.assetTypeId !== undefined) updateData.assetTypeId = body.assetTypeId
    updateData.updatedAt = new Date()

    const [updated] = await db.update(assets)
      .set(updateData)
      .where(eq(assets.id, params.id))
      .returning()

    await createRevisionSnapshot({
      asset: updated!,
      changedByUserId: user.id,
      changeSummary: body.changeSummary || null,
    })

    const changePayload: Record<string, unknown> = {}
    if (body.title !== undefined) changePayload.title = body.title
    if (body.description !== undefined) changePayload.description = body.description
    if (body.content !== undefined) changePayload.content = updateData.content
    if (body.status !== undefined) changePayload.status = body.status
    if (body.visibility !== undefined) changePayload.visibility = body.visibility
    if (body.ownerUserId !== undefined) changePayload.ownerUserId = body.ownerUserId
    if (body.tags !== undefined) changePayload.tags = body.tags
    if (body.parentId !== undefined) changePayload.parentId = body.parentId
    if (body.sortOrder !== undefined) changePayload.sortOrder = body.sortOrder
    if (body.assetTypeId !== undefined) changePayload.assetTypeId = body.assetTypeId

    const changes = computeChanges(existing as any, changePayload as any, Object.keys(changePayload))
    if (changes.length > 0) {
      logActivity({
        productId: updated!.productId,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'wiki_asset',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }

    await upsertWikiAssetSearchDocument(updated!.id)

    return fetchAssetDetails(updated!.id)
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      description: t.Optional(t.Nullable(t.String())),
      content: t.Optional(t.Nullable(t.String())),
      status: t.Optional(t.Union([
        t.Literal('draft'),
        t.Literal('active'),
        t.Literal('deprecated'),
        t.Literal('archived'),
      ])),
      visibility: t.Optional(t.Union([
        t.Literal('public'),
        t.Literal('internal'),
        t.Literal('private'),
      ])),
      ownerUserId: t.Optional(t.Nullable(t.String())),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
      parentId: t.Optional(t.Nullable(t.String())),
      sortOrder: t.Optional(t.Number()),
      assetTypeId: t.Optional(t.String()),
      changeSummary: t.Optional(t.String()),
    }),
  })

  // DELETE /api/wiki/assets/:id
  .delete('/assets/:id', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const scoped = await requireAssetAccess(params.id, jwt.verify, headers, set, 'delete')
    if (!scoped) return resolveAssetAccessError(set, 'Asset')

    const [deleted] = await db.delete(assets).where(eq(assets.id, params.id)).returning()
    if (!deleted) {
      set.status = 404
      return { error: 'Asset not found' }
    }

    logActivity({
      productId: deleted.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'deleted',
      entityType: 'wiki_asset',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })

    await removeSearchDocument('wiki_asset', deleted.id)

    return { success: true }
  })

  // POST /api/wiki/assets/:id/relations
  .post('/assets/:id/relations', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const sourceScoped = await requireAssetAccess(params.id, jwt.verify, headers, set, 'create')
    if (!sourceScoped) return resolveAssetAccessError(set, 'Asset')

    const targetScoped = await requireAssetAccess(body.targetAssetId, jwt.verify, headers, set, 'read')
    if (!targetScoped) return resolveAssetAccessError(set, 'Target asset')

    if (sourceScoped.asset.productId !== targetScoped.asset.productId) {
      set.status = 400
      return { error: 'Cross-product asset relations are not allowed' }
    }

    const [created] = await db.insert(assetRelations_table).values({
      sourceAssetId: params.id,
      targetAssetId: body.targetAssetId,
      relationType: body.relationType || 'related_to',
    }).onConflictDoNothing().returning()

    if (!created) {
      return { success: true, alreadyExists: true }
    }
    return created
  }, {
    body: t.Object({
      targetAssetId: t.String({ minLength: 1 }),
      relationType: t.Optional(t.String()),
    }),
  })

  // DELETE /api/wiki/assets/:id/relations/:relationId
  .delete('/assets/:id/relations/:relationId', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const sourceScoped = await requireAssetAccess(params.id, jwt.verify, headers, set, 'delete')
    if (!sourceScoped) return resolveAssetAccessError(set, 'Asset')

    if (!isUuid(params.relationId)) {
      return badRequest(set, 'Invalid relationId')
    }

    const [relation] = await db.select().from(assetRelations_table).where(and(
      eq(assetRelations_table.id, params.relationId),
      eq(assetRelations_table.sourceAssetId, params.id),
    ))
    if (!relation) {
      set.status = 404
      return { error: 'Relation not found' }
    }

    await db.delete(assetRelations_table).where(eq(assetRelations_table.id, params.relationId))
    return { success: true }
  })

  // GET /api/wiki/assets/:id/revisions?limit=...
  .get('/assets/:id/revisions', async ({ params, query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const scoped = await requireAssetAccess(params.id, jwt.verify, headers, set, 'read')
    if (!scoped) return resolveAssetAccessError(set, 'Asset')

    const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200)
    return db.query.assetRevisions.findMany({
      where: eq(assetRevisions.assetId, params.id),
      orderBy: (table, { desc }) => [desc(table.revisionNumber)],
      limit,
      with: {
        changedByUser: { columns: publicUserColumns },
      },
    })
  }, {
    query: t.Object({
      limit: t.Optional(t.Numeric()),
    }),
  })

  // GET /api/wiki/assets/:id/revisions/:revisionId
  .get('/assets/:id/revisions/:revisionId', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const scoped = await requireAssetAccess(params.id, jwt.verify, headers, set, 'read')
    if (!scoped) return resolveAssetAccessError(set, 'Asset')

    if (!isUuid(params.revisionId)) {
      return badRequest(set, 'Invalid revisionId')
    }

    const revision = await db.query.assetRevisions.findFirst({
      where: and(
        eq(assetRevisions.assetId, params.id),
        eq(assetRevisions.id, params.revisionId),
      ),
      with: {
        changedByUser: { columns: publicUserColumns },
      },
    })

    if (!revision) {
      set.status = 404
      return { error: 'Revision not found' }
    }
    return revision
  })

  // GET /api/wiki/assets/:id/revisions/:revisionId/diff?baseRevisionId=...
  .get('/assets/:id/revisions/:revisionId/diff', async ({ params, query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const scoped = await requireAssetAccess(params.id, jwt.verify, headers, set, 'read')
    if (!scoped) return resolveAssetAccessError(set, 'Asset')

    if (!isUuid(params.revisionId)) {
      return badRequest(set, 'Invalid revisionId')
    }
    if (query.baseRevisionId && !isUuid(query.baseRevisionId)) {
      return badRequest(set, 'Invalid baseRevisionId')
    }

    const target = await db.query.assetRevisions.findFirst({
      where: and(
        eq(assetRevisions.assetId, params.id),
        eq(assetRevisions.id, params.revisionId),
      ),
    })
    if (!target) {
      set.status = 404
      return { error: 'Revision not found' }
    }

    const base = query.baseRevisionId
      ? await db.query.assetRevisions.findFirst({
        where: and(
          eq(assetRevisions.assetId, params.id),
          eq(assetRevisions.id, query.baseRevisionId),
        ),
      })
      : await db.query.assetRevisions.findFirst({
        where: and(
          eq(assetRevisions.assetId, params.id),
          lt(assetRevisions.revisionNumber, target.revisionNumber),
        ),
        orderBy: (table, { desc }) => [desc(table.revisionNumber)],
      })

    const baseComparable = base ? toRevisionComparable(base) : {
      title: '',
      description: null,
      status: target.status,
      visibility: target.visibility,
      tags: null,
      content: '',
    }
    const targetComparable = toRevisionComparable(target)

    return {
      targetRevisionId: target.id,
      baseRevisionId: base?.id || null,
      fields: computeChanges(baseComparable as any, targetComparable as any, [
        'title',
        'description',
        'status',
        'visibility',
        'tags',
      ]),
      contentDiff: buildLineDiff(baseComparable.content || '', targetComparable.content || ''),
    }
  }, {
    query: t.Object({
      baseRevisionId: t.Optional(t.String()),
    }),
  })

  // POST /api/wiki/assets/:id/revisions/:revisionId/restore
  .post('/assets/:id/revisions/:revisionId/restore', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const scoped = await requireAssetAccess(params.id, jwt.verify, headers, set, 'edit')
    if (!scoped) return resolveAssetAccessError(set, 'Asset')

    if (!isUuid(params.revisionId)) {
      return badRequest(set, 'Invalid revisionId')
    }

    const sourceRevision = await db.query.assetRevisions.findFirst({
      where: and(
        eq(assetRevisions.assetId, params.id),
        eq(assetRevisions.id, params.revisionId),
      ),
    })
    if (!sourceRevision) {
      set.status = 404
      return { error: 'Revision not found' }
    }

    const [restored] = await db.update(assets)
      .set({
        title: sourceRevision.title,
        slug: slugify(sourceRevision.title),
        description: sourceRevision.description,
        content: sanitizeAssetContent(sourceRevision.content),
        status: sourceRevision.status,
        visibility: sourceRevision.visibility,
        tags: sourceRevision.tags,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, params.id))
      .returning()

    const restoreSummary = body.changeSummary?.trim() || `Restored from revision #${sourceRevision.revisionNumber}`
    const newRevision = await createRevisionSnapshot({
      asset: restored!,
      changedByUserId: user.id,
      changeSummary: restoreSummary,
    })

    logActivity({
      productId: restored!.productId,
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'restored',
      entityType: 'wiki_asset',
      entityId: restored!.id,
      entityTitle: restored!.title,
      changes: [{
        field: 'revision',
        from: String(sourceRevision.revisionNumber),
        to: String(newRevision.revisionNumber),
      }],
    })

    return {
      asset: await fetchAssetDetails(restored!.id),
      restoredFromRevisionId: sourceRevision.id,
      restoredToRevisionId: newRevision.id,
    }
  }, {
    body: t.Object({
      changeSummary: t.Optional(t.String()),
    }),
  })
