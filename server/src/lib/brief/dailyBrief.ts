import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { Document } from '@langchain/core/documents'
import { PromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { getHomeBriefConfig } from '../../config/brief'
import { db } from '../../db'
import {
  deliveries,
  initiatives,
  organizationTeamMembers,
  releaseDeliveries,
  releases,
  stories,
  tasks,
} from '../../db/schema'

export type HomeBriefView = 'my_tasks' | 'team' | 'executive'
export type HomeBriefMode = 'summary' | 'full'
export type HomeBriefSource = 'ai' | 'fallback' | 'disabled'
export type HomeBriefStrategy = 'single' | 'chunked'
export type HomeBriefFallbackReason =
  | 'feature_disabled'
  | 'provider_not_ready'
  | 'missing_api_key'
  | 'provider_error'
  | 'timeout'
  | 'parse_error'
  | 'empty_sanitized_output'
export type HomeBriefScope = 'all_products' | 'product' | 'entity'
export type HomeBriefTemplate =
  | 'executive_narrative'
  | 'delivery_risk'
  | 'workload_focus'
  | 'entity_deep_dive'
export type HomeBriefEntityFocusType = 'task' | 'story' | 'initiative' | 'delivery' | 'release'
export type DailyBriefItemSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type DailyBriefEntityType =
  | 'task'
  | 'story'
  | 'initiative'
  | 'delivery'
  | 'release'
  | 'test_cycle'
  | 'user'
  | 'wiki_asset'

export interface DailyBriefSectionItem {
  text: string
  severity?: DailyBriefItemSeverity
  entityType?: DailyBriefEntityType
  entityId?: string
  routePath?: string
}

export interface DailyBriefSection {
  id: string
  title: string
  items: DailyBriefSectionItem[]
}

interface BriefTaskFact {
  id: string
  title: string
  status: string
  priority: string
  dueAt: string | null
  signals: string[]
}

interface PersonalFacts {
  totalAssigned: number
  totalCompleted: number
  activeCount: number
  overdueCount: number
  blockedCount: number
  dueTodayCount: number
  dueThisWeekCount: number
  topPriorities: string[]
  riskHighlights: string[]
  topPriorityTasks: BriefTaskFact[]
  riskTasks: BriefTaskFact[]
  candidateTasks: BriefTaskFact[]
}

interface ProductFacts {
  activeCount: number
  blockedCount: number
  overdueCount: number
  overduePct: number
  overloadedMembers: number
  atRiskDeliveries: number
}

export interface DailyBriefInput {
  userId: string
  scope?: HomeBriefScope
  template?: HomeBriefTemplate | string | null
  entityType?: HomeBriefEntityFocusType | null
  entityId?: string | null
  scopeMode?: 'all' | 'product' | 'team'
  view?: HomeBriefView
  mode?: HomeBriefMode
  productId?: string | null
  productIds?: string[]
  teamId?: string | null
}

export interface DailyBriefResponse {
  brief: string
  sections: DailyBriefSection[]
  generatedAt: string
  source: HomeBriefSource
  fallbackReason: HomeBriefFallbackReason | null
  view: HomeBriefView
  mode: HomeBriefMode
  scope: HomeBriefScope
  template: HomeBriefTemplate
  strategy: HomeBriefStrategy
  productId: string | null
  entityFocus: {
    entityType: HomeBriefEntityFocusType
    entityId: string
    entityLabel: string
  } | null
  cached: boolean
}

interface DailyBriefCacheEntry {
  payload: Omit<DailyBriefResponse, 'cached'>
  cachedAt: number
  expiresAt: number
}

const briefCache = new Map<string, DailyBriefCacheEntry>()
const SUMMARY_BRIEF_MAX_CHARS = 2600
const FULL_BRIEF_MAX_CHARS = 7000

function cacheDailyBriefPayload(
  cacheKey: string,
  payload: Omit<DailyBriefResponse, 'cached'>,
  ttlMs: number,
) {
  if (ttlMs <= 0) {
    briefCache.delete(cacheKey)
    return
  }
  const cachedAt = Date.now()
  briefCache.set(cacheKey, {
    payload,
    cachedAt,
    expiresAt: cachedAt + ttlMs,
  })
}

function normalizeDailyBriefItemSeverity(value: unknown): DailyBriefItemSeverity {
  if (value === 'low') return 'low'
  if (value === 'medium') return 'medium'
  if (value === 'high') return 'high'
  if (value === 'critical') return 'critical'
  return 'info'
}

function normalizeDailyBriefSections(input: unknown): DailyBriefSection[] {
  if (!Array.isArray(input)) return []
  return input.map((section, index) => {
    const row = (section ?? {}) as Record<string, unknown>
    const rawItems = Array.isArray(row.items) ? row.items : []
    return {
      id: typeof row.id === 'string' && row.id.trim().length > 0
        ? row.id.trim()
        : `section_${index + 1}`,
      title: typeof row.title === 'string' && row.title.trim().length > 0
        ? row.title.trim()
        : `Section ${index + 1}`,
      items: rawItems.map((item) => {
        const value = (item ?? {}) as Record<string, unknown>
        const text = typeof value.text === 'string' && value.text.trim().length > 0
          ? value.text.trim()
          : 'No details available.'
        const entityType = typeof value.entityType === 'string' && value.entityType.trim().length > 0
          ? value.entityType.trim() as DailyBriefEntityType
          : undefined
        const entityId = typeof value.entityId === 'string' && value.entityId.trim().length > 0
          ? value.entityId.trim()
          : undefined
        const routePath = typeof value.routePath === 'string' && value.routePath.trim().length > 0
          ? value.routePath.trim()
          : undefined
        return {
          text,
          severity: normalizeDailyBriefItemSeverity(value.severity),
          entityType,
          entityId,
          routePath,
        }
      }),
    }
  })
}

function normalizeDailyBriefResponse(payload: DailyBriefResponse): DailyBriefResponse {
  const source = payload.source === 'ai' || payload.source === 'disabled' ? payload.source : 'fallback'
  const view = payload.view === 'team' || payload.view === 'executive' ? payload.view : 'my_tasks'
  const mode = payload.mode === 'full' ? 'full' : 'summary'
  const scope = payload.scope === 'product' || payload.scope === 'entity' ? payload.scope : 'all_products'
  const template = payload.template === 'delivery_risk'
    || payload.template === 'workload_focus'
    || payload.template === 'entity_deep_dive'
    ? payload.template
    : 'executive_narrative'
  const strategy = payload.strategy === 'chunked' ? 'chunked' : 'single'
  const productId = typeof payload.productId === 'string' && payload.productId.trim().length > 0
    ? payload.productId.trim()
    : null
  const fallbackReason = source === 'ai'
    ? null
    : payload.fallbackReason === 'feature_disabled'
      || payload.fallbackReason === 'provider_not_ready'
      || payload.fallbackReason === 'missing_api_key'
      || payload.fallbackReason === 'provider_error'
      || payload.fallbackReason === 'timeout'
      || payload.fallbackReason === 'parse_error'
      || payload.fallbackReason === 'empty_sanitized_output'
      ? payload.fallbackReason
      : source === 'disabled'
        ? 'feature_disabled'
        : 'provider_error'
  const entityFocus = payload.entityFocus && typeof payload.entityFocus === 'object'
    && typeof payload.entityFocus.entityType === 'string'
    && typeof payload.entityFocus.entityId === 'string'
    && payload.entityFocus.entityId.trim().length > 0
    ? {
      entityType: payload.entityFocus.entityType,
      entityId: payload.entityFocus.entityId.trim(),
      entityLabel: typeof payload.entityFocus.entityLabel === 'string' ? payload.entityFocus.entityLabel : '',
    }
    : null

  return {
    brief: typeof payload.brief === 'string' ? payload.brief : '',
    sections: normalizeDailyBriefSections(payload.sections),
    generatedAt: typeof payload.generatedAt === 'string' && payload.generatedAt.trim().length > 0
      ? payload.generatedAt
      : new Date().toISOString(),
    source,
    fallbackReason,
    view,
    mode,
    scope,
    template,
    strategy,
    productId,
    entityFocus,
    cached: Boolean(payload.cached),
  }
}

function toDateMs(input: string | Date | null | undefined): number | null {
  if (!input) return null
  const parsed = new Date(input).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function getCacheKey(
  input: DailyBriefInput,
  view: HomeBriefView,
  mode: HomeBriefMode,
  scope: HomeBriefScope,
  template: HomeBriefTemplate,
  productIds: string[],
  entityFocus: {
    entityType: HomeBriefEntityFocusType
    entityId: string
  } | null,
): string {
  const dayKey = new Date().toISOString().slice(0, 10)
  const normalizedProductIds = [...new Set(
    productIds
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )].sort()
  const fallbackProductId = typeof input.productId === 'string' ? input.productId.trim() : ''
  if (fallbackProductId.length > 0 && !normalizedProductIds.includes(fallbackProductId)) {
    normalizedProductIds.push(fallbackProductId)
  }
  const teamKey = input.teamId?.trim() || 'none'
  const productKey = normalizedProductIds.length > 0 ? normalizedProductIds.join(',') : 'none'
  const entityKey = entityFocus
    ? `${entityFocus.entityType}:${entityFocus.entityId}`
    : 'none'
  return `${dayKey}:${input.userId}:${scope}:${teamKey}:${productKey}:${entityKey}:${template}:${view}:${mode}`
}

function sanitizeBrief(raw: string, mode: HomeBriefMode): string {
  const normalized = raw
    .replaceAll('\u0000', '')
    .replace(/\r\n/g, '\n')
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*[a-zA-Z][a-zA-Z0-9-]*\b[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const maxChars = mode === 'full' ? FULL_BRIEF_MAX_CHARS : SUMMARY_BRIEF_MAX_CHARS
  return normalized.slice(0, maxChars)
}

function clipTaskTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed.length <= 80) return trimmed
  return `${trimmed.slice(0, 77)}...`
}

function priorityWeight(value: string): number {
  if (value === 'critical') return 4
  if (value === 'high') return 3
  if (value === 'medium') return 2
  return 1
}

function teamArraySql(teamIds: string[]) {
  return sql`ARRAY[${sql.join(teamIds.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`
}

function buildTaskRoutePath(taskId: string): string {
  return `/tasks?task=${encodeURIComponent(taskId)}`
}

async function resolveEntityFocus(
  entityType: HomeBriefEntityFocusType,
  entityId: string,
): Promise<ResolvedEntityFocus | null> {
  if (entityType === 'task') {
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, entityId),
      columns: {
        id: true,
        title: true,
        productId: true,
      },
    })
    if (!task) return null
    return {
      entityType,
      entityId: task.id,
      entityLabel: task.title,
      productId: task.productId,
      relatedTaskIds: [task.id],
    }
  }

  if (entityType === 'story') {
    const story = await db.query.stories.findFirst({
      where: eq(stories.id, entityId),
      columns: {
        id: true,
        title: true,
        productId: true,
      },
    })
    if (!story) return null
    const relatedTasks = await db.select({ id: tasks.id }).from(tasks)
      .where(eq(tasks.storyId, story.id))
      .orderBy(desc(tasks.updatedAt))
      .limit(120)
    return {
      entityType,
      entityId: story.id,
      entityLabel: story.title,
      productId: story.productId,
      relatedTaskIds: relatedTasks.map((task) => task.id),
    }
  }

  if (entityType === 'initiative') {
    const initiative = await db.query.initiatives.findFirst({
      where: eq(initiatives.id, entityId),
      columns: {
        id: true,
        title: true,
        productId: true,
      },
    })
    if (!initiative) return null
    const relatedTasks = await db.select({ id: tasks.id }).from(tasks)
      .where(eq(tasks.initiativeId, initiative.id))
      .orderBy(desc(tasks.updatedAt))
      .limit(120)
    return {
      entityType,
      entityId: initiative.id,
      entityLabel: initiative.title,
      productId: initiative.productId,
      relatedTaskIds: relatedTasks.map((task) => task.id),
    }
  }

  if (entityType === 'delivery') {
    const delivery = await db.query.deliveries.findFirst({
      where: eq(deliveries.id, entityId),
      columns: {
        id: true,
        title: true,
        productId: true,
      },
    })
    if (!delivery) return null
    const relatedTasks = await db.select({ id: tasks.id }).from(tasks)
      .where(eq(tasks.deliveryId, delivery.id))
      .orderBy(desc(tasks.updatedAt))
      .limit(120)
    return {
      entityType,
      entityId: delivery.id,
      entityLabel: delivery.title,
      productId: delivery.productId,
      relatedTaskIds: relatedTasks.map((task) => task.id),
    }
  }

  const release = await db.query.releases.findFirst({
    where: eq(releases.id, entityId),
    columns: {
      id: true,
      title: true,
      productId: true,
    },
  })
  if (!release) return null

  const linkedDeliveryRows = await db.select({
    deliveryId: releaseDeliveries.deliveryId,
  }).from(releaseDeliveries).where(eq(releaseDeliveries.releaseId, release.id))

  const linkedDeliveryIds = [...new Set(linkedDeliveryRows.map((row) => row.deliveryId))]
  const relatedTasks = linkedDeliveryIds.length > 0
    ? await db.select({ id: tasks.id }).from(tasks)
      .where(inArray(tasks.deliveryId, linkedDeliveryIds))
      .orderBy(desc(tasks.updatedAt))
      .limit(120)
    : await db.select({ id: tasks.id }).from(tasks)
      .where(eq(tasks.productId, release.productId))
      .orderBy(desc(tasks.updatedAt))
      .limit(120)

  return {
    entityType,
    entityId: release.id,
    entityLabel: release.title,
    productId: release.productId,
    relatedTaskIds: relatedTasks.map((task) => task.id),
  }
}

