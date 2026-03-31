import { Elysia, t } from 'elysia'
import { db } from '../db'
import { assetTypes, assets, assetRelations_table } from '../db/schema'
import { eq, and, ilike, or } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireProductPageAction, type PageAction } from '../lib/authz'
import { publicUserColumns } from '../lib/serializers'

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function requireAssetAccess(
  assetId: string,
  action: PageAction,
  jwtVerify: (token: string) => Promise<any>,
  headers: Record<string, string | undefined>,
  set: { status?: number | string }
) {
  const asset = await db.query.assets.findFirst({
    where: eq(assets.id, assetId),
    columns: { id: true, productId: true },
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

  return asset
}

export const wikiRoutes = new Elysia({ prefix: '/api/wiki' })
  .use(authPlugin)

  // ============ ASSET TYPES ============

  // GET /api/wiki/types?productId=X
  .get('/types', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = query.productId
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
      orderBy: (t, { asc }) => [asc(t.category), asc(t.name)],
    })
  }, {
    query: t.Object({ productId: t.Optional(t.String()) }),
  })

  // POST /api/wiki/types
  .post('/types', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: body.productId,
      page: 'wiki',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const nextSlug = slugify(body.name)
    const existingType = await db.query.assetTypes.findFirst({
      where: and(eq(assetTypes.productId, body.productId), eq(assetTypes.slug, nextSlug)),
    })
    if (existingType) {
      set.status = 409
      return existingType
    }

    try {
      const [created] = await db.insert(assetTypes).values({
        name: body.name,
        slug: nextSlug,
        category: body.category || 'business',
        icon: body.icon || null,
        color: body.color || null,
        productId: body.productId,
      }).returning()

      return created
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === '23505') {
        const conflictType = await db.query.assetTypes.findFirst({
          where: and(eq(assetTypes.productId, body.productId), eq(assetTypes.slug, nextSlug)),
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
      productId: t.String(),
    }),
  })

  // ============ ASSETS ============

  // GET /api/wiki/assets?productId=X&type=slug&search=q
  .get('/assets', async ({ query, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const productId = query.productId
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

    const typeSlug = query.type
    const search = query.search

    let typeFilter: any = undefined
    if (typeSlug) {
      const assetType = await db.query.assetTypes.findFirst({
        where: and(eq(assetTypes.slug, typeSlug), eq(assetTypes.productId, productId)),
      })
      if (assetType) {
        typeFilter = eq(assets.assetTypeId, assetType.id)
      }
    }

    const conditions = [eq(assets.productId, productId)]
    if (typeFilter) conditions.push(typeFilter)
    if (search) {
      conditions.push(
        or(
          ilike(assets.title, `%${search}%`),
          ilike(assets.description, `%${search}%`),
        )!
      )
    }

    return db.query.assets.findMany({
      where: and(...conditions),
      orderBy: (a, { asc }) => [asc(a.sortOrder), asc(a.title)],
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

    const allowedAsset = await requireAssetAccess(params.id, 'read', jwt.verify, headers, set)
    if (!allowedAsset) return set.status === 404 ? { error: 'Asset not found' } : { error: 'Forbidden' }

    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, params.id),
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
      },
    })

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

    const access = await requireProductPageAction(jwt.verify, headers, set, {
      productId: body.productId,
      page: 'wiki',
      action: 'create',
    })
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const [created] = await db.insert(assets).values({
      productId: body.productId,
      assetTypeId: body.assetTypeId,
      title: body.title,
      slug: slugify(body.title),
      description: body.description || null,
      content: body.content || null,
      status: (body.status as any) || 'draft',
      visibility: (body.visibility as any) || 'internal',
      ownerUserId: body.ownerUserId || null,
      tags: body.tags || null,
      parentId: body.parentId || null,
      sortOrder: body.sortOrder || 0,
      createdByUserId: user.id,
    }).returning()

    const full = await db.query.assets.findFirst({
      where: eq(assets.id, created.id),
      with: {
        assetType: true,
        ownerUser: { columns: publicUserColumns },
        createdByUser: { columns: publicUserColumns },
      },
    })

    return full
  }, {
    body: t.Object({
      productId: t.String(),
      assetTypeId: t.String(),
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
    }),
  })

  // PUT /api/wiki/assets/:id
  .put('/assets/:id', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const allowedAsset = await requireAssetAccess(params.id, 'edit', jwt.verify, headers, set)
    if (!allowedAsset) return set.status === 404 ? { error: 'Asset not found' } : { error: 'Forbidden' }

    const updateData: Record<string, any> = {}
    if (body.title !== undefined) { updateData.title = body.title; updateData.slug = slugify(body.title) }
    if (body.description !== undefined) updateData.description = body.description
    if (body.content !== undefined) updateData.content = body.content
    if (body.status !== undefined) updateData.status = body.status
    if (body.visibility !== undefined) updateData.visibility = body.visibility
    if (body.ownerUserId !== undefined) updateData.ownerUserId = body.ownerUserId
    if (body.tags !== undefined) updateData.tags = body.tags
    if (body.parentId !== undefined) updateData.parentId = body.parentId
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder
    if (body.assetTypeId !== undefined) updateData.assetTypeId = body.assetTypeId

    await db.update(assets).set(updateData).where(eq(assets.id, params.id))

    const updated = await db.query.assets.findFirst({
      where: eq(assets.id, params.id),
      with: {
        assetType: true,
        ownerUser: { columns: publicUserColumns },
        createdByUser: { columns: publicUserColumns },
      },
    })

    return updated
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
    }),
  })

  // DELETE /api/wiki/assets/:id
  .delete('/assets/:id', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const allowedAsset = await requireAssetAccess(params.id, 'delete', jwt.verify, headers, set)
    if (!allowedAsset) return set.status === 404 ? { error: 'Asset not found' } : { error: 'Forbidden' }

    await db.delete(assets).where(eq(assets.id, params.id))
    return { success: true }
  })

  // ============ RELATIONS ============

  // POST /api/wiki/assets/:id/relations
  .post('/assets/:id/relations', async ({ params, body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const allowedAsset = await requireAssetAccess(params.id, 'create', jwt.verify, headers, set)
    if (!allowedAsset) return set.status === 404 ? { error: 'Asset not found' } : { error: 'Forbidden' }

    const targetAsset = await requireAssetAccess(body.targetAssetId, 'read', jwt.verify, headers, set)
    if (!targetAsset) return set.status === 404 ? { error: 'Target asset not found' } : { error: 'Forbidden' }

    const [created] = await db.insert(assetRelations_table).values({
      sourceAssetId: params.id,
      targetAssetId: body.targetAssetId,
      relationType: body.relationType || 'related_to',
    }).returning()

    return created
  }, {
    body: t.Object({
      targetAssetId: t.String(),
      relationType: t.Optional(t.String()),
    }),
  })

  // DELETE /api/wiki/assets/:id/relations/:relationId
  .delete('/assets/:id/relations/:relationId', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const allowedAsset = await requireAssetAccess(params.id, 'delete', jwt.verify, headers, set)
    if (!allowedAsset) return set.status === 404 ? { error: 'Asset not found' } : { error: 'Forbidden' }

    await db.delete(assetRelations_table).where(eq(assetRelations_table.id, params.relationId))
    return { success: true }
  })
