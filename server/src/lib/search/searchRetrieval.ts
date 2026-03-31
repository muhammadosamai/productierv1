import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  assets,
  deliveries,
  initiatives,
  productMembers,
  tasks,
  users,
} from '../../db/schema'
import { getSearchConfig } from '../../config/search'
import { embeddingToVectorLiteral, generateEmbedding } from './searchEmbeddingProvider'
import { mergeCandidates, toResultItem, type SearchRankingProfile } from './searchRanker'
import { routePathForSearchType } from './searchRouting'
import { resolveUserTeamIdsForProduct } from '../assignmentTargets'
import type {
  SearchCandidate,
  SearchEntityType,
  SearchEnvelope,
  SearchQueryInput,
} from './searchTypes'

export interface SearchTypeAccessPolicy {
  allowed: boolean
  selfViewOnly: boolean
}

export type SearchTypeAccessMap = Record<SearchEntityType, SearchTypeAccessPolicy>

interface PreparedSearchQuery {
  raw: string
  searchText: string
  normalized: string
  normalizedLikePattern: string
  prefixLikePattern: string
  tokens: string[]
  phrases: string[]
  idLikeToken: string | null
  hintedTypes: SearchEntityType[]
}

interface SearchExecutionContext extends SearchQueryInput {
  userId: string
  access: SearchTypeAccessMap
  teamIds?: string[]
  prepared?: PreparedSearchQuery
}

type PreparedSearchExecutionContext = SearchExecutionContext & { prepared: PreparedSearchQuery }

interface SemanticRow {
  entity_type: string
  entity_id: string
  product_id: string
  title: string
  subtitle: string | null
  description: string | null
  route_path: string
  metadata: unknown
  updated_at: string | null
  semantic_score: number | null
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'with',
  'show',
  'find',
  'search',
  'about',
  'please',
])

const TYPE_HINT_ALIASES: Record<string, SearchEntityType> = {
  task: 'task',
  tasks: 'task',
  todo: 'task',
  initiative: 'initiative',
  initiatives: 'initiative',
  goal: 'initiative',
  goals: 'initiative',
  delivery: 'delivery',
  deliveries: 'delivery',
  deliverable: 'delivery',
  deliverables: 'delivery',
  team: 'team_member',
  member: 'team_member',
  members: 'team_member',
  user: 'team_member',
  users: 'team_member',
  people: 'team_member',
  wiki: 'wiki_asset',
  wikis: 'wiki_asset',
  asset: 'wiki_asset',
  assets: 'wiki_asset',
  doc: 'wiki_asset',
  docs: 'wiki_asset',
}

function normalize(text: string | null | undefined): string {
  return (text || '').trim().toLowerCase()
}

function normalizeForLookup(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeNormalized(normalizedValue: string, removeStopWords = true): string[] {
  const tokens = normalizedValue
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
  if (!removeStopWords) return tokens
  const filtered = tokens.filter((token) => !STOP_WORDS.has(token))
  return filtered.length > 0 ? filtered : tokens
}

function parseTypeHint(value: string): SearchEntityType | null {
  return TYPE_HINT_ALIASES[value.trim().toLowerCase()] || null
}

function parseIdLikeToken(input: string): string | null {
  const tokens = input
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
  for (const token of tokens) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
      return token
    }
    if (/^[a-z]+-\d+$/i.test(token)) {
      return token
    }
  }
  return null
}

