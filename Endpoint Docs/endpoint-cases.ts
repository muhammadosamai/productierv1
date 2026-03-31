import {
  createImageFile,
  requestEndpoint,
  type EndpointRequestSpec,
  type EndpointResponse,
  type EndpointRunContext,
} from './fixtures'

export type ResponseContentType = 'none' | 'json' | 'multipart'

export interface EndpointCase {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  pathTemplate: string
  auth: 'none' | 'user' | 'superAdmin' | 'regularUser'
  contentType: ResponseContentType
  requiredPathParams: string[]
  requiredQueryParams: string[]
  requiredBodyFields: string[]
  expectedStatuses: number[]
  dependencyNote?: string
  buildRequest: (ctx: EndpointRunContext) => EndpointRequestSpec | Promise<EndpointRequestSpec>
  onSuccess?: (ctx: EndpointRunContext, response: EndpointResponse) => void | Promise<void>
}

const SHARED_ENDPOINT_TITLE_KEY = 'endpoint_title_shared'
const SHARED_ENDPOINT_TITLE_NAME = 'Endpoint Title Shared'

function fixtureId(value: string | undefined): string {
  return value ?? 'missing-id'
}

function resolveAdminManagedUserId(ctx: EndpointRunContext): string {
  const superAdminUserId = fixtureId(ctx.sessions.superAdmin.userId)
  const candidates = [
    ctx.fixtures.secondaryUserId,
    ctx.fixtures.primaryUserId,
    ctx.fixtures.tertiaryUserId,
  ]
  const managedUserId = candidates.find((candidate) => (
    typeof candidate === 'string'
    && candidate.trim().length > 0
    && candidate.trim() !== superAdminUserId
  ))
  return fixtureId(managedUserId ?? ctx.fixtures.secondaryUserId ?? ctx.fixtures.primaryUserId ?? ctx.fixtures.tertiaryUserId)
}

function baseProductId(ctx: EndpointRunContext): string {
  return ctx.fixtures.productId ?? 'missing-product-id'
}

function onboardingOrganizationId(ctx: EndpointRunContext): string {
  return ctx.fixtures.onboardingOrganizationId
    ?? ctx.fixtures.organizationId
    ?? 'missing-organization-id'
}

function primaryOrganizationId(ctx: EndpointRunContext): string {
  return ctx.fixtures.organizationId
    ?? ctx.fixtures.onboardingOrganizationId
    ?? 'missing-organization-id'
}

function adminUsersBasePath(ctx: EndpointRunContext): string {
  return `/api/organizations/${encodeURIComponent(primaryOrganizationId(ctx))}/users-admin`
}

function encodedProductId(ctx: EndpointRunContext): string {
  return encodeURIComponent(baseProductId(ctx))
}

async function resolveSharedTitleId(ctx: EndpointRunContext): Promise<string> {
  if (ctx.fixtures.titleId) return ctx.fixtures.titleId

  const listRes = await requestEndpoint(ctx, {
    method: 'GET',
    path: '/api/roles/titles',
    auth: 'superAdmin',
  })
  if (listRes.status !== 200) {
    throw new Error(`resolveSharedTitleId failed to list titles (status=${listRes.status})`)
  }

  const payload = listRes.data as Record<string, unknown> | null
  const rows = Array.isArray(payload?.titles) ? payload.titles as Array<Record<string, unknown>> : []
  for (const row of rows) {
    const rowId = typeof row.id === 'string' ? row.id : ''
    const rowKey = typeof row.key === 'string' ? row.key : ''
    const rowName = typeof row.name === 'string' ? row.name : ''
    if (rowId && (rowKey === SHARED_ENDPOINT_TITLE_KEY || rowName === SHARED_ENDPOINT_TITLE_NAME)) {
      ctx.fixtures.titleId = rowId
      return rowId
    }
  }

  throw new Error('resolveSharedTitleId could not find the shared endpoint title.')
}

async function createOnboardingInviteForEmail(
  ctx: EndpointRunContext,
  invitedEmail: string,
  options: {
    name?: string
    role?: 'owner' | 'admin' | 'member' | 'viewer'
    workspaceProductId?: string
    organizationTeamId?: string
    titleId?: string
  } = {},
): Promise<{ inviteId: string; token: string }> {
  const response = await requestEndpoint(ctx, {
    method: 'POST',
    path: '/api/onboarding/invites',
    auth: 'regularUser',
    json: {
      organizationId: onboardingOrganizationId(ctx),
      invites: [
        {
          email: invitedEmail,
          name: options.name,
          role: options.role || 'member',
          workspaceProductId: options.workspaceProductId,
          organizationTeamId: options.organizationTeamId,
          titleId: options.titleId,
        },
      ],
    },
  })
  if (response.status !== 200) {
    throw new Error(`Failed to create onboarding invite fixture (status=${response.status})`)
  }

  const payload = response.data as Record<string, unknown> | null
  const created = Array.isArray(payload?.created)
    ? payload.created as Array<Record<string, unknown>>
    : []
  const first = created[0]
  const inviteId = typeof first?.id === 'string' ? first.id : ''
  const inviteLink = typeof first?.inviteLink === 'string' ? first.inviteLink : ''
  if (!inviteId || !inviteLink) {
    throw new Error('Failed to create onboarding invite fixture token')
  }

  try {
    const parsed = new URL(inviteLink, 'http://localhost')
    const token = parsed.searchParams.get('token') || ''
    if (!token) {
      throw new Error('missing token')
    }
    return { inviteId, token }
  } catch {
    throw new Error('Failed to parse onboarding invite fixture token')
  }
}

function assertListEnvelope(response: EndpointResponse, caseId: string): void {
  const data = response.data as Record<string, unknown> | null
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${caseId} expected object list envelope response`)
  }
  if (!Array.isArray(data.items)) {
    throw new Error(`${caseId} expected list envelope to include an items array`)
  }
  if (typeof data.hasMore !== 'boolean') {
    throw new Error(`${caseId} expected list envelope to include boolean hasMore`)
  }
  const nextCursor = data.nextCursor
  if (!(typeof nextCursor === 'string' || nextCursor === null)) {
    throw new Error(`${caseId} expected list envelope to include nextCursor as string|null`)
  }
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
}

function normalizedSortedIds(values: Array<string | null | undefined>): string[] {
  const normalized: string[] = []
  for (const value of values) {
    const id = typeof value === 'string' ? value.trim() : ''
    if (id.length > 0) normalized.push(id)
  }
  return normalized.sort()
}

function sameIdSet(left: Array<string | null | undefined>, right: Array<string | null | undefined>): boolean {
  const leftNormalized = normalizedSortedIds(left)
  const rightNormalized = normalizedSortedIds(right)
  if (leftNormalized.length !== rightNormalized.length) return false
  return leftNormalized.every((id, index) => id === rightNormalized[index])
}

function resolveInitialTeamLeadUserId(ctx: EndpointRunContext): string {
  const leadUserId = (ctx.fixtures.secondaryUserId || ctx.fixtures.primaryUserId || '').trim()
  if (!leadUserId) {
    throw new Error('Team lead cardinality checks require at least one fixture user id')
  }
  return leadUserId
}

function resolveSecondaryTeamLeadUserId(ctx: EndpointRunContext, primaryLeadUserId: string): string {
  const candidates = [
    ctx.fixtures.tertiaryUserId,
    ctx.fixtures.primaryUserId,
    ctx.fixtures.secondaryUserId,
  ]
  const secondaryLeadUserId = candidates.find((candidate) => (
    typeof candidate === 'string' && candidate.trim().length > 0 && candidate.trim() !== primaryLeadUserId
  ))
  if (!secondaryLeadUserId) {
    throw new Error('Team lead cardinality checks require a second distinct fixture user id')
  }
  return secondaryLeadUserId.trim()
}

async function readTeamLeadUserIdsFromMembers(
  ctx: EndpointRunContext,
  organizationId: string,
  teamId: string,
): Promise<string[]> {
  const response = await requestEndpoint(ctx, {
    method: 'GET',
    path: `/api/organizations/${encodeURIComponent(organizationId)}/teams/${encodeURIComponent(teamId)}/members`,
    auth: 'superAdmin',
  })
  if (response.status !== 200) {
    throw new Error(`Failed to read team members for lead cardinality check (status=${response.status})`)
  }
  const members = asRecordArray(response.data)
  return normalizedSortedIds(
    members
      .filter((member) => member.role === 'lead')
      .map((member) => (typeof member.userId === 'string' ? member.userId : '')),
  )
}

async function readTeamLeadUserIdsFromContract(
  ctx: EndpointRunContext,
  organizationId: string,
  teamId: string,
): Promise<string[]> {
  const response = await requestEndpoint(ctx, {
    method: 'GET',
    path: `/api/organizations/${encodeURIComponent(organizationId)}/teams`,
    auth: 'superAdmin',
    query: { includeMembers: 1 },
  })
  if (response.status !== 200) {
    throw new Error(`Failed to read teams contract for lead cardinality check (status=${response.status})`)
  }
  const teams = asRecordArray(response.data)
  const team = teams.find((entry) => entry.id === teamId)
  if (!team) {
    throw new Error(`Lead cardinality check could not find team ${teamId} in teams contract response`)
  }
  const explicitLeadIds = Array.isArray(team.leadUserIds)
    ? normalizedSortedIds(team.leadUserIds.map((value) => (typeof value === 'string' ? value : '')))
    : []
  if (explicitLeadIds.length > 0) return explicitLeadIds
  const legacyLeadUserId = typeof team.leadUserId === 'string' ? team.leadUserId : ''
  return normalizedSortedIds([legacyLeadUserId])
}

async function assertTeamLeadCardinality(
  ctx: EndpointRunContext,
  caseId: string,
  expectedLeadUserIds: string[],
): Promise<void> {
  const organizationId = ctx.fixtures.organizationId || ''
  const teamId = ctx.fixtures.organizationTeamCaseId || ''
  if (!organizationId || !teamId) {
    throw new Error(`${caseId} missing organization/team fixture ids for lead cardinality checks`)
  }

  const memberLeads = await readTeamLeadUserIdsFromMembers(ctx, organizationId, teamId)
  if (!sameIdSet(memberLeads, expectedLeadUserIds)) {
    throw new Error(
      `${caseId} expected member lead ids ${expectedLeadUserIds.join(',')} but got ${memberLeads.join(',') || '<none>'}`,
    )
  }

  const contractLeads = await readTeamLeadUserIdsFromContract(ctx, organizationId, teamId)
  if (!sameIdSet(contractLeads, expectedLeadUserIds)) {
    throw new Error(
      `${caseId} expected contract lead ids ${expectedLeadUserIds.join(',')} but got ${contractLeads.join(',') || '<none>'}`,
    )
  }
}

function assertInitiativeDetailShape(data: unknown, caseId: string): void {
  const payload = data as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${caseId} expected initiative detail object`)
  }
  if (typeof payload.id !== 'string' || payload.id.length === 0) {
    throw new Error(`${caseId} expected non-empty initiative id`)
  }
  if (!Array.isArray(payload.members)) {
    throw new Error(`${caseId} expected members array`)
  }
  if (!Array.isArray(payload.teams)) {
    throw new Error(`${caseId} expected teams array`)
  }
  for (const member of payload.members as Array<Record<string, unknown>>) {
    if (typeof member.userId !== 'string' || member.userId.length === 0) {
      throw new Error(`${caseId} expected each member entry to include userId`)
    }
    const user = member.user
    if (user !== undefined && user !== null) {
      const userRecord = user as Record<string, unknown>
      if (typeof userRecord.id !== 'string' || userRecord.id.length === 0) {
        throw new Error(`${caseId} expected member.user to include id`)
      }
    }
  }
  for (const team of payload.teams as Array<Record<string, unknown>>) {
    if (typeof team.organizationTeamId !== 'string' || team.organizationTeamId.length === 0) {
      throw new Error(`${caseId} expected each team entry to include organizationTeamId`)
    }
    const linked = team.team
    if (linked !== undefined && linked !== null) {
      const teamRecord = linked as Record<string, unknown>
      if (typeof teamRecord.id !== 'string' || teamRecord.id.length === 0) {
        throw new Error(`${caseId} expected team.team to include id`)
      }
    }
  }
}

function assertInitiativeInsightsShape(data: unknown, caseId: string): void {
  const payload = data as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${caseId} expected initiative insights object`)
  }
  const initiative = payload.initiative as Record<string, unknown> | null
  if (!initiative || typeof initiative !== 'object' || Array.isArray(initiative)) {
    throw new Error(`${caseId} expected initiative metadata object`)
  }
  const periodStart = initiative.periodStart
  const periodEnd = initiative.periodEnd
  if (!(typeof periodStart === 'string' || periodStart === null)) {
    throw new Error(`${caseId} expected initiative.periodStart as string|null`)
  }
  if (!(typeof periodEnd === 'string' || periodEnd === null)) {
    throw new Error(`${caseId} expected initiative.periodEnd as string|null`)
  }

  const timeline = payload.timeline as Record<string, unknown> | null
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) {
    throw new Error(`${caseId} expected timeline object`)
  }
  const period = timeline.period as Record<string, unknown> | null
  if (!period || typeof period !== 'object' || Array.isArray(period)) {
    throw new Error(`${caseId} expected timeline.period object`)
  }
  const scheduleProgressPercent = period.scheduleProgressPercent
  if (!(typeof scheduleProgressPercent === 'number' || scheduleProgressPercent === null)) {
    throw new Error(`${caseId} expected timeline.period.scheduleProgressPercent as number|null`)
  }
  if (typeof period.isOverdue !== 'boolean') {
    throw new Error(`${caseId} expected timeline.period.isOverdue as boolean`)
  }
  if (!Array.isArray(timeline.milestones)) {
    throw new Error(`${caseId} expected timeline.milestones array`)
  }
}

function assertStoryPagedShape(data: unknown, caseId: string): void {
  const payload = data as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${caseId} expected list envelope object`)
  }
  const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : []
  for (const item of items) {
    if (!(typeof item.id === 'string' && item.id.length > 0)) {
      throw new Error(`${caseId} expected each story to include id`)
    }
    if (typeof item.sortOrder !== 'number') {
      throw new Error(`${caseId} expected each story to include numeric sortOrder`)
    }
    const initiativeId = item.initiativeId
    if (!(typeof initiativeId === 'string' || initiativeId === null || initiativeId === undefined)) {
      throw new Error(`${caseId} expected initiativeId to be string|null|undefined`)
    }
  }
}

