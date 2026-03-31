import { Elysia, t } from 'elysia'
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm'
import { db } from '../db'
import {
  dashboardPageViewers,
  dashboardPages,
  dashboardTemplatePages,
  dashboardTemplates,
  dashboardTemplateWidgets,
  dashboardWidgets,
  organizationMembers,
  productMembers,
  products,
} from '../db/schema'
import {
  getSystemDashboardTemplateById,
  listSystemDashboardTemplates,
  type DashboardTemplatePageBlueprint,
  type DashboardTemplateScopeType,
  type DashboardTemplateVisibility as CatalogTemplateVisibility,
} from '../lib/dashboardTemplateCatalog'
import { authPlugin } from '../plugins/auth'
import {
  isGlobalAdminRole,
  requireAuth,
  requirePageAction,
  requireProductAccess,
  type AuthenticatedUser,
} from '../lib/authz'
import { isMissingColumnError, isSchemaMismatchError } from '../lib/schemaMismatch'

type DashboardScopeType = 'product' | 'workspace'
type DashboardVisibility = 'personal' | 'team' | 'invited'
type DashboardViewerAccessRole = 'viewer' | 'editor'
type DashboardTemplateVisibility = 'personal' | 'team'
type TemplateSource = 'system' | 'user'
type TemplateApplyMode = 'append' | 'replace_custom'
type PageAction = 'read' | 'edit' | 'create'
type RouteSet = { status?: number | string }

interface ScopeAccess {
  user: AuthenticatedUser
  scopeType: DashboardScopeType
  scopeRefId: string
  pageKey: 'overview' | 'home'
  canEditTeamWide: boolean
  canApplyTemplates: boolean
}

interface PageAccessContext extends ScopeAccess {
  page: typeof dashboardPages.$inferSelect
  invited: boolean
  invitedRole: DashboardViewerAccessRole | null
  canEditPage: boolean
}

interface UserTemplateRecord {
  id: string
  scopeType: DashboardScopeType
  scopeRefId: string
  name: string
  slug: string
  description: string | null
  source: TemplateSource
  visibility: DashboardTemplateVisibility
  ownerUserId: string | null
  createdByUserId: string
  updatedByUserId: string | null
  createdAt: Date
  updatedAt: Date
  pages: TemplatePageRecord[]
}

interface TemplatePageRecord {
  id: string
  templateId?: string
  name: string
  slug: string
  visibility: DashboardTemplateVisibility
  sortOrder: number
  widgets: TemplateWidgetRecord[]
}

interface TemplateWidgetRecord {
  id: string
  templatePageId?: string
  widgetType: string
  widgetTitle: string | null
  configJson: Record<string, unknown>
  gridX: number
  gridY: number
  gridW: number
  gridH: number
  sortOrder: number
}

interface TemplateResponseItem {
  id: string
  scopeType: DashboardScopeType
  scopeRefId: string
  name: string
  slug: string
  description: string | null
  source: TemplateSource
  visibility: DashboardTemplateVisibility
  ownerUserId: string | null
  canEdit: boolean
  canDelete: boolean
  pages: Array<{
    name: string
    slug: string
    visibility: DashboardTemplateVisibility
    sortOrder: number
    widgets: Array<{
      widgetType: string
      widgetTitle: string | null
      configJson: Record<string, unknown>
      gridX: number
      gridY: number
      gridW: number
      gridH: number
      sortOrder: number
    }>
  }>
}

function normalizeName(input: unknown): string {
  return String(input || '').trim()
}

function normalizeSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'dashboard'
}

function normalizeUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const deduped = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = item.trim()
    if (!normalized) continue
    deduped.add(normalized)
  }
  return [...deduped]
}

function normalizeViewerRole(value: unknown): DashboardViewerAccessRole {
  return String(value || '').trim().toLowerCase() === 'editor' ? 'editor' : 'viewer'
}

function isMissingAccessRoleColumnError(error: unknown): boolean {
  if (isMissingColumnError(error, 'access_role')) return true
  if (!isSchemaMismatchError(error)) return false
  const message = String((error as { message?: unknown }).message || '').toLowerCase()
  return message.includes('access_role') && message.includes('does not exist')
}

function normalizeViewerAssignments(
  value: unknown,
): Array<{ userId: string; role: DashboardViewerAccessRole }> {
  if (!Array.isArray(value)) return []
  const normalized = new Map<string, DashboardViewerAccessRole>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const userId = String(candidate.userId || candidate.id || '').trim()
    if (!userId) continue
    normalized.set(userId, normalizeViewerRole(candidate.role))
  }
  return [...normalized.entries()].map(([userId, role]) => ({ userId, role }))
}

function mergeViewerAssignments(
  sharedUserIds: unknown,
  viewers: unknown,
): Array<{ userId: string; role: DashboardViewerAccessRole }> {
  const merged = new Map<string, DashboardViewerAccessRole>()
  for (const userId of normalizeUserIds(sharedUserIds)) {
    merged.set(userId, 'viewer')
  }
  for (const viewer of normalizeViewerAssignments(viewers)) {
    merged.set(viewer.userId, viewer.role)
  }
  return [...merged.entries()].map(([userId, role]) => ({ userId, role }))
}

function sanitizeGridSize(value: unknown, fallback: number): number {
  const num = Number(value)
  if (!Number.isInteger(num)) return fallback
  if (num < 1 || num > 2) return fallback
  return num
}

function sanitizeGridAxis(value: unknown, fallback: number): number {
  const num = Number(value)
  if (!Number.isInteger(num) || num < 0) return fallback
  return num
}

function canReadPageRecord(
  page: typeof dashboardPages.$inferSelect,
  userId: string,
  invitedRole: DashboardViewerAccessRole | null,
): boolean {
  if (page.visibility === 'team') return true
  if (page.ownerUserId === userId) return true
  return invitedRole !== null
}

function canEditPageRecord(
  page: typeof dashboardPages.$inferSelect,
  userId: string,
  canEditTeamWide: boolean,
  invitedRole: DashboardViewerAccessRole | null = null,
): boolean {
  if (page.visibility === 'team') return canEditTeamWide
  if (page.ownerUserId === userId) return true
  if (page.visibility === 'invited' && invitedRole === 'editor') return true
  return false
}

async function hasPageAction(
  user: AuthenticatedUser,
  page: 'overview' | 'home',
  action: PageAction,
): Promise<boolean> {
  const localSet = { status: 200 } as { status: number }
  return requirePageAction(user, localSet, page, action)
}

async function resolveWorkspaceScopeId(
  user: AuthenticatedUser,
  requestedOrganizationId: string | undefined,
  set: RouteSet,
): Promise<string | null> {
  const explicitOrgId = String(requestedOrganizationId || '').trim()
  if (explicitOrgId) {
    if (isGlobalAdminRole(user.role)) {
      return explicitOrgId
    }
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, explicitOrgId),
        eq(organizationMembers.userId, user.id),
      ),
      columns: { id: true },
    })
    if (!membership) {
      set.status = 403
      return null
    }
    return explicitOrgId
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, user.id),
    columns: { organizationId: true },
    orderBy: (items, { asc: orderAsc }) => [orderAsc(items.joinedAt)],
  })
  if (membership?.organizationId) return membership.organizationId

  if (isGlobalAdminRole(user.role)) {
    const firstProduct = await db.query.products.findFirst({
      columns: { organizationId: true },
      orderBy: (items, { asc: orderAsc }) => [orderAsc(items.name)],
    })
    if (firstProduct?.organizationId) return firstProduct.organizationId
  }

  set.status = 400
  return null
}

async function resolveScopeAccessFromQuery(
  query: Record<string, string | undefined>,
  jwtVerify: (token: string) => Promise<unknown>,
  headers: Record<string, string | undefined>,
  set: RouteSet,
): Promise<ScopeAccess | null> {
  const scopeType = String(query.scopeType || '').trim() as DashboardScopeType

  if (scopeType === 'product') {
    const productId = String(query.productId || '').trim()
    if (!productId) {
      set.status = 400
      return null
    }

    const access = await requireProductAccess(jwtVerify, headers, set, productId)
    if (!access) return null

    const canRead = await hasPageAction(access.user, 'overview', 'read')
    if (!canRead) {
      set.status = 403
      return null
    }

    const canEditTeamWide = await hasPageAction(access.user, 'overview', 'edit')
    const canApplyTemplates = await hasPageAction(access.user, 'overview', 'create')

    return {
      user: access.user,
      scopeType,
      scopeRefId: productId,
      pageKey: 'overview',
      canEditTeamWide,
      canApplyTemplates,
    }
  }

  if (scopeType === 'workspace') {
    const user = await requireAuth(jwtVerify, headers, set)
    if (!user) return null

    const canRead = await hasPageAction(user, 'home', 'read')
    if (!canRead) {
      set.status = 403
      return null
    }

    const scopeRefId = await resolveWorkspaceScopeId(user, query.organizationId, set)
    if (!scopeRefId) return null

    if (!isGlobalAdminRole(user.role)) {
      const membership = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, scopeRefId),
          eq(organizationMembers.userId, user.id),
        ),
        columns: { id: true },
      })
      if (!membership) {
        set.status = 403
        return null
      }
    }

    const canEditTeamWide = await hasPageAction(user, 'home', 'edit')
    const canApplyTemplates = await hasPageAction(user, 'home', 'create')

    return {
      user,
      scopeType,
      scopeRefId,
      pageKey: 'home',
      canEditTeamWide,
      canApplyTemplates,
    }
  }

  set.status = 400
  return null
}

