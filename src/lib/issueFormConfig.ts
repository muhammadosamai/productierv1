import { getDefaultConfig } from '@/lib/builtInFields'
import type { FormConfigJson, FormFieldConfig, IssueStatusCatalogEntry } from '@/types/formConfig'
import {
  DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID,
  ISSUE_STATUS_ID_OPEN,
  looksLikeIssueStatusUuid,
  uuidV5IssueStatusFromSlug,
} from '@/lib/issueStatusId'
import {
  issueStatusPillInlineStyle,
  issueStatusTabBadgeInlineStyle,
  normalizeIssueStatusHexColor,
} from '@/lib/issueStatusColors'

export const DEFAULT_ISSUE_STATUS_OPTIONS = [
  'open',
  'in_progress',
  'resolved',
  'closed',
  'deferred',
] as const

export type { IssueStatusCatalogEntry }

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
    const id = (c.id && String(c.id).trim()) || crypto.randomUUID()
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
  base: FormFieldConfig,
  raw: Partial<FormFieldConfig> & { key: string },
  orderIdx: number,
): FormFieldConfig {
  const merged: FormFieldConfig = {
    ...base,
    ...raw,
    key: 'status',
    order: typeof raw.order === 'number' ? raw.order : orderIdx,
  }
  const rawCat = raw.issueStatusCatalog
  if (Array.isArray(rawCat) && rawCat.length > 0) {
    const catalog = normalizeCatalogEntries(rawCat)
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

export function mergeIssueFormConfig(
  saved: FormConfigJson | null | undefined,
): FormConfigJson {
  const defaultIssue = getDefaultConfig('issue')
  if (!saved?.fields?.length) {
    const fields = defaultIssue.fields.map(f => ({ ...f }))
    const idx = fields.findIndex(f => f.key === 'status')
    if (idx !== -1) {
      fields[idx] = mergeStatusField(fields[idx]!, fields[idx]!, idx)
    }
    return { fields }
  }

  const defByKey = new Map(defaultIssue.fields.map(f => [f.key, f]))
  const mergedFields: FormFieldConfig[] = saved.fields.map((raw, idx) => {
    const base = defByKey.get(raw.key)
    const merged: FormFieldConfig = {
      ...(base ? { ...base } : {}),
      ...raw,
    }
    merged.order = typeof raw.order === 'number' ? raw.order : idx
    if (merged.key === 'status') {
      return mergeStatusField((base ?? merged) as FormFieldConfig, raw, idx)
    }
    return merged
  })

  const have = new Set(mergedFields.map(f => f.key))
  for (const d of defaultIssue.fields) {
    if (!have.has(d.key)) mergedFields.push({ ...d })
  }
  mergedFields.sort((a, b) => a.order - b.order)
  const st = mergedFields.find(f => f.key === 'status')
  if (st && (!st.issueStatusCatalog || st.issueStatusCatalog.length === 0)) {
    const base = defByKey.get('status') as FormFieldConfig
    Object.assign(st, mergeStatusField(base, st, st.order))
  }
  return { fields: mergedFields }
}

export function getIssueStatusCatalogFromMerged(merged: FormConfigJson): IssueStatusCatalogEntry[] {
  const f = merged.fields.find(x => x.key === 'status')
  if (f?.issueStatusCatalog?.length) return [...f.issueStatusCatalog].sort((a, b) => a.order - b.order)
  return buildCatalogFromSlugs([...DEFAULT_ISSUE_STATUS_OPTIONS])
}

export function getAllowedIssueStatusStoredValues(merged: FormConfigJson): string[] {
  const cat = getIssueStatusCatalogFromMerged(merged)
  const out = new Set<string>()
  for (const e of cat) {
    out.add(e.id)
    if (e.slugKey) out.add(e.slugKey)
  }
  return [...out]
}

export function normalizeIssueStatusToCanonicalId(
  merged: FormConfigJson,
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

/** Solid pill background/text when catalog defines a hex color for this stored value. */
export function issueStatusCustomPillStyle(
  merged: FormConfigJson,
  stored: string | null | undefined,
): Record<string, string> | undefined {
  const e = getIssueStatusCatalogEntryForStored(merged, stored)
  if (!e?.color) return undefined
  return issueStatusPillInlineStyle(e.color) ?? undefined
}

/** Active status tab underline + label color (tab key = canonical status id). */
export function issueStatusTabBarStyleOverride(
  merged: FormConfigJson,
  tabId: string,
): Record<string, string> | undefined {
  const e = getIssueStatusCatalogFromMerged(merged).find(x => x.id === tabId)
  const n = e?.color ? normalizeIssueStatusHexColor(e.color) : undefined
  if (!n) return undefined
  return { color: n, borderBottomColor: n }
}

/** Count badge on status tabs when catalog has a color for that tab. */
export function issueStatusTabBadgeStyleOverride(
  merged: FormConfigJson,
  tabId: string,
): Record<string, string> | undefined {
  const e = getIssueStatusCatalogFromMerged(merged).find(x => x.id === tabId)
  const n = e?.color ? normalizeIssueStatusHexColor(e.color) : undefined
  if (!n) return undefined
  return issueStatusTabBadgeInlineStyle(n) ?? undefined
}

export function getIssueStatusCatalogEntryForStored(
  merged: FormConfigJson,
  stored: string | null | undefined,
): IssueStatusCatalogEntry | undefined {
  const v = (stored ?? '').trim()
  if (!v) return undefined
  const cat = getIssueStatusCatalogFromMerged(merged)
  for (const e of cat) {
    if (e.id === v || e.slugKey === v) return e
  }
  const slug = normalizeIssueStatusOptionKey(v)
  if (slug) {
    const byV5 = canonicalIdForLegacySlug(slug)
    return cat.find(e => e.id === byV5)
  }
  return undefined
}

export function resolveIssueStatusDisplayLabel(merged: FormConfigJson, stored: string): string {
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

/** Row `stored` belongs to catalog tab `tabId` (canonical id). */
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

export function pickDefaultIssueStatus(merged: FormConfigJson): string {
  const cat = getIssueStatusCatalogFromMerged(merged)
  if (cat.some(e => e.id === ISSUE_STATUS_ID_OPEN)) return ISSUE_STATUS_ID_OPEN
  const openSlug = cat.find(e => e.slugKey === 'open')
  if (openSlug) return openSlug.id
  return cat[0]?.id ?? ISSUE_STATUS_ID_OPEN
}

/** Canonical ids for columns / tabs (same order as catalog). */
export function getMergedIssueStatusOptions(
  saved: FormConfigJson | null | undefined,
): string[] {
  const merged = mergeIssueFormConfig(saved)
  return getIssueStatusCatalogFromMerged(merged).map(e => e.id)
}

/** Resolve catalog for the issue status field when editing in isolation (e.g. dialog). */
export function catalogForStatusField(field: Partial<FormFieldConfig> & { key: string }): IssueStatusCatalogEntry[] {
  const defaults = getDefaultConfig('issue')
  const fields = defaults.fields.map(f =>
    f.key === 'status' ? ({ ...f, ...field, key: 'status' } as FormFieldConfig) : f,
  )
  return getIssueStatusCatalogFromMerged(mergeIssueFormConfig({ fields }))
}
