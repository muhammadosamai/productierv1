/** Escape text for HTML email bodies (names, titles, etc.). */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Strip control chars and cap length for email subjects. */
export function sanitizeEmailSubject(text: string, maxLen = 200): string {
  return text.replace(/[\r\n\u0000]/g, ' ').trim().slice(0, maxLen)
}
