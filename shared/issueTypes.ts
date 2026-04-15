/**
 * Single source of truth for issue `type` (Postgres enum, API, UI).
 * Keep migrations in sync when extending this list.
 */
export const ISSUE_TYPES = [
  'bug',
  'ui_issue',
  'performance',
  'crash',
  'security',
  'data_loss',
  'other',
  'feature',
  'enhancement',
] as const

export type IssueType = (typeof ISSUE_TYPES)[number]

export const ISSUE_TYPE_UI_LABELS = {
  bug: 'Bug',
  ui_issue: 'UI Issue',
  performance: 'Performance',
  crash: 'Crash',
  security: 'Security',
  data_loss: 'Data Loss',
  other: 'Other',
  feature: 'Feature',
  enhancement: 'Enhancement',
} as const satisfies Record<IssueType, string>

/** Sort index when ordering issues by type (ascending). */
export const ISSUE_TYPE_ORDER: Record<IssueType, number> = Object.fromEntries(
  ISSUE_TYPES.map((t, i) => [t, i]),
) as Record<IssueType, number>

/** Fragment for `CREATE TYPE ... AS ENUM (...)` in raw SQL. */
export function issueTypesPgEnumList(): string {
  return ISSUE_TYPES.map(v => `'${v}'`).join(', ')
}
