import { v5 as uuidv5 } from 'uuid'

export const ISSUE_STATUS_V5_NAMESPACE = 'c74214e4-3e8d-5b8a-9c3e-1a2b3c4d5e6f'

export function uuidV5IssueStatusFromSlug(slug: string): string {
  return uuidv5(slug, ISSUE_STATUS_V5_NAMESPACE)
}

export const DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID: Record<string, string> = {
  open: 'a64cad55-e8d5-5903-9096-31b2ee5f5b5c',
  in_progress: '9a7050b5-e3ce-544c-aa70-bdc7f9f62b2e',
  resolved: '10269c95-fdb3-5b1e-bc4c-53648851c504',
  closed: '02623fd6-b209-5ce5-ad87-40ba672363e4',
  deferred: 'caa34daf-316b-58f5-ad4d-93675039f0c3',
}

export const ISSUE_STATUS_ID_OPEN: string = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.open!
export const ISSUE_STATUS_ID_IN_PROGRESS: string = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.in_progress!
export const ISSUE_STATUS_ID_RESOLVED: string = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.resolved!
export const ISSUE_STATUS_ID_CLOSED: string = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.closed!
export const ISSUE_STATUS_ID_DEFERRED: string = DEFAULT_LEGACY_SLUG_TO_CANONICAL_ID.deferred!

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function looksLikeIssueStatusUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

export type IssueStatusSemantic =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'deferred'
  | 'custom'

export function issueStatusSemanticTone(stored: string | null | undefined): IssueStatusSemantic {
  const s = (stored ?? '').trim()
  if (s === ISSUE_STATUS_ID_OPEN || s === 'open') return 'open'
  if (s === ISSUE_STATUS_ID_IN_PROGRESS || s === 'in_progress') return 'in_progress'
  if (s === ISSUE_STATUS_ID_RESOLVED || s === 'resolved') return 'resolved'
  if (s === ISSUE_STATUS_ID_CLOSED || s === 'closed') return 'closed'
  if (s === ISSUE_STATUS_ID_DEFERRED || s === 'deferred') return 'deferred'
  return 'custom'
}