async function resolveScopeAccessFromPage(
  page: typeof dashboardPages.$inferSelect,
  jwtVerify: (token: string) => Promise<unknown>,
  headers: Record<string, string | undefined>,
  set: RouteSet,
): Promise<ScopeAccess | null> {
  if (page.scopeType === 'product') {
    const access = await requireProductAccess(jwtVerify, headers, set, page.scopeRefId)
    if (!access) return null
    const canRead = await hasPageAction(access.user, 'overview', 'read')
    if (!canRead) {
      set.status = 403
      return null
    }
    const canEditTeamWide = await hasPageAction(access.user, 'overview', 'edit')
    const canApplyTemplates = await hasPageAction(access.user, 'overview', 'create')
    return {
      user: access.user,
      scopeType: 'product',
      scopeRefId: page.scopeRefId,
      pageKey: 'overview',
      canEditTeamWide,
      canApplyTemplates,
    }
  }

  const user = await requireAuth(jwtVerify, headers, set)
  if (!user) return null

  const canRead = await hasPageAction(user, 'home', 'read')
  if (!canRead) {
    set.status = 403
    return null
  }

  if (!isGlobalAdminRole(user.role)) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, page.scopeRefId),
        eq(organizationMembers.userId, user.id),
      ),
      columns: { id: true },
    })
    if (!membership) {
      set.status = 403
      return null
    }
  }

  const canEditTeamWide = await hasPageAction(user, 'home', 'edit')
  const canApplyTemplates = await hasPageAction(user, 'home', 'create')
  return {
    user,
    scopeType: 'workspace',
    scopeRefId: page.scopeRefId,
    pageKey: 'home',
    canEditTeamWide,
    canApplyTemplates,
  }
}

async function ensureViewerCandidatesInScope(
  scopeType: DashboardScopeType,
  scopeRefId: string,
  userIds: string[],
  set: RouteSet,
): Promise<boolean> {
  if (userIds.length === 0) return true

  if (scopeType === 'product') {
    const rows = await db.query.productMembers.findMany({
      where: and(
        eq(productMembers.productId, scopeRefId),
        inArray(productMembers.userId, userIds),
      ),
      columns: { userId: true },
    })
    const allowed = new Set(rows.map((row) => row.userId))
    const invalid = userIds.some((userId) => !allowed.has(userId))
    if (invalid) {
      set.status = 400
      return false
    }
    return true
  }

  const rows = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, scopeRefId),
      inArray(organizationMembers.userId, userIds),
    ),
    columns: { userId: true },
  })
  const allowed = new Set(rows.map((row) => row.userId))
  const invalid = userIds.some((userId) => !allowed.has(userId))
  if (invalid) {
    set.status = 400
    return false
  }
  return true
}