function prepareSearchQuery(input: string): PreparedSearchQuery {
  const raw = input.trim()
  const hintedTypes = new Set<SearchEntityType>()
  const phrases: string[] = []

  for (const match of raw.matchAll(/["“”]([^"“”]+)["“”]/g)) {
    const phrase = normalizeForLookup(match[1] || '')
    if (phrase) phrases.push(phrase)
  }

  const sanitized = raw
    .replace(/\b([a-z_]+)\s*:/gi, (_, rawType: string) => {
      const hinted = parseTypeHint(rawType)
      if (hinted) {
        hintedTypes.add(hinted)
        return ' '
      }
      return `${rawType}:`
    })
    .replace(/["“”]/g, ' ')
    .trim()

  const searchText = sanitized || raw
  const normalized = normalizeForLookup(searchText) || normalizeForLookup(raw) || normalize(raw)
  const tokens = tokenizeNormalized(normalized)

  return {
    raw,
    searchText,
    normalized,
    normalizedLikePattern: `%${normalized}%`,
    prefixLikePattern: `${normalized}%`,
    tokens,
    phrases,
    idLikeToken: parseIdLikeToken(raw),
    hintedTypes: Array.from(hintedTypes),
  }
}

function clipText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed
}

function createSnippet(value: string | null | undefined, query: string): string | null {
  const text = clipText(value, 1000)
  if (!text) return null
  const normalizedQuery = normalizeForLookup(query)
  if (!normalizedQuery) return clipText(text, 220)
  const normalizedText = normalizeForLookup(text)
  const hitIndex = normalizedText.indexOf(normalizedQuery)
  if (hitIndex === -1) return clipText(text, 220)
  const start = Math.max(0, hitIndex - 70)
  const end = Math.min(text.length, hitIndex + normalizedQuery.length + 120)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}

function titleMatchFlags(title: string, prepared: PreparedSearchQuery): { exact: boolean; prefix: boolean } {
  const titleNorm = normalizeForLookup(title)
  if (!titleNorm) return { exact: false, prefix: false }
  const exact = titleNorm === prepared.normalized
    || prepared.phrases.some((phrase) => phrase.length > 0 && titleNorm === phrase)
  const prefix = !exact && (
    titleNorm.startsWith(prepared.normalized)
    || prepared.phrases.some((phrase) => phrase.length > 0 && titleNorm.startsWith(phrase))
  )
  return { exact, prefix }
}

function lexicalScore(
  prepared: PreparedSearchQuery,
  title: string,
  description: string | null,
  subtitle: string | null,
): number {
  const queryNorm = prepared.normalized
  if (!queryNorm) return 0

  const titleNorm = normalizeForLookup(title)
  const descNorm = normalizeForLookup(description || '')
  const subtitleNorm = normalizeForLookup(subtitle || '')

  let score = 0
  if (titleNorm === queryNorm) score += 1.15
  else if (titleNorm.startsWith(queryNorm)) score += 0.9
  else if (titleNorm.includes(queryNorm)) score += 0.72

  for (const phrase of prepared.phrases) {
    if (!phrase) continue
    if (titleNorm.includes(phrase)) score += 0.18
    else if (subtitleNorm.includes(phrase)) score += 0.08
    else if (descNorm.includes(phrase)) score += 0.06
  }

  const uniqueTokens = Array.from(new Set(prepared.tokens))
  for (const token of uniqueTokens) {
    if (titleNorm.includes(token)) score += 0.09
    else if (subtitleNorm.includes(token)) score += 0.045
    else if (descNorm.includes(token)) score += 0.03
  }

  if (prepared.idLikeToken) {
    const idToken = prepared.idLikeToken.toLowerCase()
    if (titleNorm.includes(idToken) || subtitleNorm.includes(idToken) || descNorm.includes(idToken)) {
      score += 0.2
    }
  }

  return Math.min(1, Number(score.toFixed(6)))
}

function lexicalFetchLimit(config: ReturnType<typeof getSearchConfig>): number {
  return Math.max(
    config.lexicalPerTypeLimit,
    config.lexicalPerTypeLimit * config.lexicalCandidateMultiplier,
  )
}

function finalizeLexicalCandidates(
  candidates: SearchCandidate[],
  config: ReturnType<typeof getSearchConfig>,
): SearchCandidate[] {
  return [...candidates]
    .sort((left, right) => {
      if (Boolean(right.exactTitleMatch) !== Boolean(left.exactTitleMatch)) {
        return Number(Boolean(right.exactTitleMatch)) - Number(Boolean(left.exactTitleMatch))
      }
      if (Boolean(right.prefixTitleMatch) !== Boolean(left.prefixTitleMatch)) {
        return Number(Boolean(right.prefixTitleMatch)) - Number(Boolean(left.prefixTitleMatch))
      }
      const lexicalDelta = right.lexicalScore - left.lexicalScore
      if (Math.abs(lexicalDelta) > 0.000001) return lexicalDelta
      const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0
      const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0
      return rightTime - leftTime
    })
    .slice(0, config.lexicalPerTypeLimit)
}

function buildTokenLikeConditions(columns: unknown[], prepared: PreparedSearchQuery) {
  const tokenLikePatterns = prepared.tokens.slice(0, 4).map((token) => `%${token}%`)
  const conditions: unknown[] = []
  for (const pattern of tokenLikePatterns) {
    for (const column of columns) {
      conditions.push(ilike(column as any, pattern))
    }
  }
  return conditions
}

function buildSimilarityConditions(
  columns: unknown[],
  prepared: PreparedSearchQuery,
  similarityFloor: number,
) {
  return columns.map((column) => sql`
    similarity(lower(coalesce(${column as any}, '')), ${prepared.normalized}) >= ${similarityFloor}
  `)
}

function buildLexicalRankExpression(
  titleColumn: unknown,
  secondaryColumn: unknown,
  tertiaryColumn: unknown,
  prepared: PreparedSearchQuery,
) {
  return sql<number>`
    (
      CASE
        WHEN lower(coalesce(${titleColumn as any}, '')) = ${prepared.normalized} THEN 1.2
        WHEN lower(coalesce(${titleColumn as any}, '')) LIKE ${prepared.prefixLikePattern} THEN 0.96
        WHEN lower(coalesce(${titleColumn as any}, '')) LIKE ${prepared.normalizedLikePattern} THEN 0.74
        ELSE 0
      END
      + (similarity(lower(coalesce(${titleColumn as any}, '')), ${prepared.normalized}) * 0.45)
      + (similarity(lower(coalesce(${secondaryColumn as any}, '')), ${prepared.normalized}) * 0.18)
      + (similarity(lower(coalesce(${tertiaryColumn as any}, '')), ${prepared.normalized}) * 0.12)
    )
  `
}

function teamArraySql(teamIds: string[]) {
  return sql`ARRAY[${sql.join(teamIds.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`
}

function isSemanticCandidateAllowedForSelfView(
  entityType: SearchEntityType,
  metadata: unknown,
  userId: string,
  teamIds: string[],
  selfViewOnly: boolean,
): boolean {
  if (!selfViewOnly) return true
  if (!metadata || typeof metadata !== 'object') return false
  const payload = metadata as Record<string, unknown>

  if (entityType === 'initiative') {
    return payload.leaderUserId === userId
  }

  if (entityType === 'delivery') {
    return payload.createdByUserId === userId
  }

  if (entityType === 'task') {
    const assignees = Array.isArray(payload.assigneeUserIds)
      ? payload.assigneeUserIds.map((value) => String(value))
      : []
    const assigneeTeams = Array.isArray(payload.assigneeTeamIds)
      ? payload.assigneeTeamIds.map((value) => String(value))
      : []
    const reviewers = Array.isArray(payload.reviewerUserIds)
      ? payload.reviewerUserIds.map((value) => String(value))
      : []
    const reviewerTeams = Array.isArray(payload.reviewerTeamIds)
      ? payload.reviewerTeamIds.map((value) => String(value))
      : []
    const ownerTeamId = payload.ownerTeamId ? String(payload.ownerTeamId) : null
    const teamSet = new Set(teamIds)
    return payload.ownerUserId === userId
      || payload.createdByUserId === userId
      || (ownerTeamId ? teamSet.has(ownerTeamId) : false)
      || assignees.includes(userId)
      || assigneeTeams.some((teamId) => teamSet.has(teamId))
      || reviewers.includes(userId)
      || reviewerTeams.some((teamId) => teamSet.has(teamId))
  }

  return true
}

function parseSearchCursor(raw: string | null): number {
  if (!raw) return 0
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded) as { offset?: number }
    if (!parsed || typeof parsed.offset !== 'number' || !Number.isFinite(parsed.offset)) return 0
    return Math.max(0, Math.floor(parsed.offset))
  } catch {
    return 0
  }
}

function encodeSearchCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url')
}

async function fetchTaskCandidates(ctx: PreparedSearchExecutionContext): Promise<SearchCandidate[]> {
  const config = getSearchConfig()
  const textConditions: unknown[] = [
    ilike(tasks.title, `%${ctx.prepared.searchText}%`),
    ilike(tasks.description, `%${ctx.prepared.searchText}%`),
    ilike(tasks.blockedReason, `%${ctx.prepared.searchText}%`),
    ...buildSimilarityConditions(
      [tasks.title, tasks.description, tasks.blockedReason],
      ctx.prepared,
      config.lexicalSimilarityFloor,
    ),
    ...buildTokenLikeConditions([tasks.title, tasks.description, tasks.blockedReason], ctx.prepared),
  ]
  if (ctx.prepared.idLikeToken) {
    textConditions.push(sql`${tasks.id}::text ILIKE ${`%${ctx.prepared.idLikeToken}%`}`)
  }

  const conditions = [
    eq(tasks.productId, ctx.productId),
    or(...(textConditions as any))!,
  ]

  if (ctx.access.task.selfViewOnly) {
    const taskSelfViewConditions: unknown[] = [
      eq(tasks.ownerUserId, ctx.userId),
      eq(tasks.createdByUserId, ctx.userId),
      sql`${ctx.userId}::uuid = any(${tasks.assigneeUserIds})`,
      sql`${ctx.userId}::uuid = any(${tasks.reviewerUserIds})`,
    ]
    if ((ctx.teamIds || []).length > 0) {
      const teamArray = teamArraySql(ctx.teamIds || [])
      taskSelfViewConditions.push(inArray(tasks.ownerTeamId, ctx.teamIds!))
      taskSelfViewConditions.push(sql`${tasks.assigneeTeamIds} && ${teamArray}`)
      taskSelfViewConditions.push(sql`${tasks.reviewerTeamIds} && ${teamArray}`)
    }
    conditions.push(or(...(taskSelfViewConditions as any))!)
  }

  const lexicalRank = buildLexicalRankExpression(
    tasks.title,
    tasks.description,
    tasks.blockedReason,
    ctx.prepared,
  )

  const rows = await db.query.tasks.findMany({
    where: and(...conditions),
    orderBy: (table, { desc: orderDesc }) => [orderDesc(lexicalRank), orderDesc(table.updatedAt)],
    limit: lexicalFetchLimit(config),
    with: {
      story: { columns: { id: true, title: true } },
      delivery: { columns: { id: true, title: true } },
    },
  })

  const candidates = rows.map((row) => {
    const subtitle = [
      `Status: ${row.status}`,
      row.story?.title ? `Story: ${row.story.title}` : null,
      row.delivery?.title ? `Delivery: ${row.delivery.title}` : null,
    ].filter(Boolean).join(' • ')
    const titleFlags = titleMatchFlags(row.title, ctx.prepared)
    return {
      id: row.id,
      entityType: 'task' as const,
      title: row.title,
      subtitle: subtitle || null,
      descriptionSnippet: createSnippet(row.description || row.blockedReason, ctx.prepared.searchText),
      productId: row.productId,
      routePath: routePathForSearchType('task', row.id),
      lexicalScore: lexicalScore(ctx.prepared, row.title, row.description || row.blockedReason, subtitle || null),
      semanticScore: 0,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      exactTitleMatch: titleFlags.exact,
      prefixTitleMatch: titleFlags.prefix,
      metadata: {
        status: row.status,
        priority: row.priority,
      },
    }
  })

  return finalizeLexicalCandidates(candidates, config)
}

