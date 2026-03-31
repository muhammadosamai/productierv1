import { Elysia, t } from 'elysia'
import { db } from '../db'
import { productInvites, productMembers, users } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { jwt } from '@elysiajs/jwt'
import { randomBytes } from 'node:crypto'

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

async function isProductAdmin(userId: string, product: string): Promise<boolean> {
  const member = await db.query.productMembers.findFirst({
    where: and(
      eq(productMembers.product, product),
      eq(productMembers.userId, userId),
    ),
  })
  return member?.role === 'admin'
}

export const inviteRoutes = new Elysia({ prefix: '/api/invites' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // POST /api/invites — Create invite or add existing user directly
  .post('/', async ({ body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    // Check if user is admin of the product (or super_admin)
    if (user.role !== 'super_admin' && !(await isProductAdmin(user.id, body.product))) {
      set.status = 403
      return { error: 'Only admins can invite members' }
    }

    const email = body.email.toLowerCase().trim()

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    })

    if (existingUser) {
      // Check if already a member
      const existingMember = await db.query.productMembers.findFirst({
        where: and(
          eq(productMembers.product, body.product),
          eq(productMembers.userId, existingUser.id),
        ),
      })

      if (existingMember) {
        set.status = 409
        return { error: 'User is already a member of this product' }
      }

      // Add directly to product members
      await db.insert(productMembers).values({
        product: body.product,
        userId: existingUser.id,
        role: body.role || 'member',
      })

      return {
        type: 'added',
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          avatar: existingUser.avatar,
        },
        product: body.product,
        role: body.role || 'member',
      }
    }

    // User doesn't exist — check for existing pending invite
    const existingInvite = await db.query.productInvites.findFirst({
      where: and(
        eq(productInvites.email, email),
        eq(productInvites.product, body.product),
        eq(productInvites.status, 'pending'),
      ),
    })

    if (existingInvite) {
      set.status = 409
      return { error: 'An invite for this email is already pending' }
    }

    // Create pending invite with unique token
    const token = randomBytes(32).toString('hex')

    const [invite] = await db.insert(productInvites).values({
      product: body.product,
      email,
      role: body.role || 'member',
      token,
      invitedByUserId: user.id,
    }).returning()

    return {
      type: 'invited',
      invite: {
        id: invite!.id,
        email: invite!.email,
        product: invite!.product,
        role: invite!.role,
        status: invite!.status,
        createdAt: invite!.createdAt,
      },
    }
  }, {
    body: t.Object({
      product: t.String({ minLength: 1 }),
      email: t.String({ minLength: 1 }),
      role: t.Optional(t.String()),
    }),
  })

  // GET /api/invites/product/:name — List pending invites for a product
  .get('/product/:name', async ({ params: { name }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    if (user.role !== 'super_admin' && !(await isProductAdmin(user.id, name))) {
      set.status = 403
      return { error: 'Only admins can view invites' }
    }

    const invites = await db.select({
      id: productInvites.id,
      email: productInvites.email,
      role: productInvites.role,
      status: productInvites.status,
      createdAt: productInvites.createdAt,
      invitedByUserId: productInvites.invitedByUserId,
    })
      .from(productInvites)
      .where(and(
        eq(productInvites.product, name),
        eq(productInvites.status, 'pending'),
      ))

    return invites
  })

  // DELETE /api/invites/:id — Cancel/revoke an invite
  .delete('/:id', async ({ params: { id }, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const invite = await db.query.productInvites.findFirst({
      where: eq(productInvites.id, id),
    })

    if (!invite) {
      set.status = 404
      return { error: 'Invite not found' }
    }

    if (user.role !== 'super_admin' && !(await isProductAdmin(user.id, invite.product))) {
      set.status = 403
      return { error: 'Only admins can revoke invites' }
    }

    await db.delete(productInvites).where(eq(productInvites.id, id))

    return { success: true }
  })
