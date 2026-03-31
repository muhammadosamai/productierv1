import { Elysia, t } from 'elysia'
import { db } from '../db'
import { products, productMembers, users, stories, tasks, initiatives, deliveries, releases, servers, testCycles, favorites, assetTypes, assets, featureRequests, consumerFeedbacks, taskStatusHistory, activities } from '../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

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

export const productRoutes = new Elysia({ prefix: '/api/products' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/products - List products (filtered by membership, super_admin sees all)
  .get('/', async ({ jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)

    // Unauthenticated or super_admin: return all
    if (!user || user.role === 'super_admin') {
      return db.query.products.findMany({
        orderBy: (items, { asc }) => [asc(items.name)],
      })
    }

    // Return only products the user is a member of
    const memberProducts = await db
      .select({ product: productMembers.product })
      .from(productMembers)
      .where(eq(productMembers.userId, user.id))

    const productNames = memberProducts.map(m => m.product)
    if (productNames.length === 0) return []

    const allProducts = await db.query.products.findMany({
      orderBy: (items, { asc }) => [asc(items.name)],
    })

    return allProducts.filter(p => productNames.includes(p.name))
  })

  // POST /api/products - Create a new product
  .post('/', async ({ body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    try {
      const [product] = await db.insert(products).values({
        name: body.name,
        logo: body.logo || null,
        description: body.description || null,
        createdByUserId: user.id,
      }).returning()

      // Auto-add creator as admin member
      await db.insert(productMembers).values({
        product: product!.name,
        userId: user.id,
        role: 'admin',
      })

      // Add additional team members if provided
      if (body.members && body.members.length > 0) {
        for (const member of body.members) {
          if (member.userId !== user.id) {
            await db.insert(productMembers).values({
              product: product!.name,
              userId: member.userId,
              role: member.role || 'member',
            }).onConflictDoNothing()
          }
        }
      }

      return product
    } catch (e: any) {
      if (e.code === '23505') {
        set.status = 409
        return { error: 'A product with this name already exists' }
      }
      throw e
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      logo: t.Optional(t.Nullable(t.String())),
      description: t.Optional(t.Nullable(t.String())),
      members: t.Optional(t.Array(t.Object({
        userId: t.String(),
        role: t.Optional(t.String()),
      }))),
    }),
  })

  // GET /api/products/:name/members
  .get('/:name/members', async ({ params: { name } }) => {
    const members = await db
      .select({
        id: productMembers.id,
        product: productMembers.product,
        role: productMembers.role,
        addedAt: productMembers.addedAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatar,
        userRole: users.role,
      })
      .from(productMembers)
      .innerJoin(users, eq(productMembers.userId, users.id))
      .where(eq(productMembers.product, name))

    return members
  })

  // POST /api/products/:name/members
  .post('/:name/members', async ({ params: { name }, body, set }) => {
    try {
      const [member] = await db.insert(productMembers).values({
        product: name,
        userId: body.userId,
        role: body.role || 'member',
      }).returning()

      // Return with user info
      const user = await db.query.users.findFirst({
        where: eq(users.id, body.userId),
      })

      return {
        ...member,
        userName: user?.name,
        userEmail: user?.email,
        userAvatar: user?.avatar,
        userRole: user?.role,
      }
    } catch (e: any) {
      if (e.code === '23505') { // unique constraint violation
        set.status = 409
        return { error: 'User is already a member of this product' }
      }
      throw e
    }
  }, {
    body: t.Object({
      userId: t.String(),
      role: t.Optional(t.String()),
    }),
  })

  // DELETE /api/products/:name/members/:userId
  .delete('/:name/members/:userId', async ({ params: { name, userId }, set }) => {
    const [deleted] = await db.delete(productMembers)
      .where(and(
        eq(productMembers.product, name),
        eq(productMembers.userId, userId),
      ))
      .returning()

    if (!deleted) {
      set.status = 404
      return { error: 'Member not found' }
    }

    return { success: true }
  })

  // POST /api/products/upload-logo - Upload product logo image
  .post('/upload-logo', async ({ body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const file = body.file
    if (!file) {
      set.status = 400
      return { error: 'No file provided' }
    }

    const uploadsDir = join(import.meta.dir, '../../uploads/logos')
    await mkdir(uploadsDir, { recursive: true })

    const ext = file.name.split('.').pop() || 'png'
    const filename = `product-${Date.now()}.${ext}`
    const filepath = join(uploadsDir, filename)

    const arrayBuffer = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(arrayBuffer))

    return { logo: `/uploads/logos/${filename}` }
  }, {
    body: t.Object({
      file: t.File({ maxSize: '5m', type: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'] }),
    }),
  })

  // PUT /api/products/:name - Update product name, description, logo
  .put('/:name', async ({ params: { name }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const product = await db.query.products.findFirst({
      where: eq(products.name, name),
    })
    if (!product) {
      set.status = 404
      return { error: 'Product not found' }
    }

    // Only product creator or super_admin can update
    if (product.createdByUserId !== user.id && user.role !== 'super_admin') {
      set.status = 403
      return { error: 'Only the product owner or super admin can update this product' }
    }

    const updates: Record<string, any> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.logo !== undefined) updates.logo = body.logo

    if (Object.keys(updates).length === 0) {
      return product
    }

    try {
      // If name is changing, update all references across tables
      if (updates.name && updates.name !== name) {
        await db.update(productMembers).set({ product: updates.name }).where(eq(productMembers.product, name))
        await db.update(stories).set({ product: updates.name }).where(eq(stories.product, name))
        await db.update(initiatives).set({ product: updates.name }).where(eq(initiatives.product, name))
        await db.update(activities).set({ product: updates.name }).where(eq(activities.product, name))
      }

      const [updated] = await db.update(products)
        .set(updates)
        .where(eq(products.name, name))
        .returning()

      return updated
    } catch (e: any) {
      if (e.code === '23505') {
        set.status = 409
        return { error: 'A product with this name already exists' }
      }
      throw e
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1 })),
      description: t.Optional(t.Nullable(t.String())),
      logo: t.Optional(t.Nullable(t.String())),
    }),
  })

  // DELETE /api/products/:name - Delete a product and all related data
  .delete('/:name', async ({ params: { name }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    // Find the product
    const product = await db.query.products.findFirst({
      where: eq(products.name, name),
    })
    if (!product) {
      set.status = 404
      return { error: 'Product not found' }
    }

    // Only product creator or super_admin can delete
    if (product.createdByUserId !== user.id && user.role !== 'super_admin') {
      set.status = 403
      return { error: 'Only the product owner or super admin can delete this product' }
    }

    // Delete all related data (no FK constraints, must clean up manually)
    // Tables with `productId` field (varchar matching product name)
    await db.delete(taskStatusHistory).where(eq(taskStatusHistory.productId, name))
    await db.delete(tasks).where(eq(tasks.productId, name))
    await db.delete(testCycles).where(eq(testCycles.productId, name))
    await db.delete(featureRequests).where(eq(featureRequests.productId, name))
    await db.delete(consumerFeedbacks).where(eq(consumerFeedbacks.productId, name))
    await db.delete(assets).where(eq(assets.productId, name))
    await db.delete(assetTypes).where(eq(assetTypes.productId, name))
    await db.delete(deliveries).where(eq(deliveries.productId, name))
    await db.delete(releases).where(eq(releases.productId, name))
    await db.delete(servers).where(eq(servers.productId, name))
    await db.delete(favorites).where(eq(favorites.productId, name))

    // Tables with `product` field (varchar matching product name)
    await db.delete(stories).where(eq(stories.product, name))
    await db.delete(initiatives).where(eq(initiatives.product, name))
    await db.delete(activities).where(eq(activities.product, name))
    await db.delete(productMembers).where(eq(productMembers.product, name))

    // Finally delete the product itself
    await db.delete(products).where(eq(products.name, name))

    return { success: true }
  })