async function buildUniqueSlug(
  scopeType: DashboardScopeType,
  scopeRefId: string,
  name: string,
  currentPageId?: string,
): Promise<string> {
  const base = normalizeSlug(name)
  const rows = await db.select({
    id: dashboardPages.id,
    slug: dashboardPages.slug,
  }).from(dashboardPages).where(and(
    eq(dashboardPages.scopeType, scopeType),
    eq(dashboardPages.scopeRefId, scopeRefId),
  ))
  const blocked = new Set(
    rows
      .filter((row) => !currentPageId || row.id !== currentPageId)
      .map((row) => row.slug),
  )

  if (!blocked.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!blocked.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

async function getNextPageSortOrder(scopeType: DashboardScopeType, scopeRefId: string): Promise<number> {
  const maxRow = await db.select({
    sortOrder: dashboardPages.sortOrder,
  }).from(dashboardPages)
    .where(and(
      eq(dashboardPages.scopeType, scopeType),
      eq(dashboardPages.scopeRefId, scopeRefId),
    ))
    .orderBy(desc(dashboardPages.sortOrder))
    .limit(1)

  return (maxRow[0]?.sortOrder ?? -10) + 10
}

function normalizeTemplateDescription(input: unknown): string | null {
  const value = String(input || '').trim()
  if (!value) return null
  return value.slice(0, 1000)
}

function normalizeTemplateVisibility(value: unknown): DashboardTemplateVisibility {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'team' ? 'team' : 'personal'
}

function canReadTemplateRecord(
  template: Pick<typeof dashboardTemplates.$inferSelect, 'visibility' | 'ownerUserId'>,
  userId: string,
): boolean {
  return template.visibility === 'team' || template.ownerUserId === userId
}

function canEditTemplateRecord(
  template: Pick<typeof dashboardTemplates.$inferSelect, 'source' | 'visibility' | 'ownerUserId'>,
  userId: string,
  canEditTeamWide: boolean,
): boolean {
  if (template.source === 'system') return false
  if (template.visibility === 'team') return canEditTeamWide
  return template.ownerUserId === userId
}

async function requireScopeEditCapability(scope: ScopeAccess, set: RouteSet): Promise<boolean> {
  if (scope.canEditTeamWide) return true
  set.status = 403
  return false
}

async function requireScopeTemplateApplyCapability(scope: ScopeAccess, set: RouteSet): Promise<boolean> {
  if (scope.canApplyTemplates) return true
  set.status = 403
  return false
}

async function buildUniqueTemplateSlug(
  scopeType: DashboardScopeType,
  scopeRefId: string,
  name: string,
  currentTemplateId?: string,
): Promise<string> {
  const base = normalizeSlug(name)
  const rows = await db.select({
    id: dashboardTemplates.id,
    slug: dashboardTemplates.slug,
  }).from(dashboardTemplates).where(and(
    eq(dashboardTemplates.scopeType, scopeType),
    eq(dashboardTemplates.scopeRefId, scopeRefId),
    eq(dashboardTemplates.source, 'user'),
  ))

  const blocked = new Set(
    rows
      .filter((row) => !currentTemplateId || row.id !== currentTemplateId)
      .map((row) => row.slug),
  )

  if (!blocked.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!blocked.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

async function loadTemplatePagesAndWidgets(templateIds: string[]) {
  const pageRows = templateIds.length === 0
    ? []
    : await db.select().from(dashboardTemplatePages)
      .where(inArray(dashboardTemplatePages.templateId, templateIds))
      .orderBy(asc(dashboardTemplatePages.templateId), asc(dashboardTemplatePages.sortOrder), asc(dashboardTemplatePages.createdAt))

  const pageIds = pageRows.map((row) => row.id)
  const widgetRows = pageIds.length === 0
    ? []
    : await db.select().from(dashboardTemplateWidgets)
      .where(inArray(dashboardTemplateWidgets.templatePageId, pageIds))
      .orderBy(asc(dashboardTemplateWidgets.templatePageId), asc(dashboardTemplateWidgets.sortOrder), asc(dashboardTemplateWidgets.createdAt))

  const widgetsByPage = new Map<string, typeof widgetRows>()
  for (const widget of widgetRows) {
    const bucket = widgetsByPage.get(widget.templatePageId) || []
    bucket.push(widget)
    widgetsByPage.set(widget.templatePageId, bucket)
  }

  const pagesByTemplate = new Map<string, TemplatePageRecord[]>()
  for (const page of pageRows) {
    const bucket = pagesByTemplate.get(page.templateId) || []
    bucket.push({
      id: page.id,
      templateId: page.templateId,
      name: page.name,
      slug: page.slug,
      visibility: page.visibility,
      sortOrder: page.sortOrder,
      widgets: (widgetsByPage.get(page.id) || []).map((widget) => ({
        id: widget.id,
        templatePageId: widget.templatePageId,
        widgetType: widget.widgetType,
        widgetTitle: widget.widgetTitle,
        configJson: (widget.configJson && typeof widget.configJson === 'object')
          ? widget.configJson as Record<string, unknown>
          : {},
        gridX: widget.gridX,
        gridY: widget.gridY,
        gridW: widget.gridW,
        gridH: widget.gridH,
        sortOrder: widget.sortOrder,
      })),
    })
    pagesByTemplate.set(page.templateId, bucket)
  }

  return pagesByTemplate
}

async function listUserTemplatesForScope(scope: ScopeAccess): Promise<UserTemplateRecord[]> {
  const rows = await db.select().from(dashboardTemplates).where(and(
    eq(dashboardTemplates.scopeType, scope.scopeType),
    eq(dashboardTemplates.scopeRefId, scope.scopeRefId),
    eq(dashboardTemplates.source, 'user'),
    or(
      eq(dashboardTemplates.visibility, 'team'),
      eq(dashboardTemplates.ownerUserId, scope.user.id),
    ),
  )).orderBy(asc(dashboardTemplates.name), asc(dashboardTemplates.createdAt))

  const pagesByTemplate = await loadTemplatePagesAndWidgets(rows.map((row) => row.id))
  return rows.map((row) => ({
    id: row.id,
    scopeType: row.scopeType,
    scopeRefId: row.scopeRefId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    source: row.source,
    visibility: row.visibility,
    ownerUserId: row.ownerUserId,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pages: pagesByTemplate.get(row.id) || [],
  }))
}

function mapTemplatePagesForResponse(
  pages: Array<{
    name: string
    slug: string
    visibility: DashboardTemplateVisibility | CatalogTemplateVisibility
    sortOrder: number
    widgets: Array<{
      widgetType: string
      widgetTitle: string | null
      configJson: Record<string, unknown>
      gridX: number
      gridY: number
      gridW: number
      gridH: number
      sortOrder: number
    }>
  }>,
) {
  return pages.map((page) => ({
    name: page.name,
    slug: page.slug,
    visibility: page.visibility as DashboardTemplateVisibility,
    sortOrder: page.sortOrder,
    widgets: page.widgets.map((widget) => ({
      widgetType: widget.widgetType,
      widgetTitle: widget.widgetTitle,
      configJson: widget.configJson || {},
      gridX: widget.gridX,
      gridY: widget.gridY,
      gridW: widget.gridW,
      gridH: widget.gridH,
      sortOrder: widget.sortOrder,
    })),
  }))
}

function toTemplateResponseItemFromUser(scope: ScopeAccess, template: UserTemplateRecord): TemplateResponseItem {
  const editable = canEditTemplateRecord(template, scope.user.id, scope.canEditTeamWide)
  return {
    id: template.id,
    scopeType: template.scopeType,
    scopeRefId: template.scopeRefId,
    name: template.name,
    slug: template.slug,
    description: template.description,
    source: template.source,
    visibility: template.visibility,
    ownerUserId: template.ownerUserId,
    canEdit: editable,
    canDelete: editable,
    pages: mapTemplatePagesForResponse(template.pages),
  }
}

function toTemplateResponseItemFromSystem(
  scope: ScopeAccess,
  template: ReturnType<typeof listSystemDashboardTemplates>[number],
): TemplateResponseItem {
  return {
    id: template.id,
    scopeType: scope.scopeType,
    scopeRefId: scope.scopeRefId,
    name: template.name,
    slug: template.slug,
    description: template.description,
    source: template.source,
    visibility: template.visibility,
    ownerUserId: null,
    canEdit: false,
    canDelete: false,
    pages: mapTemplatePagesForResponse(template.pages),
  }
}

async function resolveUserTemplateById(
  scope: ScopeAccess,
  templateId: string,
  set: RouteSet,
): Promise<UserTemplateRecord | null> {
  const row = await db.query.dashboardTemplates.findFirst({
    where: and(
      eq(dashboardTemplates.id, templateId),
      eq(dashboardTemplates.scopeType, scope.scopeType),
      eq(dashboardTemplates.scopeRefId, scope.scopeRefId),
      eq(dashboardTemplates.source, 'user'),
    ),
  })
  if (!row) {
    set.status = 404
    return null
  }
  if (!canReadTemplateRecord(row, scope.user.id)) {
    set.status = 403
    return null
  }

  const pagesByTemplate = await loadTemplatePagesAndWidgets([row.id])
  return {
    id: row.id,
    scopeType: row.scopeType,
    scopeRefId: row.scopeRefId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    source: row.source,
    visibility: row.visibility,
    ownerUserId: row.ownerUserId,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pages: pagesByTemplate.get(row.id) || [],
  }
}

function userTemplateToPageBlueprints(template: UserTemplateRecord): DashboardTemplatePageBlueprint[] {
  return template.pages.map((page) => ({
    name: page.name,
    slug: page.slug,
    visibility: page.visibility,
    sortOrder: page.sortOrder,
    widgets: page.widgets.map((widget) => ({
      widgetType: widget.widgetType,
      widgetTitle: widget.widgetTitle,
      configJson: widget.configJson || {},
      gridX: widget.gridX,
      gridY: widget.gridY,
      gridW: widget.gridW,
      gridH: widget.gridH,
      sortOrder: widget.sortOrder,
    })),
  }))
}

function templatePageVisibilityToDashboardVisibility(
  value: DashboardTemplateVisibility | CatalogTemplateVisibility,
  canEditTeamWide: boolean,
): DashboardVisibility {
  if (value === 'team' && canEditTeamWide) return 'team'
  return 'personal'
}

async function applyTemplateBlueprintPages(
  scope: ScopeAccess,
  pages: DashboardTemplatePageBlueprint[],
  mode: TemplateApplyMode,
): Promise<{ createdPageIds: string[]; replacedPageIds: string[] }> {
  return db.transaction(async (tx) => {
    const replacedPageIds: string[] = []

    if (mode === 'replace_custom') {
      const existingCustomPages = await tx.select().from(dashboardPages).where(and(
        eq(dashboardPages.scopeType, scope.scopeType),
        eq(dashboardPages.scopeRefId, scope.scopeRefId),
        eq(dashboardPages.isSystem, false),
      ))
      const deletableIds = existingCustomPages
        .filter((page) => canEditPageRecord(page, scope.user.id, scope.canEditTeamWide))
        .map((page) => page.id)

      if (deletableIds.length > 0) {
        await tx.delete(dashboardPages).where(inArray(dashboardPages.id, deletableIds))
        replacedPageIds.push(...deletableIds)
      }
    }

    const currentPages = await tx.select({
      slug: dashboardPages.slug,
      sortOrder: dashboardPages.sortOrder,
    }).from(dashboardPages).where(and(
      eq(dashboardPages.scopeType, scope.scopeType),
      eq(dashboardPages.scopeRefId, scope.scopeRefId),
    ))

    const blockedSlugs = new Set(currentPages.map((row) => row.slug))
    const baseSortOrder = currentPages.length > 0
      ? Math.max(...currentPages.map((row) => row.sortOrder ?? 0)) + 10
      : 0
    const createdPageIds: string[] = []

    const sortedPages = [...pages].sort((left, right) => left.sortOrder - right.sortOrder)
    for (let pageIndex = 0; pageIndex < sortedPages.length; pageIndex += 1) {
      const page = sortedPages[pageIndex]!
      const baseSlug = normalizeSlug(page.name || page.slug || `dashboard-page-${pageIndex + 1}`)
      let candidateSlug = baseSlug
      if (blockedSlugs.has(candidateSlug)) {
        for (let slugIndex = 2; slugIndex < 1000; slugIndex += 1) {
          const nextCandidate = `${baseSlug}-${slugIndex}`
          if (!blockedSlugs.has(nextCandidate)) {
            candidateSlug = nextCandidate
            break
          }
        }
      }
      blockedSlugs.add(candidateSlug)

      const [createdPage] = await tx.insert(dashboardPages).values({
        scopeType: scope.scopeType,
        scopeRefId: scope.scopeRefId,
        sortOrder: baseSortOrder + (pageIndex * 10),
        name: normalizeName(page.name) || `Template Page ${pageIndex + 1}`,
        slug: candidateSlug,
        visibility: templatePageVisibilityToDashboardVisibility(page.visibility, scope.canEditTeamWide),
        ownerUserId: page.visibility === 'team' && scope.canEditTeamWide ? null : scope.user.id,
        isSystem: false,
        systemKey: null,
        createdByUserId: scope.user.id,
        updatedByUserId: scope.user.id,
      }).returning({
        id: dashboardPages.id,
      })

      if (!createdPage?.id) continue
      createdPageIds.push(createdPage.id)

      const sortedWidgets = [...page.widgets].sort((left, right) => left.sortOrder - right.sortOrder)
      for (let widgetIndex = 0; widgetIndex < sortedWidgets.length; widgetIndex += 1) {
        const widget = sortedWidgets[widgetIndex]!
        await tx.insert(dashboardWidgets).values({
          pageId: createdPage.id,
          widgetType: String(widget.widgetType || '').trim(),
          widgetTitle: normalizeName(widget.widgetTitle) || null,
          configJson: (widget.configJson && typeof widget.configJson === 'object')
            ? widget.configJson
            : {},
          gridX: sanitizeGridAxis(widget.gridX, 0),
          gridY: sanitizeGridAxis(widget.gridY, 0),
          gridW: sanitizeGridSize(widget.gridW, 1),
          gridH: sanitizeGridSize(widget.gridH, 1),
          sortOrder: Number.isInteger(widget.sortOrder) ? Math.max(0, widget.sortOrder) : widgetIndex,
          createdByUserId: scope.user.id,
          updatedByUserId: scope.user.id,
        })
      }
    }

    return { createdPageIds, replacedPageIds }
  })
}

async function ensureSystemWidget(
  pageId: string,
  widgetType: string,
  widgetTitle: string,
  userId: string,
  options?: {
    gridX?: number
    gridY?: number
    gridW?: number
    gridH?: number
    sortOrder?: number
  },
) {
  const existingWidget = await db.query.dashboardWidgets.findFirst({
    where: and(
      eq(dashboardWidgets.pageId, pageId),
      eq(dashboardWidgets.widgetType, widgetType),
    ),
    columns: {
      id: true,
      gridX: true,
      gridY: true,
      gridW: true,
      gridH: true,
      sortOrder: true,
    },
  })

  const resolvedGridX = sanitizeGridAxis(options?.gridX, existingWidget?.gridX ?? 0)
  const resolvedGridY = sanitizeGridAxis(options?.gridY, existingWidget?.gridY ?? 0)
  const resolvedGridW = sanitizeGridSize(options?.gridW, existingWidget?.gridW ?? 2)
  const resolvedGridH = sanitizeGridSize(options?.gridH, existingWidget?.gridH ?? 2)

  if (existingWidget) {
    await db.update(dashboardWidgets)
      .set({
        widgetTitle,
        gridX: resolvedGridX,
        gridY: resolvedGridY,
        gridW: resolvedGridW,
        gridH: resolvedGridH,
        sortOrder: Number.isInteger(options?.sortOrder)
          ? Number(options?.sortOrder)
          : existingWidget.sortOrder,
        updatedByUserId: userId,
      })
      .where(eq(dashboardWidgets.id, existingWidget.id))
    return
  }

  const nextOrderRow = await db.select({
    sortOrder: dashboardWidgets.sortOrder,
  }).from(dashboardWidgets)
    .where(eq(dashboardWidgets.pageId, pageId))
    .orderBy(desc(dashboardWidgets.sortOrder))
    .limit(1)

  await db.insert(dashboardWidgets).values({
    pageId,
    widgetType,
    widgetTitle,
    configJson: {},
    gridX: resolvedGridX,
    gridY: resolvedGridY,
    gridW: resolvedGridW,
    gridH: resolvedGridH,
    sortOrder: Number.isInteger(options?.sortOrder)
      ? Number(options?.sortOrder)
      : ((nextOrderRow[0]?.sortOrder ?? -1) + 1),
    createdByUserId: userId,
    updatedByUserId: userId,
  })
}

async function ensureDefaultPages(scope: ScopeAccess) {
  if (scope.scopeType === 'product') {
    const defaults: Array<{
      systemKey: string
      name: string
      slug: string
      widgets: Array<{
        widgetType: string
        widgetTitle: string
        gridW: number
        gridH: number
        sortOrder: number
      }>
    }> = [
      {
        systemKey: 'product_feed',
        name: 'Feed',
        slug: 'feed',
        widgets: [
          { widgetType: 'product_feed_summary', widgetTitle: 'Feed Summary', gridW: 2, gridH: 1, sortOrder: 0 },
          { widgetType: 'product_feed_activities', widgetTitle: 'Activities', gridW: 2, gridH: 2, sortOrder: 1 },
          { widgetType: 'product_feed_team_members', widgetTitle: 'Team Members', gridW: 1, gridH: 2, sortOrder: 2 },
        ],
      },
      {
        systemKey: 'product_flow',
        name: 'Flow',
        slug: 'flow',
        widgets: [
          { widgetType: 'metrics_flow', widgetTitle: 'Flow', gridW: 2, gridH: 2, sortOrder: 0 },
        ],
      },
      {
        systemKey: 'product_productivity',
        name: 'Productivity',
        slug: 'productivity',
        widgets: [
          { widgetType: 'metrics_tasks_dashboard', widgetTitle: 'Tasks Dashboard', gridW: 2, gridH: 2, sortOrder: 0 },
          { widgetType: 'metrics_throughput', widgetTitle: 'Throughput', gridW: 1, gridH: 2, sortOrder: 1 },
          { widgetType: 'metrics_deliveries', widgetTitle: 'Deliveries', gridW: 1, gridH: 2, sortOrder: 2 },
        ],
      },
      {
        systemKey: 'product_workload',
        name: 'Workload',
        slug: 'workload',
        widgets: [
          { widgetType: 'metrics_workload', widgetTitle: 'Workload', gridW: 2, gridH: 2, sortOrder: 0 },
        ],
      },
      {
        systemKey: 'product_quality',
        name: 'Quality',
        slug: 'quality',
        widgets: [
          { widgetType: 'metrics_quality', widgetTitle: 'Quality', gridW: 1, gridH: 2, sortOrder: 0 },
          { widgetType: 'metrics_predictability', widgetTitle: 'Predictability', gridW: 1, gridH: 2, sortOrder: 1 },
        ],
      },
      {
        systemKey: 'product_blockers',
        name: 'Blockers',
        slug: 'blockers',
        widgets: [
          { widgetType: 'metrics_blockers', widgetTitle: 'Blockers', gridW: 2, gridH: 2, sortOrder: 0 },
        ],
      },
    ]

    for (let index = 0; index < defaults.length; index += 1) {
      const entry = defaults[index]!
      let page = await db.query.dashboardPages.findFirst({
        where: and(
          eq(dashboardPages.scopeType, scope.scopeType),
          eq(dashboardPages.scopeRefId, scope.scopeRefId),
          eq(dashboardPages.systemKey, entry.systemKey),
        ),
        columns: { id: true },
      })

      if (!page) {
        const slug = await buildUniqueSlug(scope.scopeType, scope.scopeRefId, entry.slug || entry.name)
        const [created] = await db.insert(dashboardPages).values({
          scopeType: scope.scopeType,
          scopeRefId: scope.scopeRefId,
          sortOrder: index * 10,
          name: entry.name,
          slug,
          visibility: 'team',
          ownerUserId: null,
          isSystem: true,
          systemKey: entry.systemKey,
          createdByUserId: scope.user.id,
          updatedByUserId: scope.user.id,
        }).returning({ id: dashboardPages.id })
        if (!created?.id) continue
        page = { id: created.id }
      } else {
        await db.update(dashboardPages)
          .set({
            sortOrder: index * 10,
            name: entry.name,
            visibility: 'team',
            ownerUserId: null,
            updatedByUserId: scope.user.id,
          })
          .where(eq(dashboardPages.id, page.id))
      }

      for (const widget of entry.widgets) {
        await ensureSystemWidget(page.id, widget.widgetType, widget.widgetTitle, scope.user.id, {
          gridW: widget.gridW,
          gridH: widget.gridH,
          sortOrder: widget.sortOrder,
        })
      }

      const currentWidgets = await db.select({
        id: dashboardWidgets.id,
        widgetType: dashboardWidgets.widgetType,
      }).from(dashboardWidgets).where(eq(dashboardWidgets.pageId, page.id))

      const allowedWidgetTypes = new Set(entry.widgets.map((widget) => widget.widgetType))
      const staleWidgetIds = currentWidgets
        .filter((widget) => !allowedWidgetTypes.has(widget.widgetType))
        .map((widget) => widget.id)

      if (staleWidgetIds.length > 0) {
        await db.delete(dashboardWidgets).where(inArray(dashboardWidgets.id, staleWidgetIds))
      }
    }
    return
  }

  const defaults = [
    { systemKey: 'workspace_my_tasks', name: 'My Tasks', slug: 'my-tasks', widgetType: 'home_my_tasks' },
    { systemKey: 'workspace_team', name: 'Team View', slug: 'team-view', widgetType: 'home_team' },
    { systemKey: 'workspace_executive', name: 'Executive Overview', slug: 'executive-overview', widgetType: 'home_executive' },
  ] as const

  for (let index = 0; index < defaults.length; index += 1) {
    const entry = defaults[index]!
    await db.insert(dashboardPages).values({
      scopeType: scope.scopeType,
      scopeRefId: scope.scopeRefId,
      sortOrder: index * 10,
      name: entry.name,
      slug: entry.slug,
      visibility: 'team',
      ownerUserId: null,
      isSystem: true,
      systemKey: entry.systemKey,
      createdByUserId: scope.user.id,
      updatedByUserId: scope.user.id,
    }).onConflictDoNothing()

    const page = await db.query.dashboardPages.findFirst({
      where: and(
        eq(dashboardPages.scopeType, scope.scopeType),
        eq(dashboardPages.scopeRefId, scope.scopeRefId),
        eq(dashboardPages.systemKey, entry.systemKey),
      ),
      columns: { id: true },
    })
    if (!page?.id) continue

    await ensureSystemWidget(page.id, entry.widgetType, entry.name, scope.user.id)
  }
}

async function listPagesForUser(scope: ScopeAccess) {
  let invitedRows: Array<{ pageId: string; accessRole: DashboardViewerAccessRole }> = []
  try {
    const rows = await db.query.dashboardPageViewers.findMany({
      where: eq(dashboardPageViewers.userId, scope.user.id),
      columns: {
        pageId: true,
        accessRole: true,
      },
    })
    invitedRows = rows.map((row) => ({
      pageId: row.pageId,
      accessRole: normalizeViewerRole(row.accessRole),
    }))
  } catch (error) {
    if (!isMissingAccessRoleColumnError(error)) throw error
    const legacyRows = await db.query.dashboardPageViewers.findMany({
      where: eq(dashboardPageViewers.userId, scope.user.id),
      columns: { pageId: true },
    })
    invitedRows = legacyRows.map((row) => ({
      pageId: row.pageId,
      accessRole: 'viewer',
    }))
  }
  const invitedPageIds = invitedRows.map((row) => row.pageId)
  const invitedRoleByPage = new Map(
    invitedRows.map((row) => [row.pageId, row.accessRole] as const),
  )

  const readFilter = invitedPageIds.length > 0
    ? or(
      eq(dashboardPages.visibility, 'team'),
      eq(dashboardPages.ownerUserId, scope.user.id),
      inArray(dashboardPages.id, invitedPageIds),
    )
    : or(
      eq(dashboardPages.visibility, 'team'),
      eq(dashboardPages.ownerUserId, scope.user.id),
    )

  const pages = await db.select().from(dashboardPages).where(and(
    eq(dashboardPages.scopeType, scope.scopeType),
    eq(dashboardPages.scopeRefId, scope.scopeRefId),
    readFilter,
  )).orderBy(asc(dashboardPages.sortOrder), desc(dashboardPages.isSystem), asc(dashboardPages.createdAt))

  const pageIds = pages.map((page) => page.id)
  const widgets = pageIds.length === 0
    ? []
    : await db.select().from(dashboardWidgets)
      .where(inArray(dashboardWidgets.pageId, pageIds))
      .orderBy(asc(dashboardWidgets.pageId), asc(dashboardWidgets.sortOrder), asc(dashboardWidgets.createdAt))

  let viewerRows: Array<{ pageId: string; userId: string; role: DashboardViewerAccessRole }> = []
  if (pageIds.length > 0) {
    try {
      const rows = await db.select({
        pageId: dashboardPageViewers.pageId,
        userId: dashboardPageViewers.userId,
        role: dashboardPageViewers.accessRole,
      }).from(dashboardPageViewers)
        .where(inArray(dashboardPageViewers.pageId, pageIds))
      viewerRows = rows.map((row) => ({
        pageId: row.pageId,
        userId: row.userId,
        role: normalizeViewerRole(row.role),
      }))
    } catch (error) {
      if (!isMissingAccessRoleColumnError(error)) throw error
      const legacyRows = await db.select({
        pageId: dashboardPageViewers.pageId,
        userId: dashboardPageViewers.userId,
      }).from(dashboardPageViewers)
        .where(inArray(dashboardPageViewers.pageId, pageIds))
      viewerRows = legacyRows.map((row) => ({
        pageId: row.pageId,
        userId: row.userId,
        role: 'viewer',
      }))
    }
  }

  const widgetsByPage = new Map<string, typeof widgets>()
  for (const widget of widgets) {
    const bucket = widgetsByPage.get(widget.pageId) || []
    bucket.push(widget)
    widgetsByPage.set(widget.pageId, bucket)
  }

  const viewersByPage = new Map<string, Array<{ userId: string; role: DashboardViewerAccessRole }>>()
  for (const viewer of viewerRows) {
    const bucket = viewersByPage.get(viewer.pageId) || []
    bucket.push({
      userId: viewer.userId,
      role: viewer.role,
    })
    viewersByPage.set(viewer.pageId, bucket)
  }

  return pages.map((page) => ({
    ...page,
    widgets: widgetsByPage.get(page.id) || [],
    viewerAssignments: viewersByPage.get(page.id) || [],
    viewerUserIds: (viewersByPage.get(page.id) || []).map((viewer) => viewer.userId),
    canEdit: canEditPageRecord(
      page,
      scope.user.id,
      scope.canEditTeamWide,
      invitedRoleByPage.get(page.id) || null,
    ),
    isOwner: page.ownerUserId === scope.user.id,
  }))
}

async function resolvePageAccess(
  pageId: string,
  jwtVerify: (token: string) => Promise<unknown>,
  headers: Record<string, string | undefined>,
  set: RouteSet,
  action: PageAction,
): Promise<PageAccessContext | null> {
  const page = await db.query.dashboardPages.findFirst({
    where: eq(dashboardPages.id, pageId),
  })
  if (!page) {
    set.status = 404
    return null
  }

  const scope = await resolveScopeAccessFromPage(page, jwtVerify, headers, set)
  if (!scope) return null

  let invitedRole: DashboardViewerAccessRole | null = null
  try {
    const inviteRow = await db.query.dashboardPageViewers.findFirst({
      where: and(
        eq(dashboardPageViewers.pageId, page.id),
        eq(dashboardPageViewers.userId, scope.user.id),
      ),
      columns: { accessRole: true },
    })
    invitedRole = inviteRow ? normalizeViewerRole(inviteRow.accessRole) : null
  } catch (error) {
    if (!isMissingAccessRoleColumnError(error)) throw error
    const legacyInviteRow = await db.query.dashboardPageViewers.findFirst({
      where: and(
        eq(dashboardPageViewers.pageId, page.id),
        eq(dashboardPageViewers.userId, scope.user.id),
      ),
      columns: { id: true },
    })
    invitedRole = legacyInviteRow ? 'viewer' : null
  }
  const invited = invitedRole !== null

  const readable = canReadPageRecord(page, scope.user.id, invitedRole)
  if (!readable) {
    set.status = 403
    return null
  }

  const canEditPage = canEditPageRecord(page, scope.user.id, scope.canEditTeamWide, invitedRole)
  if (action === 'edit' && !canEditPage) {
    set.status = 403
    return null
  }

  return {
    ...scope,
    page,
    invited,
    invitedRole,
    canEditPage,
  }
}

function defaultError(set: RouteSet): { error: string } {
  return set.status === 401 ? { error: 'Unauthorized' } : { error: 'Forbidden' }
}

const scopeTypeSchema = t.Union([t.Literal('product'), t.Literal('workspace')])
const visibilitySchema = t.Union([t.Literal('personal'), t.Literal('team'), t.Literal('invited')])
const viewerRoleSchema = t.Union([t.Literal('viewer'), t.Literal('editor')])
const templateVisibilitySchema = t.Union([t.Literal('personal'), t.Literal('team')])
const templateApplyModeSchema = t.Union([t.Literal('append'), t.Literal('replace_custom')])
const dashboardTemplatesEnabled = String(
  process.env.DASHBOARD_TEMPLATES_ENABLED
  ?? process.env.dashboard_templates_enabled
  ?? 'true',
).toLowerCase() !== 'false'

function templateFeatureUnavailable(set: RouteSet) {
  set.status = 404
  return { error: 'Not found' }
}

export const dashboardRoutes = new Elysia({ prefix: '/api/dashboards' })
  .use(authPlugin)

  .get('/pages', async ({ query, jwt, headers, set }) => {
    const scope = await resolveScopeAccessFromQuery(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if (!scope) return defaultError(set)

    await ensureDefaultPages(scope)
    const items = await listPagesForUser(scope)
    return { items }
  }, {
    query: t.Object({
      scopeType: scopeTypeSchema,
      productId: t.Optional(t.String()),
      organizationId: t.Optional(t.String()),
    }),
  })

  .get('/templates', async ({ query, jwt, headers, set }) => {
    if (!dashboardTemplatesEnabled) return templateFeatureUnavailable(set)

    let scope: ScopeAccess | null = null
    try {
      scope = await resolveScopeAccessFromQuery(query as Record<string, string | undefined>, jwt.verify, headers, set)
      if (!scope) return defaultError(set)
      const resolvedScope = scope

      const userTemplates = await listUserTemplatesForScope(resolvedScope)
      const systemTemplates = listSystemDashboardTemplates(resolvedScope.scopeType as DashboardTemplateScopeType)

      const items = [
        ...systemTemplates.map((template) => toTemplateResponseItemFromSystem(resolvedScope, template)),
        ...userTemplates.map((template) => toTemplateResponseItemFromUser(resolvedScope, template)),
      ]

      return {
        items,
        canManageTemplates: resolvedScope.canEditTeamWide,
        canApplyTemplates: resolvedScope.canApplyTemplates,
      }
    } catch (error) {
      console.error('[dashboards] template listing failed; returning safe fallback', {
        scopeType: (query as Record<string, string | undefined>).scopeType || null,
        scopeRefId:
          (query as Record<string, string | undefined>).scopeType === 'workspace'
            ? (query as Record<string, string | undefined>).organizationId || null
            : (query as Record<string, string | undefined>).productId || null,
        userId: scope?.user.id || null,
        message: error instanceof Error ? error.message : String(error),
      })
      set.status = 200
      return {
        items: [],
        canManageTemplates: false,
        canApplyTemplates: false,
      }
    }
  }, {
    query: t.Object({
      scopeType: scopeTypeSchema,
      productId: t.Optional(t.String()),
      organizationId: t.Optional(t.String()),
    }),
  })

  .post('/templates', async ({ body, jwt, headers, set }) => {
    if (!dashboardTemplatesEnabled) return templateFeatureUnavailable(set)

    const scope = await resolveScopeAccessFromQuery({
      scopeType: body.scopeType,
      productId: body.productId,
      organizationId: body.organizationId,
    }, jwt.verify, headers, set)
    if (!scope) return defaultError(set)
    if (!(await requireScopeEditCapability(scope, set))) return defaultError(set)

    const name = normalizeName(body.name)
    if (!name) {
      set.status = 400
      return { error: 'name is required' }
    }

    const visibility = normalizeTemplateVisibility(body.visibility)
    if (visibility === 'team' && !scope.canEditTeamWide) {
      set.status = 403
      return { error: 'Team templates require edit permission' }
    }

    const selectedPageIds = normalizeUserIds(body.pageIds)
    const description = normalizeTemplateDescription(body.description)
    const availablePages = (await listPagesForUser(scope)).filter((page) => !page.isSystem && page.canEdit)
    const selectedPages = selectedPageIds.length > 0
      ? availablePages.filter((page) => selectedPageIds.includes(page.id))
      : availablePages

    if (selectedPages.length === 0) {
      set.status = 400
      return { error: 'Select at least one editable custom page to save as a template' }
    }

    const selectedPageOrder = new Map(selectedPageIds.map((pageId, index) => [pageId, index]))
    const orderedPages = selectedPages.sort((left, right) => {
      if (selectedPageOrder.size === 0) return left.name.localeCompare(right.name)
      return (selectedPageOrder.get(left.id) ?? 9999) - (selectedPageOrder.get(right.id) ?? 9999)
    })

    const slug = await buildUniqueTemplateSlug(scope.scopeType, scope.scopeRefId, name)
    const createdTemplateId = await db.transaction(async (tx) => {
      const [createdTemplate] = await tx.insert(dashboardTemplates).values({
        scopeType: scope.scopeType,
        scopeRefId: scope.scopeRefId,
        name,
        slug,
        description,
        source: 'user',
        visibility,
        ownerUserId: visibility === 'team' ? null : scope.user.id,
        createdByUserId: scope.user.id,
        updatedByUserId: scope.user.id,
      }).returning({ id: dashboardTemplates.id })

      if (!createdTemplate?.id) return ''

      const templatePageSlugs = new Set<string>()
      for (let pageIndex = 0; pageIndex < orderedPages.length; pageIndex += 1) {
        const page = orderedPages[pageIndex]!
        const basePageSlug = normalizeSlug(page.name || `template-page-${pageIndex + 1}`)
        let pageSlug = basePageSlug
        if (templatePageSlugs.has(pageSlug)) {
          for (let slugIndex = 2; slugIndex < 1000; slugIndex += 1) {
            const nextCandidate = `${basePageSlug}-${slugIndex}`
            if (!templatePageSlugs.has(nextCandidate)) {
              pageSlug = nextCandidate
              break
            }
          }
        }
        templatePageSlugs.add(pageSlug)

        const [createdPage] = await tx.insert(dashboardTemplatePages).values({
          templateId: createdTemplate.id,
          name: page.name,
          slug: pageSlug,
          visibility: page.visibility === 'team' ? 'team' : 'personal',
          sortOrder: pageIndex,
        }).returning({ id: dashboardTemplatePages.id })

        if (!createdPage?.id) continue

        const orderedWidgets = [...page.widgets].sort((left, right) => left.sortOrder - right.sortOrder)
        for (let widgetIndex = 0; widgetIndex < orderedWidgets.length; widgetIndex += 1) {
          const widget = orderedWidgets[widgetIndex]!
          await tx.insert(dashboardTemplateWidgets).values({
            templatePageId: createdPage.id,
            widgetType: String(widget.widgetType || '').trim(),
            widgetTitle: normalizeName(widget.widgetTitle) || null,
            configJson: (widget.configJson && typeof widget.configJson === 'object')
              ? widget.configJson
              : {},
            gridX: sanitizeGridAxis(widget.gridX, 0),
            gridY: sanitizeGridAxis(widget.gridY, 0),
            gridW: sanitizeGridSize(widget.gridW, 1),
            gridH: sanitizeGridSize(widget.gridH, 1),
            sortOrder: Number.isInteger(widget.sortOrder) ? Math.max(0, widget.sortOrder) : widgetIndex,
          })
        }
      }

      return createdTemplate.id
    })

    if (!createdTemplateId) {
      set.status = 500
      return { error: 'Unable to create template' }
    }

    const createdTemplate = await resolveUserTemplateById(scope, createdTemplateId, set)
    if (!createdTemplate) {
      set.status = 500
      return { error: 'Unable to resolve created template' }
    }

    return toTemplateResponseItemFromUser(scope, createdTemplate)
  }, {
    body: t.Object({
      scopeType: scopeTypeSchema,
      productId: t.Optional(t.String()),
      organizationId: t.Optional(t.String()),
      name: t.String({ minLength: 1, maxLength: 160 }),
      description: t.Optional(t.String({ maxLength: 1000 })),
      visibility: t.Optional(templateVisibilitySchema),
      pageIds: t.Optional(t.Array(t.String())),
    }),
  })

  .delete('/templates/:templateId', async ({ params: { templateId }, query, jwt, headers, set }) => {
    if (!dashboardTemplatesEnabled) return templateFeatureUnavailable(set)

    const scope = await resolveScopeAccessFromQuery(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if (!scope) return defaultError(set)
    if (!(await requireScopeEditCapability(scope, set))) return defaultError(set)

    if (String(templateId || '').startsWith('system:')) {
      set.status = 400
      return { error: 'System templates cannot be deleted' }
    }

    const template = await resolveUserTemplateById(scope, templateId, set)
    if (!template) {
      if (set.status === 404) return { error: 'Template not found' }
      return defaultError(set)
    }

    if (!canEditTemplateRecord(template, scope.user.id, scope.canEditTeamWide)) {
      set.status = 403
      return { error: 'Forbidden' }
    }

    await db.delete(dashboardTemplates).where(eq(dashboardTemplates.id, template.id))
    return { success: true }
  }, {
    query: t.Object({
      scopeType: scopeTypeSchema,
      productId: t.Optional(t.String()),
      organizationId: t.Optional(t.String()),
    }),
  })

  .post('/templates/:templateId/apply', async ({ params: { templateId }, body, jwt, headers, set }) => {
    if (!dashboardTemplatesEnabled) return templateFeatureUnavailable(set)

    const scope = await resolveScopeAccessFromQuery({
      scopeType: body.scopeType,
      productId: body.productId,
      organizationId: body.organizationId,
    }, jwt.verify, headers, set)
    if (!scope) return defaultError(set)
    if (!(await requireScopeTemplateApplyCapability(scope, set))) return defaultError(set)

    const resolvedTemplateId = String(templateId || '').trim()
    const mode = body.mode as TemplateApplyMode
    let source: TemplateSource = 'system'
    let pages: DashboardTemplatePageBlueprint[] = []

    const systemTemplate = getSystemDashboardTemplateById(scope.scopeType as DashboardTemplateScopeType, resolvedTemplateId)
    if (systemTemplate) {
      source = 'system'
      pages = systemTemplate.pages
    } else {
      const userTemplate = await resolveUserTemplateById(scope, resolvedTemplateId, set)
      if (!userTemplate) {
        if (set.status === 404) return { error: 'Template not found' }
        return defaultError(set)
      }
      if (!canEditTemplateRecord(userTemplate, scope.user.id, scope.canEditTeamWide)) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      source = 'user'
      pages = userTemplateToPageBlueprints(userTemplate)
    }

    if (!Array.isArray(pages) || pages.length === 0) {
      set.status = 400
      return { error: 'Template does not contain any pages' }
    }

    const applied = await applyTemplateBlueprintPages(scope, pages, mode)
    return {
      success: true,
      source,
      mode,
      ...applied,
    }
  }, {
    body: t.Object({
      scopeType: scopeTypeSchema,
      productId: t.Optional(t.String()),
      organizationId: t.Optional(t.String()),
      mode: templateApplyModeSchema,
    }),
  })

  .post('/pages', async ({ body, jwt, headers, set }) => {
    const scope = await resolveScopeAccessFromQuery({
      scopeType: body.scopeType,
      productId: body.productId,
      organizationId: body.organizationId,
    }, jwt.verify, headers, set)
    if (!scope) return defaultError(set)

    const name = normalizeName(body.name)
    if (!name) {
      set.status = 400
      return { error: 'name is required' }
    }

    const visibility = body.visibility as DashboardVisibility
    if (visibility === 'team' && !scope.canEditTeamWide) {
      set.status = 403
      return { error: 'Team-wide dashboards require edit permission' }
    }

    const sharedViewers = mergeViewerAssignments(body.sharedUserIds, body.viewers)
    if (visibility === 'invited') {
      const valid = await ensureViewerCandidatesInScope(
        scope.scopeType,
        scope.scopeRefId,
        sharedViewers.map((viewer) => viewer.userId),
        set,
      )
      if (!valid) return { error: 'Shared users must belong to this scope' }
    }

    const slug = await buildUniqueSlug(scope.scopeType, scope.scopeRefId, name)
    const ownerUserId = visibility === 'team' ? null : scope.user.id
    const nextSortOrder = await getNextPageSortOrder(scope.scopeType, scope.scopeRefId)

    const [created] = await db.insert(dashboardPages).values({
      scopeType: scope.scopeType,
      scopeRefId: scope.scopeRefId,
      sortOrder: nextSortOrder,
      name,
      slug,
      visibility,
      ownerUserId,
      isSystem: false,
      systemKey: null,
      createdByUserId: scope.user.id,
      updatedByUserId: scope.user.id,
    }).returning()

    if (!created) {
      set.status = 500
      return { error: 'Unable to create dashboard page' }
    }

    if (visibility === 'invited' && sharedViewers.length > 0) {
      const viewerRows = sharedViewers.map((viewer) => ({
        pageId: created.id,
        userId: viewer.userId,
        accessRole: viewer.role,
        invitedByUserId: scope.user.id,
      }))
      try {
        await db.insert(dashboardPageViewers).values(viewerRows).onConflictDoNothing()
      } catch (error) {
        if (!isMissingAccessRoleColumnError(error)) throw error
        await db.insert(dashboardPageViewers).values(
          viewerRows.map((viewer) => ({
            pageId: viewer.pageId,
            userId: viewer.userId,
            invitedByUserId: viewer.invitedByUserId,
          })),
        ).onConflictDoNothing()
      }
    }

    const rows = await listPagesForUser(scope)
    return rows.find((row) => row.id === created.id) || created
  }, {
    body: t.Object({
      scopeType: scopeTypeSchema,
      productId: t.Optional(t.String()),
      organizationId: t.Optional(t.String()),
      name: t.String({ minLength: 1, maxLength: 160 }),
      visibility: visibilitySchema,
      sharedUserIds: t.Optional(t.Array(t.String())),
      viewers: t.Optional(t.Array(t.Object({
        userId: t.String(),
        role: viewerRoleSchema,
      }))),
    }),
  })

  .put('/pages/reorder', async ({ body, jwt, headers, set }) => {
    const scope = await resolveScopeAccessFromQuery({
      scopeType: body.scopeType,
      productId: body.productId,
      organizationId: body.organizationId,
    }, jwt.verify, headers, set)
    if (!scope) return defaultError(set)

    const orderedPageIds = normalizeUserIds(body.orderedPageIds)
    if (orderedPageIds.length === 0) {
      set.status = 400
      return { error: 'orderedPageIds must not be empty' }
    }

    const visiblePages = await listPagesForUser(scope)
    if (visiblePages.length < 2) {
      return { success: true, items: visiblePages }
    }

    const orderedUnique = new Set(orderedPageIds)
    if (orderedUnique.size !== orderedPageIds.length) {
      set.status = 400
      return { error: 'orderedPageIds contains duplicates' }
    }

    const visibleById = new Map(visiblePages.map((page) => [page.id, page] as const))
    const unknownId = orderedPageIds.find((pageId) => !visibleById.has(pageId))
    if (unknownId) {
      set.status = 400
      return { error: `Unknown page id in orderedPageIds: ${unknownId}` }
    }

    const blockedPage = orderedPageIds
      .map((pageId) => visibleById.get(pageId))
      .find((page) => !page?.canEdit)
    if (blockedPage) {
      set.status = 403
      return { error: 'You can only reorder pages that you can edit' }
    }

    const slotIndices: number[] = []
    for (let index = 0; index < visiblePages.length; index += 1) {
      const page = visiblePages[index]!
      if (orderedUnique.has(page.id)) slotIndices.push(index)
    }

    const targetSortOrders = slotIndices.map((index) => visiblePages[index]?.sortOrder ?? (index * 10))

    await db.transaction(async (tx) => {
      for (let index = 0; index < orderedPageIds.length; index += 1) {
        const pageId = orderedPageIds[index]!
        await tx.update(dashboardPages)
          .set({
            sortOrder: targetSortOrders[index] ?? (index * 10),
            updatedByUserId: scope.user.id,
          })
          .where(eq(dashboardPages.id, pageId))
      }
    })

    return {
      success: true,
      items: await listPagesForUser(scope),
    }
  }, {
    body: t.Object({
      scopeType: scopeTypeSchema,
      productId: t.Optional(t.String()),
      organizationId: t.Optional(t.String()),
      orderedPageIds: t.Array(t.String(), { minItems: 1 }),
    }),
  })

  .patch('/pages/:pageId', async ({ params: { pageId }, body, jwt, headers, set }) => {
    const access = await resolvePageAccess(pageId, jwt.verify, headers, set, 'edit')
    if (!access) return defaultError(set)

    if (access.page.isSystem) {
      set.status = 400
      return { error: 'System pages are locked' }
    }

    const updates: Partial<typeof dashboardPages.$inferInsert> = {
      updatedByUserId: access.user.id,
    }

    if (body.name !== undefined) {
      const name = normalizeName(body.name)
      if (!name) {
        set.status = 400
        return { error: 'name cannot be empty' }
      }
      updates.name = name
      updates.slug = await buildUniqueSlug(access.scopeType, access.scopeRefId, name, access.page.id)
    }

    if (body.visibility !== undefined) {
      const nextVisibility = body.visibility as DashboardVisibility
      if (nextVisibility === 'team' && !access.canEditTeamWide) {
        set.status = 403
        return { error: 'Team-wide dashboards require edit permission' }
      }
      updates.visibility = nextVisibility
      updates.ownerUserId = nextVisibility === 'team' ? null : access.user.id
      if (nextVisibility !== 'invited') {
        await db.delete(dashboardPageViewers).where(eq(dashboardPageViewers.pageId, access.page.id))
      }
    }

    const [updated] = await db.update(dashboardPages)
      .set(updates)
      .where(eq(dashboardPages.id, access.page.id))
      .returning()

    return updated || access.page
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1, maxLength: 160 })),
      visibility: t.Optional(visibilitySchema),
    }),
  })

  .delete('/pages/:pageId', async ({ params: { pageId }, jwt, headers, set }) => {
    const access = await resolvePageAccess(pageId, jwt.verify, headers, set, 'edit')
    if (!access) return defaultError(set)

    if (access.page.isSystem) {
      set.status = 400
      return { error: 'System pages cannot be deleted' }
    }

    await db.delete(dashboardPages).where(eq(dashboardPages.id, access.page.id))
    return { success: true }
  })

  .put('/pages/:pageId/viewers', async ({ params: { pageId }, body, jwt, headers, set }) => {
    const access = await resolvePageAccess(pageId, jwt.verify, headers, set, 'edit')
    if (!access) return defaultError(set)

    if (access.page.isSystem) {
      set.status = 400
      return { error: 'System pages are locked' }
    }

    if (access.page.visibility !== 'invited') {
      set.status = 400
      return { error: 'Viewer invites are only supported for invited visibility pages' }
    }

    const viewers = mergeViewerAssignments(body.userIds, body.viewers)
      .filter((viewer) => viewer.userId !== access.user.id)
    const valid = await ensureViewerCandidatesInScope(
      access.scopeType,
      access.scopeRefId,
      viewers.map((viewer) => viewer.userId),
      set,
    )
    if (!valid) return { error: 'Shared users must belong to this scope' }

    await db.delete(dashboardPageViewers).where(eq(dashboardPageViewers.pageId, access.page.id))
    if (viewers.length > 0) {
      const viewerRows = viewers.map((viewer) => ({
        pageId: access.page.id,
        userId: viewer.userId,
        accessRole: viewer.role,
        invitedByUserId: access.user.id,
      }))
      try {
        await db.insert(dashboardPageViewers).values(viewerRows).onConflictDoNothing()
      } catch (error) {
        if (!isMissingAccessRoleColumnError(error)) throw error
        await db.insert(dashboardPageViewers).values(
          viewerRows.map((viewer) => ({
            pageId: viewer.pageId,
            userId: viewer.userId,
            invitedByUserId: viewer.invitedByUserId,
          })),
        ).onConflictDoNothing()
      }
    }

    return {
      pageId: access.page.id,
      viewerUserIds: viewers.map((viewer) => viewer.userId),
      viewers,
    }
  }, {
    body: t.Object({
      userIds: t.Optional(t.Array(t.String())),
      viewers: t.Optional(t.Array(t.Object({
        userId: t.String(),
        role: viewerRoleSchema,
      }))),
    }),
  })

  .post('/pages/:pageId/widgets', async ({ params: { pageId }, body, jwt, headers, set }) => {
    const access = await resolvePageAccess(pageId, jwt.verify, headers, set, 'edit')
    if (!access) return defaultError(set)

    if (access.page.isSystem) {
      set.status = 400
      return { error: 'System pages are locked' }
    }

    const maxOrderRow = await db.select({
      maxOrder: dashboardWidgets.sortOrder,
    }).from(dashboardWidgets)
      .where(eq(dashboardWidgets.pageId, access.page.id))
      .orderBy(desc(dashboardWidgets.sortOrder))
      .limit(1)

    const nextOrder = (maxOrderRow[0]?.maxOrder ?? -1) + 1
    const gridW = sanitizeGridSize(body.gridW, 1)
    const gridH = sanitizeGridSize(body.gridH, 1)
    const sortOrder = Number.isInteger(body.sortOrder)
      ? Math.max(0, Number(body.sortOrder))
      : nextOrder

    const [created] = await db.insert(dashboardWidgets).values({
      pageId: access.page.id,
      widgetType: String(body.widgetType).trim(),
      widgetTitle: normalizeName(body.widgetTitle) || null,
      configJson: (body.configJson && typeof body.configJson === 'object') ? body.configJson as Record<string, unknown> : {},
      gridX: sanitizeGridAxis(body.gridX, 0),
      gridY: sanitizeGridAxis(body.gridY, 0),
      gridW,
      gridH,
      sortOrder,
      createdByUserId: access.user.id,
      updatedByUserId: access.user.id,
    }).returning()

    return created
  }, {
    body: t.Object({
      widgetType: t.String({ minLength: 1, maxLength: 100 }),
      widgetTitle: t.Optional(t.String({ maxLength: 160 })),
      configJson: t.Optional(t.Any()),
      gridX: t.Optional(t.Number()),
      gridY: t.Optional(t.Number()),
      gridW: t.Optional(t.Number()),
      gridH: t.Optional(t.Number()),
      sortOrder: t.Optional(t.Number()),
    }),
  })

  .patch('/pages/:pageId/widgets/:widgetId', async ({ params: { pageId, widgetId }, body, jwt, headers, set }) => {
    const access = await resolvePageAccess(pageId, jwt.verify, headers, set, 'edit')
    if (!access) return defaultError(set)

    if (access.page.isSystem) {
      set.status = 400
      return { error: 'System pages are locked' }
    }

    const widget = await db.query.dashboardWidgets.findFirst({
      where: and(
        eq(dashboardWidgets.id, widgetId),
        eq(dashboardWidgets.pageId, access.page.id),
      ),
    })
    if (!widget) {
      set.status = 404
      return { error: 'Widget not found' }
    }

    const updates: Partial<typeof dashboardWidgets.$inferInsert> = {
      updatedByUserId: access.user.id,
    }
    if (body.widgetTitle !== undefined) {
      updates.widgetTitle = normalizeName(body.widgetTitle) || null
    }
    if (body.configJson !== undefined) {
      updates.configJson = (body.configJson && typeof body.configJson === 'object')
        ? body.configJson as Record<string, unknown>
        : {}
    }
    if (body.gridX !== undefined) updates.gridX = sanitizeGridAxis(body.gridX, widget.gridX)
    if (body.gridY !== undefined) updates.gridY = sanitizeGridAxis(body.gridY, widget.gridY)
    if (body.gridW !== undefined) updates.gridW = sanitizeGridSize(body.gridW, widget.gridW)
    if (body.gridH !== undefined) updates.gridH = sanitizeGridSize(body.gridH, widget.gridH)
    if (body.sortOrder !== undefined && Number.isInteger(body.sortOrder)) {
      updates.sortOrder = Math.max(0, Number(body.sortOrder))
    }

    const [updated] = await db.update(dashboardWidgets)
      .set(updates)
      .where(eq(dashboardWidgets.id, widget.id))
      .returning()

    return updated || widget
  }, {
    body: t.Object({
      widgetTitle: t.Optional(t.String({ maxLength: 160 })),
      configJson: t.Optional(t.Any()),
      gridX: t.Optional(t.Number()),
      gridY: t.Optional(t.Number()),
      gridW: t.Optional(t.Number()),
      gridH: t.Optional(t.Number()),
      sortOrder: t.Optional(t.Number()),
    }),
  })

  .delete('/pages/:pageId/widgets/:widgetId', async ({ params: { pageId, widgetId }, jwt, headers, set }) => {
    const access = await resolvePageAccess(pageId, jwt.verify, headers, set, 'edit')
    if (!access) return defaultError(set)

    if (access.page.isSystem) {
      set.status = 400
      return { error: 'System pages are locked' }
    }

    const [deleted] = await db.delete(dashboardWidgets)
      .where(and(
        eq(dashboardWidgets.id, widgetId),
        eq(dashboardWidgets.pageId, access.page.id),
      ))
      .returning({ id: dashboardWidgets.id })

    if (!deleted) {
      set.status = 404
      return { error: 'Widget not found' }
    }
    return { success: true }
  })

  .get('/scope-context', async ({ query, jwt, headers, set }) => {
    const scope = await resolveScopeAccessFromQuery(query as Record<string, string | undefined>, jwt.verify, headers, set)
    if (!scope) return defaultError(set)

    let organizationId: string | null = null
    if (scope.scopeType === 'workspace') {
      organizationId = scope.scopeRefId
    } else {
      const product = await db.query.products.findFirst({
        where: eq(products.id, scope.scopeRefId),
        columns: { organizationId: true },
      })
      organizationId = product?.organizationId || null
    }

    return {
      scopeType: scope.scopeType,
      scopeRefId: scope.scopeRefId,
      organizationId,
      canEditTeamWide: scope.canEditTeamWide,
    }
  }, {
    query: t.Object({
      scopeType: scopeTypeSchema,
      productId: t.Optional(t.String()),
      organizationId: t.Optional(t.String()),
    }),
  })