async function fetchInitiativeCandidates(ctx: PreparedSearchExecutionContext): Promise<SearchCandidate[]> {
  const config = getSearchConfig()
  const textConditions: unknown[] = [
    ilike(initiatives.title, `%${ctx.prepared.searchText}%`),
    ilike(initiatives.description, `%${ctx.prepared.searchText}%`),
    ...buildSimilarityConditions(
      [initiatives.title, initiatives.description],
      ctx.prepared,
      config.lexicalSimilarityFloor,
    ),
    ...buildTokenLikeConditions([initiatives.title, initiatives.description], ctx.prepared),
  ]
  if (ctx.prepared.idLikeToken) {
    textConditions.push(sql`${initiatives.id}::text ILIKE ${`%${ctx.prepared.idLikeToken}%`}`)
  }

  const conditions = [
    eq(initiatives.productId, ctx.productId),
    or(...(textConditions as any))!,
  ]

  if (ctx.access.initiative.selfViewOnly) {
    conditions.push(eq(initiatives.leaderUserId, ctx.userId))
  }

  const lexicalRank = buildLexicalRankExpression(
    initiatives.title,
    initiatives.description,
    sql`${initiatives.status}::text`,
    ctx.prepared,
  )

  const rows = await db.query.initiatives.findMany({
    where: and(...conditions),
    orderBy: (table, { desc: orderDesc }) => [orderDesc(lexicalRank), orderDesc(table.updatedAt)],
    limit: lexicalFetchLimit(config),
    with: {
      leaderUser: { columns: { id: true, name: true } },
    },
  })

  const candidates = rows.map((row) => {
    const subtitle = [
      `Status: ${row.status}`,
      `Priority: ${row.priority}`,
      row.leaderUser?.name ? `Leader: ${row.leaderUser.name}` : null,
    ].filter(Boolean).join(' • ')
    const titleFlags = titleMatchFlags(row.title, ctx.prepared)
    return {
      id: row.id,
      entityType: 'initiative' as const,
      title: row.title,
      subtitle: subtitle || null,
      descriptionSnippet: createSnippet(row.description, ctx.prepared.searchText),
      productId: row.productId,
      routePath: routePathForSearchType('initiative', row.id),
      lexicalScore: lexicalScore(ctx.prepared, row.title, row.description, subtitle || null),
      semanticScore: 0,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      exactTitleMatch: titleFlags.exact,
      prefixTitleMatch: titleFlags.prefix,
      metadata: { status: row.status, priority: row.priority },
    }
  })

  return finalizeLexicalCandidates(candidates, config)
}

