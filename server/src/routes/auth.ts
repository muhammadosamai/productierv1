import { Elysia, t } from 'elysia'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '../db'
import {
  users,
  tasks,
  stories,
  initiatives,
  deliveries,
  activities,
  products,
  organizations,
  organizationMembers,
  onboardingProgress,
} from '../db/schema'
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireOrganizationAccess, requireSelfOrRole } from '../lib/authz'
import { getStorage } from '../storage'
import { getApiConfig } from '../config/api'
import { generateDailyBrief, resolveDailyBriefEntityFocus } from '../lib/brief/dailyBrief'
import { HomeScopeResolutionError, resolveAccessibleHomeScope } from '../lib/homeScope'
import { consumeRateLimit, resolveClientAddress } from '../lib/inMemoryRateLimiter'
import { isSchemaMismatchError, schemaMismatchMessage } from '../lib/schemaMismatch'
import {
  decodeCursor,
  encodeCursor,
  isLegacyListMode,
  parseListQuery,
  parseSort,
  toListEnvelope,
} from '../lib/listContract'

function isDatabaseUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const maybeErr = error as { code?: string; message?: string }
  const code = maybeErr.code?.toUpperCase()
  if (code && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ECONNRESET'].includes(code)) {
    return true
  }

  const message = (maybeErr.message || '').toLowerCase()
  return message.includes('econnrefused') ||
    message.includes('connection terminated') ||
    message.includes('terminating connection') ||
    message.includes('connection refused')
}

// Ownership/product references are ID-based; no denormalized owner/leader fields to cascade.
async function cascadeUserUpdate(user: { id: string; name: string; avatar: string | null }) {
  void user
}

function slugifyOrganizationName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'organization'
}

async function generateUniqueOrganizationSlug(name: string): Promise<string> {
  const base = slugifyOrganizationName(name)
  let candidate = base
  let suffix = 1
  while (true) {
    const existing = await db.query.organizations.findFirst({
      where: eq(organizations.slug, candidate),
      columns: { id: true },
    })
    if (!existing) return candidate
    candidate = `${base}-${suffix}`
    suffix += 1
  }
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function toNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toIsoText(value: unknown, fallback = ''): string {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isNaN(ms) ? fallback : value.toISOString()
  }
  return toText(value, fallback)
}

function toNullableIsoText(value: unknown): string | null {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isNaN(ms) ? null : value.toISOString()
  }
  return toNullableText(value)
}

const PASSWORD_MIN_LENGTH = 12
const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000
const passwordResetTokenStore = new Map<string, { userId: string; expiresAt: number }>()

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase()
}

