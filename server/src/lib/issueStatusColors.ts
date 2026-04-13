/** Normalize issue status badge color to #rrggbb or return undefined if invalid. */
export function normalizeIssueStatusHexColor(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined
  const s = String(raw).trim()
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m?.[1]) return undefined
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  return `#${h.toLowerCase()}`
}