export async function resolveDailyBriefEntityFocus(
  entityType: unknown,
  entityId: unknown,
): Promise<ResolvedEntityFocus | null> {
  const normalizedType = normalizeEntityType(entityType)
  const normalizedId = normalizeEntityId(entityId)
  if (!normalizedType || !normalizedId) return null
  return resolveEntityFocus(normalizedType, normalizedId)
}

function normalizeFieldText(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.trim().slice(0, 400)
}

function normalizeBriefMarkdownText(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.trim()
}

function normalizeBriefScope(input: DailyBriefInput): HomeBriefScope {
  if (input.scope === 'product') return 'product'
  if (input.scope === 'entity') return 'entity'
  if (input.scope === 'all_products') return 'all_products'
  if (input.scopeMode === 'product') return 'product'
  return 'all_products'
}

function normalizeBriefTemplate(input: unknown, scope: HomeBriefScope): HomeBriefTemplate {
  if (input === 'delivery_risk') return 'delivery_risk'
  if (input === 'workload_focus') return 'workload_focus'
  if (input === 'entity_deep_dive' && scope === 'entity') return 'entity_deep_dive'
  return 'executive_narrative'
}

function normalizeEntityType(input: unknown): HomeBriefEntityFocusType | null {
  if (input === 'task') return 'task'
  if (input === 'story') return 'story'
  if (input === 'initiative') return 'initiative'
  if (input === 'delivery') return 'delivery'
  if (input === 'release') return 'release'
  return null
}

function normalizeEntityId(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const normalized = input.trim()
  return normalized.length > 0 ? normalized : null
}

interface ResolvedEntityFocus {
  entityType: HomeBriefEntityFocusType
  entityId: string
  entityLabel: string
  productId: string
  relatedTaskIds: string[]
}

function buildProductSignals(product: ProductFacts): string[] {
  const signals: string[] = []
  if (product.overduePct >= 25) {
    signals.push(`Overdue pressure is high at ${product.overduePct}% of active work.`)
  } else if (product.overduePct >= 15) {
    signals.push(`Overdue pressure is elevated at ${product.overduePct}% of active work.`)
  }
  if (product.blockedCount >= 5) {
    signals.push(`Blocked queue is high with ${product.blockedCount} blocked tasks.`)
  } else if (product.blockedCount > 0) {
    signals.push(`${product.blockedCount} blocked tasks need unblock plans.`)
  }
  if (product.overloadedMembers >= 3) {
    signals.push(`${product.overloadedMembers} owners are overloaded and need workload balancing.`)
  } else if (product.overloadedMembers > 0) {
    signals.push(`${product.overloadedMembers} owner(s) are above expected capacity.`)
  }
  if (product.atRiskDeliveries > 0) {
    signals.push(`${product.atRiskDeliveries} delivery milestone(s) are currently at risk.`)
  }
  if (signals.length === 0) {
    signals.push('No major portfolio-level risk spikes were detected from current metrics.')
  }
  return signals
}

function inferSeverity(text: string): DailyBriefItemSeverity {
  const normalized = text.toLowerCase()
  if (normalized.includes('critical') || normalized.includes('overdue') || normalized.includes('blocked')) {
    return 'high'
  }
  if (normalized.includes('risk') || normalized.includes('elevated') || normalized.includes('high')) {
    return 'medium'
  }
  if (normalized.includes('no ') || normalized.includes('healthy')) {
    return 'low'
  }
  return 'info'
}

