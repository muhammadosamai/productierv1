import { Elysia, t } from 'elysia'
import { db } from '../db'
import { products, productMembers, users, stories, tasks, initiatives, deliveries, releases, servers, testCycles, favorites, assetTypes, assets, featureRequests, consumerFeedbacks, taskStatusHistory, activities, issues, productInvites, formConfigs } from '../db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { resolveProductRef } from '../lib/resolveProductRef'
import { jwt } from '@elysiajs/jwt'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sendRoleChangeEmail } from '../services/email'
import { isProductMemberRole } from '../lib/productMemberRoles'

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

async function isProductAdmin(userId: string, productId: string): Promise<boolean> {
  const member = await db.query.productMembers.findFirst({
    where: and(eq(productMembers.productId, productId), eq(productMembers.userId, userId)),
  })
  return member?.role === 'admin'
}

function isOwnerOrSuperAdmin(
  user: { id: string; role: string },
  product: { createdByUserId: string },
): boolean {
  return product.createdByUserId === user.id || user.role === 'super_admin'
}

async function canManageProductBranding(
  user: { id: string; role: string },
  productId: string,
  product: { createdByUserId: string },
): Promise<boolean> {
  if (isOwnerOrSuperAdmin(user, product)) return true
  return isProductAdmin(user.id, productId)
}

function normalizeProjectKeyBase(input: string) {
  const base = input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5)
  return base || 'PRD'
}

async function generateUniqueProjectKey(name: string) {
  const base = normalizeProjectKeyBase(name)
  let candidate = base
  let suffix = 2

  while (true) {
    const existing = await db.query.products.findFirst({
      where: eq(products.projectKey, candidate),
      columns: { id: true },
    })
    if (!existing) return candidate
    candidate = `${base.slice(0, 4)}${suffix}`
    suffix += 1
  }
}

function rejectProductResolve(
  set: { status?: number | string },
  r: Exclude<Awaited<ReturnType<typeof resolveProductRef>>, { ok: true }>,
) {
  if (r.kind === 'ambiguous') {
    set.status = 409
    return { error: 'Multiple products match this name', candidates: r.candidates }
  }
  set.status = 404
  return { error: 'Product not found' }
}

