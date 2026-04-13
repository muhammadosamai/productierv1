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

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeIssueStatusHexColor(hex)
  if (!n || n.length !== 7) return null
  const r = Number.parseInt(n.slice(1, 3), 16)
  const g = Number.parseInt(n.slice(3, 5), 16)
  const b = Number.parseInt(n.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

/** sRGB relative luminance (0–1). */
function channelLuminance(c: number): number {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0.5
  const R = channelLuminance(rgb.r)
  const G = channelLuminance(rgb.g)
  const B = channelLuminance(rgb.b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/** Inline styles for a solid pill (background + contrasting text). */
export function issueStatusPillInlineStyle(hex: string): Record<string, string> | null {
  const n = normalizeIssueStatusHexColor(hex)
  if (!n) return null
  const L = relativeLuminance(n)
  return {
    backgroundColor: n,
    color: L > 0.55 ? '#111827' : '#ffffff',
  }
}

/** Tinted badge for tab counts (rgba background + colored label). */
export function issueStatusTabBadgeInlineStyle(hex: string): Record<string, string> | null {
  const n = normalizeIssueStatusHexColor(hex)
  if (!n) return null
  const rgb = hexToRgb(n)
  if (!rgb) return null
  const L = relativeLuminance(n)
  return {
    backgroundColor: `rgba(${rgb.r},${rgb.g},${rgb.b},0.16)`,
    color: L > 0.55 ? '#4b5563' : n,
  }
}
