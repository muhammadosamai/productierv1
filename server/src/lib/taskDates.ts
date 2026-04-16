/**
 * Calendar date fields on parent tasks (YYYY-MM-DD wire format).
 * Legacy `due_at` timestamp is kept for backward compatibility; prefer `endDate` for deadlines.
 */

const TASK_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function normalizeTaskDateWireValue(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'startDate and endDate must be YYYY-MM-DD strings or null' }
  const s = raw.trim()
  if (!s) return { ok: true, value: null }
  const m = TASK_ISO_DATE.exec(s)
  if (!m) return { ok: false, error: 'Invalid date (use YYYY-MM-DD)' }
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { ok: false, error: 'Invalid calendar date' }
  }
  return { ok: true, value: s }
}

/** Normalize DB date / string / Date to YYYY-MM-DD or null (for JSON responses). */
export function taskStoredDateToWire(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

/**
 * End-of-day deadline for reminders/metrics: `endDate` (calendar) wins; else legacy `dueAt`.
 * Returns start of UTC day as Date for stable comparisons, or null.
 */
export function effectiveTaskDeadlineUtcDay(row: {
  endDate?: unknown
  dueAt?: unknown
}): Date | null {
  const endWire = taskStoredDateToWire(row.endDate)
  if (endWire) {
    const [y, m, d] = endWire.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
  }
  if (row.dueAt == null) return null
  const t = row.dueAt instanceof Date ? row.dueAt : new Date(String(row.dueAt))
  return Number.isNaN(t.getTime()) ? null : t
}

/** Compare completion to deadline (both as timestamps). */
export function taskCompletedOnOrBeforeDeadline(completedAt: Date, deadline: Date): boolean {
  return completedAt.getTime() <= deadline.getTime()
}

/**
 * Normalize a parent task row for JSON: wire-format dates + legacy `dueAt` ISO
 * (synthetic noon UTC from `endDate` when DB `due_at` is null but `end_date` is set).
 */
export function serializeParentTaskRow<T extends Record<string, unknown>>(row: T): T {
  const startDate = taskStoredDateToWire(row.startDate)
  const endDate = taskStoredDateToWire(row.endDate)
  let dueAt: string | null = null
  if (row.dueAt != null) {
    const d = row.dueAt instanceof Date ? row.dueAt : new Date(String(row.dueAt))
    dueAt = Number.isNaN(d.getTime()) ? null : d.toISOString()
  } else if (endDate) {
    dueAt = `${endDate}T12:00:00.000Z`
  }
  return { ...row, startDate, endDate, dueAt } as T
}

export function serializeParentTaskRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(serializeParentTaskRow)
}
