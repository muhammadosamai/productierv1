import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import bcrypt from 'bcryptjs'
import { db } from '../db'
import { users, tasks, stories, initiatives, deliveries, activities, productInvites, productMembers, passwordResetTokens, emailPreferences } from '../db/schema'
import { eq, ilike, or, sql, arrayContains, and } from 'drizzle-orm'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/email'
import { effectiveTaskDeadlineUtcDay, serializeParentTaskRow } from '../lib/taskDates'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

// Cascade user name/avatar changes to all denormalized fields across entities
async function cascadeUserUpdate(user: { id: string; name: string; avatar: string | null }) {
  // Update initiatives where this user is the leader (stored by name)
  await db.update(initiatives)
    .set({ leaderAvatar: user.avatar })
    .where(eq(initiatives.leader, user.name))

  // Update stories where this user is the owner (stored by name)
  await db.update(stories)
    .set({ ownerAvatar: user.avatar })
    .where(eq(stories.owner, user.name))
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: JWT_SECRET,
      exp: '7d',
    })
  )

  // POST /api/auth/register
  .post('/register', async ({ body, jwt, set }) => {
    // Check if email already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    })
    if (existing) {
      set.status = 409
      return { error: 'An account with this email already exists' }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(body.password, 10)

    // Create user (always default to viewer — roles assigned by admins)
    const [user] = await db.insert(users).values({
      name: body.name,
      email: body.email.toLowerCase(),
      password: hashedPassword,
      role: 'viewer',
    }).returning()

    // If an invite token was provided, consume that specific invite
    if (body.inviteToken) {
      const invite = await db.query.productInvites.findFirst({
        where: and(
          eq(productInvites.token, body.inviteToken),
          eq(productInvites.status, 'pending'),
        ),
      })
      if (invite) {
        await db.insert(productMembers).values({
          product: invite.product,
          productId: invite.productId,
          userId: user!.id,
          role: invite.role,
        }).onConflictDoNothing()

        await db.update(productInvites)
          .set({ status: 'accepted' })
          .where(eq(productInvites.id, invite.id))
      }
    }

    // Auto-accept any other pending invites for this email
    const pendingInvites = await db.select().from(productInvites)
      .where(and(
        eq(productInvites.email, body.email.toLowerCase()),
        eq(productInvites.status, 'pending'),
      ))

    for (const invite of pendingInvites) {
      await db.insert(productMembers).values({
        product: invite.product,
        productId: invite.productId,
        userId: user!.id,
        role: invite.role,
      }).onConflictDoNothing()

      await db.update(productInvites)
        .set({ status: 'accepted' })
        .where(eq(productInvites.id, invite.id))
    }

    // Send welcome email (fire-and-forget)
    sendWelcomeEmail({ email: user!.email, userName: user!.name }).catch(() => {})

    // Generate token
    const token = await jwt.sign({ userId: user!.id, role: user!.role })

    return {
      token,
      user: {
        id: user!.id,
        name: user!.name,
        email: user!.email,
        role: user!.role,
        avatar: user!.avatar,
        createdAt: user!.createdAt,
      },
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      email: t.String({ minLength: 1 }),
      password: t.String({ minLength: 6 }),
      inviteToken: t.Optional(t.String()),
    }),
  })

  // POST /api/auth/login
  .post('/login', async ({ body, jwt, set }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    })
    if (!user) {
      set.status = 401
      return { error: 'Invalid email or password' }
    }

    const valid = await bcrypt.compare(body.password, user.password)
    if (!valid) {
      set.status = 401
      return { error: 'Invalid email or password' }
    }

    const token = await jwt.sign({ userId: user.id, role: user.role })

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    }
  }, {
    body: t.Object({
      email: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 }),
    }),
  })

  // POST /api/auth/forgot-password
  .post('/forgot-password', async ({ body }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    })

    if (user) {
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      })

      sendPasswordResetEmail({
        email: user.email,
        userName: user.name,
        token,
      }).catch(() => {})
    }

    return {
      success: true,
      message: 'If an account with that email exists, we have sent a password reset link.',
    }
  }, {
    body: t.Object({
      email: t.String({ minLength: 1 }),
    }),
  })

  // POST /api/auth/reset-password
  .post('/reset-password', async ({ body, set }) => {
    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.token, body.token),
      ),
    })

    if (!resetToken) {
      set.status = 400
      return { error: 'Invalid or expired reset link' }
    }

    if (resetToken.usedAt) {
      set.status = 400
      return { error: 'This reset link has already been used' }
    }

    if (new Date() > resetToken.expiresAt) {
      set.status = 400
      return { error: 'This reset link has expired' }
    }

    const hashedPassword = await bcrypt.hash(body.newPassword, 10)

    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, resetToken.userId))

    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id))

    return { success: true, message: 'Password has been reset successfully' }
  }, {
    body: t.Object({
      token: t.String({ minLength: 1 }),
      newPassword: t.String({ minLength: 6 }),
    }),
  })

  // GET /api/auth/me
  .get('/me', async ({ jwt, headers, set }) => {
    const authHeader = headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const token = authHeader.replace('Bearer ', '')
    const payload = await jwt.verify(token)
    if (!payload) {
      set.status = 401
      return { error: 'Invalid or expired token' }
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.userId as string),
    })
    if (!user) {
      set.status = 401
      return { error: 'User not found' }
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      createdAt: user.createdAt,
    }
  })

  // GET /api/auth/users?q=search — Search users by name or email
  .get('/users', async ({ query }) => {
    const q = query.q?.trim()
    const selectFields = {
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatar: users.avatar,
      createdAt: users.createdAt,
    }

    let userList
    if (!q) {
      userList = await db.select(selectFields).from(users).limit(100)
    } else {
      userList = await db.select(selectFields).from(users)
        .where(or(
          ilike(users.name, `%${q}%`),
          ilike(users.email, `%${q}%`),
        ))
        .limit(50)
    }

    // Enrich with task counts
    const allTasks = await db.select({
      id: tasks.id,
      status: tasks.status,
      ownerUserId: tasks.ownerUserId,
      assigneeUserIds: tasks.assigneeUserIds,
    }).from(tasks)

    const enriched = userList.map(user => {
      const userTasks = allTasks.filter(t =>
        t.ownerUserId === user.id ||
        (t.assigneeUserIds && t.assigneeUserIds.includes(user.id))
      )
      return {
        ...user,
        tasksAssigned: userTasks.length,
        tasksCompleted: userTasks.filter(t => t.status === 'done').length,
      }
    })

    return enriched
  })

  // GET /api/auth/users/:id/work — Get all work items for a user
  .get('/users/:id/work', async ({ params: { id }, set }) => {
    // Look up the user to get their name (needed for initiative leader / story owner matching)
    const user = await db.query.users.findFirst({ where: eq(users.id, id) })
    if (!user) {
      set.status = 404
      return { error: 'User not found' }
    }

    // Tasks: owner, assignee, or reviewer
    const allTasks = await db.select().from(tasks)
    const userTasks = allTasks.filter(t =>
      t.ownerUserId === id ||
      t.createdByUserId === id ||
      (t.assigneeUserIds && t.assigneeUserIds.includes(id)) ||
      (t.reviewerUserIds && t.reviewerUserIds.includes(id))
    )

    // Stories: owner matches user name
    const allStories = await db.select().from(stories)
    const userStories = allStories.filter(s => s.owner === user.name)

    // Initiatives: leader matches user name
    const allInitiatives = await db.select().from(initiatives)
    const userInitiatives = allInitiatives.filter(i => i.leader === user.name)

    // Deliveries: created by user
    const allDeliveries = await db.select().from(deliveries)
    const userDeliveries = allDeliveries.filter(d => d.createdByUserId === id)

    return {
      tasks: userTasks.map(t => serializeParentTaskRow(t as Record<string, unknown>)),
      stories: userStories,
      initiatives: userInitiatives,
      deliveries: userDeliveries,
    }
  })

  // GET /api/auth/users/:id/home — Aggregated home dashboard data
  .get('/users/:id/home', async ({ params: { id }, set }) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, id) })
    if (!user) {
      set.status = 404
      return { error: 'User not found' }
    }

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    // Fetch all tasks and stories
    const allTasks = await db.select().from(tasks)
    const allStories = await db.select().from(stories)

    // User's tasks
    const userTasks = allTasks.filter(t =>
      t.ownerUserId === id ||
      t.createdByUserId === id ||
      (t.assigneeUserIds && t.assigneeUserIds.includes(id)) ||
      (t.reviewerUserIds && t.reviewerUserIds.includes(id))
    )

    // Build story lookup for product name and story title
    const storyMap = new Map(allStories.map(s => [s.id, s]))

    // Enrich tasks with product name and story title
    const enrichedTasks = userTasks.map(t => {
      const story = storyMap.get(t.storyId)
      return {
        ...t,
        productName: story?.product || t.productId,
        storyTitle: story?.title || '',
      }
    })

    // User's stories
    const userStories = allStories.filter(s => s.owner === user.name)

    // Stats
    const totalAssigned = enrichedTasks.length
    const totalCompleted = enrichedTasks.filter(t => t.status === 'done').length
    const performancePct = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0
    const totalEstimatedHours = enrichedTasks.reduce((sum, t) => sum + (t.estimateValue || 0), 0)
    // Hours spent = estimated hours of completed tasks (as proxy)
    const totalHoursSpent = enrichedTasks
      .filter(t => t.status === 'done')
      .reduce((sum, t) => sum + (t.estimateValue || 0), 0)

    const overdueItems = enrichedTasks.filter(t => {
      if (['done', 'archived'].includes(t.status)) return false
      const dl = effectiveTaskDeadlineUtcDay(t)
      return !!(dl && dl.getTime() < now.getTime())
    }).length
    const blockedCount = enrichedTasks.filter(t => t.status === 'blocked').length

    // Task distribution by status (for gauge chart)
    // Count overdue separately (past effective deadline, not done/archived)
    const tasksByStatus: Record<string, number> = {}
    for (const t of enrichedTasks) {
      const dl = effectiveTaskDeadlineUtcDay(t)
      const isOverdue = !['done', 'archived'].includes(t.status) && !!(dl && dl.getTime() < now.getTime())
      if (isOverdue) {
        tasksByStatus['overdue'] = (tasksByStatus['overdue'] || 0) + 1
      } else {
        tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1
      }
    }

    // Weekly completion per product (last 8 weeks, stacked bar chart)
    const completedTasks = enrichedTasks.filter(t => t.status === 'done' && t.completedAt)
    const productNames = [...new Set(completedTasks.map(t => t.productName))].sort()

    const weekLabels: string[] = []
    const weekStarts: Date[] = []
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)
      // Align to Monday
      const day = weekStart.getDay()
      const diff = day === 0 ? -6 : 1 - day
      weekStart.setDate(weekStart.getDate() + diff)
      weekStart.setHours(0, 0, 0, 0)
      weekStarts.push(new Date(weekStart))
      const endOfWeek = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
      const label = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      weekLabels.push(label)
    }

    const weeklyByProduct: Record<string, number[]> = {}
    for (const pName of productNames) {
      weeklyByProduct[pName] = []
      for (let w = 0; w < weekStarts.length; w++) {
        const wStart = weekStarts[w]!
        const wEnd = new Date(wStart.getTime() + 7 * 24 * 60 * 60 * 1000)
        const count = completedTasks.filter(t =>
          t.productName === pName &&
          new Date(t.completedAt!) >= wStart && new Date(t.completedAt!) < wEnd
        ).length
        weeklyByProduct[pName].push(count)
      }
    }

    // Also compute weekly totals for the % label on top of each bar
    const weeklyTotals = weekStarts.map((wStart, w) => {
      const wEnd = new Date(wStart.getTime() + 7 * 24 * 60 * 60 * 1000)
      return completedTasks.filter(t =>
        new Date(t.completedAt!) >= wStart && new Date(t.completedAt!) < wEnd
      ).length
    })

    // Upcoming deadlines (effective end in next 14 days)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const upcomingDeadlines = enrichedTasks
      .filter(t => {
        if (['done', 'archived'].includes(t.status)) return false
        const due = effectiveTaskDeadlineUtcDay(t)
        if (!due) return false
        return due.getTime() >= todayStart.getTime() && due.getTime() <= twoWeeksAhead.getTime()
      })
      .map(t => ({
        id: t.id,
        title: t.title,
        type: 'task' as const,
        dueAt: effectiveTaskDeadlineUtcDay(t)!.toISOString(),
        product: t.productName,
        status: t.status,
      }))
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 8)

    // Blocked tasks
    const blockedTasks = enrichedTasks
      .filter(t => t.status === 'blocked')
      .slice(0, 5)

    // Weekly timeline: tasks with effective deadline in this week (Sun-Sat)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayOfWeek = today.getDay() // 0=Sun
    const weekStartDate = new Date(today.getTime() - dayOfWeek * 24 * 60 * 60 * 1000)
    const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000)

    const weeklyTimeline = enrichedTasks
      .filter(t => {
        if (['archived'].includes(t.status)) return false
        const due = effectiveTaskDeadlineUtcDay(t)
        if (!due) return false
        return due.getTime() >= weekStartDate.getTime() && due.getTime() < weekEndDate.getTime()
      })
      .map(t => ({
        id: t.id,
        title: t.title,
        dueAt: effectiveTaskDeadlineUtcDay(t)!.toISOString(),
        status: t.status,
        priority: t.priority,
        product: t.productName,
        assignees: t.assigneeUserIds || [],
      }))
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())

    // Build week days array
    const weekDays = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate.getTime() + i * 24 * 60 * 60 * 1000)
      weekDays.push({
        date: d.toISOString().split('T')[0],
        dayNum: d.getDate(),
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        isToday: d.getTime() === today.getTime(),
      })
    }

    // Peer performance: my completions vs avg peer completions per week (last 8 weeks)
    // allTasks already fetched above — use it for all users
    const allCompletedTasks = allTasks.filter(t => t.status === 'done' && t.completedAt)
    const allUserIds = [...new Set(allTasks.flatMap(t => {
      const ids: string[] = []
      if (t.ownerUserId) ids.push(t.ownerUserId)
      if (t.assigneeUserIds) ids.push(...t.assigneeUserIds)
      return ids
    }).filter(Boolean))]
    const peerIds = allUserIds.filter(uid => uid !== id)
    const peerCount = Math.max(peerIds.length, 1)

    const peerLabels: string[] = []
    const myCompletions: number[] = []
    const peerAvgCompletions: number[] = []

    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(weekStarts[i]!)
      const wEnd = new Date(wStart.getTime() + 7 * 24 * 60 * 60 * 1000)
      peerLabels.push(wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))

      // My completions this week
      const myCount = allCompletedTasks.filter(t => {
        const cAt = new Date(t.completedAt!)
        if (cAt < wStart || cAt >= wEnd) return false
        return t.ownerUserId === id ||
          t.createdByUserId === id ||
          (t.assigneeUserIds && t.assigneeUserIds.includes(id))
      }).length
      myCompletions.push(myCount)

      // Peer completions this week (total / peer count)
      const peerTotal = allCompletedTasks.filter(t => {
        const cAt = new Date(t.completedAt!)
        if (cAt < wStart || cAt >= wEnd) return false
        return peerIds.some(pid =>
          t.ownerUserId === pid ||
          (t.assigneeUserIds && t.assigneeUserIds.includes(pid))
        )
      }).length
      peerAvgCompletions.push(Math.round((peerTotal / peerCount) * 10) / 10)
    }

    // Activities (last 20 by this user)
    const userActivities = await db.query.activities.findMany({
      where: eq(activities.userId, id),
      orderBy: [sql`created_at DESC`],
      limit: 20,
    })

    // Counts per product
    const productCounts: Record<string, { stories: number; tasks: number }> = {}
    for (const t of enrichedTasks) {
      const p = t.productName
      if (!productCounts[p]) productCounts[p] = { stories: 0, tasks: 0 }
      productCounts[p].tasks++
    }
    for (const s of userStories) {
      const p = s.product
      if (!productCounts[p]) productCounts[p] = { stories: 0, tasks: 0 }
      productCounts[p].stories++
    }

    return {
      stats: { performancePct, totalAssigned, totalCompleted, totalEstimatedHours, totalHoursSpent, overdueItems, blockedCount },
      tasksByStatus,
      totalTasks: enrichedTasks.length,
      productCounts,
      tasks: enrichedTasks.filter(t => !['done', 'archived'].includes(t.status)).slice(0, 15),
      stories: userStories.slice(0, 10),
      activities: userActivities,
      weeklyPerformance: { labels: weekLabels, products: productNames, data: weeklyByProduct, totals: weeklyTotals },
      upcomingDeadlines,
      blockedTasks,
      weekTimeline: { days: weekDays, tasks: weeklyTimeline },
      peerPerformance: { labels: peerLabels, myData: myCompletions, peerAvgData: peerAvgCompletions },
    }
  })

  // PUT /api/auth/profile — Update name, email, avatar
  .put('/profile', async ({ body, jwt, headers, set }) => {
    const authHeader = headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const token = authHeader.replace('Bearer ', '')
    const payload = await jwt.verify(token)
    if (!payload) {
      set.status = 401
      return { error: 'Invalid or expired token' }
    }

    // If email changed, check it's not taken
    if (body.email) {
      const existing = await db.query.users.findFirst({
        where: eq(users.email, body.email.toLowerCase()),
      })
      if (existing && existing.id !== payload.userId) {
        set.status = 409
        return { error: 'Email is already in use by another account' }
      }
    }

    const updateData: Record<string, string> = {}
    if (body.name) updateData.name = body.name
    if (body.email) updateData.email = body.email.toLowerCase()
    if (body.avatar !== undefined) updateData.avatar = body.avatar

    const [updated] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, payload.userId as string))
      .returning()

    if (!updated) {
      set.status = 404
      return { error: 'User not found' }
    }

    // Cascade avatar/name changes to denormalized fields
    if (body.avatar !== undefined || body.name) {
      await cascadeUserUpdate(updated)
    }

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      avatar: updated.avatar,
      createdAt: updated.createdAt,
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1 })),
      email: t.Optional(t.String({ minLength: 1 })),
      avatar: t.Optional(t.String()),
    }),
  })

  // POST /api/auth/upload-avatar — Upload avatar image file
  .post('/upload-avatar', async ({ body, jwt, headers, set }) => {
    const authHeader = headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const token = authHeader.replace('Bearer ', '')
    const payload = await jwt.verify(token)
    if (!payload) {
      set.status = 401
      return { error: 'Invalid or expired token' }
    }

    const file = body.file
    if (!file) {
      set.status = 400
      return { error: 'No file provided' }
    }

    const uploadsDir = join(import.meta.dir, '../../uploads/avatars')

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'png'
    const filename = `${payload.userId}-${Date.now()}.${ext}`
    const filepath = join(uploadsDir, filename)

    // Use node:fs writeFile + Buffer.from to avoid Bun ReadableStreamBYOBReader issues
    const arrayBuffer = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(arrayBuffer))

    // URL path that will be served by the static plugin
    const avatarUrl = `/uploads/avatars/${filename}`

    // Update user avatar in DB
    const [updated] = await db.update(users)
      .set({ avatar: avatarUrl })
      .where(eq(users.id, payload.userId as string))
      .returning()

    // Cascade avatar change to denormalized fields
    if (updated) {
      await cascadeUserUpdate(updated)
    }

    return {
      avatar: avatarUrl,
      user: updated ? {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        avatar: updated.avatar,
        createdAt: updated.createdAt,
      } : null,
    }
  }, {
    body: t.Object({
      file: t.File({ maxSize: '10m', type: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] }),
    }),
  })

  // GET /api/auth/email-preferences
  .get('/email-preferences', async ({ jwt, headers, set }) => {
    const authHeader = headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const token = authHeader.replace('Bearer ', '')
    const payload = await jwt.verify(token)
    if (!payload) {
      set.status = 401
      return { error: 'Invalid or expired token' }
    }

    const prefs = await db.query.emailPreferences.findFirst({
      where: eq(emailPreferences.userId, payload.userId as string),
    })

    return prefs || {
      assignedToMe: true,
      statusChanges: true,
      newComments: true,
      deadlineReminders: true,
    }
  })

  // PUT /api/auth/email-preferences
  .put('/email-preferences', async ({ body, jwt, headers, set }) => {
    const authHeader = headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const token = authHeader.replace('Bearer ', '')
    const payload = await jwt.verify(token)
    if (!payload) {
      set.status = 401
      return { error: 'Invalid or expired token' }
    }

    const userId = payload.userId as string

    const existing = await db.query.emailPreferences.findFirst({
      where: eq(emailPreferences.userId, userId),
    })

    if (existing) {
      const [updated] = await db.update(emailPreferences)
        .set({
          assignedToMe: body.assignedToMe,
          statusChanges: body.statusChanges,
          newComments: body.newComments,
          deadlineReminders: body.deadlineReminders,
        })
        .where(eq(emailPreferences.userId, userId))
        .returning()
      return updated
    }

    const [created] = await db.insert(emailPreferences).values({
      userId,
      assignedToMe: body.assignedToMe,
      statusChanges: body.statusChanges,
      newComments: body.newComments,
      deadlineReminders: body.deadlineReminders,
    }).returning()

    return created
  }, {
    body: t.Object({
      assignedToMe: t.Boolean(),
      statusChanges: t.Boolean(),
      newComments: t.Boolean(),
      deadlineReminders: t.Boolean(),
    }),
  })
