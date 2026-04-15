import { Elysia, t } from 'elysia'
import { db } from '../db'
import { products, productMembers, users, stories, tasks, initiatives, deliveries, releases, servers, testCycles, favorites, assetTypes, assets, featureRequests, consumerFeedbacks, taskStatusHistory, activities } from '../db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sendRoleChangeEmail } from '../services/email'
import { isProductMemberRole } from '../lib/productMemberRoles'
import {
  resolveProductByScope,
  whereDenormProductMatches,
  denormalizedProductScopeValue,
} from '../lib/resolveProductScope'

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

async function isProductAdmin(userId: string, productRef: string): Promise<boolean> {
  const scopeRow = await resolveProductByScope(productRef)
  if (!scopeRow) return false
  const member = await db.query.productMembers.findFirst({
    where: and(whereDenormProductMatches(productMembers.product, scopeRow), eq(productMembers.userId, userId)),
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
  productName: string,
  product: { createdByUserId: string },
): Promise<boolean> {
  if (isOwnerOrSuperAdmin(user, product)) return true
  return isProductAdmin(user.id, productName)
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

/** Postgres unique_violation on legacy products.name unique index (until migration 0017 or drop script). */
function isProductsNameUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; constraint_name?: string; constraint?: string; detail?: string; table_name?: string }
  if (err.code !== '23505') return false
  const cn = err.constraint_name || err.constraint
  if (cn === 'products_name_unique') return true
  const d = `${err.detail || ''} ${err.table_name || ''}`
  return d.includes('Key (name)') && !d.includes('Key (project_key)')
}

const DUPLICATE_DISPLAY_NAME_BLOCKED =
  'This database still has a unique constraint on product names. From the server directory run: bun run db:drop-products-name-unique (or apply Drizzle migration 0017). After that, multiple products can share the same display name; use each product’s project key in URLs.'

export const productRoutes = new Elysia({ prefix: '/api/products' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // GET /api/products - List products (filtered by membership, super_admin sees all)
  .get('/', async ({ jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)

    let roleByProduct: Record<string, string> = {}
    if (user) {
      const membershipRows = await db
        .select({ product: productMembers.product, role: productMembers.role })
        .from(productMembers)
        .where(eq(productMembers.userId, user.id))
      roleByProduct = Object.fromEntries(membershipRows.map((r) => [r.product, r.role]))
    }

    const attachMyRole = <T extends { name: string; projectKey?: string | null }>(list: T[]) =>
      list.map((p) => ({
        ...p,
        myRole:
          roleByProduct[p.name]
          ?? (p.projectKey ? roleByProduct[p.projectKey] : null)
          ?? null,
      }))

    // Unauthenticated or super_admin: return all
    if (!user || user.role === 'super_admin') {
      const list = await db.query.products.findMany({
        orderBy: (items, { asc }) => [asc(items.name)],
      })
      return attachMyRole(list)
    }

    // Return only products the user is a member of
    const memberProducts = await db
      .select({ product: productMembers.product })
      .from(productMembers)
      .where(eq(productMembers.userId, user.id))

    const memberScopeRefs = memberProducts.map(m => m.product)
    if (memberScopeRefs.length === 0) return []

    const allProducts = await db.query.products.findMany({
      orderBy: (items, { asc }) => [asc(items.name)],
    })

    return attachMyRole(
      allProducts.filter(p =>
        memberScopeRefs.includes(p.name)
        || (p.projectKey ? memberScopeRefs.includes(p.projectKey) : false),
      ),
    )
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

      const memberScope = denormalizedProductScopeValue(product!)

      // Auto-add creator as admin member
      await db.insert(productMembers).values({
        product: memberScope,
        userId: user.id,
        role: 'admin',
      })

      // Add additional team members if provided
      if (body.members && body.members.length > 0) {
        for (const member of body.members) {
          if (member.userId !== user.id) {
            await db.insert(productMembers).values({
              product: memberScope,
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
        if (isProductsNameUniqueViolation(e)) {
          return { error: DUPLICATE_DISPLAY_NAME_BLOCKED }
        }
        return { error: 'A product with this project key already exists' }
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
  .get('/:name/members', async ({ params: { name }, set }) => {
    const scopeRow = await resolveProductByScope(name)
    if (!scopeRow) {
      set.status = 404
      return { error: 'Product not found' }
    }

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
      .where(whereDenormProductMatches(productMembers.product, scopeRow))

    return members
  })

  // POST /api/products/:name/members
  .post('/:name/members', async ({ params: { name }, body, set }) => {
    const scopeRow = await resolveProductByScope(name)
    if (!scopeRow) {
      set.status = 404
      return { error: 'Product not found' }
    }
    const memberScope = denormalizedProductScopeValue(scopeRow)

    try {
      const [member] = await db.insert(productMembers).values({
        product: memberScope,
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

    const scopeRow = await resolveProductByScope(name)
    if (!scopeRow) {
      set.status = 404
      return { error: 'Product not found' }
    }

    const canManage = user.role === 'super_admin' || await isProductAdmin(user.id, name)
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
      where: and(whereDenormProductMatches(productMembers.product, scopeRow), eq(productMembers.userId, userId)),
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
        .where(and(whereDenormProductMatches(productMembers.product, scopeRow), eq(productMembers.role, 'admin')))
      if (admins.length <= 1) {
        set.status = 400
        return { error: 'Cannot remove the last product admin' }
      }
    }

    const [updated] = await db
      .update(productMembers)
      .set({ role })
      .where(and(whereDenormProductMatches(productMembers.product, scopeRow), eq(productMembers.userId, userId)))
      .returning()

    if (targetUser?.email) {
      const previousRole = existing.role
      void sendRoleChangeEmail({
        email: targetUser.email,
        userName: targetUser.name || 'there',
        productName: scopeRow.name,
        previousRole,
        newRole: role,
        changedByName: user.name || 'An administrator',
      })
    }

    return {
      id: updated!.id,
      product: updated!.product,
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
    const scopeRow = await resolveProductByScope(name)
    if (!scopeRow) {
      set.status = 404
      return { error: 'Product not found' }
    }

    const [deleted] = await db.delete(productMembers)
      .where(and(
        whereDenormProductMatches(productMembers.product, scopeRow),
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
      const scopeRow = await resolveProductByScope(productName)
      if (!scopeRow) {
        set.status = 404
        return { error: 'Product not found' }
      }
      const scopedProduct = await db.query.products.findFirst({
        where: eq(products.id, scopeRow.id),
      })
      if (!scopedProduct) {
        set.status = 404
        return { error: 'Product not found' }
      }
      const allowed = await canManageProductBranding(user, productName, scopedProduct)
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

    const scopeRow = await resolveProductByScope(name)
    if (!scopeRow) {
      set.status = 404
      return { error: 'Product not found' }
    }

    const product = await db.query.products.findFirst({
      where: eq(products.id, scopeRow.id),
    })
    if (!product) {
      set.status = 404
      return { error: 'Product not found' }
    }

    const ownerOrSuper = isOwnerOrSuperAdmin(user, product)
    const productAdmin = await isProductAdmin(user.id, name)

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
      const [updated] = await db.update(products)
        .set(updates)
        .where(eq(products.id, product.id))
        .returning()

      return updated
    } catch (e: any) {
      if (e.code === '23505') {
        set.status = 409
        if (isProductsNameUniqueViolation(e)) {
          return { error: DUPLICATE_DISPLAY_NAME_BLOCKED }
        }
        return { error: 'A product with this project key already exists' }
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

    const scopeRow = await resolveProductByScope(name)
    if (!scopeRow) {
      set.status = 404
      return { error: 'Product not found' }
    }

    // Find the product
    const product = await db.query.products.findFirst({
      where: eq(products.id, scopeRow.id),
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

    const denorm = denormalizedProductScopeValue(scopeRow)
    const productScope = Array.from(
      new Set(
        [scopeRow.name, denorm, product.id, ...(scopeRow.projectKey ? [scopeRow.projectKey] : [])],
      ),
    )

    // Delete all related data (no FK constraints, must clean up manually)
    // Tables with `productId` field (varchar matching product name)
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

    // Tables with `product` field (varchar matching product name)
    await db.delete(stories).where(whereDenormProductMatches(stories.product, scopeRow))
    await db.delete(initiatives).where(whereDenormProductMatches(initiatives.product, scopeRow))
    await db.delete(activities).where(whereDenormProductMatches(activities.product, scopeRow))
    await db.delete(productMembers).where(whereDenormProductMatches(productMembers.product, scopeRow))

    // Finally delete the product itself
    await db.delete(products).where(eq(products.id, product.id))

    return { success: true }
  })
