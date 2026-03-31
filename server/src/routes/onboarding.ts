import { Elysia, t } from 'elysia'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  activities,
  onboardingProgress,
  organizationInvites,
  organizationMembers,
  organizationTeamMembers,
  organizationTeams,
  organizations,
  productMembers,
  products,
  titles,
  userTitles,
  users,
} from '../db/schema'
import { authPlugin } from '../plugins/auth'
import { requireAuth, requireOrganizationAccess } from '../lib/authz'
import { computeChanges, logActivity } from '../lib/logActivity'
import { PRODUCT_CREATOR_MEMBER_ROLE } from '../lib/productMembershipPolicy'
import { consumeRateLimit, resolveClientAddress } from '../lib/inMemoryRateLimiter'
import { isMissingColumnError, isSchemaMismatchError, schemaMismatchMessage } from '../lib/schemaMismatch'
import { getStorage } from '../storage'

const ORGANIZATION_MANAGER_ROLES = ['owner', 'admin'] as const
const INVITE_TTL_DAYS = 7
const MAX_INVITES_PER_REQUEST = 20
const MAX_PENDING_INVITES_PER_ORGANIZATION = 200
const MAX_ORGANIZATION_DESCRIPTION_LENGTH = 2000
const MAX_LOGO_URL_LENGTH = 1000
const MAX_INVITEE_NAME_LENGTH = 255
const PASSWORD_MIN_LENGTH = 12

type OnboardingStep = 'account' | 'organization' | 'workspace' | 'invites' | 'completed'

interface MembershipSummary {
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationDescription: string | null
  organizationLogo: string | null
  role: string
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

function normalizeOptionalLogo(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized.slice(0, MAX_LOGO_URL_LENGTH)
}

function normalizeOptionalInviteeName(value: string | null | undefined): string | null {
  return normalizeOptionalText(value, MAX_INVITEE_NAME_LENGTH)
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized
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

function inviteTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function createInviteToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

function inviteExpiresAt(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
}

function buildInviteLink(token: string): string {
  const base = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '')
  const path = `/onboarding/accept-invite?token=${encodeURIComponent(token)}`
  return base ? `${base}${path}` : path
}

async function upsertOnboardingState(input: {
  userId: string
  organizationId?: string | null
  currentStep: OnboardingStep
  isCompleted: boolean
}) {
  await db.insert(onboardingProgress).values({
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    currentStep: input.currentStep,
    isCompleted: input.isCompleted,
    completedAt: input.isCompleted ? new Date() : null,
  }).onConflictDoUpdate({
    target: onboardingProgress.userId,
    set: {
      organizationId: input.organizationId ?? null,
      currentStep: input.currentStep,
      isCompleted: input.isCompleted,
      completedAt: input.isCompleted ? new Date() : null,
      updatedAt: new Date(),
    },
  })
}

async function resolveMemberships(userId: string): Promise<MembershipSummary[]> {
  try {
    const rows = await db
      .select({
        organizationId: organizationMembers.organizationId,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        organizationDescription: organizations.description,
        organizationLogo: organizations.logo,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, userId))
      .orderBy(desc(organizationMembers.joinedAt))
    return rows
  } catch (error) {
    if (!isMissingColumnError(error, 'organizations.description') && !isMissingColumnError(error, 'organizations.logo')) {
      throw error
    }

    const rows = await db
      .select({
        organizationId: organizationMembers.organizationId,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, userId))
      .orderBy(desc(organizationMembers.joinedAt))

    return rows.map((row) => ({
      ...row,
      organizationDescription: null,
      organizationLogo: null,
    }))
  }
}

async function resolveWorkspaceCounts(organizationIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (organizationIds.length === 0) return result

  const rows = await db
    .select({
      organizationId: products.organizationId,
      count: sql<number>`count(*)::int`,
    })
    .from(products)
    .where(inArray(products.organizationId, organizationIds))
    .groupBy(products.organizationId)

  for (const row of rows) {
    if (row.organizationId) result.set(row.organizationId, Number(row.count || 0))
  }
  return result
}

async function resolvePendingInviteCounts(organizationIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (organizationIds.length === 0) return result

  const rows = await db
    .select({
      organizationId: organizationInvites.organizationId,
      count: sql<number>`count(*)::int`,
    })
    .from(organizationInvites)
    .where(and(
      inArray(organizationInvites.organizationId, organizationIds),
      eq(organizationInvites.status, 'pending'),
      gt(organizationInvites.expiresAt, new Date())
    ))
    .groupBy(organizationInvites.organizationId)

  for (const row of rows) {
    result.set(row.organizationId, Number(row.count || 0))
  }
  return result
}

function deriveSuggestedStep(input: {
  activeOrganizationId: string | null
  workspaceCounts: Map<string, number>
  progressStep: OnboardingStep
  isCompleted: boolean
}): OnboardingStep {
  if (input.isCompleted) return 'completed'
  if (!input.activeOrganizationId) return 'organization'
  const workspaceCount = input.workspaceCounts.get(input.activeOrganizationId) || 0
  if (workspaceCount <= 0) return 'workspace'
  if (input.progressStep === 'completed') return 'invites'
  return input.progressStep === 'organization' ? 'invites' : input.progressStep
}

async function countOrganizationMembers(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId))
  return Number(row?.value || 0)
}