async function fetchDeliveryCandidates(ctx: PreparedSearchExecutionContext): Promise<SearchCandidate[]> {
  const config = getSearchConfig()
  const textConditions: unknown[] = [
    ilike(deliveries.title, `%${ctx.prepared.searchText}%`),
    ilike(deliveries.description, `%${ctx.prepared.searchText}%`),
    ...buildSimilarityConditions(
      [deliveries.title, deliveries.description],
      ctx.prepared,
      config.lexicalSimilarityFloor,
    ),
    ...buildTokenLikeConditions([deliveries.title, deliveries.description], ctx.prepared),
  ]
  if (ctx.prepared.idLikeToken) {
    textConditions.push(sql`${deliveries.id}::text ILIKE ${`%${ctx.prepared.idLikeToken}%`}`)
  }

  const conditions = [
    eq(deliveries.productId, ctx.productId),
    or(...(textConditions as any))!,
  ]

  if (ctx.access.delivery.selfViewOnly) {
    conditions.push(eq(deliveries.createdByUserId, ctx.userId))
  }

  const lexicalRank = buildLexicalRankExpression(
    deliveries.title,
    deliveries.description,
    sql`${deliveries.status}::text`,
    ctx.prepared,
  )

  const rows = await db.query.deliveries.findMany({
    where: and(...conditions),
    orderBy: (table, { desc: orderDesc }) => [orderDesc(lexicalRank), orderDesc(table.updatedAt)],
    limit: lexicalFetchLimit(config),
    with: {
      createdByUser: { columns: { id: true, name: true } },
    },
  })

  const candidates = rows.map((row) => {
    const subtitle = [
      `Status: ${row.status}`,
      row.createdByUser?.name ? `Owner: ${row.createdByUser.name}` : null,
    ].filter(Boolean).join(' • ')
    const titleFlags = titleMatchFlags(row.title, ctx.prepared)
    return {
      id: row.id,
      entityType: 'delivery' as const,
      title: row.title,
      subtitle: subtitle || null,
      descriptionSnippet: createSnippet(row.description, ctx.prepared.searchText),
      productId: row.productId,
      routePath: routePathForSearchType('delivery', row.id),
      lexicalScore: lexicalScore(ctx.prepared, row.title, row.description, subtitle || null),
      semanticScore: 0,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      exactTitleMatch: titleFlags.exact,
      prefixTitleMatch: titleFlags.prefix,
      metadata: { status: row.status },
    }
  })

  return finalizeLexicalCandidates(candidates, config)
}