function buildStructuredSections(
  view: HomeBriefView,
  mode: HomeBriefMode,
  personal: PersonalFacts,
  product: ProductFacts | null,
): DailyBriefSection[] {
  const sections: DailyBriefSection[] = []

  sections.push({
    id: 'snapshot',
    title: 'Snapshot',
    items: [
      { text: `Active tasks: ${personal.activeCount}`, severity: 'info' },
      { text: `Overdue tasks: ${personal.overdueCount}`, severity: personal.overdueCount > 0 ? 'high' : 'low' },
      { text: `Blocked tasks: ${personal.blockedCount}`, severity: personal.blockedCount > 0 ? 'high' : 'low' },
      { text: `Due today: ${personal.dueTodayCount}`, severity: personal.dueTodayCount > 0 ? 'medium' : 'low' },
      { text: `Due in next 7 days: ${personal.dueThisWeekCount}`, severity: 'info' },
      { text: `Completed vs assigned: ${personal.totalCompleted}/${personal.totalAssigned}`, severity: 'info' },
      ...(product
        ? [
          { text: `Product active tasks: ${product.activeCount}`, severity: 'info' as const },
          {
            text: `Product overdue rate: ${product.overduePct}%`,
            severity: product.overduePct >= 15 ? 'high' as const : 'low' as const,
          },
          {
            text: `At-risk deliveries: ${product.atRiskDeliveries}`,
            severity: product.atRiskDeliveries > 0 ? 'high' as const : 'low' as const,
          },
        ]
        : []),
    ],
  })

  sections.push({
    id: 'priorities',
    title: 'Priorities',
    items: (personal.topPriorityTasks.length > 0
      ? personal.topPriorityTasks.map((item) => ({
        text: `${item.title}${item.signals.length > 0 ? ` - ${item.signals.join(', ')}` : ''}`,
        severity: inferSeverity(item.priority),
        entityType: 'task',
        entityId: item.id,
        routePath: buildTaskRoutePath(item.id),
      }))
      : [{ text: 'No urgent task titles were detected for the next seven days.', severity: 'low' as const }]),
  })

  const riskItems = [
    ...(personal.riskTasks.length > 0
      ? personal.riskTasks.map((item) => ({
        text: `${item.title}${item.signals.length > 0 ? ` - ${item.signals.join(', ')}` : ''}`,
        severity: inferSeverity(item.signals.join(' ')),
        entityType: 'task',
        entityId: item.id,
        routePath: buildTaskRoutePath(item.id),
      }))
      : [{ text: 'No specific task-level risk highlights were detected from current task data.', severity: 'low' as const }]),
    ...(product ? buildProductSignals(product).map((item) => ({ text: item, severity: inferSeverity(item) })) : []),
  ]
  sections.push({
    id: 'risks',
    title: view === 'executive' ? 'Risk Register' : 'Risks To Watch',
    items: riskItems.slice(0, mode === 'full' ? 8 : 5),
  })

  sections.push({
    id: 'actions',
    title: 'Recommended Actions',
    items: mode === 'full'
      ? [
        { text: 'Today: unblock high-impact blocked tasks and resolve urgent ownership gaps.', severity: 'medium' },
        { text: 'This week: reduce overdue pressure with explicit mitigation owners.', severity: 'medium' },
        { text: 'Review staffing: rebalance overloaded contributors and cap parallel WIP.', severity: 'medium' },
      ]
      : [
        { text: 'Clear blocked work first and confirm owners for overdue tasks.', severity: 'medium' },
        { text: 'Recheck today + 7-day due commitments and rebalance where needed.', severity: 'medium' },
      ],
  })

  return sections
}

function buildFallbackBrief(
  view: HomeBriefView,
  mode: HomeBriefMode,
  personal: PersonalFacts,
  product: ProductFacts | null,
): string {
  const viewLabel =
    view === 'executive'
      ? 'Executive'
      : view === 'team'
        ? 'Team'
        : 'Personal'
  const snapshotLines = [
    `- Active tasks: ${personal.activeCount}`,
    `- Overdue tasks: ${personal.overdueCount}`,
    `- Blocked tasks: ${personal.blockedCount}`,
    `- Due today: ${personal.dueTodayCount}`,
    `- Due in next 7 days: ${personal.dueThisWeekCount}`,
    `- Completed vs assigned: ${personal.totalCompleted}/${personal.totalAssigned}`,
  ]
  if (product) {
    snapshotLines.push(`- Product active tasks: ${product.activeCount}`)
    snapshotLines.push(`- Product overdue rate: ${product.overduePct}%`)
    snapshotLines.push(`- At-risk deliveries: ${product.atRiskDeliveries}`)
  }

  const priorityLines = personal.topPriorities.length > 0
    ? personal.topPriorities.map((item) => `- ${item}`)
    : ['- No urgent task titles were detected for the next seven days.']
  const riskLines = personal.riskHighlights.length > 0
    ? personal.riskHighlights.slice(0, mode === 'full' ? 5 : 3).map((item) => `- ${item}`)
    : ['- No specific task-level risk highlights were detected from current task data.']
  const productSignals = product ? buildProductSignals(product).map((item) => `- ${item}`) : []

  if (mode === 'summary') {
    return [
      '## Snapshot',
      ...snapshotLines,
      '',
      '## Priorities',
      ...priorityLines,
      '',
      '## Risks To Watch',
      ...riskLines,
      ...(productSignals.length > 0 ? ['', ...productSignals] : []),
      '',
      '## Next Actions',
      '- [ ] Clear blocked work first and confirm owners for overdue tasks.',
      '- [ ] Recheck today + 7-day due commitments and rebalance where needed.',
    ].join('\n')
  }

  return [
    '## Executive Summary',
    `${viewLabel} briefing baseline: ${personal.activeCount} active tasks with ${personal.overdueCount} overdue and ${personal.blockedCount} blocked.`,
    '',
    '## Key Signals',
    ...snapshotLines,
    '',
    '## Priority Focus',
    ...priorityLines,
    '',
    '## Risk Register',
    ...riskLines,
    ...(productSignals.length > 0 ? ['', ...productSignals] : []),
    '',
    '## Recommended Plan',
    '- [ ] Today: unblock high-impact blocked tasks and resolve urgent ownership gaps.',
    '- [ ] This week: reduce overdue pressure by moving risky work to explicit mitigation owners.',
    '- [ ] Review staffing: rebalance overloaded contributors and cap parallel work-in-progress.',
    '',
    '## Watchlist Metrics',
    `- Completed vs assigned ratio: ${personal.totalCompleted}/${personal.totalAssigned}`,
    `- Today commitments: ${personal.dueTodayCount}`,
    `- Week commitments: ${personal.dueThisWeekCount}`,
    ...(product ? [`- Delivery risk count: ${product.atRiskDeliveries}`] : []),
  ].join('\n')
}