function assertDeliveryDetailEnhancementShape(data: unknown, caseId: string): void {
  const payload = data as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${caseId} expected delivery detail object`)
  }
  if (!Array.isArray(payload.linkedReleases)) {
    throw new Error(`${caseId} expected linkedReleases array`)
  }
  const healthSummary = payload.healthSummary as Record<string, unknown> | null
  if (!healthSummary || typeof healthSummary !== 'object' || Array.isArray(healthSummary)) {
    throw new Error(`${caseId} expected healthSummary object`)
  }
  const confidenceBand = healthSummary.confidenceBand
  if (!(confidenceBand === 'low' || confidenceBand === 'medium' || confidenceBand === 'high')) {
    throw new Error(`${caseId} expected healthSummary.confidenceBand low|medium|high`)
  }
}

export function buildEndpointCases(): EndpointCase[] {
  const cases: EndpointCase[] = []

  // Health
  cases.push({
    id: 'health.get',
    method: 'GET',
    pathTemplate: '/api/health',
    auth: 'none',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({ method: 'GET', path: '/api/health', auth: 'none' }),
  })

  // Auth
  cases.push({
    id: 'auth.register.post',
    method: 'POST',
    pathTemplate: '/api/auth/register',
    auth: 'none',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['name', 'email', 'password'],
    expectedStatuses: [200, 409],
    buildRequest: (ctx) => {
      const basePassword = ctx.fixtures.registeredUserPassword
      const compliantPassword = /\d/.test(basePassword) ? basePassword : `${basePassword}1`
      return {
        method: 'POST',
        path: '/api/auth/register',
        auth: 'none',
        json: {
          name: 'Endpoint Runner Shared',
          email: ctx.fixtures.registeredUserEmail,
          password: compliantPassword,
        },
      }
    },
  })
  cases.push({
    id: 'auth.login.post',
    method: 'POST',
    pathTemplate: '/api/auth/login',
    auth: 'none',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['email', 'password'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/auth/login',
      auth: 'none',
      json: {
        email: ctx.credentials.email,
        password: ctx.credentials.password,
      },
    }),
  })
  cases.push({
    id: 'auth.forgot-password.post',
    method: 'POST',
    pathTemplate: '/api/auth/forgot-password',
    auth: 'none',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['email'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/auth/forgot-password',
      auth: 'none',
      json: { email: ctx.credentials.email },
    }),
  })
  cases.push({
    id: 'auth.me.get',
    method: 'GET',
    pathTemplate: '/api/auth/me',
    auth: 'user',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({ method: 'GET', path: '/api/auth/me', auth: 'user' }),
  })
  cases.push({
    id: 'auth.users.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/users',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${onboardingOrganizationId(ctx)}/users`,
      auth: 'superAdmin',
      query: { q: 'sarim' },
    }),
  })
  cases.push({
    id: 'auth.users.paged.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/users',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId'],
    requiredQueryParams: ['paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${onboardingOrganizationId(ctx)}/users`,
      auth: 'superAdmin',
      query: {
        q: 'sarim',
        paged: 1,
        limit: 20,
        sort: 'createdAt:desc',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'auth.users.paged.get')
    },
  })
  cases.push({
    id: 'search.global.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/products/:productId/search/global',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId', 'productId'],
    requiredQueryParams: ['q'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${onboardingOrganizationId(ctx)}/products/${encodeURIComponent(baseProductId(ctx))}/search/global`,
      auth: 'superAdmin',
      query: {
        q: 'story',
        types: 'task,initiative,delivery,team_member,wiki_asset',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'search.global.get')
      const payload = response.data as Record<string, unknown>
      const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : []
      for (const item of items) {
        if (typeof item.id !== 'string' || item.id.length === 0) {
          throw new Error('search.global.get expected each item to include non-empty id')
        }
        if (typeof item.entityType !== 'string' || item.entityType.length === 0) {
          throw new Error('search.global.get expected each item to include entityType')
        }
        if (typeof item.routePath !== 'string' || !item.routePath.startsWith('/')) {
          throw new Error('search.global.get expected each item to include routePath starting with "/"')
        }
        if (typeof item.score !== 'number') {
          throw new Error('search.global.get expected each item to include numeric score')
        }
      }
      for (let index = 1; index < items.length; index += 1) {
        const prev = Number(items[index - 1]?.score ?? 0)
        const next = Number(items[index]?.score ?? 0)
        if (next > prev + 0.000001) {
          throw new Error('search.global.get expected scores to be returned in descending order')
        }
      }
    },
  })
  cases.push({
    id: 'search.global.paged.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/products/:productId/search/global',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId', 'productId'],
    requiredQueryParams: ['q', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${onboardingOrganizationId(ctx)}/products/${encodeURIComponent(baseProductId(ctx))}/search/global`,
      auth: 'superAdmin',
      query: {
        q: 'story',
        limit: 1,
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'search.global.paged.get')
      const payload = response.data as Record<string, unknown>
      const items = Array.isArray(payload.items) ? payload.items : []
      if (items.length > 1) {
        throw new Error('search.global.paged.get expected at most one item when limit=1')
      }
    },
  })
  cases.push({
    id: 'auth.users-work.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/users/:id/work',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId', 'id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${onboardingOrganizationId(ctx)}/users/${fixtureId(ctx.fixtures.primaryUserId)}/work`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'auth.users-home.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/users/:id/home',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId', 'id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${onboardingOrganizationId(ctx)}/users/${fixtureId(ctx.fixtures.primaryUserId)}/home`,
      auth: 'superAdmin',
    }),
    onSuccess: (_ctx, response) => {
      const data = response.data as Record<string, unknown> | null
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('auth.users-home.get expected object payload')
      }

      const tasksByStatus = data.tasksByStatus
      if (!tasksByStatus || typeof tasksByStatus !== 'object' || Array.isArray(tasksByStatus)) {
        throw new Error('auth.users-home.get expected tasksByStatus object')
      }
      for (const [status, count] of Object.entries(tasksByStatus as Record<string, unknown>)) {
        if (!status) {
          throw new Error('auth.users-home.get expected non-empty task status keys')
        }
        if (typeof count !== 'number') {
          throw new Error('auth.users-home.get expected numeric status counts')
        }
      }

      const tasks = data.tasks
      const totalTasks = data.totalTasks
      if (!Array.isArray(tasks) && typeof totalTasks !== 'number') {
        throw new Error('auth.users-home.get expected either tasks array or totalTasks number')
      }
      if (Array.isArray(tasks)) {
        for (const item of tasks) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error('auth.users-home.get expected task objects')
          }
          const task = item as Record<string, unknown>
          if (typeof task.id !== 'string' || task.id.length === 0) {
            throw new Error('auth.users-home.get expected each task to include a routeable id')
          }
          if (typeof task.status !== 'string' || task.status.length === 0) {
            throw new Error('auth.users-home.get expected each task to include a status')
          }
        }
      }

      const stories = data.stories
      if (stories !== undefined && !Array.isArray(stories)) {
        throw new Error('auth.users-home.get expected stories to be an array when provided')
      }
      if (Array.isArray(stories)) {
        for (const item of stories) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error('auth.users-home.get expected story objects')
          }
          const story = item as Record<string, unknown>
          if (typeof story.id !== 'string' || story.id.length === 0) {
            throw new Error('auth.users-home.get expected each story to include a routeable id')
          }
        }
      }

      const activities = data.activities
      if (!Array.isArray(activities)) {
        throw new Error('auth.users-home.get expected activities array')
      }
      for (const item of activities) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new Error('auth.users-home.get expected activity objects')
        }
        const activity = item as Record<string, unknown>
        if (typeof activity.entityType !== 'string' || activity.entityType.length === 0) {
          throw new Error('auth.users-home.get expected activity.entityType as non-empty string')
        }
        if (!(typeof activity.entityId === 'string' || activity.entityId === null)) {
          throw new Error('auth.users-home.get expected activity.entityId as string|null')
        }
      }

      const upcomingDeadlines = data.upcomingDeadlines
      if (!Array.isArray(upcomingDeadlines)) {
        throw new Error('auth.users-home.get expected upcomingDeadlines array')
      }
      for (const item of upcomingDeadlines) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new Error('auth.users-home.get expected upcoming deadline objects')
        }
        const deadline = item as Record<string, unknown>
        if (typeof deadline.id !== 'string' || deadline.id.length === 0) {
          throw new Error('auth.users-home.get expected each upcoming deadline to include routeable id')
        }
      }
    },
  })
  cases.push({
    id: 'auth.users-home.scope-all.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/users/:id/home',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId', 'id'],
    requiredQueryParams: ['scopeMode'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${onboardingOrganizationId(ctx)}/users/${fixtureId(ctx.fixtures.primaryUserId)}/home`,
      auth: 'superAdmin',
      query: {
        scopeMode: 'all',
      },
    }),
    onSuccess: (_ctx, response) => {
      const data = response.data as Record<string, unknown> | null
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('auth.users-home.scope-all.get expected object payload')
      }
      if (!Array.isArray(data.activities)) {
        throw new Error('auth.users-home.scope-all.get expected activities array')
      }
      if (typeof data.totalTasks !== 'number') {
        throw new Error('auth.users-home.scope-all.get expected numeric totalTasks')
      }
      if (!Array.isArray(data.upcomingDeadlines)) {
        throw new Error('auth.users-home.scope-all.get expected upcomingDeadlines array')
      }
      if (typeof (data.actionScore as Record<string, unknown> | undefined)?.current !== 'number') {
        throw new Error('auth.users-home.scope-all.get expected actionScore.current number')
      }
      if (typeof (data.stats as Record<string, unknown> | undefined)?.overdueItems !== 'number') {
        throw new Error('auth.users-home.scope-all.get expected stats.overdueItems number')
      }
      const reviewQueue = data.reviewQueueHealth as Record<string, unknown> | undefined
      const buckets = reviewQueue?.buckets as Record<string, unknown> | undefined
      if (typeof reviewQueue?.slaBreachCount !== 'number') {
        throw new Error('auth.users-home.scope-all.get expected reviewQueueHealth.slaBreachCount number')
      }
      if (
        typeof buckets?.lt24 !== 'number'
        || typeof buckets?.between24And72 !== 'number'
        || typeof buckets?.gt72 !== 'number'
      ) {
        throw new Error('auth.users-home.scope-all.get expected reviewQueueHealth bucket numbers')
      }
    },
  })
  cases.push({
    id: 'auth.users-daily-brief.scope-all.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/users/:id/daily-brief',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId', 'id'],
    requiredQueryParams: ['scopeMode', 'view'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${onboardingOrganizationId(ctx)}/users/${fixtureId(ctx.fixtures.primaryUserId)}/daily-brief`,
      auth: 'superAdmin',
      query: {
        scopeMode: 'all',
        view: 'executive',
      },
    }),
    onSuccess: (_ctx, response) => {
      const payload = response.data as Record<string, unknown> | null
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('auth.users-daily-brief.scope-all.get expected object payload')
      }
      if (typeof payload.brief !== 'string' || payload.brief.length === 0) {
        throw new Error('auth.users-daily-brief.scope-all.get expected non-empty brief text')
      }
      if (payload.view !== 'executive') {
        throw new Error('auth.users-daily-brief.scope-all.get expected executive view')
      }
      if (!Array.isArray(payload.sections)) {
        throw new Error('auth.users-daily-brief.scope-all.get expected sections array')
      }
      if (typeof payload.generatedAt !== 'string' || payload.generatedAt.length === 0) {
        throw new Error('auth.users-daily-brief.scope-all.get expected generatedAt string')
      }
      if (!['ai', 'fallback', 'disabled'].includes(String(payload.source))) {
        throw new Error('auth.users-daily-brief.scope-all.get expected valid source')
      }
    },
  })
  cases.push({
    id: 'auth.profile.put',
    method: 'PUT',
    pathTemplate: '/api/auth/profile',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: '/api/auth/profile',
      auth: 'user',
      json: {
        name: `Endpoint User ${ctx.fixtures.runId}`,
      },
    }),
  })
  cases.push({
    id: 'auth.upload-avatar.post',
    method: 'POST',
    pathTemplate: '/api/auth/upload-avatar',
    auth: 'user',
    contentType: 'multipart',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['file'],
    expectedStatuses: [200],
    buildRequest: () => {
      const form = new FormData()
      form.set('file', createImageFile('avatar.png'))
      return {
        method: 'POST',
        path: '/api/auth/upload-avatar',
        auth: 'user',
        formData: form,
      }
    },
  })

  // Onboarding
  cases.push({
    id: 'onboarding.state.get',
    method: 'GET',
    pathTemplate: '/api/onboarding/state',
    auth: 'regularUser',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/onboarding/state',
      auth: 'regularUser',
    }),
  })
  cases.push({
    id: 'onboarding.organization.post',
    method: 'POST',
    pathTemplate: '/api/onboarding/organization',
    auth: 'regularUser',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['name'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/onboarding/organization',
      auth: 'regularUser',
      json: {
        name: `Endpoint Org ${ctx.fixtures.runId}-${Date.now()}`,
        description: 'Endpoint onboarding organization profile fixture',
      },
    }),
    onSuccess: (ctx, response) => {
      const payload = response.data as Record<string, unknown> | null
      const org = payload?.organization as Record<string, unknown> | undefined
      const id = typeof org?.id === 'string' ? org.id : ''
      if (id) ctx.fixtures.onboardingOrganizationId = id
    },
  })
  cases.push({
    id: 'onboarding.organization.upload-logo.post',
    method: 'POST',
    pathTemplate: '/api/onboarding/organization/upload-logo',
    auth: 'regularUser',
    contentType: 'multipart',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['file', 'organizationId'],
    expectedStatuses: [200],
    buildRequest: (ctx) => {
      const form = new FormData()
      form.set('organizationId', onboardingOrganizationId(ctx))
      form.set('file', createImageFile('organization-logo.png'))
      return {
        method: 'POST',
        path: '/api/onboarding/organization/upload-logo',
        auth: 'regularUser',
        formData: form,
      }
    },
  })
  cases.push({
    id: 'onboarding.organization.patch',
    method: 'PATCH',
    pathTemplate: '/api/onboarding/organization/:organizationId',
    auth: 'regularUser',
    contentType: 'json',
    requiredPathParams: ['organizationId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PATCH',
      path: `/api/onboarding/organization/${onboardingOrganizationId(ctx)}`,
      auth: 'regularUser',
      json: {
        name: `Endpoint Org Updated ${ctx.fixtures.runId}-${Date.now()}`,
        description: 'Endpoint onboarding organization update fixture',
      },
    }),
  })
  cases.push({
    id: 'onboarding.workspace.post',
    method: 'POST',
    pathTemplate: '/api/onboarding/workspace',
    auth: 'regularUser',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['organizationId', 'name'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/onboarding/workspace',
      auth: 'regularUser',
      json: {
        organizationId: onboardingOrganizationId(ctx),
        name: `Endpoint Workspace ${ctx.fixtures.runId}-${Date.now()}`,
        description: 'Endpoint onboarding workspace fixture',
      },
    }),
  })
  cases.push({
    id: 'onboarding.invites.post',
    method: 'POST',
    pathTemplate: '/api/onboarding/invites',
    auth: 'regularUser',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['organizationId', 'invites'],
    expectedStatuses: [200],
    buildRequest: (ctx) => {
      const inviteEmail = `endpoint-onboarding-invite-${ctx.fixtures.runId}-${Date.now()}@productier.test`
      ctx.fixtures.onboardingInviteEmail = inviteEmail
      return {
      method: 'POST',
      path: '/api/onboarding/invites',
      auth: 'regularUser',
      json: {
        organizationId: onboardingOrganizationId(ctx),
        invites: [
          {
            email: inviteEmail,
            name: `Endpoint Invite ${ctx.fixtures.runId}`,
            role: 'member',
          },
        ],
      },
      }
    },
    onSuccess: (ctx, response) => {
      const payload = response.data as Record<string, unknown> | null
      const created = Array.isArray(payload?.created)
        ? payload.created as Array<Record<string, unknown>>
        : []
      const first = created[0]
      const inviteId = typeof first?.id === 'string' ? first.id : ''
      const inviteEmail = typeof first?.email === 'string' ? first.email : ''
      const inviteLink = typeof first?.inviteLink === 'string' ? first.inviteLink : ''
      if (inviteId) ctx.fixtures.onboardingInviteId = inviteId
      if (inviteEmail) ctx.fixtures.onboardingInviteEmail = inviteEmail
      if (inviteLink) {
        try {
          const parsed = new URL(inviteLink, 'http://localhost')
          const token = parsed.searchParams.get('token')
          if (token) ctx.fixtures.onboardingInviteToken = token
        } catch {
          // ignore malformed invite links
        }
      }
    },
  })
  cases.push({
    id: 'onboarding.invites.get',
    method: 'GET',
    pathTemplate: '/api/onboarding/invites',
    auth: 'regularUser',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['organizationId'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/onboarding/invites',
      auth: 'regularUser',
      query: {
        organizationId: onboardingOrganizationId(ctx),
      },
    }),
  })
  cases.push({
    id: 'onboarding.invites.accept.post',
    method: 'POST',
    pathTemplate: '/api/onboarding/invites/accept',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['token'],
    expectedStatuses: [200],
    buildRequest: async (ctx) => {
      const invite = await createOnboardingInviteForEmail(
        ctx,
        ctx.credentials.email,
        { role: 'member' },
      )
      return {
        method: 'POST',
        path: '/api/onboarding/invites/accept',
        auth: 'superAdmin',
        json: {
          token: invite.token,
        },
      }
    },
  })
  cases.push({
    id: 'onboarding.invites.activate.post',
    method: 'POST',
    pathTemplate: '/api/onboarding/invites/activate',
    auth: 'none',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['token', 'password'],
    expectedStatuses: [200],
    buildRequest: async (ctx) => {
      const invitedEmail = `endpoint-activate-invite-${ctx.fixtures.runId}-${Date.now()}@productier.test`
      const invite = await createOnboardingInviteForEmail(ctx, invitedEmail, {
        name: `Endpoint Activate ${ctx.fixtures.runId}`,
        role: 'member',
      })
      return {
        method: 'POST',
        path: '/api/onboarding/invites/activate',
        auth: 'none',
        json: {
          token: invite.token,
          password: 'EndpointInvite-Activate1!',
          name: `Endpoint Activated ${ctx.fixtures.runId}`,
        },
      }
    },
  })
  cases.push({
    id: 'onboarding.invites.delete',
    method: 'DELETE',
    pathTemplate: '/api/onboarding/invites/:inviteId',
    auth: 'regularUser',
    contentType: 'none',
    requiredPathParams: ['inviteId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/onboarding/invites/${fixtureId(ctx.fixtures.onboardingInviteId)}`,
      auth: 'regularUser',
    }),
  })
  cases.push({
    id: 'onboarding.complete.post',
    method: 'POST',
    pathTemplate: '/api/onboarding/complete',
    auth: 'regularUser',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/onboarding/complete',
      auth: 'regularUser',
      json: {
        organizationId: onboardingOrganizationId(ctx),
      },
    }),
  })
  cases.push({
    id: 'security.onboarding.state.get.unauthorized',
    method: 'GET',
    pathTemplate: '/api/onboarding/state',
    auth: 'none',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [401],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/onboarding/state',
      auth: 'none',
    }),
  })

  // Activities
  cases.push({
    id: 'activities.get',
    method: 'GET',
    pathTemplate: '/api/activities',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/activities',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        limit: 50,
      },
    }),
  })
  cases.push({
    id: 'activities.paged.get',
    method: 'GET',
    pathTemplate: '/api/activities',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/activities',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        q: 'Endpoint',
        paged: 1,
        limit: 10,
        sort: 'createdAt:desc',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'activities.paged.get')
    },
  })
  cases.push({
    id: 'activities.post',
    method: 'POST',
    pathTemplate: '/api/activities',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['productId', 'action', 'entityType', 'entityTitle'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/activities',
      auth: 'superAdmin',
      json: {
        productId: baseProductId(ctx),
        action: 'updated',
        entityType: 'story',
        entityId: ctx.fixtures.storyId ?? null,
        entityTitle: `Endpoint Story ${ctx.fixtures.runId}`,
      },
    }),
  })
  cases.push({
    id: 'security.activities.get.unauthorized',
    method: 'GET',
    pathTemplate: '/api/activities',
    auth: 'none',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [401],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/activities',
      auth: 'none',
      query: {
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'security.products.members.get.unauthorized',
    method: 'GET',
    pathTemplate: '/api/products/:productId/members',
    auth: 'none',
    contentType: 'none',
    requiredPathParams: ['productId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [401],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/products/${encodedProductId(ctx)}/members`,
      auth: 'none',
    }),
  })
  cases.push({
    id: 'security.consumer-feedbacks.get.unauthorized',
    method: 'GET',
    pathTemplate: '/api/consumer-feedbacks',
    auth: 'none',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [401],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/consumer-feedbacks',
      auth: 'none',
      query: {
        productId: baseProductId(ctx),
      },
    }),
  })

  // Metrics
  const metricPaths = [
    { id: 'dashboard', path: '/api/metrics/dashboard', query: { productId: 'product', period: 30 } },
    { id: 'throughput', path: '/api/metrics/throughput', query: { productId: 'product', period: 90, granularity: 'week' } },
    { id: 'flow', path: '/api/metrics/flow', query: { productId: 'product', period: 90 } },
    { id: 'quality', path: '/api/metrics/quality', query: { productId: 'product', period: 90 } },
    { id: 'blockers', path: '/api/metrics/blockers', query: { productId: 'product', period: 90 } },
    { id: 'predictability', path: '/api/metrics/predictability', query: { productId: 'product', period: 90 } },
    { id: 'workload', path: '/api/metrics/workload', query: { productId: 'product' } },
    { id: 'deliveries-metrics', path: '/api/metrics/deliveries-metrics', query: { productId: 'product' } },
  ] as const
  for (const metric of metricPaths) {
    cases.push({
      id: `metrics.${metric.id}.get`,
      method: 'GET',
      pathTemplate: `/api/organizations/:organizationId/metrics${metric.path.slice('/api/metrics'.length)}`,
      auth: 'superAdmin',
      contentType: 'none',
      requiredPathParams: ['organizationId'],
      requiredQueryParams: [],
      requiredBodyFields: [],
      expectedStatuses: [200],
      buildRequest: (ctx) => ({
        method: 'GET',
        path: `/api/organizations/${primaryOrganizationId(ctx)}/metrics${metric.path.slice('/api/metrics'.length)}`,
        auth: 'superAdmin',
        query: {
          ...metric.query,
          productId: baseProductId(ctx),
        },
      }),
    })
  }
  for (const metric of metricPaths) {
    cases.push({
      id: `metrics.${metric.id}.scope-all.get`,
      method: 'GET',
      pathTemplate: `/api/organizations/:organizationId/metrics${metric.path.slice('/api/metrics'.length)}`,
      auth: 'superAdmin',
      contentType: 'none',
      requiredPathParams: ['organizationId'],
      requiredQueryParams: ['scopeMode'],
      requiredBodyFields: [],
      expectedStatuses: [200],
      buildRequest: (ctx) => {
        const query: Record<string, string | number | boolean | null | undefined> = {
          ...metric.query,
          scopeMode: 'all',
        }
        delete query.productId
        return {
          method: 'GET',
          path: `/api/organizations/${primaryOrganizationId(ctx)}/metrics${metric.path.slice('/api/metrics'.length)}`,
          auth: 'superAdmin',
          query,
        }
      },
      onSuccess: (_ctx, response) => {
        const data = response.data as Record<string, unknown> | null
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error(`metrics.${metric.id}.scope-all.get expected object payload`)
        }

        if (metric.id === 'dashboard') {
          const kpi = data.kpi as Record<string, unknown> | undefined
          const atRisk = data.atRiskWork as Record<string, unknown> | undefined
          if (typeof kpi?.onTimeRate !== 'number') {
            throw new Error('metrics.dashboard.scope-all.get expected kpi.onTimeRate number')
          }
          if (typeof atRisk?.total !== 'number' || !Array.isArray(atRisk?.trend)) {
            throw new Error('metrics.dashboard.scope-all.get expected atRiskWork totals/trend')
          }
          return
        }

        if (metric.id === 'throughput') {
          if (typeof data.totalCompleted !== 'number' || !Array.isArray(data.completedOverTime)) {
            throw new Error('metrics.throughput.scope-all.get expected totalCompleted and completedOverTime')
          }
          return
        }

        if (metric.id === 'flow') {
          const cycleTime = data.cycleTime as Record<string, unknown> | undefined
          const leadTime = data.leadTime as Record<string, unknown> | undefined
          if (typeof data.flowEfficiency !== 'number') {
            throw new Error('metrics.flow.scope-all.get expected flowEfficiency number')
          }
          if (typeof cycleTime?.p85 !== 'number' || typeof leadTime?.p85 !== 'number') {
            throw new Error('metrics.flow.scope-all.get expected cycle/lead p85 numbers')
          }
          return
        }

        if (metric.id === 'quality') {
          if (
            typeof data.firstPassRate !== 'number'
            || typeof data.reworkRate !== 'number'
            || !Array.isArray(data.reviewLoad)
          ) {
            throw new Error('metrics.quality.scope-all.get expected quality KPI numbers and reviewLoad')
          }
          return
        }

        if (metric.id === 'blockers') {
          if (!Array.isArray(data.currentlyBlocked) || !Array.isArray(data.blockedTrend)) {
            throw new Error('metrics.blockers.scope-all.get expected blockers arrays')
          }
          return
        }

        if (metric.id === 'predictability') {
          if (typeof data.avgPredictability !== 'number' || !Array.isArray(data.riskMatrix)) {
            throw new Error('metrics.predictability.scope-all.get expected avgPredictability and riskMatrix')
          }
          return
        }

        if (metric.id === 'workload') {
          if (typeof data.overloadThreshold !== 'number' || !Array.isArray(data.memberWorkload)) {
            throw new Error('metrics.workload.scope-all.get expected overloadThreshold and memberWorkload')
          }
          return
        }

        if (metric.id === 'deliveries-metrics') {
          if (typeof data.activeDeliveries !== 'number' || !Array.isArray(data.deliveryDetails)) {
            throw new Error('metrics.deliveries-metrics.scope-all.get expected activeDeliveries and deliveryDetails')
          }
        }
      },
    })
  }

  cases.push({
    id: 'metrics.dashboard.scope-team.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/metrics/dashboard',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId'],
    requiredQueryParams: ['scopeMode', 'teamId'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${primaryOrganizationId(ctx)}/metrics/dashboard`,
      auth: 'superAdmin',
      query: {
        scopeMode: 'team',
        teamId: fixtureId(ctx.fixtures.organizationTeamId),
        period: 30,
      },
    }),
    onSuccess: (_ctx, response) => {
      const payload = response.data as Record<string, unknown> | null
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('metrics.dashboard.scope-team.get expected object payload')
      }
      const team = payload.team as Record<string, unknown> | null
      if (!team || !Array.isArray(team.workload)) {
        throw new Error('metrics.dashboard.scope-team.get expected team.workload array')
      }
    },
  })

  // Dashboards
  cases.push({
    id: 'dashboards.pages.product.get',
    method: 'GET',
    pathTemplate: '/api/dashboards/pages',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['scopeType', 'productId'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/dashboards/pages',
      auth: 'superAdmin',
      query: {
        scopeType: 'product',
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'dashboards.pages.product.post',
    method: 'POST',
    pathTemplate: '/api/dashboards/pages',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['scopeType', 'productId', 'name', 'visibility'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/dashboards/pages',
      auth: 'superAdmin',
      json: {
        scopeType: 'product',
        productId: baseProductId(ctx),
        name: `Endpoint Dashboard ${ctx.fixtures.runId}-${Date.now()}`,
        visibility: 'invited',
        sharedUserIds: [ctx.fixtures.secondaryUserId].filter((value): value is string => typeof value === 'string'),
      },
    }),
    onSuccess: (ctx, response) => {
      const payload = response.data as Record<string, unknown> | null
      const id = typeof payload?.id === 'string' ? payload.id : ''
      if (id) ctx.fixtures.dashboardPageId = id
    },
  })
  cases.push({
    id: 'dashboards.pages.reorder.put',
    method: 'PUT',
    pathTemplate: '/api/dashboards/pages/reorder',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['scopeType', 'productId', 'orderedPageIds'],
    expectedStatuses: [200],
    dependencyNote: 'Requires dashboards.pages.product.post',
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: '/api/dashboards/pages/reorder',
      auth: 'superAdmin',
      json: {
        scopeType: 'product',
        productId: baseProductId(ctx),
        orderedPageIds: [fixtureId(ctx.fixtures.dashboardPageId)],
      },
    }),
  })
  cases.push({
    id: 'dashboards.widgets.post',
    method: 'POST',
    pathTemplate: '/api/dashboards/pages/:pageId/widgets',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['pageId'],
    requiredQueryParams: [],
    requiredBodyFields: ['widgetType'],
    expectedStatuses: [200],
    dependencyNote: 'Requires dashboards.pages.product.post',
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/dashboards/pages/${fixtureId(ctx.fixtures.dashboardPageId)}/widgets`,
      auth: 'superAdmin',
      json: {
        widgetType: 'metrics_throughput',
        widgetTitle: 'Throughput',
        gridW: 2,
        gridH: 1,
      },
    }),
    onSuccess: (ctx, response) => {
      const payload = response.data as Record<string, unknown> | null
      const id = typeof payload?.id === 'string' ? payload.id : ''
      if (id) ctx.fixtures.dashboardWidgetId = id
    },
  })
  cases.push({
    id: 'dashboards.widgets.patch',
    method: 'PATCH',
    pathTemplate: '/api/dashboards/pages/:pageId/widgets/:widgetId',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['pageId', 'widgetId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    dependencyNote: 'Requires dashboards.widgets.post',
    buildRequest: (ctx) => ({
      method: 'PATCH',
      path: `/api/dashboards/pages/${fixtureId(ctx.fixtures.dashboardPageId)}/widgets/${fixtureId(ctx.fixtures.dashboardWidgetId)}`,
      auth: 'superAdmin',
      json: {
        gridW: 1,
        gridH: 2,
      },
    }),
  })
  cases.push({
    id: 'dashboards.viewers.put',
    method: 'PUT',
    pathTemplate: '/api/dashboards/pages/:pageId/viewers',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['pageId'],
    requiredQueryParams: [],
    requiredBodyFields: ['userIds'],
    expectedStatuses: [200],
    dependencyNote: 'Requires dashboards.pages.product.post',
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/dashboards/pages/${fixtureId(ctx.fixtures.dashboardPageId)}/viewers`,
      auth: 'superAdmin',
      json: {
        userIds: [ctx.fixtures.secondaryUserId].filter((value): value is string => typeof value === 'string'),
      },
    }),
  })
  cases.push({
    id: 'dashboards.viewers.roles.put',
    method: 'PUT',
    pathTemplate: '/api/dashboards/pages/:pageId/viewers',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['pageId'],
    requiredQueryParams: [],
    requiredBodyFields: ['viewers'],
    expectedStatuses: [200],
    dependencyNote: 'Requires dashboards.pages.product.post',
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/dashboards/pages/${fixtureId(ctx.fixtures.dashboardPageId)}/viewers`,
      auth: 'superAdmin',
      json: {
        viewers: [ctx.fixtures.secondaryUserId]
          .filter((value): value is string => typeof value === 'string')
          .map((userId) => ({ userId, role: 'editor' as const })),
      },
    }),
  })
  cases.push({
    id: 'dashboards.templates.get',
    method: 'GET',
    pathTemplate: '/api/dashboards/templates',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['scopeType', 'productId'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/dashboards/templates',
      auth: 'superAdmin',
      query: {
        scopeType: 'product',
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'dashboards.templates.post',
    method: 'POST',
    pathTemplate: '/api/dashboards/templates',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['scopeType', 'productId', 'name'],
    expectedStatuses: [200],
    dependencyNote: 'Requires dashboards.pages.product.post',
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/dashboards/templates',
      auth: 'superAdmin',
      json: {
        scopeType: 'product',
        productId: baseProductId(ctx),
        name: `Endpoint Template ${ctx.fixtures.runId}-${Date.now()}`,
        visibility: 'team',
        pageIds: [ctx.fixtures.dashboardPageId].filter((value): value is string => typeof value === 'string'),
      },
    }),
    onSuccess: (ctx, response) => {
      const payload = response.data as Record<string, unknown> | null
      const id = typeof payload?.id === 'string' ? payload.id : ''
      if (id) ctx.fixtures.dashboardTemplateId = id
    },
  })
  cases.push({
    id: 'dashboards.templates.apply.append',
    method: 'POST',
    pathTemplate: '/api/dashboards/templates/:templateId/apply',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['templateId'],
    requiredQueryParams: [],
    requiredBodyFields: ['scopeType', 'productId', 'mode'],
    expectedStatuses: [200],
    dependencyNote: 'Requires dashboards.templates.post',
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/dashboards/templates/${fixtureId(ctx.fixtures.dashboardTemplateId)}/apply`,
      auth: 'superAdmin',
      json: {
        scopeType: 'product',
        productId: baseProductId(ctx),
        mode: 'append',
      },
    }),
  })
  cases.push({
    id: 'dashboards.templates.delete',
    method: 'DELETE',
    pathTemplate: '/api/dashboards/templates/:templateId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['templateId'],
    requiredQueryParams: ['scopeType', 'productId'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    dependencyNote: 'Requires dashboards.templates.post',
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/dashboards/templates/${fixtureId(ctx.fixtures.dashboardTemplateId)}`,
      auth: 'superAdmin',
      query: {
        scopeType: 'product',
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'dashboards.pages.delete',
    method: 'DELETE',
    pathTemplate: '/api/dashboards/pages/:pageId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['pageId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    dependencyNote: 'Requires dashboards.pages.product.post',
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/dashboards/pages/${fixtureId(ctx.fixtures.dashboardPageId)}`,
      auth: 'superAdmin',
    }),
  })

  // Products
  cases.push({
    id: 'products.get',
    method: 'GET',
    pathTemplate: '/api/products',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({ method: 'GET', path: '/api/products', auth: 'superAdmin' }),
  })
  cases.push({
    id: 'products.post',
    method: 'POST',
    pathTemplate: '/api/products',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['name'],
    expectedStatuses: [200, 409],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/products',
      auth: 'superAdmin',
      json: {
        name: ctx.fixtures.caseProductName,
        description: 'Endpoint case product',
      },
    }),
  })
  cases.push({
    id: 'products.members.get',
    method: 'GET',
    pathTemplate: '/api/products/:productId/members',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['productId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/products/${encodedProductId(ctx)}/members`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'products.members.post',
    method: 'POST',
    pathTemplate: '/api/products/:productId/members',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['productId'],
    requiredQueryParams: [],
    requiredBodyFields: ['userId'],
    expectedStatuses: [200, 409],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/products/${encodedProductId(ctx)}/members`,
      auth: 'superAdmin',
      json: {
        userId: fixtureId(ctx.fixtures.tertiaryUserId),
        role: 'member',
      },
    }),
    onSuccess: (ctx) => {
      if (ctx.fixtures.tertiaryUserId) {
        ctx.fixtures.productMemberUserId = ctx.fixtures.tertiaryUserId
      }
    },
  })
  cases.push({
    id: 'products.upload-logo.post',
    method: 'POST',
    pathTemplate: '/api/products/upload-logo',
    auth: 'superAdmin',
    contentType: 'multipart',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['file'],
    expectedStatuses: [200],
    buildRequest: (ctx) => {
      const form = new FormData()
      form.set('file', createImageFile('logo.png'))
      form.set('productId', baseProductId(ctx))
      return {
        method: 'POST',
        path: '/api/products/upload-logo',
        auth: 'superAdmin',
        formData: form,
      }
    },
  })

  // Stories
  cases.push({
    id: 'stories.get',
    method: 'GET',
    pathTemplate: '/api/stories',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/stories',
      auth: 'superAdmin',
      query: { productId: baseProductId(ctx) },
    }),
  })
  cases.push({
    id: 'stories.paged.get',
    method: 'GET',
    pathTemplate: '/api/stories',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/stories',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        q: 'Endpoint',
        paged: 1,
        limit: 10,
        sort: 'createdAt:desc',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'stories.paged.get')
      assertStoryPagedShape(response.data, 'stories.paged.get')
    },
  })
  cases.push({
    id: 'stories.post',
    method: 'POST',
    pathTemplate: '/api/stories',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['title'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/stories',
      auth: 'superAdmin',
      json: {
        title: `Endpoint Story Case ${ctx.fixtures.runId}-${Date.now()}`,
        productId: baseProductId(ctx),
        type: 'feature',
        priority: 'medium',
      },
    }),
  })
  cases.push({
    id: 'stories.by-id.get',
    method: 'GET',
    pathTemplate: '/api/stories/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/stories/${fixtureId(ctx.fixtures.storyId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'stories.put',
    method: 'PUT',
    pathTemplate: '/api/stories/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/stories/${fixtureId(ctx.fixtures.storyId)}`,
      auth: 'superAdmin',
      json: {
        status: 'in_progress',
        title: `Endpoint Story Updated ${ctx.fixtures.runId}`,
      },
    }),
  })
  cases.push({
    id: 'stories.reorder.put',
    method: 'PUT',
    pathTemplate: '/api/stories/reorder',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['productId', 'status', 'orderedStoryIds'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: '/api/stories/reorder',
      auth: 'superAdmin',
      json: {
        productId: baseProductId(ctx),
        status: 'in_progress',
        orderedStoryIds: [fixtureId(ctx.fixtures.storyId)],
      },
    }),
  })
  cases.push({
    id: 'stories.comments.get',
    method: 'GET',
    pathTemplate: '/api/stories/:id/comments',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/stories/${fixtureId(ctx.fixtures.storyId)}/comments`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'stories.comments.post',
    method: 'POST',
    pathTemplate: '/api/stories/:id/comments',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['content'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/stories/${fixtureId(ctx.fixtures.storyId)}/comments`,
      auth: 'superAdmin',
      json: { content: `Endpoint story comment ${ctx.fixtures.runId}-${Date.now()}` },
    }),
    onSuccess: (ctx, response) => {
      const data = response.data as Record<string, unknown> | null
      const id = data && typeof data.id === 'string' ? data.id : ''
      if (id) ctx.fixtures.storyCommentId = id
    },
  })

  // Organization teams + hierarchy
  cases.push({
    id: 'organizations.teams.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/teams',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${fixtureId(ctx.fixtures.organizationId)}/teams`,
      auth: 'superAdmin',
      query: { includeMembers: 1 },
    }),
    onSuccess: (_ctx, response) => {
      if (!Array.isArray(response.data)) {
        throw new Error('organizations.teams.get expected an array response')
      }
    },
  })
  cases.push({
    id: 'organizations.teams.post',
    method: 'POST',
    pathTemplate: '/api/organizations/:organizationId/teams',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['organizationId'],
    requiredQueryParams: [],
    requiredBodyFields: ['name'],
    expectedStatuses: [200],
    buildRequest: (ctx) => {
      const initialLeadUserId = resolveInitialTeamLeadUserId(ctx)
      return {
        method: 'POST',
        path: `/api/organizations/${fixtureId(ctx.fixtures.organizationId)}/teams`,
        auth: 'superAdmin',
        json: {
          name: `Endpoint Case Team ${ctx.fixtures.runId}-${Date.now()}`,
          key: `endpoint-case-${ctx.fixtures.runId.toLowerCase()}-${Date.now().toString(36)}`,
          description: 'Created by endpoint case coverage',
          leadUserId: initialLeadUserId,
          leadUserIds: [initialLeadUserId],
          memberUserIds: [initialLeadUserId],
        },
      }
    },
    onSuccess: async (ctx, response) => {
      const payload = response.data as Record<string, unknown> | null
      const teamId = payload && typeof payload.id === 'string' ? payload.id : ''
      if (teamId) ctx.fixtures.organizationTeamCaseId = teamId
      const initialLeadUserId = resolveInitialTeamLeadUserId(ctx)
      const leadUserIds = Array.isArray(payload?.leadUserIds)
        ? normalizedSortedIds(payload.leadUserIds.map((value) => (typeof value === 'string' ? value : '')))
        : []
      if (!sameIdSet(leadUserIds, [initialLeadUserId])) {
        throw new Error(
          `organizations.teams.post expected created leadUserIds=${initialLeadUserId} but got ${leadUserIds.join(',') || '<none>'}`,
        )
      }
    },
  })
  cases.push({
    id: 'organizations.teams.patch',
    method: 'PATCH',
    pathTemplate: '/api/organizations/:organizationId/teams/:teamId',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['organizationId', 'teamId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PATCH',
      path: `/api/organizations/${fixtureId(ctx.fixtures.organizationId)}/teams/${fixtureId(
        ctx.fixtures.organizationTeamCaseId ?? ctx.fixtures.organizationTeamId,
      )}`,
      auth: 'superAdmin',
      json: {
        description: `Endpoint case updated at ${new Date().toISOString()}`,
      },
    }),
  })
  cases.push({
    id: 'organizations.teams.members.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/teams/:teamId/members',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId', 'teamId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    dependencyNote: 'Requires organizations.teams.post',
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${fixtureId(ctx.fixtures.organizationId)}/teams/${fixtureId(
        ctx.fixtures.organizationTeamCaseId,
      )}/members`,
      auth: 'superAdmin',
    }),
    onSuccess: async (ctx, response) => {
      if (!Array.isArray(response.data)) {
        throw new Error('organizations.teams.members.get expected an array response')
      }
      await assertTeamLeadCardinality(ctx, 'organizations.teams.members.get', [resolveInitialTeamLeadUserId(ctx)])
    },
  })
  cases.push({
    id: 'organizations.teams.members.post',
    method: 'POST',
    pathTemplate: '/api/organizations/:organizationId/teams/:teamId/members',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['organizationId', 'teamId'],
    requiredQueryParams: [],
    requiredBodyFields: ['userId'],
    expectedStatuses: [200],
    dependencyNote: 'Requires organizations.teams.post and organizations.teams.members.get',
    buildRequest: (ctx) => {
      const initialLeadUserId = resolveInitialTeamLeadUserId(ctx)
      const secondaryLeadUserId = resolveSecondaryTeamLeadUserId(ctx, initialLeadUserId)
      return {
        method: 'POST',
        path: `/api/organizations/${fixtureId(ctx.fixtures.organizationId)}/teams/${fixtureId(
          ctx.fixtures.organizationTeamCaseId,
        )}/members`,
        auth: 'superAdmin',
        json: {
          userId: secondaryLeadUserId,
          role: 'lead',
        },
      }
    },
    onSuccess: async (ctx) => {
      const initialLeadUserId = resolveInitialTeamLeadUserId(ctx)
      const secondaryLeadUserId = resolveSecondaryTeamLeadUserId(ctx, initialLeadUserId)
      await assertTeamLeadCardinality(
        ctx,
        'organizations.teams.members.post',
        [initialLeadUserId, secondaryLeadUserId],
      )
    },
  })
  cases.push({
    id: 'organizations.teams.lead.put',
    method: 'PUT',
    pathTemplate: '/api/organizations/:organizationId/teams/:teamId/lead',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['organizationId', 'teamId'],
    requiredQueryParams: [],
    requiredBodyFields: ['userId', 'userIds'],
    expectedStatuses: [200],
    dependencyNote: 'Requires organizations.teams.members.post',
    buildRequest: (ctx) => {
      const initialLeadUserId = resolveInitialTeamLeadUserId(ctx)
      return {
        method: 'PUT',
        path: `/api/organizations/${fixtureId(ctx.fixtures.organizationId)}/teams/${fixtureId(
          ctx.fixtures.organizationTeamCaseId,
        )}/lead`,
        auth: 'superAdmin',
        json: {
          userId: initialLeadUserId,
          userIds: [initialLeadUserId],
        },
      }
    },
    onSuccess: async (ctx) => {
      await assertTeamLeadCardinality(ctx, 'organizations.teams.lead.put', [resolveInitialTeamLeadUserId(ctx)])
    },
  })
  cases.push({
    id: 'organizations.member-reports.put',
    method: 'PUT',
    pathTemplate: '/api/organizations/:organizationId/member-reports/:memberUserId',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['organizationId', 'memberUserId'],
    requiredQueryParams: [],
    requiredBodyFields: ['managerUserId'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/organizations/${fixtureId(ctx.fixtures.organizationId)}/member-reports/${fixtureId(ctx.fixtures.secondaryUserId)}`,
      auth: 'superAdmin',
      json: {
        managerUserId: ctx.fixtures.primaryUserId ?? null,
      },
    }),
  })
  cases.push({
    id: 'organizations.member-reports.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/member-reports',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/organizations/${fixtureId(ctx.fixtures.organizationId)}/member-reports`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'organizations.teams.delete',
    method: 'DELETE',
    pathTemplate: '/api/organizations/:organizationId/teams/:teamId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['organizationId', 'teamId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/organizations/${fixtureId(ctx.fixtures.organizationId)}/teams/${fixtureId(ctx.fixtures.organizationTeamCaseId)}`,
      auth: 'superAdmin',
    }),
    onSuccess: (ctx) => {
      if (ctx.fixtures.organizationTeamCaseId) {
        ctx.fixtures.organizationTeamCaseId = undefined
      }
    },
  })

  // Tasks
  cases.push({
    id: 'tasks.get.paged',
    method: 'GET',
    pathTemplate: '/api/tasks',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/tasks',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        q: 'Endpoint',
        paged: 1,
        limit: 20,
        sort: 'updatedAt:desc',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'tasks.get.paged')
    },
  })
  cases.push({
    id: 'tasks.by-story.get',
    method: 'GET',
    pathTemplate: '/api/tasks/by-story/:storyId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['storyId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/tasks/by-story/${fixtureId(ctx.fixtures.storyId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'tasks.by-story.post',
    method: 'POST',
    pathTemplate: '/api/tasks/by-story/:storyId',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['storyId'],
    requiredQueryParams: [],
    requiredBodyFields: ['title'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/tasks/by-story/${fixtureId(ctx.fixtures.storyId)}`,
      auth: 'superAdmin',
      json: {
        title: `Endpoint Task Case ${ctx.fixtures.runId}-${Date.now()}`,
        ownerUserId: ctx.fixtures.secondaryUserId ?? null,
        ownerTeamId: ctx.fixtures.organizationTeamId ?? null,
        assigneeTeamIds: ctx.fixtures.organizationTeamId ? [ctx.fixtures.organizationTeamId] : [],
        reviewerTeamIds: ctx.fixtures.organizationTeamId ? [ctx.fixtures.organizationTeamId] : [],
        status: 'created',
      },
    }),
  })
  cases.push({
    id: 'tasks.put',
    method: 'PUT',
    pathTemplate: '/api/tasks/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/tasks/${fixtureId(ctx.fixtures.taskId)}`,
      auth: 'superAdmin',
      json: {
        status: 'in_progress',
        estimateValue: 5,
        ownerTeamId: ctx.fixtures.organizationTeamId ?? null,
        assigneeTeamIds: ctx.fixtures.organizationTeamId ? [ctx.fixtures.organizationTeamId] : [],
        reviewerTeamIds: ctx.fixtures.organizationTeamId ? [ctx.fixtures.organizationTeamId] : [],
      },
    }),
  })
  cases.push({
    id: 'tasks.comments.get',
    method: 'GET',
    pathTemplate: '/api/tasks/:id/comments',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/tasks/${fixtureId(ctx.fixtures.taskId)}/comments`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'tasks.comments.post',
    method: 'POST',
    pathTemplate: '/api/tasks/:id/comments',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['content'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/tasks/${fixtureId(ctx.fixtures.taskId)}/comments`,
      auth: 'superAdmin',
      json: { content: `Endpoint task comment ${ctx.fixtures.runId}-${Date.now()}` },
    }),
    onSuccess: (ctx, response) => {
      const data = response.data as Record<string, unknown> | null
      const id = data && typeof data.id === 'string' ? data.id : ''
      if (id) ctx.fixtures.taskCommentId = id
    },
  })
  cases.push({
    id: 'tasks.attachments.get',
    method: 'GET',
    pathTemplate: '/api/tasks/:id/attachments',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/tasks/${fixtureId(ctx.fixtures.taskId)}/attachments`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'tasks.attachments.post',
    method: 'POST',
    pathTemplate: '/api/tasks/:id/attachments',
    auth: 'superAdmin',
    contentType: 'multipart',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['file'],
    expectedStatuses: [200],
    buildRequest: (ctx) => {
      const form = new FormData()
      form.set('file', createImageFile(`endpoint-${ctx.fixtures.runId}.png`))
      return {
        method: 'POST',
        path: `/api/tasks/${fixtureId(ctx.fixtures.taskId)}/attachments`,
        auth: 'superAdmin',
        formData: form,
      }
    },
    onSuccess: (ctx, response) => {
      const data = response.data as Record<string, unknown> | null
      const id = data && typeof data.id === 'string' ? data.id : ''
      if (id) ctx.fixtures.taskAttachmentId = id
    },
  })

  // Initiatives
  cases.push({
    id: 'initiatives.get',
    method: 'GET',
    pathTemplate: '/api/initiatives',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/initiatives',
      auth: 'superAdmin',
      query: { productId: baseProductId(ctx) },
    }),
  })
  cases.push({
    id: 'initiatives.paged.get',
    method: 'GET',
    pathTemplate: '/api/initiatives',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/initiatives',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        paged: 1,
        limit: 20,
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'initiatives.paged.get')
    },
  })
  cases.push({
    id: 'initiatives.post',
    method: 'POST',
    pathTemplate: '/api/initiatives',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['title'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/initiatives',
      auth: 'superAdmin',
      json: {
        title: `Endpoint Initiative Case ${ctx.fixtures.runId}-${Date.now()}`,
        productId: baseProductId(ctx),
        periodStart: '2026-01-01',
        periodEnd: '2026-02-15',
        leaderUserId: ctx.fixtures.secondaryUserId ?? ctx.fixtures.primaryUserId ?? null,
        memberUserIds: [ctx.fixtures.secondaryUserId].filter((value): value is string => typeof value === 'string'),
        teamIds: [ctx.fixtures.organizationTeamId].filter((value): value is string => typeof value === 'string'),
      },
    }),
    onSuccess: (ctx, response) => {
      assertInitiativeDetailShape(response.data, 'initiatives.post')
      const payload = response.data as Record<string, unknown> | null
      const id = payload && typeof payload.id === 'string' ? payload.id : ''
      if (id) ctx.fixtures.initiativeId = id
    },
  })
  cases.push({
    id: 'initiatives.by-id.get',
    method: 'GET',
    pathTemplate: '/api/initiatives/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/initiatives/${fixtureId(ctx.fixtures.initiativeId)}`,
      auth: 'superAdmin',
    }),
    onSuccess: (_ctx, response) => {
      assertInitiativeDetailShape(response.data, 'initiatives.by-id.get')
    },
  })
  cases.push({
    id: 'initiatives.put',
    method: 'PUT',
    pathTemplate: '/api/initiatives/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/initiatives/${fixtureId(ctx.fixtures.initiativeId)}`,
      auth: 'superAdmin',
      json: {
        status: 'active',
        memberUserIds: [ctx.fixtures.secondaryUserId].filter((value): value is string => typeof value === 'string'),
        teamIds: [ctx.fixtures.organizationTeamId].filter((value): value is string => typeof value === 'string'),
      },
    }),
    onSuccess: (_ctx, response) => {
      assertInitiativeDetailShape(response.data, 'initiatives.put')
    },
  })

  // Deliveries
  cases.push({
    id: 'deliveries.get',
    method: 'GET',
    pathTemplate: '/api/deliveries',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/deliveries',
      auth: 'superAdmin',
      query: { productId: baseProductId(ctx) },
    }),
  })
  cases.push({
    id: 'deliveries.paged.get',
    method: 'GET',
    pathTemplate: '/api/deliveries',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/deliveries',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        q: 'Endpoint',
        paged: 1,
        limit: 20,
        sort: 'createdAt:desc',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'deliveries.paged.get')
    },
  })
  cases.push({
    id: 'deliveries.by-id.get',
    method: 'GET',
    pathTemplate: '/api/deliveries/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/deliveries/${fixtureId(ctx.fixtures.deliveryId)}`,
      auth: 'superAdmin',
    }),
    onSuccess: (_ctx, response) => {
      assertDeliveryDetailEnhancementShape(response.data, 'deliveries.by-id.get')
    },
  })
  cases.push({
    id: 'deliveries.post',
    method: 'POST',
    pathTemplate: '/api/deliveries',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['title'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/deliveries',
      auth: 'superAdmin',
      json: {
        title: `Endpoint Delivery Case ${ctx.fixtures.runId}-${Date.now()}`,
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'deliveries.put',
    method: 'PUT',
    pathTemplate: '/api/deliveries/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/deliveries/${fixtureId(ctx.fixtures.deliveryId)}`,
      auth: 'superAdmin',
      json: {
        status: 'in_progress',
      },
    }),
  })

  // Servers
  cases.push({
    id: 'servers.get',
    method: 'GET',
    pathTemplate: '/api/servers',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/servers',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        environment: 'dev',
      },
    }),
  })
  cases.push({
    id: 'servers.post',
    method: 'POST',
    pathTemplate: '/api/servers',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['name', 'environment', 'productId'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/servers',
      auth: 'superAdmin',
      json: {
        name: `endpoint-server-case-${ctx.fixtures.runId}-${Date.now()}`,
        environment: 'stage',
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'servers.put',
    method: 'PUT',
    pathTemplate: '/api/servers/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/servers/${fixtureId(ctx.fixtures.serverId)}`,
      auth: 'superAdmin',
      json: {
        host: 'localhost',
      },
    }),
  })

  // Releases
  cases.push({
    id: 'releases.get',
    method: 'GET',
    pathTemplate: '/api/releases',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/releases',
      auth: 'superAdmin',
      query: { productId: baseProductId(ctx) },
    }),
  })
  cases.push({
    id: 'releases.paged.get',
    method: 'GET',
    pathTemplate: '/api/releases',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/releases',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        q: 'Endpoint',
        paged: 1,
        limit: 20,
        sort: 'createdAt:desc',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'releases.paged.get')
    },
  })
  cases.push({
    id: 'releases.by-id.get',
    method: 'GET',
    pathTemplate: '/api/releases/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/releases/${fixtureId(ctx.fixtures.releaseId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'releases.post',
    method: 'POST',
    pathTemplate: '/api/releases',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['title'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/releases',
      auth: 'superAdmin',
      json: {
        title: `Endpoint Release Case ${ctx.fixtures.runId}-${Date.now()}`,
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'releases.put',
    method: 'PUT',
    pathTemplate: '/api/releases/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/releases/${fixtureId(ctx.fixtures.releaseId)}`,
      auth: 'superAdmin',
      json: {
        notes: `Updated by endpoint test ${ctx.fixtures.runId}`,
      },
    }),
  })
  cases.push({
    id: 'releases.targets.post',
    method: 'POST',
    pathTemplate: '/api/releases/:id/deployments/:deploymentId/targets',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id', 'deploymentId'],
    requiredQueryParams: [],
    requiredBodyFields: ['serverIds'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/releases/${fixtureId(ctx.fixtures.releaseId)}/deployments/${fixtureId(ctx.fixtures.releaseDeploymentId)}/targets`,
      auth: 'superAdmin',
      json: {
        serverIds: [fixtureId(ctx.fixtures.serverId)],
      },
    }),
    onSuccess: (ctx, response) => {
      const data = response.data
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0] as Record<string, unknown>
        const id = typeof first.id === 'string' ? first.id : ''
        if (id) ctx.fixtures.releaseTargetId = id
      }
    },
  })
  cases.push({
    id: 'releases.targets.put',
    method: 'PUT',
    pathTemplate: '/api/releases/:id/deployments/:deploymentId/targets/:targetId',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id', 'deploymentId', 'targetId'],
    requiredQueryParams: [],
    requiredBodyFields: ['status'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/releases/${fixtureId(ctx.fixtures.releaseId)}/deployments/${fixtureId(ctx.fixtures.releaseDeploymentId)}/targets/${fixtureId(ctx.fixtures.releaseTargetId)}`,
      auth: 'superAdmin',
      json: {
        status: 'deploying',
      },
    }),
  })
  cases.push({
    id: 'releases.deployment.put',
    method: 'PUT',
    pathTemplate: '/api/releases/:id/deployments/:deploymentId',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id', 'deploymentId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/releases/${fixtureId(ctx.fixtures.releaseId)}/deployments/${fixtureId(ctx.fixtures.releaseDeploymentId)}`,
      auth: 'superAdmin',
      json: {
        status: 'deploying',
        notes: 'Endpoint deployment update',
      },
    }),
  })

  // Test cycles
  cases.push({
    id: 'test-cycles.get',
    method: 'GET',
    pathTemplate: '/api/test-cycles',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/test-cycles',
      auth: 'superAdmin',
      query: { productId: baseProductId(ctx) },
    }),
  })
  cases.push({
    id: 'test-cycles.paged.get',
    method: 'GET',
    pathTemplate: '/api/test-cycles',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/test-cycles',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        q: 'Endpoint',
        paged: 1,
        limit: 20,
        sort: 'createdAt:desc',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'test-cycles.paged.get')
    },
  })
  cases.push({
    id: 'test-cycles.by-id.get',
    method: 'GET',
    pathTemplate: '/api/test-cycles/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/test-cycles/${fixtureId(ctx.fixtures.testCycleId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'test-cycles.post',
    method: 'POST',
    pathTemplate: '/api/test-cycles',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['title', 'productId'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/test-cycles',
      auth: 'superAdmin',
      json: {
        title: `Endpoint Cycle Case ${ctx.fixtures.runId}-${Date.now()}`,
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'test-cycles.put',
    method: 'PUT',
    pathTemplate: '/api/test-cycles/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/test-cycles/${fixtureId(ctx.fixtures.testCycleId)}`,
      auth: 'superAdmin',
      json: {
        status: 'in_progress',
      },
    }),
  })
  cases.push({
    id: 'test-cycles.issues.post',
    method: 'POST',
    pathTemplate: '/api/test-cycles/:id/issues',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['title'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/test-cycles/${fixtureId(ctx.fixtures.testCycleId)}/issues`,
      auth: 'superAdmin',
      json: {
        title: `Endpoint issue case ${ctx.fixtures.runId}-${Date.now()}`,
        severity: 'major',
        assignedToTeamId: ctx.fixtures.organizationTeamId ?? null,
      },
    }),
    onSuccess: (ctx, response) => {
      const data = response.data as Record<string, unknown> | null
      const id = data && typeof data.id === 'string' ? data.id : ''
      if (id) ctx.fixtures.testIssueId = id
    },
  })
  cases.push({
    id: 'test-cycles.issues.put',
    method: 'PUT',
    pathTemplate: '/api/test-cycles/:id/issues/:issueId',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id', 'issueId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/test-cycles/${fixtureId(ctx.fixtures.testCycleId)}/issues/${fixtureId(ctx.fixtures.testIssueId)}`,
      auth: 'superAdmin',
      json: {
        status: 'resolved',
        assignedToTeamId: ctx.fixtures.organizationTeamId ?? null,
      },
    }),
  })

  // Feature requests
  cases.push({
    id: 'feature-requests.get',
    method: 'GET',
    pathTemplate: '/api/feature-requests',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/feature-requests',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        sort: 'votes',
      },
    }),
  })
  cases.push({
    id: 'feature-requests.paged.get',
    method: 'GET',
    pathTemplate: '/api/feature-requests',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/feature-requests',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        q: 'Endpoint',
        paged: 1,
        limit: 20,
        sort: 'votes',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'feature-requests.paged.get')
    },
  })
  cases.push({
    id: 'feature-requests.by-id.get',
    method: 'GET',
    pathTemplate: '/api/feature-requests/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/feature-requests/${fixtureId(ctx.fixtures.featureRequestId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'feature-requests.post',
    method: 'POST',
    pathTemplate: '/api/feature-requests',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['productId', 'title'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/feature-requests',
      auth: 'superAdmin',
      json: {
        productId: baseProductId(ctx),
        title: `Endpoint feature request case ${ctx.fixtures.runId}-${Date.now()}`,
      },
    }),
  })
  cases.push({
    id: 'feature-requests.put',
    method: 'PUT',
    pathTemplate: '/api/feature-requests/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/feature-requests/${fixtureId(ctx.fixtures.featureRequestId)}`,
      auth: 'superAdmin',
      json: {
        status: 'in_progress',
      },
    }),
  })
  cases.push({
    id: 'feature-requests.upvote.post',
    method: 'POST',
    pathTemplate: '/api/feature-requests/:id/upvote',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/feature-requests/${fixtureId(ctx.fixtures.featureRequestId)}/upvote`,
      auth: 'superAdmin',
      json: {},
    }),
  })
  cases.push({
    id: 'feature-requests.comments.post',
    method: 'POST',
    pathTemplate: '/api/feature-requests/:id/comments',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['content'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/feature-requests/${fixtureId(ctx.fixtures.featureRequestId)}/comments`,
      auth: 'superAdmin',
      json: {
        content: `Endpoint feature comment ${ctx.fixtures.runId}-${Date.now()}`,
      },
    }),
  })

  // Consumer feedback
  cases.push({
    id: 'consumer-feedbacks.get',
    method: 'GET',
    pathTemplate: '/api/consumer-feedbacks',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/consumer-feedbacks',
      auth: 'superAdmin',
      query: { productId: baseProductId(ctx) },
    }),
  })
  cases.push({
    id: 'consumer-feedbacks.paged.get',
    method: 'GET',
    pathTemplate: '/api/consumer-feedbacks',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/consumer-feedbacks',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        q: 'Endpoint',
        paged: 1,
        limit: 20,
        sort: 'createdAt:desc',
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'consumer-feedbacks.paged.get')
    },
  })
  cases.push({
    id: 'consumer-feedbacks.by-id.get',
    method: 'GET',
    pathTemplate: '/api/consumer-feedbacks/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/consumer-feedbacks/${fixtureId(ctx.fixtures.consumerFeedbackId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'consumer-feedbacks.post',
    method: 'POST',
    pathTemplate: '/api/consumer-feedbacks',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['productId', 'title'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/consumer-feedbacks',
      auth: 'superAdmin',
      json: {
        productId: baseProductId(ctx),
        title: `Endpoint feedback case ${ctx.fixtures.runId}-${Date.now()}`,
      },
    }),
  })
  cases.push({
    id: 'consumer-feedbacks.put',
    method: 'PUT',
    pathTemplate: '/api/consumer-feedbacks/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/consumer-feedbacks/${fixtureId(ctx.fixtures.consumerFeedbackId)}`,
      auth: 'superAdmin',
      json: {
        status: 'investigating',
      },
    }),
  })
  cases.push({
    id: 'consumer-feedbacks.comments.post',
    method: 'POST',
    pathTemplate: '/api/consumer-feedbacks/:id/comments',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['content'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/consumer-feedbacks/${fixtureId(ctx.fixtures.consumerFeedbackId)}/comments`,
      auth: 'superAdmin',
      json: {
        content: `Endpoint internal feedback comment ${ctx.fixtures.runId}-${Date.now()}`,
        isInternal: true,
      },
    }),
  })

  // Roles
  cases.push({
    id: 'roles.permissions.get',
    method: 'GET',
    pathTemplate: '/api/roles/permissions',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/roles/permissions',
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'roles.permissions.put',
    method: 'PUT',
    pathTemplate: '/api/roles/permissions',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['role', 'pages'],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'PUT',
      path: '/api/roles/permissions',
      auth: 'superAdmin',
      json: {
        role: 'developer',
        pages: {
          tasks: { visible: true, canCreate: true, canEdit: true, canDelete: true, selfViewOnly: false },
        },
      },
    }),
  })
  cases.push({
    id: 'roles.my-permissions.get',
    method: 'GET',
    pathTemplate: '/api/roles/my-permissions',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/roles/my-permissions',
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'roles.titles.get',
    method: 'GET',
    pathTemplate: '/api/roles/titles',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/roles/titles',
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'roles.titles.post',
    method: 'POST',
    pathTemplate: '/api/roles/titles',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['name'],
    expectedStatuses: [200, 409],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/roles/titles',
      auth: 'superAdmin',
      json: {
        name: SHARED_ENDPOINT_TITLE_NAME,
        key: SHARED_ENDPOINT_TITLE_KEY,
        description: 'Endpoint-managed title profile',
        baseRole: 'developer',
      },
    }),
    onSuccess: async (ctx, response) => {
      const data = response.data as Record<string, unknown> | null
      const id = data && typeof data.id === 'string' ? data.id : ''
      if (id) {
        ctx.fixtures.titleId = id
        return
      }
      ctx.fixtures.titleId = await resolveSharedTitleId(ctx)
    },
  })
  cases.push({
    id: 'roles.titles.permissions.get',
    method: 'GET',
    pathTemplate: '/api/roles/titles/:id/permissions',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: async (ctx) => ({
      method: 'GET',
      path: `/api/roles/titles/${encodeURIComponent(await resolveSharedTitleId(ctx))}/permissions`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'roles.titles.permissions.put',
    method: 'PUT',
    pathTemplate: '/api/roles/titles/:id/permissions',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['pages'],
    expectedStatuses: [200],
    buildRequest: async (ctx) => ({
      method: 'PUT',
      path: `/api/roles/titles/${encodeURIComponent(await resolveSharedTitleId(ctx))}/permissions`,
      auth: 'superAdmin',
      json: {
        pages: {
          tasks: { visible: true, canCreate: true, canEdit: true, canDelete: false, selfViewOnly: false },
        },
      },
    }),
  })
  cases.push({
    id: 'users.admin.title.put',
    method: 'PUT',
    pathTemplate: '/api/organizations/:organizationId/users-admin/:id/title',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['titleId'],
    expectedStatuses: [200],
    buildRequest: async (ctx) => ({
      method: 'PUT',
      path: `${adminUsersBasePath(ctx)}/${fixtureId(ctx.fixtures.secondaryUserId)}/title`,
      auth: 'superAdmin',
      json: {
        titleId: await resolveSharedTitleId(ctx),
      },
    }),
  })
  cases.push({
    id: 'users.admin.title.clear.put',
    method: 'PUT',
    pathTemplate: '/api/organizations/:organizationId/users-admin/:id/title',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['titleId'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `${adminUsersBasePath(ctx)}/${fixtureId(ctx.fixtures.secondaryUserId)}/title`,
      auth: 'superAdmin',
      json: {
        titleId: null,
      },
    }),
  })

  // Metadata contracts
  cases.push({
    id: 'metadata.pages.get',
    method: 'GET',
    pathTemplate: '/api/metadata/pages',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/metadata/pages',
      auth: 'superAdmin',
    }),
    onSuccess: (_ctx, response) => {
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
        throw new Error('metadata.pages.get expected object response')
      }
      const payload = response.data as Record<string, unknown>
      const pages = Array.isArray(payload.pages) ? payload.pages : null
      const roles = Array.isArray(payload.roles) ? payload.roles : null
      const configurableRoles = Array.isArray(payload.configurableRoles) ? payload.configurableRoles : null
      if (!pages || !roles || !configurableRoles) {
        throw new Error('metadata.pages.get expected pages, roles, and configurableRoles arrays')
      }
      const pageKeys = new Set(
        pages
          .map((entry) => (
            entry && typeof entry === 'object'
              ? (entry as Record<string, unknown>).key
              : null
          ))
          .filter((value): value is string => typeof value === 'string')
      )
      for (const requiredKey of ['home', 'overview', 'stories', 'tasks', 'settings']) {
        if (!pageKeys.has(requiredKey)) {
          throw new Error(`metadata.pages.get missing required page key "${requiredKey}"`)
        }
      }
    },
  })
  cases.push({
    id: 'metadata.routes.get',
    method: 'GET',
    pathTemplate: '/api/metadata/routes',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/metadata/routes',
      auth: 'superAdmin',
    }),
    onSuccess: (_ctx, response) => {
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
        throw new Error('metadata.routes.get expected object response')
      }
      const routes = (response.data as Record<string, unknown>).routes
      if (!Array.isArray(routes)) {
        throw new Error('metadata.routes.get expected routes array')
      }
      const routePrefixSet = new Set(
        routes
          .map((entry) => (
            entry && typeof entry === 'object'
              ? (entry as Record<string, unknown>).pathPrefix
              : null
          ))
          .filter((value): value is string => typeof value === 'string')
      )
      for (const requiredPrefix of ['/dashboard', '/metrics', '/stories', '/backlog', '/settings']) {
        if (!routePrefixSet.has(requiredPrefix)) {
          throw new Error(`metadata.routes.get missing route prefix "${requiredPrefix}"`)
        }
      }
    },
  })
  cases.push({
    id: 'metadata.navigation.get',
    method: 'GET',
    pathTemplate: '/api/metadata/navigation',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/metadata/navigation',
      auth: 'superAdmin',
    }),
    onSuccess: (_ctx, response) => {
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
        throw new Error('metadata.navigation.get expected object response')
      }
      const payload = response.data as Record<string, unknown>
      if (!Array.isArray(payload.mainSidebar) || !Array.isArray(payload.productSections)) {
        throw new Error('metadata.navigation.get expected mainSidebar and productSections arrays')
      }
    },
  })
  cases.push({
    id: 'metadata.enums.get',
    method: 'GET',
    pathTemplate: '/api/metadata/enums',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/metadata/enums',
      auth: 'superAdmin',
    }),
    onSuccess: (_ctx, response) => {
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
        throw new Error('metadata.enums.get expected object response')
      }
      const enums = (response.data as Record<string, unknown>).enums
      if (!enums || typeof enums !== 'object' || Array.isArray(enums)) {
        throw new Error('metadata.enums.get expected enums object')
      }
      const story = (enums as Record<string, unknown>).story as Record<string, unknown> | undefined
      const task = (enums as Record<string, unknown>).task as Record<string, unknown> | undefined
      if (!story || !task) {
        throw new Error('metadata.enums.get missing story/task groups')
      }
      const storyTypes = Array.isArray(story.type) ? story.type : []
      const taskStatuses = Array.isArray(task.status) ? task.status : []
      if (!storyTypes.includes('feature') || !taskStatuses.includes('created')) {
        throw new Error('metadata.enums.get missing expected enum values')
      }
    },
  })
  cases.push({
    id: 'metadata.settings-keys.get',
    method: 'GET',
    pathTemplate: '/api/metadata/settings-keys',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/metadata/settings-keys',
      auth: 'superAdmin',
    }),
    onSuccess: (_ctx, response) => {
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
        throw new Error('metadata.settings-keys.get expected object response')
      }
      const keys = (response.data as Record<string, unknown>).keys
      if (!Array.isArray(keys)) {
        throw new Error('metadata.settings-keys.get expected keys array')
      }
      const keySet = new Set(
        keys
          .map((entry) => (
            entry && typeof entry === 'object'
              ? (entry as Record<string, unknown>).key
              : null
          ))
          .filter((value): value is string => typeof value === 'string')
      )
      if (!keySet.has('tasks-view-mode') || !keySet.has('productier_token')) {
        throw new Error('metadata.settings-keys.get missing required key contracts')
      }
    },
  })
  cases.push({
    id: 'security.metadata.pages.get.unauthorized',
    method: 'GET',
    pathTemplate: '/api/metadata/pages',
    auth: 'none',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [401],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/metadata/pages',
      auth: 'none',
    }),
  })

  // Favorites
  cases.push({
    id: 'favorites.get',
    method: 'GET',
    pathTemplate: '/api/favorites',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/favorites',
      auth: 'superAdmin',
      query: { productId: baseProductId(ctx) },
    }),
  })
  cases.push({
    id: 'favorites.post',
    method: 'POST',
    pathTemplate: '/api/favorites',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['entityType', 'entityId', 'productId'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/favorites',
      auth: 'superAdmin',
      json: {
        entityType: 'story',
        entityId: fixtureId(ctx.fixtures.storyId),
        productId: baseProductId(ctx),
      },
    }),
  })

  // Settings
  cases.push({
    id: 'settings.by-key.get',
    method: 'GET',
    pathTemplate: '/api/settings/:key',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['key'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/settings/theme',
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'settings.get',
    method: 'GET',
    pathTemplate: '/api/settings',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/settings',
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'settings.put',
    method: 'PUT',
    pathTemplate: '/api/settings/:key',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['key'],
    requiredQueryParams: [],
    requiredBodyFields: ['value'],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'PUT',
      path: '/api/settings/theme',
      auth: 'superAdmin',
      json: { value: 'light' },
    }),
  })

  // Wiki
  cases.push({
    id: 'wiki.types.get',
    method: 'GET',
    pathTemplate: '/api/wiki/types',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/wiki/types',
      auth: 'superAdmin',
      query: { productId: baseProductId(ctx) },
    }),
  })
  cases.push({
    id: 'wiki.types.post',
    method: 'POST',
    pathTemplate: '/api/wiki/types',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['name', 'productId'],
    expectedStatuses: [200, 409],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/wiki/types',
      auth: 'superAdmin',
      json: {
        name: 'Endpoint Fixture Type',
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'wiki.assets.get',
    method: 'GET',
    pathTemplate: '/api/wiki/assets',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/wiki/assets',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        search: 'Endpoint',
      },
    }),
  })
  cases.push({
    id: 'wiki.assets.by-id.get',
    method: 'GET',
    pathTemplate: '/api/wiki/assets/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/wiki/assets/${fixtureId(ctx.fixtures.wikiAssetId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'wiki.assets.post',
    method: 'POST',
    pathTemplate: '/api/wiki/assets',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['productId', 'assetTypeId', 'title'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/wiki/assets',
      auth: 'superAdmin',
      json: {
        productId: baseProductId(ctx),
        assetTypeId: fixtureId(ctx.fixtures.wikiTypeId),
        title: `Endpoint Wiki Asset Case ${ctx.fixtures.runId}-${Date.now()}`,
      },
    }),
  })
  cases.push({
    id: 'wiki.assets.put',
    method: 'PUT',
    pathTemplate: '/api/wiki/assets/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/wiki/assets/${fixtureId(ctx.fixtures.wikiAssetId)}`,
      auth: 'superAdmin',
      json: {
        description: 'Updated by endpoint tests',
      },
    }),
  })
  cases.push({
    id: 'wiki.relations.post',
    method: 'POST',
    pathTemplate: '/api/wiki/assets/:id/relations',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['targetAssetId'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/wiki/assets/${fixtureId(ctx.fixtures.wikiAssetId)}/relations`,
      auth: 'superAdmin',
      json: {
        targetAssetId: fixtureId(ctx.fixtures.wikiAssetId2),
        relationType: 'depends_on',
      },
    }),
    onSuccess: (ctx, response) => {
      const data = response.data as Record<string, unknown> | null
      const id = data && typeof data.id === 'string' ? data.id : ''
      if (id) ctx.fixtures.wikiRelationId = id
    },
  })

  // Deletes (kept near end to avoid breaking earlier dependencies)
  cases.push({
    id: 'stories.comments.delete',
    method: 'DELETE',
    pathTemplate: '/api/stories/:id/comments/:commentId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id', 'commentId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/stories/${fixtureId(ctx.fixtures.storyId)}/comments/${fixtureId(ctx.fixtures.storyCommentId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'tasks.comments.delete',
    method: 'DELETE',
    pathTemplate: '/api/tasks/comments/:commentId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['commentId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/tasks/comments/${fixtureId(ctx.fixtures.taskCommentId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'tasks.attachments.delete',
    method: 'DELETE',
    pathTemplate: '/api/tasks/attachments/:attachmentId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['attachmentId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/tasks/attachments/${fixtureId(ctx.fixtures.taskAttachmentId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'releases.targets.delete',
    method: 'DELETE',
    pathTemplate: '/api/releases/:id/deployments/:deploymentId/targets/:targetId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id', 'deploymentId', 'targetId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/releases/${fixtureId(ctx.fixtures.releaseId)}/deployments/${fixtureId(ctx.fixtures.releaseDeploymentId)}/targets/${fixtureId(ctx.fixtures.releaseTargetId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'wiki.relations.delete',
    method: 'DELETE',
    pathTemplate: '/api/wiki/assets/:id/relations/:relationId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id', 'relationId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/wiki/assets/${fixtureId(ctx.fixtures.wikiAssetId)}/relations/${fixtureId(ctx.fixtures.wikiRelationId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'feature-requests.delete',
    method: 'DELETE',
    pathTemplate: '/api/feature-requests/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/feature-requests/${fixtureId(ctx.fixtures.featureRequestId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'consumer-feedbacks.delete',
    method: 'DELETE',
    pathTemplate: '/api/consumer-feedbacks/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/consumer-feedbacks/${fixtureId(ctx.fixtures.consumerFeedbackId)}`,
      auth: 'superAdmin',
    }),
  })

  // Users admin
  cases.push({
    id: 'users.admin.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/users-admin',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: adminUsersBasePath(ctx),
      auth: 'superAdmin',
      query: { q: 'endpoint' },
    }),
  })
  cases.push({
    id: 'users.admin.by-id.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/users-admin/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `${adminUsersBasePath(ctx)}/${resolveAdminManagedUserId(ctx)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'users.admin.memberships.get',
    method: 'GET',
    pathTemplate: '/api/organizations/:organizationId/users-admin/:id/memberships',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `${adminUsersBasePath(ctx)}/${resolveAdminManagedUserId(ctx)}/memberships`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'users.admin.role.put',
    method: 'PUT',
    pathTemplate: '/api/organizations/:organizationId/users-admin/:id/role',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['role'],
    expectedStatuses: [200],
    buildRequest: (ctx) => {
      const targetUserId = resolveAdminManagedUserId(ctx)
      const superAdminUserId = fixtureId(ctx.sessions.superAdmin.userId)
      return {
        method: 'PUT',
        path: `${adminUsersBasePath(ctx)}/${targetUserId}/role`,
        auth: 'superAdmin',
        json: {
          role: targetUserId === superAdminUserId ? 'super_admin' : 'developer',
        },
      }
    },
  })
  cases.push({
    id: 'users.admin.status.put',
    method: 'PUT',
    pathTemplate: '/api/organizations/:organizationId/users-admin/:id/status',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: ['isActive'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `${adminUsersBasePath(ctx)}/${resolveAdminManagedUserId(ctx)}/status`,
      auth: 'superAdmin',
      json: {
        isActive: true,
      },
    }),
  })

  // Standalone issues
  cases.push({
    id: 'issues.get',
    method: 'GET',
    pathTemplate: '/api/issues',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/issues',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        source: 'standalone',
      },
    }),
  })
  cases.push({
    id: 'issues.paged.get',
    method: 'GET',
    pathTemplate: '/api/issues',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId', 'paged', 'limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/issues',
      auth: 'superAdmin',
      query: {
        productId: baseProductId(ctx),
        source: 'standalone',
        paged: 1,
        limit: 20,
      },
    }),
    onSuccess: (_ctx, response) => {
      assertListEnvelope(response, 'issues.paged.get')
    },
  })
  cases.push({
    id: 'issues.post',
    method: 'POST',
    pathTemplate: '/api/issues',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['title', 'productId'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/issues',
      auth: 'superAdmin',
      json: {
        productId: baseProductId(ctx),
        title: `Endpoint standalone issue ${ctx.fixtures.runId}-${Date.now()}`,
        description: 'Created by endpoint test suite',
        severity: 'major',
        source: 'standalone',
        assignedToTeamId: ctx.fixtures.organizationTeamId ?? null,
      },
    }),
    onSuccess: (ctx, response) => {
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) return
      const issueId = (response.data as Record<string, unknown>).id
      if (typeof issueId === 'string' && issueId.length > 0) {
        ctx.fixtures.issueId = issueId
      }
    },
  })
  cases.push({
    id: 'issues.put',
    method: 'PUT',
    pathTemplate: '/api/issues/:id',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: `/api/issues/${fixtureId(ctx.fixtures.issueId)}`,
      auth: 'superAdmin',
      json: {
        status: 'in_progress',
        assignedToTeamId: ctx.fixtures.organizationTeamId ?? null,
        resolutionSummary: `Updated by endpoint test ${ctx.fixtures.runId}`,
      },
    }),
  })

  // Initiative insights
  cases.push({
    id: 'initiatives.insights.get',
    method: 'GET',
    pathTemplate: '/api/initiatives/:id/insights',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/initiatives/${fixtureId(ctx.fixtures.initiativeId)}/insights`,
      auth: 'superAdmin',
    }),
    onSuccess: (_ctx, response) => {
      assertInitiativeInsightsShape(response.data, 'initiatives.insights.get')
    },
  })

  // Integrations lifecycle foundation
  cases.push({
    id: 'integrations.catalog.get',
    method: 'GET',
    pathTemplate: '/api/integrations/catalog',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/integrations/catalog',
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'integrations.connections.get',
    method: 'GET',
    pathTemplate: '/api/integrations/connections',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: ['productId'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/integrations/connections',
      auth: 'superAdmin',
      query: { productId: baseProductId(ctx) },
    }),
  })
  cases.push({
    id: 'integrations.connect.post',
    method: 'POST',
    pathTemplate: '/api/integrations/:connector/connect',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['connector'],
    requiredQueryParams: [],
    requiredBodyFields: ['productId'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/integrations/jira/connect',
      auth: 'superAdmin',
      json: {
        productId: baseProductId(ctx),
        displayName: `Endpoint Jira ${ctx.fixtures.runId}`,
        metadata: { foundationOnly: true, projectKey: `EP-${ctx.fixtures.runId}` },
        credentials: { token: `endpoint-${ctx.fixtures.runId}` },
      },
    }),
    onSuccess: (ctx, response) => {
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) return
      const connectionId = (response.data as Record<string, unknown>).id
      if (typeof connectionId === 'string' && connectionId.length > 0) {
        ctx.fixtures.integrationConnectionId = connectionId
      }
    },
  })
  cases.push({
    id: 'integrations.test.post',
    method: 'POST',
    pathTemplate: '/api/integrations/:connectionId/test',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['connectionId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/integrations/${fixtureId(ctx.fixtures.integrationConnectionId)}/test`,
      auth: 'superAdmin',
    }),
    onSuccess: (ctx, response) => {
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) return
      const runId = (response.data as Record<string, unknown>).id
      if (typeof runId === 'string' && runId.length > 0) {
        ctx.fixtures.integrationRunId = runId
      }
    },
  })
  cases.push({
    id: 'integrations.sync.post',
    method: 'POST',
    pathTemplate: '/api/integrations/:connectionId/sync',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['connectionId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/integrations/${fixtureId(ctx.fixtures.integrationConnectionId)}/sync`,
      auth: 'superAdmin',
    }),
    onSuccess: (ctx, response) => {
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) return
      const runId = (response.data as Record<string, unknown>).id
      if (typeof runId === 'string' && runId.length > 0) {
        ctx.fixtures.integrationRunId = runId
      }
    },
  })
  cases.push({
    id: 'integrations.sync-runs.get',
    method: 'GET',
    pathTemplate: '/api/integrations/:connectionId/sync-runs',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['connectionId'],
    requiredQueryParams: ['limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/integrations/${fixtureId(ctx.fixtures.integrationConnectionId)}/sync-runs`,
      auth: 'superAdmin',
      query: { limit: 20 },
    }),
    onSuccess: (ctx, response) => {
      const runs = Array.isArray(response.data) ? response.data as Array<Record<string, unknown>> : []
      const firstRunId = runs.length > 0 ? runs[0]?.id : null
      if (typeof firstRunId === 'string' && firstRunId.length > 0) {
        ctx.fixtures.integrationRunId = firstRunId
      }
    },
  })
  cases.push({
    id: 'integrations.sync-events.get',
    method: 'GET',
    pathTemplate: '/api/integrations/sync-runs/:runId/events',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['runId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/integrations/sync-runs/${fixtureId(ctx.fixtures.integrationRunId)}/events`,
      auth: 'superAdmin',
    }),
  })

  // Wiki revisions
  cases.push({
    id: 'wiki.revisions.get',
    method: 'GET',
    pathTemplate: '/api/wiki/assets/:id/revisions',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: ['limit'],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/wiki/assets/${fixtureId(ctx.fixtures.wikiAssetId)}/revisions`,
      auth: 'superAdmin',
      query: { limit: 20 },
    }),
    onSuccess: (ctx, response) => {
      const revisions = Array.isArray(response.data) ? response.data as Array<Record<string, unknown>> : []
      const firstRevisionId = revisions.length > 0 ? revisions[0]?.id : null
      if (typeof firstRevisionId === 'string' && firstRevisionId.length > 0) {
        ctx.fixtures.wikiRevisionId = firstRevisionId
      }
    },
  })
  cases.push({
    id: 'wiki.revision.diff.get',
    method: 'GET',
    pathTemplate: '/api/wiki/assets/:id/revisions/:revisionId/diff',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id', 'revisionId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: `/api/wiki/assets/${fixtureId(ctx.fixtures.wikiAssetId)}/revisions/${fixtureId(ctx.fixtures.wikiRevisionId)}/diff`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'wiki.revision.restore.post',
    method: 'POST',
    pathTemplate: '/api/wiki/assets/:id/revisions/:revisionId/restore',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: ['id', 'revisionId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: `/api/wiki/assets/${fixtureId(ctx.fixtures.wikiAssetId)}/revisions/${fixtureId(ctx.fixtures.wikiRevisionId)}/restore`,
      auth: 'superAdmin',
      json: {
        changeSummary: `Endpoint restore ${ctx.fixtures.runId}`,
      },
    }),
  })

  cases.push({
    id: 'issues.delete',
    method: 'DELETE',
    pathTemplate: '/api/issues/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/issues/${fixtureId(ctx.fixtures.issueId)}`,
      auth: 'superAdmin',
    }),
  })

  cases.push({
    id: 'test-cycles.issues.delete',
    method: 'DELETE',
    pathTemplate: '/api/test-cycles/:id/issues/:issueId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id', 'issueId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/test-cycles/${fixtureId(ctx.fixtures.testCycleId)}/issues/${fixtureId(ctx.fixtures.testIssueId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'products.members.delete',
    method: 'DELETE',
    pathTemplate: '/api/products/:productId/members/:userId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['productId', 'userId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/products/${encodedProductId(ctx)}/members/${fixtureId(ctx.fixtures.productMemberUserId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'favorites.delete',
    method: 'DELETE',
    pathTemplate: '/api/favorites/:entityType/:entityId',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['entityType', 'entityId'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/favorites/${ctx.fixtures.favoriteEntityType ?? 'story'}/${fixtureId(ctx.fixtures.favoriteEntityId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'wiki.assets.delete',
    method: 'DELETE',
    pathTemplate: '/api/wiki/assets/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/wiki/assets/${fixtureId(ctx.fixtures.wikiAssetId2)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'servers.delete',
    method: 'DELETE',
    pathTemplate: '/api/servers/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/servers/${fixtureId(ctx.fixtures.serverId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'tasks.delete',
    method: 'DELETE',
    pathTemplate: '/api/tasks/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/tasks/${fixtureId(ctx.fixtures.taskId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'stories.delete',
    method: 'DELETE',
    pathTemplate: '/api/stories/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/stories/${fixtureId(ctx.fixtures.storyId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'test-cycles.delete',
    method: 'DELETE',
    pathTemplate: '/api/test-cycles/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/test-cycles/${fixtureId(ctx.fixtures.testCycleId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'releases.delete',
    method: 'DELETE',
    pathTemplate: '/api/releases/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/releases/${fixtureId(ctx.fixtures.releaseId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'deliveries.delete',
    method: 'DELETE',
    pathTemplate: '/api/deliveries/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/deliveries/${fixtureId(ctx.fixtures.deliveryId)}`,
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'initiatives.delete',
    method: 'DELETE',
    pathTemplate: '/api/initiatives/:id',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: ['id'],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'DELETE',
      path: `/api/initiatives/${fixtureId(ctx.fixtures.initiativeId)}`,
      auth: 'superAdmin',
    }),
  })

  // Notifications
  cases.push({
    id: 'notifications.inbox.get',
    method: 'GET',
    pathTemplate: '/api/notifications',
    auth: 'user',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/notifications',
      auth: 'user',
      query: {
        productId: baseProductId(ctx),
        limit: 20,
      },
    }),
  })
  cases.push({
    id: 'notifications.inbox.filtered.get',
    method: 'GET',
    pathTemplate: '/api/notifications',
    auth: 'user',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/notifications',
      auth: 'user',
      query: {
        productId: baseProductId(ctx),
        category: 'assignment',
        urgency: 'action_required',
        entityType: 'task',
        type: 'task.updated.assignment',
        unreadOnly: 'true',
        limit: 20,
      },
    }),
  })
  cases.push({
    id: 'notifications.unread-count.get',
    method: 'GET',
    pathTemplate: '/api/notifications/unread-count',
    auth: 'user',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'GET',
      path: '/api/notifications/unread-count',
      auth: 'user',
      query: {
        productId: baseProductId(ctx),
      },
    }),
  })
  cases.push({
    id: 'notifications.read-all.post',
    method: 'POST',
    pathTemplate: '/api/notifications/read-all',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/notifications/read-all',
      auth: 'user',
      json: {
        productId: baseProductId(ctx),
        category: 'assignment',
        urgency: 'action_required',
        entityType: 'task',
        type: 'task.updated.assignment',
      },
    }),
  })
  cases.push({
    id: 'notifications.read.post',
    method: 'POST',
    pathTemplate: '/api/notifications/read',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['ids'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/notifications/read',
      auth: 'user',
      json: {
        ids: [fixtureId(ctx.fixtures.storyId)],
      },
    }),
  })
  cases.push({
    id: 'notifications.archive.post',
    method: 'POST',
    pathTemplate: '/api/notifications/archive',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['ids'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/notifications/archive',
      auth: 'user',
      json: {
        ids: [fixtureId(ctx.fixtures.taskId)],
      },
    }),
  })
  cases.push({
    id: 'notifications.archive-all.post',
    method: 'POST',
    pathTemplate: '/api/notifications/archive-all',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/notifications/archive-all',
      auth: 'user',
      json: {
        productId: baseProductId(ctx),
        category: 'assignment',
        urgency: 'action_required',
        entityType: 'task',
        type: 'task.updated.assignment',
      },
    }),
  })
  cases.push({
    id: 'notifications.mute.post',
    method: 'POST',
    pathTemplate: '/api/notifications/mute',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['ids'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/notifications/mute',
      auth: 'user',
      json: {
        ids: [fixtureId(ctx.fixtures.initiativeId)],
      },
    }),
  })
  cases.push({
    id: 'notifications.unmute.post',
    method: 'POST',
    pathTemplate: '/api/notifications/unmute',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['ids'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/notifications/unmute',
      auth: 'user',
      json: {
        ids: [fixtureId(ctx.fixtures.initiativeId)],
      },
    }),
  })
  cases.push({
    id: 'notifications.snooze.post',
    method: 'POST',
    pathTemplate: '/api/notifications/snooze',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['ids', 'untilAt'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/notifications/snooze',
      auth: 'user',
      json: {
        ids: [fixtureId(ctx.fixtures.deliveryId)],
        untilAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    }),
  })
  cases.push({
    id: 'notifications.unsnooze.post',
    method: 'POST',
    pathTemplate: '/api/notifications/unsnooze',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['ids'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/notifications/unsnooze',
      auth: 'user',
      json: {
        ids: [fixtureId(ctx.fixtures.deliveryId)],
      },
    }),
  })
  cases.push({
    id: 'notifications.preferences.get',
    method: 'GET',
    pathTemplate: '/api/notifications/preferences',
    auth: 'user',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/notifications/preferences',
      auth: 'user',
    }),
  })
  cases.push({
    id: 'notifications.preferences.put',
    method: 'PUT',
    pathTemplate: '/api/notifications/preferences',
    auth: 'user',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['preferences'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'PUT',
      path: '/api/notifications/preferences',
      auth: 'user',
      json: {
        productId: baseProductId(ctx),
        preferences: [
          {
            category: 'workflow',
            inAppEnabled: true,
            emailEnabled: false,
            slackEnabled: true,
            minimumSeverity: 'low',
            quietHoursStart: null,
            quietHoursEnd: null,
          },
        ],
      },
    }),
  })
  cases.push({
    id: 'notifications.admin.stats.get',
    method: 'GET',
    pathTemplate: '/api/notifications/admin/stats',
    auth: 'superAdmin',
    contentType: 'none',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: [],
    expectedStatuses: [200],
    buildRequest: () => ({
      method: 'GET',
      path: '/api/notifications/admin/stats',
      auth: 'superAdmin',
    }),
  })
  cases.push({
    id: 'notifications.admin.publish.post',
    method: 'POST',
    pathTemplate: '/api/notifications/admin/publish',
    auth: 'superAdmin',
    contentType: 'json',
    requiredPathParams: [],
    requiredQueryParams: [],
    requiredBodyFields: ['productId', 'action'],
    expectedStatuses: [200],
    buildRequest: (ctx) => ({
      method: 'POST',
      path: '/api/notifications/admin/publish',
      auth: 'superAdmin',
      json: {
        productId: baseProductId(ctx),
        action: 'updated',
        entityType: 'task',
        entityId: `${ctx.fixtures.runId}-task-notification`,
        entityTitle: `Endpoint notifications smoke ${ctx.fixtures.runId}`,
        message: 'Endpoint docs harness notification smoke check',
        recipientUserIds: [fixtureId(ctx.fixtures.primaryUserId)],
        subjectUserIds: [fixtureId(ctx.fixtures.primaryUserId)],
      },
    }),
  })

  return cases
}