async function fetchTeamMemberCandidates(ctx: PreparedSearchExecutionContext): Promise<SearchCandidate[]> {
  const config = getSearchConfig()
  const textConditions: unknown[] = [
    ilike(users.name, `%${ctx.prepared.searchText}%`),
    ilike(users.email, `%${ctx.prepared.searchText}%`),
    ilike(productMembers.role, `%${ctx.prepared.searchText}%`),
    ...buildSimilarityConditions(
      [users.name, users.email, productMembers.role],
      ctx.prepared,
      config.lexicalSimilarityFloor,
    ),
    ...buildTokenLikeConditions([users.name, users.email, productMembers.role], ctx.prepared),
  ]
  if (ctx.prepared.idLikeToken) {
    textConditions.push(sql`${users.id}::text ILIKE ${`%${ctx.prepared.idLikeToken}%`}`)
  }

  const lexicalRank = buildLexicalRankExpression(
    users.name,
    users.email,
    productMembers.role,
    ctx.prepared,
  )

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: productMembers.role,
      productId: productMembers.productId,
      updatedAt: users.updatedAt,
    })
    .from(productMembers)
    .innerJoin(users, eq(productMembers.userId, users.id))
    .where(and(
      eq(productMembers.productId, ctx.productId),
      or(...(textConditions as any))!,
    ))
    .orderBy(desc(lexicalRank), desc(users.updatedAt))
    .limit(lexicalFetchLimit(config))

  const candidates = rows.map((row) => {
    const subtitle = [row.email, row.role ? `Role: ${row.role}` : null].filter(Boolean).join(' • ')
    const titleFlags = titleMatchFlags(row.name, ctx.prepared)
    return {
      id: row.id,
      entityType: 'team_member' as const,
      title: row.name,
      subtitle: subtitle || null,
      descriptionSnippet: null,
      productId: row.productId,
      routePath: routePathForSearchType('team_member', row.id),
      lexicalScore: lexicalScore(ctx.prepared, row.name, row.email, subtitle || null),
      semanticScore: 0,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      exactTitleMatch: titleFlags.exact,
      prefixTitleMatch: titleFlags.prefix,
      metadata: { role: row.role || null, email: row.email },
    }
  })

  return finalizeLexicalCandidates(candidates, config)
}