function validatePasswordPolicy(password: string): { ok: true } | { ok: false; message: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` }
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'Password must include at least one lowercase letter' }
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Password must include at least one uppercase letter' }
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must include at least one number' }
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, message: 'Password must include at least one special character' }
  }
  return { ok: true }
}

function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function purgeExpiredPasswordResetTokens(now = Date.now()) {
  for (const [key, value] of passwordResetTokenStore.entries()) {
    if (value.expiresAt <= now) {
      passwordResetTokenStore.delete(key)
    }
  }
}

function issuePasswordResetToken(userId: string): string {
  purgeExpiredPasswordResetTokens()
  const token = randomBytes(32).toString('base64url')
  const hashed = hashPasswordResetToken(token)
  passwordResetTokenStore.set(hashed, {
    userId,
    expiresAt: Date.now() + PASSWORD_RESET_WINDOW_MS,
  })
  return token
}

function consumePasswordResetToken(token: string): string | null {
  purgeExpiredPasswordResetTokens()
  const hashed = hashPasswordResetToken(token)
  const record = passwordResetTokenStore.get(hashed)
  if (!record || record.expiresAt <= Date.now()) {
    passwordResetTokenStore.delete(hashed)
    return null
  }
  passwordResetTokenStore.delete(hashed)
  return record.userId
}

function revokePasswordResetTokensForUser(userId: string) {
  for (const [key, value] of passwordResetTokenStore.entries()) {
    if (value.userId === userId) {
      passwordResetTokenStore.delete(key)
    }
  }
}

function shouldExposeDevResetToken(): boolean {
  const explicit = process.env.AUTH_EXPOSE_DEV_RESET_TOKEN
  if (typeof explicit === 'string') {
    const normalized = explicit.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
  }
  return (process.env.NODE_ENV || 'development').toLowerCase() !== 'production'
}

function isInternalOrganizationUsersForward(headers: Record<string, string | undefined>): boolean {
  return headers['x-productier-internal-org-forward'] === 'organization-users-routes'
}

function retiredAuthUsersRoute(set: { status?: number | string }) {
  set.status = 410
  return {
    error: 'Legacy tenant route is retired. Use /api/organizations/:organizationId/users endpoints.',
  }
}

function normalizeHomeTaskSummary(task: unknown): Record<string, unknown> {
  const row = (task ?? {}) as Record<string, unknown>
  const status = toText(row.status, 'created')
  return {
    id: toText(row.id),
    title: toText(row.title, 'Untitled task'),
    status,
    priority: toText(row.priority, 'medium'),
    productId: toText(row.productId),
    product: toText(row.product, 'Unassigned product'),
    dueAt: toNullableIsoText(row.dueAt),
    storyTitle: toText(row.storyTitle),
    blockedReason: toNullableText(row.blockedReason),
    assigneeCoverage: toText(row.assigneeCoverage, 'assigned') === 'unassigned' ? 'unassigned' : 'assigned',
    ageDays: toFiniteNumber(row.ageDays),
    updatedAt: toIsoText(row.updatedAt, new Date().toISOString()),
  }
}

function normalizeHomeDashboardPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const riskBands = ['overdue', 'due_today', 'due_48h', 'blocked', 'unassigned_or_stalled'] as const
  const needsAttentionRaw = (payload.needsAttention ?? {}) as Record<string, unknown>
  const groupsRaw = (needsAttentionRaw.groups ?? {}) as Record<string, unknown>
  const normalizeGroup = (key: string, fallbackLabel: string) => {
    const row = (groupsRaw[key] ?? {}) as Record<string, unknown>
    const taskRows = Array.isArray(row.tasks) ? row.tasks : []
    return {
      key,
      label: toText(row.label, fallbackLabel),
      count: toFiniteNumber(row.count),
      tasks: taskRows.map((task) => normalizeHomeTaskSummary(task)),
    }
  }

  const normalizedGroups = {
    overdue: normalizeGroup('overdue', 'Overdue'),
    blockedOwned: normalizeGroup('blockedOwned', 'Blocked (My Scope)'),
    reviewWaiting: normalizeGroup('reviewWaiting', 'Waiting For My Review'),
    dueSoon: normalizeGroup('dueSoon', 'Due In 48h'),
    staleInProgress: normalizeGroup('staleInProgress', 'Stale In Progress'),
  }
  const riskTimelineRaw = (payload.riskTimeline ?? {}) as Record<string, unknown>
  const riskDaysRaw = Array.isArray(riskTimelineRaw.days) ? riskTimelineRaw.days : []
  const riskCellsRaw = Array.isArray(riskTimelineRaw.cells) ? riskTimelineRaw.cells : []
  const riskBandsRaw = Array.isArray(riskTimelineRaw.bands)
    ? riskTimelineRaw.bands.filter((entry): entry is string => typeof entry === 'string')
    : []
  const normalizedRiskBands = riskBandsRaw.length > 0 ? riskBandsRaw : [...riskBands]
  const riskTotalsRaw = (riskTimelineRaw.totalsByBand ?? {}) as Record<string, unknown>

  const reviewQueueRaw = (payload.reviewQueueHealth ?? {}) as Record<string, unknown>
  const reviewBucketsRaw = (reviewQueueRaw.buckets ?? {}) as Record<string, unknown>
  const personalWipRaw = (payload.personalWip ?? {}) as Record<string, unknown>
  const personalByStatusRaw = (personalWipRaw.byStatus ?? {}) as Record<string, unknown>
  const agingRaw = (payload.agingWork ?? {}) as Record<string, unknown>
  const agingBucketsRaw = (agingRaw.buckets ?? {}) as Record<string, unknown>
  const tasksByStatusRaw = (payload.tasksByStatus ?? {}) as Record<string, unknown>
  const activitiesRaw = Array.isArray(payload.activities) ? payload.activities : []

  return {
    ...payload,
    actionScore: {
      current: toFiniteNumber((payload.actionScore as any)?.current),
      target: toFiniteNumber((payload.actionScore as any)?.target),
      delta: (payload.actionScore as any)?.delta === null ? null : toFiniteNumber((payload.actionScore as any)?.delta),
      sampleSize: toFiniteNumber((payload.actionScore as any)?.sampleSize),
      status: (() => {
        const value = toText((payload.actionScore as any)?.status, 'healthy')
        return value === 'warning' || value === 'critical' ? value : 'healthy'
      })(),
      reasons: Array.isArray((payload.actionScore as any)?.reasons)
        ? ((payload.actionScore as any).reasons as unknown[]).map((reason) => {
          const row = (reason ?? {}) as Record<string, unknown>
          return {
            key: toText(row.key),
            label: toText(row.label),
            count: toFiniteNumber(row.count),
            weight: toFiniteNumber(row.weight),
          }
        })
        : [],
    },
    stats: {
      totalAssigned: toFiniteNumber((payload.stats as any)?.totalAssigned),
      totalCompleted: toFiniteNumber((payload.stats as any)?.totalCompleted),
      completionRate: toFiniteNumber((payload.stats as any)?.completionRate),
      overdueItems: toFiniteNumber((payload.stats as any)?.overdueItems),
      blockedCount: toFiniteNumber((payload.stats as any)?.blockedCount),
      dueSoonCount: toFiniteNumber((payload.stats as any)?.dueSoonCount),
      reviewQueueCount: toFiniteNumber((payload.stats as any)?.reviewQueueCount),
      staleCount: toFiniteNumber((payload.stats as any)?.staleCount),
      activeCount: toFiniteNumber((payload.stats as any)?.activeCount),
    },
    needsAttention: {
      total: toFiniteNumber(needsAttentionRaw.total),
      groups: normalizedGroups,
    },
    riskTimeline: {
      days: riskDaysRaw.map((day) => {
        const row = (day ?? {}) as Record<string, unknown>
        return {
          date: toText(row.date),
          dayNum: toFiniteNumber(row.dayNum),
          dayName: toText(row.dayName),
          isToday: Boolean(row.isToday),
        }
      }),
      bands: normalizedRiskBands,
      cells: riskCellsRaw.map((cell) => {
        const row = (cell ?? {}) as Record<string, unknown>
        return {
          date: toText(row.date),
          band: toText(row.band),
          count: toFiniteNumber(row.count),
        }
      }),
      totalsByBand: {
        overdue: toFiniteNumber(riskTotalsRaw.overdue),
        due_today: toFiniteNumber(riskTotalsRaw.due_today),
        due_48h: toFiniteNumber(riskTotalsRaw.due_48h),
        blocked: toFiniteNumber(riskTotalsRaw.blocked),
        unassigned_or_stalled: toFiniteNumber(riskTotalsRaw.unassigned_or_stalled),
      },
    },
    upcomingDeadlines: Array.isArray(payload.upcomingDeadlines)
      ? payload.upcomingDeadlines.map((task) => {
        const row = normalizeHomeTaskSummary(task)
        const source = (task ?? {}) as Record<string, unknown>
        return {
          ...row,
          type: 'task',
          riskReason: toText(source.riskReason),
          suggestedAction: toText(source.suggestedAction),
          daysAtRisk: toFiniteNumber(source.daysAtRisk),
          reviewAgeHours: source.reviewAgeHours == null ? undefined : toFiniteNumber(source.reviewAgeHours),
        }
      })
      : [],
    reviewQueueHealth: {
      total: toFiniteNumber(reviewQueueRaw.total),
      slaTargetHours: toFiniteNumber(reviewQueueRaw.slaTargetHours),
      buckets: {
        lt24: toFiniteNumber(reviewBucketsRaw.lt24),
        between24And72: toFiniteNumber(reviewBucketsRaw.between24And72),
        gt72: toFiniteNumber(reviewBucketsRaw.gt72),
      },
      slaBreachCount: toFiniteNumber(reviewQueueRaw.slaBreachCount),
      items: Array.isArray(reviewQueueRaw.items)
        ? reviewQueueRaw.items.map((item) => {
          const row = normalizeHomeTaskSummary(item)
          const source = (item ?? {}) as Record<string, unknown>
          return {
            ...row,
            reviewAgeHours: toFiniteNumber(source.reviewAgeHours),
          }
        })
        : [],
    },
    personalWip: {
      current: toFiniteNumber(personalWipRaw.current),
      limit: toFiniteNumber(personalWipRaw.limit),
      status: (() => {
        const value = toText(personalWipRaw.status, 'healthy')
        return value === 'warning' || value === 'over_limit' ? value : 'healthy'
      })(),
      byStatus: Object.fromEntries(
        Object.entries(personalByStatusRaw).map(([status, count]) => [status, toFiniteNumber(count)]),
      ),
    },
    agingWork: {
      buckets: {
        gt7: toFiniteNumber(agingBucketsRaw.gt7),
        gt14: toFiniteNumber(agingBucketsRaw.gt14),
        gt30: toFiniteNumber(agingBucketsRaw.gt30),
      },
      oldest: Array.isArray(agingRaw.oldest)
        ? agingRaw.oldest.map((task) => normalizeHomeTaskSummary(task))
        : [],
    },
    tasksByStatus: Object.fromEntries(
      Object.entries(tasksByStatusRaw).map(([status, count]) => [status, toFiniteNumber(count)]),
    ),
    totalTasks: toFiniteNumber(payload.totalTasks),
    activities: activitiesRaw.map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>
      return {
        id: toText(row.id),
        productId: toNullableText(row.productId),
        userId: toNullableText(row.userId),
        userName: toText(row.userName, 'Unknown user'),
        userAvatar: toNullableText(row.userAvatar),
        action: toText(row.action, 'updated'),
        entityType: toText(row.entityType, 'task'),
        entityId: toNullableText(row.entityId),
        entityTitle: toText(row.entityTitle),
        changes: Array.isArray(row.changes)
          ? row.changes.map((change) => {
            const source = (change ?? {}) as Record<string, unknown>
            return {
              field: toText(source.field),
              from: toNullableText(source.from),
              to: toNullableText(source.to),
            }
          })
          : null,
        createdAt: toIsoText(row.createdAt, new Date().toISOString()),
      }
    }),
    generatedAt: toIsoText(payload.generatedAt, new Date().toISOString()),
  }
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(authPlugin)

  // POST /api/auth/register
  .post('/register', async ({ body, jwt, set, headers }) => {
    const normalizedEmail = normalizeEmailAddress(body.email)
    const clientAddress = resolveClientAddress(headers)
    const addressRateLimit = consumeRateLimit({
      key: `auth-register:address:${clientAddress}`,
      windowMs: 15 * 60 * 1000,
      max: 30,
    })
    if (!addressRateLimit.allowed) {
      set.status = 429
      return { error: `Too many registration attempts. Try again in ${addressRateLimit.retryAfterSeconds} seconds.` }
    }

    const emailRateLimit = consumeRateLimit({
      key: `auth-register:email:${normalizedEmail}`,
      windowMs: 15 * 60 * 1000,
      max: 8,
    })
    if (!emailRateLimit.allowed) {
      set.status = 429
      return { error: `Too many registration attempts for this email. Try again in ${emailRateLimit.retryAfterSeconds} seconds.` }
    }

    if (body.bootstrapOrganization && !body.organizationName) {
      set.status = 400
      return { error: 'organizationName is required when bootstrapOrganization is true' }
    }

    const passwordPolicy = validatePasswordPolicy(body.password)
    if (!passwordPolicy.ok) {
      set.status = 400
      return { error: passwordPolicy.message }
    }

    // Check if email already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    })
    if (existing) {
      set.status = 409
      return { error: 'An account with this email already exists' }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(body.password, 10)

    // Create user
    const [user] = await db.insert(users).values({
      name: body.name,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'viewer',
    }).returning()

    let createdOrganization: { id: string; name: string; slug: string } | null = null
    let onboardingStep: 'organization' | 'workspace' = 'organization'
    if (body.bootstrapOrganization && body.organizationName) {
      const organizationName = body.organizationName.trim()
      const organizationSlug = await generateUniqueOrganizationSlug(organizationName)
      const [organization] = await db.insert(organizations).values({
        name: organizationName,
        slug: organizationSlug,
        createdByUserId: user!.id,
      }).returning()

      await db.insert(organizationMembers).values({
        organizationId: organization!.id,
        userId: user!.id,
        role: 'owner',
        invitedByUserId: user!.id,
      }).onConflictDoNothing()

      createdOrganization = {
        id: organization!.id,
        name: organization!.name,
        slug: organization!.slug,
      }
      onboardingStep = 'workspace'
    }

    await db.insert(onboardingProgress).values({
      userId: user!.id,
      organizationId: createdOrganization?.id || null,
      currentStep: onboardingStep,
      isCompleted: false,
    }).onConflictDoUpdate({
      target: onboardingProgress.userId,
      set: {
        organizationId: createdOrganization?.id || null,
        currentStep: onboardingStep,
        isCompleted: false,
        completedAt: null,
        updatedAt: new Date(),
      },
    })

    // Generate token
    const token = await jwt.sign({ userId: user!.id, role: user!.role })

    return {
      token,
      user: {
        id: user!.id,
        name: user!.name,
        email: user!.email,
        role: user!.role,
        isActive: user!.isActive,
        avatar: user!.avatar,
        createdAt: user!.createdAt,
      },
      organization: createdOrganization,
      onboarding: {
        currentStep: onboardingStep,
        isCompleted: false,
        organizationId: createdOrganization?.id || null,
      },
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      email: t.String({ minLength: 1 }),
      password: t.String({ minLength: PASSWORD_MIN_LENGTH }),
      organizationName: t.Optional(t.String({ minLength: 2, maxLength: 120 })),
      bootstrapOrganization: t.Optional(t.Boolean()),
      // Allowed for backward compatibility with old clients; ignored by server.
      role: t.Optional(t.Literal('viewer')),
    }),
  })

  // POST /api/auth/login
  .post('/login', async ({ body, jwt, set, headers }) => {
    try {
      const normalizedEmail = normalizeEmailAddress(body.email)
      const clientAddress = resolveClientAddress(headers)

      const addressRateLimit = consumeRateLimit({
        key: `auth-login:address:${clientAddress}`,
        windowMs: 15 * 60 * 1000,
        max: 40,
      })
      if (!addressRateLimit.allowed) {
        set.status = 429
        return { error: `Too many login attempts. Try again in ${addressRateLimit.retryAfterSeconds} seconds.` }
      }

      const emailRateLimit = consumeRateLimit({
        key: `auth-login:email:${normalizedEmail}`,
        windowMs: 15 * 60 * 1000,
        max: 12,
      })
      if (!emailRateLimit.allowed) {
        set.status = 429
        return { error: `Too many login attempts for this account. Try again in ${emailRateLimit.retryAfterSeconds} seconds.` }
      }

      const user = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      })
      if (!user) {
        set.status = 401
        return { error: 'Invalid email or password' }
      }
      if (!user.isActive) {
        set.status = 403
        return { error: 'Account is deactivated. Contact an administrator.' }
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
          isActive: user.isActive,
          avatar: user.avatar,
          createdAt: user.createdAt,
        },
      }
    } catch (error) {
      if (isDatabaseUnavailableError(error)) {
        set.status = 503
        return { error: 'Database is unavailable. Start PostgreSQL and try again.' }
      }
      if (isSchemaMismatchError(error)) {
        set.status = 503
        return { error: schemaMismatchMessage('Auth schema') }
      }

      console.error('Login endpoint failed:', error)
      set.status = 500
      return { error: 'Unexpected server error during login' }
    }
  }, {
    body: t.Object({
      email: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 }),
    }),
  })

  // POST /api/auth/forgot-password
  .post('/forgot-password', async ({ body, headers, set }) => {
    const normalizedEmail = normalizeEmailAddress(body.email)
    const clientAddress = resolveClientAddress(headers)

    const addressRateLimit = consumeRateLimit({
      key: `auth-forgot-password:address:${clientAddress}`,
      windowMs: 15 * 60 * 1000,
      max: 20,
    })
    if (!addressRateLimit.allowed) {
      set.status = 429
      return { error: `Too many password reset requests. Try again in ${addressRateLimit.retryAfterSeconds} seconds.` }
    }

    const emailRateLimit = consumeRateLimit({
      key: `auth-forgot-password:email:${normalizedEmail}`,
      windowMs: 15 * 60 * 1000,
      max: 6,
    })
    if (!emailRateLimit.allowed) {
      set.status = 429
      return { error: `Too many password reset requests for this account. Try again in ${emailRateLimit.retryAfterSeconds} seconds.` }
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
      columns: { id: true, isActive: true },
    })

    const exposeDevToken = shouldExposeDevResetToken()
    let devResetToken: string | undefined
    if (user?.isActive) {
      const issuedToken = issuePasswordResetToken(user.id)
      if (exposeDevToken) {
        devResetToken = issuedToken
      }
    } else if (exposeDevToken) {
      // Avoid leaking user existence in development token mode.
      devResetToken = randomBytes(32).toString('base64url')
    }

    return {
      success: true,
      message: 'If an account with that email exists, we have sent a password reset link.',
      ...(devResetToken ? { devResetToken } : {}),
    }
  }, {
    body: t.Object({
      email: t.String({ minLength: 1 }),
    }),
  })

  // POST /api/auth/reset-password
  .post('/reset-password', async ({ body, headers, set }) => {
    const clientAddress = resolveClientAddress(headers)
    const addressRateLimit = consumeRateLimit({
      key: `auth-reset-password:address:${clientAddress}`,
      windowMs: 15 * 60 * 1000,
      max: 20,
    })
    if (!addressRateLimit.allowed) {
      set.status = 429
      return { error: `Too many reset attempts. Try again in ${addressRateLimit.retryAfterSeconds} seconds.` }
    }

    const passwordPolicy = validatePasswordPolicy(body.password)
    if (!passwordPolicy.ok) {
      set.status = 400
      return { error: passwordPolicy.message }
    }

    const userId = consumePasswordResetToken(body.token.trim())
    if (!userId) {
      set.status = 400
      return { error: 'Invalid or expired password reset token' }
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true },
    })
    if (!user) {
      set.status = 400
      return { error: 'Invalid or expired password reset token' }
    }

    const hashedPassword = await bcrypt.hash(body.password, 10)
    await db.update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, user.id))

    revokePasswordResetTokensForUser(user.id)

    return {
      success: true,
      message: 'Password has been reset successfully.',
    }
  }, {
    body: t.Object({
      token: t.String({ minLength: 20 }),
      password: t.String({ minLength: PASSWORD_MIN_LENGTH }),
    }),
  })

  // GET /api/auth/me
  .get('/me', async ({ jwt, headers, set }) => {
    try {
      const authHeader = headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        set.status = 401
        return { error: 'Unauthorized' }
      }

      const token = authHeader.replace('Bearer ', '')
      const payload = await jwt.verify(token)
      if (!payload || typeof payload.userId !== 'string' || !payload.userId.trim()) {
        set.status = 401
        return { error: 'Invalid or expired token' }
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
      })
      if (!user) {
        set.status = 401
        return { error: 'User not found' }
      }
      if (!user.isActive) {
        set.status = 403
        return { error: 'Account is deactivated' }
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        avatar: user.avatar,
        createdAt: user.createdAt,
      }
    } catch (error) {
      if (isDatabaseUnavailableError(error)) {
        set.status = 503
        return { error: 'Database is unavailable. Start PostgreSQL and try again.' }
      }
      if (isSchemaMismatchError(error)) {
        set.status = 503
        return { error: schemaMismatchMessage('Auth schema') }
      }

      console.error('Auth me endpoint failed:', error)
      set.status = 500
      return { error: 'Unexpected server error while loading current user' }
    }
  })

  // GET /api/auth/users?q=search — Search users by name or email
  .get('/users', async ({ query, jwt, headers, set }) => {
    if (!isInternalOrganizationUsersForward(headers)) {
      return retiredAuthUsersRoute(set)
    }

    const requester = await requireAuth(jwt.verify, headers, set)
    if (!requester) return { error: 'Unauthorized' }

    const organizationId = typeof query.organizationId === 'string'
      ? query.organizationId.trim()
      : ''
    if (!organizationId) {
      set.status = 400
      return { error: 'organizationId query parameter is required' }
    }
    const organizationAccess = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const organizationMemberRows = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.organizationId, organizationId),
      columns: { userId: true },
    })
    const organizationUserIds = Array.from(new Set(organizationMemberRows.map((row) => row.userId)))
    if (organizationUserIds.length === 0) {
      const legacyMode = isLegacyListMode(parseListQuery(query as Record<string, unknown>, {
        defaultLimit: getApiConfig().usersSearchLimit,
        maxLimit: getApiConfig().usersListLimit,
      }))
      if (legacyMode) return []
      return toListEnvelope({
        items: [],
        nextCursor: null,
        hasMore: false,
        totalApprox: 0,
      })
    }

    const apiConfig = getApiConfig()
    const includeEmail = requester.role === 'super_admin' || requester.role === 'admin'
    const parsedList = parseListQuery(query as Record<string, unknown>, {
      defaultLimit: apiConfig.usersSearchLimit,
      maxLimit: apiConfig.usersListLimit,
    })
    const legacyMode = isLegacyListMode(parsedList)
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const qTerm = q.length > 0 ? q : null
    const sort = parseSort(parsedList.sort, ['createdAt'] as const, {
      field: 'createdAt',
      direction: 'desc',
      raw: 'createdAt:desc',
    })
    const cursor = legacyMode ? null : decodeCursor(parsedList.cursor)

    const selectFields = {
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatar: users.avatar,
      createdAt: users.createdAt,
    }

    const searchCondition = qTerm
      ? or(
        ilike(users.name, `%${qTerm}%`),
        ilike(users.email, `%${qTerm}%`),
      )
      : undefined

    const baseConditions = [inArray(users.id, organizationUserIds)]
    if (searchCondition) baseConditions.push(searchCondition)
    const conditions = [...baseConditions]
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt)
      if (!Number.isNaN(cursorDate.getTime())) {
        if (sort.direction === 'desc') {
          conditions.push(
            sql`(${users.createdAt} < ${cursorDate} OR (${users.createdAt} = ${cursorDate} AND ${users.id} < ${cursor.id}))`,
          )
        } else {
          conditions.push(
            sql`(${users.createdAt} > ${cursorDate} OR (${users.createdAt} = ${cursorDate} AND ${users.id} > ${cursor.id}))`,
          )
        }
      }
    }

    const baseLimit = legacyMode
      ? (qTerm ? apiConfig.usersSearchLimit : apiConfig.usersListLimit)
      : parsedList.limit
    const fetchLimit = legacyMode ? baseLimit : baseLimit + 1

    const userList = await db.select(selectFields).from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sort.direction === 'desc' ? desc(users.createdAt) : asc(users.createdAt),
        sort.direction === 'desc' ? desc(users.id) : asc(users.id),
      )
      .limit(fetchLimit)

    const hasMore = !legacyMode && userList.length > baseLimit
    const pagedUsers = hasMore ? userList.slice(0, baseLimit) : userList

    const countsByUser = new Map<string, { tasksAssigned: number; tasksCompleted: number }>()
    for (const user of pagedUsers) {
      countsByUser.set(user.id, { tasksAssigned: 0, tasksCompleted: 0 })
    }

    const userIds = pagedUsers.map(user => user.id)
    if (userIds.length > 0) {
      const userIdsArraySql = sql`array[${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`
      const taskRows = await db.execute(sql`
        select owner_user_id, assignee_user_ids, status
        from tasks
        where product_id in (
          select id
          from products
          where organization_id = ${organizationId}::uuid
        )
          and (
            owner_user_id = any(${userIdsArraySql})
            or (assignee_user_ids is not null and assignee_user_ids && ${userIdsArraySql})
          )
      `)

      for (const row of taskRows as any[]) {
        const involved = new Set<string>()
        const ownerId = typeof row.owner_user_id === 'string' ? row.owner_user_id : null
        if (ownerId && countsByUser.has(ownerId)) involved.add(ownerId)

        const assignees = Array.isArray(row.assignee_user_ids)
          ? row.assignee_user_ids as string[]
          : []
        for (const assigneeId of assignees) {
          if (countsByUser.has(assigneeId)) involved.add(assigneeId)
        }

        for (const involvedUserId of involved) {
          const current = countsByUser.get(involvedUserId)
          if (!current) continue
          current.tasksAssigned += 1
          if (row.status === 'done') current.tasksCompleted += 1
        }
      }
    }

    const shapedUsers = pagedUsers.map(user => ({
      id: user.id,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      createdAt: user.createdAt,
      tasksAssigned: countsByUser.get(user.id)?.tasksAssigned ?? 0,
      tasksCompleted: countsByUser.get(user.id)?.tasksCompleted ?? 0,
      ...(includeEmail ? { email: user.email } : {}),
    }))

    if (legacyMode) {
      return shapedUsers
    }

    let nextCursor: string | null = null
    if (hasMore && pagedUsers.length > 0) {
      const last = pagedUsers[pagedUsers.length - 1]!
      nextCursor = encodeCursor({
        id: last.id,
        createdAt: new Date(last.createdAt).toISOString(),
      })
    }

    let totalApprox: number | undefined
    if (!parsedList.cursor) {
      const [totalRow] = await db.select({
        value: sql<number>`count(*)::int`,
      }).from(users).where(and(...baseConditions))
      totalApprox = Number(totalRow?.value ?? 0)
    }

    return toListEnvelope({
      items: shapedUsers,
      nextCursor,
      hasMore,
      totalApprox,
    })
  })

  // GET /api/auth/users/:id/work — Get all work items for a user
  .get('/users/:id/work', async ({ params: { id }, query, set, jwt, headers }) => {
    if (!isInternalOrganizationUsersForward(headers)) {
      return retiredAuthUsersRoute(set)
    }

    const requester = await requireSelfOrRole(
      jwt.verify,
      headers,
      set,
      id,
      ['super_admin', 'admin', 'product_admin', 'product_manager']
    )
    if (!requester) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const organizationId = typeof query.organizationId === 'string'
      ? query.organizationId.trim()
      : ''
    if (!organizationId) {
      set.status = 400
      return { error: 'organizationId query parameter is required' }
    }
    const organizationAccess = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    // Ensure target user exists before returning scoped data.
    const user = await db.query.users.findFirst({ where: eq(users.id, id) })
    if (!user) {
      set.status = 404
      return { error: 'User not found' }
    }

    const targetMembership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, id),
      ),
      columns: { id: true },
    })
    if (!targetMembership) {
      set.status = 404
      return { error: 'User not found in organization' }
    }

    const parseSectionLimit = (raw: unknown, fallback: number) => {
      if (typeof raw !== 'string') return fallback
      const parsed = Number.parseInt(raw, 10)
      if (!Number.isFinite(parsed)) return fallback
      return Math.max(1, Math.min(parsed, 100))
    }

    const tasksLimit = parseSectionLimit(query.tasksLimit, 40)
    const storiesLimit = parseSectionLimit(query.storiesLimit, 30)
    const initiativesLimit = parseSectionLimit(query.initiativesLimit, 20)
    const deliveriesLimit = parseSectionLimit(query.deliveriesLimit, 20)
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const searchTerm = q.length > 0 ? q : null
    const organizationProductRows = await db.query.products.findMany({
      where: eq(products.organizationId, organizationId),
      columns: { id: true },
    })
    const organizationProductIds = organizationProductRows.map((row) => row.id)
    if (organizationProductIds.length === 0) {
      return {
        tasks: [],
        stories: [],
        initiatives: [],
        deliveries: [],
        paging: {
          tasks: { limit: tasksLimit, hasMore: false },
          stories: { limit: storiesLimit, hasMore: false },
          initiatives: { limit: initiativesLimit, hasMore: false },
          deliveries: { limit: deliveriesLimit, hasMore: false },
        },
      }
    }

    const taskWhere = and(
      inArray(tasks.productId, organizationProductIds),
      or(
        eq(tasks.ownerUserId, id),
        eq(tasks.createdByUserId, id),
        sql`${id} = any(${tasks.assigneeUserIds})`,
        sql`${id} = any(${tasks.reviewerUserIds})`,
      ),
      ...(searchTerm ? [ilike(tasks.title, `%${searchTerm}%`)] : []),
    )

    const userTasksRaw = await db.select().from(tasks)
      .where(taskWhere)
      .orderBy(desc(tasks.createdAt))
      .limit(tasksLimit + 1)
    const tasksHasMore = userTasksRaw.length > tasksLimit
    const userTasks = tasksHasMore ? userTasksRaw.slice(0, tasksLimit) : userTasksRaw

    const storiesWhere = and(
      inArray(stories.productId, organizationProductIds),
      eq(stories.ownerUserId, user.id),
      ...(searchTerm ? [ilike(stories.title, `%${searchTerm}%`)] : []),
    )
    const userStoriesRaw = await db.select().from(stories)
      .where(storiesWhere)
      .orderBy(desc(stories.createdAt))
      .limit(storiesLimit + 1)
    const storiesHasMore = userStoriesRaw.length > storiesLimit
    const userStories = storiesHasMore ? userStoriesRaw.slice(0, storiesLimit) : userStoriesRaw

    const initiativesWhere = and(
      inArray(initiatives.productId, organizationProductIds),
      eq(initiatives.leaderUserId, user.id),
      ...(searchTerm ? [ilike(initiatives.title, `%${searchTerm}%`)] : []),
    )
    const userInitiativesRaw = await db.select().from(initiatives)
      .where(initiativesWhere)
      .orderBy(desc(initiatives.createdAt))
      .limit(initiativesLimit + 1)
    const initiativesHasMore = userInitiativesRaw.length > initiativesLimit
    const userInitiatives = initiativesHasMore
      ? userInitiativesRaw.slice(0, initiativesLimit)
      : userInitiativesRaw

    const deliveriesWhere = and(
      inArray(deliveries.productId, organizationProductIds),
      eq(deliveries.createdByUserId, id),
      ...(searchTerm ? [ilike(deliveries.title, `%${searchTerm}%`)] : []),
    )
    const userDeliveriesRaw = await db.select().from(deliveries)
      .where(deliveriesWhere)
      .orderBy(desc(deliveries.createdAt))
      .limit(deliveriesLimit + 1)
    const deliveriesHasMore = userDeliveriesRaw.length > deliveriesLimit
    const userDeliveries = deliveriesHasMore
      ? userDeliveriesRaw.slice(0, deliveriesLimit)
      : userDeliveriesRaw

    return {
      tasks: userTasks,
      stories: userStories,
      initiatives: userInitiatives,
      deliveries: userDeliveries,
      paging: {
        tasks: { limit: tasksLimit, hasMore: tasksHasMore },
        stories: { limit: storiesLimit, hasMore: storiesHasMore },
        initiatives: { limit: initiativesLimit, hasMore: initiativesHasMore },
        deliveries: { limit: deliveriesLimit, hasMore: deliveriesHasMore },
      },
    }
  })

  // GET /api/auth/users/:id/home — Action-first home dashboard data
  .get('/users/:id/home', async ({ params: { id }, query, set, jwt, headers }) => {
    if (!isInternalOrganizationUsersForward(headers)) {
      return retiredAuthUsersRoute(set)
    }

    const requester = await requireSelfOrRole(
      jwt.verify,
      headers,
      set,
      id,
      ['super_admin', 'admin', 'product_admin', 'product_manager']
    )
    if (!requester) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const organizationId = typeof query.organizationId === 'string' ? query.organizationId.trim() : ''
    if (!organizationId) {
      set.status = 400
      return { error: 'organizationId query parameter is required' }
    }

    const organizationAccess = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, id) })
    if (!user) {
      set.status = 404
      return { error: 'User not found' }
    }

    const targetMembership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, id),
      ),
      columns: { id: true },
    })
    if (!targetMembership) {
      set.status = 404
      return { error: 'User not found in organization' }
    }

    let resolvedScope
    try {
      resolvedScope = await resolveAccessibleHomeScope(requester, {
        organizationId,
        scopeMode: query.scopeMode,
        productId: query.productId,
        teamId: query.teamId,
      })
    } catch (error) {
      if (error instanceof HomeScopeResolutionError) {
        set.status = error.status
        return { error: error.message }
      }
      if (isSchemaMismatchError(error)) {
        set.status = 503
        return { error: schemaMismatchMessage('Home scope schema') }
      }
      throw error
    }

    const now = new Date()
    const nowMs = now.getTime()
    const dayMs = 24 * 60 * 60 * 1000
    const hourMs = 60 * 60 * 1000
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayStartMs = todayStart.getTime()
    const tomorrowStartMs = todayStartMs + dayMs
    const dueSoonWindowMs = nowMs + 2 * dayMs
    const twoWeeksAheadMs = nowMs + 14 * dayMs
    const staleUpdatedThresholdMs = nowMs - 3 * dayMs
    const wipLimit = 6
    const reviewSlaTargetHours = 48

    const toMs = (value: string | Date | null | undefined): number | null => {
      if (!value) return null
      const parsed = new Date(value).getTime()
      return Number.isFinite(parsed) ? parsed : null
    }
    const toDateKey = (value: number) => new Date(value).toISOString().slice(0, 10)
    const isActiveStatus = (status: string) => !['done', 'archived'].includes(status)
    const hasAssigneeCoverage = (task: { ownerUserId: string | null; assigneeUserIds: string[] | null }) =>
      Boolean(task.ownerUserId) || ((task.assigneeUserIds?.length || 0) > 0)

    const scopeProductIds = resolvedScope.productIds
    const teamScopeCondition = resolvedScope.teamId
      ? or(
        eq(tasks.ownerTeamId, resolvedScope.teamId),
        sql`${tasks.assigneeTeamIds} && ARRAY[${resolvedScope.teamId}::uuid]::uuid[]`,
        sql`${tasks.reviewerTeamIds} && ARRAY[${resolvedScope.teamId}::uuid]::uuid[]`,
      )
      : null
    const userTasks = await db.select().from(tasks).where(
      and(
        or(
          eq(tasks.ownerUserId, id),
          eq(tasks.createdByUserId, id),
          sql`${id} = any(${tasks.assigneeUserIds})`,
          sql`${id} = any(${tasks.reviewerUserIds})`,
        ),
        scopeProductIds.length > 0 ? inArray(tasks.productId, scopeProductIds) : sql`false`,
        ...(teamScopeCondition ? [teamScopeCondition] : []),
      ),
    ).orderBy(desc(tasks.updatedAt), desc(tasks.createdAt), desc(tasks.id))

    const taskStoryIds = [...new Set(userTasks.map(task => task.storyId))]
    const storyRows = taskStoryIds.length > 0
      ? await db.select({
        id: stories.id,
        title: stories.title,
        productId: stories.productId,
      }).from(stories).where(inArray(stories.id, taskStoryIds))
      : []
    const storyById = new Map(storyRows.map(story => [story.id, story]))

    const referencedProductIds = [...new Set(userTasks.map((task) => storyById.get(task.storyId)?.productId || task.productId))]
    const productRows = referencedProductIds.length > 0
      ? await db.select({
        id: products.id,
        name: products.name,
      }).from(products).where(inArray(products.id, referencedProductIds))
      : []
    const productNameById = new Map(productRows.map((product) => [product.id, product.name]))

    const enrichedTasks = userTasks.map((task) => {
      const linkedStory = storyById.get(task.storyId)
      const resolvedProductId = linkedStory?.productId || task.productId
      const dueAtMs = toMs(task.dueAt)
      const updatedAtMs = toMs(task.updatedAt) ?? nowMs
      const startedAtMs = toMs(task.startedAt)
      const createdAtMs = toMs(task.createdAt) ?? nowMs
      const ageOriginMs = startedAtMs ?? createdAtMs
      const ageDays = Math.max(0, Math.round(((nowMs - ageOriginMs) / dayMs) * 10) / 10)
      const reviewAgeHours = Math.max(0, Math.round(((nowMs - updatedAtMs) / hourMs) * 10) / 10)
      const assigneeCoverage = hasAssigneeCoverage(task) ? 'assigned' : 'unassigned'

      return {
        ...task,
        storyTitle: linkedStory?.title || '',
        productId: resolvedProductId,
        product: productNameById.get(resolvedProductId) || resolvedProductId,
        dueAtMs,
        updatedAtMs,
        ageDays,
        reviewAgeHours,
        assigneeCoverage,
      }
    })

    const toTaskSummary = (task: typeof enrichedTasks[number]) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      productId: task.productId,
      product: task.product,
      dueAt: task.dueAt,
      storyTitle: task.storyTitle,
      blockedReason: task.blockedReason,
      assigneeCoverage: task.assigneeCoverage as 'assigned' | 'unassigned',
      ageDays: task.ageDays,
      updatedAt: task.updatedAt,
    })

    const sortByUrgency = (a: typeof enrichedTasks[number], b: typeof enrichedTasks[number]) => {
      const dueA = a.dueAtMs ?? Number.POSITIVE_INFINITY
      const dueB = b.dueAtMs ?? Number.POSITIVE_INFINITY
      if (dueA !== dueB) return dueA - dueB
      if (a.updatedAtMs !== b.updatedAtMs) return b.updatedAtMs - a.updatedAtMs
      return b.id.localeCompare(a.id)
    }

    const activeTasks = enrichedTasks.filter(task => isActiveStatus(task.status))
    const totalAssigned = enrichedTasks.length
    const totalCompleted = enrichedTasks.filter(task => task.status === 'done').length
    const completionRate = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0

    const overdueTasks = activeTasks.filter(task => (task.dueAtMs ?? Number.POSITIVE_INFINITY) < nowMs)
    const blockedTasks = activeTasks.filter(task => task.status === 'blocked')
    const dueSoonTasks = activeTasks.filter(task => {
      if (!task.dueAtMs) return false
      return task.dueAtMs >= nowMs && task.dueAtMs <= dueSoonWindowMs
    })
    const staleInProgressTasks = activeTasks.filter(task => task.status === 'in_progress' && task.ageDays > 7)
    const reviewQueueTasks = activeTasks.filter(task => task.status === 'in_review' && (task.reviewerUserIds || []).includes(id))

    const blockedOwnedTasks = blockedTasks.filter(task =>
      task.ownerUserId === id ||
      (task.assigneeUserIds || []).includes(id) ||
      (task.reviewerUserIds || []).includes(id)
    )
    const dueSoonNotStartedCount = dueSoonTasks.filter(task => ['created', 'assigned'].includes(task.status)).length
    const reviewSlaBreaches = reviewQueueTasks.filter(task => task.reviewAgeHours > reviewSlaTargetHours).length

    const weightedPenalty =
      overdueTasks.length * 1 +
      blockedOwnedTasks.length * 0.8 +
      reviewSlaBreaches * 0.6 +
      dueSoonNotStartedCount * 0.5 +
      staleInProgressTasks.length * 0.4
    const penaltyDenominator = Math.max(1, activeTasks.length)
    const actionScoreCurrent = Math.max(0, Math.round((1 - Math.min(1, weightedPenalty / penaltyDenominator)) * 100))
    const actionScoreStatus =
      actionScoreCurrent >= 80 ? 'healthy' :
        actionScoreCurrent >= 55 ? 'warning' :
          'critical'

    const actionScoreReasons = [
      { key: 'overdue', label: 'Overdue items', count: overdueTasks.length, weight: 1 },
      { key: 'blocked', label: 'Blocked items owned by me', count: blockedOwnedTasks.length, weight: 0.8 },
      { key: 'review_sla', label: 'Review SLA breaches', count: reviewSlaBreaches, weight: 0.6 },
      { key: 'due_soon', label: 'Due soon with low progress', count: dueSoonNotStartedCount, weight: 0.5 },
      { key: 'stale', label: 'Stale in-progress work', count: staleInProgressTasks.length, weight: 0.4 },
    ]
      .filter(reason => reason.count > 0)
      .sort((a, b) => (b.count * b.weight) - (a.count * a.weight))
      .slice(0, 3)

    const needsAttentionGroups = {
      overdue: {
        key: 'overdue',
        label: 'Overdue',
        count: overdueTasks.length,
        tasks: overdueTasks.sort(sortByUrgency).slice(0, 12).map(toTaskSummary),
      },
      blockedOwned: {
        key: 'blockedOwned',
        label: 'Blocked (My Scope)',
        count: blockedOwnedTasks.length,
        tasks: blockedOwnedTasks.sort(sortByUrgency).slice(0, 12).map(toTaskSummary),
      },
      reviewWaiting: {
        key: 'reviewWaiting',
        label: 'Waiting For My Review',
        count: reviewQueueTasks.length,
        tasks: reviewQueueTasks.sort((a, b) => b.reviewAgeHours - a.reviewAgeHours).slice(0, 12).map(toTaskSummary),
      },
      dueSoon: {
        key: 'dueSoon',
        label: 'Due In 48h',
        count: dueSoonTasks.length,
        tasks: dueSoonTasks.sort(sortByUrgency).slice(0, 12).map(toTaskSummary),
      },
      staleInProgress: {
        key: 'staleInProgress',
        label: 'Stale In Progress',
        count: staleInProgressTasks.length,
        tasks: staleInProgressTasks.sort((a, b) => b.ageDays - a.ageDays).slice(0, 12).map(toTaskSummary),
      },
    } as const
    const needsAttentionTotal = Object.values(needsAttentionGroups).reduce((sum, group) => sum + group.count, 0)

    const riskBands = ['overdue', 'due_today', 'due_48h', 'blocked', 'unassigned_or_stalled'] as const
    const riskDays = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(todayStartMs + index * dayMs)
      return {
        date: day.toISOString().slice(0, 10),
        dayNum: day.getDate(),
        dayName: day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        isToday: index === 0,
      }
    })
    const riskDayKeySet = new Set(riskDays.map(day => day.date))
    const todayKey = riskDays[0]?.date || toDateKey(todayStartMs)
    const riskCellCounts = new Map<string, number>()
    const setRiskCount = (date: string, band: typeof riskBands[number], increment = 1) => {
      const key = `${date}|${band}`
      riskCellCounts.set(key, (riskCellCounts.get(key) || 0) + increment)
    }
    const resolveRiskDate = (task: typeof enrichedTasks[number]) => {
      if (!task.dueAtMs) return todayKey
      const dueKey = toDateKey(task.dueAtMs)
      return riskDayKeySet.has(dueKey) ? dueKey : todayKey
    }

    for (const task of activeTasks) {
      const targetDate = resolveRiskDate(task)
      if ((task.dueAtMs ?? Number.POSITIVE_INFINITY) < todayStartMs) {
        setRiskCount(todayKey, 'overdue')
      } else if (task.dueAtMs && task.dueAtMs < tomorrowStartMs) {
        setRiskCount(targetDate, 'due_today')
      } else if (task.dueAtMs && task.dueAtMs <= dueSoonWindowMs) {
        setRiskCount(targetDate, 'due_48h')
      }

      if (task.status === 'blocked') {
        setRiskCount(targetDate, 'blocked')
      }

      const isStalled = task.updatedAtMs < staleUpdatedThresholdMs
      if (task.assigneeCoverage === 'unassigned' || isStalled) {
        setRiskCount(targetDate, 'unassigned_or_stalled')
      }
    }

    const riskCells = riskDays.flatMap(day => riskBands.map((band) => ({
      date: day.date,
      band,
      count: riskCellCounts.get(`${day.date}|${band}`) || 0,
    })))
    const riskTotalsByBand = Object.fromEntries(
      riskBands.map((band) => [
        band,
        riskCells.filter(cell => cell.band === band).reduce((sum, cell) => sum + cell.count, 0),
      ])
    )

    const describeDeadlineRisk = (task: typeof enrichedTasks[number]) => {
      if (task.status === 'blocked') {
        return { riskReason: 'Blocked work near due date', suggestedAction: 'Request unblock and replan delivery' }
      }
      if (task.assigneeCoverage === 'unassigned') {
        return { riskReason: 'No clear assignee', suggestedAction: 'Assign an owner immediately' }
      }
      if (task.status === 'in_review') {
        return { riskReason: 'Waiting for review close to due date', suggestedAction: 'Prioritize review turnaround' }
      }
      if (task.dueAtMs && task.dueAtMs < tomorrowStartMs) {
        return { riskReason: 'Due today', suggestedAction: 'Focus now or renegotiate scope' }
      }
      if (task.dueAtMs && task.dueAtMs <= dueSoonWindowMs && ['created', 'assigned'].includes(task.status)) {
        return { riskReason: 'Due soon with low progress', suggestedAction: 'Start immediately or reduce scope' }
      }
      return { riskReason: 'Upcoming deadline', suggestedAction: 'Validate readiness and owner coverage' }
    }

    const upcomingDeadlines = activeTasks
      .filter(task => task.dueAtMs && task.dueAtMs >= todayStartMs && task.dueAtMs <= twoWeeksAheadMs)
      .sort(sortByUrgency)
      .slice(0, 12)
      .map(task => {
        const description = describeDeadlineRisk(task)
        return {
          ...toTaskSummary(task),
          type: 'task' as const,
          riskReason: description.riskReason,
          suggestedAction: description.suggestedAction,
          daysAtRisk: task.status === 'blocked' ? task.ageDays : 0,
        }
      })

    const reviewQueueItems = reviewQueueTasks
      .sort((a, b) => b.reviewAgeHours - a.reviewAgeHours)
      .slice(0, 12)
      .map(task => ({
        ...toTaskSummary(task),
        reviewAgeHours: task.reviewAgeHours,
      }))
    const reviewQueueBuckets = {
      lt24: reviewQueueTasks.filter(task => task.reviewAgeHours < 24).length,
      between24And72: reviewQueueTasks.filter(task => task.reviewAgeHours >= 24 && task.reviewAgeHours <= 72).length,
      gt72: reviewQueueTasks.filter(task => task.reviewAgeHours > 72).length,
    }

    const activeWipStatuses = ['created', 'assigned', 'in_progress', 'in_review', 'blocked', 'overdue']
    const personalWipTasks = activeTasks.filter(task => activeWipStatuses.includes(task.status))
    const personalWipByStatus: Record<string, number> = {}
    for (const task of personalWipTasks) {
      personalWipByStatus[task.status] = (personalWipByStatus[task.status] || 0) + 1
    }
    const personalWipCurrent = personalWipTasks.length
    const personalWipStatus =
      personalWipCurrent <= wipLimit ? 'healthy' :
        personalWipCurrent <= wipLimit + 2 ? 'warning' :
          'over_limit'

    const agingCandidates = activeTasks.filter(task => task.ageDays > 7)
    const agingOldest = activeTasks
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 10)
      .map(task => ({
        ...toTaskSummary(task),
        ageDays: task.ageDays,
      }))
    const agingBuckets = {
      gt7: agingCandidates.filter(task => task.ageDays > 7).length,
      gt14: agingCandidates.filter(task => task.ageDays > 14).length,
      gt30: agingCandidates.filter(task => task.ageDays > 30).length,
    }

    const tasksByStatus: Record<string, number> = {}
    for (const task of enrichedTasks) {
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1
    }

    const userActivities = await db.query.activities.findMany({
      where: and(
        eq(activities.userId, id),
        scopeProductIds.length > 0 ? inArray(activities.productId, scopeProductIds) : sql`false`,
      ),
      orderBy: [desc(activities.createdAt), desc(activities.id)],
      limit: 20,
    })

    return normalizeHomeDashboardPayload({
      actionScore: {
        current: actionScoreCurrent,
        target: 85,
        delta: null as number | null,
        sampleSize: activeTasks.length,
        status: actionScoreStatus,
        reasons: actionScoreReasons,
      },
      stats: {
        totalAssigned,
        totalCompleted,
        completionRate,
        overdueItems: overdueTasks.length,
        blockedCount: blockedTasks.length,
        dueSoonCount: dueSoonTasks.length,
        reviewQueueCount: reviewQueueTasks.length,
        staleCount: staleInProgressTasks.length,
        activeCount: activeTasks.length,
      },
      needsAttention: {
        total: needsAttentionTotal,
        groups: needsAttentionGroups,
      },
      riskTimeline: {
        days: riskDays,
        bands: [...riskBands],
        cells: riskCells,
        totalsByBand: riskTotalsByBand,
      },
      upcomingDeadlines,
      reviewQueueHealth: {
        total: reviewQueueTasks.length,
        slaTargetHours: reviewSlaTargetHours,
        buckets: reviewQueueBuckets,
        slaBreachCount: reviewSlaBreaches,
        items: reviewQueueItems,
      },
      personalWip: {
        current: personalWipCurrent,
        limit: wipLimit,
        status: personalWipStatus,
        byStatus: personalWipByStatus,
      },
      agingWork: {
        buckets: agingBuckets,
        oldest: agingOldest,
      },
      tasksByStatus,
      totalTasks: enrichedTasks.length,
      activities: userActivities,
      generatedAt: now.toISOString(),
    })
  })

  // GET /api/auth/users/:id/daily-brief — AI-assisted start-of-day summary
  .get('/users/:id/daily-brief', async ({ params: { id }, query, set, jwt, headers }) => {
    if (!isInternalOrganizationUsersForward(headers)) {
      return retiredAuthUsersRoute(set)
    }

    const requester = await requireSelfOrRole(
      jwt.verify,
      headers,
      set,
      id,
      ['super_admin', 'admin', 'product_admin', 'product_manager'],
    )
    if (!requester) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const organizationId = typeof query.organizationId === 'string' ? query.organizationId.trim() : ''
    if (!organizationId) {
      set.status = 400
      return { error: 'organizationId query parameter is required' }
    }

    const organizationAccess = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      organizationId,
    )
    if (!organizationAccess) {
      return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, id) })
    if (!user) {
      set.status = 404
      return { error: 'User not found' }
    }

    if (organizationId) {
      const targetMembership = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, id),
        ),
        columns: { id: true },
      })
      if (!targetMembership) {
        set.status = 404
        return { error: 'User not found in organization' }
      }
    }

    const requestedView = typeof query.view === 'string' ? query.view.trim() : 'my_tasks'
    const view = requestedView === 'team' || requestedView === 'executive'
      ? requestedView
      : 'my_tasks'
    const requestedMode = typeof query.mode === 'string' ? query.mode.trim() : 'summary'
    const mode = requestedMode === 'full' ? 'full' : 'summary'

    const scopeRaw = typeof query.scope === 'string' ? query.scope.trim().toLowerCase() : ''
    const hasExplicitScope = scopeRaw.length > 0

    let scope: 'all_products' | 'product' | 'entity' = 'all_products'
    let scopedProductIds: string[] = []
    let scopedProductId: string | null = null
    let scopedEntityType: 'task' | 'story' | 'initiative' | 'delivery' | 'release' | null = null
    let scopedEntityId: string | null = null
    let scopedTeamId: string | null = null

    if (!hasExplicitScope) {
      let legacyScope
      try {
        legacyScope = await resolveAccessibleHomeScope(requester, {
          organizationId,
          scopeMode: query.scopeMode,
          productId: query.productId,
          teamId: query.teamId,
        })
      } catch (error) {
        if (error instanceof HomeScopeResolutionError) {
          set.status = error.status
          return { error: error.message }
        }
        if (isSchemaMismatchError(error)) {
          set.status = 503
          return { error: schemaMismatchMessage('Home scope schema') }
        }
        throw error
      }

      scope = legacyScope.mode === 'product' ? 'product' : 'all_products'
      scopedProductIds = [...legacyScope.productIds]
      scopedProductId = legacyScope.mode === 'product'
        ? (legacyScope.productIds[0] || null)
        : null
      scopedTeamId = legacyScope.teamId
    } else {
      scope = scopeRaw === 'product'
        ? 'product'
        : scopeRaw === 'entity'
          ? 'entity'
          : 'all_products'

      let allScope
      try {
        allScope = await resolveAccessibleHomeScope(requester, {
          organizationId,
          scopeMode: 'all',
        })
      } catch (error) {
        if (error instanceof HomeScopeResolutionError) {
          set.status = error.status
          return { error: error.message }
        }
        if (isSchemaMismatchError(error)) {
          set.status = 503
          return { error: schemaMismatchMessage('Home scope schema') }
        }
        throw error
      }
      const accessibleProductIds = [...allScope.productIds]
      const accessibleSet = new Set(accessibleProductIds)

      if (scope === 'product') {
        const productId = typeof query.productId === 'string' ? query.productId.trim() : ''
        if (!productId) {
          set.status = 400
          return { error: 'productId is required when scope=product' }
        }
        if (!accessibleSet.has(productId)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        scopedProductId = productId
        scopedProductIds = [productId]
      } else if (scope === 'entity') {
        const entityType = typeof query.entityType === 'string' ? query.entityType.trim().toLowerCase() : ''
        const entityId = typeof query.entityId === 'string' ? query.entityId.trim() : ''
        if (!entityType || !entityId) {
          set.status = 400
          return { error: 'entityType and entityId are required when scope=entity' }
        }

        const resolvedEntity = await resolveDailyBriefEntityFocus(entityType, entityId)
        if (!resolvedEntity) {
          set.status = 404
          return { error: 'Entity not found' }
        }
        if (!accessibleSet.has(resolvedEntity.productId)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        scopedEntityType = resolvedEntity.entityType
        scopedEntityId = resolvedEntity.entityId
        scopedProductId = resolvedEntity.productId
        scopedProductIds = [resolvedEntity.productId]
      } else {
        scopedProductIds = accessibleProductIds
      }
    }

    const requestedTemplate = typeof query.template === 'string'
      ? query.template.trim()
      : undefined

    return generateDailyBrief({
      userId: id,
      scope,
      productId: scopedProductId,
      productIds: scopedProductIds,
      teamId: scopedTeamId,
      entityType: scopedEntityType,
      entityId: scopedEntityId,
      template: requestedTemplate,
      view,
      mode,
    })
  })

  // PUT /api/auth/profile — Update name, email, avatar
  .put('/profile', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    // If email changed, check it's not taken
    if (body.email) {
      const existing = await db.query.users.findFirst({
        where: eq(users.email, body.email.toLowerCase()),
      })
      if (existing && existing.id !== user.id) {
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
      .where(eq(users.id, user.id))
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
      isActive: updated.isActive,
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
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const file = body.file
    if (!file) {
      set.status = 400
      return { error: 'No file provided' }
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'png'
    const filename = `${user.id}-${Date.now()}.${ext}`
    const storage = getStorage()
    const avatarUrl = (await storage.saveFile({
      namespace: 'avatars',
      filename,
      contentType: file.type || 'application/octet-stream',
      bytes: new Uint8Array(await file.arrayBuffer()),
    })).publicPath

    // Update user avatar in DB
    const [updated] = await db.update(users)
      .set({ avatar: avatarUrl })
      .where(eq(users.id, user.id))
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
        isActive: updated.isActive,
        avatar: updated.avatar,
        createdAt: updated.createdAt,
      } : null,
    }
  }, {
    body: t.Object({
      file: t.File({ maxSize: '5m', type: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] }),
    }),
  })
