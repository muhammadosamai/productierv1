/** Strict hyphenated UUID inside `@[...]` (for search / external tools). */
const UUID_IN_BRACKETS = /@\[([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]/i
export const MENTION_TOKEN_RE = new RegExp(UUID_IN_BRACKETS.source, 'gi')

export type MentionUser = {
  id: string
  name: string
  email: string
  avatar: string | null
}

export type CommentSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; userId: string }

/**
 * Normalize bracket contents to lowercase hyphenated UUID, or null if not uuid-like.
 * Accepts standard hyphenated form or 32 hex chars without hyphens (DB / drivers vary).
 */
export function normalizeMentionUserId(raw: string): string | null {
  const inner = raw.trim()
  const compact = inner.replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(compact)) return null
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
}

/**
 * Split comment text into plain text and mention tokens for safe rendering.
 * Scans for `@[` … `]` and treats inner text as a user id when it is uuid-like.
 */
export function parseCommentSegments(text: string): CommentSegment[] {
  const segments: CommentSegment[] = []
  let i = 0
  while (i < text.length) {
    const start = text.indexOf('@[', i)
    if (start === -1) {
      segments.push({ type: 'text', value: text.slice(i) })
      break
    }
    if (start > i) {
      segments.push({ type: 'text', value: text.slice(i, start) })
    }
    const innerStart = start + 2
    const close = text.indexOf(']', innerStart)
    if (close === -1) {
      segments.push({ type: 'text', value: text.slice(start) })
      break
    }
    const inner = text.slice(innerStart, close)
    const userId = normalizeMentionUserId(inner)
    if (userId) {
      segments.push({ type: 'mention', userId })
    } else {
      segments.push({ type: 'text', value: text.slice(start, close + 1) })
    }
    i = close + 1
  }
  return mergeAdjacentTextSegments(segments)
}

function mergeAdjacentTextSegments(segments: CommentSegment[]): CommentSegment[] {
  const out: CommentSegment[] = []
  for (const seg of segments) {
    const prev = out[out.length - 1]
    if (seg.type === 'text' && prev?.type === 'text') {
      prev.value += seg.value
    } else {
      out.push(seg)
    }
  }
  return out
}

export function mentionTokenForUser(userId: string): string {
  const norm = normalizeMentionUserId(userId)
  return `@[${norm ?? userId.toLowerCase()}]`
}

/**
 * Insert a mention token at [start, end) in text, move caret after optional trailing space.
 */
export function insertMentionAtRange(
  text: string,
  start: number,
  end: number,
  userId: string,
  trailingSpace = true,
): { text: string; caret: number } {
  const token = mentionTokenForUser(userId) + (trailingSpace ? ' ' : '')
  const next = text.slice(0, start) + token + text.slice(end)
  const caret = start + token.length
  return { text: next, caret }
}

/**
 * If the caret is inside an active @mention query, returns [atIndex, query] or null.
 * atIndex is the position of `@`; query is between `@` and caret (exclusive of `@`).
 */
export function getActiveMentionQuery(
  text: string,
  caret: number,
): { atIndex: number; query: string } | null {
  if (caret <= 0) return null
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0) {
    const prev = before[at - 1]!
    // Avoid triggering inside emails like `a@b.com`
    if (/[A-Za-z0-9_]/.test(prev)) return null
  }
  const afterAt = before.slice(at + 1)
  if (/[\s\n\r]/.test(afterAt)) return null
  if (afterAt.includes(']')) return null
  return { atIndex: at, query: afterAt }
}

export function filterMentionUsers(users: MentionUser[], query: string, limit = 20): MentionUser[] {
  const q = query.trim().toLowerCase()
  const list = !q
    ? users
    : users.filter(
        u =>
          u.name.toLowerCase().includes(q)
          || u.email.toLowerCase().includes(q)
          || u.id.toLowerCase().includes(q),
      )
  return list.slice(0, limit)
}