async function fetchWikiCandidates(ctx: PreparedSearchExecutionContext): Promise<SearchCandidate[]> {
  const config = getSearchConfig()
  const textConditions: unknown[] = [
    ilike(assets.title, `%${ctx.prepared.searchText}%`),
    ilike(assets.description, `%${ctx.prepared.searchText}%`),
    ilike(assets.content, `%${ctx.prepared.searchText}%`),
    ...buildSimilarityConditions(
      [assets.title, assets.description, assets.content],
      ctx.prepared,
      config.lexicalSimilarityFloor,
    ),
    ...buildTokenLikeConditions([assets.title, assets.description, assets.content], ctx.prepared),
  ]
  if (ctx.prepared.idLikeToken) {
    textConditions.push(sql`${assets.id}::text ILIKE ${`%${ctx.prepared.idLikeToken}%`}`)
  }

  const lexicalRank = buildLexicalRankExpression(
    assets.title,
    assets.description,
    assets.content,
    ctx.prepared,
  )

  const rows = await db.query.assets.findMany({
    where: and(
      eq(assets.productId, ctx.productId),
      or(...(textConditions as any))!,
    ),
    orderBy: (table, { desc: orderDesc }) => [orderDesc(lexicalRank), orderDesc(table.updatedAt)],
    limit: lexicalFetchLimit(config),
    with: {
      assetType: { columns: { id: true, name: true, category: true } },
    },
  })

  const candidates = rows.map((row) => {
    const subtitle = [
      row.assetType?.name ? `Type: ${row.assetType.name}` : null,
      `Status: ${row.status}`,
    ].filter(Boolean).join(' • ')
    const titleFlags = titleMatchFlags(row.title, ctx.prepared)
    return {
      id: row.id,
      entityType: 'wiki_asset' as const,
      title: row.title,
      subtitle: subtitle || null,
      descriptionSnippet: createSnippet(
        [row.description, row.content].filter(Boolean).join('\n'),
        ctx.prepared.searchText,
      ),
      productId: row.productId,
      routePath: routePathForSearchType('wiki_asset', row.id),
      lexicalScore: lexicalScore(ctx.prepared, row.title, row.description || row.content, subtitle || null),
      semanticScore: 0,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      exactTitleMatch: titleFlags.exact,
      prefixTitleMatch: titleFlags.prefix,
      metadata: { status: row.status, visibility: row.visibility, assetTypeId: row.assetTypeId },
    }
  })

  return finalizeLexicalCandidates(candidates, config)
}

async function fetchLexicalCandidates(ctx: PreparedSearchExecutionContext): Promise<SearchCandidate[]> {
  const calls: Array<Promise<SearchCandidate[]>> = []
  if (ctx.types.includes('task') && ctx.access.task.allowed) {
    calls.push(fetchTaskCandidates(ctx))
  }
  if (ctx.types.includes('initiative') && ctx.access.initiative.allowed) {
    calls.push(fetchInitiativeCandidates(ctx))
  }
  if (ctx.types.includes('delivery') && ctx.access.delivery.allowed) {
    calls.push(fetchDeliveryCandidates(ctx))
  }
  if (ctx.types.includes('team_member') && ctx.access.team_member.allowed) {
    calls.push(fetchTeamMemberCandidates(ctx))
  }
  if (ctx.types.includes('wiki_asset') && ctx.access.wiki_asset.allowed) {
    calls.push(fetchWikiCandidates(ctx))
  }
  if (calls.length === 0) return []
  const groups = await Promise.all(calls)
  return groups.flat()
}