async function collectPersonalFacts(
  userId: string,
  options: {
    productIds?: string[]
    teamId?: string | null
    restrictTaskIds?: string[]
  } = {},
): Promise<PersonalFacts> {
  const scopeProductIds = [...new Set(
    (options.productIds || [])
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )]
  const scopeTeamId = typeof options.teamId === 'string' && options.teamId.trim().length > 0
    ? options.teamId.trim()
    : null
  const restrictedTaskIds = [...new Set(
    (options.restrictTaskIds || [])
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )]
  const emptyFacts: PersonalFacts = {
    totalAssigned: 0,
    totalCompleted: 0,
    activeCount: 0,
    overdueCount: 0,
    blockedCount: 0,
    dueTodayCount: 0,
    dueThisWeekCount: 0,
    topPriorities: [],
    riskHighlights: [],
    topPriorityTasks: [],
    riskTasks: [],
    candidateTasks: [],
  }

  if (options.productIds && scopeProductIds.length === 0) {
    return emptyFacts
  }
  if (options.restrictTaskIds && restrictedTaskIds.length === 0) {
    return emptyFacts
  }

  const teamMemberships = await db.query.organizationTeamMembers.findMany({
    where: eq(organizationTeamMembers.userId, userId),
    columns: { organizationTeamId: true },
  })
  const teamIds = [...new Set(teamMemberships.map((membership) => membership.organizationTeamId))]
  const teamConditions: any[] = []
  if (teamIds.length > 0) {
    const teamArray = teamArraySql(teamIds)
    teamConditions.push(inArray(tasks.ownerTeamId, teamIds))
    teamConditions.push(sql`${tasks.assigneeTeamIds} && ${teamArray}`)
    teamConditions.push(sql`${tasks.reviewerTeamIds} && ${teamArray}`)
  }

  const scopeConditions: any[] = []
  if (scopeProductIds.length > 0) {
    scopeConditions.push(inArray(tasks.productId, scopeProductIds))
  }
  if (scopeTeamId) {
    scopeConditions.push(or(
      eq(tasks.ownerTeamId, scopeTeamId),
      sql`${tasks.assigneeTeamIds} && ARRAY[${scopeTeamId}::uuid]::uuid[]`,
      sql`${tasks.reviewerTeamIds} && ARRAY[${scopeTeamId}::uuid]::uuid[]`,
    ))
  }
  if (restrictedTaskIds.length > 0) {
    scopeConditions.push(inArray(tasks.id, restrictedTaskIds))
  }

  const userTasks = await db.select({
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    dueAt: tasks.dueAt,
    priority: tasks.priority,
    updatedAt: tasks.updatedAt,
  }).from(tasks).where(and(
    or(
      eq(tasks.ownerUserId, userId),
      eq(tasks.createdByUserId, userId),
      sql`${userId} = any(${tasks.assigneeUserIds})`,
      sql`${userId} = any(${tasks.reviewerUserIds})`,
      ...(teamConditions as any[]),
    ),
    ...(scopeConditions as any[]),
  )).orderBy(desc(tasks.updatedAt), desc(tasks.createdAt), desc(tasks.id))

  const now = Date.now()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayMs = startOfToday.getTime()
  const tomorrowMs = todayMs + 24 * 60 * 60 * 1000
  const weekMs = todayMs + 7 * 24 * 60 * 60 * 1000

  const doneStatuses = new Set(['done', 'archived'])
  const activeTasks = userTasks.filter((task) => !doneStatuses.has(task.status))
  const totalAssigned = userTasks.length
  const totalCompleted = userTasks.filter((task) => task.status === 'done').length
  const overdueTasks = activeTasks.filter((task) => {
    const dueAt = toDateMs(task.dueAt)
    return dueAt !== null && dueAt < now
  })
  const blockedTasks = activeTasks.filter((task) => task.status === 'blocked')
  const dueTodayTasks = activeTasks.filter((task) => {
    const dueAt = toDateMs(task.dueAt)
    return dueAt !== null && dueAt >= todayMs && dueAt < tomorrowMs
  })
  const dueThisWeekTasks = activeTasks.filter((task) => {
    const dueAt = toDateMs(task.dueAt)
    return dueAt !== null && dueAt >= todayMs && dueAt < weekMs
  })

  const prioritizedTasks = [...activeTasks]
    .sort((a, b) => {
      const byPriority = priorityWeight(b.priority) - priorityWeight(a.priority)
      if (byPriority !== 0) return byPriority
      const dueA = toDateMs(a.dueAt) ?? Number.POSITIVE_INFINITY
      const dueB = toDateMs(b.dueAt) ?? Number.POSITIVE_INFINITY
      if (dueA !== dueB) return dueA - dueB
      const updatedA = toDateMs(a.updatedAt) ?? 0
      const updatedB = toDateMs(b.updatedAt) ?? 0
      return updatedB - updatedA
    })
    .slice(0, 4)
  const topPriorityTasks: BriefTaskFact[] = prioritizedTasks.map((task) => {
    const signals: string[] = []
    if (task.priority === 'critical' || task.priority === 'high') {
      signals.push(`${task.priority} priority`)
    }
    if (task.status === 'blocked') {
      signals.push('blocked')
    }
    const dueAt = toDateMs(task.dueAt)
    if (dueAt !== null) {
      if (dueAt < now) signals.push('overdue')
      else if (dueAt < tomorrowMs) signals.push('due today')
      else if (dueAt < weekMs) signals.push('due this week')
    }

    return {
      id: task.id,
      title: clipTaskTitle(task.title),
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt ? String(task.dueAt) : null,
      signals,
    }
  })
  const prioritized = topPriorityTasks.map((task) => task.title)
  const candidateTasks: BriefTaskFact[] = [...activeTasks]
    .sort((a, b) => {
      const byPriority = priorityWeight(b.priority) - priorityWeight(a.priority)
      if (byPriority !== 0) return byPriority
      const dueA = toDateMs(a.dueAt) ?? Number.POSITIVE_INFINITY
      const dueB = toDateMs(b.dueAt) ?? Number.POSITIVE_INFINITY
      if (dueA !== dueB) return dueA - dueB
      const updatedA = toDateMs(a.updatedAt) ?? 0
      const updatedB = toDateMs(b.updatedAt) ?? 0
      return updatedB - updatedA
    })
    .slice(0, 100)
    .map((task) => {
      const signals: string[] = []
      if (task.priority === 'critical' || task.priority === 'high') {
        signals.push(`${task.priority} priority`)
      }
      if (task.status === 'blocked') {
        signals.push('blocked')
      }
      const dueAt = toDateMs(task.dueAt)
      if (dueAt !== null) {
        if (dueAt < now) signals.push('overdue')
        else if (dueAt < tomorrowMs) signals.push('due today')
        else if (dueAt < weekMs) signals.push('due this week')
      }
      return {
        id: task.id,
        title: clipTaskTitle(task.title),
        status: task.status,
        priority: task.priority,
        dueAt: task.dueAt ? String(task.dueAt) : null,
        signals,
      }
    })

  const riskRanked = [...activeTasks].sort((a, b) => {
    const score = (task: typeof activeTasks[number]): number => {
      let rank = priorityWeight(task.priority) * 10
      if (task.status === 'blocked') rank += 120
      const dueAt = toDateMs(task.dueAt)
      if (dueAt !== null) {
        if (dueAt < now) rank += 100
        else if (dueAt < tomorrowMs) rank += 50
        else if (dueAt < weekMs) rank += 25
      }
      return rank
    }

    const byScore = score(b) - score(a)
    if (byScore !== 0) return byScore
    const updatedA = toDateMs(a.updatedAt) ?? 0
    const updatedB = toDateMs(b.updatedAt) ?? 0
    return updatedB - updatedA
  })

  const riskHighlights: string[] = []
  const riskTasks: BriefTaskFact[] = []
  const seenTaskIds = new Set<string>()
  for (const task of riskRanked) {
    if (seenTaskIds.has(task.id)) continue
    seenTaskIds.add(task.id)
    const title = clipTaskTitle(task.title)

    const dueAt = toDateMs(task.dueAt)
    const signals: string[] = []
    if (task.priority === 'critical' || task.priority === 'high') {
      signals.push(`${task.priority} priority`)
    }
    if (task.status === 'blocked') {
      signals.push('blocked')
    }
    if (dueAt !== null) {
      if (dueAt < now) {
        const overdueDays = Math.max(1, Math.floor((now - dueAt) / (24 * 60 * 60 * 1000)))
        signals.push(`overdue ${overdueDays}d`)
      } else if (dueAt < tomorrowMs) {
        signals.push('due today')
      } else if (dueAt < weekMs) {
        signals.push('due this week')
      }
    }

    riskHighlights.push(`${title}${signals.length > 0 ? ` - ${signals.join(', ')}` : ''}`)
    riskTasks.push({
      id: task.id,
      title,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt ? String(task.dueAt) : null,
      signals,
    })
    if (riskHighlights.length >= 6) break
  }

  return {
    totalAssigned,
    totalCompleted,
    activeCount: activeTasks.length,
    overdueCount: overdueTasks.length,
    blockedCount: blockedTasks.length,
    dueTodayCount: dueTodayTasks.length,
    dueThisWeekCount: dueThisWeekTasks.length,
    topPriorities: prioritized,
    riskHighlights,
    topPriorityTasks,
    riskTasks,
    candidateTasks,
  }
}

