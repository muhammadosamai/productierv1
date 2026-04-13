import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { formConfigs } from '../db/schema'
import { getDefaultConfig } from './builtInFields'
import {
  DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID,
  ISSUE_STATUS_ID_OPEN,
  looksLikeIssueStatusUuid,
  uuidV5IssueStatusFromSlug,
} from './issueStatusId'
import { normalizeIssueStatusHexColor } from './issueStatusColors'

/** Canonical default issue status slugs (legacy / display keys). */
export const DEFAULT_ISSUE_STATUS_OPTIONS = [
  'open',
  'in_progress',
  'resolved',
  'closed',
  'deferred',
] as const

export type IssueStatusCatalogEntry = {
  id: string
  name: string
  order: number
  /** Legacy stored key when statuses were slug-only; also accepted in API until normalized. */
  slugKey?: string
  /** Optional pill color #rgb or #rrggbb. */
  color?: string
}

export type IssueFormFieldConfig = {
  key: string
  label: string
  type: string
  required: boolean
  visible: boolean
  isBuiltIn: boolean
  locked?: boolean
  options?: string[]
  issueStatusCatalog?: IssueStatusCatalogEntry[]
  order: number
  placeholder?: string
}

/** Normalize a single option key: snake_case, safe chars (matches form builder spirit). */
export function normalizeIssueStatusOptionKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function normalizeIssueStatusOptionsList(options: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of options) {
    const k = normalizeIssueStatusOptionKey(raw)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function canonicalIdForLegacySlug(slug: string): string {
  return DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID[slug] ?? uuidV5IssueStatusFromSlug(slug)
}

function buildCatalogFromSlugs(slugs: string[]): IssueStatusCatalogEntry[] {
  return slugs.map((slug, i) => ({
    id: canonicalIdForLegacySlug(slug),
    name: humanizeSlug(slug),
    order: i,
    slugKey: slug,
  }))
}

function inferDefaultSlugKeys(catalog: IssueStatusCatalogEntry[]): IssueStatusCatalogEntry[] {
  return catalog.map((e) => {
    if (e.slugKey) return e
    const sk = Object.entries(DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID).find(([, id]) => id === e.id)?.[0]
    return sk ? { ...e, slugKey: sk } : e
  })
}

function normalizeCatalogEntries(raw: IssueStatusCatalogEntry[]): IssueStatusCatalogEntry[] {
  const seen = new Set<string>()
  const out: IssueStatusCatalogEntry[] = []
  raw.forEach((c, idx) => {
    const id = (c.id && String(c.id).trim()) || randomUUID()
    const name = (c.name && String(c.name).trim()) || 'Untitled'
    const order = typeof c.order === 'number' ? c.order : idx
    const slugKeyRaw = c.slugKey != null ? String(c.slugKey).trim() : ''
    const slugKey = slugKeyRaw ? normalizeIssueStatusOptionKey(slugKeyRaw) : undefined
    const colorRaw = typeof (c as IssueStatusCatalogEntry).color === 'string' ? (c as IssueStatusCatalogEntry).color!.trim() : ''
    const color = normalizeIssueStatusHexColor(colorRaw || undefined)
    if (seen.has(id)) return
    seen.add(id)
    out.push({
      id,
      name,
      order,
      slugKey: slugKey || undefined,
      ...(color ? { color } : {}),
    })
  })
  out.sort((a, b) => a.order - b.order)
  out.forEach((c, i) => {
    c.order = i
  })
  return inferDefaultSlugKeys(out)
}

function mergeStatusField(
  base: IssueFormFieldConfig,
  raw: Partial<IssueFormFieldConfig> & { key: string },
  orderIdx: number,
): IssueFormFieldConfig {
  const merged: IssueFormFieldConfig = {
    ...base,
    ...raw,
    key: 'status',
    order: typeof raw.order === 'number' ? raw.order : orderIdx,
  }
  const rawCat = raw.issueStatusCatalog
  if (Array.isArray(rawCat) && rawCat.length > 0) {
    const catalog = normalizeCatalogEntries(rawCat as IssueStatusCatalogEntry[])
    merged.issueStatusCatalog = catalog
    merged.options = catalog.map(e => e.slugKey ?? e.id)
    return merged
  }
  const o = Array.isArray(raw.options) ? raw.options : []
  const normalized = normalizeIssueStatusOptionsList(o.map(String))
  const slugs = normalized.length > 0 ? normalized : [...DEFAULT_ISSUE_STATUS_OPTIONS]
  merged.issueStatusCatalog = buildCatalogFromSlugs(slugs)
  merged.options = slugs
  return merged
}

/** Accepts persisted JSON from `form_configs.config` (may be partial). */
export function mergeIssueFormConfig(
  saved: { fields?: Array<Partial<IssueFormFieldConfig> & { key: string }> } | null | undefined,
): { fields: IssueFormFieldConfig[] } {
  const defaultIssue = getDefaultConfig('issue')
  if (!saved?.fields?.length) {
    const fields = defaultIssue.fields.map(f => ({ ...f })) as IssueFormFieldConfig[]
    const idx = fields.findIndex(f => f.key === 'status')
    if (idx !== -1) {
      const base = fields[idx]!
      fields[idx] = mergeStatusField(base, base, idx)
    }
    return { fields }
  }

  const defByKey = new Map(defaultIssue.fields.map(f => [f.key, f as IssueFormFieldConfig]))
  const mergedFields: IssueFormFieldConfig[] = saved.fields.map((raw, idx) => {
    const base = defByKey.get(raw.key)
    const merged = {
      ...(base ? { ...base } : {}),
      ...raw,
    } as IssueFormFieldConfig
    merged.order = typeof raw.order === 'number' ? raw.order : idx
    if (merged.key === 'status') {
      return mergeStatusField((base ?? merged) as IssueFormFieldConfig, raw, idx)
    }
    return merged
  })

  const have = new Set(mergedFields.map(f => f.key))
  for (const d of defaultIssue.fields) {
    if (!have.has(d.key)) mergedFields.push({ ...d } as IssueFormFieldConfig)
  }
  mergedFields.sort((a, b) => a.order - b.order)
  const st = mergedFields.find(f => f.key === 'status')
  if (st && (!st.issueStatusCatalog || st.issueStatusCatalog.length === 0)) {
    const base = defByKey.get('status') as IssueFormFieldConfig
    Object.assign(st, mergeStatusField(base, st, st.order))
  }
  return { fields: mergedFields }
}

export function getIssueStatusCatalogFromMerged(
  merged: { fields: IssueFormFieldConfig[] },
): IssueStatusCatalogEntry[] {
  const f = merged.fields.find(x => x.key === 'status')
  if (f?.issueStatusCatalog?.length) return [...f.issueStatusCatalog].sort((a, b) => a.order - b.order)
  return buildCatalogFromSlugs([...DEFAULT_ISSUE_STATUS_OPTIONS])
}

/** Every value accepted on the wire or already stored in `issues.status` for this config. */
export function getAllowedIssueStatusStoredValues(merged: { fields: IssueFormFieldConfig[] }): string[] {
  const cat = getIssueStatusCatalogFromMerged(merged)
  const out = new Set<string>()
  for (const e of cat) {
    out.add(e.id)
    if (e.slugKey) out.add(e.slugKey)
  }
  return [...out]
}

export function issueStoredStatusMatchesTabId(
  stored: string | null | undefined,
  tabId: string,
  catalog: IssueStatusCatalogEntry[],
): boolean {
  const st = (stored ?? '').trim()
  const e = catalog.find(x => x.id === tabId)
  if (!e) return st === tabId
  return st === e.id || st === e.slugKey
}

export function normalizeIssueStatusToCanonicalId(
  merged: { fields: IssueFormFieldConfig[] },
  value: string,
): string | null {
  const v = value.trim()
  if (!v) return null
  const cat = getIssueStatusCatalogFromMerged(merged)
  for (const e of cat) {
    if (e.id === v) return e.id
    if (e.slugKey === v) return e.id
  }
  const slug = normalizeIssueStatusOptionKey(v)
  if (slug) {
    const byV5 = canonicalIdForLegacySlug(slug)
    if (cat.some(e => e.id === byV5)) return byV5
  }
  return null
}

export function resolveIssueStatusDisplayLabel(
  merged: { fields: IssueFormFieldConfig[] },
  stored: string,
): string {
  const v = stored.trim()
  if (!v) return 'Unknown status'
  const cat = getIssueStatusCatalogFromMerged(merged)
  for (const e of cat) {
    if (e.id === v || e.slugKey === v) return e.name
  }
  const slug = normalizeIssueStatusOptionKey(v)
  const byV5 = slug ? canonicalIdForLegacySlug(slug) : ''
  const hit = byV5 ? cat.find(e => e.id === byV5) : undefined
  if (hit) return hit.name
  return looksLikeIssueStatusUuid(v) ? 'Unknown status' : humanizeSlug(v)
}

/** @deprecated use getAllowedIssueStatusStoredValues */
export function getMergedIssueStatusOptions(
  saved: { fields?: Array<Partial<IssueFormFieldConfig> & { key: string }> } | null | undefined,
): string[] {
  const merged = mergeIssueFormConfig(saved)
  return getIssueStatusCatalogFromMerged(merged).map(e => e.id)
}

/** Allowed status values on the API (canonical ids plus legacy slug aliases). */
export async function getAllowedIssueStatusesForProduct(product: string): Promise<string[]> {
  try {
    const merged = await mergeIssueFormConfigForProduct(product)
    return getAllowedIssueStatusStoredValues(merged)
  } catch (err) {
    console.warn(
      '[issueFormConfig] getAllowedIssueStatusesForProduct failed; using default statuses:',
      err instanceof Error ? err.message : err,
    )
    return getAllowedIssueStatusStoredValues(mergeIssueFormConfig(null))
  }
}

export async function mergeIssueFormConfigForProduct(product: string): Promise<{ fields: IssueFormFieldConfig[] }> {
  try {
    const row = await db.query.formConfigs.findFirst({
      where: and(eq(formConfigs.product, product), eq(formConfigs.entityType, 'issue')),
    })
    return mergeIssueFormConfig(row?.config as { fields?: IssueFormFieldConfig[] } | undefined)
  } catch {
    return mergeIssueFormConfig(null)
  }
}

export function pickDefaultIssueStatus(merged: { fields: IssueFormFieldConfig[] }): string {
  const cat = getIssueStatusCatalogFromMerged(merged)
  if (cat.some(e => e.id === ISSUE_STATUS_ID_OPEN)) return ISSUE_STATUS_ID_OPEN
  const openSlug = cat.find(e => e.slugKey === 'open')
  if (openSlug) return openSlug.id
  return cat[0]?.id ?? ISSUE_STATUS_ID_OPEN
}