async function fetchSemanticCandidates(ctx: PreparedSearchExecutionContext): Promise<SearchCandidate[]> {
  const config = getSearchConfig()
  if (!config.semanticEnabled) return []
  if (!config.semanticProviderReady) return []

  const embedding = await generateEmbedding(ctx.q, {
    timeoutMs: config.semanticTimeoutMs,
    useCache: true,
  })
  if (!embedding || embedding.length === 0) return []

  const types = ctx.types.filter((type) => ctx.access[type].allowed)
  if (types.length === 0) return []

  const typeSql = sql.join(types.map((type) => sql`${type}`), sql`, `)
  const vectorLiteral = embeddingToVectorLiteral(embedding)
  const fetchLimit = Math.max(
    config.semanticCandidateLimit * 6,
    config.semanticCandidateLimit,
  )

  const rows = await db.execute(sql`
    SELECT
      sd.entity_type,
      sd.entity_id::text AS entity_id,
      sd.product_id::text AS product_id,
      sd.title,
      sd.subtitle,
      sd.description,
      sd.route_path,
      sd.metadata,
      sd.updated_at::text AS updated_at,
      (1 - (sd.embedding <=> ${vectorLiteral}::vector))::float8 AS semantic_score
    FROM search_documents sd
    WHERE sd.product_id = ${ctx.productId}::uuid
      AND sd.embedding IS NOT NULL
      AND sd.entity_type IN (${typeSql})
    ORDER BY sd.embedding <=> ${vectorLiteral}::vector
    LIMIT ${fetchLimit}
  `) as unknown as SemanticRow[]

  const candidates: SearchCandidate[] = []
  for (const row of rows) {
    const entityType = String(row.entity_type) as SearchEntityType
    if (!ctx.types.includes(entityType)) continue
    if (!ctx.access[entityType]?.allowed) continue
    if (!isSemanticCandidateAllowedForSelfView(
      entityType,
      row.metadata,
      ctx.userId,
      ctx.teamIds || [],
      ctx.access[entityType].selfViewOnly,
    )) {
      continue
    }
    const semanticScore = Math.max(0, Math.min(1, Number(row.semantic_score ?? 0)))
    if (semanticScore < config.semanticMinScore) continue
    const titleFlags = titleMatchFlags(row.title || '', ctx.prepared)

    candidates.push({
      id: String(row.entity_id),
      entityType,
      title: row.title || 'Untitled',
      subtitle: clipText(row.subtitle, 240),
      descriptionSnippet: createSnippet(row.description, ctx.prepared.searchText),
      productId: String(row.product_id),
      routePath: row.route_path || routePathForSearchType(entityType, String(row.entity_id)),
      lexicalScore: 0,
      semanticScore,
      updatedAt: row.updated_at || null,
      exactTitleMatch: titleFlags.exact,
      prefixTitleMatch: titleFlags.prefix,
      metadata: row.metadata && typeof row.metadata === 'object'
        ? row.metadata as Record<string, unknown>
        : undefined,
    })
  }

  return candidates
    .sort((left, right) => right.semanticScore - left.semanticScore)
    .slice(0, config.semanticCandidateLimit)
}

export async function runGlobalSearch(ctx: SearchExecutionContext): Promise<SearchEnvelope> {
  const q = ctx.q.trim()
  if (!q) {
    return { items: [], hasMore: false, nextCursor: null, totalApprox: 0 }
  }

  const prepared = prepareSearchQuery(q)
  if (!prepared.searchText) {
    return { items: [], hasMore: false, nextCursor: null, totalApprox: 0 }
  }

  const hintedTypes = prepared.hintedTypes.filter((type) => ctx.types.includes(type) && ctx.access[type].allowed)
  const effectiveTypes = hintedTypes.length > 0 ? hintedTypes : ctx.types
  if (effectiveTypes.length === 0) {
    return { items: [], hasMore: false, nextCursor: null, totalApprox: 0 }
  }

  const effectiveContext: PreparedSearchExecutionContext = {
    ...ctx,
    q: prepared.searchText,
    types: effectiveTypes,
    teamIds: ctx.teamIds || await resolveUserTeamIdsForProduct(ctx.productId, ctx.userId),
    prepared,
  }

  const rankingProfile: SearchRankingProfile = {
    queryLength: prepared.searchText.length,
    tokenCount: prepared.tokens.length,
    hasQuotedPhrase: prepared.phrases.length > 0,
  }

  const lexicalCandidates = await fetchLexicalCandidates(effectiveContext)
  const semanticCandidates = await fetchSemanticCandidates(effectiveContext)
  const ranked = mergeCandidates(lexicalCandidates, semanticCandidates, rankingProfile)
  const totalApprox = ranked.length

  const start = Math.max(0, ctx.cursorOffset)
  const end = start + ctx.limit
  const page = ranked.slice(start, end).map((candidate) => toResultItem(candidate, rankingProfile))
  const hasMore = end < ranked.length
  const nextCursor = hasMore ? encodeSearchCursor(end) : null

  return {
    items: page,
    hasMore,
    nextCursor,
    totalApprox,
  }
}

export function decodeGlobalSearchCursor(raw: string | null): number {
  return parseSearchCursor(raw)
}
