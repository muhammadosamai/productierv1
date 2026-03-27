import { Elysia, t } from 'elysia'
import { db } from '../db'
import { assetTypes, assets, assetRelations_table, users } from '../db/schema'
import { eq, and, ilike, or } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'

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

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export const wikiRoutes = new Elysia({ prefix: '/api/wiki' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // ============ ASSET TYPES ============

  // GET /api/wiki/types?product=X
  .get('/types', async ({ query }) => {
    const product = query.product
    return db.query.assetTypes.findMany({
      where: product ? eq(assetTypes.productId, product) : undefined,
      orderBy: (t, { asc }) => [asc(t.category), asc(t.name)],
    })
  }, {
    query: t.Object({ product: t.Optional(t.String()) }),
  })

  // POST /api/wiki/types
  .post('/types', async ({ body, jwt: jwtVerify, headers, set }) => {
    const user = await getUserFromHeader(jwtVerify.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const [created] = await db.insert(assetTypes).values({
      name: body.name,
      slug: slugify(body.name),
      category: body.category || 'business',
      icon: body.icon || null,
      color: body.color || null,
      productId: body.productId,
    }).returning()

    return created
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

  // GET /api/wiki/assets?product=X&type=slug&search=q
  .get('/assets', async ({ query }) => {
    const product = query.product
    const typeSlug = query.type
    const search = query.search

    let typeFilter: any = undefined
    if (typeSlug && product) {
      const assetType = await db.query.assetTypes.findFirst({
        where: and(eq(assetTypes.slug, typeSlug), eq(assetTypes.productId, product)),
      })
      if (assetType) {
        typeFilter = eq(assets.assetTypeId, assetType.id)
      }
    }

    const conditions = []
    if (product) conditions.push(eq(assets.productId, product))
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
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (a, { asc }) => [asc(a.sortOrder), asc(a.title)],
      with: {
        assetType: true,
        ownerUser: { columns: { id: true, name: true, email: true, avatar: true } },
        createdByUser: { columns: { id: true, name: true, email: true, avatar: true } },
      },
    })
  }, {
    query: t.Object({
      product: t.Optional(t.String()),
      type: t.Optional(t.String()),
      search: t.Optional(t.String()),
    }),
  })

  // GET /api/wiki/assets/:id
  .get('/assets/:id', async ({ params, set }) => {
    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, params.id),
      with: {
        assetType: true,
        ownerUser: { columns: { id: true, name: true, email: true, avatar: true } },
        createdByUser: { columns: { id: true, name: true, email: true, avatar: true } },
        children: {
          with: {
            assetType: true,
            ownerUser: { columns: { id: true, name: true, avatar: true } },
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
  .post('/assets', async ({ body, jwt: jwtVerify, headers, set }) => {
    const user = await getUserFromHeader(jwtVerify.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

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

    // Re-fetch with relations
    const full = await db.query.assets.findFirst({
      where: eq(assets.id, created.id),
      with: {
        assetType: true,
        ownerUser: { columns: { id: true, name: true, email: true, avatar: true } },
        createdByUser: { columns: { id: true, name: true, email: true, avatar: true } },
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
      status: t.Optional(t.String()),
      visibility: t.Optional(t.String()),
      ownerUserId: t.Optional(t.Nullable(t.String())),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
      parentId: t.Optional(t.Nullable(t.String())),
      sortOrder: t.Optional(t.Number()),
    }),
  })

  // PUT /api/wiki/assets/:id
  .put('/assets/:id', async ({ params, body, jwt: jwtVerify, headers, set }) => {
    const user = await getUserFromHeader(jwtVerify.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

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

    // Re-fetch with relations
    const updated = await db.query.assets.findFirst({
      where: eq(assets.id, params.id),
      with: {
        assetType: true,
        ownerUser: { columns: { id: true, name: true, email: true, avatar: true } },
        createdByUser: { columns: { id: true, name: true, email: true, avatar: true } },
      },
    })

    return updated
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      description: t.Optional(t.Nullable(t.String())),
      content: t.Optional(t.Nullable(t.String())),
      status: t.Optional(t.String()),
      visibility: t.Optional(t.String()),
      ownerUserId: t.Optional(t.Nullable(t.String())),
      tags: t.Optional(t.Nullable(t.Array(t.String()))),
      parentId: t.Optional(t.Nullable(t.String())),
      sortOrder: t.Optional(t.Number()),
      assetTypeId: t.Optional(t.String()),
    }),
  })

  // DELETE /api/wiki/assets/:id
  .delete('/assets/:id', async ({ params, jwt: jwtVerify, headers, set }) => {
    const user = await getUserFromHeader(jwtVerify.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    await db.delete(assets).where(eq(assets.id, params.id))
    return { success: true }
  })

  // ============ RELATIONS ============

  // POST /api/wiki/assets/:id/relations
  .post('/assets/:id/relations', async ({ params, body, jwt: jwtVerify, headers, set }) => {
    const user = await getUserFromHeader(jwtVerify.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

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
  .delete('/assets/:id/relations/:relationId', async ({ params, jwt: jwtVerify, headers, set }) => {
    const user = await getUserFromHeader(jwtVerify.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    await db.delete(assetRelations_table).where(eq(assetRelations_table.id, params.relationId))
    return { success: true }
  })
