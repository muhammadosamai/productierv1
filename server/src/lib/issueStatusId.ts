import { v5 as uuidv5 } from 'uuid'

/**
 * Fixed namespace for UUID v5 derivation of issue status ids from legacy slugs.
 * Changing this breaks DB migration maps and existing rows.
 */
export const ISSUE_STATUS_V5_NAMESPACE = 'c74214e4-3e8d-5b8a-9c3e-1a2b3c4d5e6f'

/** RFC 4122 UUID v5 from namespace UUID + UTF-8 name (SHA-1). */
export function uuidV5IssueStatusFromSlug(slug: string): string {
  return uuidv5(slug, ISSUE_STATUS_V5_NAMESPACE)
}

/** Canonical ids for built-in default slugs (must match uuidV5IssueStatusFromSlug). */
export const DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID: Record<string, string> = {
  open: 'a64cad55-e8d5-5903-9096-31b2ee5f5b5c',
  in_progress: '9a7050b5-e3ce-544c-aa70-bdc7f9f62b2e',
  resolved: '10269c95-fdb3-5b1e-bc4c-53648851c504',
  closed: '02623fd6-b209-5ce5-ad87-40ba672363e4',
  deferred: 'caa34daf-316b-58f5-ad4d-93675039f0c3',
}

export const ISSUE_STATUS_ID_OPEN = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.open
export const ISSUE_STATUS_ID_IN_PROGRESS = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.in_progress
export const ISSUE_STATUS_ID_RESOLVED = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.resolved
export const ISSUE_STATUS_ID_CLOSED = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.closed
export const ISSUE_STATUS_ID_DEFERRED = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.deferred

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function looksLikeIssueStatusUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

function tokenAsSlugKey(t: string): string {
  return t
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Values to match in DB when searching/filtering by a user token (slug or id). */
export function issueStatusSearchDbValues(token: string): string[] {
  const raw = token.trim()
  if (!raw) return []
  const lower = raw.toLowerCase()
  const out = new Set<string>([raw, lower])
  if (looksLikeIssueStatusUuid(raw)) return [...out]
  const slug = tokenAsSlugKey(raw)
  if (slug) {
    out.add(slug)
    out.add(
      DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID[slug] ?? uuidV5IssueStatusFromSlug(slug),
    )
  }
  return [...out]
}