async function collectProductFacts(productIds: string[]): Promise<ProductFacts | null> {
  const normalizedProductIds = [...new Set(
    productIds
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )]
  if (normalizedProductIds.length === 0) return null
  const productFilterSql = sql`${sql.raw('product_id')} in (${sql.join(
    normalizedProductIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`
  const [row] = await db.execute(sql`
    select
      count(*) filter (where status not in ('done', 'archived'))::int as active_count,
      count(*) filter (where status = 'blocked')::int as blocked_count,
      count(*) filter (
        where status not in ('done', 'archived')
          and due_at is not null
          and due_at < now()
      )::int as overdue_count
    from tasks
    where ${productFilterSql}
  `)

  const [deliveryRow] = await db.execute(sql`
    select
      count(*) filter (where status in ('blocked', 'overdue'))::int as at_risk_deliveries
    from deliveries
    where ${productFilterSql}
  `)

  const [overloadRow] = await db.execute(sql`
    with relevant_tasks as (
      select status, owner_user_id, assignee_user_ids, owner_team_id, assignee_team_ids
      from tasks
      where ${productFilterSql}
        and status not in ('done', 'archived')
    ),
    task_users as (
      select owner_user_id as user_id
      from relevant_tasks
      where owner_user_id is not null
      union all
      select unnest(assignee_user_ids) as user_id
      from relevant_tasks
      where assignee_user_ids is not null
      union all
      select otm.user_id
      from relevant_tasks rt
      inner join organization_team_members otm
        on otm.organization_team_id = rt.owner_team_id
      where rt.owner_team_id is not null
      union all
      select otm.user_id
      from relevant_tasks rt
      cross join lateral unnest(rt.assignee_team_ids) as assignee_team(team_id)
      inner join organization_team_members otm
        on otm.organization_team_id = assignee_team.team_id
      where rt.assignee_team_ids is not null
    ),
    by_user as (
      select user_id, count(*)::int as wip_count
      from task_users
      group by user_id
    )
    select count(*)::int as overloaded_members
    from by_user
    where wip_count > 5
  `)

  const summaryRow = (row ?? {}) as Record<string, unknown>
  const deliverySummaryRow = (deliveryRow ?? {}) as Record<string, unknown>
  const overloadSummaryRow = (overloadRow ?? {}) as Record<string, unknown>

  const active = Number(summaryRow.active_count ?? 0)
  const blocked = Number(summaryRow.blocked_count ?? 0)
  const overdue = Number(summaryRow.overdue_count ?? 0)
  const overduePct = active > 0 ? Math.round((overdue / active) * 100) : 0

  return {
    activeCount: active,
    blockedCount: blocked,
    overdueCount: overdue,
    overduePct,
    overloadedMembers: Number(overloadSummaryRow.overloaded_members ?? 0),
    atRiskDeliveries: Number(deliverySummaryRow.at_risk_deliveries ?? 0),
  }
}

interface AiBriefPayload {
  briefMarkdown: string
  sections: DailyBriefSection[]
}

function extractJsonValue(raw: string): unknown {
  const direct = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return JSON.parse(direct) as unknown
  } catch {
    const firstBrace = direct.indexOf('{')
    const lastBrace = direct.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(direct.slice(firstBrace, lastBrace + 1)) as unknown
    }
    throw new Error('no JSON object found in AI response')
  }
}

function normalizeSeverity(value: unknown, fallbackText: string): DailyBriefItemSeverity {
  if (value === 'info' || value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value
  }
  return inferSeverity(fallbackText)
}

function normalizeAiSections(rawSections: unknown, knownTaskIds: Set<string>): DailyBriefSection[] {
  if (!Array.isArray(rawSections)) return []
  const normalized: DailyBriefSection[] = []

  for (let index = 0; index < rawSections.length; index += 1) {
    const section = rawSections[index] as Record<string, unknown>
    if (!section || typeof section !== 'object') continue

    const idRaw = normalizeFieldText(section.id)
    const id = idRaw.length > 0
      ? idRaw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `section_${index + 1}`
      : `section_${index + 1}`
    const title = normalizeFieldText(section.title) || `Section ${index + 1}`

    const itemsRaw = Array.isArray(section.items) ? section.items : []
    const items: DailyBriefSectionItem[] = []
    for (const rawItem of itemsRaw) {
      const item = rawItem as Record<string, unknown>
      if (!item || typeof item !== 'object') continue
      const text = normalizeFieldText(item.text)
      if (text.length === 0) continue

      const normalizedItem: DailyBriefSectionItem = {
        text,
        severity: normalizeSeverity(item.severity, text),
      }

      const entityType = normalizeFieldText(item.entityType).toLowerCase()
      const entityId = normalizeFieldText(item.entityId)
      if (entityType === 'task' && entityId.length > 0 && knownTaskIds.has(entityId)) {
        normalizedItem.entityType = 'task'
        normalizedItem.entityId = entityId
        normalizedItem.routePath = buildTaskRoutePath(entityId)
      }

      items.push(normalizedItem)
      if (items.length >= 12) break
    }

    if (items.length === 0) continue
    normalized.push({ id, title, items })
    if (normalized.length >= 8) break
  }

  return normalized
}

function parseAiBriefPayload(raw: string, knownTaskIds: Set<string>): AiBriefPayload | null {
  try {
    const value = extractJsonValue(raw) as Record<string, unknown>
    const briefMarkdown = normalizeBriefMarkdownText(value.briefMarkdown)
    const sections = normalizeAiSections(value.sections, knownTaskIds)
    if (briefMarkdown.length === 0) return null
    return {
      briefMarkdown,
      sections,
    }
  } catch {
    return null
  }
}

function buildKnownTaskMap(personal: PersonalFacts): Map<string, string> {
  const map = new Map<string, string>()
  const linkableTasks = [...personal.candidateTasks, ...personal.topPriorityTasks, ...personal.riskTasks]
  for (const task of linkableTasks) {
    if (!map.has(task.id)) {
      map.set(task.id, task.title)
    }
  }
  return map
}

function validateInlineReferenceTokens(markdownValue: string, knownTaskMap: Map<string, string>): string {
  return markdownValue.replace(
    /\[\[([a-z_]+):([a-z0-9-]+)\|([^\]]+?)\]\]/gi,
    (_match, rawType: string, rawId: string, rawLabel: string) => {
      const entityType = String(rawType || '').toLowerCase()
      const entityId = String(rawId || '').trim()
      const displayLabel = String(rawLabel || '').trim()

      if (entityType === 'task' && entityId.length > 0 && knownTaskMap.has(entityId)) {
        const fallbackTitle = knownTaskMap.get(entityId) || ''
        const safeLabel = displayLabel.length > 0 ? displayLabel : fallbackTitle
        return `[[task:${entityId}|${safeLabel}]]`
      }

      if (displayLabel.length > 0) return displayLabel
      if (entityType === 'task' && entityId.length > 0 && knownTaskMap.has(entityId)) {
        return knownTaskMap.get(entityId) || 'Task'
      }
      return ''
    },
  )
}

function buildChunkedTaskSummaries(taskFacts: BriefTaskFact[], chunkSize = 14): string[] {
  const chunks: string[] = []
  for (let start = 0; start < taskFacts.length; start += chunkSize) {
    const chunk = taskFacts.slice(start, start + chunkSize)
    if (chunk.length === 0) continue
    const blocked = chunk.filter((task) => task.status === 'blocked').length
    const overdue = chunk.filter((task) => task.signals.some((signal) => signal.includes('overdue'))).length
    const criticalOrHigh = chunk.filter((task) => task.priority === 'critical' || task.priority === 'high').length
    const topTitles = chunk.slice(0, 3).map((task) => task.title).join(' | ') || 'none'
    chunks.push([
      `Chunk ${Math.floor(start / chunkSize) + 1}`,
      `- Tasks: ${chunk.length}`,
      `- Critical/high: ${criticalOrHigh}`,
      `- Blocked: ${blocked}`,
      `- Overdue: ${overdue}`,
      `- Top titles: ${topTitles}`,
    ].join('\n'))
  }
  return chunks
}