async function countOrganizationWorkspaces(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.organizationId, organizationId))
  return Number(row?.value || 0)
}

function sanitizeInviteRole(role: string | null | undefined): 'owner' | 'admin' | 'member' | 'viewer' {
  if (role === 'owner' || role === 'admin' || role === 'viewer') return role
  return 'member'
}

async function resolveOrganizationByInviteToken(token: string) {
  return db.query.organizationInvites.findFirst({
    where: eq(organizationInvites.tokenHash, inviteTokenHash(token)),
  })
}

export const onboardingRoutes = new Elysia({ prefix: '/api/onboarding' })
  .use(authPlugin)

  // GET /api/onboarding/state
  .get('/state', async ({ jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    await db.insert(onboardingProgress).values({
      userId: user.id,
      currentStep: 'account',
      isCompleted: false,
    }).onConflictDoNothing()

    const progress = await db.query.onboardingProgress.findFirst({
      where: eq(onboardingProgress.userId, user.id),
    })
    const memberships = await resolveMemberships(user.id)
    const organizationIds = memberships.map((item) => item.organizationId)
    const workspaceCounts = await resolveWorkspaceCounts(organizationIds)
    const pendingInviteCounts = await resolvePendingInviteCounts(organizationIds)

    const activeOrganizationId = progress?.organizationId
      || memberships[0]?.organizationId
      || null
    const currentStep = deriveSuggestedStep({
      activeOrganizationId,
      workspaceCounts,
      progressStep: (progress?.currentStep || 'account') as OnboardingStep,
      isCompleted: Boolean(progress?.isCompleted),
    })

    return {
      progress: {
        currentStep,
        isCompleted: Boolean(progress?.isCompleted),
        completedAt: progress?.completedAt || null,
      },
      activeOrganizationId,
      organizations: memberships.map((item) => ({
        id: item.organizationId,
        name: item.organizationName,
        slug: item.organizationSlug,
        description: item.organizationDescription,
        logo: item.organizationLogo,
        role: item.role,
        workspaceCount: workspaceCounts.get(item.organizationId) || 0,
        pendingInviteCount: pendingInviteCounts.get(item.organizationId) || 0,
      })),
    }
  })

  // POST /api/onboarding/organization
  .post('/organization', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const createOrganizationRateLimit = consumeRateLimit({
      key: `onboarding:create-organization:${user.id}`,
      windowMs: 60 * 60 * 1000,
      max: 10,
    })
    if (!createOrganizationRateLimit.allowed) {
      set.status = 429
      return { error: `Too many organization creations. Try again in ${createOrganizationRateLimit.retryAfterSeconds} seconds.` }
    }

    const normalizedName = body.name.trim()
    if (normalizedName.length < 2) {
      set.status = 400
      return { error: 'Organization name must be at least 2 characters' }
    }

    const normalizedDescription = normalizeOptionalText(body.description, MAX_ORGANIZATION_DESCRIPTION_LENGTH)
    const normalizedLogo = normalizeOptionalLogo(body.logo)

    const slug = await generateUniqueOrganizationSlug(normalizedName)
    const [organization] = await db.insert(organizations).values({
      name: normalizedName,
      slug,
      description: normalizedDescription,
      logo: normalizedLogo,
      createdByUserId: user.id,
    }).returning()

    await db.insert(organizationMembers).values({
      organizationId: organization!.id,
      userId: user.id,
      role: 'owner',
      invitedByUserId: user.id,
    }).onConflictDoNothing()

    await upsertOnboardingState({
      userId: user.id,
      organizationId: organization!.id,
      currentStep: 'workspace',
      isCompleted: false,
    })

    logActivity({
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'created',
      entityType: 'organization',
      entityId: organization!.id,
      entityTitle: organization!.name,
      routePathOverride: '/settings/organization/members',
      subjectUserIds: [user.id],
    })

    return {
      organization,
      memberRole: 'owner',
      onboarding: {
        currentStep: 'workspace',
        isCompleted: false,
      },
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 2, maxLength: 120 }),
      description: t.Optional(t.Nullable(t.String({ maxLength: MAX_ORGANIZATION_DESCRIPTION_LENGTH }))),
      logo: t.Optional(t.Nullable(t.String({ maxLength: MAX_LOGO_URL_LENGTH }))),
    }),
  })

  // PATCH /api/onboarding/organization/:organizationId
  .patch('/organization/:organizationId', async ({ params, body, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      params.organizationId,
      [...ORGANIZATION_MANAGER_ROLES]
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    if (
      body.name === undefined
      && body.description === undefined
      && body.logo === undefined
    ) {
      set.status = 400
      return { error: 'At least one profile field must be provided' }
    }

    const existing = await db.query.organizations.findFirst({
      where: eq(organizations.id, params.organizationId),
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logo: true,
      },
    })
    if (!existing) {
      set.status = 404
      return { error: 'Organization not found' }
    }

    const nextName = body.name === undefined
      ? existing.name
      : body.name.trim()
    if (nextName.length < 2) {
      set.status = 400
      return { error: 'Organization name must be at least 2 characters' }
    }

    const nextDescription = body.description === undefined
      ? existing.description
      : normalizeOptionalText(body.description, MAX_ORGANIZATION_DESCRIPTION_LENGTH)
    const nextLogo = body.logo === undefined
      ? existing.logo
      : normalizeOptionalLogo(body.logo)

    const [updatedOrganization] = await db.update(organizations)
      .set({
        name: nextName,
        description: nextDescription,
        logo: nextLogo,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, params.organizationId))
      .returning({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        description: organizations.description,
        logo: organizations.logo,
      })

    const currentProgress = await db.query.onboardingProgress.findFirst({
      where: eq(onboardingProgress.userId, access.user.id),
      columns: {
        currentStep: true,
        isCompleted: true,
      },
    })

    const changes = computeChanges(existing, {
      name: nextName,
      description: nextDescription,
      logo: nextLogo,
    }, ['name', 'description', 'logo'])
    if (changes.length > 0) {
      logActivity({
        userName: access.user.name,
        userAvatar: access.user.avatar,
        userId: access.user.id,
        action: 'updated',
        entityType: 'organization',
        entityId: existing.id,
        entityTitle: updatedOrganization?.name || existing.name,
        changes,
        routePathOverride: '/settings/organization/members',
      })
    }

    return {
      organization: updatedOrganization || {
        id: existing.id,
        name: nextName,
        slug: existing.slug,
        description: nextDescription,
        logo: nextLogo,
      },
      onboarding: {
        currentStep: (currentProgress?.currentStep || 'organization') as OnboardingStep,
        isCompleted: Boolean(currentProgress?.isCompleted),
      },
    }
  }, {
    params: t.Object({
      organizationId: t.String({ minLength: 1 }),
    }),
    body: t.Object({
      name: t.Optional(t.String({ minLength: 2, maxLength: 120 })),
      description: t.Optional(t.Nullable(t.String({ maxLength: MAX_ORGANIZATION_DESCRIPTION_LENGTH }))),
      logo: t.Optional(t.Nullable(t.String({ maxLength: MAX_LOGO_URL_LENGTH }))),
    }),
  })

  // POST /api/onboarding/organization/upload-logo
  .post('/organization/upload-logo', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    if (body.organizationId) {
      const access = await requireOrganizationAccess(
        jwt.verify,
        headers,
        set,
        body.organizationId,
        [...ORGANIZATION_MANAGER_ROLES]
      )
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    const file = body.file
    if (!file) {
      set.status = 400
      return { error: 'No file provided' }
    }

    const rawExt = (file.name.split('.').pop() || 'png').toLowerCase()
    const safeExt = rawExt.replace(/[^a-z0-9]/g, '') || 'png'
    const ownerScope = body.organizationId ? `org-${body.organizationId}` : `user-${user.id}`
    const filename = `${ownerScope}-${Date.now()}.${safeExt}`
    const storage = getStorage()
    const logo = (await storage.saveFile({
      namespace: 'organization-logos',
      filename,
      contentType: file.type || 'application/octet-stream',
      bytes: new Uint8Array(await file.arrayBuffer()),
    })).publicPath

    return { logo }
  }, {
    body: t.Object({
      organizationId: t.Optional(t.String({ minLength: 1 })),
      file: t.File({ maxSize: '5m', type: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] }),
    }),
  })

  // POST /api/onboarding/workspace
  .post('/workspace', async ({ body, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      body.organizationId,
      [...ORGANIZATION_MANAGER_ROLES]
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const createWorkspaceRateLimit = consumeRateLimit({
      key: `onboarding:create-workspace:${access.user.id}:${body.organizationId}`,
      windowMs: 30 * 60 * 1000,
      max: 20,
    })
    if (!createWorkspaceRateLimit.allowed) {
      set.status = 429
      return { error: `Too many workspace creations. Try again in ${createWorkspaceRateLimit.retryAfterSeconds} seconds.` }
    }

    const workspaceName = body.name.trim()
    if (workspaceName.length < 2) {
      set.status = 400
      return { error: 'Workspace name must be at least 2 characters' }
    }

    try {
      const [product] = await db.insert(products).values({
        organizationId: body.organizationId,
        name: workspaceName,
        logo: body.logo || null,
        description: body.description || null,
        createdByUserId: access.user.id,
      }).returning()

      await db.insert(productMembers).values({
        productId: product!.id,
        userId: access.user.id,
        role: PRODUCT_CREATOR_MEMBER_ROLE,
      }).onConflictDoNothing()

      await upsertOnboardingState({
        userId: access.user.id,
        organizationId: body.organizationId,
        currentStep: 'invites',
        isCompleted: false,
      })

      logActivity({
        productId: product!.id,
        userName: access.user.name,
        userAvatar: access.user.avatar,
        userId: access.user.id,
        action: 'created',
        entityType: 'product',
        entityId: product!.id,
        entityTitle: product!.name,
        routePathOverride: '/home',
        subjectUserIds: [access.user.id],
      })

      return {
        product,
        onboarding: {
          currentStep: 'invites',
          isCompleted: false,
        },
      }
    } catch (error: any) {
      if (error?.code === '23505') {
        set.status = 409
        return { error: 'A workspace with this name already exists' }
      }
      throw error
    }
  }, {
    body: t.Object({
      organizationId: t.String({ minLength: 1 }),
      name: t.String({ minLength: 1, maxLength: 255 }),
      logo: t.Optional(t.Nullable(t.String())),
      description: t.Optional(t.Nullable(t.String())),
    }),
  })

  // GET /api/onboarding/invites?organizationId=...
  .get('/invites', async ({ query, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      query.organizationId,
      [...ORGANIZATION_MANAGER_ROLES]
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    try {
      const rows = await db.query.organizationInvites.findMany({
        where: eq(organizationInvites.organizationId, query.organizationId),
        orderBy: [desc(organizationInvites.createdAt)],
      })

      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        email: row.email,
        inviteeName: row.inviteeName,
        role: row.role,
        workspaceProductId: row.workspaceProductId,
        organizationTeamId: row.organizationTeamId,
        titleId: row.titleId,
        status: row.status,
        expiresAt: row.expiresAt,
        acceptedAt: row.acceptedAt,
        cancelledAt: row.cancelledAt,
        createdAt: row.createdAt,
      }))
    } catch (error) {
      if (isSchemaMismatchError(error)) {
        set.status = 503
        return { error: schemaMismatchMessage('Onboarding invite schema') }
      }
      throw error
    }
  }, {
    query: t.Object({
      organizationId: t.String({ minLength: 1 }),
    }),
  })

  // POST /api/onboarding/invites
  .post('/invites', async ({ body, jwt, headers, set }) => {
    const access = await requireOrganizationAccess(
      jwt.verify,
      headers,
      set,
      body.organizationId,
      [...ORGANIZATION_MANAGER_ROLES]
    )
    if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

    const inviteOperationRateLimit = consumeRateLimit({
      key: `onboarding:create-invites:${access.user.id}:${body.organizationId}`,
      windowMs: 10 * 60 * 1000,
      max: 40,
    })
    if (!inviteOperationRateLimit.allowed) {
      set.status = 429
      return { error: `Too many invite operations. Try again in ${inviteOperationRateLimit.retryAfterSeconds} seconds.` }
    }

    if (body.invites.length === 0 || body.invites.length > MAX_INVITES_PER_REQUEST) {
      set.status = 400
      return { error: `Provide between 1 and ${MAX_INVITES_PER_REQUEST} invites` }
    }

    try {
      const [pendingCountRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(organizationInvites)
        .where(and(
          eq(organizationInvites.organizationId, body.organizationId),
          eq(organizationInvites.status, 'pending'),
          gt(organizationInvites.expiresAt, new Date())
        ))
      const pendingCount = Number(pendingCountRow?.value || 0)
      if ((pendingCount + body.invites.length) > MAX_PENDING_INVITES_PER_ORGANIZATION) {
        set.status = 400
        return { error: 'Too many pending invites for this organization' }
      }

      const created: Array<{
        id: string
        email: string
        inviteeName: string | null
        role: string
        workspaceProductId: string | null
        organizationTeamId: string | null
        titleId: string | null
        status: string
        expiresAt: Date
        inviteLink: string
      }> = []
      const skipped: Array<{ email: string; reason: string }> = []

      for (const inviteInput of body.invites) {
        const email = normalizeEmail(inviteInput.email)
        if (!isLikelyEmail(email)) {
          skipped.push({ email: inviteInput.email, reason: 'invalid_email' })
          continue
        }
        if (email === normalizeEmail(access.user.email)) {
          skipped.push({ email, reason: 'cannot_invite_self' })
          continue
        }

        const requestedRole = sanitizeInviteRole(inviteInput.role)
        if (requestedRole === 'owner' && access.memberRole !== 'owner') {
          skipped.push({ email, reason: 'owner_role_requires_owner' })
          continue
        }

        const inviteeName = normalizeOptionalInviteeName(inviteInput.name)
        const workspaceProductId = normalizeOptionalId(inviteInput.workspaceProductId)
        const organizationTeamId = normalizeOptionalId(inviteInput.organizationTeamId)
        const titleId = normalizeOptionalId(inviteInput.titleId)

        if (workspaceProductId) {
          const workspace = await db.query.products.findFirst({
            where: and(
              eq(products.id, workspaceProductId),
              eq(products.organizationId, body.organizationId),
            ),
            columns: { id: true },
          })
          if (!workspace) {
            skipped.push({ email, reason: 'invalid_workspace' })
            continue
          }
        }

        if (organizationTeamId) {
          const team = await db.query.organizationTeams.findFirst({
            where: and(
              eq(organizationTeams.id, organizationTeamId),
              eq(organizationTeams.organizationId, body.organizationId),
            ),
            columns: { id: true },
          })
          if (!team) {
            skipped.push({ email, reason: 'invalid_team' })
            continue
          }
        }

        if (titleId) {
          const title = await db.query.titles.findFirst({
            where: eq(titles.id, titleId),
            columns: { id: true, isActive: true },
          })
          if (!title || !title.isActive) {
            skipped.push({ email, reason: 'invalid_title' })
            continue
          }
        }

        const existingUser = await db.query.users.findFirst({
          where: eq(users.email, email),
          columns: { id: true },
        })
        if (existingUser) {
          const existingMembership = await db.query.organizationMembers.findFirst({
            where: and(
              eq(organizationMembers.organizationId, body.organizationId),
              eq(organizationMembers.userId, existingUser.id)
            ),
            columns: { id: true },
          })
          if (existingMembership) {
            skipped.push({ email, reason: 'already_member' })
            continue
          }
        }

        await db.update(organizationInvites)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(organizationInvites.organizationId, body.organizationId),
            eq(organizationInvites.email, email),
            eq(organizationInvites.status, 'pending')
          ))

        const token = createInviteToken()
        const [invite] = await db.insert(organizationInvites).values({
          organizationId: body.organizationId,
          email,
          inviteeName,
          tokenHash: inviteTokenHash(token),
          role: requestedRole,
          status: 'pending',
          invitedByUserId: access.user.id,
          workspaceProductId,
          organizationTeamId,
          titleId,
          expiresAt: inviteExpiresAt(),
        }).returning()

        logActivity({
          userName: access.user.name,
          userAvatar: access.user.avatar,
          userId: access.user.id,
          action: 'created',
          entityType: 'organization_invite',
          entityId: invite!.id,
          entityTitle: email,
          routePathOverride: '/settings/organization/members',
        })

        created.push({
          id: invite!.id,
          email: invite!.email,
          inviteeName: invite!.inviteeName,
          role: invite!.role,
          workspaceProductId: invite!.workspaceProductId,
          organizationTeamId: invite!.organizationTeamId,
          titleId: invite!.titleId,
          status: invite!.status,
          expiresAt: invite!.expiresAt,
          inviteLink: buildInviteLink(token),
        })
      }

      await upsertOnboardingState({
        userId: access.user.id,
        organizationId: body.organizationId,
        currentStep: 'invites',
        isCompleted: false,
      })

      return {
        created,
        skipped,
        onboarding: {
          currentStep: 'invites',
          isCompleted: false,
        },
      }
    } catch (error) {
      if (isSchemaMismatchError(error)) {
        set.status = 503
        return { error: schemaMismatchMessage('Onboarding invite schema') }
      }
      throw error
    }
  }, {
    body: t.Object({
      organizationId: t.String({ minLength: 1 }),
      invites: t.Array(t.Object({
        email: t.String({ minLength: 3, maxLength: 255 }),
        name: t.Optional(t.Nullable(t.String({ maxLength: MAX_INVITEE_NAME_LENGTH }))),
        role: t.Optional(t.Union([
          t.Literal('owner'),
          t.Literal('admin'),
          t.Literal('member'),
          t.Literal('viewer'),
        ])),
        workspaceProductId: t.Optional(t.Nullable(t.String({ minLength: 1 }))),
        organizationTeamId: t.Optional(t.Nullable(t.String({ minLength: 1 }))),
        titleId: t.Optional(t.Nullable(t.String({ minLength: 1 }))),
      })),
    }),
  })

  // DELETE /api/onboarding/invites/:inviteId
  .delete('/invites/:inviteId', async ({ params, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    try {
      const invite = await db.query.organizationInvites.findFirst({
        where: eq(organizationInvites.id, params.inviteId),
      })
      if (!invite) {
        set.status = 404
        return { error: 'Invite not found' }
      }

      const access = await requireOrganizationAccess(
        jwt.verify,
        headers,
        set,
        invite.organizationId,
        [...ORGANIZATION_MANAGER_ROLES]
      )
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }

      if (invite.status === 'pending') {
        await db.update(organizationInvites)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(organizationInvites.id, invite.id))
      }

      logActivity({
        userName: access.user.name,
        userAvatar: access.user.avatar,
        userId: access.user.id,
        action: 'updated',
        entityType: 'organization_invite',
        entityId: invite.id,
        entityTitle: invite.email,
        changes: [{ field: 'status', from: invite.status, to: 'cancelled' }],
        routePathOverride: '/settings/organization/members',
      })

      return { success: true }
    } catch (error) {
      if (isSchemaMismatchError(error)) {
        set.status = 503
        return { error: schemaMismatchMessage('Onboarding invite schema') }
      }
      throw error
    }
  })

  // POST /api/onboarding/invites/activate
  .post('/invites/activate', async ({ body, jwt, headers, set }) => {
    const clientAddress = resolveClientAddress(headers)
    const activateByAddressRateLimit = consumeRateLimit({
      key: `onboarding:activate-invite:address:${clientAddress}`,
      windowMs: 5 * 60 * 1000,
      max: 40,
    })
    if (!activateByAddressRateLimit.allowed) {
      set.status = 429
      return { error: `Too many invite activations from this address. Try again in ${activateByAddressRateLimit.retryAfterSeconds} seconds.` }
    }

    const activateByTokenRateLimit = consumeRateLimit({
      key: `onboarding:activate-invite:token:${inviteTokenHash(body.token)}`,
      windowMs: 5 * 60 * 1000,
      max: 10,
    })
    if (!activateByTokenRateLimit.allowed) {
      set.status = 429
      return { error: `Too many activation attempts for this invite. Try again in ${activateByTokenRateLimit.retryAfterSeconds} seconds.` }
    }

    const passwordPolicy = validatePasswordPolicy(body.password)
    if (!passwordPolicy.ok) {
      set.status = 400
      return { error: passwordPolicy.message }
    }

    const invite = await resolveOrganizationByInviteToken(body.token)
    if (!invite) {
      set.status = 404
      return { error: 'Invite not found' }
    }

    if (invite.status !== 'pending') {
      set.status = 409
      return { error: 'Invite is no longer pending' }
    }

    if (invite.expiresAt < new Date()) {
      await db.update(organizationInvites)
        .set({
          status: 'expired',
          updatedAt: new Date(),
        })
        .where(eq(organizationInvites.id, invite.id))
      set.status = 410
      return { error: 'Invite has expired' }
    }

    const normalizedEmail = normalizeEmail(invite.email)
    const inviteName = normalizeOptionalInviteeName(invite.inviteeName)
    const requestName = normalizeOptionalInviteeName(body.name)
    const nameFromEmail = normalizedEmail.split('@')[0] || 'Invited User'
    const resolvedName = requestName || inviteName || nameFromEmail
    const hashedPassword = await bcrypt.hash(body.password, 10)

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    })

    let activatedUser = existingUser
    if (!activatedUser) {
      const [createdUser] = await db.insert(users).values({
        name: resolvedName,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'viewer',
        isActive: true,
      }).returning()
      activatedUser = createdUser || null
    } else {
      if (!activatedUser.isActive) {
        set.status = 403
        return { error: 'Account is deactivated. Contact an administrator.' }
      }

      const shouldUpdateName = Boolean(requestName)
      const [updatedUser] = await db.update(users)
        .set({
          password: hashedPassword,
          ...(shouldUpdateName ? { name: resolvedName } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, activatedUser.id))
        .returning()
      activatedUser = updatedUser || activatedUser
    }

    if (!activatedUser) {
      set.status = 500
      return { error: 'Failed to activate invite account' }
    }

    await db.insert(organizationMembers).values({
      organizationId: invite.organizationId,
      userId: activatedUser.id,
      role: invite.role,
      invitedByUserId: invite.invitedByUserId,
    }).onConflictDoNothing()

    const workspaceProductId = normalizeOptionalId(invite.workspaceProductId)
    if (workspaceProductId) {
      const workspace = await db.query.products.findFirst({
        where: and(
          eq(products.id, workspaceProductId),
          eq(products.organizationId, invite.organizationId),
        ),
        columns: { id: true },
      })
      if (workspace) {
        await db.insert(productMembers).values({
          productId: workspace.id,
          userId: activatedUser.id,
          role: 'member',
        }).onConflictDoNothing()
      }
    }

    const organizationTeamId = normalizeOptionalId(invite.organizationTeamId)
    if (organizationTeamId) {
      const team = await db.query.organizationTeams.findFirst({
        where: and(
          eq(organizationTeams.id, organizationTeamId),
          eq(organizationTeams.organizationId, invite.organizationId),
        ),
        columns: { id: true },
      })
      if (team) {
        await db.insert(organizationTeamMembers).values({
          organizationTeamId: team.id,
          userId: activatedUser.id,
          role: 'member',
          addedByUserId: invite.invitedByUserId,
        }).onConflictDoNothing()
      }
    }

    const titleId = normalizeOptionalId(invite.titleId)
    if (titleId) {
      const title = await db.query.titles.findFirst({
        where: eq(titles.id, titleId),
        columns: { id: true, isActive: true },
      })
      if (title?.isActive) {
        await db.insert(userTitles).values({
          userId: activatedUser.id,
          titleId: title.id,
          assignedByUserId: invite.invitedByUserId,
          assignedAt: new Date(),
        }).onConflictDoUpdate({
          target: userTitles.userId,
          set: {
            titleId: title.id,
            assignedByUserId: invite.invitedByUserId,
            assignedAt: new Date(),
            updatedAt: new Date(),
          },
        })
      }
    }

    await db.update(organizationInvites)
      .set({
        status: 'accepted',
        acceptedByUserId: activatedUser.id,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationInvites.id, invite.id))

    const [workspaceCountRow] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.organizationId, invite.organizationId))
    const workspaceCount = Number(workspaceCountRow?.value || 0)
    const isCompleted = workspaceCount > 0

    await upsertOnboardingState({
      userId: activatedUser.id,
      organizationId: invite.organizationId,
      currentStep: isCompleted ? 'completed' : 'workspace',
      isCompleted,
    })

    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, invite.organizationId),
      columns: { id: true, name: true, slug: true },
    })
    const token = await jwt.sign({ userId: activatedUser.id, role: activatedUser.role })

    return {
      success: true,
      token,
      user: {
        id: activatedUser.id,
        name: activatedUser.name,
        email: activatedUser.email,
        role: activatedUser.role,
        isActive: activatedUser.isActive,
        avatar: activatedUser.avatar,
        createdAt: activatedUser.createdAt,
      },
      organization,
      membershipRole: invite.role,
      onboarding: {
        currentStep: isCompleted ? 'completed' : 'workspace',
        isCompleted,
      },
    }
  }, {
    body: t.Object({
      token: t.String({ minLength: 20, maxLength: 500 }),
      password: t.String({ minLength: PASSWORD_MIN_LENGTH }),
      name: t.Optional(t.Nullable(t.String({ maxLength: MAX_INVITEE_NAME_LENGTH }))),
    }),
  })

  // POST /api/onboarding/invites/accept
  .post('/invites/accept', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const clientAddress = resolveClientAddress(headers)
    const acceptByUserRateLimit = consumeRateLimit({
      key: `onboarding:accept-invite:user:${user.id}`,
      windowMs: 5 * 60 * 1000,
      max: 20,
    })
    if (!acceptByUserRateLimit.allowed) {
      set.status = 429
      return { error: `Too many invite accept attempts. Try again in ${acceptByUserRateLimit.retryAfterSeconds} seconds.` }
    }

    const acceptByAddressRateLimit = consumeRateLimit({
      key: `onboarding:accept-invite:address:${clientAddress}`,
      windowMs: 5 * 60 * 1000,
      max: 40,
    })
    if (!acceptByAddressRateLimit.allowed) {
      set.status = 429
      return { error: `Too many invite accept attempts from this address. Try again in ${acceptByAddressRateLimit.retryAfterSeconds} seconds.` }
    }

    const invite = await resolveOrganizationByInviteToken(body.token)
    if (!invite) {
      set.status = 404
      return { error: 'Invite not found' }
    }

    if (invite.status !== 'pending') {
      set.status = 409
      return { error: 'Invite is no longer pending' }
    }

    if (invite.expiresAt < new Date()) {
      await db.update(organizationInvites)
        .set({
          status: 'expired',
          updatedAt: new Date(),
        })
        .where(eq(organizationInvites.id, invite.id))
      set.status = 410
      return { error: 'Invite has expired' }
    }

    const normalizedInviteEmail = normalizeEmail(invite.email)
    const normalizedUserEmail = normalizeEmail(user.email)
    if (normalizedInviteEmail !== normalizedUserEmail) {
      set.status = 403
      return { error: 'Invite email does not match your account email' }
    }

    await db.insert(organizationMembers).values({
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
      invitedByUserId: invite.invitedByUserId,
    }).onConflictDoNothing()

    await db.update(organizationInvites)
      .set({
        status: 'accepted',
        acceptedByUserId: user.id,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationInvites.id, invite.id))

    const [workspaceCountRow] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.organizationId, invite.organizationId))
    const workspaceCount = Number(workspaceCountRow?.value || 0)
    const isCompleted = workspaceCount > 0

    await upsertOnboardingState({
      userId: user.id,
      organizationId: invite.organizationId,
      currentStep: isCompleted ? 'completed' : 'workspace',
      isCompleted,
    })

    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, invite.organizationId),
      columns: { id: true, name: true, slug: true },
    })

    logActivity({
      userName: user.name,
      userAvatar: user.avatar,
      userId: user.id,
      action: 'updated',
      entityType: 'organization_member',
      entityId: user.id,
      entityTitle: user.name,
      changes: [
        { field: 'organizationMembership', from: null, to: invite.organizationId },
        { field: 'organizationRole', from: null, to: invite.role },
      ],
      routePathOverride: '/settings/organization/members',
      subjectUserIds: [user.id],
    })

    return {
      success: true,
      organization,
      membershipRole: invite.role,
      onboarding: {
        currentStep: isCompleted ? 'completed' : 'workspace',
        isCompleted,
      },
    }
  }, {
    body: t.Object({
      token: t.String({ minLength: 20, maxLength: 500 }),
    }),
  })

  // POST /api/onboarding/cancel-signup
  .post('/cancel-signup', async ({ jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    const progress = await db.query.onboardingProgress.findFirst({
      where: eq(onboardingProgress.userId, user.id),
      columns: { isCompleted: true },
    })
    if (progress?.isCompleted) {
      set.status = 409
      return { error: 'Cannot cancel signup after onboarding completion.' }
    }

    const [createdWorkspaceRow] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.createdByUserId, user.id))
    if (Number(createdWorkspaceRow?.value || 0) > 0) {
      set.status = 409
      return { error: 'Cannot cancel signup after workspace creation.' }
    }

    const [memberWorkspaceRow] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(productMembers)
      .where(eq(productMembers.userId, user.id))
    if (Number(memberWorkspaceRow?.value || 0) > 0) {
      set.status = 409
      return { error: 'Cannot cancel signup after joining a workspace.' }
    }

    const createdOrganizations = await db.query.organizations.findMany({
      where: eq(organizations.createdByUserId, user.id),
      columns: { id: true },
    })
    const createdOrganizationIds = createdOrganizations.map((row) => row.id)
    const createdOrganizationSet = new Set(createdOrganizationIds)

    const memberships = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, user.id),
      columns: { organizationId: true },
    })
    const membershipOrganizationIds = memberships.map((row) => row.organizationId)
    const hasExternalMembership = membershipOrganizationIds.some(
      (organizationId) => !createdOrganizationSet.has(organizationId)
    )
    if (hasExternalMembership) {
      set.status = 409
      return { error: 'Cannot cancel signup after joining an existing organization.' }
    }
    if (membershipOrganizationIds.length !== createdOrganizationIds.length) {
      set.status = 409
      return { error: 'Cannot cancel signup for an account with non-draft organization state.' }
    }

    for (const organizationId of createdOrganizationIds) {
      const [memberCount, workspaceCount] = await Promise.all([
        countOrganizationMembers(organizationId),
        countOrganizationWorkspaces(organizationId),
      ])
      if (memberCount > 1) {
        set.status = 409
        return { error: 'Cannot cancel signup after inviting or adding other organization members.' }
      }
      if (workspaceCount > 0) {
        set.status = 409
        return { error: 'Cannot cancel signup after workspace creation.' }
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(activities).where(eq(activities.userId, user.id))
      if (createdOrganizationIds.length > 0) {
        await tx.delete(organizations).where(inArray(organizations.id, createdOrganizationIds))
      }
      await tx.delete(onboardingProgress).where(eq(onboardingProgress.userId, user.id))
      await tx.delete(users).where(eq(users.id, user.id))
    })

    return {
      success: true,
      deletedOrganizations: createdOrganizationIds.length,
      deletedUserId: user.id,
    }
  })

  // POST /api/onboarding/complete
  .post('/complete', async ({ body, jwt, headers, set }) => {
    const user = await requireAuth(jwt.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    let resolvedOrganizationId: string | null = body.organizationId || null
    if (!resolvedOrganizationId) {
      const membership = await db.query.organizationMembers.findFirst({
        where: eq(organizationMembers.userId, user.id),
        columns: { organizationId: true },
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.joinedAt)],
      })
      resolvedOrganizationId = membership?.organizationId || null
    } else {
      const access = await requireOrganizationAccess(
        jwt.verify,
        headers,
        set,
        resolvedOrganizationId,
        ['owner', 'admin', 'member', 'viewer']
      )
      if (!access) return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
    }

    await upsertOnboardingState({
      userId: user.id,
      organizationId: resolvedOrganizationId,
      currentStep: 'completed',
      isCompleted: true,
    })

    return { success: true }
  }, {
    body: t.Object({
      organizationId: t.Optional(t.String()),
    }),
  })