export const productRoutes = new Elysia({ prefix: '/api/products' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/products - List products (filtered by membership, super_admin sees all)
  .get('/', async ({ jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)

    let roleByProduct: Record<string, string> = {}
    if (user) {
      const membershipRows = await db
        .select({ productId: productMembers.productId, role: productMembers.role })
        .from(productMembers)
        .where(eq(productMembers.userId, user.id))
      roleByProduct = Object.fromEntries(membershipRows.map((r) => [r.productId, r.role]))
    }

    const attachMyRole = <T extends { id: string }>(list: T[]) =>
      list.map((p) => ({ ...p, myRole: roleByProduct[p.id] ?? null }))

    // Unauthenticated or super_admin: return all
    if (!user || user.role === 'super_admin') {
      const list = await db.query.products.findMany({
        orderBy: (items, { asc }) => [asc(items.name)],
      })
      return attachMyRole(list)
    }

    // Return only products the user is a member of
    const memberProducts = await db
      .select({ productId: productMembers.productId })
      .from(productMembers)
      .where(eq(productMembers.userId, user.id))

    const memberIds = new Set(memberProducts.map((m) => m.productId))
    if (memberIds.size === 0) return []

    const allProducts = await db.query.products.findMany({
      orderBy: (items, { asc }) => [asc(items.name)],
    })

    return attachMyRole(allProducts.filter((p) => memberIds.has(p.id)))
  })

  // POST /api/products - Create a new product
  .post('/', async ({ body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    try {
      const projectKey = await generateUniqueProjectKey(body.name)
      const [product] = await db.insert(products).values({
        name: body.name,
        projectKey,
        logo: body.logo || null,
        description: body.description || null,
        createdByUserId: user.id,
      }).returning()

      // Auto-add creator as admin member
      await db.insert(productMembers).values({
        product: product!.name,
        productId: product!.id,
        userId: user.id,
        role: 'admin',
      })

      // Add additional team members if provided
      if (body.members && body.members.length > 0) {
        for (const member of body.members) {
          if (member.userId !== user.id) {
            await db.insert(productMembers).values({
              product: product!.name,
              productId: product!.id,
              userId: member.userId,
              role: member.role || 'member',
            }).onConflictDoNothing({ target: [productMembers.productId, productMembers.userId] })
          }
        }
      }

      return product
    } catch (e: any) {
      if (e.code === '23505') {
        set.status = 409
        return { error: 'Could not create product (duplicate project key or member)' }
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

  // GET /api/products/:name/members  (:name = id, project_key, or unique display name)
  .get('/:name/members', async ({ params: { name }, set }) => {
    const r = await resolveProductRef(decodeURIComponent(name))
    if (!r.ok) return rejectProductResolve(set, r)

    const members = await db
      .select({
        id: productMembers.id,
        product: productMembers.product,
        productId: productMembers.productId,
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
      .where(eq(productMembers.productId, r.product.id))

    return members
  })

  // POST /api/products/:name/members
  .post('/:name/members', async ({ params: { name }, body, set }) => {
    const r = await resolveProductRef(decodeURIComponent(name))
    if (!r.ok) return rejectProductResolve(set, r)

    try {
      const [member] = await db.insert(productMembers).values({
        product: r.product.name,
        productId: r.product.id,
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

  // PATCH /api/products/:name/members/:userId — update product role (product admin or super_admin)
  .patch('/:name/members/:userId', async ({ params: { name, userId }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const r = await resolveProductRef(decodeURIComponent(name))
    if (!r.ok) return rejectProductResolve(set, r)

    const canManage = user.role === 'super_admin' || await isProductAdmin(user.id, r.product.id)
    if (!canManage) {
      set.status = 403
      return { error: 'Only product admins can change member roles' }
    }

    if (user.role !== 'super_admin' && user.id === userId) {
      set.status = 403
      return { error: 'Ask another admin to change your own role' }
    }

    const role = body.role
    if (!isProductMemberRole(role)) {
      set.status = 400
      return { error: 'Invalid role' }
    }

    const existing = await db.query.productMembers.findFirst({
      where: and(eq(productMembers.productId, r.product.id), eq(productMembers.userId, userId)),
    })
    if (!existing) {
      set.status = 404
      return { error: 'Member not found' }
    }

    const targetUser = await db.query.users.findFirst({ where: eq(users.id, userId) })

    if (existing.role === role) {
      return {
        id: existing.id,
        product: existing.product,
        productId: existing.productId,
        role: existing.role,
        addedAt: existing.addedAt,
        userId,
        userName: targetUser?.name,
        userEmail: targetUser?.email,
        userAvatar: targetUser?.avatar,
        userRole: targetUser?.role,
      }
    }

    if (existing.role === 'admin' && role !== 'admin') {
      const admins = await db
        .select({ id: productMembers.id })
        .from(productMembers)
        .where(and(eq(productMembers.productId, r.product.id), eq(productMembers.role, 'admin')))
      if (admins.length <= 1) {
        set.status = 400
        return { error: 'Cannot remove the last product admin' }
      }
    }

    const [updated] = await db
      .update(productMembers)
      .set({ role })
      .where(and(eq(productMembers.productId, r.product.id), eq(productMembers.userId, userId)))
      .returning()

    if (targetUser?.email) {
      const previousRole = existing.role
      void sendRoleChangeEmail({
        email: targetUser.email,
        userName: targetUser.name || 'there',
        productName: r.product.name,
        previousRole,
        newRole: role,
        changedByName: user.name || 'An administrator',
      })
    }

    return {
      id: updated!.id,
      product: updated!.product,
      productId: updated!.productId,
      role: updated!.role,
      addedAt: updated!.addedAt,
      userId,
      userName: targetUser?.name,
      userEmail: targetUser?.email,
      userAvatar: targetUser?.avatar,
      userRole: targetUser?.role,
    }
  }, {
    body: t.Object({
      role: t.String(),
    }),
  })

  // DELETE /api/products/:name/members/:userId
  .delete('/:name/members/:userId', async ({ params: { name, userId }, set }) => {
    const r = await resolveProductRef(decodeURIComponent(name))
    if (!r.ok) return rejectProductResolve(set, r)

    const [deleted] = await db.delete(productMembers)
      .where(and(
        eq(productMembers.productId, r.product.id),
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
  // When `product` query is omitted, any authenticated user may upload (e.g. create-product flow before a product exists).
  // When `product` is set, only owner / product admin / super_admin may upload for that product.
  .post('/upload-logo', async ({ body, query, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const productName = query.product?.trim()
    if (productName) {
      const resolved = await resolveProductRef(productName)
      if (!resolved.ok) {
        set.status = resolved.kind === 'ambiguous' ? 409 : 404
        return resolved.kind === 'ambiguous'
          ? { error: 'Multiple products match', candidates: resolved.candidates }
          : { error: 'Product not found' }
      }
      const scopedProduct = await db.query.products.findFirst({
        where: eq(products.id, resolved.product.id),
      })
      if (!scopedProduct) {
        set.status = 404
        return { error: 'Product not found' }
      }
      const allowed = await canManageProductBranding(user, scopedProduct.id, scopedProduct)
      if (!allowed) {
        set.status = 403
        return { error: 'Only the product owner, a product admin, or super admin can upload a logo for this product' }
      }
    }

    const file = body.file
    if (!file) {
      set.status = 400
      return { error: 'No file provided' }
    }

    const uploadsDir = join(import.meta.dir, '../../uploads/logos')

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
    query: t.Object({
      product: t.Optional(t.String()),
    }),
  })

  // PUT /api/products/:name - Update product name, description, logo
  .put('/:name', async ({ params: { name }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const r = await resolveProductRef(decodeURIComponent(name))
    if (!r.ok) return rejectProductResolve(set, r)

    const product = await db.query.products.findFirst({
      where: eq(products.id, r.product.id),
    })
    if (!product) {
      set.status = 404
      return { error: 'Product not found' }
    }

    const ownerOrSuper = isOwnerOrSuperAdmin(user, product)
    const productAdmin = await isProductAdmin(user.id, product.id)

    if (!ownerOrSuper && !productAdmin) {
      set.status = 403
      return { error: 'Only the product owner, a product admin, or super admin can update this product' }
    }

    if (!ownerOrSuper && productAdmin) {
      if (body.name !== undefined && body.name !== product.name) {
        set.status = 403
        return { error: 'Only the product owner or super admin can rename this product' }
      }
    }

    const updates: Record<string, any> = {}
    if (ownerOrSuper) {
      if (body.name !== undefined) updates.name = body.name
      if (body.description !== undefined) updates.description = body.description
      if (body.logo !== undefined) updates.logo = body.logo
    } else {
      if (body.description !== undefined) updates.description = body.description
      if (body.logo !== undefined) updates.logo = body.logo
    }

    if (Object.keys(updates).length === 0) {
      return product
    }

    try {
      // If name is changing, update denormalized product varchar rows for this product_id
      if (updates.name && updates.name !== product.name) {
        const pid = product.id
        await db.update(productMembers).set({ product: updates.name }).where(eq(productMembers.productId, pid))
        await db.update(stories).set({ product: updates.name }).where(eq(stories.productId, pid))
        await db.update(initiatives).set({ product: updates.name }).where(eq(initiatives.productId, pid))
        await db.update(activities).set({ product: updates.name }).where(eq(activities.productId, pid))
        await db.update(issues).set({ product: updates.name }).where(eq(issues.productId, pid))
        await db.update(productInvites).set({ product: updates.name }).where(eq(productInvites.productId, pid))
        await db.update(formConfigs).set({ product: updates.name }).where(eq(formConfigs.productId, pid))
      }

      const [updated] = await db.update(products)
        .set(updates)
        .where(eq(products.id, product.id))
        .returning()

      return updated
    } catch (e: any) {
      if (e.code === '23505') {
        set.status = 409
        return { error: 'Update conflict (duplicate project key or constraint)' }
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

    const r = await resolveProductRef(decodeURIComponent(name))
    if (!r.ok) return rejectProductResolve(set, r)

    const product = await db.query.products.findFirst({
      where: eq(products.id, r.product.id),
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

    const productScope = [product.id]

    // Delete all related data (no FK constraints on many tables, must clean up manually)
    await db.delete(taskStatusHistory).where(inArray(taskStatusHistory.productId, productScope))
    await db.delete(tasks).where(inArray(tasks.productId, productScope))
    await db.delete(testCycles).where(inArray(testCycles.productId, productScope))
    await db.delete(featureRequests).where(inArray(featureRequests.productId, productScope))
    await db.delete(consumerFeedbacks).where(inArray(consumerFeedbacks.productId, productScope))
    await db.delete(assets).where(inArray(assets.productId, productScope))
    await db.delete(assetTypes).where(inArray(assetTypes.productId, productScope))
    await db.delete(deliveries).where(inArray(deliveries.productId, productScope))
    await db.delete(releases).where(inArray(releases.productId, productScope))
    await db.delete(servers).where(inArray(servers.productId, productScope))
    await db.delete(favorites).where(inArray(favorites.productId, productScope))

    await db.delete(issues).where(eq(issues.productId, product.id))
    await db.delete(stories).where(eq(stories.productId, product.id))
    await db.delete(initiatives).where(eq(initiatives.productId, product.id))
    await db.delete(activities).where(eq(activities.productId, product.id))
    await db.delete(productInvites).where(eq(productInvites.productId, product.id))
    await db.delete(formConfigs).where(eq(formConfigs.productId, product.id))
    await db.delete(productMembers).where(eq(productMembers.productId, product.id))

    await db.delete(products).where(eq(products.id, product.id))

    return { success: true }
  })