function buildContextDocuments(
  view: HomeBriefView,
  mode: HomeBriefMode,
  personal: PersonalFacts,
  product: ProductFacts | null,
  options: {
    scope: HomeBriefScope
    template: HomeBriefTemplate
    strategy: 'single' | 'chunked'
    entityFocus: ResolvedEntityFocus | null
  },
): Document[] {
  const docs: Document[] = []
  docs.push(new Document({
    metadata: { section: 'request_context' },
    pageContent: [
      'Request context',
      `- View: ${view}`,
      `- Mode: ${mode}`,
      `- Scope: ${options.scope}`,
      `- Template: ${options.template}`,
      `- Strategy: ${options.strategy}`,
      `- Product context included: ${product ? 'yes' : 'no'}`,
      ...(options.entityFocus
        ? [
          `- Entity focus type: ${options.entityFocus.entityType}`,
          `- Entity focus id: ${options.entityFocus.entityId}`,
          `- Entity focus label: ${options.entityFocus.entityLabel}`,
        ]
        : []),
    ].join('\n'),
  }))
  docs.push(new Document({
    metadata: { section: 'personal_metrics' },
    pageContent: [
      'Personal metrics',
      `- Active tasks: ${personal.activeCount}`,
      `- Overdue tasks: ${personal.overdueCount}`,
      `- Blocked tasks: ${personal.blockedCount}`,
      `- Due today: ${personal.dueTodayCount}`,
      `- Due in next 7 days: ${personal.dueThisWeekCount}`,
      `- Completed vs assigned: ${personal.totalCompleted}/${personal.totalAssigned}`,
      `- Top priorities: ${personal.topPriorities.join(' | ') || 'none'}`,
    ].join('\n'),
  }))
  if (options.strategy === 'chunked') {
    const chunkSummaries = buildChunkedTaskSummaries(
      personal.candidateTasks,
      mode === 'full' ? 12 : 16,
    )
    docs.push(new Document({
      metadata: { section: 'chunked_task_summaries' },
      pageContent: [
        'Chunked task context summaries',
        ...(chunkSummaries.length > 0
          ? chunkSummaries.slice(0, mode === 'full' ? 12 : 8)
          : ['- none']),
      ].join('\n\n'),
    }))
  } else {
    docs.push(new Document({
      metadata: { section: 'task_risk_highlights' },
      pageContent: [
        'Task-level risk highlights',
        ...(personal.riskHighlights.length > 0
          ? personal.riskHighlights.map((item) => `- ${item}`)
          : ['- No specific task-level risk highlights were detected.']),
      ].join('\n'),
    }))
  }

  const linkableTasks = [...personal.candidateTasks, ...personal.topPriorityTasks, ...personal.riskTasks]
    .filter((task, index, source) => source.findIndex((candidate) => candidate.id === task.id) === index)
    .slice(0, mode === 'full' ? 48 : 32)
  docs.push(new Document({
    metadata: { section: 'linkable_task_entities' },
    pageContent: [
      'Linkable task entities (use only these IDs when assigning entityId):',
      ...(linkableTasks.length > 0
        ? linkableTasks.map((task) => `- id=${task.id} | title=${task.title} | signals=${task.signals.join(', ') || 'none'}`)
        : ['- none']),
    ].join('\n'),
  }))
  if (product) {
    docs.push(new Document({
      metadata: { section: 'product_metrics' },
      pageContent: [
        'Product metrics',
        `- Product active tasks: ${product.activeCount}`,
        `- Product blocked tasks: ${product.blockedCount}`,
        `- Product overdue tasks: ${product.overdueCount}`,
        `- Product overdue percentage: ${product.overduePct}%`,
        `- Overloaded members: ${product.overloadedMembers}`,
        `- At-risk deliveries: ${product.atRiskDeliveries}`,
      ].join('\n'),
    }))
    docs.push(new Document({
      metadata: { section: 'product_signals' },
      pageContent: [
        'Product risk interpretation',
        ...buildProductSignals(product).map((item) => `- ${item}`),
      ].join('\n'),
    }))
  }
  return docs
}

function stuffContextDocuments(documents: Document[]): string {
  return documents
    .map((doc, index) => {
      const section = typeof doc.metadata?.section === 'string' ? String(doc.metadata.section) : `section_${index + 1}`
      return [`[Context ${index + 1}: ${section}]`, doc.pageContent].join('\n')
    })
    .join('\n\n')
}

function buildBriefPrompt(
  view: HomeBriefView,
  mode: HomeBriefMode,
  scope: HomeBriefScope,
  template: HomeBriefTemplate,
  entityFocus: ResolvedEntityFocus | null,
  hasProductContext: boolean,
): PromptTemplate {
  const templateInstruction = template === 'delivery_risk'
    ? 'Emphasize delivery slippage, dependency pressure, and mitigation sequencing.'
    : template === 'workload_focus'
      ? 'Emphasize WIP load, blocked ownership, and balancing recommendations.'
      : template === 'entity_deep_dive'
        ? 'Treat the selected entity as primary and summarize related work around it.'
        : 'Provide an executive operating narrative with balanced priorities, risks, and actions.'
  const narrativeContract = mode === 'full'
    ? [
      'briefMarkdown must use this markdown structure:',
      '## Briefing',
      'Write 2-4 short paragraphs in plain operational language (2-4 sentences each).',
      'Each paragraph should synthesize what is happening, why it matters, and where attention should go next.',
      'Embed concrete metrics in sentences when available (counts, percentages, due pressure).',
      '## Immediate Focus',
      'Write 1-2 concise sentences describing the most important next move.',
      'Target length: 260-420 words.',
      'Do not use checklists, numbered lists, or bullet lists in briefMarkdown.',
    ].join('\n')
    : [
      'briefMarkdown must use this markdown structure:',
      '## Briefing',
      'Write 2 short narrative paragraphs in plain language (2-3 sentences each).',
      'Focus on the highest-impact status and what needs attention now.',
      '## Immediate Focus',
      'Write exactly 1 concise sentence describing the immediate action.',
      'Target length: 130-220 words.',
      'Do not use checklists, numbered lists, or bullet lists in briefMarkdown.',
    ].join('\n')

  return PromptTemplate.fromTemplate([
    'You produce factual operational briefings for Productier home dashboards as strict JSON.',
    `Audience view: ${view}.`,
    `Brief mode: ${mode}.`,
    `Product-scoped context present: ${hasProductContext ? 'yes' : 'no'}.`,
    'briefMarkdown is the canonical output and must read like a human-written briefing, not a task dump.',
    'Use only information present in the context documents.',
    'Never invent numbers, entities, owners, deadlines, or task names.',
    'Do not write raw placeholder labels like "Task 9" or user IDs.',
    'When referencing a task in briefMarkdown, use inline token format [[task:<id>|<task title>]] only for IDs listed in linkable task entities.',
    'Use plain names for people when available; never expose user IDs.',
    'If data is missing, state uncertainty in prose without inventing facts.',
    'Respond with JSON only (no markdown fences, no prose outside JSON).',
    `Scope mode: ${scope}.`,
    `Template style: ${template}.`,
    entityFocus
      ? `Entity focus: ${entityFocus.entityType} "${entityFocus.entityLabel}" (${entityFocus.entityId}).`
      : 'Entity focus: none.',
    templateInstruction,
    'Required JSON keys:',
    '- briefMarkdown: string markdown narrative',
    '- sections: array of section objects',
    'Section object fields:',
    '- id: one of signals|priorities|risks|actions',
    '- title: section title',
    '- items: array of item objects',
    'Item object fields:',
    '- text: item text',
    '- severity: one of info|low|medium|high|critical',
    '- entityType: optional, only "task" when linkable',
    '- entityId: optional, must match one of linkable task entity IDs when entityType is task',
    'sections are optional supporting evidence and should stay compact (0-3 sections, 1-4 items each).',
    'Do not mirror all tasks into sections; include only strongest supporting evidence.',
    narrativeContract,
    'Only include entityType/entityId when a linkable task entity ID is available in context.',
    'Context documents:',
    '{context}',
  ].join('\n\n'))
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('daily brief request timed out')), timeoutMs)
    work
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

interface AiBriefSuccess {
  ok: true
  brief: string
  sections: DailyBriefSection[]
  strategy: HomeBriefStrategy
}

interface AiBriefFailure {
  ok: false
  reason: HomeBriefFallbackReason
  strategy: HomeBriefStrategy
}

type AiBriefResult = AiBriefSuccess | AiBriefFailure

function selectBriefStrategy(personal: PersonalFacts): HomeBriefStrategy {
  return personal.candidateTasks.length >= 48 ? 'chunked' : 'single'
}

function logFallbackReason(
  reason: HomeBriefFallbackReason,
  details: {
    scope: HomeBriefScope
    template: HomeBriefTemplate
    strategy: HomeBriefStrategy
    candidateTaskCount: number
    contextLength: number
    productContext: boolean
    entityFocus: string | null
    message?: string
    preview?: string
    provider?: string
    providerReady?: boolean
    providerReadinessIssue?: string | null
    apiKeySource?: string
  },
) {
  console.warn('[daily-brief] AI unavailable; using fallback brief', {
    reason,
    scope: details.scope,
    template: details.template,
    strategy: details.strategy,
    candidateTaskCount: details.candidateTaskCount,
    contextLength: details.contextLength,
    productContext: details.productContext,
    entityFocus: details.entityFocus,
    message: details.message,
    preview: details.preview,
    provider: details.provider,
    providerReady: details.providerReady,
    providerReadinessIssue: details.providerReadinessIssue,
    apiKeySource: details.apiKeySource,
  })
}

function previewValue(value: unknown, maxChars = 180): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized.slice(0, maxChars) : undefined
  }
  try {
    const serialized = JSON.stringify(value)
    if (!serialized) return undefined
    return serialized.slice(0, maxChars)
  } catch {
    return undefined
  }
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? value : null
}

function tryStringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function coerceResponsesOutputToString(output: unknown): string {
  if (!Array.isArray(output)) return ''
  const fragments: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (row.type !== 'message' || !Array.isArray(row.content)) continue
    for (const part of row.content) {
      if (!part || typeof part !== 'object') continue
      const piece = part as Record<string, unknown>
      if (piece.type === 'output_text') {
        const fromText = nonEmptyText(piece.text)
        if (fromText) fragments.push(fromText)
        continue
      }
      if (Object.prototype.hasOwnProperty.call(piece, 'parsed') && piece.parsed !== undefined && piece.parsed !== null) {
        const serialized = tryStringifyJson(piece.parsed)
        if (serialized.length > 0) fragments.push(serialized)
      }
    }
  }
  return fragments.join('\n').trim()
}

function coerceAiResponseToString(value: unknown, seen = new WeakSet<object>()): string {
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    return value
      .map((entry) => coerceAiResponseToString(entry, seen))
      .filter((entry) => entry.trim().length > 0)
      .join('\n')
      .trim()
  }

  if (value && typeof value === 'object') {
    if (seen.has(value as object)) return ''
    seen.add(value as object)
    const row = value as Record<string, unknown>
    const directContent = nonEmptyText(row.content)
    if (directContent) return directContent
    if (Array.isArray(row.content)) {
      const nestedContent = coerceAiResponseToString(row.content, seen)
      if (nestedContent.trim().length > 0) return nestedContent
    }
    const directText = nonEmptyText(row.text)
    if (directText) return directText
    if (row.message && typeof row.message === 'object') {
      const message = row.message as Record<string, unknown>
      const messageContent = nonEmptyText(message.content)
      if (messageContent) return messageContent
      if (Array.isArray(message.content)) {
        const nestedMessageContent = coerceAiResponseToString(message.content, seen)
        if (nestedMessageContent.trim().length > 0) return nestedMessageContent
      }
    }
    const responseMetadataCandidates = [row.response_metadata, row.responseMetadata]
    for (const candidate of responseMetadataCandidates) {
      if (!candidate || typeof candidate !== 'object') continue
      const metadata = candidate as Record<string, unknown>
      const outputText = coerceResponsesOutputToString(metadata.output)
      if (outputText.trim().length > 0) return outputText
      const directOutputText = nonEmptyText(metadata.output_text)
      if (directOutputText) return directOutputText
    }
    const additionalKwargsCandidates = [row.additional_kwargs, row.additionalKwargs]
    for (const candidate of additionalKwargsCandidates) {
      if (!candidate || typeof candidate !== 'object') continue
      const metadata = candidate as Record<string, unknown>
      const parsed = metadata.parsed
      if (parsed !== undefined && parsed !== null) {
        const serializedParsed = tryStringifyJson(parsed)
        if (serializedParsed.length > 0) return serializedParsed
      }
    }
    if (row.kwargs && typeof row.kwargs === 'object') {
      const kwargsText = coerceAiResponseToString(row.kwargs, seen)
      if (kwargsText.trim().length > 0) return kwargsText
    }
    if (Object.prototype.hasOwnProperty.call(row, 'briefMarkdown')
      || Object.prototype.hasOwnProperty.call(row, 'sections')) {
      return tryStringifyJson(value)
    }
  }

  return ''
}

function compactContextForRetry(context: string, maxChars: number): string {
  const normalized = context.trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars)}\n\n[context truncated for retry]`
}

export function resolvePrimaryBriefMaxTokens(
  mode: HomeBriefMode,
  configuredModeMaxTokens: number,
  model: string,
  strategy: HomeBriefStrategy,
): number {
  if (!model.startsWith('gpt-5')) return configuredModeMaxTokens
  if (strategy !== 'chunked') return configuredModeMaxTokens
  const floor = mode === 'full' ? 1600 : 1200
  return Math.max(configuredModeMaxTokens, floor)
}

export function resolveRetryBriefMaxTokens(
  mode: HomeBriefMode,
  modeMaxTokens: number,
  retryModel: string,
  strategy: HomeBriefStrategy,
): number {
  if (!retryModel.startsWith('gpt-5')) return modeMaxTokens
  const floor = strategy === 'chunked'
    ? (mode === 'full' ? 1800 : 1400)
    : (mode === 'full' ? 1200 : 900)
  return Math.max(modeMaxTokens, floor)
}

function resolveModelTemperature(model: string, preferredTemperature: number): number {
  return model.startsWith('gpt-5') ? 1 : preferredTemperature
}

async function attemptRetryAiBrief(
  prompt: PromptTemplate,
  stuffedContext: string,
  mode: HomeBriefMode,
  strategy: HomeBriefStrategy,
  modeMaxTokens: number,
  apiKey: string,
  knownTaskIds: Set<string>,
  knownTaskMap: Map<string, string>,
  fallbackSections: DailyBriefSection[],
  config: ReturnType<typeof getHomeBriefConfig>,
): Promise<Pick<AiBriefSuccess, 'brief' | 'sections'> | null> {
  const retryContext = compactContextForRetry(stuffedContext, config.retryContextMaxChars)
  const retryTemperature = config.retryModel.startsWith('gpt-5')
    ? 1
    : Math.min(config.temperature, 0.1)
  const retryReasoning = config.retryModel.startsWith('gpt-5')
    ? { effort: config.reasoningEffort }
    : undefined
  const retryLlm = new ChatOpenAI({
    apiKey,
    model: config.retryModel,
    temperature: retryTemperature,
    maxTokens: resolveRetryBriefMaxTokens(mode, modeMaxTokens, config.retryModel, strategy),
    configuration: {
      baseURL: config.baseUrl,
    },
    ...(retryReasoning ? { reasoning: retryReasoning } : {}),
  })
  const retryChain = prompt.pipe(retryLlm)
  try {
    const retryRawContent = await withTimeout(
      retryChain.invoke({
        context: retryContext,
      }),
      config.timeoutMs,
    )
    const retryContent = coerceAiResponseToString(retryRawContent)
    if (retryContent.trim().length === 0) return null
    const retryParsed = parseAiBriefPayload(retryContent, knownTaskIds)
    if (!retryParsed) return null
    const tokenValidatedMarkdown = validateInlineReferenceTokens(retryParsed.briefMarkdown, knownTaskMap)
    const retrySanitized = sanitizeBrief(tokenValidatedMarkdown, mode)
    if (retrySanitized.length === 0) return null
    return {
      brief: retrySanitized,
      sections: retryParsed.sections.length > 0 ? retryParsed.sections : fallbackSections,
    }
  } catch {
    return null
  }
}

async function requestAiBrief(
  view: HomeBriefView,
  mode: HomeBriefMode,
  scope: HomeBriefScope,
  template: HomeBriefTemplate,
  entityFocus: ResolvedEntityFocus | null,
  personal: PersonalFacts,
  product: ProductFacts | null,
  fallbackSections: DailyBriefSection[],
): Promise<AiBriefResult> {
  const strategy = selectBriefStrategy(personal)
  const config = getHomeBriefConfig()
  const providerDiagnostics = {
    provider: config.provider,
    providerReady: config.providerReady,
    providerReadinessIssue: config.providerReadinessIssue,
    apiKeySource: config.apiKeySource,
  }
  if (!config.providerReady || !config.apiKey) {
    const reason: HomeBriefFallbackReason = config.providerReadinessIssue === 'feature_disabled'
      ? 'feature_disabled'
      : config.providerReadinessIssue === 'missing_api_key'
        ? 'missing_api_key'
        : 'provider_not_ready'
    logFallbackReason(reason, {
      scope,
      template,
      strategy,
      candidateTaskCount: personal.candidateTasks.length,
      contextLength: 0,
      productContext: Boolean(product),
      entityFocus: entityFocus ? `${entityFocus.entityType}:${entityFocus.entityId}` : null,
      message: 'provider is not ready for AI briefing',
      ...providerDiagnostics,
    })
    return { ok: false, reason, strategy }
  }

  try {
    const knownTaskMap = buildKnownTaskMap(personal)
    const knownTaskIds = new Set([...knownTaskMap.keys()])
    const apiKey = config.apiKey
    const configuredModeMaxTokens = mode === 'full' ? config.fullMaxTokens : config.summaryMaxTokens
    const modeMaxTokens = resolvePrimaryBriefMaxTokens(mode, configuredModeMaxTokens, config.model, strategy)
    const primaryReasoning = config.model.startsWith('gpt-5')
      ? { effort: config.reasoningEffort }
      : undefined
    const prompt = buildBriefPrompt(view, mode, scope, template, entityFocus, Boolean(product))
    const llm = new ChatOpenAI({
      apiKey,
      model: config.model,
      temperature: resolveModelTemperature(config.model, config.temperature),
      maxTokens: modeMaxTokens,
      configuration: {
        baseURL: config.baseUrl,
      },
      ...(primaryReasoning ? { reasoning: primaryReasoning } : {}),
    })
    const chain = prompt.pipe(llm)
    const contextDocs = buildContextDocuments(view, mode, personal, product, {
      scope,
      template,
      strategy,
      entityFocus,
    })
    const stuffedContext = stuffContextDocuments(contextDocs)
    const rawContent = await withTimeout(
      chain.invoke({
        context: stuffedContext,
      }),
      config.timeoutMs,
    )
    const content = coerceAiResponseToString(rawContent)
    if (!content || typeof content !== 'string') {
      const retried = await attemptRetryAiBrief(
        prompt,
        stuffedContext,
        mode,
        strategy,
        modeMaxTokens,
        apiKey,
        knownTaskIds,
        knownTaskMap,
        fallbackSections,
        config,
      )
      if (retried) {
        return {
          ok: true,
          brief: retried.brief,
          sections: retried.sections,
          strategy,
        }
      }
      logFallbackReason('parse_error', {
        scope,
        template,
        strategy,
        candidateTaskCount: personal.candidateTasks.length,
        contextLength: stuffedContext.length,
        productContext: Boolean(product),
        entityFocus: entityFocus ? `${entityFocus.entityType}:${entityFocus.entityId}` : null,
        message: `AI response payload was empty or non-string (raw type: ${typeof rawContent}); retry model ${config.retryModel} failed`,
        preview: previewValue(rawContent),
        ...providerDiagnostics,
      })
      return { ok: false, reason: 'parse_error', strategy }
    }
    const parsed = parseAiBriefPayload(content, knownTaskIds)
    if (!parsed) {
      const retried = await attemptRetryAiBrief(
        prompt,
        stuffedContext,
        mode,
        strategy,
        modeMaxTokens,
        apiKey,
        knownTaskIds,
        knownTaskMap,
        fallbackSections,
        config,
      )
      if (retried) {
        return {
          ok: true,
          brief: retried.brief,
          sections: retried.sections,
          strategy,
        }
      }
      logFallbackReason('parse_error', {
        scope,
        template,
        strategy,
        candidateTaskCount: personal.candidateTasks.length,
        contextLength: stuffedContext.length,
        productContext: Boolean(product),
        entityFocus: entityFocus ? `${entityFocus.entityType}:${entityFocus.entityId}` : null,
        preview: content.slice(0, 180),
        message: `AI payload parse failed; retry model ${config.retryModel} failed`,
        ...providerDiagnostics,
      })
      return { ok: false, reason: 'parse_error', strategy }
    }
    const tokenValidatedMarkdown = validateInlineReferenceTokens(parsed.briefMarkdown, knownTaskMap)
    const sanitized = sanitizeBrief(tokenValidatedMarkdown, mode)
    if (sanitized.length === 0) {
      const retried = await attemptRetryAiBrief(
        prompt,
        stuffedContext,
        mode,
        strategy,
        modeMaxTokens,
        apiKey,
        knownTaskIds,
        knownTaskMap,
        fallbackSections,
        config,
      )
      if (retried) {
        return {
          ok: true,
          brief: retried.brief,
          sections: retried.sections,
          strategy,
        }
      }
      logFallbackReason('empty_sanitized_output', {
        scope,
        template,
        strategy,
        candidateTaskCount: personal.candidateTasks.length,
        contextLength: stuffedContext.length,
        productContext: Boolean(product),
        entityFocus: entityFocus ? `${entityFocus.entityType}:${entityFocus.entityId}` : null,
        message: `AI markdown sanitized to an empty string; retry model ${config.retryModel} failed`,
        ...providerDiagnostics,
      })
      return { ok: false, reason: 'empty_sanitized_output', strategy }
    }
    return {
      ok: true,
      brief: sanitized,
      sections: parsed.sections.length > 0 ? parsed.sections : fallbackSections,
      strategy,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const reason: HomeBriefFallbackReason = message.toLowerCase().includes('timed out')
      ? 'timeout'
      : 'provider_error'
    logFallbackReason(reason, {
      scope,
      template,
      strategy,
      candidateTaskCount: personal.candidateTasks.length,
      contextLength: 0,
      productContext: Boolean(product),
      entityFocus: entityFocus ? `${entityFocus.entityType}:${entityFocus.entityId}` : null,
      message,
      ...providerDiagnostics,
    })
    return { ok: false, reason, strategy }
  }
}

export async function generateDailyBrief(input: DailyBriefInput): Promise<DailyBriefResponse> {
  const config = getHomeBriefConfig()
  const view: HomeBriefView = input.view || 'my_tasks'
  const mode: HomeBriefMode = input.mode === 'full' ? 'full' : 'summary'
  const requestedScope = normalizeBriefScope(input)
  const requestedEntityType = normalizeEntityType(input.entityType)
  const requestedEntityId = normalizeEntityId(input.entityId)
  const entityFocus = requestedScope === 'entity' && requestedEntityType && requestedEntityId
    ? await resolveEntityFocus(requestedEntityType, requestedEntityId)
    : null

  const scopedProductIds = [...new Set([
    ...(input.productIds || []),
    ...(input.productId ? [input.productId] : []),
    ...(entityFocus ? [entityFocus.productId] : []),
  ]
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0))]
  const scopeMode = input.scopeMode || (input.teamId ? 'team' : scopedProductIds.length > 0 ? 'product' : 'all')
  const normalizedInput: DailyBriefInput = {
    ...input,
    scopeMode,
    productId: scopedProductIds.length === 1 ? scopedProductIds[0] || null : null,
    productIds: scopedProductIds,
    teamId: input.teamId || null,
  }
  const scope: HomeBriefScope = entityFocus
    ? 'entity'
    : requestedScope === 'entity'
      ? (scopedProductIds.length > 0 ? 'product' : 'all_products')
      : requestedScope
  const template = normalizeBriefTemplate(input.template, scope)
  const entityFocusForResponse = entityFocus
    ? {
      entityType: entityFocus.entityType,
      entityId: entityFocus.entityId,
      entityLabel: entityFocus.entityLabel,
    }
    : null
  const responseProductId = entityFocus?.productId || (scopedProductIds.length === 1 ? scopedProductIds[0] || null : null)

  const cacheKey = getCacheKey(
    normalizedInput,
    view,
    mode,
    scope,
    template,
    scopedProductIds,
    entityFocus ? { entityType: entityFocus.entityType, entityId: entityFocus.entityId } : null,
  )
  const cached = briefCache.get(cacheKey)
  if (cached) {
    const dynamicTtlMs = cached.payload.source === 'ai'
      ? config.cacheTtlMs
      : config.fallbackCacheTtlMs
    const dynamicExpired = dynamicTtlMs <= 0 || (cached.cachedAt + dynamicTtlMs) <= Date.now()
    const absoluteExpired = cached.expiresAt <= Date.now()
    if (dynamicExpired || absoluteExpired) {
      briefCache.delete(cacheKey)
    } else {
      return normalizeDailyBriefResponse({
        ...cached.payload,
        cached: true,
      })
    }
  }

  const personalFacts = await collectPersonalFacts(input.userId, {
    productIds: scopedProductIds,
    teamId: input.teamId || null,
    restrictTaskIds: entityFocus?.relatedTaskIds,
  })
  const productFacts = scopedProductIds.length > 0 ? await collectProductFacts(scopedProductIds) : null
  const structuredSections = buildStructuredSections(view, mode, personalFacts, productFacts)
  const generatedAt = new Date().toISOString()
  const strategy = selectBriefStrategy(personalFacts)

  if (!config.enabled) {
    const payload: Omit<DailyBriefResponse, 'cached'> = {
      brief: buildFallbackBrief(view, mode, personalFacts, productFacts),
      sections: [],
      generatedAt,
      source: 'disabled' as const,
      fallbackReason: 'feature_disabled',
      view,
      mode,
      scope,
      template,
      strategy,
      productId: responseProductId,
      entityFocus: entityFocusForResponse,
    }
    cacheDailyBriefPayload(cacheKey, payload, config.fallbackCacheTtlMs)
    return normalizeDailyBriefResponse({ ...payload, cached: false })
  }

  const aiDraft = await requestAiBrief(
    view,
    mode,
    scope,
    template,
    entityFocus,
    personalFacts,
    productFacts,
    structuredSections,
  )
  const brief = aiDraft.ok
    ? aiDraft.brief
    : buildFallbackBrief(view, mode, personalFacts, productFacts)
  const source: HomeBriefSource = aiDraft.ok ? 'ai' : 'fallback'
  const payload: Omit<DailyBriefResponse, 'cached'> = {
    brief,
    sections: aiDraft.ok && aiDraft.sections.length > 0 ? aiDraft.sections : [],
    generatedAt,
    source,
    fallbackReason: aiDraft.ok ? null : aiDraft.reason,
    view,
    mode,
    scope,
    template,
    strategy: aiDraft.strategy,
    productId: responseProductId,
    entityFocus: entityFocusForResponse,
  }
  cacheDailyBriefPayload(
    cacheKey,
    payload,
    payload.source === 'ai' ? config.cacheTtlMs : config.fallbackCacheTtlMs,
  )

  return normalizeDailyBriefResponse({
    ...payload,
    cached: false,
  })
}

export function resetDailyBriefCacheForTests() {
  briefCache.clear()
}
